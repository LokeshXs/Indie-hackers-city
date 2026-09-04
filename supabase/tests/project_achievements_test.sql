-- Multi-project + achievements. Kept in its own file so the XP arithmetic chain in
-- city_developments_test.sql keeps its plan(68) and never has to be renumbered.

begin;

create extension if not exists pgtap with schema extensions;

select plan(54);

-- ---------------------------------------------------------------- structure

select has_table('public', 'achievement_definitions', 'achievement catalog exists');
select has_table('public', 'project_achievements', 'awarded achievements table exists');

select results_eq(
  $$ select achievement_type, xp_reward from public.achievement_definitions order by sort_order $$,
  $$ values ('product_launched'::text, 50), ('gained_users'::text, 25),
            ('first_dollar'::text, 75), ('mrr_100'::text, 150) $$,
  'the catalog holds the four achievements with their XP rewards'
);

select hasnt_function('public', 'update_showcased_project', 'the superseded update RPC is gone');

-- ---------------------------------------------------------------- privileges

select ok(has_table_privilege('anon', 'public.achievement_definitions', 'SELECT'), 'anon can read the catalog');
select ok(has_table_privilege('authenticated', 'public.project_achievements', 'SELECT'), 'clients can read awarded achievements');
select ok(has_table_privilege('anon', 'public.project_achievements', 'SELECT'), 'badges are publicly visible');

select ok(not has_table_privilege('authenticated', 'public.project_achievements', 'INSERT'), 'clients cannot insert achievements directly');
select ok(not has_table_privilege('authenticated', 'public.project_achievements', 'UPDATE'), 'clients cannot update achievements directly');
select ok(not has_table_privilege('authenticated', 'public.project_achievements', 'DELETE'), 'clients cannot delete achievements directly');
select ok(not has_table_privilege('authenticated', 'public.achievement_definitions', 'INSERT'), 'clients cannot add achievement types');
select ok(not has_table_privilege('authenticated', 'public.achievement_definitions', 'UPDATE'), 'clients cannot re-price achievements');

-- Re-asserted here because create_project is exactly the reason someone might be tempted to grant
-- it, and because the ledger staying unreadable is what rules out a list_my_achievements RPC.
select ok(not has_table_privilege('authenticated', 'public.projects', 'INSERT'), 'clients still cannot insert projects directly');
select ok(not has_table_privilege('authenticated', 'public.plot_xp_events', 'SELECT'), 'clients still cannot read the XP ledger');

select ok(has_function_privilege('authenticated', 'public.create_project(uuid, text, text, text, boolean)', 'EXECUTE'), 'founders can create projects');
select ok(not has_function_privilege('anon', 'public.create_project(uuid, text, text, text, boolean)', 'EXECUTE'), 'anon cannot create projects');
select ok(has_function_privilege('authenticated', 'public.update_project(uuid, text, text, text, boolean)', 'EXECUTE'), 'founders can update projects');
select ok(not has_function_privilege('anon', 'public.update_project(uuid, text, text, text, boolean)', 'EXECUTE'), 'anon cannot update projects');
select ok(has_function_privilege('authenticated', 'public.record_achievement(text, uuid)', 'EXECUTE'), 'founders can record achievements');
select ok(not has_function_privilege('anon', 'public.record_achievement(text, uuid)', 'EXECUTE'), 'anon cannot record achievements');
select ok(has_function_privilege('authenticated', 'public.update_plot_appearance(text, text, text)', 'EXECUTE'), 'founders can restyle their plot');
select ok(not has_function_privilege('anon', 'public.update_plot_appearance(text, text, text)', 'EXECUTE'), 'anon cannot restyle a plot');
select ok(not has_function_privilege('authenticated', 'public.apply_project_achievement(uuid, uuid, text)', 'EXECUTE'), 'the private applier is unreachable by clients');
select ok(not has_function_privilege('anon', 'public.apply_project_achievement(uuid, uuid, text)', 'EXECUTE'), 'the private applier is unreachable by anon');

-- ---------------------------------------------------------------- fixtures

insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-4000-8000-000000000001', 'one@example.test', '{"full_name":"One"}'::jsonb),
  ('00000000-0000-4000-8000-000000000002', 'two@example.test', '{"full_name":"Two"}'::jsonb);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$ select * from public.claim_plot(
    '10000000-0000-4000-8000-000000000001', 'pioneer:jobs:north:01',
    'Founder One', '@Founder_One', 'First Project', 'https://one.example/', 'website',
    'indie-garage-level-1', '#d1ad6e', '#f7e0a6', '#1b3a4b'
  ) $$,
  'founder one claims a plot'
);

-- ---------------------------------------------------------------- create_project

select lives_ok(
  $$ select * from public.create_project(
    '10000000-0000-4000-8000-000000000002',
    'Second Product', 'https://two.example/', 'app', false
  ) $$,
  'a founder can create a second project'
);
select results_eq(
  $$ select xp_total from public.plot_claims where owner_id = '00000000-0000-4000-8000-000000000001' $$,
  array[60],
  'creating a project awards the product_launched reward'
);
select results_eq(
  $$ select achievement_type, xp_awarded, status from public.project_achievements
     where project_id = '10000000-0000-4000-8000-000000000002' $$,
  $$ values ('product_launched'::text, 50, 'approved'::text) $$,
  'the award is recorded against the new project'
);
reset role;
select results_eq(
  $$ select event_key, event_type from public.plot_xp_events
     where event_key = 'achievement:product_launched:10000000-0000-4000-8000-000000000002' $$,
  $$ values ('achievement:product_launched:10000000-0000-4000-8000-000000000002'::text, 'product_launched'::text) $$,
  'the ledger event uses the derived achievement key'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
select results_eq(
  $$ select project_id from public.plot_claims where owner_id = '00000000-0000-4000-8000-000000000001' $$,
  array['10000000-0000-4000-8000-000000000001'::uuid],
  'creating without showcasing leaves the billboard alone'
);

-- ---------------------------------------------------------------- record_achievement

select throws_ok(
  $$ select * from public.record_achievement('product_launched', '10000000-0000-4000-8000-000000000002') $$,
  'P0001', 'achievement_already_claimed',
  'create_project already minted product_launched for its own project'
);

-- The claim_plot project never received one, so it stays claimable.
select lives_ok(
  $$ select * from public.record_achievement('product_launched', '10000000-0000-4000-8000-000000000001') $$,
  'the original claim project can still be marked as launched'
);

select results_eq(
  $$ select xp_awarded, xp_total from public.record_achievement('mrr_100', '10000000-0000-4000-8000-000000000002') $$,
  $$ values (150, 260) $$,
  'an achievement awards exactly its catalog XP'
);

select throws_ok(
  $$ select * from public.record_achievement('mrr_100', '10000000-0000-4000-8000-000000000002') $$,
  'P0001', 'achievement_already_claimed',
  'the same achievement cannot be claimed twice for one project'
);
reset role;
select results_eq(
  $$ select count(*) from public.plot_xp_events
     where event_key = 'achievement:mrr_100:10000000-0000-4000-8000-000000000002' $$,
  array[1::bigint],
  'a rejected replay writes no second ledger event'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
select results_eq(
  $$ select xp_total from public.plot_claims where owner_id = '00000000-0000-4000-8000-000000000001' $$,
  array[260],
  'a rejected replay awards no XP'
);

select lives_ok(
  $$ select * from public.record_achievement('mrr_100', '10000000-0000-4000-8000-000000000001') $$,
  'the same achievement is claimable again on a different project'
);

select throws_ok(
  $$ select * from public.record_achievement('made_up_thing', '10000000-0000-4000-8000-000000000001') $$,
  'P0001', 'invalid_achievement',
  'an unknown achievement type is rejected'
);

-- ---------------------------------------------------------------- update_project

-- The regression test: the retired update_showcased_project returned zero rows here.
select results_eq(
  $$ select count(*) from public.update_project(
    '10000000-0000-4000-8000-000000000002',
    'Second Product Renamed', 'https://two.example/', 'app', false
  ) $$,
  array[1::bigint],
  'editing a project that is not on the billboard returns the development row'
);
select results_eq(
  $$ select name from public.projects where id = '10000000-0000-4000-8000-000000000002' $$,
  array['Second Product Renamed'::text],
  'the edit is persisted'
);

select lives_ok(
  $$ select * from public.update_project(
    '10000000-0000-4000-8000-000000000002',
    'Second Product Renamed', 'https://two.example/', 'app', true
  ) $$,
  'a project can be moved onto the billboard while saving its fields'
);
select results_eq(
  $$ select project_id from public.plot_claims where owner_id = '00000000-0000-4000-8000-000000000001' $$,
  array['10000000-0000-4000-8000-000000000002'::uuid],
  'the billboard now shows the second project'
);
select results_eq(
  $$ select xp_total, building_level from public.plot_claims where owner_id = '00000000-0000-4000-8000-000000000001' $$,
  $$ values (410, 3::smallint) $$,
  'moving the billboard preserves plot progression'
);

select throws_ok(
  $$ select * from public.update_project(
    '10000000-0000-4000-8000-000000000002',
    'Second Product Renamed', 'https://two.example/', 'app', false
  ) $$,
  'P0001', 'showcase_required',
  'the billboard cannot be emptied by unchecking the showcased project'
);

select throws_ok(
  $$ select * from public.update_project(
    '10000000-0000-4000-8000-000000000001',
    'Clash', 'https://two.example/', 'website', false
  ) $$,
  'P0001', 'project_url_taken',
  'one founder cannot point two projects at the same URL'
);

-- ---------------------------------------------------------------- update_plot_appearance

select lives_ok(
  $$ select * from public.update_plot_appearance('#9b8ac4', '#ffffff', '#101010') $$,
  'a founder can restyle their plot'
);
select results_eq(
  $$ select building_color, billboard_text_color, billboard_background_color, building_asset_id
     from public.plot_claims where owner_id = '00000000-0000-4000-8000-000000000001' $$,
  $$ values ('#9b8ac4'::text, '#ffffff'::text, '#101010'::text, 'indie-garage-level-1'::text) $$,
  'colours change and the building shell is left alone'
);
select throws_ok(
  $$ select * from public.update_plot_appearance('wheat', '#ffffff', '#101010') $$,
  'P0001', 'invalid_building',
  'an unknown building colour is rejected'
);

-- ---------------------------------------------------------------- ownership

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$ select * from public.record_achievement('first_dollar', '10000000-0000-4000-8000-000000000001') $$,
  'P0001', 'project_not_owned',
  'an achievement cannot be attached to another founder project'
);
select throws_ok(
  $$ select * from public.create_project(
    '10000000-0000-4000-8000-000000000050', 'No Plot', 'https://noplot.example/', 'website', false
  ) $$,
  'P0001', 'claim_not_found',
  'a signed-in user without a plot cannot create projects'
);
select results_eq(
  $$ select count(*) from public.projects where id = '10000000-0000-4000-8000-000000000050' $$,
  array[0::bigint],
  'the failed create rolled back'
);

-- ---------------------------------------------------------------- cap and cardinality

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
do $$
declare
  index_offset integer;
begin
  -- Two projects exist already; fill to the cap of ten.
  for index_offset in 3..10 loop
    perform public.create_project(
      ('10000000-0000-4000-8000-0000000001' || lpad(index_offset::text, 2, '0'))::uuid,
      'Filler ' || index_offset,
      'https://filler-' || index_offset || '.example/',
      'website',
      false
    );
  end loop;
end;
$$;

select results_eq(
  $$ select count(*) from public.projects where owner_id = '00000000-0000-4000-8000-000000000001' $$,
  array[10::bigint],
  'a founder can hold ten projects'
);
select throws_ok(
  $$ select * from public.create_project(
    '10000000-0000-4000-8000-000000000111', 'Overflow', 'https://overflow.example/', 'website', false
  ) $$,
  'P0001', 'project_limit_reached',
  'the eleventh project is refused'
);

-- The guard that the view cannot fan out as projects accumulate.
select results_eq(
  $$ select count(*) from public.city_developments where owner_id = '00000000-0000-4000-8000-000000000001' $$,
  array[1::bigint],
  'the city projection stays one row per founder however many projects they own'
);

select * from finish();
rollback;
