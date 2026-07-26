import { h, card, sheet, confirmSheet, segmented, field, toast, frag } from './dom.js';
import { LIES, LIE_LABELS, PENALTY_TYPES } from '../data/schema.js';
import { getCourse, playOrder, holeYards } from '../data/courses.js';
import {
  currentHole,
  defaultLie,
  addShot,
  setCup,
  undoLast,
  restoreUndo,
  removeShot,
  attachPenalty,
  setManualHole,
  setShotDistance,
  setGreenEntry,
  puttDistancesFt,
  PUTT_UNITS,
  shotGeometry,
  holeStrokes,
  holePutts,
  penaltyStrokes,
  isHoleComplete,
  roundTotals,
  learnTee,
  learnCup,
  learnGreen,
  accumulatedHolePosition,
  detectStartingNine,
  fmtDistance,
  fmtToPar,
} from '../round/round.js';

/**
 * The on-course screen. Everything here is built around two facts: a mis-tap is
 * always one tap from being undone, and no action ever blocks on the GPS —
 * the burst runs while the lie is being chosen, so marking a shot costs two
 * taps and about as long as it takes to look at the ball.
 */
export function playScreen(ctx) {
  const round = ctx.round;
  const el = h('div', { class: 'screen' });

  if (!round) {
    queueMicrotask(() => ctx.go('home'));
    return { el };
  }

  /** @type {null | {kind:string, chosenLie:string|null, lieConfirmed:boolean, reduced:any, controller:AbortController, progress:any}} */
  let capture = null;
  let markWarning = null;

  const hole = () => currentHole(round);
  const isLastHole = () => round.currentHoleIndex >= round.holes.length - 1;

  /* --------------------------------------------------------------- chrome */

  const accChip = h('div', { class: 'acc-chip', dataset: { q: 'none' } });
  const hudNum = h('span', { class: 'hud-num' });
  const hudMeta = h('span', { class: 'hud-meta' });

  el.appendChild(
    h(
      'header',
      { class: 'hud' },
      h('button', {
        class: 'icon-btn',
        text: '≡',
        'aria-label': 'Round menu',
        onClick: openMenu,
      }),
      h('button', {
        class: 'hud-hole',
        style: { background: 'none', border: 'none', padding: 0 },
        'aria-label': 'Jump to hole',
        onClick: openHoleJump,
      }, hudNum, hudMeta),
      accChip
    )
  );

  const body = h('div', { class: 'body' });
  const footer = h('div', { class: 'footer' });
  el.appendChild(body);
  el.appendChild(footer);

  /* ------------------------------------------------------------ live bits */

  function tick() {
    const fix = ctx.gps.current;
    if (ctx.gps.error?.code === 1) {
      accChip.dataset.q = 'poor';
      accChip.replaceChildren(h('small', { text: 'GPS' }), document.createTextNode('OFF'));
      return;
    }
    if (!fix) {
      accChip.dataset.q = 'none';
      accChip.replaceChildren(h('small', { text: 'GPS' }), document.createTextNode('—'));
      return;
    }
    const max = ctx.app.settings.maxAccuracyM;
    accChip.dataset.q = fix.acc <= max / 2 ? 'good' : fix.acc <= max ? 'degraded' : 'poor';
    accChip.replaceChildren(
      h('small', { text: 'accuracy' }),
      document.createTextNode(`±${fix.acc.toFixed(1)}m`)
    );
  }

  function updateCaptureUI() {
    if (!capture) return;
    const bar = body.querySelector('.cap-bar span');
    const meta = body.querySelector('.cap-meta');
    const pct = Math.min(100, (capture.progress.elapsed / capture.progress.total) * 100);
    if (bar) bar.style.width = `${pct}%`;
    if (meta) {
      const best = capture.progress.bestAcc;
      meta.textContent = capture.reduced
        ? `Captured · ${capture.reduced.usedCount}/${capture.reduced.sampleCount} fixes · ±${capture.reduced.accuracyM} m`
        : `Capturing · ${capture.progress.count} fixes${best != null ? ` · best ±${best.toFixed(1)} m` : ''}`;
    }
  }

  /* --------------------------------------------------------------- paint */

  function paint() {
    const hl = hole();
    hudNum.textContent = `H${hl.number}`;
    hudMeta.textContent = `Par ${hl.par}${hl.yards ? ` · ${hl.yards} yd` : ''}${
      hl.hcp ? ` · HCP ${hl.hcp}` : ''
    } · ${round.currentHoleIndex + 1}/${round.holes.length}`;

    body.replaceChildren();
    footer.replaceChildren();
    tick();

    if (ctx.gps.error?.code === 1) {
      body.appendChild(
        banner(
          'bad',
          'Location permission is off. Re-enable it in the browser site settings, then reload.',
          'Retry',
          () => {
            ctx.gps.error = null;
            ctx.startGps();
            paint();
          }
        )
      );
    }

    if (markWarning) {
      body.appendChild(
        banner(markWarning.kind, markWarning.text, markWarning.action, markWarning.onAction)
      );
    }

    body.appendChild(tally(hl));
    body.appendChild(shotList(hl));

    if (capture) paintCapture();
    else paintActions(hl);
  }

  function banner(kind, text, actionLabel, onAction) {
    return h(
      'div',
      { class: 'banner', dataset: { kind } },
      h('span', { text }),
      actionLabel
        ? h('button', {
            class: 'btn sm',
            text: actionLabel,
            onClick: () => {
              markWarning = null;
              onAction?.();
            },
          })
        : null
    );
  }

  function tally(hl) {
    const strokes = holeStrokes(hl);
    const pen = penaltyStrokes(hl);
    const t = roundTotals(round);
    return h(
      'div',
      { class: 'tally' },
      statBox('Strokes', strokes ?? 0),
      statBox('Putts', holePutts(hl) ?? 0),
      statBox('Pen', pen),
      statBox('Round', t.holes ? fmtToPar(t.toPar) : '—')
    );
  }

  const statBox = (k, v) =>
    h('div', {}, h('span', { class: 'k', text: k }), h('span', { class: 'v', text: String(v) }));

  function shotList(hl) {
    const wrap = h('ul', { class: 'shots' });

    if (hl.manual) {
      wrap.appendChild(
        h(
          'li',
          {},
          h(
            'div',
            { class: 'shot' },
            h('span', { class: 'seq', text: 'M' }),
            h('span', { class: 'lie', text: 'Hand-entered' }),
            h(
              'span',
              { class: 'dist' },
              `${hl.manual.strokes} stroke${hl.manual.strokes === 1 ? '' : 's'}`,
              h('span', {
                class: 'sub',
                text: hl.shots.length ? `${hl.shots.length} GPS mark${hl.shots.length === 1 ? '' : 's'} kept` : '',
              })
            )
          )
        )
      );
      return wrap;
    }

    const geo = shotGeometry(hl, accumulatedHolePosition(ctx.app, round.courseId, hl.number));
    if (!geo.length) {
      wrap.appendChild(
        h('li', { class: 'note muted', text: 'No shots marked yet. Stand at the ball and tap MARK SHOT.' })
      );
      return wrap;
    }

    geo.forEach((g, i) => {
      const s = g.shot;
      const asFeet = s.lie === 'green';
      const primary =
        g.toHoleM != null
          ? fmtDistance(g.toHoleM, { asFeet })
          : g.lengthM != null
            ? fmtDistance(g.lengthM, { asFeet })
            : '—';
      // Say where each number came from. A paced putt, a GPS distance to the
      // ball on the green and a guess off last month's pin are not the same
      // measurement, and the shot list is where that has to be visible.
      const paced =
        s.distanceFt == null
          ? null
          : s.distanceEntry
            ? `${s.distanceEntry.value} ${PUTT_UNITS[s.distanceEntry.unit]?.short ?? ''}`.trim()
            : 'entered';
      const secondary =
        g.toHoleM != null
          ? paced && s.lie === 'green'
            ? paced
            : g.lengthM != null
              ? `${fmtDistance(g.lengthM, { asFeet })} shot`
              : s.penalty
                ? 'penalty'
                : g.toHoleSource?.startsWith('accumulated')
                  ? `est. ±${Math.round(g.toHoleUncertaintyM)} m`
                  : ''
          : g.lengthM != null
            ? 'shot'
            : s.lie === 'green'
              ? 'putts not entered'
              : 'no green mark yet';

      wrap.appendChild(
        h(
          'li',
          {},
          h(
            'button',
            {
              class: 'shot',
              dataset: { quality: s.mark?.quality ?? 'manual' },
              onClick: () => openShotEditor(hl, s, i),
            },
            h('span', { class: 'seq', text: String(i + 1) }),
            h('span', { class: 'lie', text: LIE_LABELS[s.lie] }),
            s.penalty ? h('span', { class: 'flag', text: `+${s.penalty.strokes} ${s.penalty.type}` }) : null,
            s.mark?.quality === 'poor' ? h('span', { class: 'flag', text: 'poor fix' }) : null,
            h(
              'span',
              { class: 'dist' },
              primary,
              h('small', { text: g.toHoleM != null ? `to hole${secondary ? ` · ${secondary}` : ''}` : secondary })
            )
          )
        )
      );
    });

    if (hl.cup) {
      wrap.appendChild(
        h(
          'li',
          {},
          h(
            'div',
            { class: 'shot', dataset: { quality: hl.cup.quality } },
            h('span', { class: 'seq', text: '⚑' }),
            h('span', { class: 'lie', text: 'Cup' }),
            h('span', { class: 'dist' }, `±${hl.cup.accuracyM} m`, h('small', { text: 'holed out' }))
          )
        )
      );
    }
    return wrap;
  }

  /* ------------------------------------------------------------- capture */

  function paintCapture() {
    const isShot = capture.kind === 'shot';
    const wrap = h('div', { class: 'capture' });

    wrap.appendChild(
      h(
        'div',
        { class: 'cap-head' },
        h('span', {
          text: isShot ? 'Select the lie' : capture.kind === 'putt' ? 'Marking putt' : 'Marking cup',
        }),
        h('span', { class: 'val cap-meta', text: 'Capturing…' })
      )
    );
    wrap.appendChild(h('div', { class: 'cap-bar' }, h('span')));

    if (isShot) {
      const grid = h('div', { class: 'lie-grid' });
      for (const lie of LIES) {
        grid.appendChild(
          h('button', {
            class: 'seg-btn',
            type: 'button',
            text: LIE_LABELS[lie].toUpperCase(),
            'aria-pressed': String(capture.chosenLie === lie),
            onClick: () => {
              capture.chosenLie = lie;
              capture.lieConfirmed = true;
              // Repaint so the choice is visibly registered even while the
              // burst is still filling.
              paint();
              maybeCommit();
            },
          })
        );
      }
      wrap.appendChild(grid);
    }

    footer.appendChild(wrap);
    footer.appendChild(
      h('button', {
        class: 'btn sm',
        text: 'CANCEL',
        onClick: () => {
          capture.controller.abort();
          capture = null;
          paint();
        },
      })
    );
    updateCaptureUI();
  }

  function beginCapture(kind) {
    if (capture) return;
    const controller = new AbortController();
    capture = {
      kind,
      chosenLie: kind === 'shot' ? defaultLie(hole()) : 'green',
      lieConfirmed: false,
      reduced: null,
      controller,
      progress: { elapsed: 0, total: ctx.app.settings.burstMs, count: 0, bestAcc: null },
    };
    paint();

    ctx.gps
      .captureBurst({
        durationMs: ctx.app.settings.burstMs,
        signal: controller.signal,
        onProgress: (p) => {
          if (capture) {
            capture.progress = p;
            updateCaptureUI();
          }
        },
      })
      .then((reduced) => {
        if (!capture || controller.signal.aborted) return;
        capture.reduced = reduced;
        updateCaptureUI();
        maybeCommit();
      });
  }

  /** Commit once both halves are in: a reduced position and (for shots) a lie. */
  function maybeCommit() {
    if (!capture?.reduced) return;
    if (capture.kind === 'shot' && !capture.lieConfirmed) return;
    commit();
  }

  function commit() {
    const { kind, chosenLie, reduced } = capture;
    capture = null;

    if (!reduced) {
      markWarning = {
        kind: 'bad',
        text: 'No GPS fix arrived — nothing was saved. Wait for the accuracy reading, or hand-enter the hole.',
        action: 'Dismiss',
      };
      paint();
      return;
    }

    const hl = hole();

    if (kind === 'cup') {
      setCup(hl, reduced);
      const { warning } = learnCup(ctx.app, round, hl.number, hl.cup);
      ctx.persistRound();
      if (warning) markWarning = { kind: 'bad', text: warning, action: 'OK' };
      else if (reduced.quality === 'poor') markWarning = poorMarkWarning('cup');
      else markWarning = null;
      paint();
      return;
    }

    const shot = addShot(hl, { lie: chosenLie, reduced });

    if (chosenLie === 'tee' && shot.seq === 1) {
      learnTee(ctx.app, round, hl.number, shot.mark);
      if (round.currentHoleIndex === 0) checkStartingNine(shot);
    }
    // A ball resting on the green is a free sample of where that green is.
    if (chosenLie === 'green') learnGreen(ctx.app, round, hl.number, shot.mark);

    ctx.persistRound();
    markWarning = reduced.quality === 'poor' ? poorMarkWarning('shot') : null;
    paint();
  }

  /**
   * The entire green workflow, done off the green.
   *
   * Nothing is tapped between reaching the putting surface and walking to the
   * next tee. What goes in here is the distance to the hole facing each putt —
   * paced, because a stride is better instrumentation for a putt than any
   * consumer GPS will ever be.
   */
  function openGreenEntry(hl, { thenAdvance = false } = {}) {
    const s = ctx.app.settings;
    const draft = {
      // Two is the modal outcome, so it is the default. It is deliberately NOT
      // inferred from the marked ball on the green — that mark is the approach
      // coming to rest, not evidence of a one-putt.
      putts: hl.greenEntry?.putts ?? 2,
      unit: hl.greenEntry?.unit ?? s.puttUnit,
      paceFeet: s.paceFeet,
      values: [0, 1, 2, 3, 4].map((i) => {
        const shot = hl.shots.filter((x) => x.lie === 'green')[i];
        return shot?.distanceEntry?.value ?? (shot?.distanceFt != null ? shot.distanceFt : null);
      }),
    };

    const QUICK = {
      paces: [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 30],
      feet: [2, 3, 4, 5, 6, 8, 10, 15, 20, 25, 30, 40],
      yards: [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20],
    };

    sheet(`Hole ${hl.number} — putts`, (done) => {
      const wrap = h('div');

      const toFeet = (v) =>
        v == null ? null : Math.round(PUTT_UNITS[draft.unit].toFeet(v, draft.paceFeet) * 10) / 10;

      const render = () => {
        wrap.replaceChildren();

        wrap.appendChild(
          field(
            'Putts',
            segmented(
              [0, 1, 2, 3, 4].map((n) => ({ value: n, label: n === 4 ? '4+' : String(n) })),
              draft.putts,
              (v) => {
                draft.putts = v;
                render();
              }
            )
          )
        );

        if (draft.putts === 0) {
          wrap.appendChild(
            h('p', { class: 'note muted', text: 'Holed out from off the green — nothing else to record.' })
          );
        }

        for (let i = 0; i < draft.putts; i++) {
          const label =
            i === 0
              ? 'Putt 1 — to the hole'
              : i === 1
                ? 'Putt 2 — the leave'
                : `Putt ${i + 1} — to the hole`;
          const ft = toFeet(draft.values[i]);

          const readout = h(
            'div',
            { class: 'stat', style: { textAlign: 'center' } },
            h('span', { class: 'v', text: draft.values[i] == null ? '—' : String(draft.values[i]) }),
            h('span', {
              class: 'n',
              text: draft.values[i] == null ? PUTT_UNITS[draft.unit].label : `${ft} ft`,
            })
          );

          const grid = h('div', { class: 'hole-jump' });
          for (const v of QUICK[draft.unit]) {
            grid.appendChild(
              h('button', {
                class: 'seg-btn',
                type: 'button',
                text: String(v),
                'aria-pressed': String(draft.values[i] === v),
                onClick: () => {
                  draft.values[i] = v;
                  render();
                },
              })
            );
          }

          wrap.appendChild(
            field(
              label,
              frag(
                h(
                  'div',
                  { class: 'btn-row', style: { marginBottom: '8px' } },
                  h('button', {
                    class: 'btn',
                    text: '−',
                    onClick: () => {
                      draft.values[i] = Math.max(0, (draft.values[i] ?? 1) - 1);
                      render();
                    },
                  }),
                  readout,
                  h('button', {
                    class: 'btn',
                    text: '+',
                    onClick: () => {
                      draft.values[i] = (draft.values[i] ?? 0) + 1;
                      render();
                    },
                  })
                ),
                grid
              )
            )
          );
        }

        if (draft.putts > 0) {
          wrap.appendChild(
            field(
              'Entered in',
              segmented(
                Object.entries(PUTT_UNITS).map(([k, v]) => ({ value: k, label: v.label.toUpperCase() })),
                draft.unit,
                (v) => {
                  draft.unit = v;
                  render();
                }
              )
            )
          );
          wrap.appendChild(
            h('p', {
              class: 'note muted',
              text: `Distance to the hole before each putt${
                draft.unit === 'paces' ? ` · your pace is set to ${draft.paceFeet} ft` : ''
              }. Leave one blank if you didn't step it off — a missing number is better than a made-up one.`,
            })
          );
        }

        wrap.appendChild(
          h('button', {
            class: 'btn primary',
            text: thenAdvance ? 'SAVE & NEXT HOLE' : 'SAVE',
            onClick: () => {
              setGreenEntry(hl, {
                putts: draft.putts,
                distances: draft.values.slice(0, draft.putts),
                unit: draft.unit,
                paceFeet: draft.paceFeet,
              });
              ctx.app.settings.puttUnit = draft.unit;
              ctx.persistRound();
              ctx.persistApp();
              markWarning = null;
              paint();
              done('saved');
              if (thenAdvance) advanceHole(1, { force: true });
            },
          })
        );
      };

      render();
      return wrap;
    });
  }

  function poorMarkWarning(what) {
    return {
      kind: 'bad',
      text: `That ${what} was marked with poor accuracy. Re-mark it while standing in the same spot.`,
      action: 'RE-MARK',
      onAction: () => {
        const hl = hole();
        undoLast(hl);
        ctx.persistRound();
        paint();
        beginCapture(what === 'cup' ? 'cup' : 'shot');
      },
    };
  }

  /**
   * The toggle is authoritative; this only ever asks. Silently reassigning
   * eighteen holes because of one GPS fix is exactly the kind of "helpful"
   * behaviour that ruins a dataset.
   */
  function checkStartingNine(shot) {
    const course = getCourse(ctx.app, round.courseId);
    if (!course) return;
    const verdict = detectStartingNine(ctx.app, course, round.teeSet, shot.mark);
    if (!verdict || verdict.nine === round.startingNine) return;

    sheet('Starting nine', (done) =>
      frag(
        h('p', {
          class: 'note',
          text: `This round is set to start on the ${round.startingNine} nine, but your tee mark is ${Math.round(
            verdict.nine === 'back' ? verdict.dBackM : verdict.dFrontM
          )} m from the ${verdict.nine === 'back' ? '10th' : '1st'} tee and ${Math.round(
            verdict.nine === 'back' ? verdict.dFrontM : verdict.dBackM
          )} m from the other. Switch?`,
        }),
        h('button', {
          class: 'btn primary',
          text: `SWITCH TO ${verdict.nine.toUpperCase()} NINE`,
          onClick: () => {
            applyStartingNine(course, verdict.nine);
            done(true);
          },
        }),
        h('button', { class: 'btn', text: 'Keep as set', onClick: () => done(false) })
      )
    );
  }

  /** Safe only on the first tee shot, when no other hole holds data yet. */
  function applyStartingNine(course, nine) {
    const firstShot = round.holes[0].shots[0];
    const ordered = playOrder(course, nine, round.holes.length);
    round.holes = ordered.map((src, i) => ({
      ...round.holes[i],
      number: src.number,
      playOrder: i,
      par: src.par,
      hcp: src.hcp,
      yards: holeYards(src, round.teeSet),
      shots: [],
      cup: null,
      manual: null,
      completedAt: null,
    }));
    round.holes[0].shots = [firstShot];
    round.startingNine = nine;
    ctx.app.settings.startingNine = nine;
    ctx.persistRound();
    paint();
    toast(`Switched to the ${nine} nine.`);
  }

  /* ------------------------------------------------------------- actions */

  function paintActions(hl) {
    if (isHoleComplete(hl)) {
      footer.appendChild(
        h('button', {
          class: 'btn primary huge',
          text: isLastHole() ? 'FINISH ROUND' : 'NEXT HOLE ›',
          onClick: () => (isLastHole() ? finishRound() : advanceHole(1)),
        })
      );
      footer.appendChild(
        h(
          'div',
          { class: 'btn-row' },
          !hl.manual
            ? h('button', { class: 'btn sm', text: 'EDIT PUTTS', onClick: () => openGreenEntry(hl) })
            : null,
          h('button', { class: 'btn sm', text: 'UNDO', onClick: doUndo }),
          h('button', { class: 'btn sm', text: 'Hole ‹', onClick: () => advanceHole(-1) })
        )
      );
      return;
    }

    footer.appendChild(
      h('button', {
        class: 'btn primary huge',
        text: 'MARK SHOT',
        disabled: Boolean(hl.manual),
        onClick: () => beginCapture('shot'),
      })
    );
    // Finishes the hole. Tapped on the next tee, not on the green.
    footer.appendChild(
      h('button', {
        class: 'btn',
        text: 'ENTER PUTTS ▸',
        disabled: Boolean(hl.manual),
        onClick: () => openGreenEntry(hl),
      })
    );
    footer.appendChild(
      h(
        'div',
        { class: 'btn-row' },
        h('button', { class: 'btn sm', text: 'PENALTY', disabled: !hl.shots.length, onClick: openPenalty }),
        h('button', { class: 'btn sm', text: 'UNDO', onClick: doUndo }),
        h('button', { class: 'btn sm', text: 'Hole ›', onClick: () => advanceHole(1) })
      )
    );
  }

  function doUndo() {
    const hl = hole();
    const token = undoLast(hl);
    if (!token) return toast('Nothing to undo on this hole.');
    ctx.persistRound();
    markWarning = null;
    paint();
    toast(`Removed ${token.kind === 'cup' ? 'cup mark' : token.kind === 'manual' ? 'hand entry' : 'last shot'}.`, {
      action: 'RESTORE',
      onAction: () => {
        restoreUndo(hl, token);
        ctx.persistRound();
        paint();
      },
    });
  }

  function advanceHole(delta, { force = false } = {}) {
    const next = round.currentHoleIndex + delta;
    if (next < 0 || next >= round.holes.length) return;

    // Matt's workflow is to log the green on the next tee, so leaving a hole
    // with shots but no putts is the moment to ask — not a nag, a catch.
    const hl = hole();
    if (!force && delta > 0 && hl.shots.length && !isHoleComplete(hl) && ctx.app.settings.promptGreenEntry) {
      openGreenEntry(hl, { thenAdvance: true });
      return;
    }

    round.currentHoleIndex = next;
    markWarning = null;
    ctx.persistRound();
    paint();
  }

  /* -------------------------------------------------------------- sheets */

  function openPenalty() {
    const hl = hole();
    const shot = hl.shots[hl.shots.length - 1];
    sheet('Penalty', (done) =>
      frag(
        h('p', { class: 'note', text: `Attach to shot ${shot.seq} (${LIE_LABELS[shot.lie]}).` }),
        ...Object.entries(PENALTY_TYPES).map(([key, def]) =>
          h('button', {
            class: 'btn',
            text: `${def.label.toUpperCase()}  +1`,
            onClick: () => {
              attachPenalty(shot, { type: key, strokes: 1 });
              ctx.persistRound();
              paint();
              done(key);
              toast('Penalty added. Mark your next shot from the drop.');
            },
          })
        ),
        shot.penalty
          ? h('button', {
              class: 'btn danger',
              text: 'REMOVE PENALTY',
              onClick: () => {
                shot.penalty = null;
                ctx.persistRound();
                paint();
                done('removed');
              },
            })
          : null
      )
    );
  }

  function openShotEditor(hl, shot, index) {
    sheet(`Shot ${index + 1}`, (done) =>
      frag(
        field(
          'Lie',
          segmented(
            LIES.map((l) => ({ value: l, label: LIE_LABELS[l] })),
            shot.lie,
            (v) => {
              shot.lie = v;
              ctx.persistRound();
              paint();
              done('lie');
            },
            { columns: 3 }
          )
        ),
        shot.lie === 'green'
          ? h('button', {
              class: 'btn',
              text: 'Edit this hole’s putts',
              onClick: () => {
                done('putts');
                openGreenEntry(hl);
              },
            })
          : h('button', {
              class: 'btn',
              text:
                shot.distanceFt != null
                  ? `Distance to hole: ${Math.round(shot.distanceFt / 3)} yd (entered)`
                  : 'Enter distance to hole',
              onClick: () => {
                done('distance');
                openShotDistance(hl, shot);
              },
            }),
        shot.mark
          ? h('p', {
              class: 'note muted',
              text: `±${shot.mark.accuracyM} m · ${shot.mark.usedCount}/${shot.mark.sampleCount} fixes used · spread ${shot.mark.spreadM} m · ${new Date(shot.mark.ts).toLocaleTimeString()}`,
            })
          : h('p', { class: 'note muted', text: 'Hand-entered — no GPS mark.' }),
        h('button', {
          class: 'btn danger',
          text: 'DELETE SHOT',
          onClick: () => {
            removeShot(hl, shot.id);
            ctx.persistRound();
            paint();
            done('deleted');
          },
        })
      )
    );
  }

  /**
   * Manual distance-to-hole for a full shot. Only needed when GPS lost a mark —
   * without this, a shot with no position contributes nothing to strokes
   * gained, and a yardage off a sprinkler head is far better than nothing.
   */
  function openShotDistance(hl, shot) {
    sheet(`Shot ${shot.seq} — distance to hole`, (done) => {
      let value = shot.distanceFt != null ? Math.round(shot.distanceFt / 3) : '';
      return frag(
        h('p', {
          class: 'note muted',
          text: 'In yards, from a sprinkler head or a marker. Overrides the computed distance for this shot.',
        }),
        field(
          'Yards',
          h('input', {
            type: 'number',
            inputmode: 'numeric',
            min: '0',
            placeholder: 'e.g. 148',
            value: String(value),
            onInput: (e) => {
              value = e.target.value;
            },
          })
        ),
        h('button', {
          class: 'btn primary',
          text: 'SAVE',
          onClick: () => {
            setShotDistance(shot, { value, unit: 'yards' });
            ctx.persistRound();
            paint();
            done('saved');
          },
        }),
        shot.distanceFt != null
          ? h('button', {
              class: 'btn sm',
              text: 'Clear — go back to the measured distance',
              onClick: () => {
                setShotDistance(shot, { value: null });
                ctx.persistRound();
                paint();
                done('cleared');
              },
            })
          : null
      );
    });
  }

  function openHoleJump() {
    sheet('Jump to hole', (done) => {
      const grid = h('div', { class: 'hole-jump' });
      round.holes.forEach((hl, i) => {
        grid.appendChild(
          h('button', {
            class: 'seg-btn',
            type: 'button',
            text: String(hl.number),
            'aria-pressed': String(i === round.currentHoleIndex),
            dataset: { done: String(isHoleComplete(hl)) },
            onClick: () => {
              round.currentHoleIndex = i;
              ctx.persistRound();
              markWarning = null;
              paint();
              done(i);
            },
          })
        );
      });
      return grid;
    });
  }

  function openMenu() {
    sheet('Round', (done) =>
      frag(
        // Optional refinement: exact distances for this hole, and one more
        // sample for the accumulated green position. Not needed to finish.
        h('button', {
          class: 'btn',
          text: 'Mark cup (optional — exact distances)',
          disabled: !hole().shots.length,
          onClick: () => {
            done('cup');
            beginCapture('cup');
          },
        }),
        h('button', {
          class: 'btn',
          text: 'Hand-enter this hole',
          onClick: () => {
            done('manual');
            openManualEntry();
          },
        }),
        h('button', {
          class: 'btn',
          text: 'Round card so far',
          onClick: () => {
            done('summary');
            ctx.go('summary', { roundId: round.id, live: true });
          },
        }),
        h('button', {
          class: 'btn',
          text: 'Settings',
          onClick: () => {
            done('settings');
            ctx.go('settings');
          },
        }),
        h('button', {
          class: 'btn danger',
          text: 'Finish round',
          onClick: () => {
            done('finish');
            finishRound();
          },
        }),
        h('button', {
          class: 'btn danger',
          text: 'Abandon round',
          onClick: async () => {
            done('abandon');
            const ok = await confirmSheet(
              'Abandon round?',
              'The round stays in History with everything marked so far, but it will not count as played.',
              { confirmLabel: 'ABANDON', danger: true }
            );
            if (!ok) return;
            round.status = 'abandoned';
            round.completedAt = new Date().toISOString();
            ctx.app.activeRoundId = null;
            ctx.persistRound();
            ctx.round = null;
            ctx.stopGps();
            ctx.go('home');
          },
        })
      )
    );
  }

  function openManualEntry() {
    const hl = hole();
    const draft = {
      // Hand entry usually happens when finishing a hole GPS couldn't follow,
      // so start from par rather than from however many marks got made.
      strokes: Math.max(holeStrokes(hl) ?? 0, hl.par),
      putts: holePutts(hl) || 2,
      firstPuttFt: '',
      penalties: penaltyStrokes(hl),
    };
    sheet(`Hole ${hl.number} — hand entry`, (done) => {
      const num = (label, key, min, max) =>
        field(
          label,
          h(
            'div',
            { class: 'btn-row' },
            h('button', {
              class: 'btn',
              text: '−',
              onClick: (e) => {
                draft[key] = Math.max(min, draft[key] - 1);
                e.target.parentElement.querySelector('.v').textContent = String(draft[key]);
              },
            }),
            h('div', { class: 'stat', style: { textAlign: 'center' } }, h('span', { class: 'v', text: String(draft[key]) })),
            h('button', {
              class: 'btn',
              text: '+',
              onClick: (e) => {
                draft[key] = Math.min(max, draft[key] + 1);
                e.target.parentElement.querySelector('.v').textContent = String(draft[key]);
              },
            })
          )
        );

      return frag(
        h('p', {
          class: 'note muted',
          text: hl.shots.length
            ? `Hand-entered holes are flagged in every export and excluded from shot-level analysis. The ${
                hl.shots.length === 1 ? 'GPS mark already on this hole is' : `${hl.shots.length} GPS marks already on this hole are`
              } kept, not deleted — UNDO puts them back in charge.`
            : 'Hand-entered holes are flagged in every export and excluded from shot-level analysis. Use this only when GPS was unusable.',
        }),
        num('Strokes', 'strokes', 1, 20),
        num('Putts', 'putts', 0, 10),
        num('Penalty strokes', 'penalties', 0, 6),
        field(
          'First putt distance (ft, optional)',
          h('input', {
            type: 'number',
            inputmode: 'numeric',
            min: '0',
            placeholder: 'e.g. 22',
            onInput: (e) => {
              draft.firstPuttFt = e.target.value;
            },
          })
        ),
        h('button', {
          class: 'btn primary',
          text: 'SAVE HOLE',
          onClick: () => {
            // Deliberately non-destructive: the hand entry overrides every
            // derivation, but the GPS marks stay on disk. Deleting data that
            // cannot be re-collected to save a few bytes is never the trade.
            setManualHole(hl, {
              strokes: draft.strokes,
              putts: draft.putts,
              penalties: draft.penalties,
              firstPuttFt: draft.firstPuttFt === '' ? null : Number(draft.firstPuttFt),
            });
            ctx.persistRound();
            paint();
            done('saved');
          },
        })
      );
    });
  }

  async function finishRound() {
    const t = roundTotals(round);
    const remaining = round.holes.length - t.holes;
    if (remaining > 0) {
      const ok = await confirmSheet(
        'Finish round?',
        `${remaining} hole${remaining === 1 ? '' : 's'} ${remaining === 1 ? 'has' : 'have'} no score yet. They will be left blank and excluded from every stat.`,
        { confirmLabel: 'FINISH' }
      );
      if (!ok) return;
    }
    round.status = 'completed';
    round.completedAt = new Date().toISOString();
    ctx.app.activeRoundId = null;
    ctx.persistRound();
    const id = round.id;
    ctx.round = null;
    ctx.stopGps();
    ctx.go('summary', { roundId: id });
  }

  paint();
  return { el, tick };
}
