/**
 * BUILD REVISION — which instrument logged this round.
 *
 * A revision is not a release and not a commit. It is **a build that went to
 * the course**. That is the only boundary worth numbering here, because the
 * question this app exists to answer is a data question: when two rounds
 * disagree, the first thing you need to know is whether the same instrument
 * recorded them.
 *
 * Field test 2 is the case in point. Matt's own verdict on that data was "I
 * missed logs so this data is not correct" — a whole round that has to be
 * quarantined. Without a stamp on the round itself, quarantining it means
 * remembering a date. With one, it is a filter.
 *
 * RULES
 *  - Bump REVISION when a build is about to be played, not when code changes.
 *  - Never bump twice for the same round of golf.
 *  - Never let two different builds share a number.
 *  - A revision is only "shipped" once it has actually been played. Until then
 *    its `shipped` is null and it is the working revision.
 *
 * Numbering starts at 0, matching how Matt indexes projects at work.
 */

/** The revision this build IS. Stamped into every round it records. */
export const REVISION = 2;

/**
 * What each revision was, and when it was played.
 *
 * Revisions 0 and 1 are reconstructed from git history and the two field tests
 * — they were not stamped at the time, because this scheme did not exist yet.
 * The commits are exact; treat the dates as the boundary between builds rather
 * than as a claim about any particular round.
 */
export const REVISION_HISTORY = [
  {
    rev: 0,
    commit: 'c39078e',
    shipped: '2026-07-26',
    title: 'First build',
    summary:
      'GPS shot marking, strokes gained, benchmarks, trends. Taken to field test 1. ' +
      'Cut short — ghost touches and screen zoom made it hard to use.',
  },
  {
    rev: 1,
    commit: '8fd45af',
    shipped: '2026-08-02',
    title: 'Usable on a phone, in a cart',
    summary:
      'Pocket lock, zoom killed, free hole navigation, full post-round editing, ' +
      'club tracking, required-field boxes, cup marked before putting. ' +
      'Taken to field test 2. Shut down mid-round: "it was getting in the way of my play".',
  },
  {
    rev: 2,
    commit: null,
    shipped: null,
    title: 'Continuous track',
    summary:
      'Record position continuously instead of logging every shot by hand. ' +
      'Dense track moves to IndexedDB; stop candidates derived from it afterwards.',
  },
];

/** The entry for a given revision, or null if it is not one we know about. */
export function revisionInfo(rev = REVISION) {
  return REVISION_HISTORY.find((r) => r.rev === rev) ?? null;
}

/** Display form. Kept in one place so "rev 2" never becomes "v2" somewhere. */
export function revisionLabel(rev = REVISION) {
  return rev == null ? 'unstamped' : `rev ${rev}`;
}

/**
 * Whether this build has been played yet.
 *
 * Shown in the UI because an unshipped revision is exactly the state where a
 * round is most likely to surface something new — and where Matt most needs to
 * know he is not on the build he played last time.
 */
export function isWorkingRevision(rev = REVISION) {
  return revisionInfo(rev)?.shipped == null;
}

/**
 * Describe a round's provenance for display.
 *
 * `null` is a real and honest answer: rounds recorded before this scheme
 * existed carry no revision, and the app's data rules forbid inventing one.
 * Their build can still be recovered by hand from REVISION_HISTORY dates —
 * but that is an inference a human makes, not one the app makes silently.
 */
export function roundRevisionLabel(round) {
  const rev = round?.revision;
  if (rev == null) return 'unstamped (pre-rev-2 build)';
  const info = revisionInfo(rev);
  return info ? `${revisionLabel(rev)} — ${info.title}` : revisionLabel(rev);
}
