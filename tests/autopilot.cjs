// v47/v48: Autopilot — section detection (build-up / drop / breakdown / phrase) drives crossfaded look changes.
process.env.AUDIOGRAPH_PARTICLE_BUILD = process.env.AUDIOGRAPH_AUTO_BUILD || 'versions/audiograph_51.html';
process.env.AUDIOGRAPH_BUILD_31 = process.env.AUDIOGRAPH_PARTICLE_BUILD;
const fs = require('node:fs'), path = require('node:path');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && fs.existsSync(chrome)) process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = chrome;
const assert = require('node:assert/strict');
const { open, wav, load, kicks, sine } = require('./audio-common.cjs');
const SHOTS = process.env.AUTOPILOT_SHOTS;

(async () => {
  const t = await open({ viewport: { width: 1280, height: 800 } });
  const { page, errors } = t;
  try {
    // UI (v48): AI Look hidden; one Automation panel with Autopilot / Mixer / Reactive tabs.
    const ui = await page.evaluate(() => {
      const vis = id => getComputedStyle(document.getElementById(id)).display !== 'none';
      const r = { ai: vis('panelAI'), title: document.querySelector('#panelAuto .panel-title').textContent, params: getComputedStyle(document.getElementById('apParams')).display, sec: document.getElementById('apSection').textContent, tabs: [...document.querySelectorAll('#autoTabs .mbtn')].map(b => b.textContent), oldPanels: document.querySelectorAll('.panel#panelMixer,.panel#panelReactive').length };
      r.first = [vis('autoSecPilot'), vis('panelMixer'), vis('panelReactive')];
      setAutoTab('mixer'); r.mixer = [vis('autoSecPilot'), vis('panelMixer'), vis('panelReactive')];
      setAutoTab('reactive'); r.reactive = [vis('autoSecPilot'), vis('panelMixer'), vis('panelReactive')];
      addReactiveRule(); syncAutoDots(); r.dot = document.querySelector('#autoTabs .mbtn[data-tab="reactive"]').classList.contains('live');
      clearReactiveRules(); syncAutoDots(); r.dotOff = document.querySelector('#autoTabs .mbtn[data-tab="reactive"]').classList.contains('live');
      setAutoTab('pilot');
      return r;
    });
    assert.deepEqual(ui, { ai: false, title: '🎛 Automation', params: 'none', sec: 'Off', tabs: ['Autopilot', 'Mixer', 'Reactive'], oldPanels: 0, first: [true, false, false], mixer: [false, true, false], reactive: [false, false, true], dot: true, dotOff: false });

    // Describe box: tempo, energy, palette, layouts and line styles steer the generated looks. Sine never appears; Linear never spins.
    const vibe = await page.evaluate(() => {
      agAuto.setVibe('slow dreamy 90 bpm, deep blue and gold, thin dotted lines, spirals and flowers');
      const v = agAuto.vibe(), read = document.getElementById('apVibeRead').textContent;
      const specs = Array.from({ length: 40 }, (_, i) => agAuto.spec(i % 2 ? 'drop' : 'calm'));
      agAuto.setVibe('');
      const free = Array.from({ length: 300 }, (_, i) => agAuto.spec(['calm', 'groove', 'build', 'drop', 'phrase'][i % 5]));
      return { tempo: v.tempo, bpm: v.bpm, read, layouts: [...new Set(specs.map(s => s.layout))].sort(), shapes: [...new Set(specs.map(s => s.shape))], thin: specs.every(s => s.thickness < 25), pal: specs.every(s => s.colors.slice().sort().join() === specs[0].colors.slice().sort().join()), maxE: Math.max(...specs.map(s => s.energy)), freeSine: free.filter(s => s.layout === 'sine').length, linearSpin: free.filter(s => s.layout === 'linear' && s.spin !== 0).length, linearN: free.filter(s => s.layout === 'linear').length, stored: localStorage.getItem('audiograph_ap_vibe') };
    });
    console.log('vibe', JSON.stringify(vibe));
    assert.equal(vibe.bpm, 90); assert.equal(vibe.tempo, 0.75);
    assert.match(vibe.read, /calm/); assert.match(vibe.read, /90 bpm/); assert.match(vibe.read, /spiral/);
    assert.deepEqual(vibe.layouts, ['phyllotaxis', 'spiral']); assert.deepEqual(vibe.shapes, ['dotted']); assert.ok(vibe.thin); assert.ok(vibe.pal, 'described palette kept');
    assert.ok(vibe.maxE < 60, 'calm vibe tames drops: ' + vibe.maxE);
    assert.equal(vibe.freeSine, 0, 'no Sine layout'); assert.equal(vibe.linearSpin, 0, 'Linear never spins');
    if (!/_4[78]\.html$/.test(process.env.AUDIOGRAPH_PARTICLE_BUILD)) assert.equal(vibe.linearN, 0, 'v49: Autopilot never generates Linear');
    assert.equal(vibe.stored, '');

    // 1. Section detector on synthetic energy (no audio loaded, so only our step() feeds it).
    const ev = await page.evaluate(async () => {
      localStorage.removeItem('audiograph_ap_changes'); agAuto.setChanges('mood'); agAuto.start();
      const run = (sec, fn) => { for (let i = 0; i < sec * 30; i++) agAuto.step(1 / 30, fn(i / 30)); };
      run(20, () => ({ energy: 0.12 + 0.03 * Math.random(), treble: 0.05 }));            // groove
      run(8, s => ({ energy: 0.12 + 0.05 * s, treble: 0.05 + 0.02 * s }));                // rising
      const mid = agAuto.state().section;
      run(14, () => ({ energy: 0.55 + 0.03 * Math.random(), treble: 0.2 }));               // drop
      const drop = agAuto.state().section;
      run(10, () => ({ energy: 0.06 + 0.02 * Math.random(), treble: 0.02 }));              // breakdown
      const calm = agAuto.state().section;
      const t0 = Date.now(); while ((agAuto.state().fading || agAuto.state().pending) && Date.now() - t0 < 30000) await new Promise(r => setTimeout(r, 200)); // let queued fades finish
      return { mid, drop, calm, kinds: agAuto.state().events.map(e => e.kind), fading: agAuto.state().fading, n: stackLayouts.length, opac: stackLayouts.map(l => l.opacity), pm: pmActive };
    });
    console.log('synthetic events', ev.kinds.join(' '));
    assert.equal(ev.drop, 'drop'); assert.equal(ev.calm, 'calm');
    assert.ok(ev.kinds.includes('drop') && ev.kinds.includes('calm'), 'drop and breakdown trigger changes');
    assert.ok(ev.kinds.indexOf('drop') < ev.kinds.lastIndexOf('calm'));
    assert.equal(ev.fading, false); assert.equal(ev.pm, false); assert.equal(ev.n, 1, 'mood keeps the user layer count'); assert.deepEqual(ev.opac, [100]);

    // v49: subtle steady spin, black background, spin left/right controls.
    if (await page.evaluate(() => !!document.getElementById('pSpinL'))) {
      const v49 = await page.evaluate(() => {
        const orig = getState();
        const specs = Array.from({ length: 200 }, (_, i) => agAuto.spec(['calm', 'groove', 'build', 'drop', 'phrase'][i % 5]));
        const r = { maxSpin: Math.max(...specs.map(x => x.spinAmt)), bgs: [...new Set(specs.map(x => x.background))], bg: canvasBg };
        const L = document.getElementById('pSpinL'), R = document.getElementById('pSpinR');
        L.value = 0.7; L.dispatchEvent(new Event('input', { bubbles: true })); r.left = [+pSpin.value, spinDir, +R.value, stackLayouts[activeLayerIdx].params._spinDir];
        R.value = 1.3; R.dispatchEvent(new Event('input', { bubbles: true })); r.right = [+pSpin.value, spinDir, +L.value];
        R.value = 0; R.dispatchEvent(new Event('input', { bubbles: true })); r.zero = [+pSpin.value, +L.value, +R.value];
        const st = getState(); st.stackLayouts[0].params._spin = 2; st.stackLayouts[0].params._spinDir = -1; applyState(st); r.load = [+L.value, +R.value];
        r.oldRow = getComputedStyle(document.getElementById('rowSpinDir')).display === 'none' || !document.getElementById('rowSpinDir').offsetParent;
        applyState(orig);
        return r;
      });
      console.log('v49', JSON.stringify(v49));
      assert.ok(v49.maxSpin <= 1.2, 'autopilot spin stays subtle');
      assert.deepEqual(v49.bgs, ['#000000']); assert.equal(v49.bg, '#000000', 'background stays black');
      assert.deepEqual(v49.left, [0.7, -1, 0, -1]); assert.deepEqual(v49.right, [1.3, 1, 0]); assert.deepEqual(v49.zero, [0, 0, 0]);
      assert.deepEqual(v49.load, [2, 0]); assert.ok(v49.oldRow, 'old direction toggle hidden');
    }

    // Mood changed palette + motion on the user's layer but kept its layout.
    const lay0 = await page.evaluate(() => layoutMode);
    assert.equal(lay0, 'linear', 'mood mode keeps layout');
    assert.equal(await page.evaluate(() => getState().stackLayouts[0].params._spin), await page.evaluate(() => getDefaultLayerParams()._spin), 'mood never adds spin to a Linear layer');

    // 2. Changes = colors only touches palette; Everything swaps layout. Undo returns to pre-autopilot look.
    const cmp = await page.evaluate(async () => {
      const before = JSON.parse(JSON.stringify(getState().stackLayouts[0].params));
      agAuto.setChanges('colors'); agAuto.change('phrase', 0.3); await new Promise(r => setTimeout(r, 900));
      const after = getState().stackLayouts[0].params;
      const diff = Object.keys(after).filter(k => JSON.stringify(after[k]) !== JSON.stringify(before[k]));
      agAuto.setChanges('everything'); agAuto.change('drop', 0.3); await new Promise(r => setTimeout(r, 900));
      return { diff, ev: getState().stackLayouts.length, colorsOn: document.querySelector('#apChangesRow .mbtn.on').textContent };
    });
    assert.ok(cmp.diff.length >= 1 && cmp.diff.every(k => ['_toneStops', '_simpleStops', '_solidColor', '_colorMode'].includes(k)), 'colors mode only changes palette: ' + cmp.diff);
    const multi = await page.evaluate(() => typeof agAuto.setLayers === 'function');
    assert.equal(cmp.ev, multi ? 3 : 1, 'Everything drop builds ' + (multi ? 3 : 1) + ' layers'); assert.equal(cmp.colorsOn, 'Everything');
    if (multi) {
      // v50: multi-layer Everything. Fixed counts, staggered single-layer swaps, distinct layouts, role opacities.
      const ml = await page.evaluate(async () => {
        const wait = () => new Promise(r => setTimeout(r, 700)), lay = () => getState().stackLayouts;
        const rowShown = getComputedStyle(document.getElementById('apLayersRow')).display !== 'none';
        agAuto.setLayers('2'); agAuto.change('drop', 0.3); await wait();
        const two = lay().map(l => [l.layout, l.opacity]);
        const swaps = [];
        for (let i = 0; i < 4; i++) {
          const before = lay().map(l => l.layout); agAuto._reset(); agAuto.change('phrase', 0.3); await wait();
          const after = lay().map(l => l.layout); swaps.push(after.filter((x, j) => x !== before[j]).length);
        }
        // Mid-fade ripple: with a stagger the bottom layer is further along than the top one.
        agAuto.setLayers('3'); agAuto._reset(); agAuto.change('drop', 4); await new Promise(r => setTimeout(r, 1000));
        const mid = lay().length; agAuto.stop(); agAuto.start();
        const three = lay().map(l => l.layout), pref = agAuto.state().layers;
        agAuto.setLayers('1'); agAuto._reset(); agAuto.change('drop', 0.3); await wait();
        const one = lay().length;
        agAuto.setChanges('mood'); const rowHidden = getComputedStyle(document.getElementById('apLayersRow')).display === 'none';
        agAuto.setLayers('auto');
        return { rowShown, two, swaps, mid, three, pref, one, rowHidden, ls: localStorage.getItem('audiograph_ap_layers') };
      });
      console.log('multi-layer', JSON.stringify(ml));
      assert.ok(ml.rowShown && ml.rowHidden, 'Layers row only shows for Everything');
      assert.equal(ml.two.length, 2); assert.deepEqual(ml.two.map(x => x[1]), [100, 70]); assert.notEqual(ml.two[0][0], ml.two[1][0], 'distinct layouts');
      assert.ok(ml.swaps.every(n => n <= 1), 'phrase changes swap at most one layer: ' + ml.swaps);
      assert.ok(ml.mid > 3, 'crossfade in progress mid-drop');
      assert.equal(ml.three.length, 3); assert.equal(new Set(ml.three).size, 3); assert.ok(!ml.three.includes('linear'));
      assert.equal(ml.pref, '3'); assert.equal(ml.one, 1); assert.equal(ml.ls, 'auto');
    }

    if (await page.evaluate(() => typeof apNoZoom !== 'undefined')) {
      // v51: Scale loud is off for Autopilot and comes back afterwards.
      const z = await page.evaluate(async () => {
        agAuto.stop(); zoomLoud = true; const st = getState(); st.stackLayouts.forEach(l => l.params._zoomLoud = true); applyState(st);
        agAuto.start(); const during = apNoZoom; agAuto.setChanges('mood'); agAuto._reset(); agAuto.change('phrase', 0.3); await new Promise(r => setTimeout(r, 900));
        const moodKeeps = getState().stackLayouts.every(l => l.params._zoomLoud === true);
        agAuto.setChanges('everything'); agAuto._reset(); agAuto.change('drop', 0.3); await new Promise(r => setTimeout(r, 900));
        const genOff = getState().stackLayouts.every(l => !l.params._zoomLoud);
        agAuto.stop(); const after = apNoZoom; agAuto.start();
        return { during, moodKeeps, genOff, after };
      });
      assert.deepEqual(z, { during: true, moodKeeps: true, genOff: true, after: false }, 'scale loud disabled for autopilot: ' + JSON.stringify(z));
    }

    // Preset Morph Play turns Autopilot off; Reset too.
    await page.evaluate(() => { agAuto.start(); toggleMorphAuto(); });
    assert.equal(await page.evaluate(() => agAuto.on()), false, 'Morph Play stops Autopilot');
    await page.evaluate(() => { if (pmAuto) toggleMorphAuto(); bakeMorph(); agAuto.start(); resetAll(); });
    assert.equal(await page.evaluate(() => agAuto.on()), false, 'Reset stops Autopilot');

    // 3. Real playback: calm intro -> build -> loud drop -> breakdown.
    const song = wav([
      [10, s => kicks(0.15)(s) + sine(220, 0.05)(s)],
      [6, s => kicks(0.15 + 0.12 * s)(s) + sine(220, 0.05 + 0.03 * s)(s) + 0.02 * s * Math.sin(2 * Math.PI * 4000 * s)],
      [10, s => kicks(0.9)(s) + sine(110, 0.3)(s) + 0.08 * Math.sin(2 * Math.PI * 3000 * s)],
      [8, s => sine(330, 0.04)(s)],
    ], 'auto.wav');
    await load(page, { name: song.name, mimeType: song.mimeType, buffer: song.buffer });
    await page.evaluate(() => { agAuto.setChanges('mood'); agAuto.start(); audio.currentTime = 0; togglePlay(); });
    const shots = [];
    for (const at of [8, 18, 24, 33]) {
      await page.waitForFunction(a => audio.currentTime >= a || audio.ended, at, { timeout: 60000 });
      shots.push(await page.evaluate(() => ({ t: +audio.currentTime.toFixed(1), section: agAuto.state().section, level: +agAuto.state().level.toFixed(2) })));
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'ap-' + at + '.png') });
    }
    const live = await page.evaluate(() => { if (playing) togglePlay(); const s = agAuto.state(); agAuto.stop(); return { events: s.events, on: agAuto.on(), pm: pmActive, label: document.getElementById('apSection').textContent }; });
    console.log('playback', JSON.stringify(shots), live.events.map(e => e.kind + '@' + e.at).join(' '));
    assert.equal(shots[2].section, 'drop', 'loud part detected as drop');
    assert.ok(['calm', 'waiting'].includes(shots[3].section), 'quiet ending detected as breakdown');
    assert.ok(live.events.some(e => e.kind === 'drop' && e.at >= 15 && e.at <= 20), 'drop change near 16s');
    assert.deepEqual([live.on, live.pm, live.label], [false, false, 'Off']);

    assert.deepEqual(errors, []);
    console.log('autopilot: PASS');
  } finally { await t.close(); }
})().catch(e => { console.error(e); process.exit(1); });
