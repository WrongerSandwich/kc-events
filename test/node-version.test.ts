import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * One Node major everywhere (#87, #88): CI and the fallback workflow read `.nvmrc`, Vercel reads the
 * site's `engines`, the home box runs what the root `engines` allows, and `@types/node` describes the
 * APIs the code may call. A bump that misses one of them fails here.
 */
describe("Node version", () => {
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const root = JSON.parse(read("package.json"));
  const site = JSON.parse(read("site/package.json"));
  const major = read(".nvmrc").trim();

  it("names a single major in .nvmrc", () => {
    expect(major).toMatch(/^\d+$/);
  });

  it("agrees across .nvmrc, both engines and both @types/node", () => {
    expect({
      rootEngines: root.engines.node,
      siteEngines: site.engines.node,
      rootTypes: root.devDependencies["@types/node"].match(/^\^(\d+)\./)?.[1],
      siteTypes: site.devDependencies["@types/node"].match(/^\^(\d+)\./)?.[1],
    }).toEqual({ rootEngines: `>=${major}`, siteEngines: `${major}.x`, rootTypes: major, siteTypes: major });
  });
});
