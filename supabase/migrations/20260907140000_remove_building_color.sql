-- Remove the founder's building colour.
--
-- Buildings now render in the palette they were authored in. The runtime used to REPLACE the colour
-- of one named material per shell with the founder's pick, which is why this is a removal rather
-- than a default: there is no "no colour" value, only an overwrite that no longer happens.
--
-- Why this migration is so much larger than one dropped column: city_developments selects
-- building_color, and six functions return "setof public.city_developments". Postgres therefore
-- refuses to drop the column until the view goes, and refuses to drop the view until all six
-- functions go -- including switch_claim_project, create_project, update_project and
-- upgrade_plot_premises, none of which mention colour. Those four are recreated from their existing
-- migration sources unchanged; only claim_plot and update_plot_appearance actually differ.

drop function public.claim_plot(uuid, text, text, text, text, text, text, text, text, text, text);
drop function public.update_plot_appearance(text, text, text);
drop function public.switch_claim_project(uuid);
drop function public.create_project(uuid, text, text, text, boolean);
drop function public.update_project(uuid, text, text, text, boolean);
drop function public.upgrade_plot_premises(text);

drop view public.city_developments;

alter table public.plot_claims
  drop constraint plot_claims_color_is_known;

alter table public.plot_claims
  drop column building_color;

-- Recreated without claims.building_color; every other column is unchanged.
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

-- claim_plot, one argument lighter.

