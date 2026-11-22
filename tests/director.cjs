const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.m4a':'audio/mp4'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+url.pathname+(url.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});

(async()=>{
  const {SCENE_RECIPES,directScene}=await import('../pro/director.js');
  const {parse,build}=await import('../pro/autopilot.js');
  const {validate,VERSION}=await import('../pro/graph.js');
  const base={format:'audiograph-pro',settings:{resolution:540,performance:{fps:24}}},ids=Object.keys(SCENE_RECIPES);
  for(const recipe of ids)for(let seed=0;seed<=100;seed++){
    const {project:{layers:[g],settings}}=directScene(base,{recipe,seed,energy:seed,palette:seed%2?'ember':undefined});
    const connected=new Set(g.nodes.filter(n=>n.type==='output').map(n=>n.id));
    for(const to of connected)for(const e of g.edges)if(e.to===to)connected.add(e.from);
    assert.equal(connected.size,g.nodes.length,`${recipe} has no disconnected nodes`);
    assert.equal(settings.resolution,540);
    assert.equal(settings.performance.fps,24);
  }
  assert.throws(()=>directScene(base,{recipe:'unknown',seed:0}),/Unknown scene recipe/);
  assert.throws(()=>directScene(base,{recipe:'orbit',seed:0,energy:120}),/Scene energy/);
  const normalize=g=>g.project.layers[0].nodes.map(({type,props})=>({type,props}));
  assert.deepEqual(normalize(directScene(base,{recipe:'kinetic',seed:2026})),normalize(directScene(base,{recipe:'kinetic',seed:2026})));
  for(const [prompt,type] of [
    ['Aizawa attractor with soft motion blur','attractor'],['Fourier epicycles','epicycles'],['polar plot','polarPlot'],
    ['Rule 110','cellular'],['oscilloscope','oscilloscope'],['radar sweep','radar'],['tech lines','techLines'],
    ['particles from a flat waveform','gpuParticles'],['volumetric smoke simulation','gpuParticles']
  ]){
    const p=validate({...base,version:VERSION,layers:build(parse(prompt),{seed:44})});
    assert.ok(p.layers[0].nodes.some(n=>n.type===type),prompt);
  }
  let browser;await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--ignore-gpu-blocklist']});
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/pro/?demo`);
    await page.waitForFunction(()=>window.pro);
    await page.evaluate(()=>pro.dissolve(false));
    const original=await page.evaluate(()=>pro.getProject()),names=[];
    for(let i=0;i<ids.length;i++){
      await page.locator('#randomGraph').click();
      names.push(await page.evaluate(()=>pro.getProject().layers[0].name));
      if(!i){
        await page.evaluate(()=>pro.undo());
        assert.deepEqual(await page.evaluate(()=>pro.getProject()),original);
      }
    }
    assert.equal(new Set(names).size,ids.length,'Random rotates through the full set before repeating');
    await page.click('#audioName');
    await page.locator('#audioFile').setInputFiles(path.join(root,'audio/default-track.m4a'));
    for(const recipe of ids){
      await page.evaluate(recipe=>pro.importProject(pro.director.build({recipe,seed:2026}).project),recipe);
      await page.waitForFunction(()=>{
        const s=pro.stats();return s.errors.length===0&&Object.values(s.engines).every(e=>e.status==='ready')&&pro.pixels()>.14;
      },null,{timeout:18000}).catch(async error=>{
        throw Error(`${recipe}: ${await page.evaluate(()=>JSON.stringify({errors:pro.stats().errors,pixels:pro.pixels()}))}`,{cause:error});
      });
      console.log(`ok - ${recipe} renders under music`);
    }
    await page.evaluate(()=>pro.autopilot.settings({write:false,layers:'1',match:100}));
    for(const [prompt,type] of [
      ['blue Aizawa attractor with soft motion blur','attractor'],
      ['gold particles flow across the surface of a torus, no floor, no trails','gpuParticles'],
      ['particles from a cube, bounce off the cube and on the floor, floor size 200, release on sound and motion','gpuParticles'],
      ['green oscilloscope with flowing fracture','oscilloscope']
    ]){
      await page.evaluate(p=>pro.autopilot.create(p),prompt);
      await page.waitForFunction(type=>pro.getProject().layers.some(g=>g.opacity>.94&&g.nodes.some(n=>n.type===type))
        &&!pro.autopilot.status().fading&&!pro.stats().errors.length,type,{timeout:23000}).catch(async error=>{
        throw Error(`${prompt}: ${await page.evaluate(()=>JSON.stringify({auto:pro.autopilot.status(),errors:pro.stats().errors}))}`,{cause:error});
      });
      const p=await page.evaluate(()=>pro.validate(pro.getProject()));
      const g=p.layers.find(g=>g.opacity>.94),visual=g.nodes.find(n=>n.type===type);
      if(type==='attractor'){
        assert.equal(visual.props.system,'aizawa');
        assert.ok(g.nodes.some(n=>n.type==='motionBlur'));
      }
      if(type==='gpuParticles'){
        const wire=g.edges.find(e=>e.to===visual.id&&e.input==='emit'),mesh=g.nodes.find(n=>n.id===wire?.from);
        assert.equal(wire?.out,'object');
        if(prompt.includes('torus')){
          assert.equal(mesh.props.mode,'torus');
          assert.equal(visual.props.particleSurfaceFlow,true);
          assert.equal(visual.props.particleFloor,false);
          assert.equal(visual.props.opts.pSpTrail,0);
        }else{
          assert.equal(mesh.props.collide,true);
          assert.equal(visual.props.particleResponse,'both');
          assert.equal(visual.props.particleFloorSize,200);
        }
      }
      if(type==='oscilloscope')assert.equal(g.nodes.find(n=>n.type==='fracture').props.mode,'flow');
      console.log(`ok - Autopilot: ${prompt}`);
    }
    assert.deepEqual(errors,[]);
  }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
