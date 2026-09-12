-- Claims have to show their working.
--
-- Approval only means something if the reviewer has something to review. Until now a claim was a
-- founder asserting a number, and an admin either believing it or not. This attaches evidence to
-- every claim, and tells the founder what evidence is wanted in the words of the rung they picked.
--
-- Three things shape it.
--
-- 1. Evidence is private. public.project_achievements is world-readable -- anon holds SELECT -- so a
--    revenue screenshot stored there would be a privacy incident on day one. It gets its own table,
--    readable by its owner and by the service role, and by nobody else.
-- 2. The prompt is data, not code. Each rung carries the question it asks and the note explaining
--    what is wanted, so re-wording an ask is an UPDATE rather than a deploy.
-- 3. A launched product proves itself. Ownership of a domain is the one thing no screenshot can
--    fake, so projects carry a verification token to put on the site.

-- --------------------------------------------------------------------------------------------
-- What each rung asks for.
-- --------------------------------------------------------------------------------------------

alter table public.achievement_definitions
  add column evidence_prompt text not null default '',
  add column evidence_hint text not null default '';

-- The empty defaults exist only to get the columns onto the rows below; the length constraints go
-- on after the copy is seeded, because '' would fail them.
update public.achievement_definitions set
  evidence_prompt = 'Show us it is live',
  evidence_hint = 'Add the verification tag below to your site. Link a launch post too if you have '
                  || 'one -- Product Hunt, X, Hacker News or Indie Hackers.'
 where achievement_type = 'product_launched';

-- The definition of a user rides in the hint on every users rung. Without it the disputes are all
-- the same dispute: someone counting visitors, or newsletter subscribers, as users.
update public.achievement_definitions set
  evidence_prompt = 'Where can we see the signups?',
  evidence_hint = 'A screenshot of your dashboard, or a link to it. A user is someone who created '
                  || 'an account -- visitors and newsletter subscribers do not count.'
 where achievement_type = 'users_10';

update public.achievement_definitions set
  evidence_prompt = 'Where can we see the signups?',
  evidence_hint = 'A screenshot or a link showing fifty or more accounts. A user is someone who '
                  || 'created an account -- visitors and newsletter subscribers do not count.'
 where achievement_type = 'users_50';

update public.achievement_definitions set
  evidence_prompt = 'Show the count and where it came from',
  evidence_hint = 'Supabase, Clerk, Firebase, Stripe customers, your app store listing or a query '
                  || 'result. Leave the dashboard visible, not just the number.'
 where achievement_type = 'users_100';

update public.achievement_definitions set
  evidence_prompt = 'Show your first payment',
  evidence_hint = 'Stripe, Lemon Squeezy, Paddle, Gumroad, Polar or Dodo Payments. Black out '
                  || 'customer names and emails -- we only need the total.'
 where achievement_type = 'revenue_10';

update public.achievement_definitions set
  evidence_prompt = 'Show $100+ earned in total',
  evidence_hint = 'Lifetime across everything you have built. Stripe, Lemon Squeezy, Paddle, '
                  || 'Gumroad, Polar or Dodo Payments. Black out customer names and emails.'
 where achievement_type = 'revenue_100';

-- Now that every rung carries its copy, the shape of that copy becomes enforceable. Dropping the
-- defaults means a type added later has to state its own prompt rather than inheriting a blank one.
alter table public.achievement_definitions
  alter column evidence_prompt drop default,
  alter column evidence_hint drop default,
  add constraint achievement_definitions_evidence_prompt_length check (
    char_length(trim(evidence_prompt)) between 1 and 80
  ),
  add constraint achievement_definitions_evidence_hint_length check (
    char_length(trim(evidence_hint)) between 1 and 300
  );

-- --------------------------------------------------------------------------------------------
-- The evidence itself.
-- --------------------------------------------------------------------------------------------

create table public.achievement_evidence (
  id bigint generated always as identity primary key,
  achievement_id bigint not null references public.project_achievements (id) on delete cascade,
  owner_id uuid not null references public.plot_claims (owner_id) on delete cascade,
  -- A public link, an uploaded screenshot, or both. The note is always optional: it explains the
  -- other two rather than standing in for them.
  link text,
  file_path text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One row per claim. Re-filing a rejected rung replaces what was sent, it does not accumulate.
  constraint achievement_evidence_once_per_claim unique (achievement_id),

  constraint achievement_evidence_link_valid check (
    link is null or (link ~ '^https?://' and char_length(link) <= 2048)
  ),
  constraint achievement_evidence_file_path_length check (
    file_path is null or char_length(file_path) between 1 and 400
  ),
  constraint achievement_evidence_note_length check (
    note is null or char_length(note) <= 500
  ),
  -- The requirement itself: a claim cannot arrive with nothing to look at. A note on its own does
  -- not count -- it is the founder restating the claim in different words.
  constraint achievement_evidence_shows_something check (
    link is not null or file_path is not null
  )
);

