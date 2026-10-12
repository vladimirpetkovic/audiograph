// v85: WebGPU simulation layouts (Particle field, Fluid, Smoke) on real native Chrome WebGPU.
// Run: node tests/simulation.cjs   (SKIPs loudly, never passes, when WebGPU is unavailable; AUDIOGRAPH_REQUIRE_WEBGPU=1 turns the skip into a failure)
process.env.AUDIOGRAPH_PARTICLE_BUILD = process.env.AUDIOGRAPH_SIM_BUILD || 'versions/audiograph_85.html';
process.env.AUDIOGRAPH_GPU_BUILD = process.env.AUDIOGRAPH_PARTICLE_BUILD;
const fs = require('node:fs'), http = require('node:http'), path = require('node:path');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && fs.existsSync(chrome)) process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = chrome;
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { open } = require('./gpu-common.cjs');
const OUT = process.env.AUDIOGRAPH_SIM_SHOTS || '/Users/petkovic/.copilot/session-state/2b2968de-ab6c-4f2c-8575-016c32bb8774/files/sim85';
const results = [];
const ok = (name, extra = '') => { results.push(name); console.log('  ok  ' + name + (extra ? '  ' + extra : '')); };

// Time-varying synthetic spectrum (the same feed on every run) injected through the audio test hook.
const feed = (page, n, amp = 0.55, onsetEvery = 28) => page.evaluate(({ n, amp, onsetEvery }) => {
  for (let i = 0; i < n; i++) {
    const sp = []; for (let j = 0; j < 64; j++) { const f = j / 63; sp.push(amp * Math.max(0, (0.8 - 0.6 * f) * (0.5 + 0.5 * Math.sin(i * 0.21 + j * 0.5)) * (0.6 + 0.4 * Math.sin(i * 0.05)))); }
    agSim.inject({ spec: sp, onset: onsetEvery && i % onsetEvery === 0 ? 0.9 : 0 }); agSim.advance(1);
  }
}, { n, amp, onsetEvery });
const grab = page => page.evaluate(() => { renderDensity(); const d = frameCtx.getImageData(0, 0, frameCv.width, frameCv.height).data, bg = [15, 15, 18]; let lit = 0, sum = 0; const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) { const e = Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]); if (e > 30) lit++; sum += d[i] + d[i + 1] + d[i + 2]; }
  return { lit: lit / n, mean: sum / n / 3, data: Array.from(d.filter((_, i) => i % 97 === 0)) }; });
const mad = (a, b) => a.data.reduce((s, v, i) => s + Math.abs(v - b.data[i]), 0) / a.data.length;
const st = page => page.evaluate(() => agSim.stats());
const layerStat = async page => Object.values((await st(page)).layers);

async function unsupportedCase() {
  const html = fs.readFileSync(path.join(__dirname, '..', process.env.AUDIOGRAPH_PARTICLE_BUILD));
  const server = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(html); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    await ctx.addInitScript(() => { try { delete Navigator.prototype.gpu; } catch (e) {} Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true }); });
    await ctx.route('https://fonts.googleapis.com/**', r => r.abort());
    const page = await ctx.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.locator('#fileInput').setInputFiles(require('./audio-common.cjs').wav([[3, require('./audio-common.cjs').sine(220, 0.5)]]));
    await page.waitForFunction(() => audioBuffer && audio && source);
    await page.evaluate(() => { setLayout('simfluid'); });
    assert.equal(await page.evaluate(() => agSim.ready()), 'unsupported');
    await page.evaluate(() => renderDensity());
    const r = await page.evaluate(() => ({ s: agSim.stats(), txt: document.getElementById('simStatus_simfluid').textContent, btn: document.getElementById('simReinitBtn').style.display }));
    assert.equal(r.s.status, 'unsupported'); assert.equal(r.s.live, 0, 'no sim state without WebGPU'); assert.equal(r.s.dispatches, 0);
    assert.match(r.txt, /WebGPU is not available/); assert.notEqual(r.btn, 'none');
    ok('unsupported browser: explicit error state, no fake fallback', r.txt.slice(0, 60));
  } finally { await browser.close(); server.close(); }
}

