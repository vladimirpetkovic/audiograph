// v31 GPU particle acceptance: GPU state/simulation parity with the original CPU path, proof that the
// simulation runs on the GPU (no CPU per-particle update, no hot-path readback), all 11 shapes and trails
// drawn on the GPU with image parity, cap behaviour, compatibility fallback, backend switch and context loss.
const assert = require('node:assert/strict');
const { open, particleScene, reseed, diff } = require('./particles-common.cjs');

const FR = 40;
async function run(page, mode, frames, seed) {
  await reseed(page, seed);
  return page.evaluate(({ mode, frames }) => {
    agParticles.setMode(mode); agParticles.resetStats();
    let noiseCalls = 0; const orig = applyNoise; window.applyNoise = function () { noiseCalls++; return orig.apply(this, arguments); };
    try { for (let i = 0; i < frames; i++) { globalFrame++; renderDensity(); } } finally { window.applyNoise = orig; }
    const s = agParticles.stats();
    const cpu = getParticles(0).map(p => ({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, age: p.age, maxAge: p.maxAge }));
    const gpu = agParticles.debugRead(0);
    const d = frameCtx.getImageData(0, 0, frameCv.width, frameCv.height).data;
    return { stats: s, cpu, gpu, noiseCalls, status: agGpu.status(), img: { data: Array.from(d) } };
  }, { mode, frames });
}
function compareState(a, b, tol) {
  assert.equal(b.length, a.length, `particle count CPU ${a.length} vs GPU ${b.length}`);
  let m = 0; for (let i = 0; i < a.length; i++) { m = Math.max(m, Math.abs(a[i].x - b[i].x), Math.abs(a[i].y - b[i].y), Math.abs(a[i].age - b[i].age)); }
  assert.ok(m <= tol, `max state error ${m} > ${tol}`); return m;
}

