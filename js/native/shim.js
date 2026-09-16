/**
 * NATIVE GPS, WEARING `navigator.geolocation`'s CLOTHES.
 *
 * Loaded by `js/app.js` only when `globalThis.GolfNative` exists, i.e. only
 * inside the Android shell. On Pages this file is never fetched.
 *
 * WHY A SHIM AND NOT A NEW PIPELINE. `js/gps/gps.js` is field-validated and is
 * not touched: the burst reduction, the accuracy gate, the outlier rejection,
 * the conservative error estimate and the revive-on-visible logic all stay
 * exactly as they are, and every `GpsService` test keeps running against the
 * real API. The only thing that changes is where a fix comes from — the
 * foreground service's own fused stream instead of the WebView's. That is one
 * source (D7): the fixes the mark burst reduces and the fixes in the track are
 * literally the same rows.
 *
 * `js/dev/sim.js` already proved this seam. This file uses the same mechanism
 * for the same reason: `navigator.geolocation` is an accessor with no setter,
 * so a plain assignment throws and the property has to be redefined.
 *
 * FAILURE POSTURE. Nothing here throws at the app. A bridge call that fails is
 * a fix that did not arrive, which `gps.js` already handles — it is the same
 * shape as the receiver going quiet, and the accuracy chip says so on screen.
 */

/**
 * How old a cached fix may be and still answer `getCurrentPosition`.
 *
 * Mirrors `GPS_DEFAULTS.staleFixMs` in `js/gps/gps.js` (4000). Kept as a local
 * constant rather than an import so this module stays a leaf: it must be safe
 * to load before anything else has run, and it must not pull the GPS pipeline
 * into its own module graph.
 */
const STALE_FIX_MS = 4000;

/** `PositionError.POSITION_UNAVAILABLE`. */
const POSITION_UNAVAILABLE = 2;

const bridge = globalThis.GolfNative;

if (bridge) {
  const watchers = new Map();
  let nextId = 1;
  let lastFix = null;

  /**
   * A native fix as a `GeolocationPosition`.
   *
   * `timestamp` is the fix's OWN time (`Location.time`, the `fix_ms` column),
   * not the moment it crossed the bridge. `gps.js` stores it as `ts`, the track
   * is keyed on it, and `tools/track-coverage.py` measures coverage on it — a
   * receive time here would quietly re-base every gap in every round.
   *
   * Absent values stay null rather than 0: `gps.js` checks `Number.isFinite` on
   * altitude, speed and heading, and a zero speed is a real reading that the
   * stop detector cares about.
   */
  function position(f) {
    return {
      coords: {
        latitude: f.lat,
        longitude: f.lon,
        accuracy: f.acc,
        altitude: Number.isFinite(f.alt) ? f.alt : null,
        altitudeAccuracy: Number.isFinite(f.altAcc) ? f.altAcc : null,
        speed: Number.isFinite(f.speed) ? f.speed : null,
        heading: Number.isFinite(f.heading) ? f.heading : null,
      },
      timestamp: f.ts,
    };
  }

  /**
   * The recorder's way in. Called from the Activity's main thread, once per
   * fix, only while the Activity is resumed — nothing is queued for a page
   * that is frozen, and `gps.js`'s revive logic re-arms the watch on the way
   * back.
   */
  globalThis.__golfNativeFix = (f) => {
    if (!f || !Number.isFinite(f.lat) || !Number.isFinite(f.lon)) return;
    lastFix = f;
    const pos = position(f);
    for (const ok of watchers.values()) {
      try {
        ok(pos);
      } catch {
        /* one broken subscriber must not stop the others */
      }
    }
  };

  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition(ok, err) {
        if (lastFix && Date.now() - lastFix.ts <= STALE_FIX_MS) {
          ok?.(position(lastFix));
          return;
        }
        err?.({ code: POSITION_UNAVAILABLE, message: 'No recent fix from the recorder.' });
      },

      /**
       * Register a receiver and tell the service someone is watching.
       *
       * The count on the native side is what turns the location service on and
       * off, so clearWatch followed by watchPosition — which is exactly what
       * `GpsService.restart()` does when a thawed page has gone quiet — has to
       * leave the count where it started. It does: one down, one up.
       */
      watchPosition(ok) {
        const id = nextId++;
        watchers.set(id, ok);
        try {
          bridge.watch();
        } catch {
          /* the service is already up, or the phone refused; fixes decide */
        }
        return id;
      },

      clearWatch(id) {
        if (!watchers.delete(id)) return;
        try {
          bridge.unwatch();
        } catch {
          /* nothing useful to do about a refusal */
        }
      },
    },
  });
}
