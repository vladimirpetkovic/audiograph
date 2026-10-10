process.env.AUDIOGRAPH_PARTICLE_BUILD = process.env.AUDIOGRAPH_IPAD_BUILD || 'versions/audiograph_67.html';
process.env.AUDIOGRAPH_BUILD_31 = process.env.AUDIOGRAPH_PARTICLE_BUILD;
const fs = require('node:fs');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && fs.existsSync(chrome)) process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = chrome;
const assert = require('node:assert/strict');
const { open } = require('./audio-common.cjs');

(async () => {
  for (const viewport of [{ width: 820, height: 1180 }, { width: 1024, height: 768 }, { width: 1180, height: 820 }]) {
    const t = await open({ viewport, hasTouch: true });
    try {
      const layout = await t.page.evaluate(() => {
        const rect = selector => {
          const r = document.querySelector(selector).getBoundingClientRect();
          return { width: r.width, height: r.height, right: r.right };
        };
        return {
          coarse: matchMedia('(pointer: coarse)').matches,
          pageWidth: document.documentElement.scrollWidth,
          viewportWidth: innerWidth,
          topBar: rect('.top-bar'),
          topButton: rect('#btnMic'),
          panelHead: rect('#panelAppear .panel-head'),
          panelButton: rect('#panelAppear .mbtn'),
          canvas: rect('.frame-view'),
          canvasVisible: getComputedStyle(document.querySelector('.frame-view')).visibility !== 'hidden',
        };
      });
      assert.equal(layout.coarse, true, 'touch tablet uses coarse-pointer styling');
      assert.ok(layout.pageWidth <= layout.viewportWidth, 'no horizontal page overflow: ' + JSON.stringify(layout));
      assert.ok(layout.topButton.height >= 42, 'toolbar buttons are easy to tap: ' + JSON.stringify(layout));
      assert.ok(layout.panelHead.height >= 44, 'panel navigation has a generous tap target: ' + JSON.stringify(layout));
      assert.ok(layout.panelButton.height >= 36, 'panel controls have larger tap targets: ' + JSON.stringify(layout));
      assert.ok(layout.canvas.width > 0 && layout.canvas.height >= 240 && layout.canvasVisible, 'visual preview remains usable: ' + JSON.stringify(layout));
      const panel = t.page.locator('#panelAppear');
      const wasClosed = await panel.evaluate(el => el.classList.contains('closed'));
      await t.page.locator('#panelAppear .panel-head').tap();
      assert.notEqual(await panel.evaluate(el => el.classList.contains('closed')), wasClosed, 'panel navigation responds to touch');
      assert.deepEqual(t.errors, []);
    } finally { await t.close(); }
  }

  const desktop = await open({ viewport: { width: 1180, height: 820 } });
  try {
    const sizes = await desktop.page.evaluate(() => ({
      toolbar: document.querySelector('#btnMic').getBoundingClientRect().height,
      panelHead: document.querySelector('#panelAppear .panel-head').getBoundingClientRect().height,
    }));
    assert.ok(sizes.toolbar < 42 && sizes.panelHead < 44, 'desktop sizing remains unchanged');
    assert.deepEqual(desktop.errors, []);
  } finally { await desktop.close(); }
  console.log('ipad-ui: PASS (portrait, landscape, touch targets, no horizontal overflow, desktop sizing)');
})().catch(e => { console.error(e); process.exit(1); });
