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
