process.env.AUDIOGRAPH_GPU_BUILD = process.env.AUDIOGRAPH_SIM_BUILD || 'versions/audiograph_86.html';
process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||= '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const assert = require('node:assert/strict');
const { open } = require('./gpu-common.cjs');
const { wav, kicks } = require('./audio-common.cjs');
const fs = require('node:fs');
const path = require('node:path');
const out = process.env.AUDIOGRAPH_SIM_SHOTS || path.join(__dirname, '..', '.tmp', 'sim86');

(async () => {
  const t = await open();
  const { page } = t;
  try {
    assert.equal(await page.evaluate(() => agSim.ready()), 'ready', 'native WebGPU required');
    assert.deepEqual(await page.evaluate(() => ({
      title: document.querySelector('#simulationLayouts .sublabel').textContent,
      layouts: Array.from(document.querySelectorAll('#simulationLayouts button')).map(e => e.textContent)
    })), { title: 'Simulation', layouts: ['Particles', 'Fluid', 'Smoke'] });
    await page.evaluate(() => setLayout('simsmoke'));
    assert.equal(await page.evaluate(() => +document.getElementById('pSmSpeed').value), 25, 'smoke starts slow by default');
    fs.mkdirSync(out, { recursive: true });
    const measure = () => page.evaluate(() => {
      renderDensity();
      const d = frameCtx.getImageData(0, 0, frameCv.width, frameCv.height).data;
      let sum = 0, hot = 0;
      for (let i = 0; i < d.length; i += 4) {
        sum += d[i] + d[i + 1] + d[i + 2];
        if (Math.max(d[i], d[i + 1], d[i + 2]) > 235) hot++;
      }
      return { mean: sum / (d.length / 4) / 3, hot: hot / (d.length / 4) };
    });
    const feed = (n, spec, onset = 0) => page.evaluate(({ n, spec, onset }) => {
      agSim.inject({ spec, onset }); agSim.advance(n);
    }, { n, spec, onset });
    for (const layout of ['simparticles', 'simfluid', 'simsmoke']) {
      await page.evaluate(layout => {
        setLayout(layout); agSim.reset(); renderDensity();
        if (layout === 'simsmoke') document.getElementById('pSmSpeed').value = 100;
      }, layout);
      await feed(200, 0.6);
      const base = await measure();
      await feed(1, 0.6, 1);
      let hit = await measure();
      for (let i = 0; i < 6; i++) {
        await feed(3, 0.6);
        const sample = await measure();
        if (sample.mean > hit.mean) hit = sample;
      }
      assert.ok(hit.mean > base.mean * 1.04, layout + ' clear beat accent: ' + JSON.stringify({ base, hit }));
      assert.ok(hit.hot < 0.15, layout + ' beat preserves highlight detail');
      await feed(90, 0);
      const quiet = await page.evaluate(() => Object.values(agSim.stats().layers)[0]);
      assert.ok(quiet.kick < 0.01 && quiet.level < 0.05, layout + ' relaxes after beat');
      await feed(70, 0.7);
      await page.screenshot({ path: path.join(out, layout + '.png') });
      console.log('PASS beat accent', layout, (hit.mean / base.mean).toFixed(2) + 'x');
    }
    const speed = await page.evaluate(() => {
      setLayout('simsmoke'); const e = document.getElementById('pSmSpeed');
      e.value = 25; e.dispatchEvent(new Event('input', { bubbles: true }));
      const saved = JSON.parse(JSON.stringify(getState()));
      const results = [];
      for (const value of [25, 100]) {
        e.value = value; e.dispatchEvent(new Event('input', { bubbles: true }));
        agSim.reset(); renderDensity(); agSim.inject({ spec: 0.6, onset: 1 }); agSim.advance(120, 1 / 60);
        results.push(Object.values(agSim.stats().layers)[0]);
      }
      applyState(saved); renderDensity();
      const stored = +e.value;
      addLayer(); setLayout('simsmoke');
      e.value = 50; e.dispatchEvent(new Event('input', { bubbles: true }));
      selectLayer(0); const first = +e.value; selectLayer(1); const second = +e.value;
      return { results, stored, first, second };
    });
    assert.ok(Math.abs(speed.results[1].time / speed.results[0].time - 4) < 0.01, 'default smoke transport is four times slower');
    assert.ok(Math.abs(speed.results[1].level - speed.results[0].level) < 0.001, 'audio attack/release stays real-time at slow smoke speed');
    assert.equal(speed.stored, 25); assert.equal(speed.first, 25); assert.equal(speed.second, 50);
    console.log('PASS smoke speed, real-time audio envelopes and per-layer preset persistence');

    await page.evaluate(() => { agSim.inject(null); window.previousBuffer = audioBuffer; });
    await page.setInputFiles('#fileInput', wav([[8, kicks(0.65, 0.025)]], 'rhythm.wav'));
    await page.waitForFunction(() => audioBuffer !== previousBuffer);
    const rhythm = await page.evaluate(async () => {
      stackLayouts.splice(1); selectLayer(0); setLayout('simfluid'); agSim.reset();
      audio.currentTime = 0; agAudio.reset(); togglePlay();
      const rows = [], start = performance.now();
      await new Promise(resolve => {
        function f() {
          const s = Object.values(agSim.stats().layers)[0];
          if (s) rows.push({ t: audio.currentTime, level: s.level, kick: s.kick });
          if (performance.now() - start < 3600) requestAnimationFrame(f); else resolve();
        }
        requestAnimationFrame(f);
      });
      togglePlay();
      return rows;
    });
    const attacks = rhythm.filter(r => r.t > 0.5 && r.t % 0.5 < 0.1);
    const rests = rhythm.filter(r => r.t > 0.5 && r.t % 0.5 > 0.3);
    const average = rows => rows.reduce((s, r) => s + r.kick, 0) / rows.length;
    assert.ok(attacks.length > 10 && rests.length > 10);
    assert.ok(average(attacks) > average(rests) * 1.5, 'real analyser detects bass beats on time: ' + JSON.stringify({ attack: average(attacks), rest: average(rests) }));
    assert.deepEqual(t.errors, []);
    assert.deepEqual(await page.evaluate(() => agSim.stats().errors), []);
    console.log('PASS actual audio beat timing', { attack: average(attacks), rest: average(rests) });
  } finally { await t.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
