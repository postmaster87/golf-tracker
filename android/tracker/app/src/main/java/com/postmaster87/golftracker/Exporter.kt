package com.postmaster87.golftracker

import android.content.ContentValues
import android.content.Context
import android.os.Environment
import android.provider.MediaStore
import java.io.File
import java.util.Locale

/**
 * Getting a file off the phone, through MediaStore into Download/golf-tracker/,
 * where My Files shows it, the share sheet can reach it, and
 * `adb pull /sdcard/Download/golf-tracker` fetches it. LIFTED FROM THE
 * BAKE-OFF's `Exporter` copy pattern.
 *
 * Two things land here:
 *  - the round export (`saveExport`), which is the ONLY copy of a round that
 *    survives an uninstall or a "clear storage";
 *  - the recorder logs (`exportLogs`), which `tools/track-coverage.py` scores
 *    as they are.
 *
 * Copies, never moves: the app's own files stay the record.
 */
object Exporter {

    private const val BASE_DIR = "golf-tracker"

    /** `Download/golf-tracker/<filename>`. Returns the path it wrote. */
    fun saveExport(ctx: Context, filename: String, json: String): String {
        val safe = safeName(filename)
        val rel = "${Environment.DIRECTORY_DOWNLOADS}/$BASE_DIR/"
        writeBytes(ctx, rel, safe, "application/json", json.toByteArray())
        return "Download/$BASE_DIR/$safe"
    }

    /** `Download/golf-tracker/logs/<roundId>/`. Returns the folder it wrote. */
    fun exportLogs(ctx: Context, roundId: String): String {
        val dir = Sessions.dir(ctx, roundId)
        val files = dir.listFiles()?.filter { it.isFile } ?: emptyList()
        if (files.isEmpty()) throw IllegalStateException("no recorder logs for $roundId")
        val rel = "${Environment.DIRECTORY_DOWNLOADS}/$BASE_DIR/logs/$roundId/"
        for (f in files) writeBytes(ctx, rel, f.name, mime(f), f.readBytes())
        return "Download/$BASE_DIR/logs/$roundId (${files.size} files)"
    }

    private fun writeBytes(
        ctx: Context,
        relPath: String,
        name: String,
        mime: String,
        bytes: ByteArray,
    ) {
        val resolver = ctx.contentResolver
        val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        // A re-export replaces this app's earlier copy instead of piling up
        // "fixes (1).csv".
        runCatching {
            resolver.delete(
                collection,
                "${MediaStore.MediaColumns.RELATIVE_PATH}=? AND ${MediaStore.MediaColumns.DISPLAY_NAME}=?",
                arrayOf(relPath, name),
            )
        }
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, name)
            put(MediaStore.MediaColumns.MIME_TYPE, mime)
            put(MediaStore.MediaColumns.RELATIVE_PATH, relPath)
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val uri = resolver.insert(collection, values)
            ?: throw IllegalStateException("MediaStore refused $relPath$name")
        resolver.openOutputStream(uri)?.use { it.write(bytes) }
            ?: throw IllegalStateException("could not open $relPath$name")
        values.clear()
        values.put(MediaStore.MediaColumns.IS_PENDING, 0)
        resolver.update(uri, values, null, null)
    }

    /** A filename from the web layer never gets to name a directory. */
    private fun safeName(name: String): String {
        val base = name.substringAfterLast('/').substringAfterLast('\\')
        val cleaned = base.filter { it.isLetterOrDigit() || it == '.' || it == '-' || it == '_' }
        return if (cleaned.isEmpty() || cleaned == "." || cleaned == "..") "golf-tracker-export.json"
        else cleaned
    }

    private fun mime(f: File) = when (f.extension.lowercase(Locale.US)) {
        "csv" -> "text/csv"
        "json" -> "application/json"
        else -> "text/plain"
    }
}
