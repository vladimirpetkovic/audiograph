// v31 Reset regression: snapshot every artistic/audio-reactive/mixer control, button state and engine
// state on a fresh load, change all of it through the real UI handlers (post-FX with trails/feedback,
// reactive rules, mixer drift + drop, drop detector, EQ, bass, particles, layers, beat morph running),
// press Reset and require the fresh snapshot back. Mapping/output/resolution/renderer/particle backend
// and the morph playlist are installation/library state and must survive. Undo restores the pre-reset look.
const assert = require('node:assert/strict');
const { open } = require('./audio-common.cjs');
const SNAP = () => {
  const keep = el => !el.closest('#panelExport,#panelPresets,#mapPanel,#projectionPanel') && !/^(map|out|proj|fileInput|presetImport|morphAdd|rendererBackend|particleBackend|outputResolution|camDevice)/.test(el.id || '');
  const ui = {};
  document.querySelectorAll('input,select').forEach((el, i) => { if (!el.id || !keep(el) || el.type === 'file') return; ui[el.id] = el.type === 'checkbox' ? el.checked : el.value; });
  document.querySelectorAll('.prow-val[id]').forEach(el => { if (keep(el)) ui['#' + el.id] = el.textContent; });
  const btn = [];
  document.querySelectorAll('.mbtn').forEach((b, i) => { if (keep(b) && !b.closest('#morphList,#presetList,#layerList')) btn.push((b.getAttribute('onclick') || b.id || b.textContent).slice(0, 70) + '#' + i + '=' + b.classList.contains('on')); });
  const disp = {}; ['mixerParams', 'dropParams', 'particleParams', 'outlineParams', 'postFxCv'].forEach(id => { const e = document.getElementById(id); if (e) disp[id] = getComputedStyle(e).display; });
  const g = {
    postFxEnabled, trailCv: !!trailCv, rules: reactiveRules.length, bases: Object.keys(reactiveBaseValues).length, hue: _reactiveHueOffset,
    mixerEnabled, mixerDrop, mixerCats, mixerHue: _mixerHueShift, mixerDropDecay, mixerHome: Object.keys(mixerHome).length,
    dropEnabled, dropIntensity, dropSwitches, dropDecay, zoomLoud, particlesOn, particleShape, playMode, layoutMode, colorMode, canvasBg, solidColor, toneStops, simpleStops,
    particles: Object.keys(particleLayers).reduce((a, k) => a + particleLayers[k].length, 0) + (agParticles.stats().alive || 0),
    layers: stackLayouts.length, layer0: stackLayouts[0] && JSON.stringify(stackLayouts[0].params), activeLayerIdx,
    pmAuto, pmBeatSync, pmBeatMode, pmActive, pmRandom, bass: agAudio.get(), eqGains: eqGains.slice(), smoothingMatchesSlider: !analyser || globalThis.__fresh || Math.abs(analyser.smoothingTimeConstant - document.getElementById('eqSmoothing').value / 100) < 1e-6,
    flipH, flipV, mirrorOn, symmetryMode, varyHeight, varyThick, showOutline, outlineStyle, lineShape, spinAngle,
  };
  return { ui, btn, disp, g };
};
const INSTALL = () => ({ renderer: agGpu.getMode ? agGpu.getMode() : null, particles: agParticles.getMode(), res: typeof outputResolution !== 'undefined' ? outputResolution : null,
  morphSet: morphSet.slice(), map: localStorage.getItem('audiograph_map_profiles') });
