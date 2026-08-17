import { h, card, field, segmented, toast, confirmSheet } from './dom.js';
import { THEMES } from '../data/schema.js';
import {
  downloadExport,
  shareExport,
  importExport,
  restoreTracks,
  usageBytes,
  allRoundIds,
} from '../data/store.js';
import { VEENKER } from '../data/courses.js';
import { BASELINES, SOURCE, CATEGORY_DEFINITION } from '../analysis/benchmarks.js';
import * as wakeLock from '../gps/wakelock.js';

const THEME_LABELS = {
  fairway: 'Fairway',
  forest: 'Forest',
  clay: 'Clay',
  paper: 'Paper',
  slate: 'Slate',
  ocean: 'Ocean',
  ink: 'Ink',
  dusk: 'Dusk',
  midnight: 'Midnight',
};

/** One line on what each is actually for, since the swatches only say so much. */
const THEME_NOTES = {
  fairway: 'Soft sage on cream',
  forest: 'Deeper green, not washed out',
  clay: 'Warm taupe and sand',
  paper: 'Sepia, ink-on-paper bite',
  slate: 'Cool neutral grey',
  ocean: 'Saturated teal',
  ink: 'Maximum sunlight legibility',
  dusk: 'Dark, green-tinted',
  midnight: 'Dark, true neutral',
};

