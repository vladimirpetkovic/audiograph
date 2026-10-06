// v32 knob UI perf check: plays the built-in "flares" preset with the Appearance/Geometry/Deformers/
// Particles/Post FX panels open (knobs visible) plus two reactive rules and the mixer animating knob
// values every frame. Reports animLoop JS ms, knob-sync ms per frame and rAF cadence.
// Usage: AUDIOGRAPH_KNOB_BUILD=versions/audiograph_32.html node knobs-bench.cjs
process.env.AUDIOGRAPH_GPU_BUILD = process.env.AUDIOGRAPH_KNOB_BUILD || 'versions/audiograph_32.html';
const fs = require('node:fs');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && fs.existsSync(chrome)) process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = chrome;
const { open } = require('./gpu-common.cjs');
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))] || 0; };
const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
(async () => {
  const t = await open({ viewport: { width: 1440, height: 900 } });
  try {
    const runs = [];
    for (let i = 0; i < 3; i++) runs.push(await t.page.evaluate(async () => {
      applyState(JSON.parse(JSON.stringify(builtinPresets.flares)));
      document.querySelectorAll('.panel').forEach(p => { if (!/Mapping/.test(p.id)) p.classList.remove('closed'); });
      if (reactiveRules.length < 2) { addReactiveRule(); addReactiveRule(); reactiveRules[0].target = 'twist'; reactiveRules[1].target = 'zoom'; captureReactiveBases(); }
      const orig = animLoop, durs = [], stamps = [];
      window.animLoop = function () { const t = performance.now(); orig(); if (playing) { durs.push(performance.now() - t); stamps.push(t); } };
      const k = window.agKnobs, k0 = k ? k.stats().flushMs : 0, n0 = k ? k.stats().flushes : 0, r0 = k ? k.stats().renders : 0;
      safeSetTime(1); if (!playing) togglePlay();
      await new Promise(r => setTimeout(r, 4000));
      if (playing) togglePlay(); window.animLoop = orig;
      const gaps = stamps.slice(1).map((t, i) => t - stamps[i]);
      const ks = k ? k.stats() : null;
      return { durs: durs.slice(10), gaps: gaps.slice(10), knobMs: ks ? (ks.flushMs - k0) / Math.max(1, stamps.length) : null, knobRenders: ks ? (ks.renders - r0) / Math.max(1, stamps.length) : null, knobs: k ? document.querySelectorAll('.knob').length : 0 };
    }));
    const d = runs.flatMap(r => r.durs), g = runs.flatMap(r => r.gaps);
    console.log(`build ${process.env.AUDIOGRAPH_GPU_BUILD}: knobs=${runs[0].knobs} frames=${d.length}`);
    console.log(`animLoop ms mean ${mean(d).toFixed(2)} p50 ${q(d, .5).toFixed(2)} p95 ${q(d, .95).toFixed(2)} | rAF gap mean ${mean(g).toFixed(2)} p95 ${q(g, .95).toFixed(2)}`);
    if (runs[0].knobMs != null) console.log(`knob sync ms/frame ${mean(runs.map(r => r.knobMs)).toFixed(3)} renders/frame ${mean(runs.map(r => r.knobRenders)).toFixed(2)}`);
    if (t.errors.length) console.log('page errors', t.errors);
  } finally { await t.close(); }
})();
