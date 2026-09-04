begin;

create extension if not exists pgtap with schema extensions;

select plan(68);

select has_table('public', 'plots', 'plots table exists');
select has_table('public', 'projects', 'projects table exists');
select has_table('public', 'plot_claims', 'plot claims table exists');
select has_table('public', 'building_level_milestones', 'building milestones table exists');
select has_table('public', 'plot_xp_events', 'plot XP ledger exists');
select has_view('public', 'city_developments', 'public city projection exists');
select results_eq(
  $$ select level, required_xp from public.building_level_milestones order by level $$,
  $$ values (1::smallint, 0), (2::smallint, 100), (3::smallint, 300), (4::smallint, 700), (5::smallint, 1500) $$,
  'building milestones use the initial five-level XP curve'
);
select results_eq(
  $$ select count(*) from public.plots where is_active $$,
  array[64::bigint],
  'all 64 Pioneer plots are active'
);
select results_eq(
  $$ select count(distinct id) from public.plots $$,
  array[64::bigint],
  'canonical plot IDs are unique'
);
select results_eq(
  $$ select count(*) from public.plots where id <> district_id || ':' || street_id || ':' || row_id || ':' || lpad(lot_number::text, 2, '0') $$,
  array[0::bigint],
  'every plot ID matches its structural identity'
);

select ok(has_table_privilege('anon', 'public.plots', 'SELECT'), 'anonymous visitors can read plots');
select ok(has_table_privilege('anon', 'public.projects', 'SELECT'), 'anonymous visitors can read projects');
select ok(has_table_privilege('anon', 'public.plot_claims', 'SELECT'), 'anonymous visitors can read claims');
select ok(not has_table_privilege('authenticated', 'public.projects', 'INSERT'), 'clients cannot directly insert projects');
select ok(not has_table_privilege('authenticated', 'public.plot_claims', 'INSERT'), 'clients cannot directly insert claims');
select ok(not has_table_privilege('authenticated', 'public.plot_claims', 'DELETE'), 'clients cannot release claims');
select ok(has_table_privilege('anon', 'public.building_level_milestones', 'SELECT'), 'anonymous visitors can read building milestones');
select ok(has_table_privilege('authenticated', 'public.building_level_milestones', 'SELECT'), 'authenticated users can read building milestones');
select ok(not has_table_privilege('anon', 'public.building_level_milestones', 'INSERT'), 'anonymous visitors cannot insert building milestones');
select ok(not has_table_privilege('authenticated', 'public.building_level_milestones', 'INSERT'), 'authenticated users cannot insert building milestones');
select ok(not has_table_privilege('authenticated', 'public.building_level_milestones', 'UPDATE'), 'authenticated users cannot update building milestones');
select ok(not has_table_privilege('authenticated', 'public.building_level_milestones', 'DELETE'), 'authenticated users cannot delete building milestones');
select ok(not has_table_privilege('anon', 'public.plot_xp_events', 'SELECT'), 'anonymous visitors cannot read the XP ledger');
select ok(not has_table_privilege('authenticated', 'public.plot_xp_events', 'INSERT'), 'authenticated clients cannot insert XP events');
select ok(not has_table_privilege('authenticated', 'public.plot_xp_events', 'UPDATE'), 'authenticated clients cannot edit XP events');
select ok(not has_table_privilege('authenticated', 'public.plot_xp_events', 'DELETE'), 'authenticated clients cannot delete XP events');
select ok(has_function_privilege('authenticated', 'public.claim_plot(uuid,text,text,text,text,text,text,text,text,text,text)', 'EXECUTE'), 'authenticated users can call claim RPC');
select ok(not has_function_privilege('anon', 'public.claim_plot(uuid,text,text,text,text,text,text,text,text,text,text)', 'EXECUTE'), 'anonymous users cannot call claim RPC');
select ok(not has_function_privilege('authenticated', 'public.award_plot_xp(uuid,integer,text,text,text,jsonb)', 'EXECUTE'), 'authenticated clients cannot award XP');
select ok(not has_function_privilege('anon', 'public.award_plot_xp(uuid,integer,text,text,text,jsonb)', 'EXECUTE'), 'anonymous visitors cannot award XP');
select ok(not has_function_privilege('authenticated', 'public.apply_plot_xp(uuid,integer,text,text,text,jsonb)', 'EXECUTE'), 'authenticated clients cannot apply XP directly');
select ok(not has_function_privilege('anon', 'public.apply_plot_xp(uuid,integer,text,text,text,jsonb)', 'EXECUTE'), 'anonymous visitors cannot apply XP directly');

insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-4000-8000-000000000001', 'one@example.test', '{"full_name":"One"}'::jsonb),
  ('00000000-0000-4000-8000-000000000002', 'two@example.test', '{"full_name":"Two"}'::jsonb),
  ('00000000-0000-4000-8000-000000000003', 'three@example.test', '{"full_name":"Three"}'::jsonb);

update public.plots set is_active = false where id = 'pioneer:hopper:south-outer:04';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$ select * from public.claim_plot(
    '10000000-0000-4000-8000-000000000001',
    'pioneer:jobs:north:01',
    'Founder One',
    '@Founder_One',
    'First Project',
    'https://one.example/',
    'website',
    'indie-garage-level-1',
    '#d1ad6e',
    '#f7e0a6', '#1b3a4b'
  ) $$,
  'first claim atomically creates its project and claim'
);
select results_eq(
  $$ select building_asset_id from public.plot_claims where owner_id = '00000000-0000-4000-8000-000000000001' $$,
  array['indie-garage-level-1'::text],
  'a founder can claim a plot with the Indie Garage'
);
select results_eq(
  $$ select count(*) from public.city_developments where owner_id = '00000000-0000-4000-8000-000000000001' $$,
  array[1::bigint],
  'the new development is publicly projected'
);
select results_eq(
  $$ select xp_total, building_level, current_level_xp, next_level_xp from public.city_developments where owner_id = '00000000-0000-4000-8000-000000000001' $$,
  $$ values (10, 1::smallint, 0, 100) $$,
  'new claims are publicly projected with the claim XP reward at level one'
);
select results_eq(
  $$ select x_handle from public.profiles where id = '00000000-0000-4000-8000-000000000001' $$,
  array['founder_one'::text],
  'X handles are stored lowercase without a leading at-sign'
);
select throws_ok(
  $$ select * from public.claim_plot(
    '10000000-0000-4000-8000-000000000002', 'pioneer:jobs:north:02', 'Founder One',
    'Founder_One', 'Second Project', 'https://two.example/', 'app',
    'corner-studio-level-1', '#e2775c',
    '#f7e0a6', '#1b3a4b'
  ) $$,
  'P0001',
  'user_already_has_plot',
  'one account cannot claim a second plot'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$ select * from public.claim_plot(
    '20000000-0000-4000-8000-000000000001', 'pioneer:jobs:north:01', 'Founder Two',
    'Founder_Two', 'Race Project', 'https://race.example/', 'website',
    'startup-building-level-1', '#5fa8d3',
    '#f7e0a6', '#1b3a4b'
  ) $$,
  'P0001',
  'plot_taken',
  'a second account cannot take an occupied plot'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$ select * from public.claim_plot(
    '30000000-0000-4000-8000-000000000099', 'pioneer:jobs:north:03', 'Founder Three',
    'Founder_Three', 'Unknown Building', 'https://unknown.example/', 'website',
    'unknown-building-level-1', '#7fa87a',
    '#f7e0a6', '#1b3a4b'
  ) $$,
  'P0001',
  'invalid_building',
  'unknown building assets remain rejected'
);
select throws_ok(
  $$ select * from public.claim_plot(
    '30000000-0000-4000-8000-000000000098', 'pioneer:jobs:north:03', 'Founder Three',
    'Founder_Three', 'Bad Billboard', 'https://badboard.example/', 'website',
    'startup-building-level-1', '#7fa87a',
    'wheat', '#1b3a4b'
  ) $$,
  'P0001',
  'invalid_building',
  'billboard colors outside the hex format are rejected'
);
select throws_ok(
  $$ select * from public.claim_plot(
    '30000000-0000-4000-8000-000000000001', 'pioneer:hopper:south-outer:04', 'Founder Three',
    'Founder_Three', 'Inactive Project', 'https://inactive.example/', 'website',
    'startup-building-level-1', '#7fa87a',
    '#f7e0a6', '#1b3a4b'
  ) $$,
  'P0001',
  'inactive_plot',
  'inactive plots cannot be claimed'
);

