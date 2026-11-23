// Audiograph Pro UI kit: plain-DOM helpers shared by the studio (knobs, chips, panels, fields).
const ARC = 'M7.272 32.728A18 18 0 1 1 32.728 32.728';
const SVG_NS = 'http://www.w3.org/2000/svg';
let uid = 0;

export function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

const decimals = (s) => { const t = String(s); return t.includes('.') ? t.split('.')[1].length : 0; };

export function knob(opts) {
  const min = +(opts.min ?? 0), max = +(opts.max ?? 1), step = +(opts.step || 0.01);
  const def = opts.def ?? opts.value ?? min, dp = decimals(step), id = ++uid;
  const snap = (v) => {
    v = Math.min(max, Math.max(min, Number.isFinite(+v) ? +v : +def));
    return +(Math.round((v - min) / step) * step + min).toFixed(dp);
  };
  const fmt = (v) => (opts.format ? opts.format(v) : v.toFixed(dp) + (opts.unit || ''));
  let value = snap(opts.value ?? def);

  const root = el('div', 'knob' + (opts.modulated ? ' mod' : ''));
  const dial = el('div', 'knob-dial');
  dial.innerHTML = `<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><defs>
<radialGradient id="kg${id}" cx="40%" cy="30%" r="80%"><stop offset="0" stop-color="#404047"/><stop offset="1" stop-color="#202025"/></radialGradient></defs>
<path class="knob-track" d="${ARC}" pathLength="100"/><path class="knob-fill" d="${ARC}" pathLength="100"/>
<circle class="knob-body" cx="20" cy="20" r="13.5" fill="url(#kg${id})"/><line class="knob-tick" x1="20" y1="8.6" x2="20" y2="13.2"/></svg>`;
  const svg = dial.firstChild, fill = svg.querySelector('.knob-fill'), tick = svg.querySelector('.knob-tick');
  const input = el('input', 'knob-input');
  Object.assign(input, { type: 'range', min, max, step, value });
  if (opts.property) input.dataset.property = opts.property;
  input.setAttribute('aria-label', opts.label || opts.property || 'Value');
  const label = el('span', 'knob-label', opts.label || '');
  label.title = opts.label || '';
  const valueEl = el('span', 'knob-value');
  valueEl.title = 'Click to type a value';
  dial.title = 'Turn it: drag around the knob · wheel or arrows · Shift for fine · double-click resets';
  root.append(dial, input, label, valueEl);
  // Auto (the dot in the middle, as in the original): the knob drifts by itself around its value.
  if (opts.onAuto) {
    const ab = el('button', 'knob-auto' + (opts.auto ? ' on' : ''));
    ab.type = 'button'; ab.title = 'Auto: this knob drifts by itself around its value. Click again to stop.';
    ab.setAttribute('aria-label', 'Auto ' + (opts.label || '')); ab.setAttribute('aria-pressed', opts.auto ? 'true' : 'false');
    ab.dataset.auto = opts.property || '';
    ab.addEventListener('pointerdown', (e) => e.stopPropagation());
    ab.addEventListener('dblclick', (e) => e.stopPropagation());
    ab.addEventListener('click', (e) => { e.stopPropagation(); opts.onAuto(!ab.classList.contains('on')); });
    dial.append(ab); if (opts.auto) root.classList.add('auto');
  }
  if (opts.modulated) { const d = el('span', 'knob-mod'); d.title = 'Driven by a connected input'; root.append(d); }

  function render(shown = value) {
    const f = (shown - min) / (max - min || 1), z = min < 0 && max > 0 ? -min / (max - min) : 0;
    const a = Math.min(f, z) * 100, b = Math.max(f, z) * 100;
    fill.setAttribute('stroke-dasharray', b - a < 0.05 ? '0 200' : `0 ${a.toFixed(2)} ${(b - a).toFixed(2)} 200`);
    tick.setAttribute('transform', `rotate(${(f * 270 - 135).toFixed(1)} 20 20)`);
    const accent = `hsl(${(f * 140).toFixed(1)} 88% 58%)`;
    root.style.setProperty('--knob-accent', accent);
    valueEl.textContent = fmt(shown);
    input.value = value;
  }
  function set(v, fire) {
    const n = snap(v);
    if (n === value) { render(); return false; }
    value = n; render();
    if (fire) opts.onInput?.(value);
    return true;
  }
  const commit = () => opts.onChange?.(value);

  input.addEventListener('input', () => set(input.value, true));
  input.addEventListener('change', () => { set(input.value, true); commit(); });

  let drag = null;
  dial.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); input.focus({ preventScroll: true });
    try { dial.setPointerCapture(e.pointerId); } catch {}
    // Rotary drag, as in the original: the value follows the pointer's angle around the centre (270° = full range).
    const r = dial.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    drag = { id: e.pointerId, cx, cy, a: Math.atan2(e.clientY - cy, e.clientX - cx), raw: value, changed: false };
    root.classList.add('drag'); document.body.classList.add('knob-dragging');
  });
  dial.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.cx, dy = e.clientY - drag.cy;
    if (dx * dx + dy * dy < 36) { drag.a = null; return; }
    const a = Math.atan2(dy, dx); if (drag.a === null) { drag.a = a; return; }
    let da = a - drag.a; if (da > Math.PI) da -= 2 * Math.PI; else if (da < -Math.PI) da += 2 * Math.PI; drag.a = a;
    if (!da) return;
    drag.raw = Math.min(max, Math.max(min, drag.raw + da * 180 / Math.PI / 270 * (max - min) / (e.shiftKey ? 5 : 1)));
    if (set(drag.raw, true)) drag.changed = true;
  });
  const end = () => {
    if (!drag) return;
    const changed = drag.changed; drag = null;
    root.classList.remove('drag'); document.body.classList.remove('knob-dragging');
    if (changed) commit();
  };
  dial.addEventListener('pointerup', end);
  dial.addEventListener('pointercancel', end);
  dial.addEventListener('lostpointercapture', end);
  dial.addEventListener('dblclick', (e) => { e.preventDefault(); if (set(def, true)) commit(); });

  let wheelT = 0;
  dial.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dir = (Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? -e.deltaY : e.deltaX) > 0 ? 1 : -1;
    const big = Math.max(step, (max - min) / 100);
    if (set(value + dir * (e.shiftKey ? step : big), true)) {
      clearTimeout(wheelT); wheelT = setTimeout(commit, 250);
    }
  }, { passive: false });

  valueEl.addEventListener('click', () => {
    if (root.querySelector('.knob-edit')) return;
    const ed = el('input', 'knob-edit');
    ed.value = String(value); valueEl.hidden = true;
    root.insertBefore(ed, valueEl); ed.focus(); ed.select();
    let done = false;
    const close = (ok) => {
      if (done) return; done = true;
      const v = parseFloat(ed.value);
      ed.remove(); valueEl.hidden = false;
      if (ok && Number.isFinite(v) && set(v, true)) commit();
    };
    ed.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') close(true); else if (e.key === 'Escape') close(false);
    });
    ed.addEventListener('blur', () => close(true));
  });

  root.setValue = (v) => { value = snap(v); render(); };
  root.show = (v) => { if (!drag) render(Math.min(max, Math.max(min, v))); };
  root.getValue = () => value;
  root.input = input;
  render();
  return root;
}

