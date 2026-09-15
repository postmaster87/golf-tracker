package com.postmaster87.golfbakeoff

import android.Manifest
import android.app.Activity
import android.app.Application
import android.content.Context
import android.location.Location
import com.transistorsoft.locationmanager.kotlin.BGGeo
import com.transistorsoft.locationmanager.kotlin.config.DesiredAccuracy
import com.transistorsoft.locationmanager.kotlin.config.LogLevel
import com.transistorsoft.locationmanager.location.filter.LocationFilterPolicy
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * T - transistorsoft's tslocationmanager 4.5.1 in a debug build, which their
 * licence (section 3.5) says is fully functional without a key.
 *
 * Out of the box it is the wrong instrument for golf, by its own docs and
 * source, so four defaults are changed and nothing else (quotes in the README):
 *  - Its location filter rejects whole fixes: any worse than a 100 m accuracy
 *    gate, and outliers under the stricter policies (LocationFilter.evaluate
 *    in the 4.5.1 source; accepted fixes keep their coordinates). A rejected
 *    fix is a hole in the track, so: PassThrough, trackingAccuracyThreshold 0
 *    ("PassThrough does not disable trackingAccuracyThreshold"), Kalman off.
 *  - It turns GPS off when he stands still - which is the shot. Stop detection
 *    is off ("Location services will never turn OFF if you set this to true")
 *    and the SDK is put in its moving state with changePace(true).
 *  - "By default, the Android plugin will ignore a received location when it is
 *    identical to the previous location" - standing still again - so identical
 *    fixes are kept.
 *  - distanceFilter 0, so locationUpdateInterval (1000 ms) applies, with the
 *    fastest interval set to match ("If not configured, the default fastest
 *    interval is 30000 ms").
 *
 * Two integration rules come from the SDK's EventManager, not from tuning, and
 * a production app on T would need them too:
 *  - With no live screen (headless) it delivers only to
 *    t/BackgroundGeolocationHeadlessTask, never to listeners.
 *  - Coming back to a screen, delivery waits until ready() is called again,
 *    so it is called on every resume.
 * Both routes hand fixes to recordSdkLocation, which writes the same row.
 */
object Recorder {
    const val NAME = "T: transistorsoft tslocationmanager 4.5.1, debug build. Raw fixes " +
        "(PassThrough, no Kalman), stop detection off, 1 Hz."

    val extraPermissions = listOf(
        Manifest.permission.ACTIVITY_RECOGNITION to "Physical activity (the SDK's motion sensing)",
    )

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var subscribed = false
    @Volatile private var commanded = false
    @Volatile private var lastRoute: String? = null

    fun attachActivity(activity: Activity) {
        BGGeo.instance.setActivity(activity)
    }

    /** Leaving headless, the SDK buffers events until ready() is called again (EventManager.isDeliverable). */
    fun onActivityResumed(activity: Activity) {
        BGGeo.instance.setActivity(activity)
        scope.launch {
            try {
                configure()
                SessionLog.event("sdk_ready_on_resume")
            } catch (e: Exception) {
                SessionLog.event("sdk_ready_failed", "${e.javaClass.simpleName}: ${e.message}")
            }
        }
    }

    fun onProcessStart(app: Application) {
        BGGeo.init(app)
        subscribe()
        if (Sessions.active(app) == null) return
        scope.launch {
            try {
                configure()
                val geo = BGGeo.instance
                val state = geo.state
                SessionLog.event("sdk_restored", "enabled=${state.enabled};moving=${state.isMoving}")
                if (!state.enabled) {
                    // Same rule as K: an active session means he is recording.
                    SessionLog.event("resume_on_process_start")
                    geo.start()
                }
                // Only when the SDK did not come back moving by itself; again on a moving SDK it
                // has nothing to do. (Run 2 called it unconditionally and saw repeated fix times
                // after the kill; run 3 did not call it and still saw them - 22 in the log, 21 in
                // the SDK store - so the repeats do not come from this call.)
                if (!geo.state.isMoving) {
                    geo.changePace(true)
                    SessionLog.event("sdk_change_pace", "moving=true;on=process_start")
                }
                commanded = true
                val after = geo.state
                SessionLog.event("sdk_resumed", "enabled=${after.enabled};moving=${after.isMoving}")
            } catch (e: Exception) {
                SessionLog.event("sdk_restore_failed", "${e.javaClass.simpleName}: ${e.message}")
            }
        }
    }

    fun start(ctx: Context) {
        scope.launch {
            try {
                configure()
                val geo = BGGeo.instance
                geo.start()
                geo.changePace(true)
                commanded = true
                val state = geo.state
                SessionLog.event("sdk_started", "enabled=${state.enabled};moving=${state.isMoving}")
            } catch (e: Exception) {
                SessionLog.event("sdk_start_failed", "${e.javaClass.simpleName}: ${e.message}")
            }
        }
    }

    fun stop(ctx: Context) {
        commanded = false
        SessionLog.event("sdk_stop_requested")
        scope.launch { runCatching { BGGeo.instance.stop() } }
    }

    fun isRunning(): Boolean = runCatching { BGGeo.instance.state.enabled }.getOrDefault(commanded)

    /** The SDK's own SQLite record, exported beside our CSV so the two can be compared. */
    fun dumpSdkStore(ctx: Context): File? = runCatching {
        val rows = runBlocking { BGGeo.instance.store.all() }
        val array = JSONArray()
        for (row in rows) array.put(JSONObject(row))
        val stamp = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(Date())
        File(ctx.cacheDir, "sdk-store-$stamp.json").apply { writeText(array.toString()) }
    }.getOrNull()

    /**
     * One fix from the SDK, from either route. The Android Location the SDK
     * recorded is written through the same toFix as K's. The route is logged
     * each time it changes, so the event log shows when delivery went headless.
     */
    fun recordSdkLocation(
        location: Location?,
        moving: Boolean?,
        sample: Boolean?,
        sdkEvent: String?,
        route: String,
        timestamp: String?,
    ) {
        val received = System.currentTimeMillis()
        if (lastRoute != route) {
            lastRoute = route
            SessionLog.event("sdk_delivery_route", "route=$route")
        }
        val fix = location?.toFix(received, moving = moving, sample = sample, event = sdkEvent)
        if (fix == null) {
            SessionLog.event("sdk_fix_without_location_or_time", "route=$route;timestamp=$timestamp")
        } else {
            SessionLog.fix(fix)
        }
    }

    private suspend fun configure() {
        BGGeo.instance.ready {
            geolocation.desiredAccuracy = DesiredAccuracy.HIGH
            geolocation.distanceFilter = 0f
            geolocation.locationUpdateInterval = 1000L
            geolocation.fastestLocationUpdateInterval = 1000L
            geolocation.disableElasticity = true
            geolocation.allowIdenticalLocations = true
            geolocation.filter.policy = LocationFilterPolicy.PassThrough
            geolocation.filter.useKalman = false
            geolocation.filter.trackingAccuracyThreshold = 0.0
            activity.disableStopDetection = true
            app.stopOnTerminate = false
            app.startOnBoot = false
            app.enableHeadless = true
            app.notification.sticky = true
            app.notification.title = "GPS Transistor recording"
            app.notification.text = "transistorsoft, 1 Hz"
            app.notification.smallIcon = "drawable/ic_stat_rec"
            logger.debug = false
            logger.logLevel = LogLevel.INFO
            persistence.maxDaysToPersist = 30
        }
    }

    private fun subscribe() {
        if (subscribed) return
        subscribed = true
        val geo = BGGeo.instance
        geo.onLocation { e ->
            recordSdkLocation(
                location = runCatching { e.location }.getOrNull(),
                moving = e.isMoving,
                sample = e.isSample,
                sdkEvent = e.event_,
                route = "listener",
                timestamp = runCatching { e.timestamp }.getOrNull(),
            )
        }
        geo.onMotionChange { e -> SessionLog.event("sdk_motionchange", "moving=${e.isMoving};route=listener") }
        geo.onProviderChange { e -> SessionLog.event("sdk_providerchange", "status=${e.status};route=listener") }
        geo.onPowerSaveChange { e -> SessionLog.event("sdk_battery_saver", "on=${e.isPowerSaveMode};route=listener") }
    }
}
