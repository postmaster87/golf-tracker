package com.postmaster87.golftracker

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The two rules that end a recording (SPEC_native-shell.md Section 9, test 9).
 * Both are driven off a fake clock here, because one of them only fires after
 * eight hours.
 */
class RecordingSessionTest {

    private val round = "r_18b4b0bb-701c-4bd8-83a5-a728617c2cde"
    private val started = 1789420084966L
    private val s = RecordingSession(round, started)

    @Test
    fun `a stop for another round is ignored`() {
        assertTrue(s.accepts(round))
        assertFalse("a stale id must not end the round he is playing", s.accepts("r_something_else"))
        assertFalse(s.accepts(null))
        assertFalse(s.accepts(""))
    }

    @Test
    fun `the cap fires at 8 h and not a millisecond before`() {
        assertFalse(s.capExpired(started))
        assertFalse(s.capExpired(started + RecordingSession.CAP_MS - 1))
        assertTrue(s.capExpired(started + RecordingSession.CAP_MS))
        assertTrue(s.capExpired(started + RecordingSession.CAP_MS + 60_000))
    }

    @Test
    fun `the longest round ever logged is nowhere near the cap`() {
        // FT4 Radcliffe, 181 min (docs/HANDOFF-native-build.md Section 9). The
        // cap only bounds a round the web layer never closed.
        assertFalse(s.capExpired(started + 181L * 60_000))
        assertEquals(8L * 60 * 60 * 1000, RecordingSession.CAP_MS)
    }

    @Test
    fun `the remaining time counts down and floors at zero`() {
        assertEquals(RecordingSession.CAP_MS, s.capRemainingMs(started))
        assertEquals(1L, s.capRemainingMs(started + RecordingSession.CAP_MS - 1))
        assertEquals(0L, s.capRemainingMs(started + RecordingSession.CAP_MS))
        assertEquals(0L, s.capRemainingMs(started + RecordingSession.CAP_MS + 999_999))
    }
}
