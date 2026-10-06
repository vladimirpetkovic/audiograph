const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const build = process.env.AUDIOGRAPH_SPAN_BUILD || 'versions/audiograph_26.html';
const html = fs.readFileSync(path.join(__dirname, '..', build));
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html);
});

async function paint(page) {
  await page.evaluate(() => {
    const image = frameCtx.createImageData(frameCv.width, frameCv.height);
    for (let y = 0; y < frameCv.height; y++) for (let x = 0; x < frameCv.width; x++) {
      const i = (y * frameCv.width + x) * 4;
      image.data[i] = Math.round(x / (frameCv.width - 1) * 255);
      image.data[i + 1] = Math.round(y / (frameCv.height - 1) * 255);
      image.data[i + 2] = 60; image.data[i + 3] = 255;
    }
    frameCtx.putImageData(image, 0, 0); presentProjection();
  });
}

async function point(page, index, u, v) {
  return page.evaluate(({ index, u, v }) => {
    const s = projectionMap.getProfile().surfaces[index], stride = s.cols + 1;
    return projectionMap.projectPoint(projectionMap.homography([
      s.points[0], s.points[s.cols], s.points[s.rows * stride + s.cols], s.points[s.rows * stride]
    ]), u, v);
  }, { index, u, v });
}

async function sample(page, p) {
  return page.evaluate(({ x, y }) => Array.from(projectionCtx.getImageData(
    Math.floor(x * projectionCanvas.width), Math.floor(y * projectionCanvas.height), 1, 1).data), p);
}

function closeColor(actual, expected, tolerance = 3) {
  expected.forEach((v, i) => assert.ok(Math.abs(actual[i] - v) <= tolerance,
    `GPU pixel ${actual}; expected ${expected} (channel ${i})`));
}