(async () => {
  const t = await open({ viewport: { width: 1200, height: 800 } });
  const { page, errors } = t;
  try {
    // 1. Physics parity, forces off and on.
    for (const sc of [{ name: 'plain', o: {} }, { name: 'forces+noise', o: { perlin: 40, curl: 30, vortex: 30, twist: 20, bulge: 15, wave: 30, gravity: 0.2 } }]) {
      await particleScene(page, { density: 25, life: 120, ...sc.o });
      const c = await run(page, 'cpu', FR, 7), g = await run(page, 'gpu', FR, 7);
      assert.ok(c.cpu.length > 200, 'CPU reference has particles');
      assert.equal(g.cpu.length, 0, 'GPU mode keeps no CPU particle objects');
      assert.equal(g.noiseCalls, 0, 'GPU mode never runs the CPU force/noise update');
      if (sc.o.perlin) assert.ok(c.noiseCalls > 1000, 'CPU reference runs applyNoise per particle');
      assert.equal(g.stats.simPasses, FR, 'one GPU simulation pass per frame');
      assert.equal(g.stats.readbacks, 0, 'no state readback in hot path');
      assert.equal(g.stats.cpuLayers, 0);
      const err = compareState(c.cpu, g.gpu, sc.o.perlin ? 0.75 : 0.05);
      const im = diff(c.img, g.img);
      console.log(`parity ${sc.name}: n=${c.cpu.length} maxErr=${err.toExponential(2)}px image mean=${im.mean.toFixed(2)} big=${(im.big * 100).toFixed(2)}% status="${g.status}"`);
      assert.ok(im.mean < 2.5 && im.big < 0.02, 'image parity');
    }
    // 2. All 11 shapes with trails: image parity, everything drawn by GPU.
    for (const shape of ['circle', 'square', 'star', 'diamond', 'ring', 'triangle', 'spark', 'line', 'numbers', 'symbols', 'words']) {
      await particleScene(page, { shape, trail: 12, density: 12, life: 90, size: 7 });
      const c = await run(page, 'cpu', 25, 11), g = await run(page, 'gpu', 25, 11);
      const im = diff(c.img, g.img);
      console.log(`shape ${shape.padEnd(8)} trails: n=${c.cpu.length} image mean=${im.mean.toFixed(2)} big=${(im.big * 100).toFixed(2)}% draws=${g.stats.drawCalls} trailInst=${g.stats.trailInstances}`);
      assert.ok(g.stats.gpuLayers === 25 && g.stats.cpuLayers === 0, 'all frames on GPU');
      assert.ok(g.stats.trailInstances > 0, 'trails drawn on GPU');
      const glyph = ['numbers', 'symbols', 'words'].includes(shape);
      assert.ok(im.mean < (glyph ? 4 : 2.5) && im.big < (glyph ? 0.05 : 0.02), `${shape} image parity`);
    }
    // 3. Cap: long life saturates the 2000 cap identically.
    // Dynamics (v44) lowers typical line values; the cap check needs full emission, so use the flat response.
    await page.evaluate(() => { if (typeof setDynamics === 'function') setDynamics(0); });
    await particleScene(page, { density: 50, life: 300, speed: 0.4 });
    const cc = await run(page, 'cpu', 80, 3), gc = await run(page, 'gpu', 80, 3);
    console.log(`cap: CPU ${cc.cpu.length} GPU ${gc.gpu.length} kills=${gc.stats.killUploads} forced=${gc.stats.forcedEvictions}`);
    assert.equal(cc.cpu.length, 2000); compareState(cc.cpu, gc.gpu, 0.05);
    // 4. Multi-layer stack, fallback with visible reason, switch, context loss.
    await particleScene(page, { layers: 3, density: 20, life: 150 });
    await reseed(page, 5);
    const r = await page.evaluate(() => {
      agParticles.setMode('gpu'); agParticles.resetStats(); const out = {};
      for (let i = 0; i < 20; i++) { globalFrame++; renderDensity(); }
      out.gpu = agParticles.stats(); out.before = agParticles.debugRead(1).length;
      stackLayouts.forEach(l => l.params._rColor = 40); renderDensity(); agGpu.beginFrame();
      out.fallbackStatus = agGpu.status(); out.cpuAfter = getParticles(1).length; out.fb = agParticles.stats();
      stackLayouts.forEach(l => l.params._rColor = 0); for (let i = 0; i < 5; i++) renderDensity();
      out.back = agParticles.stats(); out.backCpu = getParticles(1).length;
      agParticles.setMode('cpu'); renderDensity(); out.cpuMode = getParticles(1).length; agParticles.setMode('gpu'); renderDensity();
      out.lose = agParticles.loseContext(); return out;
    });
    await page.waitForTimeout(100);
    const r2 = await page.evaluate(() => { for (let i = 0; i < 5; i++) renderDensity(); agGpu.beginFrame(); const o = { status: agGpu.status(), cpu: getParticles(0).length }; agParticles.restoreContext(); return o; });
    await page.waitForTimeout(200);
    const r3 = await page.evaluate(() => { agParticles.resetStats(); for (let i = 0; i < 5; i++) renderDensity(); agGpu.beginFrame(); return { s: agParticles.stats(), status: agGpu.status(), cpu: getParticles(0).length }; });
    console.log('stack/fallback:', JSON.stringify({ gpuLayers: r.gpu.last.gpu, before: r.before, fallback: r.fallbackStatus, cpuAfter: r.cpuAfter, readbacks: r.fb.readbacks, backGpu: r.back.last.gpu, cpuMode: r.cpuMode, lost: r2.status, restored: r3.status }));
    assert.equal(r.gpu.last.gpu, 3, 'three particle layers on GPU');
    assert.match(r.fallbackStatus, /random colour variation/);
    assert.ok(r.cpuAfter >= r.before * 0.8, 'fallback keeps particles (one readback)');
    assert.equal(r.backCpu, 0, 'returns to GPU and re-uploads');
    assert.ok(r.cpuMode > 0, 'CPU mode gets GPU particles back');
    assert.ok(r.lose, 'lose_context available');
    assert.match(r2.status, /context lost/i); assert.ok(r2.cpu > 0, 'animation continues on CPU while lost');
    assert.ok(r3.s.last.gpu === 3 && r3.cpu === 0 && r3.s.restores >= 1, 'GPU particles resume after restore without stale CPU copies');
    assert.deepEqual(errors, []);
    console.log('particles-gpu: PASS');
  } finally { await t.close(); }
})().catch(e => { console.error(e); process.exit(1); });
