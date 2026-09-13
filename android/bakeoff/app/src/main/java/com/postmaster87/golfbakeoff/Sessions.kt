package com.postmaster87.golfbakeoff

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * A session is one START to one STOP. Each lives in its own folder under the
 * app's private files: meta.json, fixes.csv, events.csv.
 *
 * The active session id is committed synchronously, so a process that dies the
 * instant after START still knows on restart that it should be recording.
 */
object Sessions {
    private const val PREFS = "sessions"
    private const val KEY_ACTIVE = "active"

    fun root(ctx: Context): File = File(ctx.filesDir, "sessions").apply { mkdirs() }

    fun dir(ctx: Context, id: String): File = File(root(ctx), id)

    fun active(ctx: Context): String? = prefs(ctx).getString(KEY_ACTIVE, null)

    fun begin(ctx: Context): String {
        active(ctx)?.let { return it }
        val id = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(Date()) +
            "-" + BuildConfig.RECORDER_TAG
        val d = dir(ctx, id).apply { mkdirs() }
        File(d, "meta.json").writeText(DeviceState.meta(ctx, id).toString(2))
        // Process deaths from before this session are not this session's news.
        ctx.getSharedPreferences(BakeoffApp.EXIT_PREFS, Context.MODE_PRIVATE).edit()
            .putLong(BakeoffApp.KEY_LAST_EXIT, System.currentTimeMillis()).commit()
        prefs(ctx).edit().putString(KEY_ACTIVE, id).commit()
        return id
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
