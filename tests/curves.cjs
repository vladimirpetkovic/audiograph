// v69: Harmonic (Lissajous), Rose and Spiro layouts render, react to controls, persist, and work with styles.
process.env.AUDIOGRAPH_PARTICLE_BUILD = process.env.AUDIOGRAPH_CURVES_BUILD || 'versions/audiograph_69.html';
process.env.AUDIOGRAPH_BUILD_31 = process.env.AUDIOGRAPH_PARTICLE_BUILD;
const fs = require('node:fs');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && fs.existsSync(chrome)) process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = chrome;
const assert = require('node:assert/strict');
const { open } = require('./audio-common.cjs');

(async () => {
  const t = await open({ viewport: { width: 1280, height: 800 } });
  const { page, errors } = t;
  const ink = () => page.evaluate(() => { const c = document.getElementById('frameCv'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 16) if (d[i] > 20) n++; return n; });
  const sig = () => page.evaluate(() => { const c = document.getElementById('frameCv'); return c.toDataURL().length + ':' + c.toDataURL().slice(-200); });
  try {
    for (const [id, slider, a, b] of [['lissajous', 'pLisA', 2, 5], ['rose', 'pRoseN', 3, 7], ['spiro', 'pSpiW', 2, 4]]) {
      await page.evaluate(id => { if (playing) togglePlay(); setLayout(id, [...document.querySelectorAll('.mbtn')].find(b => (b.getAttribute('onclick') || '').includes("setLayout('" + id + "'"))); renderDensity(); }, id);
      assert.ok(await page.evaluate(id => document.getElementById('layoutOpts_' + id).style.display !== 'none', id), id + ' options shown');
      const n0 = await ink(); assert.ok(n0 > 300, id + ' draws: ' + n0);
      const set = v => page.evaluate(([s, v]) => { const e = document.getElementById(s); e.value = v; e.dispatchEvent(new Event('input')); renderDensity(); }, [slider, v]);
      await set(a); const s1 = await sig(); await set(b); const s2 = await sig();
      assert.notEqual(s1, s2, id + ' control changes the picture');
      for (const shape of ['inkwater', 'tapered', 'dotted']) {
        await page.evaluate(sh => { lineShape = sh; renderDensity(); }, shape);
        assert.ok(await ink() > 100, id + ' draws with ' + shape);
      }
      await page.evaluate(() => { lineShape = 'straight'; });
      const rt = await page.evaluate(() => { const st = getState(); applyState(JSON.parse(JSON.stringify(st))); return layoutMode; });
      assert.equal(rt, id, id + ' survives save/load');
      assert.equal(await page.evaluate(s => +document.getElementById(s).value, slider), b, id + ' slider persists');
    }
    assert.deepEqual(errors, []);
    console.log('curves: PASS (lissajous, rose, spiro)');
  } finally { await t.close(); }
})().catch(e => { console.error(e); process.exit(1); });
