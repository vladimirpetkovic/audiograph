const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const gltfFile=require('./gltf-fixture.cjs');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+url.pathname+(url.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'application/octet-stream');
  res.end(fs.readFileSync(file));
});
const scene=(space='3d',shape='sphere')=>({format:'audiograph-pro',version:10,layers:[{id:'L',name:'3D particles',visible:true,opacity:1,blend:'source-over',
  nodes:[{id:'o',type:'waveform3d',x:0,y:180,props:{mode:shape,render:'normal',stretchZ:180}},
    {id:'d',type:'value',x:0,y:0,props:{value:1}},
    {id:'e',type:'gpuParticles',x:220,y:0,props:{mode:'simparticles',space,particleDepth:4}},
    {id:'c',type:'camera3d',x:440,y:0,props:{orbit:0,tilt:0,dof:0}},
    {id:'out',type:'output',x:660,y:0,props:{}}],
  edges:[{from:'d',out:'value',to:'e',input:'drive'},{from:'o',out:'object',to:'e',input:'emit'},
    {from:'e',out:'shape',to:'c',input:'shape'},{from:'c',out:'shape',to:'out',input:'image'}]}]});
(async()=>{
  let browser;
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args:['--ignore-gpu-blocklist','--enable-gpu-rasterization']});
    const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto((process.env.AUDIOGRAPH_PRO_URL||`http://127.0.0.1:${server.address().port}/pro/`)+'?demo');
    await page.waitForFunction(()=>window.pro);
    await page.evaluate(()=>pro.dissolve(false));
    const load=async p=>{
      await page.evaluate(p=>pro.importProject(p),p);
      try{await page.waitForFunction(()=>Object.values(pro.engine('e')?.w?.agSim.stats().layers||{}).some(s=>s.emitted>100),null,{timeout:45000});}
      catch(error){console.error(await page.evaluate(()=>pro.stats()));throw error;}
      await page.waitForTimeout(400);
      const stats=await page.evaluate(()=>pro.stats());
      assert.deepEqual(stats.errors,[],JSON.stringify(stats));
      assert.deepEqual(await page.evaluate(()=>pro.engine('e').w.agSim.stats().errors),[]);
    };
    const state=()=>page.evaluate(()=>pro.engine('e').w.agSim.particleState());
    const active=data=>Array.from({length:data.length/16},(_,i)=>data.slice(i*16,i*16+16)).filter(p=>p[8]>0);
    const volumeScene=scene();volumeScene.layers[0].edges.splice(1,1);
    await load(volumeScene);
    assert.ok(active(await state()).some(p=>Math.abs(p[2])>.1),'Unwired procedural emitters spawn in 3D');
    await load(scene());
    let parts=active(await state());
    assert.ok(parts.length>100,'Live 3D particles');
    assert.ok(parts.every(p=>p.every(Number.isFinite)),'Finite positions and velocities');
    assert.ok(Math.max(...parts.map(p=>p[2]))-Math.min(...parts.map(p=>p[2]))>.5,'Mesh emission spans real Z');
    assert.ok(parts.some(p=>Math.abs(p[6])>.001),'Particles have Z velocity');
    assert.equal(await page.evaluate(()=>Object.values(pro.engine('e').w.agSim.stats().layers)[0].dimensions),3);
    assert.equal(await page.evaluate(()=>Object.values(pro.engine('e').w.agSim.stats().layers)[0].sourcePoints),2048);
    assert.ok(await page.evaluate(()=>pro.pixels())>.02,'3D particles are rendered');
    if(process.env.AUDIOGRAPH_PARTICLES3D_SCREENSHOT)await page.locator('#preview').screenshot({path:process.env.AUDIOGRAPH_PARTICLES3D_SCREENSHOT});
    await page.evaluate(()=>pro.select('c'));
    assert.ok((await page.locator('#properties').textContent()).includes('Rotate'),'Camera rotation control remains available for particles');
    // A camera move changes projection, not the simulation positions.
    await page.evaluate(()=>{pro.pause(true);pro.engine('e').w.agSim.expMode(true);});
    await page.waitForTimeout(100);
    const before=await state();
    const pixels=()=>page.evaluate(()=>{const c=pro.engine('e').canvas,x=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return Array.from(x);});
    const image1=await pixels();
    await page.evaluate(()=>pro.setProperty('c','turn',75));
    await page.waitForTimeout(300);
    const image2=await pixels(),after=await state();
    assert.ok(after.every((v,i)=>v===before[i]),'Orbit does not move or flatten particles');
    assert.ok(image1.some((v,i)=>v!==image2[i]),'3D camera changes projection: '+JSON.stringify(await page.evaluate(()=>{const e=pro.engine('e');return {cfg:{...e.w.__agParticles3d,source:undefined},stats:e.w.agSim.stats(),pixels:pro.pixels()};})));
    await page.evaluate(()=>{pro.engine('e').w.agSim.expMode(false);pro.pause(false);});
    // Live parameter changes rebuild the correct buffer stride.
    await page.evaluate(()=>pro.setProperty('e','space','2d'));
    await page.waitForFunction(()=>Object.values(pro.engine('e').w.agSim.stats().layers).some(s=>s.dimensions===2&&s.emitted>100),null,{timeout:20000});
    await page.waitForFunction(()=>pro.emitPoints('e')?.length>0,null,{timeout:15000});
    assert.ok(await page.evaluate(()=>pro.emitPoints('e')?.length>0),'2D still samples the rendered object');
    await page.evaluate(()=>pro.setProperty('e','space','3d'));
    await page.waitForFunction(()=>Object.values(pro.engine('e').w.agSim.stats().layers).some(s=>s.dimensions===3&&s.emitted>100),null,{timeout:20000});
    assert.ok(active(await state()).some(p=>Math.abs(p[2])>.1),'Switching back restores Z');
    for(const shape of ['cube','torus','cone','model']){
      await load(scene('3d',shape));
      assert.ok(active(await state()).some(p=>Math.abs(p[2])>.05),shape+' emits from its mesh');
    }
    // An animated model supplies the current posed mesh rather than a screenshot.
    await page.evaluate(()=>pro.select('o'));
    await page.locator('#emitterMedia').setInputFiles(gltfFile());
    await page.waitForFunction(()=>pro.engine('o')?.anim,null,{timeout:20000});
    await page.waitForTimeout(200);
    const mesh1=await page.evaluate(()=>{const c=pro.engine('e').w.__agParticles3d.gpuSource.image;return Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data);});
    await page.waitForTimeout(500);
    const mesh2=await page.evaluate(()=>{const c=pro.engine('e').w.__agParticles3d.gpuSource.image;return Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data);});
    assert.ok(mesh1.some((v,i)=>v!==mesh2[i]),'Animated source surface updates');
    // Images remain valid 3D plane emitters, including source colours.
    const imageScene=scene();imageScene.layers[0].nodes[0]={id:'o',type:'waveform2d',x:0,y:180,props:{mode:'circle'}};
    imageScene.layers[0].edges[1].out='shape';
    await load(imageScene);
    assert.ok(active(await state()).some(p=>Math.abs(p[6])>.001),'Image-plane particles can fly in Z');
    assert.deepEqual(await page.evaluate(()=>pro.stats().errors),[]);
    assert.deepEqual(await page.evaluate(()=>pro.engine('e').w.agSim.stats().errors),[]);
    assert.deepEqual(errors,[]);
    console.log('3D particle acceptance passed');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
