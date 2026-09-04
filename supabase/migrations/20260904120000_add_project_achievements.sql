-- Multiple projects per founder, and achievements that move XP.
--
-- The schema already allowed N projects per owner (projects.owner_id has no unique constraint) and
-- already enforced exactly one billboard project (plot_claims.owner_id primary key + project_id
-- unique + the composite FK). What was missing was a way for a client to CREATE a project —
-- `authenticated` holds only SELECT on public.projects, and the sole insert lives inside claim_plot,
-- which hard-fails the second time with user_already_has_plot.
--
-- So: a security definer create path, an award path for achievements, and a split of the old
-- ten-argument update_showcased_project into functions that each write one thing.
--
-- The city_developments view is unchanged. It joins projects on projects.id = claims.project_id, a
-- single-row lookup, so extra project rows cannot fan it out and the drop-before-recreate ordering
-- the billboards migration needed does not apply here.

-- --------------------------------------------------------------------------------------------
-- Catalog. XP amounts live in a table, not as literals in a function body, so that the award
-- functions can read them and the client can never express an amount.
-- --------------------------------------------------------------------------------------------

create table public.achievement_definitions (
  achievement_type text primary key,
  label text not null,
  description text not null,
  xp_reward integer not null,
  sort_order smallint not null unique,
  requires_new_project boolean not null default false,
  created_at timestamptz not null default now(),

  constraint achievement_definitions_type_valid check (
    achievement_type = trim(achievement_type)
    and char_length(achievement_type) between 1 and 80
  ),
  constraint achievement_definitions_label_length check (
    char_length(trim(label)) between 1 and 60
  ),
  constraint achievement_definitions_description_length check (
    char_length(description) between 1 and 200
  ),
  constraint achievement_definitions_xp_reward_range check (xp_reward between 1 and 100000)
);

insert into public.achievement_definitions
  (achievement_type, label, description, xp_reward, sort_order, requires_new_project)
values
  ('product_launched', 'Launched a new product', 'Shipped a new product to the world.',          50, 1, true),
  ('gained_users',     'Gained users',           'Real people are using the product.',           25, 2, false),
  ('first_dollar',     'Earned first dollar',    'Earned money from the product.',               75, 3, false),
  ('mrr_100',          'Reached $100 MRR',       'Reached $100 in monthly recurring revenue.',  150, 4, false);

alter table public.achievement_definitions enable row level security;

create policy "Achievement definitions are viewable by everyone"
  on public.achievement_definitions
  for select
  to anon, authenticated
  using (true);

revoke all on public.achievement_definitions from anon, authenticated;
grant select on public.achievement_definitions to anon, authenticated;

-- --------------------------------------------------------------------------------------------
-- Awarded achievements. Publicly readable so a visitor can see another founder's badges; every
-- write goes through the security definer functions below.
-- --------------------------------------------------------------------------------------------

create table public.project_achievements (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.plot_claims(owner_id) on delete cascade,
  project_id uuid not null,
  achievement_type text not null references public.achievement_definitions(achievement_type),
  xp_awarded integer not null,
  event_key text not null unique,
  -- Ships defaulting to 'approved' and nothing reads it yet. An admin console that gates
  -- achievements behind approval is planned; when it lands, the default flips to 'pending' and the
  -- apply_plot_xp call moves from submission to approval. Adding the column now means those rows
  -- never have to be retro-classified.
  status text not null default 'approved',
  created_at timestamptz not null default now(),

  -- The same composite-FK trick plot_claims plays against projects_id_owner_unique: it makes an
  -- achievement on someone else's project physically unrepresentable, independent of any RPC check.
  constraint project_achievements_project_owner_fk
    foreign key (project_id, owner_id)
    references public.projects (id, owner_id)
    on delete cascade,

  constraint project_achievements_once_per_project unique (project_id, achievement_type),
  constraint project_achievements_xp_awarded_range check (xp_awarded between 1 and 100000),
  constraint project_achievements_status_known check (status in ('pending', 'approved', 'rejected')),

  -- Forces the stored key to be the same expression apply_project_achievement hands to the XP
  -- ledger, so the two idempotency guards cannot drift apart.
  constraint project_achievements_event_key_derived check (
    event_key = 'achievement:' || achievement_type || ':' || project_id::text
  )
);

create index project_achievements_owner_created_idx
  on public.project_achievements (owner_id, created_at desc);

alter table public.project_achievements enable row level security;

create policy "Project achievements are viewable by everyone"
  on public.project_achievements
  for select
  to anon, authenticated
  using (true);

revoke all on public.project_achievements from anon, authenticated;
grant select on public.project_achievements to anon, authenticated;

-- Each project costs the founder a distinct URL. Safe to build: claim_plot is the only insert path
-- today and a founder can claim once, so no owner has two projects yet.
create unique index projects_owner_website_url_unique
  on public.projects (owner_id, lower(website_url));

-- --------------------------------------------------------------------------------------------
-- Award path.
-- --------------------------------------------------------------------------------------------

