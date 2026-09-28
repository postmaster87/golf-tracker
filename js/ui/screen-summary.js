import { h, card, stat, toast } from './dom.js';
import {
  roundStrokesGained,
  practicePriority,
  CATEGORIES,
  CATEGORY_LABELS,
  fmtSG,
} from '../analysis/strokes-gained.js';
import { BASELINES } from '../analysis/benchmarks.js';
import { loadRound, downloadExport } from '../data/store.js';
import { readTrack } from '../data/trackstore.js';
import { roundRevisionLabel } from '../data/revision.js';
import { isUnscored } from '../data/schema.js';
import { stopCandidates } from '../round/track-analysis.js';
import { toYards, toFeet } from '../util/geo.js';
import { median } from '../util/stats.js';
import { getCourse } from '../data/courses.js';
import { courseGeometry } from '../round/course-geometry.js';
import {
  roundTotals,
  holeStrokes,
  holePutts,
  puttDistancesFt,
  fir,
  gir,
  scramble,
  shotGeometry,
  holePosition,
  holeContextFor,
  isHoleComplete,
  fmtToPar,
  fmtDistance,
} from '../round/round.js';

const pct = (hit, eligible) => (eligible ? `${Math.round((hit / eligible) * 100)}%` : '—');

export function summaryScreen(ctx) {
  const el = h('div', { class: 'screen' });
  const round =
    ctx.round?.id === ctx.params.roundId ? ctx.round : loadRound(ctx.params.roundId ?? ctx.app.activeRoundId);

  el.appendChild(
    h(
      'header',
      { class: 'topbar' },
      h('button', {
        class: 'icon-btn',
        text: '‹',
        'aria-label': 'Back',
        onClick: () => ctx.go(ctx.params.live ? 'play' : ctx.params.from ?? 'home'),
      }),
      h('h1', { text: ctx.params.live ? 'Round card' : 'Round' }),
      // Always visible, no scrolling. Editing a saved round is a primary
      // capability, and burying it under an 18-row scorecard hid it completely.
      round && !ctx.params.live
        ? h('button', {
            class: 'icon-btn',
            text: 'EDIT',
            'aria-label': 'Edit this round',
            onClick: () => ctx.go('play', { roundId: round.id }),
          })
        : null
    )
  );

  const body = h('div', { class: 'body' });
  el.appendChild(body);

  if (!round) {
    body.appendChild(h('p', { class: 'note', text: 'That round could not be found.' }));
    return { el };
  }

  const t = roundTotals(round);
  const date = new Date(round.startedAt);

  body.appendChild(
    card(
      `${round.courseName} · ${round.type}`,
      h('p', {
        class: 'note muted',
        text: `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${
          round.teeSet
        } tees · ${round.startingNine} nine first · ${round.status.replace('_', ' ')}`,
      }),
      round.simulated
        ? h('p', { class: 'note', style: { color: 'var(--bad)', fontWeight: '800' }, text: 'SIMULATED GPS — not a real round' })
        : null,
      h(
        'div',
        { class: 'stat-grid', style: { marginTop: '8px' } },
        stat('Score', t.holes ? String(t.strokes) : '—', `${t.holes} holes`),
        stat('To par', t.holes ? fmtToPar(t.toPar) : '—', `par ${t.par}`),
        stat('Putts', t.holes ? String(t.putts) : '—', t.holes ? `${(t.putts / t.holes).toFixed(2)} / hole` : ''),
        stat('Penalties', String(t.penalties))
      )
    )
  );

  // Every rate carries its denominator. A 100% scrambling round off two chances
  // is not a 100% scrambling round.
  body.appendChild(
    card(
      'Traditional stats',
      h(
        'div',
        { class: 'stat-grid' },
        stat('Fairways', pct(t.firHit, t.firEligible), `n = ${t.firEligible}`),
        stat('GIR', pct(t.girHit, t.girEligible), `n = ${t.girEligible}`),
        stat('Scrambling', pct(t.scrambleHit, t.scrambleEligible), `n = ${t.scrambleEligible}`),
        stat('Putts / GIR', t.girHit ? puttsPerGir(round).toFixed(2) : '—', `n = ${t.girHit}`)
      )
    )
  );

  // Full control after the fact: the golfer is the source of truth about what
  // happened, not the app's record of it. Sits above the analysis, because
  // fixing the data is what you came here to do when something is wrong.
  if (!ctx.params.live) {
    body.appendChild(
      h('button', {
        class: 'btn primary',
        style: { marginBottom: '12px' },
        text: 'EDIT / ADD HOLES',
        onClick: () => ctx.go('play', { roundId: round.id }),
      })
    );
  }

  /*
   * A scramble shows no analysis at all, rather than analysis with a caveat.
   *
   * Every card below the first three reads shot data: strokes gained, putting
   * and driving all assume the ball being followed is his and the sequence of
   * positions is a hole he played. In a scramble neither holds. Rendering them
   * with a warning attached would still put the numbers on screen, and a number
   * on screen gets remembered long after the warning does.
   *
   * What is left is the part that IS the test: the scorecard as entered, and
   * the track and its stop candidates.
   */
  if (isUnscored(round)) {
    body.appendChild(scrambleNotice());
  } else {
    body.appendChild(strokesGainedCard(round, ctx));
    body.appendChild(puttingCard(t));
    body.appendChild(driveCard(round, ctx.app));
  }
  body.appendChild(scorecard(round));
  body.appendChild(dataQuality(round, t, ctx.app));

  if (!ctx.params.live) {
    body.appendChild(
      h('button', {
        class: 'btn',
        text: 'Export all data (JSON)',
        onClick: () => {
          const n = downloadExport(ctx.app);
          toast(`Exported ${n} round${n === 1 ? '' : 's'}.`);
        },
      })
    );
  }

  return { el };
}

