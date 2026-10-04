# Milestone one grading

<!-- grading:begin header -->
Run 2026-10-03 (`data/runs/2026-10-03.md`), horizon 3 weeks, cap 5 USD.
<!-- grading:end header -->

Counts one and two are Evan's: write under their headings. Counts three and four are filled by `pnpm grade` from the run report and dataset, and their marked blocks are replaced on every re-run; write outside the markers, never inside.

The job ran three times on 2026-10-03, each over the same 3-week horizon with the 5 USD cap, and the report file carries the last run. Run one (16:05) is at commit 9c3119e: 368 found, 338 active, 30 held unverified, 13 flagged, 0.4545 USD. Run two (16:36), after the first audit's fixes: 382 found, 38 new, 324 updated, 9 re-verified, 19 held, 0.2125 USD. Run three (17:01), after the second audit's fixes, is the one below. The first weekly workflow run, also dated 2026-10-03, later overwrote `data/runs/2026-10-03.md` and `.json` with an 8-week report; the graded run three's report and dataset are at commit 7a646aa (`git show 7a646aa:data/runs/2026-10-03.md`). Spend fell by half once the dataset existed, since the extraction model only re-reads pages and curation judges only what changed.

## 1. Found and would propose

Evan, 2026-10-03: none of the 17 don't-miss picks were known beforehand (no active searching, which is the premise). Would genuinely recommend to friends:

- John Green, Hollywood, Ending (Oct 6, Unity Temple on the Plaza)
- 13th Annual Dia de los Muertos Celebration (Oct 17, The Museum of Kansas City)
- Black Country, New Road (Oct 17, The Granada)

Count one: **3**.

Observation: the picks lean heavily toward music. That is the registry's composition, not the curation prompt: 121 of the first run's 338 active events were music, because the seed registry is heavy on concert rooms, the Symphony, and chamber series, and those sources list many dated one-offs, which is the shape the don't-miss question rewards. Museums, parks, and festival organizers mostly yield runs and recurring things. Noted in #17 for the registry.

## 2. Missed that friends knew about

Not measured: Evan does not usually check with friends about upcoming events, so there is no word-of-mouth baseline for this run. The lived acceptance test after the site exists (proposing one thing to friends found through this and not otherwise) covers the same ground.

Count two: **not measured**.

## 3. Wrong or unverifiable dates and venues

<!-- grading:begin count-3 -->
Count three: **18 unverifiable** (held, never published) plus whatever the audit records under "Wrong dates or venues found" below.

Unverifiable: 18 held unverified this run; 20 events are unverified in the dataset. None of them is published.

| Event | Primary page | Why unverified |
| --- | --- | --- |
| Baroque at 7:00: Vivaldi's Four Seasons | https://www.kcsymphony.org/upcoming-events/ | no venue could be cited |
| Dancing in the Street: Music of Motown | https://www.kcsymphony.org/upcoming-events/ | no venue could be cited |
| Alisa Weilerstein, cello and Inon Barnatan, piano in duo recital | https://www.hjseries.org/ | no venue could be cited |
| Stars of American Ballet | https://www.hjseries.org/ | no venue could be cited |
| Matinees for Schools | https://kcballet.org/ | no venue could be cited |
| Roundtable Conversation Series | https://kcrep.org/ | no venue could be cited |
| Prelude Conversation Series | https://kcrep.org/ | no venue could be cited |
| CCA Quarterly Mix & Mingle | https://kccrossroads.org/ | no venue could be cited |
| FrankenWines | https://kclibrary.org/events | no venue could be cited |
| Panel 2: The End of the World (But Make It Weird) | https://www.heartlandbookfest.org/schedule | no venue could be cited |
| World Series of Barbecue | https://americanroyal.com/calendar/ | no venue could be cited |
| 4-H/FFA Livestock Judging Contest | https://americanroyal.com/calendar/ | no venue could be cited |
| Meats Judging Contests | https://americanroyal.com/calendar/ | no venue could be cited |
| Collegiate Livestock Judging Contest | https://americanroyal.com/calendar/ | no venue could be cited |
| Mother Nature Reads | https://kcparks.org/ | no venue could be cited |
| Hike with a Naturalist | https://kcparks.org/ | no venue could be cited |
| The Wizard of Oz | https://kcballet.org/performances-events-at-the-kc-ballet/ | no venue could be cited |
| Matinees for Schools | https://kcballet.org/performances-events-at-the-kc-ballet/ | no venue could be cited |
| KC Oktoberfest 2026 | https://kcoktoberfest.com/ | no date could be cited |
| Walktober Returns to Four New Locations | https://kcparks.org/ | no venue could be cited |

Wrong: 414 active events are published. Each date and venue below was read from the page named, and the text it was read from is beside it. 25 readings were flagged mechanically; the audit checks every row against its primary page regardless.

### Flagged for checking

