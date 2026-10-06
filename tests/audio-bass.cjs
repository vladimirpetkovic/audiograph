// v31 bass punch receipts. A generated timeline (silence, 50 Hz and 2 kHz tones at equal amplitude,
// 120 bpm kicks, rising 50 Hz ramp) is played through the real file path with Bass punch 0 (v30) and
// 60 (v31 default). Records the per-frame shaping stage and checks: silence stays 0; v30 responds the
// same to equal low and high tones (the reported weakness) while v31 favours bass; kicks produce a
// clear peak/decay modulation; louder bass produces more response; no audio routing/volume change.
const assert = require('node:assert/strict');
const { open, wav, sine, silence, kicks, load, record, mean } = require('./audio-common.cjs');
const seg = { sil: [0, 1.5], low: [1.5, 3.5], gap: [3.5, 4.5], high: [4.5, 6.5], kick: [6.5, 10.5], ramp: [10.5, 13.5] };
const file = wav([[1.5, silence], [2, sine(50, 0.5)], [1, silence], [2, sine(2000, 0.5)], [4, kicks(0.8, 0.05)], [3, (t) => (0.08 + 0.42 * t / 3) * Math.sin(2 * Math.PI * 50 * t)]]);
const inSeg = (rows, [a, b], pad = 0.35) => rows.filter(r => r.t >= a + pad && r.t < b - 0.05);
(async () => {
  const t = await open({ viewport: { width: 1000, height: 700 } });
  const { page, errors } = t;
  try {
    // Log every audio-node connection to prove the bass tap never reaches the speakers/recorder.
    await page.evaluate(() => { window.__conn = []; const c = AudioNode.prototype.connect; AudioNode.prototype.connect = function (d) { window.__conn.push([this.constructor.name, d && d.constructor ? d.constructor.name : String(d)]); return c.apply(this, arguments); }; });
    await load(page, file);
    await page.evaluate(() => { const st = getState(); st.stackLayouts.forEach(l => { l.params._playMode = 'continuous'; l.params._particlesOn = false; }); applyState(st); playMode = 'continuous'; });
    const vol0 = await page.evaluate(() => [audio.volume, audio.muted]);
    const res = {};
    for (const punch of [0, 60]) res[punch] = await record(page, 0, 13.4, `agAudio.set({punch:${punch},release:220})`);
    const rep = {};
    for (const p of [0, 60]) {
      const r = res[p], low = mean(inSeg(r, seg.low).map(x => x.outMean)), high = mean(inSeg(r, seg.high).map(x => x.outMean));
      const silRows = [...inSeg(r, seg.sil, 0.2), ...inSeg(r, seg.gap, 0.45)], sil = Math.max(...silRows.map(x => x.outMean - x.inMean));
      const k = inSeg(r, seg.kick, 0.6).map(x => x.outMean), kmax = Math.max(...k), kmin = Math.min(...k);
      const ramp = inSeg(r, seg.ramp, 0.3), q = Math.floor(ramp.length / 4);
      rep[p] = { silenceMax: sil, low, high, lowHigh: low / high, kickPeak: kmax, kickTrough: kmin, kickDepth: (kmax - kmin) / kmax,
        rampFirst: mean(ramp.slice(0, q).map(x => x.outMean)), rampLast: mean(ramp.slice(-q).map(x => x.outMean)), frames: r.length };
    }
    // Decay after kick peaks with v31: gain falls back within ~3x release (0.66 s) of each peak.
    const kr = inSeg(res[60], seg.kick, 0.6); let decays = [];
    for (let i = 1; i < kr.length - 1; i++) if (kr[i].env > 0.8 && kr[i - 1].env <= 0.8) { const j = kr.findIndex((x, k) => k > i && x.env < 0.4); if (j > 0) decays.push(kr[j].t - kr[i].t); }
    console.log('bass receipt (mean per-line value):');
    for (const p of [0, 60]) { const x = rep[p]; console.log(` punch ${String(p).padStart(2)}: silence out-in ${x.silenceMax.toFixed(3)} | 50Hz ${x.low.toFixed(3)} vs 2kHz ${x.high.toFixed(3)} (x${x.lowHigh.toFixed(2)}) | kicks peak ${x.kickPeak.toFixed(3)} trough ${x.kickTrough.toFixed(3)} depth ${(x.kickDepth * 100).toFixed(0)}% | ramp ${x.rampFirst.toFixed(3)} -> ${x.rampLast.toFixed(3)} | frames ${x.frames}`); }
    console.log(` v31 kick decays (env 0.8 -> 0.4): ${decays.map(d => d.toFixed(2)).join(', ')} s; onsets ${res[60].at(-1).onsets - res[60][0].onsets}`);
    // v30 reproduction: equal-amplitude low and high tones look the same; kick modulation is weak.
    assert.ok(Math.abs(rep[0].lowHigh - 1) < 0.15, 'v30 path treats bass like treble');
    // v31 corrections.
    for (const p of [0, 60]) assert.ok(rep[p].silenceMax <= 0.001, 'silence is never boosted');
    // Equalizer mode (FFT lines, same path as live mic/system): silence is exactly still; kicks gain contrast.
    const eq = {};
    for (const p of [0, 60]) eq[p] = await record(page, 0, 8.5, `agAudio.set({punch:${p},release:220});stackLayouts.forEach(l=>l.params._playMode='equalizer');playMode='equalizer'`);
    const eqRep = p => { const k = inSeg(eq[p], [6.5, 8.5], 0.6).map(x => x.outMean); return { sil: Math.max(...inSeg(eq[p], seg.sil, 0.3).map(x => x.outMax)), peak: Math.max(...k), trough: Math.min(...k) }; };
    const e0 = eqRep(0), e6 = eqRep(60);
    console.log(` equalizer: silence max ${e0.sil.toFixed(3)}/${e6.sil.toFixed(3)} | kicks punch 0 ${e0.trough.toFixed(3)}..${e0.peak.toFixed(3)} punch 60 ${e6.trough.toFixed(3)}..${e6.peak.toFixed(3)}`);
    assert.ok(e0.sil === 0 && e6.sil === 0, 'equalizer silence stays 0');
    assert.ok(e6.peak - e6.trough >= 1.4 * (e0.peak - e0.trough), 'equalizer kick contrast');
    assert.ok(rep[60].lowHigh >= 1.25, 'bass favoured over equal high tone');
    assert.ok(rep[60].kickPeak - rep[60].kickTrough >= 1.4 * (rep[0].kickPeak - rep[0].kickTrough) && rep[60].kickPeak >= 1.2 * rep[0].kickPeak, 'kick peak/decay displacement');
    assert.ok(rep[60].kickPeak <= 1 && Math.max(...res[60].map(x => x.outMax)) <= 1, 'bounded, no overshoot above 1');
    assert.ok(rep[60].rampLast > rep[60].rampFirst * 1.15, 'louder bass gives more response');
    assert.ok(decays.length >= 4 && decays.every(d => d > 0.05 && d < 0.7), 'kick decay within release bounds');
    // Output path unchanged: tap ends in an AnalyserNode only; volume untouched; one destination link per graph build.
    const conn = await page.evaluate(() => window.__conn);
    const toDest = conn.filter(c => c[1] === 'AudioDestinationNode'), fromBiquad = conn.filter(c => c[0] === 'BiquadFilterNode');
    assert.ok(fromBiquad.length > 0 && fromBiquad.every(c => c[1] === 'BiquadFilterNode' || c[1] === 'AnalyserNode'), 'bass tap terminates in analyser');
    assert.ok(toDest.every(c => c[0] === 'AnalyserNode'), 'only the original analyser feeds the speakers');
    assert.deepEqual(await page.evaluate(() => [audio.volume, audio.muted]), vol0);
    // Persistence: state carries bass; legacy state without it keeps the current value; localStorage remembers.
    const ps = await page.evaluate(() => { agAudio.set({ punch: 35, release: 300 }); const st = getState(); const has = st.bass; delete st.bass; agAudio.set({ punch: 70, release: 300 }); applyState(st); const kept = agAudio.get().punch; st.bass = { punch: 10, release: 150 }; applyState(st); return { has, kept, now: agAudio.get(), ls: localStorage.getItem('audiograph_bass') }; });
    assert.deepEqual(ps.has, { punch: 35, release: 300 }); assert.equal(ps.kept, 70); assert.deepEqual(ps.now, { punch: 10, release: 150 });
    await page.reload(); await page.waitForFunction(() => typeof agAudio === 'object');
    assert.deepEqual(await page.evaluate(() => agAudio.get()), { punch: 10, release: 150 });
    assert.deepEqual(errors, []);
    console.log('audio-bass: PASS');
  } finally { await t.close(); }
})().catch(e => { console.error(e); process.exit(1); });
