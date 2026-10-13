// v109: Reaction-diffusion, Slime mould, Wave ripples, Cloth and Gravity on real WebGPU.
// Run: AUDIOGRAPH_GPU_BUILD=versions/audiograph_111.html node tests/sim-new.cjs
const fs = require('node:fs');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && fs.existsSync(chrome)) process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = chrome;
process.env.AUDIOGRAPH_GPU_BUILD = process.env.AUDIOGRAPH_GPU_BUILD || 'versions/audiograph_111.html';
const assert = require('node:assert/strict');
const { open } = require('./gpu-common.cjs');
const KINDS = ['simrd', 'simslime'];
const feed = (page, n) => page.evaluate(n => {
  for (let i = 0; i < n; i++) {
    const sp = []; for (let j = 0; j < 64; j++) sp.push(0.6 * Math.max(0, (0.8 - 0.6 * j / 63) * (0.5 + 0.5 * Math.sin(i * 0.21 + j * 0.5))));
    agSim.inject({ spec: sp, onset: i % 20 === 0 ? 0.9 : 0 }); agSim.advance(1);
  }
}, n);
const lit = page => page.evaluate(() => { renderDensity(); const d = frameCtx.getImageData(0, 0, frameCv.width, frameCv.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 15) + Math.abs(d[i + 1] - 15) + Math.abs(d[i + 2] - 18) > 30) n++; return n / (d.length / 4); });
(async () => {
  const { page, close, errors } = await open({ viewport: { width: 1280, height: 800 } });
  try {
    assert.equal(await page.evaluate(() => agSim.ready()), 'ready');
    for (const k of KINDS) {
      await page.evaluate(k => { setLayout(k); renderDensity(); }, k);
      assert.ok(await page.evaluate(k => !!document.querySelector(`#simulationLayouts [onclick*="'${k}'"]`) && getComputedStyle(document.getElementById('layoutOpts_' + k)).display !== 'none', k), k + ' button+panel');
      const np = await page.evaluate(k => AG_SIM_PRESETS[k].length, k);
      for (let i = 0; i < np; i++) {
        await page.evaluate(i => simApplyPreset(i), i); await feed(page, 70);
        const f = await lit(page); assert.ok(f > 0.002, `${k} preset ${i} drew nothing (${f})`);
      }
      for (const q of ['low', 'ultra']) {
        await page.evaluate(q => setSimOpt('q', q), q); await feed(page, 30);
        assert.ok(await lit(page) > 0.002, `${k} ${q} empty`);
      }
      await page.evaluate(() => setSimOpt('q', 'med'));
      await page.setViewportSize({ width: 800, height: 900 }); await feed(page, 20);
      await page.setViewportSize({ width: 1280, height: 800 }); await feed(page, 20);
      const s = await page.evaluate(() => agSim.stats()); assert.equal(s.errorCount, 0, k + ' sim errors ' + JSON.stringify(s.errors));
      console.log('  ok  ' + k + ' (' + np + ' presets, low/ultra, resize)');
    }
    // stack: two new sims at once, then back to a plain layout (state disposed)
    await page.evaluate(() => { setLayout('simslime'); addLayer(); setLayout('simrd'); renderDensity(); });
    await feed(page, 20); assert.ok((await page.evaluate(() => agSim.stats())).live >= 2);
    await page.evaluate(() => { setLayout('circle'); renderDensity(); });
    // restart keeps working
    await page.evaluate(() => { setLayout('simrd'); simRestart(); }); await feed(page, 20); assert.ok(await lit(page) > 0.0005);
    // export a still
    const ex = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 640; c.height = 400; agSim.expMode(true); try { const x = c.getContext('2d'); setLayout('simslime'); renderDensity(); return agSim.stats().errorCount; } finally { agSim.expMode(false); } });
    assert.equal(ex, 0);
    assert.deepEqual(errors, [], 'page errors');
    const fin = await page.evaluate(() => agSim.stats()); assert.equal(fin.errorCount, 0, JSON.stringify(fin.errors));
    console.log('PASS sim-new');
  } finally { await close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
