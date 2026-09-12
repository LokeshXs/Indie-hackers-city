-- Multi-project + achievements, now that achievements are claims rather than awards. Kept in its
-- own file so the XP arithmetic chain in city_developments_test.sql keeps its own plan count and
-- never has to be renumbered.

begin;

create extension if not exists pgtap with schema extensions;

select plan(151);

-- ---------------------------------------------------------------- structure

select has_table('public', 'achievement_definitions', 'achievement catalog exists');
select has_table('public', 'project_achievements', 'awarded achievements table exists');
select has_table('public', 'achievement_reviews', 'the decision log exists');

select results_eq(
  $$ select achievement_type, group_key, tier, scope, xp_reward
       from public.achievement_definitions order by sort_order $$,
  $$ values ('product_launched'::text, 'launch'::text, 1::smallint, 'project'::text, 100),
            ('users_10'::text,         'users'::text,   1::smallint, 'project'::text,   5),
            ('users_50'::text,         'users'::text,   2::smallint, 'project'::text,  25),
            ('users_100'::text,        'users'::text,   3::smallint, 'project'::text,  50),
            ('revenue_10'::text,       'revenue'::text, 1::smallint, 'founder'::text,  50),
            ('revenue_100'::text,      'revenue'::text, 2::smallint, 'founder'::text, 150) $$,
  'revenue is founder-scoped; launch and users stay per project'
);

select col_default_is(
  'public', 'project_achievements', 'status', 'pending',
  'a filed claim starts pending, not approved'
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

-- The decision log names the staff who made each call, so it is as unreadable to the browser as
-- the XP ledger is.
select ok(not has_table_privilege('authenticated', 'public.achievement_reviews', 'SELECT'), 'clients cannot read who approved what');
select ok(not has_table_privilege('anon', 'public.achievement_reviews', 'SELECT'), 'anon cannot read the decision log');

select ok(not has_table_privilege('authenticated', 'public.projects', 'INSERT'), 'clients still cannot insert projects directly');
select ok(not has_table_privilege('authenticated', 'public.plot_xp_events', 'SELECT'), 'clients still cannot read the XP ledger');

select ok(has_function_privilege('authenticated', 'public.create_project(uuid, text, text, text, boolean, text, text)', 'EXECUTE'), 'founders can create projects');
select ok(not has_function_privilege('anon', 'public.create_project(uuid, text, text, text, boolean, text, text)', 'EXECUTE'), 'anon cannot create projects');
select ok(has_function_privilege('authenticated', 'public.update_project(uuid, text, text, text, boolean)', 'EXECUTE'), 'founders can update projects');
select ok(has_function_privilege('authenticated', 'public.record_achievement(text, uuid, text, text, text)', 'EXECUTE'), 'founders can file achievement claims');
select ok(not has_function_privilege('anon', 'public.record_achievement(text, uuid, text, text, text)', 'EXECUTE'), 'anon cannot file claims');
select ok(has_function_privilege('authenticated', 'public.update_plot_appearance(text, text)', 'EXECUTE'), 'founders can restyle their plot');
select ok(not has_function_privilege('authenticated', 'public.apply_project_achievement(uuid, uuid, text, text, text, text)', 'EXECUTE'), 'the private applier is unreachable by clients');

-- The whole point of the gate: deciding a claim is service-role work. A founder holding only an
-- `authenticated` JWT cannot reach any of it, which is what stops them approving themselves.
select ok(not has_function_privilege('authenticated', 'public.approve_achievement(bigint, uuid, text)', 'EXECUTE'), 'founders cannot approve their own claims');
select ok(not has_function_privilege('anon', 'public.approve_achievement(bigint, uuid, text)', 'EXECUTE'), 'anon cannot approve claims');
select ok(not has_function_privilege('authenticated', 'public.reject_achievement(bigint, uuid, text)', 'EXECUTE'), 'founders cannot reject claims');
select ok(not has_function_privilege('authenticated', 'public.revoke_achievement(bigint, uuid, text)', 'EXECUTE'), 'founders cannot revoke awards');
select ok(not has_function_privilege('authenticated', 'public.assert_reviewer()', 'EXECUTE'), 'the reviewer gate itself is unreachable by clients');
select ok(has_function_privilege('service_role', 'public.approve_achievement(bigint, uuid, text)', 'EXECUTE'), 'the console can approve');
select ok(has_function_privilege('service_role', 'public.reject_achievement(bigint, uuid, text)', 'EXECUTE'), 'the console can reject');
select ok(has_function_privilege('service_role', 'public.revoke_achievement(bigint, uuid, text)', 'EXECUTE'), 'the console can revoke');

-- ---------------------------------------------------------------- fixtures

insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-4000-8000-000000000001', 'one@example.test', '{"full_name":"One"}'::jsonb),
  ('00000000-0000-4000-8000-000000000002', 'two@example.test', '{"full_name":"Two"}'::jsonb),
  ('00000000-0000-4000-8000-0000000000ad', 'admin@example.test', '{"full_name":"Admin"}'::jsonb);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$ select * from public.claim_plot(
    '10000000-0000-4000-8000-000000000001', 'pioneer:jobs:north:01',
    'Founder One', '@Founder_One', 'First Project', 'https://one.example/', 'website',
    'indie-garage-level-1', '#f7e0a6', '#1b3a4b'
  ) $$,
  'founder one claims a plot'
);

