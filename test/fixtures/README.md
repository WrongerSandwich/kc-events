# Test fixtures

Recorded pages and a set of robots.txt files, served by `routes()` in `test/fakes/network.ts`
through the real fetcher in `test/fetcher.test.ts`.

## pages/

Real venue pages, recorded with `pnpm tsx test/fixtures/pages/record.ts <name> <url>` and scrubbed
by it: scripts, styles, inline images, comments and `<head>` metadata gone; only `href`,
`datetime` and `class` attributes kept; tracking parameters dropped from links; any email address
replaced by `someone@venue.test`. What is left is what the run reads: the markup, its text and links.

| File | Recorded from | On |
| --- | --- | --- |
| `recordbar.html` | https://www.therecordbar.com/shows | 2026-10-10 |
| `folly.html` | https://follytheater.org/events/ | 2026-10-10 |

Re-record one when a test needs a page shape these lack, not to keep them current: a test asserts
on what is in the file.

## robots/

| File | What it is |
| --- | --- |
| `recordbar.txt` | recordBar's, recorded with its page: served with status 200 and empty, so no rules |
| `folly.txt` | Folly Theater's, recorded with its page: Yoast's allow-all block and a sitemap |
| `disallows-us.txt` | Disallows `/calendar` to the job's product token, `kc-this-week`, and nothing to anyone else |
| `disallows-others.txt` | Disallows everything to another crawler, and only `/wp-admin/` to the rest |
| `crawl-delay.txt` | A `Crawl-delay` of 3 seconds for every crawler |
