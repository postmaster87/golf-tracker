/**
 * THE HOLE OVERVIEW PAGE (docs/SPEC_hole-overview.md Section 6).
 *
 * Matt, 2026-09-28: *"I want to integrate the map in to the app and have a
 * "hole Overview" page I can toggle to. It should have approach distance (front
 * center and back), lay up distances that I will add in later, bunker numbers
 * (carry ideally), distance to the water and carry distance over water."* And:
 * *"remember that book is old. the course map I approved holds above it"* -
 * nothing here comes from the yardage book.
 *
 * One component, mounted two ways: over the play screen by the `MAP` control
 * (screen-play.js, 6.2), and as the `map` screen from home (6.7). It reads the
 * course map through the engine's pure functions and writes one thing, his
 * course notes (the layups he types in). It never touches the round: opening,
 * looking and closing change nothing in it and save nothing.
 *
 * Every number is the straight-line distance from the origin at the top of its
 * column - the tee box for the TEE column, the current fix for YOU - to a point
 * on the map (his rulings 4 to 7). The two columns run the same functions.
 */

import { h, frag, sheet, confirmSheet, segmented, field, toast } from './dom.js';
import {
  courseGeometry,
  courseFrames,
  holeFeatures,
  holePath,
  teeOrigin,
  holeNumbers,
  layupPoint,
  framePx,
  COMPACT_SPAN_M,
} from '../round/course-geometry.js';
import { ringSpanM } from '../util/polygon.js';
import { loadCourseNotes, saveCourseNotes } from '../data/store.js';
import { newLayup, LAYUP_LABEL_MAX } from '../data/schema.js';
import { getCourse } from '../data/courses.js';
import { distanceM, toYards } from '../util/geo.js';

/*
 * THE CREEK CARRY OFF THE TEE - a list, not derived.
 *
 * His words, 2026-09-28: *"add the carry number for the creek off 15 tees and
 * the carry number for the creek on 16 should always be displayed on that hole
 * as well."* His answers in the building session (spec Section 2): blue and
 * gold together, every time, whatever tee the round is on (ruling 17); on the
 * Hole Overview page only, not the play screen (ruling 18); on hole 16 the
 * crossing short of the green, W2 - not W1 in front of the tee (ruling 19).
 */
const CREEK_CARRY = Object.freeze({ 15: 'W1', 16: 'W2' });
const CREEK_SETS = ['blue', 'gold'];

/** What the page says when his notes could not be read (spec 14.2, R6). */
export const NOTES_UNREADABLE = 'Course notes could not be read. A copy was kept.';

const yd = (m) => Math.round(toYards(m));
const DASH = '—';
/** `replaceChildren` without the holes: a null child would print as "null". */
const put = (parent, ...kids) => parent.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));
const SET_WORD = (s) => String(s ?? '').toUpperCase();

/** The play screen's fix as the engine's origin: the same conversion its GREEN line makes. */
function youOrigin(fix) {
  if (!fix || !Number.isFinite(fix.lat) || !Number.isFinite(fix.lon)) return null;
  return { lat: fix.lat, lon: fix.lon, accuracyM: fix.acc };
}

/** A stored layup the page will show: one `newLayup` would accept (spec 14.2, R4). */
function showable(l) {
  if (!l || typeof l !== 'object') return false;
  return newLayup({ hole: l.hole, ref: l.ref, yards: l.yards, teeSet: l.teeSet, label: l.label }) !== null;
}

/* ------------------------------------------------------------ the picture */

const outlineCache = new WeakMap();

/**
 * The shapes drawn on a hole's picture, in image pixels: fairways, bunkers,
 * water (the creek and the ponds) and greens that reach into the frame, and
 * the hole path. Fixed per frame, so computed once.
 */
