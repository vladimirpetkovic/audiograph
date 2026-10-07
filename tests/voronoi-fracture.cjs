// v35 Voronoi Fracture acceptance: per-layer Post FX stays pixel-stable when off, cracks apart on
// bass/beat drive, recovers, round-trips through layer/preset state, resets off, and logs no errors.
process.env.AUDIOGRAPH_GPU_BUILD = process.env.AUDIOGRAPH_FRACTURE_BUILD || 'versions/audiograph_35.html';
const fs = require('node:fs');
const path = require('node:path');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && fs.existsSync(chrome)) process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = chrome;
const assert = require('node:assert/strict');
const { open, diff } = require('./gpu-common.cjs');

const shots = '/Users/petkovic/.copilot/session-state/2b2968de-ab6c-4f2c-8575-016c32bb8774/files';
const raf2 = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const wait = ms => new Promise(r => setTimeout(r, ms));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="64" shape-rendering="crispEdges">
<rect width="96" height="64" fill="#f6f0e4"/><circle cx="28" cy="32" r="22" fill="#ff3355"/>
<rect x="48" y="8" width="38" height="48" fill="#25d0ff"/><path d="M0 64 L96 0" stroke="#111" stroke-width="7"/></svg>`;

async function shot(page, name) {
  if (!fs.existsSync(shots)) return;
  const b64 = await page.evaluate(() => frameCv.toDataURL('image/png').split(',')[1]);
  fs.writeFileSync(path.join(shots, name), Buffer.from(b64, 'base64'));
}
async function pixels(page) {
  return page.evaluate(() => ({ w: frameCv.width, h: frameCv.height, data: Array.from(frameCtx.getImageData(0, 0, frameCv.width, frameCv.height).data) }));
}
async function render(page) { await page.evaluate(() => renderDensity()); await raf2(page); return pixels(page); }

(async () => {
  const t = await open({ viewport: { width: 1280, height: 820 } });
  const { page, errors } = t;
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  try {
    await page.locator('#imgLayoutInput').setInputFiles({ name: 'fracture.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) });
    await page.waitForFunction(() => imgLayoutImg && imgLayoutImg.complete);
    await page.evaluate(() => {
      agGpu.setMode('canvas'); if (typeof agParticles !== 'undefined') agParticles.setMode('cpu');
      setLayout('pixelwarp'); pixelWarpMode = 'mesh'; pixelWarpSource = 'image'; pixelWarpFit = 'contain';
      pPwDisplace.value = 0; pPwDepth.value = 0; pPwFlash.value = 0; pPwSat.value = 100; pPwBright.value = 100; pPwContrast.value = 100;
      syncPixelWarpUI(); upP(); window.__agFractureDrive = { bass: 0, beat: 0 }; renderDensity();
    });
    const base = await render(page);
    await shot(page, 'fracture-rest.png');

    // Off remains unchanged even if the fracture parameter defaults are non-zero.
    await page.evaluate(() => { layerFx = pfxDefault(); layerFx.enabled = true; layerFx.pfxFracture = false; _pfxStoreLayer(); renderDensity(); });
    const off = await render(page);
    assert.ok(diff(base, off).mean < 1.0, `fracture off changed frame mean=${diff(base, off).mean}`);

    // On at silence should be effectively intact (only the GL upload/pass is allowed to differ slightly).
    await page.evaluate(() => { layerFx = pfxDefault(); layerFx.enabled = true; layerFx.pfxFracture = true; layerFx.pfxFracGap = 34; layerFx.pfxFracDisp = 70; layerFx.pfxFracRot = 46; _pfxStoreLayer(); window.__agFractureDrive = { bass: 0, beat: 0 }; renderDensity(); });
    const quiet = await render(page);
    const dq = diff(base, quiet);
    assert.ok(dq.mean < 1.5 && dq.big < 0.005, `silence not intact mean=${dq.mean} big=${dq.big}`);

    // Bass + beat drive opens cracks, offsets/rotates shards and visibly changes the image.
    await page.evaluate(() => { window.__agFractureDrive = { bass: 1, beat: 1 }; });
    for (let i = 0; i < 8; i++) { await wait(40); await page.evaluate(() => renderDensity()); }
    const hit = await render(page);
    await shot(page, 'fracture-shattered.png');
    const dh = diff(base, hit);
    assert.ok(dh.mean > 5 && dh.big > 0.015, `drive did not visibly shatter mean=${dh.mean} big=${dh.big}`);

    // v37: under steady sound the crack network drifts smoothly (frames change, but only a little between frames),
    // and Size var produces a different, multi-scale partition.
    await wait(60); const drift1 = await render(page); await wait(60); const drift2 = await render(page);
    const dd = diff(drift1, drift2);
    assert.ok(dd.mean > 0.05, `cracks should drift under steady sound mean=${dd.mean}`);
    assert.ok(dd.mean < dh.mean * 0.6, `drift should be smooth, not a reshuffle step=${dd.mean} hit=${dh.mean}`);
    await page.evaluate(() => { layerFx.pfxFracSize = 0; _pfxStoreLayer(); });
    const uni = await render(page);
    await page.evaluate(() => { layerFx.pfxFracSize = 100; _pfxStoreLayer(); });
    const multi = await render(page);
    assert.ok(diff(uni, multi).mean > 1, 'Size var changes the fracture layout');
    await page.evaluate(() => { layerFx.pfxFracSize = 65; _pfxStoreLayer(); });

    // v39: Noise bends the crack lines organically; Shatter mode is the static v35/v36 partition (no drift).
    if (await page.evaluate(() => 'pfxFracNoise' in pfxDefault())) {
      await page.evaluate(() => { layerFx.pfxFracNoise = 0; _pfxStoreLayer(); });
      const straight = await render(page); await shot(page, 'fracture-noise0.png');
      await page.evaluate(() => { layerFx.pfxFracNoise = 100; _pfxStoreLayer(); });
      const wobbly = await render(page); await shot(page, 'fracture-noise100.png');
      assert.ok(diff(straight, wobbly).mean > 1, 'Noise changes the crack shapes');
      await page.evaluate(() => { layerFx.pfxFracNoise = 35; layerFx.pfxFracMode = 'shatter'; _pfxStoreLayer(); syncPfxPanel(); });
      const hidden = await page.evaluate(() => [...document.querySelectorAll('.frac-flow-only')].every(e => getComputedStyle(e).display === 'none'));
      assert.ok(hidden, 'Size var / Drift hidden in Shatter');
      const s1 = await render(page); await shot(page, 'fracture-shatter.png'); await wait(120); const s2 = await render(page);
      assert.ok(diff(base, s1).mean > 5, 'Shatter mode still cracks under drive');
      assert.ok(diff(s1, s2).mean < 0.5, `Shatter is static under steady drive mean=${diff(s1, s2).mean}`);
      const saved = await page.evaluate(() => JSON.stringify(getState()).includes('"pfxFracMode":"shatter"'));
      assert.ok(saved, 'Mode saved with the layer');
      await page.evaluate(() => { layerFx.pfxFracMode = 'flow'; _pfxStoreLayer(); syncPfxPanel(); });
    }

    // Drive stops: the envelope decays according to Recovery and returns toward the intact frame.
    await page.evaluate(() => { window.__agFractureDrive = { bass: 0, beat: 0 }; });
    for (let i = 0; i < 12; i++) { await wait(110); await page.evaluate(() => renderDensity()); }
    const rec = await pixels(page);
    const dr = diff(base, rec);
    assert.ok(dr.mean < dh.mean * 0.55, `fracture did not recover enough hit=${dh.mean} recovered=${dr.mean}`);

    // Layer switching preserves per-layer params; preset-style save/load round-trips them.
    const round = await page.evaluate(() => {
      const saved0 = JSON.parse(JSON.stringify(stackLayouts[0].params._postFx));
      addLayer();
      const layer1Off = stackLayouts[1].params._postFx.enabled === false && stackLayouts[1].params._postFx.pfxFracture === false;
      selectLayer(0);
      const panelBack = { on: layerFx.enabled, fracture: layerFx.pfxFracture, cells: +pfxFracCells.value, gap: +pfxFracGap.value };
      pfxFracCells.value = 37; pfxFracGap.value = 41; upPostFx();
      const st = getState(); localStorage.setItem('audiograph_presets', JSON.stringify({ fractureProbe: st }));
      resetAll();
      const fromLs = JSON.parse(localStorage.getItem('audiograph_presets')).fractureProbe; applyState(fromLs);
      const restored = stackLayouts[0].params._postFx;
      resetAll();
      const reset = stackLayouts[0].params._postFx;
      return { saved0, layer1Off, panelBack, restored, reset };
    });
    assert.equal(round.layer1Off, true, 'new layer starts fracture off');
    assert.equal(round.panelBack.fracture, true, 'switching back restores fracture on');
    assert.equal(round.panelBack.cells, 44); assert.equal(round.panelBack.gap, 34);
    assert.equal(round.restored.pfxFracture, true); assert.equal(round.restored.pfxFracCells, 37); assert.equal(round.restored.pfxFracGap, 41);
    assert.equal(round.reset.enabled, false); assert.equal(round.reset.pfxFracture, false);

    assert.deepEqual(errors, []);
    console.log(`voronoi-fracture: PASS (quiet mean ${dq.mean.toFixed(2)}, hit mean ${dh.mean.toFixed(2)}, recovered ${dr.mean.toFixed(2)}, screenshots in ${shots})`);
  } finally { await t.close(); }
})().catch(e => { console.error(e); process.exit(1); });
