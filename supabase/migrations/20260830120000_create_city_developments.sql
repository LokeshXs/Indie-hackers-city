create table public.plots (
  id text primary key,
  district_id text not null,
  street_id text not null,
  street_name text not null,
  row_id text not null,
  lot_number smallint not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),

  constraint plots_district_is_pioneer check (district_id = 'pioneer'),
  constraint plots_street_is_known check (street_id in ('jobs', 'lovelace', 'turing', 'hopper')),
  constraint plots_row_is_known check (row_id in ('north', 'south', 'north-outer', 'south-outer')),
  constraint plots_lot_number_range check (lot_number between 1 and 4),
  constraint plots_structural_identity unique (district_id, street_id, row_id, lot_number),
  constraint plots_canonical_id check (
    id = district_id || ':' || street_id || ':' || row_id || ':' || lpad(lot_number::text, 2, '0')
  )
);

insert into public.plots (id, district_id, street_id, street_name, row_id, lot_number)
select
  'pioneer:' || streets.street_id || ':' || rows.row_id || ':' || lpad(lots.lot_number::text, 2, '0'),
  'pioneer',
  streets.street_id,
  streets.street_name,
  rows.row_id,
  lots.lot_number
from (
  values
    ('jobs', 'Jobs Avenue'),
    ('lovelace', 'Lovelace Lane'),
    ('turing', 'Turing Street'),
    ('hopper', 'Hopper Way')
) as streets(street_id, street_name)
cross join (
  values ('north'), ('south'), ('north-outer'), ('south-outer')
) as rows(row_id)
cross join generate_series(1, 4) as lots(lot_number);

create table public.projects (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  website_url text not null,
  project_type text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint projects_name_length check (char_length(trim(name)) between 1 and 40),
  constraint projects_website_url_length check (char_length(website_url) <= 2048),
  constraint projects_website_url_protocol check (website_url ~ '^https?://'),
  constraint projects_type_is_known check (project_type in ('website', 'app', 'chrome-extension')),
  constraint projects_id_owner_unique unique (id, owner_id)
);

create table public.plot_claims (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  plot_id text not null unique references public.plots(id),
  project_id uuid not null unique,
  building_level smallint not null default 1,
  building_asset_id text not null,
  building_color text not null,
  claimed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint plot_claims_project_owner_fk
    foreign key (project_id, owner_id)
    references public.projects(id, owner_id),
  constraint plot_claims_level_one check (building_level = 1),
  constraint plot_claims_asset_is_known check (
    building_asset_id in ('startup-building-level-1', 'corner-studio-level-1')
  ),
  constraint plot_claims_color_is_known check (
    building_color in (
      '#d1ad6e', '#e2775c', '#5fa8d3', '#7fa87a',
      '#f0c94b', '#9b8ac4', '#e8a0b4', '#5b6670'
    )
  )
);

create function public.set_city_record_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_projects_updated_at
  before update on public.projects
  for each row execute procedure public.set_city_record_updated_at();

create trigger set_plot_claims_updated_at
  before update on public.plot_claims
  for each row execute procedure public.set_city_record_updated_at();

alter table public.plots enable row level security;
alter table public.projects enable row level security;
alter table public.plot_claims enable row level security;

create policy "Plots are viewable by everyone"
  on public.plots for select to anon, authenticated using (true);
create policy "Projects are viewable by everyone"
  on public.projects for select to anon, authenticated using (true);
create policy "Plot claims are viewable by everyone"
  on public.plot_claims for select to anon, authenticated using (true);

revoke all on public.plots from anon, authenticated;
revoke all on public.projects from anon, authenticated;
revoke all on public.plot_claims from anon, authenticated;
grant select on public.plots, public.projects, public.plot_claims to anon, authenticated;

create view public.city_developments
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
  greatest(claims.updated_at, projects.updated_at, profiles.updated_at) as updated_at
from public.plot_claims as claims
join public.projects as projects on projects.id = claims.project_id
join public.profiles as profiles on profiles.id = claims.owner_id;

grant select on public.city_developments to anon, authenticated;

create function public.claim_plot(
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

create function public.update_showcased_project(
  requested_project_id uuid,
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
begin
  if caller_id is null then
    raise exception using message = 'not_authenticated';
  end if;

  if char_length(trim(coalesce(founder_full_name, ''))) not between 1 and 60
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
    select 1 from public.projects where id = requested_project_id and owner_id = caller_id
  ) then
    raise exception using message = 'project_not_owned';
  end if;

  begin
    update public.profiles
    set full_name = trim(founder_full_name), x_handle = normalized_handle
    where id = caller_id;
  exception when unique_violation then
    raise exception using message = 'x_handle_taken';
  end;

  update public.projects
  set
    name = trim(project_name),
    website_url = trim(project_website_url),
    project_type = requested_project_type
  where id = requested_project_id and owner_id = caller_id;

  update public.plot_claims
  set
    building_asset_id = requested_building_asset_id,
    building_color = requested_building_color
  where owner_id = caller_id and project_id = requested_project_id;

  return query
    select developments.*
    from public.city_developments as developments
    where developments.owner_id = caller_id
      and developments.project_id = requested_project_id;
end;
$$;

create function public.switch_claim_project(requested_project_id uuid)
returns setof public.city_developments
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception using message = 'not_authenticated';
  end if;

  if not exists (
    select 1 from public.projects where id = requested_project_id and owner_id = caller_id
  ) then
    raise exception using message = 'project_not_owned';
  end if;

  update public.plot_claims
  set project_id = requested_project_id
  where owner_id = caller_id;

  if not found then
    raise exception using message = 'claim_not_found';
  end if;

  return query
    select developments.*
    from public.city_developments as developments
    where developments.owner_id = caller_id;
end;
$$;

revoke execute on function public.claim_plot(uuid, text, text, text, text, text, text, text, text) from public, anon;
revoke execute on function public.update_showcased_project(uuid, text, text, text, text, text, text, text) from public, anon;
revoke execute on function public.switch_claim_project(uuid) from public, anon;
grant execute on function public.claim_plot(uuid, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.update_showcased_project(uuid, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.switch_claim_project(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'projects'
  ) then
    alter publication supabase_realtime add table public.projects;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'plot_claims'
  ) then
    alter publication supabase_realtime add table public.plot_claims;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end;
$$;
