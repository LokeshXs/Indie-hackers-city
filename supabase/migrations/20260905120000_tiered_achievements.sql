-- Tiered achievements.
--
-- The first catalog was four flat types chosen to prove the award machinery. Two of them were the
-- wrong shape: "gained users" fired once whether a product had ten users or a hundred thousand, and
-- launching a product — the hardest thing on the list — paid a third of what reaching $100 did.
--
-- The replacement grades users and revenue into rungs, and claiming a rung grants every rung below
-- it. That is the important rule: a founder knows how far a product has got, not which individual
-- milestones they remembered to log, so picking "100+ users" awards 10, 50 and 100 at once.
--
-- The old catalog and every award against it are dropped. This is pre-launch, and the alternative —
-- mapping three old types onto six new ones — would bake a guess about what each old row meant into
-- the data permanently.

-- --------------------------------------------------------------------------------------------
-- Grouping. Without these two columns there is no way to ask "which rows sit below this one".
-- --------------------------------------------------------------------------------------------

alter table public.achievement_definitions
  add column group_key text not null default 'launch',
  add column tier smallint not null default 1;

-- The defaults exist only to satisfy the not-null on the rows about to be deleted; every seeded row
-- states its own group and rung.
alter table public.achievement_definitions
  alter column group_key drop default,
  alter column tier drop default;

-- --------------------------------------------------------------------------------------------
-- Wipe, in FK order: ledger events, then awards, then the definitions they point at.
-- --------------------------------------------------------------------------------------------

delete from public.plot_xp_events where event_key like 'achievement:%';
delete from public.project_achievements;
delete from public.achievement_definitions;

alter table public.achievement_definitions
  add constraint achievement_definitions_group_known
    check (group_key in ('launch', 'users', 'revenue')),
  add constraint achievement_definitions_tier_range check (tier between 1 and 10),
  -- One row per rung, so "every tier at or below this one" is unambiguous.
  add constraint achievement_definitions_group_tier_unique unique (group_key, tier);

insert into public.achievement_definitions
  (achievement_type, label, description, xp_reward, sort_order, requires_new_project, group_key, tier)
values
  ('product_launched', 'Launched a new product', 'Shipped a new product to the world.',   100, 1, true,  'launch',  1),
  ('users_10',         '10 users',               'Ten people are using it.',                5, 2, false, 'users',   1),
  ('users_50',         '50 users',               'Fifty people are using it.',             25, 3, false, 'users',   2),
  -- Open-ended on purpose: "100 users" reads as exactly a hundred and would look wrong to a founder
  -- with forty thousand. "100+" stays true at any scale, so the top rung never expires.
  ('users_100',        '100+ users',             'A hundred or more people are using it.', 50, 4, false, 'users',   3),
  ('revenue_10',       '$10 earned',             'It made its first money.',               50, 5, false, 'revenue', 1),
  ('revenue_100',      '$100+ earned',           'It has earned a hundred dollars or more.', 150, 6, false, 'revenue', 2);

-- xp_total is a stored running total, so deleting ledger rows without recomputing would leave every
-- founder inflated by achievements that no longer exist.
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
-- Cascading award. Same signature, same "no authorization check, revoked from every role"
-- contract as before — only the body changes, from inserting one row to inserting every unclaimed
-- rung at or below the requested one.
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
    -- Already held rungs are skipped rather than failing the whole claim: reaching 100+ users when
    -- 10 was logged months ago should still award the 50 and 100 rungs.
    if exists (
      select 1 from public.project_achievements as held
       where held.project_id = target_project_id
         and held.achievement_type = rung.achievement_type
    ) then
      continue;
    end if;

    award_key := 'achievement:' || rung.achievement_type || ':' || target_project_id::text;

    begin
      insert into public.project_achievements (
        owner_id, project_id, achievement_type, xp_awarded, event_key
      ) values (
        target_owner_id, target_project_id, rung.achievement_type, rung.xp_reward, award_key
      );
    exception when unique_violation then
      -- A concurrent claim took this rung between the check above and here. Someone else's
      -- transaction awarded it, so skip rather than failing the rungs that are still free.
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
          'project_id', target_project_id,
          'achievement_type', rung.achievement_type
        )
      ) as applied;

    granted_xp := granted_xp + rung.xp_reward;
    final_xp_total := rung_xp_total;
    final_building_level := rung_building_level;
    -- Any rung crossing a level counts, not just the last one.
    crossed_a_level := crossed_a_level or rung_level_changed;
  end loop;

  if granted_xp = 0 then
    raise exception using message = 'achievement_already_claimed';
  end if;

  return query select
    requested.achievement_type,
    target_project_id,
    granted_xp,
    final_xp_total,
    final_building_level,
    crossed_a_level;
end;
$$;

revoke execute on function public.apply_project_achievement(uuid, uuid, text)
  from public, anon, authenticated;

comment on function public.record_achievement(text, uuid) is
  'Records an achievement for a project the caller owns. Claiming a rung also grants every rung '
  'below it in the same group, so the reported xp_awarded is the sum of what was newly granted.';
