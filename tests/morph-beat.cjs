// v31 On Beat glide: scripted beat timings drive pmTickGlide at a fixed 60 Hz step (position continuity,
// settle time, retrigger, rapid-beat lead bound, Random hand-over), then real 120 bpm bass pulses drive
// the live scheduler in Glide and Snap (v30) modes for comparison, plus mode persistence.
const assert = require('node:assert/strict');
const { open, wav, kicks, load } = require('./audio-common.cjs');
(async () => {
  const t = await open({ viewport: { width: 1000, height: 700 } });
  const { page, errors } = t;
  try {
    // Kicks with a short broadband beater click (as in real drums) so the v30 Snap detector, which reads
    // 0-6 kHz, also fires; pure sub-bass pulses never trigger it (v30 limitation).
    let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
    const k = kicks(0.7, 0.05), click = (t) => k(t) + 0.5 * rnd() * Math.exp(-(t % 0.5) / 0.012);
    await load(page, wav([[0.5, () => 0], [8, click]], 'kicks.wav'));
    const S = await page.evaluate(() => {
      const names = Object.keys(getAllPresets()).slice(0, 3); morphSet = names.slice(); pmRandom = false; pmAuto = false; pmBeatSync = true;
      const run = (mode, beats, dur) => {
        setMorphBeatMode(mode); pmT = 0; _pmGlide = null; const N = getMorphPool().length, out = [];
        let bi = 0; for (let f = 0; f * (1 / 60) <= dur + 1e-9; f++) {
          const tt = f / 60; while (bi < beats.length && beats[bi] <= tt + 1e-9) { pmGlideBeat(); bi++; }
          pmTickGlide(1 / 60); out.push({ t: tt, s: _pmGlide.s, v: _pmGlide.v, target: _pmGlide.target, pmT, N });
        }
        return out;
      };
      const r = {};
      r.single = run('glide4', [0], 1.2);
      r.retrig = run('glide4', [0, 0.2], 1.5);
      r.rapid = run('glide4', Array.from({ length: 40 }, (_, i) => i * 0.05), 2.5);
      r.one = run('glide1', [0, 0.5, 1.0, 1.5, 2.0], 3.2); // crosses the 3-preset loop boundary
      pmRandom = true; pmFromName = names[0]; pmToName = names[1]; pmT = 0; _pmGlide = null; setMorphBeatMode('glide1');
      const from0 = pmFromName; pmGlideBeat(); for (let i = 0; i < 90; i++) pmTickGlide(1 / 60);
      r.random = { from0, from1: pmFromName, pmT };
      pmRandom = false; pmBeatSync = false; return r;
    });
    const metrics = (rows, wrapN) => {
      let maxStep = 0, maxDv = 0, maxLead = 0, back = 0;
      for (let i = 1; i < rows.length; i++) { let d = rows[i].s - rows[i - 1].s; if (wrapN && d < -wrapN / 2) d += wrapN; maxStep = Math.max(maxStep, d); if (d < -1e-9) back++; maxDv = Math.max(maxDv, Math.abs(rows[i].v - rows[i - 1].v)); }
      rows.forEach(r => { maxLead = Math.max(maxLead, r.target - r.s); });
      return { maxStep, maxDv, maxLead, back };
    };
    const settle = (rows, goal, tol) => { const i = rows.findIndex(r => Math.abs(r.s - goal) < tol); return i < 0 ? Infinity : rows[i].t; };
    const m1 = metrics(S.single), st1 = settle(S.single, 0.25, 0.0025);
    console.log(`single ¼ beat: settle ${st1.toFixed(2)} s, end ${S.single.at(-1).s.toFixed(4)}, max step ${m1.maxStep.toFixed(4)}/frame, max dv ${m1.maxDv.toFixed(3)}, backsteps ${m1.back}`);
    assert.ok(st1 <= 0.8 && Math.abs(S.single.at(-1).s - 0.25) < 1e-3 && m1.back === 0 && S.single.every(r => r.s <= r.target + 1e-9), 'single beat settles, no overshoot');
    assert.ok(m1.maxStep < 0.02, 'continuous position');
    const mr = metrics(S.retrig);
    console.log(`retrigger at 0.2 s: end ${S.retrig.at(-1).s.toFixed(4)}, max step ${mr.maxStep.toFixed(4)}, max dv ${mr.maxDv.toFixed(3)} (no restart from 0)`);
    assert.ok(Math.abs(S.retrig.at(-1).s - 0.5) < 2e-3 && mr.back === 0 && mr.maxStep < 0.03, 'retrigger extends target smoothly');
    const mp = metrics(S.rapid, 3), adv = S.rapid.reduce((a, r, i) => i ? a + ((r.s - S.rapid[i - 1].s + 4.5) % 3 - 1.5) : 0, 0);
    console.log(`40 beats @50 ms: lead max ${mp.maxLead.toFixed(3)} (cap 0.375), advance ${adv.toFixed(3)} segments (40 beats x0.25 = 10 if queued), max step ${mp.maxStep.toFixed(4)}`);
    assert.ok(mp.maxLead <= 0.375 + 1e-9 && mp.back === 0 && mp.maxStep < 0.06 && adv < 10, 'rapid beats bounded');
    const mo = metrics(S.one, 3);
    console.log(`glide 1/beat x5 over 3-preset loop: end s ${S.one.at(-1).s.toFixed(3)} (5 mod 3 = 2), max step ${mo.maxStep.toFixed(4)}, backsteps ${mo.back}`);
    assert.ok(Math.abs(S.one.at(-1).s - 2) < 0.01 && mo.back === 0 && mo.maxStep < 0.12 && mo.maxLead <= 1.5 + 1e-9, 'glide1 wraps playlist continuously');
    assert.ok(S.random.from1 !== S.random.from0 && S.random.pmT < 0.01, 'Random hands over to next pair at segment end');
    // Real bass pulses through the live scheduler (pmTick on the shared output rAF).
    const live = async mode => page.evaluate(async mode => {
      setMorphBeatMode(mode); if (playing) togglePlay(); audio.currentTime = 0; await new Promise(r => setTimeout(r, 300)); agAudio.reset();
      pmT = 0; _pmGlide = null; _pmTransit = false; const on0 = agAudio.features().onsets;
      toggleMorphBeat(); togglePlay(); const rows = []; let beats = 0, lastTo = pmToName, lastT = pmT;
      await new Promise(res => { const tick = () => { if (pmBeatMode === 'snap') { if (pmToName !== lastTo || pmT < lastT - 0.5) beats++; lastTo = pmToName; lastT = pmT; }
        rows.push({ t: audio.currentTime, pos: pmBeatMode === 'snap' ? beats + pmT : _pmGlide ? _pmGlide.s + _pmGlide.wraps : 0 }); if (audio.currentTime > 6.5) res(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
      togglePlay(); toggleMorphBeat(); bakeMorph();
      return { rows, onsets: agAudio.features().onsets - on0, state: { pmAuto, pmBeatSync } };
    }, mode);
    await page.evaluate(() => { const o = pmTickGlide; window.pmTickGlide = function (dt) { const g = _pmGlideState(), N = getMorphPool().length, b = g.s; o(dt); if (g.wraps == null) g.wraps = 0; if (g.s < b - 0.5) g.wraps += pmRandom ? 1 : N; }; });
    const res = {};
    for (const m of ['glide4', 'snap']) {
      const r = await live(m), rows = r.rows.filter(x => x.t > 1); let maxJerk = 0, maxJump = 0;
      for (let i = 2; i < rows.length; i++) { maxJump = Math.max(maxJump, Math.abs(rows[i].pos - rows[i - 1].pos)); maxJerk = Math.max(maxJerk, Math.abs(rows[i].pos - 2 * rows[i - 1].pos + rows[i - 2].pos)); }
      res[m] = { onsets: r.onsets, advance: rows.at(-1).pos - rows[0].pos, maxJump, maxJerk, frames: rows.length, state: r.state };
      console.log(`live 120 bpm kicks ${m.padEnd(6)}: onsets ${r.onsets}, advance ${res[m].advance.toFixed(2)} presets in ${(rows.at(-1).t - rows[0].t).toFixed(1)} s, max frame step ${maxJump.toFixed(3)}, max 2nd diff ${maxJerk.toFixed(4)}, frames ${rows.length}`);
      assert.deepEqual(r.state, { pmAuto: false, pmBeatSync: false }, 'stop clears beat mode');
    }
    assert.ok(res.glide4.onsets >= 9 && res.glide4.onsets <= 14, 'bass onsets track 120 bpm pulses');
    assert.ok(res.glide4.advance > 0.25 * 7 && res.glide4.advance <= 0.25 * 14, 'glide advances a quarter per beat');
    assert.ok(res.glide4.maxJerk < res.snap.maxJerk / 2, 'glide is smoother than snap');
    // Persistence of the beat style.
    await page.evaluate(() => setMorphBeatMode('glide1')); await page.reload(); await page.waitForFunction(() => typeof pmBeatMode === 'string');
    assert.deepEqual(await page.evaluate(() => [pmBeatMode, document.getElementById('morphBeatMode').value]), ['glide1', 'glide1']);
    assert.deepEqual(errors, []);
    console.log('morph-beat: PASS');
  } finally { await t.close(); }
})().catch(e => { console.error(e); process.exit(1); });