-- Records one achievement and its XP ledger event. Carries NO authorization check of its own,
-- exactly like public.apply_plot_xp: execute is revoked from every role, so it is reachable only
-- from a security definer function that has already established the caller owns the project.
--
-- The OUT columns are named awarded_*/resulting_* so none of them shadows a real column referenced
-- in the body.
create function public.apply_project_achievement(
  target_owner_id uuid,
  target_project_id uuid,
  requested_achievement_type text
)
returns table (
  awarded_type text,
  awarded_project_id uuid,
  awarded_xp integer,
  resulting_xp_total integer,
  resulting_building_level smallint,
  resulting_level_changed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  definition public.achievement_definitions%rowtype;
  award_key text;
  xp_result record;
  violated_constraint text;
begin
  select definitions.*
    into definition
    from public.achievement_definitions as definitions
   where definitions.achievement_type = requested_achievement_type;

  if not found then
    raise exception using message = 'invalid_achievement';
  end if;

  award_key := 'achievement:' || definition.achievement_type || ':' || target_project_id::text;

  -- Insert first. The (project_id, achievement_type) unique constraint IS the once-per-project
  -- rule, and failing here means apply_plot_xp is never reached, so a replay awards nothing.
  begin
    insert into public.project_achievements (
      owner_id, project_id, achievement_type, xp_awarded, event_key
    ) values (
      target_owner_id, target_project_id, definition.achievement_type,
      definition.xp_reward, award_key
    );
  exception when unique_violation then
    get stacked diagnostics violated_constraint = constraint_name;
    if violated_constraint in (
      'project_achievements_once_per_project',
      'project_achievements_event_key_key'
    ) then
      raise exception using message = 'achievement_already_claimed';
    end if;
    raise exception using message = 'invalid_achievement';
  end;

  select applied.xp_total, applied.building_level, applied.level_changed
    into xp_result
    from public.apply_plot_xp(
      target_owner_id,
      definition.xp_reward,
      award_key,
      definition.achievement_type,
      definition.label,
      jsonb_build_object(
        'project_id', target_project_id,
        'achievement_type', definition.achievement_type
      )
    ) as applied;

  return query select
    definition.achievement_type,
    target_project_id,
    definition.xp_reward,
    xp_result.xp_total,
    xp_result.building_level,
    xp_result.level_changed;
end;
$$;

revoke execute on function public.apply_project_achievement(uuid, uuid, text)
  from public, anon, authenticated;

-- --------------------------------------------------------------------------------------------
-- Client-callable write paths.
-- --------------------------------------------------------------------------------------------

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

-- Edits any project the caller owns, showcased or not.
--
-- This is the fix for a live bug: update_showcased_project carried
-- `and project_id = requested_project_id` on both its plot_claims UPDATE and its return query, so
-- editing a project that was not currently on the billboard silently updated zero rows and returned
-- none — which the API route then reported as a 500.
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

-- Accepts all four achievement types, product_launched included. create_project already minted that
-- one for projects it creates, so a repeat there returns achievement_already_claimed on its own —
-- but the project created by claim_plot never got one, and allowing all four is what lets a
-- day-one founder claim it on their original project instead of stranding that XP forever.
create function public.record_achievement(
  requested_achievement_type text,
  requested_project_id uuid
)
returns table (
  achievement_type text,
  project_id uuid,
  xp_awarded integer,
  xp_total integer,
  building_level smallint,
  level_changed boolean
)
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

  if requested_project_id is null
    or requested_achievement_type is null
    or requested_achievement_type <> trim(requested_achievement_type)
    or char_length(requested_achievement_type) not between 1 and 80
  then
    raise exception using message = 'invalid_achievement';
  end if;

  if not exists (
    select 1 from public.projects as owned
     where owned.id = requested_project_id and owned.owner_id = caller_id
  ) then
    raise exception using message = 'project_not_owned';
  end if;

  return query select * from public.apply_project_achievement(
    caller_id, requested_project_id, requested_achievement_type
  );
end;
$$;

revoke execute on function public.record_achievement(text, uuid) from public, anon;
grant execute on function public.record_achievement(text, uuid) to authenticated;

-- Plot appearance only. building_asset_id is deliberately absent: the building shell is assigned at
-- claim time and is no longer founder-editable.
create function public.update_plot_appearance(
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
begin
  if caller_id is null then
    raise exception using message = 'not_authenticated';
  end if;

  if requested_building_color not in (
      '#d1ad6e', '#e2775c', '#5fa8d3', '#7fa87a',
      '#f0c94b', '#9b8ac4', '#e8a0b4', '#5b6670'
    )
    or coalesce(requested_billboard_text_color, '') !~ '^#[0-9a-f]{6}$'
    or coalesce(requested_billboard_background_color, '') !~ '^#[0-9a-f]{6}$'
  then
    raise exception using message = 'invalid_building';
  end if;

  update public.plot_claims as claims
     set building_color = requested_building_color,
         billboard_text_color = requested_billboard_text_color,
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

revoke execute on function public.update_plot_appearance(text, text, text) from public, anon;
grant execute on function public.update_plot_appearance(text, text, text) to authenticated;

-- Fully superseded: project fields go to update_project, colours to update_plot_appearance, and
-- founder identity is a direct profiles update (that table already has an own-row UPDATE policy).
-- It also still carried the removed building-asset parameter and the zero-rows bug above.
drop function public.update_showcased_project(
  uuid, text, text, text, text, text, text, text, text, text
);

-- Other founders' badges should appear without a refresh. Awards also bump plot_claims.xp_total,
-- which the existing subscription already covers.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'project_achievements'
  ) then
    alter publication supabase_realtime add table public.project_achievements;
  end if;
end;
$$;
