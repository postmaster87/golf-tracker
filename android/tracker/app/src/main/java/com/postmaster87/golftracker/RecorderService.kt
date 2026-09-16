package com.postmaster87.golftracker

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.ServiceCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.Granularity
import com.google.android.gms.location.LocationAvailability
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * THE ONE LOCATION SOURCE (D7), lifted from the bake-off's K service and given
 * the shell's three states.
 *
 * | state     | updates | wake lock | fix log | fixes to JS      | notification |
 * |-----------|---------|-----------|---------|------------------|--------------|
 * | idle      | off     | no        | no      | no               | none         |
 * | gps-on    | on      | no        | no      | while resumed    | "GPS on"     |
 * | recording | on      | yes       | yes     | while resumed    | "Recording.." |
 *
 * Two requesters would deliver the same fix twice down two paths. One path
 * means the mark burst the web layer reduces and the track the analysis reads
 * are literally the same fixes.
 *
 * START_STICKY, so Android brings it back if it kills the process; the
 * committed round id in `Sessions` is what says whether to keep recording.
 */
class RecorderService : Service() {

    private var client: FusedLocationProviderClient? = null
    private var looperThread: HandlerThread? = null
    private var wakeLock: PowerManager.WakeLock? = null
    @Volatile private var session: RecordingSession? = null
    @Volatile private var halted = false