- 2026 Gala: Rodeo Nouveau: the venue evidence does not mention "Charlotte Street’s campus" (https://charlottestreet.org/2026-event-calendar/)
- Crossroads Artboards: Caroline Honas / Arin Yoon: the date evidence does not mention day 31 (https://charlottestreet.org/2026-event-calendar/)
- First Friday: the venue evidence does not mention "Crossroads Arts District" (https://kccrossroads.org/)
- Liberty's Beacon: An Artistic Light Installation: the date evidence does not mention day 3 (https://www.theworldwar.org/events)
- Liberty's Beacon: An Artistic Light Installation: the date evidence does not mention October (https://www.theworldwar.org/events)
- Liberty's Beacon: An Artistic Light Installation: the date evidence does not mention day 4 (https://www.theworldwar.org/events)
- Liberty's Beacon: An Artistic Light Installation: the date evidence does not mention October (https://www.theworldwar.org/events)
- Phantom of the Opera: starts 2026-12-02, after the horizon ends on 2026-10-24 (https://www.americantheatreguild.com/kansas-city/shows/phantom-of-the-opera-broadway-tickets-kansas-city-music-hall)
- SYMBIOSIS: the venue evidence does not mention "Zhou B Art Center Kansas City" (https://www.zhoubartcenterkc.com/events)
- Kansas City Brew Fest: starts 2027-02-21, after the horizon ends on 2026-10-24 (https://www.kansascitybrewfest.com/)
- The Lights Fest - Kansas City: the date evidence does not mention day 3 (https://www.eventbrite.com/d/mo--kansas-city/october/)
- The Lights Fest - Kansas City: the date evidence does not mention October (https://www.eventbrite.com/d/mo--kansas-city/october/)
- 2026 Hyde Park Homes Tour: the date evidence does not mention day 3 (https://www.eventbrite.com/d/mo--kansas-city/october/)
- 2026 Hyde Park Homes Tour: the date evidence does not mention October (https://www.eventbrite.com/d/mo--kansas-city/october/)
- Havana Night Party on Rock Island Bridge: the date evidence does not mention day 3 (https://www.eventbrite.com/d/mo--kansas-city/october/)
- Havana Night Party on Rock Island Bridge: the date evidence does not mention October (https://www.eventbrite.com/d/mo--kansas-city/october/)
- Kansas City Engaged Fall Wedding Show: the date evidence does not mention day 4 (https://www.eventbrite.com/d/mo--kansas-city/october/)
- Kansas City Engaged Fall Wedding Show: the date evidence does not mention October (https://www.eventbrite.com/d/mo--kansas-city/october/)
- 2026 State of Downtown: the date evidence does not mention day 7 (https://www.eventbrite.com/d/mo--kansas-city/october/)
- 2026 State of Downtown: the date evidence does not mention October (https://www.eventbrite.com/d/mo--kansas-city/october/)
- Cougars & Jaguars, Big Gata Energy: the date evidence does not mention day 7 (https://www.eventbrite.com/d/mo--kansas-city/october/)
- Cougars & Jaguars, Big Gata Energy: the date evidence does not mention October (https://www.eventbrite.com/d/mo--kansas-city/october/)
- Theology Beer Camp 2026: the date evidence does not mention day 8 (https://www.eventbrite.com/d/mo--kansas-city/october/)
- Theology Beer Camp 2026: the date evidence does not mention October (https://www.eventbrite.com/d/mo--kansas-city/october/)
- 2026 HUMP! Film Festival: FALL SEASON: starts 2026-11-12, after the horizon ends on 2026-10-24 (https://btt.boldtypetickets.com/events/185466137/2026-hump-film-festival-fall-season-kansas-city-mo)

### Every active reading

| Event | Date read | Venue read | Date evidence | Venue evidence | Primary page |
| --- | --- | --- | --- | --- | --- |
| The Rite of Spring / Augustin Hadelich Plays Mendelssohn | 2026-10-03 to 2026-10-04 | Helzberg Hall | October 3-4 Various Times | Helzberg Hall | https://www.kauffmancenter.org/events/ |
| My Hero Academia In Concert | 2026-10-06 19:30 | Muriel Kauffman Theatre | October 6 7:30 p.m. | Muriel Kauffman Theatre | https://www.kauffmancenter.org/events/ |
| The Planets | 2026-10-09 to 2026-10-11 | Helzberg Hall | October 9-11 Various Times | Helzberg Hall | https://www.kauffmancenter.org/events/ |
| An Evening with Celtic Thunder 2026: Celebrate Your Favorite Songs | 2026-10-11 19:00 | Muriel Kauffman Theatre | October 11 7 p.m. | Muriel Kauffman Theatre | https://www.kauffmancenter.org/events/ |
| Baroque at 7:00: Vivaldi’s Four Seasons | 2026-10-14 19:00 | Helzberg Hall | October 14 7 p.m. | Helzberg Hall | https://www.kauffmancenter.org/events/ |
| The Wizard of Oz | 2026-10-16 to 2026-10-25 | Muriel Kauffman Theatre | October 16-25 Various Times | Muriel Kauffman Theatre | https://www.kauffmancenter.org/events/ |
| Dancing in the Street: Music of Motown | 2026-10-16 to 2026-10-18 | Helzberg Hall | October 16-18 Various Times | Helzberg Hall | https://www.kauffmancenter.org/events/ |
| “At the Heart of Kansas City” | 2026-10-19 19:00 | Helzberg Hall | October 19 7 p.m. | Helzberg Hall | https://www.kauffmancenter.org/events/ |
| Interstellar Live | 2026-10-23 to 2026-10-25 | Helzberg Hall | October 23-25 Various Times | Helzberg Hall | https://www.kauffmancenter.org/events/ |
| Interstellar Live | 2026-10-23 to 2026-10-25 | Helzberg Hall | October 23-25, 2026 | from Helzberg Hall | https://www.kcsymphony.org/upcoming-events/ |
| Funk 'Em Up | 2026-10-03 19:00 | recordBar | Oct 03 7:00 pm | recordBar 1520 Grand Blvd Kansas City, MO 64108 | https://www.therecordbar.com/shows |
| Stephen Day- The Self Titled Tour | 2026-10-06 19:00 | recordBar | Oct 06 7:00 pm | recordBar 1520 Grand Blvd Kansas City, MO 64108 | https://www.therecordbar.com/shows |
| Dana and Alden: Papa's Boat Tour | 2026-10-07 19:00 | recordBar | Oct 07 7:00 pm | recordBar 1520 Grand Blvd Kansas City, MO 64108 | https://www.therecordbar.com/shows |
| Soda Blonde | 2026-10-08 19:00 | recordBar | Oct 08 7:00 pm | recordBar 1520 Grand Blvd Kansas City, MO 64108 | https://www.therecordbar.com/shows |
| Cheekface | 2026-10-09 19:00 | recordBar | Oct 09 7:00 pm | recordBar 1520 Grand Blvd Kansas City, MO 64108 | https://www.therecordbar.com/shows |
| Frizzi 2 Fulci | 2026-10-09 19:00 | Grand Temple | Oct 09 7:00 pm | recordBar presents Frizzi 2 Fulci : Fabio Frizzi and the F2F Band at the Grand Temple | https://www.therecordbar.com/shows |
| Paris Williams | 2026-10-10 19:00 | recordBar | Oct 10 7:00 pm | recordBar 1520 Grand Blvd Kansas City, MO 64108 | https://www.therecordbar.com/shows |
| Cus Campbell | 2026-10-11 19:00 | recordBar | Oct 11 7:00 pm | recordBar 1520 Grand Blvd Kansas City, MO 64108 | https://www.therecordbar.com/shows |
| ML Buch | 2026-10-12 19:00 | recordBar | Oct 12 7:00 pm | recordBar 1520 Grand Blvd Kansas City, MO 64108 | https://www.therecordbar.com/shows |
| The Wildwoods | 2026-10-13 19:00 | recordBar | Oct 13 7:00 pm | recordBar 1520 Grand Blvd Kansas City, MO 64108 | https://www.therecordbar.com/shows |
| Letdown. | 2026-10-15 19:00 | recordBar | Oct 15 7:00 pm | recordBar 1520 Grand Blvd Kansas City, MO 64108 | https://www.therecordbar.com/shows |
| The Kawsies | 2026-10-16 19:00 | recordBar | Oct 16 7:00 pm | recordBar 1520 Grand Blvd Kansas City, MO 64108 | https://www.therecordbar.com/shows |
| Diesel Boy x DJ Craze | 2026-10-17 19:00 | recordBar | Oct 17 7:00 pm | recordBar 1520 Grand Blvd Kansas City, MO 64108 | https://www.therecordbar.com/shows |
| Kyle Hume | 2026-10-19 19:00 | recordBar | Oct 19 7:00 pm | recordBar 1520 Grand Blvd Kansas City, MO 64108 | https://www.therecordbar.com/shows |
| Michigander | 2026-10-20 19:00 | recordBar | Oct 20 7:00 pm | recordBar 1520 Grand Blvd Kansas City, MO 64108 | https://www.therecordbar.com/shows |
| Improvement Movement | 2026-10-21 19:00 | recordBar | Oct 21 7:00 pm | recordBar 1520 Grand Blvd Kansas City, MO 64108 | https://www.therecordbar.com/shows |
| Ak'chamel | 2026-10-22 19:00 | recordBar | Oct 22 7:00 pm | recordBar 1520 Grand Blvd Kansas City, MO 64108 | https://www.therecordbar.com/shows |
| Fountain City Comedy Fest - Jaron Myers | 2026-10-23 16:30 | recordBar | Oct 23 4:30 pm | recordBar 1520 Grand Blvd Kansas City, MO 64108 | https://www.therecordbar.com/shows |
| Fountain City Comedy Fest - Zach Noel Towers | 2026-10-23 21:30 | recordBar | Oct 23 9:30 pm | recordBar 1520 Grand Blvd Kansas City, MO 64108 | https://www.therecordbar.com/shows |
| Fountain City Comedy Fest - Olivia Carter | 2026-10-24 19:00 | recordBar | Oct 24 7:00 pm | recordBar 1520 Grand Blvd Kansas City, MO 64108 | https://www.therecordbar.com/shows |
| Fountain City Comedy Fest - Aaron Branch | 2026-10-24 21:30 | recordBar | Oct 24 9:30 pm | recordBar 1520 Grand Blvd Kansas City, MO 64108 | https://www.therecordbar.com/shows |
| Taking Back Sunday | 2026-10-04 19:00 | The Midland | Sun, Oct 4, 2026 Show 7:00 PM | The Midland 1228 Main Street Kansas City, Missouri 64105 | https://www.midlandkc.com/events |
| Parcels | 2026-10-06 20:00 | The Midland | Tue, Oct 6, 2026 Show 8:00 PM | The Midland 1228 Main Street Kansas City, Missouri 64105 | https://www.midlandkc.com/events |
| Jordan Jensen | 2026-10-08 19:30 | The Midland | Thu, Oct 8, 2026 Show 7:30 PM | The Midland 1228 Main Street Kansas City, Missouri 64105 | https://www.midlandkc.com/events |
| Taste of Chaos | 2026-10-13 18:00 | The Midland | Tue, Oct 13, 2026 Show 6:00 PM | The Midland 1228 Main Street Kansas City, Missouri 64105 | https://www.midlandkc.com/events |
| Mojo Brookzz | 2026-10-16 19:00 | The Midland | Fri, Oct 16, 2026 Show 7:00 PM | The Midland 1228 Main Street Kansas City, Missouri 64105 | https://www.midlandkc.com/events |
| Skillet | 2026-10-20 19:00 | The Midland | Tue, Oct 20, 2026 Show 7:00 PM | The Midland 1228 Main Street Kansas City, Missouri 64105 | https://www.midlandkc.com/events |
| Hot Wheels Monster Trucks Live | 2026-10-03 to 2026-10-04 | T-Mobile Center | Oct 3 - 4 | T-Mobile Center 1407 Grand Boulevard / Kansas City, MO 64106 | https://www.t-mobilecenter.com/events |
| Doja Cat | 2026-10-06 | T-Mobile Center | Oct 6 | T-Mobile Center 1407 Grand Boulevard / Kansas City, MO 64106 | https://www.t-mobilecenter.com/events |
| Elevation Nights | 2026-10-09 | T-Mobile Center | Oct 9 | T-Mobile Center 1407 Grand Boulevard / Kansas City, MO 64106 | https://www.t-mobilecenter.com/events |
| Disney Worlds Collide Concert Tour | 2026-10-17 | T-Mobile Center | Oct 17 | T-Mobile Center 1407 Grand Boulevard / Kansas City, MO 64106 | https://www.t-mobilecenter.com/events |
| PBR Outlaw Days | 2026-10-23 to 2026-10-25 | T-Mobile Center | Oct 23 - 25 | T-Mobile Center 1407 Grand Boulevard / Kansas City, MO 64106 | https://www.t-mobilecenter.com/events |
| Alisa Weilerstein, cello and Inon Barnatan, Piano in Duo Recital | 2026-10-09 19:00 | Folly Theater | October 9 @ 7:00 pm | Events from April 26 – June 7 > Folly Theater | https://follytheater.org/events/ |
| Linda May Han Oh | 2026-10-10 19:30 | Folly Theater | October 10 @ 7:30 pm | Events from April 26 – June 7 > Folly Theater | https://follytheater.org/events/ |
| Calvin Arsenia | 2026-10-13 20:00 | Folly Theater | On Tuesday, October 13, 2026, Arsenia returns to the historic Folly Theater | Events from April 26 – June 7 > Folly Theater | https://follytheater.org/events/ |
| Furia Tanguera | 2026-10-16 19:30 | Folly Theater | October 16 @ 7:30 pm | Events from April 26 – June 7 > Folly Theater | https://follytheater.org/events/ |
| Good Trouble | 2026-10-17 19:00 | Folly Theater | October 17 @ 7:00 pm | Events from April 26 – June 7 > Folly Theater | https://follytheater.org/events/ |
| Art of the Piano: Gabriela Montero | 2026-10-21 19:00 | Folly Theater | October 21 @ 7:00 pm | Events from April 26 – June 7 > Folly Theater | https://follytheater.org/events/ |
| Stars of American Ballet | 2026-10-23 19:00 | Folly Theater | October 23 @ 7:00 pm | Events from April 26 – June 7 > Folly Theater | https://follytheater.org/events/ |
| Adam Larson Workshop | 2026-10-10 10:30 | The Blue Room | Improvisation, composition & music business · Saturday, Oct 10 at 10:30 am | The Blue Room | https://americanjazzmuseum.org/ |
| VOCES8: Towards Paradise | 2026-10-03 19:00 | Village Presbyterian Church | 7:00PM, Saturday, October 3, 2026 | Village Presbyterian Church | https://chambermusic.org/concerts-events/ |
| Modigliani Quartet | 2026-10-16 19:00 | St. Paul’s Episcopal Church | 7:00PM, Friday, October 16, 2026 | St. Paul’s Episcopal Church | https://chambermusic.org/concerts-events/ |
| Gretchaninoff: Passion Week | 2026-10-04 | The Cathedral of the Immaculate Concepti | Gretchaninoff: Passion Week Sun, Oct 04 | The Cathedral of the Immaculate Concepti | https://www.kcchorale.org/concerts |
| Punk vs. Metal 5 | 2026-10-03 18:00 | The Bottleneck | October 2026; Sat 3 October 3 ... Doors at 5pm // Show at 6pm | The Bottleneck | https://thebottlenecklive.com/events-default/ |
| Shiner | 2026-10-04 19:00 | The Bottleneck | October 2026; Sun 4 October 4 ... Doors at 6pm // Show at 7pm | The Bottleneck | https://thebottlenecklive.com/events-default/ |
| Silent Theory – The Redemption Tour | 2026-10-05 18:00 | The Bottleneck | October 2026; Mon 5 October 5 ... Doors at 5pm // Show at 6pm | The Bottleneck | https://thebottlenecklive.com/events-default/ |
| Edgehill – The Moving Out Tour | 2026-10-06 19:00 | The Bottleneck | October 2026; Tue 6 October 6 ... Doors at 6pm // Show at 7pm | The Bottleneck | https://thebottlenecklive.com/events-default/ |
| El Ten Eleven | 2026-10-07 20:00 | The Bottleneck | October 2026; Wed 7 October 7 ... Doors at 7pm // Show at 8pm | The Bottleneck | https://thebottlenecklive.com/events-default/ |
| Weedeater | 2026-10-08 19:30 | The Bottleneck | October 2026; Thu 8 October 8 ... Doors at 7pm // Show at 7:30pm | The Bottleneck | https://thebottlenecklive.com/events-default/ |
| Hovvdy | 2026-10-09 20:00 | The Bottleneck | October 2026; Fri 9 October 9 ... Doors at 7pm // Show at 8pm | The Bottleneck | https://thebottlenecklive.com/events-default/ |
| Red Leather – Tahoe Tour | 2026-10-10 20:00 | The Bottleneck | October 2026; Sat 10 October 10 ... Doors at 7pm // Show at 8pm | The Bottleneck | https://thebottlenecklive.com/events-default/ |
| Micah y Los Rayos | 2026-10-11 19:00 | The Bottleneck | October 2026; Sun 11 October 11 ... Doors at 6pm // Show at 7pm | The Bottleneck | https://thebottlenecklive.com/events-default/ |
| Osees ft. Brigid Dawson | 2026-10-13 20:00 | The Bottleneck | October 2026; Tue 13 October 13 ... Doors at 7pm // Show at 8pm | The Bottleneck | https://thebottlenecklive.com/events-default/ |
| Son Venezuela | 2026-10-03 21:00 | The Granada | Sat 3 October 3 Son Venezuela All Ages Doors at 8pm // Show at 9pm | The Granada | https://thegranada.com/events-default/ |
| Rocky Horror Picture Show | 2026-10-09 19:00 | The Granada | Fri 9 October 9 Rocky Horror Picture Show 18+ Early Show: Doors at 6pm // Show at 7pm Late Show: Doors at 9:15pm // Show at 10pm | The Granada | https://thegranada.com/events-default/ |
| 19th Annual Lawrence Zombie Walk | 2026-10-15 15:00 | South Park gazebo | Thu 15 October 15 19th Annual Lawrence Zombie Walk All Ages FREE! Gather at the South Park gazebo at 3pm – walk at dusk! | Gather at the South Park gazebo at 3pm | https://thegranada.com/events-default/ |
| Boogie T | 2026-10-16 20:00 | The Granada | Fri 16 October 16 Boogie T With SubDocta, TXANA, LOVE // HATE, and BUERG 18+ Doors at 8pm // Show at 8pm | The Granada | https://thegranada.com/events-default/ |
| Black Country, New Road | 2026-10-17 20:00 | The Granada | Sat 17 October 17 Black Country, New Road With Dagmar Zuniga All Ages Doors at 7pm // Show at 8pm | The Granada | https://thegranada.com/events-default/ |
| Catch Your Breath – Not Broken Enough Tour | 2026-10-21 19:00 | The Granada | Wed 21 October 21 Catch Your Breath – Not Broken Enough Tour With TX2, Arankai, and Colorblind All Ages Doors at 6pm // Show at 7pm | The Granada | https://thegranada.com/events-default/ |
| Silent Ave – Country As Buck Tour | 2026-10-23 20:00 | The Granada | Fri 23 October 23 Silent Ave – Country As Buck Tour With Park3rboy, KEYBOY, Grizz Lee, D-Twist, and Almighty Oz All Ages Doors at 7pm // Show at 8pm | The Granada | https://thegranada.com/events-default/ |
| GOLDEN: A K-Pop Kids Party at The Granada | 2026-10-24 12:00 | The Granada | Sat 24 October 24 GOLDEN: A K-Pop Kids Party at The Granada All Ages Doors at 11am // Show at 12pm | GOLDEN: A K-Pop Kids Party at The Granada | https://thegranada.com/events-default/ |
| THE ROSELINE* ALBUM RELEASE W/ Gracie Hughes & Her Band | 2026-10-03 18:00 | Replay Lounge | October 3 @ 6:00 pm – 9:00 pm | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| Daturday Night LIVE – 1st Saturdays on the Patio! | 1st Saturdays, 10:00 pm–1:30 am | Replay Lounge | October 3 @ 10:00 pm – 1:30 am Daturday Night LIVE – 1st Saturdays on the Patio! | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| Beneather // Bag of Teeth // Death Pig | 2026-10-03 22:00 | Replay Lounge | October 3 @ 10:00 pm – 1:30 am | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| The Steppers // The Big Sky // Super Tremolo Brothers | 2026-10-04 18:00 | Replay Lounge | October 4 @ 6:00 pm – 9:00 pm | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| PADDY O’TRIVIA HOSTED BY AVERY BROW | Every Monday, 6pm–9pm | Replay Lounge | October 5 @ 6:00 pm – 9:00 pm October 12 @ 6:00 pm – 9:00 pm | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| KARAOKE JONES | Every Monday, 10pm–close | Replay Lounge | October 5 @ 10:00 pm – 1:30 am October 12 @ 10:00 pm – 1:30 am | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| Open Mic Hosted By Greg Pelligreen | Every Tuesday, 6pm–9pm | Replay Lounge | October 6 @ 6:00 pm – 9:00 pm October 13 @ 6:00 pm – 9:00 pm | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| DJ Not-So-Silent-Bob | Sundays, 10pm–1:30am | Replay Lounge | October 4 @ 10:00 pm – 1:30 am October 11 @ 10:00 pm – 1:30 am October 18 @ 10:00 pm – 1:30 am | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| Matt Pless // Futch Dog // blushroom | 2026-10-07 18:00 | Replay Lounge | October 7 @ 6:00 pm – 9:00 pm | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| Matt Axton & Badmoon // Beer Bellies | 2026-10-08 18:00 | Replay Lounge | October 8 @ 6:00 pm – 9:00 pm | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| room 96 // Dj Set | 2026-10-08 22:00 | Replay Lounge | October 8 @ 10:00 pm – 1:30 am | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| Madaam // Sweet Tea // Tink Marie // DayVOE // Yanna Babii // 3mani9 // Dym n D // Faith Brazy // Lae Marie // MoMo Gisselle | 2026-10-08 22:00 | Replay Lounge | October 8 @ 10:00 pm – 1:30 am | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| Litvar // Benjamin Cartel // Til Willis | 2026-10-09 18:00 | Replay Lounge | October 9 @ 6:00 pm – 9:00 pm | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| 2nd Friday’s W/ DJ S.Cruz | 2nd Fridays, 10pm–1:30am | Replay Lounge | October 9 @ 10:00 pm – 1:30 am 2nd Friday’s W/ DJ S.Cruz | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| Idle Freaks // Arc Flash // Junkyard Royalty | 2026-10-09 22:00 | Replay Lounge | October 9 @ 10:00 pm – 1:30 am | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| GRVNDPA- 2nd Saturdays on the Patio! | 2nd Saturdays, 10:00 pm–1:30 am | Replay Lounge | October 10 @ 10:00 pm – 1:30 am GRVNDPA- 2nd Saturdays on the Patio! | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| Marcel P. Black // Approach // Greg Humble | 2026-10-10 22:00 | Replay Lounge | October 10 @ 10:00 pm – 1:30 am | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| The Keen | 2026-10-11 18:00 | Replay Lounge | October 11 @ 6:00 pm – 9:00 pm | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| The 3rd Kansas Cavalry Unit // Tyler Gregory // East of Abilene | 2026-10-15 18:00 | Replay Lounge | October 15 @ 6:00 pm – 9:00 pm | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| Wake // Dj Set | 2026-10-15 22:00 | Replay Lounge | October 15 @ 10:00 pm – 1:30 am | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| Notebook // Acne Prone // Public Broadcast Radio | 2026-10-15 22:00 | Replay Lounge | October 15 @ 10:00 pm – 1:30 am | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| DJ G Train – 3rd Friday’s on the Patio! | 3rd Fridays, 10:00 pm–1:30 am | Replay Lounge | October 16 @ 10:00 pm – 1:30 am DJ G Train – 3rd Friday’s on the Patio! | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| Lizard Brain Trust // Seven And a Switchblade // Pimp Magic Guts | 2026-10-16 22:00 | Replay Lounge | October 16 @ 10:00 pm – 1:30 am | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| THIRD SATURDAYS W/ DJ ChanceRomance | 3rd Saturdays, 10pm–1:30am | Replay Lounge | October 17 @ 10:00 pm – 1:30 am THIRD SATURDAYS W/ DJ ChanceRomance | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| The AjayS // Headlight Rivals // Teaser Pony | 2026-10-17 22:00 | Replay Lounge | October 17 @ 10:00 pm – 1:30 am | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| IFPA INTERNATIONAL FLIPPER PINBALL ASSOCIATION TOURNAMENT | 2026-10-18 13:00 | Replay Lounge | October 18 @ 1:00 pm – 6:00 pm | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| Cheery // Cat Fight // Oxford Remedy | 2026-10-18 18:00 | Replay Lounge | October 18 @ 6:00 pm – 9:00 pm | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| DJ Carma Lea at Replay | 2026-10-21 21:00 | Replay Lounge | October 21 @ 9:00 pm – 1:30 am | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| Electricide // Vela // Corners of the Sky | 2026-10-21 22:00 | Replay Lounge | October 21 @ 10:00 pm – 1:30 am | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| Small Uncle // Lovely Late Bloomer // Lucy Gray // Futchdog | 2026-10-22 18:00 | Replay Lounge | October 22 @ 6:00 pm – 9:00 pm | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| JON SABILLÓN // DJ SET | 2026-10-22 22:00 | Replay Lounge | October 22 @ 10:00 pm – 1:30 am | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| Mannequins For Friends // Hoaxes // The Fun Guy | 2026-10-22 22:00 | Replay Lounge | October 22 @ 10:00 pm – 1:30 am | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| Half Tiger Half Bear // Approach // The Frightened Stag | 2026-10-23 18:00 | Replay Lounge | October 23 @ 6:00 pm – 9:00 pm | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| Rich Auntie$ // DJ Set | 2026-10-23 22:00 | Replay Lounge | October 23 @ 10:00 pm – 1:30 am | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| OxyToxin // Horned Wolf // Park Sessions | 2026-10-23 22:00 | Replay Lounge | October 23 @ 10:00 pm – 1:30 am | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| PATIO PARTY W/ DJ CARMA | 2026-10-24 22:00 | Replay Lounge | October 24 @ 10:00 pm – 1:30 am | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| SCUD // Crash // Lard | 2026-10-24 22:00 | Replay Lounge | October 24 @ 10:00 pm – 1:30 am | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| Pretty Yende, soprano | 2026-10-04 | Main Auditorium | October 4, 2026 | Main Auditorium | https://lied.ku.edu/events-all/ |
| KU Jazz Ensembles I, II, III | 2026-10-08 | Main Auditorium | October 8, 2026 | Main Auditorium | https://lied.ku.edu/events-all/ |
| Music and Mental Health: Orchestrating Change | 2026-10-12 | Pavilion | October 12, 2026 | Pavilion | https://lied.ku.edu/events-all/ |
| KU Wind Symphony | 2026-10-14 | Main Auditorium | October 14, 2026 | Main Auditorium | https://lied.ku.edu/events-all/ |
| In Toon – Lights On! 2026 | 2026-10-15 | Main Auditorium | October 15, 2026 | Main Auditorium | https://lied.ku.edu/events-all/ |
| Susan Werner | 2026-10-18 | Pavilion | October 18, 2026 | Pavilion | https://lied.ku.edu/events-all/ |
| Curious George: The Golden Meatball | 2026-10-23 | Main Auditorium | October 23, 2026 | Main Auditorium | https://lied.ku.edu/events-all/ |
| Gayle Singer \| Bridging Form | 2026-09-11 to 2026-10-24 | Lawrence Arts Center | September 11 @ 5:00 pm October 24 @ 8:00 pm | Lawrence Arts Center | https://lawrenceartscenter.org/events-at-lawrence-arts-center/ |
| Karen Matheis \| Migratory Maps | 2026-09-11 to 2026-10-24 | Lawrence Arts Center | September 11 @ 5:00 pm October 24 @ 8:00 pm | Lawrence Arts Center | https://lawrenceartscenter.org/events-at-lawrence-arts-center/ |
| Song for Artists \| Group Show | 2026-09-11 to 2026-10-24 | Lawrence Arts Center | September 11 @ 5:00 pm October 24 @ 8:00 pm | Lawrence Arts Center | https://lawrenceartscenter.org/events-at-lawrence-arts-center/ |
| Art for All: Instructor Spotlight – Traci Bunkers | 2026-10-01 to 2026-10-27 | Lawrence Arts Center | October 1 @ 12:00 pm October 27 @ 4:00 pm | Lawrence Arts Center | https://lawrenceartscenter.org/events-at-lawrence-arts-center/ |
| Skyward \| Theatre & Dance for the Very Young | 2026-10-02 18:00 to 2026-10-03 16:00 | Lawrence Arts Center | October 2 @ 6:00 pm October 3 @ 4:00 pm | Lawrence Arts Center | https://lawrenceartscenter.org/events-at-lawrence-arts-center/ |
| Disney’s The Aristocats KIDS \| Fall Kids Show | 2026-10-02 19:00 to 2026-10-03 17:00 | Lawrence Arts Center | October 2 @ 7:00 pm October 3 @ 5:00 pm | Lawrence Arts Center | https://lawrenceartscenter.org/events-at-lawrence-arts-center/ |
| KU + LAC Artist in Residence Talks | 2026-10-05 18:00 | Lawrence Arts Center | October 5 @ 6:00 pm - 8:00 pm | Lawrence Arts Center | https://lawrenceartscenter.org/events-at-lawrence-arts-center/ |
| Transcendent \| Excerpts from Giselle and Other Works | 2026-10-09 19:00 to 2026-10-10 19:00 | Lawrence Arts Center | October 9 @ 7:00 pm October 10 @ 7:00 pm | Lawrence Arts Center | https://lawrenceartscenter.org/events-at-lawrence-arts-center/ |
| Free State Story Slam \| Unsolved Mystery | 2026-10-09 19:00 | Lawrence Arts Center | October 9 @ 7:00 pm - 9:00 pm | Lawrence Arts Center | https://lawrenceartscenter.org/events-at-lawrence-arts-center/ |
| Film Screening: We Are Fugazi from Washington, D.C. | 2026-10-15 19:30 | Lawrence Arts Center | October 15 @ 7:30 pm - 9:30 pm | Lawrence Arts Center | https://lawrenceartscenter.org/events-at-lawrence-arts-center/ |
| SYT Scholarship Fundraiser Cabaret & Averill Awards | 2026-10-17 19:00 | Lawrence Arts Center | October 17 @ 7:00 pm - 9:00 pm | At Lawrence Arts Center | https://lawrenceartscenter.org/upcoming-performances-at-lawrence-arts-center/ |
| 2026 Ghosting Lawrence: A Theatrical Tour of Downtown Haunts | 2026-10-22 19:00 | Lawrence Arts Center | October 22 @ 7:00 pm October 24 @ 7:30 pm | At Lawrence Arts Center | https://lawrenceartscenter.org/upcoming-performances-at-lawrence-arts-center/ |
| Downtown Underground \| Freedy Johnston: Back on the Road to You | 2026-10-23 19:30 | Lawrence Arts Center | October 23 @ 7:30 pm | At Lawrence Arts Center | https://lawrenceartscenter.org/upcoming-performances-at-lawrence-arts-center/ |
| The Chubby Smith Collection: Guitar & Audio Sale | 2026-10-24 17:00 | Lawrence Arts Center | October 24 @ 5:00 pm | At Lawrence Arts Center | https://lawrenceartscenter.org/upcoming-performances-at-lawrence-arts-center/ |
| Museum Highlights | 2026-10-04 14:00 | Spencer Museum of Art, Loo Gallery | October 4 Tour Museum Highlights 2:00–3:00PM | Spencer Museum of Art, Loo Gallery | https://spencerart.ku.edu/exhibitions-and-events |
| Open Friday | 2026-10-09 10:00 | Spencer Museum of Art, Goddard Study Center | October 9 Activity Open Friday 10:00AM–4:00PM | Spencer Museum of Art, Goddard Study Center | https://spencerart.ku.edu/exhibitions-and-events |
| Art Cart: Transforming Language | 2026-10-10 13:00 | Spencer Museum of Art, Simons Gallery | October 10 Activity Art Cart: Transforming Language 1:00–4:00PM | Spencer Museum of Art, Simons Gallery | https://spencerart.ku.edu/exhibitions-and-events |
| The Wizard of Oz | 2026-10-16 to 2026-10-25 | Kauffman Center for the Performing Arts | Oct 16-25, 2026 | See them for yourself Oct. 16-25 at the Kauffman Center for the Performing Arts | https://kcballet.org/ |
| John Proctor is the Villain | 2026-10-06 to 2026-10-25 | Copaken Stage | Class is in session at Copaken Stage, October 6th – 25th Oct 6 - Oct 25, 2026 | Class is in session at Copaken Stage, October 6th – 25th Copaken Stage (Power & Light district) 1 H&R Block Way, Kansas City, MO 64105 | https://kcrep.org/ |
| Red Like Fruit | 2026-10-14 to 2026-10-25 | Unicorn Theatre | OCTOBER 14 – 25, 2026 | Home - Unicorn Theatre; 3828 Main Street, Kansas City Missouri 64111 | https://unicorntheatre.org/ |
| The Hallelujah Girls | 2026-09-10 to 2026-11-15 | New Theatre & Restaurant | SEP 10, 2026 - NOV 15, 2026 | New Theatre & Restaurant 9229 Foster St Overland Park, KS 66212 | https://www.newtheatre.com/shows |
| 2026 KC Fringe Visual Art Gallery | 2026-10-01 to 2026-10-14 | Union Station Grand Hall | 2026 KC Fringe Visual Art Gallery KC Fringe Visual Arts has returned to Union Station October 1–14 | @ Union Station Grand Hall | https://kcfringe.org/ |
| Maz Jobrani | 2026-10-03 18:00 | The Comedy Club of Kansas City | Sat, Oct 3, 2026 6:00 PM 8:45 PM | The Comedy Club of Kansas City 1130 W 103rd St Kansas City MO 64114 | https://www.thecomedyclubkc.com/events |
| Tim Convy & Sean O'Brien | 2026-10-08 19:00 | The Comedy Club of Kansas City | Thu Oct 8 2026, 7:00 PM | The Comedy Club of Kansas City 1130 W 103rd St Kansas City MO 64114 | https://www.thecomedyclubkc.com/events |
| Open Mic | 2026-10-08 21:30 to 2027-01-07 | The Comedy Club of Kansas City | October 08 - January 07 Thu, Oct 8, 2026 9:30 PM | The Comedy Club of Kansas City 1130 W 103rd St Kansas City MO 64114 | https://www.thecomedyclubkc.com/events |
| Francisco Ramos | 2026-10-09 18:00 to 2026-10-10 | The Comedy Club of Kansas City | October 09 - October 10 Fri, Oct 9, 2026 6:00 PM 8:30 PM Sat, Oct 10, 2026 6:00 PM 8:30 PM | The Comedy Club of Kansas City 1130 W 103rd St Kansas City MO 64114 | https://www.thecomedyclubkc.com/events |
| Jeffrey Keller | 2026-10-11 18:00 | The Comedy Club of Kansas City | Sun, Oct 11, 2026 6:00 PM 8:30 PM | The Comedy Club of Kansas City 1130 W 103rd St Kansas City MO 64114 | https://www.thecomedyclubkc.com/events |
| Sam Tallent | 2026-10-15 19:00 to 2026-10-17 | The Comedy Club of Kansas City | October 15 - October 17 Thu, Oct 15, 2026 7:00 PM Sat, Oct 17, 2026 6:00 PM 8:30 PM | The Comedy Club of Kansas City 1130 W 103rd St Kansas City MO 64114 | https://www.thecomedyclubkc.com/events |
| Rumble Mouth | 2026-10-22 19:00 | The Comedy Club of Kansas City | Thu Oct 22 2026, 7:00 PM | The Comedy Club of Kansas City 1130 W 103rd St Kansas City MO 64114 | https://www.thecomedyclubkc.com/events |
| Rachel Feinstein | 2026-10-23 19:00 to 2026-10-24 | The Comedy Club of Kansas City | October 23 - October 24 Fri, Oct 23, 2026 7:00 PM 9:30 PM Sat, Oct 24, 2026 7:00 PM 9:30 PM | The Comedy Club of Kansas City 1130 W 103rd St Kansas City MO 64114 | https://www.thecomedyclubkc.com/events |
| Book Discussion: How It Feels to Be Alive by Megan O’Grady | 2026-10-03 10:30 | Art Reference Library | Sat, Oct 03 \| 10:30 am – 11:30 am | Art Reference Library | https://www.nelson-atkins.org/events/ |
| Hidden Treasures | 2026-10-03 13:30 | Art Reference Library | Sat, Oct 03 \| 1:30 pm – 3:00 pm | Art Reference Library | https://www.nelson-atkins.org/events/ |
| Loving Vincent | 2026-10-16 19:00 | Tivoli Cinema | Fri, Oct 16 \| 7:00 pm – 9:00 pm | Tivoli Cinema | https://www.nelson-atkins.org/events/ |
| Rear Window | 2026-10-09 18:57 | grassy lawn on the northwest side of the museum’s north plaza | Fri, Oct 09 \| 6:57 pm | Tivoli Under the Stars is located on the grassy lawn on the northwest side of the museum’s north plaza. | https://www.nelson-atkins.org/events/tivoli/ |
| Loving Vincent | 2026-10-16 19:00 | Atkins Auditorium | Fri, Oct 16 \| 7:00 pm – 9:00 pm | Films are presented year-round in Atkins Auditorium. | https://www.nelson-atkins.org/events/tivoli/ |
| The Princess Bride | 2026-10-23 18:37 | grassy lawn on the northwest side of the museum’s north plaza | Fri, Oct 23 \| 6:37 pm | Tivoli Under the Stars is located on the grassy lawn on the northwest side of the museum’s north plaza. | https://www.nelson-atkins.org/events/tivoli/ |
| Edra Soto: the place of dwelling | 2026-01-29 to 2027-03-06 | Kemper Museum of Contemporary Art | On View January 29th, 2026—March 6th, 2027 | Kemper Museum of Contemporary Art | https://www.kemperart.org/ |
| Lie. Sit. Stand. Be Still. | 2026-08-27 to 2027-07-24 | Kemper Museum of Contemporary Art | On View August 27th, 2026—July 24th, 2027 | Kemper Museum of Contemporary Art | https://www.kemperart.org/ |
| Barbara Takenaga: Awestruck | 2026-10-08 to 2027-04-10 | Kemper Museum of Contemporary Art | October 8th, 2026—April 10th, 2027 | Kemper Museum of Contemporary Art | https://www.kemperart.org/ |
| Gallery Conversation with a Kemper Museum Docent | 2026-10-10 13:00 | Kemper Museum of Contemporary Art | October 10th, 2026 1:00—1:45pm | Kemper Museum of Contemporary Art | https://www.kemperart.org/ |
| Dominoes Pop-Up With Kansas City Public Library | 2026-10-22 18:00 | Kemper Museum of Contemporary Art | October 22nd, 2026 6:00—7:15pm | Kemper Museum of Contemporary Art | https://www.kemperart.org/ |
| Totally Tots | 2026-10-23 10:30 | Kemper Museum of Contemporary Art | October 23rd, 2026 10:30—11:30am | Kemper Museum of Contemporary Art | https://www.kemperart.org/ |
| Art & Wellness: Inviting Surprise | 2026-10-23 14:30 | Kemper Museum of Contemporary Art | October 23rd, 2026 2:30—3:30pm | Kemper Museum of Contemporary Art | https://www.kemperart.org/ |
| The Nature of Artificial Intelligence | 2026-10-20 19:00 | The Linda Hall | Tuesday, October 20, 2026 7:00 PM | The Linda Hall: Science Library and Arboretum | https://www.lindahall.org/experience/events/ |
| The Unseen | 2026-08-26 to 2027-02-28 | Nerman Museum of Contemporary Art | August 26, 2026 - February 28, 2027 | Current Exhibitions \| Nerman Museum of Contemporary Art | https://www.nermanmuseum.org/exhibitions/ |
| Judy Chicago: Big Blue Pink | 2026-07-14 to 2026-12-13 | Nerman Museum of Contemporary Art | July 14, 2026 - December 13, 2026 | Current Exhibitions \| Nerman Museum of Contemporary Art | https://www.nermanmuseum.org/exhibitions/ |
| Sport and Spectator | 2026-06-12 to 2026-12-06 | Nerman Museum of Contemporary Art | June 12, 2026 - December 6, 2026 | Current Exhibitions \| Nerman Museum of Contemporary Art | https://www.nermanmuseum.org/exhibitions/ |
| Norman Akers Navigates the Space Between | 2026-06-12 to 2026-12-06 | Nerman Museum of Contemporary Art | June 12, 2026 - December 6, 2026 | Current Exhibitions \| Nerman Museum of Contemporary Art | https://www.nermanmuseum.org/exhibitions/ |
| Carlos Rolón: ALL WE HAVE IS RIGHT NOW | 2026-06-12 to 2026-12-06 | Nerman Museum of Contemporary Art | June 12, 2026 - December 6, 2026 | Current Exhibitions \| Nerman Museum of Contemporary Art | https://www.nermanmuseum.org/exhibitions/ |
| Betsabeé Romero: A Field with Roots (Un campo con raíces) | 2026-04-30 to 2026-12-06 | Nerman Museum of Contemporary Art | April 30, 2026 - December 6, 2026 | Current Exhibitions \| Nerman Museum of Contemporary Art | https://www.nermanmuseum.org/exhibitions/ |
| Amy Kligman: The Salon for Possible Futures | 2025-03-28 to 2026-12-13 | Nerman Museum of Contemporary Art | March 28, 2025 - December 13, 2026 | Current Exhibitions \| Nerman Museum of Contemporary Art | https://www.nermanmuseum.org/exhibitions/ |
| Second Fridays Open Studios | Every Second Friday, 5 to 8 PM | Zhou B Art Center KC | Free and open to the public every Second Friday from 5 to 8 PM. | Second Fridays Open Studios at Zhou B Art Center KC | https://www.zhoubartcenterkc.com/events |
| 2026 Charlotte Street Visual Artist Awards Opening Reception | 2026-10-16 18:00 | Emily & Todd Voth Artspace | Oct. 16, 6–8 PM @ Emily & Todd Voth Artspace | Oct. 16, 6–8 PM @ Emily & Todd Voth Artspace | https://charlottestreet.org/2026-event-calendar/ |
| 2026 Gala: Rodeo Nouveau | 2026-10-24 19:00 | Charlotte Street’s campus | Saturday, October 24, 2026; Sponsor Pre-party from 6-7 PM; Main Event 7-11 PM | The contemporary 20,000 sq. ft. campus is located at 3333 Wyoming Street in midtown Kansas City, Missouri, near Roanoke Park. | https://charlottestreet.org/2026-event-calendar/ |
| Crossroads Artboards: Caroline Honas / Arin Yoon | through 2026-12-31 | 125 Southwest Boulevard | October–December 2026 The current work will remain on view through the end of December 2026. | to be installed at 125 Southwest Boulevard. | https://charlottestreet.org/2026-event-calendar/ |
| Happy Hour | 2026-04-15 to 2026-12-30 | Lifted Spirits Distillery | Wed , April 15, 2026 – Wed , December 30, 2026 | Lifted Spirits Distillery 1734 Cherry St | https://kccrossroads.org/ |
| First Friday | First Friday of every month | Crossroads Arts District | First Friday | First Friday in the Crossroads | https://kccrossroads.org/ |
| The Berlin Wall. A World Divided. Exhibition at Union Station | 2026-05-29 to 2026-12-13 | Union Station Kansas City | Fri , May 29, 2026 – Sun , December 13, 2026 | Union Station Kansas City 30 W. Pershing Road | https://kccrossroads.org/ |
| Body Forth: incarnation, embodiment, and the Christian imagination | 2026-09-04 to 2026-10-31 | Four Chapter Gallery | Fri , September 4, 2026 – Sat , October 31, 2026 | Four Chapter Gallery 208 W 19th St | https://kccrossroads.org/ |
| Cerbera Gallery presents: “BE, AND KNOW” with photographic works by David K. Pugh | 2026-09-04 to 2026-11-21 | Cerbera Gallery | Fri , September 4, 2026 – Sat , November 21, 2026 | Cerbera Gallery 2011 Baltimore | https://kccrossroads.org/ |
| Jones Gallery October Art Show | 2026-10-02 to 2026-11-05 | Jones Gallery | Fri , October 2, 2026 – Thu , November 5, 2026 | Jones Gallery 1717 Walnut | https://kccrossroads.org/ |
| Ongoing Exhibition: “Resquache”, Maria Vasquez Boyd | 2026-10-03 to 2026-11-30 | Bunker Center for The Arts | Sat , October 3, 2026 – Mon , November 30, 2026 | Bunker Center for The Arts 1014 E. 19th Street | https://kccrossroads.org/ |
| Poetry Open Mic Night | 2026-10-05 18:00 | Lifted Spirits Distillery | Mon , October 5, 2026 at 6:00 pm | Lifted Spirits Distillery 1734 Cherry St | https://kccrossroads.org/ |
| My Hero Academia In Concert | 2026-10-06 19:30 | Kauffman Center for the Performing Arts | Tue , October 6, 2026 at 7:30 pm | Kauffman Center for the Performing Arts 1601 Broadway Blvd. | https://kccrossroads.org/ |
| This Might Hurt A Little | 2026-10-07 19:00 | The Bird Comedy Theater | Wed , October 7, 2026 at 7:00 pm | The Bird Comedy Theater 103 W. 19th St. | https://kccrossroads.org/ |
| An Evening with Celtic Thunder | 2026-10-11 19:00 | Kauffman Center for the Performing Arts | Sun , October 11, 2026 at 7:00 pm | Kauffman Center for the Performing Arts 1601 Broadway Blvd. | https://kccrossroads.org/ |
| Crossroads Flea is Back at Mildred’s | 2026-10-11 09:00 | Mildred’s | Sun , October 11, 2026 at 9:00 am Sun , November 8, 2026 at 9:00 am | Mildred’s 1901 Wyandotte | https://kccrossroads.org/ |
| Science City After Hours 21+ | 2026-10-16 17:30 | Union Station Kansas City | Fri, October 16 at 5:30 pm | Union Station Kansas City 30 W. Pershing Road | https://kccrossroads.org/ |
| The Wizard of Oz | 2026-10-16 to 2026-10-25 | Kansas City Ballet | Fri , October 16, 2026 – Sun , October 25, 2026 | Kansas City Ballet 500 W. Pershing Road | https://kccrossroads.org/ |
| Neighborhood Garden Party | 2026-10-20 17:00 | Quercus Art Garden | Neighborhood Garden Party — Hosted by CCA Street Tree Committee and Quercus, 1712 Oak @ 5pm Tue, October 20 at 5:00 pm | Quercus Art Garden | https://kccrossroads.org/ |
| The Secret Show | 2026-10-02 to 2027-02-05 | The Bird Comedy Theater | Fri , October 2, 2026 – Fri , February 5, 2027 | The Bird Comedy Theater 103 W. 19th St. | https://kccrossroads.org/ |
| Art On Walnut | 2026-04-05 08:00 to 2026-10-25 15:00 | City Market | Sun, Apr 5, 2026; Sun, Oct 25, 2026. EVERY SUNDAY \| 8AM - 3PM: ... April thru October! | City Market | https://www.artgardenkc.org/events |
| Halloween HAUNT Art Gallery | through 2026-10-31 | worlds of fun | SEPTEMBER 18TH - OCTOBER 31ST \| 2026 FALL ART GALLERY | worlds of fun | https://www.artgardenkc.org/events |
| South KC Block Party presented by Cable Dahmer | 2026-10-10 10:00 | Red Bridge Shopping Center | SATURDAY, OCTOBER 10, 2026 \| 10AM - 3PM | Red Bridge Shopping Center | https://www.artgardenkc.org/events |
| Exhibition \| State of the Arts 2026 | 2026-09-28 to 2026-11-13 | R.G. Endres Gallery | 09-28-2026 11-13-2026 | Prairie Village Arts Council at R.G. Endres Gallery, Prairie Village | https://artsjoco.org/acjc/calendar-of-events/ |
| Tipping Point - Rebecca Beese | 2026-08-29 to 2026-12-05 | Johnson County Arts & Heritage Center | 08-29-2026 12-05-2026 | Johnson County Arts & Heritage Center at Johnson County Arts & Heritage Center, Overland Park | https://artsjoco.org/acjc/calendar-of-events/ |
| Exhibit \| Recollections: a collaborative exhibition of Poetry & Printmaking | 2026-09-13 to 2026-11-13 | Meadowbrook Park Clubhouse | 09-13-2026 11-13-2026 | Prairie Village Arts Council at Meadowbrook Park Clubhouse, Prairie Village | https://artsjoco.org/acjc/calendar-of-events/ |
| Sport and Spectator | 2026-09-25 to 2026-12-06 | Nerman Museum of Contemporary Art | 09-25-2026 12-06-2026 | Nerman Museum of Contemporary Art at Nerman Museum of Contemporary Art, Overland Park | https://artsjoco.org/acjc/calendar-of-events/ |
| Betsabeé Romero: A Field with Roots (Un campo con raíces) | 2026-09-25 to 2026-12-06 | Nerman Museum of Contemporary Art | 09-25-2026 12-06-2026 | Nerman Museum of Contemporary Art at Nerman Museum of Contemporary Art, Overland Park | https://artsjoco.org/acjc/calendar-of-events/ |
| Carlos Rolón: ALL WE HAVE IS RIGHT NOW | 2026-09-25 to 2026-12-06 | Nerman Museum of Contemporary Art | 09-25-2026 12-06-2026 | Nerman Museum of Contemporary Art at Nerman Museum of Contemporary Art, Overland Park | https://artsjoco.org/acjc/calendar-of-events/ |
| Norman Akers Navigates the Space Between | 2026-09-25 to 2026-12-06 | Nerman Museum of Contemporary Art | 09-25-2026 12-06-2026 | Nerman Museum of Contemporary Art at Nerman Museum of Contemporary Art, Overland Park | https://artsjoco.org/acjc/calendar-of-events/ |
| Tim Murphy Art Gallery: Vantage Points | 2026-10-01 to 2026-10-31 | Tim Murphy Art Gallery | 10-01-2026 10-31-2026 | Merriam Parks & Recreation at Tim Murphy Art Gallery, Merriam | https://artsjoco.org/acjc/calendar-of-events/ |
| Pottery & Pinot | 2026-10-03 18:00 | House of Clay | Sat, Oct 03 @ 6:00 pm Sat, Oct 10 @ 6:00 pm Sat, Oct 17 @ 6:00 pm Sat, Oct 24 @ 6:00 pm Sat, Oct 31 @ 6:00 pm Sat, Nov 07 @ 6:00 pm Sat, Nov 14 @ 6:00 pm Sat, Nov 21 @ 6:00 pm Sat, Nov 28 @ 6:00 pm Sat, Dec 05 @ 6:00 pm Sat, Dec 12 @ 6:00 pm Sat, Dec 19 @ 6:00 pm | House of Clay at House of Clay, Overland Park | https://artsjoco.org/acjc/calendar-of-events/ |
| Kansas City Musical Club - October Concert | 2026-10-05 12:00 | Asbury United Methodist Church | Mon, Oct 05 @ 12:00 pm | Kansas City Musical Club at Asbury United Methodist Church, Prairie Village | https://artsjoco.org/acjc/calendar-of-events/ |
| KC Chorale & Te Deum - Gretchaninoff: Passion Week (at Village Presbyterian) | 2026-10-06 19:30 | Village Presbyterian Church | Tue, Oct 06 @ 7:30 pm | Te Deum at Village Presbyterian Church, Prairie Village | https://artsjoco.org/acjc/calendar-of-events/ |
| Giggle Time Children's Program | 2026-10-07 10:00 | Tomahawk Ridge Community Center | Wed, Oct 07 @ 10:00 am Wed, Nov 04 @ 10:00 am Wed, Dec 02 @ 10:00 am | City of Overland Park, Kansas at Tomahawk Ridge Community Center, Overland Park | https://artsjoco.org/acjc/calendar-of-events/ |
| Olathe Arts Festival | 2026-10-09 17:00 to 2026-10-10 | Johnson County Square | Fri, Oct 09 @ 5:00 pm Sat, Oct 10 @ 11:00 am The 4th Annual Olathe Arts Festival returns to downtown Olathe on October 9-10, 2026 | Olathe Public Art Committee at Johnson County Square, Olathe | https://artsjoco.org/acjc/calendar-of-events/ |
| City Center Live | 2026-10-10 18:30 | Lenexa City Hall | Sat, Oct 10 @ 6:30 pm Sat, Nov 14 @ 6:30 pm Sat, Dec 12 @ 6:30 pm | Lenexa Parks & Recreation at Lenexa City Hall, Lenexa | https://artsjoco.org/acjc/calendar-of-events/ |
| 'The Billy Joel Legacy' | 2026-10-11 19:00 | Midwest Trust Center at Johnson County Community College | Sun, Oct 11 @ 7:00 pm | Midwest Trust Center at Johnson County Community College at Midwest Trust Center at Johnson County Community College, Overland Park | https://artsjoco.org/acjc/calendar-of-events/ |
| Reception & Reading \| Recollections: a collaborative exhibition of Poetry & Printmaking | 2026-10-14 19:00 | Meadowbrook Park Clubhouse | Wed, Oct 14 @ 7:00 pm | Prairie Village Arts Council at Meadowbrook Park Clubhouse, Prairie Village | https://artsjoco.org/acjc/calendar-of-events/ |
| Reinvest to Reinvigorate Neighborhoods | 2026-10-06 18:00 | Plaza Branch | Tuesday, October 6, 2026 6:00pm | Plaza Branch | https://kclibrary.org/events |
| The Fourth Crusade and the Latin Empire of Constantinople | 2026-10-13 18:00 | Plaza Branch | Tuesday, October 13, 2026 6:00pm | Plaza Branch | https://kclibrary.org/events |
| Kemba: Film Screening | 2026-10-15 18:00 | Central Library | Thursday, October 15, 2026 6:00pm | Central Library | https://kclibrary.org/events |
| Blood and Politics: The History of White Nationalism | 2026-10-19 18:00 | Plaza Branch | Monday, October 19, 2026 6:00pm | Plaza Branch | https://kclibrary.org/events |
| The Author's Guide to the Walt Longmire Mysteries | 2026-10-21 18:00 | Central Library | Wednesday, October 21, 2026 6:00pm | Central Library | https://kclibrary.org/events |
| John Green, Hollywood, Ending | 2026-10-06 19:00 | Unity Temple on the Plaza | Date: Tue, 10/6/2026 Time: 7:00pm - 8:00pm | Place: Unity Temple on the Plaza Sanctuary 707 W 47th St Kansas City , MO 64112 United States | https://rainydaybooks.com/events |
| V.E. Schwab, Victorious | 2026-10-07 19:00 | Unity Temple on the Plaza | Date: Wed, 10/7/2026 Time: 7:00pm - 8:30pm | Place: Unity Temple on the Plaza Sanctuary 707 W 47th St Kansas City , MO 64112 United States | https://rainydaybooks.com/events |
| Veronica Roth, The Sixth Faction | 2026-10-13 19:00 | Unity Temple on the Plaza | Date: Tue, 10/13/2026 Time: 7:00pm - 8:30pm | Place: Unity Temple on the Plaza Sanctuary 707 W 47th St Kansas City , MO 64112 United States | https://rainydaybooks.com/events |
| Patrick Coughlin, Dark Side of the Boom | 2026-10-14 19:00 | Rainy Day Books | Date: Wed, 10/14/2026 Time: 7:00pm - 8:00pm | Place: Rainy Day Books The Fairway Shops 2706 W 53rd Street Fairway, KS 66205 | https://rainydaybooks.com/events |
| Lindsay Currie, The Secret Bookstore Sleuth Society | 2026-10-16 16:00 | Johnson County Library | Date: Fri, 10/16/2026 Time: 4:00pm - 5:30pm | This event includes a conversation with Lindsay at Johnson County Library's Centr... | https://rainydaybooks.com/events |
| Leonard Zeskind's, Blood and Politics with KCPL | 2026-10-19 18:00 | Kansas City Public Library: Central Library | Date: Mon, 10/19/2026 Time: 6:00pm - 7:00pm | Place: Kansas City Public Library: Central Library Truman Forum Auditorium 4801 Main St Kansas City , MO 64112 United States | https://rainydaybooks.com/events |
| Thomas Frank, The Creativity Con | 2026-10-22 19:00 | Unity Temple on the Plaza | Date: Thu, 10/22/2026 Time: 7:00pm - 8:00pm | Place: Unity Temple on the Plaza Unity Hall (Downstairs) 707 W 47th St Kansas City , MO 64112 United States | https://rainydaybooks.com/events |
| Dr. DeAngela Burns-Wallace, Made for This | 2026-10-23 19:00 | Rainy Day Books | Date: Fri, 10/23/2026 Time: 7:00pm - 8:00pm | Place: Rainy Day Books The Fairway Shops 2706 W 53rd Street Fairway, KS 66205 | https://rainydaybooks.com/events |
| Detoured: The Making of Bruce R. Watkins Drive | 2026-10-03 | Central Library \| 5th Floor | Saturday, October 3, 2026 9:00 AM 4:00 PM | Central Library \| 5th Floor | https://www.heartlandbookfest.org/schedule |
| A People’s History of Kansas City Soccer! | 2026-10-03 | Central Library \| Guldner Gallery | Saturday, October 3, 2026 9:00 AM 4:00 PM | Central Library \| Guldner Gallery | https://www.heartlandbookfest.org/schedule |
| Hell and High Water: The 1951 Kansas City Flood | 2026-10-03 | Central Library \| Mountain Gallery | Saturday, October 3, 2026 9:00 AM 4:00 PM | Central Library \| Mountain Gallery | https://www.heartlandbookfest.org/schedule |
| Book Tasting Cafe Drop-in Activity | 2026-10-03 09:30 | Central Library \| Vault Lobby | Saturday, October 3, 2026 9:30 AM 11:00 AM | Central Library \| Vault Lobby | https://www.heartlandbookfest.org/schedule |
| Finding the Story: Writing with Archives, Records, and Hidden History | 2026-10-03 09:30 | Central Library \| Room 311 | Saturday, October 3, 2026 9:30 AM 10:00 AM | Central Library \| Room 311 | https://www.heartlandbookfest.org/schedule |
| Writing Horror and the Supernatural | 2026-10-03 09:30 | Central Library \| Room 312 | Saturday, October 3, 2026 9:30 AM 10:00 AM | Central Library \| Room 312 | https://www.heartlandbookfest.org/schedule |
| Felt Bookmark Drop-in Workshop | 2026-10-03 09:30 | Central Library \| Room 310 | Saturday, October 3, 2026 9:30 AM 11:00 AM | Central Library \| Room 310 | https://www.heartlandbookfest.org/schedule |
| Live Art on Canvas | 2026-10-03 10:00 | Central Library \| Sidewalk & Rooftop | Saturday, October 3, 2026 10:00 AM 3:00 PM | Central Library \| Sidewalk & Rooftop | https://www.heartlandbookfest.org/schedule |
| Storytime with Daniel Miyares | 2026-10-03 10:00 | Central Library \| Central Youth Services | Saturday, October 3, 2026 10:00 AM 11:00 AM | Central Library \| Central Youth Services | https://www.heartlandbookfest.org/schedule |
| Tessa Bailey Talks with Sierra Simone about Broken Rival | 2026-10-03 10:00 | Central Library \| Kirk Hall | Saturday, October 3, 2026 10:00 AM 12:30 PM | Central Library \| Kirk Hall | https://www.heartlandbookfest.org/schedule |
| Writing for the Senses | 2026-10-03 10:30 | Central Library \| Room 311 | Saturday, October 3, 2026 10:30 AM 11:00 AM | Central Library \| Room 311 | https://www.heartlandbookfest.org/schedule |
| Join the Club: Boost (or Begin) Your Book Group | 2026-10-03 10:30 | Central Library \| Room 312 | Saturday, October 3, 2026 10:30 AM 11:00 AM | Central Library \| Room 312 | https://www.heartlandbookfest.org/schedule |
| Join the Street Parade | 2026-10-03 11:00 | Central Library | Saturday, October 3, 2026 11:00 AM 12:00 PM | Central Library | https://www.heartlandbookfest.org/schedule |
| D.I.Y. Postcard | 2026-10-03 11:00 | Central Library \| 3North Bookstore Alley | Saturday, October 3, 2026 11:00 AM 3:00 PM | Central Library \| 3North Bookstore Alley | https://www.heartlandbookfest.org/schedule |
| Collaborative Coral Reef Sculpture | 2026-10-03 11:00 | Central Library \| 3North Gallery | Saturday, October 3, 2026 11:00 AM 3:00 PM | Central Library \| 3North Gallery | https://www.heartlandbookfest.org/schedule |
| Panel 1: Small Towns, Big Secrets | 2026-10-03 11:15 | Central Library \| Helzberg | Saturday, October 3, 2026 11:15 AM 12:00 PM | Central Library \| Helzberg | https://www.heartlandbookfest.org/schedule |
| Storytelling Game with Secrets | 2026-10-03 11:30 | Central Library \| Room 310 | Saturday, October 3, 2026 11:30 AM 12:00 PM | Central Library \| Room 310 | https://www.heartlandbookfest.org/schedule |
| Zines for Everyone: A How-to, Drop-in Activity | 2026-10-03 11:30 | Central Library \| Vault Lobby | Saturday, October 3, 2026 11:30 AM 1:00 PM | Central Library \| Vault Lobby | https://www.heartlandbookfest.org/schedule |
| Strike a Pose | 2026-10-03 12:00 | Central Library \| Vault Level | Saturday, October 3, 2026 12:00 PM 3:00 PM | Central Library \| Vault Level | https://www.heartlandbookfest.org/schedule |
| Explore Your Story with Daniel Miyares | 2026-10-03 13:00 | Central Library \| Central Youth Services | Saturday, October 3, 2026 1:00 PM 2:00 PM | Central Library \| Central Youth Services | https://www.heartlandbookfest.org/schedule |
| Victoria Aveyard & Soman Chainani Live Podcast | 2026-10-03 14:00 | Central Library \| Kirk Hall | Saturday, October 3, 2026 2:00 PM 3:00 PM | Central Library \| Kirk Hall | https://www.heartlandbookfest.org/schedule |
| Storytime with Giselle Anatol: Celebrating Childhood Creativity and Promoting the Power of Stories | 2026-10-03 15:00 | Central Library \| Central Youth Services | Saturday, October 3, 2026 3:00 PM 3:30 PM | Central Library \| Central Youth Services | https://www.heartlandbookfest.org/schedule |
| Liberty's Beacon: An Artistic Light Installation | 2026-10-03 19:30 to 2026-10-04 | National WWI Museum and Memorial | Friday, Sept. 25 - Wednesday, Nov. 11, 2026 (Weekends) \| 7:30 p.m. | National WWI Museum and Memorial 2 Memorial Drive, Kansas City, MO 64108 USA | https://www.theworldwar.org/events |
| Hands-on History (Oct. 2026) | Monday, Wednesday, Friday-Sunday, 10 a.m.-1 p.m. | National WWI Museum and Memorial | Monday, Wednesday, Friday-Sunday \| 10 a.m.-1 p.m. | National WWI Museum and Memorial 2 Memorial Drive, Kansas City, MO 64108 USA | https://www.theworldwar.org/events |
| Main Gallery Tours (Oct. 2026) | Monday, Friday-Saturday \| Select times | National WWI Museum and Memorial | Monday, Friday-Saturday \| Select times | National WWI Museum and Memorial 2 Memorial Drive, Kansas City, MO 64108 USA | https://www.theworldwar.org/events |
| Day in the Life: Western Front | 2026-10-04 10:00 | National WWI Museum and Memorial | Sunday, Oct. 4, 2026 \| 10 a.m.-2 p.m. | National WWI Museum and Memorial 2 Memorial Drive, Kansas City, MO 64108 USA | https://www.theworldwar.org/events |
| Homeschool Week (Oct. 2026) | 2026-10-04 10:00 to 2026-10-10 17:00 | National WWI Museum and Memorial | Sunday-Saturday, Oct. 4-10, 2026 \| 10 a.m.-5 p.m. | National WWI Museum and Memorial 2 Memorial Drive, Kansas City, MO 64108 USA | https://www.theworldwar.org/events |
| Educator Professional Development: Equality and WWI | 2026-10-04 19:00 | National WWI Museum and Memorial | Sunday, Oct. 4, 2026 \| 7 p.m. | National WWI Museum and Memorial 2 Memorial Drive, Kansas City, MO 64108 USA | https://www.theworldwar.org/events |
| Tower After Hours (Oct. 2026) | 2026-10-07 17:30 | National WWI Museum and Memorial | Wednesdays, Oct. 7-28, 2026 \| 5:30-8 p.m. | National WWI Museum and Memorial 2 Memorial Drive, Kansas City, MO 64108 USA | https://www.theworldwar.org/events |
| Trivia Night: Tolkien Edition | 2026-10-16 18:30 | National WWI Museum and Memorial | Friday, Oct. 16, 2026 \| 6:30 p.m. | National WWI Museum and Memorial 2 Memorial Drive, Kansas City, MO 64108 USA | https://www.theworldwar.org/events |
| 2026 Exchange Program Concert Series \| KKS Youth Jazz Orchestra | 2026-10-20 18:00 | National WWI Museum and Memorial | Tuesday, Oct. 20, 2026 \| 6 p.m. | National WWI Museum and Memorial 2 Memorial Drive, Kansas City, MO 64108 USA | https://www.theworldwar.org/events |
| Pershing Lecture Series \| The Wars Before the War: The American Civil War | 2026-10-21 18:30 | National WWI Museum and Memorial | Wednesday, Oct. 21, 2026 \| 6:30 p.m. | National WWI Museum and Memorial 2 Memorial Drive, Kansas City, MO 64108 USA | https://www.theworldwar.org/events |
| Recycling Day | 2026-10-10 08:00 | Arrowhead Stadium | Oct 10, 2026 8am–2pm | Arrowhead Stadium Address: 1 Arrowhead Drive Kansas City, Missouri 64129 | https://www.arrowheadstadiumkc.com/events |
| Kansas City Chiefs | Chiefs home games | Arrowhead Stadium | October 18 , 2026 \| 3:25 PM Los Angeles Chargers vs. Kansas City Chiefs November 8 , 2026 \| 12:00 PM New York Jets vs. Kansas City Chiefs November 22 , 2026 \| 12:00 PM Arizona Cardinals vs. Kansas City Chiefs December 21 , 2026 \| 7:15 PM New England Patriots vs. Kansas City Chiefs December 27 , 2026 \| 3:25 PM San Francisco 49ers vs. Kansas City Chiefs | Arrowhead Stadium Address: 1 Arrowhead Drive Kansas City, Missouri 64129 | https://www.arrowheadstadiumkc.com/events |
| Kansas City Mavericks 2026-27 Season | 2026-27 season home games | Cable Dahmer Arena | Friday, October 16th, 2026 Saturday, October 17th, 2026 | Cable Dahmer Arena 19100 E Valley View Pkwy Independence, MO 64055 | https://kcmavericks.com/ |
| SOCCER IN THE CITY: USA VS MEXICO | 2026-10-03 19:00 | KC Live! | October 3, 2026 7:00 PM | KC Live! | https://www.powerandlightdistrict.com/events-and-entertainment/events |
| UFC 332 Watch Party | 2026-10-03 20:00 | McFadden's Sports Saloon | October 3, 2026 8:00 PM | McFadden's Sports Saloon | https://www.powerandlightdistrict.com/events-and-entertainment/events |
| COCA-COLA GAME DAY: KANSAS CITY VS. LAS VEGAS | 2026-10-04 13:00 | KC Live! | October 4, 2026 1:00 PM | KC Live! | https://www.powerandlightdistrict.com/events-and-entertainment/events |
| Jokes By The Slice | 2026-10-08 19:30 | Pizza Bar | October 8, 2026 7:30 PM | Pizza Bar | https://www.powerandlightdistrict.com/events-and-entertainment/events |
| Stoplight Party | 2026-10-09 20:00 | Shark Bar | October 9, 2026 8:00 PM | Shark Bar | https://www.powerandlightdistrict.com/events-and-entertainment/events |
| TALL TOUR KANSAS CITY | 2026-10-10 19:00 | KC Live! | October 10, 2026 7:00 PM | KC Live! | https://www.powerandlightdistrict.com/events-and-entertainment/events |
| Guest Chef's Tasting: Nick Goellner | 2026-10-13 18:30 | Palm Tree KC | October 13, 2026 6:30 PM | Palm Tree KC | https://www.powerandlightdistrict.com/events-and-entertainment/events |
| Tough Enough to Wear Pink | 2026-10-16 20:00 | PBR Big Sky | October 16, 2026 8:00 PM | PBR Big Sky | https://www.powerandlightdistrict.com/events-and-entertainment/events |
| Slice of My Heart Emo Night | 2026-10-16 21:00 | Pizza Bar | October 16, 2026 9:00 PM | Pizza Bar | https://www.powerandlightdistrict.com/events-and-entertainment/events |
| COCA-COLA GAME DAY: KANSAS CITY VS. LOS ANGELES | 2026-10-18 13:00 | KC Live! | October 18, 2026 1:00 PM | KC Live! | https://www.powerandlightdistrict.com/events-and-entertainment/events |
| PBR OUTLAW DAYS FESTIVAL | 2026-10-23 16:00 to 2026-10-25 | Kansas City Power & Light | OCT 23 OCT 25 PBR OUTLAW DAYS FESTIVAL October 23 4:00 PM | Kansas City Power & Light 50 East 13th Street , Suite 200 Kansas City, MO 64106 | https://www.powerandlightdistrict.com/events-and-entertainment/events |
| me n ü at Palm Tree | 2026-10-23 20:00 | Palm Tree KC | October 23, 2026 8:00 PM | Palm Tree KC | https://www.powerandlightdistrict.com/events-and-entertainment/events |
| Boozy Book Fest 2026 | 2026-10-03 16:00 | Kansas City Convention Center | October 3 @ 4:00 pm - 9:00 pm | Kansas City Convention Center | https://kcconvention.com/events/ |
| The Original Lowrider Midwest SuperShow | 2026-10-11 11:00 | Bartle Hall | October 11 @ 11:00 am - 6:00 pm | rolls into Bartle Hall at the Kansas City Convention Center | https://kcconvention.com/events/ |
| Baddies & Bosses Concert | 2026-10-17 19:30 | Kansas City Convention Center | October 17 @ 7:30 pm - 10:00 pm | Kansas City Convention Center | https://kcconvention.com/events/ |
| UMKC Basketball vs Montana State | 2026-10-24 08:00 | Kansas City Convention Center | October 24 @ 8:00 am - 5:00 pm | Kansas City Convention Center | https://kcconvention.com/events/ |
| Infinite Scholars Free College & Scholarship Fair 2026 | 2026-10-24 10:00 | Kansas City Convention Center | October 24 @ 10:00 am - 2:00 pm | Kansas City Convention Center | https://kcconvention.com/events/ |
| UMKC School of Medicine 55th Anniversary Gala | 2026-10-24 17:30 | Kansas City Convention Center | October 24 @ 5:30 pm - 9:30 pm | Kansas City Convention Center | https://kcconvention.com/events/ |
| Farmers Market | Saturdays & Sundays, April – October | City Market | SATURDAYS & SUNDAYS, APRIL – OCTOBER Farmers Market Hours by Season: April–November: Sat & Sun, 8:00 a.m. – 3:00 p.m. | CITY MARKET 20 E. 5th Street Suite 201 Kansas City, MO 64106 | https://thecitymarket.org/events/ |
| Barbecue Hall of Fame | 2026-10-03 | Kansas Speedway | October 3 | Kansas Speedway 400 Speedway Blvd., Kansas City, Kansas, United States | https://americanroyal.com/calendar/ |
| 127th Livestock Show | 2026-10-08 to 2026-10-25 | New American Royal Campus | October 8 - October 25 | New American Royal Campus 1899 American Royal Way, Kansas City, Kansas | https://americanroyal.com/calendar/ |
| Junior Premium Livestock Auction | 2026-10-17 17:00 | New American Royal Campus | October 17 @ 5:00 pm - 9:30 pm | New American Royal Campus 1899 American Royal Way, Kansas City, Kansas | https://americanroyal.com/calendar/ |
| VISUAL VOICE: Moments of Abstraction Exhibit | 2026-09-12 to 2026-11-07 | Bruce R. Watkins Cultural Heritage Center | On Display: Sept. 12 - Nov. 7, 2026 10 a.m. - 6 p.m., Tuesdays – Saturdays | Bruce R. Watkins Cultural Heritage Center 3700 Dr. Martin Luther King Blvd. Kansas City, Missouri 64130 | https://kcparks.org/events/ |
| Mother Nature Reads | 2026-10-03 10:00 | Lakeside Nature Center | October 3 @ 10:00 am - 11:00 am | Lakeside Nature Center 4701 E. Gregory Blvd., Kansas City, MO | https://kcparks.org/events/ |
| Hike with a Naturalist | 2026-10-03 10:30 | Lakeside Nature Center | October 3 @ 10:30 am - 12:00 pm | Lakeside Nature Center 4701 E. Gregory Blvd., Kansas City, MO | https://kcparks.org/events/ |
| Walktober 2026: Gillham Park | 2026-10-04 10:00 | Gillham Park | October 4 @ 10:00 am - 12:00 pm | Gillham Park Gillham Rd. and 41st St., Kansas City, MO, United States | https://kcparks.org/events/ |
| Mobile Music Box Concert: MLK Park | 2026-10-06 18:00 | Martin Luther King, Jr. Park | October 6 @ 6:00 pm - 7:00 pm | Martin Luther King, Jr. Park 4651 Woodland Ave., Kansas City, MO, United States | https://kcparks.org/events/ |
| Brush Creek Art Walk Awards Reception | 2026-10-06 18:00 | The Anita B. Gorman Conservation Discovery Center | October 6 @ 6:00 pm - 8:00 pm | The Anita B. Gorman Conservation Discovery Center 4750 Troost Ave, Kansas City, MO, United States | https://kcparks.org/events/ |
| Puzzle Exchange Night | 2026-10-07 18:00 | Kansas City North Community Center | October 7 @ 6:00 pm - 8:00 pm | Kansas City North Community Center 3930 N.E. Antioch Road, Kansas City, MO, United States | https://kcparks.org/events/ |
| Garden Work Day | 2026-10-10 09:00 | Lakeside Nature Center | October 10 @ 9:00 am - 11:00 am | Lakeside Nature Center 4701 E. Gregory Blvd., Kansas City, MO | https://kcparks.org/events/ |
| Paint & Garden | 2026-10-10 10:00 | Southeast Community Center | October 10 @ 10:00 am - 12:00 pm | Southeast Community Center 4201 E. 63rd Street, Kansas City, MO, United States | https://kcparks.org/events/ |
| Keebler® Spookie Stripes Safari | 2026-10-01 to 2026-10-31 | Kansas City Zoo & Aquarium | October 2026 Keebler® Spookie Stripes Safari October 1 - 31 | © 2026 Kansas City Zoo & Aquarium. All rights reserved. Location 6800 Zoo Drive Kansas City, MO 64132 | https://kansascityzoo.org/events |
| GloWild | 2026-10-01 to 2026-10-31 | Kansas City Zoo & Aquarium | October 2026 GloWild October 1 - 31 | © 2026 Kansas City Zoo & Aquarium. All rights reserved. Location 6800 Zoo Drive Kansas City, MO 64132 | https://kansascityzoo.org/events |
| Homeschool Days | 2026-10-05 | Kansas City Zoo & Aquarium | October 2026 Homeschool Days October 5 | © 2026 Kansas City Zoo & Aquarium. All rights reserved. Location 6800 Zoo Drive Kansas City, MO 64132 | https://kansascityzoo.org/events |
| Brew at the Zoo | 2026-10-10 | Kansas City Zoo & Aquarium | October 2026 Brew at the Zoo October 10 | © 2026 Kansas City Zoo & Aquarium. All rights reserved. Location 6800 Zoo Drive Kansas City, MO 64132 | https://kansascityzoo.org/events |
| FOTZ Annual Meeting | 2026-10-22 | Kansas City Zoo & Aquarium | October 2026 FOTZ Annual Meeting October 22 | © 2026 Kansas City Zoo & Aquarium. All rights reserved. Location 6800 Zoo Drive Kansas City, MO 64132 | https://kansascityzoo.org/events |
| Boo at the Zoo | 2026-10-24 to 2026-10-25 | Kansas City Zoo & Aquarium | October 2026 Boo at the Zoo October 24 - 25 | © 2026 Kansas City Zoo & Aquarium. All rights reserved. Location 6800 Zoo Drive Kansas City, MO 64132 | https://kansascityzoo.org/events |
| Fire Feast | 2026-10-16 | Powell Gardens | Oct 16 Fire Feast | Powell Gardens 1609 N.W. U.S. Highway 50 Kingsville, MO 64061 | https://powellgardens.org/ |
| Dark Forest | 2026-10-16 17:30 to 2026-10-17 | Powell Gardens | October 16–17, 22 (21+), 23–24 and 30–31 October 16, 2026 \| Friday 5:30pm -11:00pm | Powell Gardens 1609 N.W. U.S. Highway 50 Kingsville, MO 64061 | https://powellgardens.org/ |
| Wild and Useful Things: Foraging with the Seasons (October) | 2026-10-17 15:00 | Powell Gardens | Saturday, October 17 \| 3–5 p.m. | Powell Gardens 1609 N.W. U.S. Highway 50 Kingsville, MO 64061 | https://powellgardens.org/ |
| Introduction to Soil Health | 2026-10-03 10:00 | Powell Gardens | Join us October 3 (10 a.m. - 2 p.m.) for Introduction to Soil Health | Powell Gardens 1609 N.W. U.S. Highway 50 Kingsville, MO 64061 | https://powellgardens.org/ |
| Five Finger Death Punch | 2026-10-03 18:45 | Morton Amphitheater | October 3, 2026 Oct 03 Saturday 06:45 PM Sat 6:45 PM | Venue Morton Amphitheater | https://www.ticketmaster.com/discover/kansas-city-mo?categoryId=KZFzniwnSyZfZ7v7nJ |
| Warrant - Turn Up The Good Times Tour | 2026-10-03 19:30 | VooDoo at Harrah's Kansas City | October 3, 2026 Oct 03 Saturday 07:30 PM Sat 7:30 PM | Venue VooDoo at Harrah's Kansas City | https://www.ticketmaster.com/discover/kansas-city-mo?categoryId=KZFzniwnSyZfZ7v7nJ |
| The Struts | 2026-10-03 20:30 | Ameristar Casino and Hotel | October 3, 2026 Oct 03 Saturday 08:30 PM Sat 8:30 PM | Venue Ameristar Casino and Hotel | https://www.ticketmaster.com/discover/kansas-city-mo?categoryId=KZFzniwnSyZfZ7v7nJ |
| Taking Back Sunday | 2026-10-04 19:00 | The Midland Theatre - MO | October 4, 2026 Oct 04 Sunday 07:00 PM Sun 7:00 PM | Venue The Midland Theatre - MO | https://www.ticketmaster.com/discover/kansas-city-mo?categoryId=KZFzniwnSyZfZ7v7nJ |
| BECK: RIDE LONESOME TOUR | 2026-10-04 19:30 | Uptown Theater | October 4, 2026 Oct 04 Sunday 07:30 PM Sun 7:30 PM | Venue Uptown Theater | https://www.ticketmaster.com/discover/kansas-city-mo?categoryId=KZFzniwnSyZfZ7v7nJ |
| The Neo Trapsoul Tour | 2026-10-04 19:30 | Morton Amphitheater | October 4, 2026 Oct 04 Sunday 07:30 PM Sun 7:30 PM | Venue Morton Amphitheater | https://www.ticketmaster.com/discover/kansas-city-mo?categoryId=KZFzniwnSyZfZ7v7nJ |
| Parcels | 2026-10-06 20:00 | The Midland Theatre - MO | October 6, 2026 Oct 06 Tuesday 08:00 PM Tue 8:00 PM | Venue The Midland Theatre - MO | https://www.ticketmaster.com/discover/kansas-city-mo?categoryId=KZFzniwnSyZfZ7v7nJ |
| The Self Titled Tour | 2026-10-06 20:00 | recordBar | October 6, 2026 Oct 06 Tuesday 08:00 PM Tue 8:00 PM | Venue recordBar | https://www.ticketmaster.com/discover/kansas-city-mo?categoryId=KZFzniwnSyZfZ7v7nJ |
| Earl Sweatshirt | 2026-10-07 20:00 | The Truman - Kansas City | October 7, 2026 Oct 07 Wednesday 08:00 PM Wed 8:00 PM | Venue The Truman - Kansas City | https://www.ticketmaster.com/discover/kansas-city-mo?categoryId=KZFzniwnSyZfZ7v7nJ |
| Bayside | 2026-10-08 19:30 | Liberty Hall | October 8, 2026 Oct 08 Thursday 07:30 PM Thu 7:30 PM | Venue Liberty Hall | https://www.ticketmaster.com/discover/kansas-city-mo?categoryId=KZFzniwnSyZfZ7v7nJ |
| Elevation Worship | 2026-10-09 19:00 | T-Mobile Center | October 9, 2026 Oct 09 Friday 07:00 PM Fri 7:00 PM | Venue T-Mobile Center | https://www.ticketmaster.com/discover/kansas-city-mo?categoryId=KZFzniwnSyZfZ7v7nJ |
| Big Head Todd & the Monsters - Winter Tour 2026 | 2026-10-09 19:30 | Uptown Theater | October 9, 2026 Oct 09 Friday 07:30 PM Fri 7:30 PM | Venue Uptown Theater | https://www.ticketmaster.com/discover/kansas-city-mo?categoryId=KZFzniwnSyZfZ7v7nJ |
| Chris Stapleton's All-American Road Show | 2026-10-09 19:30 to 2026-10-10 | Morton Amphitheater | October 9, 2026 Oct 09 Friday 07:30 PM Fri 7:30 PM October 10, 2026 Oct 10 Saturday 07:30 PM Sat 7:30 PM | Venue Morton Amphitheater | https://www.ticketmaster.com/discover/kansas-city-mo?categoryId=KZFzniwnSyZfZ7v7nJ |
| Matt Mathews: Not What I Ordered World Tour | 2026-10-17 18:00 | Ameristar Casino and Hotel | October 17, 2026 Saturday 06:00 PM | Venue Ameristar Casino and Hotel | https://www.ticketmaster.com/discover/kansas-city-mo?categoryId=KZFzniwnSyZfZ7v7na&classificationId=KnvZfZ7vAe1 |
| Yeehaw! A Benefit for Kansas City | 2026-10-23 20:00 | Uptown Theater | October 23, 2026 Friday 08:00 PM | Venue Uptown Theater 3700 Broadway, Kansas City, MO 64111, US | https://www.ticketmaster.com/discover/kansas-city-mo?categoryId=KZFzniwnSyZfZ7v7na&classificationId=KnvZfZ7vAe1 |
| PBR OUTLAW DAYS FESTIVAL | 2026-10-23 16:00 to 2026-10-25 | PBR Big Sky | OCT 23 OCT 25 PBR OUTLAW DAYS FESTIVAL October 23 4:00 PM | PBR Big Sky | https://powerandlightdistrict.com/events-and-entertainment/events |
| Kansas City Current vs. Bay FC | 2026-10-03 17:30 | CPKC Stadium | Saturday 05:30 PM Sat 5:30 PM ... 10/3/26, 5:30 PM | Venue CPKC Stadium | https://www.ticketmaster.com/discover/kansas-city-mo?categoryId=KZFzniwnSyZfZ7v7nE |
| Shamrock FC Mixed Martial Arts | 2026-10-10 19:30 | Ameristar Casino and Hotel | Saturday 07:30 PM Sat 7:30 PM ... 10/10/26, 7:30 PM | Venue Ameristar Casino and Hotel | https://www.ticketmaster.com/discover/kansas-city-mo?categoryId=KZFzniwnSyZfZ7v7nE |
| Sporting Kansas City vs. Portland Timbers | 2026-10-10 19:30 | Children's Mercy Park | Saturday 07:30 PM Sat 7:30 PM ... 10/10/26, 7:30 PM | Venue Children's Mercy Park | https://www.ticketmaster.com/discover/kansas-city-mo?categoryId=KZFzniwnSyZfZ7v7nE |
| Kansas Jayhawks Mens Basketball vs. Pittsburg State Gorillas Mens Basketball | 2026-10-16 19:00 | Allen Fieldhouse | Friday 07:00 PM Fri 7:00 PM ... 10/16/26, 7:00 PM | Venue Allen Fieldhouse | https://www.ticketmaster.com/discover/kansas-city-mo?categoryId=KZFzniwnSyZfZ7v7nE |
| Sporting Kansas City vs. Real Salt Lake | 2026-10-17 19:30 | Children's Mercy Park | Saturday 07:30 PM Sat 7:30 PM ... 10/17/26, 7:30 PM | Venue Children's Mercy Park | https://www.ticketmaster.com/discover/kansas-city-mo?categoryId=KZFzniwnSyZfZ7v7nE |
| Kansas Jayhawks Womens Volleyball vs. Arizona State Sun Devils Womens Volleyball | 2026-10-18 12:00 | Horejsi Family Volleyball Arena | Sunday 12:00 PM Sun 12:00 PM ... 10/18/26, 12:00 PM | Venue Horejsi Family Volleyball Arena | https://www.ticketmaster.com/discover/kansas-city-mo?categoryId=KZFzniwnSyZfZ7v7nE |
| Kansas City Chiefs v Los Angeles Chargers | 2026-10-18 15:25 | Arrowhead Stadium | Sunday 03:25 PM Sun 3:25 PM ... 10/18/26, 3:25 PM | Venue Arrowhead Stadium | https://www.ticketmaster.com/discover/kansas-city-mo?categoryId=KZFzniwnSyZfZ7v7nE |
| Kansas Jayhawks Mens Basketball vs. Louisville Cardinals Mens Basketball | 2026-10-21 | Allen Fieldhouse | Wednesday 12:00 AM Wed ... 10/21/26, 12:00 AM | Venue Allen Fieldhouse | https://www.ticketmaster.com/discover/kansas-city-mo?categoryId=KZFzniwnSyZfZ7v7nE |
| PBR Teams: Outlaw Days | 2026-10-23 19:45 to 2026-10-25 13:45 | T-Mobile Center | Friday 07:45 PM Fri 7:45 PM ... 10/23/26, 7:45 PM Saturday 06:45 PM Sat 6:45 PM ... 10/24/26, 6:45 PM Sunday 01:45 PM Sun 1:45 PM ... 10/25/26, 1:45 PM | Venue T-Mobile Center | https://www.ticketmaster.com/discover/kansas-city-mo?categoryId=KZFzniwnSyZfZ7v7nE |
| Kansas Jayhawks Football vs. Baylor Bears Football | 2026-10-24 | Memorial Stadium-KS | Saturday 12:00 AM Sat ... 10/24/26, 12:00 AM | Venue Memorial Stadium-KS | https://www.ticketmaster.com/discover/kansas-city-mo?categoryId=KZFzniwnSyZfZ7v7nE |
| Sporting Kansas City vs. Austin FC | 2026-10-24 19:30 | Children's Mercy Park | Saturday 07:30 PM Sat 7:30 PM ... 10/24/26, 7:30 PM | Venue Children's Mercy Park | https://www.ticketmaster.com/discover/kansas-city-mo?categoryId=KZFzniwnSyZfZ7v7nE |
| Los Angeles Chargers vs. Kansas City Chiefs | 2026-10-18 15:25 | Arrowhead Stadium | October 18 , 2026 \| 3:25 PM | Arrowhead Stadium Address: 1 Arrowhead Drive Kansas City, Missouri 64129 | https://www.arrowheadstadiumkc.com/ |
| Barn Party Night | 2026-10-16 19:05 | Cable Dahmer Arena | Friday, October 16th, 2026 Barn Party Night The Mavericks will celebrate opening weekend with Barn Party on Friday, Oct. 16. Fans can kick off the 2026-27 season with a night centered around welcoming hockey back to Kansas City. Puck Drops: 7:05 PM CT | Cable Dahmer Arena 19100 E Valley View Pkwy Independence, MO 64055 | https://kcmavericks.com/ |
| Rapid City Rush @ Kansas City Mavericks | 2026-10-17 18:05 | Cable Dahmer Arena | Saturday, October 17th, 2026 Rapid City Rush @ Kansas City Mavericks Puck Drops: 6:05 PM CT | Cable Dahmer Arena 19100 E Valley View Pkwy Independence, MO 64055 | https://kcmavericks.com/ |
| Twin Peaks | 2026-10-20 19:00 | Crossroads, Kansas City | Tue, Oct 20 7:00 PM | Venue Crossroads, Kansas City | https://rooftopcinemaclub.com/us/kansas-city/crossroads-kansas-city/screenings/twin-peaks-25047 |
| 'We Are Latinos V' Drive-In Screening | 2026-10-22 18:00 | Boulevard Drive-In Theatre | Thu, Oct 22 • 6:00 PM | Boulevard Drive-In Theatre | https://www.eventbrite.com/b/mo--kansas-city/film-and-media/ |
| Next Stop Comedy | 2026-10-17 20:00 | Lifted Spirits Distillery | Sat, Oct 17 • 8:00 PM | Lifted Spirits Distillery | https://www.eventbrite.com/b/mo--kansas-city/film-and-media/ |
| Special Screening + Cast & Filmmakers Q&A | 2026-10-09 19:00 | DISTRKCT | Fri, Oct 9 • 7:00 PM | DISTRKCT | https://www.eventbrite.com/b/mo--kansas-city/film-and-media/ |
| Open Jam | Thursday, 8:00 PM | The Bird Comedy Theater | Thursday • 8:00 PM + 8 more | The Bird Comedy Theater | https://www.eventbrite.com/b/mo--kansas-city/film-and-media/ |
| The Hunger / Fang Favorites | 2026-10-04 19:00 | Stray Cat Film Center | Sunday, October 4, 2026 7:00 PM 9:00 PM | Stray Cat Film Center (map) ... 1662 Broadway Blvd, Kansas City, MO 64108 | https://www.straycatfilmcenter.com/screeningsandevents |
| Gypsy 83: The Director's Cut | 2026-10-08 19:00 | Stray Cat Film Center | Thursday, October 8, 2026 7:00 PM 9:00 PM | Stray Cat Film Center | https://www.straycatfilmcenter.com/screeningsandevents |
| The Addiction / Fang Favorites | 2026-10-09 19:00 | Stray Cat Film Center | Friday, October 9, 2026 7:00 PM 9:00 PM | Stray Cat Film Center (map) ... 1662 Broadway Blvd, Kansas City, MO 64108 | https://www.straycatfilmcenter.com/screeningsandevents |
| Take Care of My Cat | 2026-10-10 19:00 | Stray Cat Film Center | Saturday, October 10, 2026 7:00 PM 9:00 PM | Stray Cat Film Center (map) ... 1662 Broadway Blvd, Kansas City, MO 64108 | https://www.straycatfilmcenter.com/screeningsandevents |
| Halloween Double-Creature: Hallow's End & Darkwalker / Analog Sunday | 2026-10-11 18:30 | Stray Cat Film Center | Sunday, October 11, 2026 6:30 PM 9:30 PM | Stray Cat Film Center (map) ... 1662 Broadway Blvd, Kansas City, MO 64108 | https://www.straycatfilmcenter.com/screeningsandevents |
| A Girl Walks Home Alone at Night // Fang Favorites | 2026-10-16 19:00 | Stray Cat Film Center | Friday, October 16, 2026 7:00 PM 9:00 PM | Stray Cat Film Center (map) ... 1662 Broadway Blvd, Kansas City, MO 64108 | https://www.straycatfilmcenter.com/screeningsandevents |
| The Vampires of New Orleans w/ Live Q&A! | 2026-10-21 19:00 | Stray Cat Film Center | Wednesday, October 21, 2026 7:00 PM 9:00 PM | Stray Cat Film Center (map) ... 1662 Broadway Blvd, Kansas City, MO 64108 | https://www.straycatfilmcenter.com/screeningsandevents |
| Shoplifters // The Time Image | 2026-10-22 19:00 | Stray Cat Film Center | Thursday, October 22, 2026 7:00 PM 9:00 PM | Stray Cat Film Center (map) ... 1662 Broadway Blvd, Kansas City, MO 64108 | https://www.straycatfilmcenter.com/screeningsandevents |
| Humanist Vampire Seeking Consenting Suicidal Person // Fang Favorites | 2026-10-23 19:00 | Stray Cat Film Center | Friday, October 23, 2026 7:00 PM 9:00 PM | Stray Cat Film Center (map) ... 1662 Broadway Blvd, Kansas City, MO 64108 | https://www.straycatfilmcenter.com/screeningsandevents |
| Heartland Book Festival | 2026-10-02 to 2026-10-03 | Kansas City Public Library: Central Library | LOCATION \| Friday, October 2 ... LOCATION \| Saturday, October 3 | Kansas City Public Library: Central Library Located at 14 W 10th Street in the heart of downtown Kansas City’s Library District | https://www.heartlandbookfest.org/ |
| Heartland Book Festival: Authors, Panels, Workshops & More | 2026-10-03 09:00 | The Kansas City Public Library: Central Library | Saturday, October 3 • 9 AM - 4 PM | The Kansas City Public Library: Central Library 14 West 10th Street Kansas City, MO 64105 | https://www.eventbrite.com/e/heartland-book-festival-october-3-authors-panels-workshops-more-tickets-1998493640276 |
| Boozy Book Fest 2026 | 2026-10-03 16:00 | Bartle Exhibit Hall (A – E) | October 3 @ 4:00 pm - 9:00 pm | Venue: Bartle Exhibit Hall (A – E) | https://kcconvention.com/event/boozy-book-fest-2026/ |
| Phantom of the Opera | 2026-12-02 19:30 to 2026-12-13 | Kansas City Music Hall | Dec 2 - 13, 2026 Wednesday, Dec 2 7:30 PM | Venue Kansas City Music Hall | https://www.americantheatreguild.com/kansas-city/shows/phantom-of-the-opera-broadway-tickets-kansas-city-music-hall |
| SYMBIOSIS | 2026-10-02 to 2027-01-07 | Zhou B Art Center Kansas City | Exhibition Viewing: October 2 – January 7 | Zhou B Art Center KC \| 1801 E. 18th Street, Kansas City, MO | https://www.zhoubartcenterkc.com/events |
| Cafecítón: A Latin Brunch Club | 2026-10-17 11:00 | Café Corazon | Sat , October 17, 2026 at 11:00 am | Café Corazon 110 Southwest Blvd | https://kccrossroads.org/ |
| Halloween HAUNT Art Gallery at Worlds of Fun! | through 2026-10-31 | worlds of fun | SEPTEMBER 18TH - OCTOBER 31ST \| 2026 FALL ART GALLERY | worlds of fun | https://www.artgardenkc.org/events |
| Hands-on History | Monday, Wednesday, Friday-Sunday, 10 a.m.-1 p.m. (Oct. 2026) | National WWI Museum and Memorial | Monday, Wednesday, Friday-Sunday \| 10 a.m.-1 p.m. Hands-on History (Oct. 2026) | National WWI Museum and Memorial 2 Memorial Drive, Kansas City, MO 64108 USA | https://www.theworldwar.org/events |
| Main Gallery Tours | Monday, Friday-Saturday, Select times (Oct. 2026) | National WWI Museum and Memorial | Monday, Friday-Saturday \| Select times Main Gallery Tours (Oct. 2026) | National WWI Museum and Memorial 2 Memorial Drive, Kansas City, MO 64108 USA | https://www.theworldwar.org/events |
| Kansas City Mavericks Schedule | 2026-27 season | Cable Dahmer Arena | Fans can kick off the 2026-27 season with a night centered around welcoming hockey back to Kansas City. | Cable Dahmer Arena 19100 E Valley View Pkwy Independence, MO 64055 | https://kcmavericks.com/ |
| Beetlejuice | 2026-10-02 19:30 to 2026-10-04 21:30 | Starlight Theatre | October 2 @ 7:30 pm - October 4 @ 9:30 pm | Starlight Theatre 4600 Starlight Rd., Kansas City, MO, United States | https://kcparks.org/events/ |
| Bryson Tiller Presents: The Neo Trapsoul Tour | 2026-10-04 19:30 | Morton Amphitheater | October 4, 2026 Sunday 07:30 PM | Kansas City, MO Morton Amphitheater | https://www.ticketmaster.com/discover/kansas-city-mo?categoryId=KZFzniwnSyZfZ7v7nJ |
| Kansas City Brew Fest | 2027-02-21 12:00 | Union Station | The KC Brew Fest returns to Union Station on Feb 21st... Admission is $50 for general admission (1pm to 4pm) and $65 for Early Admission (includes an additional hour with specialty beers poured during the first hour). | Union Station 30 W Pershing Rd, Kansas City, MO 64108 | https://www.kansascitybrewfest.com/ |
| Peter Antoniou | 2026-10-07 19:00 | Funny Bone Comedy Club - Kansas City | Wed Oct 7, 2026 Time: 7:00 PM | Venue: Funny Bone Comedy Club - Kansas City | https://concertfix.com/concerts/kansas-city-mo+comedy |
| Jordan Jensen | 2026-10-08 19:00 | The Midland Theatre - MO | Thu Oct 8, 2026 Time: 7:00 PM | Venue: The Midland Theatre - MO | https://concertfix.com/concerts/kansas-city-mo+comedy |
| Dale Jones | 2026-10-09 19:00 to 2026-10-10 | Funny Bone Comedy Club - Kansas City | Fri Oct 9, 2026 — Time: 7:00 PM Fri Oct 9, 2026 — Time: 9:45 PM Sat Oct 10, 2026 — Time: 6:30 PM Sat Oct 10, 2026 — Time: 9:15 PM | Venue: Funny Bone Comedy Club - Kansas City | https://concertfix.com/concerts/kansas-city-mo+comedy |
| Winston Hodges | 2026-10-15 19:00 | Funny Bone Comedy Club - Kansas City | Thu Oct 15, 2026 Time: 7:00 PM | Venue: Funny Bone Comedy Club - Kansas City | https://concertfix.com/concerts/kansas-city-mo+comedy |
| Mojo Brookzz | 2026-10-16 19:00 | The Midland Theatre - MO | Fri Oct 16, 2026 Time: 7:00 PM | Venue: The Midland Theatre - MO | https://concertfix.com/concerts/kansas-city-mo+comedy |
| Tommy Davidson | 2026-10-16 19:00 to 2026-10-17 | Funny Bone Comedy Club - Kansas City | Fri Oct 16, 2026 — Time: 7:00 PM Fri Oct 16, 2026 — Time: 9:45 PM Sat Oct 17, 2026 — Time: 7:30 PM Sat Oct 17, 2026 — Time: 9:15 PM | Venue: Funny Bone Comedy Club - Kansas City | https://concertfix.com/concerts/kansas-city-mo+comedy |
| Matt Mathews | 2026-10-17 18:00 | Star Pavilion at Ameristar Casino and Hotel - Kansas City | Sat Oct 17, 2026 Time: 6:00 PM Sat Oct 17, 2026 Time: 9:00 PM | Venue: Star Pavilion at Ameristar Casino and Hotel - Kansas City | https://concertfix.com/concerts/kansas-city-mo+comedy |
| Rene Vaca | 2026-10-23 19:00 to 2026-10-24 | Funny Bone Comedy Club - Kansas City | Fri Oct 23, 2026 — Time: 7:00 PM Fri Oct 23, 2026 — Time: 9:45 PM Sat Oct 24, 2026 — Time: 6:30 PM Sat Oct 24, 2026 — Time: 9:15 PM | Venue: Funny Bone Comedy Club - Kansas City | https://concertfix.com/concerts/kansas-city-mo+comedy |
| Jeff Allen | 2026-10-24 15:00 | Funny Bone Comedy Club - Kansas City | Sat Oct 24, 2026 Time: 3:00 PM | Venue: Funny Bone Comedy Club - Kansas City | https://concertfix.com/concerts/kansas-city-mo+comedy |
| 2026 Vintage Market Days of Kansas City | 2026-10-02 10:00 to 2026-10-04 15:00 | American Royal Association | 📍Location: American Royal Association, 1701 American Royal Ct, Kansas City, MO 64102 Friday, October 2: 10:00 AM – 4:00 PM Saturday, October 3: 10:00 AM – 4:00 PM Sunday, October 4: 10:00 AM – 3:00 PM | 📍Location: American Royal Association, 1701 American Royal Ct, Kansas City, MO 64102 | https://www.eventbrite.com/e/2026-vintage-market-days-of-kansas-city-tickets-1997135943368 |
| KC Mystic Fair ~ October 2026 | 2026-10-23 15:00 | Ameristar Casino Hotel Kansas City | Fri, Oct 23, 3:00 PM | Minneville · Ameristar Casino Hotel Kansas City | https://www.eventbrite.com/d/mo--kansas-city/festivals/ |
| The Lights Fest - Kansas City | 2026-10-03 17:00 | Community Building Johnson County Fairgrounds | Today at 5:00 PM | Community Building Johnson County Fairgrounds | https://www.eventbrite.com/d/mo--kansas-city/october/ |
| 2026 Hyde Park Homes Tour | 2026-10-03 10:00 | Central Presbyterian Church | Today at 10:00 AM | Broadway Gillham · Central Presbyterian Church | https://www.eventbrite.com/d/mo--kansas-city/october/ |
| Havana Night Party on Rock Island Bridge | 2026-10-03 19:00 | Rock Island Bridge | Today at 7:00 PM | Kansas City · Rock Island Bridge | https://www.eventbrite.com/d/mo--kansas-city/october/ |
| Kansas City Engaged Fall Wedding Show | 2026-10-04 12:00 | Marriott Overland Park- Grand Ballroom | Tomorrow at 12:00 PM | Brookridge · Marriott Overland Park- Grand Ballroom | https://www.eventbrite.com/d/mo--kansas-city/october/ |
| 2026 State of Downtown | 2026-10-07 17:00 | Kauffman Center for the Performing Arts | Wednesday at 5:00 PM | Crossroads · Kauffman Center for the Performing Arts | https://www.eventbrite.com/d/mo--kansas-city/october/ |
| Cougars & Jaguars, Big Gata Energy | 2026-10-07 18:30 | The Ship | Wednesday at 6:30 PM | Quality Hill · The Ship | https://www.eventbrite.com/d/mo--kansas-city/october/ |
| CONGRESO 7 HORAS EN SU PRESENCIA (OCTUBRE 8 AL 11, 2026) | 2026-10-08 18:00 to 2026-10-11 | Hyvee Arena | CONGRESO 7 HORAS EN SU PRESENCIA (OCTUBRE 8 AL 11, 2026) Thursday at 6:00 PM | Kansas City · Hyvee Arena | https://www.eventbrite.com/d/mo--kansas-city/october/ |
| Theology Beer Camp 2026 | 2026-10-08 17:30 | Pine Ridge Presbyterian Church | Thursday at 5:30 PM | Tiffany Springs · Pine Ridge Presbyterian Church | https://www.eventbrite.com/d/mo--kansas-city/october/ |
| Panda Fest Kansas City 2026 | 2026-10-09 16:00 | Legends Field | Fri, Oct 9, 4:00 PM + 9 more | I-435 · Legends Field | https://www.eventbrite.com/d/mo--kansas-city/october/ |
| FAR FAR AWAY | 2026-10-09 19:00 | The Ship | Fri, Oct 9, 7:00 PM | Quality Hill · The Ship | https://www.eventbrite.com/d/mo--kansas-city/october/ |
| Bourbon, Bacon & Brews | 2026-10-09 16:00 | Clock Tower Landing | Fri, Oct 9, 4:00 PM | Historic Overland Park · Clock Tower Landing | https://www.eventbrite.com/d/mo--kansas-city/festivals/ |
| Kansas City Super Show | 2026-10-11 11:00 | Bartle Hall | Sun, Oct 11, 11:00 AM | Downtown · Bartle Hall | https://www.eventbrite.com/d/mo--kansas-city/october/ |
| Tabernacle Encounter in Kansas City | 2026-10-16 12:00 | Metropolitan Community College Gymnasium | Fri, Oct 16, 12:00 PM + 2 more | Kansas City · Metropolitan Community College Gymnasium | https://www.eventbrite.com/d/mo--kansas-city/october/ |
| 13th Annual Dia de los Muertos Celebration | 2026-10-17 17:00 | The Museum of Kansas City | Sat, Oct 17, 5:00 PM | Scarritt Point · The Museum of Kansas City | https://www.eventbrite.com/d/mo--kansas-city/festivals/ |
| Chargers vs Chiefs – Gameday Fan Shuttle to Arrowhead Stadium \| Oct.18 | 2026-10-18 11:30 | Arrowhead Stadium | Sun, Oct 18, 11:30 AM | Arrowhead Stadium | https://www.eventbrite.com/d/mo--kansas-city/october/ |
| Walktober 2026: Kemper Outdoor Education Center | 2026-10-11 10:00 | Kemper Outdoor Education Center | October 11 @ 10:00 am - 12:00 pm | Kemper Outdoor Education Center, located in Jackson County Parks’ Fleming Park! CHECK-IN: 8201 S Jasper Bell Rd., Blue Springs, MO 64015 | https://kcparks.org/event/walktober-kemper/ |
| Maronde Professional Recital Series - Fall 2026 | 2026-09-28 12:00 to 2026-11-10 | Polsky Theatre and Yardley Hall | Noon CDT on Mondays and Tuesdays, September 28, 2026 - November 10, 2026 | \| Polsky Theatre and Yardley Hall | https://www.jccc.edu/midwest-trust-center/events/ |
| Tiny Toy Tales: Storytelling and Early Childhood Literacy – 'Anansi and the Moss-Covered Rock' with Kassie Misiewicz | 2026-10-03 09:00 | SMSD Center for Academic Achievement | 9 a.m.-12 p.m. Saturday, October 3, 2026 | \| SMSD Center for Academic Achievement | https://www.jccc.edu/midwest-trust-center/events/ |
| 2026 Greater Kansas City Japan Festival: SUMO | 2026-10-03 10:00 | Johnson County Community College | 10 a.m.-6 p.m., Saturday, October 3, 2026 | \| Johnson County Community College | https://www.jccc.edu/midwest-trust-center/events/ |
| Add More Arts to Your Classroom: Virtual Professional Development | 2026-10-06 to 2027-03-01 | Online | October 6, 2026 - March 1, 2027 | \| Online | https://www.jccc.edu/midwest-trust-center/events/ |
| What if Puppets presents 'How to Snag a Sea Monster' | 2026-10-07 10:00 to 2026-10-10 | Polsky Theatre | 10 a.m. and 12:30 p.m. Wednesday and Thursday (school shows) and 6 p.m. Friday and 10 a.m. Saturday (public shows), October 7, 2026 - October 10, 2026 | \| Polsky Theatre | https://www.jccc.edu/midwest-trust-center/events/ |
| 'The Billy Joel Legacy' | 2026-10-11 19:00 | Yardley Hall | 7 p.m. Sunday, October 11, 2026 | \| Yardley Hall | https://www.jccc.edu/midwest-trust-center/events/ |
| Our Shared Future (Re)Shaped by AI | 2026-10-13 18:00 | Polsky Theatre | 6 p.m., Tuesday, October 13, 2026 | \| Polsky Theatre | https://www.jccc.edu/midwest-trust-center/events/ |
| 'The Who’s Tommy' | 2026-10-14 19:30 | Yardley Hall | 7:30 p.m. Wednesday, October 14, 2026 | \| Yardley Hall | https://www.jccc.edu/midwest-trust-center/events/ |
| Kansas City Civic Orchestra: Sounds of a New World | 2026-10-18 15:00 | Yardley Hall | 3 p.m., Sunday, October 18, 2026 | \| Yardley Hall | https://www.jccc.edu/midwest-trust-center/events/ |
| Don't Say It… SING IT! The Power of Music Education in the Elementary Classroom with Aaron Fowler | 2026-10-19 16:30 | Johnson County Community College | 4:30-7 p.m. Monday, October 19, 2026 | \| Johnson County Community College | https://www.jccc.edu/midwest-trust-center/events/ |
| 'Outlander in Concert' | 2026-10-23 19:30 | Yardley Hall | 7:30 p.m. Friday, October 23, 2026 | \| Yardley Hall | https://www.jccc.edu/midwest-trust-center/events/ |
| MTC Kids Jam – Matt Heaton | 2026-10-24 11:00 | Polsky Theatre | 11 a.m. Saturday, October 24, 2026 | \| Polsky Theatre | https://www.jccc.edu/midwest-trust-center/events/ |
| INfusion 2026 by Seva Dance | 2026-10-24 19:00 | Yardley Hall | 7 p.m., Saturday, October 24, 2026 | \| Yardley Hall | https://www.jccc.edu/midwest-trust-center/events/ |
| Daturday Night LIVE | 1st Saturdays on the Patio, 10pm–1:30am | Replay Lounge | Daturday Night LIVE – 1st Saturdays on the Patio! | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| GRVNDPA | 2nd Saturdays on the Patio, 10pm–1:30am | Replay Lounge | October 10 @ 10:00 pm – 1:30 am GRVNDPA- 2nd Saturdays on the Patio! | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| DUNGEONS & DRAGONS COMMUNITY GATHERING!!! | 2026-10-13 18:00 | Replay Lounge | October 13 @ 6:00 pm – 9:00 pm | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| DJ G Train | 3rd Fridays on the Patio, 10pm–1:30am | Replay Lounge | October 16 @ 10:00 pm – 1:30 am DJ G Train – 3rd Friday’s on the Patio! | Events for October 2026 – Replay Lounge | https://www.replaylounge.com/calendar-full/ |
| State of the Arts 2026 | 2026-09-28 to 2026-11-13 | R.G. Endres Gallery | 09-28-2026 11-13-2026 | Prairie Village Arts Council at R.G. Endres Gallery, Prairie Village | https://artsjoco.org/acjc/calendar-of-events/ |
| Recollections: a collaborative exhibition of Poetry & Printmaking | 2026-09-13 to 2026-11-13 | Meadowbrook Park Clubhouse | 09-13-2026 11-13-2026 | Prairie Village Arts Council at Meadowbrook Park Clubhouse, Prairie Village | https://artsjoco.org/acjc/calendar-of-events/ |
| ALL WE HAVE IS RIGHT NOW | 2026-09-25 to 2026-12-06 | Nerman Museum of Contemporary Art | 09-25-2026 12-06-2026 | Nerman Museum of Contemporary Art at Nerman Museum of Contemporary Art, Overland Park | https://artsjoco.org/acjc/calendar-of-events/ |
| Vantage Points | 2026-10-01 to 2026-10-31 | Tim Murphy Art Gallery | 10-01-2026 10-31-2026 | Merriam Parks & Recreation at Tim Murphy Art Gallery, Merriam | https://artsjoco.org/acjc/calendar-of-events/ |
| Kansas City Symphony’s Mobile Music Box at Heritage Park (JoCo) | 2026-10-04 18:00 | Heritage Park | Sun, Oct 04 @ 6:00 pm | Kansas City Symphony at Heritage Park, Olathe | https://artsjoco.org/acjc/calendar-of-events/ |
| 2026 NCPA Annual Convention | 2026-10-03 08:00 to 2026-10-06 12:00 | Kansas City Convention Center | October 3 @ 8:00 am - October 6 @ 12:00 pm | Kansas City Convention Center | https://kcconvention.com/events/ |
| ACNM 2026 Annual Meeting & Exhibition | 2026-10-09 08:00 to 2026-10-12 17:00 | Kansas City Convention Center | October 9 @ 8:00 am - October 12 @ 5:00 pm | Kansas City Convention Center | https://kcconvention.com/events/ |
| Jack Henry Connect 2026 | 2026-10-19 08:00 to 2026-10-21 17:00 | Kansas City Convention Center | October 19 @ 8:00 am - October 21 @ 5:00 pm | Kansas City Convention Center | https://kcconvention.com/events/ |
| ACTIVATE: A Movement + Sound Journey with DJ Taz Rashid | 2026-10-16 18:30 | Strang Reserve | Fri, Oct 16, 6:30 PM | Historic Overland Park · Strang Reserve | https://www.eventbrite.com/d/mo--kansas-city/festivals/ |
| Octoberfest at the Intercontinental | 2026-10-16 16:00 | 401 Ward Pkwy | Fri, Oct 16, 4:00 PM | West Plaza · 401 Ward Pkwy | https://www.eventbrite.com/d/mo--kansas-city/festivals/ |
| Carved Halloween Experience | 2026-10-17 17:30 | Renner Brenner Park | Sat, Oct 17, 5:30 PM | Breen Acres · Renner Brenner Park | https://www.eventbrite.com/d/mo--kansas-city/festivals/ |
| UNA OFRENDA, UN RECUERDO | 2026-10-23 19:00 | Salón La Villa | Fri, Oct 23, 7:00 PM | Indian Mound · Salón La Villa | https://www.eventbrite.com/d/mo--kansas-city/festivals/ |
| Witch Way to the Wine | 2026-10-24 11:00 | Downtown Excelsior Springs, Missouri | Sat, Oct 24, 11:00 AM | Golf Hill · Downtown Excelsior Springs, Missouri | https://www.eventbrite.com/d/mo--kansas-city/festivals/ |
| MoJo Real Estate Oktoberfest 2026: Brody Buster Live | 2026-10-10 16:00 | English Landing Park | Sat, Oct 10, 4:00 PM | Parkville · English Landing Park | https://www.eventbrite.com/d/mo--kansas-city/festivals/ |
| The Way Fest 2026 | 2026-10-10 16:00 | Word's Way Church | Sat, Oct 10, 4:00 PM | Hickman Mills South · Word's Way Church | https://www.eventbrite.com/d/mo--kansas-city/festivals/ |
| Weston Whiskey Fest | 2026-10-24 14:00 | Weston Burley House Inc | Sat, Oct 24, 2:00 PM | Hampton · Weston Burley House Inc | https://www.eventbrite.com/d/mo--kansas-city/festivals/ |
| Taste of KC Food Truck Fest | 2026-10-16 10:00 | 1826 Locust St | Fri, Oct 16, 10:00 AM | Hospital Hill · 1826 Locust St | https://www.eventbrite.com/d/mo--kansas-city/festivals/ |
| Fall Fest | 2026-10-10 11:00 | Central Park & Surrounding Streets | Saturday, October 10 2026, 11am – 5pm \| Central Park & Surrounding Streets | Saturday, October 10 2026, 11am – 5pm \| Central Park & Surrounding Streets | https://www.zonarosa.com/events/events/fall-fest-2026/ |
| 2026 HUMP! Film Festival: FALL SEASON | 2026-11-12 19:30 | Screenland Armour Theatre | Thu, Nov 12 at 7:30pm | at Screenland Armour Theatre ... Screenland Armour Theatre Armour Theater 408 Armour Rd. Kansas City , MO 64416 | https://btt.boldtypetickets.com/events/185466137/2026-hump-film-festival-fall-season-kansas-city-mo |
<!-- grading:end count-3 -->

### Wrong dates or venues found

How the audit was done: every active event's primary page was re-fetched and its date and venue evidence checked for appearing verbatim in the page text the extractor saw (whole, then line by line), then the misses and the mechanical flags above were read against the pages by hand. Nearly every wrong value turned out to be a faithful reading of bad or ambiguous page text, not an invention; the fixes are in `prompts/extraction-rules.md` except where the text never reached the model correctly.

Found in run one and fixed before run two (commit 3056bd8):

- **Venues with raw character codes** ("Children&#x27;s Mercy Park", "Bartle Exhibit Hall (A &#8211; E)"): page text did not decode numeric references. Fixed in code (`pageText`), since no rule can undo text the model never saw decoded. Gone in run two.
- **A festival on two separate weekends published as one span** (Ciderfest, Sep 26 to Oct 4 for Sep 26–27 and Oct 3–4): the rules now give the next span only. The stale record expired two-strike in run three.
- **Midnight placeholder times published as start times** (Happy Hour 00:00; two Ticketmaster fixtures at 12:00 am): the rules now treat midnight as no time. Gone in run two.
- **An organization read as a venue** ("Kansas City Ballet" for The Wizard of Oz on the Crossroads district directory): the rules now say an organization is not a venue. See remaining cases.
- The rules' opening line asked the model to note uncertainty in the evidence field; it now asks for null. One record (Halloween HAUNT) still carried a note after run two; the evidence section now says so in plain words.

Found in run two and fixed before run three (commit 1270528):

- **Dates resolved from relative words** ("Today at 5:00 PM", "Wednesday at 5:00 PM" on an Eventbrite directory page, 8 events): the dates were right for a fetch on Oct 3, but the page renders them against its own clock. Relative days are no longer dates. See remaining cases.
- **Nine comedy dates read from concertfix.com**, a resale listing whose text was not on its page when re-fetched: the host joins the aggregator list; those events took a strike in run three and expire on the next.
- Resale and listing hosts the discovery lane published from in run one (americanarenas.com, seatgeek.com, upcomingevents.com, artskcgo.com) joined the aggregator list before run two; their 5 published duplicates expired two-strike in run three.

Remaining cases in the committed dataset (run three), all documented rather than zero:

- **The Wizard of Oz at "Kansas City Ballet"** (kccrossroads.org) and **PBR Outlaw Days Festival at "Kansas City Power & Light"**: the corrected re-readings could cite no venue, and a page that still lists an event clears its strike and keeps the old reading (a #5 decision). The wrong venue therefore stays published. Issue #19 asks whether an uncitable re-reading should count as a strike.
- **Seven Eventbrite directory events** dated from relative words: same mechanism; their dates are almost certainly right, their citation is not. Issue #19, and #15 for platform directory pages being read as primary pages.
- **"The Cathedral of the Immaculate Concepti"** (Gretchaninoff: Passion Week): the Chorale's own concert card cuts the name short, and the rules forbid completing a name the page does not give. A faithful reading that looks like a typo; noted in #17 for the registry.
- **Dates past the horizon** (Phantom of the Opera Dec 2, Brew Fest Feb 21, HUMP! Nov 12): correct dates the extractor listed although the rules ask for the horizon only. Not wrong, just early.
- **Seasonal weekly series shown as one span** (Art On Walnut, "every Sunday, April thru October", published as Apr 5 to Oct 25; Pottery & Pinot and Giggle Time at Arts JoCo likewise): the rules ask for exactly this ("Thursdays through Oct 25" is a run, not recurring), and the dataset has no field for the weekday. The span is true; which days inside it are not shown. A site concern for milestone two, not a wrong date.
- **Venue evidence that does not name the venue** (seven Folly Theater events whose evidence is the street address; Zhou B; First Friday in the district): the venue is the source's own and right; the quote is weak.

Wrong published dates in the committed dataset: zero found. Wrong published venues: the two organization-as-venue records above, pending #19, and one truncated name.

## 4. Cost per run, extrapolated monthly

<!-- grading:begin count-4 -->
This run cost 0.2013 USD of the 5 USD cap in model calls. Weekly, that is 0.87 USD a month against the 15 USD pass line. Search is not in the figure: 10 Tavily searches this run, against a free tier of 1,000 a month.

Count four: **pass**.
<!-- grading:end count-4 -->

Run one, the cold start with nothing to re-verify, cost 0.4545 USD, or 1.97 USD a month; both figures clear the pass line by an order of magnitude. The OpenRouter key's own limit, the second spend layer, reads back as 15 USD resetting daily rather than monthly; the wizard's second stage walks changing it.

## Result

**Pass.** Evan, 2026-10-03. The job found three things worth proposing to friends that would not have been found otherwise, published zero wrong dates, and costs under a dollar a month. Count two is unmeasured and is picked up by the lived test once the site exists. Milestone two (the site, then the hub push) is worth building; #12 lands the weekly workflow first so real weeks of data accumulate.
