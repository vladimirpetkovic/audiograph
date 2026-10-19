process.env.AUDIOGRAPH_GPU_BUILD = process.env.AUDIOGRAPH_EMITTER_BUILD || 'index.html';
process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||= '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const assert = require('node:assert/strict');
const path = require('node:path');
const { open } = require('./gpu-common.cjs');
const OBJ = 'v -2 -1 0\nv 2 -1 0\nv 2 1 0\nv -2 1 0\nf -4/1/1 -3/2/1 -2/3/1 -1/4/1 # quad\n';
const FILE = { name: 'emitter.obj', mimeType: 'text/plain', buffer: Buffer.from(OBJ) };

(async () => {
  const t = await open({ viewport: { width: 1280, height: 900 } });
  const { page, errors } = t;
  try {
    const sampling = await page.evaluate(obj => {
      const mesh = agParseObj(obj), asset = agEmitterAsset(mesh, 'quad.obj');
      const outward = agEmitterAsset(agParseObj('v 0 0 1\nv 1 0 1\nv 0 1 1\nv 0 0 -1\nf 1 2 3'), 'normal.obj').points[5];
      const model = { verts: [[-2,0,0],[-1,0,0],[-2,1,0],[1,0,0],[3,0,0],[1,2,0]], faces: [[0,1,2],[3,4,5]] };
      const sample = agSurfaceSampler(model), r = _agRng(7); let large = 0;
      for (let i = 0; i < 10000; i++) if (sample(r(), r(), r()).pos[0] > 0) large++;
      let invalid = 0;
      for (const text of ['v NaN 0 0\n', 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 9', 'v 0 0 0\nv 0 0 0\nv 0 0 0\nf 1 2 3']) {
        try { agEmitterAsset(agParseObj(text), 'bad.obj'); } catch (e) { invalid++; }
      }
      return { points: asset.points.length, finite: asset.points.every(Number.isFinite), areaRatio: large / 10000, invalid, outward, bounds: asset.points.every((x, i) => i % 6 < 3 ? Math.abs(x) <= 1 : Math.abs(x) <= 1.00001) };
    }, OBJ);
    assert.equal(sampling.points, 2048 * 6); assert.ok(sampling.finite && sampling.bounds);
    assert.ok(sampling.areaRatio > 0.78 && sampling.areaRatio < 0.82, JSON.stringify(sampling));
    assert.equal(sampling.invalid, 3);
    assert.equal(sampling.outward, 1, 'OBJ Y normalization keeps outward normals');
    console.log('ok OBJ parsing: quads, relative/slashed indices, comments, area-weighted samples and invalid geometry');

    await page.evaluate(() => { setLayout('simparticles'); setSimOpt('pEmit', 'obj'); });
    assert.equal(await page.locator('#simEmitterInfo').isVisible(), true, 'missing mesh notice is visible');
    await page.setInputFiles('#simEmitterFile', FILE);
    await page.waitForFunction(() => simEmitterData && simEmitterData.name === 'emitter.obj');
    const original = await page.evaluate(() => JSON.parse(JSON.stringify(getState())));
    assert.equal(original.stackLayouts[0].params._sim.pEmit, 'obj');
    assert.equal(original.stackLayouts[0].params._simEmitter.points.length, 2048 * 6);
    assert.equal(await page.locator('#simEmitterInfo').isVisible(), true, 'loaded mesh status is visible');
    await page.setInputFiles('#simEmitterFile', { ...FILE, buffer: Buffer.from('v 0 0 0\nf 1 2 3') });
    await page.waitForFunction(() => document.getElementById('simEmitterInfo').textContent.includes('Could not load'));
    assert.deepEqual(await page.evaluate(() => simEmitterData), original.stackLayouts[0].params._simEmitter, 'failed upload preserves previous asset');
    await page.evaluate(() => { addLayer(); setLayout('simfluid'); setSimOpt('fEmit', 'sphere'); });
    assert.equal(await page.evaluate(() => simEmitterData), null, 'new layer has no borrowed mesh');
    await page.evaluate(() => selectLayer(0));
    assert.equal(await page.evaluate(() => simOpt.pEmit), 'obj');
    assert.equal(await page.evaluate(() => simEmitterData.name), 'emitter.obj');
    await page.evaluate(st => { resetAll(); applyState(st); }, original);
    assert.deepEqual(await page.evaluate(() => simEmitterData), original.stackLayouts[0].params._simEmitter, 'mesh survives state round-trip');
    await page.evaluate(obj => {
      window.__emitterUpload = loadSimEmitterFile({ target: { value: '', files: [{ name: 'delayed.obj', size: obj.length, text: () => new Promise(r => { window.__finishEmitterUpload = () => r(obj); }) }] } });
      addLayer(); setLayout('simsmoke');
      window.__finishEmitterUpload();
    }, OBJ);
    await page.evaluate(() => window.__emitterUpload);
    assert.equal(await page.evaluate(() => simEmitterData), null, 'upload never changes a different active layer');
    assert.equal(await page.evaluate(() => stackLayouts[0].params._simEmitter.name), 'delayed.obj', 'upload stays attached to its owning layer');
    await page.evaluate(st => { resetAll(); applyState(st); }, original);
    await page.evaluate(() => { undoStack.length = 0; undoLast = 0; _captureClean(); setSimOpt('pEmit', 'sphere'); undo(); });
    assert.equal(await page.evaluate(() => simOpt.pEmit), 'obj', 'undo restores emitter type');
    console.log('ok UI: invalid upload errors, layer isolation, neutral new layers, mesh persistence and undo');

    assert.equal(await page.evaluate(() => agSim.ready()), 'ready', 'native WebGPU required');
    const edit = values => page.evaluate(values => {
      for (const [id, value] of Object.entries(values)) { const e = document.getElementById(id); e.value = value; e.dispatchEvent(new Event('input', { bubbles: true })); }
    }, values);
    const feed = (n = 160) => page.evaluate(n => { agSim.inject({ spec: 0.7, onset: 0 }); agSim.advance(n); renderDensity(); }, n);
    const bounds = () => page.evaluate(() => {
      const p = agSim.pixels(simUid); let minX = p.width, maxX = -1, minY = p.height, maxY = -1, lit = 0;
      for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
        const i = (y * p.width + x) * 4;
        if (Math.max(p.data[i], p.data[i + 1], p.data[i + 2]) > 12) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); lit++; }
      }
      return { x: (maxX - minX + 1) / p.width, y: (maxY - minY + 1) / p.height, lit };
    });
    await page.evaluate(st => { resetAll(); applyState(st); setSimOpt('q', 'low'); setSimOpt('pEmit', 'sphere'); }, original);
    await edit({ pSimEnergy: 0, pSimSwirlSnd: 0, pSimReact: 0, pSpGravity: 0, pSpSwirl: 0, pSpTrail: 0, pSpLife: 80, pSpAmount: 200, pSpSize: 12, pEmitScale: 65 });
    await page.evaluate(() => { agSim.reset(); renderDensity(); });
    await feed(); const sphere = await bounds();
    assert.ok(sphere.lit > 100 && sphere.x > 0.1 && sphere.y > 0.4, 'sphere surface emits across the projected disk: ' + JSON.stringify(sphere));
    await page.evaluate(() => { setSimOpt('pEmit', 'obj'); agSim.reset(); renderDensity(); });
    await feed(); const flat = await bounds();
    assert.ok(flat.lit > 100 && flat.x > 0.1, 'OBJ surface emits: ' + JSON.stringify(flat));
    await edit({ pEmitRY: 90 }); await page.evaluate(() => { agSim.reset(); renderDensity(); });
    await feed(); const edge = await bounds();
    assert.ok(edge.x < flat.x * 0.2, 'rotation projects flat OBJ edge-on: ' + JSON.stringify({ flat, edge }));
    console.log('ok native particle rendering: sphere surface, OBJ surface and edge-on rotation');

    for (const m of ['simfluid', 'simsmoke']) {
      await page.evaluate(m => { setLayout(m); setSimOpt('q', 'low'); setSimOpt(_simEmitterKey(m), 'sphere'); }, m);
      await edit({ pSimEnergy: 100, pSimReact: 0, pSimSwirlSnd: 0, pEmitRY: 0, pEmitScale: 65, pSimExpo: 0 });
      await page.evaluate(() => { agSim.reset(); renderDensity(); });
      await feed(110); const sphereImage = await bounds();
      assert.ok(sphereImage.lit > 100, m + ' sphere emits: ' + JSON.stringify(sphereImage));
      await page.evaluate(m => { setSimOpt(_simEmitterKey(m), 'obj'); agSim.reset(); renderDensity(); }, m);
      await feed(110); const objImage = await bounds();
      assert.ok(objImage.lit > 100, m + ' OBJ emits: ' + JSON.stringify(objImage));
      assert.deepEqual(await page.evaluate(() => agSim.stats().errors), [], m + ' no WebGPU validation errors');
      console.log('ok ' + m + ': native sphere/OBJ injection');
    }
    await page.evaluate(() => { setLayout('simparticles'); simEmitterData = null; stackLayouts[0].params._simEmitter = null; setSimOpt('pEmit', 'obj'); agSim.reset(); renderDensity(); });
    await feed(20);
    assert.equal(await page.evaluate(() => Object.values(agSim.stats().layers)[0].emitted), 0, 'missing OBJ never silently falls back');
    for (const m of ['simparticles', 'simfluid', 'simsmoke', 'simrd', 'simslime', 'simwave', 'simcloner', 'simsplat']) {
      await page.evaluate(m => { setLayout(m); setSimOpt('q', 'low'); agSim.reset(); renderDensity(); }, m);
      await feed(4);
      assert.deepEqual(await page.evaluate(() => agSim.stats().errors), [], m + ': shared shader/buffer compatibility');
    }
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => { setLayout('simparticles'); setSimOpt('pEmit', 'sphere'); document.querySelectorAll('.panel').forEach(p => p.classList.toggle('closed', p.id !== 'panelAppear')); });
      await page.locator('#simSurfaceBox').scrollIntoViewIfNeeded();
      const fits = await page.evaluate(() => {
        const box = document.getElementById('simSurfaceBox').getBoundingClientRect();
        return [...document.querySelectorAll('#simSurfaceBox .knob')].filter(e => e.offsetParent).every(e => {
          const r = e.getBoundingClientRect(); return r.width > 0 && r.left >= box.left && r.right <= box.right && r.left >= 0 && r.right <= innerWidth;
        });
      });
      assert.ok(fits, 'surface controls fit at ' + width);
    }
    console.log('ok missing-asset behavior and existing particle/grid/cloner/splat pipelines');
    if (process.env.AUDIOGRAPH_EMITTER_SHOT) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.evaluate(() => { setLayout('simparticles'); setSimOpt('pEmit', 'sphere'); document.querySelectorAll('.panel').forEach(p => p.classList.toggle('closed', p.id !== 'panelAppear')); });
      await feed(90);
      await page.locator('#simSurfaceBox').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.resolve(process.env.AUDIOGRAPH_EMITTER_SHOT) });
    }
    assert.deepEqual(errors, [], 'no runtime errors');
    assert.deepEqual(await page.evaluate(() => agSim.stats().errors), [], 'no GPU errors');
    console.log('ALL PASS: projected 3D emitters');
  } finally { await t.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
