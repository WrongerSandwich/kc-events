// The report form's Vercel function (#129), beside the static pages: Vercel serves a file in api/ at its path,
// /api/report. The token is read here, at request time, and never at build. The logic is src/server/report.ts.
import { handleReport, publishedEvents } from "../src/server/report.js";

export function POST(request: Request): Promise<Response> {
  const { SITE_ORIGIN, VERCEL_PROJECT_PRODUCTION_URL } = process.env;
  const canonical = SITE_ORIGIN ?? (VERCEL_PROJECT_PRODUCTION_URL ? `https://${VERCEL_PROJECT_PRODUCTION_URL}` : undefined);
  const origin = new URL(request.url).origin;
  return handleReport(request, {
    token: process.env.GITHUB_REPORT_TOKEN,
    origins: [origin, ...(canonical ? [canonical] : [])],
    fetch,
    // The event's title and pages come from this deployment's own /events.json, never from the form.
    published: publishedEvents(origin, fetch),
  });
}