-- Rule 2: the claim bonus is not gated. A founder who has just signed up is at 10 XP immediately.
select results_eq(
  $$ select xp_total from public.plot_claims where owner_id = '00000000-0000-4000-8000-000000000001' $$,
  array[10],
  'claiming a plot still awards its 10 XP instantly'
);

-- ---------------------------------------------------------------- create_project files a claim

select lives_ok(
  $$ select * from public.create_project(
    '10000000-0000-4000-8000-000000000002',
    'Second Product', 'https://two.example/', 'app', false
  ) $$,
  'a founder can create a second project'
);
select results_eq(
  $$ select xp_total from public.plot_claims where owner_id = '00000000-0000-4000-8000-000000000001' $$,
  array[10],
  'creating a project no longer awards XP on its own'
);
select results_eq(
  $$ select achievement_type, xp_awarded, status from public.project_achievements
     where project_id = '10000000-0000-4000-8000-000000000002' $$,
  $$ values ('product_launched'::text, 100, 'pending'::text) $$,
  'the launch is filed as a pending claim against the new project'
);
reset role;
select is_empty(
  $$ select event_key from public.plot_xp_events
     where event_key = 'achievement:product_launched:10000000-0000-4000-8000-000000000002' $$,
  'a pending claim writes no ledger event'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);

-- ---------------------------------------------------------------- record_achievement

select throws_ok(
  $$ select * from public.record_achievement('product_launched', '10000000-0000-4000-8000-000000000002', 'https://proof.example/evidence') $$,
  'P0001', 'achievement_already_claimed',
  'a rung already sitting in the queue cannot be filed twice'
);

-- The claim_plot project never received one, so it stays claimable.
select results_eq(
  $$ select status, xp_pending, xp_total
       from public.record_achievement('product_launched', '10000000-0000-4000-8000-000000000001', 'https://proof.example/evidence') $$,
  $$ values ('pending'::text, 100, 10) $$,
  'filing reports what approval would grant, and leaves the total alone'
);

-- Rule 1: submission records ONE rung. The cascade is the reviewer's business, not the filer's.
select results_eq(
  $$ select status, xp_pending from public.record_achievement('revenue_100', null, 'https://proof.example/revenue') $$,
  $$ values ('pending'::text, 200) $$,
  'xp_pending counts the rungs beneath the one filed'
);
select results_eq(
  $$ select count(*) from public.project_achievements
      where owner_id = '00000000-0000-4000-8000-000000000001' and achievement_type like 'revenue_%' $$,
  array[1::bigint],
  'filing the top revenue rung records only that rung'
);
select throws_ok(
  $$ select * from public.record_achievement('revenue_100', null, 'https://proof.example/revenue') $$,
  'P0001', 'achievement_already_claimed',
  'the same claim cannot be filed twice while it waits'
);
select throws_ok(
  $$ select * from public.record_achievement('made_up_thing', '10000000-0000-4000-8000-000000000001', 'https://proof.example/evidence') $$,
  'P0001', 'invalid_achievement',
  'an unknown achievement type is rejected'
);
select results_eq(
  $$ select xp_total from public.plot_claims where owner_id = '00000000-0000-4000-8000-000000000001' $$,
  array[10],
  'three filed claims have moved no XP at all'
);

-- ---------------------------------------------------------------- approval

reset role;

