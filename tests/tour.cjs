// v72: guided tour builds the look step by step and plays a demo beat when no audio is loaded.
process.env.AUDIOGRAPH_PARTICLE_BUILD = process.env.AUDIOGRAPH_TOUR_BUILD || 'versions/audiograph_80.html';
process.env.AUDIOGRAPH_BUILD_31 = process.env.AUDIOGRAPH_PARTICLE_BUILD;
const fs = require('node:fs');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && fs.existsSync(chrome)) process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = chrome;
const assert = require('node:assert/strict');
const { open } = require('./audio-common.cjs');
const SHOTS = process.env.TOUR_SHOTS;

(async () => {
  for (const [w, h, touch] of [[1440, 900, false], [390, 844, true]]) {
    const t = await open({ viewport: { width: w, height: h }, hasTouch: touch });
    const page = t.page;
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.evaluate(() => agTour.start());
    const seen = [];
    for (let i = 0; i < 11; i++) {
      await page.waitForTimeout(500);
      const s = await page.evaluate(() => ({
        title: document.getElementById('agTourTitle').textContent,
        layout: layoutMode, shape: lineShape, particles: particlesOn,
        twist: +document.getElementById('pTwist').value, bloom: layerFx && layerFx.enabled ? layerFx.pfxBloom : 0,
        stops: toneStops[0], playing, hasAudio: !!audio,
        ring: document.getElementById('agTourRing').getBoundingClientRect().width,
        cardVisible: getComputedStyle(document.getElementById('agTourCard')).display !== 'none',
        overflow: document.documentElement.scrollWidth > innerWidth + 1
      }));
      seen.push(s);
      if (SHOTS) await page.screenshot({ path: `/tmp/tour_${w}_${i}.png` });
      assert.ok(s.cardVisible && s.ring > 20, `step ${i} shows card and ring`);
      assert.ok(!s.overflow, `step ${i} has no horizontal overflow at ${w}`);
      if (i < 10) await page.click('#agTourNext');
    }
    assert.equal(seen[0].layout, 'linear', 'starts from a clean linear layer');
    assert.equal(seen[1].layout, 'spiral', 'layout step applies the layout');
    assert.equal(seen[2].shape, 'tapered', 'style step applies the style');
    assert.ok(!seen[3].particles && seen[5].particles, 'particles appear only at the particles step');
    assert.ok(seen[5].twist === 0 && seen[6].twist === 18, 'deformers appear at the deformers step');
    assert.ok(seen[6].bloom === 0 && seen[7].bloom === 45, 'Post FX appear last');
    assert.ok(seen[1].hasAudio && seen[1].playing, 'demo beat loaded and playing after step 1');
    assert.equal(seen[8].title, 'Save it as a Preset'); assert.equal(seen[9].title, 'Save a Video');
    await page.click('#agTourBack');
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => agTour.live), true);
    assert.equal(await page.evaluate(() => layoutMode), 'spiral', 'Back keeps the layout');
    const ui = await page.evaluate(() => {
      const tr = document.querySelector('.transport').getBoundingClientRect(), f = document.getElementById('frameWrap').getBoundingClientRect(), g = document.querySelector('.top-actions .help-q'), q = g.getBoundingClientRect();
      const inRow = id => { const b = document.getElementById(id).getBoundingClientRect(); return b.top >= tr.top - 1 && b.bottom <= tr.bottom + 1 && b.top >= f.bottom - 1; };
      return { below: ['undoBtn', 'stopAudioBtn'].every(inRow), noFrameActions: !document.getElementById('frameActions'), guideText: g.textContent.trim(), tutorial: document.getElementById('tourBtn').textContent.trim(), tutorialInTop: !!document.querySelector('.top-actions #tourBtn'), banner: document.getElementById('agTourBanner').textContent };
    });
    assert.ok(ui.below && ui.noFrameActions, 'Undo/Reset/Play sit below the visuals in the transport row');
    assert.equal(ui.guideText, '?Guide'); assert.equal(ui.tutorial, 'Tutorial'); assert.ok(ui.tutorialInTop);
    assert.match(ui.banner, /Layout|Style|Post FX|Presets|Geometry|Colors|Video|make your own/, 'banner explains the step');
    await page.click('#agTourSkip');
    assert.equal(await page.evaluate(() => agTour.live), false, 'Skip closes the tour');
    assert.deepEqual(errors, [], 'no page errors');
    console.log(`PASS tour at ${w}px`);
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
