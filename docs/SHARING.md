# Plot sharing

The progress card opens a share modal that captures the loaded city using a separate
camera. Each opening creates a new snapshot with current XP, identity, development
revision, and day/night phase. Retrying within the same opening reuses its request ID.
Published snapshots and their PNG files are immutable.

The server renders a 1200×630 card from the scene capture and database-owned profile
data. The modal, PNG download, Open Graph image, and X card use the same saved image.
Share on X opens the composer with a caption and public `/share/[shareId]` URL.
Visitors load the city and smoothly arrive at the shared plot, then see its details.
Camera interaction cancels arrival; reduced motion skips the animation.

## Deployment

1. Apply `supabase/migrations/20260913180000_add_plot_shares.sql` to the target
   Supabase project through the normal migration process. It creates the snapshot
   table, storage bucket, ownership policies, and preparation/publication functions.
2. Set `NEXT_PUBLIC_SITE_URL` to the public HTTPS application origin before building
   and deploying (for example, `https://your-city.example`). Local development falls
   back to `http://localhost:3000`.
3. Verify a share while signed in, its download, and an anonymous visit to its URL.
   Validate the X preview against the deployed public URL; localhost is not public.

The migration has been applied locally only. No remote deployment is performed by
the feature itself. Historical images preserve their snapshot, while their links
visit the current city. If the plot has changed owners, arrival is unavailable.

## Bundled font

`src/lib/sharing/fonts/Overpass.ttf` is the static Overpass Bold font from
https://github.com/googlefonts/overpass/blob/main/Desktop%20Fonts/Overpass-Bold.ttf.
Its SIL Open Font License is bundled alongside it as `OFL.txt`. The share renderer
loads this local font without a runtime font download.

## Checks

`npm test`, `npm run db:test`, `npx tsc --noEmit`, `npm run lint`, and
`npm run build -- --webpack` cover application behavior, database ownership and
snapshot immutability, typing, lint, and production compilation. The image-rendering
test uses a deterministic scene fixture; real WebGL capture requires browser QA.