select results_eq(
  $$ select approved_count, xp_awarded, xp_total from public.approve_achievement(
       (select id from public.project_achievements
         where achievement_type = 'product_launched'
           and project_id = '10000000-0000-4000-8000-000000000001'),
       '00000000-0000-4000-8000-0000000000ad', 'Live URL checked'
     ) $$,
  $$ values (1, 100, 110) $$,
  'approving a launch grants its XP'
);
select results_eq(
  $$ select event_key, event_type from public.plot_xp_events
     where event_key = 'achievement:product_launched:10000000-0000-4000-8000-000000000001' $$,
  $$ values ('achievement:product_launched:10000000-0000-4000-8000-000000000001'::text,
             'product_launched'::text) $$,
  'the ledger event uses the derived achievement key'
);
select results_eq(
  $$ select decision, xp_delta, reviewer_label, note from public.achievement_reviews
      where achievement_type = 'product_launched'
        and owner_id = '00000000-0000-4000-8000-000000000001' $$,
  $$ values ('approved'::text, 100, 'admin@example.test'::text, 'Live URL checked'::text) $$,
  'the decision is logged against the reviewer who made it'
);

select throws_ok(
  $$ select * from public.approve_achievement(
       (select id from public.project_achievements
         where achievement_type = 'product_launched'
           and project_id = '10000000-0000-4000-8000-000000000001'),
       '00000000-0000-4000-8000-0000000000ad', null
     ) $$,
  'P0001', 'achievement_not_pending',
  'an approved claim cannot be approved a second time'
);

-- The cascade, at approval: revenue_100 drags revenue_10 up with it, 150 + 50.
select results_eq(
  $$ select approved_count, xp_awarded, xp_total from public.approve_achievement(
       (select id from public.project_achievements
         where achievement_type = 'revenue_100'
           and owner_id = '00000000-0000-4000-8000-000000000001'),
       '00000000-0000-4000-8000-0000000000ad', null
     ) $$,
  $$ values (2, 200, 310) $$,
  'approving a rung also grants every rung below it'
);
select results_eq(
  $$ select achievement_type, project_id, status from public.project_achievements
      where owner_id = '00000000-0000-4000-8000-000000000001' and achievement_type like 'revenue_%'
      order by achievement_type $$,
  $$ values ('revenue_10'::text, null::uuid, 'approved'::text),
            ('revenue_100'::text, null::uuid, 'approved'::text) $$,
  'the rung nobody filed is recorded as approved, attached to no project'
);
select results_eq(
  $$ select count(*) from public.plot_xp_events
     where owner_id = '00000000-0000-4000-8000-000000000001'
       and event_key like 'achievement:revenue_%' $$,
  array[2::bigint],
  'the cascade writes one ledger event per rung'
);

select lives_ok(
  $$ select * from public.approve_achievement(
       (select id from public.project_achievements
         where achievement_type = 'product_launched'
           and project_id = '10000000-0000-4000-8000-000000000002'),
       '00000000-0000-4000-8000-0000000000ad', null
     ) $$,
  'the second launch is approved too'
);
select results_eq(
  $$ select xp_total from public.plot_claims where owner_id = '00000000-0000-4000-8000-000000000001' $$,
  array[410],
  'two launches and the revenue ladder total 410'
);

-- ---------------------------------------------------------------- cascading users rungs

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$ select * from public.record_achievement('users_100', '10000000-0000-4000-8000-000000000001', 'https://proof.example/evidence') $$,
  'the founder files 100+ users on their first project'
);
reset role;
select results_eq(
  $$ select approved_count, xp_awarded, xp_total, level_changed from public.approve_achievement(
       (select id from public.project_achievements
         where achievement_type = 'users_100'
           and project_id = '10000000-0000-4000-8000-000000000001'),
       '00000000-0000-4000-8000-0000000000ad', null
     ) $$,
  $$ values (3, 80, 490, true) $$,
  'all three users rungs land at once and carry the building to level two'
);
select results_eq(
  $$ select building_level from public.plot_claims where owner_id = '00000000-0000-4000-8000-000000000001' $$,
  array[2::smallint],
  'the derived level follows the milestone ladder'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$ select * from public.record_achievement('users_50', '10000000-0000-4000-8000-000000000001', 'https://proof.example/evidence') $$,
  'P0001', 'achievement_already_claimed',
  'a lower rung is refused once the cascade has granted it'
);

