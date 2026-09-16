package com.postmaster87.golftracker

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
 * happened. LIFTED FROM THE BAKE-OFF's `DeviceState.kt`; `snapshot` is
 * unchanged, `meta` gains the three fields the shell needs (spec Section 4):
 * `round_id`, `build` and `recorder`.
 *
 * Every reading is independent and none of them can throw: an unreadable value
 * is written as "?", not skipped and not guessed.
 */
object DeviceState {

    /**
     * The bar, so a log says what it was written to be scored against. Matt's
     * pick, 2026-09-13: "99% coverage, no gap > 20 s". The verdict itself comes
     * from `tools/track-coverage.py` on the PC, which carries its own copy.
     */
    const val GAP_MS = 20_000L
    const val PASS_COVERED_PCT = 99.0

    fun snapshot(ctx: Context): String {
        val pm = ctx.getSystemService(PowerManager::class.java)
        val am = ctx.getSystemService(ActivityManager::class.java)
        val bm = ctx.getSystemService(BatteryManager::class.java)
        val audio = ctx.getSystemService(AudioManager::class.java)
        val usm = ctx.getSystemService(UsageStatsManager::class.java)
        val lm = ctx.getSystemService(LocationManager::class.java)
        val readings: List<Pair<String, () -> String>> = listOf(
            "screen_on" to { bit(pm.isInteractive) },
            // Deep idle only. Light Doze is read on its own below; Android can
            // read it from API 33, so it is "?" on older phones.
            "doze" to { bit(pm.isDeviceIdleMode) },
            "light_doze" to { if (Build.VERSION.SDK_INT >= 33) bit(pm.isDeviceLightIdleMode) else "?" },
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

    fun meta(ctx: Context, roundId: String): JSONObject = JSONObject().apply {
        // The round this track belongs to. The whole reason the folder is named
        // by the web record's id.
        put("round_id", roundId)
        put("session", roundId)
        // "native-k", never the prose: the one field that says which recorder
        // wrote these rows, and the one `readTrack` contrasts with "import".
        put("recorder", Recorder.TAG)
        put("recorder_tag", "K")
        put("recorder_name", Recorder.NAME)
        put("build", BuildConfig.VERSION_NAME)
        put("app_version", BuildConfig.VERSION_NAME)
        put("application_id", ctx.packageName)
        put("started_wall_ms", System.currentTimeMillis())
        put("device", "${Build.MANUFACTURER} ${Build.MODEL}")
        put("android", Build.VERSION.RELEASE)
        put("sdk_int", Build.VERSION.SDK_INT)
        put("gap_threshold_ms", GAP_MS)
        put("pass_covered_pct", PASS_COVERED_PCT)
        put("state_at_start", snapshot(ctx))
    }

    /** meta.json for a track that was imported, not recorded (spec Section 4). */
    fun importMeta(ctx: Context, roundId: String, points: Int): JSONObject = JSONObject().apply {
        put("round_id", roundId)
        put("session", roundId)
        put("recorder", TrackFiles.PROVIDER_IMPORT)
        put("build", BuildConfig.VERSION_NAME)
        put("application_id", ctx.packageName)
        put("imported_wall_ms", System.currentTimeMillis())
        put("imported_points", points)
        put("device", "${Build.MANUFACTURER} ${Build.MODEL}")
        put("android", Build.VERSION.RELEASE)
    }

    private fun bit(b: Boolean) = if (b) "1" else "0"
}
