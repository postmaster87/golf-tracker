package com.postmaster87.golftracker

import android.content.Context
import android.webkit.JavascriptInterface

/**
 * `window.GolfNative` - the whole seam between the web layer and the phone.
 *
 * Its mere presence is the one signal the web layer uses to know it is in the
 * shell (`globalThis.GolfNative`), so nothing here may be installed on a build
 * that is not the shell.
 *
 * EVERY METHOD RUNS ON A BINDER THREAD, not the UI thread, and may run while a
 * round is being recorded. So: no Android UI here, and anything touching the
 * files goes through the store, which is synchronized.
 *
 * FAILURE POSTURE, matching the web layer's own: a failure returns
 * `{"error": "..."}` for an object result and `false`/`0` for a primitive, and
 * never throws across the bridge. The web layer treats that exactly as it
 * treats an unavailable IndexedDB - degrade, never throw - because losing the
 * dense track costs analysis quality and losing the round costs a round of golf.
 */
class GolfNative(context: Context) {

    private val app: Context = context.applicationContext

    /** The web build baked into this APK - `BUILD.id`, by construction (D9). */
    @JavascriptInterface
    fun version(): String = BuildConfig.VERSION_NAME
}
