// v36: Pixel Warp full-frame Patterns (Noise default, Diffuse, Curl, Turb, Waves, Cells) deform the whole
// frame instead of bulging from the centre: under heavy bass the centre stays covered while legacy Radial empties it. Build: AUDIOGRAPH_PWDIFFUSE_BUILD.
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
      for (const d of ['radial', 'noise', 'diffuse', 'curl', 'turb', 'waves', 'cells']) {
        pixelWarpDir = d; agPixelWarp.reset();
        for (let k = 0; k < 30; k++) { frameCtx.setTransform(1, 0, 0, 1, 0, 0); frameCtx.clearRect(0, 0, W, H); agPixelWarp.draw(frameCtx, W, H, bass, p, false); }
        const dat = frameCtx.getImageData(0, 0, W, H).data;
        const cov = (x0, y0, x1, y1) => { let n = 0, c = 0; for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { n++; if (dat[(y * W + x) * 4 + 3] > 20) c++; } return c / n; };
        out[d] = { png: frameCv.toDataURL('image/png').split(',')[1], center: cov(W * .4 | 0, H * .4 | 0, W * .6 | 0, H * .6 | 0), edge: cov(0, 0, W * .15 | 0, H) };
      }
      return out;
    });
    assert.equal(r.def, 'noise', 'Noise is the default pattern');
    assert.ok(r.radial.center < 0.15, `legacy radial still opens the centre (${r.radial.center})`);
    const shots = '/Users/petkovic/.copilot/session-state/2b2968de-ab6c-4f2c-8575-016c32bb8774/files';
    const sums = [];
    for (const d of ['noise', 'diffuse', 'curl', 'turb', 'waves', 'cells']) {
      assert.ok(r[d].center > 0.3, `${d} keeps the centre covered (${r[d].center})`);
      assert.ok(r[d].edge > 0.15, `${d} keeps the edges covered (${r[d].edge})`);
      if (fs.existsSync(shots)) fs.writeFileSync(`${shots}/pw-pattern-${d}.png`, Buffer.from(r[d].png, 'base64'));
      sums.push(`${d} ${r[d].center.toFixed(2)}/${r[d].edge.toFixed(2)}`);
    }
    const btns = await page.$$eval('.mbtn[onclick^="setPixelWarpDir"]', b => b.map(x => x.textContent));
    assert.deepEqual(btns, ['Noise', 'Diffuse', 'Curl', 'Turb', 'Waves', 'Cells']);
    assert.deepEqual(errors, []);
    console.log(`pixel-warp-diffuse: PASS (radial centre ${r.radial.center.toFixed(2)}; ${sums.join(', ')})`);
  } finally { await t.close(); }
})().catch(e => { console.error(e); process.exit(1); });
