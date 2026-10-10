// v33 binary switches: true two-state mode buttons are progressively enhanced into accessible
// pill switches while the hidden .mbtn buttons remain the source of truth.
process.env.AUDIOGRAPH_GPU_BUILD = process.env.AUDIOGRAPH_SWITCH_BUILD || 'versions/audiograph_34.html';
const fs = require('node:fs');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && fs.existsSync(chrome)) process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = chrome;
const assert = require('node:assert/strict');
const { open } = require('./gpu-common.cjs');

const frames = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const rgb = s => (s.match(/[-\d.]+/g) || []).slice(0, 3).map(Number);

(async () => {
  const t = await open({ viewport: { width: 1440, height: 900 } });
  const { page, errors } = t;
  try {
    await page.evaluate(() => document.querySelectorAll('.panel').forEach(p => p.classList.remove('closed')));
    await frames(page);

    const census = await page.evaluate(() => {
      const enhanced = [...document.querySelectorAll('.switch-cell')].map(r => r.querySelector('.prow-label')?.textContent.trim());
      const hiddenSources = [...document.querySelectorAll('.mode-btns.ag-switch-src')].length;
      const nonBinaryStillButtons = [...document.querySelectorAll('.prow')].some(r => r.querySelector('.prow-label')?.textContent.trim() === 'Branches' && r.querySelector('.mode-btns') && !r.querySelector('.ag-switch'));
      return { stats: agSwitches.stats(), enhanced, hiddenSources, nonBinaryStillButtons };
    });
    const hasAutopilot = await page.evaluate(() => !!document.getElementById('apEnableRow'));
    assert.equal(census.stats.switches, hasAutopilot ? 19 : 18, JSON.stringify(census));
    assert.equal(census.hiddenSources, census.stats.switches);
    assert.ok(census.enhanced.includes('Vary height') && census.enhanced.includes('Vary thick'), 'expected layer switches');
    assert.ok(census.nonBinaryStillButtons, 'non-binary two-button controls stay as buttons');

    const vary = page.locator('.switch-cell').filter({ hasText: 'Vary height' }).locator('.ag-switch');
    await vary.scrollIntoViewIfNeeded();
    assert.equal(await vary.getAttribute('role'), 'switch');
    assert.equal(await vary.getAttribute('aria-checked'), 'true');
    await vary.click();
    let state = await page.evaluate(() => ({ varyHeight, aria: document.querySelector('.switch-cell .ag-switch[aria-label="Vary height"]').getAttribute('aria-checked'), yes: [...document.querySelectorAll('.switch-cell')].find(r => r.querySelector('.prow-label')?.textContent.trim() === 'Vary height').querySelectorAll('.mbtn')[0].classList.contains('on') }));
    assert.deepEqual(state, { varyHeight: false, aria: 'false', yes: false });
    await vary.press('Enter');
    assert.equal(await page.evaluate(() => varyHeight), true, 'keyboard toggles through hidden button');

    let onColor = rgb(await vary.evaluate(el => getComputedStyle(el).backgroundColor));
    assert.ok(onColor[1] > 170 && onColor[0] < 40, 'ON switch is green: ' + onColor);
    await vary.click();
    await page.waitForTimeout(220);
    let offColor = rgb(await vary.evaluate(el => getComputedStyle(el).backgroundColor));
    assert.ok(offColor[0] > 150 && offColor[1] < 110, 'OFF switch is red: ' + offColor);

    await page.evaluate(() => applyState(JSON.parse(JSON.stringify(builtinPresets.flares))));
    await frames(page);
    const afterPreset = await page.evaluate(() => ({ checked: document.querySelector('.switch-cell .ag-switch[aria-label="Vary height"]').getAttribute('aria-checked') === 'true', varyHeight }));
    assert.equal(afterPreset.checked, afterPreset.varyHeight, 'preset load resyncs switch');
    await page.evaluate(() => [...document.querySelectorAll('.top-actions .btn, .frame-actions .btn')].find(b => b.textContent.trim() === 'Reset').click());
    await frames(page);
    assert.deepEqual(await page.evaluate(() => ({ checked: document.querySelector('.switch-cell .ag-switch[aria-label="Vary height"]').getAttribute('aria-checked'), varyHeight })), { checked: 'true', varyHeight: true }, 'Reset resyncs switch');

    const knobColors = await page.evaluate(async () => {
      const inp = document.getElementById('pLines'), knob = document.querySelector('#pLines + .knob'), fill = knob.querySelector('.knob-fill');
      inp.value = inp.min; agKnobs.sync();
      await new Promise(r => setTimeout(r, 180));
      const low = getComputedStyle(fill).stroke;
      inp.value = inp.max; agKnobs.sync();
      await new Promise(r => setTimeout(r, 180));
      const high = getComputedStyle(fill).stroke;
      return { low, high };
    });
    const low = rgb(knobColors.low), high = rgb(knobColors.high);
    assert.ok(low[0] > low[1] * 1.8 && low[0] > 180, 'knob min is red-ish: ' + knobColors.low);
    assert.ok(high[1] > high[0] * 1.5 && high[1] > 140, 'knob max is green-ish: ' + knobColors.high);

    const overflow = await page.evaluate(() => {
      const area = document.getElementById('controlsArea'), ar = area.getBoundingClientRect();
      const offenders = [...area.querySelectorAll('.knob-grid,.switch-grid,.knob-cell,.switch-cell,.ag-switch')].filter(el => {
        const r = el.getBoundingClientRect(); return r.width && (r.left < ar.left - 1 || r.right > ar.right + 1);
      }).map(el => el.className || el.tagName);
      return { scroll: area.scrollWidth - area.clientWidth, offenders, height: area.scrollHeight };
    });
    assert.ok(overflow.scroll <= 1, 'sidebar has no horizontal scroll: ' + JSON.stringify(overflow));
    // v45 adds the ✨ AI Look panel (~200px) above Layers.
    assert.ok(overflow.height <= 6250, 'expanded sidebar stays compact: ' + JSON.stringify(overflow));
    assert.deepEqual(overflow.offenders, []);
    const chips = await page.evaluate(() => {
      const row = document.querySelector('#panelPresets .preset-actions'), rr = row.getBoundingClientRect(), buttons = [...row.querySelectorAll('.mbtn')];
      const active = getComputedStyle(document.querySelector('#panelAppear .mbtn.on'));
      const inactive = getComputedStyle(document.querySelector('#panelAppear .mbtn:not(.on)'));
      return {
        presetButtons: buttons.length,
        presetOneLine: new Set(buttons.map(b => Math.round(b.getBoundingClientRect().top))).size === 1,
        presetOverflow: buttons.some(b => { const r = b.getBoundingClientRect(); return r.left < rr.left - 1 || r.right > rr.right + 1; }),
        activeBg: active.backgroundColor,
        activeBorder: active.borderTopColor,
        inactiveBg: inactive.backgroundColor,
        inactiveBorder: inactive.borderTopColor,
        inactiveRadius: parseFloat(inactive.borderTopLeftRadius),
      };
    });
    assert.equal(chips.presetButtons, 6, 'preset action buttons in one row');
    assert.ok(chips.presetOneLine && !chips.presetOverflow, 'preset actions fit: ' + JSON.stringify(chips));
    const activeBg = rgb(chips.activeBg), inactiveBg = rgb(chips.inactiveBg);
    assert.ok(activeBg[1] > 170 && activeBg[0] < 40, 'active chip filled green: ' + chips.activeBg);
    assert.ok(inactiveBg.every(v => v >= 20 && v <= 45), 'inactive chip is dark filled: ' + chips.inactiveBg);
    assert.ok(/rgba\(255, 255, 255, 0\.0/.test(chips.inactiveBorder) && chips.inactiveRadius >= 5, 'inactive chip has subtle border/radius: ' + JSON.stringify(chips));
    const switchRows = await page.evaluate(() => {
      const cell = label => [...document.querySelectorAll('.switch-cell')].find(r => r.querySelector('.prow-label')?.textContent.trim() === label);
      const sameTop = labels => new Set(labels.map(l => Math.round(cell(l).getBoundingClientRect().top))).size === 1;
      const centerGap = label => {
        const c = cell(label), g = c.parentElement, row = [...g.children].filter(x => Math.round(x.getBoundingClientRect().top) === Math.round(c.getBoundingClientRect().top));
        const gr = g.getBoundingClientRect(), l = Math.min(...row.map(x => x.getBoundingClientRect().left)), r = Math.max(...row.map(x => x.getBoundingClientRect().right));
        return Math.abs((l + r) / 2 - (gr.left + gr.right) / 2);
      };
      return {
        threeAcross: sameTop(['Vary height', 'Vary thick', 'Scale→loud']),
        flipMirror: sameTop(['Flip', 'Mirror']),
        flipCompact: !!cell('Flip').querySelector('.mode-btns') && !cell('Flip').querySelector('.ag-switch'),
        flipMirrorCentered: centerGap('Flip'),
      };
    });
    assert.deepEqual({ threeAcross: switchRows.threeAcross, flipMirror: switchRows.flipMirror, flipCompact: switchRows.flipCompact }, { threeAcross: true, flipMirror: true, flipCompact: true });
    assert.ok(switchRows.flipMirrorCentered < 2, 'flip/mirror row centered ' + JSON.stringify(switchRows));
    assert.deepEqual(errors, []);
    console.log(`switches: PASS (${census.stats.switches} switches; skipped ${census.stats.skipped.join('; ')})`);
  } finally { await t.close(); }
})().catch(e => { console.error(e); process.exit(1); });
