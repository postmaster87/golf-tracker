package com.postmaster87.golfbakeoff

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
import android.os.HandlerThread
import android.os.IBinder
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

/**
 * K's foreground service. START_STICKY, so Android brings it back if it kills
 * the process; the session in Sessions says whether to keep recording.
 */
class RecorderService : Service() {

    private var client: FusedLocationProviderClient? = null
    private var looperThread: HandlerThread? = null
    private var wakeLock: PowerManager.WakeLock? = null
    @Volatile private var halted = false

    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            val received = System.currentTimeMillis()
            for (location in result.locations) {
                val fix = location.toFix(received)
                if (fix == null) SessionLog.event("fix_without_time") else SessionLog.fix(fix)
            }
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
        val session = Sessions.active(this)
        if (session == null) {
            stopSelf()
            return START_NOT_STICKY
        }
        val why = if (intent == null) "sticky_restart" else "start"
        SessionLog.open(this, session, why)
        if (!goForeground()) {
            stopSelf()
            return START_NOT_STICKY
        }
        if (client == null) beginUpdates(why)
        return START_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        SessionLog.event("task_removed")
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        SessionLog.event("service_destroy", "halted_by_user=${if (halted) 1 else 0}")
        endUpdates()
        instance = null
        super.onDestroy()
    }

    private fun goForeground(): Boolean = try {
        ServiceCompat.startForeground(
            this,
            NOTE_ID,
            notification(),
            ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION,
        )
        true
    } catch (e: Exception) {
        SessionLog.event("foreground_start_failed", "${e.javaClass.simpleName}: ${e.message}")
        false
    }

    @SuppressLint("MissingPermission")
    private fun beginUpdates(why: String) {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            SessionLog.event("no_precise_location_permission")
            return
        }
        halted = false
        val thread = HandlerThread("fixes").apply { start() }
        looperThread = thread
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
            .addOnSuccessListener { SessionLog.event("updates_on", "why=$why;interval_ms=$INTERVAL_MS") }
            .addOnFailureListener { e -> SessionLog.event("updates_failed", "${e.javaClass.simpleName}: ${e.message}") }
        wakeLock = getSystemService(PowerManager::class.java)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "golfbakeoff:recorder")
            .apply {
                setReferenceCounted(false)
                acquire()
            }
    }

    private fun endUpdates() {
        client?.removeLocationUpdates(callback)
        client = null
        looperThread?.quitSafely()
        looperThread = null
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = null
    }

    private fun notification(): Notification {
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
        val builder = Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_rec)
            .setContentTitle("GPS Custom recording")
            .setContentText(Sessions.active(this) ?: "")
            .setOngoing(true)
            .setContentIntent(open)
        if (Build.VERSION.SDK_INT >= 31) {
            builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
        }
        return builder.build()
    }

    companion object {
        const val INTERVAL_MS = 1_000L
        private const val NOTE_ID = 1
        private const val CHANNEL = "recording"

        @Volatile private var instance: RecorderService? = null

        val isRecording: Boolean
            get() = instance?.client != null

        /** Stop taking fixes now, on the caller's thread, so STOP's events land before the log closes. */
        fun halt(why: String) {
            val service = instance ?: return
            SessionLog.event("recorder_halt", "why=$why")
            service.halted = true
            service.endUpdates()
        }
    }
}
