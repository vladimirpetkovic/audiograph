// v32 layer scope: deformers and Post FX edit only the active layer. Legacy saves (global postFx, layers
// without _postFx, incl. built-in presets) must render exactly like v31 via the whole-composition FX.
// Also: panel follows layer selection, save/load round-trip, Undo, Reset. Optional perf: LAYER_SCOPE_BENCH=1.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && fs.existsSync(chrome)) process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = chrome;
const { chromium } = require('playwright');
const { diff } = require('./gpu-common.cjs');

const BUILD = process.env.AUDIOGRAPH_SCOPE_BUILD || 'versions/audiograph_32.html';
const LEGACY = process.env.AUDIOGRAPH_SCOPE_LEGACY_BUILD || 'versions/audiograph_31.html';

function audioFile(seconds = 8) {
  const rate = 8000, n = rate * seconds, wav = Buffer.alloc(44 + n * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) { const t = i / rate, env = 0.35 + 0.65 * Math.abs(Math.sin(t * 2.3)); wav.writeInt16LE(Math.round((Math.sin(t * 2 * Math.PI * 220) * 0.6 + Math.sin(t * 2 * Math.PI * 1375) * 0.25) * env * 26000), 44 + i * 2); }
  return { name: 'scope.wav', mimeType: 'audio/wav', buffer: wav };
}

async function launch() {
  const servers = [];
  const browser = await chromium.launch({ headless: !process.env.AUDIOGRAPH_HEADED, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  async function page(build, viewport = { width: 1200, height: 800 }) {
    const html = fs.readFileSync(path.join(__dirname, '..', build));
    const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); });
    await new Promise(r => server.listen(0, '127.0.0.1', r)); servers.push(server);
    const ctx = await browser.newContext({ viewport });
    await ctx.route('https://fonts.googleapis.com/**', r => r.abort());
    const p = await ctx.newPage(); p.on('pageerror', e => errors.push(build + ': ' + e.message));
    await p.goto(`http://127.0.0.1:${server.address().port}/`);
    await p.locator('#fileInput').setInputFiles(audioFile());
    await p.waitForFunction(() => audioBuffer && audio && source);
    await p.evaluate(() => { agGpu.setMode('canvas'); if (typeof agParticles !== 'undefined') agParticles.setMode('cpu'); });
    return p;
  }
  return { page, errors, async close() { await browser.close(); servers.forEach(s => s.close()); } };
}

// Loads a state with particles suppressed (stochastic) and fresh trail history.
const LOAD = st => {
  applyState(JSON.parse(JSON.stringify(st)));
  particlesOn = false; stackLayouts.forEach(l => { if (l.params) l.params._particlesOn = false; });
  particleLayers = {}; if (typeof agParticles !== 'undefined') agParticles.reset(); presetLockFrames = 0;
  wavePhase = 0; spinAngle = 0; trailCv = null; trailCtx = null; if (typeof _layerTrails !== 'undefined') _layerTrails = {};
};
// Renders n frames, returns frameCv and (when composition FX is on) the #postFxCv overlay pixels.
const SHOT = n => {
  for (let i = 0; i < n; i++) renderDensity();
  const grab = cv => { const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; const x = c.getContext('2d'); x.drawImage(cv, 0, 0); return { w: c.width, h: c.height, data: Array.from(x.getImageData(0, 0, c.width, c.height).data) }; };
  return { frame: grab(frameCv), fx: postFxEnabled ? grab(document.getElementById('postFxCv')) : null };
};
// Renders with only layer `only` visible (others at opacity 0) — isolates one layer's pixels in the composite.
const SOLO = only => {
  const op = stackLayouts.map(l => l.opacity);
  stackLayouts.forEach((l, i) => { if (i !== only) l.opacity = 0; });
  try { renderDensity(); return Array.from(frameCtx.getImageData(0, 0, frameCv.width, frameCv.height).data); }
  finally { stackLayouts.forEach((l, i) => { l.opacity = op[i]; }); }
};
const img = data => ({ data });

