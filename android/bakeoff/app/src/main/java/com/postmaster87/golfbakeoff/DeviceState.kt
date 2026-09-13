package com.postmaster87.golfbakeoff

import android.app.ActivityManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.location.LocationManager
import android.media.AudioManager
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import org.json.JSONObject

/**
 * The phone's state, written beside the track as evidence for why a gap
 * happened. Every reading is independent and none of them can throw: an
 * unreadable value is written as "?", not skipped and not guessed.
 */
object DeviceState {

    fun snapshot(ctx: Context): String {
        val pm = ctx.getSystemService(PowerManager::class.java)
        val am = ctx.getSystemService(ActivityManager::class.java)
        val bm = ctx.getSystemService(BatteryManager::class.java)
        val audio = ctx.getSystemService(AudioManager::class.java)
        val usm = ctx.getSystemService(UsageStatsManager::class.java)
        val lm = ctx.getSystemService(LocationManager::class.java)
        val readings: List<Pair<String, () -> String>> = listOf(
            "screen_on" to { bit(pm.isInteractive) },
            "doze" to { bit(pm.isDeviceIdleMode) },
            "battery_saver" to { bit(pm.isPowerSaveMode) },
            "unrestricted" to { bit(pm.isIgnoringBatteryOptimizations(ctx.packageName)) },
            "bg_restricted" to { bit(am.isBackgroundRestricted) },
            "standby_bucket" to { usm.appStandbyBucket.toString() },
            "thermal" to { pm.currentThermalStatus.toString() },
            "battery_pct" to { bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY).toString() },
            "charging" to { bit(bm.isCharging) },
            "music" to { bit(audio.isMusicActive) },
            "location_on" to { bit(lm.isLocationEnabled) },
        )
        return readings.joinToString(";") { (key, read) ->
            "$key=" + (runCatching(read).getOrNull() ?: "?")
        }
    }

    fun meta(ctx: Context, id: String): JSONObject = JSONObject().apply {
        put("session", id)
        put("recorder_tag", BuildConfig.RECORDER_TAG)
        put("recorder", Recorder.NAME)
        put("app_version", BuildConfig.VERSION_NAME)
        put("application_id", ctx.packageName)
        put("started_wall_ms", System.currentTimeMillis())
        put("device", "${Build.MANUFACTURER} ${Build.MODEL}")
        put("android", Build.VERSION.RELEASE)
        put("sdk_int", Build.VERSION.SDK_INT)
        put("gap_threshold_ms", Coverage.GAP_MS)
        put("pass_covered_pct", Coverage.PASS_COVERED_PCT)
        put("state_at_start", snapshot(ctx))
    }

    private fun bit(b: Boolean) = if (b) "1" else "0"
}