reset role;
insert into public.projects (id, owner_id, name, website_url, project_type)
values (
  '10000000-0000-4000-8000-000000000099',
  '00000000-0000-4000-8000-000000000001',
  'Later Project',
  'https://later.example/',
  'app'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$ select * from public.update_project(
    '10000000-0000-4000-8000-000000000001',
    'First Project Updated', 'https://updated.example/', 'chrome-extension',
    true
  ) $$,
  'an owner can update the currently showcased project'
);
select results_eq(
  $$ select building_asset_id from public.plot_claims where owner_id = '00000000-0000-4000-8000-000000000001' $$,
  array['indie-garage-level-1'::text],
  'the claimed building asset survives a project edit'
);
select results_eq(
  $$ select billboard_text_color, billboard_background_color from public.city_developments
     where owner_id = '00000000-0000-4000-8000-000000000001' $$,
  $$ values ('#f7e0a6'::text, '#1b3a4b'::text) $$,
  'billboard colors are exposed on the public projection'
);
select results_eq(
  $$ select project_name from public.city_developments where owner_id = '00000000-0000-4000-8000-000000000001' $$,
  array['First Project Updated'::text],
  'owner edits appear in the city projection'
);
select lives_ok(
  $$ select * from public.switch_claim_project('10000000-0000-4000-8000-000000000099') $$,
  'an owner can switch the project showcased by their permanent claim'
);
select results_eq(
  $$ select project_id from public.plot_claims where owner_id = '00000000-0000-4000-8000-000000000001' $$,
  array['10000000-0000-4000-8000-000000000099'::uuid],
  'switching changes only the showcased project'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$ select * from public.update_project(
    '10000000-0000-4000-8000-000000000099',
    'Stolen Project', 'https://stolen.example/', 'website',
    true
  ) $$,
  'P0001',
  'project_not_owned',
  'a non-owner cannot edit another founder project'
);
select throws_ok(
  $$ select * from public.switch_claim_project('10000000-0000-4000-8000-000000000099') $$,
  'P0001',
  'project_not_owned',
  'a founder cannot switch to another owner project'
);

