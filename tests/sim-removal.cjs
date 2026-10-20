process.env.AUDIOGRAPH_GPU_BUILD = process.env.AUDIOGRAPH_REMOVAL_BUILD || 'index.html';
process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||= '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const assert = require('node:assert/strict');
const { open } = require('./gpu-common.cjs');
const retired = ['simrd', 'simslime'];

(async () => {
  const t = await open({ viewport: { width: 1280, height: 900 } });
  const { page, errors } = t;
  try {
    const ui = await page.evaluate(() => ({
      buttons: [...document.querySelectorAll('#simulationLayouts button')].map(b => b.textContent),
      registered: AG_SIM_LAYOUTS,
      panels: ['simrd', 'simslime'].map(k => !!document.getElementById('layoutOpts_' + k)),
      data: ['simrd', 'simslime'].map(k => [!!AG_SIM_UI[k], !!AG_SIM_OPTS[k], !!AG_SIM_PRESETS[k], !!AG_SIM_TITLE[k]]),
      guide: document.getElementById('g-layout').textContent,
    }));
    assert.deepEqual(ui.buttons, ['Particles', 'Fluid', 'Smoke', 'Boids', 'Granular Sand', 'Ferrofluid', '3D Cloner']);
    assert.ok(retired.every(k => !ui.registered.includes(k)));
    assert.deepEqual(ui.panels, [false, false]);
    assert.deepEqual(ui.data, [[false, false, false, false], [false, false, false, false]]);
    assert.match(ui.guide, /Particles, Fluid, Smoke/);
    assert.doesNotMatch(ui.guide, /Physarum|Gray.Scott|Reaction|Slime/);
    const makeState = () => page.evaluate(() => ({
      stackLayouts: [
        { layout: 'simrd', opacity: 65, params: Object.assign(getDefaultLayerParams(), { _solidColor: '#123456' }) },
        { layout: 'simfluid', opacity: 80, params: Object.assign(getDefaultLayerParams(), { pSfForce: 37 }) },
        { layout: 'simslime', opacity: 45, params: Object.assign(getDefaultLayerParams(), { _offX: 12 }) },
      ],
      activeLayerIdx: 2,
    }));
    const legacy = await makeState();
    const migrated = await page.evaluate(st => {
      window.__retiredNotices = [];
      window.__originalToast = _toast;
      _toast = message => { __retiredNotices.push(message); __originalToast(message); };
      applyState(st);
      const state = JSON.parse(JSON.stringify(getState()));
      return { state, layout: layoutMode, notices: __retiredNotices, panel: document.getElementById('layoutOpts_simparticles').style.display };
    }, legacy);
    assert.deepEqual(migrated.state.stackLayouts.map(l => l.layout), ['simparticles', 'simfluid', 'simparticles']);
    assert.deepEqual(migrated.state.stackLayouts.map(l => l.opacity), [65, 80, 45]);
    assert.equal(migrated.state.stackLayouts[0].params._solidColor, '#123456');
    assert.equal(migrated.state.stackLayouts[1].params.pSfForce, 37);
    assert.equal(migrated.state.stackLayouts[2].params._offX, 12);
    assert.equal(migrated.layout, 'simparticles'); assert.equal(migrated.panel, 'flex');
    assert.equal(migrated.notices.length, 1); assert.match(migrated.notices[0], /removed.*Particles/);
    for (const old of retired) {
      const state = await page.evaluate(old => {
        applyState({ layoutMode: old }); return getState();
      }, old);
      assert.equal(state.stackLayouts[0].layout, 'simparticles', 'old single-layout save');
      await page.evaluate(old => { setLayout(old); }, old);
      assert.equal(await page.evaluate(() => layoutMode), 'simparticles', 'direct legacy layout selection');
      await page.evaluate(old => {
        applyPresetToLayer({ stackLayouts: [{ layout: old, opacity: 50, params: getDefaultLayerParams() }] });
      }, old);
      assert.equal(await page.evaluate(() => stackLayouts[getActiveLayerIdx()].layout), 'simparticles', 'layer preset migration');
    }
    const morph = await page.evaluate(st => {
      const before = JSON.stringify(st), normalized = pmNormalize(st);
      const other = pmNormalize({ stackLayouts: [{ layout: 'simsmoke', opacity: 100, params: getDefaultLayerParams() }] });
      return {
        layouts: normalized.layers.map(l => l.layout),
        originalUnchanged: before === JSON.stringify(st),
        blended: pmBlendNorm(normalized, other, 0.5).map(l => l.layout),
      };
    }, legacy);
    assert.deepEqual(morph.layouts, ['simparticles', 'simfluid', 'simparticles']);
    assert.ok(morph.originalUnchanged);
    assert.ok(morph.blended.every(k => !retired.includes(k)));
    console.log('ok picker, controls, presets, legacy saves, layer imports and morph migration');

    const generated = await page.evaluate(() => {
      const result = [];
      agAuto.setMatch(100);
      for (const prompt of ['', 'slime mould physarum mycelium', 'reaction diffusion turing labyrinth', 'particles', 'fluid', 'smoke']) {
        agAuto.setVibe(prompt);
        const vibe = agAuto.vibe(), parsed = vibe ? vibe.layouts.slice() : [];
        const specs = Array.from({ length: 150 }, (_, i) => agAuto.spec(['calm', 'groove', 'build', 'drop', 'phrase'][i % 5]).layout);
        result.push({ prompt, parsed, specs });
      }
      agAuto.setVibe(''); return result;
    });
    for (const r of generated) {
      assert.ok(r.parsed.every(k => !retired.includes(k)), 'removed prompt mapping: ' + r.prompt);
      assert.ok(r.specs.every(k => !retired.includes(k)), 'removed random pick: ' + r.prompt);
    }
    assert.ok(generated[0].specs.some(k => ['simparticles', 'simfluid', 'simsmoke'].includes(k)), 'Autopilot still offers current simulations');
    console.log('ok Autopilot prompt recognition and random simulation selection');

    await page.evaluate(st => { applyState(st); }, legacy);
    assert.equal(await page.evaluate(() => agSim.ready()), 'ready');
    await page.evaluate(() => {
      agSim.inject({ spec: 0.7, onset: 0 }); agSim.advance(60); renderDensity();
    });
    const gpu = await page.evaluate(() => {
      const stats = agSim.stats(), kinds = Object.values(stats.layers).map(l => l.kind);
      return { kinds, errors: stats.errors, layouts: getState().stackLayouts.map(l => l.layout) };
    });
    assert.ok(gpu.kinds.includes('particles') && gpu.kinds.includes('fluid'));
    assert.ok(gpu.kinds.every(k => k !== 'rd' && k !== 'slime'));
    assert.deepEqual(gpu.errors, []);
    assert.deepEqual(errors, []);
    console.log('ALL PASS: Reaction and Slime removed; migrated layers render on native WebGPU');
  } finally { await t.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
