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
      headless:!process.env.AUDIOGRAPH_HEADED,args:['--ignore-gpu-blocklist','--enable-gpu-rasterization','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']
    });
    const page=await browser.newPage({viewport:{width:1540,height:1020}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(process.env.AUDIOGRAPH_PRO_URL||`http://127.0.0.1:${server.address().port}/audiograph/pro/`);
    await page.waitForFunction(()=>window.pro&&Object.values(pro.stats().engines).some(e=>e.status==='ready'),null,{timeout:30000});
    const project=()=>page.evaluate(()=>pro.getProject());
    const layer0=async()=>(await project()).layers[0];
    const idOf=async type=>(await layer0()).nodes.find(n=>n.type===type)?.id;
    const ids={emitter:await idOf('gpuParticles'),audio:await idOf('audioIn'),bloom:await idOf('bloom'),output:await idOf('output')};
    const lit=(min=.5,timeout=20000)=>page.waitForFunction(min=>pro.pixels()>min&&!pro.stats().errors.length,min,{timeout});

    // 1. Default graph: the native WebGPU Fluid runs inside the real Audiograph engine and reaches the preview.
    const native=await page.evaluate(async id=>{const e=pro.engine(id);await e.ready;return {status:await e.w.agSim.ready(),stats:e.w.agSim.stats()};},ids.emitter);
    assert.equal(native.status,'ready',JSON.stringify(native.stats));
    assert.ok(native.stats.adapter&&!/swiftshader|software/i.test(native.stats.adapter),native.stats.adapter);
    await lit(1);
    const pixels=()=>page.evaluate(()=>Array.from(document.getElementById('preview').getContext('2d').getImageData(0,0,960,540).data).filter((_,i)=>i%4!==3));
    const a=await pixels();await page.waitForTimeout(400);assert.ok(difference(a,await pixels())>.05,'Preview animates');
    assert.equal(await page.locator('.library-node[data-mode]').count(),26,'Every waveform and WebGPU simulation is in the library');
    assert.deepEqual(await page.locator('#library .panel-title').allTextContents().then(t=>t.map(x=>x.replace(/\d+$/,'').trim())),['Inputs','Emitters','Geometry & Motion','Deformers','Color','Style','Post FX','Controls','Audio analysis','Composite'],'Library categories, Inputs first');
    assert.deepEqual(await page.locator('#library .panel').first().locator('.library-node').allTextContents(),['Audio','Image','Video','Camera','Text','3D Object','Gaussian Splat'],'Inputs');
    assert.deepEqual(await page.locator('#library .lib-sub').allTextContents(),['Waveforms 2D','Waveforms 3D','Particles','WebGPU particles'],'Emitter groups');
    assert.ok((await layer0()).edges.some(e=>e.from===ids.audio&&e.out==='audio'&&e.to===ids.emitter&&e.input==='audio'),'Audio node feeds the emitter');

    // 2. Emitter inspector exposes the original's own options; a preset chip changes knobs and survives undo/redo.
    await page.locator(`.node[data-id="${ids.emitter}"] .node-head`).click();
    await page.waitForSelector('[data-emitter-options] .knob');
    assert.ok(await page.locator('[data-emitter-options] .knob').count()>8,'Fluid options rendered as knobs');
    const preset=page.locator('[data-emitter-options] [data-property^="chip:"] .mbtn',{hasText:'Lava lamp'});
    if(await preset.count()){await preset.first().click();const em=(await layer0()).nodes.find(n=>n.id===ids.emitter);assert.ok(Object.keys(em.props.opts).length>0,'Preset stored option values');}
    const knobInput=page.locator('[data-emitter-options] .knob-input').first(),optId=(await knobInput.getAttribute('data-property')).slice(4);
    await knobInput.evaluate(i=>{i.value=String(+i.min+(+i.max-+i.min)*.9);i.dispatchEvent(new Event('change'));});
    let em=(await layer0()).nodes.find(n=>n.id===ids.emitter);assert.ok(Number.isFinite(em.props.opts[optId]),'Knob change stored in opts');
    await page.evaluate(()=>pro.undo());em=(await layer0()).nodes.find(n=>n.id===ids.emitter);
    assert.notEqual(em.props.opts[optId],(await knobInput.evaluate(i=>+i.max))*.9,'Undo reverts the knob');
    await page.evaluate(()=>pro.redo());

    // 3. Mode change via the inspector; then the emitter becomes a Circle waveform (same id) and Twist / Palette splice in after it.
    await page.locator('select[data-property="mode"]').selectOption('simboids');
    assert.equal((await layer0()).nodes.find(n=>n.id===ids.emitter).props.mode,'simboids');
    await page.evaluate(id=>{const p=pro.getProject(),n=p.layers[0].nodes.find(n=>n.id===id);n.type='waveform2d';n.props={mode:'circle'};pro.importProject(p);},ids.emitter);
    assert.equal(await page.locator(`.node[data-id="${ids.emitter}"] .node-title`).textContent(),'Circle');
    await page.locator(`.node[data-id="${ids.emitter}"] .node-head`).click();
    await page.locator('.library-node[data-type="twist"]').click();
    let g=await layer0();const twist=g.nodes.find(n=>n.type==='twist');
    assert.ok(g.edges.some(e=>e.from===ids.emitter&&e.to===twist.id),'Emitter → Twist');
    assert.ok(g.edges.some(e=>e.from===twist.id&&e.to===ids.bloom),'Twist → Bloom (spliced)');
    await page.locator('.library-node[data-type="palette"]').click();
    g=await layer0();const palette=g.nodes.find(n=>n.type==='palette');
    assert.ok(g.edges.some(e=>e.from===twist.id&&e.to===palette.id)&&g.edges.some(e=>e.from===palette.id&&e.to===ids.bloom),'Twist → Palette → Bloom');
    await page.locator('[data-property="palettePreset"] [data-value="Fire"]').click();
    assert.equal((await layer0()).nodes.find(n=>n.id===palette.id).props.c2,'#c92a2a');
    await lit(.3);

    // 4. Deformers change the real render.
    await page.locator('#pause').click();
    for(let i=0;i<3;i++)await page.evaluate(()=>pro.draw());
    const before=await pixels();
    await page.evaluate(id=>pro.setProperty(id,'amount',100),twist.id);for(let i=0;i<3;i++)await page.evaluate(()=>pro.draw());
    assert.ok(difference(before,await pixels())>.2,'Twist changes the rendered output');
    await page.locator('#pause').click();

    // 5. Drag a wire from an LFO onto the Twist node body, pick the knob in the port menu.
    const lfo=await page.evaluate(()=>pro.addNode('oscillator',40,330));
    await page.evaluate(()=>{document.getElementById('fit').click();});await page.waitForTimeout(150);
    const out=page.locator(`.port.out[data-node="${lfo}"]`),target=page.locator(`.node[data-id="${twist.id}"] .node-head`);
    const ob=await out.boundingBox(),tb=await target.boundingBox();
    await page.mouse.move(ob.x+ob.width-3,ob.y+ob.height/2);await page.mouse.down();
    await page.mouse.move(tb.x+tb.width/2,tb.y+tb.height/2,{steps:8});await page.mouse.up();
    g=await layer0();assert.ok(g.edges.some(e=>e.from===lfo&&e.to===twist.id&&e.input==='amount'),'Single-knob node connects directly');
    // Multi-knob target: the port menu asks which knob.
    const bloomHead=await page.locator(`.node[data-id="${ids.bloom}"] .node-head`).boundingBox(),ob2=await out.boundingBox();
    await page.mouse.move(ob2.x+ob2.width-3,ob2.y+ob2.height/2);await page.mouse.down();
    await page.mouse.move(bloomHead.x+bloomHead.width/2,bloomHead.y+bloomHead.height/2,{steps:8});await page.mouse.up();
    await page.locator('.port-menu button[data-port="bloom"]').click();
    g=await layer0();assert.ok(g.edges.some(e=>e.from===lfo&&e.to===ids.bloom&&e.input==='bloom'),'Port menu connects LFO → Bloom amount');
    assert.ok(g.edges.some(e=>e.from===lfo&&e.to===twist.id),'An output can feed several inputs');
    assert.equal(await page.locator(`.port.in[data-node="${twist.id}"][data-port="amount"].connected`).count(),1,'Driven port appears on the card');

    // 5b. Numbers can also drive the emitter's own option knobs (input opt_<id>); the card labels the port.
    await page.evaluate(([l,e])=>pro.connect(l,'value',e,'opt_pCircleInner'),[lfo,ids.emitter]);
    assert.equal(await page.locator(`.port.in[data-node="${ids.emitter}"][data-port="opt_pCircleInner"]`).textContent(),'Inner R');

    // 6. Wire click removes it; deleting a chain node heals the chain.
    const nWires=(await layer0()).edges.length;
    const wp=await page.evaluate(()=>{const w=document.querySelector('.wire.number'),q=w.getPointAtLength(w.getTotalLength()*.12),m=w.getScreenCTM();return {x:q.x*m.a+m.e,y:q.y*m.d+m.f};});
    await page.mouse.click(wp.x,wp.y);
    assert.equal((await layer0()).edges.length,nWires-1,'Clicking a wire removes it');
    await page.evaluate(id=>pro.select(id),palette.id);await page.keyboard.press('Delete');
    g=await layer0();assert.ok(g.edges.some(e=>e.from===twist.id&&e.to===ids.bloom),'Deleting Palette reconnects Twist → Bloom');

    // 6a. Press-and-hold on a node title detaches it and heals the chain; Tab over a wire searches and splices a node in.
    const pal2=await page.evaluate(id=>{pro.select(id);return pro.addNode('palette');},twist.id);
    const ph=await page.locator(`.node[data-id="${pal2}"] .node-head`).boundingBox();
    await page.mouse.move(ph.x+20,ph.y+ph.height/2);await page.mouse.down();await page.waitForTimeout(500);
    await page.mouse.move(ph.x+20,ph.y+160,{steps:6});await page.mouse.up();
    g=await layer0();assert.ok(!g.edges.some(e=>e.from===pal2||e.to===pal2)&&g.edges.some(e=>e.from===twist.id&&e.to===ids.bloom),'Hold-drag detaches and heals');
    await page.evaluate(id=>pro.select(id),pal2);await page.keyboard.press('Delete');
    const mid=await page.evaluate(([a,b])=>{const w=document.querySelector(`.wire[data-from="${a}"][data-to="${b}"]`),q=w.getPointAtLength(w.getTotalLength()/2),m=w.getScreenCTM();return {x:q.x*m.a+m.e,y:q.y*m.d+m.f};},[twist.id,ids.bloom]);
    await page.mouse.move(mid.x,mid.y);await page.keyboard.press('Tab');await page.keyboard.type('jitter');await page.keyboard.press('Enter');
    g=await layer0();const jit=g.nodes.find(n=>n.type==='jitter');
    assert.ok(jit&&g.edges.some(e=>e.from===twist.id&&e.to===jit.id)&&g.edges.some(e=>e.from===jit.id&&e.to===ids.bloom),'Tab search splices into the wire');
    await page.evaluate(id=>pro.select(id),jit.id);await page.keyboard.press('Delete');

    // 6c. Audio: a file plays through the speakers; mic input is analysed but muted; a file afterwards is audible again.
    await page.locator('#audioName').click();assert.equal(await page.evaluate(()=>pro.stats().selected),ids.audio,'Source label opens the Audio node');
    await page.locator('#mic').click();await page.waitForFunction(()=>pro.stats().audio.input==='mic');
    assert.equal((await page.evaluate(()=>pro.stats().audio)).monitor,0,'Mic is not sent to the speakers');
    await page.locator('#mic').click();await page.waitForFunction(()=>!pro.stats().audio.input);

    // 6d. Audio EQ in the audio wire reshapes what follows it: a silenced EQ gives an Audio band of 0, the raw Audio node does not.
    const [eq,band]=await page.evaluate(([a,e,b])=>{const eq=pro.addNode('spectrum',40,500),band=pro.addNode('audio',250,500);pro.setProperty(eq,'gain',0);
      pro.connect(a,'audio',eq,'audio');pro.connect(eq,'audio',e,'audio');pro.connect(eq,'audio',band,'audio');pro.connect(band,'value',b,'bloom');pro.connect(a,'bass',b,'edge');return [eq,band];},[ids.audio,ids.emitter,ids.bloom]);
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(id=>pro.value(id),band),0,'EQ output is silent');
    assert.ok(await page.evaluate(id=>pro.value(id),ids.audio)>0,'Audio node level is live');
    await page.evaluate(([eq,band])=>{for(const id of [band,eq]){pro.select(id);document.getElementById('deleteNode').click();}},[eq,band]);
    assert.ok((await layer0()).edges.some(e=>e.from===ids.audio&&e.to===ids.emitter&&e.input==='audio'),'Deleting the EQ heals the audio wire');

    // 6b. Webcam deformer runs the original camera feature on one shared stream; removing it stops the camera.
    const cam=await page.evaluate(id=>{pro.select(id);return pro.addNode('webcam');},twist.id);
    await page.waitForFunction(id=>pro.engine(id).w.camActive&&pro.engine(id).w.camColors,ids.emitter,{timeout:15000});
    await page.evaluate(id=>pro.select(id),cam);await page.keyboard.press('Delete');
    await page.waitForFunction(id=>!pro.engine(id).w.camActive,ids.emitter,{timeout:5000});

    // 6e. Camera input renders the original's camera lines; its brightness number drives knobs.
    await page.evaluate(()=>pro.importProject({format:'audiograph-pro',version:3,layers:[{id:'L1',name:'Cam',visible:true,opacity:1,blend:'source-over',
      nodes:[{id:'a',type:'audioIn',x:0,y:0,props:{}},{id:'c',type:'camera',x:200,y:0,props:{}},{id:'m',type:'map',x:200,y:200,props:{}},{id:'b',type:'bloom',x:400,y:0,props:{}},{id:'out',type:'output',x:600,y:0,props:{}}],
      edges:[{from:'a',out:'audio',to:'c',input:'audio'},{from:'c',out:'shape',to:'b',input:'image'},{from:'c',out:'brightness',to:'m',input:'value'},{from:'m',out:'value',to:'b',input:'bloom'},{from:'b',out:'image',to:'out',input:'image'}]}]}));
    await lit(.05,25000);await page.waitForFunction(()=>pro.value('m')>0,null,{timeout:10000});
    await page.waitForFunction(()=>pro.engine('c').w.vidSource==='camera'&&!!pro.engine('c').w.vidCamStream,null,{timeout:10000});

    // 7. Post FX run on images without any emitter (background → kaleido → output) via a helper engine.
    await page.evaluate(()=>pro.importProject({format:'audiograph-pro',version:2,layers:[{id:'L1',name:'Bg',visible:true,opacity:1,blend:'source-over',
      nodes:[{id:'bg',type:'background',x:0,y:0,props:{fill:'radial',c1:'#000000',c2:'#ff00aa'}},{id:'gr',type:'grade',x:200,y:0,props:{hue:120,saturation:100}},{id:'out',type:'output',x:400,y:0,props:{}}],
      edges:[{from:'bg',out:'image',to:'gr',input:'image'},{from:'gr',out:'image',to:'out',input:'image'}]}]}));
    await page.waitForFunction(()=>Object.keys(pro.stats().engines).includes('__fx')&&pro.stats().engines.__fx.status==='ready',null,{timeout:30000});
    await page.waitForTimeout(300);
    const rgb=await page.evaluate(()=>Array.from(document.getElementById('preview').getContext('2d').getImageData(480,270,1,1).data));
    assert.ok(rgb[1]>rgb[0],'Color correct hue-shifted magenta toward green: '+rgb);

    // 7b. Corner pin warps the frame: pulling the top-left corner in leaves that corner empty.
    await page.evaluate(()=>pro.importProject({format:'audiograph-pro',version:2,layers:[{id:'L1',name:'Pin',visible:true,opacity:1,blend:'source-over',
      nodes:[{id:'bg',type:'background',x:0,y:0,props:{fill:'flat',c1:'#ff00aa',c2:'#000000'}},{id:'pin',type:'cornerPin',x:200,y:0,props:{tlx:40,tly:40}},{id:'out',type:'output',x:400,y:0,props:{}}],
      edges:[{from:'bg',out:'image',to:'pin',input:'image'},{from:'pin',out:'image',to:'out',input:'image'}]}]}));
    await page.evaluate(()=>pro.draw());
    const at=(x,y)=>page.evaluate(([x,y])=>Array.from(document.getElementById('preview').getContext('2d').getImageData(x,y,1,1).data),[x,y]);
    assert.ok((await at(20,20))[0]<20&&(await at(900,500))[0]>200,'Corner pin moves the top-left corner');

    // 8. Stage-1 (version 1) projects still import; unsafe or invalid data is rejected.
    const v1={format:'audiograph-pro',version:1,layers:[{id:'a',name:'Old',visible:true,opacity:1,nodes:[
      {id:'e',type:'emitter',x:0,y:0,props:{mode:'circle',drive:.5,energy:1,size:1,hue:0}},{id:'o',type:'output',x:200,y:0,props:{}}],edges:[{from:'e',out:'image',to:'o',input:'image'}]}]};
    const migrated=await page.evaluate(p=>pro.importProject(p),v1);
    assert.equal(migrated.version,3);assert.equal(migrated.layers[0].edges[0].out,'shape');assert.equal(migrated.layers[0].nodes[0].type,'waveform2d');
    // Version 2 emitters become Input / Emitter nodes; a camera-sourced Video becomes a Camera node, EQ wires become audio wires.
    const v2=await page.evaluate(()=>pro.validate({format:'audiograph-pro',version:2,layers:[{id:'a',name:'x',visible:true,opacity:1,blend:'screen',nodes:[{id:'e',type:'emitter',x:0,y:0,props:{mode:'video',chips:{'0':'Camera'}}},{id:'f',type:'emitter',x:0,y:0,props:{mode:'pixelwarp'}},{id:'q',type:'spectrum',x:0,y:0,props:{}},{id:'o',type:'output',x:0,y:0,props:{}}],edges:[{from:'q',out:'spectrum',to:'e',input:'spectrum'},{from:'e',out:'shape',to:'o',input:'image'}]}]}));
    assert.deepEqual(v2.layers[0].nodes.slice(0,2).map(n=>[n.type,n.props.render]),[['camera','lines'],['image','warp']]);
    assert.equal(v2.layers[0].edges[0].input,'audio');
    for(const bad of [{opts:{customFnX:'alert(1)'}},{mode:'nope'},{opts:{['a'.repeat(50)]:1}}]){
      const r=await page.evaluate(([v1,bad])=>{try{pro.validate({...v1,layers:[{...v1.layers[0],nodes:[{...v1.layers[0].nodes[0],props:{mode:'circle',...bad}},v1.layers[0].nodes[1]]}]});return 'accepted';}catch(e){return e.message;}},[v1,bad]);
      assert.notEqual(r,'accepted',JSON.stringify(bad));
    }

    // 9. Templates and layers: every template renders without errors; layers add, blend and delete.
    for(const t of await page.evaluate(()=>pro.templates)){
      await page.locator('#templates').selectOption(t);await lit(.05,25000).catch(async()=>assert.fail(`${t}: ${JSON.stringify(await page.evaluate(()=>pro.stats().errors))}`));
    }
    await page.locator('#addLayer').click();assert.equal((await project()).layers.length,3,'Two-layer template + one more');
    await page.locator('[data-property="layerBlend"] [data-value="difference"]').click().catch(()=>{});
    await page.locator('.layer-tab.active .layer-x').click();assert.equal((await project()).layers.length,2);

    // 10. Save / restore round trip.
    await page.locator('#save').click();const saved=await project();
    await page.evaluate(()=>pro.loadTemplate('Fluid bloom'));await page.locator('#restore').click();
    assert.deepEqual((await project()).layers.map(l=>l.name),saved.layers.map(l=>l.name));

    assert.deepEqual(errors,[],'No page errors');
    await page.screenshot({path:path.join(root,'..','pro-prototype.png')});

    // 11. Narrow screens: no horizontal overflow.
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow at 390px');
    console.log('Audiograph Pro tests passed');
  }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exit(1);});