create index achievement_evidence_owner_idx
  on public.achievement_evidence (owner_id, created_at desc);

alter table public.achievement_evidence enable row level security;

-- A founder can see what they sent -- they need it to know what to change after a rejection. They
-- cannot see anyone else's, and every write goes through the security definer path below.
create policy "Founders can read their own evidence"
  on public.achievement_evidence
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

revoke all on public.achievement_evidence from anon, authenticated;
grant select on public.achievement_evidence to authenticated;

comment on table public.achievement_evidence is
  'Screenshots and links supporting a milestone claim. Private: revenue figures live here, so the '
  'owner and the service role are the only readers. Its only purpose is the review, so it is a '
  'candidate for deletion some fixed period after the claim is decided.';

create trigger set_achievement_evidence_updated_at
  before update on public.achievement_evidence
  for each row execute procedure public.set_profile_updated_at();

-- --------------------------------------------------------------------------------------------
-- Uploaded screenshots. Private bucket, one folder per founder.
-- --------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'achievement-evidence', 'achievement-evidence', false, 5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

-- The first path segment is the founder's uuid, which is what confines a writer to their own
-- folder. The admin console reads through the service role and bypasses all of this.
create policy "Founders upload into their own evidence folder"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'achievement-evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Founders read their own evidence files"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'achievement-evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Founders replace their own evidence files"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'achievement-evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- --------------------------------------------------------------------------------------------
-- Proving the site is yours.
-- --------------------------------------------------------------------------------------------

alter table public.projects
  -- Public on purpose, and harmless: knowing project P's token does not help you put it on a site
  -- you do not control, and the client needs to read its own token to show the instructions.
  add column verification_token text not null
    default replace(gen_random_uuid()::text, '-', ''),
  add column verified_at timestamptz,
  -- Which URL was verified. Changing the project's URL leaves this behind, so a founder cannot
  -- verify a site they own and then point the project somewhere else.
  add column verified_url text;

alter table public.projects
  add constraint projects_verification_token_format check (
    verification_token ~ '^[0-9a-f]{32}$'
  ),
  add constraint projects_verified_together check (
    (verified_at is null and verified_url is null)
    or (verified_at is not null and verified_url is not null)
  );

comment on column public.projects.verified_at is
  'When the verification tag was last found on verified_url. Compare verified_url against '
  'website_url before trusting it: they diverge when a founder repoints the project.';

-- --------------------------------------------------------------------------------------------
-- Filing a claim now carries its evidence. Same "revoked from every role" contract as before.
-- --------------------------------------------------------------------------------------------

drop function public.apply_project_achievement(uuid, uuid, text);

