import { h, card, segmented, confirmSheet, sheet, frag, toast } from './dom.js';
import { loadRound, deleteRound, reconcileIndex } from '../data/store.js';
import { roundTotals, fmtToPar } from '../round/round.js';

export function historyScreen(ctx) {
  const el = h('div', { class: 'screen' });
  let filter = 'all';

  el.appendChild(
    h(
      'header',
      { class: 'topbar' },
      h('button', { class: 'icon-btn', text: '‹', 'aria-label': 'Back', onClick: () => ctx.go('home') }),
      h('h1', { text: 'History' })
    )
  );

  const body = h('div', { class: 'body' });
  el.appendChild(body);

  function paint() {
    body.replaceChildren();

    body.appendChild(
      segmented(
        [
          { value: 'all', label: 'ALL' },
          { value: 'practice', label: 'PRACTICE' },
          { value: 'tournament', label: 'TOURNAMENT' },
        ],
        filter,
        (v) => {
          filter = v;
          paint();
        }
      )
    );

    const rows = ctx.app.rounds.filter((r) => filter === 'all' || r.type === filter);

    if (!rows.length) {
      body.appendChild(h('p', { class: 'note muted', style: { marginTop: '16px' }, text: 'No rounds yet.' }));
      return;
    }

    // Aggregate across whatever is shown, with n stated plainly.
    const totals = rows
      .map((r) => loadRound(r.id))
      .filter(Boolean)
      .map((r) => ({ round: r, t: roundTotals(r) }))
      .filter((x) => x.t.holes >= 18);
    if (totals.length) {
      const avg = totals.reduce((a, x) => a + x.t.toPar, 0) / totals.length;
      body.appendChild(
        card(
          'Full rounds',
          h('p', {
            class: 'note',
            text: `${totals.length} complete 18-hole round${totals.length === 1 ? '' : 's'} · average ${fmtToPar(
              Math.round(avg * 10) / 10
            )} to par (n = ${totals.length})`,
          })
        )
      );
    }

    const list = h('div', {}, ...rows.map(rowFor));
    body.appendChild(list);
  }

  function rowFor(summary) {
    const round = loadRound(summary.id);
    if (!round) return null;
    const t = roundTotals(round);
    const date = new Date(summary.startedAt);
    return h(
      'button',
      {
        class: 'list-row',
        onClick: () => ctx.go('summary', { roundId: summary.id, from: 'history' }),
        onContextmenu: (e) => {
          e.preventDefault();
          promptDelete(summary);
        },
      },
      h(
        'span',
        { class: 'grow' },
        h('strong', { text: summary.courseName }),
        h('span', {
          class: 'sub',
          text: `${date.toLocaleDateString()} · ${summary.type} · ${summary.teeSet} · ${t.holes} holes${
            summary.status !== 'completed' ? ` · ${summary.status.replace('_', ' ')}` : ''
          }`,
        })
      ),
      h('strong', { text: t.holes ? `${t.strokes} (${fmtToPar(t.toPar)})` : '—' }),
      h('span', {
        class: 'icon-btn',
        text: '⋯',
        role: 'button',
        'aria-label': 'Round options',
        onClick: (e) => {
          e.stopPropagation();
          openRoundOptions(summary);
        },
      })
    );
  }

  /**
   * Editing has to be reachable from the list itself. Requiring a detour
   * through the round card to find it is how it got missed in the first place.
   */
  function openRoundOptions(summary) {
    sheet(`${summary.courseName} · ${new Date(summary.startedAt).toLocaleDateString()}`, (done) =>
      frag(
        h('button', {
          class: 'btn primary',
          text: 'EDIT / ADD HOLES',
          onClick: () => {
            done('edit');
            ctx.go('play', { roundId: summary.id });
          },
        }),
        h('button', {
          class: 'btn',
          text: 'View round card',
          onClick: () => {
            done('view');
            ctx.go('summary', { roundId: summary.id, from: 'history' });
          },
        }),
        h('button', {
          class: 'btn danger',
          text: 'Delete round',
          onClick: () => {
            done('delete');
            promptDelete(summary);
          },
        })
      )
    );
  }

  async function promptDelete(summary) {
    const ok = await confirmSheet(
      'Delete round?',
      `${summary.courseName}, ${new Date(summary.startedAt).toLocaleDateString()}. This cannot be undone and the data is not recoverable unless you have exported it.`,
      { confirmLabel: 'DELETE', danger: true }
    );
    if (!ok) return;
    deleteRound(summary.id);
    if (ctx.app.activeRoundId === summary.id) {
      ctx.app.activeRoundId = null;
      ctx.round = null;
    }
    reconcileIndex(ctx.app);
    ctx.persistApp();
    paint();
    toast('Round deleted.');
  }

  paint();
  return { el };
}
