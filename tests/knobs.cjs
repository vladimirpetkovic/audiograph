// v32 knob UI: every panel range slider (except layer opacity, the Morph crossfader and global
// Intensity) is mirrored by exactly one role=slider knob, laid out 3 per row. Drag, wheel, keyboard and
// double-click drive the hidden range input through its real handlers; programmatic writes (presets,
// Reset, reactive rules, undo) are reflected on the knob; hidden rows hide their knob.
// Build: AUDIOGRAPH_KNOB_BUILD (default versions/audiograph_34.html).
process.env.AUDIOGRAPH_GPU_BUILD = process.env.AUDIOGRAPH_KNOB_BUILD || 'versions/audiograph_34.html';
const fs = require('node:fs');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && fs.existsSync(chrome)) process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = chrome;
const assert = require('node:assert/strict');
const { open } = require('./gpu-common.cjs');
const SHOT = process.env.AUDIOGRAPH_KNOB_SHOT; // optional screenshot path for visual review

const frames = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
// Every knob mirrors its input: aria-valuenow and the tick angle.
const MISMATCH = () => [...document.querySelectorAll('.knob')].filter(k => {
  const inp = k.previousElementSibling, v = +inp.value, mn = +inp.min || 0, mx = inp.max === '' ? 100 : +inp.max;
  const ang = (Math.max(0, Math.min(1, (v - mn) / (mx - mn))) * 270 - 135).toFixed(1);
  return +k.getAttribute('aria-valuenow') !== v || k.querySelector('.knob-tick').getAttribute('transform') !== `rotate(${ang} 20 20)`;
}).map(k => k.previousElementSibling.id || k.getAttribute('aria-label'));

