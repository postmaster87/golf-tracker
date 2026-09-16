package com.postmaster87.golftracker

/**
 * One round being recorded: the two rules that decide when the recorder stops.
 *
 * Pure Kotlin, no Android, because both rules have to be provable off the
 * phone - one of them only fires after eight hours.
 */
data class RecordingSession(val roundId: String, val startedWallMs: Long) {

    /**
     * The same-id rule (spec Section 3).
     *
     * `stopRecording` for a DIFFERENT round is ignored and logged
     * `stop_ignored`, never obeyed. The web layer follows the round from inside
     * the GPS loop, and a stale id arriving from a screen that was resumed late
     * must not be able to end the round he is actually playing.
     */
    fun accepts(stopId: String?): Boolean = stopId == roundId

    /**
     * The 8 h cap. Only ever bounds a round the web layer never closed - the
     * longest round logged is 181 min (FT4, HANDOFF-native-build Section 9), so
     * nothing he plays comes near it.
     */
    fun capExpired(nowMs: Long): Boolean = nowMs - startedWallMs >= CAP_MS

    /** Milliseconds left before the cap, floored at 0. */
    fun capRemainingMs(nowMs: Long): Long =
        (startedWallMs + CAP_MS - nowMs).coerceAtLeast(0L)

    companion object {
        const val CAP_MS = 8L * 60L * 60L * 1000L
    }
}
