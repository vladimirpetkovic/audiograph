const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const build = process.env.AUDIOGRAPH_MAPPING_BUILD || process.env.AUDIOGRAPH_BUILD || 'versions/audiograph_23.html';
const html = fs.readFileSync(path.join(__dirname, '..', build));
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});
const quad = [{ x: 0.15, y: 0.12 }, { x: 0.9, y: 0.22 }, { x: 0.7, y: 0.9 }, { x: 0.22, y: 0.75 }];

async function setQuad(page, crop = { x: 0, y: 0, width: 1, height: 1 }) {
  await page.evaluate(({ quad, crop }) => {
    const h = projectionMap.homography(quad), points = [];
    for (let y = 0; y <= 3; y++) for (let x = 0; x <= 3; x++) {
      const p = projectionMap.projectPoint(h, x / 3, y / 3);
      points.push({ x: p.x, y: p.y });
    }
    projectionMap.setProfile({ version: 1, enabled: true, surfaces: [
      { name: 'Test plane', visible: true, cols: 3, rows: 3, points, crop }
    ] });
  }, { quad, crop });
}

async function paintGradient(page, effects = false) {
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

async function sample(page, u, v) {
  return page.evaluate(({ u, v }) => {
    const s = projectionMap.getProfile().surfaces[0];
    const stride = s.cols + 1;
    const c = [s.points[0], s.points[s.cols], s.points[s.rows * stride + s.cols], s.points[s.rows * stride]];
    const p = projectionMap.projectPoint(projectionMap.homography(c), u, v);
    const pixel = projectionCtx.getImageData(Math.floor(p.x * projectionCanvas.width), Math.floor(p.y * projectionCanvas.height), 1, 1).data;
    return Array.from(pixel).slice(0, 3);
  }, { u, v });
}

function closeColor(actual, expected) {
  actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) <= 3,
    `Perspective/crop sample channel ${i}: got ${actual}, expected ${expected}`));
}

