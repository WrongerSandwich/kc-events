/**
 * Prints, one per line, the Always there picks this week's data leaves off the front page (alwaysThereWarnings in
 * src/lib/always-there.ts), as of the last run's day. scripts/weekly-run.sh adds them to the run report's "Site checks"
 * section and its health-issue line; they never stop a run. Prints nothing when every pick finds its event.
 *
 *   pnpm --filter kc-events-site always-there
 */
import { fileURLToPath } from "node:url";
import { alwaysTherePicks } from "../src/always-there.ts";
import { LAST_RUN, loadPublished } from "../src/build/load-dataset.ts";
import { alwaysThereWarnings } from "../src/lib/always-there.ts";

const path = (p: string) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const { events } = loadPublished({ datasetPath: path("data/events.json"), configPath: path("research.config.yaml"), today: LAST_RUN });
for (const line of alwaysThereWarnings(events, alwaysTherePicks)) console.log(line);
