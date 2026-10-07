// v35: Image / Video grid layouts keep the source aspect ratio (contain, centred) instead of
// stretching to the canvas; Pixel Warp defaults to Contain. Build: AUDIOGRAPH_ASPECT_BUILD.
process.env.AUDIOGRAPH_GPU_BUILD = process.env.AUDIOGRAPH_ASPECT_BUILD || 'versions/audiograph_35.html';
const fs = require('node:fs');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && fs.existsSync(chrome)) process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = chrome;
const assert = require('node:assert/strict');
const { open } = require('./gpu-common.cjs');
const raf2 = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const svg = (w, h) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#fff"/></svg>`);

async function bbox(page, w, h, name) {
  await page.locator('#imgLayoutInput').setInputFiles({ name, mimeType: 'image/svg+xml', buffer: svg(w, h) });
  await page.waitForFunction(n => imgLayoutImg && imgLayoutImg.complete && imgLayoutImg.naturalWidth > 0, name);
  await page.waitForTimeout(150);
  return page.evaluate(() => {
    setLayout('image'); pImgThreshold.value = 0; upP(); sampleLayoutImage(); renderDensity();
    const W = frameCv.width, H = frameCv.height, d = frameCtx.getImageData(0, 0, W, H).data;
    const bg = [d[0], d[1], d[2]]; let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
      const i = (y * W + x) * 4; if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 40) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    return { W, H, x0, y0, x1, y1, ar: (x1 - x0) / Math.max(1, y1 - y0), fit: typeof pixelWarpFit === 'string' ? pixelWarpFit : null };
  });
}

(async () => {
  const t = await open({ viewport: { width: 1280, height: 820 } });
  const { page, errors } = t;
  try {
    const wide = await bbox(page, 400, 100, 'wide.svg');
    const tall = await bbox(page, 100, 300, 'tall.svg');
    assert.ok(wide.x1 > wide.x0 && tall.y1 > tall.y0, 'image drew ink');
    assert.ok(Math.abs(wide.ar - 4) / 4 < 0.25, `wide 4:1 keeps aspect, got ${wide.ar.toFixed(2)} on ${wide.W}x${wide.H}`);
    assert.ok(Math.abs(tall.ar - 1 / 3) / (1 / 3) < 0.25, `tall 1:3 keeps aspect, got ${tall.ar.toFixed(2)}`);
    assert.ok(Math.abs((tall.x0 + tall.x1) / 2 - tall.W / 2) < tall.W * 0.05, 'tall image centred');
    assert.equal(wide.fit, 'contain', 'Pixel Warp defaults to Contain');
    assert.deepEqual(errors, []);
    console.log(`media-aspect: PASS (wide ${wide.ar.toFixed(2)}, tall ${tall.ar.toFixed(2)})`);
  } finally { await t.close(); }
})().catch(e => { console.error(e); process.exit(1); });
