package com.postmaster87.golfbakeoff

/**
 * One fix as the bake-off stores it, and the two CSV layouts.
 *
 * Every cell is what the recorder was handed, never derived: an absent value
 * is an empty cell, not a zero, and a fix whose time cannot be read is not
 * written at all (the event log records that instead). Measured and inferred
 * are never mixed in this file because nothing here is inferred.
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
    /** transistorsoft only: the SDK's moving state when it recorded the fix. */
    val moving: Boolean? = null,
    /** transistorsoft only: an intermediate sample the SDK does not persist. */
    val sample: Boolean? = null,
    /** transistorsoft only: the SDK event that produced the fix, if any. */
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

    private fun bit(b: Boolean?): String? = b?.let { if (it) "1" else "0" }
}
