-- Revenue is money the founder earned, not money a product earned.
--
-- `revenue_10` and `revenue_100` become once-per-founder across the whole portfolio. Launch and
-- users stay per-project: those describe a specific product's traction, while total earnings
-- describe the person.
--
-- This is a scope column on the catalog rather than a second table. The award machinery, the ledger
-- keys and the cascade all work unchanged that way; a founder_achievements table would duplicate
-- every one of them.

alter table public.achievement_definitions
  add column scope text not null default 'project';

alter table public.achievement_definitions
  alter column scope drop default,
  add constraint achievement_definitions_scope_known check (scope in ('project', 'founder'));

update public.achievement_definitions set scope = 'founder' where group_key = 'revenue';

-- --------------------------------------------------------------------------------------------
-- Awards learn to carry either a project or nothing at all.
-- --------------------------------------------------------------------------------------------

-- Existing revenue rows were scoped to a project, so what they mean under the new rule is a guess.
-- Drop them and their ledger events, matching the decision taken when the catalog was re-tiered.
delete from public.plot_xp_events where event_key like 'achievement:revenue_%';
delete from public.project_achievements where achievement_type like 'revenue_%';

alter table public.project_achievements
  alter column project_id drop not null;

-- The composite FK stays. It is MATCH SIMPLE, so a null project_id skips it entirely, while
-- project-scoped rows keep the database-level guarantee that they cannot point at someone else's
-- project.
alter table public.project_achievements
  drop constraint project_achievements_once_per_project;

-- Two partial indexes replace the single unique constraint: one rung per project for project-scoped
-- achievements, one rung per founder for the rest.
create unique index project_achievements_once_per_project
  on public.project_achievements (project_id, achievement_type)
  where project_id is not null;

create unique index project_achievements_once_per_founder
  on public.project_achievements (owner_id, achievement_type)
  where project_id is null;

-- The derived key widens to cover both scopes, so the two idempotency guards still cannot drift.
alter table public.project_achievements
  drop constraint project_achievements_event_key_derived,
  add constraint project_achievements_event_key_derived check (
    event_key = 'achievement:' || achievement_type || ':' || coalesce(project_id, owner_id)::text
  );

-- xp_total is a stored running total, so the deleted revenue awards have to come back out of it.
update public.plot_claims as claims
   set xp_total = coalesce(totals.total, 0),
       building_level = public.building_level_for_xp(coalesce(totals.total, 0))
  from (
    select events.owner_id, sum(events.xp_delta)::integer as total
      from public.plot_xp_events as events
     group by events.owner_id
  ) as totals
 where totals.owner_id = claims.owner_id;

update public.plot_claims as claims
   set xp_total = 0, building_level = 1
 where not exists (
   select 1 from public.plot_xp_events as events where events.owner_id = claims.owner_id
 );

-- --------------------------------------------------------------------------------------------
-- The award path branches on scope. Everything else about it is unchanged: same signature, same
-- "no authorization check, revoked from every role" contract, same cascade over lower rungs.
-- --------------------------------------------------------------------------------------------

create or replace function public.apply_project_achievement(
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
  requested public.achievement_definitions%rowtype;
  rung public.achievement_definitions%rowtype;
  -- Null for founder-scoped rungs, which is what makes the partial unique index apply.
  rung_project_id uuid;
  award_key text;
  granted_xp integer := 0;
  final_xp_total integer;
  final_building_level smallint;
  crossed_a_level boolean := false;
  rung_xp_total integer;
  rung_building_level smallint;
  rung_level_changed boolean;
begin
  select definitions.*
    into requested
    from public.achievement_definitions as definitions
   where definitions.achievement_type = requested_achievement_type;

  if not found then
    raise exception using message = 'invalid_achievement';
  end if;

  for rung in
    select definitions.*
      from public.achievement_definitions as definitions
     where definitions.group_key = requested.group_key
       and definitions.tier <= requested.tier
     order by definitions.tier
  loop
    rung_project_id := case when rung.scope = 'founder' then null else target_project_id end;
    -- The key is scoped to whatever the rung is scoped to, so a founder rung is claimed once
    -- however many products they own.
    award_key := 'achievement:' || rung.achievement_type || ':'
      || coalesce(rung_project_id, target_owner_id)::text;

    if exists (
      select 1 from public.project_achievements as held
       where held.achievement_type = rung.achievement_type
         and held.owner_id = target_owner_id
         and (
           (rung_project_id is null and held.project_id is null)
           or held.project_id = rung_project_id
         )
    ) then
      continue;
    end if;

    begin
      insert into public.project_achievements (
        owner_id, project_id, achievement_type, xp_awarded, event_key
      ) values (
        target_owner_id, rung_project_id, rung.achievement_type, rung.xp_reward, award_key
      );
    exception when unique_violation then
      -- A concurrent claim took this rung. Skip it rather than failing the rungs still free.
      continue;
    end;

    select applied.xp_total, applied.building_level, applied.level_changed
      into rung_xp_total, rung_building_level, rung_level_changed
      from public.apply_plot_xp(
        target_owner_id,
        rung.xp_reward,
        award_key,
        rung.achievement_type,
        rung.label,
        jsonb_build_object(
          'project_id', rung_project_id,
          'achievement_type', rung.achievement_type
        )
      ) as applied;

    granted_xp := granted_xp + rung.xp_reward;
    final_xp_total := rung_xp_total;
    final_building_level := rung_building_level;
    crossed_a_level := crossed_a_level or rung_level_changed;
  end loop;

  if granted_xp = 0 then
    raise exception using message = 'achievement_already_claimed';
  end if;

  return query select
    requested.achievement_type,
    case when requested.scope = 'founder' then null else target_project_id end,
    granted_xp,
    final_xp_total,
    final_building_level,
    crossed_a_level;
end;
$$;

revoke execute on function public.apply_project_achievement(uuid, uuid, text)
  from public, anon, authenticated;

-- A founder-scoped achievement has no project to attach to, so the project argument becomes
-- optional and the ownership check only applies where there is something to own.
create or replace function public.record_achievement(
  requested_achievement_type text,
  requested_project_id uuid default null
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
  requested_scope text;
begin
  if caller_id is null then
    raise exception using message = 'not_authenticated';
  end if;

  if requested_achievement_type is null
    or requested_achievement_type <> trim(requested_achievement_type)
    or char_length(requested_achievement_type) not between 1 and 80
  then
    raise exception using message = 'invalid_achievement';
  end if;

  select definitions.scope
    into requested_scope
    from public.achievement_definitions as definitions
   where definitions.achievement_type = requested_achievement_type;

  if not found then
    raise exception using message = 'invalid_achievement';
  end if;

  -- Project-scoped types prove the caller is a founder by owning the project. Founder-scoped ones
  -- have nothing to check, so without this a plotless user reaches the insert and gets a raw
  -- foreign-key error from project_achievements.owner_id instead of a usable code.
  if not exists (
    select 1 from public.plot_claims as claims where claims.owner_id = caller_id
  ) then
    raise exception using message = 'claim_not_found';
  end if;

  if requested_scope = 'project' then
    if requested_project_id is null then
      raise exception using message = 'invalid_achievement';
    end if;

    if not exists (
      select 1 from public.projects as owned
       where owned.id = requested_project_id and owned.owner_id = caller_id
    ) then
      raise exception using message = 'project_not_owned';
    end if;
  end if;

  return query select * from public.apply_project_achievement(
    caller_id, requested_project_id, requested_achievement_type
  );
end;
$$;

revoke execute on function public.record_achievement(text, uuid) from public, anon;
grant execute on function public.record_achievement(text, uuid) to authenticated;
