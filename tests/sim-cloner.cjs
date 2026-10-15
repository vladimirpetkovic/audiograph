// v113: WebGPU 3D cloner (instancing, polygon animation, material editor) on real WebGPU.
// Run: AUDIOGRAPH_GPU_BUILD=versions/audiograph_114.html node tests/sim-cloner.cjs   (SHOTS=/dir saves screenshots)
const fs = require('node:fs');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && fs.existsSync(chrome)) process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = chrome;
process.env.AUDIOGRAPH_GPU_BUILD = process.env.AUDIOGRAPH_GPU_BUILD || 'versions/audiograph_114.html';
const assert = require('node:assert/strict');
const { open } = require('./gpu-common.cjs');
const SHOTS = process.env.SHOTS;
const feed = (page, n, amp = 0.6) => page.evaluate(([n, amp]) => {
  for (let i = 0; i < n; i++) {
    const sp = []; for (let j = 0; j < 64; j++) sp.push(amp * Math.max(0, (0.8 - 0.6 * j / 63) * (0.5 + 0.5 * Math.sin(i * 0.21 + j * 0.5))));
    agSim.inject({ spec: sp, onset: i % 20 === 0 ? 0.9 : 0 }); agSim.advance(1);
  }
}, [n, amp]);
const lit = page => page.evaluate(() => { renderDensity(); const d = frameCtx.getImageData(0, 0, frameCv.width, frameCv.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 15) + Math.abs(d[i + 1] - 15) + Math.abs(d[i + 2] - 15) > 24) n++; return n / (d.length / 4); });
const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.locator('#frameCv, canvas').first().screenshot({ path: `${SHOTS}/${name}.png` }).catch(() => page.screenshot({ path: `${SHOTS}/${name}.png` })); } };
(async () => {
  const { page, close, errors } = await open({ viewport: { width: 1280, height: 800 } });
  try {
    assert.equal(await page.evaluate(() => agSim.ready()), 'ready');
    await page.evaluate(() => { setLayout('simcloner'); renderDensity(); });
    assert.ok(await page.evaluate(() => !!document.querySelector('#simulationLayouts [onclick*="simcloner"]') && getComputedStyle(document.getElementById('layoutOpts_simcloner')).display !== 'none'), 'button+panel');
    await feed(page, 60);
    let info = await page.evaluate(() => agSim.cloner());
    assert.ok(info && !info.err, 'cloner info ' + JSON.stringify(info));
    assert.equal(info.n, 125); assert.ok(info.tris > 100);
    assert.ok(await lit(page) > 0.01, 'default sphere drew nothing');
    await shot(page, 'default');
    // clone counts follow X/Y/Z
    await page.evaluate(() => { for (const [id, v] of [['pG3Nx', 4], ['pG3Ny', 3], ['pG3Nz', 2]]) { const e = document.getElementById(id); e.value = v; simKnob(e); } });
    await feed(page, 10); info = await page.evaluate(() => agSim.cloner()); assert.equal(info.n, 24, 'grid 4x3x2');
    // the sound drives the effector: silence versus loud differ
    await page.evaluate(() => { agSim.inject({ spec: 0, onset: 0 }); agSim.advance(40); }); const quiet = await lit(page);
    await feed(page, 60, 1.2); const loud = await lit(page);
    assert.ok(Math.abs(loud - quiet) > 0.0005, `no sound reaction ${quiet} vs ${loud}`);
    // every preset draws, and all shapes / modes / styles compile and render
    const np = await page.evaluate(() => AG_SIM_PRESETS.simcloner.length);
    for (let i = 0; i < np; i++) {
      await page.evaluate(i => simApplyPreset(i), i); await feed(page, 70);
      assert.ok(await lit(page) > 0.002, `preset ${i} drew nothing`);
      await shot(page, 'preset' + i);
    }
    await page.evaluate(() => simApplyPreset(0));
    for (const [k, vals] of [['g3Shape', ['sphere', 'cube', 'torus', 'ico', 'cone']], ['g3Mode', ['grid', 'linear', 'ring', 'sphere', 'scatter']], ['g3Map', ['index', 'distance', 'x', 'y', 'z', 'random']], ['g3Style', ['solid', 'wire', 'edges']], ['g3CBy', ['clone', 'face', 'height', 'sound']], ['g3CSrc', ['palette', 'custom']], ['g3Shade', ['flat', 'smooth']]]) {
      for (const v of vals) { await page.evaluate(([k, v]) => setSimOpt(k, v), [k, v]); await feed(page, 6); assert.ok(await lit(page) > 0.001, `${k}=${v} drew nothing`); }
    }
    // randomisation: seed changes the layout, independent listening and random offsets keep rendering
    await page.evaluate(() => { setSimOpt('g3Mode', 'scatter'); const set = (id, v) => { const e = document.getElementById(id); e.value = v; simKnob(e); }; set('pG3Indep', 100); set('pG3RndPosX', 80); set('pG3RndRotY', 120); set('pG3RndScale', 50); set('pG3RndCol', 50); set('pG3RndSnd', 60); set('pG3RndAnim', 40); set('pG3Flip', 40); set('pG3Inner', 10); set('pG3StRotY', 20); set('pG3StScale', 50); });
    await feed(page, 20); const a = await lit(page);
    await page.evaluate(() => { const e = document.getElementById('pG3Seed'); e.value = 77; simKnob(e); }); await feed(page, 20);
    assert.ok(await lit(page) > 0.001 && a > 0.001, 'random layout drew nothing');
    await page.evaluate(() => { setSimOpt('g3Mode', 'grid'); simApplyPreset(0); });
    // material editor: transparency switches to the blended pipeline, colours persist into layer params
    await page.evaluate(() => { setSimOpt('g3Style', 'solid'); const a = document.getElementById('pG3Alpha'); a.value = 40; simKnob(a); const c = document.getElementById('pG3Col'); c.value = '#ff2200'; setSimOpt('g3CSrc', 'custom'); });
    await feed(page, 8); info = await page.evaluate(() => agSim.cloner()); assert.equal(info.pipe, 'blend');
    const params = await page.evaluate(() => getLayoutParams()); assert.equal(params.pG3Col, '#ff2200'); assert.equal(params._sim.g3CSrc, 'custom');
    await page.evaluate(p => { setLayoutParams(p); }, params); assert.equal(await page.evaluate(() => document.getElementById('pG3Col').value), '#ff2200');
    // ambient occlusion and motion blur: both run the post pass and still draw; off draws straight to the layer
    await page.evaluate(() => { simApplyPreset(0); const set = (id, v) => { const e = document.getElementById(id); e.value = v; simKnob(e); }; set('pG3Ao', 100); set('pG3Mb', 100); set('pG3EfX', 80); });
    await feed(page, 40); assert.ok(await lit(page) > 0.002, 'ao+blur drew nothing'); assert.equal(await page.evaluate(() => agSim.cloner().err), '');
    const withAo = await lit(page);
    await page.evaluate(() => { const set = (id, v) => { const e = document.getElementById(id); e.value = v; simKnob(e); }; set('pG3Ao', 0); set('pG3Mb', 0); });
    await feed(page, 20); const noAo = await lit(page); assert.ok(noAo > 0.002, 'fx off drew nothing');
    await shot(page, 'fxoff');
    // network mode with links, depth of field and every FX together
    await page.evaluate(() => { simApplyPreset(AG_SIM_PRESETS.simcloner.findIndex(p => p[0] === 'Neural network')); const set = (id, v) => { const e = document.getElementById(id); e.value = v; simKnob(e); }; set('pG3Dof', 100); set('pG3Focus', 10); set('pG3Ao', 60); set('pG3Mb', 60); });
    await feed(page, 40); assert.ok(await lit(page) > 0.002, 'network drew nothing'); assert.equal(await page.evaluate(() => agSim.cloner().err), '');
    await page.evaluate(() => { const e = document.getElementById('pG3Links'); e.value = 8; simKnob(e); setSimOpt('g3Mode', 'grid'); });
    await feed(page, 20); assert.ok(await lit(page) > 0.002, 'grid links drew nothing');
    // related knobs share one knob row
    const bad = await page.evaluate(() => { const out = []; for (const [k, ids] of Object.entries(AG_KNOB_GROUPS)) { const rows = ids.map(id => document.getElementById(id)).filter(Boolean).map(e => e.closest('.knob-grid')); if (rows.length !== ids.length) { out.push(k + ' missing'); continue; } if (new Set(rows).size !== 1) out.push(k + ' split'); } return out; });
    assert.deepEqual(bad, [], 'knob groups');
    // quality tiers, resize, restart
    for (const q of ['low', 'ultra', 'med']) { await page.evaluate(q => setSimOpt('q', q), q); await feed(page, 20); assert.ok(await lit(page) > 0.001, q + ' empty'); }
    await page.setViewportSize({ width: 800, height: 900 }); await feed(page, 20);
    await page.setViewportSize({ width: 1280, height: 800 }); await feed(page, 20);
    await page.evaluate(() => simRestart()); await feed(page, 20); assert.ok(await lit(page) > 0.001);
    // triangle budget trims huge arrays instead of failing
    await page.evaluate(() => { for (const id of ['pG3Nx', 'pG3Ny', 'pG3Nz']) { const e = document.getElementById(id); e.value = 40; simKnob(e); } const d = document.getElementById('pG3Detail'); d.value = 10; simKnob(d); });
    await feed(page, 10); info = await page.evaluate(() => agSim.cloner()); assert.ok(info.n < info.req && info.n > 0, 'budget trim ' + JSON.stringify(info));
    // stack with another sim, then a still export
    await page.evaluate(() => { simApplyPreset(0); addLayer(); setLayout('simfluid'); renderDensity(); }); await feed(page, 20);
    await page.evaluate(() => { setLayout('simcloner'); renderDensity(); });
    const ex = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 640; c.height = 400; agSim.expMode(true); try { const x = c.getContext('2d'); setLayout('simcloner'); renderDensity(); return agSim.stats().errorCount; } finally { agSim.expMode(false); } });
    assert.equal(ex, 0);
    const s = await page.evaluate(() => agSim.stats()); assert.equal(s.errorCount, 0, 'sim errors ' + JSON.stringify(s.errors));
    assert.deepEqual(errors, [], 'page errors');
    console.log('PASS sim-cloner (' + np + ' presets)');
  } finally { await close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
