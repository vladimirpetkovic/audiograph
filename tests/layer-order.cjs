// v38: deleting a layer keeps the other layers intact (deleting the last one no longer overwrites the one
// above), and layers can be moved up/down.
process.env.AUDIOGRAPH_PARTICLE_BUILD = process.env.AUDIOGRAPH_LAYERORDER_BUILD || 'versions/audiograph_38.html';
process.env.AUDIOGRAPH_BUILD_31 = process.env.AUDIOGRAPH_PARTICLE_BUILD;
const fs = require('node:fs');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && fs.existsSync(chrome)) process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = chrome;
const assert = require('node:assert/strict');
const { open } = require('./audio-common.cjs');

(async () => {
  const t = await open({ viewport: { width: 1280, height: 800 } });
  const { page, errors } = t;
  try {
    const layout = n => page.evaluate(n => [...document.querySelectorAll('.mbtn')].find(b => (b.getAttribute('onclick') || '').includes(`setLayout('${n}'`)).click(), n);
    const setLines = v => page.evaluate(v => { pLines.value = v; pLines.dispatchEvent(new Event('input', { bubbles: true })); }, v);
    const snap = () => page.evaluate(() => { selectLayer(activeLayerIdx); return { active: activeLayerIdx, rows: [...document.querySelectorAll('#layersList .layer-name')].map(e => e.textContent), lines: stackLayouts.map(l => l.params._lines) }; });
    // Build: circle(110) / sine(220) / spiral(330)
    await layout('circle'); await setLines(110);
    await page.evaluate(() => addLayer()); await layout('sine'); await setLines(220);
    await page.evaluate(() => addLayer()); await layout('spiral'); await setLines(330);
    let s = await snap();
    assert.deepEqual(s.rows, ['circle', 'sine', 'spiral']);
    assert.deepEqual(s.lines, [110, 220, 330]);

    // Move: spiral up via the ▲ button, then circle down via ▼.
    await page.locator('#layerRow_2 .layer-mv').first().click();
    s = await snap();
    assert.deepEqual(s.rows, ['circle', 'spiral', 'sine']); assert.deepEqual(s.lines, [110, 330, 220]);
    assert.equal(s.active, 1, 'moved active layer stays selected');
    assert.equal(await page.evaluate(() => layoutMode), 'spiral');
    await page.locator('#layerRow_0 .layer-mv').nth(1).click();
    s = await snap();
    assert.deepEqual(s.rows, ['spiral', 'circle', 'sine']); assert.deepEqual(s.lines, [330, 110, 220]);
    assert.equal(await page.evaluate(() => layoutMode), 'spiral', 'active layer follows its content');
    const off = await page.evaluate(() => [...document.querySelectorAll('#layerRow_0 .layer-mv')].map(e => e.classList.contains('off')).concat([...document.querySelectorAll('#layerRow_2 .layer-mv')].map(e => e.classList.contains('off'))));
    assert.deepEqual(off, [true, false, false, true], 'edge arrows disabled');

    // Delete the last layer while it is active: the one above keeps its own settings.
    await page.evaluate(() => selectLayer(2));
    await page.locator('#layerRow_2 .layer-rm').click();
    s = await snap();
    assert.deepEqual(s.rows, ['spiral', 'circle']); assert.deepEqual(s.lines, [330, 110]);
    assert.equal(s.active, 1); assert.equal(await page.evaluate(() => layoutMode), 'circle');
    assert.equal(await page.evaluate(() => +pLines.value), 110);

    // Delete a non-active layer above the active one.
    await page.evaluate(() => addLayer()); await layout('sine'); await setLines(220);
    await page.evaluate(() => selectLayer(2));
    await page.locator('#layerRow_0 .layer-rm').click();
    s = await snap();
    assert.deepEqual(s.rows, ['circle', 'sine']); assert.deepEqual(s.lines, [110, 220]); assert.equal(s.active, 1);

    // Delete the active first layer.
    await page.evaluate(() => selectLayer(0));
    await page.locator('#layerRow_0 .layer-rm').click();
    s = await snap();
    assert.deepEqual(s.rows, ['sine']); assert.deepEqual(s.lines, [220]);
    assert.equal(await page.evaluate(() => layoutMode), 'sine');

    assert.deepEqual(errors, []);
    console.log('layer-order: PASS (delete keeps neighbours, move up/down)');
  } finally { await t.close(); }
})().catch(e => { console.error(e); process.exit(1); });
