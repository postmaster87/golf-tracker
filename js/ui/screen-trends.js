import { h, card, stat, segmented, field } from './dom.js';
import { CATEGORIES, CATEGORY_LABELS, fmtSG } from '../analysis/strokes-gained.js';
import {
  buildSeries,
  rollingWindows,
  weightedPriority,
  hypothesisVerdict,
  categorySeries,
  clubBreakdown,
  WINDOWS,
} from '../analysis/trends.js';
import { clubLabel } from '../data/clubs.js';
import { BASELINES } from '../analysis/benchmarks.js';
import { allCourses } from '../data/courses.js';

/**
 * The trends screen.
 *
 * Design rule throughout: no number appears without its n, and no comparison is
 * called until it has actually separated. The temptation with a dashboard like
 * this is to look decisive after four rounds; that would send practice time in
 * the wrong direction, which is the one failure this app exists to prevent.
 */
export function trendsScreen(ctx) {
  const el = h('div', { class: 'screen' });
  const filters = {
    type: 'all',
    courseId: 'all',
    baseline: ctx.app.settings.sgBaseline ?? 'scratch',
  };

  el.appendChild(
    h(
      'header',
      { class: 'topbar' },
      h('button', { class: 'icon-btn', text: '‹', 'aria-label': 'Back', onClick: () => ctx.go('home') }),
      h('h1', { text: 'Trends' })
    )
  );

  const body = h('div', { class: 'body' });
  el.appendChild(body);

  function paint() {
    body.replaceChildren();

    const courses = allCourses(ctx.app);
    body.appendChild(
      segmented(
        [
          { value: 'all', label: 'ALL' },
          { value: 'practice', label: 'PRACTICE' },
          { value: 'tournament', label: 'TOURNAMENT' },
        ],
        filters.type,
        (v) => {
          filters.type = v;
          paint();
        }
      )
    );

    if (courses.length > 1) {
      body.appendChild(
        h('div', { style: { marginTop: '8px' } },
          segmented(
            [{ value: 'all', label: 'ALL COURSES' }, ...courses.map((c) => ({ value: c.id, label: c.name.toUpperCase() }))],
            filters.courseId,
            (v) => {
              filters.courseId = v;
              paint();
            },
            { columns: 2 }
          )
        )
      );
    }

    const series = buildSeries(ctx.app, filters);

    if (!series.length) {
      body.appendChild(
        card(
          'Nothing to trend yet',
          h('p', {
            class: 'note',
            text: 'Log a few complete rounds and this fills in. The rolling windows want 5, 10 and 20 rounds; the off-the-tee versus approach question typically needs a dozen or more before it separates from noise.',
          })
        )
      );
      return;
    }

    const simulated = series.filter((r) => r.simulated).length;
    if (simulated) {
      body.appendChild(
        h('p', {
          class: 'note',
          style: { color: 'var(--bad)', fontWeight: '700' },
          text: `${simulated} of these ${series.length} rounds used simulated GPS and are not real data.`,
        })
      );
    }

    body.appendChild(priorityCard(series));
    body.appendChild(questionCard(series));
    body.appendChild(windowsCard(series));
    body.appendChild(clubCard());
    body.appendChild(sparklineCard(series));

    body.appendChild(
      h('p', {
        class: 'note muted',
        text: `All figures are strokes gained per 18 holes versus ${
          BASELINES[filters.baseline]?.label ?? filters.baseline
        }. Rounds shorter than 9 scored holes are excluded. Change the baseline in Settings.`,
      })
    );
  }

  /* ------------------------------------------------------------ priority */

  function priorityCard(series) {
    const ranked = weightedPriority(series);
    const wrap = card('Practice priority');
    wrap.appendChild(
      h('p', {
        class: 'note muted',
        text: `Ranked by strokes lost per 18 holes, weighted toward recent rounds (8-round half-life). n = ${series.length}.`,
      })
    );

    const worst = Math.max(...ranked.map((r) => Math.abs(r.weighted || 0)), 0.01);
    for (const [i, row] of ranked.entries()) {
      const losing = row.weighted < 0;
      // A category whose confidence interval straddles zero is not yet
      // distinguishable from "fine", and says so rather than being ranked
      // as if it were known.
      const noisy = row.ci != null && Math.abs(row.mean) < row.ci;
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
              text: `mean ${fmtSG(row.mean)}${row.ci != null ? ` ± ${row.ci.toFixed(2)}` : ''} · n = ${row.n}${
                noisy ? ' · not yet distinguishable from zero' : ''
              }`,
            }),
            h(
              'span',
              { class: 'sg-bar' },
              h('span', {
                style: {
                  width: `${Math.round((Math.abs(row.weighted) / worst) * 100)}%`,
                  background: losing ? 'var(--bad)' : 'var(--good)',
                  opacity: noisy ? '0.45' : '1',
                },
              })
            )
          ),
          h('strong', {
            style: { color: losing ? 'var(--bad)' : 'var(--good)' },
            text: fmtSG(row.weighted),
          })
        )
      );
    }
    return wrap;
  }

  /* ------------------------------------------------- the open question */

  function questionCard(series) {
    const v = hypothesisVerdict(series);
    const wrap = card('Off the tee vs approach');
    wrap.appendChild(
      h('p', {
        class: 'note muted',
        text: 'Your hypothesis against your friend\'s. Compared within each round, so a windy day cancels out of the difference rather than adding noise to it.',
      })
    );

    if (v.verdict === 'undecided' && v.n < 2) {
      wrap.appendChild(h('p', { class: 'note', text: `Not enough rounds yet — ${v.reason}.` }));
      return wrap;
    }

    const decided = v.verdict === 'separated';
    wrap.appendChild(
      h(
        'div',
        { class: 'stat-grid' },
        stat('Off the tee', fmtSG(series.length ? avg(series, 'off_tee') : null), `n = ${v.n}`),
        stat('Approach', fmtSG(series.length ? avg(series, 'approach') : null), `n = ${v.n}`)
      )
    );

    wrap.appendChild(
      h('p', {
        class: 'note',
        style: {
          marginTop: '10px',
          fontWeight: '800',
          color: decided ? 'var(--ink)' : 'var(--warn)',
        },
        text: decided
          ? `${CATEGORY_LABELS[v.worse]} is costing more. Difference ${fmtSG(v.meanDiff)} ± ${v.ci.toFixed(2)} per 18 holes.`
          : `Too close to call. Difference ${fmtSG(v.meanDiff)} ± ${v.ci.toFixed(2)} per 18 holes — the interval still contains zero.`,
      })
    );

    if (!decided && v.roundsNeeded) {
      wrap.appendChild(
        h('p', {
          class: 'note',
          text: `At the spread you are currently showing, separating these would take roughly ${v.roundsNeeded} rounds. You have ${v.n}.`,
        })
      );
    }
    if (decided) {
      wrap.appendChild(
        h('p', {
          class: 'note muted',
          text: 'Note this is which category costs YOU more, which is a different question from Broadie\'s population finding that approach explains ~40% of the gap between handicap levels. Both can be true.',
        })
      );
    }
    return wrap;
  }

  const avg = (series, c) => series.reduce((a, r) => a + r.per18[c], 0) / series.length;

  /* ------------------------------------------------------------- windows */

  function windowsCard(series) {
    const w = rollingWindows(series);
    const wrap = card('Rolling windows');
    const table = h('table', { class: 'grid-card' });
    table.appendChild(
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          h('th', { text: '' }),
          ...WINDOWS.map((n) => h('th', { text: `Last ${n}` }))
        )
      )
    );
    const tbody = h('tbody');
    for (const c of CATEGORIES) {
      tbody.appendChild(
        h(
          'tr',
          {},
          h('td', { text: CATEGORY_LABELS[c] }),
          ...WINDOWS.map((n) => {
            const s = w[n].categories[c];
            return h('td', { text: s.n ? fmtSG(s.mean) : '—' });
          })
        )
      );
    }
    tbody.appendChild(
      h(
        'tr',
        {},
        h('td', { text: 'Total' }),
        ...WINDOWS.map((n) => h('td', { text: w[n].total.n ? fmtSG(w[n].total.mean) : '—' }))
      )
    );
    tbody.appendChild(
      h(
        'tr',
        {},
        h('td', { text: 'n' }),
        ...WINDOWS.map((n) =>
          h('td', {
            // A window that has not filled is the most misleading thing on this
            // screen if its n is not obvious.
            style: w[n].complete ? null : { color: 'var(--warn)', fontWeight: '800' },
            text: String(w[n].rounds),
          })
        )
      )
    );
    table.appendChild(tbody);
    wrap.appendChild(table);
    wrap.appendChild(
      h('p', {
        class: 'note muted',
        style: { marginTop: '8px' },
        text: 'A window shows however many rounds actually exist. An amber n means it has not filled yet.',
      })
    );
    return wrap;
  }

  /* --------------------------------------------------------------- clubs */

  /**
   * Two columns that answer different questions. Strokes gained per shot says
   * whether the club does its job; the spread says whether it is predictable.
   * A club can look fine on average and still be the problem if half of them
   * come up twenty yards short — which is exactly the insight club tracking
   * was turned on to find.
   */
  function clubCard() {
    const { rows, unrecorded, minShots } = clubBreakdown(ctx.app, filters);
    const wrap = card('By club');

    if (!rows.length) {
      wrap.appendChild(
        h('p', {
          class: 'note muted',
          text: 'No clubs recorded yet. Turn on club tracking in Settings and they will appear here after a round.',
        })
      );
      return wrap;
    }

    const table = h('table', { class: 'grid-card' });
    table.appendChild(
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          h('th', { text: 'Club' }),
          h('th', { text: 'n' }),
          h('th', { text: 'Median' }),
          h('th', { text: 'Spread' }),
          h('th', { text: 'SG/shot' })
        )
      )
    );
    const tbody = h('tbody');
    for (const r of rows) {
      if (r.club === 'putter') continue; // putting has its own card
      tbody.appendChild(
        h(
          'tr',
          {},
          h('td', { text: clubLabel(r.club) }),
          // A thin sample is marked rather than hidden: n is the first thing
          // that decides whether the rest of the row means anything.
          h('td', {
            style: r.thin ? { color: 'var(--warn)', fontWeight: '800' } : null,
            text: String(r.shots),
          }),
          h('td', { text: r.medianYds != null ? `${Math.round(r.medianYds)}` : '—' }),
          h('td', { text: r.spreadYds != null ? `±${Math.round(r.spreadYds / 2)}` : '—' }),
          h('td', {
            style: r.sgPerShot != null && r.sgPerShot < 0 ? { color: 'var(--bad)' } : null,
            text: r.sgPerShot != null ? fmtSG(r.sgPerShot, 2) : '—',
          })
        )
      );
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    wrap.appendChild(
      h('p', {
        class: 'note muted',
        style: { marginTop: '8px' },
        text: `Distances in yards, measured. Spread is the middle half of your shots, so one topped 3-wood does not define the club. An amber n means fewer than ${minShots} measured shots — read that row as a hint, not a finding.`,
      })
    );
    if (unrecorded) {
      wrap.appendChild(
        h('p', {
          class: 'note',
          text: `${unrecorded} shot${unrecorded === 1 ? '' : 's'} had no club recorded and ${
            unrecorded === 1 ? 'is' : 'are'
          } excluded from every row above rather than guessed at.`,
        })
      );
    }
    return wrap;
  }

  /* ---------------------------------------------------------- sparklines */

  function sparklineCard(series) {
    const wrap = card('By round');
    if (series.length < 2) {
      wrap.appendChild(h('p', { class: 'note muted', text: 'Two rounds needed before a line means anything.' }));
      return wrap;
    }
    for (const c of CATEGORIES) {
      const points = categorySeries(series, c);
      wrap.appendChild(
        h(
          'div',
          { style: { marginBottom: '10px' } },
          h(
            'div',
            { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } },
            h('strong', { text: CATEGORY_LABELS[c] }),
            h('span', { class: 'muted', style: { fontVariantNumeric: 'tabular-nums' }, text: `${fmtSG(points[points.length - 1].value)} latest` })
          ),
          sparkline(points.map((p) => p.value))
        )
      );
    }
    wrap.appendChild(
      h('p', { class: 'note muted', text: 'Oldest round on the left. The dashed line is zero — level with the benchmark.' })
    );
    return wrap;
  }

  /** Inline SVG sparkline with a zero rule. No dependencies, scales to width. */
  function sparkline(values) {
    const W = 300;
    const H = 44;
    const pad = 3;
    const lo = Math.min(...values, 0);
    const hi = Math.max(...values, 0);
    const span = hi - lo || 1;
    const x = (i) => pad + (i / Math.max(1, values.length - 1)) * (W - 2 * pad);
    const y = (v) => H - pad - ((v - lo) / span) * (H - 2 * pad);

    const path = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('class', 'spark');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${values.length} rounds, latest ${values[values.length - 1].toFixed(2)}`);
    svg.innerHTML =
      `<line x1="0" y1="${y(0).toFixed(1)}" x2="${W}" y2="${y(0).toFixed(1)}" stroke="currentColor" stroke-dasharray="3 3" opacity="0.35" vector-effect="non-scaling-stroke"/>` +
      `<path d="${path}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>` +
      values
        .map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.5" fill="currentColor"/>`)
        .join('');
    return svg;
  }

  paint();
  return { el };
}