async function dragHandle(page, index, dx, dy, shift = false) {
  const rect = await page.locator('#mapEditor').boundingBox();
  const point = await page.evaluate(i => projectionMap.getProfile().surfaces[0].points[i], index);
  const x = rect.x + point.x * rect.width, y = rect.y + point.y * rect.height;
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 3 }); await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
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
    await page.getByRole('button', { name: 'Setup mapping', exact: true }).click();
    assert.equal(await page.locator('#panelMapping').evaluate(el => el.classList.contains('closed')), false);
    const popup = page.waitForEvent('popup');
    await page.click('#projectionBtn');
    let output = await popup;
    await output.setViewportSize({ width: 640, height: 360 });
    await page.waitForFunction(() => frameCv.width === 640 && frameCv.height === 360);
    await setQuad(page);

    const positions = await page.evaluate(quad => {
      const h = projectionMap.homography(quad);
      return [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => projectionMap.projectPoint(h, u, v));
    }, quad);
    positions.forEach((p, i) => {
      assert.ok(Math.abs(p.x - quad[i].x) < 1e-10 && Math.abs(p.y - quad[i].y) < 1e-10);
    });
    await paintGradient(page);
    closeColor(await sample(page, 0.25, 0.35), [64, 89, 60]);
    closeColor(await sample(page, 0.75, 0.7), [191, 179, 60]);
    assert.deepEqual(await page.evaluate(() => Array.from(projectionCtx.getImageData(0, 0, 1, 1).data)), [0, 0, 0, 255]);
    assert.equal(await output.locator('#mapEditor').count(), 0, 'Editor guides must never be on the projector');
    console.log('PASS: projective corner math, GPU texture orientation, black masking, clean projection');

    await setQuad(page, { x: 0.5, y: 0.1, width: 0.4, height: 0.8 });
    await paintGradient(page);
    closeColor(await sample(page, 0.25, 0.35), [153, 97, 60]);
    await page.evaluate(() => {
      document.getElementById('mapCropX').value = 90; projectionMap.changeCrop();
    });
    assert.match(await page.locator('#mapStatus').textContent(), /must fit within 100%/);
    assert.equal((await page.evaluate(() => projectionMap.getProfile())).surfaces[0].crop.x, 0.5);
    console.log('PASS: per-plane source crop and explicit rejection of invalid crop');

    await setQuad(page);
    const original = await page.evaluate(() => projectionMap.getProfile());
    assert.equal(await page.evaluate(() => {
      const s = projectionMap.getProfile().surfaces[0];
      return projectionMap.movePoint(s, 0, s.points[s.points.length - 1]) === null &&
        projectionMap.movePoint(s, 5, { x: 0.99, y: 0.99 }) === null;
    }), true, 'Crossed corners and folded interior cells must be rejected');
    await dragHandle(page, 5, 12, 8);
    const warped = await page.evaluate(() => projectionMap.getProfile());
    assert.notDeepEqual(warped.surfaces[0].points[5], original.surfaces[0].points[5]);
    assert.equal(await page.evaluate(() => projectionMap.validSurface(projectionMap.getProfile().surfaces[0])), true);
    await page.click('#mapUndo');
    assert.deepEqual(await page.evaluate(() => projectionMap.getProfile()), original);
    await dragHandle(page, 0, 10, 5);
    assert.notDeepEqual((await page.evaluate(() => projectionMap.getProfile())).surfaces[0].points[0], original.surfaces[0].points[0]);
    await page.click('#mapUndo');
    await dragHandle(page, 5, 10, 5, true);
    const moved = await page.evaluate(() => projectionMap.getProfile());
    const dx = moved.surfaces[0].points[0].x - original.surfaces[0].points[0].x;
    assert.ok(dx > 0);
    moved.surfaces[0].points.forEach((p, i) => assert.ok(Math.abs(p.x - original.surfaces[0].points[i].x - dx) < 1e-10));
    await page.click('#mapUndo');
    await dragHandle(page, 0, 0, 0);
    await page.keyboard.press('ArrowRight');
    const nudged = await page.evaluate(() => projectionMap.getProfile());
    assert.ok(Math.abs(nudged.surfaces[0].points[0].x - original.surfaces[0].points[0].x - 1 / 640) < 1e-10,
      JSON.stringify({ original: original.surfaces[0].points[0], nudged: nudged.surfaces[0].points[0],
        browser: await page.evaluate(() => ({ width: frameCv.width, active: document.activeElement.id, status: document.getElementById('mapStatus').textContent })) }));
    await page.click('#mapUndo');
    console.log('PASS: actual mesh/corner dragging, translation, pixel nudge, mapping undo');

    await page.locator('#mapCells').fill('5');
    await page.getByRole('button', { name: 'Rebuild grid', exact: true }).click();
    assert.equal((await page.evaluate(() => projectionMap.getProfile())).surfaces[0].points.length, 36);
    await page.getByRole('button', { name: '+ Plane', exact: true }).click();
    assert.equal((await page.evaluate(() => projectionMap.getProfile())).surfaces.length, 2);
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await page.getByRole('button', { name: '3-face cube', exact: true }).click();
    const cube = await page.evaluate(() => projectionMap.getProfile());
    assert.equal(cube.surfaces.length, 3);
    assert.equal(await page.locator('#mapCalibration').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => projectionMap.getProfile().surfaces.every(projectionMap.validSurface)), true);
    await page.evaluate(() => applyState(builtinPresets.waves));
    assert.deepEqual(await page.evaluate(() => projectionMap.getProfile()), cube, 'Visual presets must not change physical alignment');
    await page.evaluate(() => undo());
    assert.deepEqual(await page.evaluate(() => projectionMap.getProfile()), cube, 'Artistic undo must not move physical planes');
    console.log('PASS: grid rebuild, add/remove planes, cube starter, independent visual presets/undo');

    await page.getByRole('button', { name: 'Test grid', exact: true }).click();
    await page.evaluate(() => { if (typeof pfxTarget !== 'undefined') pfxTarget = 'comp'; document.getElementById('pfxInvert').value = 100; setPostFx(true); if (typeof compFx !== 'undefined') compFx.pfxInvert = 100; });
    await setQuad(page);
    await paintGradient(page, true);
    closeColor(await sample(page, 0.25, 0.35), [191, 166, 195]);
    await page.evaluate(() => { setPostFx(false); if (typeof pfxTarget !== 'undefined') pfxTarget = 'layer'; });
    console.log('PASS: mapped output includes final GPU post-effects');

    const beforeInvalid = await page.evaluate(() => projectionMap.getProfile());
    const bad = JSON.parse(JSON.stringify(beforeInvalid));
    bad.surfaces[0].points[1] = { x: -0.2, y: 0.3 };
    await page.locator('#mapImport').setInputFiles({
      name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad))
    });
    await page.waitForFunction(() => document.getElementById('mapStatus').classList.contains('error'));
    assert.deepEqual(await page.evaluate(() => projectionMap.getProfile()), beforeInvalid);
    const good = JSON.parse(JSON.stringify(beforeInvalid));
    good.surfaces[0].name = 'Imported plane';
    await page.locator('#mapImport').setInputFiles({
      name: 'mapping.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(good))
    });
    await page.waitForFunction(() => projectionMap.getProfile().surfaces[0].name === 'Imported plane');
    assert.equal(await page.locator('#mapImport').inputValue(), '');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export mapping', exact: true }).click();
    const exported = await download;
    const stream = await exported.createReadStream(), chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString()), good);
    await page.getByRole('button', { name: 'Save mapping', exact: true }).click();
    const closed = output.waitForEvent('close');
    await page.reload(); await closed;
    assert.deepEqual(await page.evaluate(() => projectionMap.getProfile()), good);
    const reopened = page.waitForEvent('popup');
    await page.click('#projectionBtn'); output = await reopened;
    await output.setViewportSize({ width: 640, height: 360 });
    await page.waitForFunction(() => frameCv.width === 640);
    await paintGradient(page);
    closeColor(await sample(page, 0.25, 0.35), [64, 89, 60]);
    console.log('PASS: strict import, JSON export, saved alignment survives reload and output reopening');

    await page.evaluate(() => {
      const mapped = projectionMap.render(frameCv);
      window.mappingLoss = mapped.getContext('webgl').getExtension('WEBGL_lose_context');
      mappingLoss.loseContext();
    });
    await page.waitForFunction(() => document.getElementById('mapStatus').textContent.includes('context lost'));
    assert.deepEqual(await page.evaluate(() => Array.from(projectionCtx.getImageData(320, 180, 1, 1).data)), [0, 0, 0, 255]);
    await page.evaluate(() => mappingLoss.restoreContext());
    await page.waitForFunction(() => document.getElementById('mapStatus').textContent.includes('GPU restored'));
    await paintGradient(page);
    closeColor(await sample(page, 0.25, 0.35), [64, 89, 60]);
    console.log('PASS: GPU loss blacks out projection rather than spilling unwarped artwork; restoration recovers');

    assert.deepEqual(errors, [], 'No mapping runtime errors');
    console.log('PASS: mapping browser runtime is error-free');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
