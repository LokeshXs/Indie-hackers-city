-- Product billboards: each claimed plot gets a roadside board showing the project name in colours
-- the founder picks. Unlike building_color these are free-form, so the constraint is a hex format
-- check rather than a known-value allow-list.

alter table public.plot_claims
  add column billboard_text_color text not null default '#f7e0a6',
  add column billboard_background_color text not null default '#1b3a4b';

alter table public.plot_claims
  add constraint plot_claims_billboard_text_color_is_hex
    check (billboard_text_color ~ '^#[0-9a-f]{6}$'),
  add constraint plot_claims_billboard_background_color_is_hex
    check (billboard_background_color ~ '^#[0-9a-f]{6}$');

-- The functions return `setof public.city_developments`, so they have to go before the view can
-- change shape. Their signatures change anyway (two new parameters), which `create or replace`
-- cannot do — dropping also drops their grants, so those are re-issued at the end.
drop function if exists public.claim_plot(uuid, text, text, text, text, text, text, text, text);
drop function if exists public.update_showcased_project(uuid, text, text, text, text, text, text, text);

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
  claims.xp_total,
  current_milestone.required_xp as current_level_xp,
  next_milestone.required_xp as next_level_xp,
  claims.billboard_text_color,
  claims.billboard_background_color
from public.plot_claims as claims
join public.projects as projects on projects.id = claims.project_id
join public.profiles as profiles on profiles.id = claims.owner_id
join public.building_level_milestones as current_milestone
  on current_milestone.level = claims.building_level
left join public.building_level_milestones as next_milestone
  on next_milestone.level = claims.building_level + 1;

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
  requested_building_color text,
  requested_billboard_text_color text,
  requested_billboard_background_color text
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
    or coalesce(requested_billboard_text_color, '') !~ '^#[0-9a-f]{6}$'
    or coalesce(requested_billboard_background_color, '') !~ '^#[0-9a-f]{6}$'
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
      owner_id, plot_id, project_id, building_asset_id, building_color,
      billboard_text_color, billboard_background_color
    ) values (
      caller_id, requested_plot_id, project_uuid, requested_building_asset_id, requested_building_color,
      requested_billboard_text_color, requested_billboard_background_color
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

create function public.update_showcased_project(
  requested_project_id uuid,
  founder_full_name text,
  founder_x_handle text,
  project_name text,
  project_website_url text,
  requested_project_type text,
  requested_building_asset_id text,
  requested_building_color text,
  requested_billboard_text_color text,
  requested_billboard_background_color text
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
    or coalesce(requested_billboard_text_color, '') !~ '^#[0-9a-f]{6}$'
    or coalesce(requested_billboard_background_color, '') !~ '^#[0-9a-f]{6}$'
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
    building_color = requested_building_color,
    billboard_text_color = requested_billboard_text_color,
    billboard_background_color = requested_billboard_background_color
  where owner_id = caller_id and project_id = requested_project_id;

  return query
    select developments.*
    from public.city_developments as developments
    where developments.owner_id = caller_id
      and developments.project_id = requested_project_id;
end;
$$;

revoke execute on function public.claim_plot(uuid, text, text, text, text, text, text, text, text, text, text) from public, anon;
revoke execute on function public.update_showcased_project(uuid, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.claim_plot(uuid, text, text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.update_showcased_project(uuid, text, text, text, text, text, text, text, text, text) to authenticated;