(async () => {
  let browser;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }), errors = [];
    context.on('page', page => page.on('pageerror', e => errors.push(e.message)));
    await context.route('https://fonts.googleapis.com/**', route => route.abort());
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByRole('button', { name: 'Setup mapping', exact: true }).click();
    const popup = page.waitForEvent('popup'); await page.click('#projectionBtn'); let output = await popup;
    await output.setViewportSize({ width: 960, height: 540 });
    await page.waitForFunction(() => frameCv.width === 960);
    await page.evaluate(() => {
      const quads = [
        [{ x: .1, y: .1 }, { x: .55, y: .23 }, { x: .48, y: .86 }, { x: .16, y: .72 }],
        [{ x: .55, y: .23 }, { x: .92, y: .1 }, { x: .86, y: .74 }, { x: .48, y: .86 }]
      ];
      const surfaces = quads.map((c, i) => {
        const h = projectionMap.homography(c), points = [];
        for (let y = 0; y <= 3; y++) for (let x = 0; x <= 3; x++) {
          const p = projectionMap.projectPoint(h, x / 3, y / 3); points.push({ x: p.x, y: p.y });
        }
        return { name: 'Face ' + i, visible: true, cols: 3, rows: 3, points,
          crop: { x: .2, y: .1, width: .5, height: .8 } };
      });
      projectionMap.setProfile({ version: 1, enabled: true, sourceMode: 'span', surfaces });
    });
    const aligned = await page.evaluate(() => projectionMap.getProfile().surfaces.map(s => s.points));
    await paint(page);
    for (let face = 0; face < 2; face++) {
      const p = await point(page, face, .25, .35);
      closeColor(await sample(page, p), [(face / 2 + .25 / 2) * 255, .35 * 255, 60, 255]);
    }
    assert.equal(await page.locator('#mapCropX').isDisabled(), false);
    await page.locator('#mapSpanLayouts').getByRole('button', { name: 'Horizontal', exact: true }).click();
    const horizontal = await page.evaluate(() => projectionMap.getProfile());
    assert.deepEqual(horizontal.surfaces.map(s => s.spanRegion), [
      { x: 0, y: 0, width: .5, height: 1, rotation: 0 }, { x: .5, y: 0, width: .5, height: 1, rotation: 0 }
    ]);
    assert.deepEqual(horizontal.surfaces.map(s => s.points), aligned);
    console.log('PASS: Span samples adjacent shared-source regions through actual perspective deformation, not screen-space masks');

    // Move a corner and sample the same local position in the newly deformed plane.
    await page.evaluate(() => {
      const profile = projectionMap.getProfile();
      profile.surfaces[0] = projectionMap.movePoint(profile.surfaces[0], 0, { x: .07, y: .18 });
      projectionMap.setProfile(profile);
    });
    await paint(page);
    closeColor(await sample(page, await point(page, 0, .25, .35)), [.125 * 255, .35 * 255, 60, 255]);
    // Move an interior grid node; its assigned source coordinates must move with it.
    await page.evaluate(() => {
      const profile = projectionMap.getProfile(), s = profile.surfaces[0], p = s.points[5];
      profile.surfaces[0] = projectionMap.movePoint(s, 5, { x: p.x + .035, y: p.y + .02 });
      projectionMap.setProfile(profile);
    });
    await paint(page);
    const node = await page.evaluate(() => projectionMap.getProfile().surfaces[0].points[5]);
    closeColor(await sample(page, node), [255 / 6, 255 / 3, 60, 255]);
    console.log('PASS: corner pinning and interior mesh edits deform shared artwork while source regions stay fixed');

    await page.locator('#mapSpanLayouts').getByRole('button', { name: 'Vertical', exact: true }).click();
    await paint(page);
    closeColor(await sample(page, await point(page, 1, .25, .35)), [.25 * 255, (.5 + .35 / 2) * 255, 60, 255]);
    const beforeHidden = await sample(page, await point(page, 1, .25, .35));
    await page.evaluate(() => { projectionMap.select(0); projectionMap.setVisible(false); });
    closeColor(await sample(page, await point(page, 1, .25, .35)), beforeHidden, 0);
    await page.evaluate(() => projectionMap.setVisible(true));
    await page.selectOption('#mapSourceMode', 'custom');
    await paint(page);
    closeColor(await sample(page, await point(page, 1, .25, .35)), [(.2 + .25 * .5) * 255, (.1 + .35 * .8) * 255, 60, 255]);
    await page.selectOption('#mapSourceMode', 'span');
    closeColor(await sample(page, await point(page, 1, .25, .35)), beforeHidden, 0);
    console.log('PASS: Vertical layout, hidden-face stability and mode switching preserve independent Custom crops');

    await page.getByRole('button', { name: '3-face cube', exact: true }).click();
    await page.getByRole('button', { name: 'Test grid', exact: true }).click();
    await page.getByRole('button', { name: 'Cube net', exact: true }).click();
    await paint(page);
    const expected = [[.5 * .35, .5 * (1 - .25)], [.5 * .25, .5 + .5 * .35], [.5 + .5 * .25, .5 + .5 * .35]];
    for (let face = 0; face < 3; face++) closeColor(await sample(page, await point(page, face, .25, .35)),
      [expected[face][0] * 255, expected[face][1] * 255, 60, 255]);
    for (const t of [.25, .5, .75]) {
      const top = await sample(page, await point(page, 0, .02, t));
      const frontTop = await sample(page, await point(page, 1, t, .02));
      closeColor(top, [.5 * t * 255, .49 * 255, 60, 255]);
      closeColor(frontTop, [.5 * t * 255, .51 * 255, 60, 255]);
      const frontRight = await sample(page, await point(page, 1, .98, t));
      const rightLeft = await sample(page, await point(page, 2, .02, t));
      closeColor(frontRight, [.49 * 255, (.5 + t * .5) * 255, 60, 255]);
      closeColor(rightLeft, [.51 * 255, (.5 + t * .5) * 255, 60, 255]);
    }
    console.log('PASS: Cube net rotates Top and joins Top/Front and Front/Right source edges');

    await page.evaluate(() => projectionMap.select(1));
    for (const [rotation, u, v] of [[0, .25, .35], [1, .35, .75], [2, .75, .65], [3, .65, .25]]) {
      await page.selectOption('#mapSpanRotation', String(rotation)); await paint(page);
      closeColor(await sample(page, await point(page, 1, .25, .35)), [.5 * u * 255, (.5 + .5 * v) * 255, 60, 255]);
    }
    await page.locator('#mapCropX').fill('10');
    await page.locator('#mapCropY').fill('20');
    await page.locator('#mapCropW').fill('40');
    await page.locator('#mapCropH').fill('50');
    await page.locator('#mapCropH').dispatchEvent('change');
    const edited = await page.evaluate(() => projectionMap.getProfile());
    assert.deepEqual(edited.surfaces[1].spanRegion, { x: .1, y: .2, width: .4, height: .5, rotation: 3 });
    assert.deepEqual(edited.surfaces[1].crop, { x: 0, y: 0, width: 1, height: 1 });
    await paint(page);
    closeColor(await sample(page, await point(page, 1, .25, .35)), [(.1 + .65 * .4) * 255, (.2 + .25 * .5) * 255, 60, 255]);
    await page.getByRole('button', { name: 'Reset plane', exact: true }).click();
    assert.deepEqual((await page.evaluate(() => projectionMap.getProfile())).surfaces[1].spanRegion, edited.surfaces[1].spanRegion);
    await page.click('#mapUndo');
    assert.deepEqual(await page.evaluate(() => projectionMap.getProfile()), edited);
    console.log('PASS: all source rotations, editable shared regions, independent crop storage and mapping Undo/reset');

    for (const bad of [
      { ...edited.surfaces[1].spanRegion, rotation: 4 },
      { ...edited.surfaces[1].spanRegion, width: 2 },
      null
    ]) {
      const profile = JSON.parse(JSON.stringify(edited)); profile.surfaces[1].spanRegion = bad;
      await page.locator('#mapImport').setInputFiles({
        name: 'bad-span.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(profile))
      });
      await page.waitForFunction(() => document.getElementById('mapImport').value === '');
      assert.match(await page.locator('#mapStatus').textContent(), /Span source region must fit/);
      assert.deepEqual(await page.evaluate(() => projectionMap.getProfile()), edited);
    }
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export mapping', exact: true }).click();
    const stream = await (await download).createReadStream(), chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString()), edited);
    await page.getByRole('button', { name: 'Save mapping', exact: true }).click();
    const closed = output.waitForEvent('close'); await page.reload(); await closed;
    assert.deepEqual(await page.evaluate(() => projectionMap.getProfile()), edited);
    const reopened = page.waitForEvent('popup'); await page.click('#projectionBtn'); output = await reopened;
    await output.setViewportSize({ width: 960, height: 540 });
    await page.waitForFunction(() => frameCv.width === 960);
    await paint(page);
    closeColor(await sample(page, await point(page, 1, .25, .35)), [(.1 + .65 * .4) * 255, (.2 + .25 * .5) * 255, 60, 255]);
    console.log('PASS: strict region validation, exported data, Save mapping and reload retain deformed Span');
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
