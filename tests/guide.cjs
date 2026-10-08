// v43: onboarding Guide (ordered sections + contents links) and controller keyboard shortcuts.
process.env.AUDIOGRAPH_PARTICLE_BUILD = process.env.AUDIOGRAPH_GUIDE_BUILD || 'versions/audiograph_43.html';
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
    const tone = wav([[20, t2 => kicks(0.6)(t2) + sine(220, 0.25)(t2)]], 'guide.wav');
    await load(page, { name: tone.name, mimeType: tone.mimeType, buffer: tone.buffer });

    // Guide opens; sections go from onboarding basics to advanced topics.
    await page.evaluate(() => toggleHelp());
    const g = await page.evaluate(() => {
      const o = document.getElementById('helpOverlay');
      const heads = [...o.querySelectorAll('.help-section h3')].map(h => h.textContent.trim());
      const links = [...o.querySelectorAll('.help-toc a')].map(a => a.getAttribute('href'));
      return { shown: getComputedStyle(o).display, heads, links, missing: links.filter(h => !document.querySelector(h)), title: o.querySelector('h2').textContent };
    });
    assert.equal(g.shown, 'block', 'Guide opens');
    assert.match(g.title, /Guide .*v4[3-9]/);
    const order = ['Quick start', ...(g.heads[1] && g.heads[1].includes('AI Look') ? ['AI Look'] : []), ...(g.heads[2] && g.heads[2].includes('Autopilot') ? ['Autopilot'] : []), 'Audio', 'Layers', 'Layout', 'Style', 'Color', 'Geometry', 'Deformers', 'Particles', 'Post FX', 'Reactive', 'Presets', 'Live output', 'Projection mapping', 'Resolution', 'Export', 'Knobs'];
    order.forEach((w, i) => assert.ok(g.heads[i] && g.heads[i].includes(w), `section ${i + 1} is ${w}: ${g.heads[i]}`));
    assert.equal(g.links.length, g.heads.length, 'one contents link per section');
    assert.deepEqual(g.missing, [], 'every contents link has a target');

    // Every layout in the picker is named in the Guide.
    const names = await page.evaluate(() => { const txt = document.getElementById('helpOverlay').textContent; return [...document.querySelectorAll('.mbtn.amber')].map(b => b.textContent.trim().replace('.', '')).filter(n => !txt.includes(n)); });
    assert.deepEqual(names, [], 'all layouts documented');

    // Contents link scrolls to its section.
    await page.click('.help-toc a[href="#g-mapping"]');
    await page.waitForTimeout(300);
    const top = await page.evaluate(() => document.getElementById('g-mapping').getBoundingClientRect().top);
    assert.ok(top >= -5 && top < 600, 'contents link scrolls section into view: ' + top);
    if (SHOTS) await page.locator('.help-modal').screenshot({ path: `${SHOTS}/guide.png` });

    // Esc closes the Guide.
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => getComputedStyle(helpOverlay).display), 'none', 'Esc closes Guide');

    // Space toggles playback; ignored while focus is in a text field.
    await page.evaluate(() => { document.activeElement && document.activeElement.blur(); if (playing) togglePlay(); });
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => playing), true, 'Space plays');
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => playing), false, 'Space pauses');

    // Cmd/Ctrl+Z undoes the last change.
    await page.evaluate(() => setLayout('spiral', document.querySelector(".mbtn.amber[onclick*=\"'spiral'\"]")));
    assert.equal(await page.evaluate(() => layoutMode), 'spiral');
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    assert.notEqual(await page.evaluate(() => layoutMode), 'spiral', 'Cmd/Ctrl+Z undoes');

    assert.deepEqual(errors, []);
    console.log('guide: PASS (' + g.heads.length + ' sections, contents links, Space/Undo/Esc shortcuts)');
  } finally { await t.close(); }
})().catch(e => { console.error(e); process.exit(1); });
