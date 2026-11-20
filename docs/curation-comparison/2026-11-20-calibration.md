# Curation prompt comparison 2026-11-20

408 eligible event(s) judged under the current prompt (`c0f3b3a71334`) and a candidate (`8713cc922674`) by `anthropic/claude-sonnet-5.5`, in batches formed as the run forms them, over 11.3 minute(s) of calls this invocation. Made by `pnpm compare-curation` (ADR 0014).

## Repeatability and rate

| Prompt | Events | Repeats | Flipped | Flip rate | Picks | Pick rate | Agree with stored | Stored pick, now not | Now pick, stored not | USD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| current | 408 | 3 | 33 | 8% | 30 | 7% | 402 | 3 | 3 | 1.867 |
| candidate | 408 | 3 | 33 | 8% | 23 | 6% | 399 | 8 | 1 | 1.908 |

- **current**: 30 picks by majority over 408 event(s); the prompt's calibration figure is 25 to 35 over an eight-week horizon of about 400 eligible events.
- **candidate**: 23 picks by majority over 408 event(s); the prompt's calibration figure is 25 to 35 over an eight-week horizon of about 400 eligible events.

Picks by kind (current): music 10, theater/dance 6, festivals/markets 5, sports 4, talks/readings 2, art/exhibitions 1, comedy 1, outdoors/community 1.

Picks by kind (candidate): music 9, theater/dance 5, festivals/markets 3, sports 2, talks/readings 2, comedy 1, outdoors/community 1.

## Flips by majority answer

| Prompt | Answer | Events | Flipped |
| --- | --- | ---: | ---: |
| current | big-name | 11 | 3 |
| current | close | 70 | 24 |
| current | major-run | 4 | 0 |
| current | no | 308 | 5 |
| current | occasion | 2 | 0 |
| current | rare | 3 | 0 |
| current | tradition | 9 | 1 |
| current | unusual | 1 | 0 |
| candidate | big-name | 7 | 0 |
| candidate | close | 68 | 23 |
| candidate | major-run | 2 | 0 |
| candidate | no | 317 | 8 |
| candidate | occasion | 1 | 0 |
| candidate | rare | 3 | 2 |
| candidate | tradition | 8 | 0 |
| candidate | unusual | 2 | 0 |

A flip is an event whose verdict (pick, close, no) differed between repeats of the same prompt; a change of reason alone is not one.

## What moves from the current prompt to the candidate

