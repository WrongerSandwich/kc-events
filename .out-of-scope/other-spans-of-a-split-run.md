# Showing the other dates of an event on separate spans

An event on separate, non-consecutive dates (two weekends, "October 16-17, 22-24, and 30-31") is recorded at its next span only, and the site shows only that span. It does not say that later spans follow.

## Why this is out of scope

The extraction rules record such an event at its next span on or after today, with every date in its date evidence, because one span from the first date to the last would show it on days it does not happen. Each weekly run moves it to the next span. So the site is never wrong about when the event is on; it only leaves out "and again later".

The other dates are on record, but only in the evidence quote, and evidence is not published: the site's `/events.json` carries the fields the site shows, and the job's own evidence, leads and counters stay in the repository (ADR 0004, "Published dataset" in `CONTEXT.md`). Descriptions cannot carry them either, since the extraction rules keep dates out of the description. Showing the other spans would take a new field all the way through: the extraction schema, the dataset, the golden snapshots, the published contract, and the site.

That is a lot for what it serves. On 2026-10-13, of 426 active events, one had a date quote naming more than one span (Dark Forest at Powell Gardens, #128).

If it is ever done, the light version is an extracted phrase, quoted from the page, of all the event's dates ("October 16-17, 22-24, and 30-31"), checked as evidence like the date is, published, and shown on the event page as "Also on …" when it names more than the recorded span. Structured spans, which would let the run move the event without re-reading, are the heavier version.

## When to reconsider

- Several active events at once are recorded at one span of a longer set.
- A reader reports, or is plainly confused by, an event that seemed to be on only once.

## Prior requests

- #130: "Show an event's other dates when it runs on separate spans (Dark Forest shows only Oct 16–17)"
