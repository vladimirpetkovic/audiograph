// v35 custom 3D object: connected wireframe (like the built-in solids) with a default model, and the
// object only turns when Spin is active.
process.env.AUDIOGRAPH_PARTICLE_BUILD = process.env.AUDIOGRAPH_OBJECT_BUILD || 'versions/audiograph_35.html';
process.env.AUDIOGRAPH_BUILD_31 = process.env.AUDIOGRAPH_PARTICLE_BUILD;
const fs = require('node:fs');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && fs.existsSync(chrome)) process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = chrome;
const assert = require('node:assert/strict');
const { open, wav, sine, load } = require('./audio-common.cjs');

function sphereObj(lat, lon) {
  const v = [], f = [];
  for (let i = 0; i <= lat; i++) for (let j = 0; j < lon; j++) { const th = Math.PI * i / lat, ph = 2 * Math.PI * j / lon; v.push(`v ${(Math.sin(th) * Math.cos(ph)).toFixed(5)} ${Math.cos(th).toFixed(5)} ${(Math.sin(th) * Math.sin(ph)).toFixed(5)}`); }
  for (let i = 0; i < lat; i++) for (let j = 0; j < lon; j++) { const a = i * lon + j + 1, b = i * lon + (j + 1) % lon + 1, c = (i + 1) * lon + (j + 1) % lon + 1, d = (i + 1) * lon + j + 1; f.push(`f ${a} ${b} ${c}`, `f ${a} ${c} ${d}`); }
  return v.concat(f).join('\n');
}

(async () => {
  const t = await open({ viewport: { width: 1280, height: 800 } });
  const { page, errors } = t;
  try {
    const shot = () => page.evaluate(() => { renderDensity(); const d = frameCtx.getImageData(0, 0, frameCv.width, frameCv.height).data; let s = 0, ink = 0; for (let i = 0; i < d.length; i += 4) { const v = d[i] + d[i + 1] + d[i + 2]; s = (s * 31 + v) >>> 0; if (v > 60) ink++; } return { hash: s, ink: ink / (d.length / 4) }; });
    await page.evaluate(() => { particlesOn = false; [...document.querySelectorAll('.mbtn')].find(b => /setLayout\('object'/.test(b.getAttribute('onclick') || '')).click(); });

    // 1. No model loaded: the default knot wireframe is drawn (never blank), for line and marker styles.
    const def = await shot();
    assert.ok(def.ink > 0.004, 'default model renders a wireframe: ' + JSON.stringify(def));
    const marker = await page.evaluate(() => { lineShape = 'numbers'; renderDensity(); const d = frameCtx.getImageData(0, 0, frameCv.width, frameCv.height).data; let ink = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 60) ink++; lineShape = 'straight'; return ink / (d.length / 4); });
    assert.ok(marker > 0.002, 'marker styles still show the wireframe underneath: ' + marker);

    // 2. A large custom model is simplified into a connected, evenly spaced wireframe.
    const obj = sphereObj(160, 200); // 64,000 triangles
    await page.locator('#pObjFile').setInputFiles({ name: 'ball.obj', mimeType: 'text/plain', buffer: Buffer.from(obj) });
    await page.waitForFunction(() => objModelData && objModelData.faces.length > 60000);
    const w = await page.evaluate(() => {
      const max = +pObjMaxFaces.value, wire = _objWire(objModelData, max), n = wire.verts.length, par = Int32Array.from({ length: n }, (_, i) => i);
      const find = x => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
      wire.edges.forEach(([a, b]) => { par[find(a)] = find(b); });
      const roots = new Set(); for (let i = 0; i < n; i++) roots.add(find(i));
      return { max, edges: wire.edges.length, verts: n, components: roots.size };
    });
    assert.ok(w.edges <= w.max * 1.5 && w.edges >= w.max * 0.5, 'edge budget respected: ' + JSON.stringify(w));
    assert.equal(w.components, 1, 'simplified wireframe stays one connected mesh: ' + JSON.stringify(w));
    const big = await shot();
    assert.ok(big.ink > 0.004 && big.hash !== def.hash, 'custom model replaces the default');

    // 3. Spin: with Spin 0 the object never turns; with Spin > 0 it turns about its own axis.
    const still = await page.evaluate(() => { pSpin.value = 0; pSpin.dispatchEvent(new Event('input', { bubbles: true })); spinAngle = 1.3; layerSpinAngle.fill && layerSpinAngle.fill(0); dragRotX = 0; dragRotY = 0; return null; });
    const s1 = await shot();
    await page.evaluate(() => { spinAngle = 2.6; layerSpinAngle[Math.max(0, getActiveLayerIdx())] = 2.6; });
    const s2 = await shot();
    assert.equal(s1.hash, s2.hash, 'Spin 0: no rotation');
    await page.evaluate(() => { pSpin.value = 1; pSpin.dispatchEvent(new Event('input', { bubbles: true })); spinAngle = 1.3; layerSpinAngle[Math.max(0, getActiveLayerIdx())] = 1.3; });
    const s3 = await shot();
    await page.evaluate(() => { spinAngle = 2.6; layerSpinAngle[Math.max(0, getActiveLayerIdx())] = 2.6; });
    const s4 = await shot();
    assert.notEqual(s3.hash, s4.hash, 'Spin > 0: the object turns');
    const flat = await page.evaluate(() => _objSpinRot);
    assert.ok(Math.abs(flat - 2.6) < 1e-9, 'object turns in 3D via its own angle, not a 2D canvas rotation');

    // Live playback: Spin 0 keeps the turn angle at 0; Spin 1 advances it.
    const tone = wav([[6, sine(220, 0.5)]], 'tone.wav');
    await load(page, { name: tone.name, mimeType: tone.mimeType, buffer: tone.buffer });
    const live = await page.evaluate(async () => {
      const run = async spin => { pSpin.value = spin; pSpin.dispatchEvent(new Event('input', { bubbles: true })); const seen = []; if (!playing) togglePlay(); for (let i = 0; i < 12; i++) { await new Promise(r => setTimeout(r, 60)); seen.push(_objSpinRot); } if (playing) togglePlay(); return seen; };
      return { off: await run(0), on: await run(1) };
    });
    assert.ok(live.off.every(v => v === 0), 'playing with Spin 0 never turns: ' + live.off.join());
    assert.ok(live.on[live.on.length - 1] > live.on[0], 'playing with Spin 1 turns: ' + live.on.join());

    assert.deepEqual(errors, []);
    console.log(`object-wire: PASS (default model, ${w.edges} connected edges from 64k faces, spin-gated rotation)`);
  } finally { await t.close(); }
})().catch(e => { console.error(e); process.exit(1); });
