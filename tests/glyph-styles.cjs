// v32: glyph styles (numbers/symbols/words) must honour Size in radial layouts on Canvas and GPU,
// and the built-in "flares" preset must load. Regression: a font cache went stale after ctx.restore().
const fs = require('node:fs');
process.env.AUDIOGRAPH_GPU_BUILD = process.env.AUDIOGRAPH_GLYPH_BUILD || process.env.AUDIOGRAPH_GPU_BUILD || 'versions/audiograph_32.html';
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && fs.existsSync(chrome)) process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = chrome;
const assert = require('node:assert/strict');
const g = require('./gpu-common.cjs');

(async () => {
  const s = await g.open();
  const p = s.page;
  try {
    const click = sel => p.evaluate(sel => [...document.querySelectorAll('[onclick]')].find(b => b.getAttribute('onclick').startsWith(sel)).click(), sel);
    const ink = (mode, size) => p.evaluate(([mode, size]) => {
      particlesOn = false; postFxEnabled = false;
      const e = document.getElementById('pStyleSize'); e.value = size; e.dispatchEvent(new Event('input'));
      agGpu.setMode(mode); renderDensity();
      const d = frameCtx.getImageData(0, 0, frameCv.width, frameCv.height).data; let k = 0;
      for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) + Math.abs(d[i + 2] - d[2]) > 30) k++;
      return k / (d.length / 4);
    }, [mode, size]);
    await p.evaluate(() => { particlesOn = false; postFxEnabled = false; document.getElementById('pLines').value = 200; upP(); });
    for (const layout of ['circle', 'spiral', 'linear']) {
      await click(`setLayout('${layout}'`);
      for (const shape of ['numbers', 'symbols', 'words']) {
        await click(`setShape('${shape}'`);
        for (const mode of ['canvas', 'gpu']) {
          const a = await ink(mode, 50), b = await ink(mode, 100), c = await ink(mode, 250);
          assert.ok(a < b && b < c && c > a * 2, `${layout}/${shape}/${mode}: Size must scale glyphs (${a.toFixed(4)} ${b.toFixed(4)} ${c.toFixed(4)})`);
        }
        await p.evaluate(() => { const e = document.getElementById('pStyleSize'); e.value = 100; e.dispatchEvent(new Event('input')); });
        const cv = await g.frame(p, 'canvas'), gp = await g.frame(p, 'gpu');
        const d = g.diff(cv, gp);
        assert.ok(d.big < 0.02, `${layout}/${shape}: GPU vs Canvas glyph parity ${JSON.stringify(d)}`);
      }
    }
    console.log('PASS: numbers/symbols/words scale with Size in circle, spiral and linear on Canvas and GPU, with GPU parity');

    const fl = await p.evaluate(() => {
      const keys = Object.keys(builtinPresets);
      applyState(JSON.parse(JSON.stringify(builtinPresets.flares)));
      const btn = [...document.querySelectorAll('#presetList button')].some(b => /flares$/.test(b.textContent));
      return { keys, btn, layers: stackLayouts.map(l => l.layout + ':' + l.params._lineShape).join(','), pfx: postFxEnabled };
    });
    assert.ok(fl.keys.includes('flares'), 'flares built-in exists');
    assert.ok(fl.btn, 'flares button listed');
    assert.equal(fl.layers, 'circle:pins,circle:straight,spiral:braille');
    assert.equal(fl.pfx, true);
    await p.waitForTimeout(500);
    assert.deepEqual(s.errors, []);
    console.log('PASS: built-in flares preset is listed and applies its three-layer composition with post-FX');
    console.log('glyph-styles: PASS');
  } finally { await s.close(); }
})().catch(e => { console.error(e); process.exit(1); });
