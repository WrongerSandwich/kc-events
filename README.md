# KC This Week

A weekly researched, ad-free list of what's worth doing in Kansas City: **[www.kcthisweek.com](https://www.kcthisweek.com)**

The front page is the picks (one-offs and limited runs worth going out of the way for, each with a one-line reason), grouped by horizon, with the always-there events below. The explorer slices every active event by date, kind, region, and search, and every slice is a shareable URL. Events can be saved in the browser and exported to a calendar. No ads, no accounts, no cookies.

## How a week's list is made

Once a week a research job reads Kansas City venue and organizer pages directly. Two rules shape what it publishes:

- **Cite or drop.** A date and a venue are published only when they were read from the venue's or organizer's own page, never from a listings site or a search result. An event the job cannot cite is held back, not guessed at. Every event shows when it was last verified.
- **A pick is scarcity of occurrence.** A model picks the one-offs and limited runs you would regret missing, under written rules, with a reason for each, and tags them Don't miss. Recurring events are never picks.

The listings and the reasons are written by a model, and the site says so. The rules it works by are plain Markdown in [`prompts/`](prompts/): [`extraction-rules.md`](prompts/extraction-rules.md) for reading a page, [`curation-prompt.md`](prompts/curation-prompt.md) for the picks. The sources it checks are [`data/registry.yaml`](data/registry.yaml). Each run writes a report to [`data/runs/`](data/runs/).

More: the site's [About page](https://www.kcthisweek.com/about), the design in [`PROPOSAL.md`](PROPOSAL.md), the decisions in [`docs/adr/`](docs/adr/), and the terms in [`CONTEXT.md`](CONTEXT.md).

## The data

- [`/events.json`](https://www.kcthisweek.com/events.json): every active event, with the fields the site shows. Free to reuse under CC BY 4.0 (below).
- [`/llms.txt`](https://www.kcthisweek.com/llms.txt): the site, the dataset, and how to cite it, for language models and other readers.
- `/e/<id>.ics`: one event as a calendar file.
- [`data/events.json`](data/events.json): the full dataset the job keeps, including held-back and expired records and the evidence quotes.

## Wrong listing?

Use "Wrong? Report it" on the event's page: a short form there sends the report with no account, and it is posted publicly as an issue here. Or [open a wrong-listing report](https://github.com/WrongerSandwich/kc-events/issues/new?template=wrong-listing.yml) on GitHub, with the event, the page it links to, and what is wrong.

## For venues

The job fetches pages once a week, identifying itself as `kc-this-week`, and obeys `robots.txt`. To keep it off your site, add a `User-agent: kc-this-week` group with `Disallow: /`. Each listing links to your own event page. To correct a listing, use "Wrong? Report it" on the event's page; to ask for your calendar page to be read, [open an issue](https://github.com/WrongerSandwich/kc-events/issues/new). See [For venues](https://www.kcthisweek.com/about#for-venues).

## Running it

Node 24 (`.nvmrc`) and pnpm.

```sh
pnpm install
pnpm test                                    # the research job's tests
pnpm typecheck
pnpm --filter kc-events-site dev             # the site, from the committed dataset
pnpm -r test                                 # both packages
```

`pnpm research` runs the job once. It needs `OPENROUTER_API_KEY` and `TAVILY_API_KEY` in the environment or a gitignored `.env` (`scripts/hand-run-setup.sh` walks through it), and it writes `data/events.json` and a report under `data/runs/`. [`AGENTS.md`](AGENTS.md) has every command and how the pieces fit.

The repository is two packages: the research job in `src/` (one pure `run` function in `src/run.ts`, with the network, model, and clock behind ports) and the site in `site/` (Astro, deployed on Vercel). The dataset is committed: a weekly run commits `data/events.json`, and the site builds from it.

## Licenses

- The code is under the [MIT License](LICENSE).
- The data in [`data/`](data/) and the published `/events.json` are under [CC BY 4.0](data/LICENSE): reuse them freely, with a link back to [www.kcthisweek.com](https://www.kcthisweek.com). Text quoted from venue and organizer pages stays its publishers'.
