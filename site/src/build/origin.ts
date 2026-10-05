/**
 * Build-only: the canonical origin for the sitemap, JSON-LD, canonical links, and share tags. It reads the
 * environment, so pages and endpoints import it and islands never do (a test greps). SITE_ORIGIN is set once
 * a custom domain exists; until then Vercel's production URL, so previews are never canonical.
 */
export const origin: string =
  process.env.SITE_ORIGIN ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:4321");
