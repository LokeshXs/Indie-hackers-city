# Supabase development workflow

This project treats database structure as code. The files in
`supabase/migrations/` are the source of truth; the local and hosted databases
are environments built from those files.

## The four pieces

| Piece | Meaning | Stored where |
| --- | --- | --- |
| Local Supabase | Disposable Postgres, Auth, Storage, Realtime, and Studio running in Docker | Your computer |
| Hosted Supabase | The persistent cloud project used by the deployed app | Supabase |
| Migrations | Ordered SQL files that describe every schema change | `supabase/migrations/`, committed to Git |
| Seed data | Repeatable fake/sample data for local development only | `supabase/seed.sql`, committed to Git |

The app chooses its database from `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Migration commands choose their target
explicitly and load the matching env file, so they do not depend on an
easy-to-forget CLI link.

## Environment variables

Copy `.env.local.example` to `.env.local`. Its URL and publishable key point
Next.js at the local stack. The publishable key is intentionally public and
safe in the browser. Never expose a secret key or legacy `service_role` key to
Next.js.

Google credentials in `.env.local` are loaded by this project's command wrapper
and substituted into `supabase/config.toml` to configure the local Auth
container. They are secrets and both resulting env files remain ignored by Git.

Copy `.env.example` to `.env` for the hosted project. In addition to the public
app values, it contains `SUPABASE_PROJECT_REF` and `SUPABASE_DB_PASSWORD` for
remote migration commands. The database password is private and must never use
the `NEXT_PUBLIC_` prefix.

Next.js gives `.env.local` precedence over `.env`, so `npm run dev` uses local
Supabase when both exist. For production, set the hosted URL and publishable key
in the hosting provider (for example, Vercel). Configure hosted Google OAuth in
the Supabase Dashboard separately; local and hosted callback URLs differ.

## First-time setup

```bash
npm install
cp .env.example .env
cp .env.local.example .env.local
npx supabase login
npm run db:start
npm run db:reset
npm run db:test
npm run db:types
```

Local Studio is at <http://127.0.0.1:54323>. The local API is at
<http://127.0.0.1:54321>. Restart `npm run dev` after changing `.env.local`.

Fill the local values in `.env.local` and hosted values in `.env`. Login is a
one-time CLI setup; the project ref in `.env` selects the hosted project.

## Everyday schema change

There are two supported styles.

### Write SQL directly (recommended)

```bash
npx supabase migration new add_project_tags
```

Edit the newly created SQL file, then verify the complete history:

```bash
npm run db:reset
npm run db:test
npx supabase db lint --local --level error
npm run db:types
```

### Use the local Studio UI

Make table/schema changes only in local Studio, then capture them:

```bash
npx supabase db diff --local -f add_project_tags
npm run db:reset
```

Always review generated SQL. Database diff tools cannot reliably capture every
kind of change, including some publication and storage-bucket changes.

Commit the migration and regenerated TypeScript types together. Teammates run
`npm run db:reset` after pulling migrations.

To apply new migration files locally without deleting local rows—the closest
Supabase equivalent to Prisma's migration command—run:

```bash
npm run db:migrate
```

## Deploy migrations to hosted Supabase

```bash
node scripts/supabase-env.mjs remote status
node scripts/supabase-env.mjs remote plan
npm run db:migrate:remote
```

The `db push --dry-run` command is a preview. Read its migration list before deploy. A deploy
applies only migrations missing from the hosted migration-history table; it
does not copy your local rows and does not run `seed.sql`.

Use migrations for hosted schema changes. Avoid changing tables, policies,
functions, or triggers directly in the hosted Dashboard because that creates
schema drift.

## If hosted Supabase was changed manually

Stop and coordinate with the team, then run:

```bash
node scripts/supabase-env.mjs remote pull
npm run db:reset
```

`db pull` creates a migration representing hosted-only changes. Review
it carefully before committing. It is a recovery/synchronization command, not
part of the normal daily workflow.

## Command glossary

| Command | Target | Effect |
| --- | --- | --- |
| `db:start` | Local | Starts all local Supabase services |
| `db:stop` | Local | Stops all local Supabase services |
| `db:migrate` | Local | Applies pending migrations without deleting local rows |
| `db:migrate:remote` | Hosted/write | Applies pending migrations using `.env` |
| `db:reset` | Local | Deletes local DB data, reapplies migrations, then seed data |
| `db:test` | Local | Runs SQL tests in `supabase/tests/` |
| `db:types` | Local/files | Regenerates TypeScript database types |

Never run `supabase db reset --linked` against production. Unlike the local
reset command, it destroys data in the linked hosted database.

## XP rewards and building levels

XP belongs to a founder's permanent plot claim, not to the project currently
shown on that plot. Switching projects therefore keeps the same XP and building
level. The cumulative milestones live in `building_level_milestones`, which the
admin console can edit, and currently read:

| Level | Required XP |
| ---: | ---: |
| 1 | 0 |
| 2 | 490 |
| 3 | 690 |
| 4 | 1,090 |
| 5 | 1,890 |

Query the table rather than trusting this copy; moving a threshold re-levels
every founder already past it.

Never edit `plot_claims.xp_total`, `plot_claims.building_level`, or rows in
`plot_xp_events` directly. Use `award_plot_xp`; it locks the claim, records an
immutable event, derives the level, and protects retries with a unique event
key. The browser roles cannot call this function.

Two functions write the ledger:

- `award_plot_xp` is the entry point for manual and service-role awards. It
  checks that the caller is `postgres` or `service_role`, then delegates.
- `apply_plot_xp` does the actual work and carries **no** authorization check.
  Execute is revoked from every role, so it is reachable only from inside a
  `security definer` function that has already established the caller may award
  XP. `claim_plot` uses it for the automatic claim reward below.

Claiming a plot automatically awards **10 XP** in the same transaction as the
claim, under the deterministic key `plot_claim:<owner-uuid>` with event type
`plot_claimed`. A founder therefore starts at 10 XP and level one rather than
zero. Because the award and the claim share a transaction, a failed award rolls
the claim back, and the row `claim_plot` returns already carries the XP.

Find a founder's owner ID locally:

```bash
npx supabase db query --local \
  "select owner_id, founder_name, project_name, xp_total, building_level from public.city_developments order by founder_name;"
