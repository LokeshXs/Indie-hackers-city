begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select has_table('public', 'plot_shares', 'shares table exists');
select ok(not has_table_privilege('authenticated', 'public.plot_shares', 'UPDATE'), 'clients cannot rewrite snapshots');
select ok(not has_function_privilege('anon', 'public.prepare_plot_share(uuid,text,timestamptz)', 'EXECUTE'), 'guests cannot prepare snapshots');
insert into auth.users (id, email, raw_user_meta_data) values
 ('72000000-0000-4000-8000-000000000001', 'share-one@example.test', '{"full_name":"Share One"}'),
 ('72000000-0000-4000-8000-000000000002', 'share-two@example.test', '{"full_name":"Share Two"}');
set local role authenticated;
select set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000001', true);
select plot_id from public.claim_plot(
 '73000000-0000-4000-8000-000000000001',
 (select id from public.plots where is_active and id not in (select plot_id from public.plot_claims) order by id limit 1),
 'Share One', 'share_one', 'Share Project', 'https://share-one.example/', 'app', 'indie-garage-level-1', '#f7e0a6', '#1b3a4b'
);
select throws_ok($$ select * from public.prepare_plot_share('74000000-0000-4000-8000-000000000001', 'morning', '2000-01-01') $$,
 'P0001', 'stale_share', 'outdated captures are rejected');
select throws_ok($$ select * from public.prepare_plot_share('74000000-0000-4000-8000-000000000001', 'invalid', now()) $$,
 'P0001', 'invalid_share', 'invalid lighting is rejected');
select lives_ok($$ select * from public.prepare_plot_share('74000000-0000-4000-8000-000000000001', 'night', (select updated_at from public.city_developments where owner_id = auth.uid())) $$,
 'the owner can reserve a share');
select is((select xp from public.plot_shares where id = '74000000-0000-4000-8000-000000000001'), 10, 'XP comes from the claim');
select is((select founder_name from public.plot_shares where id = '74000000-0000-4000-8000-000000000001'), 'Share One', 'identity comes from the profile');
select lives_ok($$ select * from public.prepare_plot_share('74000000-0000-4000-8000-000000000001', 'night', (select updated_at from public.city_developments where owner_id = auth.uid())) $$,
 'retrying the same request is idempotent');
select is((select count(*) from public.plot_shares where owner_id = auth.uid()), 1::bigint, 'retries do not create duplicates');
select throws_ok($$ select * from public.publish_plot_share('74000000-0000-4000-8000-000000000001') $$,
 'P0001', 'share_image_missing', 'a share cannot publish without its PNG');
select set_config('request.jwt.claim.sub', '', true);
set local role anon;
select is((select count(*) from public.plot_shares where id = '74000000-0000-4000-8000-000000000001'), 0::bigint, 'unfinished shares are private');
set local role authenticated;
select set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000002', true);
select throws_ok($$ select * from public.publish_plot_share('74000000-0000-4000-8000-000000000001') $$,
 'P0001', 'share_not_found', 'another user cannot publish the share');
select throws_ok($$ select * from public.prepare_plot_share('74000000-0000-4000-8000-000000000001', 'night', now()) $$,
 'P0001', 'share_conflict', 'another user cannot reuse the owner request id');
select throws_ok($$ insert into storage.objects(bucket_id,name) values ('plot-shares','72000000-0000-4000-8000-000000000001/74000000-0000-4000-8000-000000000001.png') $$,
 '42501', null, 'another user cannot upload the owner PNG');
select set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000001', true);
select lives_ok($$ insert into storage.objects(bucket_id,name) values ('plot-shares','72000000-0000-4000-8000-000000000001/74000000-0000-4000-8000-000000000001.png') $$,
 'the owner can upload to their reserved path');
select lives_ok($$ select * from public.publish_plot_share('74000000-0000-4000-8000-000000000001') $$, 'the uploaded snapshot can be published');
select lives_ok($$ select * from public.publish_plot_share('74000000-0000-4000-8000-000000000001') $$, 'publication can be retried');
select throws_ok($$ update public.plot_shares set xp = 999999 where id = '74000000-0000-4000-8000-000000000001' $$,
 '42501', null, 'even the owner cannot alter a published snapshot');
update storage.objects set name = 'replacement.png' where bucket_id = 'plot-shares';
select is((select name from storage.objects where bucket_id = 'plot-shares' and name like '%74000000-0000-4000-8000-000000000001.png'),
 '72000000-0000-4000-8000-000000000001/74000000-0000-4000-8000-000000000001.png', 'published image paths cannot be changed');
select set_config('request.jwt.claim.sub', '', true);
set local role anon;
select is((select count(*) from public.plot_shares where id = '74000000-0000-4000-8000-000000000001'), 1::bigint, 'published metadata is readable without authentication');
reset role;
update public.plot_claims set xp_total = 390 where owner_id = '72000000-0000-4000-8000-000000000001';
update public.profiles set full_name = 'Updated Founder' where id = '72000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000001', true);
select is((select xp from public.plot_shares where id = '74000000-0000-4000-8000-000000000001'), 10, 'old shares retain old XP');
select is((select founder_name from public.plot_shares where id = '74000000-0000-4000-8000-000000000001'), 'Share One', 'old shares retain old identity');
select lives_ok($$ select * from public.prepare_plot_share('74000000-0000-4000-8000-000000000002', 'morning', (select updated_at from public.city_developments where owner_id = auth.uid())) $$,
 'a later share creates a fresh snapshot');
select is((select xp from public.plot_shares where id = '74000000-0000-4000-8000-000000000002'), 390, 'a later snapshot uses latest XP');
select is((select founder_name from public.plot_shares where id = '74000000-0000-4000-8000-000000000002'), 'Updated Founder', 'a later snapshot uses latest identity');
select * from finish();
rollback;
