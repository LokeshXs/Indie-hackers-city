-- Achievements become claims, not awards.
--
-- Nothing verifies "100+ users" -- there is no oracle for it -- so until now the ceiling on
-- client-minted XP was the per-founder project cap and nothing else. This migration puts a person
-- in the loop: logging a milestone records a `pending` row and moves no XP, and an admin approving
-- it is what writes the ledger.
--
-- Three rules shape everything below.
--
-- 1. The cascade moves to approval. Submitting `users_100` records ONE pending row, so the review
--    queue holds one item per thing the founder actually claimed. Approving it grants 100 and every
--    unheld rung beneath it, which is where 5 + 25 + 50 is decided.
-- 2. The plot-claim bonus stays instant. `claim_plot` awards its 10 XP inside the claim transaction
--    under `plot_claim:<owner>`; a founder who has just signed up should not sit at zero waiting for
--    someone to be at the console.
-- 3. Rows already approved keep their XP. This is a change of policy, not a re-audit of history.

-- --------------------------------------------------------------------------------------------
-- Review state on the claim itself.
-- --------------------------------------------------------------------------------------------

alter table public.project_achievements
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references auth.users (id) on delete set null,
  add column review_note text;

alter table public.project_achievements
  add constraint project_achievements_review_note_length check (
    review_note is null or char_length(review_note) <= 500
  );

-- Every row written before this migration was auto-approved the instant it was created, so that is
-- exactly what its review timestamp should say. `reviewed_by` stays null: no person decided them.
update public.project_achievements
   set reviewed_at = created_at
 where status <> 'pending' and reviewed_at is null;

-- A decided row carries a decision time; a pending one cannot. Written after the backfill so the
-- existing rows satisfy it.
alter table public.project_achievements
  add constraint project_achievements_review_consistent check (
    (status = 'pending' and reviewed_at is null)
    or (status in ('approved', 'rejected') and reviewed_at is not null)
  );

-- The point of the whole migration.
alter table public.project_achievements
  alter column status set default 'pending';

comment on column public.project_achievements.xp_awarded is
  'What this rung is worth, copied from the catalog when the claim was filed. It is not proof that '
  'XP moved -- public.plot_xp_events is the only record of that, and a pending or rejected row has '
  'no ledger event at all.';

create index project_achievements_pending_idx
  on public.project_achievements (created_at)
  where status = 'pending';

-- --------------------------------------------------------------------------------------------
-- Decision log. Separate from the claim because a claim holds one status while its history can
-- hold several: rejected, reopened by the founder, approved, later revoked.
-- --------------------------------------------------------------------------------------------

create table public.achievement_reviews (
  id bigint generated always as identity primary key,
  achievement_id bigint not null references public.project_achievements (id) on delete cascade,
  owner_id uuid not null references public.plot_claims (owner_id) on delete cascade,
  achievement_type text not null,
  decision text not null,
  xp_delta integer not null default 0,
  -- The ledger row this decision wrote, so a later revocation knows exactly what to compensate for
  -- instead of reconstructing a key.
  ledger_event_key text,
  reviewer_id uuid references auth.users (id) on delete set null,
  reviewer_label text not null,
  note text,
  created_at timestamptz not null default now(),

  constraint achievement_reviews_decision_known check (
    decision in ('approved', 'rejected', 'revoked', 'reopened')
  ),
  constraint achievement_reviews_note_length check (note is null or char_length(note) <= 500),
  constraint achievement_reviews_label_length check (
    char_length(trim(reviewer_label)) between 1 and 200
  ),
  -- Only an approval or a revocation moves XP. A rejection and a reopen are bookkeeping.
  constraint achievement_reviews_delta_matches_decision check (
    (decision in ('rejected', 'reopened') and xp_delta = 0)
    or decision in ('approved', 'revoked')
  )
);

create index achievement_reviews_achievement_idx
  on public.achievement_reviews (achievement_id, created_at);
create index achievement_reviews_owner_idx
  on public.achievement_reviews (owner_id, created_at desc);

-- Names the staff who made each call. Nothing in the browser has any business reading it, so it
-- follows plot_xp_events: RLS on, every grant revoked, reachable only through the secret key.
alter table public.achievement_reviews enable row level security;
revoke all on public.achievement_reviews from anon, authenticated;

