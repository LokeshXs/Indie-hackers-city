-- Internal ledger applier. This carries no authorization check of its own, so it
-- must only ever be called from a security definer function that has already
-- established the caller may award XP. Execute is revoked from every role,
-- mirroring public.building_level_for_xp.
create function public.apply_plot_xp(
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

revoke execute on function public.apply_plot_xp(uuid, integer, text, text, text, jsonb)
  from public, anon, authenticated;

-- award_plot_xp keeps its administrative gate and delegates the ledger work.
create or replace function public.award_plot_xp(
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
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception using message = 'not_authorized';
  end if;

  return query select * from public.apply_plot_xp(
    target_owner_id,
    requested_xp_delta,
    requested_event_key,
    requested_event_type,
    requested_description,
    requested_metadata
  );
end;
$$;

revoke execute on function public.award_plot_xp(uuid, integer, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.award_plot_xp(uuid, integer, text, text, text, jsonb)
  to service_role;

-- Claiming a plot is a founder's first XP reward. The award runs inside the same
-- transaction as the claim, so the returned city row already carries the XP and
-- a failed award rolls the whole claim back.
create or replace function public.claim_plot(
  project_uuid uuid,
  requested_plot_id text,
  founder_full_name text,
  founder_x_handle text,
  project_name text,
  project_website_url text,
  requested_project_type text,
  requested_building_asset_id text,
  requested_building_color text
)
returns setof public.city_developments
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  normalized_handle text := lower(regexp_replace(trim(coalesce(founder_x_handle, '')), '^@', ''));
  violated_constraint text;
begin
  if caller_id is null then
    raise exception using message = 'not_authenticated';
  end if;

  if project_uuid is null
    or char_length(trim(coalesce(founder_full_name, ''))) not between 1 and 60
    or normalized_handle !~ '^[a-z0-9_]{1,15}$'
    or char_length(trim(coalesce(project_name, ''))) not between 1 and 40
    or char_length(coalesce(project_website_url, '')) > 2048
    or project_website_url !~ '^https?://'
    or requested_project_type not in ('website', 'app', 'chrome-extension')
  then
    raise exception using message = 'invalid_project';
  end if;

  if requested_building_asset_id not in ('startup-building-level-1', 'corner-studio-level-1')
    or requested_building_color not in (
      '#d1ad6e', '#e2775c', '#5fa8d3', '#7fa87a',
      '#f0c94b', '#9b8ac4', '#e8a0b4', '#5b6670'
    )
  then
    raise exception using message = 'invalid_building';
  end if;

  if not exists (
    select 1 from public.plots where id = requested_plot_id and is_active
  ) then
    raise exception using message = 'inactive_plot';
  end if;

  if exists (select 1 from public.plot_claims where owner_id = caller_id) then
    raise exception using message = 'user_already_has_plot';
  end if;

  if exists (select 1 from public.plot_claims where plot_id = requested_plot_id) then
    raise exception using message = 'plot_taken';
  end if;

  begin
    update public.profiles
    set full_name = trim(founder_full_name), x_handle = normalized_handle
    where id = caller_id;
  exception when unique_violation then
    raise exception using message = 'x_handle_taken';
  end;

  if not found then
    raise exception using message = 'not_authenticated';
  end if;

  insert into public.projects (id, owner_id, name, website_url, project_type)
  values (
    project_uuid,
    caller_id,
    trim(project_name),
    trim(project_website_url),
    requested_project_type
  );

  begin
    insert into public.plot_claims (
      owner_id, plot_id, project_id, building_asset_id, building_color
    ) values (
      caller_id, requested_plot_id, project_uuid, requested_building_asset_id, requested_building_color
    );
  exception when unique_violation then
    get stacked diagnostics violated_constraint = constraint_name;
    if violated_constraint = 'plot_claims_pkey' then
      raise exception using message = 'user_already_has_plot';
    elsif violated_constraint = 'plot_claims_plot_id_key' then
      raise exception using message = 'plot_taken';
    else
      raise exception using message = 'invalid_project';
    end if;
  end;

  -- The ledger references plot_claims(owner_id), so this must follow the insert.
  perform public.apply_plot_xp(
    caller_id,
    10,
    'plot_claim:' || caller_id::text,
    'plot_claimed',
    'Claimed a Pioneer District plot',
    jsonb_build_object('plot_id', requested_plot_id)
  );

  return query
    select developments.*
    from public.city_developments as developments
    where developments.owner_id = caller_id;
exception
  when check_violation or not_null_violation or foreign_key_violation then
    if sqlerrm in (
      'not_authenticated', 'inactive_plot', 'user_already_has_plot', 'plot_taken',
      'x_handle_taken', 'invalid_project', 'invalid_building'
    ) then
      raise;
    end if;
    raise exception using message = 'invalid_project';
end;
$$;

revoke execute on function public.claim_plot(uuid, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.claim_plot(uuid, text, text, text, text, text, text, text, text) to authenticated;

-- Founders who claimed before this reward existed receive it under the same key.
do $$
declare
  existing_claim record;
begin
  for existing_claim in select owner_id, plot_id from public.plot_claims loop
    perform public.apply_plot_xp(
      existing_claim.owner_id,
      10,
      'plot_claim:' || existing_claim.owner_id::text,
      'plot_claimed',
      'Claimed a Pioneer District plot',
      jsonb_build_object('plot_id', existing_claim.plot_id, 'backfilled', true)
    );
  end loop;
end;
$$;
