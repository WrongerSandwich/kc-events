// A wrong-listing report goes to the repository's "Wrong listing" issue form (.github/ISSUE_TEMPLATE/wrong-listing.yml),
// which labels it needs-triage for any reporter; the form's fields are prefilled by their ids (#129).

export const REPORT_TEMPLATE = "wrong-listing.yml";

export interface ReportContext {
  title: string;
  /** The event's page on this site. */
  event: string;
  primaryUrl: string;
  eventUrl?: string;
}

export function reportUrl(repoUrl: string, context?: ReportContext): string {
  const params = new URLSearchParams({ template: REPORT_TEMPLATE });
  if (context) {
    params.set("title", `Wrong listing: ${context.title}`);
    params.set("event", context.event);
    params.set("primary-page", context.primaryUrl);
    if (context.eventUrl) params.set("event-page", context.eventUrl);
  }
  return `${repoUrl}/issues/new?${params}`;
}