function puttsPerGir(round) {
  const holes = round.holes.filter((hl) => isHoleComplete(hl) && gir(hl) === true);
  if (!holes.length) return 0;
  return holes.reduce((a, hl) => a + (holePutts(hl) ?? 0), 0) / holes.length;
}

/**
 * Strokes gained, and the practice-priority ranking that falls out of it.
 *
 * This is the point of the whole app, so two things are non-negotiable here:
 * the baseline is named and badged when it is derived rather than published,
 * and any stroke that could not be attributed is stated next to the totals. A
 * category number without its denominator and its exclusions is exactly the
 * kind of confident-looking figure that would send practice the wrong way.
 */
/** Why there is no analysis here, and what to look at instead. */
function scrambleNotice() {
  return card(
    'Scramble — position tracking only',
    h('p', {
      class: 'note',
      text: 'Everyone in the group hits, the team plays one ball, and the next shot goes from there. The swings and the walking track are real; the ball is not yours and the score is the team’s.',
    }),
    h('p', {
      class: 'note muted',
      text: 'So no strokes gained, putting or driving numbers are produced for this round, and it never enters trends or practice priority. The track below is the part worth reading.',
    })
  );
}

/*
 * docs/SPEC_hole-position.md Section 2.1, [measured] from the phone's store as
 * pulled 2026-09-28: the 31 cups he marked with a burst on or within 5 yd of
 * their own green at Veenker sit a median 5.5 yd from the map's green centre.
 * Constants, not recomputed: the line under the strokes gained card quotes them.
 */
const MAP_GREEN_MEDIAN_YD = 5.5;
const MAP_GREEN_N = 31;

/** A distance he typed carries its unit as its source. */
const TYPED_SOURCES = new Set(['yards', 'feet', 'paces', 'entered']);

/**
 * "Distance to the hole: ..." - what every distance on the card was measured
 * to, every count with its source (docs/SPEC_hole-position.md 6.4).
 */
