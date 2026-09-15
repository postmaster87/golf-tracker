package com.postmaster87.golfbakeoff

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Handler
import android.os.HandlerThread
import android.os.PowerManager
import android.os.Process
import android.os.SystemClock
import androidx.core.content.ContextCompat
import java.io.BufferedWriter
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.RandomAccessFile

/**
 * The session's two append-only files, and the heartbeat that makes a gap
 * explainable.
 *
 * WRITE POSTURE. Every row is flushed to the OS as it is written, so a killed
 * process loses nothing it had already handed over. fsync runs every 15 s (the
 * web app's FLUSH_MS), which bounds what a phone power-off can take. A process
 * killed mid-row leaves a cut row; the next open ends that line first, so the
 * cut row is skipped by the reader instead of fusing with the next one.
 *
 * THE HEARTBEAT. Every 5 s an `hb` event records whether the recorder is
 * running, how long since the last fix, and the phone's state (screen, Doze,
 * light Doze, battery saver, standby bucket, heat, music). A gap in fixes with
 * heartbeats saying recorder=1 is the GPS going quiet. The timer dies with the
 * process, and it runs on uptime, so it runs late while the CPU sleeps: a gap
 * with no heartbeats is not by itself the app not running. tools/track-coverage.py
 * reads a death from log_open (reason=process_start), previous_exit and
 * fixes_this_process instead, and measures beat spacing on elapsed_rt_ms.
 */
object SessionLog {
    private const val HEARTBEAT_MS = 5_000L
    private const val SYNC_MS = 15_000L

    private var appCtx: Context? = null
    private var id: String? = null
    private var fixOut: FileOutputStream? = null
    private var fixWriter: BufferedWriter? = null
    private var eventOut: FileOutputStream? = null
    private var eventWriter: BufferedWriter? = null
    private var lastSyncMs = 0L
    @Volatile private var ticker: HandlerThread? = null
    private var receiver: BroadcastReceiver? = null

    @Volatile var lastFixWallMs = 0L
        private set
    @Volatile var lastAccM: Float? = null
        private set
    @Volatile var lastHeartbeatWallMs = 0L
        private set
    @Volatile var fixesThisProcess = 0L
        private set
    /** Rows the phone refused to write (disk full, storage gone). Shown on screen. */
    @Volatile var writeFailures = 0L
        private set

    @Synchronized
    fun open(ctx: Context, sessionId: String, reason: String) {
        if (id == sessionId) {
            eventLocked("log_reopen", "reason=$reason")
            return
        }
        closeLocked()
        val app = ctx.applicationContext
        appCtx = app
        val dir = Sessions.dir(app, sessionId).apply { mkdirs() }
        val fixes = File(dir, "fixes.csv")
        val events = File(dir, "events.csv")
        val fixesNew = fixes.length() == 0L
        val eventsNew = events.length() == 0L
        val fixesCut = !fixesNew && !endsWithNewline(fixes)
        val eventsCut = !eventsNew && !endsWithNewline(events)

        fixOut = FileOutputStream(fixes, true).also { fixWriter = it.bufferedWriter() }
        eventOut = FileOutputStream(events, true).also { eventWriter = it.bufferedWriter() }
        id = sessionId

        if (fixesNew) line(fixWriter, Csv.FIXES_HEADER) else if (fixesCut) line(fixWriter, "")
        if (eventsNew) line(eventWriter, Csv.EVENTS_HEADER) else if (eventsCut) line(eventWriter, "")
        eventLocked(
            "log_open",
            "reason=$reason;pid=${Process.myPid()};" +
                "cut_row_ended=fixes:${bit(fixesCut)}/events:${bit(eventsCut)};" +
                DeviceState.snapshot(app),
        )
        startTicker()
        registerReceiver(app)
    }

    @Synchronized
    fun fix(f: Fix) {
        val w = fixWriter ?: return
        line(w, f.csvRow())
        lastFixWallMs = f.wallMs
        lastAccM = f.accM
        fixesThisProcess++
        maybeSync()
    }

