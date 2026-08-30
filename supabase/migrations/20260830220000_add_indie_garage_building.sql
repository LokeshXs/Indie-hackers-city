alter table public.plot_claims
  drop constraint plot_claims_asset_is_known;

alter table public.plot_claims
  add constraint plot_claims_asset_is_known check (
    building_asset_id in (
      'startup-building-level-1',
      'corner-studio-level-1',
      'indie-garage-level-1'
    )
  );

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

  if requested_building_asset_id not in (
      'startup-building-level-1',
      'corner-studio-level-1',
      'indie-garage-level-1'
    )
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

create or replace function public.update_showcased_project(
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

  if requested_building_asset_id not in (
      'startup-building-level-1',
      'corner-studio-level-1',
      'indie-garage-level-1'
    )
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

revoke execute on function public.claim_plot(uuid, text, text, text, text, text, text, text, text) from public, anon;
revoke execute on function public.update_showcased_project(uuid, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.claim_plot(uuid, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.update_showcased_project(uuid, text, text, text, text, text, text, text) to authenticated;
