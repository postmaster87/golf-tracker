package com.postmaster87.golftracker

/**
 * The one hop from the recorder to the screen.
 *
 * The recorder never knows whether anything is looking. The Activity hangs a
 * sink here while it is RESUMED and takes it down again the moment it is not,
 * so nothing is queued for a page that is frozen or gone (spec Section 3:
 * fixes reach JS only while the Activity is resumed, and `gps.js`'s own revive
 * logic handles the resume). A fix that arrives with no sink is simply not
 * delivered - it is already in the log, which is the record.
 */
object FixBus {
    @Volatile
    var sink: ((Fix) -> Unit)? = null

    fun deliver(fix: Fix) {
        val s = sink ?: return
        // A broken screen must never break the recording loop.
        runCatching { s(fix) }
    }
}
