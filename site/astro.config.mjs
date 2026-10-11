import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";
import { origin } from "./src/build/origin.ts";

export default defineConfig({
  site: origin,
  output: "static",
  trailingSlash: "never",
  build: { format: "file" },
  // The end-to-end build goes to its own directory so it never replaces the real build in dist/.
  outDir: process.env.SITE_OUT_DIR ?? "dist",
  integrations: [svelte()],
  // A meta CSP: Astro hashes every script and style it emits (the island bootstrap, explore's inline script, the
  // analytics snippet) into script-src and style-src. Style attributes (view-transition names, CSS variables) are
  // allowed through style-src-attr alone. frame-ancestors is ignored in a meta policy, so vercel.json sends it.
  security: {
    csp: {
      directives: ["default-src 'self'", "img-src 'self' data:", "object-src 'none'", "base-uri 'self'", "form-action 'self'"],
      styleDirective: { resources: ["'self'", { resource: "'unsafe-inline'", kind: "attribute" }] },
    },
  },
});
