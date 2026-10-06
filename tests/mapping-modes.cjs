const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const build = process.env.AUDIOGRAPH_MODES_BUILD || 'versions/audiograph_25.html';
const html = fs.readFileSync(path.join(__dirname, '..', build));
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

async function paint(page, effects = false) {
  await page.evaluate(effects => {
    const image = frameCtx.createImageData(frameCv.width, frameCv.height);
    for (let y = 0; y < frameCv.height; y++) for (let x = 0; x < frameCv.width; x++) {
      const i = (y * frameCv.width + x) * 4;
      image.data[i] = Math.round(x / (frameCv.width - 1) * 255);
      image.data[i + 1] = Math.round(y / (frameCv.height - 1) * 255);
      image.data[i + 2] = 60; image.data[i + 3] = 255;
    }
    frameCtx.putImageData(image, 0, 0);
    if (effects) applyPostFx(); else presentProjection();
  }, effects);
}

async function pixel(page, point) {
  return page.evaluate(({ x, y }) =>
    Array.from(projectionCtx.getImageData(Math.floor(x * projectionCanvas.width),
      Math.floor(y * projectionCanvas.height), 1, 1).data), point);
}

function closeColor(actual, expected, tolerance = 3) {
  expected.forEach((value, i) => assert.ok(Math.abs(actual[i] - value) <= tolerance,
    `Channel ${i}: actual ${actual}, expected ${expected}`));
}

async function surfacePoint(page, index, u, v) {
  return page.evaluate(({ index, u, v }) => {
    const s = projectionMap.getProfile().surfaces[index], stride = s.cols + 1;
    const c = [s.points[0], s.points[s.cols], s.points[s.rows * stride + s.cols], s.points[s.rows * stride]];
    return projectionMap.projectPoint(projectionMap.homography(c), u, v);
  }, { index, u, v });
}

