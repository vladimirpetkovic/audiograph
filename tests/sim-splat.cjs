// Gaussian splat input + webcam pass on simulation layouts (needs real WebGPU).
const assert = require('node:assert/strict');
const { open } = require('./gpu-common.cjs');
const build = process.env.AUDIOGRAPH_GPU_BUILD;
const shotDir = process.env.AUDIOGRAPH_SPLAT_SHOTS;

async function feed(page, n) {
  await page.evaluate(n => { for (let i = 0; i < n; i++) { const sp = []; for (let j = 0; j < 64; j++) sp.push(0.6 * Math.max(0, (0.8 - 0.6 * j / 63) * (0.5 + 0.5 * Math.sin(i * 0.21 + j * 0.5)))); agSim.inject({ spec: sp, onset: i % 20 === 0 ? 0.9 : 0 }); agSim.advance(1); } }, n);
}
const lit = page => page.evaluate(() => { const c = document.querySelector('#simCanvas') || frameCv; const d = frameCtx.getImageData(0, 0, frameCv.width, frameCv.height).data; let n = 0; for (let i = 0; i < d.length; i += 16) if (d[i] + d[i + 1] + d[i + 2] > 60) n++; return n / (d.length / 16); });
const shot = async (page, n) => { if (shotDir) await page.screenshot({ path: `${shotDir}/${n}.png` }); };

