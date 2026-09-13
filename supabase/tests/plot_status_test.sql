begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_column('public', 'plot_claims', 'status_text', 'claims store optional status text');
select has_column('public', 'city_developments', 'status_text', 'the public view exposes status text');
select ok(not has_function_privilege('anon', 'public.update_plot_status(text)', 'EXECUTE'), 'anonymous callers cannot invoke status updates');
select ok(has_function_privilege('authenticated', 'public.update_plot_status(text)', 'EXECUTE'), 'authenticated callers can invoke status updates');
select ok(not has_column_privilege('authenticated', 'public.plot_claims', 'status_text', 'UPDATE'), 'direct table writes cannot bypass the unlock');

insert into auth.users (id, email, raw_user_meta_data) values
  ('70000000-0000-4000-8000-000000000001', 'status-one@example.test', '{"full_name":"Status One"}'),
  ('70000000-0000-4000-8000-000000000002', 'status-two@example.test', '{"full_name":"Status Two"}'),
  ('70000000-0000-4000-8000-000000000003', 'status-no-plot@example.test', '{"full_name":"No Plot"}');

set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000001', true);
select plot_id from public.claim_plot(
  '71000000-0000-4000-8000-000000000001',
  (select id from public.plots where is_active and id not in (select plot_id from public.plot_claims) order by id limit 1),
  'Status One', 'status_one', 'Status Project One', 'https://status-one.example/', 'app',
  'indie-garage-level-1', '#f7e0a6', '#1b3a4b'
);
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000002', true);
select plot_id from public.claim_plot(
  '71000000-0000-4000-8000-000000000002',
  (select id from public.plots where is_active and id not in (select plot_id from public.plot_claims) order by id limit 1),
  'Status Two', 'status_two', 'Status Project Two', 'https://status-two.example/', 'app',
  'indie-garage-level-1', '#f7e0a6', '#1b3a4b'
);
select is((select status_text from public.city_developments where owner_id = auth.uid()), null::text, 'new plots default to Online');

reset role;
update public.plot_claims set xp_total = 389 where owner_id = '70000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000001', true);
select throws_ok($$ select * from public.update_plot_status('Shipping') $$, 'P0001', 'reward_locked', '389 XP cannot configure status even through direct RPC');
select throws_ok($$ select * from public.update_plot_status(null) $$, 'P0001', 'reward_locked', 'reset cannot bypass the reward lock');

reset role;
update public.plot_claims set xp_total = 390 where owner_id = '70000000-0000-4000-8000-000000000001';
set local role authenticated;
select lives_ok($$ select * from public.update_plot_status('  Shipping today  ') $$, '390 XP unlocks custom status');
select is((select status_text from public.city_developments where owner_id = auth.uid()), 'Shipping today', 'the trimmed message persists in the public view');
select is((select status_text from public.plot_claims where owner_id = '70000000-0000-4000-8000-000000000002'), null::text, 'another founder is untouched');
select lives_ok($$ select * from public.update_plot_status(repeat('🚀', 40)) $$, '40 Unicode characters fit');
select throws_ok($$ select * from public.update_plot_status(repeat('🚀', 41)) $$, 'P0001', 'invalid_status', '41 Unicode characters are rejected');
select throws_ok($$ select * from public.update_plot_status(E'two\nlines') $$, 'P0001', 'invalid_status', 'newlines are rejected');
select throws_ok($$ select * from public.update_plot_status(E'two\rlines') $$, 'P0001', 'invalid_status', 'carriage returns are rejected');
select throws_ok($$ select * from public.update_plot_status('two' || chr(8232) || 'lines') $$, 'P0001', 'invalid_status', 'Unicode line separators are rejected');
select throws_ok($$ select * from public.update_plot_status('two' || chr(8233) || 'lines') $$, 'P0001', 'invalid_status', 'Unicode paragraph separators are rejected');
select is((select status_text from public.plot_claims where owner_id = auth.uid()), repeat('🚀', 40), 'failed updates preserve the saved message');
select lives_ok($$ select * from public.update_plot_status(E' \t\n ') $$, 'whitespace resets the status');
select is((select status_text from public.city_developments where owner_id = auth.uid()), null::text, 'reset persists null');
select lives_ok($$ select * from public.update_plot_status(null) $$, 'null also restores the default');
select lives_ok($$ select * from public.update_plot_status('<script>alert(1)</script>') $$, 'markup remains ordinary text');
select is((select status_text from public.city_developments where owner_id = auth.uid()), '<script>alert(1)</script>', 'plain text round-trips without modification');

-- Existing view-returning RPCs still work after appending the new column.
select is((select status_text from public.update_plot_appearance('#ffffff', '#163b3c')), '<script>alert(1)</script>', 'appearance updates return and preserve saved status');
reset role;
update public.plot_claims set xp_total = 389 where owner_id = '70000000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$ select * from public.update_plot_status('Replacement') $$, 'P0001', 'reward_locked', 'XP loss locks further edits');
select is((select status_text from public.city_developments where owner_id = auth.uid()), '<script>alert(1)</script>', 'XP loss retains the saved text for later re-unlock');
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000003', true);
select throws_ok($$ select * from public.update_plot_status('Shipping') $$, 'P0001', 'claim_not_found', 'a user without a plot cannot update anyone else');
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$ select * from public.update_plot_status('Shipping') $$, 'P0001', 'not_authenticated', 'the RPC itself rejects missing authentication');

select * from finish();
rollback;