-- The partial case: one rung already approved on the second project, so only the two above it pay.
select lives_ok(
  $$ select * from public.record_achievement('users_10', '10000000-0000-4000-8000-000000000002', 'https://proof.example/evidence') $$,
  'a single low rung is filed against the second project'
);
reset role;
select results_eq(
  $$ select approved_count, xp_awarded, xp_total from public.approve_achievement(
       (select id from public.project_achievements
         where achievement_type = 'users_10'
           and project_id = '10000000-0000-4000-8000-000000000002'),
       '00000000-0000-4000-8000-0000000000ad', null
     ) $$,
  $$ values (1, 5, 495) $$,
  'a single low rung awards only itself'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$ select * from public.record_achievement('users_100', '10000000-0000-4000-8000-000000000002', 'https://proof.example/evidence') $$,
  'the top rung is filed on a project that already holds the lowest'
);
reset role;
select results_eq(
  $$ select approved_count, xp_awarded, xp_total from public.approve_achievement(
       (select id from public.project_achievements
         where achievement_type = 'users_100'
           and project_id = '10000000-0000-4000-8000-000000000002'),
       '00000000-0000-4000-8000-0000000000ad', null
     ) $$,
  $$ values (2, 75, 570) $$,
  'the cascade skips rungs already approved and grants only the remainder'
);
select results_eq(
  $$ select count(*) from public.plot_xp_events
      where event_key like 'achievement:users_%:10000000-0000-4000-8000-000000000002' $$,
  array[3::bigint],
  'a partial cascade writes three ledger events for three rungs, never four'
);

-- ---------------------------------------------------------------- revocation

select results_eq(
  $$ select revoked_type, xp_removed, xp_total from public.revoke_achievement(
       (select id from public.project_achievements
         where achievement_type = 'users_100'
           and project_id = '10000000-0000-4000-8000-000000000002'),
       '00000000-0000-4000-8000-0000000000ad', 'Could not verify the number'
     ) $$,
  $$ values ('users_100'::text, 50, 520) $$,
  'revoking an award takes its XP back out'
);
select results_eq(
  $$ select xp_delta, event_type from public.plot_xp_events
      where event_key = 'correction:achievement:users_100:10000000-0000-4000-8000-000000000002:1' $$,
  $$ values (-50, 'correction'::text) $$,
  'the reversal is a compensating event under a new key, not a deletion'
);
select results_eq(
  $$ select count(*) from public.plot_xp_events
      where event_key = 'achievement:users_100:10000000-0000-4000-8000-000000000002' $$,
  array[1::bigint],
  'the original ledger row survives the revocation'
);
select results_eq(
  $$ select status from public.project_achievements
      where achievement_type = 'users_100' and project_id = '10000000-0000-4000-8000-000000000002' $$,
  array['rejected'::text],
  'a revoked award reads as rejected, so the founder can file it again'
);
select throws_ok(
  $$ select * from public.revoke_achievement(
       (select id from public.project_achievements
         where achievement_type = 'users_100'
           and project_id = '10000000-0000-4000-8000-000000000002'),
       '00000000-0000-4000-8000-0000000000ad', null
     ) $$,
  'P0001', 'achievement_not_approved',
  'the same award cannot be revoked twice'
);

-- Re-filing after a revocation has to pay again, which is the case a reused ledger key would
-- silently swallow.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$ select * from public.record_achievement('users_100', '10000000-0000-4000-8000-000000000002', 'https://proof.example/evidence') $$,
  'a revoked rung can be filed again'
);
select results_eq(
  $$ select status from public.project_achievements
      where achievement_type = 'users_100' and project_id = '10000000-0000-4000-8000-000000000002' $$,
  array['pending'::text],
  're-filing reopens the existing row rather than creating a second one'
);
reset role;
select results_eq(
  $$ select approved_count, xp_awarded, xp_total from public.approve_achievement(
       (select id from public.project_achievements
         where achievement_type = 'users_100'
           and project_id = '10000000-0000-4000-8000-000000000002'),
       '00000000-0000-4000-8000-0000000000ad', null
     ) $$,
  $$ values (1, 50, 570) $$,
  're-approval grants the XP again under a fresh ledger key'
);
select results_eq(
  $$ select xp_delta from public.plot_xp_events
      where event_key = 'achievement:users_100:10000000-0000-4000-8000-000000000002:reapproved:1' $$,
  array[50],
  'the second approval writes its own event instead of colliding with the first'
);

-- ---------------------------------------------------------------- rejection and resubmission

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$ select * from public.record_achievement('users_10', '10000000-0000-4000-8000-000000000001', 'https://proof.example/evidence') $$,
  'P0001', 'claim_not_found',
  'a user without a plot cannot file claims at all'
);
select lives_ok(
  $$ select * from public.claim_plot(
    '10000000-0000-4000-8000-000000000200', 'pioneer:jobs:north:02',
    'Founder Two', '@Founder_Two', 'Their Project', 'https://theirs.example/', 'website',
    'startup-building-level-1', '#f7e0a6', '#1b3a4b'
  ) $$,
  'founder two claims a plot'
);
select results_eq(
  $$ select status, xp_pending from public.record_achievement('revenue_100', null, 'https://proof.example/revenue') $$,
  $$ values ('pending'::text, 200) $$,
  'founder-scoped rungs are per founder, not global to the city'
);

