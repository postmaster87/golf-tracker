import { h, card } from './dom.js';
import { getCourse } from '../data/courses.js';
import { roundTotals, fmtToPar } from '../round/round.js';
import { loadRound } from '../data/store.js';
import { revisionLabel, revisionInfo, isWorkingRevision } from '../data/revision.js';

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
  /*
   * The shortcut follows the course last played, not Veenker.
   *
   * It was hardcoded from rev 0, when Veenker was the only course there was.
   * With a second one in the build that is now actively wrong: the setting says
   * Radcliffe and the button still says — and still starts — Veenker, which on
   * a day of four rounds there is four wrong rounds.
   */
  const course = getCourse(ctx.app, s.courseId) ?? getCourse(ctx.app, 'veenker');
  // The remembered tee may not exist on this course. Setup falls back to the
  // course's first tee, so say that rather than naming a tee it does not have.
  const teeKey = course.teeSets[s.teeSet] ? s.teeSet : Object.keys(course.teeSets)[0];
  const lastUsed = [
    // Meaningless on a course with one nine, where there is nothing to alternate.
    course.holes.length >= 18 ? NINE_LABEL[s.startingNine] : null,
    `${course.teeSets[teeKey]?.label ?? teeKey} tees`,
    s.roundType,
  ].filter(Boolean);

  body.appendChild(
    card(
      'Start a round',
      h('button', {
        class: 'btn primary huge',
        text: `START ${(course.shortName ?? course.name).toUpperCase()}`,
        onClick: () => ctx.go('setup', { courseId: course.id }),
      }),
      h('p', {
        class: 'note muted',
        style: { margin: '10px 2px 0' },
        text: `Last used: ${lastUsed.join(' · ')}`,
      }),
      // A second course exists now, so the way to the other one belongs here
      // rather than only behind "Other course" further down.
      h('button', {
        class: 'btn sm dim',
        style: { marginTop: '10px' },
        text: 'CHANGE COURSE',
        onClick: () => ctx.go('setup', { pickCourse: true }),
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

  /*
   * Which build is actually on the phone.
   *
   * The service worker is network-first with a cache fallback, which is correct
   * for staying playable on a course with no signal — but it means the build in
   * your hand is not necessarily the one that was last deployed. Before this
   * line there was no way to tell from inside the app, which made "did the new
   * version make it to my phone?" unanswerable without a laptop.
   *
   * Marked when unshipped, because that is the state where a round is most
   * likely to hit something new.
   */
  el.appendChild(
    h('p', {
      class: 'note muted',
      style: { textAlign: 'center', marginTop: '18px' },
      text: `${revisionLabel()} — ${revisionInfo()?.title ?? 'untitled'}${
        isWorkingRevision() ? ' · not yet played' : ''
      }`,
    })
  );

  return { el };
}
