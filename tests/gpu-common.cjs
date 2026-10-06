// Shared helpers for the v30 GPU renderer acceptance test and benchmark.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const build = process.env.AUDIOGRAPH_GPU_BUILD || 'versions/audiograph_30.html';

function audioFile(seconds = 12) {
  const rate = 8000, samples = rate * seconds, wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const t = i / rate, env = 0.35 + 0.65 * Math.abs(Math.sin(t * 2.3)) * (0.5 + 0.5 * Math.sin(t * 0.7));
    wav.writeInt16LE(Math.round((Math.sin(t * 2 * Math.PI * 220) * 0.6 + Math.sin(t * 2 * Math.PI * 1375) * 0.25) * env * 26000), 44 + i * 2);
  }
  return { name: 'gpu.wav', mimeType: 'audio/wav', buffer: wav };
}

async function open({ headless = process.env.AUDIOGRAPH_HEADED ? false : true, viewport = { width: 1440, height: 900 }, query = '' } = {}) {
  const html = fs.readFileSync(path.join(__dirname, '..', build));
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({
      headless,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--autoplay-policy=no-user-gesture-required'],
    });
    const context = await browser.newContext({ viewport }), errors = [];
    context.on('page', page => page.on('pageerror', e => errors.push(e.message)));
    await context.route('https://fonts.googleapis.com/**', route => route.abort());
    const page = await context.newPage();
    await page.goto(process.env.AUDIOGRAPH_GPU_URL || `http://127.0.0.1:${server.address().port}/${query}`);
    await page.locator('#fileInput').setInputFiles(audioFile());
    await page.waitForFunction(() => audioBuffer && audio && source);
    return { browser, server, page, errors, async close() { try { await browser.close(); } finally { server.close(); } } };
  } catch (e) { if (browser) await browser.close(); server.close(); throw e; }
}

// Deterministic static state: no particles (stochastic), no post-FX, no camera.
async function deterministic(page, state) {
  await page.evaluate(st => {
    if (st) applyState(JSON.parse(JSON.stringify(st)));
    particlesOn = false; postFxEnabled = false;
    stackLayouts.forEach(l => { if (l.params) l.params._particlesOn = false; });
    particleLayers.length = 0; presetLockFrames = 0;
  }, state || null);
}

async function frame(page, mode) {
  return page.evaluate(m => {
    agGpu.setMode(m); agGpu.resetStats(); renderDensity();
    const d = frameCtx.getImageData(0, 0, frameCv.width, frameCv.height).data;
    return { w: frameCv.width, h: frameCv.height, data: Array.from(d), stats: agGpu.stats(), status: agGpu.status() };
  }, mode);
}

// Mean absolute RGB difference (0-255) and fraction of pixels differing by more than 64 in any channel.
function diff(a, b) {
  let sum = 0, big = 0, n = a.data.length / 4;
  for (let i = 0; i < a.data.length; i += 4) {
    let m = 0;
    for (let c = 0; c < 3; c++) { const d = Math.abs(a.data[i + c] - b.data[i + c]); sum += d; if (d > m) m = d; }
    if (m > 64) big++;
  }
  return { mean: sum / (n * 3), big: big / n };
}
function inked(a, bg) {
  let k = 0; for (let i = 0; i < a.data.length; i += 4) if (Math.abs(a.data[i] - bg[0]) + Math.abs(a.data[i + 1] - bg[1]) + Math.abs(a.data[i + 2] - bg[2]) > 30) k++;
  return k / (a.data.length / 4);
}

module.exports = { open, deterministic, frame, diff, inked, build };
