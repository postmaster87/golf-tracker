# Golf Performance Tracker — Project Spec

## Purpose

The goal is to get better at golf. The vehicle to get there is practice. The fuel for that practice is actual scoring data. This app turns Matt's real rounds into an honest, quantified picture of where strokes are being lost, so practice time goes where the data says it should — not where it feels like it should.

This is a record-keeping and statistical analysis tool for handicap practice rounds and tournament rounds. It is NOT a mental-game tracker (that exists separately as FlowCode) and NOT a range-session tracker.

## User context

- Matt: electrical engineer in Ames, Iowa. Serious amateur golfer working toward scratch-level play.
- Home practice course: **Veenker Memorial Golf Course** (Iowa State University, Ames). This is the ONLY course he practices on — the large majority of logged rounds will be here. Tournament rounds happen at other courses.
- Trains on a structured golf-specific strength & conditioning program with a personal trainer; practice is deliberate and data-driven. This app is the on-course counterpart to that structure.
- Owns a Garmin R10 launch monitor for range work (not integrated with this app).
- Samsung Galaxy phone; the app runs in the mobile browser during the round. Battery usage is explicitly NOT a constraint — the phone can charge in the cart. Optimize for GPS precision over everything.
- Communication style: direct, terse, precision-oriented. The app's UI should match — dense, fast, zero fluff.

## Open question the app must answer

