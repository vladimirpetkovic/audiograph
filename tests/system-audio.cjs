const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const build = process.env.AUDIOGRAPH_SYSTEM_BUILD || 'versions/audiograph_27.html';
const html = fs.readFileSync(path.join(__dirname, '..', build));
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

(async () => {
  let browser;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: ['--autoplay-policy=no-user-gesture-required']
    });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.route('https://fonts.googleapis.com/**', route => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.AUDIOGRAPH_SYSTEM_URL || `http://127.0.0.1:${server.address().port}`);
    await page.evaluate(() => {
      window.alerts = [];
      window.alert = message => window.alerts.push(message);
      window.captureCalls = [];
      window.captureMode = 'audio';
      window.testAudioContext = new AudioContext();
      window.makeCapture = audio => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 16;
        const stream = canvas.captureStream(10);
        if (audio) {
          const destination = testAudioContext.createMediaStreamDestination();
          const tone = testAudioContext.createOscillator();
          tone.connect(destination); tone.start();
          stream.addTrack(destination.stream.getAudioTracks()[0]);
        }
        return stream;
      };
      navigator.mediaDevices.getDisplayMedia = options => {
        captureCalls.push(options);
        if (captureMode === 'pending') {
          return new Promise(resolve => { window.resolveCapture = resolve; });
        }
        if (captureMode.endsWith('Error')) {
          return Promise.reject(new DOMException('Test capture error', captureMode));
        }
        window.lastCapture = makeCapture(captureMode !== 'no-audio');
        return Promise.resolve(lastCapture);
      };
    });

    await page.click('#btnSystem');
    await page.waitForFunction(() => activeAudioSource === 'system');
    const options = await page.evaluate(() => captureCalls[0]);
    assert.equal(options.video.displaySurface, 'monitor');
    assert.equal(options.monitorTypeSurfaces, 'include');
    assert.equal(options.systemAudio, 'include');
    assert.equal(options.audio.suppressLocalAudioPlayback, false);
    assert.equal(options.preferCurrentTab, false);
    assert.equal(options.selfBrowserSurface, 'exclude');
    assert.match(await page.locator('#systemAudioHint').textContent(), /connected.*video capture has been stopped/i);
    assert.equal(await page.evaluate(() => lastCapture.getVideoTracks()[0].readyState), 'ended');
    assert.equal(await page.evaluate(() => lastCapture.getAudioTracks()[0].readyState), 'live');
    const frame = await page.evaluate(() => globalFrame);
    await page.waitForFunction(frame => globalFrame > frame + 3, frame);

    await page.click('#stopAudioBtn');
    assert.equal(await page.evaluate(() => liveMode), false);
    assert.match(await page.locator('#systemAudioHint').textContent(), /stopped/);
    assert.equal(await page.evaluate(() => lastCapture.getTracks().every(t => t.readyState === 'ended')), true);
    await page.click('#btnSystem');
    await page.waitForFunction(() => activeAudioSource === 'system');
    await page.click('#btnSystem');
    assert.equal(await page.evaluate(() => liveMode), false);

    await page.evaluate(() => { captureMode = 'no-audio'; });
    await page.click('#btnSystem');
    await page.waitForFunction(() => !systemCapturePending);
    assert.match(await page.locator('#systemAudioHint').textContent(), /No audio.*Chrome Tab/);
    assert.equal(await page.evaluate(() => liveMode), false);
    assert.equal(await page.evaluate(() => lastCapture.getTracks().every(t => t.readyState === 'ended')), true);

    for (const mode of ['AbortError', 'NotAllowedError', 'NotReadableError']) {
      await page.evaluate(mode => { captureMode = mode; }, mode);
      await page.click('#btnSystem');
      await page.waitForFunction(() => !systemCapturePending);
      assert.match(await page.locator('#systemAudioHint').textContent(),
        mode === 'NotReadableError' ? /Cannot connect.*Test capture error/ : /not connected.*retry/);
      assert.equal(await page.locator('#systemAudioHint').isVisible(), true);
      assert.equal(await page.locator('#btnSystem').isEnabled(), true);
      assert.equal(await page.evaluate(() => liveMode), false);
    }

    await page.evaluate(() => { captureMode = 'pending'; window.callCount = captureCalls.length; });
    await page.click('#btnSystem');
    assert.equal(await page.locator('#btnSystem').isDisabled(), true);
    await page.evaluate(() => startSystem());
    assert.equal(await page.evaluate(() => captureCalls.length - callCount), 1);
    await page.evaluate(() => { lastCapture = makeCapture(true); resolveCapture(lastCapture); });
    await page.waitForFunction(() => activeAudioSource === 'system');
    assert.equal(await page.locator('#btnSystem').isEnabled(), true);
    await page.evaluate(() => lastCapture.getAudioTracks()[0].dispatchEvent(new Event('ended')));
    assert.equal(await page.evaluate(() => liveMode), false);
    assert.match(await page.locator('#systemAudioHint').textContent(), /sharing ended/);

    // An old stream's ended event must not stop a newly selected source.
    await page.evaluate(() => { captureMode = 'audio'; });
    await page.click('#btnSystem');
    await page.waitForFunction(() => activeAudioSource === 'system');
    await page.evaluate(async () => {
      const previous = lastCapture;
      window.replacement = makeCapture(true);
      await startLiveInput(replacement); highlightAudioSource('mic');
      previous.getAudioTracks()[0].dispatchEvent(new Event('ended'));
    });
    assert.equal(await page.evaluate(() => activeAudioSource), 'mic');
    assert.equal(await page.evaluate(() => liveStream === replacement && liveMode), true);
    assert.equal(await page.locator('#systemAudioHint').isVisible(), false);

    // Missing audio must not disrupt an already running source.
    await page.evaluate(() => { captureMode = 'no-audio'; });
    await page.click('#btnSystem');
    await page.waitForFunction(() => !systemCapturePending);
    assert.equal(await page.evaluate(() => liveStream === replacement && activeAudioSource === 'mic'), true);
    await page.evaluate(() => stopAudioSource());

    // Release every acquired track if audio setup fails after stream adoption.
    await page.evaluate(() => {
      captureMode = 'audio';
      window.originalStartLiveInput = startLiveInput;
      startLiveInput = async stream => { liveStream = stream; throw new Error('Audio setup failed'); };
    });
    await page.click('#btnSystem');
    await page.waitForFunction(() => !systemCapturePending);
    assert.match(await page.locator('#systemAudioHint').textContent(), /Audio setup failed/);
    assert.equal(await page.locator('#systemAudioHint').isVisible(), true);
    assert.equal(await page.evaluate(() => liveStream === null && !liveMode), true);
    assert.equal(await page.evaluate(() => lastCapture.getTracks().every(t => t.readyState === 'ended')), true);

    await page.evaluate(async () => {
      startLiveInput = originalStartLiveInput;
      await startLiveInput(makeCapture(true)); highlightAudioSource('mic');
      startLiveInput = async () => { stopLive(); throw new Error('Audio initialization failed'); };
    });
    await page.click('#btnSystem');
    await page.waitForFunction(() => !systemCapturePending);
    assert.equal(await page.evaluate(() => activeAudioSource), null);
    assert.equal(await page.locator('#systemAudioHint').isVisible(), true);
    assert.match(await page.locator('#systemAudioHint').textContent(), /Audio initialization failed/);
    assert.equal(await page.evaluate(() => lastCapture.getTracks().every(t => t.readyState === 'ended')), true);

    await page.evaluate(() => {
      startLiveInput = originalStartLiveInput;
      navigator.mediaDevices.getDisplayMedia = undefined;
    });
    await page.click('#btnSystem');
    assert.match(await page.locator('#systemAudioHint').textContent(), /unavailable.*Chrome.*Load audio/);
    assert.deepEqual(await page.evaluate(() => alerts), []);
    assert.deepEqual(errors, []);
    await page.evaluate(() => testAudioContext.close());
    console.log('PASS: Entire Screen preference, audio-only capture, inline errors, retry, cleanup, and source lifecycle');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
