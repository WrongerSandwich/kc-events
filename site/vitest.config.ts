import { getViteConfig } from "astro/config";
import { svelteTesting } from "@testing-library/svelte/vite";

export default getViteConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["test/setup.ts"],
    // The tests load datasets of a handful of events, which a deploy build refuses (MIN_PUBLISHED in load-dataset.ts).
    env: { SITE_ALLOW_SMALL: "1" },
    // "unit" is `pnpm test`, what CI gates pull requests on: code, on fixtures and the generated modules. "data" is `pnpm test:data`, the
    // checks of what the build makes of the committed dataset (*.data.test.ts), which scripts/weekly-run.sh runs on a
    // run's new data before committing it, so a failure stops that commit instead of turning main red after it has
    // deployed (#191). It reads dist/, so it needs `SITE_TODAY=last-run pnpm build` first.
    projects: [
      // The testing library's plugin goes on each project: on the root, its DOM cleanup never reaches them.
      { extends: true, plugins: [svelteTesting()], test: { name: "unit", include: ["test/**/*.test.ts"], exclude: ["test/**/*.data.test.ts"] } },
      { extends: true, plugins: [svelteTesting()], test: { name: "data", include: ["test/**/*.data.test.ts"] } },
    ],
    // `pnpm test:coverage` only; no threshold.
    coverage: { provider: "v8", include: ["src/**"], exclude: ["src/generated/**"], reporter: ["text-summary", "html", "json-summary"] },
  },
});
