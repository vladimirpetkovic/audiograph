// v44: Spin direction (Left/Right per layer), Playback lives in Audio EQ, and Dynamics keeps loud tracks from looking clipped.
process.env.AUDIOGRAPH_PARTICLE_BUILD = process.env.AUDIOGRAPH_DYN_BUILD || 'versions/audiograph_44.html';
process.env.AUDIOGRAPH_BUILD_31 = process.env.AUDIOGRAPH_PARTICLE_BUILD;
const fs = require('node:fs');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && fs.existsSync(chrome)) process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = chrome;
const assert = require('node:assert/strict');
const { open, wav, sine, load } = require('./audio-common.cjs');

(async () => {
  const t = await open({ viewport: { width: 1280, height: 800 } });
  const { page, errors } = t;
  try {
    // Loud, nearly flat track: amplitude only wobbles 0.75..0.95, like a mastered song.
    const loud = wav([[12, s => (0.85 + 0.1 * Math.sin(2 * Math.PI * 0.7 * s)) * Math.sin(2 * Math.PI * 110 * s) * (0.92 + 0.08 * Math.sin(2 * Math.PI * 9 * s))]], 'loud.wav');
    await load(page, { name: loud.name, mimeType: loud.mimeType, buffer: loud.buffer });

    // Playback row moved into Audio EQ (above Dynamics), and no longer in Deformers.
    const ui = await page.evaluate(() => ({
      inEq: !!document.querySelector('#panelEQ #rowPlayback [onclick*="setPlayMode(\'equalizer\'"]'),
      inFx: !!document.querySelector('#fxBody [onclick*="setPlayMode("]'),
      order: [...document.querySelectorAll('#panelEQ .prow')].slice(0, 3).map(r => r.querySelector('.prow-label').textContent),
    }));
    assert.deepEqual(ui, { inEq: true, inFx: false, order: ['Playback', 'Dynamics', 'Preset'] });

    // Dynamics spreads the line values of a loud track; 0 reproduces the previous response.
    const spread = await page.evaluate(() => {
      const q = (a, k) => { a = a.slice().sort((x, y) => x - y); return a[Math.floor(k * (a.length - 1))]; };
      const at = d => { setDynamics(d); const v = getRangeRMS(2, 8); return { p10: q(v, 0.1), p50: q(v, 0.5), max: Math.max(...v) }; };
      const r = { off: at(0), on: at(50) }; setDynamics(50); return r;
    });
    assert.ok(spread.off.p50 > 0.8, 'loud track is flat without Dynamics: ' + JSON.stringify(spread));
    assert.ok(spread.on.p50 < spread.off.p50 - 0.07 && spread.on.p10 < spread.off.p10 - 0.1 && spread.on.max > 0.99, 'Dynamics spreads values, peaks still reach 1: ' + JSON.stringify(spread));

    // Dynamics is saved in state, restored, and Reset returns it to 50%.
    const st = await page.evaluate(() => { setDynamics(80); const s = getState(); setDynamics(10); applyState(s); const a = getDynamics(); resetAll(); return { saved: s.dynamics, restored: a, reset: getDynamics(), label: document.getElementById('vDynamics').textContent }; });
    assert.deepEqual(st, { saved: 80, restored: 80, reset: 50, label: '50%' });

    // Spin direction: Right turns clockwise (angle grows), Left counter-clockwise; it is per layer.
    const spin = await page.evaluate(async () => {
      setLayout('circle', null); const s = document.getElementById('pSpin'); s.value = 3; upP();
      const run = async () => { const i = getActiveLayerIdx(), a0 = layerSpinAngle[i] || 0; if (!playing) togglePlay(); await new Promise(r => setTimeout(r, 700)); if (playing) togglePlay(); return (layerSpinAngle[i] || 0) - a0; };
      setSpinDir(1, document.querySelector('#rowSpinDir [onclick^="setSpinDir(1"]')); const right = await run();
      setSpinDir(-1, document.querySelector('#rowSpinDir [onclick^="setSpinDir(-1"]')); const left = await run();
      const on = [...document.querySelectorAll('#rowSpinDir .mbtn.on')].map(b => b.textContent);
      const saved = getLayoutParams()._spinDir; undo(); const undone = spinDir;
      return { right, left, on, saved, undone };
    });
    assert.ok(spin.right > 0.01 && spin.left < -0.01, 'Right/Left spin in opposite directions: ' + JSON.stringify(spin));
    assert.deepEqual([spin.on, spin.saved, spin.undone], [['↺ Left'], -1, 1]);
    assert.deepEqual(errors, []);
    console.log('audio-dyn: PASS ' + JSON.stringify({ spread, spin: { right: +spin.right.toFixed(3), left: +spin.left.toFixed(3) } }));
  } finally { await t.close(); }
})().catch(e => { console.error(e); process.exit(1); });
