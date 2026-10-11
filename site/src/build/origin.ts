import { siteConfig } from "../site.config";

/** The canonical origin the environment names: SITE_ORIGIN, else Vercel's production URL; undefined when neither is set. */
export function knownOrigin(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.SITE_ORIGIN ?? (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined);
}

/** A build that deploys: on Vercel, or under NODE_ENV=production. loadPublished refuses one with no known origin. */
export function isProductionBuild(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production" || Boolean(env.VERCEL);
}

/**
 * Build-only: the canonical origin for the sitemap, JSON-LD, canonical links, and share tags. It reads the
 * environment, so pages and endpoints import it and islands never do (a test greps). SITE_ORIGIN is set once
 * a custom domain exists; until then Vercel's production URL, so previews are never canonical. A local or CI
 * build falls back to the dev server's origin; a production build with neither stops in loadPublished.
 */
export const origin: string = knownOrigin() ?? "http://localhost:4321";

/** public/og.png, the one share card (scripts/share-image.html), for the share tags and the Event JSON-LD: where, its size, and what it says. */
export const shareImage = {
  url: new URL("/og.png", origin).toString(),
  width: 1200,
  height: 630,
  alt: `${siteConfig.name}: ${siteConfig.tagline}`,
} as const;
