process.env.AUDIOGRAPH_GPU_BUILD = process.env.AUDIOGRAPH_EMITTER_BUILD || 'index.html';
process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||= '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const assert = require('node:assert/strict');
const path = require('node:path');
const { open } = require('./gpu-common.cjs');

(async () => {
  const t = await open({
    viewport: { width: 1280, height: 900 },
    extraArgs: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    permissions: ['camera'],
  });
  const { page, errors } = t;
  try {
    const png = async color => {
      const url = await page.evaluate(color => {
        const cv = document.createElement('canvas'); cv.width = 64; cv.height = 32;
        const ctx = cv.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, 64, 32);
        return cv.toDataURL();
      }, color);
      return { name: color === 'red' ? 'red.png' : 'blue.png', mimeType: 'image/png', buffer: Buffer.from(url.split(',')[1], 'base64') };
    };
    const redFile = await png('red'), blueFile = await png('blue');
    const sampling = await page.evaluate(() => {
      const cv = document.createElement('canvas'); cv.width = 40; cv.height = 20;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 10, 20);
      ctx.fillStyle = '#808080'; ctx.fillRect(10, 0, 10, 20);
      ctx.fillStyle = '#000'; ctx.fillRect(20, 0, 10, 20);
      const asset = agEmitterImageAsset(cv, 40, 20, 'mask.png');
      let bright = 0, outside = 0, finite = true, bounds = true;
      for (let i = 0; i < asset.points.length; i += 5) {
        const [x, y, r, g, b] = asset.points.slice(i, i + 5);
        if (x < -0.5) bright++;
        if (x >= 0) outside++;
        finite &&= [x, y, r, g, b].every(Number.isFinite);
        bounds &&= Math.abs(x) <= 1 && Math.abs(y) <= 0.5 && [r, g, b].every(v => v >= 0 && v <= 1);
      }
      ctx.clearRect(0, 0, 40, 20);
      let emptyError = false;
      try { agEmitterImageAsset(cv, 40, 20, 'empty.png'); } catch (e) { emptyError = /no bright/.test(e.message); }
      return { count: asset.points.length / 5, ratio: bright / 2048, outside, finite, bounds, emptyError, darkCamera: agEmitterImageAsset(cv, 40, 20, 'Webcam', true).points.length };
    });
    assert.equal(sampling.count, 2048); assert.ok(sampling.finite && sampling.bounds);
    assert.ok(sampling.ratio > 0.63 && sampling.ratio < 0.70, JSON.stringify(sampling));
    assert.equal(sampling.outside, 0); assert.ok(sampling.emptyError); assert.equal(sampling.darkCamera, 0);
    console.log('ok image sampling: brightness weighting, alpha/black exclusion, colors, aspect and empty-source errors');

    await page.evaluate(() => { setLayout('simparticles'); setSimOpt('pEmit', 'image'); });
    assert.equal(await page.locator('[data-simk="pEmit"][data-simv="sphere"],[data-simk="pEmit"][data-simv="obj"]').count(), 0);
    assert.equal(await page.locator('#simEmitterInfo').isVisible(), true);
    await page.setInputFiles('#simEmitterFile', redFile);
    await page.waitForFunction(() => simEmitterData && simEmitterData.name === 'red.png');
    const original = await page.evaluate(() => JSON.parse(JSON.stringify(getState())));
    assert.equal(original.stackLayouts[0].params._sim.pEmit, 'image');
    assert.equal(original.stackLayouts[0].params._simEmitter.points.length, 2048 * 5);
    await page.setInputFiles('#simEmitterFile', { name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
    await page.waitForFunction(() => document.getElementById('simEmitterInfo').textContent.includes('Could not load'));
    assert.deepEqual(await page.evaluate(() => simEmitterData), original.stackLayouts[0].params._simEmitter);
    await page.setInputFiles('#simEmitterFile', { ...await png('black'), name: 'black.png' });
    await page.waitForFunction(() => document.getElementById('simEmitterInfo').textContent.includes('no bright'));
    assert.deepEqual(await page.evaluate(() => simEmitterData), original.stackLayouts[0].params._simEmitter, 'empty image keeps the valid source');
    await page.evaluate(() => loadSimEmitterFile({ target: { value: '', files: [{ name: 'huge.png', size: 11 * 1048576 }] } }));
    assert.match(await page.locator('#simEmitterInfo').textContent(), /over 10 MiB/);
    await page.evaluate(() => { addLayer(); setLayout('simfluid'); setSimOpt('fEmit', 'image'); });
    assert.equal(await page.evaluate(() => simEmitterData), null, 'no image borrowed by a new layer');
    await page.evaluate(() => selectLayer(0));
    assert.equal(await page.evaluate(() => simEmitterData.name), 'red.png');
    await page.evaluate(st => { resetAll(); applyState(st); }, original);
    assert.deepEqual(await page.evaluate(() => simEmitterData), original.stackLayouts[0].params._simEmitter);
    await page.evaluate(() => {
      undoStack.length = 0; undoLast = 0; _captureClean(); setSimOpt('pEmit', 'camera'); undo();
    });
    assert.equal(await page.evaluate(() => simOpt.pEmit), 'image');
    await page.evaluate(() => {
      window.__decodeImage = createImageBitmap;
      window.createImageBitmap = file => file.name === 'delayed.png'
        ? new Promise((resolve, reject) => { window.__finishUpload = () => __decodeImage(file).then(resolve, reject); })
        : __decodeImage(file);
    });
    await page.setInputFiles('#simEmitterFile', { ...redFile, name: 'delayed.png' });
    await page.evaluate(() => { addLayer(); setLayout('simsmoke'); __finishUpload(); });
    await page.waitForFunction(() => stackLayouts[0].params._simEmitter.name === 'delayed.png');
    assert.equal(await page.evaluate(() => simEmitterData), null, 'async upload remains on its owning layer');
    await page.evaluate(st => { resetAll(); applyState(st); }, original);
    await page.setInputFiles('#simEmitterFile', { ...redFile, name: 'delayed.png' });
    await page.setInputFiles('#simEmitterFile', blueFile);
    await page.waitForFunction(() => simEmitterData.name === 'blue.png');
    await page.evaluate(() => __finishUpload());
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => simEmitterData.name), 'blue.png', 'older decode cannot replace the latest upload');
    await page.evaluate(() => { createImageBitmap = __decodeImage; });
    await page.evaluate(st => {
      resetAll();
      const legacy = JSON.parse(JSON.stringify(st));
      legacy.stackLayouts[0].params._sim.pEmit = 'obj';
      legacy.stackLayouts[0].params._sim.fEmit = 'sphere';
      legacy.stackLayouts[0].params._sim.sEmit = 'sphere';
      legacy.stackLayouts[0].params._simEmitter = { name: 'old.obj', points: [0, 0, 0, 0, 0, 1] };
      applyState(legacy);
    }, original);
    assert.deepEqual(await page.evaluate(() => [simOpt.pEmit, simOpt.fEmit, simOpt.sEmit, simEmitterData]), ['ring', 'ring', 'floor', null]);
    assert.equal(await page.locator('#simEmitterFile').getAttribute('accept'), 'image/*');
    console.log('ok UI/state: removed 3D emitters, upload failures, async ownership/order, layer isolation, undo and legacy migration');

    await page.evaluate(st => { resetAll(); applyState(st); setSimOpt('q', 'low'); }, original);
    assert.equal(await page.evaluate(() => agSim.ready()), 'ready', JSON.stringify(await page.evaluate(() => agSim.stats())));
    const edit = values => page.evaluate(values => {
      for (const [id, value] of Object.entries(values)) {
        const e = document.getElementById(id); e.value = value; e.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, values);
    const feed = (n = 120) => page.evaluate(n => { agSim.inject({ spec: 0.7, onset: 0 }); agSim.advance(n); renderDensity(); }, n);
    const pixels = () => page.evaluate(() => {
      const p = agSim.pixels(simUid); let minX = p.width, maxX = -1, minY = p.height, maxY = -1, lit = 0, rgb = [0, 0, 0];
      for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
        const i = (y * p.width + x) * 4;
        if (Math.max(p.data[i], p.data[i + 1], p.data[i + 2]) > 12) {
          minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); lit++;
          for (let c = 0; c < 3; c++) rgb[c] += p.data[i + c];
        }
      }
      return { width: maxX - minX + 1, height: maxY - minY + 1, cx: (minX + maxX) / (2 * p.width), cy: (minY + maxY) / (2 * p.height), lit, rgb, red: rgb[0] / (rgb.reduce((a, b) => a + b, 0) || 1), blue: rgb[2] / (rgb.reduce((a, b) => a + b, 0) || 1) };
    });
    await edit({ pSimEnergy: 0, pSimSwirlSnd: 0, pSimReact: 0, pSpGravity: 0, pSpSwirl: 0, pSpTrail: 0, pSpLife: 80, pSpAmount: 200, pSpSize: 8, pEmitScale: 65 });
    await page.evaluate(() => { agSim.reset(); renderDensity(); });
    await feed(); const image = await pixels();
    assert.ok(image.lit > 100 && image.red > 0.95, 'native image color: ' + JSON.stringify(image));
    assert.ok(image.width / image.height > 1.8 && image.width / image.height < 2.2, 'image aspect ratio: ' + JSON.stringify(image));
    await edit({ pEmitRZ: 90 }); await page.evaluate(() => { agSim.reset(); renderDensity(); });
    await feed(); const turned = await pixels();
    assert.ok(turned.width / turned.height > 0.4 && turned.width / turned.height < 0.6, 'image rotation: ' + JSON.stringify(turned));
    await edit({ pEmitRZ: 0, pEmitScale: 30 }); await page.evaluate(() => { agSim.reset(); renderDensity(); });
    await feed(); const small = await pixels();
    assert.ok(small.width < image.width * 0.6 && small.height < image.height * 0.6, 'image size');
    await page.evaluate(() => {
      const cv = document.createElement('canvas'); cv.width = 64; cv.height = 32;
      cv.getContext('2d').fillRect(0, 0, 64, 32);
      const ctx = cv.getContext('2d'); ctx.fillStyle = 'red'; ctx.fillRect(0, 0, 16, 8);
      simEmitterData = agEmitterImageAsset(cv, 64, 32, 'corner.png');
      _simStore(); agSim.reset(); renderDensity();
    });
    await feed(); const corner = await pixels();
    assert.ok(corner.cx < 0.5 && corner.cy < 0.5, 'source image is not flipped: ' + JSON.stringify(corner));
    console.log('ok native particles: image color, aspect ratio, rotation, size and orientation');

    for (const mode of ['simfluid', 'simsmoke']) {
      await page.evaluate(({ st, mode }) => { resetAll(); applyState(st); setLayout(mode); setSimOpt('q', 'low'); setSimOpt(_simEmitterKey(mode), 'image'); }, { st: original, mode });
      await edit({ pSimEnergy: 100, pSimReact: 0, pSimSwirlSnd: 0, pEmitRZ: 0, pEmitScale: 65, pSimExpo: 0 });
      await page.evaluate(() => { agSim.reset(); renderDensity(); });
      await feed(110); const result = await pixels();
      assert.ok(result.lit > 100 && result.red > 0.9, mode + ' image color: ' + JSON.stringify(result));
      assert.deepEqual(await page.evaluate(() => agSim.stats().errors), []);
    }
    console.log('ok native fluid/smoke: image injection and transported source colors');

    await page.evaluate(() => { setLayout('simparticles'); setSimOpt('pEmit', 'camera'); });
    assert.equal(await page.evaluate(() => camActive), false, 'choosing Webcam never starts a camera automatically');
    await page.locator('#simEmitterCameraBtn').click();
    await page.waitForFunction(() => camActive && camVideo.readyState >= 2);
    const cameraState = await page.evaluate(() => JSON.parse(JSON.stringify(getState())));
    await page.evaluate(() => { window.__cameraTracks = camStream.getTracks(); });
    await page.locator('#simEmitterCameraBtn').click();
    assert.ok(await page.evaluate(() => __cameraTracks.every(t => t.readyState === 'ended')), 'stop releases camera tracks');
    await page.evaluate(st => { resetAll(); applyState(st); }, cameraState);
    assert.equal(await page.evaluate(() => camActive), false, 'camera state import does not request permission');
    await page.evaluate(() => {
      window.__getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Test permission denied', 'NotAllowedError'); };
    });
    const dialog = page.waitForEvent('dialog').then(async d => { assert.match(d.message(), /Could not start camera/); await d.dismiss(); });
    await page.locator('#simEmitterCameraBtn').click(); await dialog;
    await page.waitForFunction(() => !simEmitterCameraPending);
    assert.equal(await page.evaluate(() => camActive), false);
    assert.ok(await page.locator('#simEmitterInfo').evaluate(e => e.classList.contains('bad')));
    await page.evaluate(() => {
      window.__cameraRequests = 0;
      navigator.mediaDevices.getUserMedia = () => {
        __cameraRequests++;
        return new Promise(r => { window.__grantCamera = r; });
      };
      window.__cameraStart = toggleCam(); toggleCam();
    });
    await page.evaluate(async () => {
      stopCam();
      const cv = document.createElement('canvas'), stream = cv.captureStream(12);
      window.__cancelledTracks = stream.getTracks();
      __grantCamera(stream); await __cameraStart;
    });
    assert.equal(await page.evaluate(() => __cameraRequests), 1, 'concurrent starts share one permission request');
    assert.equal(await page.evaluate(() => camActive), false, 'late permission grant cannot restart a stopped camera');
    assert.ok(await page.evaluate(() => __cancelledTracks.every(t => t.readyState === 'ended')), 'cancelled permission grant releases its tracks');
    await page.evaluate(() => {
      const cv = window.__cameraCanvas = document.createElement('canvas'); cv.width = 128; cv.height = 64;
      const ctx = cv.getContext('2d'); ctx.fillStyle = 'red'; ctx.fillRect(0, 0, 128, 64);
      navigator.mediaDevices.getUserMedia = async constraints => {
        window.__cameraConstraints = constraints;
        const stream = cv.captureStream(12);
        setTimeout(() => { ctx.fillRect(0, 0, 128, 64); stream.getVideoTracks()[0].requestFrame(); }, 50);
        return stream;
      };
    });
    await page.locator('#simEmitterCameraBtn').click();
    await page.waitForFunction(() => camActive && camVideo.readyState >= 2 && agEmitterCameraFrame()?.points[2] === 1);
    assert.ok(await page.evaluate(() => !__cameraConstraints.audio), 'camera never requests microphone input');
    for (const mode of ['simparticles', 'simfluid', 'simsmoke', 'simboids', 'simsand']) {
      await page.evaluate(mode => { setLayout(mode); setSimOpt('q', 'low'); setSimOpt(_simEmitterKey(mode), 'camera'); setSimOpt('emitColor', 'source'); }, mode);
      await edit({ pSimEnergy: mode === 'simparticles' ? 0 : 100, pSimReact: 0, pSimSwirlSnd: 0, pSpGravity: 0, pSpSwirl: 0, pSpTrail: 0, pSpLife: 80, pSpAmount: 200, pSpSize: 8, pBdSpeed: 0, pEmitRZ: 0, pEmitScale: 65, pSimExpo: 0 });
      await page.evaluate(() => { agSim.reset(); renderDensity(); });
      await feed(110); const red = await pixels();
      assert.ok(red.lit > 100 && red.red > 0.9, mode + ' camera red: ' + JSON.stringify(red));
      await page.evaluate(() => {
        const ctx = __cameraCanvas.getContext('2d'); ctx.fillStyle = 'blue'; ctx.fillRect(0, 0, 128, 64);
        camStream.getVideoTracks()[0].requestFrame(); simEmitterCameraTime = 0;
      });
      await page.waitForFunction(() => agEmitterCameraFrame()?.points[4] === 1);
      if (mode === 'simparticles') {
        await feed(60); const mixed = await pixels();
        assert.ok(mixed.rgb[0] > 1000 && mixed.rgb[2] > 1000, 'particles retain sampled colors while new births follow live video');
      }
      await page.evaluate(() => { agSim.reset(); renderDensity(); });
      await feed(110); const blue = await pixels();
      assert.ok(blue.lit > 100 && blue.blue > 0.9, mode + ' live camera blue: ' + JSON.stringify(blue));
      await page.evaluate(() => { setSimOpt('emitColor', 'palette'); agSim.reset(); renderDensity(); });
      await feed(110); const palette = await pixels();
      assert.ok(palette.lit > 100 && palette.blue < 0.8, mode + ' palette override: ' + JSON.stringify(palette));
      await page.evaluate(() => {
        const ctx = __cameraCanvas.getContext('2d'); ctx.fillStyle = 'red'; ctx.fillRect(0, 0, 128, 64);
        camStream.getVideoTracks()[0].requestFrame(); simEmitterCameraTime = 0;
      });
      await page.waitForFunction(() => agEmitterCameraFrame()?.points[2] === 1);
    }
    assert.deepEqual(await page.evaluate(() => getState().stackLayouts[0].params._simEmitter), original.stackLayouts[0].params._simEmitter, 'camera frames are never written into saved image data');
    await page.evaluate(() => {
      const ctx = __cameraCanvas.getContext('2d'); ctx.fillStyle = 'black'; ctx.fillRect(0, 0, 128, 64);
      camStream.getVideoTracks()[0].requestFrame(); simEmitterCameraTime = 0;
    });
    await page.waitForFunction(() => agEmitterCameraFrame()?.points.length === 0);
    await page.evaluate(() => { setLayout('simparticles'); setSimOpt('pEmit', 'camera'); agSim.reset(); renderDensity(); });
    await feed(20);
    assert.equal(await page.evaluate(() => Object.values(agSim.stats().layers)[0].emitted), 0, 'black camera frame emits nothing');
    console.log('ok webcam: browser permission, denial, track cleanup, privacy, live RGB changes and palette overrides in all five source-driven sims');

    await page.evaluate(() => {
      stopCam(); navigator.mediaDevices.getUserMedia = __getUserMedia;
      setLayout('simparticles'); setSimOpt('pEmit', 'camera'); agSim.reset(); renderDensity();
    });
    await feed(20);
    assert.equal(await page.evaluate(() => Object.values(agSim.stats().layers)[0].emitted), 0, 'stopped camera never falls back');
    await page.evaluate(() => { simEmitterData = null; _simStore(); setSimOpt('pEmit', 'image'); agSim.reset(); renderDensity(); });
    await feed(20);
    assert.equal(await page.evaluate(() => Object.values(agSim.stats().layers)[0].emitted), 0, 'missing image never falls back');
    for (const mode of ['simparticles', 'simfluid', 'simsmoke', 'simboids', 'simsand', 'simferro', 'simwave', 'simcloner', 'simsplat']) {
      await page.evaluate(mode => { setLayout(mode); setSimOpt('q', 'low'); agSim.reset(); renderDensity(); }, mode);
      await feed(4); assert.deepEqual(await page.evaluate(() => agSim.stats().errors), [], mode + ' pipeline compatibility');
    }
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => {
        setLayout('simparticles'); setSimOpt('pEmit', 'image');
        document.querySelectorAll('.panel').forEach(p => p.classList.toggle('closed', p.id !== 'panelAppear'));
      });
      await page.locator('#simSourceBox').scrollIntoViewIfNeeded();
      const fits = await page.evaluate(() => {
        const box = document.getElementById('simSourceBox').getBoundingClientRect();
        const knobs = [...document.querySelectorAll('#simSourceBox .knob')].filter(e => e.offsetParent);
        return knobs.length > 0 && knobs.every(e => {
          const r = e.getBoundingClientRect(); return r.width > 0 && r.left >= box.left && r.right <= box.right && r.left >= 0 && r.right <= innerWidth;
        });
      });
      assert.ok(fits, 'source controls fit at ' + width);
    }
    if (process.env.AUDIOGRAPH_EMITTER_SHOT) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.setInputFiles('#simEmitterFile', redFile);
      await page.waitForFunction(() => simEmitterData && simEmitterData.name === 'red.png');
      await page.evaluate(() => { setSimOpt('emitColor', 'source'); agSim.reset(); renderDensity(); });
      await feed(90); await page.locator('#simSourceBox').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.resolve(process.env.AUDIOGRAPH_EMITTER_SHOT) });
    }
    assert.deepEqual(errors, [], 'no runtime errors');
    assert.deepEqual(await page.evaluate(() => agSim.stats().errors), [], 'no WebGPU errors');
    console.log('ALL PASS: image and webcam emitters');
  } finally { await t.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
