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

After pushing, verify that Supabase contains 62 active plots (the other two,
Hopper Way's inner corner and Jobs Avenue's shore side, are reserved for the
Coffee House and the corner store), the three RPCs,
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

### Day and night

The map has two lighting phases, switched by hand from the control in the
bottom-left corner of the HUD. There is no clock: the city stays where it is put,
and every visitor starts in daylight.

A switch takes about 1.4 seconds, and the whole city crosses together — sky, fog,
the sun becoming the moon, the sea, every lit window, and the HUD panels. Visitors
who ask their system for reduced motion get the two phases with no travel between
them.

Daylight is unchanged from before the feature existed: `MORNING_ENVIRONMENT` in
`src/lib/city/time-of-day.ts` holds the exact values the scene used to hardcode, so
anything that looks different in daylight is a bug rather than a decision.

What lights up after dark is driven by material name, listed in
`NIGHT_EMISSIVE_MATERIALS` in `src/components/city-map/city-assets.ts`. Those names
are the ones the Blender scripts under `scripts/` give their lit surfaces, and
`city-assets.test.ts` checks every one of them against the shipped `.glb` files —
a name matching nothing is otherwise silent, and shows up only as one dark building
in a lit street. Adding a model to the kit means adding its lit surfaces there.

The street lamps also carry a halo and a pool of light, and bloom is added at night
only: the effect pass is mounted when the city is dark and unmounted when it is not,
so daylight renders down exactly the path it always did. Tuning the look is a matter
of that material table and the two palettes, and nothing else.

### Work from Cafe

The map subscribes to a public Supabase Realtime Presence channel per cafe
(`cafe:<entity.id>`). Visitors can view presence; the UI requires Google sign-in
before publishing a seat. Presence contains only the displayed name, approved
Google avatar URL, optional intention, account ID, and seat timestamps/ID. Treat
it as ephemeral, client-reported social activity, not an authoritative record
for rewards or access control. No database migration is needed; the configured
Supabase project must allow public Realtime channels.

Each account counts once across connected tabs/devices. A browser stores its
seat choice locally for up to 12 hours to resume refreshes/reconnections; storage
alone never counts as online. Leaving propagates to other tabs in that browser.
Disconnected sockets disappear according to Supabase's connection timeout.
Intentions are public while seated. The cafe soundtrack loads only after an
explicit Play click: no audio element or source is created on map load, panel
open, or joining a seat. The current `song1.mp3` loops, with personal pause,
mute, and volume controls. Closing the panel keeps playback running; leaving
the map stops it. Refreshing never automatically starts music.

The track is not in the app bundle. It streams from the Cloudflare R2 bucket whose
public base URL is `NEXT_PUBLIC_CAFE_SONG_URL`, and the player reports itself
unconfigured rather than requesting a missing file when that is unset. At 128 kbps
across 52 minutes it is ~50 MB, but `preload="none"` and R2's range support mean a
listener only transfers the stretch they actually hear.

Other map viewers receive silent, grouped join notices. Initial sync, known seat
IDs, existing accounts, and the viewer's own arrivals do not produce notices.
The cafe panel includes a notification preference saved in the browser.

Run `node scripts/cafe-realtime-smoke.mjs` to verify join/update/leave delivery
with two clients on a unique test channel, using the same environment configuration
as the development app. It never publishes activity into a real cafe channel.
