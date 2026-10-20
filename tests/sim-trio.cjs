process.env.AUDIOGRAPH_GPU_BUILD = process.env.AUDIOGRAPH_TRIO_BUILD || 'index.html';
process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||= '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const assert = require('node:assert/strict');
const path = require('node:path');
const { open } = require('./gpu-common.cjs');

(async () => {
  const t = await open({ viewport: { width: 1280, height: 900 } });
  const { page, errors } = t;
  try {
    // Read back real GPU state; production resources need no testing API.
    await page.evaluate(() => {
      window.__buffers = []; window.__fields = [];
      const adapter = navigator.gpu.requestAdapter.bind(navigator.gpu);
      navigator.gpu.requestAdapter = async options => {
        const a = await adapter(options); const request = a.requestDevice.bind(a);
        a.requestDevice = async options => {
          const d = await request(options); window.__device = d;
          const buffer = d.createBuffer.bind(d), texture = d.createTexture.bind(d);
          d.createBuffer = options => {
            if (options.label?.startsWith('boids state')) {
              const b = buffer({ ...options, usage: options.usage | GPUBufferUsage.COPY_DST });
              __buffers.push(b); return b;
            }
            return buffer(options);
          };
          d.createTexture = options => {
            const field = !!(options.usage & GPUTextureUsage.STORAGE_BINDING);
            const tx = texture(field ? { ...options, usage: options.usage | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST } : options);
            if (field) __fields.push({ tx, w: options.size[0], h: options.size[1] });
            return tx;
          };
          return d;
        };
        return a;
      };
      window.__readBoids = async () => {
        await agSim.sync();
        const s = Object.values(agSim.stats().layers)[0], b = __buffers[s.steps % 2];
        const out = __device.createBuffer({ size: b.size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
        const enc = __device.createCommandEncoder(); enc.copyBufferToBuffer(b, 0, out, 0, b.size); __device.queue.submit([enc.finish()]);
        await out.mapAsync(GPUMapMode.READ);
        const data = Array.from(new Float32Array(out.getMappedRange())); out.unmap(); out.destroy();
        return data;
      };
      window.__readField = async () => {
        await agSim.sync();
        const f = __fields[0], stride = Math.ceil(f.w * 8 / 256) * 256;
        const out = __device.createBuffer({ size: stride * f.h, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
        const enc = __device.createCommandEncoder();
        enc.copyTextureToBuffer({ texture: f.tx }, { buffer: out, bytesPerRow: stride }, [f.w, f.h]);
        __device.queue.submit([enc.finish()]); await out.mapAsync(GPUMapMode.READ);
        const words = new Uint16Array(out.getMappedRange()), data = [];
        const half = n => {
          const sign = n & 0x8000 ? -1 : 1, exp = (n >> 10) & 31, mantissa = n & 1023;
          return sign * (exp === 0 ? mantissa * 2 ** -24 : exp === 31 ? (mantissa ? NaN : Infinity) : (1 + mantissa / 1024) * 2 ** (exp - 15));
        };
        for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w * 4; x++) data.push(half(words[y * stride / 2 + x]));
        out.unmap(); out.destroy(); return { data, w: f.w, h: f.h };
      };
    });
    assert.equal(await page.evaluate(() => agSim.ready()), 'ready', JSON.stringify(await page.evaluate(() => agSim.stats())));
    const naming = await page.evaluate(() => ({
      picker: document.querySelector('#panelAppear .panel-body .prow-stack .prow-label').textContent,
      guide: document.querySelector('#g-layout h3').textContent,
      tutorial: agTour.steps.find(s => s.grp === 'layout').t,
    }));
    assert.equal(naming.picker, 'Emitters'); assert.match(naming.guide, /Emitters/); assert.equal(naming.tutorial, 'Pick your Emitter');
    const init = (mode, params = {}, options = {}, spec = 0) => page.evaluate(({ mode, params, options, spec }) => {
      agSim.reset(); __buffers.length = 0; __fields.length = 0;
      agSim.noPrewarm = true; agSim.inject({ spec, onset: 0 });
      const p = Object.assign(getDefaultLayerParams(), params);
      p._sim = Object.assign({}, AG_SIM_DEF_OPT, { q: 'low', auto: 'off' }, options);
      p.pSimExpo = 0; p.pSimSwirlSnd = 0; p.pSimReact = 0; p._particlesOn = false;
      applyState({ stackLayouts: [{ layout: mode, opacity: 100, params: p }], activeLayerIdx: 0 });
      renderDensity();
    }, { mode, params, options, spec });
    const feed = (n, spec = 0, beat = 0) => page.evaluate(({ n, spec, beat }) => {
      agSim.inject({ spec, onset: beat }); agSim.advance(n); renderDensity();
    }, { n, spec, beat });
    const pixels = () => page.evaluate(() => {
      const p = agSim.pixels(simUid); let lit = 0, rgb = [0, 0, 0];
      const signature = [];
      for (let i = 0; i < p.data.length; i += 4) {
        if (Math.max(p.data[i], p.data[i + 1], p.data[i + 2]) > 12) {
          lit++; for (let c = 0; c < 3; c++) rgb[c] += p.data[i + c];
        }
        if (i % 388 === 0) signature.push(p.data[i], p.data[i + 1], p.data[i + 2]);
      }
      return { lit, rgb, signature };
    });
    const particleStats = data => {
      const agents = [];
      for (let i = 0; i < data.length; i += 12) if (data[i + 4] > 0) agents.push(data.slice(i, i + 12));
      let distance = 0, pairs = 0, vx = 0, vy = 0, speed = 0;
      for (let i = 0; i < agents.length; i++) {
        const a = agents[i]; vx += a[2]; vy += a[3]; speed += Math.hypot(a[2], a[3]);
        for (let j = i + 1; j < agents.length; j++) { distance += Math.hypot(a[0] - agents[j][0], a[1] - agents[j][1]); pairs++; }
      }
      return { count: agents.length, distance: distance / Math.max(1, pairs), alignment: Math.hypot(vx, vy) / Math.max(1e-6, speed) };
    };
    const flock = async (params, positions, velocities) => {
      await init('simboids', { pBdAmount: 10, pBdWander: 0, pBdSpeed: 30, pBdRadius: 40, pBdCohesion: 0, pBdAlign: 0, pBdSeparate: 0, ...params });
      await page.evaluate(({ positions, velocities }) => {
        const data = new Float32Array(__buffers[0].size / 4);
        for (let i = 0; i < positions.length; i++) data.set([...positions[i], ...velocities[i], 100, 100, 0.3 + i * 0.1, 0.5, 1, 0, 0, 1], i * 12);
        for (const b of __buffers) __device.queue.writeBuffer(b, 0, data);
      }, { positions, velocities });
      await feed(24);
      const data = await page.evaluate(() => __readBoids());
      assert.ok(data.every(Number.isFinite)); return particleStats(data);
    };
    const positions = [[-0.06, 0], [0, 0], [0.06, 0]], upward = [[0, 0.15], [0, 0.15], [0, 0.15]];
    const loose = await flock({}, positions, upward), cohesive = await flock({ pBdCohesion: 200 }, positions, upward);
    assert.equal(cohesive.count, 3); assert.ok(cohesive.distance < loose.distance * 0.75, JSON.stringify({ loose, cohesive }));
    const apart = [[0.15, 0], [-0.15, 0], [0, 0.15]];
    const unaligned = await flock({}, positions, apart), aligned = await flock({ pBdAlign: 200 }, positions, apart);
    assert.ok(aligned.alignment > unaligned.alignment + 0.3, JSON.stringify({ unaligned, aligned }));
    const tight = [[-0.007, 0], [0, 0], [0.007, 0]];
    const crowded = await flock({}, tight, upward), separated = await flock({ pBdSeparate: 200 }, tight, upward);
    assert.ok(separated.distance > crowded.distance * 2, JSON.stringify({ crowded, separated }));
    console.log('ok native flocking readback: cohesion, alignment, separation and finite ping-pong state');

    const sandStats = field => {
      let count = 0, ysum = 0, minX = field.w, maxX = -1;
      assert.ok(field.data.every(Number.isFinite));
      for (let y = 0; y < field.h; y++) for (let x = 0; x < field.w; x++) {
        const i = (y * field.w + x) * 4;
        if (field.data[i + 3] > 0.5) { count++; ysum += y; minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
      }
      return { count, y: ysum / Math.max(1, count), width: maxX - minX + 1 };
    };
    const sand = async (params, options = {}, column = false) => {
      await init('simsand', { pSaGrain: 6, pSaAmount: 0, pSaKick: 0, ...params }, options);
      await page.evaluate(column => {
        for (const f of __fields.slice(0, 2)) {
          const data = new Uint16Array(f.w * f.h * 4);
          for (let i = 0; i < 20; i++) {
            const x = column ? Math.floor(f.w / 2) : Math.floor(f.w / 2) - 10 + i;
            const y = column ? f.h - 1 - i : 8;
            data[(y * f.w + x) * 4] = 0x3c00; data[(y * f.w + x) * 4 + 3] = 0x3c00;
          }
          __device.queue.writeTexture({ texture: f.tx }, data, { bytesPerRow: f.w * 8 }, [f.w, f.h]);
        }
      }, column);
      await feed(180); return sandStats(await page.evaluate(() => __readField()));
    };
    const falling = await sand({ pSaFriction: 35 });
    assert.equal(falling.count, 20, 'solid floor conserves all grains'); assert.ok(falling.y > 60, JSON.stringify(falling));
    const drained = await sand({ pSaFriction: 35 }, { saFloor: 'open' }); assert.equal(drained.count, 0);
    const stiff = await sand({ pSaFriction: 100 }, {}, true), sliding = await sand({ pSaFriction: 0 }, {}, true);
    assert.equal(stiff.count, 20); assert.equal(sliding.count, 20);
    assert.ok(sliding.width > stiff.width + 2, JSON.stringify({ stiff, sliding }));
    console.log('ok native sand readback: gravity, exact grain conservation, floor drainage and friction');

    await init('simferro', { pFeForce: 0, pFeMotion: 0 }); await feed(120);
    const flat = await page.evaluate(() => __readField());
    const maxHeight = f => Math.max(...f.data.filter((_, i) => i % 4 === 0));
    const flatHeight = maxHeight(flat);
    await init('simferro', { pFeForce: 150, pFeMotion: 0 }); await feed(120);
    const spikes = await page.evaluate(() => __readField());
    assert.ok(spikes.data.every(Number.isFinite)); assert.ok(flatHeight > 0.01 && flatHeight < 0.04);
    assert.ok(maxHeight(spikes) > flatHeight * 3, 'magnetic field raises actual GPU heights');
    const shiny = await pixels(); assert.ok(shiny.lit > 500);
    await page.evaluate(() => { const e = document.getElementById('pFeRough'); e.value = 95; e.dispatchEvent(new Event('input', { bubbles: true })); renderDensity(); });
    const rough = await pixels();
    assert.ok(shiny.signature.some((v, i) => Math.abs(v - rough.signature[i]) > 20), 'roughness affects metallic rendering');
    await page.evaluate(() => { const e = document.getElementById('pFeRough'); e.value = 22; e.dispatchEvent(new Event('input', { bubbles: true })); renderDensity(); });
    await page.screenshot({ path: path.resolve(__dirname, '../../sim-trio-ferro.png') });
    console.log('ok native ferrofluid: damped height dynamics, magnetic spikes and metallic roughness');

    for (const mode of ['simboids', 'simsand']) {
      await init(mode, mode === 'simboids' ? { pBdSpeed: 0, pSimEnergy: 0 } : { pSaGravity: 0 }, {}, 0.7);
      await page.evaluate(() => {
        const cv = document.createElement('canvas'); cv.width = 64; cv.height = 32;
        const ctx = cv.getContext('2d'); ctx.fillStyle = 'red'; ctx.fillRect(0, 0, 64, 32);
        simEmitterData = agEmitterImageAsset(cv, 64, 32, 'red.png');
        setSimOpt(_simEmitterKey(layoutMode), 'image'); setSimOpt('emitColor', 'source'); _simStore(); agSim.reset(); renderDensity();
      });
      await feed(140, 0.7); const red = await pixels();
      assert.ok(red.lit > 20 && red.rgb[0] > 20 * (red.rgb[1] + red.rgb[2]), mode + ' source RGB: ' + JSON.stringify(red.rgb));
      const saved = await page.evaluate(() => getState());
      await page.evaluate(st => { applyState(st); }, saved);
      assert.equal(await page.evaluate(() => simOpt[_simEmitterKey(layoutMode)]), 'image');
      assert.equal(await page.evaluate(() => simEmitterData.name), 'red.png');
      await page.evaluate(() => { setSimOpt('emitColor', 'palette'); agSim.reset(); renderDensity(); });
      await feed(120, 0.7); const palette = await pixels();
      assert.ok(palette.rgb[1] + palette.rgb[2] > palette.rgb[0] * 0.1, mode + ' palette override');
      await page.evaluate(() => { setSimOpt(_simEmitterKey(layoutMode), 'camera'); agSim.reset(); renderDensity(); });
      assert.equal(await page.evaluate(() => camActive), false);
      await feed(30, 0.7);
      assert.equal((await pixels()).lit, 0, 'stopped camera emits nothing: ' + mode);
    }
    console.log('ok new source emitters: image RGB, palette override, persistence and no automatic camera access');

    const prompts = await page.evaluate(() => {
      agAuto.setMatch(100);
      const result = ['boids flock', 'granular sand', 'ferrofluid'].map(text => { agAuto.setVibe(text); return agAuto.vibe().layouts; });
      agAuto.setVibe(''); return result;
    });
    assert.ok(prompts[0].includes('simboids') && prompts[1].includes('simsand') && prompts[2].includes('simferro'));
    for (const mode of ['simboids', 'simsand', 'simferro']) {
      await init(mode, {}, {}, 0.6); await feed(60, 0.6, 0.8);
      assert.ok((await pixels()).lit > 20, mode + ' default audio-driven output');
      await page.evaluate(() => { simApplyPreset(1); });
      const saved = await page.evaluate(() => getState());
      assert.equal(saved.stackLayouts[0].layout, mode);
      const svg = await page.evaluate(() => {
        const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 576;
        const ctx = cv.getContext('2d'); agSim.expMode(true);
        try { agSim.draw(ctx, cv.width, cv.height, null, null, true); } finally { agSim.expMode(false); }
        return { out: Object.values(agSim.stats().layers)[0].exportOut, errors: agSim.stats().errors };
      });
      assert.deepEqual(svg.out, [1024, 576]); assert.deepEqual(svg.errors, []);
      await page.setViewportSize({ width: 390, height: 900 });
      await page.evaluate(() => document.querySelectorAll('.panel').forEach(p => p.classList.toggle('closed', p.id !== 'panelAppear')));
      await page.locator('#layoutOpts_' + mode).scrollIntoViewIfNeeded();
      assert.ok(await page.locator('#layoutOpts_' + mode).isVisible());
      await page.setViewportSize({ width: 1280, height: 900 });
    }
    assert.deepEqual(await page.evaluate(() => agSim.stats().errors), []);
    assert.deepEqual(errors, []);
    console.log('ALL PASS: three native GPU sims, real solver behavior, sources, presets, mobile panels and still export');
  } finally { await t.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
