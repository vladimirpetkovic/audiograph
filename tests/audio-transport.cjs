// v31 top audio transport: #stopAudioBtn stays visible and toggles Stop/Play. Covers never-selected state, file
// stop -> Play resume, file ended, lower Play/Pause sync, Mic/System reconnect (fresh capture each time, old tracks
// ended), permission cancellation (Play + status, no false active state) and Reset leaving the source alone.
const assert = require('node:assert/strict');
const { open, wav, sine, load } = require('./audio-common.cjs');

(async () => {
  const s = await open();
  const { errors } = s;
  // A fresh tab without the helper's preloaded file: the never-selected state.
  const page = await s.page.context().newPage();
  await page.goto(s.page.url()); await s.page.close();
  try {
    const top = () => page.evaluate(() => {
      const b = document.getElementById('stopAudioBtn');
      return { label: b.textContent.trim(), visible: b.offsetParent !== null, disabled: b.disabled, aria: b.getAttribute('aria-label'), title: b.title,
        live: liveMode, playing, active: activeAudioSource, last: lastAudioSource };
    });
    let t = await top();
    assert.ok(t.visible && t.label === 'Play' && t.disabled && /Load audio, Mic or System/.test(t.aria), 'never-selected: disabled Play with guidance');

    await page.evaluate(() => {
      window.captures = []; window.denyMode = null;
      const stream = () => { initAudio(); const o = audioCtx.createOscillator(), d = audioCtx.createMediaStreamDestination(); o.connect(d); o.start(); return d.stream; };
      navigator.mediaDevices.getUserMedia = async () => { if (denyMode) throw new DOMException('denied', denyMode); const m = stream(); captures.push(m); return m; };
      navigator.mediaDevices.getDisplayMedia = async () => {
        if (denyMode) throw new DOMException('cancelled', denyMode);
        const v = document.createElement('canvas').captureStream().getVideoTracks()[0], m = new MediaStream([v, stream().getAudioTracks()[0]]); captures.push(m); return m;
      };
    });

    // Permission cancelled before any source: still disabled Play, explicit status, nothing active.
    await page.evaluate(() => { denyMode = 'NotAllowedError'; });
    await page.click('#btnMic');
    await page.waitForFunction(() => /Microphone was not connected/.test(document.getElementById('systemAudioHint').textContent));
    t = await top(); assert.ok(t.label === 'Play' && t.disabled && !t.live && t.active === null, 'mic cancel leaves Play, no false active');
    await page.click('#btnSystem'); await page.waitForFunction(() => !systemCapturePending);
    t = await top(); assert.ok(t.label === 'Play' && !t.live && t.active === null);
    assert.match(await page.locator('#systemAudioHint').textContent(), /not connected.*retry/);
    await page.evaluate(() => { denyMode = null; });

    // File: loaded-but-paused shows Play; Play/Stop toggle; Stop keeps the file for Play to resume from where it stopped.
    await load(page, wav([[3, sine(110, 0.5)]], 'transport.wav'));
    t = await top(); assert.ok(t.label === 'Play' && !t.disabled && t.last === 'file' && /Play audio file/.test(t.title), 'loaded file: Play');
    await page.click('#stopAudioBtn'); await page.waitForFunction(() => playing && audio.currentTime > 0.6);
    t = await top(); assert.ok(t.label === 'Stop' && /Stop audio file/.test(t.aria), 'file playing: Stop + lower Pause');
    await page.click('#stopAudioBtn');
    const at = await page.evaluate(() => audio.currentTime);
    t = await top(); assert.ok(t.label === 'Play' && !t.playing && t.active === null && t.last === 'file', 'stop file: Play');
    const f0 = await page.evaluate(() => globalFrame); await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => globalFrame), f0, 'stopped file does not animate');
    await page.click('#stopAudioBtn'); await page.waitForFunction(() => playing);
    assert.ok(await page.evaluate(() => audio.currentTime) >= at - 0.05, 'Play resumes the file, not from zero');
    t = await top(); assert.ok(t.label === 'Stop' && t.active === 'file');
    // Stop is temporary: Play resumes without choosing a source again.
    await page.click('#stopAudioBtn'); t = await top(); assert.ok(t.label === 'Play' && !t.disabled);
    await page.click('#stopAudioBtn'); t = await top(); assert.ok(t.label === 'Stop');
    // Ended file: Play; Play restarts from the range start.
    await page.waitForFunction(() => !playing, null, { timeout: 8000 });
    t = await top(); assert.ok(t.label === 'Play' && !t.disabled, 'ended file: Play');
    await page.click('#stopAudioBtn'); await page.waitForFunction(() => playing);
    assert.ok(await page.evaluate(() => audio.currentTime) < 1, 'Play after end restarts');
    await page.click('#stopAudioBtn');

    // Mic: Stop ends the tracks; Play reconnects through a fresh getUserMedia (never reuses ended tracks).
    await page.click('#btnMic'); await page.waitForFunction(() => liveMode && activeAudioSource === 'mic');
    t = await top(); assert.ok(t.label === 'Stop' && /Stop Mic/.test(t.aria) && !t.playing);
    await page.click('#stopAudioBtn');
    t = await top(); assert.ok(t.label === 'Play' && !t.live && t.last === 'mic' && /Reconnect Mic.*permission/.test(t.title));
    assert.ok(await page.evaluate(() => captures[captures.length - 1].getTracks().every(x => x.readyState === 'ended')));
    const n = await page.evaluate(() => captures.length);
    await page.click('#stopAudioBtn'); await page.waitForFunction(() => liveMode && activeAudioSource === 'mic');
    assert.equal(await page.evaluate(() => captures.length), n + 1, 'Play requested a new mic stream');
    const g0 = await page.evaluate(() => globalFrame); await page.waitForFunction(g => globalFrame > g + 3, g0);
    // Denied reconnect: back to Play with status, no live state.
    await page.click('#stopAudioBtn'); await page.evaluate(() => { denyMode = 'NotAllowedError'; });
    await page.click('#stopAudioBtn'); await page.waitForFunction(() => /Microphone was not connected/.test(document.getElementById('systemAudioHint').textContent));
    t = await top(); assert.ok(t.label === 'Play' && !t.live && t.active === null && !t.disabled);
    await page.evaluate(() => { denyMode = null; });

    // System: connect, Stop, Play reconnects via getDisplayMedia; cancel leaves Play + status; ended share -> Play.
    await page.click('#btnSystem'); await page.waitForFunction(() => liveMode && activeAudioSource === 'system');
    t = await top(); assert.ok(t.label === 'Stop' && /Stop System audio/.test(t.aria));
    await page.click('#stopAudioBtn');
    t = await top(); assert.ok(t.label === 'Play' && t.last === 'system' && /Reconnect System audio/.test(t.title));
    await page.evaluate(() => { denyMode = 'AbortError'; });
    await page.click('#stopAudioBtn'); await page.waitForFunction(() => !systemCapturePending);
    t = await top(); assert.ok(t.label === 'Play' && !t.live && t.active === null);
    assert.match(await page.locator('#systemAudioHint').textContent(), /not connected.*retry/);
    await page.evaluate(() => { denyMode = null; });
    await page.click('#stopAudioBtn'); await page.waitForFunction(() => liveMode && activeAudioSource === 'system');
    await page.evaluate(() => { const tr = liveStream.getAudioTracks()[0]; tr.stop(); tr.dispatchEvent(new Event('ended')); });
    t = await top(); assert.ok(t.label === 'Play' && !t.live && t.last === 'system', 'ended share: Play');

    // Reset is artistic only: it neither starts nor stops the source.
    await page.click('#stopAudioBtn'); await page.waitForFunction(() => liveMode);
    await page.click('button[onclick="resetAll()"]');
    t = await top(); assert.ok(t.label === 'Stop' && t.live && t.active === 'system', 'Reset keeps the live source');
    await page.click('#stopAudioBtn');
    await page.click('button[onclick="resetAll()"]');
    t = await top(); assert.ok(t.label === 'Play' && !t.live && t.last === 'system', 'Reset keeps a stopped source stopped');
    assert.deepEqual(errors, []);
    console.log('audio-transport: PASS (never-selected, file stop/resume/end, lower Play sync, mic+system reconnect/cancel, Reset)');
  } finally { await s.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
