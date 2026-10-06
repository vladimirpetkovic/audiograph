// Shared helpers for the v31 GPU particle acceptance test and benchmark.
const fs = require('node:fs');
process.env.AUDIOGRAPH_GPU_BUILD = process.env.AUDIOGRAPH_PARTICLE_BUILD || process.env.AUDIOGRAPH_GPU_BUILD || 'versions/audiograph_31.html';
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && fs.existsSync(chrome)) process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = chrome;
const common = require('./gpu-common.cjs');

// Builds a stacked particle scene. Math.random is seeded so CPU and GPU runs spawn identical particles.
async function particleScene(page, o) {
  await page.evaluate(o => {
    const st = getState(), L = st.stackLayouts[0];
    st.stackLayouts = Array.from({ length: o.layers || 1 }, (_, i) => ({ ...JSON.parse(JSON.stringify(L)), layout: o.layout || 'circle', opacity: 90,
      params: { ...L.params, _lines: o.lines || 120, _thick: 1, _lineShape: 'straight', _rotation: i * 31, _colorMode: o.color || 'toneramp', _showOutline: false,
        _particlesOn: true, _particleShape: o.shape || 'circle', pPartDensity: o.density || 30, pPartLife: o.life || 200, pPartSize: o.size || 6,
        pPartSpread: 50, pPartGravity: o.gravity || 0, pPartDamping: 97, pPartTrail: o.trail || 0, pPartEnergy: 1, pPartSpeed: o.speed || 2,
        pNoisePerlin: o.perlin || 0, pNoiseCurl: o.curl || 0, pNoiseBrownian: 0, pNoiseVortex: o.vortex || 0, pNoiseScale: 30, pNoiseSpeed: 20 } }));
    st.activeLayerIdx = 0; st.sliders.pLines = o.lines || 120; st.sliders.rColor = 0;
    st.sliders.pTwist = o.twist || 0; st.sliders.pBulge = o.bulge || 0; st.sliders.pWave = o.wave || 0; st.sliders.pDepth = o.depth || 0;
    applyState(st); postFxEnabled = false;
  }, o);
}
// Resets particle state and reseeds Math.random identically before a run.
async function reseed(page, seed) {
  await page.evaluate(seed => {
    let a = seed >>> 0; Math.random = function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    particleLayers = {}; globalFrame = 1000;
  }, seed);
}
module.exports = { ...common, particleScene, reseed };