create function public.claim_plot(
  project_uuid uuid,
  requested_plot_id text,
  founder_full_name text,
  founder_x_handle text,
  project_name text,
  project_website_url text,
  requested_project_type text,
  requested_building_asset_id text,
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
      owner_id, plot_id, project_id, building_asset_id,
      billboard_text_color, billboard_background_color
    ) values (
      caller_id, requested_plot_id, project_uuid, requested_building_asset_id,
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

revoke execute on function public.claim_plot(uuid, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.claim_plot(uuid, text, text, text, text, text, text, text, text, text) to authenticated;

-- Billboard colours only. The shell is assigned at claim time and is not founder-editable, and a
-- building's own colour is no longer something a founder picks at all -- the column is gone and
-- every shell renders in the palette it was authored in. The name and the invalid_building error
-- code below are both inherited; they now speak only about the billboard.
create function public.update_plot_appearance(
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
begin
  if caller_id is null then
    raise exception using message = 'not_authenticated';
  end if;

  if coalesce(requested_billboard_text_color, '') !~ '^#[0-9a-f]{6}$'
    or coalesce(requested_billboard_background_color, '') !~ '^#[0-9a-f]{6}$'
  then
    raise exception using message = 'invalid_building';
  end if;

  update public.plot_claims as claims
     set billboard_text_color = requested_billboard_text_color,
         billboard_background_color = requested_billboard_background_color
   where claims.owner_id = caller_id;

  if not found then
    raise exception using message = 'claim_not_found';
  end if;

  return query
    select developments.*
    from public.city_developments as developments
    where developments.owner_id = caller_id;
end;
$$;

revoke execute on function public.update_plot_appearance(text, text) from public, anon;
grant execute on function public.update_plot_appearance(text, text) to authenticated;

-- The four below are unchanged. They are here only because dropping the view took them with it,
-- and are reproduced from their existing migration sources rather than retyped.

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

revoke execute on function public.switch_claim_project(uuid) from public, anon;
grant execute on function public.switch_claim_project(uuid) to authenticated;

create function public.create_project(
  project_uuid uuid,
  project_name text,
  project_website_url text,
  requested_project_type text,
  showcase_on_billboard boolean default false
)
returns setof public.city_developments
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  -- Mirrored by MAX_PROJECTS_PER_FOUNDER in src/lib/city/constants.ts. With achievement approval
  -- still to come, this cap is the only ceiling on client-minted XP.
  max_projects_per_founder constant integer := 10;
  owned_project_count integer;
  violated_constraint text;
begin
  if caller_id is null then
    raise exception using message = 'not_authenticated';
  end if;

  if project_uuid is null
    or char_length(trim(coalesce(project_name, ''))) not between 1 and 40
    or char_length(coalesce(project_website_url, '')) > 2048
    or coalesce(project_website_url, '') !~ '^https?://'
    or requested_project_type not in ('website', 'app', 'chrome-extension')
  then
    raise exception using message = 'invalid_project';
  end if;

  -- Locking the founder's claim row proves they are a founder AND serializes their own concurrent
  -- create_project calls, so the cap cannot be raced past. apply_plot_xp takes the same lock
  -- downstream, so re-taking it there is a no-op.
  perform 1 from public.plot_claims as claims
   where claims.owner_id = caller_id
     for update;

  if not found then
    raise exception using message = 'claim_not_found';
  end if;

  select count(*) into owned_project_count
    from public.projects as owned
   where owned.owner_id = caller_id;

  if owned_project_count >= max_projects_per_founder then
    raise exception using message = 'project_limit_reached';
  end if;

  begin
    insert into public.projects (id, owner_id, name, website_url, project_type)
    values (
      project_uuid, caller_id, trim(project_name),
      trim(project_website_url), requested_project_type
    );
  exception when unique_violation then
    get stacked diagnostics violated_constraint = constraint_name;
    if violated_constraint = 'projects_owner_website_url_unique' then
      raise exception using message = 'project_url_taken';
    end if;
    raise exception using message = 'project_already_exists';
  end;

  -- Launching the product is what creating the project means here, so the reward is part of the
  -- same transaction: a failed award rolls the project back.
  perform public.apply_project_achievement(caller_id, project_uuid, 'product_launched');

  if showcase_on_billboard then
    update public.plot_claims as claims
       set project_id = project_uuid
     where claims.owner_id = caller_id;
  end if;

  -- Filtered on owner only: city_developments has exactly one row per claim, so this returns one
  -- row whether or not the new project went on the billboard.
  return query
    select developments.*
    from public.city_developments as developments
    where developments.owner_id = caller_id;
end;
$$;

revoke execute on function public.create_project(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.create_project(uuid, text, text, text, boolean) to authenticated;

create function public.update_project(
  requested_project_id uuid,
  project_name text,
  project_website_url text,
  requested_project_type text,
  showcase_on_billboard boolean
)
returns setof public.city_developments
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  is_showcased boolean;
  violated_constraint text;
begin
  if caller_id is null then
    raise exception using message = 'not_authenticated';
  end if;

  if requested_project_id is null
    or char_length(trim(coalesce(project_name, ''))) not between 1 and 40
    or char_length(coalesce(project_website_url, '')) > 2048
    or coalesce(project_website_url, '') !~ '^https?://'
    or requested_project_type not in ('website', 'app', 'chrome-extension')
  then
    raise exception using message = 'invalid_project';
  end if;

  if not exists (
    select 1 from public.projects as owned
     where owned.id = requested_project_id and owned.owner_id = caller_id
  ) then
    raise exception using message = 'project_not_owned';
  end if;

  select claims.project_id = requested_project_id
    into is_showcased
    from public.plot_claims as claims
   where claims.owner_id = caller_id
     for update;

  if not found then
    raise exception using message = 'claim_not_found';
  end if;

  -- plot_claims.project_id is not null: the billboard can be reassigned but never emptied, so
  -- clearing the toggle on the showcased project is rejected rather than silently ignored.
  if is_showcased and not showcase_on_billboard then
    raise exception using message = 'showcase_required';
  end if;

  begin
    update public.projects as owned
       set name = trim(project_name),
           website_url = trim(project_website_url),
           project_type = requested_project_type
     where owned.id = requested_project_id and owned.owner_id = caller_id;
  exception when unique_violation then
    get stacked diagnostics violated_constraint = constraint_name;
    if violated_constraint = 'projects_owner_website_url_unique' then
      raise exception using message = 'project_url_taken';
    end if;
    raise;
  end;

  if showcase_on_billboard and not is_showcased then
    update public.plot_claims as claims
       set project_id = requested_project_id
     where claims.owner_id = caller_id;
  end if;

  return query
    select developments.*
    from public.city_developments as developments
    where developments.owner_id = caller_id;
end;
$$;

revoke execute on function public.update_project(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.update_project(uuid, text, text, text, boolean) to authenticated;

create function public.upgrade_plot_premises(
  requested_building_asset_id text
)
returns setof public.city_developments
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  current_asset_id text;
  current_xp integer;
begin
  if caller_id is null then
    raise exception using message = 'not_authenticated';
  end if;

  if requested_building_asset_id not in ('slat-studio-level-2', 'teal-brow-level-2') then
    raise exception using message = 'invalid_building';
  end if;

  select claims.building_asset_id, claims.xp_total
    into current_asset_id, current_xp
    from public.plot_claims as claims
   where claims.owner_id = caller_id
     for update;

  if not found then
    raise exception using message = 'claim_not_found';
  end if;

  if current_xp < 490 then
    raise exception using message = 'reward_locked';
  end if;

  if current_asset_id in ('slat-studio-level-2', 'teal-brow-level-2') then
    raise exception using message = 'premises_already_chosen';
  end if;

  update public.plot_claims as claims
     set building_asset_id = requested_building_asset_id
   where claims.owner_id = caller_id;

  return query
    select developments.*
    from public.city_developments as developments
    where developments.owner_id = caller_id;
end;
$$;

revoke execute on function public.upgrade_plot_premises(text) from public, anon;
grant execute on function public.upgrade_plot_premises(text) to authenticated;
