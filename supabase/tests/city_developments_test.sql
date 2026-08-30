begin;

create extension if not exists pgtap with schema extensions;

select plan(27);

select has_table('public', 'plots', 'plots table exists');
select has_table('public', 'projects', 'projects table exists');
select has_table('public', 'plot_claims', 'plot claims table exists');
select has_view('public', 'city_developments', 'public city projection exists');
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
select ok(has_function_privilege('authenticated', 'public.claim_plot(uuid,text,text,text,text,text,text,text,text)', 'EXECUTE'), 'authenticated users can call claim RPC');
select ok(not has_function_privilege('anon', 'public.claim_plot(uuid,text,text,text,text,text,text,text,text)', 'EXECUTE'), 'anonymous users cannot call claim RPC');

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
    'startup-building-level-1',
    '#d1ad6e'
  ) $$,
  'first claim atomically creates its project and claim'
);
select results_eq(
  $$ select count(*) from public.city_developments where owner_id = '00000000-0000-4000-8000-000000000001' $$,
  array[1::bigint],
  'the new development is publicly projected'
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
    'corner-studio-level-1', '#e2775c'
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
    'startup-building-level-1', '#5fa8d3'
  ) $$,
  'P0001',
  'plot_taken',
  'a second account cannot take an occupied plot'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$ select * from public.claim_plot(
    '30000000-0000-4000-8000-000000000001', 'pioneer:hopper:south-outer:04', 'Founder Three',
    'Founder_Three', 'Inactive Project', 'https://inactive.example/', 'website',
    'startup-building-level-1', '#7fa87a'
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
  $$ select * from public.update_showcased_project(
    '10000000-0000-4000-8000-000000000001', 'Founder One Updated', 'Founder_One',
    'First Project Updated', 'https://updated.example/', 'chrome-extension',
    'corner-studio-level-1', '#9b8ac4'
  ) $$,
  'an owner can update the currently showcased project'
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
  $$ select * from public.update_showcased_project(
    '10000000-0000-4000-8000-000000000099', 'Intruder', 'Founder_Two',
    'Stolen Project', 'https://stolen.example/', 'website',
    'startup-building-level-1', '#d1ad6e'
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

select * from finish();
rollback;
