# Cite-or-drop: no event publishes without date and venue read from its fetched primary page

Every published event carries a primary URL, and its date and venue must have been read from that fetched page in the current or a recent run: not from a search snippet, not from an aggregator, not from model memory. An event that cannot meet that is held as `unverified` and never rendered. We chose this over best-effort publishing because a confidently wrong date on a public site shared with coworkers is this product's trust-killer and the failure is silent. The cost is thinner coverage when pages are hard to fetch; that is fixed by adding sources, not by relaxing the rule.

**Consequences:** extraction is structured and stores the evidence snippet alongside each value. Any wrong date found in testing is treated as a rules bug to fix, not noise to accept.
