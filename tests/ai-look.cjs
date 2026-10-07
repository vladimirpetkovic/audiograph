// v45: AI Look — prompt -> validated look spec -> active layer (Quick keywords, Ollama/WebLLM with untrusted output sanitised).
process.env.AUDIOGRAPH_PARTICLE_BUILD = process.env.AUDIOGRAPH_AI_BUILD || 'versions/audiograph_45.html';
process.env.AUDIOGRAPH_BUILD_31 = process.env.AUDIOGRAPH_PARTICLE_BUILD;
const fs = require('node:fs');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && fs.existsSync(chrome)) process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = chrome;
const assert = require('node:assert/strict');
const { open, wav, load } = require('./audio-common.cjs');

(async () => {
  const t = await open({ viewport: { width: 1280, height: 800 } });
  const { page, errors } = t;
  try {
    const tr = wav([[8, s => 0.6 * Math.sin(2 * Math.PI * 80 * s) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 2 * s))]], 'ai.wav');
    await load(page, { name: tr.name, mimeType: tr.mimeType, buffer: tr.buffer });
    await page.evaluate(() => { localStorage.removeItem('audiograph_ai_engine'); agAI.setEngine('quick'); });

    // Keyword reading.
    const k = await page.evaluate(() => [
      agAI.keywords('slow purple galaxy with glowing trails, turning left'),
      agAI.keywords('aggressive neon kaleidoscope, fast spin, dense'),
      agAI.keywords('glowing coral reef with particles'),
    ]);
    assert.equal(k[0].layout, 'spiral'); assert.equal(k[0].energy, 20); assert.ok(k[0].spin < 0 && k[0].trails > 0 && k[0].glow > 0);
    assert.equal(k[1].symmetry, 'r6'); assert.equal(k[1].energy, 85); assert.ok(k[1].spin >= 80); assert.equal(k[1].density, 85);
    assert.deepEqual([k[2].layout, k[2].growth, k[2].particles], ['growth', 'coral', true]);

    // Quick create via UI rebuilds the active layer; undo restores.
    const before = await page.evaluate(() => JSON.stringify(getState().stackLayouts));
    await page.fill('#aiPrompt', 'calm ocean waves, thin lines');
    await page.click('.ai-go >> nth=0');
    await page.waitForFunction(() => /Quick match/.test(document.getElementById('aiStatus').textContent));
    const q = await page.evaluate(() => ({ layout: layoutMode, n: stackLayouts.length, cm: stackLayouts[activeLayerIdx].params._colorMode, stops: stackLayouts[activeLayerIdx].params._toneStops, thick: stackLayouts[activeLayerIdx].params._thick, on: [...document.querySelectorAll('.mbtn.on')].some(b => (b.getAttribute('onclick') || '').includes("setLayout('sine'")) }));
    assert.equal(q.layout, 'sine'); assert.equal(q.n, 1); assert.equal(q.cm, 'toneramp'); assert.equal(q.stops[1], '#0077b6'); assert.ok(q.thick < 2); assert.ok(q.on, 'layout button highlighted');
    await page.waitForTimeout(500);
    await page.screenshot({ path: '.tmp/ai-ocean.png' });
    await page.evaluate(() => undo());
    assert.equal(await page.evaluate(() => JSON.stringify(getState().stackLayouts)), before, 'undo restores previous layers');

    // Ollama path (mocked): garbage fields are rejected/clamped, valid ones win over keywords.
    await page.route('http://localhost:11434/api/chat', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ message: { content: 'Sure! {"layout":"sphere","shape":"hack()","colors":["#d4af37","red","#fff1a8","javascript:x"],"background":"#050505","energy":999,"density":-5,"spin":-60,"glow":70,"trails":"lots","symmetry":"r12","particles":true}' } }) }));
    await page.evaluate(() => agAI.setEngine('ollama'));
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('aiOllamaRow')).display), 'flex');
    await page.fill('#aiPrompt', 'golden planet, dreamy trails');
    const s = await page.evaluate(() => agAI.generate(false));
    assert.equal(s.layout, 'sphere'); assert.equal(s.shape, 'straight'); assert.deepEqual(s.colors, ['#d4af37', '#fff1a8']);
    assert.equal(s.energy, 100); assert.equal(s.density, 0); assert.equal(s.spin, -60); assert.equal(s.trails, 55, 'invalid trails falls back to keyword reading'); assert.equal(s.symmetry, 'none');
    const st = await page.evaluate(() => ({ layout: layoutMode, bg: canvasBg, fx: stackLayouts[activeLayerIdx].params._postFx, dir: spinDir, spin: +document.getElementById('pSpin').value, parts: particlesOn, msg: document.getElementById('aiStatus').textContent }));
    assert.equal(st.layout, 'sphere'); assert.equal(st.bg, '#050505'); assert.ok(st.fx.enabled && st.fx.pfxBloom === 70 && st.fx.pfxTrails === 55);
    assert.equal(st.dir, -1); assert.equal(st.spin, 3); assert.equal(st.parts, true); assert.match(st.msg, /^AI:/);
    await page.waitForTimeout(600);
    await page.screenshot({ path: '.tmp/ai-planet.png' });

    // Words typed explicitly beat the model (bars -> linear, thick), model still supplies palette.
    const ov = await page.evaluate(() => agAI.sanitize({ layout: 'concentric', thickness: 15, colors: ['#ff4444', '#990000'], glow: 40 }, 'aggressive red techno bars with thick lines'));
    assert.deepEqual([ov.layout, ov.thickness, ov.energy, ov.colors[0], ov.glow], ['linear', 65, 85, '#ff4444', 40]);
    const gd = await page.evaluate(() => [agAI.sanitize({ background: '#333333', shape: 'words' }, 'purple galaxy'), agAI.sanitize({ background: '#333333', shape: 'words' }, 'galaxy made of words on a white background')]);
    assert.equal(gd[0].shape, 'straight'); assert.ok(parseInt(gd[0].background.slice(1, 3), 16) < 40, 'grey model background darkened');
    assert.deepEqual([gd[1].shape, gd[1].background], ['words', '#f4f1ea']);
    // Ollama down -> falls back to Quick with a message.
    await page.unroute('http://localhost:11434/api/chat');
    await page.route('http://localhost:11434/api/chat', r => r.abort());
    await page.fill('#aiPrompt', 'neon kaleidoscope');
    const f = await page.evaluate(() => agAI.generate(true));
    assert.equal(f.symmetry, 'r6');
    const fb = await page.evaluate(() => ({ n: stackLayouts.length, act: activeLayerIdx, msg: document.getElementById('aiStatus').textContent, btn: document.querySelector('.ai-go').disabled }));
    assert.equal(fb.n, 2, '+ As layer adds a layer'); assert.equal(fb.act, 1); assert.match(fb.msg, /Ollama not reachable.*Quick/); assert.equal(fb.btn, false);

    // Local AI without WebGPU -> clear message + Quick fallback (headless has no navigator.gpu usually; force it).
    await page.evaluate(() => { Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true }); agAI.setEngine('webllm'); });
    await page.fill('#aiPrompt', 'vine');
    const w = await page.evaluate(() => agAI.generate(false));
    assert.equal(w.layout, 'growth'); assert.match(await page.evaluate(() => document.getElementById('aiStatus').textContent), /WebGPU/);
    assert.equal(await page.evaluate(() => localStorage.getItem('audiograph_ai_engine')), 'webllm');

    // Typing in the prompt must not fire app shortcuts (Space = play).
    const playing0 = await page.evaluate(() => typeof isPlaying !== 'undefined' ? isPlaying : null);
    await page.focus('#aiPrompt'); await page.keyboard.type(' f ');
    assert.equal(await page.evaluate(() => typeof isPlaying !== 'undefined' ? isPlaying : null), playing0);
    assert.equal(await page.evaluate(() => !!document.fullscreenElement), false);

    assert.deepEqual(errors, []);
    console.log('ai-look: PASS');
  } finally { await t.close(); }
})().catch(e => { console.error(e); process.exit(1); });
