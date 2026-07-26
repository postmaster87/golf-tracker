# golf-tracker

Matt's handicap and tournament performance tracking app.

GPS shot-by-shot round logging, built to answer one question with data instead of opinion: **where are the strokes actually going?**

See [SPEC.md](SPEC.md) for the full brief.

## Status — Phase 1 complete

| Build step | State |
|---|---|
| 1. GPS round flow, precision pipeline, persistence + resume, JSON export | **done** |
| 2. Strokes gained engine vs scratch + round card | **done** |
| 3. Trends dashboard + rolling practice priority | **done** |
| 4. Firestore sync + Google Sign-In | not started |

Step 2 needed no migration and no re-logging, as designed: strokes gained wants a start distance and a lie for every shot, and both were already stored.

## Running it

It is a static site — no build step.

```bash
python -m http.server 8123
```

Then open `http://localhost:8123/`. Geolocation needs a secure context: `localhost` counts, and so does GitHub Pages over HTTPS.

> **Local dev gotcha:** `python -m http.server` sends no cache headers, so the browser caches modules heuristically and can serve stale JS after an edit — the page keeps rendering old code while the file on disk is correct. Hard-reload, or just switch between `localhost` and `127.0.0.1`, which are separate cache and service-worker origins. This does not affect GitHub Pages, which sends proper validators.

