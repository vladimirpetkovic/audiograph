// v94: per-knob auto mode and automatic colour shifting.
process.env.AUDIOGRAPH_GPU_BUILD = process.env.AUDIOGRAPH_AUTO_BUILD || 'versions/audiograph_112.html';
const assert = require('node:assert/strict');
const { open } = require('./gpu-common.cjs');
(async () => {
  const t = await open({ viewport: { width: 1600, height: 1000 } }), page = t.page;
  try {
    // knobs get an A button where it makes sense, and not on audio-plumbing knobs
    const info = await page.evaluate(() => { setLayout('spiral'); return { has: !!document.getElementById('pZoom')._knob.autoBtn, excl: !document.getElementById('eq64')._knob || !document.getElementById('eq64')._knob.autoBtn, n: document.querySelectorAll('.knob-auto').length }; });
    assert.ok(info.has && info.excl && info.n > 20, JSON.stringify(info)); console.log('  ok  A buttons present, excluded on EQ/plumbing knobs', info.n);

    // auto moves a knob, stops when switched off, and re-centres after a manual change
    const run = await page.evaluate(async () => {
      const inp = document.getElementById('pZoom'), k = inp._knob, sleep = ms => new Promise(r => setTimeout(r, ms));
      agKnobAuto.setSpeed(400); const v0 = +inp.value; k.autoBtn.click(); const seen = new Set();
      for (let i = 0; i < 40; i++) { await sleep(100); seen.add(+inp.value); }
      const on = agKnobAuto.isOn(inp), moved = seen.size, lab = document.getElementById('vZoom') ? document.getElementById('vZoom').textContent : null;
      k.autoBtn.click(); const stopV = +inp.value; await sleep(400); const still = +inp.value === stopV;
      return { v0, on, moved, still, off: !agKnobAuto.isOn(inp), min: Math.min(...seen), max: Math.max(...seen), lab };
    });
    assert.ok(run.on && run.moved > 5 && run.still && run.off, JSON.stringify(run)); console.log('  ok  knob auto drifts and stops', JSON.stringify(run));

    // auto works on simulation knobs too and Stop all clears everything
    const sim = await page.evaluate(async () => {
      setLayout('simfluid'); await agSim.ready(); const sleep = ms => new Promise(r => setTimeout(r, ms));
      const a = document.getElementById('pSfVort'), b = document.getElementById('pSfSwirl'); agKnobAuto.toggle(a, true); agKnobAuto.toggle(b, true);
      const n = agKnobAuto.count(); agKnobAuto.setSpeed(400); const s0 = +a.value; let ch = 0; for (let i = 0; i < 30; i++) { await sleep(100); if (+a.value !== s0) ch++; }
      agKnobAuto.stopAll(); return { n, ch, left: agKnobAuto.count(), btnOn: document.querySelectorAll('.knob-auto.on').length };
    });
    assert.ok(sim.n === 2 && sim.ch > 3 && sim.left === 0 && sim.btnOn === 0, JSON.stringify(sim)); console.log('  ok  simulation knobs drift; Stop all clears', JSON.stringify(sim));

    // auto colour shift changes the colours of a simulation ramp and a normal layout, and Off restores them
    const col = await page.evaluate(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms)), px = () => { renderDensity(); const d = frameCtx.getImageData(0, 0, frameCv.width, frameCv.height).data; let r = 0, g = 0, b = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 61) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } return [r / n, g / n, b / n]; };
      const out = {};
      for (const m of ['simparticles', 'linear']) {
        setLayout(m); await sleep(300); if (m.startsWith('sim')) { await agSim.ready(); for (let i = 0; i < 60; i++) { agSim.inject({ spec: 0.5, onset: 0 }); agSim.advance(1); } }
        const a = px(); const on = document.querySelector('#panelColor .mbtn[onclick*="setHue(true"]'), off = document.querySelector('#panelColor .mbtn[onclick*="setHue(false"]');
        document.getElementById('pAutoHueSpeed').value = 120; agKnobAuto.setHueSpeed(120); on.click(); await sleep(1500); const hue = _autoHue; if (m.startsWith('sim')) { for (let i = 0; i < 20; i++) { agSim.inject({ spec: 0.5, onset: 0 }); agSim.advance(1); } } const b = px();
        off.click(); await sleep(100); const z = _autoHue; if (m.startsWith('sim')) { agSim.reset(); for (let i = 0; i < 60; i++) { agSim.inject({ spec: 0.5, onset: 0 }); agSim.advance(1); } } px();
        out[m] = { hue: Math.round(hue), diff: Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]), resetHue: z };
      }
      return out;
    });
    for (const m of Object.keys(col)) assert.ok(col[m].hue > 20 && col[m].resetHue === 0, m + ' hue advances then resets ' + JSON.stringify(col[m]));
    assert.ok(col.simparticles.diff > 1, 'simulation colours shift: ' + JSON.stringify(col));
    console.log('  ok  auto colour shift advances hue, recolours simulations, resets on Off', JSON.stringify(col));
    // v98: the Outline switch must stay visible after a stack with a simulation layer is rendered
    const ol = await page.evaluate(async () => {
      const e = document.getElementById('rowOutline'), r = [];
      setLayout('circle'); addLayer(); setLayout('simfluid'); selectLayer(0); await new Promise(x => setTimeout(x, 300));
      r.push(layoutMode, e.classList.contains('ag-na'), e.offsetHeight);
      selectLayer(1); selectLayer(0); await new Promise(x => setTimeout(x, 300)); r.push(e.classList.contains('ag-na'), e.offsetHeight);
      return r;
    });
    assert.ok(ol[0] === 'circle' && ol[1] === false && ol[2] > 0 && ol[3] === false && ol[4] > 0, 'outline row visible: ' + ol.join());
    console.log('  ok  Outline switch stays visible with a simulation layer in the stack');
    // v99: pressing the knob centre must still turn the knob; a click (no movement) toggles auto
    await page.evaluate(() => { setLayout('simfluid'); document.getElementById('pSimEnergy')._knob.el.scrollIntoView({ block: 'center' }); });
    const c = await page.evaluate(() => { const k = document.getElementById('pSimEnergy')._knob, r = k.el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, v: +document.getElementById('pSimEnergy').value }; });
    await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.move(c.x + 20, c.y - 25, { steps: 6 }); await page.mouse.move(c.x + 30, c.y, { steps: 6 }); await page.mouse.up();
    const turned = await page.evaluate(() => ({ v: +document.getElementById('pSimEnergy').value, on: agKnobAuto.isOn(document.getElementById('pSimEnergy')) }));
    assert.ok(turned.v !== c.v && !turned.on, 'drag from centre turns knob: ' + JSON.stringify(turned));
    await page.mouse.click(c.x, c.y); const on1 = await page.evaluate(() => agKnobAuto.isOn(document.getElementById('pSimEnergy')));
    await page.mouse.click(c.x, c.y); const on2 = await page.evaluate(() => agKnobAuto.isOn(document.getElementById('pSimEnergy')));
    assert.ok(on1 && !on2, 'centre click toggles auto: ' + on1 + on2);
    console.log('  ok  centre of the knob still turns it; a click toggles auto');
    // v100: knobs in the Sound & quality box keep working in a layer stack (the box must not be re-parented every frame)
    const stk = await page.evaluate(async () => {
      setLayout('circle'); addLayer(); setLayout('simfluid'); await new Promise(x => setTimeout(x, 400));
      const box = document.getElementById('simCommonBox'); let moves = 0; const host0 = box.parentNode;
      const mo = new MutationObserver(m => { moves += m.filter(r => [...r.addedNodes].includes(box)).length }); document.querySelectorAll('.layout-opts').forEach(h => mo.observe(h, { childList: true }));
      for (let i = 0; i < 20; i++) { renderDensity(); await new Promise(x => setTimeout(x, 30)) }
      mo.disconnect(); return { moves, same: box.parentNode === host0 };
    });
    assert.ok(stk.moves === 0 && stk.same, 'sim common box not re-parented in stack: ' + JSON.stringify(stk));
    console.log('  ok  Sound & quality box stays put during stacked rendering');
    // v101: Save always stores the whole composition and loading it restores every layer
    const sv = await page.evaluate(async () => {
      window.prompt = () => 'p101'; localStorage.removeItem('audiograph_presets');
      while (stackLayouts.length > 1) removeLayer(stackLayouts.length - 1);
      setLayout('circle'); addLayer(); setLayout('simfluid'); addLayer(); setLayout('spiral'); savePreset();
      const saved = JSON.parse(localStorage.getItem('audiograph_presets')).p101;
      removeLayer(2); removeLayer(1); await new Promise(x => setTimeout(x, 200));
      [...document.querySelectorAll('#presetList button')].find(b => b.textContent.includes('p101')).click(); await new Promise(x => setTimeout(x, 400));
      const back = stackLayouts.map(l => l.layout).join();
      const one = (setLayout('linear'), savePreset(), JSON.parse(localStorage.getItem('audiograph_presets')).p101._saveAll);
      localStorage.removeItem('audiograph_presets');
      return { n: saved.stackLayouts.length, all: saved._saveAll, back, one };
    });
    assert.ok(sv.n === 3 && sv.all && sv.back === 'circle,simfluid,spiral' && sv.one === true, 'preset save/load all layers: ' + JSON.stringify(sv));
    console.log('  ok  Save stores and restores all layers');
    // v104: Autopilot overrides auto colour shift, understands named colours and can build (at most one) simulation
    const ap = await page.evaluate(async () => {
      agKnobAuto.setHue(true); agAuto.setChanges('everything'); agAuto.setLayers('3'); agAuto.setVibe('red and gold fluid');
      agAuto.start(); const hueOff = !agKnobAuto.hueOn();
      agAuto._reset(); agAuto.change('groove', 0.3); await new Promise(x => setTimeout(x, 1500));
      const L = getState().stackLayouts, sims = L.filter(l => l.layout.startsWith('sim'));
      const stops = (L[0].params._toneStops || []).join(); agAuto.stop();
      return { hueOff, kinds: L.map(l => l.layout), sims: sims.length, low: sims.every(l => l.params._sim.q === 'low'), stops };
    });
    assert.ok(ap.hueOff && ap.sims === 1 && ap.low && /#ffc933/.test(ap.stops) && /#ff2e3b/.test(ap.stops), 'autopilot sims/colours: ' + JSON.stringify(ap));
    console.log('  ok  Autopilot releases auto colour shift, builds one light simulation and honours named colours');
    // v104: Rotation redraws rectangular sources on a covering canvas instead of turning the finished picture
    const rot = await page.evaluate(async () => {
      const a = agRotPlan('linear', Math.PI / 4, 1600, 900), b = agRotPlan('image', Math.PI / 4, 1600, 900), c = agRotPlan('linear', 0, 1600, 900), d = agRotPlan('circle', 1, 1600, 900);
      while (stackLayouts.length > 1) removeLayer(stackLayouts.length - 1);
      setLayout('linear'); document.getElementById('pRotation').value = 40; upP(); await new Promise(x => setTimeout(x, 600)); renderDensity();
      document.getElementById('pRotation').value = 0; upP();
      return { aw: Math.round(a.W), ah: Math.round(a.H), an: +a.n.toFixed(2), bk: +b.k.toFixed(2), c: c.W === 1600 && c.k === 1, d: d.W === 1600 && d.k === 1 };
    });
    assert.ok(rot.aw === 1768 && rot.ah === 1768 && rot.an >= 1.1 && rot.bk > 1.4 && rot.c && rot.d, 'rotation cover plan: ' + JSON.stringify(rot));
    console.log('  ok  Rotation covers the frame (source redrawn / scaled, not just the canvas turned)');
    assert.deepEqual(t.errors, [], 'no page errors: ' + t.errors.join(';'));
    console.log('PASS auto.cjs');
  } finally { await t.close(); }
})().catch(e => { console.error('FAIL', e); process.exit(1); });
