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
level. The initial cumulative milestones are:

| Level | Required XP |
| ---: | ---: |
| 1 | 0 |
| 2 | 100 |
| 3 | 300 |
| 4 | 700 |
| 5 | 1,500 |

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

Achievements are the only client-triggered source of XP. The catalog lives in
`public.achievement_definitions` — four rows today, each with an `xp_reward`.
The reward is read *inside* the award function and is never accepted as an
argument, so a client cannot express an amount.

| Type | Reward |
| --- | --- |
| `product_launched` | 50 |
| `gained_users` | 25 |
| `first_dollar` | 75 |
| `mrr_100` | 150 |

Each achievement can be claimed **once per project**. `public.create_project`
mints `product_launched` for the project it creates, in the same transaction, so
a failed award rolls the project back. `public.record_achievement` handles all
four types — including `product_launched`, which stays claimable on the project
that `claim_plot` created, since that one never received an award.

Awards write two rows: `public.project_achievements` and the XP ledger. The key
is derived, not supplied:

```
achievement:<achievement_type>:<project_uuid>
```

`project_achievements_event_key_derived` forces the stored key to that exact
expression, which is also what `apply_project_achievement` hands to
`apply_plot_xp` — so the two idempotency guards cannot drift apart. The
`(project_id, achievement_type)` unique constraint is checked first, so a replay
raises `achievement_already_claimed` **before** the ledger is touched and awards
nothing.

To revoke an achievement, delete the `project_achievements` row and post a
compensating negative event under a *new* key, following the correction pattern
above:

```
correction:achievement:<type>:<project_uuid>:1
```

The original ledger row stays, so a re-claim finds the key already applied and
awards no XP a second time. Revocation is permanent for XP, by design.

### The XP ceiling

Nothing verifies an achievement — there is no oracle for "reached $100 MRR" —
so assume every founder claims all four on every project. The per-founder
project cap in `create_project` (`max_projects_per_founder`, currently 10,
mirrored by `MAX_PROJECTS_PER_FOUNDER` in `src/lib/city/constants.ts`) is
therefore the real ceiling:

```
max client-mintable XP = 10 (claim) + cap x 300
```

`project_achievements.status` ships defaulting to `'approved'` and nothing reads
it yet. When the admin console lands, flip that default to `'pending'` and move
the `apply_plot_xp` call from submission to approval; the column exists now so
rows written before then never have to be retro-classified.
