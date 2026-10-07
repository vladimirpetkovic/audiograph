// v35 Pixel Warp acceptance: original image/video colours are rendered directly, with GPU vertex
// displacement driven by audio bands, per-layer params round-tripping through presets/reset, and no
// console errors. Build: AUDIOGRAPH_PIXELWARP_BUILD (default versions/audiograph_35.html).
process.env.AUDIOGRAPH_GPU_BUILD = process.env.AUDIOGRAPH_PIXELWARP_BUILD || 'versions/audiograph_35.html';
const fs = require('node:fs');
const path = require('node:path');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && fs.existsSync(chrome)) process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = chrome;
const assert = require('node:assert/strict');
const { open, diff } = require('./gpu-common.cjs');

const shots = '/Users/petkovic/.copilot/session-state/2b2968de-ab6c-4f2c-8575-016c32bb8774/files';
const raf2 = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" shape-rendering="crispEdges">
<rect width="32" height="32" fill="#ff0000"/><rect x="32" width="32" height="32" fill="#00ff00"/>
<rect y="32" width="32" height="32" fill="#0000ff"/><rect x="32" y="32" width="32" height="32" fill="#ffff00"/></svg>`;

async function setupImage(page) {
  await page.locator('#imgLayoutInput').setInputFiles({ name: 'pixelwarp.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) });
  await page.waitForFunction(() => imgLayoutImg && imgLayoutImg.complete);
  await page.evaluate(() => {
    setLayout('pixelwarp');
    pixelWarpMode = 'mesh'; pixelWarpSource = 'image'; pixelWarpFit = 'contain'; pixelWarpDir = 'radial';
    pPwDisplace.value = 0; pPwDepth.value = 0; pPwRes.value = 64; pPwSize.value = 100; pPwSat.value = 100; pPwBright.value = 100; pPwContrast.value = 100; pPwFlash.value = 0;
    syncPixelWarpUI(); upP(); renderDensity();
  });
  await raf2(page);
}
async function shot(page, name) {
  if (!fs.existsSync(shots)) return;
  const b64 = await page.evaluate(() => frameCv.toDataURL('image/png').split(',')[1]);
  fs.writeFileSync(path.join(shots, name), Buffer.from(b64, 'base64'));
}
function near(got, want, tol, label) {
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(got[i] - want[i]) <= tol, `${label} channel ${i}: ${got} vs ${want}`);
}

(async () => {
  const t = await open({ viewport: { width: 1280, height: 820 } });
  const { page, errors } = t;
  try {
    await setupImage(page);

    // Source colours at rest: sample the four quadrant centres of the contained square.
    const colors = await page.evaluate(() => {
      const w = frameCv.width, h = frameCv.height, side = Math.min(w, h), cx = w / 2, cy = h / 2, q = side / 4;
      const pts = [[cx - q, cy - q], [cx + q, cy - q], [cx - q, cy + q], [cx + q, cy + q]];
      return pts.map(([x, y]) => Array.from(frameCtx.getImageData(Math.round(x), Math.round(y), 1, 1).data));
    });
    near(colors[0], [255, 0, 0], 28, 'red');
    near(colors[1], [0, 255, 0], 28, 'green');
    near(colors[2], [0, 0, 255], 28, 'blue');
    near(colors[3], [255, 255, 0], 28, 'yellow');
    await shot(page, 'pixelwarp-rest.png');

    // Direct draw probe: bass-heavy input displaces much more than silence.
    const motion = await page.evaluate(() => {
      const W = frameCv.width, H = frameCv.height, p = P(), saveAn = analyser; analyser = null;
      function draw(vals) {
        frameCtx.setTransform(1, 0, 0, 1, 0, 0); frameCtx.clearRect(0, 0, W, H);
        agPixelWarp.draw(frameCtx, W, H, vals, p, false);
        return { data: Array.from(frameCtx.getImageData(0, 0, W, H).data) };
      }
      pPwDisplace.value = 80; pPwBass.value = 160; pPwMid.value = 0; pPwTreble.value = 0; pPwFlash.value = 0; pixelWarpMode = 'pixels';
      const z = Array(192).fill(0), low = Array.from({ length: 192 }, (_, i) => i < 24 ? 0.35 : 0), bass = Array.from({ length: 192 }, (_, i) => i < 24 ? 1 : 0);
      const a = draw(z), b = draw(low), c = draw(bass); analyser = saveAn; return { a, b, c, stats: agPixelWarp.stats() };
    });
    const dLow = diff(motion.a, motion.b), dBass = diff(motion.a, motion.c);
    assert.ok(dLow.mean > 0.2, `low bass moves pixels mean=${dLow.mean}`);
    assert.ok(dBass.mean > dLow.mean * 1.25, `strong bass moves more ${dLow.mean} -> ${dBass.mean}`);
    assert.equal(motion.stats.mode, 'pixels');
    await shot(page, 'pixelwarp-bass.png');

    // Mesh and Pixels both render; resolution changes rebuild the grid.
    const modes = await page.evaluate(() => {
      function render(mode, res) { pixelWarpMode = mode; pPwRes.value = res; upP(); renderDensity(); return agPixelWarp.stats(); }
      const a = render('pixels', 32), b = render('mesh', 96);
      return { a, b };
    });
    assert.equal(modes.a.mode, 'pixels');
    assert.equal(modes.a.cols, 32);
    assert.equal(modes.b.mode, 'mesh');
    assert.equal(modes.b.cols, 96);
    assert.ok(modes.b.verts > modes.a.verts, 'higher mesh resolution has more vertices');
    await shot(page, 'pixelwarp-mesh.png');

    // Layout params/preset-style roundtrip and Reset restore defaults.
    const roundtrip = await page.evaluate(() => {
      pixelWarpMode = 'pixels'; pixelWarpSource = 'video'; pixelWarpFit = 'cover'; pixelWarpDir = 'explode';
      pPwRes.value = 123; pPwBass.value = 177; pPwLuma.value = -40; upP();
      const saved = getLayoutParams();
      pixelWarpMode = 'mesh'; pixelWarpSource = 'image'; pixelWarpFit = 'contain'; pixelWarpDir = 'up';
      pPwRes.value = 16; pPwBass.value = 0; pPwLuma.value = 0; setLayoutParams(saved); upP();
      const restored = getLayoutParams();
      resetAll(); // Reset
      const reset = getLayoutParams();
      return { restored, reset };
    });
    assert.equal(roundtrip.restored._pwMode, 'pixels');
    assert.equal(roundtrip.restored._pwSource, 'video');
    assert.equal(roundtrip.restored._pwDir, 'explode');
    assert.equal(roundtrip.restored.pPwRes, 123);
    assert.equal(roundtrip.restored.pPwBass, 177);
    assert.equal(roundtrip.restored.pPwLuma, -40);
    assert.equal(roundtrip.reset.pPwRes, 192);
    assert.equal(roundtrip.reset._pwMode, 'pixels');

    // Video source via canvas.captureStream renders and reports video.
    const video = await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 96; c.height = 64;
      const x = c.getContext('2d'); x.fillStyle = '#11ccff'; x.fillRect(0, 0, 96, 64); x.fillStyle = '#ff0080'; x.fillRect(48, 0, 48, 64);
      setLayout('pixelwarp'); vidEl = document.createElement('video'); vidEl.muted = true; vidEl.playsInline = true; vidEl.srcObject = c.captureStream(12); document.body.appendChild(vidEl);
      await vidEl.play(); for(let i=0;i<20&&!vidEl.videoWidth;i++) await new Promise(r=>setTimeout(r,50)); pixelWarpSource = 'video'; pixelWarpMode = 'mesh'; if(stackLayouts[getActiveLayerIdx()]&&stackLayouts[getActiveLayerIdx()].params){stackLayouts[getActiveLayerIdx()].params._pwSource='video';stackLayouts[getActiveLayerIdx()].params._pwMode='mesh';} pPwDisplace.value = 0; renderDensity();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return agPixelWarp.stats();
    });
    assert.equal(video.source, 'video');
    assert.ok(video.gpu, 'video uses GPU path');

    assert.deepEqual(errors, []);
    console.log(`pixel-warp: PASS (colors ok, bass mean ${dBass.mean.toFixed(2)}, screenshots in ${shots})`);
  } finally {
    await t.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
