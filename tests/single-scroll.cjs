// v39: desktop has one scrollbar (the controls column); the page itself does not scroll and the
// controls column reaches the bottom of the viewport so its last controls are reachable.
process.env.AUDIOGRAPH_PARTICLE_BUILD = process.env.AUDIOGRAPH_SCROLL_BUILD || 'versions/audiograph_39.html';
process.env.AUDIOGRAPH_BUILD_31 = process.env.AUDIOGRAPH_PARTICLE_BUILD;
const fs = require('node:fs');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && fs.existsSync(chrome)) process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = chrome;
const assert = require('node:assert/strict');
const { open } = require('./audio-common.cjs');

(async () => {
  for (const [w, h] of [[1280, 720], [1440, 900], [1920, 1080]]) {
    const t = await open({ viewport: { width: w, height: h } });
    try {
      const r = await t.page.evaluate(() => { const c = document.querySelector('.controls-area'), se = document.scrollingElement; c.scrollTop = 1e6; const last = c.lastElementChild.getBoundingClientRect(); return { page: se.scrollHeight - se.clientHeight, ctrl: c.scrollHeight - c.clientHeight, bottom: Math.round(c.getBoundingClientRect().bottom), lastBottom: Math.round(last.bottom), vh: innerHeight, thumb: getComputedStyle(c, '::-webkit-scrollbar').width }; });
      assert.equal(r.page, 0, 'page does not scroll ' + JSON.stringify(r));
      assert.ok(r.ctrl > 0, 'controls column scrolls');
      assert.ok(Math.abs(r.bottom - r.vh) <= 1, 'controls column reaches viewport bottom ' + JSON.stringify(r));
      assert.ok(r.lastBottom <= r.vh, 'last control reachable ' + JSON.stringify(r));
      assert.deepEqual(t.errors, []);
    } finally { await t.close(); }
  }
  console.log('single-scroll: PASS (one scroller at 720p/900p/1080p)');
})().catch(e => { console.error(e); process.exit(1); });