function outlinesFor(geometry, frame) {
  let byFrame = outlineCache.get(geometry);
  if (!byFrame) outlineCache.set(geometry, (byFrame = new WeakMap()));
  let o = byFrame.get(frame);
  if (o) return o;
  const W = frame.widthPx;
  const H = frame.heightPx;
  const shapes = [];
  for (const kind of ['fairway', 'water', 'bunker', 'green']) {
    for (const p of geometry.polygons) {
      if (p.kind !== kind) continue;
      const rings = [p.ring, ...(p.inner ?? [])].map((r) => r.map((q) => framePx(frame, q)));
      const xs = rings[0].map((q) => q.x);
      const ys = rings[0].map((q) => q.y);
      if (Math.max(...xs) < 0 || Math.min(...xs) > W || Math.max(...ys) < 0 || Math.min(...ys) > H) continue;
      const d = rings.map((r) => `M${r.map((q) => `${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join('L')}Z`).join('');
      const pond = kind === 'water' && ringSpanM(p.ring) <= COMPACT_SPAN_M;
      shapes.push({ kind, pond, d });
    }
  }
  const path = (holePath(geometry, frame.number) ?? []).map((q) => framePx(frame, q));
  o = { shapes, path: path.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ') };
  byFrame.set(frame, o);
  return o;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, String(v));
  return e;
}

/** A marker on the picture, placed in percent so it stays put at any size. */
function marker(frame, pt, cls, text) {
  return h('span', {
    class: `ho-mk ${cls}`,
    text,
    style: { left: `${(pt.x / frame.widthPx) * 100}%`, top: `${(pt.y / frame.heightPx) * 100}%` },
  });
}

/* --------------------------------------------------------------- the page */

/**
 * The page. `holes` are the hole numbers the arrows step through, in order;
 * `getFix` returns the current fix or null. `live: false` (the map screen) has
 * no YOU column at all; `teeSets` gives it a tee-set selector; `closeLabel` is
 * the word on the button that goes back (PLAY on the round, HOME from home).
 * Returns `{ el, tick, close }`.
 */
export function holeOverview({
  course,
  geometry,
  frames,
  teeSet,
  holes,
  holeNumber,
  getFix = () => null,
  onClose,
  closeLabel = 'PLAY',
  live = true,
  teeSets = null,
}) {
  const order = (holes ?? []).slice();
  let n = order.includes(holeNumber) ? holeNumber : order[0];
  let set = teeSet;
  let filled = false;
  let closed = false;
  let liveAt = -Infinity;

  let notes = loadCourseNotes(course.id);
  if (notes.recoveredFrom) toast(NOTES_UNREADABLE, { ms: 8000 });

  const el = h('div', { class: 'hole-overview' });
  const bar = h('div', { class: 'holenav has-map ho-bar' });
  const sub = h('div', { class: 'ho-sub' });
  const creek = h('div', { class: 'ho-creek' });
  const scroll = h('div', { class: 'ho-scroll' });
  const pic = h('div', {
    class: 'ho-pic',
    role: 'button',
    tabindex: '0',
    'aria-label': 'Hole picture: tap to fill the screen, tap again to go back',
    onClick: () => setFilled(!filled),
  });
  const img = h('img', { class: 'ho-photo', alt: '', draggable: 'false' });
  img.addEventListener('error', () => el.classList.add('no-photo'));
  img.addEventListener('load', () => el.classList.remove('no-photo'));
  const shapesLayer = svg('svg', { class: 'ho-shapes', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  const liveLayer = svg('svg', { class: 'ho-live', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  const marks = h('div', { class: 'ho-marks' });
  const liveMarks = h('div', { class: 'ho-marks' });
  pic.append(img, shapesLayer, liveLayer, marks, liveMarks);
  const you = live ? h('section', { class: 'ho-col', dataset: { col: 'you' } }) : null;
  const tee = h('section', { class: 'ho-col', dataset: { col: 'tee' } });
  const nums = h('div', { class: 'ho-nums' }, you, tee);
  const layupsEl = h('section', { class: 'ho-layups' });
  scroll.append(h('div', { class: 'ho-main' }, pic, nums), layupsEl);
  el.append(bar, sub, creek, scroll);

  /** Everything about the shown hole that does not move with him. */
  let view = null;

  function build() {
    const frame = frames?.holes?.find((f) => f.number === n) ?? null;
    const origin = teeOrigin(geometry, n, set);
    const courseHole = course.holes?.find((x) => x.number === n) ?? null;
    const card = courseHole?.yards?.[set] ?? null;
    const layups = (notes.layups ?? []).filter((l) => l?.hole === n && showable(l));
    view = {
      frame,
      origin,
      courseHole,
      card,
      features: holeFeatures(geometry, n),
      teeNums: origin ? holeNumbers(geometry, n, origin) : null,
      layups: layups.map((l) => ({
        l,
        // A tee layup is placed from the page's tee only when it is his for
        // this tee set (6.3); otherwise it has no point and no YOU number.
        point:
          l.ref === 'tee'
            ? l.teeSet === set && origin
              ? layupPoint(geometry, n, l, origin)
              : null
            : layupPoint(geometry, n, l, null),
      })),
    };
  }

  function paintBar() {
    const i = order.indexOf(n);
    const prev = order[i - 1];
    const next = order[i + 1];
    bar.replaceChildren(
      h('button', {
        class: 'ho-prev',
        text: prev != null ? `‹ ${prev}` : '‹',
        disabled: prev == null,
        'aria-label': 'Previous hole',
        onClick: () => showHole(prev),
      }),
      h(
        'div',
        { class: 'ho-title' },
        h('strong', { text: `HOLE ${n}` }),
        view.courseHole?.par ? h('small', { text: `PAR ${view.courseHole.par}` }) : null
      ),
      h('button', {
        class: 'ho-next',
        text: next != null ? `${next} ›` : '›',
        disabled: next == null,
        'aria-label': 'Next hole',
        onClick: () => showHole(next),
      }),
      h('button', { class: 'ho-close', text: closeLabel, onClick: close })
    );
    el.dataset.hole = String(n);
  }

  /**
   * Looking at a hole the round is not on (C2, Fable's review of v35): one green
   * on the screen. The play screen's HUD GREEN line and its par-and-card title
   * are hidden while the page shows another hole - by a class on the page's
   * parent, the play screen's element, which the stylesheet reads - and the sub
   * line says where the round is. The map screen from home has no round: never.
   */
  const away = () => live && n !== holeNumber;
  function markAway() {
    el.parentElement?.classList.toggle('ho-away', away());
  }

  function paintSub() {
    const line = h('span', {
      class: 'ho-tee-card',
      text: `${SET_WORD(set)}${view.card ? ` · CARD ${view.card}` : ''}${away() ? ` · ROUND IS ON HOLE ${holeNumber}` : ''}`,
    });
    if (!teeSets) {
      sub.replaceChildren(line);
      return;
    }
    sub.replaceChildren(
      line,
      segmented(
        teeSets.map((s) => ({ value: s, label: SET_WORD(s) })),
        set,
        (v) => {
          set = v;
          showHole(n);
        }
      )
    );
  }

  /** CREEK CARRY BLUE 255 · GOLD 223: fixed under the top bar on holes 15 and 16. */
  function paintCreek() {
    const name = CREEK_CARRY[n];
    creek.hidden = !name;
    if (!name) {
      creek.replaceChildren();
      return;
    }
    const part = (s) => {
      const o = teeOrigin(geometry, n, s);
      const f = o ? holeNumbers(geometry, n, o)?.features.find((x) => x.name === name && x.mode === 'cross') : null;
      return f ? `${SET_WORD(s)} ${f.carryYd}${o.source === 'markup' ? ' (your mark)' : ''}` : `${SET_WORD(s)} ${DASH}`;
    };
    const [a, b] = CREEK_SETS.map(part);
    // Two unbreakable halves: when it does not fit one line it breaks after the
    // blue number, and never shrinks or scrolls sideways.
    creek.replaceChildren(
      h('span', { class: 'ho-cc', text: `CREEK CARRY ${a} ·` }),
      document.createTextNode(' '),
      h('span', { class: 'ho-cc', text: b })
    );
  }

  function paintPicture() {
    const { frame } = view;
    pic.hidden = !frame;
    if (!frame) return;
    pic.style.aspectRatio = `${frame.widthPx} / ${frame.heightPx}`;
    const src = new URL(`../../${frame.file}`, import.meta.url).href;
    if (img.getAttribute('src') !== src) {
      el.classList.remove('no-photo');
      img.src = src;
    }
    const vb = `0 0 ${frame.widthPx} ${frame.heightPx}`;
    shapesLayer.setAttribute('viewBox', vb);
    liveLayer.setAttribute('viewBox', vb);
    const o = outlinesFor(geometry, frame);
    const nodes = [];
    for (const s of o.shapes) {
      const cls = s.pond ? 'pond' : s.kind;
      nodes.push(
        svg('path', { class: `ho-halo ${cls}`, d: s.d }),
        svg('path', { class: `ho-shape ${cls}`, d: s.d })
      );
    }
    if (o.path) {
      nodes.push(
        svg('polyline', { class: 'ho-halo ho-line', points: o.path }),
        svg('polyline', { class: 'ho-path ho-line', points: o.path })
      );
    }
    shapesLayer.replaceChildren(...nodes);
    const ms = [];
    if (view.origin) ms.push(marker(frame, framePx(frame, view.origin), 'tee', 'T'));
    for (const { l, point } of view.layups) {
      if (point) ms.push(marker(frame, framePx(frame, point), 'layup', String(l.yards)));
    }
    marks.replaceChildren(...ms);
  }

  /** Reach / carry for one feature row, or the word that stands in for it. */
  function featureCell(f, { youCol }) {
    if (!f) return { text: DASH };
    if (youCol && f.inside) return { text: 'IN IT' };
    if (youCol && f.behind) return { text: 'behind', word: true };
    return { text: `${f.reachYd} / ${f.carryYd}`, holeLine: f.ownLine === false };
  }

  function featureRows(col, features, found, { youCol }) {
    for (const f of features) {
      const got = found ? found.find((x) => x.name === f.name) : null;
      const cell = found ? featureCell(got, { youCol }) : { text: DASH };
      col.appendChild(
        h(
          'div',
          { class: 'ho-row', dataset: { row: f.name } },
          h('span', { class: 'k', text: f.kind === 'bunker' ? `${f.name} ${f.side}` : f.name }),
          h('span', { class: `v${cell.word ? ' word' : ''}`, text: cell.text }),
          cell.holeLine ? h('small', { class: 'ho-tag', text: 'hole line' }) : null
        )
      );
    }
  }

  function paintTee() {
    const { origin, teeNums, features } = view;
    if (!origin) {
      tee.replaceChildren(h('p', { class: 'ho-none', text: `no ${SET_WORD(set)} tee box on the map` }));
      return;
    }
    const head =
      origin.source === 'markup'
        ? `${SET_WORD(set)} TEE (your mark)`
        : `${SET_WORD(set)} TEE ±${yd(origin.accuracyM)} yd`;
    const g = teeNums?.green;
    tee.replaceChildren(
      h('h3', { text: head }),
      h(
        'div',
        { class: 'ho-row', dataset: { row: 'green' } },
        h('span', { class: 'k', text: 'GREEN' }),
        h(
          'span',
          { class: 'v' },
          h('b', { dataset: { f: 'F' }, text: g ? String(g.frontYd) : DASH }),
          '/',
          h('b', { dataset: { f: 'C' }, text: g ? String(g.centreYd) : DASH }),
          '/',
          h('b', { dataset: { f: 'B' }, text: g ? String(g.backYd) : DASH })
        )
      )
    );
    featureRows(tee, features, teeNums?.features ?? null, { youCol: false });
  }

  function paintYou(numsNow, fix) {
    if (!you) return;
    const g = numsNow?.green;
    const acc = Number.isFinite(fix?.accuracyM) ? ` ±${yd(fix.accuracyM)} yd` : '';
    put(
      you,
      h('h3', { text: numsNow ? `YOU${acc}` : 'YOU' }),
      numsNow ? null : h('p', { class: 'ho-none', text: 'no fix' }),
      h(
        'div',
        { class: 'ho-row ho-green', dataset: { row: 'green' } },
        h('span', { class: 'k', text: g && g.frontM === 0 ? 'ON THE GREEN' : 'GREEN' }),
        h('strong', { class: 'v ho-c', dataset: { f: 'C' }, text: g ? String(g.centreYd) : DASH })
      ),
      h(
        'div',
        { class: 'ho-row ho-fb', dataset: { row: 'fb' } },
        h('span', { class: 'k', text: 'F' }),
        h('b', { class: 'v', dataset: { f: 'F' }, text: g ? String(g.frontYd) : DASH }),
        h('span', { class: 'k', text: 'B' }),
        h('b', { class: 'v', dataset: { f: 'B' }, text: g ? String(g.backYd) : DASH })
      )
    );
    featureRows(you, view.features, numsNow?.features ?? null, { youCol: true });
  }

  /** Each layup row's YOU cell, repainted as he moves; the rows are not rebuilt under his thumb. */
  let layupYou = [];

  function paintLayups() {
    layupYou = [];
    const rows = view.layups.map(({ l, point }) => {
      const key = l.ref === 'green' ? `${l.yards} out` : `${l.yards} from ${SET_WORD(l.teeSet)}`;
      const teeText =
        l.ref === 'tee'
          ? String(l.yards)
          : view.origin && point
            ? String(yd(distanceM(view.origin, point)))
            : DASH;
      const youEl = live ? h('b', { text: DASH }) : null;
      if (youEl) layupYou.push({ point, el: youEl });
      return h(
        'button',
        { class: 'ho-layup', dataset: { id: l.id ?? '' }, onClick: () => editLayup(l) },
        h('span', { class: 'ho-lk' }, h('strong', { text: key }), l.label ? h('small', { text: l.label }) : null),
        youEl ? h('span', { class: 'ho-lv you' }, h('small', { text: 'YOU' }), youEl) : null,
        h('span', { class: 'ho-lv tee' }, h('small', { text: 'TEE' }), h('b', { text: teeText }))
      );
    });
    put(
      layupsEl,
      h(
        'div',
        { class: 'ho-lay-head' },
        h('h3', { text: 'LAYUPS' }),
        h('button', { class: 'btn sm', text: '+ LAYUP', onClick: () => editLayup(null) })
      ),
      notes.recoveredFrom ? h('p', { class: 'note ho-unread', text: NOTES_UNREADABLE }) : null,
      ...(rows.length ? rows : [h('p', { class: 'note muted', text: 'No layups on this hole.' })])
    );
  }

  function paintLayupsYou(fix) {
    for (const { point, el: cell } of layupYou) {
      const text = fix && point ? String(yd(distanceM(fix, point))) : DASH;
      if (cell.textContent !== text) cell.textContent = text;
    }
  }

  /** His position on the picture, with its accuracy ring; an arrow at the edge when he is off it. */
  function paintPosition(fix, numsNow) {
    const { frame } = view;
    if (!frame) return;
    const layer = [];
    const dots = [];
    if (fix) {
      const p = framePx(frame, fix);
      const W = frame.widthPx;
      const H = frame.heightPx;
      if (p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H) {
        const r = Number.isFinite(fix.accuracyM) ? fix.accuracyM / frame.mPerPx : 0;
        if (r > 0) {
          layer.push(svg('circle', { class: 'ho-ring', cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: r.toFixed(1) }));
        }
        dots.push(marker(frame, p, 'you-dot', ''));
      } else {
        const m = 0.04;
        const c = {
          x: Math.min(W * (1 - m), Math.max(W * m, p.x)),
          y: Math.min(H * (1 - m), Math.max(H * m, p.y)),
        };
        const arrow = marker(frame, c, 'you-arrow', '➤');
        arrow.style.transform = `translate(-50%, -50%) rotate(${Math.atan2(p.y - c.y, p.x - c.x)}rad)`;
        dots.push(arrow);
      }
    }
    // Filled, each marker carries his numbers - the tee's with no fix (6.3).
    if (filled) {
      const from = fix ? numsNow : view.teeNums;
      for (const f of view.features) {
        const got = from?.features.find((x) => x.name === f.name);
        const cell = got ? featureCell(got, { youCol: Boolean(fix) }) : { text: DASH };
        dots.push(marker(frame, framePx(frame, f.at), `feat ${f.kind}`, `${f.name} ${cell.text}`));
      }
    } else {
      for (const f of view.features) dots.push(marker(frame, framePx(frame, f.at), `feat ${f.kind}`, f.name));
    }
    liveLayer.replaceChildren(...layer);
    liveMarks.replaceChildren(...dots);
  }

  /** Everything that moves with him: the YOU column, his position, the filled markers. */
  function paintLive() {
    liveAt = Date.now();
    const fix = live ? youOrigin(getFix()) : null;
    const numsNow = fix ? holeNumbers(geometry, n, fix) : null;
    const at = numsNow ? fix : null;
    paintYou(numsNow, at);
    paintLayupsYou(at);
    paintPosition(at, numsNow);
  }

  function paintAll() {
    build();
    paintBar();
    paintSub();
    paintCreek();
    paintPicture();
    paintTee();
    paintLayups();
    paintLive();
  }

  /** Look at another hole: the page only - never the round's current hole. */
  function showHole(number) {
    if (number == null || closed) return;
    n = number;
    paintAll();
    markAway();
    if (filled) fitFilled();
    else scroll.scrollTop = 0;
  }

  function fitFilled() {
    const { frame } = view;
    if (!frame) return;
    const cs = getComputedStyle(scroll);
    const w = scroll.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const hgt = scroll.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const s = Math.min(w / frame.widthPx, hgt / frame.heightPx);
    if (!(s > 0)) return;
    pic.style.width = `${Math.floor(frame.widthPx * s)}px`;
    pic.style.height = `${Math.floor(frame.heightPx * s)}px`;
  }

  /** A tap on the picture fills the page with it; a tap again returns (6.3). */
  function setFilled(on) {
    filled = on;
    el.classList.toggle('filled', filled);
    if (filled) {
      scroll.scrollTop = 0;
      fitFilled();
    } else {
      pic.style.width = '';
      pic.style.height = '';
    }
    paintLive();
  }

  /* ---------------------------------------------------------- his layups */

  /** Write his notes; on a failed write put the page back to what is stored. */
  function persistNotes() {
    const ok = saveCourseNotes(notes);
    if (ok) delete notes.recoveredFrom;
    else notes = loadCourseNotes(course.id);
    build();
    paintPicture();
    paintLayups();
    paintLive();
    return ok;
  }

  /** The one line that says why nothing was saved: the first of newLayup's rules the entry breaks. */
  function rejection(yards, ref) {
    if (!Number.isInteger(yards) || yards < 1 || yards > 700) {
      return 'Not saved: yards must be a whole number from 1 to 700.';
    }
    if (ref === 'tee' && !set) return 'Not saved: there is no tee set to measure from.';
    return `Not saved: the label is over ${LAYUP_LABEL_MAX} characters.`;
  }

  /**
   * The layup sheet (6.4): the number, what it is measured from, a label, SAVE;
   * and DELETE on a row's own sheet. No single touch adds, changes or removes a
   * layup - every change is a typed number and SAVE, or DELETE and its
   * confirmation.
   */
  async function editLayup(existing) {
    const hole = n;
    let ref = existing?.ref ?? 'green';
    const result = await sheet(existing ? `Hole ${hole} — layup` : `Hole ${hole} — new layup`, (done) => {
      const yardsIn = h('input', {
        type: 'number',
        inputmode: 'numeric',
        min: '1',
        max: '700',
        step: '1',
        placeholder: 'yards',
        class: 'ho-in-yards',
        value: existing ? String(existing.yards) : '',
      });
      const labelIn = h('input', {
        type: 'text',
        maxlength: String(LAYUP_LABEL_MAX),
        placeholder: 'optional',
        class: 'ho-in-label',
        value: existing?.label ?? '',
      });
      const refWrap = h('div', { class: 'ho-in-ref' });
      const paintRef = () =>
        refWrap.replaceChildren(
          segmented(
            [
              { value: 'green', label: 'LEAVES TO THE GREEN' },
              { value: 'tee', label: 'FROM THE TEE' },
            ],
            ref,
            (v) => {
              ref = v;
              paintRef();
            }
          )
        );
      paintRef();
      const said = h('p', { class: 'note ho-said', hidden: true });
      return frag(
        field('Yards', yardsIn),
        field('Measured', refWrap),
        field(`Label (optional, ${LAYUP_LABEL_MAX} characters)`, labelIn),
        said,
        h('button', {
          class: 'btn primary',
          text: 'SAVE',
          onClick: () => {
            const typed = yardsIn.value.trim();
            const yards = typed === '' ? NaN : Number(typed);
            const made = newLayup({ hole, ref, yards, teeSet: ref === 'tee' ? set : null, label: labelIn.value });
            if (!made) {
              said.hidden = false;
              said.textContent = rejection(yards, ref);
              return;
            }
            done({ kind: 'save', made });
          },
        }),
        existing ? h('button', { class: 'btn danger', text: 'DELETE', onClick: () => done({ kind: 'delete' }) }) : null
      );
    });
    if (!result || closed) return;
    if (result.kind === 'save') {
      if (existing) {
        const { ref: r, yards, teeSet: ts, label, updatedAt } = result.made;
        Object.assign(existing, { ref: r, yards, teeSet: ts, label, updatedAt });
      } else {
        notes.layups.push(result.made);
      }
      persistNotes();
      return;
    }
    const what =
      existing.ref === 'green' ? `${existing.yards} out` : `${existing.yards} from the ${SET_WORD(existing.teeSet)} tee`;
    const ok = await confirmSheet(
      'Delete this layup?',
      `Hole ${hole}: ${what}${existing.label ? ` (${existing.label})` : ''}.`,
      { confirmLabel: 'DELETE', danger: true }
    );
    if (!ok || closed) return;
    const at = notes.layups.indexOf(existing);
    if (at < 0) return;
    notes.layups.splice(at, 1);
    if (!persistNotes()) return;
    toast('Layup deleted.', {
      action: 'RESTORE',
      // From what is stored, so a RESTORE after PLAY still puts it back.
      onAction: () => {
        notes = loadCourseNotes(course.id);
        if (!notes.layups.some((l) => l?.id === existing.id)) {
          notes.layups.splice(Math.min(at, notes.layups.length), 0, existing);
        }
        persistNotes();
      },
    });
  }

  /* ----------------------------------------------------------- lifecycle */

  function tick() {
    if (closed || !live) return;
    // At most once a second, as the play screen's GREEN line.
    if (Date.now() - liveAt < 1000) return;
    paintLive();
  }

  function close() {
    if (closed) return;
    closed = true;
    // The HUD exactly as it was before the page opened.
    el.parentElement?.classList.remove('ho-away');
    el.remove();
    onClose?.();
  }

  paintAll();
  return { el, tick, close };
}

/**
 * The page from the home screen (6.7, his ruling 14): the course map for a
 * course that has one, holes 1 to 18, a tee-set selector starting at the tee
 * last played there, and HOME where PLAY is. GPS is not started, so there is
 * no YOU column. Layups typed here go into his course notes, as on the round.
 */
export function mapScreen(ctx) {
  const el = h('div', { class: 'screen map' });
  const course = getCourse(ctx.app, ctx.params?.courseId ?? ctx.app.settings.courseId);
  const geometry = courseGeometry(course);
  const frames = courseFrames(course);
  if (!geometry || !frames) {
    queueMicrotask(() => ctx.go('home'));
    return { el };
  }
  const s = ctx.app.settings;
  const remembered = s.teeByCourse?.[course.id] ?? s.teeSet;
  const teeSets = Object.keys(course.teeSets);
  const page = holeOverview({
    course,
    geometry,
    frames,
    teeSet: course.teeSets[remembered] ? remembered : teeSets[0],
    holes: course.holes.map((x) => x.number),
    holeNumber: course.holes[0]?.number,
    getFix: () => null,
    live: false,
    teeSets,
    closeLabel: 'HOME',
    onClose: () => ctx.go('home'),
  });
  el.appendChild(page.el);
  return { el, tick: page.tick };
}