(async () => {
  const L = await launch();
  try {
    const p = await L.page(BUILD);
    // Two overlapping layers: 0 = circle (active), 1 = linear.
    await p.evaluate(() => {
      const st = getState(), base = st.stackLayouts[0];
      st.stackLayouts = [
        { layout: 'circle', opacity: 100, params: { ...JSON.parse(JSON.stringify(base.params)), _lines: 220, _thick: 2, _particlesOn: false } },
        { layout: 'linear', opacity: 100, params: { ...JSON.parse(JSON.stringify(base.params)), _lines: 260, _thick: 2, _particlesOn: false } },
      ];
      st.activeLayerIdx = 0; st.postFx = { enabled: false }; window.__two = st;
    });
    await p.evaluate(LOAD, await p.evaluate(() => window.__two));
    const a0 = await p.evaluate(SOLO, 0), b0 = await p.evaluate(SOLO, 1);
    assert.ok(diff(img(a0), img(await p.evaluate(SOLO, 0))).mean < 0.01, 'static render must be deterministic');

    // 1. Deformers: each of the 7 changes only the active layer.
    for (const id of ['pTwist', 'pBulge', 'pWave', 'pShear', 'pDepth', 'pRipple', 'pJitter']) {
      await p.evaluate(LOAD, await p.evaluate(() => window.__two));
      await p.evaluate(id => { const e = document.getElementById(id); e.value = Math.round(+e.min + (+e.max - +e.min) * 0.8); e.dispatchEvent(new Event('input', { bubbles: true })); renderDensity(); }, id);
      const a = await p.evaluate(SOLO, 0), b = await p.evaluate(SOLO, 1);
      const da = diff(img(a0), img(a)), db = diff(img(b0), img(b));
      assert.ok(da.mean > 0.05, `${id} must change the active layer (mean ${da.mean.toFixed(3)})`);
      assert.ok(db.mean < 0.01, `${id} must not change the other layer (mean ${db.mean.toFixed(3)})`);
      const stored = await p.evaluate(id => { const k = { pTwist: '_twist', pBulge: '_bulge', pWave: '_wave', pShear: '_shear', pDepth: '_depth', pRipple: '_ripple', pJitter: '_jitter' }[id]; getState(); return [stackLayouts[0].params[k], stackLayouts[1].params[k]]; }, id);
      assert.ok(stored[0] > 0 || stored[0] < 0, `${id} stored on layer 0`); assert.equal(stored[1], 0, `${id} not stored on layer 1`);
    }
    console.log('ok deformers: all 7 affect only the active layer');

    // 2. Per-layer Post FX through the panel: only layer 0 changes; overlay stays off.
    await p.evaluate(LOAD, await p.evaluate(() => window.__two));
    await p.evaluate(() => {
      document.querySelector('#pfxEnableRow [onclick^="setPostFx(true"]').click();
      for (const [id, v] of [['pfxBloom', 60], ['pfxInvert', 70], ['pfxKaleido', 40]]) { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }
      renderDensity();
    });
    const fxState = await p.evaluate(() => ({ l0: stackLayouts[0].params._postFx, l1: stackLayouts[1].params._postFx, comp: postFxEnabled, overlay: getComputedStyle(document.getElementById('postFxCv')).display }));
    assert.equal(fxState.l0.enabled, true); assert.equal(fxState.l0.pfxBloom, 60); assert.equal(fxState.l0.pfxInvert, 70);
    assert.equal(fxState.l1.enabled, false); assert.equal(fxState.l1.pfxBloom, 0);
    assert.equal(fxState.comp, false, 'layer FX must not enable the composition FX'); assert.equal(fxState.overlay, 'none');
    const a1 = await p.evaluate(SOLO, 0), b1 = await p.evaluate(SOLO, 1);
    assert.ok(diff(img(a0), img(a1)).mean > 1, 'post FX must change the active layer');
    assert.ok(diff(img(b0), img(b1)).mean < 0.01, `post FX must not touch the other layer (${diff(img(b0), img(b1)).mean})`);
    // Trails/feedback history is per layer too.
    await p.evaluate(() => { const e = document.getElementById('pfxTrails'); e.value = 80; e.dispatchEvent(new Event('input', { bubbles: true })); renderDensity(); renderDensity(); });
    assert.deepEqual(await p.evaluate(() => Object.keys(_layerTrails)), ['0']);
    assert.ok(diff(img(b0), img(await p.evaluate(SOLO, 1))).mean < 0.01, 'trails must not touch the other layer');
    console.log('ok post FX: active layer only, overlay off, per-layer trail history');
    // Playback and transparent PNG export run the per-layer FX without errors (export uses no trail history).
    await p.evaluate(async () => {
      const click = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () {};
      try { exportWithBg = false; doExport(); exportWithBg = true; doExport(); } finally { HTMLAnchorElement.prototype.click = click; exportWithBg = false; }
      togglePlay(); await new Promise(r => setTimeout(r, 700)); if (playing) togglePlay();
    });

    // 3. Switching layers updates the panel.
    const panel = () => ({ on: document.querySelector('#pfxEnableRow [onclick^="setPostFx(true"]').classList.contains('on'), bloom: +document.getElementById('pfxBloom').value, label: document.getElementById('vPfxBloom').textContent, row: getComputedStyle(document.getElementById('pfxScopeRow')).display });
    await p.evaluate(() => selectLayer(1));
    assert.deepEqual(await p.evaluate(panel), { on: false, bloom: 0, label: '0%', row: 'none' });
    await p.evaluate(() => selectLayer(0));
    assert.deepEqual(await p.evaluate(panel), { on: true, bloom: 60, label: '60%', row: 'none' });
    // Add layer gets default (off) FX and leaves the others alone.
    await p.evaluate(() => addLayer());
    assert.deepEqual(await p.evaluate(() => [stackLayouts[2].params._postFx.enabled, stackLayouts[0].params._postFx.pfxBloom, document.getElementById('pfxBloom').value]), [false, 60, '0']);
    console.log('ok panel follows the active layer; add layer starts with FX off');

    // 4. Save/load round-trip keeps per-layer FX and pixels.
    await p.evaluate(LOAD, await p.evaluate(() => window.__two));
    await p.evaluate(() => { stackLayouts[1].params._postFx = { ...pfxDefault(), enabled: true, pfxBloom: 50, pfxChroma: 60, pfxVignette: 80 }; selectLayer(0); window.__saved = JSON.stringify(getState()); });
    const before = await p.evaluate(SHOT, 2);
    await p.evaluate(() => resetAll());
    await p.evaluate(LOAD, JSON.parse(await p.evaluate(() => window.__saved)));
    const after = await p.evaluate(SHOT, 2);
    assert.ok(diff(before.frame, after.frame).mean < 0.01, 'round-trip must render identically');
    assert.equal(await p.evaluate(() => stackLayouts[1].params._postFx.pfxVignette), 80);
    assert.equal(await p.evaluate(() => JSON.parse(window.__saved).postFx.enabled), false, 'new saves keep composition FX off');
    console.log('ok save/load round-trip');

    // 5. Undo restores the previous layer FX.
    await p.evaluate(LOAD, await p.evaluate(() => window.__two));
    await p.evaluate(() => { undoStack.length = 0; undoLast = 0; _captureClean(); });
    await p.evaluate(() => document.querySelector('#pfxEnableRow [onclick^="setPostFx(true"]').click());
    await p.waitForTimeout(600);
    await p.evaluate(() => { const e = document.getElementById('pfxEdgeGlow'); e.value = 90; e.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal(await p.evaluate(() => stackLayouts[0].params._postFx.pfxEdgeGlow), 90);
    await p.evaluate(() => undo());
    assert.deepEqual(await p.evaluate(() => [stackLayouts[0].params._postFx.enabled, stackLayouts[0].params._postFx.pfxEdgeGlow, document.getElementById('pfxEdgeGlow').value]), [true, 0, '0']);
    await p.evaluate(() => undo());
    assert.equal(await p.evaluate(() => stackLayouts[0].params._postFx.enabled), false);
    console.log('ok undo');

    // 6. Legacy: global postFx shows the composition target; it can be edited and turned off; Reset clears all.
    const flares = await p.evaluate(() => builtinPresets.flares);
    await p.evaluate(LOAD, flares);
    const leg = await p.evaluate(() => ({ comp: postFxEnabled, overlay: getComputedStyle(document.getElementById('postFxCv')).display, row: getComputedStyle(document.getElementById('pfxScopeRow')).display, layers: stackLayouts.map(l => l.params._postFx.enabled), bloom: document.getElementById('pfxBloom').value, saved: getState().postFx }));
    assert.equal(leg.comp, true); assert.equal(leg.overlay, 'block'); assert.notEqual(leg.row, 'none', 'legacy composition FX must be visible in the panel');
    assert.ok(leg.layers.every(x => x === false)); assert.equal(leg.bloom, '0', 'panel edits the active layer by default');
    assert.equal(leg.saved.enabled, true); assert.equal(leg.saved.pfxBloom, flares.postFx.pfxBloom, 'new save preserves composition FX');
    await p.evaluate(() => { setPfxTarget('comp'); });
    assert.equal(await p.evaluate(() => document.getElementById('pfxBloom').value), String(flares.postFx.pfxBloom));
    await p.evaluate(() => document.querySelector('#pfxEnableRow [onclick^="setPostFx(false"]').click());
    assert.deepEqual(await p.evaluate(() => [postFxEnabled, getComputedStyle(document.getElementById('postFxCv')).display, stackLayouts.map(l => l.params._postFx.enabled).some(Boolean)]), [false, 'none', false]);
    await p.evaluate(() => { setPfxTarget('layer'); stackLayouts[1].params._postFx = { ...pfxDefault(), enabled: true, pfxBloom: 30 }; resetAll(); });
    const rs = await p.evaluate(() => ({ comp: postFxEnabled, compOn: pfxActive({ ...compFx, enabled: true }), target: pfxTarget, layers: stackLayouts.map(l => JSON.stringify(l.params._postFx)), row: getComputedStyle(document.getElementById('pfxScopeRow')).display, bloom: document.getElementById('pfxBloom').value, def: JSON.stringify(pfxDefault()) }));
    assert.equal(rs.comp, false); assert.equal(rs.compOn, false, 'Reset clears composition FX'); assert.equal(rs.target, 'layer'); assert.equal(rs.row, 'none'); assert.equal(rs.bloom, '0');
    assert.ok(rs.layers.every(x => x === rs.def), 'Reset clears layer FX');
    console.log('ok legacy composition target, turn-off and Reset');

    // 7. Legacy pixels identical to v31: built-in flares, cell, firepit and a synthetic two-layer legacy state.
    const old = await L.page(LEGACY), fresh = await L.page(BUILD);
    const synth = await old.evaluate(st => {
      applyState(st); const s = getState();
      s.postFx = { enabled: true, pfxBloom: 40, pfxChroma: 30, pfxVignette: 50, pfxScanlines: 20, pfxSharpen: 10, pfxInvert: 15, pfxReflect: 20, pfxContrast: 10, pfxBlurX: 10, pfxBlurY: 5, pfxBlurRadial: 30, pfxFocal: 40, pfxTrails: 60, pfxFeedback: 20, pfxEdgeGlow: 25, pfxKaleido: 20 };
      s.stackLayouts.forEach(l => { delete l.params._postFx; }); return s;
    }, await p.evaluate(() => window.__two));
      // Excluded: cell/globe/organica/zodiac are not reproducible across page loads even in v31 (3D/custom layers);
    // sacred_circle changed on purpose in v32 (radial glyph size fix) and spiral_planes uses terrain.
    const legacy = { ...(await p.evaluate(() => Object.fromEntries(['flares', 'firepit', 'echo', 'rorschach', 'waves', 'glass'].map(k => [k, builtinPresets[k]])))), synthetic: synth };
    for (const [name, st] of Object.entries(legacy)) {
      // Reset first so keys missing from a preset fall back to fresh-load values in both builds (no carry-over).
      for (const pg of [fresh, old]) { await pg.evaluate(() => resetAll()); await pg.evaluate(LOAD, st); }
      const n = await fresh.evaluate(SHOT, 3), o = await old.evaluate(SHOT, 3);
      assert.equal(n.frame.w, o.frame.w); assert.ok(o.fx && n.fx, name + ': composition FX on in both');
      const df = diff(o.frame, n.frame), dx = diff(o.fx, n.fx);
      console.log(`  ${name}: frame mean ${df.mean.toFixed(4)} big ${df.big.toFixed(5)} | postFx mean ${dx.mean.toFixed(4)} big ${dx.big.toFixed(5)}`);
      assert.ok(df.mean < 0.05 && df.big < 0.0005, `${name}: frame must match v31`);
      assert.ok(dx.mean < 0.05 && dx.big < 0.0005, `${name}: composition FX must match v31`);
    }
    console.log('ok legacy states render identically to v31');

    if (process.env.LAYER_SCOPE_BENCH) await bench(L);
    assert.deepEqual(L.errors, []);
    console.log('layer-scope: PASS');
  } finally { await L.close(); }
})().catch(e => { console.error(e); process.exit(1); });

// Flares at 1080p: legacy composition FX vs the same FX moved onto each of its 3 layers.
async function bench(L) {
  const builds = (process.env.LAYER_SCOPE_BENCH_BUILDS || LEGACY + ',' + BUILD).split(',');
  for (const build of builds) {
    const p = await L.page(build, { width: 1920, height: 1200 });
    // Output resolution applies while the projection window is open (1080p frame; projection also renders each frame).
    const popup = p.waitForEvent('popup'); await p.click('#projectionBtn'); await popup;
    await p.selectOption('#outputResolution', '1080');
    const run = async (perLayer) => p.evaluate(async ({ perLayer }) => {
      const st = JSON.parse(JSON.stringify(builtinPresets.flares));
      if (perLayer) { st.stackLayouts.forEach(l => { l.params._postFx = { ...st.postFx, enabled: true }; }); st.postFx = { ...st.postFx, enabled: false }; }
      applyState(st); particlesOn = false; stackLayouts.forEach(l => { l.params._particlesOn = false; }); particleLayers = {}; presetLockFrames = 0;
      const s = document.createElement('canvas'); s.width = s.height = 1; const sx = s.getContext('2d', { willReadFrequently: true });
      const flush = () => { sx.drawImage(frameCv, 0, 0, 1, 1); if (postFxEnabled) sx.drawImage(document.getElementById('postFxCv'), 0, 0, 1, 1); sx.getImageData(0, 0, 1, 1); };
      for (let i = 0; i < 10; i++) { renderDensity(); flush(); }
      const t = [];
      for (let i = 0; i < 30; i++) { const t0 = performance.now(); renderDensity(); flush(); t.push(performance.now() - t0); }
      t.sort((a, b) => a - b);
      return { size: frameCv.width + 'x' + frameCv.height, median: t[15], p90: t[27] };
    }, { perLayer });
    const legacy = await run(false);
    console.log(`bench ${build} flares composition FX: ${legacy.size} median ${legacy.median.toFixed(2)} ms p90 ${legacy.p90.toFixed(2)} ms`);
    if (await p.evaluate(() => typeof applyLayerFx === 'function')) {
      const per = await run(true);
      console.log(`bench ${build} flares FX on all 3 layers: ${per.size} median ${per.median.toFixed(2)} ms p90 ${per.p90.toFixed(2)} ms`);
    }
  }
}
