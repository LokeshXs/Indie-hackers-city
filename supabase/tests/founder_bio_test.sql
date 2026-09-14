begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select has_column('public', 'profiles', 'bio', 'profiles store public bio');
select has_column('public', 'city_developments', 'bio', 'city view exposes bio');
insert into auth.users (id, email, raw_user_meta_data) values
 ('72000000-0000-4000-8000-000000000001', 'bio-one@example.test', '{"full_name":"Bio One"}'),
 ('72000000-0000-4000-8000-000000000002', 'bio-two@example.test', '{"full_name":"Bio Two"}');
set local role authenticated;
select set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000001', true);
select plot_id from public.claim_plot(
 '73000000-0000-4000-8000-000000000001',
 (select id from public.plots where is_active and id not in (select plot_id from public.plot_claims) order by id limit 1),
 'Bio One', 'bio_one', 'Bio Project', 'https://bio.example/', 'app', 'indie-garage-level-1', '#ffffff', '#163b3c'
);
select is((select bio from public.profiles where id = auth.uid()), null::text, 'bio defaults to null');
select lives_ok($$ update public.profiles set bio = repeat('🌱', 160) where id = auth.uid() $$, '160 Unicode code points fit');
select is((select bio from public.city_developments where owner_id = auth.uid()), repeat('🌱', 160), 'bio reaches city projection');
select throws_ok($$ update public.profiles set bio = repeat('🌱', 161) where id = auth.uid() $$, '23514', null, 'oversized bio rejected in database');
select lives_ok($$ update public.profiles set bio = 'Building tools' where id = auth.uid() $$, 'owner edits bio');
select is((select bio from public.update_plot_appearance('#ffffff', '#163b3c')), 'Building tools', 'view-returning RPC remains compatible');
select set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000002', true);
update public.profiles set bio = 'Not mine' where id = '72000000-0000-4000-8000-000000000001';
select is((select bio from public.profiles where id = '72000000-0000-4000-8000-000000000001'), 'Building tools', 'another founder cannot edit bio');
set local role anon;
select is((select bio from public.city_developments where owner_id = '72000000-0000-4000-8000-000000000001'), 'Building tools', 'anonymous visitors can read public bio');
update public.profiles set bio = 'Anonymous edit' where id = '72000000-0000-4000-8000-000000000001';
select is((select bio from public.profiles where id = '72000000-0000-4000-8000-000000000001'), 'Building tools', 'row security blocks anonymous profile edits');
reset role;
select * from finish();
rollback;
