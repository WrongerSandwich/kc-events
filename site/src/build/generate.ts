/**
 * The command behind `pnpm generate`: writes src/generated/ and public/events.json from the dataset (see
 * write-generated.ts). Run before dev, build, test, and check.
 */
import { fileURLToPath } from "node:url";
import { writeGenerated } from "./write-generated.ts";

const here = new URL(".", import.meta.url);
const root = new URL("../../../", here);
const siteDir = new URL("../../", here);
const datasetPath = fileURLToPath(new URL(process.env.SITE_DATASET ?? "data/events.json", process.env.SITE_DATASET ? siteDir : root));

// SITE_VENUES, like SITE_DATASET, is relative to the site: the end-to-end build's fixture table.
const venuesPath = fileURLToPath(new URL(process.env.SITE_VENUES ?? "data/venues.yaml", process.env.SITE_VENUES ? siteDir : root));

const { eventCount, buildToday } = writeGenerated({
  datasetPath,
  venuesPath,
  configPath: fileURLToPath(new URL("research.config.yaml", root)),
  outDir: fileURLToPath(new URL("../generated/", here)),
  publicDir: fileURLToPath(new URL("public/", siteDir)),
});
console.log(`site: wrote ${eventCount} events for ${buildToday}`);
