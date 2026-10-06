const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const build = process.env.AUDIOGRAPH_FULLSCREEN_BUILD || 'versions/audiograph_26.html';
const html = fs.readFileSync(path.join(__dirname, '..', build));
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

function audioFile() {
  const rate = 8000, samples = rate * 30, wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(
    Math.sin(i / rate * 440 * Math.PI * 2) * (0.35 + 0.2 * Math.sin(i / rate * Math.PI * 2)) * 32767
  ), 44 + i * 2);
  return { name: 'fullscreen.wav', mimeType: 'audio/wav', buffer: wav };
}

async function progress(page) {
  const start = await page.evaluate(() => globalFrame);
  await page.waitForFunction(start => globalFrame > start + 4, start, { timeout: 5000, polling: 50 });
}

(async () => {
  let browser;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream']
    });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    await context.route('https://fonts.googleapis.com/**', route => route.abort());
    const page = await context.newPage();
    await page.addInitScript(() => {
      // Emulate browsers suspending the hidden controller's rAF, without stopping its JS or audio.
      const request = window.requestAnimationFrame.bind(window);
      const cancel = window.cancelAnimationFrame.bind(window);
      const hidden = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden').get;
      let id = 0;
      const pending = new Map();
      window.controllerFramesBlocked = false;
      Object.defineProperty(document, 'hidden', {
        configurable: true, get: () => window.controllerFramesBlocked || hidden.call(document)
      });
      window.requestAnimationFrame = callback => {
        const handle = ++id;
        const frame = { callback, nativeId: null };
        pending.set(handle, frame);
        frame.nativeId = request(ts => {
          if (window.controllerFramesBlocked) return;
          pending.delete(handle); callback(ts);
        });
        return handle;
      };
      window.cancelAnimationFrame = handle => {
        const frame = pending.get(handle);
        if (frame) { cancel(frame.nativeId); pending.delete(handle); }
      };
      window.releaseControllerFrames = () => {
        window.controllerFramesBlocked = false;
        for (const [handle, frame] of pending) {
          cancel(frame.nativeId);
          frame.nativeId = request(ts => { pending.delete(handle); frame.callback(ts); });
        }
      };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator('#fileInput').setInputFiles(audioFile());
    await page.waitForFunction(() => audioBuffer && audio && source);
    await page.evaluate(() => {
      setLayout('circle');
      document.getElementById('pLines').value = 30;
      document.getElementById('pSpin').value = 3; upP();
    });
    await page.click('#playBtn');
    await progress(page);
    await page.evaluate(() => { window.controllerFramesBlocked = true; });
    await page.waitForTimeout(100);
    const suspended = await page.evaluate(() => globalFrame);
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => globalFrame), suspended, 'The harness must really suspend the controller clock');

    const popup = page.waitForEvent('popup');
    await page.click('#projectionBtn');
    let output = await popup;
    await output.setViewportSize({ width: 640, height: 360 });
    await output.click('#outputFullscreen');
    await output.waitForFunction(() => !!document.fullscreenElement);
    await progress(page);
    let before = await page.evaluate(() => projectionCanvas.toDataURL());
    await page.waitForTimeout(250);
    assert.notEqual(await page.evaluate(() => projectionCanvas.toDataURL()), before, 'Actual fullscreen pixels must animate, not just counters');
    console.log('PASS: fullscreen file playback and pixels keep moving while controller rAF is suspended');

    await page.evaluate(() => {
      projectionMap.cube(); projectionMap.toggleCalibration(); projectionMap.setSourceMode('span');
      document.getElementById('pfxInvert').value = 30; setPostFx(true);
      realtimePreview = false;
    });
    await progress(page);
    before = await page.evaluate(() => projectionCanvas.toDataURL());
    await page.waitForTimeout(250);
    assert.notEqual(await page.evaluate(() => projectionCanvas.toDataURL()), before);
    await output.keyboard.press('f');
    await output.waitForFunction(() => !document.fullscreenElement);
    await progress(page);
    await output.click('#outputFullscreen');
    await output.waitForFunction(() => !!document.fullscreenElement);
    await progress(page);
    console.log('PASS: mapped/post-FX output animates with laptop preview disabled across fullscreen enter/exit');

    await page.evaluate(() => {
      realtimePreview = true;
      builtinPresets.fullscreenA = getState();
      builtinPresets.fullscreenB = JSON.parse(JSON.stringify(builtinPresets.fullscreenA));
      builtinPresets.fullscreenB.stackLayouts[0].params._height += 10;
      morphSet = ['fullscreenA', 'fullscreenB'];
      pmT = 0;
      document.getElementById('morphDur').value = 10;
      document.getElementById('pSpeed').value = 1;
      toggleMorphAuto(); toggleMorph();
    });
    const morphStart = await page.evaluate(() => [pmT, morphT]);
    await page.waitForFunction(start => pmT !== start[0] && morphT > start[1], morphStart, { polling: 50, timeout: 5000 });
    const morphEnd = await page.evaluate(() => [pmT, morphT]);
    assert.ok(morphEnd[0] !== morphStart[0] && morphEnd[1] > morphStart[1]);
    await page.evaluate(() => { toggleMorphAuto(); toggleMorph(); });
    const morphStopped = await page.evaluate(() => [pmT, morphT]);
    await page.waitForTimeout(200);
    assert.deepEqual(await page.evaluate(() => [pmT, morphT]), morphStopped);
    console.log('PASS: both morph clocks advance during fullscreen and cancel cleanly');

    await page.evaluate(() => startRecording());
    await page.waitForFunction(() => isRecording, null, { polling: 50 });
    const recordingStarted = await page.evaluate(() => document.getElementById('recTimer').textContent);
    await page.waitForTimeout(1300);
    assert.notEqual(await page.evaluate(() => document.getElementById('recTimer').textContent), recordingStarted);
    const download = page.waitForEvent('download');
    await page.evaluate(() => stopRecording());
    assert.equal(await (await download).failure(), null);
    console.log('PASS: recording and timer continue on the output clock');

    await page.click('#playBtn');
    const paused = await page.evaluate(() => globalFrame);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => globalFrame), paused);
    await page.click('#playBtn');
    await progress(page);
    await page.click('#btnMic');
    await page.waitForFunction(() => liveMode, null, { polling: 50 });
    await progress(page);
    before = await page.evaluate(() => projectionCanvas.toDataURL());
    await page.waitForTimeout(250);
    assert.notEqual(await page.evaluate(() => projectionCanvas.toDataURL()), before);
    console.log('PASS: file pause/resume cancellation and live microphone advance in fullscreen');

    await page.evaluate(() => toggleCam());
    await page.waitForFunction(() => camActive && camColors, null, { polling: 50 });
    const camera = await page.evaluate(() => ({ width: camColors.width, height: camColors.height }));
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => Array.from(visualFrames.values()).some(f =>
      f.callback.name === 'sampleCamLoop' && f.owner === projectionWindow)), true);
    assert.ok(camera.width > 0);
    await page.evaluate(() => stopCam());
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => Array.from(visualFrames.values()).some(f =>
      f.callback.name === 'sampleCamLoop')), false);
    console.log('PASS: webcam sampling uses the output clock and releases its pending callback when stopped');

    await page.evaluate(() => {
      releaseControllerFrames();
      window.hideOutputClock = true;
      Object.defineProperty(projectionWindow.document, 'hidden', { configurable: true, get: () => window.hideOutputClock });
      projectionWindow.document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal(await page.evaluate(() => visualFrames.get(rafId).owner === window), true);
    await progress(page);
    await page.evaluate(() => {
      window.hideOutputClock = false;
      projectionWindow.document.dispatchEvent(new Event('visibilitychange'));
      window.controllerFramesBlocked = true;
    });
    assert.equal(await page.evaluate(() => visualFrames.get(rafId).owner === projectionWindow), true);
    await progress(page);
    console.log('PASS: visibility changes hand the animation clock between windows');

    await page.evaluate(() => releaseControllerFrames());
    await output.close();
    await page.waitForFunction(() => projectionWindow === null, null, { polling: 50 });
    await progress(page);
    assert.equal(await page.evaluate(() => visualFrames.get(rafId).owner === window), true);
    const reopened = page.waitForEvent('popup');
    await page.click('#projectionBtn'); output = await reopened;
    await page.evaluate(() => { window.controllerFramesBlocked = true; });
    await output.click('#outputFullscreen');
    await output.waitForFunction(() => !!document.fullscreenElement);
    await progress(page);
    console.log('PASS: closing/reopening output migrates the live loop without losing or duplicating it');

    await page.click('#stopAudioBtn');
    const stopped = await page.evaluate(() => globalFrame);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => globalFrame), stopped);
    assert.equal(await page.evaluate(() => visualFrames.size), 0, 'All stopped loops must release their pending frames');
    await page.evaluate(() => {
      window.cancelledFired = false;
      cancelVisualFrame(requestVisualFrame(() => { window.cancelledFired = true; }));
    });
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => cancelledFired), false);
    assert.deepEqual(errors, []);
    console.log('PASS: stop/cancel releases scheduled callbacks; no browser runtime errors');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
