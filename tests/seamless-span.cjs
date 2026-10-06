const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const build = process.env.AUDIOGRAPH_SEAM_BUILD || 'versions/audiograph_30.html';
const html = fs.readFileSync(path.resolve(__dirname, '..', build));
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
async function sample(page, p) {
  return page.evaluate(({ x, y }) => Array.from(projectionCtx.getImageData(
    Math.floor(x * projectionCanvas.width), Math.floor(y * projectionCanvas.height), 1, 1).data), p);
}
function closeColor(actual, expected, tolerance = 4) {
  expected.forEach((v, i) => assert.ok(Math.abs(actual[i] - v) <= tolerance,
    `GPU pixel ${actual}; expected ${expected} (channel ${i})`));
}
async function seamSamples(page) {
  return page.evaluate(() => {
    const p = projectionMap.getProfile();
    function corners(s) {
      const stride = s.cols + 1;
      return [s.points[0], s.points[s.cols], s.points[s.rows * stride + s.cols], s.points[s.rows * stride]];
    }
    const c = p.surfaces.map(corners);
    const centers = c.map(points => ({ x: points.reduce((v, q) => v + q.x, 0) / 4,
      y: points.reduce((v, q) => v + q.y, 0) / 4 }));
    const joins = [
      { face: 0, a: 0, b: 3, neighbor: 1, uvA: { x: 0, y: .25 }, uvB: { x: .5, y: .5 } },
      { face: 0, a: 3, b: 2, neighbor: 2, uvA: { x: .5, y: .5 }, uvB: { x: 1, y: .25 } },
      { face: 1, a: 1, b: 2, neighbor: 2, uvA: { x: .5, y: .5 }, uvB: { x: .5, y: 1 } }
    ];
    return joins.flatMap(join => [.08, .2, .37, .5, .68, .83, .94].map(t => {
      const a = c[join.face][join.a], b = c[join.face][join.b];
      const edge = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      function inside(face) {
        const center = centers[face], dx = center.x - edge.x, dy = center.y - edge.y;
        const d = Math.hypot(dx, dy);
        return { x: edge.x + dx / d * .0015, y: edge.y + dy / d * .0015 };
      }
      return { left: inside(join.face), right: inside(join.neighbor),
        expected: [(join.uvA.x + (join.uvB.x - join.uvA.x) * t - (p.spanOffset?.x || 0)) * 255,
          (join.uvA.y + (join.uvB.y - join.uvA.y) * t - (p.spanOffset?.y || 0)) * 255, 60, 255] };
    }));
  });
}
async function checkSeams(page) {
  for (const seam of await seamSamples(page)) {
    const a = await sample(page, seam.left), b = await sample(page, seam.right);
    closeColor(a, seam.expected); closeColor(b, seam.expected); closeColor(a, b);
  }
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
    await page.goto(process.env.AUDIOGRAPH_SEAM_URL || `http://127.0.0.1:${server.address().port}`);
    await page.getByRole('button', { name: 'Setup mapping', exact: true }).click();
    const popup = page.waitForEvent('popup'); await page.click('#projectionBtn'); const output = await popup;
    await output.setViewportSize({ width: 1200, height: 900 });
    await page.waitForFunction(() => frameCv.width === 1200);
    await page.evaluate(() => {
      projectionMap.cube(); projectionMap.toggleCalibration(); projectionMap.setSourceMode('span');
    });
    await paint(page);
    await checkSeams(page);
    assert.equal(await page.locator('#mapCropX').isDisabled(), true);
    assert.equal(await page.locator('#mapSpanRotationRow').isVisible(), false);
    const seamless = await page.evaluate(() => projectionMap.getProfile());
    assert.ok(seamless.surfaces.every(s => s.spanMesh.length === s.points.length));
    console.log('PASS: all three cube edges sample one continuous image with no Top/Right cut (21 GPU seam sample pairs)');

    // Give adjacent faces deliberately different perspective denominators.
    await page.evaluate(() => {
      const p = projectionMap.getProfile();
      const c = [
        [{ x: .18, y: .24 }, { x: .42, y: .12 }, { x: .88, y: .35 }, { x: .62, y: .44 }],
        [{ x: .18, y: .24 }, { x: .62, y: .44 }, { x: .58, y: .91 }, { x: .16, y: .75 }],
        [{ x: .62, y: .44 }, { x: .88, y: .35 }, { x: .80, y: .76 }, { x: .58, y: .91 }]
      ];
      p.surfaces.forEach((s, index) => {
        const h = projectionMap.homography(c[index]); s.points = [];
        for (let y = 0; y <= s.rows; y++) for (let x = 0; x <= s.cols; x++) {
          const q = projectionMap.projectPoint(h, x / s.cols, y / s.rows);
          s.points.push({ x: q.x, y: q.y });
        }
      });
      projectionMap.setProfile(p);
    });
    await paint(page); await checkSeams(page);
    assert.deepEqual((await page.evaluate(() => projectionMap.getProfile())).surfaces.map(s => s.spanMesh),
      seamless.surfaces.map(s => s.spanMesh));
    await page.evaluate(() => {
      document.getElementById('mapSpanPanX').value = '2';
      document.getElementById('mapSpanPanY').value = '1';
      projectionMap.changeSpanPosition();
    });
    await paint(page); await checkSeams(page);
    console.log('PASS: unequal face perspective and shared-image movement retain all three source joins');

    const beforeWarp = await page.evaluate(() => projectionMap.getProfile());
    await page.evaluate(() => {
      const p = projectionMap.getProfile(), s = p.surfaces[1], node = s.points[5];
      p.surfaces[1] = projectionMap.movePoint(s, 5, { x: node.x + .025, y: node.y + .02 });
      projectionMap.setProfile(p);
    });
    await paint(page);
    const deformed = await page.evaluate(() => projectionMap.getProfile());
    assert.deepEqual(deformed.surfaces.map(s => s.spanMesh), beforeWarp.surfaces.map(s => s.spanMesh));
    const uv = deformed.surfaces[1].spanMesh[5], node = deformed.surfaces[1].points[5];
    closeColor(await sample(page, node), [(uv.x - deformed.spanOffset.x) * 255,
      (uv.y - deformed.spanOffset.y) * 255, 60, 255]);
    await checkSeams(page);
    console.log('PASS: fine-grid edits genuinely deform anchored artwork; source nodes do not follow geometry');

    await page.evaluate(() => { projectionMap.select(1); projectionMap.setEditMode('visuals'); });
    await paint(page);
    const anchor = await page.evaluate(() => {
      const s = projectionMap.getProfile().surfaces[1];
      function point(weights) {
        return [5, 6, 10].reduce((p, id, i) => ({
          x: p.x + s.points[id].x * weights[i], y: p.y + s.points[id].y * weights[i]
        }), { x: 0, y: 0 });
      }
      return { start: point([.4, .3, .3]), end: point([.2, .3, .5]) };
    });
    const anchorColor = await sample(page, anchor.start);
    await page.locator('#mapEditor').scrollIntoViewIfNeeded();
    const rect = await page.locator('#mapEditor').boundingBox();
    await page.mouse.move(rect.x + anchor.start.x * rect.width, rect.y + anchor.start.y * rect.height);
    await page.mouse.down();
    await page.mouse.move(rect.x + anchor.end.x * rect.width, rect.y + anchor.end.y * rect.height, { steps: 5 });
    await page.mouse.up();
    closeColor(await sample(page, anchor.end), anchorColor);
    assert.deepEqual((await page.evaluate(() => projectionMap.getProfile())).surfaces, deformed.surfaces);
    await page.click('#mapUndo');
    assert.deepEqual(await page.evaluate(() => projectionMap.getProfile()), deformed);
    console.log('PASS: Move visuals drags seamless source meshes correctly and stays one undo step');

    const custom = await page.evaluate(() => projectionMap.getProfile().surfaces.map(s => s.crop));
    await page.getByRole('button', { name: 'Cube net', exact: true }).click();
    assert.ok((await page.evaluate(() => projectionMap.getProfile())).surfaces.every(s => !s.spanMesh));
    assert.equal(await page.locator('#mapCropX').isDisabled(), false);
    await page.click('#mapUndo');
    assert.deepEqual(await page.evaluate(() => projectionMap.getProfile()), deformed);
    await page.selectOption('#mapSourceMode', 'custom');
    assert.deepEqual((await page.evaluate(() => projectionMap.getProfile())).surfaces.map(s => s.crop), custom);
    await page.selectOption('#mapSourceMode', 'span');
    await page.locator('#mapCells').fill('5'); await page.getByRole('button', { name: 'Rebuild grid', exact: true }).click();
    const rebuilt = await page.evaluate(() => projectionMap.getProfile());
    assert.equal(rebuilt.surfaces[1].spanMesh.length, 36);
    assert.ok(await page.evaluate(() => projectionMap.validSurface({
      cols: 5, rows: 5, points: projectionMap.getProfile().surfaces[1].spanMesh
    })));
    await page.click('#mapUndo');
    assert.deepEqual(await page.evaluate(() => projectionMap.getProfile()), deformed);

    await page.getByRole('button', { name: 'Fit surface', exact: true }).click();
    const fitted = await page.evaluate(() => projectionMap.getProfile());
    await paint(page);
    const all = fitted.surfaces.flatMap(s => s.points), left = Math.min(...all.map(p => p.x));
    const top = Math.min(...all.map(p => p.y)), right = Math.max(...all.map(p => p.x)), bottom = Math.max(...all.map(p => p.y));
    const location = fitted.surfaces[1].points[5];
    closeColor(await sample(page, location), [
      ((location.x - left) / (right - left) - fitted.spanOffset.x) * 255,
      ((location.y - top) / (bottom - top) - fitted.spanOffset.y) * 255, 60, 255
    ]);
    await page.click('#mapUndo');
    assert.deepEqual(await page.evaluate(() => projectionMap.getProfile()), deformed);
    console.log('PASS: legacy rectangular layouts/crops, mesh rebuild/undo, and fit-current-surface remain available');

    for (const bad of [null, [], deformed.surfaces[0].spanMesh.map((p, i) => i ? p : { x: -1, y: 0 })]) {
      const p = structuredClone(deformed); p.surfaces[0].spanMesh = bad;
      await page.locator('#mapImport').setInputFiles({
        name: 'bad-mesh.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(p))
      });
      await page.waitForFunction(() => document.getElementById('mapImport').value === '');
      assert.match(await page.locator('#mapStatus').textContent(), /Seamless source mesh/);
      assert.deepEqual(await page.evaluate(() => projectionMap.getProfile()), deformed);
    }
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export mapping', exact: true }).click();
    const stream = await (await download).createReadStream(), chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString()), deformed);
    await page.getByRole('button', { name: 'Save mapping', exact: true }).click();
    const closed = output.waitForEvent('close'); await page.reload(); await closed;
    assert.deepEqual(await page.evaluate(() => projectionMap.getProfile()), deformed);
    assert.deepEqual(errors, []);
    console.log('PASS: strict mesh validation, saved and exported profiles preserve seamless layouts');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
