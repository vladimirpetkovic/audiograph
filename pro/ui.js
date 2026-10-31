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
<radialGradient id="kg${id}" cx="40%" cy="30%" r="80%"><stop offset="0" stop-color="#2c2c31"/><stop offset="1" stop-color="#141417"/></radialGradient></defs>
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
  });
  return { root, body };
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
