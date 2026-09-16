package com.postmaster87.golftracker

import android.content.Context
import org.json.JSONObject
import java.io.File

/**
 * WHERE A ROUND'S TRACK LIVES, AND WHICH ROUND IS BEING RECORDED.
 *
 * LIFTED FROM THE BAKE-OFF's `Sessions.kt`. One thing changed, and it is the
 * whole point of the shell: a folder is named by the WEB RECORD'S ROUND ID
 * (`r_<uuid>`), not by a timestamped session of its own. The native track and
 * the round record are the same round by construction - nothing has to be
 * matched up afterwards.
 *
 *   <filesDir>/rounds/<roundId>/ - fixes.csv, events.csv, meta.json
 *
 * The recording round id is committed synchronously, so a process that dies the
 * instant after startRecording still knows on restart that it should be
 * recording (D8: a WebView that dies mid-round must not take the recording
 * with it).
 */
object Sessions {
    private const val PREFS = "rounds"
    private const val KEY_ACTIVE = "active"

    /**
     * A round id has to be a single, safe path segment before it names a
     * folder. Every id the bridge sees comes from JavaScript, so this is the
     * boundary check - `r_<uuid>` passes, `..` and anything with a separator
     * does not.
     */
    fun isSafeId(id: String?): Boolean =
        !id.isNullOrEmpty() && id.length <= 128 && id != "." && id != ".." &&
            id.all { it.isLetterOrDigit() || it == '_' || it == '-' || it == '.' }

    fun root(ctx: Context): File = File(ctx.filesDir, "rounds").apply { mkdirs() }

    fun dir(ctx: Context, id: String): File = File(root(ctx), id)

    fun active(ctx: Context): String? = prefs(ctx).getString(KEY_ACTIVE, null)

    /**
     * Mark a round as recording, and make sure its folder and meta.json exist.
     *
     * meta.json is written only when it is absent: a round that resumes after a
     * process death keeps its original `started_wall_ms`, which is what the
     * 8 h cap measures from and what the PC tool needs to see a leading edge
     * gap.
     */
    fun begin(ctx: Context, roundId: String): String {
        val d = dir(ctx, roundId).apply { mkdirs() }
        val meta = File(d, "meta.json")
        if (!meta.exists()) {
            // Synced before this returns. Unsynced, a power loss in the seconds
            // after the start could leave meta.json empty.
            meta.outputStream().use { out ->
                out.write(DeviceState.meta(ctx, roundId).toString(2).toByteArray())
                runCatching { out.fd.sync() }
            }
        }
        // Process deaths from before this recording are not this round's news.
        ctx.getSharedPreferences(TrackerApp.EXIT_PREFS, Context.MODE_PRIVATE).edit()
            .putLong(TrackerApp.KEY_LAST_EXIT, System.currentTimeMillis()).commit()
        prefs(ctx).edit().putString(KEY_ACTIVE, roundId).commit()
        return roundId
    }

    fun end(ctx: Context) {
        prefs(ctx).edit().remove(KEY_ACTIVE).commit()
    }

    fun all(ctx: Context): List<String> =
        root(ctx).listFiles()?.filter { it.isDirectory }?.map { it.name }?.sortedDescending()
            ?: emptyList()

    fun startedWallMs(ctx: Context, id: String): Long? = runCatching {
        JSONObject(File(dir(ctx, id), "meta.json").readText()).getLong("started_wall_ms")
    }.getOrNull()

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
