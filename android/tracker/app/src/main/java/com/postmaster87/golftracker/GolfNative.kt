package com.postmaster87.golftracker

import android.content.Context
import android.webkit.JavascriptInterface

/**
 * `window.GolfNative` - the whole seam between the web layer and the phone
 * (spec Section 5).
 *
 * Its mere presence is the one signal the web layer uses to know it is in the
 * shell (`globalThis.GolfNative`), so nothing here may exist on a build that is
 * not the shell.
 *
 * EVERY METHOD RUNS ON A BINDER THREAD, not the UI thread, and may run while a
 * round is being recorded. So: no Android UI here, and everything that touches
 * the files goes through `TrackStore` and `SessionLog`, which are synchronized.
 *
 * FAILURE POSTURE, matching the web layer's own: a failure returns
 * `{"error": "..."}` for an object result and `false`/`0` for a primitive, and
 * never throws across the bridge. The web layer treats that exactly as it
 * treats an unavailable IndexedDB - degrade, never throw - because losing the
 * dense track costs analysis quality and losing the round costs a round of
 * golf, and that is the one thing this app may never do.
 */
class GolfNative(context: Context) {

    private val app: Context = context.applicationContext

    /** The web build baked into this APK - `BUILD.id`, by construction (D9). */
    @JavascriptInterface
    fun version(): String = BuildConfig.VERSION_NAME

    // ---- the shim's watch count -> gps-on ----------------------------------

    @JavascriptInterface
    fun watch(): Boolean {
        Recorder.watch(app)
        return true
    }

    @JavascriptInterface
    fun unwatch(): Boolean {
        Recorder.unwatch(app)
        return true
    }

    // ---- recording ---------------------------------------------------------

    @JavascriptInterface
    fun startRecording(roundId: String): Boolean = safeBool {
        Recorder.startRecording(app, roundId)
    }

    @JavascriptInterface
    fun stopRecording(roundId: String): Boolean = safeBool {
        Recorder.stopRecording(app, roundId)
    }

    @JavascriptInterface
    fun recordingRoundId(): String = runCatching { Sessions.active(app) ?: "" }.getOrDefault("")

    // ---- the track ---------------------------------------------------------

    @JavascriptInterface
    fun readTrack(roundId: String): String =
        runCatching { TrackStore.readTrackJson(app, roundId) }.getOrElse { error(it) }

    @JavascriptInterface
    fun importTrack(roundId: String, pointsJson: String): Int =
        runCatching { TrackStore.importTrack(app, roundId, pointsJson) }.getOrDefault(0)

    @JavascriptInterface
    fun trackSize(roundId: String): Int =
        runCatching { TrackStore.trackSize(app, roundId) }.getOrDefault(0)

    @JavascriptInterface
    fun trackedRoundIds(): String =
        runCatching { TrackStore.trackedRoundIdsJson(app) }.getOrDefault("[]")

    @JavascriptInterface
    fun deleteTrack(roundId: String): Boolean = safeBool {
        TrackStore.deleteTrack(app, roundId)
    }

    @JavascriptInterface
    fun stats(): String = runCatching { TrackStore.statsJson(app) }.getOrElse { error(it) }

    // ---- off the phone -----------------------------------------------------

    @JavascriptInterface
    fun saveExport(filename: String, json: String): String = runCatching {
        "{\"path\":${quote(Exporter.saveExport(app, filename, json))}}"
    }.getOrElse { error(it) }

    @JavascriptInterface
    fun exportLogs(roundId: String): String = runCatching {
        if (!Sessions.isSafeId(roundId)) throw IllegalArgumentException("bad round id")
        "{\"path\":${quote(Exporter.exportLogs(app, roundId))}}"
    }.getOrElse { error(it) }

    // ---- plumbing ----------------------------------------------------------

    private inline fun safeBool(body: () -> Boolean): Boolean = runCatching(body).getOrElse {
        SessionLog.event("bridge_failed", "${it.javaClass.simpleName}: ${it.message}")
        false
    }

    private fun error(t: Throwable): String {
        SessionLog.event("bridge_failed", "${t.javaClass.simpleName}: ${t.message}")
        return "{\"error\":${quote("${t.javaClass.simpleName}: ${t.message}")}}"
    }

    private fun quote(s: String) = "\"" +
        s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ") + "\""
}
