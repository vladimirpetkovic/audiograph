const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const build = process.env.AUDIOGRAPH_RESOLUTION_BUILD || 'versions/audiograph_24.html';
const html = fs.readFileSync(path.join(__dirname, '..', build));
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

async function dimensions(page, width, height) {
  await page.waitForFunction(({ width, height }) =>
    frameCv.width === width && frameCv.height === height &&
    projectionCanvas.width === width && projectionCanvas.height === height, { width, height });
  assert.equal(await page.locator('#outputResolutionStatus').textContent(), `${width} x ${height} px`);
}

async function frames(page) {
  const start = await page.evaluate(() => globalFrame);
  await page.waitForFunction(start => globalFrame > start + 2, start);
}

(async () => {
  let browser;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
    });
    for (const deviceScaleFactor of [1, 2]) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 }, deviceScaleFactor
      });
      const errors = [];
      context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
      await context.route('https://fonts.googleapis.com/**', route => route.abort());
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.selectOption('#outputResolution', '720');
      assert.equal(await page.locator('#outputResolutionStatus').textContent(), 'Open output to apply');
      const popup = page.waitForEvent('popup');
      await page.click('#projectionBtn');
      let output = await popup;
      await output.setViewportSize({ width: 600, height: 400 });

      for (const [mode, width, height] of [
        ['720', 1280, 720], ['1080', 1920, 1080], ['1440', 2560, 1440], ['2160', 3840, 2160]
      ]) {
        await page.selectOption('#outputResolution', mode);
        await dimensions(page, width, height);
        assert.equal(await page.evaluate(() => sizeCanvas(frameCv).dpr), 1);
      }
      await output.setViewportSize({ width: 400, height: 800 });
      await dimensions(page, 3840, 2160);
      assert.equal(await output.locator('#outputCanvas').evaluate(el => getComputedStyle(el).objectFit), 'contain');
      await page.selectOption('#outputResolution', 'auto');
      const dpr = Math.min(deviceScaleFactor, 1.5);
      await dimensions(page, Math.round(400 * dpr), Math.round(800 * dpr));
      console.log(`PASS: exact 720p/1080p/1440p/4K, fixed resize and Auto sizing at DPR ${deviceScaleFactor}`);

      await page.selectOption('#outputResolution', '720');
      await output.click('#outputFullscreen');
      await output.waitForFunction(() => !!document.fullscreenElement);
      await dimensions(page, 1280, 720);
      await output.keyboard.press('f');
      await output.waitForFunction(() => !document.fullscreenElement);
      await dimensions(page, 1280, 720);
      await page.evaluate(() => setOutputResolution('__proto__'));
      assert.equal(await page.locator('#outputResolution').inputValue(), '720');
      assert.match(await page.locator('#agToast').textContent(), /Unknown output resolution/);
      console.log(`PASS: fullscreen preserves exact pixels and invalid modes are rejected at DPR ${deviceScaleFactor}`);

      await page.click('#btnMic');
      await page.waitForFunction(() => liveMode);
      await page.evaluate(() => {
        document.getElementById('pLines').value = 40; upP();
        if (typeof setPfxTarget === 'function') setPfxTarget('comp'); // v32+: whole-composition FX renders on #postFxCv
        document.getElementById('pfxInvert').value = 50; setPostFx(true);
      });
      await frames(page);
      await page.selectOption('#outputResolution', '1080');
      await dimensions(page, 1920, 1080);
      await page.waitForFunction(() => {
        const fx = document.getElementById('postFxCv');
        return fx.width === 1920 && fx.height === 1080;
      });
      assert.equal(await page.evaluate(() => {
        const expected = document.createElement('canvas');
        expected.width = frameCv.width; expected.height = frameCv.height;
        const ctx = expected.getContext('2d');
        ctx.drawImage(frameCv, 0, 0); ctx.drawImage(document.getElementById('postFxCv'), 0, 0);
        return expected.toDataURL() === projectionCanvas.toDataURL();
      }), true);
      await page.selectOption('#outputResolution', '720');
      await dimensions(page, 1280, 720);
      await page.evaluate(() => { projectionMap.openEditor(); projectionMap.cube(); });
      await frames(page);
      const mapping = await page.evaluate(() => projectionMap.getProfile());
      await page.selectOption('#outputResolution', '1080');
      await dimensions(page, 1920, 1080);
      assert.deepEqual(await page.evaluate(() => projectionMap.getProfile()), mapping);
      assert.deepEqual(await page.evaluate(() => Array.from(projectionCtx.getImageData(0, 0, 1, 1).data)), [0, 0, 0, 255]);
      await page.selectOption('#outputResolution', '720');
      await dimensions(page, 1280, 720);
      await page.evaluate(() => { projectionMap.toggleCalibration(); projectionMap.toggleEnabled(); setPostFx(false); });
      console.log(`PASS: live frame and post-FX resize together; mapping coordinates remain unchanged at DPR ${deviceScaleFactor}`);

      const wav = Buffer.alloc(44 + 8000 * 12 * 2);
      wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
      wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
      wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
      wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
      wav.writeUInt32LE(wav.length - 44, 40);
      for (let i = 0; i < (wav.length - 44) / 2; i++) wav.writeInt16LE(Math.round(Math.sin(i * Math.PI * 2 * 440 / 8000) * 8000), 44 + i * 2);
      await page.locator('#fileInput').setInputFiles({ name: 'resolution.wav', mimeType: 'audio/wav', buffer: wav });
      await page.waitForFunction(() => audioBuffer && audio && source && !liveMode);
      await page.evaluate(() => startRecording());
      await page.waitForFunction(() => isRecording);
      await page.evaluate(() => {
        window.testRecorderError = null;
        mediaRecorder.addEventListener('error', e => { window.testRecorderError = e.error.message; });
      });
      assert.equal(await page.locator('#outputResolution').isDisabled(), true);
      assert.deepEqual(await page.evaluate(() => [frameCv.width, frameCv.height]), [1280, 720]);
      await output.setViewportSize({ width: 900, height: 700 });
      await page.evaluate(() => setOutputResolution('1080'));
      assert.match(await page.locator('#agToast').textContent(), /Stop recording/);
      await frames(page);
      assert.equal(await page.locator('#outputResolution').inputValue(), '720');
      assert.deepEqual(await page.evaluate(() => [frameCv.width, frameCv.height]), [1280, 720]);
      await page.waitForTimeout(1500);
      assert.equal(await page.evaluate(() => testRecorderError), null);
      const download = page.waitForEvent('download');
      await page.evaluate(() => stopRecording());
      const recording = await download;
      const stream = await recording.createReadStream(), chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const bytes = Buffer.concat(chunks).toString('base64');
      const decoded = await output.evaluate(async ({ bytes, mimeType }) => {
        const video = document.createElement('video');
        const url = URL.createObjectURL(new Blob([Uint8Array.from(atob(bytes), c => c.charCodeAt(0))], { type: mimeType }));
        try {
          video.src = url;
          await new Promise((resolve, reject) => {
            video.onloadedmetadata = resolve; video.onerror = () => reject(new Error('Recorded video could not be decoded'));
          });
          return [video.videoWidth, video.videoHeight];
        } finally { URL.revokeObjectURL(url); }
      }, { bytes, mimeType: await page.evaluate(() => recMimeType) });
      assert.deepEqual(decoded, [1280, 720], 'Recorded file, not just canvas, must use selected pixel size');
      assert.equal(await page.locator('#outputResolution').isDisabled(), false);
      await page.selectOption('#outputResolution', '1080');
      await dimensions(page, 1920, 1080);
      console.log(`PASS: recording locks selection and produces exact 720p video at DPR ${deviceScaleFactor}`);

      await output.close();
      await page.waitForFunction(() => projectionWindow === null);
      await page.waitForFunction(() => {
        const r = frameCv.getBoundingClientRect(), dpr = Math.min(devicePixelRatio, dprCap);
        return frameCv.width === Math.round(r.width * dpr) && frameCv.height === Math.round(r.height * dpr);
      });
      const reopened = page.waitForEvent('popup');
      await page.click('#projectionBtn'); output = await reopened;
      await dimensions(page, 1920, 1080);
      // v31+ toggles this button to Play once the file is no longer playing; only stop an active source.
      if (/Stop/.test(await page.locator('#stopAudioBtn').textContent())) await page.click('#stopAudioBtn');
      assert.equal(await page.evaluate(() => typeof playing === 'undefined' || !playing || liveMode), true);
      await page.evaluate(() => applyState(builtinPresets.waves));
      assert.equal(await page.locator('#outputResolution').inputValue(), '1080');
      await dimensions(page, 1920, 1080);
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`PASS: close restores laptop sizing; reopen/presets preserve resolution; no runtime errors at DPR ${deviceScaleFactor}`);
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
