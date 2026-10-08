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
    // v49 removed the Sine layout; Concentric stands in as the third distinct layout.
    const L3 = await page.evaluate(() => [...document.querySelectorAll('.mbtn')].some(b => (b.getAttribute('onclick') || '').includes("setLayout('sine'")) ? 'sine' : 'concentric');
    const snap = () => page.evaluate(() => { selectLayer(activeLayerIdx); return { active: activeLayerIdx, rows: [...document.querySelectorAll('#layersList .layer-name')].map(e => e.textContent), lines: stackLayouts.map(l => l.params._lines) }; });
    // Build: circle(110) / sine|concentric(220) / spiral(330)
    await layout('circle'); await setLines(110);
    await page.evaluate(() => addLayer()); await layout(L3); await setLines(220);
    await page.evaluate(() => addLayer()); await layout('spiral'); await setLines(330);
    let s = await snap();
    assert.deepEqual(s.rows, ['circle', L3, 'spiral']);
    assert.deepEqual(s.lines, [110, 220, 330]);

    // Move: spiral up via the ▲ button, then circle down via ▼.
    await page.locator('#layerRow_2 .layer-mv').first().click();
    s = await snap();
    assert.deepEqual(s.rows, ['circle', 'spiral', L3]); assert.deepEqual(s.lines, [110, 330, 220]);
    assert.equal(s.active, 1, 'moved active layer stays selected');
    assert.equal(await page.evaluate(() => layoutMode), 'spiral');
    await page.locator('#layerRow_0 .layer-mv').nth(1).click();
    s = await snap();
    assert.deepEqual(s.rows, ['spiral', 'circle', L3]); assert.deepEqual(s.lines, [330, 110, 220]);
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
    await page.evaluate(() => addLayer()); await layout(L3); await setLines(220);
    await page.evaluate(() => selectLayer(2));
    await page.locator('#layerRow_0 .layer-rm').click();
    s = await snap();
    assert.deepEqual(s.rows, ['circle', L3]); assert.deepEqual(s.lines, [110, 220]); assert.equal(s.active, 1);

    // Delete the active first layer.
    await page.evaluate(() => selectLayer(0));
    await page.locator('#layerRow_0 .layer-rm').click();
    s = await snap();
    assert.deepEqual(s.rows, [L3]); assert.deepEqual(s.lines, [220]);
    assert.equal(await page.evaluate(() => layoutMode), L3);

    if (L3 === 'concentric') {
      // Old saves, links and the built-in Waves preset with a Sine layer load as Linear + Wave deformer.
      const m = await page.evaluate(() => {
        const st = getState(); st.stackLayouts = [{ layout: 'sine', opacity: 100, params: Object.assign(getDefaultLayerParams(), { pSineAmp: 80, _wave: 0 }) }]; st.activeLayerIdx = 0;
        applyState(st); const a = { layout: layoutMode, wave: stackLayouts[0].params._wave };
        applyState({ layoutMode: 'sine', sliders: {} }); a.legacy = layoutMode;
        applyState(builtinPresets.waves); a.waves = stackLayouts.map(l => l.layout);
        a.morph = pmNormalize({ stackLayouts: [{ layout: 'sine', opacity: 100, params: {} }] }).layers[0].layout;
        a.button = !![...document.querySelectorAll('.mbtn')].find(b => b.textContent.trim() === 'Sine');
        return a;
      });
      assert.deepEqual(m, { layout: 'linear', wave: 52, legacy: 'linear', waves: m.waves, morph: 'linear', button: false });
      assert.ok(!m.waves.includes('sine'), 'Waves preset has no Sine layer: ' + m.waves);
    }

    assert.deepEqual(errors, []);
    console.log('layer-order: PASS (delete keeps neighbours, move up/down)');
  } finally { await t.close(); }
})().catch(e => { console.error(e); process.exit(1); });
