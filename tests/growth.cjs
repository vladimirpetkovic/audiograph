// v41: audio-driven Growth layout (Vine / Neuron / Coral) with slowly fading trails.
process.env.AUDIOGRAPH_PARTICLE_BUILD = process.env.AUDIOGRAPH_GROWTH_BUILD || 'versions/audiograph_41.html';
process.env.AUDIOGRAPH_BUILD_31 = process.env.AUDIOGRAPH_PARTICLE_BUILD;
const fs = require('node:fs');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && fs.existsSync(chrome)) process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = chrome;
const assert = require('node:assert/strict');
const { open, wav, sine, kicks, load } = require('./audio-common.cjs');
const SHOTS = process.env.AG_SHOTS || '';

(async () => {
  const t = await open({ viewport: { width: 1280, height: 800 } });
  const { page, errors } = t;
  try {
    const mix = t2 => kicks(0.7)(t2) + sine(220, 0.25)(t2) + sine(1760, 0.08)(t2);
    const tone = wav([[20, mix]], 'growth.wav');
    await load(page, { name: tone.name, mimeType: tone.mimeType, buffer: tone.buffer });
    await page.evaluate(() => { particlesOn = false; });
    const click = sel => page.evaluate(sel => [...document.querySelectorAll('.mbtn')].find(b => (b.getAttribute('onclick') || '').includes(sel)).click(), sel);
    const ink = () => page.evaluate(() => { const d = frameCtx.getImageData(0, 0, frameCv.width, frameCv.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 60) n++; return n / (d.length / 4); });

    // Retired layouts are gone from the picker; Growth is in General.
    const picker = await page.evaluate(() => [...document.querySelectorAll('.mbtn.amber')].map(b => b.getAttribute('onclick')).join(' '));
    assert.ok(!/kaleidoscope|ridgeplot/.test(picker), 'Kaleidoscope/Ridge removed');
    assert.ok(/setLayout\('growth'/.test(picker), 'Growth button present');
    const lay = await page.evaluate(() => { const r = [...document.querySelectorAll('#panelAppear .prow-stack')].map(e => { const l = e.querySelector('.prow-label').getBoundingClientRect(), c = e.querySelector('.mode-btns').getBoundingClientRect(); return { above: l.bottom <= c.top + 1, centred: Math.abs((l.left + l.right) / 2 - (c.left + c.right) / 2) < 30 }; }); return r; });
    assert.equal(lay.length, 2, 'Layout and Style rows are stacked');
    lay.forEach(r => assert.ok(r.above && r.centred, 'label above and centred: ' + JSON.stringify(lay)));

    await click("setLayout('growth'");
    await page.evaluate(() => { if (!playing) togglePlay(); });
    const res = {};
    for (const type of ['vine', 'neuron', 'coral']) {
      await click(`setGrowType('${type}'`);
      await page.waitForTimeout(3500);
      const a = await ink();
      const tips = await page.evaluate(() => Object.values(agGrowth.stats()).reduce((x, y) => x + y, 0));
      if (SHOTS) await page.locator('#frameCv').screenshot({ path: `${SHOTS}/growth-${type}.png` });
      res[type] = { ink: +a.toFixed(4), tips };
      assert.ok(a > 0.01, type + ' grows visible trails: ' + JSON.stringify(res[type]));
      assert.ok(tips > 2, type + ' has live tips/branches: ' + JSON.stringify(res[type]));
    }
    assert.equal(await page.evaluate(() => JSON.stringify(getState()).includes('"_growType":"coral"')), true, 'type saved per layer');

    // Short trail fades out once growth is paused-free: clear + low trail leaves little ink after silence.
    await page.evaluate(() => { document.getElementById('pGrowTrail').value = 0; document.getElementById('pGrowSpeed').value = 10; upP(); });
    await page.waitForTimeout(2500);
    const faded = await ink();
    assert.ok(faded < res.coral.ink, 'low Trail fades older growth: ' + faded + ' < ' + res.coral.ink);
    await page.evaluate(() => { if (playing) togglePlay(); document.getElementById('growClearBtn').click(); });
    await page.waitForTimeout(200);
    assert.ok((await ink()) < 0.01, 'Clear wipes trails');

    assert.deepEqual(errors, []);
    console.log('growth: PASS ' + JSON.stringify(res) + ' faded ' + faded.toFixed(4));
  } finally { await t.close(); }
})().catch(e => { console.error(e); process.exit(1); });
