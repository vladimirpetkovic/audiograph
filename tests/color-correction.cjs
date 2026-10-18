process.env.AUDIOGRAPH_GPU_BUILD = process.env.AUDIOGRAPH_COLOR_BUILD || 'index.html';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && fs.existsSync(chrome)) process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = chrome;
const { open } = require('./gpu-common.cjs');
const ids = ['pfxBrightness', 'pfxContrast', 'pfxSaturation', 'pfxHue'];
const near = (actual, expected, message, tolerance = 2) => {
  actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) <= tolerance, `${message}: channel ${i}: ${actual} vs ${expected}`));
};

(async () => {
  const t = await open({ viewport: { width: 1280, height: 900 } });
  const { page, errors } = t;
  const shaderErrors = [];
  page.on('console', msg => { if (/^(FS:|VS:|Link:)/.test(msg.text())) shaderErrors.push(msg.text()); });
  try {
    await page.evaluate(() => {
      document.getElementById('panelPostFx').classList.remove('closed');
      window.__colorPipes = [false, true].map(layer => {
        const pipe = _pfxBuildPipe(document.createElement('canvas'), layer);
        if (!pipe || !pipe.gl.getProgramParameter(pipe.prog, pipe.gl.LINK_STATUS)) throw new Error('Color shader failed to link');
        return pipe;
      });
    });
    const sample = (layer, fx = {}, rgba = [64, 96, 128, 255]) => page.evaluate(({ layer, fx, rgba }) => {
      const src = document.createElement('canvas'); src.width = src.height = 4;
      const ctx = src.getContext('2d'), image = ctx.createImageData(4, 4);
      for (let i = 0; i < image.data.length; i += 4) image.data.set(rgba, i);
      ctx.putImageData(image, 0, 0);
      const pipe = __colorPipes[layer ? 1 : 0];
      _pfxRun(pipe, src, { ...pfxDefault(), enabled: true, ...fx });
      const out = new Uint8Array(4);
      pipe.gl.readPixels(1, 1, 1, 1, pipe.gl.RGBA, pipe.gl.UNSIGNED_BYTE, out);
      if (pipe.gl.getError() !== pipe.gl.NO_ERROR) throw new Error('Color pipeline WebGL error');
      return Array.from(out);
    }, { layer, fx, rgba });
    for (const layer of [false, true]) {
      near(await sample(layer), [64, 96, 128, 255], 'neutral');
      near(await sample(layer, { pfxBrightness: 20 }), [115, 147, 179, 255], 'brightness up');
      near(await sample(layer, { pfxBrightness: -20 }), [13, 45, 77, 255], 'brightness down');
      near(await sample(layer, { pfxContrast: -100 }), [128, 128, 128, 255], 'flat contrast');
      near(await sample(layer, { pfxContrast: -50 }), [96, 112, 128, 255], 'reduced contrast');
      near(await sample(layer, { pfxContrast: 50 }), [0, 49, 129, 255], 'legacy positive contrast');
      near(await sample(layer, { pfxSaturation: -100 }), [90, 90, 90, 255], 'grayscale');
      near(await sample(layer, { pfxSaturation: 100 }), [38, 102, 166, 255], 'saturation boost');
      near(await sample(layer, { pfxHue: 120 }, [255, 0, 0, 255]), [0, 255, 0, 255], 'positive hue');
      near(await sample(layer, { pfxHue: -120 }, [255, 0, 0, 255]), [0, 0, 255, 255], 'negative hue');
      near(await sample(layer, { pfxHue: 75 }, [96, 96, 96, 255]), [96, 96, 96, 255], 'gray hue invariant');
      near(await sample(layer, { pfxHue: -180 }), await sample(layer, { pfxHue: 180 }), 'hue wrap');
      near(await sample(layer, { pfxBrightness: 20, pfxContrast: -50, pfxSaturation: -100 }), [134, 134, 134, 255], 'combined corrections');
    }
    for (const id of ids) {
      assert.equal(await page.evaluate(id => pfxActive({ ...pfxDefault(), enabled: true, [id]: -20 }) && _pfxNeedsShader({ ...pfxDefault(), [id]: -20 }), id), true, id + ': negative-only FX run');
    }
    near(await sample(true, { pfxBrightness: 100, pfxSaturation: 200, pfxHue: 90 }, [0, 0, 0, 0]), [0, 0, 0, 0], 'transparent stays transparent');
    const alpha = await sample(true, { pfxBrightness: 40, pfxContrast: -30, pfxHue: 90 }, [128, 64, 32, 128]);
    assert.equal(alpha[3], 128, 'correction preserves partial coverage');
    assert.ok(alpha.slice(0, 3).every(v => v <= alpha[3]), 'layer output stays premultiplied');
    console.log('ok pixels: both shaders, signed controls, combined corrections, hue wrap, transparent alpha');

    const edit = async (values) => {
      await page.evaluate(values => {
        for (const [id, value] of Object.entries(values)) {
          const el = document.getElementById(id); el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, values);
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    };
    await page.evaluate(() => { resetAll(); setPostFx(true); });
    const values = { pfxBrightness: -25, pfxContrast: -35, pfxSaturation: 40, pfxHue: -90 };
    await edit(values);
    const ui = await page.evaluate(ids => ids.map(id => ({
      value: +document.getElementById(id).value,
      label: document.getElementById(_pfxLabelId(id)).textContent,
      aria: +document.querySelector('#' + id + ' + .knob').getAttribute('aria-valuenow'),
      stored: getState().stackLayouts[0].params._postFx[id],
    })), ids);
    ids.forEach((id, i) => assert.deepEqual(ui[i], { value: values[id], label: values[id] + (id === 'pfxHue' ? '°' : '%'), aria: values[id], stored: values[id] }));
    await page.locator('#pfxHue + .knob').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#pfxHue').inputValue(), '-89', 'hue knob keyboard editing');
    await page.locator('#pfxHue + .knob').dblclick();
    assert.equal(await page.locator('#pfxHue').inputValue(), '0', 'hue double-click resets to neutral');
    await edit({ pfxHue: -90 });
    const saved = await page.evaluate(() => JSON.parse(JSON.stringify(getState())));
    await page.evaluate(() => addLayer());
    assert.deepEqual(await page.evaluate(ids => ids.map(id => +document.getElementById(id).value), ids), [0, 0, 0, 0], 'new layer neutral');
    await page.evaluate(() => selectLayer(0));
    assert.deepEqual(await page.evaluate(ids => ids.map(id => +document.getElementById(id).value), ids), Object.values(values), 'panel follows active layer');
    await page.evaluate(st => { resetAll(); applyState(st); }, saved);
    assert.deepEqual(await page.evaluate(ids => ids.map(id => getState().stackLayouts[0].params._postFx[id]), ids), Object.values(values), 'preset round-trip');
    await page.evaluate(() => { undoStack.length = 0; undoLast = 0; _captureClean(); });
    await edit({ pfxBrightness: 75 });
    await page.evaluate(() => undo());
    assert.equal(await page.locator('#pfxBrightness').inputValue(), '-25', 'undo restores correction');
    const morph = await page.evaluate(() => pmLerpFx({ ...pfxDefault(), enabled: true, pfxBrightness: -80, pfxHue: -90 }, { ...pfxDefault(), enabled: true, pfxBrightness: 40, pfxHue: 90 }, 0.5));
    assert.equal(morph.pfxBrightness, -20); assert.equal(morph.pfxHue, 0);
    console.log('ok UI: accessible knobs, layer scope, neutral defaults, save/load, undo and morph');

    await page.evaluate(() => { setPfxTarget('comp'); setPostFx(true); });
    await edit({ pfxBrightness: 15, pfxContrast: -10, pfxSaturation: -100, pfxHue: 45 });
    const comp = await page.evaluate(() => JSON.parse(JSON.stringify(getState())));
    assert.equal(comp.postFx.pfxBrightness, 15);
    assert.equal(comp.stackLayouts[0].params._postFx.pfxBrightness, -25, 'composition edit leaves layer alone');
    await page.evaluate(st => { resetAll(); applyState(st); setPfxTarget('comp'); }, comp);
    assert.equal(await page.locator('#pfxHue').inputValue(), '45', 'composition round-trip');
    const legacy = JSON.parse(JSON.stringify(comp));
    ids.filter(id => id !== 'pfxContrast').forEach(id => {
      delete legacy.postFx[id];
      legacy.stackLayouts.forEach(l => delete l.params._postFx[id]);
    });
    await page.evaluate(st => applyState(st), legacy);
    assert.deepEqual(await page.evaluate(() => [compFx.pfxBrightness, compFx.pfxSaturation, compFx.pfxHue, layerFx.pfxBrightness, layerFx.pfxSaturation, layerFx.pfxHue]), [0, 0, 0, 0, 0, 0], 'legacy saves do not inherit new corrections');
    assert.equal(await page.evaluate(() => compFx.pfxContrast), -10, 'contrast survives migration');
    await page.evaluate(() => resetAll());
    assert.deepEqual(await page.evaluate(ids => ids.map(id => +document.getElementById(id).value), ids), [0, 0, 0, 0], 'Reset clears corrections');
    assert.equal(await page.evaluate(() => pfxActive({ ...pfxDefault(), enabled: true })), false, 'neutral layer skips shader');
    console.log('ok composition scope, legacy preset migration and Reset');

    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => document.getElementById('panelPostFx').classList.remove('closed'));
      await page.locator('#pfxColorGroup').scrollIntoViewIfNeeded();
      const layout = await page.evaluate(() => {
        const group = document.getElementById('pfxColorGroup').getBoundingClientRect();
        return [...document.querySelectorAll('#pfxColorGroup .knob')].map(k => {
          const r = k.getBoundingClientRect();
          return r.width > 0 && r.left >= group.left && r.right <= group.right && r.top >= group.top && r.bottom <= group.bottom
            && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
        });
      });
      assert.deepEqual(layout, [true, true, true, true], 'knobs fit color section at ' + viewport.width);
    }
    if (process.env.AUDIOGRAPH_COLOR_SHOT) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.evaluate(() => document.querySelectorAll('.panel').forEach(p => p.classList.toggle('closed', p.id !== 'panelPostFx')));
      await page.locator('#pfxColorGroup').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.resolve(process.env.AUDIOGRAPH_COLOR_SHOT) });
    }
    assert.deepEqual(errors, [], 'no runtime errors');
    assert.deepEqual(shaderErrors, [], 'no shader errors');
    console.log('ALL PASS: color correction');
  } finally { await t.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
