/**
 * The research command: loads a gitignored `.env`, runs `research()` (`research.ts`) in the working
 * directory with the real adapters, and prints a summary. That writes the dataset and the run report
 * (Markdown plus JSON twin): only a dataset that validates, and none of the three truncated.
 * BROWSER_CHANNEL=chrome has the browser fetcher use an installed Chrome instead of Playwright's Chromium.
 *
 *   pnpm research [--horizon-weeks N] [--no-discovery]
 *   pnpm research --reverify-only [--days N]    (the midweek re-verification, #253)
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { research } from "./research.js";

async function main() {
  const root = process.cwd();
  if (existsSync(join(root, ".env"))) process.loadEnvFile(join(root, ".env"));

  const { report, written } = await research({ root, args: process.argv.slice(2), env: process.env });

  const { counts, spend, discovery, curation, promotionSuggestions } = report;
  const expired = Object.values(counts.expired).reduce((sum, n) => sum + n, 0);
  if (report.mode === "reverify-only") {
    console.log(`Midweek re-verification ${report.runDate}, the next ${report.windowDays} days: ${report.reverification.pagesRead} page(s) re-read.`);
  }
  console.log(
    `Run ${report.runDate}: ${counts.found} found, ${counts.new} new, ${counts.updated} updated, ${counts.reverified} re-verified, ` +
      `${counts.heldUnverified} held unverified, ${counts.heldForPromotion} held for promotion, ${counts.releasedForPromotion} released by promotion, ${expired} expired; ` +
      `${spend.totalUsd.toFixed(4)} of ${spend.capUsd} USD` +
      (spend.capHit
        ? `, cap hit (${spend.shortfall.pagesNotExtracted} page(s) not extracted, ${spend.shortfall.eventsNotReverified} event(s) not re-verified, ` +
          `${spend.shortfall.queriesNotSearched} search(es) not made, ${spend.shortfall.leadsNotFollowed} lead(s) not followed, ` +
          `${spend.shortfall.eventsNotCurated} event(s) not curated).`
        : "."),
  );
  if (discovery.enabled) {
    console.log(
      `Discovery: ${discovery.queries} search(es), ${discovery.aggregatorPages} index page(s) read for links, ` +
        `${discovery.pagesExtracted} primary page(s) extracted; ${promotionSuggestions.length} promotion suggestion(s).`,
    );
  }
  console.log(
    `Curation: ${curation.calls} call(s), ${curation.judged} event(s) judged, ${curation.flagged} flagged don't-miss` +
      (curation.problems.length > 0 ? `, ${curation.problems.length} problem(s).` : "."),
  );
  console.log(`Wrote ${written.join(", ")}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
