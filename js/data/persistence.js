/**
 * WHETHER THIS BROWSER WILL KEEP THE ROUNDS, OR DELETE THEM TO FREE SPACE.
 *
 * Every origin gets one of two storage modes. The default is **best-effort**,
 * which means exactly what it says: the browser may delete the origin's data
 * whenever it wants the space back, with no prompt, no notification, and
 * nothing in the UI afterwards to say it happened. The other is **persistent**,
 * which the browser will not evict.
 *
 * Three facts about eviction, all of which this app learned the expensive way:
 *
 *  1. IT IS PER-ORIGIN AND TOTAL. "When an origin's data is evicted by the
 *     browser, all of its data, not parts of it, is deleted at the same time."
 *     So `gt:app`, every `gt:round:*`, the `gt-track` IndexedDB store and the
 *     service worker's shell cache go together. What comes back is not an app
 *     missing some rounds — it is `newAppState()`, with the theme reset and
 *     every learned tee gone.
 *
 *  2. IT IS LRU ACROSS ORIGINS, AND IT SKIPS PERSISTENT ONES. The least
 *     recently used best-effort origin is cleared first. A golf app opened two
 *     or three times a month is close to the worst case there is.
 *
 *  3. THE TRIGGER IS THE DEVICE RUNNING OUT OF DISK, NOT OUR QUOTA. This is
 *     unrelated to the ~5 MB localStorage limit the Data card reports headroom
 *     against. Being well under quota protects nothing.
 *
 * WHAT HAPPENED. Between 2026-08-24 00:10 and 2026-09-03 19:30 this origin was
 * evicted on Matt's phone. Field tests 1 through 5 — five rounds and 22,000
 * GPS fixes — went with it, and nothing in the app said a word. They survived
 * only because they had been exported. He had deleted nothing; the settings
 * diff is what proved it (`theme` back to the default `fairway`, radcliffe gone
 * from both `teeByCourse` and `courseLearning`, and the one-time migration flag
 * `autoLockRaisedForLockTab` absent, which fresh state never sets).
 *
 * WHAT THIS DOES NOT DO. Persistence stops automatic eviction and nothing else.
 * Clearing browsing data, Android's per-app "clear storage", and uninstalling
 * the browser all still take everything. Exporting after every round is not
 * replaced by this — it is the only thing that ever survives.
 *
 * WHY THE REQUEST IS NOT MADE ON PAGE LOAD. Google's guidance is to ask "when
 * you save critical user data, and the request should ideally be wrapped in a
 * user gesture", and not during bootstrap. START ROUND is both: a real tap, and
 * the moment the app starts writing something that cannot be re-collected.
 * Chrome decides silently on site engagement, whether the site is installed,
 * and whether notifications were granted — it never prompts. Firefox does
 * prompt, which is the other reason this does not fire on load.
 */

/** The origin will not be evicted automatically. */
export const PERSISTENT = 'persistent';
/** The browser may delete everything to free space. */
export const BEST_EFFORT = 'best-effort';
/**
 * We could not find out. NOT the same as best-effort, and never rendered as if
 * it were: the API is missing on insecure origins and in some embedded views,
 * and telling Matt his data is at risk when we simply do not know is the same
 * class of lie as an export that silently carried no track.
 */
export const UNKNOWN = 'unknown';

/**
 * `navigator.storage`, or null where it does not exist.
 *
 * Separated out so the tests can hand in a fake, and so every call site gets
 * the same null-safety instead of each inventing its own optional chaining.
 */
function manager(nav = globalThis.navigator) {
  const sm = nav?.storage;
  return sm && typeof sm.persisted === 'function' ? sm : null;
}

/**
 * Read the current mode without asking for anything.
 *
 * Never throws. A rejected promise here is a diagnostic, not a failure worth
 * taking a screen down for.
 */
export async function checkPersistence(nav = globalThis.navigator) {
  const sm = manager(nav);
  if (!sm) return UNKNOWN;
  try {
    return (await sm.persisted()) ? PERSISTENT : BEST_EFFORT;
  } catch {
    return UNKNOWN;
  }
}

/**
 * Ask for persistent mode, and report what we ended up with.
 *
 * Returns the resulting state rather than the raw boolean `persist()` gives
 * back, so a caller cannot accidentally render "at risk" for a browser that
 * never had the API in the first place.
 */
export async function requestPersistence(nav = globalThis.navigator) {
  const sm = manager(nav);
  if (!sm || typeof sm.persist !== 'function') return UNKNOWN;
  try {
    if (await sm.persisted()) return PERSISTENT;
    return (await sm.persist()) ? PERSISTENT : BEST_EFFORT;
  } catch {
    return UNKNOWN;
  }
}

/**
 * The automatic path, called from START ROUND.
 *
 * Asks at most once per outcome that is worth re-asking. A grant is permanent
 * so there is nothing to repeat; a refusal is remembered because Firefox shows
 * the user a permission popup and being asked again at every tee is its own
 * kind of broken. The Settings button ignores this and always re-asks, because
 * that one is Matt's hand rather than ours.
 *
 * `settings` is mutated in place and the caller decides when to save. Nothing
 * here awaits anything the round needs: START ROUND must not wait on a storage
 * API, so the caller fires this and walks away.
 */
export async function ensurePersistence(settings, nav = globalThis.navigator) {
  const before = await checkPersistence(nav);
  if (before === PERSISTENT) {
    settings.storagePersistence = PERSISTENT;
    return PERSISTENT;
  }
  // Asked once, told no. Do not keep asking; the Settings button still can.
  if (settings.storagePersistAsked && before !== UNKNOWN) {
    settings.storagePersistence = before;
    return before;
  }
  const after = await requestPersistence(nav);
  settings.storagePersistAsked = true;
  settings.storagePersistence = after;
  return after;
}

/**
 * How to say it on screen. Blunt on purpose for the bad case — the whole
 * failure mode here is that eviction is silent, so the app has to be the thing
 * that is not quiet about it.
 */
export function persistenceLabel(state) {
  switch (state) {
    case PERSISTENT:
      return {
        heading: 'Storage: PROTECTED',
        detail: 'This browser will not delete your rounds to free space. Clearing browsing data still will.',
        tone: 'ok',
      };
    case BEST_EFFORT:
      return {
        heading: 'Storage: AT RISK',
        detail:
          'This browser can delete every round on this phone without warning, to free space for something else. It has happened once already — field tests 1 to 5 went this way.',
        tone: 'bad',
      };
    default:
      return {
        heading: 'Storage: UNKNOWN',
        detail: 'This browser will not say whether it protects stored data. Treat it as at risk and export after every round.',
        tone: 'warn',
      };
  }
}