// Balanced chip rows: when a row of chips doesn't fit, it splits into the fewest rows that do, as evenly as
// possible with the longer rows first (7 chips → 4 + 3, not 6 + 1), and never with one chip alone on a row when a
// split without one fits (wide labels: 2 + 2 + 3, not 2 + 2 + 2 + 1). Line breaks are inserted between the
// buttons, so they stay direct children. Flex chip rows are balanced again on resize.
const chipRO = typeof ResizeObserver !== 'undefined' ? new ResizeObserver((es) => { for (const e of es) for (const c of e.target.querySelectorAll(':scope > .chips')) balanceChips(c); }) : null;
export function balanceChips(root) {
  if (!root.isConnected || !root.offsetParent || root.classList.contains('toggle')) return;
  const style = getComputedStyle(root);
  if (style.display === 'grid') return;
  root.querySelectorAll(':scope > .chips-br').forEach((b) => b.remove());
  const items = [...root.children].filter((c) => c.offsetParent);items.forEach((b) => { b.style.order = ''; });
  const n = items.length, gap = parseFloat(style.columnGap) || 0, avail = root.clientWidth + .5, w = items.map((b) => b.getBoundingClientRect().width);
  const width = (row) => row.reduce((a, i, k) => a + w[i] + (k ? gap : 0), 0), lone = (rows) => rows.filter((r) => r.length === 1).length;
  // Best split into r rows (in order, any sizes): fewest lone chips, then the most even row widths, longer rows first.
  const best = (r) => { let top = null; const cut = [0], pre = [0];for (const x of w) pre.push(pre[pre.length - 1] + x);const span = (a, b) => pre[b] - pre[a] + gap * (b - a - 1);
    const go = (i, k) => { if (k === r - 1) { if (span(i, n) > avail) return; const st = [...cut, n], rows = []; for (let q = 0; q < r; q++) rows.push(Array.from({ length: st[q + 1] - st[q] }, (_, k) => st[q] + k));
        const ws = rows.map(width); let cost = lone(rows) * 1e6 + Math.max(...ws) - Math.min(...ws); for (let q = 1; q < r; q++) if (rows[q].length > rows[q - 1].length) cost += 1;
        if (!top || cost < top.cost) top = { cost, rows }; return; }
      for (let j = i + 1; j <= n - (r - 1 - k); j++) { if (span(i, j) > avail) break; cut.push(j); go(j, k + 1); cut.pop(); } };
    go(0, 0); return top; };
  // Even split first (row sizes differ by at most one, longer rows first); only if that leaves a chip alone, search any sizes.
  const even = (r) => { const rows = []; let i = 0; for (let k = 0; k < r; k++) { const len = Math.ceil((n - i) / (r - k)); rows.push(Array.from({ length: len }, (_, q) => i + q)); i += len; } return rows.every((x) => width(x) <= avail) ? rows : null; };
  let plan = null;
  if (n > 1 && items.some((b) => b.offsetTop !== items[0].offsetTop)) for (let r = 2; r <= n; r++) { const e = even(r); if (!e) continue; plan = e; if (!lone(e)) break;
    for (let rr = 2; rr <= Math.min(n, r + 1); rr++) { const b = best(rr); if (b && b.cost < 1e6) { plan = b.rows; break; } } break; }
  // Still a chip alone in the library? Pack them out of order (widest first, best fit), then lend lone rows a partner from a row of 3+.
  if (plan && lone(plan) && n > 3 && root.closest('#library')) {
    const rows = [];for (const i of [...items.keys()].sort((a, b) => w[b] - w[a])) { let at = null, room = Infinity;
      for (const r of rows) { const left = avail - width([...r, i]); if (left >= 0 && left < room) { room = left; at = r; } } at ? at.push(i) : rows.push([i]); }
    for (const r of rows) if (r.length === 1) for (const d of rows) if (d.length > 2) { const x = d.find((i) => width([r[0], i]) <= avail); if (x !== undefined) { d.splice(d.indexOf(x), 1); r.push(x); break; } }
    rows.forEach((r) => r.sort((a, b) => a - b));rows.sort((a, b) => a[0] - b[0]);
    if (lone(rows) < lone(plan) && rows.length <= plan.length + 1) plan = rows;
  }
  if (plan) { let o = 0; plan.forEach((r, q) => { if (q) { const br = Object.assign(document.createElement('i'), { className: 'chips-br', ariaHidden: 'true' }); br.style.order = o++; root.insertBefore(br, items[r[0]]); }
    for (const i of r) items[i].style.order = o++; }); }
  root.classList.toggle('balanced', !!plan);
}
const watchChips = (c) => { if (c.parentElement) chipRO?.observe(c.parentElement); requestAnimationFrame(() => balanceChips(c)); };
if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.classList.contains('chips')) watchChips(n); for (const c of n.querySelectorAll?.('.chips') || []) watchChips(c); } }).observe(document.documentElement, { childList: true, subtree: true });

