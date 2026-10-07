// v36: Pixel Warp "Diffuse" direction (default) deforms the whole frame instead of bulging from the
// centre: under heavy bass the centre stays covered while Radial empties it. Build: AUDIOGRAPH_PWDIFFUSE_BUILD.
process.env.AUDIOGRAPH_GPU_BUILD = process.env.AUDIOGRAPH_PWDIFFUSE_BUILD || 'versions/audiograph_36.html';
const fs = require('node:fs');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && fs.existsSync(chrome)) process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = chrome;
const assert = require('node:assert/strict');
const { open } = require('./gpu-common.cjs');
(async () => {
  const t = await open({ viewport: { width: 1280, height: 820 } });
  const { page, errors } = t;
  try {
    const r = await page.evaluate(() => {
      const def = pixelWarpDir;
      setLayout('pixelwarp'); pixelWarpMode = 'pixels'; pixelWarpFit = 'cover'; syncPixelWarpUI();
      const W = frameCv.width, H = frameCv.height, p = P(); analyser = null; pPwDisplace.value = 52; pPwBass.value = 115; pPwDepth.value = 40;
      const bass = Array.from({ length: 192 }, (_, i) => i < 24 ? 1 : 0.3), out = { def };
      for (const d of ['radial', 'diffuse']) {
        pixelWarpDir = d; agPixelWarp.reset();
        for (let k = 0; k < 30; k++) { frameCtx.setTransform(1, 0, 0, 1, 0, 0); frameCtx.clearRect(0, 0, W, H); agPixelWarp.draw(frameCtx, W, H, bass, p, false); }
        const dat = frameCtx.getImageData(0, 0, W, H).data;
        const cov = (x0, y0, x1, y1) => { let n = 0, c = 0; for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { n++; if (dat[(y * W + x) * 4 + 3] > 20) c++; } return c / n; };
        out[d] = { center: cov(W * .4 | 0, H * .4 | 0, W * .6 | 0, H * .6 | 0), edge: cov(0, 0, W * .15 | 0, H) };
      }
      return out;
    });
    assert.equal(r.def, 'diffuse', 'Diffuse is the default direction');
    assert.ok(r.radial.center < 0.15, `radial still opens the centre (${r.radial.center})`);
    assert.ok(r.diffuse.center > 0.35, `diffuse keeps the centre covered (${r.diffuse.center})`);
    assert.ok(r.diffuse.edge > 0.2, `diffuse keeps the edges covered (${r.diffuse.edge})`);
    assert.deepEqual(errors, []);
    console.log(`pixel-warp-diffuse: PASS (centre radial ${r.radial.center.toFixed(2)} vs diffuse ${r.diffuse.center.toFixed(2)})`);
  } finally { await t.close(); }
})().catch(e => { console.error(e); process.exit(1); });
