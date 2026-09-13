package com.postmaster87.golfbakeoff

import android.content.ContentValues
import android.content.Context
import android.os.Environment
import android.provider.MediaStore
import java.io.File
import java.util.Locale

/**
 * Copies every session to Download/golf-bakeoff/<K|T>/<session>/, where My Files
 * shows it and `adb pull /sdcard/Download/golf-bakeoff` fetches it. Copies, never
 * moves: the app's own files stay the record.
 */
object Exporter {

    fun exportAll(ctx: Context): Int {
        val base = "${Environment.DIRECTORY_DOWNLOADS}/golf-bakeoff/${BuildConfig.RECORDER_TAG}"
        var n = 0
        Recorder.dumpSdkStore(ctx)?.let { n += copy(ctx, it, base) }
        for (id in Sessions.all(ctx)) {
            val dir = Sessions.dir(ctx, id)
            writeSummary(dir)
            dir.listFiles()?.filter { it.isFile }?.forEach { n += copy(ctx, it, "$base/$id") }
        }
        return n
    }

    fun verdict(c: Coverage): String = when {
        c.fixes < 2 -> "no track yet"
        c.passes -> "PASS (99% covered, no gap over 20 s)"
        c.gapsOver > 0 -> "FAIL (${c.gapsOver} gap${if (c.gapsOver == 1) "" else "s"} over 20 s)"
        else -> "FAIL (covered under 99%)"
    }

    private fun writeSummary(dir: File) {
        val c = Coverage.ofCsv(File(dir, "fixes.csv"))
        File(dir, "summary.txt").writeText(
            buildString {
                appendLine("session          ${dir.name}")
                appendLine("recorder         ${Recorder.NAME}")
                appendLine("measure          HANDOFF-native-build.md Section 9: covered = fix intervals of 20 s or less")
                appendLine("span             ${one(c.spanMs / 60000.0)} min")
                appendLine("fixes            ${c.fixes}")
                appendLine("rows skipped     ${c.skippedRows}")
                appendLine("covered          ${one(c.coveredMs / 60000.0)} min (${c.coveredPct?.let { one(it) + "%" } ?: "-"})")
                appendLine("gaps over 20 s   ${c.gapsOver}")
                appendLine("longest gap      ${one(c.longestGapMs / 1000.0)} s")
                appendLine("median accuracy  ${c.medianAccM?.let { one(it) + " m" } ?: "-"}")
                appendLine("bar              ${verdict(c)}")
                appendLine()
                appendLine("This file is a convenience. The verdict comes from tools/track-coverage.py on the PC.")
            },
        )
    }

    private fun copy(ctx: Context, file: File, relPath: String): Int {
        val resolver = ctx.contentResolver
        val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        val rel = "$relPath/"
        // A re-export replaces this app's earlier copy instead of piling up "fixes (1).csv".
        runCatching {
            resolver.delete(
                collection,
                "${MediaStore.MediaColumns.RELATIVE_PATH}=? AND ${MediaStore.MediaColumns.DISPLAY_NAME}=?",
                arrayOf(rel, file.name),
            )
        }
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, file.name)
            put(MediaStore.MediaColumns.MIME_TYPE, mime(file))
            put(MediaStore.MediaColumns.RELATIVE_PATH, rel)
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val uri = resolver.insert(collection, values) ?: return 0
        val out = resolver.openOutputStream(uri) ?: return 0
        out.use { o -> file.inputStream().use { it.copyTo(o) } }
        values.clear()
        values.put(MediaStore.MediaColumns.IS_PENDING, 0)
        resolver.update(uri, values, null, null)
        return 1
    }

    private fun mime(f: File) = when (f.extension.lowercase(Locale.US)) {
        "csv" -> "text/csv"
        "json" -> "application/json"
        else -> "text/plain"
    }

    private fun one(x: Double) = String.format(Locale.US, "%.1f", x)
}