function sourcesLine(sources) {
  const n = (k) => sources[k] ?? 0;
  const s = (c, one, many) => (c === 1 ? one : many);
  const typed = Object.entries(sources)
    .filter(([k]) => TYPED_SOURCES.has(k))
    .reduce((a, [, v]) => a + v, 0);
  // The tees are counted as tees; the first count after them says "shots",
  // the rest read on from it, as in the spec's own line.
  const counts = [];
  if (n('map-green')) counts.push([n('map-green'), "to the centre of the map's green"]);
  if (n('pin-sheet')) counts.push([n('pin-sheet'), 'to your pin sheet']);
  if (n('cup')) counts.push([n('cup'), 'to the cup']);
  if (n('ball-on-green')) counts.push([n('ball-on-green'), 'to your ball on the green']);
  if (typed) counts.push([typed, 'you typed']);
  if (n('accumulated-cup')) counts.push([n('accumulated-cup'), 'to where the cup was in earlier rounds']);
  if (n('accumulated-green')) counts.push([n('accumulated-green'), 'to where the ball finished on the green in earlier rounds']);
  const named = new Set(['scorecard', 'map-green', 'pin-sheet', 'cup', 'ball-on-green', 'accumulated-cup', 'accumulated-green', 'unknown']);
  for (const [k, v] of Object.entries(sources)) if (!named.has(k) && !TYPED_SOURCES.has(k)) counts.push([v, `from ${k}`]);
  if (n('unknown')) counts.push([n('unknown'), 'with no distance']);
  const parts = counts.map(([c, what], i) => (i === 0 ? `${c} ${s(c, 'shot', 'shots')} ${what}` : `${c} ${what}`));
  if (n('scorecard')) parts.unshift(`${n('scorecard')} ${s(n('scorecard'), 'tee', 'tees')} from the scorecard`);
  return parts.length ? `Distance to the hole: ${parts.join(', ')}.` : null;
}

const PASSED_OVER = {
  'cup:from-track': 'the cup was taken from the track, not marked',
  'cup:off-green': "the marked cup is not on that hole's green on the map",
  'ball:off-green': "the ball marked on the green is not on that hole's green on the map",
  'pin-sheet:off-green': "your pin sheet lands off that hole's green on the map",
  'pin-sheet:not-placed': "your pin sheet could not be placed on that hole's green",
};
const USED_INSTEAD = {
  'map-green': "the map's green was used",
  'pin-sheet': 'your pin sheet was used',
  'ball-on-green': 'the ball on the green was used',
};

/**
 * One line per reason a position was passed over, holes listed: "Holes 1, 10,
 * 12: the marked cup is not on that hole's green on the map, so the map's
 * green was used." Grouped by what was used instead too, so every line is true
 * of every hole it names.
 */
function positionNoteLines(notes) {
  const groups = new Map();
  for (const nt of notes) {
    const key = `${nt.what}:${nt.why}:${nt.used}`;
    if (!groups.has(key)) groups.set(key, { ...nt, holes: [] });
    groups.get(key).holes.push(nt.hole);
  }
  return [...groups.values()].map((g) => {
    const holes = `${g.holes.length === 1 ? 'Hole' : 'Holes'} ${g.holes.join(', ')}`;
    const what = PASSED_OVER[`${g.what}:${g.why}`] ?? `the ${g.what} was not used (${g.why})`;
    const used = USED_INSTEAD[g.used] ?? `the ${g.used} was used`;
    return `${holes}: ${what}, so ${used}.`;
  });
}

