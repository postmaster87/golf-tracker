package com.postmaster87.golftracker

import android.content.Context
import org.json.JSONArray
import java.io.File

/**
 * THE NATIVE TRACK STORE (spec Section 4) - the Android half of `trackstore.js`
 * in the shell.
 *
 * D2: the native fix log IS the dense track. There is no IndexedDB copy, no
 * catch-up pass and no duplicated point at a boundary, because there is only
 * one file. Every function here answers the same question its `trackstore.js`
 * twin answers, in the same shape, so the web layer cannot tell which one it is
 * talking to.
 *
 * Every entry point degrades rather than throwing: losing the dense track costs
 * analysis quality, losing the round costs a round of golf, and that is the one
 * thing this app may never do.
 */
object TrackStore {

    /** Rows dropped for a missing accuracy, cumulative in this process. */
    @Volatile
    var skippedNoAcc = 0L
        private set

    private fun fixesFile(ctx: Context, roundId: String) =
        File(Sessions.dir(ctx, roundId), "fixes.csv")

    /** JSON array of compact points, or `[]`. Never throws across the bridge. */
    fun readTrackJson(ctx: Context, roundId: String): String {
        if (!Sessions.isSafeId(roundId)) return "[]"
        val f = fixesFile(ctx, roundId)
        if (!f.exists()) return "[]"
        return try {
            val read = f.bufferedReader().useLines { TrackFiles.compactFromCsv(it) }
            skippedNoAcc += read.skippedNoAcc
            read.json
        } catch (e: Exception) {
            "[]"
        }
    }

    /**
     * Write imported points as rows (spec Section 4).
     *
     * Appends: the web `writeTrackChunk` contract is add, never replace, so a
     * restore onto a phone that already has part of the track adds to it -
     * `readTrack` sorts and de-duplicates, which is what makes that safe.
     *
     * Returns the number written; 0 means nothing was stored, which the caller
     * must not report as success.
     */
    fun importTrack(ctx: Context, roundId: String, pointsJson: String): Int {
        if (!Sessions.isSafeId(roundId)) return 0
        val points = parsePoints(pointsJson) ?: return 0
        if (points.isEmpty()) return 0
        val rows = TrackFiles.importRows(points)
        if (rows.isEmpty()) return 0
        val dir = Sessions.dir(ctx, roundId)
        val fresh = !File(dir, "meta.json").exists()
        val written = SessionLog.appendImported(ctx, roundId, rows, rows.size)
        if (written > 0 && fresh) {
            runCatching {
                File(dir, "meta.json").writeText(
                    DeviceState.importMeta(ctx, roundId, written).toString(2)
                )
            }
        }
        return written
    }

    fun trackSize(ctx: Context, roundId: String): Int {
        if (!Sessions.isSafeId(roundId)) return 0
        val f = fixesFile(ctx, roundId)
        if (!f.exists()) return 0
        return try {
            f.bufferedReader().useLines { TrackFiles.rowCount(it) }
        } catch (e: Exception) {
            0
        }
    }

    /** JSON array of the round ids that have a folder. */
    fun trackedRoundIdsJson(ctx: Context): String {
        val ids = JSONArray()
        for (id in Sessions.all(ctx)) if (fixesFile(ctx, id).exists()) ids.put(id)
        return ids.toString()
    }

    /**
     * Drop a round's track.
     *
     * Stops the recording first if that round is the one recording - deleting
     * the file out from under an open writer is how a track comes back half
     * there. Returns whether a folder existed: the web `deleteTrack` contract is
     * "did I remove a track?", not "did the call run?".
     */
    fun deleteTrack(ctx: Context, roundId: String): Boolean {
        if (!Sessions.isSafeId(roundId)) return false
        if (Sessions.active(ctx) == roundId) Recorder.stopRecording(ctx, roundId)
        if (SessionLog.openRoundId == roundId) SessionLog.close("delete_track")
        val dir = Sessions.dir(ctx, roundId)
        if (!dir.exists()) return false
        return dir.deleteRecursively()
    }

    /** The Data card's numbers (spec Section 5). */
    fun statsJson(ctx: Context): String {
        val roundId = Sessions.active(ctx)
        val rows = if (roundId != null) trackSize(ctx, roundId) else 0
        return "{\"recording\":${RecorderService.isRecording}," +
            "\"roundId\":${quote(roundId ?: "")}," +
            "\"rows\":$rows," +
            "\"lastFixMs\":${SessionLog.lastFixMs}," +
            "\"writeFailures\":${SessionLog.writeFailures}," +
            "\"skippedNoAcc\":$skippedNoAcc}"
    }

    /**
     * Compact points out of the JSON the web layer sent.
     *
     * Returns null when the text is not an array at all, which the caller
     * reports as 0 written rather than as a silent success.
     */
    private fun parsePoints(json: String): List<DoubleArray>? = try {
        val arr = JSONArray(json)
        val out = ArrayList<DoubleArray>(arr.length())
        for (i in 0 until arr.length()) {
            val p = arr.optJSONArray(i) ?: continue
            val slots = DoubleArray(p.length())
            var ok = true
            for (j in 0 until p.length()) {
                // A null slot (an absent speed or heading) is NaN here, and
                // TrackFiles drops it rather than writing a zero for it.
                slots[j] = if (p.isNull(j)) Double.NaN else p.optDouble(j, Double.NaN)
                if (j < 4 && !slots[j].isFinite()) ok = false
            }
            if (ok && slots.size >= 4) out.add(slots)
        }
        out
    } catch (e: Exception) {
        null
    }

    private fun quote(s: String) = "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\""
}
