// v68: changing aspect (iPad fullscreen and back) must not stretch old Growth trails.
process.env.AUDIOGRAPH_PARTICLE_BUILD = process.env.AUDIOGRAPH_GROWRESIZE_BUILD || 'versions/audiograph_68.html';
process.env.AUDIOGRAPH_BUILD_31 = process.env.AUDIOGRAPH_PARTICLE_BUILD;
const fs = require('node:fs');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && fs.existsSync(chrome)) process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = chrome;
const assert = require('node:assert/strict');
const { open } = require('./audio-common.cjs');

(async () => {
  const t = await open({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  const { page, errors } = t;
  try {
    await page.evaluate(() => {
      setLayout('growth', [...document.querySelectorAll('.mbtn')].find(b => /setLayout\('growth'/.test(b.getAttribute('onclick') || '')));
      agGrowth.clear(); document.getElementById('pGrowTrail').value = 100; upP(); if (!playing) togglePlay();
    });
    await page.waitForTimeout(2500);
    const key = () => page.evaluate(() => Object.keys(agGrowth.stats())[0]);
    const k = await key();
    assert.ok(k, 'growth state exists');
    const before = await page.evaluate(k => { const c = agGrowth.canvas(k); return { w: c.width, h: c.height }; }, k);

    // Same-aspect resize keeps the drawing; a different aspect starts fresh with matching tips.
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.waitForTimeout(600);
    const after = await page.evaluate(k => {
      const c = agGrowth.canvas(k), g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data;
      let ink = 0; for (let i = 3; i < d.length; i += 16) if (d[i] > 20) ink++;
      return { w: c.width, h: c.height, ink, tips: agGrowth.tips(k).length };
    }, k);
    assert.notDeepEqual([after.w, after.h], [before.w, before.h], 'canvas resized');
    const area = after.w * after.h / 16;
    assert.ok(after.ink / area < 0.25, 'old trails are not stretched across the new canvas: ' + JSON.stringify(after));
    assert.deepEqual(errors, []);
    console.log('growth-resize: PASS');
  } finally { await t.close(); }
})().catch(e => { console.error(e); process.exit(1); });