```

Award XP locally:

```bash
npx supabase db query --local \
  "select * from public.award_plot_xp(
    '<owner-uuid>',
    100,
    'manual:first-reward:<owner-uuid>',
    'manual_award',
    'Initial milestone reward',
    '{\"campaign\":\"first-reward\"}'::jsonb
  );"
```

After `npx supabase login` and linking the hosted project, award the same event
remotely with:

```bash
npx supabase db query --linked \
  "select * from public.award_plot_xp(
    '<owner-uuid>',
    100,
    'manual:first-reward:<owner-uuid>',
    'manual_award',
    'Initial milestone reward',
    '{\"campaign\":\"first-reward\"}'::jsonb
  );"
```

Use a globally unique, stable `event_key` for each real-world reward. Retrying
the exact command with the same owner, amount, type, and key is safe: it returns
`applied = false` and does not add XP again. Reusing a key with different award
data raises `xp_event_conflict`.

Correct a mistaken award by adding a negative compensating event with a new
key. History is never deleted:

```bash
npx supabase db query --local \
  "select * from public.award_plot_xp(
    '<owner-uuid>',
    -100,
    'correction:manual:first-reward:<owner-uuid>:1',
    'correction',
    'Correct duplicate manual reward',
    '{\"corrects\":\"manual:first-reward:<owner-uuid>\"}'::jsonb
  );"
```

Corrections cannot reduce total XP below zero and may downgrade the derived
building level. Inspect the private ledger from an administrative CLI session:

```bash
npx supabase db query --local \
  "select event_key, event_type, xp_delta, description, awarded_by, created_at from public.plot_xp_events where owner_id = '<owner-uuid>' order by created_at, id;"
