/** Minimal DOM helpers. No framework — the whole app is a few screens. */

/**
 * How long a control ignores a repeat activation after firing.
 *
 * A wet screen doubles touches: one physical press lands as two events
 * milliseconds apart, which on a hole-advance button is the difference between
 * playing hole 15 and hole 16. 300ms is far longer than any such doubling and
 * far shorter than a deliberate second press.
 *
 * Steppers and quick-value grids opt out with `rapid: true`, since there fast
 * repeated taps are the actual interaction rather than an artefact.
 */
const CLICK_DEBOUNCE_MS = 300;

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  const rapid = props?.rapid === true;
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'rapid') continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') {
      const type = k.slice(2).toLowerCase();
      const handler =
        type === 'click' && !rapid
          ? (e) => {
              const now = performance.now();
              if (now - (el.__lastFire ?? -Infinity) < CLICK_DEBOUNCE_MS) return;
              el.__lastFire = now;
              v(e);
            }
          : v;
      el.addEventListener(type, handler);
    } else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const frag = (...children) => {
  const f = document.createDocumentFragment();
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    f.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  return f;
};

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/* ------------------------------------------------------------------ toast */

let toastEl = null;
let toastTimer = null;

export function toast(message, { action, onAction, ms = 5000 } = {}) {
  dismissToast();
  toastEl = h(
    'div',
    { class: 'toast', role: 'status' },
    h('span', { text: message }),
    action &&
      h('button', {
        text: action,
        onClick: () => {
          dismissToast();
          onAction?.();
        },
      })
  );
  document.body.appendChild(toastEl);
  toastTimer = setTimeout(dismissToast, ms);
}

export function dismissToast() {
  clearTimeout(toastTimer);
  toastEl?.remove();
  toastEl = null;
}

/* ------------------------------------------------------------------ sheet */

let sheetEl = null;

/**
 * Bottom sheet. `build(close)` returns the content; `close(value)` dismisses.
 * Returns a promise resolving to whatever `close` was called with.
 */
export function sheet(title, build) {
  closeSheet();
  return new Promise((resolve) => {
    const done = (value) => {
      closeSheet();
      resolve(value);
    };
    const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-label': title });
    panel.appendChild(h('h2', { text: title }));
    panel.appendChild(build(done));
    panel.appendChild(h('button', { class: 'btn sm', text: 'Close', onClick: () => done(null) }));

    sheetEl = h(
      'div',
      {
        class: 'scrim',
        onClick: (e) => {
          if (e.target === sheetEl) done(null);
        },
      },
      panel
    );
    document.body.appendChild(sheetEl);
  });
}

export function closeSheet() {
  sheetEl?.remove();
  sheetEl = null;
}

/** Confirmation sheet. Destructive actions get the danger styling. */
export function confirmSheet(title, message, { confirmLabel = 'Confirm', danger = false } = {}) {
  return sheet(title, (done) =>
    frag(
      h('p', { class: 'note', text: message }),
      h('button', {
        class: `btn ${danger ? 'danger' : 'primary'}`,
        text: confirmLabel,
        onClick: () => done(true),
      })
    )
  ).then((v) => v === true);
}

/* ---------------------------------------------------------------- controls */

/** A segmented control. `options` is `[{ value, label }]`. */
export function segmented(options, value, onChange, { columns } = {}) {
  const wrap = h('div', {
    class: 'seg',
    style: columns ? { gridTemplateColumns: `repeat(${columns}, 1fr)`, gridAutoFlow: 'row' } : null,
  });
  for (const opt of options) {
    wrap.appendChild(
      h('button', {
        class: 'seg-btn',
        type: 'button',
        text: opt.label,
        'aria-pressed': String(opt.value === value),
        onClick: () => onChange(opt.value),
      })
    );
  }
  return wrap;
}

export function field(label, control) {
  return h('div', { class: 'field' }, h('span', { class: 'label', text: label }), control);
}

export function stat(key, value, sub) {
  return h(
    'div',
    { class: 'stat' },
    h('span', { class: 'k', text: key }),
    h('span', { class: 'v', text: value }),
    sub ? h('span', { class: 'n', text: sub }) : null
  );
}

export function card(title, ...children) {
  return h('div', { class: 'card' }, title ? h('h2', { text: title }) : null, ...children);
}
