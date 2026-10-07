// v38: LED-equalizer text style and built-in Cube/Torus 3D objects.
process.env.AUDIOGRAPH_PARTICLE_BUILD = process.env.AUDIOGRAPH_TEXTLED_BUILD || 'versions/audiograph_38.html';
process.env.AUDIOGRAPH_BUILD_31 = process.env.AUDIOGRAPH_PARTICLE_BUILD;
const fs = require('node:fs');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && fs.existsSync(chrome)) process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = chrome;
const assert = require('node:assert/strict');
const { open, wav, sine, load } = require('./audio-common.cjs');
const SHOTS = process.env.AG_SHOTS || '';

(async () => {
  const t = await open({ viewport: { width: 1280, height: 800 } });
  const { page, errors } = t;
  try {
    const tone = wav([[8, sine(110, 0.6)]], 'tone.wav');
    await load(page, { name: tone.name, mimeType: tone.mimeType, buffer: tone.buffer });
    await page.evaluate(() => { particlesOn = false; if (!playing) togglePlay(); });
    await page.waitForTimeout(600);
    const stat = () => page.evaluate(() => { const d = frameCtx.getImageData(0, 0, frameCv.width, frameCv.height).data; let s = 0, ink = 0, g = 0, r = 0; for (let i = 0; i < d.length; i += 4) { const v = d[i] + d[i + 1] + d[i + 2]; s = (s * 31 + v) >>> 0; if (v > 60) { ink++; if (d[i + 1] > d[i] + 20) g++; if (d[i] > d[i + 1] + 20) r++; } } return { hash: s, ink: ink / (d.length / 4), green: g / Math.max(1, ink), red: r / Math.max(1, ink) }; });
    const click = sel => page.evaluate(sel => [...document.querySelectorAll('.mbtn')].find(b => (b.getAttribute('onclick') || '').includes(sel)).click(), sel);

    // 3D Object: Knot, Cube and Torus all render distinct wireframes; state persists per layer.
    await click("setLayout('object'");
    const objs = {};
    for (const m of ['knot', 'cube', 'torus']) {
      await click(`setObjModel('${m}'`);
      await page.waitForTimeout(300);
      objs[m] = await stat();
      if (SHOTS) await page.locator('#frameCv').screenshot({ path: `${SHOTS}/obj-${m}.png` });
      assert.ok(objs[m].ink > 0.003, m + ' renders: ' + JSON.stringify(objs[m]));
      assert.equal(await page.evaluate(() => objBuiltin), m);
    }
    assert.ok(new Set(Object.values(objs).map(o => o.hash)).size === 3, 'models differ');
    const fileBtn = await page.evaluate(() => document.getElementById('objModelFileBtn').disabled);
    assert.equal(fileBtn, true, 'File is disabled until an OBJ is loaded');
    const saved = await page.evaluate(() => { const st = getState(); return JSON.stringify(st).includes('"_objModel":"torus"'); });
    assert.ok(saved, 'object model saved with layer state');

    // Text: LED style default, Direction hidden, Colour visible; EQ colours are green-dominant.
    await click("setLayout('text'");
    await page.waitForTimeout(500);
    const ui = await page.evaluate(() => ({ st: textLayoutStyle, dir: getComputedStyle(rowTextDir).display, col: getComputedStyle(rowTextCol).display }));
    assert.deepEqual(ui, { st: 'led', dir: 'none', col: 'flex' === ui.col ? 'flex' : ui.col });
    assert.equal(ui.dir, 'none');
    assert.notEqual(ui.col, 'none');
    const led = await stat();
    if (SHOTS) await page.locator('#frameCv').screenshot({ path: `${SHOTS}/text-led.png` });
    assert.ok(led.ink > 0.01, 'LED text renders: ' + JSON.stringify(led));
    assert.ok(led.green > 0.3, 'EQ gradient is green at the bottom: ' + JSON.stringify(led));
    await click("setTextStyle('lines'");
    await page.waitForTimeout(300);
    const lines = await stat();
    if (SHOTS) await page.locator('#frameCv').screenshot({ path: `${SHOTS}/text-lines.png` });
    assert.ok(lines.ink > 0.003 && lines.hash !== led.hash, 'Lines style still works');
    assert.notEqual(await page.evaluate(() => getComputedStyle(rowTextDir).display), 'none', 'Direction visible in Lines');
    await click("setTextStyle('led'");

    assert.deepEqual(errors, []);
    console.log('text-led: PASS (LED/Lines styles, Knot/Cube/Torus models)');
  } finally { await t.close(); }
})().catch(e => { console.error(e); process.exit(1); });