**Tests** — open `http://localhost:8123/test/`. 184 assertions covering the geodesy (against an independent Vincenty solution), the burst reduction, the Veenker scorecard, the green workflow, every derivation, the benchmark tables (against Broadie's published anchors), the strokes gained arithmetic, the trend statistics and the hypothesis verdict's refusal to call things early, storage footprint, export/import round-tripping, and WCAG contrast on all four palettes. They run against the real shipped modules and the real shipped CSS.

**Simulated GPS** — append `?sim=1` to exercise the whole round flow indoors. It stamps `simulated: true` on any round it creates and shows a red banner, so synthetic rounds can never be mistaken for real ones. Drive it from the console with `__sim.move(north, east)` in metres.

## How marking works

A mark records **where the ball was played from**, not where it finished. Stand at the ball, tap `MARK SHOT`, pick the lie. That is the only convention under which the hole back-computes cleanly:

- shot *i*'s distance to the hole = `dist(mark_i, hole)`
- shot *i*'s length = `dist(mark_i, mark_i+1)`

Putts are shots with lie `green`, so they sit in the same list and feed the same analysis — but their distances come from pacing, not GPS.

## The green: hands off the phone

Fiddling with a phone on the putting surface is counterproductive, and it turns out the data agrees. A ±2 m fix is ±6.5 ft — the entire useful range of a putt — so **a paced stride is better instrumentation than the receiver**, not a fallback.

The whole green workflow is therefore:

1. Walk to your ball on the green and tap `MARK SHOT` → `GREEN`. Two taps, once. This is the ball coming to rest after the approach.
2. Putt out. No phone.
3. On the next tee, tap `ENTER PUTTS` — the putt count, then the distance to the hole facing each putt. Quick-tap grids, so a routine two-putt is four taps total.

`Putt 1 — to the hole` is your approach proximity. `Putt 2 — the leave` is how good the lag was. Those two numbers are what decide three-putts, so they lead the round card.

Distances are entered in **paces** by default (pace length is configurable in Settings, default 3.0 ft). Every entry stores the raw count *and* the pace length alongside the derived feet — so recalibrating your stride later can be reapplied to rounds already logged instead of quietly invalidating them.

### The cup mark is optional

Marking at the cup gives exact distances, but it means handling the phone on the green, so it lives in the round menu rather than the main controls. Skipping it costs almost nothing: your ball-on-green position stands in for the hole, and the error is at most your first-putt distance — ~20 ft on a 150-yard approach, under 4%, worth about 0.02 strokes of SG. Meanwhile the putts themselves are paced exactly.

The hole position degrades through tiers, and every distance carries the tier it came from:

| Tier | Source | Uncertainty |
|---|---|---|
| 1 | cup mark this round | the mark's own accuracy |
| 2 | ball on the green + paced first putt | that putt's length |
| 3 | accumulated cup/green marks from previous rounds | ~12–18 m (pin movement) |
| — | nothing | distance reported as unknown, never guessed |

Ball-on-green marks accumulate a green position for each hole with no extra taps, so tier 3 gets better every round you play.

### The GPS pipeline

Battery is not a constraint, so the receiver never goes cold — `watchPosition` with `enableHighAccuracy` runs from the first tee to the last putt. On each mark:

1. **Accuracy gate** — fixes the receiver itself doesn't trust (worse than ±8 m) are dropped.
2. **Outlier rejection** — median position + MAD. One multipath spike near the trees cannot drag the result the way a mean would. Stands down below four fixes, where a robust estimator would just be an opinion.
3. **Inverse-variance weighted mean** — a claimed-2 m fix counts for 9× a claimed-6 m fix.

The burst runs *while the lie is being selected*, so it costs no wall-clock time. Every raw fix is stored with a `used`/`reject` flag, so a mark can be re-examined — or re-reduced with a better algorithm — years later.

Distances use a local tangent-plane projection built from the true WGS-84 radii of curvature, not a spherical haversine. The mean-radius assumption in haversine is worth about a yard on a long hole, which is a silly thing to give away on a device that resolves 1–3 m.

**Reported accuracy is deliberately pessimistic.** Naive inverse-variance combination assumes independent errors; consecutive GPS fixes share satellites, multipath and ionosphere, so averaging *n* fixes does not really buy √n. The estimate is floored at 0.6× the best single fix. Overstating precision here would quietly poison the strokes-gained numbers, which is worse than useless.

## Putting stats

Built around one target — *no 3 putts, but 1 putt better*:

- **3-putts** leads the card, in red when it isn't zero.
- **1-putts**, as a count and a rate.
- **Approach proximity** — median first-putt distance. The main cause of three-putts.
- **Lag leave** — median second-putt distance. The other cause.

Each carries its n, and a hole logged with a putt count but no distance counts toward three-putts without polluting the proximity median.

## Strokes gained

One idea applied to every shot: `SG = E(start) − E(end) − 1 − penalties`, where `E` is expected strokes to hole out and holing out is worth zero. Categories are **off the tee / approach / short game / putting**, split at 100 yards — which is Broadie's own boundary, so these totals are comparable to his published population figures.

**The benchmark tables are real, not recalled.** They come from Broadie's *Assessing Golfer Performance on the PGA TOUR* (Interfaces, 2011), Table 9 and Section 3.3 — eight million ShotLink shots. Putting is a physical model rather than a table, which is what makes a non-tour baseline derivable from published anchors instead of a guessed offset. Every anchor the paper states is an assertion in the test suite. See [docs/benchmark-verification.md](docs/benchmark-verification.md) for what was checked and what is still modelled.

The scratch baseline is **interpolated** between Broadie's tour and 90-golfer figures and pinned to the published scratch value of 4.10 from a 400-yard tee. Full shots and putting are calibrated separately on purpose — one constant across both implies a 90-golfer one-putts 65% from 5 feet where the paper says 50%. Every SG figure carries a "derived baseline" note for this reason.

Two things the engine refuses to do:

- **Guess a distance.** A shot with no known start or end is reported as unattributed, with a reason, next to the totals. Quietly dropping unmeasurable shots would flatter every category.
- **Require data the green workflow doesn't collect.** Per-hole putting SG is `E(first putt) − putts`, so it is exact even when the second putt wasn't paced.

### Reading the number

SG is measured against **distance, not par**. Veenker's gold tees are 6,029 yards, so the benchmark expects better than par — a 473-yard par 5 carries an expectation near 4.4, because by tour standards that is a long par 4. **Level par off the golds shows as about −2.5 strokes gained, and that is correct.** Judge the trend and the category ranking, not the sign of the total.

## Trends and practice priority

Everything is normalised to **strokes gained per 18 holes**, so nine-hole and part-finished rounds sit in the same series without distorting it. Rolling 5 / 10 / 20-round windows always report the n they actually have, and an unfilled window shows its n in amber rather than implying it is full.

**Practice priority** ranks categories by strokes lost, weighted toward recent rounds with an 8-round half-life — short enough that a swing change shows up, long enough that one bad Saturday cannot reorder your practice plan. A category whose confidence interval still straddles zero is labelled *not yet distinguishable from zero* and its bar is dimmed, because ranking noise as if it were signal is how a dashboard sends practice the wrong way.

### The open question

Your off-the-tee hypothesis against your friend's approach hypothesis gets its own verdict, and it is allowed to say **"too close to call"** indefinitely — if the two are genuinely level, that is the correct answer forever.

The comparison is **paired within each round**: both categories are measured on the same day, so a windy afternoon or a bad night's sleep largely cancels out of the *difference* even though it swamps either category alone. That pairing is what makes the question answerable in a couple of dozen rounds instead of a couple of hundred. The test suite pins this — a series with a large common shift per round still resolves, with the difference untouched.

When it hasn't separated, the app estimates how many rounds it would take at your current spread. When it has, it notes that "which category costs *you* more" is a different question from Broadie's population finding that approach explains ~40% of the gap between handicap levels — both can be true.

Small-sample honesty throughout: confidence intervals use the **t distribution**, not 1.96. At n = 6 the normal approximation understates the interval by about 25%, and n = 6 is where this app lives for its first season.

## Data model

`gt:app` holds settings, custom courses and a round index. Each round is its own `gt:round:<id>` key, so committing a mark rewrites one round rather than the whole database — this happens ~90 times a round on a phone that might be backgrounded at any moment.

Rules the schema is built on:

- **Store raw, derive everything else.** No computed distance is ever persisted.
- **Nothing benchmark-dependent is persisted.** The SG engine is additive.
- **Measured and entered data are never mixed silently.** Every distance knows whether it was measured by GPS, paced, or estimated off an accumulated green — and the shot list says so. Hand-entered holes are flagged in the UI, in every stat and in every export, and they override rather than delete the GPS marks underneath them.
- **Unknown is a valid answer.** A ball on the green does not report a zero distance to itself; a putt with no paced distance stays null. Nothing is filled in to look complete.

Coordinates are stored at 7 decimal places — 1.1 cm, three orders of magnitude finer than the hardware. A full 18-hole round with ~90 marks and a walking track is about **69 KB**, so roughly 70 rounds fit in a typical 5 MB localStorage budget. Settings shows the remaining headroom in rounds.

### Resilience

- Round state is written on every mark, and a mid-round refresh resumes on the same hole.
- Screen Wake Lock is held for the round and re-acquired on `visibilitychange` — Android drops it whenever the page hides and never restores it.
- Pull-to-refresh is disabled; leaving mid-round prompts.
- The service worker is **network-first with a 2.5 s timeout**, not stale-while-revalidate. SWR can serve a freshly-deployed module next to a cached older one, and for an app of a dozen interdependent ES modules that mismatch is a blank screen on the course. Network-first guarantees a consistent module set: the live one online, the last complete cached one offline. It fetches with `cache: 'no-cache'`, which is load-bearing — a plain `fetch()` inside a service worker still goes through the browser's HTTP cache, so without it "network-first" quietly degrades to serving stale modules anyway.
- If the app fails to boot for any reason, an inline dependency-free handler in `index.html` renders a recovery screen with a **Download backup** button that reads localStorage directly.

## Course data

Veenker Memorial is verified against the Iowa PGA / BlueGolf detailed scorecard (checked 2026-07-25) — par 72, OUT 36 / IN 36, blue 3351 + 3281 = 6632, stroke indices a clean odd-front / even-back permutation of 1–18. All four tee sets are seeded. A test asserts every one of those sums, so a typo in the card cannot go unnoticed.

Ratings and slopes are recorded only where a published value was found — gold, white and red show no rating rather than a plausible guess.

Veenker alternates its starting nine, so the round-start screen leads with a Front/Back toggle defaulting to last-used. The app also accumulates tee and cup positions across rounds; once both first-tee positions are seeded it can spot a disagreement with the toggle and **ask**. It never reassigns holes silently, and it abstains when the two tees are too close to call.

## Themes

Four palettes as CSS custom properties, picked in Settings and persisted with the rest of app state: **Fairway** (default), **Clay**, **Slate**, and **Dusk** (dark). Calm comes from hue and saturation, never from washing out contrast — every on-course text pair clears WCAG AAA (7:1) and the dimmest supporting text clears AA. The test suite parses `css/themes.css` and asserts all 18 pairs on all four palettes.

## Layout

```
index.html            app shell + inline crash-recovery handler
sw.js                 network-first offline shell
css/themes.css        four palettes as custom properties
css/base.css          layout and controls
js/app.js             state, routing, GPS lifecycle, persistence
js/data/              schema, storage, course templates
js/gps/               burst pipeline, wake lock
js/round/             round logic and all derivations
js/analysis/          tour-benchmark.js (source data), benchmarks.js (lookup),
                      strokes-gained.js (SG), trends.js (windows + verdict)
js/ui/                one module per screen
js/dev/sim.js         synthetic GPS, loaded only with ?sim=1
test/                 browser test harness
```

## Deploying

Push to `main` and enable GitHub Pages on the repository root. HTTPS is required for Geolocation; Pages provides it.
