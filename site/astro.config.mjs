import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";
import { origin } from "./src/build/origin.ts";

// Vercel injects its toolbar (comments, design review) from vercel.live on preview deployments only; the CSP lets it
// in there and nowhere else.
const toolbar = process.env.VERCEL_ENV === "preview";

export default defineConfig({
  site: origin,
  output: "static",
  trailingSlash: "never",
  build: { format: "file" },
  // The end-to-end build goes to its own directory so it never replaces the real build in dist/.
  outDir: process.env.SITE_OUT_DIR ?? "dist",
  integrations: [svelte()],
  // The site renders no Markdown, so Shiki has nothing to highlight; left on, it warns on every build that its
  // inline styles do not fit the CSP.
  markdown: { syntaxHighlight: false },
  // A meta CSP: Astro hashes every script and style it emits (the island bootstrap, explore's inline script, the
  // analytics snippet) into script-src and style-src. Style attributes (view-transition names, CSS variables) are
  // allowed through style-src-attr alone. frame-ancestors is ignored in a meta policy, so vercel.json sends it.
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        `img-src 'self' data:${toolbar ? " https://vercel.live https://vercel.com blob:" : ""}`,
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        ...(toolbar ? ["connect-src 'self' https://vercel.live wss://ws-us3.pusher.com", "frame-src https://vercel.live", "font-src 'self' https://vercel.live https://assets.vercel.com"] : []),
      ],
      scriptDirective: { resources: ["'self'", ...(toolbar ? ["https://vercel.live"] : [])] },
      // The toolbar injects its own styles, so a preview's style-src is 'unsafe-inline' (Astro then drops the hashes).
      styleDirective: { resources: ["'self'", ...(toolbar ? ["https://vercel.live", "'unsafe-inline'"] : []), { resource: "'unsafe-inline'", kind: "attribute" }] },
    },
  },
});
