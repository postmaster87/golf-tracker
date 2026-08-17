import { h, card, sheet, confirmSheet, segmented, field, toast, frag } from './dom.js';
import * as pocketLock from './lock.js';
import { loadRound } from '../data/store.js';
import { SELECTABLE_CLUBS, clubLabel, clubFull } from '../data/clubs.js';
import { LIES, LIE_LABELS, PENALTY_TYPES } from '../data/schema.js';
import { getCourse, playOrder, holeYards } from '../data/courses.js';
import { distanceM, toFeet } from '../util/geo.js';
import {
  currentHole,
  addShot,
  setCup,
  undoLast,
  restoreUndo,
  removeShot,
  attachPenalty,
  setManualHole,
  setLaseredYards,
  laseredYards,
  laseredCount,
  setShotClub,
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
  const el = h('div', { class: 'screen' });

  /**
   * EDIT MODE
   *
   * The same screen drives a live round and a finished one. That is deliberate:
   * "fix hole 14 three weeks later" and "go back to hole 14 right now" are the
   * same operation on the same data, and building them twice would mean two
   * chances to get stored data wrong.
   *
   * In edit mode there is no GPS capture — you are not standing on the course —
   * so everything is entered by hand, and the round being edited is saved
   * directly rather than through the active-round path.
   */
  const editingId = ctx.params.roundId && ctx.params.roundId !== ctx.round?.id ? ctx.params.roundId : null;
  const round = editingId ? loadRound(editingId) : ctx.round;
  const editing = Boolean(editingId);

  if (!round) {
    queueMicrotask(() => ctx.go('home'));
    return { el };
  }

  /** @type {null | {kind:string, chosenLie:string|null, lieConfirmed:boolean, reduced:any, controller:AbortController, progress:any}} */
  let capture = null;
  let markWarning = null;
  /** Set whenever the hole changes, so the change is always one tap from undo. */
  let holeChange = null;
  /** Set when a cup capture was started from inside the putt sheet. */
  let reopenPuttsAfterCup = false;

  const hole = () => currentHole(round);
  const isLastHole = () => round.currentHoleIndex >= round.holes.length - 1;

  /**
   * Whether to show scoring and distances while the round is being played.
   *
   * Knowing you are three over on the seventh changes how the eighth gets
   * played, and in a practice round that is noise — the point is the swing, not
   * the number. In a tournament it is information you need. Editing a finished
   * round always shows everything, since there is nothing left to influence.
   */
  const showScoring = () => {
    if (editing) return true;
    const mode = ctx.app.settings.showScoring ?? 'tournament';
    if (mode === 'always') return true;
    if (mode === 'never') return false;
    return round.type === 'tournament';
  };

  /** Save whichever round this screen is driving. */
  const persist = () => {
    if (editing) ctx.persistRound(round);
    else ctx.persistRound();
  };

  /* --------------------------------------------------------------- chrome */

  const accChip = h('div', { class: 'acc-chip', dataset: { q: 'none' } });
  /*
   * Proof the dense track is actually recording, on screen, during the round.
   * Rev 2's whole premise is that the phone records while it is in a pocket; if
   * that write is failing there is no other way to find out until the round is
   * over and the summary says "Track: none recorded".
   */
  const trackChip = h('div', { class: 'acc-chip', dataset: { q: 'none' } });
  const hudMeta = h('span', { class: 'hud-meta' });
  const navRow = h('nav', { class: 'holenav' });

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
      h('div', { class: 'hud-hole' }, hudMeta),
      editing
        ? h('button', { class: 'icon-btn', text: 'DONE', onClick: () => ctx.go('summary', { roundId: round.id, from: 'history' }) })
        : frag(
            // Replaces the habit of hitting the phone's hardware lock: same one
            // tap, but GPS keeps tracking and the round stays live underneath.
            h('button', {
              class: 'icon-btn',
              text: '🔒',
              'aria-label': 'Lock screen for pocket',
              onClick: () => pocketLock.lock(),
            }),
            accChip,
            trackChip
          )
    )
  );

  /*
   * Hole navigation is its own row, present in EVERY state.
   *
   * This is the fix for the round-1 failure. Previously the back control only
   * appeared once a hole was complete, so a stray touch that advanced you onto
   * an unfinished hole left forward as the only direction — the golfer was
   * structurally trapped. Navigation must never depend on the state of the hole
   * you happen to be standing on.
   */
  el.appendChild(navRow);

  const body = h('div', { class: 'body' });
  const footer = h('div', { class: 'footer' });
  el.appendChild(body);
  el.appendChild(footer);

  function paintNav() {
    const i = round.currentHoleIndex;
    const prev = round.holes[i - 1];
    const next = round.holes[i + 1];
    navRow.replaceChildren(
      h('button', {
        class: 'holenav-arrow',
        text: prev ? `‹ ${prev.number}` : '‹',
        disabled: !prev,
        'aria-label': 'Previous hole',
        onClick: () => goToHole(i - 1),
      }),
      h('button', {
        class: 'holenav-current',
        'aria-label': 'Jump to any hole',
        onClick: openHoleJump,
        html: `HOLE <strong>${hole().number}</strong> <span class="holenav-caret">▾</span>`,
      }),
      h('button', {
        class: 'holenav-arrow',
        text: next ? `${next.number} ›` : '›',
        disabled: !next,
        'aria-label': 'Next hole',
        onClick: () => goToHole(i + 1),
      })
    );
  }

  /* ------------------------------------------------------------ live bits */

  /**
   * Fixes committed to IndexedDB — not merely seen.
   *
   * `buffered` counts what the writer accepted, `written` counts what actually
   * landed. Showing the former would read as healthy during exactly the failure
   * this chip exists to catch, because pushing into an in-memory buffer cannot
   * fail. Nothing is durable until the first flush, 30 fixes or 15 s in, so the
   * pre-flush state is shown as pending rather than as a count.
   */
  function paintTrackChip() {
    const s = ctx.trackStats?.();
    if (!s) {
      trackChip.dataset.q = 'none';
      trackChip.replaceChildren(h('small', { text: 'track' }), document.createTextNode('—'));
      return;
    }
    if (s.failures > 0) {
      trackChip.dataset.q = 'poor';
      trackChip.replaceChildren(h('small', { text: 'track' }), document.createTextNode('FAIL'));
      return;
    }
    trackChip.dataset.q = s.written > 0 ? 'good' : 'degraded';
    trackChip.replaceChildren(
      h('small', { text: 'track' }),
      document.createTextNode(s.written > 0 ? String(s.written) : `${s.inBuffer}…`)
    );
  }

  /*
   * The track chip drives itself rather than riding `tick()`.
   *
   * `tick()` is called from the GPS subscription in app.js, and on 2026-08-16 it
   * was found not to be firing on this screen at all — the accuracy chip beside
   * this one sits frozen on a stale reading (verified in the simulator: forcing
   * accuracy 3 → 9 changed nothing on screen). That is a separate bug and is not
   * fixed here. But this indicator exists precisely to be trusted mid-round, and
   * an indicator that silently stops updating is worse than no indicator, so it
   * does not depend on that path. Self-cancels once the screen is gone.
   */
  const trackTimer = setInterval(() => {
    if (!document.contains(el)) return clearInterval(trackTimer);
    paintTrackChip();
  }, 2000);

  function tick() {
    paintTrackChip();
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
    // The nav row directly below already shows which hole this is, so the
    // "n/18" that used to live here was redundant — and it was pushing the
    // stroke index off the end of the line on a phone.
    hudMeta.textContent = `${editing ? 'EDITING · ' : ''}Par ${hl.par}${
      hl.yards ? ` · ${hl.yards} yd` : ''
    }${hl.hcp ? ` · HCP ${hl.hcp}` : ''}`;

    body.replaceChildren();
    footer.replaceChildren();
    paintNav();
    if (!editing) tick();

    /*
     * Every hole change is one tap from being reversed, however it happened —
     * a deliberate NEXT HOLE, an arrow, a jump, or a phantom touch. On round 1
     * an accidental advance made the rest of the round unloggable; now the way
     * back is on screen the moment it occurs.
     */
    if (holeChange) {
      body.appendChild(
        banner(
          'warn',
          `Moved to hole ${holeChange.to}.`,
          `← BACK TO ${holeChange.from}`,
          () => {
            const idx = round.holes.findIndex((x) => x.number === holeChange.from);
            holeChange = null;
            if (idx >= 0) goToHole(idx, { silent: true });
          }
        )
      );
    }

    if (editing) {
      body.appendChild(
        h('p', {
          class: 'note muted',
          text: 'Editing a saved round. Every hole can be changed or hand-entered, and strokes gained recomputes from whatever you leave here.',
        })
      );
    }

    if (!editing && ctx.gps.error?.code === 1) {
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


    if (showScoring()) body.appendChild(tally(hl));
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
            s.club && s.club !== 'putter'
              ? h('span', { class: 'club-tag', text: clubLabel(s.club) })
              : null,
            s.penalty ? h('span', { class: 'flag', text: `+${s.penalty.strokes} ${s.penalty.type}` }) : null,
            s.mark?.quality === 'poor' ? h('span', { class: 'flag', text: 'poor fix' }) : null,
            // Distances are part of "statistics" — hidden mid-practice-round
            // for the same reason as the score. The mark is still recorded and
            // shows in full on the round card afterwards.
            showScoring()
              ? h(
                  'span',
                  { class: 'dist' },
                  primary,
                  h('small', { text: g.toHoleM != null ? `to hole${secondary ? ` · ${secondary}` : ''}` : secondary })
                )
              : h('span', { class: 'dist' }, h('small', { text: s.mark ? 'marked' : 'entered' }))
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
            // Not "holed out" — the cup is marked before putting now, so it
            // records where the hole is, not that the ball went in it.
            h('span', { class: 'dist' }, `±${hl.cup.accuracyM} m`, h('small', { text: 'hole marked' }))
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
        h({ shot: 'span', putt: 'span', cup: 'span' }[capture.kind] ?? 'span', {
          text: isShot ? 'Marking shot' : capture.kind === 'putt' ? 'Marking putt' : 'Marking cup',
        }),
        h('span', { class: 'val cap-meta', text: 'Capturing…' })
      )
    );
    wrap.appendChild(h('div', { class: 'cap-bar' }, h('span')));

    /*
     * Club sits in the same panel as the lie rather than behind a dropdown.
     * A native select costs tap-open, scroll, tap-select with a glove on; a
     * grid costs one tap and never covers the burst progress. Club is
     * optional — tapping a lie commits with whatever is selected, including
     * nothing, so the extra step can always be skipped mid-round.
     */
    if (isShot && ctx.app.settings.trackClubs) {
      const clubGrid = h('div', { class: 'club-grid' });
      for (const c of SELECTABLE_CLUBS) {
        clubGrid.appendChild(
          h('button', {
            class: 'seg-btn club-chip',
            type: 'button',
            text: c.label,
            'aria-label': c.full,
            'aria-pressed': String(capture.club === c.id),
            onClick: () => {
              // Tapping the selected club again clears it, so a mis-tap does
              // not force a wrong club into the data.
              capture.club = capture.club === c.id ? null : c.id;
              paint();
            },
          })
        );
      }
      wrap.appendChild(
        h(
          'div',
          { class: 'field-optional' },
          h('div', {
            class: 'cap-label',
            text: capture.club ? `Club · ${clubFull(capture.club)}` : 'Club — optional',
          }),
          clubGrid
        )
      );
    }

    if (isShot && capture.firstShot) {
      // Nothing to choose — say what is being saved and let the burst finish.
      wrap.appendChild(
        h(
          'div',
          { class: 'field-settled' },
          h('span', { class: 'settled-tick', text: '✓' }),
          h('span', { text: 'Tee shot — saving when the fix settles' })
        )
      );
    }

    if (isShot && !capture.firstShot) {
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
      /*
       * The required field, boxed and labelled as such. The label says what the
       * tap actually DOES rather than naming the field, because tapping a lie
       * is what saves the shot — that was not obvious from "Select the lie".
       */
      wrap.appendChild(
        h(
          'div',
          { class: 'field-required' },
          h('div', { class: 'req-label' }, h('span', { class: 'req-dot' }), 'Lie — tap one to save the shot'),
          grid
        )
      );
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
    /*
     * The first shot of a hole is from the tee by definition, so the app knows
     * the lie without being told and commits as soon as the burst completes.
     * One tap for a tee shot.
     *
     * For every later shot nothing is pre-selected: a highlighted default reads
     * as already-chosen while still requiring the tap, which is the app
     * promising one thing and demanding another.
     */
    const firstShot = kind === 'shot' && hole().shots.length === 0;

    capture = {
      kind,
      firstShot,
      chosenLie: kind === 'shot' ? (firstShot ? 'tee' : null) : 'green',
      lieConfirmed: kind !== 'shot' || firstShot,
      club: null,
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
    const { kind, chosenLie, reduced, club } = capture;
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
      persist();
      if (warning) markWarning = { kind: 'bad', text: warning, action: 'OK' };
      else if (reduced.quality === 'poor') markWarning = poorMarkWarning('cup');
      else markWarning = null;
      paint();
      /*
       * Back to the sheet, however the cup was reached — from inside it, or
       * from the footer. Nothing should ever have to be tapped to bring the
       * putting menu back once the ball is on the green.
       */
      reopenPuttsAfterCup = false;
      if (!hl.manual && hl.shots.some((s) => s.lie === 'green')) openGreenEntry(hl);
      return;
    }

    const shot = addShot(hl, { lie: chosenLie, reduced, club });

    if (chosenLie === 'tee' && shot.seq === 1) {
      learnTee(ctx.app, round, hl.number, shot.mark);
      if (round.currentHoleIndex === 0) checkStartingNine(shot);
    }
    // A ball resting on the green is a free sample of where that green is.
    if (chosenLie === 'green') learnGreen(ctx.app, round, hl.number, shot.mark);

    persist();
    markWarning = reduced.quality === 'poor' ? poorMarkWarning('shot') : null;
    paint();

    /*
     * The putt sheet opens itself once the ball is marked on the green, and is
     * the green workspace from there to the next tee — not a form to summon.
     *
     * Matt's routine on every green, without deviation: mark the ball at the
     * coin, walk behind the hole to read the putt, mark the cup while he is
     * back there, putt, pace it off, then fill in the numbers. The sheet
     * carries its own cup control so that whole sequence happens in one place,
     * and it survives the pocket lock — phone away for the putt, phone out
     * again and it is exactly where he left it.
     */
    if (chosenLie === 'green') {
      openGreenEntry(hl);
      // Once a round, on the first hole. Seventeen repetitions of something
      // known by the second hole is how a prompt gets dismissed unread.
      if (!hl.cup && round.currentHoleIndex === 0) {
        toast('Mark the cup from here when you walk behind the hole.', { ms: 8000 });
      }
    }
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
    const draft = {
      // Two is the modal outcome, so it is the default. It is deliberately NOT
      // inferred from the marked ball on the green — that mark is the approach
      // coming to rest, not evidence of a one-putt.
      putts: hl.greenEntry?.putts ?? 2,
      values: [0, 1, 2, 3, 4].map((i) => {
        const shot = hl.shots.filter((x) => x.lie === 'green')[i];
        // Older rounds stored a pace count; the derived feet is the value that
        // still means the same thing now that the sheet only speaks feet.
        return shot?.distanceFt ?? null;
      }),
    };

    /*
     * Feet, dense short and coarse long — because that is how the cost of
     * being wrong is distributed, not because it is how a green is walked.
     *
     * These used to be 3-foot strides, one button per pace. Matt does not pace:
     * "i don't pace putts and lock in". He eyeballs it, which removes the
     * argument for stride-spacing but not the argument for multiples of three —
     * "Golf works in multiples of 3" — so 3s survive past 10 feet.
     *
     * Inside 10 feet it is every foot. That is where the expected-putts curve
     * is steep (one-putt probability passes 50% around 8 ft), so 4 versus 6
     * changes the answer. Past 20 feet the curve is nearly flat and 24 versus
     * 27 is worth a few hundredths, so the spacing opens up.
     */
    const QUICK = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 18, 21, 24, 27, 30, 36, 45, 60];

    sheet(`Hole ${hl.number} — putts`, (done) => {
      const wrap = h('div');

      /*
       * GPS as an alternative to pacing the first putt.
       *
       * Two marks at ±2 m each compound to roughly ±9 ft on the distance
       * between them, so pacing is more accurate at every length. But what
       * costs strokes is the error in EXPECTED PUTTS, and that shrinks as the
       * putt lengthens: ±9 ft is worth about 0.08 strokes from 20 ft and about
       * 0.05 from 60 ft. Meanwhile the pacing effort grows with every foot.
       *
       * So GPS is offered, honestly labelled with its own error bar, and
       * recommended only past the point where walking it off stops being worth
       * the accuracy. No distance is invented: choosing GPS simply leaves the
       * paced value empty, and the existing geometry measures ball-to-cup.
       */
      const ballMark = hl.shots.find((s) => s.lie === 'green' && s.mark)?.mark ?? null;
      const gps =
        ballMark && hl.cup
          ? {
              ft: toFeet(distanceM(ballMark, hl.cup)),
              // Independent errors add in quadrature, not linearly.
              errFt: toFeet(Math.hypot(ballMark.accuracyM ?? 0, hl.cup.accuracyM ?? 0) * Math.SQRT2),
            }
          : null;

      // The grid already moves in strides; the stepper is for nudging a value
      // off a grid number, so it moves a foot at a time.
      const step = 1;

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

          // With no paced value on the first putt, the GPS measurement is what
          // will actually be used — so the readout shows that rather than a
          // dash, and says where the number came from.
          const gpsInUse = i === 0 && draft.values[0] == null && gps;
          const readout = h(
            'div',
            { class: 'stat', style: { textAlign: 'center' } },
            h('span', {
              class: 'v',
              text: gpsInUse ? `${Math.round(gps.ft)}` : draft.values[i] == null ? '—' : String(draft.values[i]),
            }),
            h('span', {
              class: 'n',
              text: gpsInUse ? `ft · GPS ±${Math.round(gps.errFt)}` : 'ft',
            })
          );

          const grid = h('div', { class: 'hole-jump' });
          for (const v of QUICK) {
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

          /*
           * Free entry for anything the grid cannot express.
           *
           * Deliberately does NOT re-render on input — repainting mid-keystroke
           * would steal focus and drop the caret. The readout is patched in
           * place instead, so the value stays visible while typing.
           */
          const typeIn = h('input', {
            type: 'number',
            inputmode: 'numeric',
            min: '0',
            step: '1',
            class: 'putt-typein',
            placeholder: 'Type any distance in feet',
            value:
              draft.values[i] != null && !QUICK.includes(draft.values[i]) ? String(draft.values[i]) : '',
            onInput: (e) => {
              const raw = e.target.value;
              const n = Number(raw);
              draft.values[i] = raw !== '' && Number.isFinite(n) && n >= 0 ? n : null;

              const fieldEl = e.target.closest('.field');
              const val = draft.values[i];
              const gpsNow = i === 0 && val == null && gps;
              const vEl = fieldEl?.querySelector('.stat .v');
              const nEl = fieldEl?.querySelector('.stat .n');
              if (vEl) vEl.textContent = gpsNow ? String(Math.round(gps.ft)) : val == null ? '—' : String(val);
              if (nEl) {
                nEl.textContent = gpsNow ? `ft · GPS ±${Math.round(gps.errFt)}` : 'ft';
              }
              // A typed value means no chip is selected any more.
              for (const b of fieldEl?.querySelectorAll('.hole-jump button') ?? []) {
                b.setAttribute('aria-pressed', String(val === Number(b.textContent)));
              }
            },
          });

          // Only the first putt can be measured — the ball's position is only
          // marked once, before it is struck.
          const gpsControl =
            i !== 0
              ? null
              : gps
                ? h('button', {
                    class: draft.values[0] == null ? 'btn primary sm' : 'btn sm dim',
                    text:
                      draft.values[0] == null
                        ? `USING GPS · ${Math.round(gps.ft)} ft ±${Math.round(gps.errFt)}`
                        : `USE GPS INSTEAD · ${Math.round(gps.ft)} ft`,
                    onClick: () => {
                      draft.values[0] = null;
                      render();
                    },
                  })
                : h('button', {
                    // Primary, not dim: marking the cup from behind the hole is
                    // part of the routine on every green, and it is what makes
                    // every distance on the hole exact rather than approximate.
                    class: 'btn primary',
                    text: 'MARK CUP',
                    disabled: !ballMark,
                    onClick: () => {
                      done('markcup');
                      // Reopens this sheet once the cup is captured.
                      reopenPuttsAfterCup = true;
                      beginCapture('cup');
                    },
                  });

          wrap.appendChild(
            field(
              label,
              frag(
                gpsControl ? h('div', { style: { marginBottom: '8px' } }, gpsControl) : null,
                h(
                  'div',
                  { class: 'btn-row', style: { marginBottom: '8px' } },
                  h('button', {
                    class: 'btn',
                    text: step === 1 ? '−' : `−${step}`,
                    // Repeated fast taps are the interaction here, not a wet-screen
                    // artefact, so this one opts out of the debounce.
                    rapid: true,
                    onClick: () => {
                      draft.values[i] = Math.max(0, (draft.values[i] ?? step) - step);
                      render();
                    },
                  }),
                  readout,
                  h('button', {
                    class: 'btn',
                    text: step === 1 ? '+' : `+${step}`,
                    rapid: true,
                    onClick: () => {
                      draft.values[i] = (draft.values[i] ?? 0) + step;
                      render();
                    },
                  })
                ),
                grid,
                typeIn
              )
            )
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
                unit: 'feet',
              });
              persist();
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
        persist();
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
    persist();
    paint();
    toast(`Switched to the ${nine} nine.`);
  }

  /* ------------------------------------------------------------- actions */

  /**
   * The one thing the app expects next. Exactly one control carries the accent
   * fill at any moment; everything else is dimmed. Round 1 exposed that a wall
   * of equally-weighted buttons gives no clue what to press, especially on the
   * green where the flow changes.
   */
  /**
   * Marks that are a shot being played from somewhere — i.e. not putts. This is
   * what the landing-mark numbering counts, so a hole that has had its putts
   * entered does not suddenly renumber its buttons.
   */
  const strokeMarks = (hl) => hl.shots.filter((s) => s.lie !== 'green');

  function nextAction(hl) {
    if (hl.manual || isHoleComplete(hl)) return 'next';
    // Once the cup is down, the ball is on the green and the only thing left is
    // the putts. Before that the app cannot know he has reached the green —
    // there is no longer a mark that says so — so the landing mark stays lit.
    if (hl.cup) return 'putts';
    return 'mark';
  }

  /**
   * Says what to do in words.
   *
   * The ambiguity that cost a whole round: "MARK SHOT 1" reads equally well as
   * "the spot I am teeing off from" and "where shot 1 finished". Matt, after
   * playing nine holes on it: "Mark shot 1 is the the spot where I am teeing
   * off from or where shot one landed? Do you see the confusion this created".
   *
   * Fixed by naming rather than explaining. The tee shot gets its own button,
   * so there is nothing to interpret, and every button after it names the shot
   * that has already finished — which is the ball he is standing over.
   */
  function nextStepHint(hl) {
    if (hl.manual) return 'Hand-entered hole. Re-enter it from the menu, or move on.';
    if (isHoleComplete(hl)) {
      return isLastHole()
        ? 'Last hole is done — finish the round when ready.'
        : `Hole ${hl.number} is done. Move to hole ${round.holes[round.currentHoleIndex + 1].number}.`;
    }
    if (editing) return 'Editing: hand-enter this hole, or fix individual shots in the list above.';
    const n = strokeMarks(hl).length;
    if (!n) return 'On the tee: MARK TEE SHOT before you hit.';
    if (hl.cup) return 'Cup marked. Putt out, then enter the putts and how long the first one was.';
    return `At your ball: MARK SHOT ${n} LANDING. On the green instead — MARK CUP behind the hole.`;
  }

  function paintActions(hl) {
    const next = nextAction(hl);
    const pri = (kind) => (next === kind ? 'btn primary' : 'btn dim');

    footer.appendChild(h('p', { class: 'hint', text: nextStepHint(hl) }));

    /*
     * Present in EVERY state, including a hole with no shots marked on it.
     * Yardages are entered after holing out, which is both before the hole is
     * complete (nothing logged all hole) and after it (putts entered) — so it
     * cannot live in one branch. It is also the only control that works when
     * the phone never came out of a pocket, which is the intended way to play.
     */
    const yardageBtn = () => {
      const n = laseredCount(hl);
      return h('button', {
        class: pri('yardages'),
        text: n ? `YARDAGES · ${n} ▸` : 'ENTER YARDAGES ▸',
        onClick: () => openYardages(hl),
      });
    };

    if (isHoleComplete(hl)) {
      footer.appendChild(
        h('button', {
          class: `${pri('next')} huge`,
          text: isLastHole()
            ? 'FINISH ROUND'
            : `NEXT HOLE · ${round.holes[round.currentHoleIndex + 1].number} ›`,
          onClick: () => (isLastHole() ? finishRound() : advanceHole(1)),
        })
      );
      footer.appendChild(yardageBtn());
      footer.appendChild(
        h(
          'div',
          { class: 'btn-row' },
          !hl.manual
            ? h('button', { class: 'btn sm dim', text: 'EDIT PUTTS', onClick: () => openGreenEntry(hl) })
            : null,
          h('button', { class: 'btn sm dim', text: 'UNDO', onClick: doUndo })
        )
      );
      return;
    }

    if (editing) {
      // No GPS off the course, so hand entry is the primary path here.
      footer.appendChild(
        h('button', {
          class: 'btn primary huge',
          text: 'HAND-ENTER THIS HOLE',
          onClick: openManualEntry,
        })
      );
    } else {
      const n = strokeMarks(hl).length;
      footer.appendChild(
        h('button', {
          class: `${pri('mark')} huge`,
          // The tee shot is named, not numbered. Every later mark names the shot
          // that just finished — you are standing on where it landed.
          text: n === 0 ? 'MARK TEE SHOT' : `MARK SHOT ${n} LANDING`,
          disabled: Boolean(hl.manual),
          onClick: () => beginCapture('shot'),
        })
      );
    }

    // Promoted out of the round menu: the cup mark is what makes every distance
    // on the hole exact rather than approximate, so it belongs in the flow.
    footer.appendChild(
      h('button', {
        class: pri('cup'),
        text: hl.cup ? 'RE-MARK CUP' : 'MARK CUP',
        disabled: Boolean(hl.manual) || !hl.shots.length,
        onClick: () => beginCapture('cup'),
      })
    );
    footer.appendChild(
      h('button', {
        class: pri('putts'),
        text: 'ENTER PUTTS ▸',
        disabled: Boolean(hl.manual),
        onClick: () => openGreenEntry(hl),
      })
    );
    footer.appendChild(yardageBtn());
    footer.appendChild(
      h(
        'div',
        { class: 'btn-row' },
        h('button', { class: 'btn sm dim', text: 'PENALTY', disabled: !hl.shots.length, onClick: openPenalty }),
        h('button', { class: 'btn sm dim', text: 'UNDO', onClick: doUndo })
      )
    );
  }

  function doUndo() {
    const hl = hole();
    const token = undoLast(hl);
    if (!token) return toast('Nothing to undo on this hole.');
    persist();
    markWarning = null;
    paint();
    toast(`Removed ${token.kind === 'cup' ? 'cup mark' : token.kind === 'manual' ? 'hand entry' : 'last shot'}.`, {
      action: 'RESTORE',
      onAction: () => {
        restoreUndo(hl, token);
        persist();
        paint();
      },
    });
  }

  /**
   * Move to any hole, from any state.
   *
   * `silent` suppresses the undo banner — used when the move IS the undo, so
   * pressing "back to 14" does not immediately offer to send you to 15 again.
   */
  function goToHole(index, { silent = false, force = false } = {}) {
    if (index < 0 || index >= round.holes.length || index === round.currentHoleIndex) return;
    const from = hole();

    // The green-entry nudge fires only when stepping forward off an unfinished
    // hole — never when going back, and never when jumping. Matt's workflow is
    // to log the green on the next tee, so this is a catch, not a nag.
    if (
      !force &&
      !silent &&
      index === round.currentHoleIndex + 1 &&
      from.shots.length &&
      !isHoleComplete(from) &&
      ctx.app.settings.promptGreenEntry
    ) {
      openGreenEntry(from, { thenAdvance: true });
      return;
    }

    round.currentHoleIndex = index;
    markWarning = null;
    holeChange = silent ? null : { from: from.number, to: round.holes[index].number };
    clearTimeout(holeChangeTimer);
    if (holeChange) {
      holeChangeTimer = setTimeout(() => {
        holeChange = null;
        paint();
      }, 20000);
    }
    persist();
    paint();
  }

  let holeChangeTimer = null;

  const advanceHole = (delta, opts) => goToHole(round.currentHoleIndex + delta, opts);

  /* -------------------------------------------------------------- sheets */

  /**
   * Lasered yardages, entered after the hole.
   *
   * Deliberately independent of shot records. Under the continuous-track model
   * the phone stays in a pocket and nothing gets marked during the hole, so
   * this has to work with `hl.shots` empty — which is the normal case, not the
   * degraded one.
   *
   * A blank row is left blank on purpose. Inside 60 yards Matt plays by feel
   * and does not range it, so "shot happened, not lasered" has to be sayable;
   * the alternative is him inventing a number, which is worse than no number
   * when the whole point of these is to be ground truth.
   */
  function openYardages(hl) {
    const draft = [...laseredYards(hl)];
    // Enough rows for a par-4 gone wrong, without making him tap ADD on a par 3.
    while (draft.length < Math.max(4, hl.par + 1)) draft.push(null);

    sheet(`Hole ${hl.number} — yardages`, (done) => {
      const rows = h('div');
      const paintRows = () => {
        rows.replaceChildren(
          ...draft.map((v, i) =>
            field(
              `Shot ${i + 1}`,
              h('input', {
                type: 'number',
                inputmode: 'numeric',
                min: '1',
                max: '700',
                // The card yardage is the obvious first-shot value, so show it
                // as a placeholder — visible, but never entered on his behalf.
                placeholder: i === 0 && hl.yards ? `${hl.yards}` : '— not lasered',
                value: v == null ? '' : String(v),
                onInput: (e) => {
                  const n = Number(e.target.value);
                  draft[i] = Number.isFinite(n) && n > 0 ? n : null;
                },
              })
            )
          )
        );
      };
      paintRows();

      return frag(
        h('p', {
          class: 'note muted',
          text: 'Distance to the pin before each shot, in yards, as you lasered it. Leave a row blank if you did not range that one — inside 60 yards the track covers it. These are the ground truth the GPS gets checked against, so an estimate is worth less here than a blank.',
        }),
        rows,
        h('button', {
          class: 'btn sm',
          text: '+ ANOTHER SHOT',
          onClick: () => {
            draft.push(null);
            paintRows();
          },
        }),
        h('button', {
          class: 'btn primary',
          text: 'SAVE YARDAGES',
          onClick: () => {
            setLaseredYards(hl, draft);
            persist();
            paint();
            done('saved');
            const n = laseredCount(hl);
            toast(
              n
                ? `Hole ${hl.number}: ${n} yardage${n === 1 ? '' : 's'} saved.`
                : `Hole ${hl.number}: yardages cleared.`
            );
          },
        })
      );
    });
  }

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
              persist();
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
                persist();
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
        // Club is editable after the fact for the same reason everything else
        // is: remembering it on the next tee is easier than fumbling for it
        // before the swing.
        shot.lie !== 'green'
          ? field(
              'Club',
              segmented(
                SELECTABLE_CLUBS.map((c) => ({ value: c.id, label: c.label })),
                shot.club ?? null,
                (v) => {
                  setShotClub(shot, shot.club === v ? null : v);
                  persist();
                  paint();
                  done('club');
                },
                { columns: 5 }
              )
            )
          : null,
        field(
          'Lie',
          segmented(
            LIES.map((l) => ({ value: l, label: LIE_LABELS[l] })),
            shot.lie,
            (v) => {
              shot.lie = v;
              persist();
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
          : // Only offered on par 3s. Everywhere else GPS measures the distance
            // to the hole perfectly well, and a hand-entry field for it is
            // clutter on a screen that cannot afford any.
            hl.par === 3
            ? h('button', {
                class: 'btn',
                text:
                  shot.distanceFt != null
                    ? `Distance to hole: ${Math.round(shot.distanceFt / 3)} yd (entered)`
                    : 'Enter distance to hole',
                onClick: () => {
                  done('distance');
                  openShotDistance(hl, shot);
                },
              })
            : null,
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
            persist();
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
            persist();
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
                persist();
                paint();
                done('cleared');
              },
            })
          : null
      );
    });
  }

  function openHoleJump() {
    sheet('Go to hole', (done) => {
      const grid = h('div', { class: 'hole-jump' });
      round.holes.forEach((hl, i) => {
        const strokes = holeStrokes(hl);
        grid.appendChild(
          h(
            'button',
            {
              class: 'seg-btn',
              type: 'button',
              'aria-pressed': String(i === round.currentHoleIndex),
              dataset: { done: String(isHoleComplete(hl)) },
              onClick: () => {
                done(i);
                // Silent: an explicit jump is not something to offer to undo.
                goToHole(i, { silent: true });
              },
            },
            String(hl.number),
            h('span', { class: 'jump-score', text: strokes == null ? '·' : String(strokes) })
          )
        );
      });
      return frag(
        h('p', {
          class: 'note muted',
          text: 'Any hole, any time. Completed holes show their score and stay fully editable.',
        }),
        grid
      );
    });
  }

  function openMenu() {
    sheet('Round', (done) =>
      frag(
        // Adjustable here, mid-hole, rather than buried in Settings — if the
        // auto-lock is firing while you are still entering a shot, you need to
        // fix that now, not after the round.
        field(
          'Auto-lock after',
          segmented(
            [
              { value: 10, label: '10s' },
              { value: 15, label: '15s' },
              { value: 30, label: '30s' },
              { value: 60, label: '60s' },
              { value: 0, label: 'OFF' },
            ],
            ctx.app.settings.autoLockSec ?? 15,
            (v) => {
              ctx.app.settings.autoLockSec = v;
              pocketLock.configure({ idleMs: v * 1000 });
              ctx.persistApp();
              done('autolock');
              openMenu();
            },
            { columns: 5 }
          )
        ),
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
            persist();
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
              rapid: true,
              onClick: (e) => {
                draft[key] = Math.max(min, draft[key] - 1);
                e.target.parentElement.querySelector('.v').textContent = String(draft[key]);
              },
            }),
            h('div', { class: 'stat', style: { textAlign: 'center' } }, h('span', { class: 'v', text: String(draft[key]) })),
            h('button', {
              class: 'btn',
              text: '+',
              rapid: true,
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
          'First putt distance (ft)',
          frag(
            h('input', {
              type: 'number',
              inputmode: 'numeric',
              min: '0',
              placeholder: 'e.g. 22',
              onInput: (e) => {
                draft.firstPuttFt = e.target.value;
              },
            }),
            // Not decoration: without this number the hole cannot produce any
            // putting strokes gained at all, and its strokes land in the
            // "unattributed" pile on the round card. Worth an estimate.
            h('p', {
              class: 'note muted',
              style: { marginTop: '6px' },
              text: 'Leave this blank and the hole contributes nothing to putting strokes gained — an estimate is far better than nothing.',
            })
          )
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
            persist();
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
    persist();
    const id = round.id;
    ctx.round = null;
    ctx.stopGps();
    ctx.go('summary', { roundId: id });
  }

  paint();
  return { el, tick };
}
