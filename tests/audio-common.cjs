// Shared v31 audio fixtures: generated WAV timelines (silence, equal-amplitude low/high tones, bass
// pulses, amplitude ramp), file loading and a per-frame recorder of the bass shaping stage.
process.env.AUDIOGRAPH_PARTICLE_BUILD = process.env.AUDIOGRAPH_BUILD_31 || process.env.AUDIOGRAPH_PARTICLE_BUILD || 'versions/audiograph_31.html';
const common = require('./particles-common.cjs');
const RATE = 22050;
// segments: [seconds, fn(t local, t global) -> sample]
function wav(segments, name = 'bass.wav') {
  const total = segments.reduce((a, s) => a + s[0], 0), n = Math.round(RATE * total), b = Buffer.alloc(44 + n * 2);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(RATE, 24); b.writeUInt32LE(RATE * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  let i = 0, t0 = 0;
  for (const [d, fn] of segments) { const m = Math.round(RATE * d); for (let k = 0; k < m && i < n; k++, i++) { const v = Math.max(-1, Math.min(1, fn(k / RATE, t0 + k / RATE))); b.writeInt16LE(Math.round(v * 32000), 44 + i * 2); } t0 += d; }
  return { name, mimeType: 'audio/wav', buffer: b, total };
}
const sine = (f, a) => t => a * Math.sin(2 * Math.PI * f * t);
const silence = () => 0;
// 120 bpm kicks: 55 Hz body with fast exponential decay, plus an optional quiet constant hi-hat-band tone.
const kicks = (a, bed = 0) => t => { const p = t % 0.5; return a * Math.exp(-p / 0.09) * Math.sin(2 * Math.PI * 55 * p) + bed * Math.sin(2 * Math.PI * 3000 * t); };
async function load(page, file) {
  await page.evaluate(() => { window.__prevBuf = audioBuffer; });
  await page.locator('#fileInput').setInputFiles(file);
  await page.waitForFunction(() => audioBuffer && audioBuffer !== window.__prevBuf && audio && source);
}
// Plays [from, to) seconds of the loaded file and records, per animation frame, the shaping stage
// (input/output means of the per-line values) and bass features.
async function record(page, from, to, setup) {
  return page.evaluate(async ({ from, to, setup }) => {
    if (setup) (0, eval)(setup);
    if (playing) togglePlay();
    audio.currentTime = from; await new Promise(r => setTimeout(r, 400)); agAudio.reset();
    const rows = [], orig = agAudio.shape;
    agAudio.shape = function (vals, an) {
      const out = orig.call(agAudio, vals, an), f = agAudio.features();
      const m = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
      if (!rows.length || rows[rows.length - 1].frame !== globalFrame)
        rows.push({ frame: globalFrame, t: audio.currentTime, inMean: m(vals), outMean: m(out), outMax: Math.max(...out), gain: f.gain, env: f.env, level: f.level, onsets: f.onsets });
      return out;
    };
    try {
      togglePlay();
      await new Promise(r => { const chk = () => (audio.currentTime >= to || audio.ended) ? r() : setTimeout(chk, 20); chk(); });
    } finally { if (playing) togglePlay(); agAudio.shape = orig; }
    return rows;
  }, { from, to, setup: setup || '' });
}
const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
module.exports = { ...common, wav, sine, silence, kicks, load, record, mean };
