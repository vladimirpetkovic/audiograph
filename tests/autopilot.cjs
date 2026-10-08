// v47: Autopilot — section detection (build-up / drop / breakdown / phrase) drives crossfaded look changes.
process.env.AUDIOGRAPH_PARTICLE_BUILD = process.env.AUDIOGRAPH_AUTO_BUILD || 'versions/audiograph_47.html';
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
    // UI: AI Look example chips hidden; Autopilot panel sits right after AI Look.
    const ui = await page.evaluate(() => ({ chips: getComputedStyle(document.querySelector('.ai-chips')).display, next: document.getElementById('panelAI').nextElementSibling.id, params: getComputedStyle(document.getElementById('apParams')).display, sec: document.getElementById('apSection').textContent }));
    assert.deepEqual(ui, { chips: 'none', next: 'panelAuto', params: 'none', sec: 'Off' });

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
      await new Promise(r => setTimeout(r, 6000));                                         // let the last fade finish
      return { mid, drop, calm, kinds: agAuto.state().events.map(e => e.kind), fading: agAuto.state().fading, n: stackLayouts.length, opac: stackLayouts.map(l => l.opacity), pm: pmActive };
    });
    console.log('synthetic events', ev.kinds.join(' '));
    assert.equal(ev.drop, 'drop'); assert.equal(ev.calm, 'calm');
    assert.ok(ev.kinds.includes('drop') && ev.kinds.includes('calm'), 'drop and breakdown trigger changes');
    assert.ok(ev.kinds.indexOf('drop') < ev.kinds.lastIndexOf('calm'));
    assert.equal(ev.fading, false); assert.equal(ev.pm, false); assert.equal(ev.n, 1, 'mood keeps the user layer count'); assert.deepEqual(ev.opac, [100]);

    // Mood changed palette + motion on the user's layer but kept its layout.
    const lay0 = await page.evaluate(() => layoutMode);
    assert.equal(lay0, 'linear', 'mood mode keeps layout');

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
    assert.equal(cmp.ev, 1); assert.equal(cmp.colorsOn, 'Everything');

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