(async () => {
  const h = await open({ extraArgs: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'], permissions: ['camera'] });
  const { page, errors } = h;
  try {
    await page.evaluate(() => agSim.ready());
    await page.evaluate(() => { setLayout('simsplat'); renderDensity(); });
    await feed(page, 40);
    let info = await page.evaluate(() => agSim.splat());
    assert.ok(info && info.n > 1000 && !info.err, 'splat cloud missing ' + JSON.stringify(info));
    assert.ok(await lit(page) > 0.002, 'splat drew nothing');
    await shot(page, 'splat-galaxy');
    for (const [k, vals] of [['spSrc', ['knot', 'nebula', 'galaxy']], ['spCol', ['height', 'dist', 'sound', 'orig']], ['spBlend', ['solid', 'glow']], ['spMeth', ['pulse', 'ripple', 'eq', 'explode', 'flow', 'twist', 'wave', 'reveal', 'pulse,ripple,eq,explode,flow,twist,wave']]]) {
      for (const v of vals) { await page.evaluate(([k, v]) => { simOpt[k] = v; syncSimUI(); renderDensity(); }, [k, v]); await feed(page, 6); assert.ok(await lit(page) > 0.0003, `${k}=${v} drew nothing`); }
    }
    for (let i = 0; i < 5; i++) { await page.evaluate(i => simApplyPreset(i), i); await feed(page, 30); assert.ok(await lit(page) > 0.0005, `preset ${i} drew nothing`); await shot(page, 'splat-preset' + i); }
    // load a plain ASCII point cloud .ply and a binary 3DGS-style .ply
    const pts = []; for (let i = 0; i < 3000; i++) { const a = i * 0.07; pts.push(`${Math.cos(a) * 2} ${i / 1500 - 1} ${Math.sin(a) * 2} ${i % 255} 120 ${255 - i % 255}`); }
    const ply = 'ply\nformat ascii 1.0\nelement vertex 3000\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n' + pts.join('\n') + '\n';
    await page.locator('#splatFile').setInputFiles({ name: 'helix.ply', mimeType: 'application/octet-stream', buffer: Buffer.from(ply) });
    await page.waitForFunction(() => AG_SPLAT.file && AG_SPLAT.n === 3000);
    await feed(page, 10);
    info = await page.evaluate(() => agSim.splat()); assert.equal(info.n, 3000); assert.ok(await lit(page) > 0.0002, 'loaded cloud drew nothing');
    const n3 = 2000, hdr = `ply\nformat binary_little_endian 1.0\nelement vertex ${n3}\nproperty float x\nproperty float y\nproperty float z\nproperty float f_dc_0\nproperty float f_dc_1\nproperty float f_dc_2\nproperty float opacity\nproperty float scale_0\nproperty float scale_1\nproperty float scale_2\nproperty float rot_0\nproperty float rot_1\nproperty float rot_2\nproperty float rot_3\nend_header\n`;
    const body = Buffer.alloc(n3 * 56); for (let i = 0; i < n3; i++) { const f = [Math.random() * 4 - 2, Math.random() * 4 - 2, Math.random() * 4 - 2, Math.random(), Math.random(), Math.random(), 3, -4, -4, -4, 1, 0, 0, 0]; f.forEach((v, j) => body.writeFloatLE(v, i * 56 + j * 4)); }
    await page.locator('#splatFile').setInputFiles({ name: 'scene.ply', mimeType: 'application/octet-stream', buffer: Buffer.concat([Buffer.from(hdr), body]) });
    await page.waitForFunction(() => AG_SPLAT.name === 'scene.ply');
    assert.equal(await page.evaluate(() => document.getElementById('pGsRX').value), '180', '3DGS file should load upright-flipped');
    await feed(page, 10); assert.ok(await lit(page) > 0.0002, '3DGS cloud drew nothing');
    // viewport camera: drag orbits, shift-drag pans, wheel zooms, double-click resets
    const box = await page.locator('#frameCv').boundingBox();
    for (const k of ['simsplat', 'simcloner']) {
      await page.evaluate(k => { setLayout(k); renderDensity(); }, k);
      await page.mouse.move(box.x + 300, box.y + 300); await page.mouse.down(); await page.mouse.move(box.x + 380, box.y + 340, { steps: 4 }); await page.mouse.up();
      await page.mouse.wheel(0, -300);
      await page.keyboard.down('Shift'); await page.mouse.move(box.x + 300, box.y + 300); await page.mouse.down(); await page.mouse.move(box.x + 350, box.y + 300, { steps: 4 }); await page.mouse.up(); await page.keyboard.up('Shift');
      const v = await page.evaluate(() => ({ y: simOpt.vYaw, p: simOpt.vPit, z: simOpt.vZm, x: simOpt.vPx }));
      assert.ok(v.y < 0 && v.p > 0 && v.z > 1 && v.x > 0, `${k} mouse camera ${JSON.stringify(v)}`);
      await feed(page, 4); assert.ok(await lit(page) > 0.0003, `${k} drew nothing after moving the camera`);
      await page.mouse.dblclick(box.x + 300, box.y + 300);
      assert.equal(await page.evaluate(() => simOpt.vZm), 1, `${k} double-click resets view`);
    }
    // webcam: colours + displacement run the extra pass on a simulation layout
    await page.evaluate(() => simApplyPreset(0));
    await page.evaluate(() => toggleCam()); await page.waitForFunction(() => camActive);
    await page.evaluate(() => { setCamColors(true, document.querySelector('[onclick*="setCamColors(true"]')); const d = document.getElementById('camDisplace'); d.value = 60; upCam(); });
    await feed(page, 12); await page.waitForTimeout(300); await feed(page, 6);
    let cf = await page.evaluate(() => agSim.camfx()); assert.ok(cf.camP && !cf.err && cf.applied, 'webcam pass not applied ' + JSON.stringify(cf));
    assert.ok(await lit(page) > 0.0005, 'webcam pass drew nothing');
    await shot(page, 'splat-webcam');
    for (const k of ['simparticles', 'simfluid', 'simcloner', 'simwave']) { await page.evaluate(k => { setLayout(k); renderDensity(); }, k); await feed(page, 25); if (k === 'simcloner') assert.ok(await lit(page) > 0.0005, `${k} + webcam drew nothing`); }
    await page.evaluate(() => stopCam());
    const bad = errors.filter(e => !/ResizeObserver/.test(e)); assert.deepEqual(bad, [], 'page errors');
    console.log('PASS sim-splat');
  } finally { await h.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
