const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const build = process.env.AUDIOGRAPH_INTERACTION_BUILD || 'versions/audiograph_28.html';
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
    const h = projectionMap.homography([s.points[0], s.points[s.cols],
      s.points[s.rows * stride + s.cols], s.points[s.rows * stride]]);
    return projectionMap.projectPoint(h, u, v);
  }, { index, u, v });
}
async function editorPoint(page, p) {
  await page.locator('#mapEditor').scrollIntoViewIfNeeded();
  const box = await page.locator('#mapEditor').boundingBox();
  return { x: box.x + p.x * box.width, y: box.y + p.y * box.height };
}
async function doubleClick(page, p) {
  const location = await editorPoint(page, p);
  await page.mouse.dblclick(location.x, location.y);
}
async function drag(page, start, end, shift = false) {
  const a = await editorPoint(page, start), b = await editorPoint(page, end);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
}
async function sample(page, p) {
  return page.evaluate(({ x, y }) => Array.from(projectionCtx.getImageData(
    Math.floor(x * projectionCanvas.width), Math.floor(y * projectionCanvas.height), 1, 1).data), p);
}
function close(actual, expected, tolerance = 1e-5) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);
}
function color(actual, expected) { expected.forEach((v, i) => close(actual[i], v, 4)); }

(async () => {
  let browser;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }), errors = [];
    context.on('page', page => page.on('pageerror', e => errors.push(e.message)));
    await context.route('https://fonts.googleapis.com/**', route => route.abort());
    const page = await context.newPage();
    await page.goto(process.env.AUDIOGRAPH_INTERACTION_URL || `http://127.0.0.1:${server.address().port}`);
    await page.getByRole('button', { name: 'Setup mapping', exact: true }).click();
    const popup = page.waitForEvent('popup'); await page.click('#projectionBtn'); let output = await popup;
    await output.setViewportSize({ width: 960, height: 540 });
    await page.waitForFunction(() => frameCv.width === 960);
    await page.evaluate(() => projectionMap.cube());
    const cube = await page.evaluate(() => projectionMap.getProfile());
    for (const face of [1, 2, 0]) {
      await doubleClick(page, await point(page, face, .45, .55));
      assert.equal(await page.locator('#mapSurface').inputValue(), String(face));
      assert.equal(await page.locator('#mapName').inputValue(), cube.surfaces[face].name);
    }
    assert.deepEqual(await page.evaluate(() => projectionMap.getProfile()), cube);
    const blank = await editorPoint(page, { x: .05, y: .95 });
    await page.mouse.dblclick(blank.x, blank.y);
    assert.equal(await page.locator('#mapSurface').inputValue(), '0');

    await page.evaluate(() => {
      const p = projectionMap.getProfile(), overlay = structuredClone(p.surfaces[1]);
      overlay.name = 'Overlay'; p.surfaces.push(overlay); projectionMap.setProfile(p);
    });
    await doubleClick(page, await point(page, 1, .45, .55));
    assert.equal(await page.locator('#mapSurface').inputValue(), '3');
    await page.evaluate(() => projectionMap.setVisible(false));
    await doubleClick(page, await point(page, 1, .45, .55));
    assert.equal(await page.locator('#mapSurface').inputValue(), '1');
    console.log('PASS: real double-click selects each face, respects topmost visible overlap, and leaves mapping unchanged');

    await page.evaluate(() => {
      const p = projectionMap.getProfile(), surface = structuredClone(p.surfaces[0]);
      surface.name = 'Extended mesh';
      surface.points = [];
      for (let y = 0; y <= 3; y++) for (let x = 0; x <= 3; x++) {
        surface.points.push({ x: .15 + .7 * x / 3, y: .15 + .7 * y / 3 });
      }
      const back = structuredClone(surface); back.name = 'Back';
      surface.points[7].x = surface.points[11].x = .93;
      projectionMap.setProfile({ version: 1, enabled: true, sourceMode: 'duplicate', surfaces: [back, surface] });
    });
    await doubleClick(page, { x: .91, y: .5 });
    assert.equal(await page.locator('#mapSurface').inputValue(), '1');
    const edgeSelected = await page.evaluate(() => projectionMap.getProfile());
    const corner = edgeSelected.surfaces[1].points[0];
    await drag(page, corner, { x: corner.x - .01, y: corner.y + .01 });
    const cornerMoved = await page.evaluate(() => projectionMap.getProfile());
    assert.deepEqual(cornerMoved.surfaces[0], edgeSelected.surfaces[0]);
    close(cornerMoved.surfaces[1].points[0].x, corner.x - .01);
    await page.click('#mapUndo');
    assert.deepEqual(await page.evaluate(() => projectionMap.getProfile()), edgeSelected);
    console.log('PASS: selection hit-tests fine-mesh edges beyond the corner hull, and subsequent handle edits target the selected face');

    await page.evaluate(() => {
      const quads = [
        [{ x: .08, y: .12 }, { x: .49, y: .23 }, { x: .45, y: .85 }, { x: .13, y: .74 }],
        [{ x: .57, y: .16 }, { x: .94, y: .1 }, { x: .89, y: .8 }, { x: .53, y: .9 }]
      ];
      const surfaces = quads.map((c, i) => {
        const h = projectionMap.homography(c), points = [];
        for (let y = 0; y <= 3; y++) for (let x = 0; x <= 3; x++) {
          const p = projectionMap.projectPoint(h, x / 3, y / 3); points.push({ x: p.x, y: p.y });
        }
        return { name: 'Face ' + i, visible: true, cols: 3, rows: 3, points,
          crop: { x: .2, y: .1, width: .5, height: .8 },
          spanRegion: { x: i / 2, y: 0, width: .5, height: 1, rotation: 0 } };
      });
      projectionMap.setProfile({ version: 1, enabled: true, sourceMode: 'span', surfaces });
    });
    const original = await page.evaluate(() => projectionMap.getProfile());
    await paint(page);
    await page.click('#mapMoveVisuals');
    assert.equal(await page.locator('#mapMoveVisuals').getAttribute('aria-pressed'), 'true');
    const start = await point(page, 0, .3, .35), end = await point(page, 0, .44, .46);
    const anchorColor = await sample(page, start);
    await drag(page, start, end);
    const moved = await page.evaluate(() => projectionMap.getProfile());
    close(moved.spanOffset.x, .07); close(moved.spanOffset.y, .11);
    assert.deepEqual(moved.surfaces, original.surfaces);
    color(await sample(page, end), anchorColor);
    color(await sample(page, await point(page, 1, .25, .4)), [(.625 - .07) * 255, (.4 - .11) * 255, 60, 255]);
    await page.click('#mapUndo');
    assert.deepEqual(await page.evaluate(() => projectionMap.getProfile()), original);
    console.log('PASS: dragging moves the shared image on every face, follows perspective, preserves geometry/crops, and undoes as one gesture');

    await drag(page, start, { x: .98, y: end.y });
    const outside = await page.evaluate(() => projectionMap.getProfile());
    assert.ok(Math.abs(outside.spanOffset.x) <= 1 && Math.abs(outside.spanOffset.y) <= 1);
    assert.deepEqual(outside.surfaces, original.surfaces);
    await page.click('#mapUndo');
    assert.deepEqual(await page.evaluate(() => projectionMap.getProfile()), original);
    const cancelStart = await editorPoint(page, start), cancelEnd = await editorPoint(page, end);
    await page.mouse.move(cancelStart.x, cancelStart.y); await page.mouse.down();
    await page.mouse.move(cancelEnd.x, cancelEnd.y, { steps: 3 });
    const atCancel = await page.evaluate(() => projectionMap.getProfile());
    await page.locator('#mapEditor').dispatchEvent('pointercancel', { pointerId: 1 });
    await page.mouse.move(cancelEnd.x + 15, cancelEnd.y + 15); await page.mouse.up();
    assert.deepEqual(await page.evaluate(() => projectionMap.getProfile()), atCancel);
    await page.click('#mapUndo');
    assert.deepEqual(await page.evaluate(() => projectionMap.getProfile()), original);
    console.log('PASS: captured drags continue outside the face within bounded offsets; cancelled gestures stop immediately and remain undoable');

    for (const [rotation, dx, dy] of [[0, .1, .1], [1, .05, -.2], [2, -.1, -.1], [3, -.05, .2]]) {
      await page.evaluate(rotation => {
        projectionMap.resetSpanPosition(); projectionMap.select(0); projectionMap.rotateSpan(rotation);
      }, rotation);
      await paint(page);
      const before = await page.evaluate(() => projectionMap.getProfile().surfaces);
      const a = await point(page, 0, .25, .3), b = await point(page, 0, .45, .4);
      const expected = await sample(page, a);
      await drag(page, a, b, true);
      const p = await page.evaluate(() => projectionMap.getProfile());
      close(p.spanOffset.x, dx); close(p.spanOffset.y, dy);
      assert.deepEqual(p.surfaces, before);
      color(await sample(page, b), expected);
    }
    console.log('PASS: artwork follows all source rotations; Shift-drag in Move visuals never moves a physical plane');

    await page.evaluate(() => {
      projectionMap.resetSpanPosition(); projectionMap.rotateSpan(0);
      const p = projectionMap.getProfile(), s = p.surfaces[0], node = s.points[5];
      p.surfaces[0] = projectionMap.movePoint(s, 5, { x: node.x + .025, y: node.y + .018 });
      projectionMap.setProfile(p); projectionMap.setEditMode('visuals');
    });
    await paint(page);
    const mesh = await page.evaluate(() => {
      const s = projectionMap.getProfile().surfaces[0], ids = [5, 6, 10], stride = 4;
      const h = projectionMap.homography([s.points[0], s.points[3], s.points[15], s.points[12]]);
      function location(weights) {
        let x = 0, y = 0, u = 0, v = 0, denominator = 0;
        ids.forEach((id, i) => {
          x += weights[i] * s.points[id].x; y += weights[i] * s.points[id].y;
          const lu = (id % stride) / 3, lv = Math.floor(id / stride) / 3;
          const weight = weights[i] / (h[6] * lu + h[7] * lv + 1);
          u += weight * lu; v += weight * lv; denominator += weight;
        });
        return { point: { x, y }, source: { x: .5 * u / denominator, y: v / denominator } };
      }
      return { start: location([.4, .35, .25]), end: location([.2, .3, .5]) };
    });
    const meshAnchor = await sample(page, mesh.start.point);
    const meshBefore = await page.evaluate(() => projectionMap.getProfile().surfaces);
    await drag(page, mesh.start.point, mesh.end.point);
    const meshAfter = await page.evaluate(() => projectionMap.getProfile());
    close(meshAfter.spanOffset.x, mesh.end.source.x - mesh.start.source.x);
    close(meshAfter.spanOffset.y, mesh.end.source.y - mesh.start.source.y);
    assert.deepEqual(meshAfter.surfaces, meshBefore);
    color(await sample(page, mesh.end.point), meshAnchor);
    const beforeNudge = meshAfter.spanOffset;
    await page.locator('#mapEditor').focus(); await page.keyboard.press('Shift+ArrowRight');
    const afterNudge = await page.evaluate(() => projectionMap.getProfile());
    assert.notDeepEqual(afterNudge.spanOffset, beforeNudge);
    assert.deepEqual(afterNudge.surfaces, meshBefore);
    await page.click('#mapUndo');
    assert.deepEqual(await page.evaluate(() => projectionMap.getProfile()), meshAfter);
    console.log('PASS: dragging uses actual fine-mesh perspective interpolation; keyboard nudges artwork without touching mesh nodes');

    await page.selectOption('#mapSourceMode', 'custom'); await paint(page);
    color(await sample(page, await point(page, 1, .25, .4)), [.325 * 255, .42 * 255, 60, 255]);
    assert.deepEqual((await page.evaluate(() => projectionMap.getProfile())).spanOffset, meshAfter.spanOffset);
    assert.equal(await page.locator('#mapSpanMoveControls').isVisible(), false);
    await page.selectOption('#mapSourceMode', 'span'); await paint(page);
    color(await sample(page, await point(page, 1, .25, .4)),
      [(.625 - meshAfter.spanOffset.x) * 255, (.4 - meshAfter.spanOffset.y) * 255, 60, 255]);
    await page.click('#mapCalibration');
    assert.equal(await page.locator('#mapAdjustPlanes').getAttribute('aria-pressed'), 'true');
    const calibrated = await sample(page, await point(page, 1, .25, .4));
    await page.locator('#mapSpanPanX').fill('90');
    await page.locator('#mapSpanPanX').dispatchEvent('change');
    assert.deepEqual(await sample(page, await point(page, 1, .25, .4)), calibrated);
    await page.click('#mapMoveVisuals'); await paint(page);
    assert.equal(await page.locator('#mapCalibration').getAttribute('aria-pressed'), 'false');
    color(await sample(page, await point(page, 0, .25, .4)), [0, 0, 0, 255]);
    console.log('PASS: pan survives mode switches; calibration ignores it; source overflow is black instead of edge-smearing');

    const positioned = await page.evaluate(() => projectionMap.getProfile());
    await page.locator('#mapSpanPanX').fill('101');
    await page.locator('#mapSpanPanX').dispatchEvent('change');
    assert.match(await page.locator('#mapStatus').textContent(), /between -100% and 100%/);
    assert.deepEqual(await page.evaluate(() => projectionMap.getProfile()), positioned);
    for (const spanOffset of [{ x: 2, y: 0 }, { x: 0, y: -2 }, { x: '0', y: 0 }, null]) {
      const bad = { ...positioned, spanOffset };
      await page.locator('#mapImport').setInputFiles({
        name: 'invalid-position.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad))
      });
      await page.waitForFunction(() => document.getElementById('mapImport').value === '');
      assert.match(await page.locator('#mapStatus').textContent(), /Span image position/);
      assert.deepEqual(await page.evaluate(() => projectionMap.getProfile()), positioned);
    }
    await page.click('#mapResetSpanPosition');
    assert.equal((await page.evaluate(() => projectionMap.getProfile())).spanOffset, undefined);
    await page.click('#mapUndo');
    assert.deepEqual(await page.evaluate(() => projectionMap.getProfile()), positioned);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export mapping', exact: true }).click();
    const stream = await (await download).createReadStream(), chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString()), positioned);
    await page.getByRole('button', { name: 'Save mapping', exact: true }).click();
    const closed = output.waitForEvent('close'); await page.reload(); await closed;
    assert.deepEqual(await page.evaluate(() => projectionMap.getProfile()), positioned);
    assert.equal(await page.locator('#mapSpanPanX').inputValue(), '90');
    const reopened = page.waitForEvent('popup'); await page.click('#projectionBtn'); output = await reopened;
    await output.setViewportSize({ width: 960, height: 540 });
    await page.waitForFunction(() => frameCv.width === 960);
    await paint(page);
    color(await sample(page, await point(page, 1, .95, .4)),
      [(.975 - positioned.spanOffset.x) * 255, (.4 - positioned.spanOffset.y) * 255, 60, 255]);
    console.log('PASS: position validation, reset/undo, exported profiles, Save mapping, and reload preserve direct edits');
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
