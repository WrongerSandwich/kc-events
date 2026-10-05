import { getViteConfig } from "astro/config";
import { svelteTesting } from "@testing-library/svelte/vite";

export default getViteConfig({
  plugins: [svelteTesting()],
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
  },
});