function diff(a, b, path = '') {
  const out = [];
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) { if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`${path}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`); return out; }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]); for (const k of keys) out.push(...diff(a[k], b[k], path ? path + '.' + k : k)); return out;
}
(async () => {
  const t = await open({ viewport: { width: 1200, height: 800 } });
  const { page, errors } = t;
  try {
    await page.evaluate(() => { globalFrame++; renderDensity(); globalThis.__fresh = true; });
    const fresh = await page.evaluate(SNAP);
    await page.evaluate(() => { globalThis.__fresh = false; });
    const inst0 = await page.evaluate(() => { agParticles.setMode('cpu'); agGpu.setMode('canvas'); morphSet = Object.keys(getAllPresets()).slice(0, 3); return 0; });
    const installBefore = await page.evaluate(INSTALL);
    // Change everything through the real handlers.
    await page.evaluate(async () => {
      const click = (sel, text) => { const b = [...document.querySelectorAll(sel + ' .mbtn')].find(x => x.textContent.trim() === text); if (!b) throw new Error('no button ' + sel + ' ' + text); b.click(); };
      document.querySelectorAll('.panel input[type=range], #pIntensity').forEach(el => {
        if (/^(morphSlider|morphDur)$/.test(el.id) || el.closest('#panelExport,#panelPresets')) return;
        const lo = +el.min, hi = +el.max; el.value = String(lo + (hi - lo) * 0.83); el.dispatchEvent(new Event('input', { bubbles: true }));
      });
      document.getElementById('morphDur').value = 47;
      // v32+: Post FX is per layer; also set layer FX, then edit the legacy whole-composition FX like v31 did.
      if (typeof setPfxTarget === 'function') { setPostFx(true); document.getElementById('pfxBloom').value = 30; upPostFx(); setPfxTarget('comp'); }
      setPostFx(true); document.getElementById('pfxTrails').value = 70; document.getElementById('pfxFeedback').value = 40; upPostFx();
      addReactiveRule(); addReactiveRule(); reactiveRules[1].target = 'zoom';
      click('#panelMixer', 'On'); mixerDrop = true; mixerCats.colors = false;
      const drop = [...document.querySelectorAll('#fxBody .mbtn')].find(b => (b.getAttribute('onclick') || '').includes('setDrop(true')); drop.click();
      setDropSwitch('layout', [...document.querySelectorAll('#dropParams .mbtn')].find(b => (b.getAttribute('onclick') || '').includes("'layout'")));
      [...document.querySelectorAll('.mbtn')].find(b => (b.getAttribute('onclick') || '').includes('setZoomLoud(true')).click();
      setLayout('circle', null); document.querySelector('[onclick="toggleParticles(true,this)"]').click(); document.querySelector('[onclick^="setParticleShape(\'star\'"]').click();
      addLayer(); setBg('#223344'); colorMode = 'solid';
      agAudio.set({ punch: 5, release: 700 }); setMorphBeatMode('snap');
      for (const id of ['eqLow', 'eqMid', 'eqHigh']) { const e = document.getElementById(id); if (e) { e.value = 20; } } updateEQ && updateEQ();
      togglePlay(); toggleMorphBeat();
      await new Promise(r => setTimeout(r, 1500));
    });
    const changed = await page.evaluate(SNAP);
    const nChanged = diff(fresh, changed).length;
    const pre = await page.evaluate(() => JSON.stringify(getState()));
    await page.evaluate(() => { [...document.querySelectorAll('.top-actions .btn')].find(b => b.textContent.trim() === 'Reset').click(); });
    await page.waitForTimeout(400);
    // Keep playing for a second: no morph, mixer, reactive rule or drop may keep driving the defaults.
    await page.evaluate(async () => { if (!playing) togglePlay(); await new Promise(r => setTimeout(r, 1000)); if (playing) togglePlay(); globalFrame++; renderDensity(); });
    const reset = await page.evaluate(SNAP);
    const d = diff(fresh, reset);
    console.log(`changed ${nChanged} snapshot entries; after Reset ${d.length} differ from fresh load`);
    d.slice(0, 80).forEach(x => console.log('  ' + x));
    const installAfter = await page.evaluate(INSTALL);
    assert.deepEqual(installAfter, installBefore, 'installation state survives Reset');
    assert.ok(nChanged > 100, 'mutation covered the controls');
    assert.deepEqual(d, [], 'Reset returns every artistic control and engine state to fresh defaults');
    // Undo restores the pre-reset look, including reactive rules and mixer/drop setup.
    const u = await page.evaluate(() => { const top = JSON.parse(undoStack[undoStack.length - 1]); delete top._resetExtra; undo(); const st = getState(); const a = JSON.stringify(st), b = JSON.stringify(top); let i = 0; while (i < a.length && a[i] === b[i]) i++; return { same: a === b, at: a === b ? null : [a.slice(i - 60, i + 60), b.slice(i - 60, i + 60)], rules: reactiveRules.length, mixerEnabled, dropEnabled, postFxEnabled, bass: agAudio.get() }; });
    console.log('undo after reset: ' + JSON.stringify(u));
    const back = await page.evaluate(SNAP);
    const ids = ['pfxTrails', 'pfxFeedback', 'pfxBloom', 'mixSpeed', 'mixAmount', 'mixPunch', 'pDropSens', 'morphBeatMode', 'morphDur', 'pIntensity', 'eq32', 'pBassPunch', 'camDisplace'];
    assert.deepEqual(ids.map(i => back.ui[i]), ids.map(i => changed.ui[i]), 'undo restores controls outside getState');
    assert.deepEqual([back.disp.mixerParams, back.disp.dropParams, back.disp.postFxCv], [changed.disp.mixerParams, changed.disp.dropParams, changed.disp.postFxCv]);
    assert.ok(u.same && u.rules === 2 && u.mixerEnabled && u.dropEnabled && u.postFxEnabled && u.bass.punch === 5, 'undo restores pre-reset state');
    assert.deepEqual(errors, []);
    console.log('reset-all: PASS');
  } finally { await t.close(); }
})().catch(e => { console.error(e); process.exit(1); });