function strokesGainedCard(round, ctx) {
  const baseline = ctx.app.settings.sgBaseline ?? 'scratch';
  const sg = roundStrokesGained(round, { baseline, contextFor: holeContextFor(ctx.app, round) });

  const wrap = card(`Strokes gained vs ${BASELINES[baseline]?.label ?? baseline}`);

  if (!sg.holesScored) {
    wrap.appendChild(h('p', { class: 'note muted', text: 'No completed holes yet.' }));
    return wrap;
  }

  wrap.appendChild(
    h(
      'div',
      { class: 'stat-grid' },
      ...CATEGORIES.map((c) =>
        stat(
          CATEGORY_LABELS[c],
          fmtSG(sg.totals[c]),
          sg.counts[c] ? `${sg.counts[c]} ${c === 'putting' ? 'putts' : 'shots'}` : 'no shots'
        )
      )
    )
  );

  wrap.appendChild(
    h('p', {
      class: 'note',
      style: { marginTop: '10px', fontWeight: '700' },
      text: `Total ${fmtSG(sg.total)} over ${sg.holesScored} hole${sg.holesScored === 1 ? '' : 's'}`,
    })
  );

  // Where the hole was taken from for every number above (6.4).
  const said = sourcesLine(sg.sources);
  if (said) wrap.appendChild(h('p', { class: 'note muted', text: said }));
  for (const line of positionNoteLines(sg.positionNotes)) {
    wrap.appendChild(h('p', { class: 'note', text: line }));
  }
  if (sg.sources['map-green']) {
    wrap.appendChild(
      h('p', {
        class: 'note muted',
        text: `The centre of the green is a median ${MAP_GREEN_MEDIAN_YD} yd from where the cup was (n = ${MAP_GREEN_N} cups marked at Veenker). The total does not depend on it; the split between approach and short game does.`,
      })
    );
  }

  // Practice priority — worst first. The spec calls this the whole point.
  const ranked = practicePriority(sg).filter((r) => r.shots > 0);
  if (ranked.length) {
    wrap.appendChild(
      h('h2', { style: { marginTop: '14px' }, text: 'Practice priority' })
    );
    const worst = Math.max(...ranked.map((r) => Math.abs(r.total)), 0.01);
    for (const [i, row] of ranked.entries()) {
      const pct = Math.round((Math.abs(row.total) / worst) * 100);
      const losing = row.total < 0;
      wrap.appendChild(
        h(
          'div',
          { class: 'list-row', style: { marginBottom: '6px' } },
          h('span', { class: 'seq', text: String(i + 1) }),
          h(
            'span',
            { class: 'grow' },
            h('strong', { text: row.label }),
            h('span', {
              class: 'sub',
              text: `${row.shots} ${row.category === 'putting' ? 'putts' : 'shots'} · ${fmtSG(row.perShot, 3)} each`,
            }),
            h(
              'span',
              { class: 'sg-bar' },
              h('span', {
                style: { width: `${pct}%`, background: losing ? 'var(--bad)' : 'var(--good)' },
              })
            )
          ),
          h('strong', {
            style: { color: losing ? 'var(--bad)' : 'var(--good)' },
            text: fmtSG(row.total),
          })
        )
      );
    }
  }

  // Honesty rail: what this number does not include, and how solid it is.
  if (sg.unattributed) {
    wrap.appendChild(
      h('p', {
        class: 'note',
        text: `${sg.unattributed} stroke${sg.unattributed === 1 ? '' : 's'} could not be attributed and ${
          sg.unattributed === 1 ? 'is' : 'are'
        } excluded above — usually a shot with no position, or a hole with no first-putt distance.`,
      })
    );
  }
  wrap.appendChild(
    h('p', {
      class: 'note muted',
      text: sg.provenance?.verified
        ? `Benchmark: ${sg.provenance.note}`
        : `Derived baseline — ${sg.provenance?.note ?? ''} Trends between rounds are unaffected. Off the tee vs approach is barely affected either, because both face a similar number of shots; short game vs putting is where a baseline error would bite hardest.`,
    })
  );

  return wrap;
}

/**
 * "No 3 putts, but 1 putt better."
 *
 * Three-putt count leads because that is the stated target and zero is the only
 * good answer. Proximity and lag sit underneath because they are the two things
 * that actually cause three-putts — how far away the approach left you, and how
 * close the lag finished.
 */
function puttingCard(t) {
  const wrap = card('Putting');
  if (!t.holesWithPuttData) {
    wrap.appendChild(h('p', { class: 'note muted', text: 'No putts recorded yet.' }));
    return wrap;
  }
  const prox = median(t.proximityFt);
  const lag = median(t.lagFt);
  wrap.appendChild(
    h(
      'div',
      { class: 'stat-grid' },
      h(
        'div',
        { class: 'stat', style: t.threePlusPutts ? { borderColor: 'var(--bad)' } : null },
        h('span', { class: 'k', text: '3-putts' }),
        h('span', {
          class: 'v',
          style: t.threePlusPutts ? { color: 'var(--bad)' } : null,
          text: String(t.threePlusPutts),
        }),
        h('span', { class: 'n', text: `n = ${t.holesWithPuttData} holes` })
      ),
      stat('1-putts', String(t.onePutts), `${Math.round((t.onePutts / t.holesWithPuttData) * 100)}% of holes`),
      stat(
        'Approach proximity',
        prox != null ? `${Math.round(prox)} ft` : '—',
        `median · n = ${t.proximityFt.length}`
      ),
      stat('Lag leave', lag != null ? `${Math.round(lag)} ft` : '—', `median · n = ${t.lagFt.length}`)
    )
  );
  if (t.proximityFt.length < t.holesWithPuttData) {
    wrap.appendChild(
      h('p', {
        class: 'note muted',
        text: `${t.holesWithPuttData - t.proximityFt.length} hole(s) recorded a putt count without a distance, so they count toward 3-putts but not toward proximity.`,
      })
    );
  }
  return wrap;
}

