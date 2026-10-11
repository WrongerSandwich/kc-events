import { configDefaults, defineConfig } from "vitest/config";

// The site has its own vitest config with the Svelte plugin; keep its tests out of the root run.
// `pnpm test:coverage` reports on the job's code only, with no threshold: it shows what no test reaches.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "site/**"],
    coverage: { provider: "v8", include: ["src/**"], reporter: ["text-summary", "html", "json-summary"] },
  },
});