```

Future automatic rewards must use their own deterministic event keys, calling
`award_plot_xp` from an administrative session, or `apply_plot_xp` when already
inside an authorized `security definer` function. They must not update the
stored total directly.

## Achievements

Achievements are the only client-triggered source of XP, and since the approval
gate landed they are **claims, not awards**: logging one records a `pending` row
and moves nothing. An admin approving it is what writes the ledger.

The catalog lives in `public.achievement_definitions`, each row carrying an
`xp_reward` plus a `group_key`, a `tier` and a `scope`. The reward is read
*inside* the award function and is never accepted as an argument, so neither a
client nor a reviewer can express an amount.

| Type | Group | Tier | Scope | Reward |
| --- | --- | --- | --- | --- |
| `product_launched` | launch | 1 | project | 100 |
| `users_10` | users | 1 | project | 5 |
| `users_50` | users | 2 | project | 25 |
| `users_100` | users | 3 | project | 50 |
| `revenue_10` | revenue | 1 | **founder** | 50 |
| `revenue_100` | revenue | 2 | **founder** | 150 |

**Revenue is founder-scoped**: it is money the founder earned across everything
they have built, claimable once ever, so its rows carry `project_id = null` and
its key ends in the owner uuid rather than a project uuid. Uniqueness is two
partial indexes — `(project_id, achievement_type)` where a project is set, and
`(owner_id, achievement_type)` where it is not.

### The two halves

| Step | Function | Callable by | Moves XP |
| --- | --- | --- | --- |
| File a claim | `record_achievement` | `authenticated` | No |
| Approve it | `approve_achievement` | `service_role` | Yes |
| Turn it down | `reject_achievement` | `service_role` | No |
| Take an award back | `revoke_achievement` | `service_role` | Yes, negative |

`record_achievement` records **one** rung and reports `xp_pending`, which is what
approving it would be worth. `apply_project_achievement` is still the private
applier behind it, still revoked from every role.

**The cascade happens at approval, not submission.** Filing "100+ users" queues a
single item, so the reviewer sees one claim rather than three. Approving it
grants 100 and every rung beneath it that is not already approved — writing rows
for rungs the founder never filed — which is where 5 + 25 + 50 is decided. This
exists because a founder knows how far a product has got, not which individual
milestones they remembered to log.

`public.create_project` files `product_launched` for the project it creates, in
the same transaction, so a failed claim rolls the project back. It no longer
awards anything on its own.

**Claiming a plot is not gated.** `claim_plot` still awards its 10 XP inside the
claim transaction under `plot_claim:<owner-uuid>`. A founder who has just signed
up should not sit at zero waiting for somebody to be at the console.

### Rejection, resubmission and revocation

A rejected rung is not a dead end: filing it again reopens the same row to
`pending` rather than creating a second one, and the rejection survives in
`public.achievement_reviews`. That table is the decision log — one row per
approve, reject, revoke or reopen, naming the reviewer and the ledger event the
decision wrote. Like `plot_xp_events`, every grant is revoked from the browser
roles.

`revoke_achievement` undoes an approval by posting a negative event under
`correction:<ledger-key>:<n>` and setting the row back to `rejected`. The
original ledger row stays. Only the named rung is revoked — taking back "100+
users" says nothing about whether the founder has ten.

Re-approving after a revocation writes a **new** ledger key,
`<base-key>:reapproved:<n>`, because reusing the first one would make
`apply_plot_xp` recognise it, report `applied = false` and silently grant
nothing.

### Keys

The key on the `project_achievements` row is derived, not supplied:

```
achievement:<achievement_type>:<project_uuid or owner_uuid>
```

`project_achievements_event_key_derived` forces the stored key to exactly that
expression, which is also the ledger key the first approval uses — so the two
idempotency guards cannot drift apart.

### Deciding a claim by hand

The admin console is the intended surface, but the RPCs are reachable from an
administrative session:

```bash
npx supabase db query --local \
  "select * from public.approve_achievement(<id>, '<admin-uuid>', 'Checked the dashboard');"
