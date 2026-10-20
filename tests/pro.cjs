const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
function audioFile(seconds=6) {
  const rate=8000,samples=rate*seconds,wav=Buffer.alloc(44+samples*2);
  wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);
  wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples*2,40);
  for(let i=0;i<samples;i++)wav.writeInt16LE(Math.round(Math.sin(i/rate*220*Math.PI*2)*22000),44+i*2);
  return {name:'gpu.wav',mimeType:'audio/wav',buffer:wav};
}

const root = path.resolve(__dirname, '..');
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml' };
const server = http.createServer((req,res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/audiograph(?=\/)/,'');
    let file = path.resolve(root,'.'+pathname);
    if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403);res.end();return;}
    if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
    if(!fs.existsSync(file)){res.writeHead(404);res.end('Not found');return;}
    res.setHeader('Content-Type',(mime[path.extname(file)]||'application/octet-stream')+'; charset=utf-8');res.end(fs.readFileSync(file));
  } catch(error){res.writeHead(500);res.end(error.message);}
});
const difference=(a,b)=>a.reduce((sum,v,i)=>sum+Math.abs(v-b[i]),0)/a.length;

(async()=>{
  let browser;
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    browser=await chromium.launch({
      executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless:!process.env.AUDIOGRAPH_HEADED,args:['--ignore-gpu-blocklist','--enable-gpu-rasterization']
    });
    const page=await browser.newPage({viewport:{width:1540,height:1020}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(process.env.AUDIOGRAPH_PRO_URL||`http://127.0.0.1:${server.address().port}/audiograph/pro/`);
    await page.waitForFunction(()=>window.pro&&Object.values(pro.stats().engines).some(e=>e.status==='ready'),null,{timeout:30000});
    const ids=await page.evaluate(()=>{const g=pro.getProject().layers[0];return Object.fromEntries(g.nodes.map(n=>[n.type,n.id]));});
    const defaultProject=await page.evaluate(()=>pro.getProject());
    const native=await page.evaluate(async id=>{
      const e=pro.engine(id);await e.ready;const status=await e.w.agSim.ready();return {status,stats:e.w.agSim.stats()};
    },ids.emitter);
    assert.equal(native.status,'ready',JSON.stringify(native.stats));
    assert.ok(native.stats.adapter&&!/swiftshader|software/i.test(native.stats.adapter),native.stats.adapter);
    await page.waitForFunction(id=>{const e=pro.stats().engines[id];return e?.sim.steps>8&&e.sim.dispatches>0;},ids.emitter,{timeout:30000});
    const pixels=()=>page.evaluate(()=>{const d=document.getElementById('preview').getContext('2d').getImageData(0,0,960,540).data;return Array.from(d).filter((_,i)=>i%4!==3);});
    const initial=await pixels();assert.ok(initial.some(v=>v>30),'Actual GPU output is not black');
    await page.waitForTimeout(350);assert.ok(difference(initial,await pixels())>.1,'GPU simulation changes rendered output');
    await page.locator('#pause').click();
    const firstStats=await page.evaluate(id=>pro.stats().engines[id].sim,ids.emitter);
    for(let i=0;i<4;i++)await page.evaluate(()=>pro.draw());
    const nextStats=await page.evaluate(id=>pro.stats().engines[id].sim,ids.emitter);
    assert.equal(nextStats.created,firstStats.created,'Normal frames must not reset simulations');
    assert.equal(nextStats.disposed,firstStats.disposed);

    // Visible selection and property controls change the actual renderer, not only graph metadata.
    await page.locator(`.node[data-id="${ids.emitter}"] .node-head`).click();
    await page.locator('[data-property="mode"]').selectOption('linear');
    await page.evaluate(()=>pro.draw());
    const line=await pixels();
    await page.locator('[data-property="size"]').fill('16');
    await page.locator('[data-property="size"]').dispatchEvent('change');
    await page.evaluate(()=>pro.draw());assert.ok(difference(line,await pixels())>1,'Emitter size changes the real output');
    await page.locator('#undo').click();await page.evaluate(()=>pro.draw());
    assert.ok(difference(line,await pixels())<.01,'Undo restores rendered Emitter parameters');
    await page.locator('#redo').click();assert.equal(await page.evaluate(id=>pro.getProject().layers[0].nodes.find(n=>n.id===id).props.size,ids.emitter),16);
    await page.locator('#undo').click();
    await page.evaluate(id=>pro.select(id),ids.effect);
    await page.locator('[data-property="kind"]').selectOption('invert');
    await page.locator('[data-property="amount"]').fill('1');await page.locator('[data-property="amount"]').dispatchEvent('change');
    await page.evaluate(()=>pro.draw());const effectDifference=difference(line,await pixels());assert.ok(effectDifference>1,`Real image effect changes pixels (${effectDifference})`);

    // Every advertised built-in choice calls its actual legacy renderer.
    const inventory=await page.evaluate(async id=>{
      const {EMITTERS}=await import('./graph.js');
      const modes=Object.values(EMITTERS).flat().map(([mode])=>mode).filter(mode=>!['image','pixelwarp','video','object'].includes(mode)),receipts=[];
      for(const mode of modes){
        if(!pro.setProperty(id,'mode',mode))throw Error('Cannot select '+mode);
        pro.draw();const e=pro.engine(id);
        if(mode.startsWith('sim')){
          if(await e.w.agSim.ready()!=='ready')throw Error('Native GPU failed for '+mode);
          pro.draw();e.w.agSim.advance(18);await e.w.agSim.sync();
        }
        for(let i=0;i<4;i++){await new Promise(r=>setTimeout(r,18));pro.draw();}
        const data=e.ctx.getImageData(0,0,960,540).data;let lit=0;
        for(let i=0;i<data.length;i+=4)if(data[i+3]>0&&Math.max(data[i],data[i+1],data[i+2])>15)lit++;
        receipts.push({mode,lit,errors:pro.stats().errors,kind:Object.values(e.stats().sim.layers)[0]?.kind,backend:e.backend});
      }
      pro.setProperty(id,'mode','linear');pro.draw();return receipts;
    },ids.emitter);
    for(const receipt of inventory){
      assert.deepEqual(receipt.errors,[],receipt.mode+': '+receipt.errors.join(','));
      assert.ok(receipt.lit>5,`${receipt.mode} must draw real visible output: ${JSON.stringify(receipt)}`);
      if(receipt.mode.startsWith('sim'))assert.equal(receipt.kind,receipt.mode.slice(3),JSON.stringify(receipt));
    }
    console.log('Emitter inventory:',inventory.map(r=>`${r.mode}:${r.lit}px`).join(', '));

    // Explicit raster media and OBJ loading reuse the real Input renderers.
    const png=await page.evaluate(()=>{
      const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');
      x.fillStyle='#fff';x.fillRect(0,0,64,64);x.fillStyle='#000';x.fillRect(0,0,32,32);x.fillRect(32,32,32,32);
      return c.toDataURL().split(',')[1];
    });
    await page.evaluate(id=>{pro.setProperty(id,'mode','image');pro.select(id);pro.draw();},ids.emitter);
    await page.locator('#emitterMedia').setInputFiles({name:'checker.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
    await page.waitForFunction(id=>pro.engine(id).mediaKind==='image',ids.emitter);
    await page.evaluate(()=>pro.draw());assert.deepEqual(await page.evaluate(()=>pro.stats().errors),[]);
    const raster=await pixels();assert.ok(raster.some(v=>v>20));
    await page.evaluate(id=>{pro.setProperty(id,'mode','pixelwarp');pro.draw();},ids.emitter);
    assert.deepEqual(await page.evaluate(()=>pro.stats().errors),[]);
    await page.evaluate(id=>{pro.setProperty(id,'mode','object');pro.select(id);pro.draw();},ids.emitter);
    const obj='v -1 -1 0\nv 1 -1 0\nv 0 1 0\nv 0 0 1\nf 1 2 3\nf 1 2 4\nf 2 3 4\nf 3 1 4\n';
    await page.locator('#emitterMedia').setInputFiles({name:'tetra.obj',mimeType:'text/plain',buffer:Buffer.from(obj)});
    await page.waitForFunction(id=>pro.engine(id).mediaKind==='object',ids.emitter);
    await page.evaluate(()=>pro.draw());assert.deepEqual(await page.evaluate(()=>pro.stats().errors),[]);
    const webm=await page.evaluate(async()=>{
      const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,64,64);
      const stream=canvas.captureStream(0),track=stream.getVideoTracks()[0],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'}),chunks=[];
      const done=new Promise(resolve=>{recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=resolve;});
      await new Promise(resolve=>{recorder.onstart=resolve;recorder.start(100);});
      for(let i=0;i<8;i++){ctx.fillStyle=i%2?'#fff':'#909090';ctx.fillRect(0,0,64,64);track.requestFrame();await new Promise(r=>setTimeout(r,90));}
      recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());
      const data=new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer());return btoa(String.fromCharCode(...data));
    });
    await page.evaluate(id=>{pro.setProperty(id,'mode','video');pro.select(id);pro.draw();},ids.emitter);
    await page.locator('#emitterMedia').setInputFiles({name:'clip.webm',mimeType:'video/webm',buffer:Buffer.from(webm,'base64')});
    try{await page.waitForFunction(id=>pro.engine(id).mediaKind==='video',ids.emitter);}
    catch(error){throw Error(`Video import: ${await page.locator('#status').textContent()} (${error.message})`);}
    await page.evaluate(()=>pro.draw());assert.deepEqual(await page.evaluate(()=>pro.stats().errors),[]);
    await page.evaluate(id=>{pro.setProperty(id,'mode','linear');pro.draw();},ids.emitter);

    // Use the same typed connection path as the ports, and check visible rejection.
    const before=await page.evaluate(()=>JSON.stringify(pro.getProject()));
    assert.equal(await page.evaluate(id=>pro.connect(id,'image',id,'drive'),ids.emitter),false);
    await page.locator('#status.error').waitFor();assert.match(await page.locator('#status').textContent(),/Type mismatch/);
    await page.evaluate(()=>pro.draw());assert.match(await page.locator('#status').textContent(),/Type mismatch/,'Rendering does not erase action errors');
    assert.equal(await page.evaluate(()=>JSON.stringify(pro.getProject())),before);
    assert.equal(await page.evaluate(id=>pro.connect(id,'image','missing','image'),ids.emitter),false);
    assert.match(await page.locator('#status').textContent(),/missing node/);
    assert.equal(await page.evaluate(id=>pro.connect(id,'missing',id,'drive'),ids.emitter),false);
    assert.match(await page.locator('#status').textContent(),/missing port/);
    assert.equal(await page.evaluate(id=>pro.connect(id,'__proto__',id,'__proto__'),ids.emitter),false);
    assert.match(await page.locator('#status').textContent(),/missing port/);
    const map=await page.evaluate(()=>pro.addNode('map',120,200));
    assert.equal(await page.evaluate(({a,b})=>pro.connect(a,'value',b,'value'),{a:ids.oscillator,b:map}),true);
    assert.equal(await page.evaluate(id=>pro.connect(id,'value',id,'value'),map),false);
    assert.match(await page.locator('#status').textContent(),/Cycle rejected/);
    await page.evaluate(()=>pro.undo());
    const a=await page.evaluate(()=>pro.addNode('map',40,200)),b=await page.evaluate(()=>pro.addNode('map',220,200));
    assert.equal(await page.evaluate(({a,b})=>pro.connect(a,'value',b,'value'),{a,b}),true);
    assert.equal(await page.evaluate(({a,b})=>pro.connect(b,'value',a,'value'),{a,b}),false);
    assert.match(await page.locator('#status').textContent(),/Cycle rejected/);
    await page.evaluate(()=>{pro.undo();pro.undo();pro.undo();});

    // Click-to-connect and pointer-moving nodes are real editor interactions.
    const value=await page.evaluate(()=>pro.addNode('value',30,160));
    await page.locator(`.port.out[data-node="${value}"]`).click();
    await page.locator(`.port.in[data-node="${ids.emitter}"][data-port="drive"]`).click();
    assert.equal(await page.evaluate(id=>pro.getProject().layers[0].edges.find(e=>e.input==='drive').from,value),value);
    const head=page.locator(`.node[data-id="${value}"] .node-head`),bounds=await head.boundingBox();
    await page.mouse.move(bounds.x+30,bounds.y+12);await page.mouse.down();await page.mouse.move(bounds.x+100,bounds.y+42,{steps:6});await page.mouse.up();
    assert.ok(await page.evaluate(id=>pro.getProject().layers[0].nodes.find(n=>n.id===id).x>60,value),'Node moves persist');
    await page.evaluate(()=>pro.draw());const constant=await pixels();
    await page.evaluate(id=>pro.setProperty(id,'value',.05),value);await page.evaluate(()=>pro.draw());
    assert.ok(difference(constant,await pixels())>.2,'Connected numeric Value changes actual Emitter output');
    const previousCount=await page.locator('.node').count();
    await page.locator('.library-node[data-type="map"]').dragTo(page.locator('#graphViewport'),{targetPosition:{x:650,y:220}});
    assert.equal(await page.locator('.node').count(),previousCount+1,'Library drag/drop creates a node');
    const dropped=await page.evaluate(()=>pro.getProject().layers[0].nodes.at(-1).id);
    await page.evaluate(()=>pro.draw());assert.deepEqual(await page.evaluate(()=>pro.stats().errors),[],'Unconnected nodes do not interrupt the Output branch');
    await page.locator(`.node[data-id="${dropped}"] .node-head`).click();await page.locator('#deleteNode').click();
    assert.equal(await page.locator('.node').count(),previousCount);
    await page.locator('#undo').click();assert.equal(await page.locator('.node').count(),previousCount+1);
    await page.locator('#redo').click();assert.equal(await page.locator('.node').count(),previousCount);

    const blend=await page.evaluate(()=>pro.addNode('blend',440,190));
    await page.evaluate(({emitter,effect,blend,output})=>{
      pro.connect(emitter,'image',blend,'a');pro.connect(effect,'image',blend,'b');pro.connect(blend,'image',output,'image');
      pro.setProperty(blend,'mode','source-over');pro.setProperty(blend,'mix',0);pro.draw();
    },{emitter:ids.emitter,effect:ids.effect,blend,output:ids.output});
    const unmixed=await pixels();
    await page.evaluate(id=>{pro.setProperty(id,'mix',1);pro.draw();},blend);
    assert.ok(difference(unmixed,await pixels())>.1,'Branching and Blend mix change actual output');

    // A useful shared audio -> GPU Emitter -> effect -> output graph.
    const audio=await page.evaluate(()=>pro.addNode('audio',50,220));
    await page.locator('#audioFile').setInputFiles(audioFile(6));
    await page.waitForFunction(()=>document.getElementById('audioName').textContent.includes('gpu.wav'));
    await page.evaluate(({a,e})=>{pro.connect(a,'value',e,'drive');pro.setProperty(e,'mode','simfluid');},{a:audio,e:ids.emitter});
    await page.evaluate(()=>pro.draw());const silent=await pixels();
    await page.locator('#play').click();await page.waitForFunction(()=>{pro.draw();return pro.stats().bands.bass>.05;});
    for(let i=0;i<15;i++){await page.waitForTimeout(20);await page.evaluate(()=>pro.draw());}
    assert.ok((await page.evaluate(id=>pro.stats().engines[id].sim.dispatches,ids.emitter))>0);
    assert.ok(await page.evaluate(id=>Object.values(pro.stats().engines[id].sim.layers)[0].level>.01,ids.emitter),'Shared audio actually drives the GPU state');
    assert.ok(difference(silent,await pixels())>.1,'Shared audio changes the composited GPU image');
    await page.locator('#stop').click();await page.evaluate(()=>pro.draw());
    assert.equal(await page.evaluate(()=>pro.stats().bands.bass),0,'Stopped audio produces silence');

    // Simulate bfcache transitions without relying on Chrome's cache eligibility heuristics.
    await page.evaluate(id=>{
      window.__beforeCache=pro.engine(id);
      window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
    },ids.emitter);
    assert.equal(await page.evaluate(()=>Object.keys(pro.stats().engines).length),0,'pagehide removes disposed engines from the registry');
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>Object.keys(pro.stats().engines).length),0,'Hidden frame loop cannot recreate disposed engines');
    await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
    await page.evaluate(()=>pro.draw());
    await page.waitForFunction(id=>pro.engine(id)?.status==='ready',ids.emitter,{timeout:30000});
    assert.equal(await page.evaluate(async id=>await pro.engine(id).w.agSim.ready(),ids.emitter),'ready');
    assert.ok(await page.evaluate(id=>pro.engine(id)!==window.__beforeCache&&!pro.engine(id).disposed&&!!pro.engine(id).w,ids.emitter),'Cached restore recreates a live renderer engine');
    await page.locator('#play').click();
    await page.waitForFunction(()=>{pro.draw();return pro.stats().bands.bass>.05;});
    for(let i=0;i<15;i++){await page.waitForTimeout(20);await page.evaluate(()=>pro.draw());}
    const restoredPixels=await pixels();
    assert.ok(restoredPixels.some(v=>v>30),'Cached restore resumes visible native GPU output');
    assert.ok(await page.evaluate(id=>Object.values(pro.stats().engines[id].sim.layers)[0].level>.01,ids.emitter),'Retained audio can play and drive the recreated GPU solver');
    await page.locator('#stop').click();
    await page.locator('#audioFile').setInputFiles(audioFile(5));
    await page.waitForFunction(()=>document.getElementById('audioName').textContent.includes('press Play'));
    await page.locator('#play').click();
    await page.waitForFunction(()=>{pro.draw();return pro.stats().bands.bass>.05;});
    await page.locator('#stop').click();

    // Independent graph engines keep GPU state and parameters separate.
    await page.locator('#addLayer').click();
    const second=await page.evaluate(()=>{const g=pro.getProject().layers[1];return {id:g.id,emitter:g.nodes.find(n=>n.type==='emitter').id,audio:g.nodes.find(n=>n.type==='audio').id};});
    await page.evaluate(id=>{pro.setProperty(id,'mode','simboids');},second.emitter);
    await page.evaluate(()=>pro.draw());
    await page.waitForFunction(id=>pro.engine(id)?.status==='ready',second.emitter,{timeout:30000});
    assert.equal(await page.evaluate(async id=>await pro.engine(id).w.agSim.ready(),second.emitter),'ready');
    await page.evaluate(id=>pro.setProperty(id,'drive',1),second.emitter);
    // Disconnect the silent audio band, so this GPU engine is visibly driven.
    const two=await page.evaluate(()=>pro.getProject());two.layers[1].edges=two.layers[1].edges.filter(e=>e.input!=='drive');
    await page.evaluate(p=>pro.importProject(p),two);
    for(let i=0;i<15;i++){await page.waitForTimeout(20);await page.evaluate(()=>pro.draw());}
    const isolation=await page.evaluate(({a,b})=>({a:pro.engine(a).stats(),b:pro.engine(b).stats(),different:pro.engine(a).w!==pro.engine(b).w}),{a:ids.emitter,b:second.emitter});
    assert.ok(isolation.different,'Separate renderer globals and GPU devices');
    assert.equal(Object.values(isolation.a.sim.layers)[0].kind,'fluid');
    assert.equal(Object.values(isolation.b.sim.layers)[0].kind,'boids');
    assert.ok(isolation.b.sim.steps>0&&isolation.b.sim.dispatches>0);
    await page.evaluate(id=>pro.setProperty(id,'energy',160),second.emitter);
    const independentEnergy=await page.evaluate(({a,b})=>[+pro.engine(a).w.document.getElementById('pSimEnergy').value,+pro.engine(b).w.document.getElementById('pSimEnergy').value],{a:ids.emitter,b:second.emitter});
    assert.deepEqual(independentEnergy,[100,160],'Property changes cannot overwrite another layer engine globals');
    const both=await pixels();await page.getByLabel('Show Layer 2',{exact:true}).uncheck();await page.evaluate(()=>pro.draw());
    assert.ok(difference(both,await pixels())>.05,'Layer visibility affects compositing');
    await page.getByLabel('Show Layer 2',{exact:true}).check();
    await page.getByLabel('Layer 2 opacity',{exact:true}).evaluate(e=>{e.value='0';e.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.evaluate(()=>pro.draw());const transparent=await pixels();
    await page.getByLabel('Layer 2 opacity',{exact:true}).evaluate(e=>{e.value='1';e.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.evaluate(()=>pro.draw());assert.ok(difference(transparent,await pixels())>.05,'Per-layer opacity changes the mix');

    // JSON roundtrip, limits, sanitisation and explicit UI import failures.
    const saved=await page.evaluate(()=>pro.getProject());await page.locator('#save').click();
    await page.evaluate(id=>pro.setProperty(id,'energy',35),second.emitter);
    await page.locator('#restore').click();assert.deepEqual(await page.evaluate(()=>pro.getProject()),saved);
    const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export').click()]);
    assert.equal(download.suggestedFilename(),'audiograph-pro.json');
    const invalid=JSON.parse(JSON.stringify(saved));invalid.layers[0].nodes[0].x=1e200;
    await page.locator('#import').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});
    await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('Import:'));
    assert.match(await page.locator('#status').textContent(),/Import.*Node X/);
    assert.deepEqual(await page.evaluate(()=>pro.getProject()),saved);
    await page.locator('#import').setInputFiles({name:'project.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
    assert.deepEqual(await page.evaluate(()=>pro.getProject()),saved);
    const validation=await page.evaluate(p=>{
      const rejects=fn=>{try{fn();return false;}catch{return true;}};
      const cycle=structuredClone(p),g=cycle.layers[0],effect=g.nodes.find(n=>n.type==='effect');g.edges=g.edges.filter(e=>e.to!==effect.id||e.input!=='image');g.edges.push({from:effect.id,out:'image',to:effect.id,input:'image'});
      const unknown=structuredClone(p);unknown.layers[0].nodes[0].type='constructor';
      const badMode=structuredClone(p);badMode.layers[0].nodes.find(n=>n.type==='emitter').props.mode='<script>alert(1)</script>';
      return [rejects(()=>pro.validate(cycle)),rejects(()=>pro.validate(unknown)),rejects(()=>pro.validate(badMode)),rejects(()=>pro.validate({...p,layers:Array(5).fill(p.layers[0])}))];
    },saved);
    assert.deepEqual(validation,[true,true,true,true]);
    await page.reload();await page.waitForFunction(()=>window.pro);await page.locator('#restore').click();
    assert.deepEqual(await page.evaluate(()=>pro.getProject()),saved,'Browser save survives page reload');
    await page.locator('#helpButton').click();await page.locator('#help[open]').waitFor();await page.locator('#closeHelp').click();
    await page.waitForFunction(()=>Object.values(pro.stats().engines).every(e=>e.status==='ready'),null,{timeout:30000});
    await page.evaluate(p=>pro.importProject(p),defaultProject);
    await page.waitForFunction(id=>{const e=pro.stats().engines[id];return e?.sim.status==='ready'&&e.sim.steps>10;},ids.emitter,{timeout:30000});
    await page.evaluate(id=>pro.select(id),ids.emitter);
    await page.screenshot({path:path.resolve(root,'../pro-prototype.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=390),'Mobile UI fits without horizontal page overflow');
    await page.locator('#helpButton').click();await page.locator('#closeHelp').click();
    assert.deepEqual(errors,[],'No uncaught browser exceptions');
    console.log(`Audiograph Pro: PASS · native ${native.stats.adapter} · typed graph, live pixels, audio, isolation, effects, undo, JSON, UI`);
  }finally{
    try{if(browser)await browser.close();}finally{await new Promise(resolve=>server.close(resolve));}
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
