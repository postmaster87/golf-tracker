package com.postmaster87.golfbakeoff

import android.app.Activity
import android.app.Application
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import java.io.File

/**
 * K - the hand-written recorder: the fused location provider at high accuracy,
 * one fix a second and no distance filter, inside a location foreground service
 * that holds a partial wake lock for as long as the session runs.
 *
 * Fused, not raw GNSS, because that is what Chrome handed the web app, and the
 * web app's accuracy (median 3.0-3.2 m, FT3-FT6) is the field-validated number.
 */
object Recorder {
    const val NAME = "K: hand-written Kotlin. Fused location, high accuracy, 1 Hz, " +
        "foreground service with a partial wake lock."

    val extraPermissions: List<Pair<String, String>> = emptyList()

    fun attachActivity(activity: Activity) = Unit

    fun onActivityResumed(activity: Activity) = Unit

    /**
     * An active session with no running service means the process came back
     * without it. The session says he is recording, so the recorder resumes;
     * the gap stays in the file and the event log says why.
     */
    fun onProcessStart(app: Application) {
        if (Sessions.active(app) == null || RecorderService.isRecording) return
        SessionLog.event("resume_on_process_start")
        start(app)
    }

    fun start(ctx: Context) {
        try {
            ContextCompat.startForegroundService(ctx, Intent(ctx, RecorderService::class.java))
        } catch (e: Exception) {
            SessionLog.event("service_start_failed", "${e.javaClass.simpleName}: ${e.message}")
        }
    }

    fun stop(ctx: Context) {
        RecorderService.halt("user_stop")
        ctx.stopService(Intent(ctx, RecorderService::class.java))
    }

    fun isRunning(): Boolean = RecorderService.isRecording

    fun dumpSdkStore(ctx: Context): File? = null
}
