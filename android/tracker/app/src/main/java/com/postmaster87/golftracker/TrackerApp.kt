package com.postmaster87.golftracker

import android.app.ActivityManager
import android.app.Application
import android.app.ApplicationExitInfo

/**
 * Process start. LIFTED FROM THE BAKE-OFF's `BakeoffApp`, including
 * `logExitsSinceLastLook` by name (spec Section 3).
 *
 * If a round was recording when the process died, the log is reopened, Android
 * is asked why the previous process went, and the recorder resumes - before the
 * WebView exists and whether or not the Activity is ever shown. The gap stays
 * in the file and the event log says why.
 */
class TrackerApp : Application() {

    override fun onCreate() {
        super.onCreate()
        val active = Sessions.active(this)
        if (active != null) {
            SessionLog.open(this, active, "process_start")
            logExitsSinceLastLook()
        }
        Recorder.onProcessStart(this)
    }

    /**
     * Why the previous process died, in Android's own words - killed for
     * memory, frozen, swiped away, crashed. Written into the round so a gap
     * names its cause instead of leaving it to be guessed.
     */
    private fun logExitsSinceLastLook() {
        val prefs = getSharedPreferences(EXIT_PREFS, MODE_PRIVATE)
        val seen = prefs.getLong(KEY_LAST_EXIT, 0L)
        val exits = runCatching {
            getSystemService(ActivityManager::class.java)
                .getHistoricalProcessExitReasons(packageName, 0, 10)
        }.getOrDefault(emptyList())
        val fresh = exits.filter { it.timestamp > seen }.sortedBy { it.timestamp }
        for (e in fresh) {
            SessionLog.event(
                "previous_exit",
                "exit_wall_ms=${e.timestamp};reason=${reasonName(e.reason)};status=${e.status};" +
                    "importance=${e.importance};pss_kb=${e.pss};rss_kb=${e.rss};" +
                    "description=${e.description ?: ""}",
            )
        }
        fresh.lastOrNull()?.let { prefs.edit().putLong(KEY_LAST_EXIT, it.timestamp).commit() }
    }

    private fun reasonName(reason: Int): String = when (reason) {
        ApplicationExitInfo.REASON_UNKNOWN -> "unknown"
        ApplicationExitInfo.REASON_EXIT_SELF -> "exit_self"
        ApplicationExitInfo.REASON_SIGNALED -> "signaled"
        ApplicationExitInfo.REASON_LOW_MEMORY -> "low_memory"
        ApplicationExitInfo.REASON_CRASH -> "crash"
        ApplicationExitInfo.REASON_CRASH_NATIVE -> "crash_native"
        ApplicationExitInfo.REASON_ANR -> "anr"
        ApplicationExitInfo.REASON_INITIALIZATION_FAILURE -> "initialization_failure"
        ApplicationExitInfo.REASON_PERMISSION_CHANGE -> "permission_change"
        ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE -> "excessive_resource_usage"
        ApplicationExitInfo.REASON_USER_REQUESTED -> "user_requested"
        ApplicationExitInfo.REASON_USER_STOPPED -> "user_stopped"
        ApplicationExitInfo.REASON_DEPENDENCY_DIED -> "dependency_died"
        ApplicationExitInfo.REASON_OTHER -> "other"
        ApplicationExitInfo.REASON_FREEZER -> "freezer"
        ApplicationExitInfo.REASON_PACKAGE_STATE_CHANGE -> "package_state_change"
        ApplicationExitInfo.REASON_PACKAGE_UPDATED -> "package_updated"
        else -> "code_$reason"
    }

    companion object {
        const val EXIT_PREFS = "exits"
        const val KEY_LAST_EXIT = "last_seen_exit_wall_ms"
    }
}
