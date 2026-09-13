package com.postmaster87.golfbakeoff

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Properties

class CoverageTest {

    private fun resource(name: String) =
        requireNotNull(javaClass.classLoader?.getResourceAsStream(name)) { "missing test resource $name" }

    @Test
    fun `the shared fixture gives the values worked by hand`() {
        val c = resource("coverage-fixture.csv").bufferedReader().useLines { Coverage.ofCsvLines(it) }
        val expected = Properties().apply { resource("coverage-fixture.expected.properties").use { load(it) } }

        assertEquals(expected.getProperty("fixes").toInt(), c.fixes)
        assertEquals(expected.getProperty("skipped").toInt(), c.skippedRows)
        assertEquals(expected.getProperty("span_ms").toLong(), c.spanMs)
        assertEquals(expected.getProperty("covered_ms").toLong(), c.coveredMs)
        assertEquals(expected.getProperty("gaps_over_20s").toInt(), c.gapsOver)
        assertEquals(expected.getProperty("longest_gap_ms").toLong(), c.longestGapMs)
        assertEquals(expected.getProperty("median_acc_m").toDouble(), c.medianAccM!!, 1e-9)
        assertEquals(expected.getProperty("covered_pct").toDouble(), c.coveredPct!!, 5e-4)
        assertEquals(expected.getProperty("passes").toBoolean(), c.passes)
    }

    @Test
    fun `an interval of exactly 20 s is covered, not a gap`() {
        val c = Coverage.of(longArrayOf(0, 20_000), doubleArrayOf(3.0, 3.0))
        assertEquals(0, c.gapsOver)
        assertEquals(20_000, c.coveredMs)
        assertTrue(c.passes)
    }

    @Test
    fun `one 21 s gap fails a three hour track that is 99_8 percent covered`() {
        // 1 Hz for three hours, with 20 fixes missing in the middle: one 21 s interval.
        val ts = (0L until 10_800L).filter { it !in 5_000L until 5_020L }.map { it * 1000 }.toLongArray()
        val c = Coverage.of(ts, DoubleArray(ts.size) { 3.0 })
        assertEquals(1, c.gapsOver)
        assertEquals(21_000, c.longestGapMs)
        assertTrue(c.coveredPct!! > 99.0)
        assertFalse("the gap clause decides", c.passes)
    }

    @Test
    fun `a clean 1 Hz track passes and is 100 percent covered`() {
        val ts = LongArray(3_600) { it * 1000L }
        val c = Coverage.of(ts, DoubleArray(ts.size) { 3.1 })
        assertEquals(100.0, c.coveredPct!!, 1e-9)
        assertTrue(c.passes)
    }

    @Test
    fun `a single fix has no span and cannot pass`() {
        val c = Coverage.of(longArrayOf(1_000), doubleArrayOf(3.0))
        assertEquals(0, c.spanMs)
        assertNull(c.coveredPct)
        assertFalse(c.passes)
    }

    @Test
    fun `the median of an even count is the mean of the middle two, as in Python`() {
        assertEquals(3.0, Coverage.median(doubleArrayOf(10.0, 1.0, 4.0, 2.0))!!, 1e-12)
        assertNull(Coverage.median(doubleArrayOf()))
    }

    @Test
    fun `the writer and the reader agree on every column`() {
        val rows = (0 until 3).map { i ->
            Fix(
                wallMs = 1_700_000_000_100L + i * 1000,
                fixMs = 1_700_000_000_000L + i * 1000,
                elapsedRtMs = 5_000L + i * 1000,
                lat = 42.0414213,
                lon = -93.6501613,
                accM = 3.5f,
                altM = null,
                vaccM = null,
                speedMps = 0.25f,
                bearingDeg = null,
                provider = "fu,sed",
                mock = false,
                event = "motion,change",
            ).csvRow()
        }
        rows.forEach { assertEquals(Csv.FIXES_COLUMNS, it.split(',').size) }
        val c = Coverage.ofCsvLines(sequenceOf(Csv.FIXES_HEADER) + rows.asSequence())
        assertEquals(3, c.fixes)
        assertEquals(0, c.skippedRows)
        assertEquals(2_000, c.spanMs)
        assertEquals(3.5, c.medianAccM!!, 1e-6)
        assertTrue(c.passes)
    }

    @Test
    fun `samples can be excluded when scoring the SDK without them`() {
        val header = Csv.FIXES_HEADER
        val base = "42.0,-93.6,3.0,,,,,tslocationmanager,0,1"
        val lines = sequenceOf(
            header,
            "1,1000,,$base,0,",
            "2,2000,,$base,1,",
            "3,3000,,$base,0,",
        )
        assertEquals(3, Coverage.ofCsvLines(lines).fixes)
        assertEquals(2, Coverage.ofCsvLines(lines, excludeSamples = true).fixes)
    }
}