/** Measured tee-shot distances on par 4s and 5s. Median, because n is small. */
function driveCard(round, app) {
  const drives = [];
  const contextFor = holeContextFor(app, round);
  for (const hl of round.holes) {
    if (hl.par < 4 || hl.manual) continue;
    const geo = shotGeometry(hl, contextFor(hl));
    const first = geo[0];
    if (first?.shot.lie === 'tee' && first.lengthM != null) drives.push(first.lengthM);
  }
  const wrap = card('Tee shots (measured)');
  if (!drives.length) {
    wrap.appendChild(h('p', { class: 'note muted', text: 'No measurable tee shots — a drive needs both its own mark and the next one.' }));
    return wrap;
  }
  const med = median(drives);
  wrap.appendChild(
    h(
      'div',
      { class: 'stat-grid' },
      stat('Median', `${Math.round(toYards(med))} yd`, `n = ${drives.length}`),
      stat('Longest', `${Math.round(toYards(Math.max(...drives)))} yd`),
      stat('Shortest', `${Math.round(toYards(Math.min(...drives)))} yd`),
      stat('Spread', `${Math.round(toYards(Math.max(...drives) - Math.min(...drives)))} yd`)
    )
  );
  return wrap;
}

function scorecard(round) {
  const wrap = card('Scorecard');
  const table = h('table', { class: 'grid-card' });
  table.appendChild(
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        h('th', { text: 'Hole' }),
        h('th', { text: 'Par' }),
        h('th', { text: 'Score' }),
        h('th', { text: 'Putts' }),
        h('th', { text: 'FIR' }),
        h('th', { text: 'GIR' })
      )
    )
  );
  const tbody = h('tbody');
  const mark = (v) => (v === null ? '·' : v ? '✓' : '✗');
  for (const hl of round.holes) {
    const strokes = holeStrokes(hl);
    tbody.appendChild(
      h(
        'tr',
        { dataset: { manual: String(Boolean(hl.manual)) } },
        h('td', { text: String(hl.number) }),
        h('td', { text: String(hl.par) }),
        h('td', { text: strokes == null ? '—' : String(strokes) }),
        h('td', { text: isHoleComplete(hl) ? String(holePutts(hl) ?? 0) : '—' }),
        h('td', { text: isHoleComplete(hl) ? mark(fir(hl)) : '—' }),
        h('td', { text: isHoleComplete(hl) ? mark(gir(hl)) : '—' })
      )
    );
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  wrap.appendChild(
    h('p', { class: 'note muted', style: { marginTop: '8px' }, text: '·M marks a hand-entered hole. · means not applicable.' })
  );
  return wrap;
}

/**
 * Data quality is a first-class output, not a footnote: strokes gained is only
 * as good as the marks underneath it, and this is where a bad round of GPS
 * shows up before it reaches a trend line.
 */
