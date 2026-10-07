// v38: Pixel Warp pixel Shape (Square, Round, Diamond, Hex) in Pixels mode; saved per layer.
process.env.AUDIOGRAPH_PARTICLE_BUILD = process.env.AUDIOGRAPH_PWSHAPE_BUILD || 'versions/audiograph_38.html';
process.env.AUDIOGRAPH_BUILD_31 = process.env.AUDIOGRAPH_PARTICLE_BUILD;
const fs = require('node:fs');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && fs.existsSync(chrome)) process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = chrome;
const assert = require('node:assert/strict');
const { open } = require('./audio-common.cjs');
const SHOTS = process.env.AG_SHOTS || '';

(async () => {
  const t = await open({ viewport: { width: 1280, height: 800 } });
  const { page, errors } = t;
  try {
    await page.evaluate(() => { particlesOn = false; [...document.querySelectorAll('.mbtn')].find(b => /setLayout\('pixelwarp'/.test(b.getAttribute('onclick') || '')).click(); const r = document.getElementById('pPwRes'); r.value = 40; r.dispatchEvent(new Event('input', { bubbles: true })); });
    const cover = () => page.evaluate(() => { renderDensity(); const d = frameCtx.getImageData(0, 0, frameCv.width, frameCv.height).data; let ink = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 90) ink++; return ink / (d.length / 4); });
    assert.equal(await page.evaluate(() => pixelWarpShape), 'square', 'default Square');
    const c = {};
    for (const sh of ['square', 'round', 'diamond', 'hex']) {
      await page.locator(`#pwShapeRow .mbtn[onclick*="'${sh}'"]`).click();
      c[sh] = await cover();
      if (SHOTS) await page.locator('#frameCv').screenshot({ path: `${SHOTS}/pw-shape-${sh}.png` });
      assert.equal(await page.evaluate(() => document.querySelector('#pwShapeRow .mbtn.on').textContent.toLowerCase()), sh);
    }
    assert.ok(c.square > c.hex && c.square > c.round && c.hex > c.diamond && c.round > c.diamond, 'coverage ordering ' + JSON.stringify(c));
    assert.ok(c.round / c.square > 0.65 && c.round / c.square < 0.9, 'round ≈ π/4 of square ' + JSON.stringify(c));
    const saved = await page.evaluate(() => JSON.stringify(getState()).includes('"_pwShape":"hex"'));
    assert.ok(saved, 'shape saved per layer');
    await page.locator('#layoutOpts_pixelwarp .mbtn[onclick*="setPixelWarpMode(\'mesh\'"]').click();
    assert.equal(await page.evaluate(() => getComputedStyle(pwShapeRow).display), 'none', 'Shape hidden in Mesh mode');
    assert.deepEqual(errors, []);
    console.log('pixel-shape: PASS ' + JSON.stringify(c));
  } finally { await t.close(); }
})().catch(e => { console.error(e); process.exit(1); });
