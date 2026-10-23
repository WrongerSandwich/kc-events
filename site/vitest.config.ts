import { getViteConfig } from "astro/config";
import { svelteTesting } from "@testing-library/svelte/vite";

export default getViteConfig({
  plugins: [svelteTesting()],
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    // The tests load datasets of a handful of events, which a deploy build refuses (MIN_PUBLISHED in load-dataset.ts).
    env: { SITE_ALLOW_SMALL: "1" },
    // `pnpm test:coverage` only; no threshold.
    coverage: { provider: "v8", include: ["src/**"], exclude: ["src/generated/**"], reporter: ["text-summary", "html", "json-summary"] },
  },
});