reset role;
select results_eq(
  $$ select event_key, event_type, xp_delta from public.plot_xp_events where owner_id = '00000000-0000-4000-8000-000000000001' $$,
  $$ values ('plot_claim:00000000-0000-4000-8000-000000000001'::text, 'plot_claimed'::text, 10) $$,
  'claiming a plot records exactly one plot_claimed ledger event'
);
select results_eq(
  $$ select xp_total, building_level from public.award_plot_xp(
    '00000000-0000-4000-8000-000000000001', 89, 'test:xp:99', 'manual_award', null, '{}'::jsonb
  ) $$,
  $$ values (99, 1::smallint) $$,
  '99 XP keeps the building at level one'
);
select results_eq(
  $$ select xp_total, building_level, level_changed from public.award_plot_xp(
    '00000000-0000-4000-8000-000000000001', 1, 'test:xp:100', 'manual_award', null, '{}'::jsonb
  ) $$,
  $$ values (100, 2::smallint, true) $$,
  'reaching 100 XP upgrades the building to level two'
);
select results_eq(
  $$ select current_level_xp, next_level_xp from public.city_developments where owner_id = '00000000-0000-4000-8000-000000000001' $$,
  $$ values (100, 300) $$,
  'level two exposes its current and next XP thresholds'
);
select results_eq(
  $$ select applied, xp_total from public.award_plot_xp(
    '00000000-0000-4000-8000-000000000001', 1, 'test:xp:100', 'manual_award', null, '{}'::jsonb
  ) $$,
  $$ values (false, 100) $$,
  'retrying an identical event key does not award XP twice'
);
select throws_ok(
  $$ select * from public.award_plot_xp(
    '00000000-0000-4000-8000-000000000001', 2, 'test:xp:100', 'manual_award', null, '{}'::jsonb
  ) $$,
  'P0001',
  'xp_event_conflict',
  'an event key cannot be reused with different award data'
);
select results_eq(
  $$ select xp_total, building_level from public.award_plot_xp(
    '00000000-0000-4000-8000-000000000001', 200, 'test:xp:300', 'manual_award', null, '{}'::jsonb
  ) $$,
  $$ values (300, 3::smallint) $$,
  '300 XP upgrades the building to level three'
);
select results_eq(
  $$ select xp_total, building_level from public.award_plot_xp(
    '00000000-0000-4000-8000-000000000001', 400, 'test:xp:700', 'manual_award', null, '{}'::jsonb
  ) $$,
  $$ values (700, 4::smallint) $$,
  '700 XP upgrades the building to level four'
);
select results_eq(
  $$ select xp_total, building_level from public.award_plot_xp(
    '00000000-0000-4000-8000-000000000001', 800, 'test:xp:1500', 'manual_award', null, '{}'::jsonb
  ) $$,
  $$ values (1500, 5::smallint) $$,
  '1500 XP upgrades the building to level five'
);
select results_eq(
  $$ select current_level_xp, next_level_xp from public.city_developments where owner_id = '00000000-0000-4000-8000-000000000001' $$,
  $$ values (1500, null::integer) $$,
  'level five exposes its threshold with no next level'
);
select results_eq(
  $$ select xp_total, building_level from public.award_plot_xp(
    '00000000-0000-4000-8000-000000000001', 100, 'test:xp:1600', 'manual_award', null, '{}'::jsonb
  ) $$,
  $$ values (1600, 5::smallint) $$,
  'XP beyond the final milestone remains level five'
);
select results_eq(
  $$ select xp_total, building_level, level_changed from public.award_plot_xp(
    '00000000-0000-4000-8000-000000000001', -1000, 'test:xp:correction', 'correction', 'Correct an award', '{}'::jsonb
  ) $$,
  $$ values (600, 3::smallint, true) $$,
  'a compensating event can reduce XP and downgrade the building'
);
select throws_ok(
  $$ select * from public.award_plot_xp(
    '00000000-0000-4000-8000-000000000001', -700, 'test:xp:below-zero', 'correction', null, '{}'::jsonb
  ) $$,
  'P0001',
  'xp_total_below_zero',
  'a correction cannot reduce total XP below zero'
);
select throws_ok(
  $$ select * from public.award_plot_xp(
    '00000000-0000-4000-8000-000000000099', 10, 'test:xp:no-claim', 'manual_award', null, '{}'::jsonb
  ) $$,
  'P0001',
  'claim_not_found',
  'XP cannot be awarded to a founder without a plot'
);
select results_eq(
  $$ select count(*) from public.plot_xp_events where owner_id = '00000000-0000-4000-8000-000000000001' $$,
  array[8::bigint],
  'the ledger contains only successfully applied events'
);
select results_eq(
  $$ select xp_total, building_level from public.city_developments where owner_id = '00000000-0000-4000-8000-000000000001' $$,
  $$ values (600, 3::smallint) $$,
  'public city developments expose the current XP and level'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$ select * from public.switch_claim_project('10000000-0000-4000-8000-000000000001') $$,
  'a progressed founder can switch showcased projects'
);
select results_eq(
  $$ select xp_total, building_level from public.city_developments where owner_id = '00000000-0000-4000-8000-000000000001' $$,
  $$ values (600, 3::smallint) $$,
  'switching showcased projects preserves plot progression'
);

select * from finish();
rollback;
