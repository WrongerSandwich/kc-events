import { defineConfig } from "@playwright/test";

// The end-to-end build (fixture dataset, SITE_TODAY) goes to dist-e2e/ and is previewed from there, so it never
// replaces the real build in dist/ that the size check and the built-output tests read.
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  use: { baseURL: "http://localhost:4321", trace: "retain-on-failure" },
  webServer: { command: "pnpm build:e2e && pnpm preview:e2e", port: 4321, reuseExistingServer: false, timeout: 180_000 },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
