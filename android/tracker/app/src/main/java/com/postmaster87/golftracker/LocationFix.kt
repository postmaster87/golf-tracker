package com.postmaster87.golftracker

import android.location.Location
import android.os.Build

/**
 * An Android Location as a row. LIFTED FROM THE BAKE-OFF unchanged apart from
 * the package (`android/bakeoff/.../LocationFix.kt`): one path from a Location
 * to a row, so every column is written the same way from the same kind of
 * object.
 *
 * Returns null for a fix with no time of its own: it is not written, because a
 * time would have to be made up for it.
 */
fun Location.toFix(
    receivedWallMs: Long,
    moving: Boolean? = null,
    sample: Boolean? = null,
    event: String? = null,
): Fix? {
    if (time <= 0L) return null
    return Fix(
        wallMs = receivedWallMs,
        fixMs = time,
        elapsedRtMs = elapsedRealtimeNanos / 1_000_000,
        lat = latitude,
        lon = longitude,
        accM = if (hasAccuracy()) accuracy else null,
        altM = if (hasAltitude()) altitude else null,
        vaccM = if (hasVerticalAccuracy()) verticalAccuracyMeters else null,
        speedMps = if (hasSpeed()) speed else null,
        bearingDeg = if (hasBearing()) bearing else null,
        provider = provider,
        mock = if (Build.VERSION.SDK_INT >= 31) isMock else @Suppress("DEPRECATION") isFromMockProvider,
        moving = moving,
        sample = sample,
        event = event,
    )
}
