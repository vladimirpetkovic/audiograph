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
    const NA = ['rowStyle', 'styleOpts', 'rowOutline', 'rowVaryH', 'rowVaryT', 'rowContrast', 'rowHeight', 'rowThick', 'rowLines', 'rowFadeEdge', 'rowSens', 'rowAmp', 'panelParticles', 'rowWave', 'rowTwist'];
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
      await page.evaluate(m => {
        setLayout(m);
        const smokeSpeed = document.getElementById('pSmSpeed');
        if (m === 'simsmoke' && smokeSpeed) { smokeSpeed.value = 100; smokeSpeed.dispatchEvent(new Event('input', { bubbles: true })); }
        agSim.reset();
      }, m);
      await page.evaluate(() => agSim.ready()); await grab(page);
      const before = await st(page);
      await feed(page, 220); const a = await grab(page); await feed(page, 18); const b = await grab(page);
      const s = await st(page), L = Object.values(s.layers)[0];
      assert.ok(s.dispatches > before.dispatches + 200, 'GPU dispatches ran'); assert.equal(s.errors.length, 0, 'no GPU errors: ' + s.errors.join(';'));
      assert.ok(a.lit > 0.03, `${m} image not empty (lit=${a.lit})`); assert.ok(mad(a, b) > 0.5, `${m} moves between frames (mad=${mad(a, b)})`);
      if (m === 'simparticles') assert.ok(L.particles >= 60000 && L.emitted > 10000, 'particles emitted: ' + L.emitted); else assert.ok(L.grid[0] >= 160, 'grid');
      await page.screenshot({ path: path.join(OUT, `sim85-${m.slice(3)}.png`) }); shots[m] = { lit: +a.lit.toFixed(3), mad: +mad(a, b).toFixed(2) };
      // silence: stop injecting audio; the simulation coasts and decays on its own
      await page.evaluate(() => agSim.inject({ spec: 0, onset: 0 })); await page.evaluate(() => agSim.advance(420)); const c = await grab(page);
      assert.ok(c.mean - 15.7 < (a.mean - 15.7) * 0.7, `${m} decays in silence (${a.mean.toFixed(1)} -> ${c.mean.toFixed(1)})`);
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

    // 11) real-music loudness: sustained loud input must not blow out; onsets stay visible; quiet input stays visible
    const loudFeed = (n, onsetEvery = 28) => page.evaluate(({ n, onsetEvery }) => {
      for (let i = 0; i < n; i++) { const sp = []; for (let j = 0; j < 64; j++) sp.push(Math.min(1.2, 0.95 * (1 - 0.55 * j / 63) * (0.9 + 0.1 * Math.sin(i * 0.2 + j))));
        agSim.inject({ spec: sp, onset: onsetEvery && i % onsetEvery === 0 ? 0.9 : 0 }); agSim.advance(1); } }, { n, onsetEvery });
    const stats2 = page => page.evaluate(() => { renderDensity(); const d = frameCtx.getImageData(0, 0, frameCv.width, frameCv.height).data; let s = 0, hot = 0; const n = d.length / 4;
      for (let i = 0; i < d.length; i += 4) { s += d[i] + d[i + 1] + d[i + 2]; if (Math.max(d[i], d[i + 1], d[i + 2]) > 235) hot++; } return { mean: s / n / 3, hot: hot / n }; });
    const expo = {};
    for (const m of ['simparticles', 'simfluid', 'simsmoke']) {
      await page.evaluate(m => { stackLayouts.splice(1); selectLayer(0); setLayout(m); agSim.reset(); renderDensity(); }, m); await page.evaluate(() => agSim.ready());
      await loudFeed(320); const loud = await stats2(page); const lvl = Object.values((await st(page)).layers)[0].level;
      assert.ok(lvl > 0.6, `loud feed reaches a music-like level (${lvl.toFixed(2)})`);
      assert.ok(loud.mean > 25 && loud.mean < 95, `${m} sustained loud input is exposed sensibly (mean ${loud.mean.toFixed(1)})`); assert.ok(loud.hot < 0.12, `${m} not blown out (hot ${loud.hot.toFixed(3)})`);
      const pre = [], post = []; for (let i = 0; i < 6; i++) { await loudFeed(1, 0); pre.push((await stats2(page)).mean); }
      await page.evaluate(() => { const sp = Array(64).fill(0).map((_, j) => Math.min(1.2, 0.95 * (1 - 0.55 * j / 63))); agSim.inject({ spec: sp, onset: 1 }); agSim.advance(1); });
      for (let i = 0; i < 8; i++) { await page.evaluate(() => agSim.advance(1)); post.push((await stats2(page)).mean); }
      const base = pre.reduce((a, b) => a + b) / pre.length, peak = Math.max(...post);
      assert.ok(m === 'simsmoke' ? peak > base + 0.1 : (peak > base * 1.015 || peak > base + 0.8 || (m === 'simfluid' && Math.min(...post) < base - 0.8)), `${m} onset contrast is visible (${base.toFixed(1)} -> ${peak.toFixed(1)})`);
      await page.evaluate(() => { agSim.reset(); renderDensity(); }); await feed(page, 200, 0.4, 0); const quiet = await grab(page); assert.ok(quiet.lit > 0.002, `${m} quiet input still draws (${quiet.lit})`);
      expo[m] = `${loud.mean.toFixed(0)}/hot ${loud.hot.toFixed(3)}/onset ${(peak / base).toFixed(2)}x`; await page.evaluate(() => agSim.inject(null));
    }
    ok('loud real-music-level input is not blown out; onsets and quiet input stay visible', JSON.stringify(expo));

    // 12) global Intensity scales the simulation after normalisation (0 = silent, 50 < 100)
    const lvAt = async pct => { await page.evaluate(pct => { document.getElementById('pIntensity').value = pct; stackLayouts.splice(1); selectLayer(0); setLayout('simparticles'); agSim.reset(); renderDensity(); }, pct);
      await loudFeed(240); const e = Object.values((await st(page)).layers)[0]; const im = await stats2(page); return { level: e.level, emitted: e.emitted, mean: im.mean }; };
    const i0 = await lvAt(0), i50 = await lvAt(50), i100 = await lvAt(100);
    await page.evaluate(() => { document.getElementById('pIntensity').value = 100; });
    assert.ok(i0.level < 0.005 && i0.emitted === 0, 'Intensity 0 gives no sound response: ' + JSON.stringify(i0));
    assert.ok(i50.level < i100.level * 0.8 && i50.level > i0.level, `Intensity 50 < 100 (${i50.level.toFixed(2)} < ${i100.level.toFixed(2)})`); assert.ok(i50.emitted < i100.emitted && i50.mean < i100.mean, 'Intensity scales emission and brightness');
    ok('global Intensity scales the sound response (0 = silent, 50% < 100%)', `levels ${i0.level.toFixed(2)}/${i50.level.toFixed(2)}/${i100.level.toFixed(2)}`);

    // 13) delta-time guards: Fine precision bounds the step at high Time scale; attack/release do not depend on Time scale
    const g = await page.evaluate(() => { const out = {}; setLayout('simfluid'); simOpt.step = 'fine'; for (const sp of [25, 200]) { const e = document.getElementById('pSimSpeed'); e.value = sp; agSim.reset(); renderDensity(); agSim.inject({ spec: 0.8, onset: 0 });
        agSim.advance(6, 0.05); const L = Object.values(agSim.stats().layers)[0]; out[sp] = { dt: L.dt, sub: L.sub, level: L.level }; }
      document.getElementById('pSimSpeed').value = 100; simOpt.step = 'normal'; agSim.inject(null); return out; });
    assert.ok(g[200].dt <= 1 / 120 + 1e-6 && g[200].sub <= 4, 'Fine bound holds at 200% time scale and long frames: ' + JSON.stringify(g[200]));
    assert.ok(Math.abs(g[25].level - g[200].level) < 1e-3, `audio smoothing is independent of Time scale (${g[25].level} vs ${g[200].level})`); ok('step bounded by Precision at high Time scale; smoothing independent of Time scale', JSON.stringify(g[200]));

    // 14) unique simulation ids: duplicated ids, preset applied to two layers, imported composition
    const dup = await page.evaluate(() => { setLayout('simfluid'); addLayer(); setLayout('simsmoke'); addLayer(); setLayout('simparticles'); renderDensity();
      stackLayouts[1].params._simId = stackLayouts[0].params._simId; stackLayouts[2].params._simId = stackLayouts[0].params._simId; renderDensity(); renderDensity();
      const ids1 = stackLayouts.map(l => l.params._simId); const live1 = agSim.stats().live; const created1 = agSim.stats().created;
      const snap = JSON.parse(JSON.stringify(getState())); snap.stackLayouts.forEach(l => { l.params._simId = 777; }); applyState(snap); renderDensity(); renderDensity(); const ids2 = stackLayouts.map(l => l.params._simId);
      const one = { stackLayouts: [JSON.parse(JSON.stringify(stackLayouts[0]))] }; one.stackLayouts[0].params._simId = ids2[1]; selectLayer(0); applyPresetToLayer(one); renderDensity(); selectLayer(2); applyPresetToLayer(one); renderDensity(); renderDensity();
      const ids3 = stackLayouts.map(l => l.params._simId); const names = Array.from(document.querySelectorAll('.layer-name')).map(e => e.textContent);
      return { ids1, live1, created1, ids2, ids3, live3: agSim.stats().live, names, lay: stackLayouts.map(l => l.layout) }; });
    assert.equal(new Set(dup.ids1).size, 3, 'duplicated ids are made unique: ' + dup.ids1); assert.equal(dup.live1, 3, 'each layer owns its own state');
    assert.equal(new Set(dup.ids2).size, 3, 'imported composition ids are unique: ' + dup.ids2); assert.equal(new Set(dup.ids3).size, 3, 'preset applied to two layers gets fresh ids: ' + dup.ids3);
    assert.equal(dup.live3, 3, 'no shared or thrashing state after preset/import'); assert.deepEqual(dup.names.slice(0, 3).sort(), ['Fluid', 'Fluid', 'Smoke'].sort(), 'friendly layer names: ' + dup.names);
    ok('simulation ids stay unique for duplicates, presets and imports; layer titles are friendly', dup.names.join(' / '));
    await page.evaluate(() => { stackLayouts.splice(1); selectLayer(0); });

    // 15) resize/fullscreen keeps persistent simulation state
    const rs = {};
    for (const m of ['simparticles', 'simfluid']) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.evaluate(m => { setLayout(m); agSim.reset(); renderDensity(); }, m); await loudFeed(120); const a0 = await st(page); const L0 = Object.values(a0.layers)[0];
      await page.setViewportSize({ width: 1180, height: 900 }); await page.waitForTimeout(250); await page.evaluate(() => renderDensity()); await loudFeed(2, 0);
      await page.setViewportSize({ width: 1440, height: 760 }); await page.waitForTimeout(250); await page.evaluate(() => renderDensity()); await loudFeed(2, 0);
      const a1 = await st(page), L1 = Object.values(a1.layers)[0], im = await stats2(page);
      assert.equal(a1.created, a0.created, `${m} resize does not recreate simulation state`); assert.equal(a1.live, 1); assert.ok(L1.steps >= L0.steps + 4, 'steps keep counting (history kept)');
      if (m === 'simparticles') assert.ok(L1.emitted >= L0.emitted, 'particle emission counter persisted'); else assert.deepEqual(L1.grid, L0.grid, 'fluid grid persists');
      assert.ok(im.mean > 20, `${m} visible history survives resize (mean ${im.mean.toFixed(1)})`); rs[m] = `created ${a1.created}, steps ${L0.steps}->${L1.steps}`;
    }
    await page.setViewportSize({ width: 1440, height: 900 }); ok('resize / aspect changes keep persistent simulation fields (no disposal)', JSON.stringify(rs));

    // 16) still export renders at the requested resolution without stepping or disturbing live state
    const ex = {};
    await page.setViewportSize({ width: 1920, height: 1080 });
    for (const m of ['simfluid', 'simparticles', 'simsmoke']) {
      await page.evaluate(m => { stackLayouts.splice(1); selectLayer(0); setLayout(m); setSimOpt('q', 'low'); agSim.reset(); renderDensity(); }, m); await loudFeed(150); await page.evaluate(() => renderDensity()); await page.evaluate(() => agSim.sync());
      const b0 = await st(page), Lb = Object.values(b0.layers)[0];
      for (const withBg of [false, true]) {
      const shot = await page.evaluate(withBg => new Promise(res => { const orig = HTMLCanvasElement.prototype.toBlob, cap = dprCap; dprCap = 2; sizeCanvas(frameCv);
        HTMLCanvasElement.prototype.toBlob = function (cb, ...a) { HTMLCanvasElement.prototype.toBlob = orig; dprCap = cap;
        const c = document.createElement('canvas'); c.width = this.width; c.height = this.height; const x = c.getContext('2d'); x.drawImage(this, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
        res({ w: this.width, h: this.height, mean: s / (d.length / 4) / 3, fw: frameCv.width, fh: frameCv.height }); }; exportWithBg = withBg; doExport(); }), withBg);
      const b1 = await st(page), Lc = Object.values(b1.layers)[0];
      assert.equal(shot.w, shot.fw); assert.equal(shot.h, shot.fh); assert.ok(shot.w > Lb.out[0] * 1.5, `export exceeds the Low preview cap (${shot.w} > ${Lb.out[0]})`); assert.ok(shot.mean > 5, `${m} export image not blank (${shot.mean.toFixed(1)})`);
      assert.equal(Lc.steps, Lb.steps, 'export does not advance the simulation'); assert.deepEqual(Lc.out, Lb.out, 'preview targets are untouched'); assert.deepEqual(Lc.exportOut, [shot.w, shot.h]); assert.equal(b1.exports, b0.exports + (withBg ? 2 : 1));
      if (m === 'simparticles') assert.ok(shot.mean > 20, 'particle export preserves accumulated trails: ' + shot.mean);
      ex[m] = `${shot.w}x${shot.h} vs preview ${Lb.out.join('x')}`;
      }
      await page.evaluate(() => { simOpt.q = 'med'; exportWithBg = false; sizeCanvas(frameCv); });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    ok('still export renders at exact requested size from existing state, no stepping', JSON.stringify(ex));
    const fresh = await page.evaluate(() => new Promise(res => { setLayout('simfluid'); agSim.inject(null); agSim.reset(); const orig = HTMLCanvasElement.prototype.toBlob; HTMLCanvasElement.prototype.toBlob = function () { HTMLCanvasElement.prototype.toBlob = orig;
      const c = document.createElement('canvas'); c.width = this.width; c.height = this.height; const x = c.getContext('2d'); x.drawImage(this, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; res(s / (d.length / 4) / 3); }; exportWithBg = false; doExport(); }));
    assert.ok(fresh > 8, 'export of a layer with no live state is prewarmed, not blank: ' + fresh); ok('export with fresh state is prewarmed (not blank)', fresh.toFixed(1));

    // 17) smoke alpha: coloured smoke keeps its tint on translucent edges
    const al = await page.evaluate(() => { setLayout('simsmoke'); colorMode = 'solid'; solidColor = '#ff3010'; if (stackLayouts[0] && stackLayouts[0].params) { stackLayouts[0].params._colorMode = 'solid'; stackLayouts[0].params._solidColor = '#ff3010'; } agSim.reset(); renderDensity(); for (let i = 0; i < 150; i++) { agSim.inject({ spec: 0.8, onset: 0 }); agSim.advance(1); } renderDensity();
      const id = Object.keys(agSim.stats().layers)[0], im = agSim.pixels(id), d = im.data; const edge = [0, 0], core = [0, 0];
      { let mx = 0, hi = null; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > mx) { mx = d[i + 3]; hi = [d[i], d[i + 1], d[i + 2], d[i + 3]]; } window.__dbg = { mx, hi }; }
      for (let i = 0; i < d.length; i += 4) { const a = d[i + 3], t = d[i] + d[i + 1] + d[i + 2]; if (a > 12 && a < 40 && t > 30) { edge[0] += d[i] / t; edge[1]++; } else if (a >= 40 && t > 30) { core[0] += d[i] / t; core[1]++; } }
      agSim.inject(null); return { dbg: window.__dbg, edge: edge[0] / Math.max(1, edge[1]), ne: edge[1], core: core[0] / Math.max(1, core[1]), nc: core[1] }; });
    assert.ok(al.ne > 200 && al.nc > 100, 'smoke has translucent and dense pixels: ' + JSON.stringify(al)); assert.ok(al.edge > 0.36 && Math.abs(al.edge - al.core) < 0.18, 'translucent smoke edges keep the tint: ' + JSON.stringify(al));
    await page.evaluate(() => { colorMode = 'toneramp'; }); ok('coloured smoke keeps tint on translucent edges (un-premultiplied tone mapping)', `edge R share ${al.edge.toFixed(2)} core ${al.core.toFixed(2)}`);

    // 18) transient GPU errors do not permanently kill the simulation
    const er = await page.evaluate(async () => { setLayout('simfluid'); renderDensity(); for (let i = 0; i < 15; i++) agSim.testError('synthetic ' + i); const s1 = agSim.stats().status; await new Promise(r => setTimeout(r, 4300));
      for (let i = 0; i < 15; i++) agSim.testError('synthetic b' + i); const s2 = agSim.stats().status, c2 = agSim.stats().errorCount; for (let i = 0; i < 12; i++) agSim.testError('burst ' + i); return { s1, s2, c2, s3: agSim.stats().status }; });
    assert.equal(er.s1, 'ready'); assert.equal(er.s2, 'ready', 'errors spread over time do not accumulate to a permanent failure'); assert.ok(er.c2 >= 30, 'errors are still recorded'); assert.equal(er.s3, 'error', 'a burst of errors is reported explicitly');
    await page.evaluate(() => agSim.reinit()); await page.waitForFunction(() => agSim.stats().status === 'ready'); ok('windowed error counter: transient errors tolerated, bursts reported, errors recorded');
    await page.evaluate(() => { agSim.inject(null); });

    // 10) modest measured benchmark (this machine only)
    const bench = [];
    // presets: every preset applies cleanly, renders, and stays in the exposure limits
    for (const m of ['simparticles', 'simfluid', 'simsmoke']) {
      const n = await page.evaluate(m => { setLayout(m); return AG_SIM_PRESETS[m].length; }, m); assert.ok(n >= 6, m + ' has presets');
      for (let i = 0; i < n; i++) {
        await page.evaluate(i => simApplyPreset(i), i); await page.evaluate(() => agSim.ready());
        await feed(page, 200, 0.55, 28); const g = await grab(page);
        assert.ok(g.lit > 0.003, `${m} preset ${i} draws (lit=${g.lit})`); assert.ok(g.mean < 200, `${m} preset ${i} not blown out (mean=${g.mean})`);
      }
    }
    assert.equal((await st(page)).errors.filter(e => !/synthetic|burst /.test(e)).length, 0, 'no GPU errors from presets'); ok('all simulation presets apply, render and stay in range');
    // emitter rotation moves the emitters (image changes) without breaking rendering
    for (const m of ['simparticles', 'simfluid', 'simsmoke']) {
      const shot = async deg => { await page.evaluate(({ m, deg }) => { setLayout(m); simResetSettings(); const e = document.getElementById('pSimRot'); e.value = deg; e.dispatchEvent(new Event('input', { bubbles: true })); const sm = document.getElementById('pSmSpeed'); if (m === 'simsmoke' && sm) { sm.value = 100; sm.dispatchEvent(new Event('input', { bubbles: true })); } agSim.reset(); }, { m, deg });
        await page.evaluate(() => agSim.ready()); await grab(page); await feed(page, 220, 0.55, 28); return grab(page); };
      const r0 = await shot(0), r1 = await shot(180); assert.ok(r1.lit > 0.003, m + " draws rotated " + r0.lit + " " + r1.lit); assert.ok(mad(r0, r1) > 1, `${m} emitter rotation changes the image (mad=${mad(r0, r1)})`);
    }
    await page.evaluate(() => simResetSettings()); ok('emitter rotation changes the image on every simulation layout');
    for (const [m, q] of [['simparticles', 'med'], ['simparticles', 'high'], ['simfluid', 'med'], ['simfluid', 'high'], ['simsmoke', 'med'], ['simsmoke', 'high']]) {
      const r = await page.evaluate(async ({ m, q }) => { setLayout(m); setSimOpt('q', q); agSim.reset(); agSim.inject({ spec: 0.5, onset: 0 }); renderDensity(); agSim.advance(10); await agSim.sync();
        const t0 = performance.now(), N = 60; agSim.advance(N, 1 / 60); await agSim.sync(); const dt = (performance.now() - t0) / N; renderDensity(); const L = Object.values(agSim.stats().layers)[0];
        agSim.inject(null); return { ms: dt, grid: L.grid, n: L.particles }; }, { m, q });
      if (m === 'simparticles') assert.equal(r.n, q === 'high' ? 500000 : 200000);
      else assert.equal(r.grid[1], q === 'high' ? 384 : 256);
      bench.push(`${m.slice(3)}/${q} ${r.ms.toFixed(2)} ms/step (${r.n ? r.n + ' particles' : r.grid.join('x')})`); assert.ok(isFinite(r.ms) && r.ms > 0);
    }
    console.log('  benchmark (steps incl. GPU completion, headless Chrome, ' + s0.adapter + ', not a universal FPS claim):\n    ' + bench.join('\n    '));
    const fin = await st(page); const real = fin.errors.filter(e => !/synthetic|burst /.test(e)); assert.equal(real.length, 0, 'no GPU/validation errors: ' + real.join(';'));
    assert.deepEqual(errors, [], 'no page errors'); ok('benchmark measured; no page or GPU errors');
  } finally { await t.close(); }
  await unsupportedCase();
  console.log(`\nPASS simulation.cjs (${results.length} groups, real WebGPU). Screenshots: ${OUT}`);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
