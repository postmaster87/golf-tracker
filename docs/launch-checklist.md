# Launch checklist — first real round

Morning prep in order, then the on-course reference. Total prep is ~15 minutes.

## A. GitHub account (~5 min, before anything is pushed)

1. **Settings → Emails**: add `rusty9645@gmail.com`, verify it, set it as primary.
2. Optional: remove `mpost7@iastate.edu` from the account entirely.
3. **If** you tick *Block command line pushes that expose my email*, say so before the push — the branch is authored with the real gmail and pushes would bounce until re-authored to the noreply alias. *Keep my email addresses private* alone is fine.
4. Decide on the initial commit (`cbc81fd`, carries the work email, already on GitHub): rewrite-and-force-push to scrub it, or leave it. If rewriting, it happens **before** the merge so history is rewritten once.

## B. Ship it (~3 min, with Claude)

5. Merge `feat/gps-tracking-and-strokes-gained` into `main` and push.
6. Enable GitHub Pages: repo → **Settings → Pages** → Source: *Deploy from a branch* → `main` / `/ (root)` → Save.
7. Verify the deployment: `https://postmaster87.github.io/golf-tracker/` loads, and `/test/` on that URL shows all tests green. HTTPS from Pages is what makes GPS work on the phone — a local server will not.

## C. Phone (~5 min, on the Galaxy)

8. Open the Pages URL in Chrome.
9. Grant location: **While using the app**, with **Precise** on.
10. Chrome menu → **Add to Home screen** → install. Standalone mode plays nicer with the wake lock and caches the shell for thin cellular at the course.
11. In-app **Settings**: putt unit (paces), pace length (3.0 ft — to calibrate, walk ten paces along something of known length and adjust), theme, GPS thresholds stay default.
12. **Outdoor smoke test**: START VEENKER → stand outside → MARK SHOT → TEE. The accuracy chip should read roughly ±2–4 m. Then UNDO, menu → Abandon round. This also pre-warms the location permission so the first tee isn't the first GPS request the phone has ever seen.
13. Charging cable in the cart.

## D. On the course

- **Start**: START VEENKER → FRONT/BACK for the day → tees → START ROUND.
- **Every shot**: stand at the ball → MARK SHOT → lie. Two taps; the burst runs while you pick.
- **On the green**: MARK SHOT → GREEN once, at your ball. Pocket the phone. Putt.
- **Next tee**: ENTER PUTTS → count → paced distances (putt 1 = to the hole, putt 2 = the leave).
- **Penalty**: PENALTY after the shot that earned it; the drop is just the next MARK SHOT.
- **Mis-tap**: UNDO. If the undo was the mistake, RESTORE is in the toast.
- Walking off a hole without putts entered triggers the prompt — that is the catch working, not a nag.
- **After 18**: FINISH ROUND → read the card → Settings → **EXPORT ALL DATA**. Until Firestore sync lands, that export is the only backup of a round that cannot be re-collected.

## Reading the first card

- Level par off the golds shows as roughly **−2.5 strokes gained vs scratch**. That is correct — SG measures against distance, not par, and 6,029 yards is short by benchmark standards. Watch the category ranking and the trend, not the sign of the total.
- One round proves nothing and the app will say so. The verdict card starts talking around a dozen rounds.