    private val capHandler = Handler(Looper.getMainLooper())
    private val capRunnable = Runnable { checkCapNow() }

    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            val received = System.currentTimeMillis()
            for (location in result.locations) {
                val fix = location.toFix(received)
                if (fix == null) {
                    SessionLog.event("fix_without_time")
                    continue
                }
                // The log first: it is the record. The screen is a consumer.
                if (session != null) SessionLog.fix(fix)
                FixBus.deliver(fix)
            }
            checkCapNow()
        }

        override fun onLocationAvailability(availability: LocationAvailability) {
            SessionLog.event("availability", "available=${availability.isLocationAvailable}")
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        instance = this
        val roundId = Sessions.active(this)
        val wantsGps = Recorder.wantsGps()
        if (roundId == null && !wantsGps) {
            stopSelf()
            return START_NOT_STICKY
        }
        val why = if (intent == null) "sticky_restart" else "start"

        if (roundId != null) {
            SessionLog.open(this, roundId, why)
            if (session?.roundId != roundId) {
                session = RecordingSession(
                    roundId,
                    Sessions.startedWallMs(this, roundId) ?: System.currentTimeMillis(),
                )
            }
        } else {
            session = null
        }

        if (!goForeground(roundId)) {
            stopSelf()
            return START_NOT_STICKY
        }
        if (client == null) beginUpdates(why)
        setWakeLock(roundId != null)
        scheduleCap()
        return START_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // Swiping the app away does NOT end a round. D8.
        SessionLog.event("task_removed")
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        SessionLog.event("service_destroy", "halted_by_user=${if (halted) 1 else 0}")
        capHandler.removeCallbacks(capRunnable)
        endUpdates()
        session = null
        instance = null
        super.onDestroy()
    }

    // ---- the foreground service -------------------------------------------

    private fun goForeground(roundId: String?): Boolean = try {
        ServiceCompat.startForeground(
            this,
            NOTE_ID,
            notification(roundId),
            ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION,
        )
        true
    } catch (e: Exception) {
        SessionLog.event("foreground_start_failed", "${e.javaClass.simpleName}: ${e.message}")
        false
    }

    private fun notification(roundId: String?): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, "Recording", NotificationManager.IMPORTANCE_LOW),
        )
        val open = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE,
        )
        val title = if (roundId == null) {
            "GPS on"
        } else {
            val started = Sessions.startedWallMs(this, roundId)
            if (started != null) {
                "Recording round · started " +
                    SimpleDateFormat("HH:mm", Locale.US).format(Date(started))
            } else {
                "Recording round"
            }
        }
        val builder = Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_rec)
            .setContentTitle(title)
            .setContentText(if (roundId == null) "Golf Tracker" else roundId)
            .setOngoing(true)
            .setContentIntent(open)
        if (Build.VERSION.SDK_INT >= 31) {
            builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
        }
        return builder.build()
    }

    // ---- location updates --------------------------------------------------

    @SuppressLint("MissingPermission")
    private fun beginUpdates(why: String) {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            SessionLog.event("no_precise_location_permission")
            return
        }
        halted = false
        val thread = HandlerThread("fixes").apply { start() }
        looperThread = thread
        // The canonical request, byte for byte the bake-off's (REPORT_2.3
        // Section 4 read it back out of the code): one fix a second, no
        // distance filter, no batching, fine granularity, and do not wait for
        // an accurate fix before delivering.
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, INTERVAL_MS)
            .setMinUpdateIntervalMillis(INTERVAL_MS)
            .setMinUpdateDistanceMeters(0f)
            .setMaxUpdateDelayMillis(0L)
            .setGranularity(Granularity.GRANULARITY_FINE)
            .setWaitForAccurateLocation(false)
            .build()
        val c = LocationServices.getFusedLocationProviderClient(this)
        client = c
        c.requestLocationUpdates(request, callback, thread.looper)
            .addOnSuccessListener {
                SessionLog.event("updates_on", "why=$why;interval_ms=$INTERVAL_MS")
            }
            .addOnFailureListener { e ->
                SessionLog.event("updates_failed", "${e.javaClass.simpleName}: ${e.message}")
            }
    }

    private fun endUpdates() {
        client?.removeLocationUpdates(callback)
        client = null
        looperThread?.quitSafely()
        looperThread = null
        setWakeLock(false)
    }

    /**
     * The partial wake lock, held ONLY while recording (D7).
     *
     * Non-reference-counted, so acquire twice and release once still releases.
     * It is the reason K kept 1 Hz through a locked screen and forced Doze in
     * the bake-off, and the reason a T-alone carry has to be measured on its
     * own (REPORT_2.3 Section 9): a wake lock keeps the CPU on for every app.
     */
    private fun setWakeLock(on: Boolean) {
        if (on) {
            if (wakeLock?.isHeld == true) return
            wakeLock = getSystemService(PowerManager::class.java)
                .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "golftracker:recorder")
                .apply {
                    setReferenceCounted(false)
                    acquire()
                }
        } else {
            wakeLock?.let { if (it.isHeld) it.release() }
            wakeLock = null
        }
    }

    // ---- the 8 h cap -------------------------------------------------------

    private fun scheduleCap() {
        capHandler.removeCallbacks(capRunnable)
        val s = session ?: return
        capHandler.postDelayed(capRunnable, s.capRemainingMs(System.currentTimeMillis()))
    }

    private fun checkCapNow() {
        val s = session ?: return
        if (!s.capExpired(System.currentTimeMillis())) return
        Recorder.autoStop(applicationContext, s.roundId)
    }

    companion object {
        const val INTERVAL_MS = 1_000L
        private const val NOTE_ID = 1
        private const val CHANNEL = "recording"

        @Volatile private var instance: RecorderService? = null

        val isRecording: Boolean
            get() = instance?.session != null

        val recordingRoundId: String?
            get() = instance?.session?.roundId

        /** Whether the fused client is delivering at all (gps-on or recording). */
        val isTracking: Boolean
            get() = instance?.client != null

        /**
         * Stop taking fixes now, on the caller's thread, so a stop's events land
         * before the log closes.
         */
        fun halt(why: String) {
            val service = instance ?: return
            SessionLog.event("recorder_halt", "why=$why")
            service.halted = true
            service.capHandler.removeCallbacks(service.capRunnable)
            service.session = null
            service.endUpdates()
        }

        /** The heartbeat's hook, so the cap can fire with no fixes arriving. */
        fun checkCap() {
            instance?.checkCapNow()
        }
    }
}
