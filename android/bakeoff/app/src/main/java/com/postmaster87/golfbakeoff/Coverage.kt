package com.postmaster87.golfbakeoff

import java.io.File

/**
 * THE MEASURE - the same one as the coverage table in
 * docs/HANDOFF-native-build.md, Section 9.
 *
 * Reproduced 6 of 6 rows from the web-app exports in docs/roundDownloads on
 * 2026-09-13 before this file was written (tools/track-coverage.py runs it):
 *  - span: last fix time minus first, fix times sorted
 *  - covered: the sum of fix-to-fix intervals of 20 s or less
 *  - gap: an interval over 20 s; the longest gap is the largest interval
 *  - median accuracy: over every fix that carries one
 *
 * The bar, Matt's pick on 2026-09-13: "99% coverage, no gap > 20 s". Under
 * this measure a track with no gap over 20 s is 100% covered, so the gap
 * clause is the one that decides.
 *
 * tools/track-coverage.py implements the same thing in Python. Both are held
 * to test/resources/coverage-fixture.csv and its .expected.properties.
 */
data class Coverage(
    val fixes: Int,
    val spanMs: Long,
    val coveredMs: Long,
    val gapsOver: Int,
    val longestGapMs: Long,
    val medianAccM: Double?,
    /** Rows that were not a whole, readable fix - counted, never guessed at. */
    val skippedRows: Int = 0,
) {
    val coveredPct: Double?
        get() = if (spanMs > 0) coveredMs * 100.0 / spanMs else null

    val passes: Boolean
        get() = fixes >= 2 && gapsOver == 0 && (coveredPct ?: 0.0) >= PASS_COVERED_PCT

    companion object {
        const val GAP_MS = 20_000L
        const val PASS_COVERED_PCT = 99.0

        val EMPTY = Coverage(0, 0, 0, 0, 0, null)

        fun of(fixMs: LongArray, accM: DoubleArray, gapMs: Long = GAP_MS): Coverage {
            val ts = fixMs.copyOf().also { it.sort() }
            var covered = 0L
            var gaps = 0
            var longest = 0L
            for (i in 1 until ts.size) {
                val dt = ts[i] - ts[i - 1]
                if (dt > gapMs) gaps++ else covered += dt
                if (dt > longest) longest = dt
            }
            val span = if (ts.size >= 2) ts.last() - ts.first() else 0L
            return Coverage(ts.size, span, covered, gaps, longest, median(accM))
        }

        /** Python's statistics.median: the middle value, or the mean of the middle two. */
        fun median(values: DoubleArray): Double? {
            val v = values.filter { !it.isNaN() }.sorted()
            if (v.isEmpty()) return null
            val mid = v.size / 2
            return if (v.size % 2 == 1) v[mid] else (v[mid - 1] + v[mid]) / 2.0
        }

        fun ofCsv(file: File, excludeSamples: Boolean = false): Coverage =
            if (!file.exists()) EMPTY
            else file.bufferedReader().useLines { ofCsvLines(it, excludeSamples) }

        /**
         * A row counts only if it has exactly the header's columns and a whole
         * number in fix_ms. A process killed mid-write leaves a short row; the
         * next process starts a fresh line (SessionLog repairs it), so the cut
         * row is skipped rather than read as a wild timestamp.
         */
        fun ofCsvLines(lines: Sequence<String>, excludeSamples: Boolean = false): Coverage {
            val it = lines.iterator()
            if (!it.hasNext()) return EMPTY
            val header = it.next().split(',')
            val iFix = header.indexOf("fix_ms")
            val iAcc = header.indexOf("acc_m")
            val iSample = header.indexOf("sample")
            require(iFix >= 0) { "not a bake-off fixes file: no fix_ms column" }

            val ts = ArrayList<Long>()
            val acc = ArrayList<Double>()
            var skipped = 0
            while (it.hasNext()) {
                val line = it.next()
                if (line.isEmpty()) continue
                val cells = line.split(',')
                val t = if (cells.size == header.size) cells[iFix].toLongOrNull() else null
                if (t == null) {
                    skipped++
                    continue
                }
                if (excludeSamples && iSample >= 0 && cells[iSample] == "1") continue
                ts.add(t)
                if (iAcc >= 0) cells[iAcc].toDoubleOrNull()?.let { a -> acc.add(a) }
            }
            return of(ts.toLongArray(), acc.toDoubleArray()).copy(skippedRows = skipped)
        }
    }
}
