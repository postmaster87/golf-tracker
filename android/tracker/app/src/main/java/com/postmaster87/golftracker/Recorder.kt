package com.postmaster87.golftracker

import android.app.Application
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

/**
 * K - the hand-written recorder, lifted from the bake-off: the fused location
 * provider at high accuracy, one fix a second and no distance filter, inside a
 * location foreground service that holds a partial wake lock for as long as a
 * round is recording.
 *
 * Fused, not raw GNSS, because that is what Chrome handed the web app, and the
 * web app's accuracy (median 3.0-3.2 m, FT3-FT6) is the field-validated number.
 * K and transistorsoft delivered the same fixes byte for byte on the 2026-09-14
 * round (7,230 of 7,230 shared, n = 1 round, REPORT_2.3), and K holds the only
 * wake lock, so K is what the shell ships (D1).
 *
 * WHAT THIS OBJECT IS FOR. One service, one location requester (D7), and three
 * states - idle, gps-on, recording. Nothing sets the state directly: every
 * caller changes one of the three inputs below and then asks `sync` to make the
 * service match.
 *
 *   recording   Sessions.active(ctx) != null      committed, survives the process
 *   gps-on      watches > 0 && resumed            lives only in this process
 *   idle        neither
 */
object Recorder {

    /** What meta.json calls this recorder, and what a native row is tagged. */
    const val TAG = "native-k"

    const val NAME = "K: hand-written Kotlin. Fused location, high accuracy, 1 Hz, " +
        "foreground service with a partial wake lock."

    /** Live `navigator.geolocation` watches held by the web layer. */
    @Volatile
    private var watches = 0

    /** Whether the Activity is resumed - the other half of gps-on. */
    @Volatile
    private var resumed = false

    fun wantsGps(): Boolean = watches > 0 && resumed

    val watchCount: Int get() = watches

    @Synchronized
    fun watch(ctx: Context) {
        watches++
        sync(ctx)
    }

    @Synchronized
    fun unwatch(ctx: Context) {
        if (watches > 0) watches--
        sync(ctx)
    }

    @Synchronized
    fun setResumed(ctx: Context, value: Boolean) {
        resumed = value
        sync(ctx)
    }

    /**
     * An active round with no running service means the process came back
     * without it. The committed flag says he is recording, so the recorder
     * resumes; the gap stays in the file and the event log says why.
     */
    fun onProcessStart(app: Application) {
        if (Sessions.active(app) == null || RecorderService.isRecording) return
        SessionLog.event("resume_on_process_start")
        sync(app)
    }

    /**
     * D8: recording follows the round's STATUS, never a null round. Start when
     * the round is in progress; stop only on completed, abandoned, its
     * deletion, or the 8 h cap. Idempotent - the web layer calls this from the
     * GPS loop.
     */
    @Synchronized
    fun startRecording(ctx: Context, roundId: String): Boolean {
        if (!Sessions.isSafeId(roundId)) return false
        val current = Sessions.active(ctx)
        if (current == roundId) {
            sync(ctx)
            return true
        }
        if (current != null) {
            // The web layer can only have one round in progress, so this is a
            // stale id. Close the old one properly rather than leaving two
            // folders both believing they are live.
            SessionLog.event("stop_for_new_round", "was=$current;now=$roundId")
            finishRecording(ctx, current, "superseded")
        }
        Sessions.begin(ctx, roundId)
        sync(ctx)
        return true
    }

    /** The same-id rule: a stop for another round is logged and ignored. */
    @Synchronized
    fun stopRecording(ctx: Context, roundId: String): Boolean {
        val current = Sessions.active(ctx) ?: return false
        if (current != roundId) {
            SessionLog.event("stop_ignored", "recording=$current;asked=$roundId")
            return false
        }
        finishRecording(ctx, roundId, "stop")
        return true
    }

    /** The 8 h cap (spec Section 3). Called by the service, never by the page. */
    @Synchronized
    fun autoStop(ctx: Context, roundId: String) {
        if (Sessions.active(ctx) != roundId) return
        SessionLog.event("auto_stop", "round_id=$roundId;cap_ms=${RecordingSession.CAP_MS}")
        finishRecording(ctx, roundId, "auto_stop")
    }

    /**
     * Stop taking fixes FIRST, so the halt and the stop land in the log before
     * it closes, then drop the committed flag, then let `sync` decide whether
     * the service stays up for a live watch or goes away.
     */
    private fun finishRecording(ctx: Context, roundId: String, why: String) {
        RecorderService.halt(why)
        SessionLog.event("stop", "round_id=$roundId;why=$why")
        Sessions.end(ctx)
        SessionLog.close(why)
        sync(ctx)
    }

    /** Make the service match the three inputs. Safe to call from any thread. */
    fun sync(ctx: Context) {
        val app = ctx.applicationContext
        val intent = Intent(app, RecorderService::class.java)
        if (Sessions.active(app) != null || wantsGps()) {
            try {
                ContextCompat.startForegroundService(app, intent)
            } catch (e: Exception) {
                SessionLog.event("service_start_failed", "${e.javaClass.simpleName}: ${e.message}")
            }
        } else {
            RecorderService.halt("idle")
            runCatching { app.stopService(intent) }
        }
    }

    fun isRunning(): Boolean = RecorderService.isRecording
}
