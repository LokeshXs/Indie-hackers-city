-- The 490 XP `levelTwo` reward, made real.
--
-- Until now building_asset_id was write-once: claim_plot set it and nothing could change it after.
-- update_showcased_project was the last function that could, and it was dropped in
-- 20260904120000. This adds the one narrow path that may move it, and only ever upward.

alter table public.plot_claims
  drop constraint plot_claims_asset_is_known;

alter table public.plot_claims
  add constraint plot_claims_asset_is_known check (
    building_asset_id in (
      'startup-building-level-1',
      'corner-studio-level-1',
      'indie-garage-level-1',
      'slat-studio-level-2',
      'teal-brow-level-2'
    )
  );

-- Redeems the reward: swaps a level-1 shell for one of the two level-2 premises.
--
-- Every check here is load-bearing rather than belt-and-braces. This function is granted to
-- `authenticated`, so it is reachable straight from the browser's Supabase client -- validating in
-- the API route alone would leave the whole thing bypassable with one rpc() call.
--
-- The 490 threshold is duplicated from LADDER in src/lib/city/unlocks.ts, which SQL cannot import.
-- The same duplication already exists for the building colour list above. If you move one, move
-- both: supabase/tests/city_developments_test.sql and src/lib/city/unlocks.test.ts pin each side.
--
-- There is deliberately no path back. The choice is one-time, and the guard that enforces that is
-- the already-level-2 check below: once building_asset_id names a level-2 shell there is no
-- function in the schema that can move it again.
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
