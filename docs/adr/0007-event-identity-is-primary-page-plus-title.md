# An event's identity is its primary page plus its normalized title

Deduplication could key on (title, date, venue), but a date can change and still be the same event, and keying on primary URL alone breaks when a venue uses one calendar URL for every show that month. So an incoming event matches an existing record when its primary URL and normalized title match; failing that, a fuzzy match on normalized title, venue, and a date within a few days. Ids are assigned at first-seen and never change, so a date move is an update that triggers re-judging rather than a new record.
