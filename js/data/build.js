/**
 * WHICH DEPLOY IS ON THE PHONE.
 *
 * Distinct from `REVISION`, and both are needed. A revision is a build that
 * went to the course — it changes when a round is about to be played, so it
 * stays put across a dozen pushes and cannot answer "did my phone pick up the
 * fix from twenty minutes ago?". That question comes up constantly on a field
 * test day, and until now the only way to answer it was to open the console.
 *
 * So this changes on every deploy, and it is the same number the service worker
 * names its cache with. Keeping them equal is enforced by a test rather than by
 * discipline — the shell cache and the visible build number drifting apart is
 * exactly the sort of thing nobody notices until it matters.
 *
 * There is no build step here (the app is plain ES modules served as static
 * files), so this is bumped by hand alongside the cache in `sw.js`.
 */
export const BUILD = {
  /** Matches the `gt-shell-<id>` cache name in sw.js. Enforced by the suite. */
  id: 'v17',
  /** When it was pushed. Only ever read by a human deciding if it looks stale. */
  date: '2026-08-23',
};

/** Display form, e.g. "v16 · 23 Aug 2026". */
export function buildLabel(build = BUILD) {
  const d = new Date(`${build.date}T12:00:00Z`);
  const when = Number.isFinite(d.valueOf())
    ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : build.date;
  return `${build.id} · ${when}`;
}
