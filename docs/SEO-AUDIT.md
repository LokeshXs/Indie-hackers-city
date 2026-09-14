# SEO audit — 14 September 2026

Scope: repository review of the homepage, shared plot pages, metadata, crawl routes,
and product copy. The intended audience is indie hackers and independent builders
looking to showcase projects and build in public. Keyword direction is inferred
from the product, not a search-volume or competitor study.

## Assessment

The app has distinctive interactive content and individual plot share previews,
but the homepage previously offered little persistent explanatory HTML outside
the WebGL experience. The highest-value fixes are useful visible product copy,
a descriptive search snippet, and consistent crawl metadata.

| Priority | Finding and evidence | Impact | Action |
| --- | --- | --- | --- |
| High | `src/app/page.tsx` rendered only `CityMap3D`; the loading heading disappeared after startup. | Limited persistent content explaining the product to visitors and crawlers. | Added server-rendered, visible content below the map: one lasting H1, how claiming and project showcases work, evidence review, XP rewards, and anonymous exploration. Loading title uses H2. |
| High | Root title was only the brand; description was “A city shaped by the progress of independent builders.” | Search snippets did not explain the product or its audience. | Added descriptive title and specific, factual description shared with OG and Twitter metadata. |
| Medium | Homepage had no canonical metadata despite claim and auth query parameters. | Multiple URLs can represent the same page. | Homepage canonical points to `/`; shared plots retain their own canonical URLs. |
| Medium | No repository robots or sitemap route. | No explicit sitemap discovery. This alone does not prevent indexing. | Added `/robots.txt` and `/sitemap.xml`, listing the homepage. API/auth paths excluded from crawling; assets remain accessible. |
| Medium | Preview deployments inherited indexable defaults. | Public previews can duplicate the production site. | Vercel preview deployments emit noindex, nofollow and an empty sitemap. Dev routes explicitly noindex; reward preview already returns 404 outside development. |
| Low | README claimed product features were still to be introduced. | Outdated public product description. | Replaced with current, repository-supported capabilities. |

The selected boardwalk OG image, accessible image descriptions, English document
language, responsive viewport defaults, and individual share-page metadata were
already present. No blanket homepage canonical was added to the root layout.

## Limits and follow-up

- Live homepage, robots and sitemap retrieval through the web tool failed. This
  is a tool-access limitation, not evidence that the production site is down.
- Search Console, analytics reports, index coverage, backlinks and keyword
  volumes were not available. No ranking or traffic claims can be made.
- No browser/CrUX performance measurements were collected. The WebGL scene,
  large loading background, minimum two-second loader and three analytics
  integrations merit a measured mobile performance review. Existing intentional
  animation timing was retained; no Core Web Vitals pass/fail is claimed.
- Confirm `NEXT_PUBLIC_SITE_URL` is the production HTTPS origin in production.
  Submit `/sitemap.xml` in Search Console after deployment, then use URL Inspection
  to check the rendered copy and canonical. Check preview robots behavior separately.
- Shared plot URLs remain indexable with individual canonical and social metadata;
  they are not automatically enumerated in the sitemap. A future founder directory
  should offer stable public profile URLs, useful HTML profiles and discoverable
  links before expanding search-targeted pages.
- Validate any structured data with a rendered browser or Rich Results Test before
  making coverage claims. This audit does not infer schema absence from stripped
  fetched HTML, and does not add unsupported reviews, ratings or organization facts.
- Published contact and privacy/terms information would improve trust; these need
  accurate operator details and policies, so no facts or legal copy were invented.

## Reference

[Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
supports useful people-first content, descriptive titles, canonicalization,
accessible resources and sitemap discovery. These changes improve the foundation;
they do not guarantee indexing or rankings.
