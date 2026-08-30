create table public.building_level_milestones (
  level smallint primary key,
  required_xp integer not null unique,
  created_at timestamptz not null default now(),

  constraint building_level_milestones_level_range check (level between 1 and 5),
  constraint building_level_milestones_required_xp_nonnegative check (required_xp >= 0)
);

insert into public.building_level_milestones (level, required_xp)
values (1, 0), (2, 100), (3, 300), (4, 700), (5, 1500);

alter table public.building_level_milestones enable row level security;
revoke all on public.building_level_milestones from anon, authenticated;

alter table public.plot_claims
  add column xp_total integer not null default 0,
  add constraint plot_claims_xp_total_nonnegative check (xp_total >= 0);

alter table public.plot_claims drop constraint plot_claims_level_one;
alter table public.plot_claims
  add constraint plot_claims_level_range check (building_level between 1 and 5);

create table public.plot_xp_events (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.plot_claims(owner_id) on delete cascade,
  event_key text not null unique,
  event_type text not null,
  xp_delta integer not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  awarded_by text not null,
  created_at timestamptz not null default now(),

  constraint plot_xp_events_delta_range check (xp_delta between -100000 and 100000 and xp_delta <> 0),
  constraint plot_xp_events_key_valid check (
    event_key = trim(event_key) and char_length(event_key) between 1 and 200
  ),
  constraint plot_xp_events_type_valid check (
    event_type = trim(event_type) and char_length(event_type) between 1 and 80
  ),
  constraint plot_xp_events_description_length check (
    description is null or char_length(description) <= 500
  ),
  constraint plot_xp_events_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index plot_xp_events_owner_created_idx
  on public.plot_xp_events (owner_id, created_at desc);

alter table public.plot_xp_events enable row level security;
revoke all on public.plot_xp_events from anon, authenticated;

create function public.building_level_for_xp(total_xp integer)
returns smallint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result_level smallint;
begin
  if total_xp is null or total_xp < 0 then
    raise exception using message = 'invalid_xp_total';
  end if;

  select milestones.level
    into result_level
    from public.building_level_milestones as milestones
   where milestones.required_xp <= total_xp
   order by milestones.required_xp desc
   limit 1;

  if result_level is null then
    raise exception using message = 'xp_milestones_not_configured';
  end if;

  return result_level;
end;
$$;

revoke execute on function public.building_level_for_xp(integer) from public, anon, authenticated;

create function public.award_plot_xp(
  target_owner_id uuid,
  requested_xp_delta integer,
  requested_event_key text,
  requested_event_type text,
  requested_description text default null,
  requested_metadata jsonb default '{}'::jsonb
)
returns table (
  applied boolean,
  owner_id uuid,
  plot_id text,
  xp_delta integer,
  previous_xp_total integer,
  xp_total integer,
  previous_building_level smallint,
  building_level smallint,
  level_changed boolean,
  event_key text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_claim public.plot_claims%rowtype;
  existing_event public.plot_xp_events%rowtype;
  next_xp_total integer;
  next_building_level smallint;
  actor text;
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception using message = 'not_authorized';
  end if;

  if target_owner_id is null then
    raise exception using message = 'invalid_owner';
  end if;
  if requested_xp_delta is null
    or requested_xp_delta = 0
    or requested_xp_delta < -100000
    or requested_xp_delta > 100000 then
    raise exception using message = 'invalid_xp_delta';
  end if;
  if requested_event_key is null
    or requested_event_key <> trim(requested_event_key)
    or char_length(requested_event_key) not between 1 and 200 then
    raise exception using message = 'invalid_event_key';
  end if;
  if requested_event_type is null
    or requested_event_type <> trim(requested_event_type)
    or char_length(requested_event_type) not between 1 and 80 then
    raise exception using message = 'invalid_event_type';
  end if;
  if requested_description is not null and char_length(requested_description) > 500 then
    raise exception using message = 'invalid_description';
  end if;
  if requested_metadata is null or jsonb_typeof(requested_metadata) <> 'object' then
    raise exception using message = 'invalid_metadata';
  end if;

  select claims.*
    into current_claim
    from public.plot_claims as claims
   where claims.owner_id = target_owner_id
   for update;

  if not found then
    raise exception using message = 'claim_not_found';
  end if;

  -- Serialize globally identical event keys as well as awards for the same claim.
  -- This makes cross-founder key collisions deterministic instead of surfacing a
  -- raw unique-constraint error under concurrent delivery.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(requested_event_key, 0));

  select events.*
    into existing_event
    from public.plot_xp_events as events
   where events.event_key = requested_event_key;

  if found then
    if existing_event.owner_id <> target_owner_id
      or existing_event.xp_delta <> requested_xp_delta
      or existing_event.event_type <> requested_event_type then
      raise exception using message = 'xp_event_conflict';
    end if;

    return query select
      false,
      current_claim.owner_id,
      current_claim.plot_id,
      existing_event.xp_delta,
      current_claim.xp_total,
      current_claim.xp_total,
      current_claim.building_level,
      current_claim.building_level,
      false,
      existing_event.event_key;
    return;
  end if;

  next_xp_total := current_claim.xp_total + requested_xp_delta;
  if next_xp_total < 0 then
    raise exception using message = 'xp_total_below_zero';
  end if;
  next_building_level := public.building_level_for_xp(next_xp_total);
  actor := coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claim.role', true), ''),
    session_user
  );

  insert into public.plot_xp_events (
    owner_id,
    event_key,
    event_type,
    xp_delta,
    description,
    metadata,
    awarded_by
  ) values (
    target_owner_id,
    requested_event_key,
    requested_event_type,
    requested_xp_delta,
    requested_description,
    requested_metadata,
    actor
  );

  update public.plot_claims as claims
     set xp_total = next_xp_total,
         building_level = next_building_level
   where claims.owner_id = target_owner_id;

  return query select
    true,
    current_claim.owner_id,
    current_claim.plot_id,
    requested_xp_delta,
    current_claim.xp_total,
    next_xp_total,
    current_claim.building_level,
    next_building_level,
    current_claim.building_level <> next_building_level,
    requested_event_key;
end;
$$;

revoke execute on function public.award_plot_xp(uuid, integer, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.award_plot_xp(uuid, integer, text, text, text, jsonb)
  to service_role;

create or replace view public.city_developments
with (security_invoker = true)
as
select
  claims.plot_id,
  claims.owner_id,
  projects.id as project_id,
  projects.name as project_name,
  projects.website_url,
  projects.project_type,
  profiles.full_name as founder_name,
  profiles.x_handle,
  profiles.avatar_url,
  claims.building_level,
  claims.building_asset_id,
  claims.building_color,
  claims.claimed_at,
  greatest(claims.updated_at, projects.updated_at, profiles.updated_at) as updated_at,
  claims.xp_total
from public.plot_claims as claims
join public.projects as projects on projects.id = claims.project_id
join public.profiles as profiles on profiles.id = claims.owner_id;

grant select on public.city_developments to anon, authenticated;