create function public.apply_project_achievement(
  target_owner_id uuid,
  target_project_id uuid,
  requested_achievement_type text,
  evidence_link text default null,
  evidence_file_path text default null,
  evidence_note text default null
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
  clean_link text := nullif(trim(coalesce(evidence_link, '')), '');
  clean_path text := nullif(trim(coalesce(evidence_file_path, '')), '');
  clean_note text := nullif(trim(coalesce(evidence_note, '')), '');
begin
  select definitions.*
    into requested
    from public.achievement_definitions as definitions
   where definitions.achievement_type = requested_achievement_type;

  if not found then
    raise exception using message = 'invalid_achievement';
  end if;

  -- Checked here rather than only in record_achievement, so create_project is held to it too.
  if clean_link is null and clean_path is null then
    raise exception using message = 'evidence_required';
  end if;
  if clean_link is not null and (clean_link !~ '^https?://' or char_length(clean_link) > 2048) then
    raise exception using message = 'invalid_evidence';
  end if;
  -- The storage policy already confines a writer to their own folder; this refuses to *record* a
  -- path outside it, so a claim can never point at someone else's upload.
  if clean_path is not null and (
    clean_path !~ ('^' || target_owner_id::text || '/')
    or char_length(clean_path) > 400
  ) then
    raise exception using message = 'invalid_evidence';
  end if;
  if clean_note is not null and char_length(clean_note) > 500 then
    raise exception using message = 'invalid_evidence';
  end if;

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
    if existing.status <> 'rejected' then
      raise exception using message = 'achievement_already_claimed';
    end if;

    update public.project_achievements as held
       set status = 'pending',
           reviewed_at = null,
           reviewed_by = null,
           review_note = null,
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

  -- Replaces rather than accumulates: a re-filed rung is judged on what was sent this time.
  insert into public.achievement_evidence (achievement_id, owner_id, link, file_path, note)
  values (claimed_id, target_owner_id, clean_link, clean_path, clean_note)
  on conflict (achievement_id) do update
    set link = excluded.link,
        file_path = excluded.file_path,
        note = excluded.note;

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

revoke execute on function public.apply_project_achievement(uuid, uuid, text, text, text, text)
  from public, anon, authenticated;

-- --------------------------------------------------------------------------------------------
-- Client entry points, both carrying evidence through.
-- --------------------------------------------------------------------------------------------

drop function public.record_achievement(text, uuid);

create function public.record_achievement(
  requested_achievement_type text,
  requested_project_id uuid default null,
  evidence_link text default null,
  evidence_file_path text default null,
  evidence_note text default null
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
    caller_id, requested_project_id, requested_achievement_type,
    evidence_link, evidence_file_path, evidence_note
  );
end;
$$;

revoke execute on function public.record_achievement(text, uuid, text, text, text)
  from public, anon;
grant execute on function public.record_achievement(text, uuid, text, text, text) to authenticated;

comment on function public.record_achievement(text, uuid, text, text, text) is
  'Files a milestone claim for review, with the evidence supporting it. Records a pending row and '
  'moves no XP; approval is what writes the ledger. A claim with neither a link nor an uploaded '
  'file is refused with evidence_required.';

-- Creating a project files its launch claim, so it now has to carry evidence too. The project's own
-- URL is the evidence -- a live product proves itself -- and evidence_link is there for a founder
-- who also wants to point at a launch post.
drop function public.create_project(uuid, text, text, text, boolean);

create function public.create_project(
  project_uuid uuid,
  project_name text,
  project_website_url text,
  requested_project_type text,
  showcase_on_billboard boolean default false,
  evidence_link text default null,
  evidence_note text default null
)
returns setof public.city_developments
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  -- Mirrored by MAX_PROJECTS_PER_FOUNDER in src/lib/city/constants.ts.
  max_projects_per_founder constant integer := 10;
  owned_project_count integer;
  violated_constraint text;
begin
  if caller_id is null then
    raise exception using message = 'not_authenticated';
  end if;

  if project_uuid is null
    or char_length(trim(coalesce(project_name, ''))) not between 1 and 40
    or char_length(coalesce(project_website_url, '')) > 2048
    or coalesce(project_website_url, '') !~ '^https?://'
    or requested_project_type not in ('website', 'app', 'chrome-extension')
  then
    raise exception using message = 'invalid_project';
  end if;

  perform 1 from public.plot_claims as claims
   where claims.owner_id = caller_id
     for update;

  if not found then
    raise exception using message = 'claim_not_found';
  end if;

  select count(*) into owned_project_count
    from public.projects as owned
   where owned.owner_id = caller_id;

  if owned_project_count >= max_projects_per_founder then
    raise exception using message = 'project_limit_reached';
  end if;

  begin
    insert into public.projects (id, owner_id, name, website_url, project_type)
    values (
      project_uuid, caller_id, trim(project_name),
      trim(project_website_url), requested_project_type
    );
  exception when unique_violation then
    get stacked diagnostics violated_constraint = constraint_name;
    if violated_constraint = 'projects_owner_website_url_unique' then
      raise exception using message = 'project_url_taken';
    end if;
    raise exception using message = 'project_already_exists';
  end;

  perform public.apply_project_achievement(
    caller_id, project_uuid, 'product_launched',
    coalesce(nullif(trim(coalesce(evidence_link, '')), ''), trim(project_website_url)),
    null,
    evidence_note
  );

  if showcase_on_billboard then
    update public.plot_claims as claims
       set project_id = project_uuid
     where claims.owner_id = caller_id;
  end if;

  return query
    select developments.*
    from public.city_developments as developments
    where developments.owner_id = caller_id;
end;
$$;

revoke execute on function public.create_project(uuid, text, text, text, boolean, text, text)
  from public, anon;
grant execute on function public.create_project(uuid, text, text, text, boolean, text, text)
  to authenticated;

-- --------------------------------------------------------------------------------------------
-- Recording the outcome of a site check.
-- --------------------------------------------------------------------------------------------

-- The fetch itself happens outside the database, and it is the admin console that performs the
-- authoritative one: a founder-triggered check that wrote its own result would be a founder marking
-- their own homework, and pointing the server at a URL is a request-forgery surface best kept
-- behind the console's allow-list rather than exposed to every signed-in account.
create function public.record_site_verification(
  target_project_id uuid,
  checked_url text,
  tag_found boolean
)
returns table (verified_at timestamptz, verified_url text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated public.projects%rowtype;
begin
  perform public.assert_reviewer();

  if target_project_id is null or coalesce(checked_url, '') !~ '^https?://' then
    raise exception using message = 'invalid_project';
  end if;

  update public.projects as owned
     set verified_at = case when tag_found then now() else null end,
         verified_url = case when tag_found then checked_url else null end
   where owned.id = target_project_id
   returning owned.* into updated;

  if not found then
    raise exception using message = 'project_not_found';
  end if;

  return query select updated.verified_at, updated.verified_url;
end;
$$;

revoke execute on function public.record_site_verification(uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.record_site_verification(uuid, text, boolean) to service_role;
