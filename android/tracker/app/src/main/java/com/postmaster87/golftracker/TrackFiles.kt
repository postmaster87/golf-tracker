package com.postmaster87.golftracker

import java.math.BigDecimal
import java.math.RoundingMode

/**
 * THE TRANSLATION BETWEEN THE NATIVE FIX LOG AND THE WEB LAYER'S TRACK.
 *
 * The native log is the dense track (D2) - there is no second copy - so this is
 * the only place a stored row becomes a point the analysis reads, and the only
 * place an imported point becomes a stored row. Both directions have to agree
 * exactly, or an export re-imported onto the phone would not be the same track.
 *
 * THE POINT SHAPE is `trackstore.js`'s `compactFix`, to the digit:
 *
 *   [lat(7dp), lon(7dp), acc(1dp), fix_ms]        - always
 *   + speed(2dp)                                   - only when present
 *   + bearing(0dp)                                 - only when speed was present
 *
 * The trailing slots are positional, so bearing without speed is four slots and
 * not five with a hole in it. Readers check length, they do not assume arity.
 *
 * Rounding is done on the CSV cell's own decimal text with BigDecimal HALF_UP,
 * not on a float: the cell is what the receiver reported, and re-deriving it
 * through binary floating point is how a re-import stops round-tripping.
 *
 * No Android imports, so the JVM unit tests exercise the same code the phone
 * runs.
 */
object TrackFiles {

    /** `provider` for a row that came from an export, not from this phone. */
    const val PROVIDER_IMPORT = "import"

    /** What one read of a round's fixes.csv produced. */
    data class Read(
        /** A JSON array of compact points, ready to hand across the bridge. */
        val json: String,
        val points: Int,
        /** Rows with no accuracy: skipped, and counted rather than guessed at. */
        val skippedNoAcc: Int,
        /** Cut or unreadable rows: skipped, and counted. */
        val skippedRows: Int,
        /** Rows dropped because another row already had that fix time. */
        val duplicates: Int,
        /** transistorsoft intermediate samples. Always 0 for a K recording. */
        val samples: Int,
    )

    /**
     * fixes.csv -> the compact points the web layer reads.
     *
     * Skips, in this order: the header; an empty line; a cut row (a process
     * killed mid-write leaves one, and the next open ends the line so it can be
     * skipped rather than read as a wild timestamp); a row marked `sample=1`; a
     * row with no accuracy, which could never pass the app's accuracy gate
     * anyway. Then de-duplicates on `fix_ms`, FIRST ROW WINS - a repeat is the
     * same fix handed over twice (REPORT_2.3 Section 11: every repeat measured
     * in the field was byte-identical to the row it repeated) - and sorts by
     * `fix_ms`, because a track out of order is worse than no track: the stop
     * detector would read it as teleporting.
     */
    fun compactFromCsv(lines: Sequence<String>): Read {
        val it = lines.iterator()
        if (!it.hasNext()) return Read("[]", 0, 0, 0, 0, 0)
        val header = it.next().split(',')
        val iFix = header.indexOf("fix_ms")
        val iLat = header.indexOf("lat")
        val iLon = header.indexOf("lon")
        val iAcc = header.indexOf("acc_m")
        val iSpeed = header.indexOf("speed_mps")
        val iBearing = header.indexOf("bearing_deg")
        val iSample = header.indexOf("sample")
        if (iFix < 0 || iLat < 0 || iLon < 0 || iAcc < 0) {
            return Read("[]", 0, 0, 0, 0, 0)
        }

        // Insertion-ordered, so "first row wins" is exactly what putIfAbsent does.
        val byTime = LinkedHashMap<Long, String>()
        var skippedNoAcc = 0
        var skippedRows = 0
        var duplicates = 0
        var samples = 0

        while (it.hasNext()) {
            val line = it.next()
            if (line.isEmpty()) continue
            val cells = line.split(',')
            if (cells.size != header.size) {
                skippedRows++
                continue
            }
            val fixMs = cells[iFix].toLongOrNull()
            if (fixMs == null) {
                skippedRows++
                continue
            }
            if (iSample >= 0 && cells[iSample] == "1") {
                samples++
                continue
            }
            val lat = decimal(cells[iLat])
            val lon = decimal(cells[iLon])
            if (lat == null || lon == null) {
                skippedRows++
                continue
            }
            val acc = decimal(cells[iAcc])
            if (acc == null) {
                skippedNoAcc++
                continue
            }
            if (byTime.containsKey(fixMs)) {
                duplicates++
                continue
            }
            val speed = if (iSpeed >= 0) decimal(cells[iSpeed]) else null
            val bearing = if (iBearing >= 0) decimal(cells[iBearing]) else null
            byTime[fixMs] = point(lat, lon, acc, fixMs, speed, bearing)
        }

        val json = byTime.entries.sortedBy { e -> e.key }
            .joinToString(",", prefix = "[", postfix = "]") { e -> e.value }
        return Read(json, byTime.size, skippedNoAcc, skippedRows, duplicates, samples)
    }