| Event | Current | Candidate | Current why | Candidate why |
| --- | --- | --- | --- | --- |
| The Berlin Wall. A World Divided. | pick (major-run) | close | A large exhibition built from artifacts, media and personal testimony, tracing the Berlin Wall and the Cold War through its fall. | Nearly a major run as a large exhibition of Cold War artifacts at Union Station, but the page does not say it is assembled from elsewhere or a one-time stop. |
| 30th Annual High School Visual Art Competition | no | close |  | Nearly a tradition, being a 30th annual competition, but it is a student showcase that a small following attends. |
| Evergy Festival of Lights | pick (tradition) | pick (unusual) | Powell Gardens' long-running annual holiday light walk through the botanical garden, a fixture of the Kansas City winter season. | An after-dark walking route through a botanical garden hung with holiday lights, where the setting is the draw. |
| 4th Annual Indigenous Art Market | close | no | Nearly a tradition as a fourth annual market, but it has no particular season and is a small scene event. |  |
| Knights of Lights | pick (tradition) | close | The Renaissance Festival's annual holiday-lights season, opening the weekend after Thanksgiving at the Bonner Springs grounds. | Nearly unusual as a lights event on the Renaissance Festival grounds, but the page gives no description of what it is. |
| NYE LIVE! | pick (occasion) | close | The city's central downtown New Year's Eve party, with fireworks and a midnight ball drop that draw a large crowd. | Nearly an occasion with its fireworks and midnight ball drop downtown, but nothing says how large the crowd is or that it is annual. |
| Andrew's Video Void! 2nd Annual Video Potluck | no | close |  | Nearly unusual, since viewers submit the strange videos, but it is a small scene gathering in an otherwise standard screening format. |
| Dune: Part Three | close | no | Nearly big-name, since the franchise is widely known, but this is an ordinary cinema showing with nothing marking the night as special. |  |
| Jupiter Ensemble | close | pick (rare) | Nearly rare, with a touring early-music ensemble and a star mezzo, but chamber series regularly bring such acts and its scene recognition is narrow. | A touring period-instrument ensemble with a prominent early-music mezzo, bringing Baroque Amazon-themed arias to a chamber series that seldom hosts such a visit. |
| Holiday Choirs | pick (tradition) | close | Crown Center's holiday choir series, with more than 80 area school, church and community choirs singing in its halls through the season. | Nearly a tradition, with more than 80 choirs in the holiday season, but nothing says it is an annual event. |
| Don We Now! | close | no | Nearly a tradition as a chorus's holiday concert, but nothing says it is annual or how long it has run. |  |
| 2026 Pedal Steel Festival | close | no | Nearly unusual as a festival devoted to the pedal steel, but the page says nothing about who plays or what it includes. |  |
| Christmas with Zuzu | close | no | Nearly a tradition as a holiday concert with market and benefit auction, but nothing says it is annual. |  |
| Bach's Musical Offering | pick (rare) | close | The Chamber Music Society of Lincoln Center, one of the country's leading chamber ensembles, rarely plays Kansas City, here with a full Bach program. | Nearly rare, as a touring Lincoln Center chamber ensemble, but nothing says how seldom it plays Kansas City. |
| United We Dance: NYE Rave | close | no | Nearly an occasion as a New Year's Eve party at the Truman, but the page names no lineup or scale. |  |
| Mecum Auctions | close | no | Nearly an occasion given roughly 700 vehicles, but its draw is mostly collectors and buyers rather than the wider city. |  |
| Sugar Plum Fairy Children’s Ball | close | no | Nearly a tradition as a Ballet-linked Nutcracker family event, but nothing says it is annual. |  |
| Kansas City Chiefs vs Arizona Cardinals | close | no | Nearly big-name since everyone knows the Chiefs, but this is an ordinary regular-season home game against a non-marquee opponent. |  |
| Kansas City Chiefs vs New England Patriots | pick (big-name) | no | The Chiefs, a team known well beyond football fans, at home at Arrowhead on a Monday night. |  |
| Kansas City Chiefs vs San Francisco 49ers | pick (big-name) | no | The Chiefs host the 49ers, two teams whose names carry well beyond football fans. |  |
| The Nutcracker | pick (major-run) | pick (tradition) | The Kansas City Ballet's full-scale Nutcracker at the Kauffman, the company's season-defining holiday production with elaborate sets and costumes. | The city's holiday ballet, staged in the Kauffman Center's large hall each December and a seasonal habit for many families. |
| The Nutcracker | pick (major-run) | pick (tradition) | The Kansas City Ballet's Nutcracker at the Kauffman Center, its holiday production and the run most families plan a night around. | The city's holiday ballet, staged in the Kauffman Center's large hall each December and a seasonal habit for many families. |
| The Phantom of the Opera | pick (big-name) | pick (major-run) | One of the best-known titles in musical theater, in the Cameron Mackintosh production, on a touring stop at the Music Hall. | The touring production of the long-running Lloyd Webber musical, with its chandelier and score, stopping in Kansas City for under two weeks. |
| Hip Hop Nutcracker | pick (big-name) | close | A touring production of The Nutcracker set to hip-hop, with a hit-making creator, known well beyond dance audiences, in its one Midland date. | Nearly major-run as a touring holiday production with a one-night stop, but the page gives no detail and it tours widely every year. |