-- --------------------------------------------------------------------------------------------
-- Submission. Same name and same "revoked from every role" contract as before, but it no longer
-- touches the XP ledger, and it records one rung rather than a cascade.
-- --------------------------------------------------------------------------------------------

drop function public.apply_project_achievement(uuid, uuid, text);

create function public.apply_project_achievement(
  target_owner_id uuid,
  target_project_id uuid,
  requested_achievement_type text
)
returns table (
  awarded_type text,
  awarded_project_id uuid,
  awarded_status text,
  awarded_xp_pending integer,
  resulting_xp_total integer,
  resulting_building_level smallint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested public.achievement_definitions%rowtype;
  rung_project_id uuid;
  award_key text;
  existing public.project_achievements%rowtype;
  claimed_id bigint;
  pending_xp integer;
  current_claim public.plot_claims%rowtype;
begin
  select definitions.*
    into requested
    from public.achievement_definitions as definitions
   where definitions.achievement_type = requested_achievement_type;

  if not found then
    raise exception using message = 'invalid_achievement';
  end if;

  -- Null for founder-scoped rungs, which is what makes the once-per-founder partial index apply.
  rung_project_id := case when requested.scope = 'founder' then null else target_project_id end;
  award_key := 'achievement:' || requested.achievement_type || ':'
    || coalesce(rung_project_id, target_owner_id)::text;

  select claims.*
    into current_claim
    from public.plot_claims as claims
   where claims.owner_id = target_owner_id
   for update;

  if not found then
    raise exception using message = 'claim_not_found';
  end if;

  select held.*
    into existing
    from public.project_achievements as held
   where held.achievement_type = requested.achievement_type
     and held.owner_id = target_owner_id
     and (
       (rung_project_id is null and held.project_id is null)
       or held.project_id = rung_project_id
     )
   for update;

  if found then
    -- Pending is already in the queue and approved is already granted; either way there is nothing
    -- to file. A rejected rung is different: a founder told "not yet" should be able to come back
    -- when they genuinely reach it, so the row reopens rather than the claim being refused forever.
    if existing.status <> 'rejected' then
      raise exception using message = 'achievement_already_claimed';
    end if;

    update public.project_achievements as held
       set status = 'pending',
           reviewed_at = null,
           reviewed_by = null,
           review_note = null,
           -- The catalog may have been re-priced since the rejection; a reopened claim is worth
           -- what the rung is worth today.
           xp_awarded = requested.xp_reward
     where held.id = existing.id;

    claimed_id := existing.id;

    insert into public.achievement_reviews (
      achievement_id, owner_id, achievement_type, decision, reviewer_label, note
    ) values (
      claimed_id, target_owner_id, requested.achievement_type, 'reopened', 'founder',
      'Resubmitted by the founder after a rejection'
    );
  else
    insert into public.project_achievements (
      owner_id, project_id, achievement_type, xp_awarded, event_key, status
    ) values (
      target_owner_id, rung_project_id, requested.achievement_type,
      requested.xp_reward, award_key, 'pending'
    )
    returning id into claimed_id;
  end if;

  -- What approving this would be worth: itself plus every rung below it in the group that is not
  -- already approved. Reported so the founder sees the same number the reviewer will.
  select coalesce(sum(rungs.xp_reward), 0)::integer
    into pending_xp
    from public.achievement_definitions as rungs
   where rungs.group_key = requested.group_key
     and rungs.tier <= requested.tier
     and not exists (
       select 1
         from public.project_achievements as held
        where held.achievement_type = rungs.achievement_type
          and held.owner_id = target_owner_id
          and held.status = 'approved'
          and (
            (rungs.scope = 'founder' and held.project_id is null)
            or (rungs.scope <> 'founder' and held.project_id = target_project_id)
          )
     );

  return query select
    requested.achievement_type,
    rung_project_id,
    'pending'::text,
    pending_xp,
    current_claim.xp_total,
    current_claim.building_level;
end;
$$;

revoke execute on function public.apply_project_achievement(uuid, uuid, text)
  from public, anon, authenticated;

-- --------------------------------------------------------------------------------------------
-- The client entry point. Same authorization, new return shape: there is no XP to report at
-- submission time, and pretending otherwise is what would put a phantom "+80 XP" on screen.
-- --------------------------------------------------------------------------------------------

drop function public.record_achievement(text, uuid);

create function public.record_achievement(
  requested_achievement_type text,
  requested_project_id uuid default null
)
returns table (
  achievement_type text,
  project_id uuid,
  status text,
  xp_pending integer,
  xp_total integer,
  building_level smallint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  requested_scope text;
begin
  if caller_id is null then
    raise exception using message = 'not_authenticated';
  end if;

  if requested_achievement_type is null
    or requested_achievement_type <> trim(requested_achievement_type)
    or char_length(requested_achievement_type) not between 1 and 80
  then
    raise exception using message = 'invalid_achievement';
  end if;

  select definitions.scope
    into requested_scope
    from public.achievement_definitions as definitions
   where definitions.achievement_type = requested_achievement_type;

  if not found then
    raise exception using message = 'invalid_achievement';
  end if;

  if not exists (
    select 1 from public.plot_claims as claims where claims.owner_id = caller_id
  ) then
    raise exception using message = 'claim_not_found';
  end if;

  if requested_scope = 'project' then
    if requested_project_id is null then
      raise exception using message = 'invalid_achievement';
    end if;

    if not exists (
      select 1 from public.projects as owned
       where owned.id = requested_project_id and owned.owner_id = caller_id
    ) then
      raise exception using message = 'project_not_owned';
    end if;
  end if;

  return query select * from public.apply_project_achievement(
    caller_id, requested_project_id, requested_achievement_type
  );
end;
$$;

revoke execute on function public.record_achievement(text, uuid) from public, anon;
grant execute on function public.record_achievement(text, uuid) to authenticated;

comment on function public.record_achievement(text, uuid) is
  'Files a milestone claim for review. Records a pending row and moves no XP; approval is what '
  'writes the ledger. The reported xp_pending is what approving it would grant, including the '
  'rungs beneath it that are not already approved.';

-- --------------------------------------------------------------------------------------------
-- Review path. These are the admin console's write surface, gated exactly like award_plot_xp:
-- `postgres` or `service_role` and nothing else. The console holds the secret key server-side and
-- checks its own allow-list before it ever gets here; this check is the database's own opinion,
-- independent of that.
-- --------------------------------------------------------------------------------------------

create function public.assert_reviewer()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception using message = 'not_authorized';
  end if;
  return coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    session_user
  );
end;
$$;

revoke execute on function public.assert_reviewer() from public, anon, authenticated;

-- Approving a rung grants every rung beneath it in the same group that is not already approved.
-- This is where the cascade lives now: submission files one claim, approval settles the ladder.
create function public.approve_achievement(
  target_achievement_id bigint,
  reviewer_user_id uuid default null,
  reviewer_note text default null
)
returns table (
  approved_count integer,
  xp_awarded integer,
  xp_total integer,
  building_level smallint,
  level_changed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  claim public.project_achievements%rowtype;
  requested public.achievement_definitions%rowtype;
  rung public.achievement_definitions%rowtype;
  existing public.project_achievements%rowtype;
  rung_project_id uuid;
  base_key text;
  ledger_key text;
  prior_approvals integer;
  rung_id bigint;
  reviewer text;
  granted_total integer := 0;
  granted_rungs integer := 0;
  crossed_a_level boolean := false;
  final_xp_total integer;
  final_building_level smallint;
  xp_result record;
begin
  reviewer := public.assert_reviewer();
  if reviewer_user_id is not null then
    reviewer := coalesce(
      (select users.email from auth.users as users where users.id = reviewer_user_id),
      reviewer
    );
  end if;

  select claims.*
    into claim
    from public.project_achievements as claims
   where claims.id = target_achievement_id
   for update;

  if not found then
    raise exception using message = 'achievement_not_found';
  end if;
  if claim.status <> 'pending' then
    raise exception using message = 'achievement_not_pending';
  end if;

  select definitions.*
    into requested
    from public.achievement_definitions as definitions
   where definitions.achievement_type = claim.achievement_type;

  if not found then
    raise exception using message = 'invalid_achievement';
  end if;

  -- Taking the claim's lock first and the founder's second matches apply_plot_xp's own ordering,
  -- so two admins approving different rungs for the same founder queue rather than deadlock.
  perform 1 from public.plot_claims as claims
   where claims.owner_id = claim.owner_id
   for update;

  if not found then
    raise exception using message = 'claim_not_found';
  end if;

  for rung in
    select definitions.*
      from public.achievement_definitions as definitions
     where definitions.group_key = requested.group_key
       and definitions.tier <= requested.tier
     order by definitions.tier
  loop
    rung_project_id := case when rung.scope = 'founder' then null else claim.project_id end;
    base_key := 'achievement:' || rung.achievement_type || ':'
      || coalesce(rung_project_id, claim.owner_id)::text;

    select held.*
      into existing
      from public.project_achievements as held
     where held.achievement_type = rung.achievement_type
       and held.owner_id = claim.owner_id
       and (
         (rung_project_id is null and held.project_id is null)
         or held.project_id = rung_project_id
       )
     for update;

    if found and existing.status = 'approved' then
      continue;
    end if;

    if found then
      rung_id := existing.id;
      update public.project_achievements as held
         set status = 'approved',
             xp_awarded = rung.xp_reward,
             reviewed_at = now(),
             reviewed_by = reviewer_user_id,
             review_note = reviewer_note
       where held.id = rung_id;
    else
      -- A rung the founder never filed for. Approving the one above it says they passed this one
      -- too, so it is recorded as approved in the same breath rather than left dangling as a claim
      -- nobody will ever submit.
      insert into public.project_achievements (
        owner_id, project_id, achievement_type, xp_awarded, event_key,
        status, reviewed_at, reviewed_by, review_note
      ) values (
        claim.owner_id, rung_project_id, rung.achievement_type, rung.xp_reward, base_key,
        'approved', now(), reviewer_user_id, reviewer_note
      )
      returning id into rung_id;
    end if;

    -- A rung approved, revoked and approved again cannot reuse its first ledger key: apply_plot_xp
    -- would recognise it, report applied = false and grant nothing. Each approval gets its own.
    select count(*)::integer
      into prior_approvals
      from public.achievement_reviews as reviews
     where reviews.achievement_id = rung_id and reviews.decision = 'approved';

    ledger_key := case
      when prior_approvals = 0 then base_key
      else base_key || ':reapproved:' || prior_approvals::text
    end;

    select applied.xp_total, applied.building_level, applied.level_changed
      into xp_result
      from public.apply_plot_xp(
        claim.owner_id,
        rung.xp_reward,
        ledger_key,
        rung.achievement_type,
        rung.label,
        jsonb_build_object(
          'project_id', rung_project_id,
          'achievement_type', rung.achievement_type,
          'approved_by', reviewer_user_id,
          'via', 'admin_approval'
        )
      ) as applied;

    insert into public.achievement_reviews (
      achievement_id, owner_id, achievement_type, decision, xp_delta,
      ledger_event_key, reviewer_id, reviewer_label, note
    ) values (
      rung_id, claim.owner_id, rung.achievement_type, 'approved', rung.xp_reward,
      ledger_key, reviewer_user_id, reviewer, reviewer_note
    );

    granted_total := granted_total + rung.xp_reward;
    granted_rungs := granted_rungs + 1;
    final_xp_total := xp_result.xp_total;
    final_building_level := xp_result.building_level;
    -- Any rung in the cascade crossing a threshold counts, not only the last one.
    crossed_a_level := crossed_a_level or xp_result.level_changed;
  end loop;

  -- granted_rungs is never zero: the claim itself was pending, so it was approved above.
  return query select
    granted_rungs,
    granted_total,
    final_xp_total,
    final_building_level,
    crossed_a_level;
end;
$$;

revoke execute on function public.approve_achievement(bigint, uuid, text)
  from public, anon, authenticated;
grant execute on function public.approve_achievement(bigint, uuid, text) to service_role;

-- Turns a pending claim down. No ledger event, because nothing moved.
create function public.reject_achievement(
  target_achievement_id bigint,
  reviewer_user_id uuid default null,
  reviewer_note text default null
)
returns table (
  rejected_type text,
  xp_total integer,
  building_level smallint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  claim public.project_achievements%rowtype;
  current_claim public.plot_claims%rowtype;
  reviewer text;
begin
  reviewer := public.assert_reviewer();
  if reviewer_user_id is not null then
    reviewer := coalesce(
      (select users.email from auth.users as users where users.id = reviewer_user_id),
      reviewer
    );
  end if;

  select claims.*
    into claim
    from public.project_achievements as claims
   where claims.id = target_achievement_id
   for update;

  if not found then
    raise exception using message = 'achievement_not_found';
  end if;
  if claim.status <> 'pending' then
    raise exception using message = 'achievement_not_pending';
  end if;

  update public.project_achievements as claims
     set status = 'rejected',
         reviewed_at = now(),
         reviewed_by = reviewer_user_id,
         review_note = reviewer_note
   where claims.id = claim.id;

  insert into public.achievement_reviews (
    achievement_id, owner_id, achievement_type, decision, reviewer_id, reviewer_label, note
  ) values (
    claim.id, claim.owner_id, claim.achievement_type, 'rejected',
    reviewer_user_id, reviewer, reviewer_note
  );

  select claims.* into current_claim
    from public.plot_claims as claims where claims.owner_id = claim.owner_id;

  return query select claim.achievement_type, current_claim.xp_total, current_claim.building_level;
end;
$$;

revoke execute on function public.reject_achievement(bigint, uuid, text)
  from public, anon, authenticated;
grant execute on function public.reject_achievement(bigint, uuid, text) to service_role;

-- Undoes an approval that should not have happened. The original ledger row stays -- history is
-- never deleted -- and a negative event under a new key cancels it, which is the same correction
-- pattern a manual mistake uses.
--
-- Only the named rung is revoked. Taking back "100+ users" says nothing about whether the founder
-- has ten, so the rungs beneath it keep their XP.
create function public.revoke_achievement(
  target_achievement_id bigint,
  reviewer_user_id uuid default null,
  reviewer_note text default null
)
returns table (
  revoked_type text,
  xp_removed integer,
  xp_total integer,
  building_level smallint,
  level_changed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  claim public.project_achievements%rowtype;
  last_approval public.achievement_reviews%rowtype;
  prior_revocations integer;
  correction_key text;
  reviewer text;
  xp_result record;
begin
  reviewer := public.assert_reviewer();
  if reviewer_user_id is not null then
    reviewer := coalesce(
      (select users.email from auth.users as users where users.id = reviewer_user_id),
      reviewer
    );
  end if;

  select claims.*
    into claim
    from public.project_achievements as claims
   where claims.id = target_achievement_id
   for update;

  if not found then
    raise exception using message = 'achievement_not_found';
  end if;
  if claim.status <> 'approved' then
    raise exception using message = 'achievement_not_approved';
  end if;

  perform 1 from public.plot_claims as claims
   where claims.owner_id = claim.owner_id
   for update;

  select reviews.*
    into last_approval
    from public.achievement_reviews as reviews
   where reviews.achievement_id = claim.id and reviews.decision = 'approved'
   order by reviews.created_at desc, reviews.id desc
   limit 1;

  -- Rows approved before this migration existed have no review entry, so fall back to the derived
  -- key they were written under and to the amount recorded on the claim.
  if not found then
    last_approval.ledger_event_key := claim.event_key;
    last_approval.xp_delta := claim.xp_awarded;
  end if;

  select count(*)::integer
    into prior_revocations
    from public.achievement_reviews as reviews
   where reviews.achievement_id = claim.id and reviews.decision = 'revoked';

  correction_key := 'correction:' || last_approval.ledger_event_key || ':'
    || (prior_revocations + 1)::text;

  select applied.xp_total, applied.building_level, applied.level_changed
    into xp_result
    from public.apply_plot_xp(
      claim.owner_id,
      -last_approval.xp_delta,
      correction_key,
      'correction',
      'Revoked ' || claim.achievement_type,
      jsonb_build_object(
        'corrects', last_approval.ledger_event_key,
        'achievement_type', claim.achievement_type,
        'revoked_by', reviewer_user_id,
        'via', 'admin_revocation'
      )
    ) as applied;

  update public.project_achievements as claims
     set status = 'rejected',
         reviewed_at = now(),
         reviewed_by = reviewer_user_id,
         review_note = reviewer_note
   where claims.id = claim.id;

  insert into public.achievement_reviews (
    achievement_id, owner_id, achievement_type, decision, xp_delta,
    ledger_event_key, reviewer_id, reviewer_label, note
  ) values (
    claim.id, claim.owner_id, claim.achievement_type, 'revoked', -last_approval.xp_delta,
    correction_key, reviewer_user_id, reviewer, reviewer_note
  );

  return query select
    claim.achievement_type,
    last_approval.xp_delta,
    xp_result.xp_total,
    xp_result.building_level,
    xp_result.level_changed;
end;
$$;

revoke execute on function public.revoke_achievement(bigint, uuid, text)
  from public, anon, authenticated;
grant execute on function public.revoke_achievement(bigint, uuid, text) to service_role;
