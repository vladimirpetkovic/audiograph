// v30 GPU renderer acceptance: active WebGL2 path, parity with Canvas 2D, fallback,
// backend switch, context loss/restore, projection and recording inclusion.
const assert = require('node:assert/strict');
const { open, deterministic, frame, diff, inked, build } = require('./gpu-common.cjs');

const MEAN_TOL = 5, BIG_TOL = 0.01; // mean |dRGB| <= 5/255, <= 1% pixels differing by > 64

async function run() {
  const s = await open();
  const { page, errors } = s;
  try {
    assert.equal(await page.evaluate(() => agGpu.getMode()), 'auto', 'selective Auto is the safe default');
    await page.evaluate(() => agGpu.setMode('gpu'));
    const info = await page.evaluate(() => ({ status: agGpu.status(), stats: agGpu.stats(), sel: document.getElementById('rendererBackend').value }));
    assert.equal(info.sel, 'gpu', 'explicit GPU backend');
    assert.equal(info.stats.mode, 'gpu');
    assert.ok(info.stats.renderer, 'WebGL2 renderer string is reported');
    console.log(`build ${build}; renderer: ${info.stats.renderer}`);

    // Parity on synthetic scene and presets; GPU path must actually draw via WebGL.
    const presets = await page.evaluate(() => Object.keys(builtinPresets));
    const names = ['cell', 'zodiac', 'organica', 'sacred_circle', 'globe'].filter(n => presets.includes(n));
    assert.ok(names.length >= 3, 'builtin presets present');
    for (const name of names) {
      await deterministic(page, await page.evaluate(n => builtinPresets[n], name));
      const c = await frame(page, 'canvas'), g = await frame(page, 'gpu');
      assert.equal(c.stats.drawCalls, 0, `${name}: canvas mode issues no GL draws`);
      assert.ok(g.stats.drawCalls > 0 && g.stats.vertices > 0, `${name}: GPU draw calls issued`);
      assert.equal(g.stats.compatLayers, 0, `${name}: all layers on GPU (${JSON.stringify(g.stats.reasons)})`);
      assert.match(g.status, /^GPU WebGL2/);
      assert.match(c.status, /Canvas 2D/);
      const d = diff(c, g);
      console.log(`${name.padEnd(14)} mean ${d.mean.toFixed(2)} big ${(d.big * 100).toFixed(2)}% gpu layers ${g.stats.gpuLayers}`);
      assert.ok(d.mean <= MEAN_TOL && d.big <= BIG_TOL, `${name}: parity within tolerance`);
      const bg = g.data.slice(0, 3);
      assert.ok(inked(g, bg) > 0.005, `${name}: GPU frame is not blank`);
    }

    for (const shape of ['dotted', 'numbers', 'symbols', 'words']) {
      await page.evaluate(shape => {
        const st = getState(), layer = st.stackLayouts[0];
        st.stackLayouts = [{ layout: 'circle', opacity: 100, params: {
          ...layer.params, _lines: 300, _lineShape: shape, _thick: 2,
          _showOutline: false, _particlesOn: false
        } }];
        st.activeLayerIdx = 0; st.sliders.pLines = 300; applyState(st); presetLockFrames = 0;
      }, shape);
      await deterministic(page);
      const c = await frame(page, 'canvas'), g = await frame(page, 'gpu'), a = await frame(page, 'auto');
      const delta = diff(c, g);
      console.log(`${shape} analytic/atlas parity mean ${delta.mean.toFixed(2)}, big ${(delta.big * 100).toFixed(2)}%`);
      assert.ok(delta.mean <= MEAN_TOL && delta.big <= BIG_TOL, `${shape}: original drawing parity`);
      assert.ok(a.stats.drawCalls > 0 && a.stats.gpuLayers > 0, `${shape}: Auto uses actual GPU drawing`);
      assert.ok(diff(g, a).mean < .1, `${shape}: Auto matches forced GPU`);
    }
    await deterministic(page, await page.evaluate(() => builtinPresets.zodiac));
    await page.evaluate(() => {
      stackLayouts.forEach(layer => { layer.params._lineShape = 'straight'; });
      lineShape = 'straight'; renderDensity();
    });
    const auto = await frame(page, 'auto'), canvas = await frame(page, 'canvas');
    assert.equal(auto.stats.drawCalls, 0, 'Auto keeps general geometry on original path');
    assert.equal(diff(auto, canvas).mean, 0, 'Auto general geometry preserves exact baseline');
    assert.match(auto.status, /Auto:/);

    // Dynamic: frames change over time on the GPU path.
    await page.evaluate(() => { agGpu.setMode('gpu'); if (!playing) togglePlay(); });
    await page.waitForTimeout(500);
    const f1 = await page.evaluate(() => { agGpu.resetStats(); return frameCv.toDataURL(); });
    await page.waitForTimeout(700);
    const moved = await page.evaluate(f => { const r = frameCv.toDataURL() !== f && agGpu.stats().gpuLayers > 0; if (playing) togglePlay(); return r; }, f1);
    assert.ok(moved, 'GPU output animates during playback');

    // Explicit fallback: gradient outline fill and image layout are reported as Canvas 2D.
    const fb = await page.evaluate(() => {
      agGpu.setMode('gpu');
      const st = getState(), l0 = st.stackLayouts[0];
      l0.params._showOutline = true; l0.params._outlineStyle = 'fill';
      st.stackLayouts.push({ layout: 'image', opacity: 100, params: JSON.parse(JSON.stringify(l0.params)) });
      st.stackLayouts.push({ layout: 'circle', opacity: 100, params: Object.assign(JSON.parse(JSON.stringify(l0.params)), { _showOutline: false }) });
      st.activeLayerIdx = 2;
      applyState(st); presetLockFrames = 0;
      agGpu.resetStats(); renderDensity();
      return { stats: agGpu.stats(), status: agGpu.status() };
    });
    console.log('fallback:', fb.status);
    assert.ok(fb.stats.compatLayers >= 2, 'incompatible layers fall back');
    assert.ok(fb.stats.gpuLayers >= 1, 'compatible layers stay on GPU in a mixed stack');
    assert.ok(fb.stats.reasons['image layout'] >= 1, 'image layout reason recorded');
    assert.match(fb.status, /Canvas 2D:.*image layout/);

    // Context loss and restore.
    await deterministic(page, await page.evaluate(() => builtinPresets.zodiac || builtinPresets[Object.keys(builtinPresets)[0]]));
    await frame(page, 'canvas'); // first render after applyState settles layer state
    const base = await frame(page, 'gpu');
    await page.evaluate(() => agGpu.loseContext());
    await page.waitForFunction(() => agGpu.stats().lost);
    const lost = await frame(page, 'gpu');
    assert.match(lost.status, /context lost/i);
    assert.equal(lost.stats.gpuLayers, 0);
    assert.ok(lost.stats.compatLayers > 0 && inked(lost, lost.data.slice(0, 3)) > 0.005, 'compat draws while context lost');
    assert.ok(diff(base, lost).mean <= MEAN_TOL, 'lost-context fallback matches GPU frame');
    await page.evaluate(() => agGpu.restoreContext());
    await page.waitForFunction(() => !agGpu.stats().lost);
    const back = await frame(page, 'gpu');
    assert.ok(back.stats.restores >= 1 && back.stats.gpuLayers > 0 && back.stats.drawCalls > 0, 'GPU resumes after restore');
    assert.ok(diff(base, back).mean <= MEAN_TOL);

    // Projection output contains the GPU-rendered frame.
    const popup = page.waitForEvent('popup');
    await page.click('#projectionBtn');
    await (await popup).waitForLoadState();
    await page.waitForFunction(() => projectionCanvas && projectionCanvas.width > 0);
    const proj = await page.evaluate(() => {
      agGpu.setMode('gpu'); agGpu.resetStats(); renderDensity(); presentProjection && presentProjection();
      const c = document.createElement('canvas'); c.width = 64; c.height = 64;
      const x = c.getContext('2d'); x.drawImage(projectionCanvas, 0, 0, 64, 64);
      const d = x.getImageData(0, 0, 64, 64).data; let k = 0;
      for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) + Math.abs(d[i + 2] - d[2]) > 30) k++;
      return { k, gpu: agGpu.stats().gpuLayers };
    });
    assert.ok(proj.gpu > 0 && proj.k > 20, `projection shows GPU frame (${JSON.stringify(proj)})`);
    await page.evaluate(() => projectionWindow && projectionWindow.close());

    // Recording captures frameCv while GPU path is active.
    const dl = page.waitForEvent('download', { timeout: 20000 });
    await page.evaluate(() => { agGpu.setMode('gpu'); agGpu.resetStats(); startRecording(); });
    await page.waitForTimeout(1500);
    const recStats = await page.evaluate(() => agGpu.stats());
    await page.evaluate(() => stopRecording());
    const file = await dl;
    assert.ok(recStats.gpuLayers > 0, 'GPU path active while recording');
    assert.match(file.suggestedFilename(), /^audiograph\./);
    await page.evaluate(() => { if (playing) togglePlay(); });

    // Backend switch via UI persists; URL override wins.
    await page.selectOption('#rendererBackend', 'canvas');
    assert.equal(await page.evaluate(() => localStorage.getItem('audiograph_renderer')), 'canvas');
    assert.match(await page.evaluate(() => agGpu.status()), /Canvas 2D \(original\)/);
    await page.reload();
    assert.equal(await page.evaluate(() => agGpu.stats().mode), 'canvas', 'choice persists');
    await page.goto(page.url().split('?')[0] + '?renderer=gpu');
    assert.equal(await page.evaluate(() => agGpu.stats().mode), 'gpu', 'URL override');
    await page.evaluate(() => localStorage.removeItem('audiograph_renderer'));

    assert.deepEqual(errors, [], 'no page errors');
    console.log('gpu-renderer: PASS');
  } finally { await s.close(); }
}

run().catch(e => { console.error(e); process.exit(1); });
