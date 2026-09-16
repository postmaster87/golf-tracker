package com.postmaster87.golftracker

/**
 * One fix as the shell stores it, and the two CSV layouts.
 *
 * LIFTED FROM THE BAKE-OFF, unchanged apart from the package
 * (`android/bakeoff/.../FixCsv.kt`). The columns are identical on purpose: the
 * recorder logs the shell writes are read by `tools/track-coverage.py` exactly
 * as the bake-off's were, and the bar is scored by the same tool.
 *
 * Every cell is what the recorder was handed, never derived: an absent value is
 * an empty cell, not a zero, and a fix whose time cannot be read is not written
 * at all (the event log records that instead). Measured and inferred are never
 * mixed in this file because nothing here is inferred.
 *
 * `moving`, `sample` and `event` were transistorsoft's columns. They stay in
 * the header, always empty for K, so one reader serves both.
 *
 * No Android imports, so the JVM unit tests exercise the same writer the phone
 * runs.
 */
object Csv {
    const val FIXES_HEADER =
        "wall_ms,fix_ms,elapsed_rt_ms,lat,lon,acc_m,alt_m,vacc_m,speed_mps,bearing_deg," +
            "provider,mock,moving,sample,event"
    const val EVENTS_HEADER = "wall_ms,elapsed_rt_ms,kind,detail"

    val FIXES_COLUMNS = FIXES_HEADER.split(',').size

    /** Event detail is free text, so it is always quoted. */
    fun quote(s: String): String = "\"" + s.replace("\"", "\"\"") + "\""

    /** A bare token cell (provider, event name): never allowed to add a column. */
    fun token(s: String?): String? =
        s?.replace(',', ';')?.replace('\n', ' ')?.replace('\r', ' ')
}

data class Fix(
    /** Phone clock when the app received the fix. */
    val wallMs: Long,
    /** The fix's own time. Coverage is measured on this, as the web app's `ts` was. */
    val fixMs: Long,
    val elapsedRtMs: Long?,
    val lat: Double,
    val lon: Double,
    val accM: Float?,
    val altM: Double?,
    val vaccM: Float?,
    val speedMps: Float?,
    val bearingDeg: Float?,
    val provider: String?,
    val mock: Boolean?,
    val moving: Boolean? = null,
    val sample: Boolean? = null,
    val event: String? = null,
) {
    fun csvRow(): String = listOf(
        wallMs.toString(),
        fixMs.toString(),
        elapsedRtMs?.toString(),
        lat.toString(),
        lon.toString(),
        accM?.toString(),
        altM?.toString(),
        vaccM?.toString(),
        speedMps?.toString(),
        bearingDeg?.toString(),
        Csv.token(provider),
        bit(mock),
        bit(moving),
        bit(sample),
        Csv.token(event),
    ).joinToString(",") { it ?: "" }

    /**
     * The fix as `window.__golfNativeFix` wants it (spec Section 3).
     *
     * Shaped so the shim can build a `GeolocationPosition` out of it with no
     * arithmetic: the same keys `GpsService._onFix` reads off `pos.coords`,
     * plus `ts`, which is the fix's OWN time (`Location.time`, the `fix_ms`
     * column) and not the moment we happened to receive it. An absent value is
     * `null`, never 0 - `gps.js` checks `Number.isFinite` on every one of them.
     *
     * Built by hand rather than through JSONObject so it is testable off the
     * phone and so a null is a JSON null rather than the string "null".
     */
    fun jsJson(): String = buildString {
        append("{\"lat\":").append(num(lat))
        append(",\"lon\":").append(num(lon))
        append(",\"acc\":").append(num(accM))
        append(",\"alt\":").append(num(altM))
        append(",\"altAcc\":").append(num(vaccM))
        append(",\"speed\":").append(num(speedMps))
        append(",\"heading\":").append(num(bearingDeg))
        append(",\"ts\":").append(fixMs)
        append('}')
    }

    private fun bit(b: Boolean?): String? = b?.let { if (it) "1" else "0" }

    private fun num(v: Double?): String =
        if (v == null || v.isNaN() || v.isInfinite()) "null" else v.toString()

    private fun num(v: Float?): String =
        if (v == null || v.isNaN() || v.isInfinite()) "null" else v.toString()
}
