# Indie Hackers City

Indie Hackers City is a web experience shaped by the progress of independent
builders. This repository currently contains the production-ready application
foundation; product features will be introduced in later stages.

## Requirements

- Node.js 20.9 or newer (Node.js 22 recommended)
- npm
- Docker Desktop (for the local Supabase stack)

## Getting Started

Install the dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in a browser.

## Supabase setup

Copy `.env.local.example` to `.env.local` for local Supabase and copy
`.env.example` to `.env` for hosted Supabase. Never add a secret/service-role
key to a `NEXT_PUBLIC_*` variable.

Database changes live in `supabase/migrations`. The migrations create profiles,
the 64-plot Pioneer District catalog, projects, permanent single-owner plot
claims, the public city projection, RLS policies, Realtime publication
entries, and the validated mutation RPCs.

Run the local stack and rebuild it from migrations with:

```bash
npm run db:start
npm run db:migrate
npm run db:reset
npm run db:test
npm run db:types
```

Supabase Studio is available at [http://localhost:54323](http://localhost:54323).
Stop the stack with `npm run db:stop`.

Google OAuth credentials in `.env.local` configure only the local Auth service.
The hosted project's OAuth provider is configured separately in its Dashboard.

Deploy pending migrations to hosted Supabase with:

```bash
npm run db:migrate:remote
```

See [the Supabase workflow](docs/SUPABASE.md) for first-time linking, creating
migrations, local Studio changes, environment separation, drift recovery, and a
plain-language command glossary.

After pushing, verify that Supabase contains 64 active plots, the three RPCs,
and Realtime publication entries for `profiles`, `projects`, and `plot_claims`.

The profile migration:

- creates a public profile for every existing and future Auth user;
- copies the Google display name and avatar into the profile;
- allows public reads while restricting writes to the profile owner;
- stores a unique X handle without the leading `@`.

## Quality checks

Run the linter:

```bash
npm run lint
```

Create a production build:

```bash
npm run build
```

Run the production server after building:

```bash
npm run start
```

Project deletion, plot release/transfer, and the UI for creating additional
projects are intentionally deferred. The schema already allows multiple projects
per account while enforcing exactly one permanent plot claim per account.
