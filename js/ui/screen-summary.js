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
import { toYards } from '../util/geo.js';
import { median } from '../util/stats.js';
import {
  roundTotals,
  holeStrokes,
  holePutts,
  puttDistancesFt,
  fir,
  gir,
  scramble,
  shotGeometry,
  accumulatedHolePosition,
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

  body.appendChild(strokesGainedCard(round, ctx));
  body.appendChild(puttingCard(t));
  body.appendChild(driveCard(round, ctx.app));
  body.appendChild(scorecard(round));
  body.appendChild(dataQuality(round, t));

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
function strokesGainedCard(round, ctx) {
  const baseline = ctx.app.settings.sgBaseline ?? 'scratch';
  const sg = roundStrokesGained(round, {
    baseline,
    fallbackFor: (hole) => accumulatedHolePosition(ctx.app, round.courseId, hole.number),
  });

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
  for (const hl of round.holes) {
    if (hl.par < 4 || hl.manual) continue;
    const geo = shotGeometry(hl, accumulatedHolePosition(app, round.courseId, hl.number));
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
function dataQuality(round, t) {
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
      stat('Median accuracy', marks.length ? `±${median(marks).toFixed(1)} m` : '—'),
      stat('Poor marks', String(t.poorMarks), t.poorMarks ? 'excluded from learning' : ''),
      stat('Hand-entered', `${t.manualHoles} hole${t.manualHoles === 1 ? '' : 's'}`)
    )
  );
  // Where the hole itself was taken from, per hole — this is what sets the
  // error bar on every approach distance, so it does not get buried.
  const sources = { cup: 0, 'ball-on-green': 0, none: 0 };
  for (const hl of round.holes) {
    if (!hl.shots.length || hl.manual) continue;
    if (hl.cup) sources.cup++;
    else if (hl.shots.some((s) => s.lie === 'green' && s.mark)) sources['ball-on-green']++;
    else sources.none++;
  }
  const parts = [];
  if (sources.cup) parts.push(`${sources.cup} from a cup mark (exact)`);
  if (sources['ball-on-green']) parts.push(`${sources['ball-on-green']} from the ball on the green (± the first putt)`);
  if (parts.length) {
    wrap.appendChild(
      h('p', { class: 'note muted', text: `Hole position: ${parts.join(', ')}.` })
    );
  }
  if (sources.none) {
    wrap.appendChild(
      h('p', {
        class: 'note',
        text: `${sources.none} hole${sources.none === 1 ? '' : 's'} had no mark on the green, so distances there fall back to this course's accumulated green positions — or are unavailable on a first visit.`,
      })
    );
  }
  return wrap;
}