reset role;
select results_eq(
  $$ select rejected_type, xp_total from public.reject_achievement(
       (select id from public.project_achievements
         where achievement_type = 'revenue_100'
           and owner_id = '00000000-0000-4000-8000-000000000002'),
       '00000000-0000-4000-8000-0000000000ad', 'No evidence supplied'
     ) $$,
  $$ values ('revenue_100'::text, 10) $$,
  'rejecting moves no XP'
);
select is_empty(
  $$ select event_key from public.plot_xp_events
      where owner_id = '00000000-0000-4000-8000-000000000002'
        and event_key like 'achievement:%' $$,
  'a rejected claim leaves the ledger untouched'
);
select results_eq(
  $$ select count(*) from public.project_achievements
      where owner_id = '00000000-0000-4000-8000-000000000002' and achievement_type = 'revenue_10' $$,
  array[0::bigint],
  'rejecting the top rung does not quietly grant the one below it'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
select results_eq(
  $$ select status, xp_pending from public.record_achievement('revenue_100', null, 'https://proof.example/revenue') $$,
  $$ values ('pending'::text, 200) $$,
  'a rejected rung can be filed again when the founder genuinely reaches it'
);
reset role;
select results_eq(
  $$ select decision from public.achievement_reviews
      where owner_id = '00000000-0000-4000-8000-000000000002' order by id $$,
  $$ values ('rejected'::text), ('reopened'::text) $$,
  'the rejection survives in the log even though the row went back to pending'
);
select results_eq(
  $$ select approved_count, xp_awarded, xp_total from public.approve_achievement(
       (select id from public.project_achievements
         where achievement_type = 'revenue_100'
           and owner_id = '00000000-0000-4000-8000-000000000002'),
       '00000000-0000-4000-8000-0000000000ad', null
     ) $$,
  $$ values (2, 200, 210) $$,
  'the resubmitted claim approves normally'
);

select throws_ok(
  $$ select * from public.approve_achievement(999999, '00000000-0000-4000-8000-0000000000ad', null) $$,
  'P0001', 'achievement_not_found',
  'approving a claim that does not exist is refused'
);

-- ---------------------------------------------------------------- ownership and the project cap

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
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

-- Eight filler projects each filed a pending launch and none of them paid. This is the change the
-- whole migration exists for: the old ceiling was the project cap times 180.
select results_eq(
  $$ select xp_total from public.plot_claims where owner_id = '00000000-0000-4000-8000-000000000001' $$,
  array[570],
  'filling the project cap mints no XP while the claims sit unreviewed'
);
select results_eq(
  $$ select count(*) from public.project_achievements
      where owner_id = '00000000-0000-4000-8000-000000000001' and status = 'pending' $$,
  array[8::bigint],
  'the eight unreviewed launches are waiting in the queue instead'
);

select results_eq(
  $$ select count(*) from public.city_developments where owner_id = '00000000-0000-4000-8000-000000000001' $$,
  array[1::bigint],
  'the city projection stays one row per founder however many projects they own'
);

-- ---------------------------------------------------------------- reward announcement

select ok(has_function_privilege('authenticated', 'public.reward_announcement()', 'EXECUTE'), 'founders can read their own announcement');
select ok(not has_function_privilege('anon', 'public.reward_announcement()', 'EXECUTE'), 'anon has no announcement to read');
select ok(has_function_privilege('authenticated', 'public.acknowledge_rewards()', 'EXECUTE'), 'founders can mark rewards seen');

-- Every statement in a pgTAP file shares one transaction, so `now()` -- and therefore every
-- `plot_xp_events.created_at` -- is identical throughout. The window is `created_at >
-- rewards_seen_at`, so the watermark has to be moved by hand to stand in for "the founder looked at
-- some earlier point". In production the claim, the approval and the acknowledgement are three
-- separate transactions and the timestamps order themselves.
--
-- As postgres: `authenticated` has no UPDATE on plot_claims, which is the point.
reset role;
update public.plot_claims
   set rewards_seen_at = timestamptz '2020-01-01'
 where owner_id = '00000000-0000-4000-8000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);

-- Founder two has had revenue_100 approved, 200 XP across two rungs, on top of a 10 XP claim.
select results_eq(
  $$ select xp_gained, previous_xp_total, xp_total, level_changed from public.reward_announcement() $$,
  $$ values (200, 10, 210, false) $$,
  'the announcement reports what landed since the founder last looked'
);

-- The signup bonus has its own celebration, so it must never appear here.
select results_eq(
  $$ select count(*) from jsonb_array_elements(
       (select achievements from public.reward_announcement())) $$,
  array[2::bigint],
  'both approved rungs are named, and the plot-claim bonus is not among them'
);
select results_eq(
  $$ select previous_xp_total from public.reward_announcement() $$,
  array[10],
  'the previous total is the 10 XP claim bonus, which the window excludes'
);

-- Reading is not acknowledging: a refresh mid-animation has to show the same news again.
select results_eq(
  $$ select xp_gained from public.reward_announcement() $$,
  array[200],
  'reading the announcement twice returns it twice'
);

select lives_ok(
  $$ select public.acknowledge_rewards() $$,
  'the founder can mark the announcement delivered'
);
select is_empty(
  $$ select xp_gained from public.reward_announcement() $$,
  'an acknowledged announcement does not come back'
);

-- A revocation is not something to congratulate anyone on. With both rungs taken back the window
-- nets to zero, and zero is not news.
reset role;
select lives_ok(
  $$ select * from public.revoke_achievement(
       (select id from public.project_achievements
         where achievement_type = 'revenue_100'
           and owner_id = '00000000-0000-4000-8000-000000000002'),
       '00000000-0000-4000-8000-0000000000ad', 'Withdrawn') $$,
  'the top revenue award is taken back'
);
select lives_ok(
  $$ select * from public.revoke_achievement(
       (select id from public.project_achievements
         where achievement_type = 'revenue_10'
           and owner_id = '00000000-0000-4000-8000-000000000002'),
       '00000000-0000-4000-8000-0000000000ad', 'Withdrawn') $$,
  'and so is the rung beneath it'
);
select results_eq(
  $$ select xp_total from public.plot_claims where owner_id = '00000000-0000-4000-8000-000000000002' $$,
  array[10],
  'the founder is back to their claim bonus alone'
);

update public.plot_claims
   set rewards_seen_at = timestamptz '2020-01-01'
 where owner_id = '00000000-0000-4000-8000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
select is_empty(
  $$ select xp_gained from public.reward_announcement() $$,
  'a window that nets to nothing announces nothing'
);

-- A signed-in user with no plot has nothing to announce, and that is not an error.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
select is_empty(
  $$ select xp_gained from public.reward_announcement() $$,
  'a signed-in user with no plot gets an empty announcement rather than a failure'
);

-- ---------------------------------------------------------------- evidence

select has_table('public', 'achievement_evidence', 'the evidence table exists');

-- The reason it is a separate table at all: project_achievements is world-readable, and a revenue
-- screenshot sitting there would be public.
select ok(not has_table_privilege('anon', 'public.achievement_evidence', 'SELECT'), 'evidence is not public');
select ok(has_table_privilege('authenticated', 'public.achievement_evidence', 'SELECT'), 'a founder can read their own evidence');
select ok(not has_table_privilege('authenticated', 'public.achievement_evidence', 'INSERT'), 'clients cannot write evidence directly');
select ok(not has_table_privilege('authenticated', 'public.achievement_evidence', 'UPDATE'), 'clients cannot edit evidence directly');
select ok(not has_function_privilege('authenticated', 'public.record_site_verification(uuid, text, boolean)', 'EXECUTE'), 'founders cannot mark their own site verified');
select ok(has_function_privilege('service_role', 'public.record_site_verification(uuid, text, boolean)', 'EXECUTE'), 'the console can record a site check');

-- Every rung states what it wants, in its own words.
select is_empty(
  $$ select achievement_type from public.achievement_definitions
      where char_length(trim(evidence_prompt)) = 0 or char_length(trim(evidence_hint)) = 0 $$,
  'every rung carries an evidence prompt and a note explaining what is needed'
);
select results_eq(
  $$ select evidence_prompt from public.achievement_definitions where achievement_type = 'revenue_100' $$,
  array['Show $100+ earned in total'::text],
  'the revenue prompt asks for the lifetime figure'
);
select ok(
  (select evidence_hint like '%Dodo Payments%' from public.achievement_definitions
    where achievement_type = 'revenue_10'),
  'the payment providers named include Dodo Payments'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);

-- The requirement itself.
select throws_ok(
  $$ select * from public.record_achievement('users_50', '10000000-0000-4000-8000-000000000200') $$,
  'P0001', 'evidence_required',
  'a claim with neither a link nor a file is refused'
);
select throws_ok(
  $$ select * from public.record_achievement(
       'users_50', '10000000-0000-4000-8000-000000000200', null, null, 'trust me') $$,
  'P0001', 'evidence_required',
  'a note on its own is the claim restated, not evidence for it'
);
select throws_ok(
  $$ select * from public.record_achievement(
       'users_50', '10000000-0000-4000-8000-000000000200', 'not-a-url') $$,
  'P0001', 'invalid_evidence',
  'a link has to be a link'
);

-- An upload is confined to the founder's own folder by the storage policy; recording a path outside
-- it is refused too, so a claim can never point at somebody else's screenshot.
select throws_ok(
  $$ select * from public.record_achievement(
       'users_50', '10000000-0000-4000-8000-000000000200',
       null, '00000000-0000-4000-8000-000000000001/stolen.png') $$,
  'P0001', 'invalid_evidence',
  'a claim cannot cite a file in another founder-s folder'
);

select lives_ok(
  $$ select * from public.record_achievement(
       'users_50', '10000000-0000-4000-8000-000000000200',
       'https://dash.example/users', '00000000-0000-4000-8000-000000000002/users.png',
       'Signups tab, filtered to confirmed accounts') $$,
  'a claim with a link, a file and a note is accepted'
);
select results_eq(
  $$ select evidence.link, evidence.file_path, evidence.note
       from public.achievement_evidence as evidence
       join public.project_achievements as claims on claims.id = evidence.achievement_id
      where claims.achievement_type = 'users_50'
        and claims.project_id = '10000000-0000-4000-8000-000000000200' $$,
  $$ values ('https://dash.example/users'::text,
             '00000000-0000-4000-8000-000000000002/users.png'::text,
             'Signups tab, filtered to confirmed accounts'::text) $$,
  'the evidence is stored against the claim'
);

-- Creating a project files a launch claim, and a live product is its own evidence.
select lives_ok(
  $$ select * from public.create_project(
    '10000000-0000-4000-8000-000000000777',
    'Evidence Product', 'https://evidence.example/', 'website', false
  ) $$,
  'creating a project needs no separate evidence'
);
select results_eq(
  $$ select evidence.link from public.achievement_evidence as evidence
       join public.project_achievements as claims on claims.id = evidence.achievement_id
      where claims.project_id = '10000000-0000-4000-8000-000000000777' $$,
  array['https://evidence.example/'::text],
  'the launch claim falls back to the product-s own URL'
);
select lives_ok(
  $$ select * from public.create_project(
    '10000000-0000-4000-8000-000000000778',
    'Posted Product', 'https://posted.example/', 'website', false,
    'https://news.ycombinator.com/item?id=1', 'Front page for a day'
  ) $$,
  'a founder can point at a launch post instead'
);
select results_eq(
  $$ select evidence.link, evidence.note from public.achievement_evidence as evidence
       join public.project_achievements as claims on claims.id = evidence.achievement_id
      where claims.project_id = '10000000-0000-4000-8000-000000000778' $$,
  $$ values ('https://news.ycombinator.com/item?id=1'::text, 'Front page for a day'::text) $$,
  'the launch post is what gets recorded when one is given'
);

-- Every project is born with a token to put on its site, and unverified.
select results_eq(
  $$ select verified_at is null, verification_token ~ '^[0-9a-f]{32}$'
       from public.projects where id = '10000000-0000-4000-8000-000000000777' $$,
  $$ values (true, true) $$,
  'a new project carries a verification token and is not yet verified'
);
select results_eq(
  $$ select count(*) = count(distinct verification_token) from public.projects $$,
  array[true],
  'every project gets its own token'
);

reset role;
select lives_ok(
  $$ select * from public.record_site_verification(
       '10000000-0000-4000-8000-000000000777', 'https://evidence.example/', true) $$,
  'the console records a successful site check'
);
select results_eq(
  $$ select verified_url from public.projects where id = '10000000-0000-4000-8000-000000000777' $$,
  array['https://evidence.example/'::text],
  'the verified URL is stored alongside the timestamp'
);
select lives_ok(
  $$ select * from public.record_site_verification(
       '10000000-0000-4000-8000-000000000777', 'https://evidence.example/', false) $$,
  'a later failed check clears it again'
);
select results_eq(
  $$ select verified_at is null, verified_url is null from public.projects
      where id = '10000000-0000-4000-8000-000000000777' $$,
  $$ values (true, true) $$,
  'a site that stops carrying the tag stops counting as verified'
);

-- Re-filing after a rejection replaces the evidence rather than stacking another row beside it.
reset role;
select lives_ok(
  $$ select * from public.reject_achievement(
       (select id from public.project_achievements
         where achievement_type = 'users_50'
           and project_id = '10000000-0000-4000-8000-000000000200'),
       '00000000-0000-4000-8000-0000000000ad', 'Screenshot was cropped') $$,
  'the users_50 claim is turned down'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$ select * from public.record_achievement(
       'users_50', '10000000-0000-4000-8000-000000000200', 'https://dash.example/users-uncropped') $$,
  'the founder files it again with a better screenshot'
);
select results_eq(
  $$ select count(*), max(evidence.link) from public.achievement_evidence as evidence
       join public.project_achievements as claims on claims.id = evidence.achievement_id
      where claims.achievement_type = 'users_50'
        and claims.project_id = '10000000-0000-4000-8000-000000000200' $$,
  $$ values (1::bigint, 'https://dash.example/users-uncropped'::text) $$,
  'the replacement stands alone, and the claim is judged on what was sent this time'
);

-- ---------------------------------------------------------------- console configuration

select has_table('public', 'admin_config_changes', 'the configuration audit exists');
select ok(not has_table_privilege('anon', 'public.admin_config_changes', 'SELECT'), 'the audit is not public');
select ok(not has_table_privilege('authenticated', 'public.admin_config_changes', 'SELECT'), 'clients cannot read the audit');
select ok(not has_function_privilege('authenticated', 'public.set_level_milestone(smallint, integer, uuid)', 'EXECUTE'), 'founders cannot move the ladder');
select ok(not has_function_privilege('authenticated', 'public.update_achievement_definition(text, integer, text, text, text, text, uuid)', 'EXECUTE'), 'founders cannot re-price a rung');
select ok(has_function_privilege('service_role', 'public.set_level_milestone(smallint, integer, uuid)', 'EXECUTE'), 'the console can move the ladder');
select ok(has_function_privilege('service_role', 'public.update_achievement_definition(text, integer, text, text, text, text, uuid)', 'EXECUTE'), 'the console can re-price a rung');

reset role;

-- Re-pricing is not retroactive: the ledger keeps what it was written with.
select results_eq(
  $$ select xp_reward from public.update_achievement_definition(
       'users_10', 9, null, null, null, null, '00000000-0000-4000-8000-0000000000ad') $$,
  array[9],
  'a rung can be re-priced'
);
select results_eq(
  $$ select xp_delta from public.plot_xp_events
      where event_key = 'achievement:users_10:10000000-0000-4000-8000-000000000001' $$,
  array[5],
  'the ledger event keeps the price it was written at'
);
select results_eq(
  $$ select previous_value, new_value, founders_affected from public.admin_config_changes
      where entity = 'achievement_definition' and entity_id = 'users_10' $$,
  $$ values ('5'::text, '9'::text, 0) $$,
  'the re-pricing is logged against the admin who made it'
);

-- Re-wording leaves the price alone and logs nothing, because nothing economic moved.
select results_eq(
  $$ select evidence_hint from public.update_achievement_definition(
       'users_10', null, null, null, null, 'Any dashboard will do.') $$,
  array['Any dashboard will do.'::text],
  'the evidence note can be re-worded from the console'
);
select results_eq(
  $$ select count(*) from public.admin_config_changes where entity_id = 'users_10' $$,
  array[1::bigint],
  'a re-wording is not logged as an economic change'
);

-- Moving a threshold IS retroactive. Founder one sits on 570 XP at level two; dropping level three
-- to 500 has to promote them in the same transaction.
select results_eq(
  $$ select building_level from public.plot_claims
      where owner_id = '00000000-0000-4000-8000-000000000001' $$,
  array[2::smallint],
  'the founder starts at level two'
);
select results_eq(
  $$ select level, required_xp, founders_relevelled from public.set_level_milestone(
       3::smallint, 500, '00000000-0000-4000-8000-0000000000ad') $$,
  $$ values (3::smallint, 500, 1) $$,
  'lowering a threshold re-levels the founders it now covers'
);
select results_eq(
  $$ select building_level from public.plot_claims
      where owner_id = '00000000-0000-4000-8000-000000000001' $$,
  array[3::smallint],
  'the stored level follows the ladder without waiting for the next award'
);

-- The ladder has to keep climbing, or a founder gaining XP could drop a level.
select throws_ok(
  $$ select * from public.set_level_milestone(3::smallint, 100) $$,
  'P0001', 'invalid_milestone_order',
  'a threshold cannot be pushed below the one beneath it'
);
select throws_ok(
  $$ select * from public.set_level_milestone(1::smallint, 50) $$,
  'P0001', 'invalid_milestone_order',
  'level one stays the floor every founder starts on'
);
select throws_ok(
  $$ select * from public.set_level_milestone(9::smallint, 5000) $$,
  'P0001', 'milestone_not_found',
  'a level that does not exist cannot be set'
);

select * from finish();
rollback;