    @Synchronized
    fun event(kind: String, detail: String = "") = eventLocked(kind, detail)

    @Synchronized
    fun close(reason: String) {
        if (id == null) return
        eventLocked("log_close", "reason=$reason")
        closeLocked()
    }

    private fun eventLocked(kind: String, detail: String) {
        val w = eventWriter ?: return
        line(
            w,
            "${System.currentTimeMillis()},${SystemClock.elapsedRealtime()}," +
                "${Csv.token(kind)},${Csv.quote(detail)}",
        )
        maybeSync()
    }

    private fun closeLocked() {
        stopTicker()
        unregisterReceiver()
        runCatching { fixWriter?.flush(); fixOut?.fd?.sync() }
        runCatching { eventWriter?.flush(); eventOut?.fd?.sync() }
        runCatching { fixWriter?.close() }
        runCatching { eventWriter?.close() }
        fixWriter = null
        fixOut = null
        eventWriter = null
        eventOut = null
        id = null
    }

    private fun line(w: BufferedWriter?, s: String) {
        if (w == null) return
        try {
            w.write(s)
            w.write("\n")
            w.flush()
        } catch (e: IOException) {
            writeFailures++
        }
    }

    private fun maybeSync() {
        val now = SystemClock.elapsedRealtime()
        if (now - lastSyncMs < SYNC_MS) return
        lastSyncMs = now
        runCatching { fixOut?.fd?.sync() }
        runCatching { eventOut?.fd?.sync() }
    }

    private fun startTicker() {
        if (ticker != null) return
        val thread = HandlerThread("heartbeat").apply { start() }
        ticker = thread
        val handler = Handler(thread.looper)
        handler.post(object : Runnable {
            override fun run() {
                if (ticker !== thread) return
                heartbeat()
                handler.postDelayed(this, HEARTBEAT_MS)
            }
        })
    }

    private fun stopTicker() {
        ticker?.quitSafely()
        ticker = null
    }

    private fun heartbeat() {
        val app = appCtx ?: return
        val now = System.currentTimeMillis()
        val since = if (lastFixWallMs > 0) now - lastFixWallMs else -1
        // Asked outside the lock: the recorder may call into its SDK.
        val detail = "recorder=${bit(Recorder.isRunning())};since_fix_ms=$since;" +
            "fixes_this_process=$fixesThisProcess;write_failures=$writeFailures;" +
            DeviceState.snapshot(app)
        synchronized(this) {
            if (id == null) return
            eventLocked("hb", detail)
            lastHeartbeatWallMs = now
        }
    }

    private fun registerReceiver(app: Context) {
        if (receiver != null) return
        val r = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                val kind = when (intent.action) {
                    Intent.ACTION_SCREEN_OFF -> "screen_off"
                    Intent.ACTION_SCREEN_ON -> "screen_on"
                    Intent.ACTION_USER_PRESENT -> "unlocked"
                    PowerManager.ACTION_DEVICE_IDLE_MODE_CHANGED -> "doze_changed"
                    PowerManager.ACTION_POWER_SAVE_MODE_CHANGED -> "battery_saver_changed"
                    else -> intent.action ?: "broadcast"
                }
                event(kind, DeviceState.snapshot(context))
            }
        }
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_USER_PRESENT)
            addAction(PowerManager.ACTION_DEVICE_IDLE_MODE_CHANGED)
            addAction(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED)
        }
        ContextCompat.registerReceiver(app, r, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
        receiver = r
    }

    private fun unregisterReceiver() {
        val r = receiver ?: return
        runCatching { appCtx?.unregisterReceiver(r) }
        receiver = null
    }

    private fun endsWithNewline(file: File): Boolean {
        if (file.length() == 0L) return true
        return RandomAccessFile(file, "r").use { raf ->
            raf.seek(file.length() - 1)
            raf.read() == '\n'.code
        }
    }

    private fun bit(b: Boolean) = if (b) "1" else "0"
}
