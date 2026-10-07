// v39: file videos ping-pong (forward then backward) instead of looping; Pixel Warp never falls back to
// its placeholder while the video is seeking. Also checks the Cells pattern button is gone.
process.env.AUDIOGRAPH_PARTICLE_BUILD = process.env.AUDIOGRAPH_PINGPONG_BUILD || 'versions/audiograph_39.html';
process.env.AUDIOGRAPH_BUILD_31 = process.env.AUDIOGRAPH_PARTICLE_BUILD;
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && fs.existsSync(chrome)) process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = chrome;
const assert = require('node:assert/strict');
const { open } = require('./audio-common.cjs');

(async () => {
  const clip = (process.env.TMPDIR || '/tmp') + '/ag-pingpong.webm';
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30:duration=1.5', '-c:v', 'libvpx', '-g', '1', '-b:v', '400k', clip]);
  const t = await open({ viewport: { width: 1280, height: 800 } });
  const { page, errors } = t;
  try {
    assert.deepEqual(await page.$$eval('.mbtn[onclick^="setPixelWarpDir"]', b => b.map(x => x.textContent)), ['Noise', 'Diffuse', 'Curl', 'Turb', 'Waves']);
    await page.evaluate(() => { particlesOn = false; setLayout('pixelwarp'); setPixelWarpSource('video'); });
    const input = await page.$('input[type=file][onchange*="loadLayoutVideo"]');
    await input.setInputFiles(clip);
    await page.waitForFunction(() => vidEl && vidEl.readyState >= 2 && vidEl.duration > 1);
    const r = await page.evaluate(async () => {
      const seen = [], srcs = [];
      const t0 = performance.now();
      while (performance.now() - t0 < 4200) {
        await new Promise(r => requestAnimationFrame(r));
        renderDensity();
        seen.push([vidEl.currentTime, vidEl._agPP ? vidEl._agPP() : 0]);
        srcs.push(agPixelWarp.stats().source);
      }
      return { loop: vidEl.loop, seen, srcs, dur: vidEl.duration };
    });
    assert.equal(r.loop, false, 'native loop is off');
    const dirs = r.seen.map(s => s[1]);
    const back = r.seen.filter(s => s[1] === -1);
    assert.ok(back.length > 10, 'spent time playing backwards: ' + back.length);
    // During the reverse leg time must go down (allowing for frames where the seek has not landed yet).
    let downs = 0, ups = 0;
    for (let i = 1; i < back.length; i++) { const d = back[i][0] - back[i - 1][0]; if (d < -1e-3) downs++; else if (d > 0.05) ups++; }
    assert.ok(downs > 5 && ups === 0, `reverse leg moves backwards (downs ${downs}, ups ${ups})`);
    // Never jumps from the end to the start (that's the old loop flash); it turns around and returns.
    const firstBack = dirs.indexOf(-1), returnFwd = dirs.indexOf(1, firstBack);
    assert.ok(firstBack > 0 && r.seen[firstBack][0] > r.dur * 0.8, 'turns around near the end');
    assert.ok(returnFwd > firstBack, 'turns forward again after reaching the start');
    assert.ok(r.srcs.every(s => s === 'video'), 'Pixel Warp never shows the placeholder: ' + [...new Set(r.srcs)].join());
    assert.deepEqual(errors, []);
    console.log(`video-pingpong: PASS (${back.length} reverse frames, ${downs} backward steps, no placeholder flash)`);
  } finally { await t.close(); }
})().catch(e => { console.error(e); process.exit(1); });