(async () => {
  const t = await open({ viewport: { width: 1440, height: 900 } }); const { page, errors } = t;
  try {
    const status = await page.evaluate(() => agSim.ready());
    if (status !== 'ready') {
      const m = await page.evaluate(() => agSim.stats().msg);
      console.log(`\n*** SKIP simulation.cjs: WebGPU unavailable (status=${status}: ${m}). THIS IS NOT A PASS. ***\n`);
      await t.close(); if (process.env.AUDIOGRAPH_REQUIRE_WEBGPU) process.exit(1); process.exit(0);
    }
    fs.mkdirSync(OUT, { recursive: true });
    const s0 = await st(page);
    assert.equal(s0.selfTest, 'ok'); assert.ok(/apple|nvidia|amd|intel|metal|d3d|vulkan|gpu/i.test(s0.adapter) || s0.adapter.length > 0);
    ok('native WebGPU device + GPU compute self-test (read-back verified)', s0.adapter);

    // 1) layout buttons, dedicated controls, hidden line/glyph controls
    const vis = id => page.evaluate(id => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none' && e.offsetParent !== null; }, id);
    const NA = ['rowStyle', 'styleOpts', 'rowOutline', 'rowVaryH', 'rowVaryT', 'rowContrast', 'rowHeight', 'rowThick', 'rowLines', 'rowFadeEdge', 'panelParticles', 'rowWave', 'rowTwist'];
    await page.evaluate(() => setLayout('linear')); for (const id of ['rowLines', 'rowVaryH', 'rowStyle', 'rowThick']) assert.ok(await vis(id), id + ' visible on linear');
    const KNOB = { simparticles: ['pSpAmount', 'pSpDrag', 'pSpTurb', 'pSpAttract'], simfluid: ['pSfJets', 'pSfVort', 'pSfIter', 'pSfDye'], simsmoke: ['pSmBuoy', 'pSmHeat', 'pSmLight', 'pSmShadow'] };
    for (const m of Object.keys(KNOB)) {
      await page.evaluate(m => setLayout(m), m);
      for (const id of NA) assert.ok(!(await vis(id)), `${id} hidden in ${m}`);
      for (const id of [...KNOB[m], 'pSimSens', 'pSimAttack', 'pSimRelease', 'pSimBurst']) assert.ok(await vis(id), `${id} visible in ${m}`);
      const other = Object.keys(KNOB).find(x => x !== m); assert.ok(!(await vis(KNOB[other][0])), 'other sim panel hidden');
    }
    await page.evaluate(() => setLayout('linear')); assert.ok(await vis('rowLines'), 'line controls return after leaving simulation');
    ok('dedicated knobs shown, line/glyph/outline/particle controls hidden, restored on normal layouts');

    // 2) real image + motion + audio response per layout; silent decay
    const shots = {};
    for (const m of ['simparticles', 'simfluid', 'simsmoke']) {
      await page.evaluate(m => { setLayout(m); agSim.reset(); }, m);
      await page.evaluate(() => agSim.ready()); await grab(page);
      const before = await st(page);
      await feed(page, 220); const a = await grab(page); await feed(page, 18); const b = await grab(page);
      const s = await st(page), L = Object.values(s.layers)[0];
      assert.ok(s.dispatches > before.dispatches + 200, 'GPU dispatches ran'); assert.equal(s.errors.length, 0, 'no GPU errors: ' + s.errors.join(';'));
      assert.ok(a.lit > 0.03, `${m} image not empty (lit=${a.lit})`); assert.ok(mad(a, b) > 0.5, `${m} moves between frames (mad=${mad(a, b)})`);
      if (m === 'simparticles') assert.ok(L.particles >= 60000 && L.emitted > 20000, 'particles emitted: ' + L.emitted); else assert.ok(L.grid[0] >= 160, 'grid');
      await page.screenshot({ path: path.join(OUT, `sim85-${m.slice(3)}.png`) }); shots[m] = { lit: +a.lit.toFixed(3), mad: +mad(a, b).toFixed(2) };
      // silence: stop injecting audio; the simulation coasts and decays on its own
      await page.evaluate(() => agSim.inject({ spec: 0, onset: 0 })); await page.evaluate(() => agSim.advance(420)); const c = await grab(page);
      assert.ok(c.mean < a.mean * 0.7, `${m} decays in silence (${a.mean.toFixed(1)} -> ${c.mean.toFixed(1)})`);
      const e1 = Object.values((await st(page)).layers)[0].emitted; await page.evaluate(() => agSim.advance(60)); assert.equal(Object.values((await st(page)).layers)[0].emitted, e1, 'no emission in silence');
      await page.evaluate(() => agSim.inject(null));
    }
    ok('GPU image non-empty, moving, audio-driven and decaying in silence', JSON.stringify(shots));

    // 3) frame-rate independent emission (same simulated time at 30 vs 120 Hz steps)
    const emitFor = async dt => page.evaluate(async dt => {
      setLayout('simparticles'); agSim.reset(); renderDensity(); await agSim.ready(); renderDensity(); agSim.inject({ spec: 0.5, onset: 0 }); agSim.advance(40, 1 / 60);
      const id = Object.keys(agSim.stats().layers)[0], e0 = agSim.stats().layers[id].emitted; agSim.advance(Math.round(2 / dt), dt); return agSim.stats().layers[id].emitted - e0;
    }, dt);
    const e30 = await emitFor(1 / 30), e120 = await emitFor(1 / 120); const ratio = e30 / e120;
    assert.ok(ratio > 0.85 && ratio < 1.18, `emission is frame-rate independent (30Hz=${e30}, 120Hz=${e120})`); await page.evaluate(() => agSim.inject(null));
    ok('stable delta-time: equal emission at 30 Hz and 120 Hz steps', `${e30} vs ${e120}`);

    // 4) per-layer state, persistence, mixed composition and opacity
    await page.evaluate(() => { setLayout('simfluid'); addLayer(); setLayout('simsmoke'); addLayer(); setLayout('simparticles'); renderDensity(); });
    await feed(page, 30); let ls = await layerStat(page);
    assert.deepEqual(ls.map(l => l.kind).sort(), ['fluid', 'particles', 'smoke']); assert.equal(new Set(Object.keys((await st(page)).layers)).size, 3);
    await page.evaluate(() => { selectLayer(0); const e = document.getElementById('pSfJets'); e.value = 5; e.dispatchEvent(new Event('input', { bubbles: true })); selectLayer(1); selectLayer(2); selectLayer(0); renderDensity(); });
    assert.equal(await page.evaluate(() => +document.getElementById('pSfJets').value), 5, 'fluid layer keeps its own Jets value');
    assert.equal(await page.evaluate(() => (selectLayer(1), +document.getElementById('pSmJets').value)), 10, 'smoke layer has its own default Jets');
    const idsBefore = Object.keys((await st(page)).layers).sort(); await page.evaluate(() => { selectLayer(0); renderDensity(); });
    assert.deepEqual(Object.keys((await st(page)).layers).sort(), idsBefore, 'layer simulation state survives selection changes');
    const mix = await grab(page); assert.ok(mix.lit > 0.05, 'mixed layer composite is non-empty');
    await page.evaluate(() => { stackLayouts.forEach(l => l.opacity = 100); renderDensity(); }); const full = await grab(page);
    await page.evaluate(() => { stackLayouts.forEach(l => l.opacity = 25); renderDensity(); }); const dim = await grab(page);
    assert.ok(dim.mean < full.mean * 0.8, `layer opacity applies (${full.mean.toFixed(1)} -> ${dim.mean.toFixed(1)})`);
    await page.evaluate(() => { stackLayouts.forEach(l => l.opacity = 100); renderDensity(); });
    ok('three independent simulation layers composite with opacity; per-layer controls persist');

    // 5) snapshot round trip, export/import, undo, reset
    const rt = await page.evaluate(() => {
      selectLayer(1); setSimOpt('sEmit', 'center'); setSimOpt('q', 'low'); const b = document.getElementById('pSmBuoy'); b.value = 150; b.dispatchEvent(new Event('input', { bubbles: true }));
      const p1 = getLayoutParams(), s1 = JSON.parse(JSON.stringify(getState())); selectLayer(0); selectLayer(1);
      const p2 = getLayoutParams(); applyState(JSON.parse(JSON.stringify(s1))); selectLayer(1); const p3 = getLayoutParams();
      return { id: [p1._simId, p2._simId, p3._simId], opt: [p1._sim, p2._sim, p3._sim], buoy: [p1.pSmBuoy, p2.pSmBuoy, p3.pSmBuoy], lay: stackLayouts.map(l => l.layout) };
    });
    assert.ok(rt.id[0] > 0 && rt.id[0] === rt.id[1] && rt.id[1] === rt.id[2], 'simulation id survives save/load'); assert.deepEqual(rt.opt[0], rt.opt[2]);
    assert.equal(rt.opt[2].sEmit, 'center'); assert.equal(rt.opt[2].q, 'low'); assert.deepEqual(rt.buoy, [150, 150, 150]); assert.deepEqual(rt.lay, ['simfluid', 'simsmoke', 'simparticles']);
    await page.evaluate(() => { renderDensity(); }); const lowTier = (await layerStat(page)).find(l => l.kind === 'smoke');
    assert.ok(lowTier && lowTier.grid[1] === 160, 'Low quality tier produces a 160-row grid: ' + JSON.stringify(lowTier && lowTier.grid));
    const un = await page.evaluate(() => { selectLayer(1); pushUndo(); const e = document.getElementById('pSmHeat'); e.value = 40; e.dispatchEvent(new Event('input', { bubbles: true })); const v = +e.value; undo(); return [v, +document.getElementById('pSmHeat').value]; });
    assert.equal(un[0], 40); assert.notEqual(un[1], 40, 'undo restores the previous knob value');
    ok('getLayoutParams/setLayoutParams, export/import state, undo and quality tiers round-trip per layer');

    // 6) disposal / reuse
    await page.evaluate(() => { for (let i = 0; i < stackLayouts.length; i++) { selectLayer(i); setLayout('linear'); } renderDensity(); renderDensity(); });
    let s2 = await st(page); assert.equal(s2.live, 0, 'all simulation resources released when no sim layout is active'); assert.ok(s2.disposed >= s2.created - 0 && s2.created >= 3);
    const c0 = s2.created; await page.evaluate(() => { selectLayer(0); setLayout('simsmoke'); renderDensity(); }); await page.evaluate(() => agSim.advance(3));
    s2 = await st(page); assert.equal(s2.live, 1); assert.equal(s2.created, c0 + 1);
    for (let i = 0; i < 6; i++) await page.evaluate(i => { setLayout(['simfluid', 'linear', 'simparticles', 'circle', 'simsmoke', 'linear'][i]); renderDensity(); renderDensity(); }, i);
    s2 = await st(page); assert.equal(s2.live, 0); assert.equal(s2.created, s2.disposed + s2.live); assert.equal(s2.errors.length, 0);
    ok('switching layouts disposes and recreates GPU resources without leaks', `created=${s2.created} disposed=${s2.disposed}`);

    // 7) real audio transport: simulation follows playback, freezes on pause, no reconnect
    await page.evaluate(() => { setLayout('simfluid'); agSim.reset(); agSim.inject(null); });
    await page.evaluate(() => { if (!playing) togglePlay(); }); await page.waitForTimeout(1500);
    const pl = await st(page), lv = Object.values(pl.layers)[0];
    assert.ok(pl.steps > s2.steps + 10, 'simulation steps while playing'); assert.ok(lv && lv.level > 0.02, 'real analyser audio drives the level: ' + (lv && lv.level));
    await page.evaluate(() => { if (playing) togglePlay(); }); await page.waitForTimeout(300); const p1 = await st(page); await page.waitForTimeout(700); const p2 = await st(page);
    assert.ok(p2.steps - p1.steps <= 2, 'simulation is paused with the transport'); ok('audio file playback drives the simulation and Stop pauses it', `level=${lv.level.toFixed(2)}`);

    // 8) device loss -> explicit error -> recovery
    await page.evaluate(() => { setLayout('simfluid'); renderDensity(); agSim.loseDevice(); });
    await page.waitForFunction(() => agSim.stats().status === 'lost'); await page.evaluate(() => renderDensity());
    const lost = await page.evaluate(() => ({ s: agSim.stats(), txt: document.getElementById('simStatus_simfluid').textContent, btn: getComputedStyle(document.getElementById('simReinitBtn')).display }));
    assert.equal(lost.s.status, 'lost'); assert.equal(lost.s.live, 0); assert.match(lost.txt, /lost/i); assert.notEqual(lost.btn, 'none');
    await page.evaluate(() => agSim.reinit()); await page.waitForFunction(() => agSim.stats().status === 'ready'); await feed(page, 40); const rec = await grab(page);
    assert.ok(rec.lit > 0.01, 'renders again after reinitialisation'); ok('device loss shows an explicit error and Reinitialize GPU recovers');

    // 9) iPad-size layout
    await page.setViewportSize({ width: 1024, height: 768 }); await page.evaluate(() => { setLayout('simsmoke'); renderDensity(); });
    const ov = await page.evaluate(() => { const e = document.getElementById('layoutOpts_simsmoke'); return { sw: e.scrollWidth, cw: e.clientWidth, doc: document.documentElement.scrollWidth, vw: innerWidth }; });
    assert.ok(ov.sw <= ov.cw + 2 && ov.doc <= ov.vw + 2, 'no horizontal overflow at iPad width ' + JSON.stringify(ov)); await page.screenshot({ path: path.join(OUT, 'sim85-ipad-smoke.png') });
    await page.setViewportSize({ width: 1440, height: 900 }); ok('iPad-width controls fit');

    // 10) modest measured benchmark (this machine only)
    const bench = [];
    for (const [m, q] of [['simparticles', 'med'], ['simparticles', 'high'], ['simfluid', 'med'], ['simfluid', 'high'], ['simsmoke', 'med'], ['simsmoke', 'high']]) {
      const r = await page.evaluate(async ({ m, q }) => { setLayout(m); simOpt.q = q; agSim.reset(); agSim.inject({ spec: 0.5, onset: 0 }); renderDensity(); agSim.advance(10); await agSim.sync();
        const t0 = performance.now(), N = 60; agSim.advance(N, 1 / 60); await agSim.sync(); const dt = (performance.now() - t0) / N; renderDensity(); const L = Object.values(agSim.stats().layers)[0];
        agSim.inject(null); return { ms: dt, grid: L.grid, n: L.particles }; }, { m, q });
      bench.push(`${m.slice(3)}/${q} ${r.ms.toFixed(2)} ms/step (${r.n ? r.n + ' particles' : r.grid.join('x')})`); assert.ok(isFinite(r.ms) && r.ms > 0);
    }
    console.log('  benchmark (steps incl. GPU completion, headless Chrome, ' + s0.adapter + ', not a universal FPS claim):\n    ' + bench.join('\n    '));
    const fin = await st(page); assert.equal(fin.errors.length, 0, 'no GPU/validation errors: ' + fin.errors.join(';'));
    assert.deepEqual(errors, [], 'no page errors'); ok('benchmark measured; no page or GPU errors');
  } finally { await t.close(); }
  await unsupportedCase();
  console.log(`\nPASS simulation.cjs (${results.length} groups, real WebGPU). Screenshots: ${OUT}`);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
