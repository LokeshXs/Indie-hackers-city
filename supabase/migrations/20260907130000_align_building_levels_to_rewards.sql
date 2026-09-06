-- Move building level 2 to the same 490 XP that unlocks the new premises.
--
-- The two ladders were unrelated: building_level_milestones put level 2 at 100 XP, while the
-- levelTwo reward in src/lib/city/unlocks.ts sits at 490. A founder redeeming the reward therefore
-- read "Lvl 3" on their founder card while moving into what the UI calls a level-2 building.
--
-- Levels 3-5 move with it out of necessity, not taste. building_level_for_xp takes the highest
-- required_xp <= total, so leaving level 3 at 300 while level 2 became 490 would have run the
-- ladder 1 -> 3 -> 2 -> 4: crossing 490 would have been a demotion. The gaps above level 2 are the
-- same +200 / +400 / +800 they have always been, just starting from 490.

update public.building_level_milestones as milestones
   set required_xp = target.required_xp
  from (values
    (1::smallint, 0),
    (2::smallint, 490),
    (3::smallint, 690),
    (4::smallint, 1090),
    (5::smallint, 1890)
  ) as target(level, required_xp)
 where milestones.level = target.level;

-- building_level is a stored column, written only by apply_plot_xp as XP is awarded. Nothing would
-- recompute it for a founder who is not currently earning, so without this backfill every existing
-- claim would keep the level it was given under the old curve until its next XP event.
update public.plot_claims as claims
   set building_level = public.building_level_for_xp(claims.xp_total);
