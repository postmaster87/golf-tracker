import { h, card } from './dom.js';
import { getCourse } from '../data/courses.js';
import { roundTotals, fmtToPar } from '../round/round.js';
import { loadRound } from '../data/store.js';

const NINE_LABEL = { front: 'Front 9 first', back: 'Back 9 first' };

export function homeScreen(ctx) {
  const el = h('div', { class: 'screen' });

  el.appendChild(
    h(
      'header',
      { class: 'topbar' },
      h('h1', { text: 'Golf Tracker' }),
      h('button', { class: 'icon-btn', text: '⚙', 'aria-label': 'Settings', onClick: () => ctx.go('settings') })
    )
  );

  const body = h('div', { class: 'body' });
  el.appendChild(body);

  // ---- resume ---------------------------------------------------------
  if (ctx.round?.status === 'in_progress') {
    const t = roundTotals(ctx.round);
    body.appendChild(
      card(
        'Round in progress',
        h('p', {
          class: 'note',
          text: `${ctx.round.courseName} · ${t.holes} holes complete · ${
            t.holes ? fmtToPar(t.toPar) : 'no scores yet'
          }`,
        }),
        h('button', { class: 'btn primary', text: 'RESUME ROUND', onClick: () => { ctx.startGps(); ctx.go('play'); } })
      )
    );
  }

  // ---- start ----------------------------------------------------------
  const s = ctx.app.settings;
  const veenker = getCourse(ctx.app, 'veenker');
  body.appendChild(
    card(
      'Start a round',
      h('button', {
        class: 'btn primary huge',
        text: 'START VEENKER',
        onClick: () => ctx.go('setup', { courseId: 'veenker' }),
      }),
      h('p', {
        class: 'note muted',
        style: { margin: '10px 2px 0' },
        text: `Last used: ${NINE_LABEL[s.startingNine]} · ${
          veenker.teeSets[s.teeSet]?.label ?? s.teeSet
        } tees · ${s.roundType}`,
      })
    )
  );

  // Trends is the point of collecting any of this, so it gets its own row
  // rather than being buried next to the housekeeping.
  body.appendChild(
    h('button', {
      class: 'btn',
      style: { marginBottom: '8px' },
      text: 'TRENDS & PRACTICE PRIORITY',
      onClick: () => ctx.go('trends'),
    })
  );
  body.appendChild(
    h(
      'div',
      { class: 'btn-row', style: { marginBottom: '12px' } },
      h('button', { class: 'btn', text: 'Other course', onClick: () => ctx.go('setup', { pickCourse: true }) }),
      h('button', { class: 'btn', text: 'History', onClick: () => ctx.go('history') })
    )
  );

  // ---- recent ---------------------------------------------------------
  const recent = ctx.app.rounds.filter((r) => r.status === 'completed').slice(0, 3);
  if (recent.length) {
    const list = card('Recent rounds');
    for (const summary of recent) {
      const round = loadRound(summary.id);
      if (!round) continue;
      const t = roundTotals(round);
      list.appendChild(
        h(
          'button',
          { class: 'list-row', onClick: () => ctx.go('summary', { roundId: summary.id }) },
          h(
            'span',
            { class: 'grow' },
            h('strong', { text: `${summary.courseName}` }),
            h('span', {
              class: 'sub',
              text: `${new Date(summary.startedAt).toLocaleDateString()} · ${summary.type} · ${t.holes} holes`,
            })
          ),
          h('strong', { text: t.holes ? `${t.strokes} (${fmtToPar(t.toPar)})` : '—' })
        )
      );
    }
    body.appendChild(list);
  } else {
    body.appendChild(
      h('p', {
        class: 'note muted',
        text: 'No completed rounds yet. Export your data from Settings after the first one — the backup is the only copy until Firestore sync lands.',
      })
    );
  }

  return { el };
}