Matt's hypothesis: strokes gained **off the tee** is his biggest leak. A friend's counter-hypothesis (backed by Broadie's population data, where approach explains ~40% of scoring gaps between handicap levels): **approach** is where the strokes are. The plan is to log a couple dozen rounds and let the distributions settle it. The analysis layer must make this comparison unavoidable and obvious.

## Core capture: full GPS shot-by-shot mode (PHASE 1 — this is the app)

Per shot, standing at the ball:
- Tap **Mark Shot** → GPS coordinate captured → two-tap lie selection (Tee / Fairway / Rough / Sand / Recovery)
- On the green: mark each putt's location, with putt count + first-putt distance entry as fallback
- Tap **Mark** at the cup on holing out → app back-computes distance-to-hole for every shot on that hole from coordinates
- Penalty flag attachable to any shot (with drop re-mark)
- Undo/edit last mark must be one tap — mis-taps happen with a glove on

### GPS precision requirements (no battery compromises)

- `watchPosition` with `enableHighAccuracy: true` running continuously for the entire round — never let the GPS receiver go cold between shots. Continuous tracking also enables future features (walking pace, auto-hole-advance hints).
- On Mark Shot: collect a burst of fixes over ~3 seconds while the lie is being selected, discard outliers and low-quality fixes, and store a weighted average (weight by reported accuracy). Store the final accuracy estimate with every mark.
- Reject and warn on fixes with accuracy worse than ~8 m; prompt a re-mark rather than silently storing junk.
- Live accuracy indicator on screen at all times (current ±m), so degraded signal is visible before it pollutes data.
- Screen Wake Lock API active for the whole round; re-acquire on visibility change.
- Modern Galaxy phones have dual-frequency GNSS — real-world accuracy of ~1–3 m is achievable outdoors. Design distance math (haversine on WGS-84 coordinates) to preserve that precision; store raw lat/lon/accuracy/timestamp per mark, never just derived distances.
- Handle GPS permission loss, browser tab suspension, and mid-round refresh gracefully: all in-progress round state persists to localStorage on every mark, and a round can be resumed exactly where it left off.

## Analysis layer

- **Strokes gained engine** using Broadie-style benchmark tables, with the baseline set to **scratch** (not PGA Tour). Every shot gets an SG value. Categories: Off the Tee, Approach, Short Game (inside ~100 yds), Putting.
- **Round card** after each round: per-category SG plus traditional stats (FIR%, GIR%, putts, scrambling %, penalties) derived automatically from the shot data.
- **Trends dashboard**: rolling 5 / 10 / 20-round windows per category. Top-priority output.
- **Practice priority ranking**: categories ranked by strokes lost vs scratch, weighted toward recent rounds. The other top-priority output — the whole point of the app.
- Every round is tagged **practice** or **tournament** (and by course), so splits are queryable later.

## Course handling

- **Hard-code Veenker as a built-in course template** (18 holes: par and yardage per hole; verify current scorecard data rather than guessing). Starting a Veenker round should be one tap.
- **Veenker alternates the starting nine**: on any given day the 1st tee may be either the front nine or the back nine. The round-start screen needs a Front/Back toggle (two taps max, defaulting to last-used). Stretch goal: auto-detect the starting nine from the first tee-shot GPS mark — hole 1 and hole 10 tees are far enough apart that a single fix disambiguates. Tee-box coordinates can be seeded once (from satellite imagery or Matt's first rounds) and refined from accumulated tee marks; until seeded, the manual toggle is authoritative. When auto-detect and the toggle disagree, ask — never silently reassign holes.
- Other courses (tournaments): quick manual course entry (name, par per hole), saved for reuse.
- No pre-mapped green coordinates required — the mark-at-the-cup workflow supplies hole locations per round. Over time, accumulated cup marks at Veenker build a per-hole green location dataset the app can reuse for sanity checks.

## Tech stack

- Single-page, mobile-first HTML/CSS/JS app. No framework requirement; keep it lean.
- Repo: `golf-tracker`, deployed via GitHub Pages (HTTPS — required for Geolocation).
- **Phase 1 storage: localStorage** with one-tap JSON export (backup) from day one. Phase 2: Firebase/Firestore with Google Sign-In (Matt has an existing Firebase project pattern from a prior app; use a separate collection/app so data never mixes with FlowCode).

## Build order

1. **Full GPS mode: round flow (Veenker one-tap start), mark-shot capture with the precision pipeline above, hole-by-hole back-computation, localStorage persistence + resume, JSON export** ← start here; Matt wants to begin logging real rounds immediately
2. Strokes gained engine vs scratch + round card
3. Trends dashboard + practice priority view
4. Firestore sync + Google Sign-In
5. (Deferred, optional) Quick mode for scorecard-only entry of rounds where GPS wasn't run; Arccos import pipeline

## Effort levels (for Claude Code running Opus 5)

Matt values getting it right the first time over speed. Default effort is **high**; the standing instruction is: **before starting any of the following, pause and prompt Matt to run `/effort` and step up to xhigh** —

- Designing or revising the **data model / storage schema** (the decision that's hardest to reverse once rounds are logged)
- Building or modifying the **GPS precision pipeline** (burst sampling, outlier rejection, weighted averaging, resume logic)
- Building or modifying the **strokes gained engine** (benchmark tables, scratch baseline math, category attribution)
- Any **migration of already-logged round data** (localStorage → Firestore, or schema changes once real rounds exist)

For everything else — UI, styling, round flow, dashboards, deployment — proceed at high without asking. Do not use max effort (xhigh is the sweet spot; max costs more without reliably better results) and do not use Fast mode.

## Design constraints

- Mobile-first; used exclusively on a phone, outdoors, in sunlight, often with a glove — big targets, high contrast, minimal taps, no typing where a tap will do
- **Color scheme**: soothing default palette that stays fully legible in direct sunlight. Soothing means muted, low-saturation hues; sunlight-readable means text and controls must keep strong contrast (WCAG AA at minimum, target AAA for on-course screens) — achieve calm through hue choice, not washed-out contrast. Implement themes as CSS custom properties with a theme picker in settings, selection persisted with the rest of app state. Ship four predefined palettes:
  - **Fairway** (default): soft sage greens on warm cream, near-black ink — calm, course-appropriate
  - **Clay**: warm taupe/sand tones with deep brown ink — earthy, easy on the eyes
  - **Slate**: cool gray-blue with crisp dark text — neutral and clean
  - **Dusk**: dark mode (deep green-gray background, warm off-white text) for evening data review and low-light entry
- Fast load on cellular
- No accounts required for Phase 1
- Honest math: never smooth over small sample sizes — show n alongside every trend