(async () => {
  let browser;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined
    });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    await context.route('https://fonts.googleapis.com/**', route => route.abort());
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    assert.equal(await page.evaluate(() => projectionMap.getProfile().sourceMode), 'duplicate');
    await page.getByRole('button', { name: 'Setup mapping', exact: true }).click();
    const popup = page.waitForEvent('popup');
    await page.click('#projectionBtn');
    let output = await popup;
    await output.setViewportSize({ width: 640, height: 360 });
    await page.waitForFunction(() => frameCv.width === 640 && frameCv.height === 360);
    await page.evaluate(() => {
      const faces = [
        [{ x: .1, y: .1 }, { x: .6, y: .2 }, { x: .5, y: .9 }, { x: .1, y: .9 }],
        [{ x: .6, y: .2 }, { x: .9, y: .1 }, { x: .9, y: .9 }, { x: .5, y: .9 }]
      ];
      const surfaces = faces.map((corners, i) => {
        const h = projectionMap.homography(corners), points = [];
        for (let y = 0; y <= 3; y++) for (let x = 0; x <= 3; x++) {
          const p = projectionMap.projectPoint(h, x / 3, y / 3);
          points.push({ x: p.x, y: p.y });
        }
        return { name: 'Face ' + i, visible: true, cols: 3, rows: 3, points,
          crop: { x: .5, y: .1, width: .4, height: .8 } };
      });
      projectionMap.setProfile({ version: 1, enabled: true, sourceMode: 'duplicate', surfaces });
    });
    const aligned = await page.evaluate(() => projectionMap.getProfile().surfaces);
    await paint(page);
    for (const face of [0, 1]) closeColor(await pixel(page, await surfacePoint(page, face, .25, .35)), [64, 89, 60, 255]);
    assert.equal(await page.locator('#mapCropX').isDisabled(), true);
    await page.evaluate(() => projectionMap.changeCrop());
    assert.match(await page.locator('#mapStatus').textContent(), /Switch Visuals to (Span or )?Custom/);
    console.log('PASS: duplicate repeats the complete image, ignoring but preserving custom crops');

    await page.selectOption('#mapSourceMode', 'span');
    await paint(page);
    for (const face of [0, 1]) {
      const p = await surfacePoint(page, face, .25, .35);
      closeColor(await pixel(page, p), [(p.x - .1) / .8 * 255, (p.y - .1) / .8 * 255, 60, 255]);
    }
    // Both planes share a slanted edge. Sample on either side at multiple heights.
    for (const y of [.3, .5, .7, .8]) {
      const x = .6 - (y - .2) / .7 * .1;
      const left = await pixel(page, { x: x - 2 / 640, y });
      const right = await pixel(page, { x: x + 2 / 640, y });
      closeColor(left, [((x - 2 / 640) - .1) / .8 * 255, (y - .1) / .8 * 255, 60, 255]);
      closeColor(right, [((x + 2 / 640) - .1) / .8 * 255, (y - .1) / .8 * 255, 60, 255]);
      assert.ok(Math.abs(left[0] - right[0]) <= 3, 'Shared edge must not restart the image');
    }
    assert.deepEqual(await pixel(page, { x: .02, y: .02 }), [0, 0, 0, 255]);
    assert.deepEqual(await page.evaluate(() => projectionMap.getProfile().surfaces), aligned);
    console.log('PASS: one shared image spans different perspective planes with pixel-continuous seams');

    const samplePoint = await surfacePoint(page, 1, .25, .35);
    const beforeHidden = await pixel(page, samplePoint);
    await page.evaluate(() => { projectionMap.select(0); projectionMap.setVisible(false); });
    closeColor(await pixel(page, samplePoint), beforeHidden, 0);
    assert.deepEqual(await pixel(page, await surfacePoint(page, 0, .25, .35)), [0, 0, 0, 255]);
    await page.evaluate(() => projectionMap.setVisible(true));
    await page.evaluate(() => { projectionMap.select(1); projectionMap.setVisible(false); projectionMap.select(0); projectionMap.setVisible(false); });
    assert.deepEqual(await pixel(page, samplePoint), [0, 0, 0, 255]);
    await page.evaluate(() => { projectionMap.setVisible(true); projectionMap.select(1); projectionMap.setVisible(true); });
    console.log('PASS: hidden planes mask cleanly without shifting span on the remaining planes; all-hidden output is black');

    await page.selectOption('#mapSourceMode', 'custom');
    await paint(page);
    assert.equal(await page.locator('#mapCropX').isDisabled(), false);
    for (const face of [0, 1]) closeColor(await pixel(page, await surfacePoint(page, face, .25, .35)), [153, 97, 60, 255]);
    await page.selectOption('#mapSourceMode', 'duplicate');
    await page.click('#mapUndo');
    assert.equal(await page.locator('#mapSourceMode').inputValue(), 'custom');
    assert.deepEqual(await page.evaluate(() => projectionMap.getProfile().surfaces), aligned);
    console.log('PASS: custom crop pixels and independent mode undo; alignment and crops unchanged by switches');

    await page.evaluate(() => {
      const old = projectionMap.getProfile(); delete old.sourceMode; projectionMap.setProfile(old);
    });
    assert.equal(await page.locator('#mapSourceMode').inputValue(), 'custom');
    await paint(page);
    closeColor(await pixel(page, await surfacePoint(page, 0, .25, .35)), [153, 97, 60, 255]);
    const oldProfile = await page.evaluate(() => projectionMap.getProfile());
    for (const badMode of ['unknown', '__proto__', null, ['span']]) {
      const bad = { ...oldProfile, sourceMode: badMode };
      await page.locator('#mapImport').setInputFiles({
        name: 'bad-mode.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad))
      });
      await page.waitForFunction(() => document.getElementById('mapImport').value === '');
      assert.match(await page.locator('#mapStatus').textContent(), /Unknown visuals mode/);
      assert.deepEqual(await page.evaluate(() => projectionMap.getProfile()), oldProfile);
    }
    console.log('PASS: legacy profiles preserve custom appearance; malformed modes are rejected without changing alignment');

    await page.selectOption('#mapSourceMode', 'span');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export mapping', exact: true }).click();
    const stream = await (await download).createReadStream(), chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const exported = JSON.parse(Buffer.concat(chunks).toString());
    assert.equal(exported.sourceMode, 'span');
    await page.selectOption('#mapSourceMode', 'duplicate');
    await page.locator('#mapImport').setInputFiles({
      name: 'span.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported))
    });
    await page.waitForFunction(() => projectionMap.getProfile().sourceMode === 'span');
    assert.deepEqual(await page.evaluate(() => projectionMap.getProfile()), exported);
    await page.getByRole('button', { name: 'Save mapping', exact: true }).click();
    const closed = output.waitForEvent('close');
    await page.reload(); await closed;
    assert.deepEqual(await page.evaluate(() => projectionMap.getProfile()), exported);
    const reopened = page.waitForEvent('popup');
    await page.click('#projectionBtn'); output = await reopened;
    await output.setViewportSize({ width: 640, height: 360 });
    await page.waitForFunction(() => frameCv.width === 640);
    await paint(page);
    closeColor(await pixel(page, samplePoint), beforeHidden);
    console.log('PASS: mode survives export/import, Save mapping, reload and output reopening');

    await page.evaluate(() => {
      document.getElementById('pfxInvert').value = 100; setPostFx(true);
    });
    await paint(page, true);
    closeColor(await pixel(page, samplePoint), [255 - beforeHidden[0], 255 - beforeHidden[1], 195, 255]);
    await page.evaluate(() => setPostFx(false));
    await page.evaluate(() => { projectionMap.cube(); projectionMap.toggleCalibration(); });
    assert.equal(await page.evaluate(() => projectionMap.getProfile().sourceMode), 'span');
    const cube = await page.evaluate(() => projectionMap.getProfile());
    await page.evaluate(() => applyState(builtinPresets.waves));
    assert.deepEqual(await page.evaluate(() => projectionMap.getProfile()), cube);
    await page.evaluate(() => setPostFx(false));
    await paint(page);
    for (const face of [0, 1, 2]) {
      const p = await surfacePoint(page, face, .5, .5);
      closeColor(await pixel(page, p), [(p.x - .285) / (.75 - .285) * 255, (p.y - .25) / (.89 - .25) * 255, 60, 255]);
    }
    const spanCanvas = await page.evaluate(() => projectionCanvas.toDataURL());
    await page.evaluate(() => projectionMap.toggleCalibration());
    assert.notEqual(await page.evaluate(() => projectionCanvas.toDataURL()), spanCanvas);
    await page.evaluate(() => projectionMap.toggleCalibration());
    assert.equal(await page.evaluate(expected => projectionCanvas.toDataURL() === expected, spanCanvas), true,
      'Turning calibration off must restore the shared artwork');
    console.log('PASS: span includes post-FX; cube retains mode; visual presets and calibration leave mode/alignment intact');
    assert.deepEqual(errors, []);
    console.log('PASS: content-mode browser runtime is error-free');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
