import { configDefaults, defineConfig } from "vitest/config";

// The site has its own vitest config with the Svelte plugin; keep its tests out of the root run.
export default defineConfig({ test: { exclude: [...configDefaults.exclude, "site/**"] } });
