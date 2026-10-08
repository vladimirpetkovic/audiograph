// v41/v42: audio-driven Growth layout (Vine / Neuron / Coral) with slowly fading trails.
process.env.AUDIOGRAPH_PARTICLE_BUILD = process.env.AUDIOGRAPH_GROWTH_BUILD || 'versions/audiograph_42.html';
process.env.AUDIOGRAPH_BUILD_31 = process.env.AUDIOGRAPH_PARTICLE_BUILD;
const fs = require('node:fs');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && fs.existsSync(chrome)) process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = chrome;
const assert = require('node:assert/strict');
const { open, wav, sine, kicks, load } = require('./audio-common.cjs');
const SHOTS = process.env.AG_SHOTS || '';

(async () => {
  const t = await open({ viewport: { width: 1280, height: 800 } });
  const { page, errors } = t;
  try {
    const mix = t2 => kicks(0.7)(t2) + sine(220, 0.25)(t2) + sine(1760, 0.08)(t2);
    const tone = wav([[60, mix]], 'growth.wav');
    await load(page, { name: tone.name, mimeType: tone.mimeType, buffer: tone.buffer });
    await page.evaluate(() => { particlesOn = false; });
    const click = sel => page.evaluate(sel => [...document.querySelectorAll('.mbtn')].find(b => (b.getAttribute('onclick') || '').includes(sel)).click(), sel);
    const ink = () => page.evaluate(() => { const d = frameCtx.getImageData(0, 0, frameCv.width, frameCv.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 60) n++; return n / (d.length / 4); });

    // Retired layouts are gone from the picker; Growth is in General.
    const picker = await page.evaluate(() => [...document.querySelectorAll('.mbtn.amber')].map(b => b.getAttribute('onclick')).join(' '));
    assert.ok(!/kaleidoscope|ridgeplot/.test(picker), 'Kaleidoscope/Ridge removed');
    assert.ok(/setLayout\('growth'/.test(picker), 'Growth button present');
    const lay = await page.evaluate(() => { const r = [...document.querySelectorAll('#panelAppear .prow-stack')].filter(e => !e.closest('.layout-opts')).map(e => { const l = e.querySelector('.prow-label').getBoundingClientRect(), c = e.querySelector('.mode-btns').getBoundingClientRect(); return { above: l.bottom <= c.top + 1, centred: Math.abs((l.left + l.right) / 2 - (c.left + c.right) / 2) < 30 }; }); return r; });
    assert.equal(lay.length, 2, 'Layout and Style rows are stacked');
    lay.forEach(r => assert.ok(r.above && r.centred, 'label above and centred: ' + JSON.stringify(lay)));

    await click("setLayout('growth'");
    // v42: Type and Line buttons each sit on one row; Clear removed; Life/Thickness knobs; Neurons only for Neuron.
    const ui = await page.evaluate(() => ({ rows: ['growTypeRow', 'growLineRow'].map(id => new Set([...document.querySelectorAll('#' + id + ' .mbtn')].map(b => Math.round(b.getBoundingClientRect().top))).size), clear: !!document.getElementById('growClearBtn'), life: !!document.getElementById('pGrowLife'), thick: !!document.getElementById('pGrowThick') }));
    assert.deepEqual(ui, { rows: [1, 1], clear: false, life: true, thick: true }, JSON.stringify(ui));
    const nVis = () => page.evaluate(() => getComputedStyle(document.getElementById('pGrowNeurons').closest('.grow-neuron-only')).display);
    assert.equal(await nVis(), 'none', 'Neurons knob hidden for Vine');
    await page.evaluate(() => { if (!playing) togglePlay(); });
    const res = {};
    for (const type of ['vine', 'neuron', 'coral']) {
      await click(`setGrowType('${type}'`);
      await page.waitForTimeout(3500);
      const a = await ink();
      const tips = await page.evaluate(() => Object.values(agGrowth.stats()).reduce((x, y) => x + y, 0));
      if (SHOTS) await page.locator('#frameCv').screenshot({ path: `${SHOTS}/growth-${type}.png` });
      res[type] = { ink: +a.toFixed(4), tips };
      assert.ok(a > 0.01, type + ' grows visible trails: ' + JSON.stringify(res[type]));
      assert.ok(tips > 2, type + ' has live tips/branches: ' + JSON.stringify(res[type]));
    }
    assert.equal(await page.evaluate(() => JSON.stringify(getState()).includes('"_growType":"coral"')), true, 'type saved per layer');

    // Neurons: count follows the knob, and they die and are reborn in new places.
    await click("setGrowType('neuron'");
    assert.notEqual(await nVis(), 'none', 'Neurons knob shown for Neuron');
    await page.evaluate(() => { document.getElementById('pGrowNeurons').value = 3; document.getElementById('pGrowLife').value = 1; upP(); });
    await page.waitForTimeout(800);
    const s0 = await page.evaluate(() => agGrowth.somas());
    assert.equal(s0.length, 3, 'neuron count follows knob: ' + s0.length);
    await page.waitForTimeout(7000);
    const s1 = await page.evaluate(() => agGrowth.somas());
    const moved = s1.filter(a => !s0.some(b => Math.hypot(a.x - b.x, a.y - b.y) < 1)).length;
    assert.ok(s1.length === 3 && moved >= 1, 'neurons relocate: ' + moved);
    await page.evaluate(() => { document.getElementById('pGrowLife').value = 3; upP(); });

    // Line types draw differently; Thickness widens strokes.
    const lt = {};
    for (const l of ['solid', 'dotted', 'dashed', 'beads']) {
      await page.evaluate(l => { agGrowth.clear(); Math.random = (() => { let x = 7; return () => (x = (x * 16807) % 2147483647) / 2147483647; })(); }, l);
      await click(`setGrowLine('${l}'`);
      await page.waitForTimeout(1500);
      lt[l] = +(await ink()).toFixed(4);
      if (SHOTS) await page.locator('#frameCv').screenshot({ path: `${SHOTS}/growth-line-${l}.png` });
      assert.ok(lt[l] > 0.002, l + ' renders: ' + lt[l]);
    }
    assert.ok(lt.dotted < lt.solid && lt.dashed < lt.solid, 'broken lines draw less ink: ' + JSON.stringify(lt));
    await click("setGrowLine('solid'");

    // v42: Spin rotates the emitter, not the canvas — old trails stay where they were drawn.
    await click("setGrowType('coral'");
    await page.evaluate(() => { agGrowth.clear(); document.getElementById('pSpin').value = 5; upP(); });
    await page.waitForTimeout(2500);
    const sp = await page.evaluate(() => {
      const k = Object.keys(agGrowth.stats()).find(k => k.endsWith('coral')), c = agGrowth.canvas(k), G = 48;
      const grid = (cv, alpha) => { const s = document.createElement('canvas'); s.width = G; s.height = G; const g = s.getContext('2d'); g.drawImage(cv, 0, 0, G, G); const d = g.getImageData(0, 0, G, G).data, o = []; for (let i = 0; i < d.length; i += 4) o.push(alpha ? d[i + 3] : d[i] + d[i + 1] + d[i + 2]); return o; };
      const a = grid(c, true), b = grid(frameCv, false), m = v => v.reduce((x, y) => x + y, 0) / v.length, ma = m(a), mb = m(b);
      let num = 0, da = 0, db = 0; for (let i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
      return { corr: num / Math.sqrt(da * db + 1e-9), rot: _objSpinRot };
    });
    assert.ok(Math.abs(sp.rot) > 0.05, 'spin advances the emitter: ' + JSON.stringify(sp));
    assert.ok(sp.corr > 0.6, 'frame shows trails unrotated: ' + JSON.stringify(sp));
    if (SHOTS) await page.locator('#frameCv').screenshot({ path: `${SHOTS}/growth-spin.png` });
    await page.evaluate(() => { document.getElementById('pSpin').value = 0; upP(); });
    assert.equal(await page.evaluate(() => JSON.stringify(getState()).includes('"_growLine":"solid"')), true, 'line saved');

    // Short trail fades out once growth is paused-free: clear + low trail leaves little ink after silence.
    await page.evaluate(() => { document.getElementById('pGrowTrail').value = 0; document.getElementById('pGrowSpeed').value = 10; upP(); });
    await page.waitForTimeout(2500);
    const faded = await ink();
    assert.ok(faded < res.coral.ink, 'low Trail fades older growth: ' + faded + ' < ' + res.coral.ink);
    await page.evaluate(() => { if (playing) togglePlay(); agGrowth.clear(); renderDensity(); });
    await page.waitForTimeout(200);
    assert.ok((await ink()) < 0.01, 'Clear wipes trails');

    // v42: Vine growth direction (Bottom/Top/Center); the row only shows for Vine.
    await click("setGrowType('vine'");
    assert.notEqual(await page.evaluate(() => getComputedStyle(growDirRow).display), 'none', 'Direction row visible for Vine');
    const dirs = {};
    for (const d of ['bottom', 'top', 'center']) {
      await click(`setGrowDir('${d}'`);
      await page.evaluate(() => { agGrowth.clear(); document.getElementById('pGrowTrail').value = 100; upP(); if (!playing) togglePlay(); });
      await page.waitForTimeout(2500);
      dirs[d] = await page.evaluate(() => { const c = agGrowth.canvas(Object.keys(agGrowth.stats()).find(k => k.endsWith('vine'))), x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height).data, W = c.width, H = c.height; let sy = 0, sr = 0, n = 0; for (let y = 0; y < H; y += 4) for (let i = 0; i < W; i += 4) { if (d[(y * W + i) * 4 + 3] > 40) { sy += y / H; sr += Math.hypot(i / W - .5, y / H - .5); n++; } } return { cy: sy / Math.max(1, n), r: sr / Math.max(1, n), n }; });
    }
    assert.ok(dirs.bottom.cy > 0.55 && dirs.top.cy < 0.45, 'bottom/top vines grow from their edge: ' + JSON.stringify(dirs));
    assert.ok(dirs.center.r < Math.min(dirs.bottom.r, dirs.top.r), 'center vines sit nearer the middle: ' + JSON.stringify(dirs));
    assert.equal(await page.evaluate(() => JSON.stringify(getState()).includes('"_growDir":"center"')), true, 'direction saved');
    await click("setGrowType('coral'");
    assert.equal(await page.evaluate(() => getComputedStyle(growDirRow).display), 'none', 'Direction row hidden for Coral');
    if (await page.evaluate(() => !!document.getElementById('pGrowNoise'))) {
      // v52: Noise randomizes coral; 0 restores the regular coral. v56+: it shapes the linework (meander, swell/pinch) and origins stay put.
      const v56 = await page.evaluate(() => typeof agGrowth.shape === 'function');
      const coralAt = async n => {
        await page.evaluate(n => { document.getElementById('pGrowNoise').value = n; document.getElementById('pGrowTrail').value = 70; upP(); agGrowth.clear(); if (!playing) togglePlay(); }, n);
        const ws = new Set(), xs = [];
        for (let i = 0; i < 8; i++) { await page.waitForTimeout(400); (await page.evaluate(() => agGrowth.tips(Object.keys(agGrowth.stats()).find(k => k.endsWith('coral'))))).forEach(t => { ws.add(t.w.toFixed(3) + '/' + t.gen); if (t.gen === 0) xs.push(t.x); }); }
        const W = await page.evaluate(() => frameCv.width);
        const sh = v56 ? await page.evaluate(() => agGrowth.shape(Object.keys(agGrowth.stats()).find(k => k.endsWith('coral')))) : {};
        if (process.env.AUDIOGRAPH_GROWTH_SHOTS) await page.locator('#frameCv').screenshot({ path: '/tmp/ap/coral-n' + n + '.png' });
        return { widths: ws.size, spread: xs.length ? (Math.max(...xs) - Math.min(...xs)) / W : 0, ink: +(await ink()).toFixed(4), ...sh };
      };
      const n0 = await coralAt(0), n100 = await coralAt(100);
      console.log('coral noise', JSON.stringify({ n0, n100 }));
      if (v56) {
        assert.ok(n100.spread < n0.spread * 1.5 + 0.03, 'coral origins stay put at any noise: ' + JSON.stringify({ n0, n100 }));
        assert.ok(n0.wobble === 0 && n100.wobble > 0.0008, 'noise meanders the coral stroke: ' + JSON.stringify({ n0, n100 }));
        assert.ok(n100.width > 0.15, 'noise swells and pinches coral lines: ' + JSON.stringify(n100));
      } else assert.ok(n100.spread > Math.max(0.25, n0.spread * 3), 'noise scatters coral origins: ' + JSON.stringify({ n0, n100 }));
      assert.ok(n100.ink >= n0.ink * 0.5, 'noisy coral still grows');
      assert.equal(await page.evaluate(() => getState().stackLayouts[activeLayerIdx].params.pGrowNoise), 100, 'noise saved per layer');
      const legacy = await page.evaluate(() => { const st = getState(); delete st.stackLayouts[st.activeLayerIdx].params.pGrowNoise; applyState(st); return [+document.getElementById('pGrowNoise').value, document.getElementById('vGrowNoise').textContent]; });
      assert.deepEqual(legacy, [45, '45%'], 'older saves use the default noise');
    }
    await page.evaluate(() => { if (playing) togglePlay(); });

    // v42 smart cleanup: controls the current layout never reads are hidden, and come back elsewhere.
    const hidden = () => page.evaluate(() => Object.keys(AG_LAYOUT_NA).filter(id => getComputedStyle(document.getElementById(id)).display === 'none'));
    const gh = await hidden();
    for (const id of ['rowStyle', 'rowOutline', 'rowContrast', 'rowTwist', 'rowJitter', 'rowDisorder', 'rowVaryH']) assert.ok(gh.includes(id), 'Growth hides ' + id + ': ' + gh);
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('#panelFx .knob-grid')].filter(g => g.querySelector('#pTwist,#rDisorder')).every(g => getComputedStyle(g).display === 'none')), true, 'empty deformer knob grids collapse');
    await page.evaluate(() => setLayout('linear', null));
    assert.deepEqual((await hidden()).filter(id => id !== 'outlineParams' && id !== 'styleOpts'), [], 'Linear shows everything');
    await page.evaluate(() => setLayout('terrain', null));
    const th = await hidden();
    assert.ok(th.includes('rowOutline') && !th.includes('rowStyle') && !th.includes('rowTwist'), '3D keeps Style and deformers, hides Outline: ' + th);
    await page.evaluate(() => { setLayout('growth', null); resetAll(); });
    assert.deepEqual((await hidden()).filter(id => id !== 'outlineParams' && id !== 'styleOpts'), [], 'Reset restores all controls');

    // v43: Post FX Trails history must fade fully to nothing (8-bit fades used to stall and leave a ghost forever).
    const ghost = await page.evaluate(() => {
      const src = document.createElement('canvas'); src.width = 320; src.height = 200;
      const g = src.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(20, 20, 280, 160);
      _layerTrails = {}; _layerTrail(99, src, 100, 0); _layerTrail(99, src, 100, 0);
      g.clearRect(0, 0, 320, 200);
      const alpha = () => { const d = _layerTrails[99].cv.getContext('2d').getImageData(0, 0, 320, 200).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; };
      for (let i = 0; i < 900; i++) _layerTrail(99, src, 100, 0);
      const layer = alpha();
      trailCv = null; compFx.pfxTrails = 100; const f = document.createElement('canvas'); f.width = 320; f.height = 200; const fg = f.getContext('2d'); fg.fillStyle = '#fff'; fg.fillRect(20, 20, 280, 160);
      applyTrails(f); applyTrails(f); fg.fillStyle = '#000'; fg.fillRect(0, 0, 320, 200);
      for (let i = 0; i < 900; i++) applyTrails(f);
      const d = trailCv.getContext('2d').getImageData(0, 0, 320, 200).data; let comp = 0; for (let i = 0; i < d.length; i += 4) if (d[i] | d[i + 1] | d[i + 2]) comp++;
      compFx.pfxTrails = 0; trailCv = null; delete _layerTrails[99];
      return { layer, comp };
    });
    assert.deepEqual(ghost, { layer: 0, comp: 0 }, 'Trails at 100% fade fully to black: ' + JSON.stringify(ghost));

    assert.deepEqual(errors, []);
    console.log('growth: PASS ' + JSON.stringify(res) + ' lines ' + JSON.stringify(lt) + ' faded ' + faded.toFixed(4));
  } finally { await t.close(); }
})().catch(e => { console.error(e); process.exit(1); });