(async () => {
  const t = await open({ viewport: { width: 1440, height: 900 } });
  const { page, errors } = t;
  try {
    await page.evaluate(() => { document.querySelectorAll('.panel').forEach(p => { if (p.id !== 'panelMapping') p.classList.remove('closed'); }); addReactiveRule(); });
    await frames(page);

    // 1. One knob per eligible range; exclusions stay native sliders.
    const census = await page.evaluate(() => {
      const all = [...document.querySelectorAll('input[type=range]')];
      const excluded = el => /^(morphSlider|pIntensity)$/.test(el.id) || !!el.closest('#layersList,.cp-stop') || !(el.closest('.panel .prow') || el.classList.contains('rule-strength'));
      const bad = [];
      let eligible = 0;
      all.forEach(el => {
        const knobs = el.parentElement.querySelectorAll(':scope > .knob').length, next = el.nextElementSibling;
        if (excluded(el)) { if (el._knob || el.classList.contains('knob-src')) bad.push('excluded has knob ' + el.id); return; }
        eligible++;
        if (knobs !== 1 || !next.classList.contains('knob') || next.getAttribute('role') !== 'slider') bad.push('knob count ' + (el.id || el.className) + '=' + knobs);
        if (!next.getAttribute('aria-label') || next.getAttribute('aria-label') === 'Value') bad.push('aria-label ' + el.id);
      });
      const op = document.querySelector('#layersList input[type=range]'), r = op.getBoundingClientRect();
      return { eligible, knobs: document.querySelectorAll('.knob').length, bad, rule: !!document.querySelector('.rule-row .knob'),
        opacity: { visible: r.width > 20 && r.height > 0 && getComputedStyle(op).opacity !== '0', knob: !!op._knob },
        morph: !document.getElementById('morphSlider')._knob && document.getElementById('morphSlider').getBoundingClientRect().width > 40,
        intensity: !document.getElementById('pIntensity')._knob };
    });
    assert.deepEqual(census.bad, []);
    assert.ok(census.eligible >= 140, 'eligible ranges ' + census.eligible);
    assert.equal(census.knobs, census.eligible);
    assert.ok(census.rule, 'dynamic reactive rule strength gets a knob');
    assert.deepEqual(census.opacity, { visible: true, knob: false }, 'layer opacity stays a visible slider');
    assert.ok(census.morph && census.intensity, 'morph crossfader and global intensity stay sliders');
    const sizes = await page.evaluate(() => {
      const k = document.querySelector('#pLines + .knob').getBoundingClientRect();
      if (typeof setAutoTab === 'function') setAutoTab('reactive');
      if (!document.querySelector('.rule-row .knob.inline')) addReactiveRule();
      const inline = document.querySelector('.rule-row .knob.inline').getBoundingClientRect();
      return { knob: [Math.round(k.width), Math.round(k.height)], inline: [Math.round(inline.width), Math.round(inline.height)] };
    });
    assert.deepEqual(sizes, { knob: [68, 68], inline: [40, 40] }, 'v34 knob sizes');

    // 2. Three per row.
    const layout = await page.evaluate(() => ['panelGeo', 'panelFx', 'panelPostFx', 'panelEQ'].map(id => {
      const rows = [];
      document.querySelectorAll('#' + id + ' .knob-grid').forEach(g => {
        const cells = [...g.children].filter(c => c.offsetParent), tops = cells.map(c => Math.round(c.getBoundingClientRect().top));
        const byTop = {}; tops.forEach(tp => { byTop[tp] = (byTop[tp] || 0) + 1; });
        rows.push(...Object.values(byTop));
        const lefts = cells.slice(0, 3).map(c => c.getBoundingClientRect().left);
        if (cells.length >= 3 && !(lefts[0] < lefts[1] && lefts[1] < lefts[2])) rows.push(-1);
      });
      return { id, rows };
    }));
    for (const { id, rows } of layout) {
      assert.ok(rows.length > 0, id + ' has knob rows');
      assert.ok(rows.every(n => n >= 1 && n <= 3), id + ' rows ' + rows);
      if (id !== 'panelPostFx') assert.ok(rows.some(n => n === 3), id + ' fills 3 per row ' + rows);
    }
    const grouped = await page.evaluate(() => {
      const top = id => Math.round(document.querySelector('#' + id).closest('.knob-cell').getBoundingClientRect().top);
      const rowCenter = id => {
        const cell = document.querySelector('#' + id).closest('.knob-cell'), grid = cell.parentElement, gr = grid.getBoundingClientRect(), cr = cell.getBoundingClientRect();
        const row = [...grid.children].filter(c => Math.round(c.getBoundingClientRect().top) === Math.round(cr.top));
        const l = Math.min(...row.map(c => c.getBoundingClientRect().left)), r = Math.max(...row.map(c => c.getBoundingClientRect().right));
        return Math.abs((l + r) / 2 - (gr.left + gr.right) / 2);
      };
      const morph = document.querySelector('.morph-combo-row').getBoundingClientRect(), dur = document.getElementById('morphDur').closest('.knob-cell').getBoundingClientRect();
      return {
        thickFade: top('pThick') === top('pFadeEdge'),
        scaleRotation: top('pZoom') === top('pRotation'),
        offset: top('pOffX') === top('pOffY'),
        disorderJitter: top('rDisorder') === top('pJitter'),
        centeredPairs: ['pZoom', 'pOffX', 'rDisorder'].map(rowCenter),
        morphSameRow: Math.abs((morph.top + morph.bottom) / 2 - (dur.top + dur.bottom) / 2) < 20,
        morphSliderWidth: document.getElementById('morphSlider').getBoundingClientRect().width,
      };
    });
    assert.ok(grouped.thickFade && grouped.scaleRotation && grouped.offset && grouped.disorderJitter, JSON.stringify(grouped));
    assert.ok(grouped.centeredPairs.every(x => x < 2), 'two-knob rows centered ' + grouped.centeredPairs.join());
    assert.ok(grouped.morphSameRow && grouped.morphSliderWidth <= 120, 'morph duration shares shortened slider row ' + JSON.stringify(grouped));

    // 3. Drag: pLines up = more lines, real handler (upP -> vLines, layer params), change on release.
    await page.evaluate(() => { window.__ev = []; const el = document.getElementById('pLines'); el.addEventListener('input', () => __ev.push('input')); el.addEventListener('change', () => __ev.push('change')); });
    const kLines = page.locator('#pLines + .knob');
    await kLines.scrollIntoViewIfNeeded();
    const b = await kLines.boundingBox();
    const v0 = +(await page.locator('#pLines').inputValue());
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2, R = 25;
    // Rotary drag: move the pointer along a circle around the knob centre (screen degrees, 0 = right, 90 = down).
    const turn = async (from, to, steps = 12) => {
      const pt = a => [cx + R * Math.cos(a * Math.PI / 180), cy + R * Math.sin(a * Math.PI / 180)];
      await page.mouse.move(...pt(from)); await page.mouse.down();
      for (let i = 1; i <= steps; i++) await page.mouse.move(...pt(from + (to - from) * i / steps));
      await page.mouse.up();
    };
    const L = await page.evaluate(() => ({ mn: +pLines.min, mx: +pLines.max }));
    await turn(-90, 0); // a quarter turn clockwise
    const drag = await page.evaluate(() => ({ v: +document.getElementById('pLines').value, txt: document.getElementById('vLines').textContent, lines: getLayoutParams()._lines, ev: __ev.slice(),
      aria: +document.querySelector('#pLines + .knob').getAttribute('aria-valuenow') }));
    const expect = (L.mx - L.mn) * 90 / 270;
    assert.ok(Math.abs(drag.v - v0 - expect) <= (L.mx - L.mn) * 0.04, `clockwise quarter turn raises pLines by ~1/3 range ${v0} -> ${drag.v}`);
    assert.equal(drag.txt, String(drag.v)); assert.equal(drag.lines, drag.v); assert.equal(drag.aria, drag.v);
    assert.ok(drag.ev.includes('input') && drag.ev[drag.ev.length - 1] === 'change', 'input events then change: ' + drag.ev.join());
    // Counter-clockwise lowers it.
    await turn(0, -60);
    const v1 = +(await page.locator('#pLines').inputValue());
    assert.ok(v1 < drag.v, 'counter-clockwise lowers');
    // A long continuous clockwise turn keeps increasing past halfway (no bounce back) and stops at max.
    await page.evaluate(() => { pLines.value = pLines.min; pLines.dispatchEvent(new Event('input', { bubbles: true })); });
    const seen = [];
    await page.mouse.move(cx + R * Math.cos(135 * Math.PI / 180), cy + R * Math.sin(135 * Math.PI / 180)); await page.mouse.down();
    for (let i = 1; i <= 36; i++) { const a = (135 + i * 10) * Math.PI / 180; await page.mouse.move(cx + R * Math.cos(a), cy + R * Math.sin(a)); seen.push(+(await page.locator('#pLines').inputValue())); }
    await page.mouse.up();
    assert.ok(seen.every((x, i) => i === 0 || x >= seen[i - 1]), 'monotonic while turning clockwise: ' + seen.join());
    assert.equal(seen[seen.length - 1], L.mx, 'turning past the end clamps at max');
    // Shift is fine control.
    await page.evaluate(() => { pLines.value = 350; pLines.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.keyboard.down('Shift'); await turn(-90, 0); await page.keyboard.up('Shift');
    const v2 = +(await page.locator('#pLines').inputValue());
    assert.ok(v2 > 350 && v2 - 350 < expect / 2, `shift turn is fine 350 -> ${v2}`);

    // 4. Double-click resets to the HTML default.
    await kLines.dblclick();
    assert.equal(await page.evaluate(() => [document.getElementById('pLines').value, document.getElementById('vLines').textContent].join()), '350,350');

    // 5. Wheel over a knob changes it and does not scroll the panel column.
    const kCon = page.locator('#pContrast + .knob'), cb = await kCon.boundingBox();
    const sc0 = await page.evaluate(() => [document.getElementById('controlsArea').scrollTop, +document.getElementById('pContrast').value]);
    await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2); await page.mouse.wheel(0, -100); await page.waitForTimeout(80);
    const sc1 = await page.evaluate(() => [document.getElementById('controlsArea').scrollTop, +document.getElementById('pContrast').value, document.getElementById('vContrast').textContent]);
    assert.equal(sc1[0], sc0[0], 'no panel scroll while wheeling a knob');
    assert.ok(sc1[1] > sc0[1], `wheel up raises contrast ${sc0[1]} -> ${sc1[1]}`); assert.match(sc1[2], new RegExp('^' + sc1[1]));
    await page.mouse.wheel(0, 100); await page.waitForTimeout(80);
    assert.equal(+(await page.locator('#pContrast').inputValue()), sc0[1], 'wheel down undoes');

    // 6. Keyboard on a bipolar knob (-100..100): arrows, PageUp, Home/End; fill arc starts at zero.
    const kTw = page.locator('#pTwist + .knob');
    await kTw.focus();
    const keyv = async k => { await page.keyboard.press(k); return +(await page.locator('#pTwist').inputValue()); };
    assert.equal(await keyv('ArrowUp'), 1); assert.equal(await keyv('ArrowLeft'), 0); assert.equal(await keyv('PageUp'), 20);
    assert.equal(await keyv('End'), 100); assert.equal(await keyv('Home'), -100);
    assert.equal(await page.locator('#vTwist').textContent(), '-100');
    assert.equal(await kTw.locator('.knob-fill').getAttribute('stroke-dasharray'), '0 0.00 50.00 200', 'bipolar fill from centre');
    await keyv('End'); await keyv('Home');
    assert.equal(await page.evaluate(() => getLayoutParams()._twist), -100, 'knob keyboard reaches the layer params');

    // 7. Programmatic writes are mirrored: preset, reactive rule animation, Reset, Undo.
    await page.evaluate(() => applyState(JSON.parse(JSON.stringify(builtinPresets.flares)))); await frames(page);
    assert.deepEqual(await page.evaluate(MISMATCH), [], 'after preset');
    await page.evaluate(async () => {
      reactiveRules.length = 0; addReactiveRule(); reactiveRules[0].source = 'energy'; reactiveRules[0].target = 'twist'; reactiveRules[0].strength = 100; captureReactiveBases();
      safeSetTime(1); if (!playing) togglePlay(); await new Promise(r => setTimeout(r, 1200)); if (playing) togglePlay();
    });
    await frames(page);
    assert.deepEqual(await page.evaluate(MISMATCH), [], 'after reactive playback');
    await page.evaluate(() => [...document.querySelectorAll('.top-actions .btn, .transport .btn')].find(b => b.textContent.trim() === 'Reset').click()); await frames(page);
    assert.deepEqual(await page.evaluate(MISMATCH), [], 'after Reset');
    assert.equal(await page.locator('#pLines + .knob').getAttribute('aria-valuenow'), '350');
    await page.evaluate(() => undo()); await frames(page);
    assert.deepEqual(await page.evaluate(MISMATCH), [], 'after Undo');
    const syncCost = await page.evaluate(() => agKnobs.stats());
    assert.ok(syncCost.flushMs / Math.max(1, syncCost.flushes) < 4, 'knob sync flush is cheap ' + JSON.stringify(syncCost));

    // 8. Rows hidden by existing logic hide their knob.
    const hid = await page.evaluate(() => {
      const vis = id => !!document.querySelector('#' + id + ' + .knob').offsetParent;
      updateStyleOpts('straight'); const a = [vis('pStyleSize'), vis('pStyleAngle')];
      updateStyleOpts('numbers'); const b = [vis('pStyleSize'), vis('pStyleAngle')];
      const sym = document.querySelector('[onclick^="setSymmetry(\'none\'"]'); sym.click(); const c = vis('pSymGap');
      document.querySelector('[onclick^="setSymmetry(\'x\'"]').click(); const d = vis('pSymGap'); sym.click();
      return { a, b, c, d };
    });
    assert.deepEqual(hid, { a: [false, false], b: [true, true], c: false, d: true });

    // Screenshot for visual review.
    await page.evaluate(() => { applyState(JSON.parse(JSON.stringify(builtinPresets.flares))); });
    await frames(page);
    await page.locator('#panelGeo').scrollIntoViewIfNeeded();
    if (SHOT) await page.locator('#panelGeo').screenshot({ path: SHOT });
    assert.deepEqual(errors, []);
    console.log(`knobs: PASS (${census.knobs} knobs; sync ${syncCost.renders} renders in ${syncCost.flushes} flushes, ${(syncCost.flushMs / Math.max(1, syncCost.flushes)).toFixed(3)} ms/flush)${SHOT ? ' -> ' + SHOT : ''}`);
  } finally { await t.close(); }
})().catch(e => { console.error(e); process.exit(1); });
