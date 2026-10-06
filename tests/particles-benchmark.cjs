// v31 particle benchmark: identical saturated scenes (same seed, state, resolution, step) run with the
// original CPU particle path and the GPU sim+draw path. Reports renderDensity submit time (CPU update +
// draw), completed-frame time (1x1 readback flush), alive particle count, GPU draw/sim counters and device.
// Asserts >=1.5x completed-frame speedup on the heavy eligible scenes while the GPU path holds the
// particles (no CPU fallback, no readbacks).
const assert = require('node:assert/strict');
const { open, particleScene, reseed } = require('./particles-common.cjs');
const WARM = 60, N = 40, MIN = +(process.env.PARTICLE_MIN_SPEEDUP || 1.5);
const scenes = [
  { name: '4 layers x2000 circles', o: { layers: 4, density: 60, life: 400, speed: 0.6, shape: 'circle' }, heavy: true },
  { name: '4 layers x2000 stars trails20', o: { layers: 4, density: 60, life: 400, speed: 0.6, shape: 'star', trail: 20 }, heavy: true },
  { name: '4 layers x2000 noise+vortex', o: { layers: 4, density: 60, life: 400, speed: 0.6, perlin: 40, curl: 30, vortex: 30, shape: 'square' }, heavy: true },
  { name: '1 layer x2000 numbers trails8', o: { layers: 1, density: 60, life: 400, speed: 0.6, shape: 'numbers', trail: 8 }, heavy: false },
];
async function measure(page, mode) {
  await reseed(page, 11);
  return page.evaluate(({ mode, WARM, N }) => {
    agParticles.setMode(mode);
    const s = document.createElement('canvas'); s.width = s.height = 1; const sctx = s.getContext('2d', { willReadFrequently: true });
    const flush = () => { sctx.drawImage(frameCv, 0, 0, 1, 1); sctx.getImageData(0, 0, 1, 1); };
    for (let i = 0; i < WARM; i++) { globalFrame++; renderDensity(); flush(); }
    agParticles.resetStats(); const sub = [], done = [];
    for (let i = 0; i < N; i++) {
      globalFrame++; agGpu.beginFrame();
      const t0 = performance.now(); renderDensity(); const t1 = performance.now(); flush(); const t2 = performance.now();
      sub.push(t1 - t0); done.push(t2 - t0);
    }
    agGpu.beginFrame();
    const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
    let alive = 0; for (const k in particleLayers) alive += particleLayers[k].length;
    const st = agParticles.stats(); if (mode === 'gpu') alive = st.alive != null ? st.alive : alive;
    return { submit: med(sub), frame: med(done), alive, stats: st, label: agParticles.label(), device: agGpu.stats().renderer };
  }, { mode, WARM, N });
}
(async () => {
  const t = await open({ viewport: { width: 1200, height: 800 } });
  const { page, errors } = t; let fail = 0;
  try {
    const res = await page.evaluate(() => [frameCv.width, frameCv.height]);
    console.log(`resolution ${res.join('x')}, warmup ${WARM}, samples ${N}`);
    for (const sc of scenes) {
      await particleScene(page, sc.o);
      const c = await measure(page, 'cpu'), g = await measure(page, 'gpu');
      const sp = c.frame / g.frame;
      console.log(`${sc.name.padEnd(32)} alive CPU ${c.alive} GPU ${g.alive} | submit ${c.submit.toFixed(1)} -> ${g.submit.toFixed(1)} ms | frame ${c.frame.toFixed(1)} -> ${g.frame.toFixed(1)} ms | x${sp.toFixed(2)} | sim ${g.stats.simPasses} draws ${g.stats.drawCalls} inst ${g.stats.instances} trailInst ${g.stats.trailInstances} readbacks ${g.stats.readbacks} gpuMs/frame ${g.stats.gpuSamples ? (g.stats.gpuMs / g.stats.gpuSamples).toFixed(2) : 'n/a'} | ${g.label}`);
      assert.ok(/GPU sim\+draw/.test(g.label), 'GPU path active: ' + g.label);
      assert.equal(g.stats.readbacks, 0); assert.ok(g.stats.simPasses >= N * sc.o.layers);
      assert.ok(Math.abs(g.alive - c.alive) <= c.alive * 0.02 + 5, 'comparable alive counts');
      if (sc.heavy && sp < MIN) { fail++; console.log(`  below ${MIN}x`); }
    }
    console.log('device: ' + (await page.evaluate(() => agParticles.stats().renderer)));
    assert.equal(fail, 0, 'heavy scenes speedup'); assert.deepEqual(errors, []);
    console.log('particles-benchmark: PASS');
  } finally { await t.close(); }
})().catch(e => { console.error(e); process.exit(1); });