function dataQuality(round, t, app) {
  const marks = [];
  for (const hl of round.holes) {
    for (const s of hl.shots) if (s.mark) marks.push(s.mark.accuracyM);
    if (hl.cup) marks.push(hl.cup.accuracyM);
  }
  const wrap = card('Data quality');
  wrap.appendChild(
    h(
      'div',
      { class: 'stat-grid' },
      stat('GPS marks', String(marks.length)),
      stat('Median accuracy', marks.length ? `±${Math.round(toFeet(median(marks)))} ft` : '—'),
      stat('Poor marks', String(t.poorMarks), t.poorMarks ? 'excluded from learning' : ''),
      stat('Hand-entered', `${t.manualHoles} hole${t.manualHoles === 1 ? '' : 's'}`)
    )
  );
  // Where the hole itself was taken from, per hole — this is what sets the
  // error bar on every approach distance, so it does not get buried. Counted by
  // the position the engine resolved (docs/SPEC_hole-position.md 6.4).
  const mapped = Boolean(courseGeometry(getCourse(app, round.courseId)));
  const contextFor = holeContextFor(app, round);
  const sources = { cup: 0, 'pin-sheet': 0, 'ball-on-green': 0, 'map-green': 0, none: 0 };
  for (const hl of round.holes) {
    if (!hl.shots.length || hl.manual) continue;
    const src = holePosition(hl, contextFor(hl))?.source;
    if (src === 'cup' || src === 'pin-sheet' || src === 'ball-on-green' || src === 'map-green') sources[src]++;
    else sources.none++;
  }
  const parts = [];
  if (sources.cup) parts.push(`${sources.cup} from a cup mark (exact)`);
  if (sources['pin-sheet']) parts.push(`${sources['pin-sheet']} from your pin sheet, placed on the map's green`);
  if (sources['ball-on-green']) parts.push(`${sources['ball-on-green']} from the ball on the green (± the first putt)`);
  if (sources['map-green']) parts.push(`${sources['map-green']} from the centre of the map's green (± half its depth)`);
  if (parts.length) {
    wrap.appendChild(
      h('p', { class: 'note muted', text: `Hole position: ${parts.join(', ')}.` })
    );
  }
  if (sources.none && !mapped) {
    wrap.appendChild(
      h('p', {
        class: 'note',
        text: `${sources.none} hole${sources.none === 1 ? '' : 's'} had no mark on the green, so distances there fall back to this course's accumulated green positions — or are unavailable on a first visit.`,
      })
    );
  }

  // Which build recorded this. Cheap to show, and the whole reason a round that
  // turns out to be wrong can be quarantined by filter instead of by memory.
  wrap.appendChild(
    h('p', { class: 'note muted', text: `Recorded by ${roundRevisionLabel(round)}.` })
  );

  /*
   * Dense track, filled in asynchronously.
   *
   * IndexedDB cannot be read synchronously, and this card is built during a
   * render. Rather than make the whole summary async — which would stall the
   * screen behind a disk read on every visit — the line appends itself when the
   * read lands. A round with no dense track says so instead of showing nothing,
   * because "no track" and "not loaded yet" must not look the same.
   */
  const trackLine = h('p', { class: 'note muted', text: 'Track: reading…' });
  wrap.appendChild(trackLine);
  readTrack(round.id)
    .then((points) => {
      if (!points.length) {
        trackLine.textContent =
          round.revision == null || round.revision < 2
            ? 'Track: none — this round predates continuous recording.'
            : 'Track: none recorded. Continuous recording may have been off, or unavailable on this device.';
        return;
      }
      const candidates = stopCandidates(points);
      const strong = candidates.filter((c) => c.score >= 0.5).length;
      const spanMin = Math.round((points[points.length - 1][3] - points[0][3]) / 60000);
      /*
       * What the round did NOT record, said out loud.
       *
       * Field test 4 lost 16.7 minutes of a 181-minute round to nine gaps, and
       * the cause turned out to be app-switching to change music as much as the
       * hardware lock. A web page cannot hold the receiver while another app is
       * in front, so the gaps are not a bug to fix — which is exactly why they
       * have to be reported. Unrecorded time is invisible otherwise, and a
       * habit that costs track data cannot be changed if it never shows up.
       */
      const sorted = [...points].sort((a, b) => a[3] - b[3]);
      let lostMs = 0;
      let gaps = 0;
      for (let i = 1; i < sorted.length; i++) {
        const g = sorted[i][3] - sorted[i - 1][3];
        if (g > 20000) {
          gaps++;
          lostMs += g;
        }
      }
      const lostMin = Math.round(lostMs / 60000);
      trackLine.textContent =
        `Track: ${points.length.toLocaleString()} fixes over ${spanMin} min · ` +
        `${candidates.length} stops found, ${strong} look like shots.` +
        (gaps
          ? ` ${gaps} gap${gaps === 1 ? '' : 's'} — ${lostMin} min not recorded, while the phone was locked or another app was in front.`
          : ' No gaps — the receiver ran the whole round.');
    })
    .catch(() => {
      trackLine.textContent = 'Track: could not be read.';
    });

  return wrap;
}
