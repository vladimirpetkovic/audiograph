const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const build = process.env.AUDIOGRAPH_BUILD || 'index.html';
const html = fs.readFileSync(path.join(__dirname, '..', build));
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

function audioFile() {
  const rate = 8000, duration = 12, samples = rate * duration;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    wav.writeInt16LE(Math.round(Math.sin(i / rate * 440 * Math.PI * 2) *
      (0.35 + 0.2 * Math.sin(i / rate * Math.PI * 2)) * 32767), 44 + i * 2);
  }
  return { name: 'projection-test.wav', mimeType: 'audio/wav', buffer: wav };
}

async function matchingFrame(page) {
  assert.equal(await page.evaluate(() => {
    const expected = document.createElement('canvas');
    expected.width = frameCv.width; expected.height = frameCv.height;
    const ctx = expected.getContext('2d');
    ctx.drawImage(frameCv, 0, 0);
    if (postFxEnabled && postFxGl) ctx.drawImage(document.getElementById('postFxCv'), 0, 0);
    return expected.toDataURL() === projectionCanvas.toDataURL();
  }), true, 'Output pixels must equal the completed controller frame including post-FX');
}

async function nextFrames(page) {
  const start = await page.evaluate(() => globalFrame);
  await page.waitForFunction(start => globalFrame > start + 2, start);
}

