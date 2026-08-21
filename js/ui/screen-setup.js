import { h, card, field, segmented, toast, frag } from './dom.js';
import { allCourses, getCourse, newCustomCourse, playOrder } from '../data/courses.js';
import { createRound } from '../round/round.js';
import { saveRound, upsertRoundSummary } from '../data/store.js';

const TEE_ORDER = ['blue', 'gold', 'white', 'red'];

export function setupScreen(ctx) {
  const s = ctx.app.settings;
  const draft = {
    courseId: ctx.params.courseId ?? s.courseId ?? 'veenker',
    teeSet: s.teeSet,
    startingNine: s.startingNine,
    type: s.roundType,
    holeCount: 18,
    // Null means "the first hole of whatever is being played". Never persisted:
    // a shotgun start is a property of one round, not a preference.
    startHole: null,
    view: ctx.params.pickCourse ? 'course' : 'main',
  };

  /*
   * The remembered tee may not exist on the remembered course.
   *
   * The picker already fixes this when a course is chosen through it, but the
   * screen can also open straight onto a course — from settings, or from a
   * saved `courseId` — and then nothing would be selected while `draft.teeSet`
   * still held the old value. Starting like that records a round played from a
   * tee the course does not have, and `holeYards` quietly falls back to another
   * one, so the yardages and the label would disagree.
   */
  {
    const c0 = getCourse(ctx.app, draft.courseId);
    const keys = c0 ? Object.keys(c0.teeSets) : [];
    if (keys.length && !keys.includes(draft.teeSet)) draft.teeSet = keys[0];
  }

  const el = h('div', { class: 'screen' });
  const body = h('div', { class: 'body' });
  const footer = h('div', { class: 'footer' });

  el.appendChild(
    h(
      'header',
      { class: 'topbar' },
      h('button', { class: 'icon-btn', text: '‹', 'aria-label': 'Back', onClick: () => ctx.go('home') }),
      h('h1', { text: 'New round' })
    )
  );
  el.appendChild(body);
  el.appendChild(footer);

  function paint() {
    body.replaceChildren();
    footer.replaceChildren();

    if (draft.view === 'course') return paintCoursePicker();
    if (draft.view === 'newCourse') return paintCourseEditor();
    paintMain();
  }

  /* ------------------------------------------------------------- main ---- */

  function paintMain() {
    const course = getCourse(ctx.app, draft.courseId);
    if (!course) {
      draft.view = 'course';
      return paint();
    }
    const teeKeys = Object.keys(course.teeSets);
    if (!teeKeys.includes(draft.teeSet)) draft.teeSet = teeKeys[0];

    body.appendChild(
      card(
        'Course',
        h(
          'button',
          { class: 'list-row', style: { marginBottom: 0 }, onClick: () => { draft.view = 'course'; paint(); } },
          h(
            'span',
            { class: 'grow' },
            h('strong', { text: course.name }),
            h('span', { class: 'sub', text: `${course.location ?? 'custom'} · par ${course.par}` })
          ),
          h('span', { class: 'muted', text: 'Change ›' })
        )
      )
    );

    const main = card('Setup');

    // Starting nine leads: at Veenker it is the one thing that changes daily.
    if (course.holes.length >= 18) {
      main.appendChild(
        field(
          'Starting nine',
          segmented(
            [
              { value: 'front', label: 'FRONT (1)' },
              { value: 'back', label: 'BACK (10)' },
            ],
            draft.startingNine,
            (v) => {
              draft.startingNine = v;
              paint();
            }
          )
        )
      );
    }

    /*
     * STARTING HOLE — the shotgun start.
     *
     * Every group tees off at once on a different hole and plays the course
     * round to where they began. It is how a four-man best ball gets 18 groups
     * off a nine in one go, and it was the normal case for field test 4.
     *
     * A grid of the holes actually in play, one tap, defaulting to the first.
     * It is deliberately not hidden behind an advanced screen: getting this
     * wrong is not cosmetic — the round would be dealt in the wrong order and
     * every hole's par, yardage and track window would belong to a hole he was
     * not standing on.
     */
    const inPlay = playOrder(course, draft.startingNine, Math.min(draft.holeCount, course.holes.length));
    if (inPlay.length > 1) {
      const holeGrid = segmented(
        inPlay.map((x) => ({ value: x.number, label: String(x.number) })),
        draft.startHole ?? inPlay[0].number,
        (v) => {
          draft.startHole = v;
          paint();
        },
        { columns: Math.min(6, inPlay.length) }
      );

      const start = draft.startHole ?? inPlay[0].number;
      const rotated = playOrder(
        course,
        draft.startingNine,
        Math.min(draft.holeCount, course.holes.length),
        start
      );
      main.appendChild(
        field(
          'Starting hole',
          frag(
            holeGrid,
            // Spelled out, because a rotated order is the one thing here that
            // cannot be checked at a glance once the round is running.
            h('p', {
              class: 'note muted',
              style: { margin: '8px 2px 0' },
              text:
                start === inPlay[0].number
                  ? 'Normal start — plays in order from the first hole.'
                  : `Shotgun start on ${start}. Plays ${rotated.map((x) => x.number).join(', ')}.`,
            })
          )
        )
      );
    }

    main.appendChild(
      field(
        'Tees',
        segmented(
          TEE_ORDER.filter((t) => teeKeys.includes(t))
            .concat(teeKeys.filter((t) => !TEE_ORDER.includes(t)))
            .map((t) => ({
              value: t,
              label: `${course.teeSets[t].label}${course.teeSets[t].yards ? ` ${course.teeSets[t].yards}` : ''}`,
            })),
          draft.teeSet,
          (v) => {
            draft.teeSet = v;
            paint();
          },
          { columns: 2 }
        )
      )
    );

    main.appendChild(
      field(
        'Round type',
        segmented(
          [
            { value: 'practice', label: 'PRACTICE' },
            { value: 'tournament', label: 'TOURNAMENT' },
          ],
          draft.type,
          (v) => {
            draft.type = v;
            paint();
          }
        )
      )
    );

    // Only where there is a choice to make. On a nine-hole course "18" and "9"
    // both come out as nine — `start` clamps to the course — so offering both
    // is a control that cannot change anything.
    if (course.holes.length >= 18) {
      main.appendChild(
        field(
          'Holes',
          segmented(
            [
              { value: 18, label: '18' },
              { value: 9, label: '9' },
            ],
            draft.holeCount,
            (v) => {
              draft.holeCount = v;
              paint();
            }
          )
        )
      );
    }

    body.appendChild(main);

    const gpsNote = ctx.gps.supported
      ? 'GPS starts when the round starts and runs continuously until you finish.'
      : 'This browser has no Geolocation API — shots cannot be marked. Use manual hole entry.';
    body.appendChild(h('p', { class: 'note muted', text: gpsNote }));

    footer.appendChild(
      h('button', { class: 'btn primary huge', text: 'START ROUND', onClick: () => start(course) })
    );
  }

  /* ---------------------------------------------------- course picker ---- */

  function paintCoursePicker() {
    const list = card('Choose a course');
    for (const c of allCourses(ctx.app)) {
      list.appendChild(
        h(
          'button',
          {
            class: 'list-row',
            onClick: () => {
              draft.courseId = c.id;
              const keys = Object.keys(c.teeSets);
              if (!keys.includes(draft.teeSet)) draft.teeSet = keys[0];
              draft.view = 'main';
              paint();
            },
          },
          h(
            'span',
            { class: 'grow' },
            h('strong', { text: c.name }),
            h('span', {
              class: 'sub',
              text: `${c.location ?? 'custom'} · ${c.holes.length} holes · par ${c.par}`,
            })
          ),
          c.id === draft.courseId ? h('span', { text: '✓' }) : null
        )
      );
    }
    body.appendChild(list);
    footer.appendChild(
      h('button', { class: 'btn', text: '+ New course', onClick: () => { draft.view = 'newCourse'; paint(); } })
    );
    footer.appendChild(
      h('button', { class: 'btn sm', text: 'Cancel', onClick: () => { draft.view = 'main'; paint(); } })
    );
  }

  /* ---------------------------------------------------- course editor ---- */

  function paintCourseEditor() {
    const editor = { name: '', holeCount: 18, pars: Array(18).fill(4) };

    const nameInput = h('input', {
      type: 'text',
      placeholder: 'Course name',
      autocomplete: 'off',
      onInput: (e) => {
        editor.name = e.target.value;
      },
    });

    const parGrid = h('div', { class: 'hole-jump' });
    const paintPars = () => {
      parGrid.replaceChildren();
      for (let i = 0; i < editor.holeCount; i++) {
        const btn = h('button', {
          class: 'seg-btn',
          type: 'button',
          text: `${i + 1}·${editor.pars[i]}`,
          onClick: () => {
            editor.pars[i] = editor.pars[i] >= 5 ? 3 : editor.pars[i] + 1;
            paintPars();
          },
        });
        parGrid.appendChild(btn);
      }
    };
    paintPars();

    const wrap = card('New course');
    wrap.appendChild(field('Name', nameInput));
    wrap.appendChild(
      field(
        'Holes',
        segmented(
          [
            { value: 18, label: '18' },
            { value: 9, label: '9' },
          ],
          editor.holeCount,
          (v) => {
            editor.holeCount = v;
            paintPars();
          }
        )
      )
    );
    wrap.appendChild(field('Par per hole (tap to cycle 3-4-5)', parGrid));
    body.appendChild(wrap);
    body.appendChild(
      h('p', {
        class: 'note muted',
        text: 'Yardages are optional — every distance in this app is measured from GPS, not from the card.',
      })
    );

    footer.appendChild(
      h('button', {
        class: 'btn primary',
        text: 'SAVE COURSE',
        onClick: () => {
          const name = editor.name.trim();
          if (!name) return toast('Give the course a name first.');
          const course = newCustomCourse(name, editor.holeCount);
          course.holes.forEach((hole, i) => {
            hole.par = editor.pars[i];
          });
          course.par = course.holes.reduce((a, x) => a + x.par, 0);
          ctx.app.courses[course.id] = course;
          ctx.persistApp();
          draft.courseId = course.id;
          draft.teeSet = 'default';
          draft.view = 'main';
          paint();
          toast(`${name} saved.`);
        },
      })
    );
    footer.appendChild(
      h('button', { class: 'btn sm', text: 'Cancel', onClick: () => { draft.view = 'course'; paint(); } })
    );
  }

  /* ------------------------------------------------------------ start ---- */

  function start(course) {
    const round = createRound({
      course,
      teeSet: draft.teeSet,
      startingNine: draft.startingNine,
      type: draft.type,
      holeCount: Math.min(draft.holeCount, course.holes.length),
      startHole: draft.startHole,
    });

    ctx.round = round;
    ctx.app.activeRoundId = round.id;
    Object.assign(ctx.app.settings, {
      courseId: course.id,
      teeSet: draft.teeSet,
      startingNine: draft.startingNine,
      roundType: draft.type,
    });
    saveRound(round);
    upsertRoundSummary(ctx.app, round);
    ctx.persistApp();
    ctx.startGps();
    ctx.go('play');
  }

  paint();
  return { el };
}
