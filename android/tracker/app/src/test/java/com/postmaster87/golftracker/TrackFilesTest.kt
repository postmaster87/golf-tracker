package com.postmaster87.golftracker

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The translation between the native fix log and the web layer's track
 * (SPEC_native-shell.md Section 9, tests 7 and 8).
 *
 * Pure JVM, no phone: this is the code that decides what a round's track IS
 * once the recorder is native, and it has to be provable at a desk.
 */
class TrackFilesTest {

    private val header = Csv.FIXES_HEADER

    /**
     * One file with every skip and every slot count in it. Column order is
     * wall_ms, fix_ms, elapsed_rt_ms, lat, lon, acc_m, alt_m, vacc_m,
     * speed_mps, bearing_deg, provider, mock, moving, sample, event.
     */
    private val mixed = sequenceOf(
        header,
        // speed and bearing, and every value needing its own rounding
        "1100,1000,2000,42.04142134,-93.65016139,3.25,300.1,2.0,0.253,346.6,fused,0,,,",
        // a bearing with NO speed: four slots, not five with a hole in it
        "2100,2000,3000,42.1,-93.2,4.04,,,,90,fused,0,,,",
        // speed without bearing: five slots
        "3100,3000,4000,42.3,-93.4,5.5,,,1.505,,fused,0,,,",
        // no accuracy: cannot pass the app's gate, skipped and counted
        "4100,4000,5000,42.4,-93.5,,,,,,fused,0,,,",
        // an SDK intermediate sample
        "5100,5000,6000,42.5,-93.6,3.0,,,,,tsl,0,1,1,motionchange",
        // the same fix time again, elsewhere: first row wins
        "1200,1000,2001,42.9,-93.9,3.0,,,,,fused,0,,,",
        // out of order in the file
        "600,500,1500,42.0000001,-93.0000001,2.0,,,,,fused,0,,,",
        // a process killed mid-write leaves a short last row
        "9,6000,,42.5",
    )

    @Test
    fun `a fixes file becomes the points trackstore writes, rounded and sorted`() {
        val read = TrackFiles.compactFromCsv(mixed)
        assertEquals(
            "[[42.0000001,-93.0000001,2,500]," +
                "[42.0414213,-93.6501614,3.3,1000,0.25,347]," +
                "[42.1,-93.2,4,2000]," +
                "[42.3,-93.4,5.5,3000,1.51]]",
            read.json,
        )
        assertEquals(4, read.points)
    }

    @Test
    fun `every row that is not a whole fix is skipped, and counted`() {
        val read = TrackFiles.compactFromCsv(mixed)
        assertEquals("no accuracy", 1, read.skippedNoAcc)
        assertEquals("the cut last row", 1, read.skippedRows)
        assertEquals("the repeated fix time", 1, read.duplicates)
        assertEquals("the SDK sample", 1, read.samples)
    }

    @Test
    fun `a repeated fix time keeps the first row, not the last`() {
        // REPORT_2.3 Section 11: every repeat measured in the field was
        // byte-identical to the row it repeated, so first-wins loses nothing.
        // The test uses different coordinates so the choice is visible.
        val read = TrackFiles.compactFromCsv(
            sequenceOf(
                header,
                "1,1000,,42.1,-93.1,3.0,,,,,fused,0,,,",
                "2,1000,,42.2,-93.2,3.0,,,,,fused,0,,,",
            )
        )
        assertEquals("[[42.1,-93.1,3,1000]]", read.json)
        assertEquals(1, read.duplicates)
    }

    @Test
    fun `trackSize counts the rows a cut row is not one of them`() {
        assertEquals(7, TrackFiles.rowCount(mixed))
    }

    @Test
    fun `imported points round-trip through the csv exactly`() {
        // A six-slot point (lat, lon, acc, ts, speed, bearing), a four-slot one
        // and a five-slot one - the three shapes the real exports carry
        // (measured 2026-09-16 across docs/roundDownloads: slots 4, 5 and 6).
        val points = listOf(
            doubleArrayOf(42.0370332, -93.6547743, 3.0, 1789165452854.0, 0.2, 346.0),
            doubleArrayOf(42.0414213, -93.6501613, 3.3, 1789165452000.0),
            doubleArrayOf(42.05, -93.66, 4.7, 1789165453000.0, 4.36),
        )
        val rows = TrackFiles.importRows(points)
        assertEquals(3, rows.size)
        rows.forEach { assertEquals(Csv.FIXES_COLUMNS, it.split(',').size) }

        val back = TrackFiles.compactFromCsv(sequenceOf(header) + rows.asSequence())
        assertEquals(
            "[[42.0414213,-93.6501613,3.3,1789165452000]," +
                "[42.0370332,-93.6547743,3,1789165452854,0.2,346]," +
                "[42.05,-93.66,4.7,1789165453000,4.36]]",
            back.json,
        )
        assertEquals(0, back.skippedRows)
        assertEquals(0, back.skippedNoAcc)
    }

    @Test
    fun `an imported row says it was imported, and invents no clock reading`() {
        val row = TrackFiles.importRows(
            listOf(doubleArrayOf(42.0, -93.0, 3.0, 1789165452854.0))
        ).single().split(',')
        assertEquals("wall_ms is not this phone's to write", "", row[0])
        assertEquals("1789165452854", row[1])
        assertEquals("elapsed_rt_ms is not this phone's to write", "", row[2])
        assertEquals(TrackFiles.PROVIDER_IMPORT, row[10])
    }
}
