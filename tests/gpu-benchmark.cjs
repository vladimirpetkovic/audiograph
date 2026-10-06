// Reproducible Canvas 2D vs GPU (WebGL2) render benchmark for v30.
// Same page, state, audio range, seeds and resolution for both backends. Reports wall time of
// renderDensity() (CPU submit) and time until the frame is complete (1x1 readback flush), plus
// playback animLoop cost and frame cadence. Usage: node gpu-benchmark.cjs [--quick]
const { open, deterministic } = require('./gpu-common.cjs');

const quick = process.argv.includes('--quick');
const WARM = quick ? 5 : 15, SAMPLES = quick ? 12 : 40, PLAY_MS = quick ? 1500 : 4000;
const synthetic = [
  { name: 'linear 800 straight x1', layout: 'linear', shape: 'straight', layers: 1 },
  { name: 'circle 800 dotted x3', layout: 'circle', shape: 'dotted', layers: 3 },
  { name: 'kaleido 800 rounded x4 +outline', layout: 'kaleidoscope', shape: 'rounded', layers: 4, outline: 'solid' },
  { name: 'spiral 800 numbers x3', layout: 'spiral', shape: 'numbers', layers: 3 },
];
const presets = ['cell', 'sacred_circle', 'zodiac', 'organica'];

function q(a, p) { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; }
const f = v => v.toFixed(2).padStart(7);

async function scene(page, w) {
  await page.evaluate(w => {
    const st = getState(), L = st.stackLayouts[0];
    st.stackLayouts = Array.from({ length: w.layers }, (_, i) => ({ ...JSON.parse(JSON.stringify(L)), layout: w.layout, opacity: 85,
      params: { ...L.params, _lines: 800, _thick: 1.5, _lineShape: w.shape, _rotation: i * 23, _colorMode: 'toneramp',
        _showOutline: !!w.outline, _outlineStyle: w.outline || 'solid', _particlesOn: false } }));
    st.activeLayerIdx = 0; st.sliders.pLines = 800; applyState(st);
  }, w);
  await deterministic(page);
}

async function measure(page, mode) {
  return page.evaluate(({ mode, WARM, SAMPLES }) => {
    agGpu.setMode(mode);
    const sync = document.createElement('canvas'); sync.width = sync.height = 1; const sctx = sync.getContext('2d', { willReadFrequently: true });
    const flush = () => { sctx.drawImage(frameCv, 0, 0, 1, 1); sctx.getImageData(0, 0, 1, 1); };
    for (let i = 0; i < WARM; i++) { renderDensity(); flush(); }
    agGpu.resetStats();
    const cpu = [], total = [];
    for (let i = 0; i < SAMPLES; i++) {
      const t0 = performance.now(); renderDensity(); const t1 = performance.now(); flush(); const t2 = performance.now();
      cpu.push(t1 - t0); total.push(t2 - t0);
    }
    const s = agGpu.stats();
    return { cpu, total, gpu: s.gpuLayers / SAMPLES, compat: s.compatLayers / SAMPLES, reasons: s.reasons, rec: s.recordMs / SAMPLES, ren: s.renderMs / SAMPLES, blit: s.blitMs / SAMPLES, size: frameCv.width + 'x' + frameCv.height };
  }, { mode, WARM, SAMPLES });
}

async function playback(page, mode) {
  return page.evaluate(async ({ mode, PLAY_MS }) => {
    agGpu.setMode(mode);
    const orig = animLoop, durs = [], stamps = [];
    window.animLoop = function () { const t = performance.now(); orig(); if (playing) { durs.push(performance.now() - t); stamps.push(t); } };
    safeSetTime(1); if (!playing) togglePlay();
    await new Promise(r => setTimeout(r, PLAY_MS));
    if (playing) togglePlay(); window.animLoop = orig;
    const gaps = stamps.slice(1).map((t, i) => t - stamps[i]);
    return { durs: durs.slice(10), gaps: gaps.slice(10) };
  }, { mode, PLAY_MS });
}

(async () => {
  const s = await open({ viewport: { width: 1600, height: 1000 } });
  try {
    const env = await s.page.evaluate(() => { agGpu.ensure(); const st = agGpu.stats(); return { renderer: st.renderer, timerQuery: st.timerQuery, ua: navigator.userAgent, dpr: devicePixelRatio, size: frameCv.width + 'x' + frameCv.height }; });
    console.log(`GPU: ${env.renderer}\nUA: ${env.ua}\nDPR ${env.dpr}, preview canvas ${env.size}; warm-up ${WARM}, samples ${SAMPLES}; times in ms (median / p90)`);
    console.log('EXT_disjoint_timer_query_webgl2:', env.timerQuery ? 'exposed (not used: async results cannot be attributed per frame here)' : 'unavailable');
    console.log('workload'.padEnd(36) + 'canvas cpu   gpu cpu | canvas done  gpu done | speedup(done) | GPU/compat layers');
    const rows = [];
    for (const w of [...synthetic, ...presets.map(p => ({ name: 'preset ' + p, preset: p }))]) {
      if (w.preset) await deterministic(s.page, await s.page.evaluate(p => builtinPresets[p], w.preset)); else await scene(s.page, w);
      const c = await measure(s.page, 'canvas'), g = await measure(s.page, 'gpu');
      const sp = q(c.total, .5) / q(g.total, .5);
      rows.push({ w: w.name, sp });
      console.log(w.name.padEnd(36) + `${f(q(c.cpu, .5))}/${f(q(c.cpu, .9))} ${f(q(g.cpu, .5))}/${f(q(g.cpu, .9))} | ${f(q(c.total, .5))} ${f(q(g.total, .5))} | ${sp.toFixed(2)}x | ${g.gpu}/${g.compat} ${JSON.stringify(g.reasons)}`);
      if (process.env.AG_DETAIL) console.log(`   gpu record ${g.rec.toFixed(2)} render ${g.ren.toFixed(2)} (blit ${g.blit.toFixed(2)})`);
    }
    console.log('\nPlayback (animLoop, real audio clock) — per-frame JS cost and rAF cadence:');
    for (const p of ['cell', 'zodiac']) {
      await deterministic(s.page, await s.page.evaluate(p => builtinPresets[p], p));
      for (const mode of ['canvas', 'gpu']) {
        const r = await playback(s.page, mode);
        console.log(`preset ${p} ${mode.padEnd(6)} frames ${String(r.durs.length).padStart(4)} animLoop ${f(q(r.durs, .5))}/${f(q(r.durs, .9))}  interval ${f(q(r.gaps, .5))}/${f(q(r.gaps, .9))}`);
      }
    }
    if (s.errors.length) throw new Error('page errors: ' + s.errors.join('; '));
  } finally { await s.close(); }
})().catch(e => { console.error(e); process.exit(1); });
