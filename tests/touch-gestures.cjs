// v33 touch gestures on the main canvas: one finger moves 2D layers (orbits 3D layouts),
// two fingers pinch to scale and twist to rotate; the page itself must not scroll.
process.env.AUDIOGRAPH_GPU_BUILD = process.env.AUDIOGRAPH_TOUCH_BUILD || 'versions/audiograph_33.html';
const fs = require('node:fs');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && fs.existsSync(chrome)) process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = chrome;
const assert = require('node:assert/strict');
const { open } = require('./gpu-common.cjs');

(async () => {
  const t = await open({ viewport: { width: 1180, height: 820 } });
  const { page, errors } = t;
  try {
    const cdp = await page.context().newCDPSession(page);
    const box = await page.locator('#frameCv').boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
    const read = () => page.evaluate(() => ({ x: +pOffX.value, y: +pOffY.value, zoom: +pZoom.value, rot: +pRotation.value, vZoom: vZoom.textContent, rx: dragRotX, ry: dragRotY, scroll: document.scrollingElement.scrollTop + window.scrollY }));

    const before = await read();
    await touch('touchStart', [[cx, cy]]);
    for (let i = 1; i <= 5; i++) await touch('touchMove', [[cx + i * box.width * 0.04, cy + i * box.height * 0.02]]);
    await touch('touchEnd', []);
    let s = await read();
    assert.ok(s.x >= before.x + 15 && s.y >= before.y + 6, 'one-finger drag moves visuals: ' + JSON.stringify(s));
    assert.equal(s.scroll, before.scroll, 'page did not scroll');

    // Two-finger pinch out (x2) with a 30 degree twist.
    const r0 = 60, r1 = 120, a1 = Math.PI / 6;
    await touch('touchStart', [[cx - r0, cy], [cx + r0, cy]]);
    for (let i = 1; i <= 6; i++) {
      const r = r0 + (r1 - r0) * i / 6, a = a1 * i / 6;
      await touch('touchMove', [[cx - r * Math.cos(a), cy - r * Math.sin(a)], [cx + r * Math.cos(a), cy + r * Math.sin(a)]]);
    }
    await touch('touchEnd', []);
    const p = await read();
    assert.equal(p.zoom, 200, 'pinch scales x2: ' + JSON.stringify(p));
    assert.equal(p.vZoom, '200%');
    assert.ok(Math.abs(p.rot - 30) <= 1, 'twist rotates ~30deg: ' + p.rot);
    assert.ok(Math.abs(p.x - s.x) <= 1 && Math.abs(p.y - s.y) <= 1, 'centred pinch does not drift');
    const knob = await page.evaluate(() => document.querySelector('#pZoom').closest('.prow').querySelector('.knob').getAttribute('aria-valuenow'));
    assert.equal(knob, '200', 'scale knob mirrors gesture');

    // 3D layout: one finger orbits instead of moving.
    await page.evaluate(() => { const b = [...document.querySelectorAll('.mbtn')].find(b => /setLayout\('sphere'/.test(b.getAttribute('onclick') || '')); b.click(); });
    const b3 = await read();
    await touch('touchStart', [[cx, cy]]);
    for (let i = 1; i <= 4; i++) await touch('touchMove', [[cx + i * 20, cy + i * 10]]);
    await touch('touchEnd', []);
    const o = await read();
    assert.ok(o.ry > b3.ry + 0.4 && o.rx > b3.rx + 0.2, 'one finger orbits 3D: ' + JSON.stringify(o));
    assert.equal(o.x, b3.x, '3D orbit leaves offset alone');

    // Mouse drag still pans 2D layouts.
    await page.evaluate(() => { const b = [...document.querySelectorAll('.mbtn')].find(b => /setLayout\('linear'/.test(b.getAttribute('onclick') || '')); b.click(); });
    const m0 = await read();
    await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx - 100, cy, { steps: 4 }); await page.mouse.up();
    const m1 = await read();
    assert.ok(m1.x < m0.x - 5, 'mouse drag still pans');

    assert.deepEqual(errors, []);
    console.log('touch-gestures: PASS (1-finger move, pinch scale, twist rotate, 3D orbit, no page scroll)');
  } finally { await t.close(); }
})().catch(e => { console.error(e); process.exit(1); });