async function openOutput(page) {
  const popup = page.waitForEvent('popup');
  await page.click('#projectionBtn');
  const output = await popup;
  await output.waitForSelector('#outputCanvas');
  await output.setViewportSize({ width: 640, height: 360 });
  await page.waitForFunction(() => {
    const dpr = Math.min(projectionWindow.devicePixelRatio, dprCap);
    return frameCv.width === Math.round(640 * dpr) && frameCv.height === Math.round(360 * dpr);
  });
  return output;
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
    const errors = [], dialogs = [];
    context.on('page', page => {
      page.on('pageerror', error => errors.push(error.message));
      page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
    });
    await context.route('https://fonts.googleapis.com/**', route => route.abort());
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);

    let output = await openOutput(page);
    assert.equal(await output.locator('audio, .controls-area, .transport').count(), 0);
    assert.equal(await page.locator('#projectionBtn').getAttribute('aria-pressed'), 'true');
    await matchingFrame(page);
    await page.click('#projectionBtn');
    assert.equal(context.pages().length, 2, 'Focus output must not create duplicate windows');
    console.log('PASS: idle output, projection-only UI, popup reuse');

    await page.locator('#fileInput').setInputFiles(audioFile());
    await page.waitForFunction(() => audioBuffer && audio && source);
    await matchingFrame(page);
    await page.evaluate(() => { document.getElementById('pHeight').value = 95; upP(); });
    await matchingFrame(page);
    await page.evaluate(() => {
      addLayer();
      setLayout('circle');
      document.getElementById('pLines').value = 40; upP();
    });
    await matchingFrame(page);
    await output.setViewportSize({ width: 360, height: 640 });
    await page.waitForFunction(() => frameCv.width === 360 && frameCv.height === 640);
    await matchingFrame(page);
    assert.equal(await page.locator('#frameCv').evaluate(el => getComputedStyle(el).objectFit), 'contain');
    console.log('PASS: paused controls, multiple layers, portrait resize, undistorted preview');

    await output.click('#outputFullscreen');
    await output.waitForFunction(() => !!document.fullscreenElement);
    await output.waitForFunction(() => getComputedStyle(document.getElementById('outputControls')).opacity === '0');
    assert.equal(await output.locator('body').evaluate(el => getComputedStyle(el).cursor), 'none');
    await output.keyboard.press('f');
    await output.waitForFunction(() => !document.fullscreenElement);
    await matchingFrame(page);
    console.log('PASS: fullscreen, automatic UI/cursor hiding, keyboard exit');

    await page.click('#playBtn');
    await nextFrames(page);
    await matchingFrame(page);
    await page.evaluate(() => { setPlayMode('equalizer', document.querySelector('[onclick*="setPlayMode(\'equalizer\'"]')); });
    await nextFrames(page);
    await matchingFrame(page);
    await page.evaluate(() => {
      document.getElementById('pfxInvert').value = 65;
      document.getElementById('pfxBloom').value = 15;
      setPostFx(true);
    });
    await nextFrames(page);
    // v32+: the panel targets the active layer (FX baked into frameCv); then also check the legacy composition FX.
    assert.equal(await page.evaluate(() => !!postFxGl || !!window._pfxLayerPipe), true, 'Post-FX must actually initialize');
    await matchingFrame(page);
    if (await page.evaluate(() => typeof setPfxTarget === 'function')) {
      await page.evaluate(() => { setPfxTarget('comp'); document.getElementById('pfxInvert').value = 65; setPostFx(true); });
      await nextFrames(page);
      assert.equal(await page.evaluate(() => !!postFxGl), true, 'composition Post-FX must initialize');
      await matchingFrame(page);
    }
    await page.evaluate(() => applyPresetMorph(0.4, 'waves', 'globe'));
    await nextFrames(page);
    await matchingFrame(page);
    console.log('PASS: file playback, equalizer, GPU effects, preset morphing');

    await page.evaluate(() => startRecording());
    await page.waitForFunction(() => isRecording);
    const recordingSize = await page.evaluate(() => [frameCv.width, frameCv.height]);
    await output.setViewportSize({ width: 800, height: 450 });
    await nextFrames(page);
    assert.deepEqual(await page.evaluate(() => [frameCv.width, frameCv.height]), recordingSize);
    await matchingFrame(page);
    const download = page.waitForEvent('download');
    await page.evaluate(() => stopRecording());
    const video = await download;
    assert.equal(await video.failure(), null);
    await nextFrames(page);
    assert.deepEqual(await page.evaluate(() => [frameCv.width, frameCv.height]), [800, 450]);
    console.log('PASS: recording remains fixed-size while output resizes and restores afterward');

    await page.click('#playBtn');
    await page.evaluate(() => { bakeMorph(); setPostFx(false); });
    await page.click('#btnMic');
    await page.waitForFunction(() => liveMode);
    await nextFrames(page);
    await matchingFrame(page);
    const liveFrame = await page.evaluate(() => globalFrame);
    await output.close();
    await page.waitForFunction(() => projectionWindow === null);
    await page.waitForFunction(start => liveMode && globalFrame > start + 2, liveFrame);
    assert.equal(await page.evaluate(() => {
      const rect = frameCv.getBoundingClientRect(), dpr = Math.min(devicePixelRatio, dprCap);
      return frameCv.width === Math.round(rect.width * dpr) && frameCv.height === Math.round(rect.height * dpr);
    }), true, 'Closing output must restore controller rendering dimensions');
    output = await openOutput(page);
    await nextFrames(page);
    await matchingFrame(page);
    await page.click('#projectionCloseBtn');
    await page.waitForFunction(() => projectionWindow === null);
    assert.equal(await page.evaluate(() => liveMode), true, 'Closing output must not stop live audio');
    console.log('PASS: live microphone, close/reopen, controller close button, continued audio');

    await page.click('#stopAudioBtn');
    await page.evaluate(() => {
      navigator.mediaDevices.getDisplayMedia = async () => {
        const video = document.createElement('canvas').captureStream().getVideoTracks()[0];
        const audio = audioCtx.createMediaStreamDestination().stream.getAudioTracks()[0];
        return new MediaStream([video, audio]);
      };
    });
    await page.click('#btnSystem');
    await page.waitForFunction(() => liveMode && activeAudioSource === 'system');
    output = await openOutput(page);
    await nextFrames(page);
    await matchingFrame(page);
    await output.click('#outputClose');
    await page.waitForFunction(() => projectionWindow === null);
    assert.equal(await page.evaluate(() => liveMode && activeAudioSource === 'system'), true);
    await page.evaluate(() => liveStream.getAudioTracks()[0].dispatchEvent(new Event('ended')));
    await page.waitForFunction(() => !liveMode && activeAudioSource === null);
    console.log('PASS: system-audio stream path, output Close button, capture-ended cleanup');

    output = await openOutput(page);
    await output.evaluate(() => {
      document.documentElement.requestFullscreen = () => Promise.reject(new Error('test refusal'));
    });
    await output.click('#outputFullscreen');
    await page.waitForTimeout(100);
    assert.match(dialogs.pop(), /Cannot enter fullscreen: test refusal/);
    assert.match(await output.locator('#outputHint').textContent(), /test refusal/);
    const closed = output.waitForEvent('close');
    await page.reload();
    await closed;
    assert.equal(await page.locator('#projectionBtn').getAttribute('aria-pressed'), 'false');
    console.log('PASS: controller reload closes its output');

    await page.evaluate(() => { window.open = () => null; });
    await page.click('#projectionBtn');
    assert.match(dialogs.pop(), /Projection window blocked/);
    assert.equal(await page.evaluate(() => projectionWindow), null);
    assert.deepEqual(errors, [], 'No browser runtime errors');
    assert.deepEqual(dialogs, [], 'No unexpected error dialogs');
    console.log('PASS: fullscreen refusal, popup-blocked guidance, no runtime errors');

    const retina = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const retinaPage = await retina.newPage();
    await retinaPage.goto(`http://127.0.0.1:${server.address().port}`);
    await openOutput(retinaPage);
    assert.deepEqual(await retinaPage.evaluate(() => [frameCv.width, frameCv.height]), [960, 540]);
    await matchingFrame(retinaPage);
    await retina.close();
    assert.match(html.toString(), /Guide .*v([2-9][0-9])/);
    console.log('PASS: high-DPI output respects performance cap; numbered build identified');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