export function chips(opts) {
  const root = el('div', 'chips');
  if (opts.property) root.dataset.property = opts.property;
  const items = (opts.options || []).map((o) => (Array.isArray(o) ? { value: o[0], label: o[1] } : o));
  let current = opts.value;
  const buttons = items.map((o) => {
    const b = el('button', 'mbtn');
    b.type = 'button'; b.dataset.value = String(o.value);
    if (opts.dot) b.append(el('span', 'dot'));
    b.append(document.createTextNode(o.label ?? String(o.value)));
    b.addEventListener('click', () => { root.setValue(o.value); opts.onChange?.(o.value); });
    root.append(b);
    return b;
  });
  root.setValue = (v) => {
    current = v;
    buttons.forEach((b, i) => {
      const on = String(items[i].value) === String(v);
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
    });
  };
  root.getValue = () => current;
  root.setValue(current);
  return root;
}

export function toggle(opts) {
  const [on, off] = opts.labels || ['On', 'Off'];
  const c = chips({
    options: [[true, on], [false, off]], value: !!opts.value, property: opts.property,
    onChange: (v) => opts.onChange?.(!!v),
  });
  c.classList.add('toggle');
  return c;
}

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

export function panel(opts) {
  const root = el('section', 'panel');
  if (opts.id) root.dataset.panel = opts.id;
  if (opts.color) root.style.setProperty('--cat', opts.color);
  const head = el('button', 'panel-head');
  head.type = 'button';
  head.append(...(opts.color ? [] : [el('span', 'dot')]), el('span', 'panel-title', opts.title || ''));
  if (opts.count != null) head.append(el('span', 'panel-count', String(opts.count)));
  head.append(el('span', 'panel-arrow', '▾'));
  const body = el('div', 'panel-body');
  root.append(head, body);
  const key = opts.id ? `agpro.panel.${opts.id}` : null;
  const saved = key ? store.get(key) : null;
  const open = saved != null ? saved === '1' : opts.open !== false;
  const apply = (o) => { root.classList.toggle('collapsed', !o); head.setAttribute('aria-expanded', o); };
  apply(open);
  head.addEventListener('click', () => {
    const o = root.classList.contains('collapsed');
    apply(o);
    if (key) store.set(key, o ? '1' : '0');
    // Only one section is open at a time: opening one folds its siblings.
    if (o && root.parentElement) for (const p of root.parentElement.querySelectorAll(':scope > .panel')) if (p !== root) collapse(p);
  });
  return { root, body };
}

function collapse(p) {
  if (p.classList.contains('collapsed')) return;
  p.classList.add('collapsed');
  p.querySelector(':scope > .panel-head')?.setAttribute('aria-expanded', false);
  if (p.dataset.panel) store.set(`agpro.panel.${p.dataset.panel}`, '0');
}

// Keeps at most one open section among the panels of a container (the first open one wins).
export function accordion(container) {
  const open = [...container.querySelectorAll(':scope > .panel:not(.collapsed)')];
  open.slice(1).forEach(collapse);
}

export function field(label, control) {
  const row = el('div', 'prop-row');
  row.append(el('span', 'prop-label', label), control);
  return row;
}

export function colorField(opts) {
  const input = el('input');
  input.type = 'color';
  input.value = opts.value || '#ffffff';
  if (opts.property) input.dataset.property = opts.property;
  input.addEventListener('input', () => opts.onChange?.(input.value));
  return field(opts.label || 'Color', input);
}