export function settingsScreen(ctx) {
  const el = h('div', { class: 'screen' });

  el.appendChild(
    h(
      'header',
      { class: 'topbar' },
      h('button', {
        class: 'icon-btn',
        text: '‹',
        'aria-label': 'Back',
        onClick: () => ctx.go(ctx.round ? 'play' : 'home'),
      }),
      h('h1', { text: 'Settings' })
    )
  );

  const body = h('div', { class: 'body' });
  el.appendChild(body);

  const gpsCard = h('div', { class: 'card' });

  function paint() {
    body.replaceChildren();
    const s = ctx.app.settings;

    /* ------------------------------------------------------------ theme */
    const themeCard = card('Theme');
    const grid = h('div', { class: 'seg', style: { gridAutoFlow: 'row', gridTemplateColumns: '1fr 1fr' } });
    for (const name of THEMES) {
      grid.appendChild(
        h(
          'button',
          {
            class: 'seg-btn',
            type: 'button',
            'aria-pressed': String(s.theme === name),
            style: { flexDirection: 'column', display: 'flex', gap: '6px', justifyContent: 'center' },
            onClick: () => {
              ctx.setTheme(name);
              paint();
            },
          },
          h('span', { text: THEME_LABELS[name] }),
          swatchRow(name),
          h('span', {
            style: { fontSize: '11px', fontWeight: '600', opacity: '0.75', letterSpacing: '0' },
            text: THEME_NOTES[name] ?? '',
          })
        )
      );
    }
    themeCard.appendChild(grid);
    themeCard.appendChild(
      h('p', {
        class: 'note muted',
        style: { marginTop: '8px' },
        text: `All ${THEMES.length} palettes are contrast-checked pair by pair, so none of them trades legibility for looks. Ink is the one to reach for in brutal sun; Dusk and Midnight are the low-light options.`,
      })
    );
    body.appendChild(themeCard);

    /* -------------------------------------------------------------- GPS */
    const gps = card('GPS');
    gps.appendChild(
      field(
        'Reject marks worse than',
        segmented(
          [5, 8, 12].map((v) => ({ value: v, label: `±${v} m` })),
          s.maxAccuracyM,
          (v) => {
            s.maxAccuracyM = v;
            ctx.persistApp();
            paint();
          }
        )
      )
    );
    gps.appendChild(
      field(
        'Burst length',
        segmented(
          [2000, 3000, 5000].map((v) => ({ value: v, label: `${v / 1000}s` })),
          s.burstMs,
          (v) => {
            s.burstMs = v;
            ctx.persistApp();
            paint();
          }
        )
      )
    );
    gps.appendChild(
      field(
        'Record walking track',
        segmented(
          [
            { value: true, label: 'ON' },
            { value: false, label: 'OFF' },
          ],
          s.recordTrack,
          (v) => {
            s.recordTrack = v;
            ctx.persistApp();
            paint();
          }
        )
      )
    );
    gps.appendChild(
      h('p', {
        class: 'note muted',
        text: 'A longer burst averages more fixes but keeps you standing at the ball longer. 3 s is the sweet spot: it fits inside the time it takes to pick a lie.',
      })
    );
    body.appendChild(gps);

    /* ------------------------------------------------------------ green */
    const green = card('Green & putting');
    green.appendChild(
      field(
        'Ask for putts when leaving a hole',
        segmented(
          [
            { value: true, label: 'ON' },
            { value: false, label: 'OFF' },
          ],
          s.promptGreenEntry,
          (v) => {
            s.promptGreenEntry = v;
            ctx.persistApp();
            paint();
          }
        )
      )
    );
    green.appendChild(
      h('p', {
        class: 'note muted',
        text: 'Putt distances are entered in feet, on a grid that steps 3 feet at a time — one stride per button, so nine counted strides land on 27 without converting anything. Marking the cup measures the first putt for you and makes every other distance on the hole exact rather than approximate.',
      })
    );
    body.appendChild(green);

    /* ------------------------------------------------------ diagnostics */
    body.appendChild(gpsCard);
    paintDiagnostics();

    /* ------------------------------------------------------------- data */
    const dataCard = card('Data');
    const bytes = usageBytes();
    const count = allRoundIds().length;
    dataCard.appendChild(
      h('p', {
        class: 'note',
        text: `${count} round${count === 1 ? '' : 's'} stored · ~${Math.round(bytes / 1024)} KB used. Phase 1 keeps everything on this device only.`,
      })
    );
    // localStorage is roughly 5 MB per origin. Say how much runway is left in
    // rounds, because "4.1 MB" means nothing while standing on a tee.
    if (count) {
      const perRound = bytes / count;
      const headroom = Math.max(0, Math.floor((5 * 1024 * 1024 - bytes) / perRound));
      dataCard.appendChild(
        h('p', {
          class: headroom < 20 ? 'note' : 'note muted',
          text: `~${Math.round(perRound / 1024)} KB per round — room for roughly ${headroom} more before this device's ~5 MB limit.${
            headroom < 20 ? ' Export and delete old rounds soon.' : ''
          }`,
        })
      );
    }
    dataCard.appendChild(
      h('button', {
        class: 'btn primary',
        text: 'SEND EXPORT…',
        onClick: async (e) => {
          const btn = e.target;
          btn.disabled = true;
          btn.textContent = 'PREPARING…';
          try {
            const r = await shareExport(ctx.app);
            // The fix count is reported, not hidden behind a generic success:
            // an export carrying no track used to look exactly like one that
            // did, and the track is the most expensive data in the app.
            const what = r.trackPoints
              ? `${r.rounds} round${r.rounds === 1 ? '' : 's'} · ${r.trackPoints.toLocaleString()} track fixes`
              : `${r.rounds} round${r.rounds === 1 ? '' : 's'} — NO track data found`;
            if (r.shared) {
              toast(`Sent: ${what}.`);
            } else if (r.reason === 'cancelled') {
              toast('Share cancelled — nothing sent.');
            } else {
              // No share sheet on this browser. Fall back rather than dead-end,
              // and say where the file went — on a phone that is the whole
              // problem with a download.
              await downloadExport(ctx.app);
              toast(`Saved to Downloads: ${what}.`);
            }
          } catch (err) {
            toast(`Export failed: ${err.message}`);
          } finally {
            btn.disabled = false;
            btn.textContent = 'SEND EXPORT…';
          }
        },
      })
    );
    dataCard.appendChild(
      h('p', {
        class: 'note muted',
        text: 'SEND opens the share sheet — mail it to yourself or drop it in Drive without hunting through folders. SAVE writes it to this device\'s Downloads.',
      })
    );
    dataCard.appendChild(
      h('button', {
        class: 'btn',
        text: 'SAVE TO DEVICE',
        onClick: async (e) => {
          const btn = e.target;
          btn.disabled = true;
          btn.textContent = 'SAVING…';
          try {
            const { rounds, trackPoints } = await downloadExport(ctx.app);
            toast(
              trackPoints
                ? `Saved to Downloads · ${rounds} round${rounds === 1 ? '' : 's'} · ${trackPoints.toLocaleString()} track fixes.`
                : `Saved to Downloads · ${rounds} round${rounds === 1 ? '' : 's'} — NO track data found.`
            );
          } catch (err) {
            toast(`Export failed: ${err.message}`);
          } finally {
            btn.disabled = false;
            btn.textContent = 'SAVE TO DEVICE';
          }
        },
      })
    );

    const fileInput = h('input', {
      type: 'file',
      accept: 'application/json,.json',
      style: { display: 'none' },
      onChange: async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
          const parsed = JSON.parse(await file.text());
          const ok = await confirmSheet(
            'Restore backup?',
            `${parsed.rounds?.length ?? 0} round(s) in this file. Rounds already on this device are kept as they are; only missing ones are added.`,
            { confirmLabel: 'RESTORE' }
          );
          if (!ok) return;
          const report = importExport(parsed, 'merge');
          ctx.app = report.app;
          ctx.setTheme(ctx.app.settings.theme);
          paint();
          // Only for rounds this restore actually added — writing a track for a
          // skipped round would append its points onto one already here.
          const tr = await restoreTracks(parsed, report.addedIds);
          toast(
            `Restored ${report.added} round${report.added === 1 ? '' : 's'}, skipped ${report.skipped}` +
              (tr.points ? ` · ${tr.points.toLocaleString()} track fixes.` : '.')
          );
        } catch (err) {
          toast(err.message ?? 'Could not read that file.');
        }
      },
    });
    dataCard.appendChild(fileInput);
    dataCard.appendChild(
      h('button', { class: 'btn', text: 'Restore from backup', onClick: () => fileInput.click() })
    );
    dataCard.appendChild(
      h('p', {
        class: 'note muted',
        text: 'Export after every round until Firestore sync lands. localStorage is cleared by "clear browsing data" without warning.',
      })
    );
    body.appendChild(dataCard);

    /* ------------------------------------------------- during a round */
    const duringCard = card('While you are playing');
    duringCard.appendChild(
      field(
        'Show scoring and distances',
        segmented(
          [
            { value: 'never', label: 'NEVER' },
            { value: 'tournament', label: 'TOURNAMENT' },
            { value: 'always', label: 'ALWAYS' },
          ],
          s.showScoring ?? 'tournament',
          (v) => {
            s.showScoring = v;
            ctx.persistApp();
            paint();
          }
        )
      )
    );
    duringCard.appendChild(
      h('p', {
        class: 'note muted',
        text: 'Hides the running score, putts, penalties and shot distances on the play screen. Knowing you are three over changes how the next hole gets played, which is noise in a practice round and information in a tournament. Nothing is lost — the round card and Trends always show everything afterwards.',
      })
    );
    body.appendChild(duringCard);

    /* ------------------------------------------------------------ clubs */
    const clubCard = card('Club tracking');
    clubCard.appendChild(
      field(
        'Record the club for each shot',
        segmented(
          [
            { value: true, label: 'ON' },
            { value: false, label: 'OFF' },
          ],
          s.trackClubs,
          (v) => {
            s.trackClubs = v;
            ctx.persistApp();
            paint();
          }
        )
      )
    );
    clubCard.appendChild(
      h('p', {
        class: 'note muted',
        text: 'Adds one tap per full shot and unlocks the per-club breakdown on the Trends screen — which clubs cost you strokes, and which ones are simply unpredictable. Putts are assigned the putter automatically, so the green costs nothing extra. Turning this off later keeps every club already recorded.',
      })
    );
    body.appendChild(clubCard);

    /* --------------------------------------------------- strokes gained */
    const sgCard = card('Strokes gained');
    sgCard.appendChild(
      field(
        'Compare against',
        segmented(
          [
            { value: 'scratch', label: 'SCRATCH' },
            { value: 'tour', label: 'PGA TOUR' },
            { value: 'golfer90', label: '90-GOLFER' },
          ],
          s.sgBaseline ?? 'scratch',
          (v) => {
            s.sgBaseline = v;
            ctx.persistApp();
            paint();
          }
        )
      )
    );
    const chosen = BASELINES[s.sgBaseline ?? 'scratch'];
    sgCard.appendChild(
      h('p', {
        class: chosen?.provenance?.verified ? 'note muted' : 'note',
        text: chosen?.provenance?.verified
          ? `Published data. ${chosen.provenance.note}`
          : `Derived baseline. ${chosen?.provenance?.note ?? ''}`,
      })
    );
    sgCard.appendChild(
      h('p', {
        class: 'note muted',
        text: `Benchmarks from ${SOURCE.citation} Short game is anything inside ${CATEGORY_DEFINITION.shortGameYards} yards, which is Broadie's own boundary — so these categories line up with his published population figures.`,
      })
    );
    body.appendChild(sgCard);

    /* ------------------------------------------------------------ about */
    body.appendChild(
      card(
        'Course data',
        h('p', {
          class: 'note muted',
          text: `${VEENKER.name}: ${VEENKER.source}. Par ${VEENKER.par}. Ratings are only recorded where a published value exists — the gold, white and red tees show no rating because none was verified.`,
        })
      )
    );
  }

  function swatchRow(theme) {
    const probe = h('div', { dataset: { theme }, style: { display: 'none' } });
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    const vars = ['--bg', '--accent', '--ink', '--surface-2'].map((v) => cs.getPropertyValue(v).trim());
    probe.remove();
    return h(
      'span',
      { class: 'swatches' },
      ...vars.map((c) => h('span', { class: 'swatch', style: { background: c } }))
    );
  }

  function paintDiagnostics() {
    const fix = ctx.gps.current;
    gpsCard.replaceChildren(
      h('h2', { text: 'Live diagnostics' }),
      h('p', {
        class: 'note',
        text: ctx.gps.running
          ? fix
            ? `Tracking · ±${fix.acc.toFixed(1)} m · ${ctx.gps.fixCount} fixes this session · ${fix.lat.toFixed(6)}, ${fix.lon.toFixed(6)}`
            : `Tracking · waiting for a fix (${ctx.gps.fixCount} so far)`
          : 'Not tracking — GPS starts when a round starts.',
      }),
      h('p', {
        class: 'note muted',
        text: `Screen wake lock: ${wakeLock.status()}${
          wakeLock.status() === 'unsupported' ? ' (this browser will let the screen sleep)' : ''
        }`,
      }),
      ctx.gps.error
        ? h('p', { class: 'note', text: `Last GPS error: ${ctx.gps.error.message}` })
        : null,
      !ctx.gps.running
        ? h('button', {
            class: 'btn sm',
            text: 'Test GPS now',
            onClick: () => {
              ctx.gps.start();
              paintDiagnostics();
            },
          })
        : null
    );
  }

  paint();
  return { el, tick: paintDiagnostics };
}