```

`xp_awarded` on a `project_achievements` row records what the rung was worth when
the claim was filed. It is **not** proof that XP moved — `plot_xp_events` is the
only record of that, and a pending or rejected row has no ledger event at all.

### The XP ceiling

Nothing verifies an achievement — there is no oracle for "100+ users" — which is
why approval exists. Before it, the ceiling on client-minted XP was arithmetic:

```
max client-mintable XP = 10 (claim) + 200 (revenue) + cap x 180
```

Now the only XP a founder can mint unaided is the 10 for claiming their plot.
Everything else is a queue item until somebody approves it, so the per-founder
project cap in `create_project` (`max_projects_per_founder`, currently 10,
mirrored by `MAX_PROJECTS_PER_FOUNDER` in `src/lib/city/constants.ts`) now limits
noise in the review queue rather than the XP supply.

Editing a reward in `achievement_definitions` is **not** retroactive: past ledger
events keep the amount they were written with, and a new `xp_reward` applies to
claims approved afterwards. Editing a threshold in `building_level_milestones`
**is** retroactive, because levels are derived from that table on every award.

## Announcing an approval

Approval is asynchronous: XP arrives when an admin decides, not when the founder
acts. So the city has to be able to say "this landed while you were away" on the
next load, and say it exactly once.

The marker is `plot_claims.rewards_seen_at`. Everything in the ledger after that
instant is unannounced. It is a column rather than something in the browser
because a founder who files a claim on a laptop and opens the city on a phone
should still be told, and `localStorage` would announce the same reward once per
device and never again after a cache clear.

| Function | Callable by | Effect |
| --- | --- | --- |
| `reward_announcement` | `authenticated` | Reads what is waiting. Marks nothing. |
| `acknowledge_rewards` | `authenticated` | Stamps `rewards_seen_at = now()`. |

Reading deliberately does not acknowledge, so a refresh part-way through the
count-up shows the same news again rather than swallowing it. The client calls
`acknowledge_rewards` when the founder dismisses the overlay.

The total is summed from `plot_xp_events`, not from the approvals, so a
revocation that followed an approval nets out and a manual correction is
included. `plot_claimed` is excluded: the signup bonus has its own celebration —
the deed of claim — and would otherwise fire a second one the moment a founder
finished claiming. A window that nets to zero or less announces nothing; nobody
is congratulated on a revocation.

Existing claims were stamped at migration time, so nobody opened the city to a
celebration of every reward they had ever earned.

The window is `created_at > rewards_seen_at`, compared against transaction
timestamps. Two events in the *same* transaction therefore carry the same
`now()` — which is why the pgTAP tests move the watermark by hand to stand in for
a founder having looked at some earlier point. In production the claim, the
approval and the acknowledgement are three separate transactions and the
timestamps order themselves.

## Evidence

Approval only means something if the reviewer has something to review, so every claim carries
evidence: a link, an uploaded screenshot, or both. A note is optional and never sufficient on its
own — it explains the evidence rather than standing in for it. A claim with neither a link nor a
file is refused with `evidence_required`.

**Evidence is private.** `public.project_achievements` is world-readable, so a revenue screenshot
stored there would be public. It lives in `public.achievement_evidence`, which a founder can read
for their own rows and nobody else can read at all. Uploads go to the private
`achievement-evidence` storage bucket, one folder per founder, keyed on their uuid — enforced twice,
by the storage policy on write and by `apply_project_achievement` before it records the path.

**The ask is data, not code.** Each row of `achievement_definitions` carries `evidence_prompt` (the
question) and `evidence_hint` (the note saying what is wanted), so re-wording an ask is an `UPDATE`.
The users rungs all define what a user is, because otherwise every dispute is the same dispute.

Creating a project files its launch claim, and a live product is its own evidence: `create_project`
falls back to the project's own `website_url` when no launch post is supplied.

## Tuning the economy from the console

Two tables decide what everything is worth, and they behave differently — the console says so on
each page:

| Table | Console page | Retroactive? |
| --- | --- | --- |
| `achievement_definitions` | Achievements | **No.** The XP ledger is append-only, so past awards keep the amount they were written with and a new price applies to claims approved afterwards. |
| `building_level_milestones` | Level milestones | **Yes.** Levels are derived from the table, so `set_level_milestone` re-levels every founder in the same transaction and buildings change height. |

`set_level_milestone` refuses anything that would stop the ladder climbing, and holds level 1 at 0 —
`building_level_for_xp` finds the highest milestone at or below a total, so a non-zero floor would
leave a new founder with no level at all.

Every edit that moves a number lands in `public.admin_config_changes` with the admin who made it and
how many founders it re-levelled, so a founder asking why their building shrank has an answer. Both
RPCs are `service_role` only; the audit table is revoked from the browser roles.
