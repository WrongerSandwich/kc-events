// The report form's Vercel function (#129), beside the static pages: Vercel serves a file in api/ at its path,
// /api/report. The token is read here, at request time, and never at build. The logic is src/server/report.ts.
import { handleReport } from "../src/server/report.js";

export function POST(request: Request): Promise<Response> {
  const { SITE_ORIGIN, VERCEL_PROJECT_PRODUCTION_URL } = process.env;
  const canonical = SITE_ORIGIN ?? (VERCEL_PROJECT_PRODUCTION_URL ? `https://${VERCEL_PROJECT_PRODUCTION_URL}` : undefined);
  return handleReport(request, {
    token: process.env.GITHUB_REPORT_TOKEN,
    origins: [new URL(request.url).origin, ...(canonical ? [canonical] : [])],
    fetch,
  });
}
