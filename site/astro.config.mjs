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
});