    /**
     * Compact points -> fixes.csv rows (spec Section 4, importTrack).
     *
     * `wall_ms` and `elapsed_rt_ms` are empty because this phone never received
     * these fixes - writing a clock reading for them would be inventing one -
     * and `provider` is "import" so an imported point can never be mistaken for
     * a native recording (D5).
     *
     * A point that is not a whole, usable fix is not written. The count of what
     * WAS written is what the caller returns to the web layer.
     */
    fun importRows(points: List<DoubleArray>): List<String> {
        val rows = ArrayList<String>(points.size)
        for (p in points) {
            if (p.size < 4) continue
            val lat = p[0]
            val lon = p[1]
            val acc = p[2]
            val ts = p[3]
            if (!lat.isFinite() || !lon.isFinite() || !acc.isFinite() || !ts.isFinite()) continue
            val fixMs = ts.toLong()
            val speed = if (p.size > 4 && p[4].isFinite()) p[4] else null
            val bearing = if (p.size > 5 && p[5].isFinite()) p[5] else null
            rows += listOf(
                "",                                   // wall_ms
                fixMs.toString(),                     // fix_ms
                "",                                   // elapsed_rt_ms
                num(BigDecimal.valueOf(lat), 7),      // lat
                num(BigDecimal.valueOf(lon), 7),      // lon
                num(BigDecimal.valueOf(acc), 1),      // acc_m
                "",                                   // alt_m
                "",                                   // vacc_m
                speed?.let { num(BigDecimal.valueOf(it), 2) } ?: "",
                bearing?.let { num(BigDecimal.valueOf(it), 0) } ?: "",
                PROVIDER_IMPORT,                      // provider
                "", "", "", "",                       // mock, moving, sample, event
            ).joinToString(",")
        }
        return rows
    }

    /**
     * Row count without materialising the points - what `trackSize` reports.
     *
     * A line scan: every line after the header that has the header's columns.
     * A cut row does not have them, so it is excluded, which is the same rule
     * the reader uses. It does NOT apply the reader's other filters, so a track
     * carrying duplicate fix times counts higher here than `readTrack` returns.
     */
    fun rowCount(lines: Sequence<String>): Int {
        val it = lines.iterator()
        if (!it.hasNext()) return 0
        val columns = it.next().split(',').size
        var n = 0
        while (it.hasNext()) {
            val line = it.next()
            if (line.isEmpty()) continue
            if (line.count { c -> c == ',' } + 1 == columns) n++
        }
        return n
    }

    private fun point(
        lat: BigDecimal,
        lon: BigDecimal,
        acc: BigDecimal,
        fixMs: Long,
        speed: BigDecimal?,
        bearing: BigDecimal?,
    ): String = buildString {
        append('[')
        append(num(lat, 7)).append(',')
        append(num(lon, 7)).append(',')
        append(num(acc, 1)).append(',')
        append(fixMs)
        if (speed != null) {
            append(',').append(num(speed, 2))
            if (bearing != null) append(',').append(num(bearing, 0))
        }
        append(']')
    }

    private fun decimal(cell: String): BigDecimal? {
        val s = cell.trim()
        if (s.isEmpty()) return null
        return runCatching { BigDecimal(s) }.getOrNull()
    }

    /**
     * A decimal with at most `scale` places, trailing zeros gone, never in
     * scientific notation - the same text JSON.parse turns back into the number
     * `compactFix` would have produced.
     */
    private fun num(v: BigDecimal, scale: Int): String =
        v.setScale(scale, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString()
}
