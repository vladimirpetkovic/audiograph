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
      headless:!process.env.AUDIOGRAPH_HEADED,args:['--ignore-gpu-blocklist','--enable-gpu-rasterization','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessRespectPreflightResults,BlockInsecurePrivateNetworkRequests']
    });
    const page=await browser.newPage({viewport:{width:1540,height:1020}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(process.env.AUDIOGRAPH_PRO_URL||`http://127.0.0.1:${server.address().port}/audiograph/pro/`);
    await page.waitForFunction(()=>window.pro&&Object.values(pro.stats().engines).some(e=>e.status==='ready'),null,{timeout:30000});
    await page.evaluate(()=>pro.dissolve(false));
    const project=()=>page.evaluate(()=>pro.getProject());
    const layer0=async()=>(await project()).layers[0];
    const idOf=async type=>(await layer0()).nodes.find(n=>n.type===type)?.id;
    const ids={emitter:await idOf('gpuParticles'),audio:await idOf('audioIn'),bloom:await idOf('bloom'),output:await idOf('output')};
    {const g=await layer0(),pal=g.nodes.find(n=>n.type==='palette'),bl=g.nodes.find(n=>n.type==='bloom');
      assert.ok(pal&&g.edges.some(e=>e.from===ids.emitter&&e.to===pal.id)&&g.edges.some(e=>e.from===pal.id&&e.to===bl.id),'Default network: Fluid → Palette → Bloom');
      assert.equal(bl.props.bloom,20,'Default Bloom is 20');
      await page.locator(`.node[data-id="${bl.id}"] .node-head`).click();
      const off=await page.evaluate(()=>{const g=document.querySelector('.inspector .knob-grid'),a=g.getBoundingClientRect(),k=[...g.children].map(c=>c.getBoundingClientRect());return Math.abs(a.left+a.width/2-(k[0].left+k.at(-1).right)/2);});
      assert.ok(off<2,'One or two knobs are centred');
      // The editing tests below start from Fluid → Bloom.
      await page.evaluate(id=>{const p=pro.getProject(),l=p.layers[0],pal=l.nodes.find(n=>n.type==='palette');l.nodes=l.nodes.filter(n=>n!==pal);l.edges=l.edges.filter(e=>e.to!==pal.id&&e.from!==pal.id);
        l.edges.push({from:id,out:'shape',to:l.nodes.find(n=>n.type==='bloom').id,input:'image'});pro.importProject(p);},ids.emitter);}
    const lit=(min=.5,timeout=20000)=>page.waitForFunction(min=>pro.pixels()>min&&!pro.stats().errors.length,min,{timeout});

    // 1. Default graph: the native WebGPU Fluid runs inside the real Audiograph engine and reaches the preview.
    const native=await page.evaluate(async id=>{const e=pro.engine(id);await e.ready;return {status:await e.w.agSim.ready(),stats:e.w.agSim.stats()};},ids.emitter);
    assert.equal(native.status,'ready',JSON.stringify(native.stats));
    assert.equal(await page.evaluate(id=>pro.engine(id).base.pSimEnergy,ids.emitter),50,'Fluid energy defaults to 50');
    assert.ok(native.stats.adapter&&!/swiftshader|software/i.test(native.stats.adapter),native.stats.adapter);
    await lit(1);
    const pixels=()=>page.evaluate(()=>Array.from(document.getElementById('preview').getContext('2d').getImageData(0,0,960,540).data).filter((_,i)=>i%4!==3));
    const a=await pixels();await page.waitForTimeout(400);assert.ok(difference(a,await pixels())>.05,'Preview animates');
    assert.equal(await page.locator('.library-node[data-mode]').count(),25,'Every waveform and WebGPU simulation is in the library');
    assert.deepEqual(await page.locator('#library .panel-title').allTextContents().then(t=>t.map(x=>x.replace(/\d+$/,'').trim())),['Inputs','Waveforms','Emitters','Forces','Deformers','Color','Post FX','Controls','Audio analysis','Composite'],'Library categories, Inputs first');
    assert.deepEqual(await page.locator('#library .panel').first().locator('.library-node').allTextContents(),['Audio','Image','Video','Camera','Text','3D Object','Gaussian Splat','Computer','Clock','Mouse & keys','MIDI'],'Inputs');
    assert.deepEqual(await page.locator('#library .lib-sub').allTextContents(),['Media','Data','2D','3D','Particles','WebGPU particles','Bend','Noise'],'Input, Waveform, Emitter and Deformer groups');
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
    await page.locator('select[data-property="mode"]').selectOption('simsmoke');
    assert.equal((await layer0()).nodes.find(n=>n.id===ids.emitter).props.mode,'simsmoke');
    assert.deepEqual(await page.locator('select[data-property="mode"] option').evaluateAll(o=>o.map(x=>x.value).filter(v=>/boids|ferro/.test(v))),[],'Boids / Ferrofluid retired');
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

    // 6b. Dragging a loose node onto a wire wedges it in; a Palette takes an image (Bloom output) and blends over it.
    const pal3=await page.evaluate(id=>{pro.select(null);const b=pro.getProject().layers[0].nodes.find(n=>n.id===id);return pro.addNode('palette',b.x+40,b.y+200);},ids.bloom);
    const bo=await page.evaluate(([a,b])=>{const w=document.querySelector(`.wire[data-from="${a}"][data-to="${b}"]`),q=w.getPointAtLength(w.getTotalLength()/2),m=w.getScreenCTM();return {x:q.x*m.a+m.e,y:q.y*m.d+m.f};},[ids.bloom,ids.output]);
    const p3=await page.locator(`.node[data-id="${pal3}"] .node-head`).boundingBox();
    await page.mouse.move(p3.x+20,p3.y+p3.height/2);await page.mouse.down();await page.mouse.move(p3.x+30,p3.y+p3.height/2,{steps:2});
    await page.mouse.move(bo.x,bo.y,{steps:8});assert.ok(await page.locator('.wire.wedge').count(),'Target wire highlights while dragging');await page.mouse.up();
    g=await layer0();assert.ok(g.edges.some(e=>e.from===ids.bloom&&e.to===pal3)&&g.edges.some(e=>e.from===pal3&&e.to===ids.output),'Dropping a node on a wire wedges it in');
    for(const blend of ['normal','multiply','screen','hue']){await page.evaluate(([id,b])=>{pro.setProperty(id,'blend',b);pro.draw();},[pal3,blend]);
      assert.deepEqual(await page.evaluate(()=>pro.stats().errors),[],`Palette (${blend}) recolors an image`);}
    assert.ok(await page.evaluate(()=>pro.pixels())>0,'Blended palette image is visible');
    await page.evaluate(id=>pro.select(id),pal3);await page.keyboard.press('Delete');

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
    assert.equal(migrated.version,8);assert.equal(migrated.layers[0].edges[0].out,'shape');assert.equal(migrated.layers[0].nodes[0].type,'waveform2d');
    // Version 2 emitters become Input / Emitter nodes; a camera-sourced Video becomes a Camera node, EQ wires become audio wires.
    const v2=await page.evaluate(()=>pro.validate({format:'audiograph-pro',version:2,layers:[{id:'a',name:'x',visible:true,opacity:1,blend:'screen',nodes:[{id:'e',type:'emitter',x:0,y:0,props:{mode:'video',chips:{'0':'Camera'}}},{id:'f',type:'emitter',x:0,y:0,props:{mode:'pixelwarp'}},{id:'q',type:'spectrum',x:0,y:0,props:{}},{id:'o',type:'output',x:0,y:0,props:{}}],edges:[{from:'q',out:'spectrum',to:'e',input:'spectrum'},{from:'e',out:'shape',to:'o',input:'image'}]}]}));
    assert.deepEqual(v2.layers[0].nodes.slice(0,2).map(n=>[n.type,n.props.render]),[['camera','lines'],['image','warp']]);
    assert.equal(v2.layers[0].edges[0].input,'audio');
    // Version 3 Geometry nodes fold into the renderer they follow.
    const v3=await page.evaluate(()=>pro.validate({format:'audiograph-pro',version:3,layers:[{id:'a',name:'x',visible:true,opacity:1,blend:'screen',nodes:[
      {id:'w',type:'waveform2d',x:0,y:0,props:{mode:'circle'}},{id:'l',type:'lines',x:0,y:0,props:{thick:4}},{id:'s',type:'symmetry',x:0,y:0,props:{mode:'r6',gap:10}},{id:'o',type:'oscillator',x:0,y:0,props:{}},{id:'out',type:'output',x:0,y:0,props:{}}],
      edges:[{from:'w',out:'shape',to:'l',input:'shape'},{from:'l',out:'shape',to:'s',input:'shape'},{from:'o',out:'value',to:'l',input:'thick'},{from:'s',out:'shape',to:'out',input:'image'}]}]}));
    const w3=v3.layers[0].nodes.find(n=>n.id==='w');
    const s3=v3.layers[0].nodes.find(n=>n.type==='symmetry');
    assert.deepEqual([v3.layers[0].nodes.length,w3.props.thick,w3.props.symmetry,s3?.props],[4,4,undefined,{mode:'r6',gap:10}],'Geometry folded, symmetry kept as a Symmetry node');
    assert.deepEqual(v3.layers[0].edges.map(e=>[e.from,e.to,e.input]).sort(),[['o','w','thick'],['w',s3.id,'shape'],[s3.id,'out','image']].sort(),'Edges retargeted');
    // Version 6: spin / symmetry / mirror on a renderer become Spin, Symmetry and Mirror nodes after it; wires and autos follow.
    const v6=await page.evaluate(()=>pro.validate({format:'audiograph-pro',version:6,layers:[{id:'a',name:'x',visible:true,opacity:1,blend:'screen',nodes:[
      {id:'w',type:'waveform2d',x:0,y:0,props:{mode:'circle',spin:-2,speed:1.5,symmetry:'r4',flipH:true},auto:['symGap']},{id:'o',type:'oscillator',x:0,y:0,props:{}},{id:'out',type:'output',x:0,y:0,props:{}}],
      edges:[{from:'o',out:'value',to:'w',input:'spin'},{from:'w',out:'shape',to:'out',input:'image'}]}]}));
    const n6=t=>v6.layers[0].nodes.find(n=>n.type===t),e6=v6.layers[0].edges;
    assert.deepEqual([n6('symmetry')?.props,n6('mirror')?.props,n6('spin')?.props,n6('symmetry')?.auto,n6('waveform2d').props.spin],
      [{mode:'r4',gap:0},{flipH:true,flipV:false,reflect:false},{spin:-2,speed:1.5},['gap'],undefined],'Motion props moved into nodes');
    assert.ok(e6.some(e=>e.from==='o'&&e.to===n6('spin').id&&e.input==='spin')&&e6.some(e=>e.from===n6('spin').id&&e.to==='out'),'Motion wires follow');
    const r6=await page.evaluate(async p=>{pro.importProject(p);for(let i=0;i<6;i++){pro.draw();await new Promise(r=>requestAnimationFrame(r));}return pro.stats().errors;},v6);
    assert.deepEqual(r6,[],'Spin / Symmetry / Mirror nodes render');
    // Version 8: Boids / Ferrofluid become Particles / Fluid; Flocking nodes are removed and the chain heals.
    const v7=await page.evaluate(()=>pro.validate({format:'audiograph-pro',version:7,layers:[{id:'a',name:'x',visible:true,opacity:1,blend:'screen',nodes:[
      {id:'b',type:'gpuParticles',x:0,y:0,props:{mode:'simboids'}},{id:'f',type:'flocking',x:0,y:0,props:{cohesion:100}},{id:'r',type:'gpuParticles',x:0,y:0,props:{mode:'simferro'}},{id:'out',type:'output',x:0,y:0,props:{}}],
      edges:[{from:'b',out:'shape',to:'f',input:'shape'},{from:'f',out:'shape',to:'out',input:'image'}]}]}));
    assert.deepEqual([v7.layers[0].nodes.map(n=>n.props.mode||n.type),v7.layers[0].edges.map(e=>[e.from,e.to])],[['simparticles','simfluid','output'],[['b','out']]],'v8 retires Boids / Ferrofluid / Flocking');
    // Templates and Autopilot build the nodes too.
    const tm=await page.evaluate(()=>{pro.loadTemplate('Kaleido spectrum');const a=pro.getProject().layers[0].nodes.map(n=>n.type);pro.autopilot.create('kaleidoscope spiral, fast spin');const b=pro.getProject().layers.flatMap(g=>g.nodes.map(n=>n.type));return [a.includes('symmetry'),b.includes('symmetry'),b.includes('spin')];});
    assert.deepEqual(tm,[true,true,true],'Templates and Autopilot add Symmetry / Spin nodes');
    // Auto knobs: only number knobs (and renderer options), saved with the node.
    const auto=await page.evaluate(()=>{const g={format:'audiograph-pro',version:4,layers:[{id:'a',name:'x',visible:true,opacity:1,blend:'screen',nodes:[{id:'w',type:'waveform2d',x:0,y:0,props:{mode:'circle'},auto:['thick','opt:pSimDrag','mode','nope']}],edges:[]}]};return pro.validate(g).layers[0].nodes[0].auto;});
    assert.deepEqual(auto,['thick','opt:pSimDrag'],'Auto knob list sanitised');
    for(const bad of [{opts:{customFnX:'alert(1)'}},{mode:'nope'},{opts:{['a'.repeat(50)]:1}}]){
      const r=await page.evaluate(([v1,bad])=>{try{pro.validate({...v1,layers:[{...v1.layers[0],nodes:[{...v1.layers[0].nodes[0],props:{mode:'circle',...bad}},v1.layers[0].nodes[1]]}]});return 'accepted';}catch(e){return e.message;}},[v1,bad]);
      assert.notEqual(r,'accepted',JSON.stringify(bad));
    }

    // 8b. Data inputs give live 0–1 numbers; the Computer node reads the local helper when it runs.
    const feed=require('child_process').spawn(process.execPath,[path.join(root,'pro','tools','computer-feed.mjs'),'7798'],{stdio:'ignore'});
    try{
      await page.waitForTimeout(1500);
      const data=await page.evaluate(async()=>{const ids={};for(const t of ['computer','clock','pointer'])ids[t]=pro.addNode(t,40,40);
        pro.setProperty(ids.computer,'source','helper');pro.setProperty(ids.computer,'port',7798);pro.setProperty(ids.computer,'smooth',0);pro.setProperty(ids.computer,'range','absolute');
        for(let i=0;i<30;i++){pro.draw();await new Promise(r=>setTimeout(r,100));}
        return {ids,cpu:pro.outputs?.(ids.computer),clock:pro.outputs?.(ids.clock),ptr:pro.outputs?.(ids.pointer)};});
      for(const [k,o] of Object.entries({cpu:data.cpu,clock:data.clock,ptr:data.ptr})){assert.ok(o&&Object.values(o).every(v=>v>=0&&v<=1),k+' outputs are 0–1: '+JSON.stringify(o));}
      assert.ok(data.cpu.cpu>0&&data.cpu.core>=data.cpu.cpu-.05&&data.cpu.memory>0&&'activity' in data.cpu,'Helper CPU, busiest core, memory and activity read: '+JSON.stringify(data.cpu));
      // Auto range stretches each reading to its recent low–high; outputs stay 0–1.
      const auto=await page.evaluate(async id=>{pro.setProperty(id,'range','auto');const seen=[];for(let i=0;i<15;i++){pro.draw();seen.push(pro.outputs(id));await new Promise(r=>setTimeout(r,100));}return seen;},data.ids.computer);
      assert.ok(auto.every(o=>Object.values(o).every(v=>v>=0&&v<=1)),'Auto-ranged outputs are 0–1');
      await page.evaluate(id=>pro.select(id),data.ids.computer);await page.waitForTimeout(500);
      assert.match(await page.locator('#properties .data-status').textContent(),/helper connected/i);
      assert.equal(await page.locator('#properties .live-value .meter').count(),8,'Eight Computer meters');
      for(const id of Object.values(data.ids))await page.evaluate(id=>{pro.select(id);},id),await page.locator('#deleteNode').click();
    }finally{feed.kill();}
    // Panels resize by dragging their borders and hide on double-click; transport uses icons; Detach sits in the middle.
    {const lib0=(await page.locator('.library').boundingBox()).width,g=await page.locator('.gutter[data-resize=library]').boundingBox();
      await page.mouse.move(g.x+3,g.y+200);await page.mouse.down();await page.mouse.move(g.x+83,g.y+200,{steps:5});await page.mouse.up();
      assert.ok(Math.abs((await page.locator('.library').boundingBox()).width-(lib0+80))<4,'Dragging the library border widens it');
      const pv0=(await page.locator('#previewWrap').boundingBox()).height,r=await page.locator('.gutter-row').boundingBox();
      await page.mouse.move(r.x+300,r.y+2);await page.mouse.down();await page.mouse.move(r.x+300,r.y-60,{steps:5});await page.mouse.up();
      assert.ok((await page.locator('#previewWrap').boundingBox()).height<pv0-40,'Dragging the preview border shrinks the preview');
      await page.locator('.gutter[data-resize=inspector]').dblclick();
      assert.ok(await page.evaluate(()=>pro.layout().hidden.inspector)&&(await page.locator('.inspector').boundingBox()).width<2,'Double-click hides properties');
      await page.locator('.gutter[data-resize=inspector]').dblclick();assert.ok((await page.locator('.inspector').boundingBox()).width>200,'Double-click brings properties back');
      for(const id of ['play','stop','record','snap'])assert.equal(await page.locator(`#${id} svg`).count(),1,id+' has an icon');
      assert.match(await page.locator('#output').textContent(),/Detach/);
      const t=await page.locator('.transport').boundingBox(),d=await page.locator('#output').boundingBox();
      assert.ok(Math.abs(d.x+d.width/2-(t.x+t.width/2))<t.width*.15,'Detach is centred in the transport bar');
      await page.evaluate(()=>{localStorage.removeItem('agpro.layout');});}
    // Two-finger trackpad scroll pans the graph vertically (pixel deltas), pinch zooms.
    {const vp=await page.locator('#graphViewport').boundingBox(),before=await page.evaluate(()=>pro.view());
      await page.evaluate(([x,y])=>document.getElementById('graphViewport').dispatchEvent(new WheelEvent('wheel',{deltaY:37.5,deltaMode:0,clientX:x,clientY:y,bubbles:true,cancelable:true})),[vp.x+50,vp.y+50]);
      const after=await page.evaluate(()=>pro.view());assert.ok(after.y<before.y&&after.zoom===before.zoom,'Trackpad pans vertically '+JSON.stringify([before,after]));
      await page.evaluate(([x,y])=>document.getElementById('graphViewport').dispatchEvent(new WheelEvent('wheel',{deltaY:-10,ctrlKey:true,deltaMode:0,clientX:x,clientY:y,bubbles:true,cancelable:true})),[vp.x+50,vp.y+50]);
      assert.ok((await page.evaluate(()=>pro.view())).zoom>after.zoom,'Pinch zooms');}

    // 9. Templates and layers: every template renders without errors; layers add, blend and delete.
    for(const t of await page.evaluate(()=>pro.templates)){
      await page.locator('#templates').selectOption(t);await lit(.05,25000).catch(async()=>assert.fail(`${t}: ${JSON.stringify(await page.evaluate(()=>pro.stats().errors))}`));
    }
    await page.locator('#templates').selectOption('Two layers');await lit(.05,25000);
    // Knobs turn like the original: dragging clockwise around the centre raises the value; the centre dot toggles Auto.
    await page.evaluate(()=>{const l=pro.getProject().layers.find(l=>l.nodes.some(n=>n.type==='waveform2d'));pro.selectLayer(l.id);pro.select(l.nodes.find(n=>n.type==='waveform2d').id);});
    const dial=page.locator('#properties .knob').filter({has:page.locator('[data-property="thick"]')}).first();
    if(await dial.count()){
      const before=await dial.evaluate(k=>k.getValue());const b=await dial.locator('.knob-dial').boundingBox(),cx=b.x+b.width/2,cy=b.y+b.height/2;
      await page.mouse.move(cx-15,cy+15);await page.mouse.down();for(const a of [135,180,225,270,315])await page.mouse.move(cx+20*Math.cos(a*Math.PI/180),cy+20*Math.sin(a*Math.PI/180));await page.mouse.up();
      assert.ok(await dial.evaluate(k=>k.getValue())>before,'Rotary drag raises the knob');
      await dial.locator('.knob-auto').click();
      assert.ok((await project()).layers.some(l=>l.nodes.some(n=>n.auto?.includes('thick'))),'Auto dot switches the knob to Auto');
    }else assert.fail('No Thickness knob in the inspector');
    await page.locator('#addLayer').click();assert.equal((await project()).layers.length,3,'Two-layer template + one more');
    await page.locator('[data-property="layerBlend"] [data-value="difference"]').click().catch(()=>{});
    await page.locator('.layer-tab.active .layer-x').click();assert.equal((await project()).layers.length,2);

    // Amplify passes any wire through: numbers are multiplied, images brightened; its output takes the input's type.
    {const r=await page.evaluate(async()=>{
      const P={format:'audiograph-pro',version:5,layers:[{id:'amp',name:'Amp',visible:true,opacity:1,blend:'source-over',nodes:[
        {id:'v',type:'value',x:0,y:0,props:{value:.3}},{id:'a1',type:'amplify',x:200,y:0,props:{gain:3}},{id:'w',type:'waveform2d',x:0,y:200,props:{mode:'circle'}},
        {id:'a2',type:'amplify',x:200,y:200,props:{gain:2}},{id:'b',type:'bloom',x:400,y:200,props:{}},{id:'a3',type:'amplify',x:600,y:200,props:{gain:1.5}},{id:'o',type:'output',x:800,y:200,props:{}}],
        edges:[{from:'v',out:'value',to:'a1',input:'in'},{from:'a1',out:'out',to:'w',input:'thick'},{from:'w',out:'shape',to:'a2',input:'in'},{from:'a2',out:'out',to:'b',input:'image'},
          {from:'b',out:'image',to:'a3',input:'in'},{from:'a3',out:'out',to:'o',input:'image'}]}]};
      pro.importProject(P,'amp');await new Promise(r=>setTimeout(r,2500));
      const mismatch=(()=>{try{pro.validate({...P,layers:[{...P.layers[0],edges:[...P.layers[0].edges,{from:'a3',out:'out',to:'a1',input:'gain'}]}]});return 'accepted';}catch(e){return e.message;}})();
      const wires=[...document.querySelectorAll('.wire')].map(w=>w.getAttribute('class'));
      return {value:pro.value('a1'),errors:pro.stats().errors,mismatch,wires,lit:pro.pixels()};});
    assert.ok(Math.abs(r.value-.9)<1e-6,'Amplify multiplies a number: '+r.value);
    assert.deepEqual(r.errors,[],'Amplify chain renders');assert.ok(r.lit>1,'Amplified shape draws');
    assert.match(r.mismatch,/Type mismatch|Cycle/,'An amplified image cannot drive a number knob');
    assert.ok(r.wires.some(c=>c==='wire number')&&r.wires.some(c=>c==='wire image'),'Amplify wires take the color of what flows through');}
    // Line style and Outline are waveform knob groups; old standalone nodes fold into the waveform.
    {const r=await page.evaluate(()=>{
      const P=pro.validate({format:'audiograph-pro',version:4,layers:[{id:'old',name:'Old',visible:true,opacity:1,blend:'source-over',nodes:[
        {id:'w',type:'waveform2d',x:0,y:0,props:{mode:'circle'}},{id:'ls',type:'lineStyle',x:200,y:0,props:{shape:'dashed',size:150}},{id:'ol',type:'outline',x:400,y:0,props:{style:'fill',weight:4}},{id:'o',type:'output',x:600,y:0,props:{}}],
        edges:[{from:'w',out:'shape',to:'ls',input:'shape'},{from:'ls',out:'shape',to:'ol',input:'shape'},{from:'ol',out:'shape',to:'o',input:'image'}]}]});
      const w=P.layers[0].nodes.find(n=>n.id==='w');pro.importProject(P,'old');pro.select('w');
      return {types:P.layers[0].nodes.map(n=>n.type),props:[w.props.lineShape,w.props.styleSize,w.props.outline,w.props.outlineStyle,w.props.outlineWeight],edge:P.layers[0].edges.map(e=>e.from+'>'+e.to),
        groups:[...document.querySelectorAll('#properties [data-group]')].map(g=>g.dataset.group),cats:[...document.querySelectorAll('#library [data-category], #library .panel')].map(p=>p.textContent).join('|')};});
    assert.deepEqual(r.types,['waveform2d','output'],'Style nodes fold away');
    assert.deepEqual(r.props,['dashed',150,true,'fill',4],'Their settings move onto the waveform');
    assert.deepEqual(r.edge,['w>o'],'Wires heal');
    assert.ok(r.groups.includes('Line style')&&r.groups.includes('Outline'),'Waveform inspector has Line style and Outline groups');
    assert.ok(!/\bStyle\b/.test(r.cats.replace(/Line style/g,'')),'No Style category');}
    // Simulation physics knobs live in Forces nodes; old projects move them out of the simulation.
    {const r=await page.evaluate(async()=>{
      const P=pro.validate({format:'audiograph-pro',version:5,layers:[{id:'f',name:'F',visible:true,opacity:1,blend:'source-over',nodes:[
        {id:'lfo',type:'value',x:0,y:200,props:{}},{id:'s',type:'gpuParticles',x:0,y:0,props:{mode:'simparticles',opts:{pSpGravity:60,pSpSwirl:-20,pSpAmount:150}},auto:['opt:pSpTurb']},{id:'o',type:'output',x:400,y:0,props:{}}],
        edges:[{from:'s',out:'shape',to:'o',input:'image'},{from:'lfo',out:'value',to:'s',input:'opt_pSpDrag'}]}]});
      const L=P.layers[0],get=t=>L.nodes.find(n=>n.type===t);
      pro.importProject(P,'forces');pro.select('s');
      await new Promise(r=>{const t=setInterval(()=>{if(document.querySelector('[data-property="forces"]')){clearInterval(t);r();}},100);setTimeout(r,8000);});
      const simKnobs=[...document.querySelectorAll('#properties [data-property^="opt:"]')].map(k=>k.dataset.property);
      const chips=[...document.querySelectorAll('[data-property="forces"] button')].map(b=>b.textContent);
      pro.select(get('gravity').id);
      const gravKnobs=[...document.querySelectorAll('#properties [data-property]')].map(k=>k.dataset.property).filter(k=>['gravity','sand','buoyancy'].includes(k));
      await new Promise(r=>setTimeout(r,1500));const e=pro.engine('s'),slider=e.w.document.getElementById('pSpGravity');
      return {types:L.nodes.map(n=>n.type).sort(),opts:get('gpuParticles').props.opts,grav:get('gravity').props.gravity,swirl:get('swirl').props.swirl,
        dragWire:L.edges.some(e=>e.from==='lfo'&&e.to===get('drag').id&&e.input==='drag'),turbAuto:get('turbulence').auto,
        toOutput:L.edges.find(e=>e.to==='o').from,simKnobs,chips,gravKnobs,slider:slider&&+slider.value};});
    assert.deepEqual(r.types,['drag','gpuParticles','gravity','output','swirl','turbulence','value'],'Physics knobs move to Forces / Noise nodes');
    assert.deepEqual(r.opts,{pSpAmount:150},'Only emission knobs stay on the simulation');
    assert.equal(r.grav,60);assert.equal(r.swirl,-20);assert.ok(r.dragWire,'Wired knobs follow');assert.deepEqual(r.turbAuto,['amount'],'Auto knobs follow');
    assert.notEqual(r.toOutput,'s','The forces sit between the simulation and the output');
    assert.ok(!r.simKnobs.includes('opt:pSpGravity')&&r.simKnobs.includes('opt:pSpAmount'),'The simulation inspector hides physics knobs');
    assert.ok(r.chips.includes('Gravity')&&r.chips.includes('Swirl')&&!r.chips.includes('Flocking'),'Force shortcuts match the simulation');
    assert.deepEqual(r.gravKnobs,['gravity'],'Gravity shows only the Particles knob');
    assert.equal(r.slider,60,'The Gravity node drives the simulation');}
    // The old Amplify deformer becomes the pass-through Amplify node.
    {const r=await page.evaluate(()=>{
      const P=pro.validate({format:'audiograph-pro',version:4,layers:[{id:'a',name:'A',visible:true,opacity:1,blend:'source-over',nodes:[
        {id:'w',type:'waveform2d',x:0,y:0,props:{mode:'circle'}},{id:'m',type:'amplify',x:200,y:0,props:{amount:3}},{id:'o',type:'output',x:400,y:0,props:{}}],
        edges:[{from:'w',out:'shape',to:'m',input:'shape'},{from:'m',out:'shape',to:'o',input:'image'}]}]});
      const m=P.layers[0].nodes.find(n=>n.id==='m');return {gain:m.props.gain,edges:P.layers[0].edges.map(e=>`${e.from}.${e.out}>${e.to}.${e.input}`)};});
    assert.equal(r.gain,3,'Amount becomes gain');
    assert.deepEqual(r.edges,['w.shape>m.in','m.out>o.image'],'Amplify ports are renamed');}

    // Deleting a node dissolves instead of cutting to black.
    {await page.evaluate(()=>{pro.dissolve(true);pro.loadTemplate('Kaleido spectrum');});await page.waitForTimeout(1500);
     const lit0=await page.evaluate(()=>pro.pixels());
     const after=await page.evaluate(async()=>{const p=pro.getProject(),g=p.layers[0],w=g.nodes.find(n=>n.type==='waveform2d');g.nodes=g.nodes.filter(n=>n!==w);g.edges=g.edges.filter(e=>e.from!==w.id&&e.to!==w.id);pro.importProject(p);
       await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const a=pro.pixels();await new Promise(r=>setTimeout(r,1500));return [a,pro.pixels()];});
     assert.ok(after[0]>lit0*.4&&after[1]<after[0]*.5,`A deleted visual fades out (${lit0.toFixed(2)} → ${after.map(v=>v.toFixed(2))})`);await page.evaluate(()=>{pro.undo();pro.dissolve(false);});}

    // Projection mapping: layouts, warped output, point drag + undo, validation, saved with the project.
    {await page.locator('#modeMap').click();assert.ok(await page.locator('#mapPanel').isVisible(),'Map mode shows the mapping panel');assert.ok(!(await page.locator('#autoPanel').isVisible()),'Only one workspace panel');
      for(const sel of ['.graph-region','.inspector','#templates','#library'])assert.ok(!(await page.locator(sel).isVisible()),sel+' is Studio only');
    await page.selectOption('[data-property=mapPreset]','Cube (3 faces)');await page.waitForTimeout(300);
    let m=await page.evaluate(()=>pro.mapping());assert.deepEqual(m.surfaces.map(s=>s.name),['Top','Left','Right']);assert.ok(m.on);
    await page.locator('[data-property=mapTest] [data-value=true]').click();await page.evaluate(()=>pro.draw());
    const corner=await page.evaluate(()=>{const d=document.getElementById('preview').getContext('2d').getImageData(0,0,40,40).data;let s=0;for(let i=0;i<d.length;i+=4)s+=d[i]+d[i+1]+d[i+2];return s;});
    assert.equal(corner,0,'Outside the surfaces the mapped output is black');assert.ok(await page.evaluate(()=>pro.pixels())>3,'The test card is drawn on the surfaces');
    const pt=await page.locator('#mapOverlay circle').first().boundingBox();
    await page.mouse.move(pt.x+pt.width/2,pt.y+pt.height/2);await page.mouse.down();await page.mouse.move(pt.x+60,pt.y+30,{steps:4});await page.mouse.up();
    const moved=(await page.evaluate(()=>pro.mapping())).surfaces[0].pts[0];assert.ok(moved[0]>m.surfaces[0].pts[0][0],'Dragging a handle moves the point');
    await page.evaluate(()=>pro.undo());assert.deepEqual((await page.evaluate(()=>pro.mapping())).surfaces[0].pts[0],m.surfaces[0].pts[0],'Point moves undo');
    await page.selectOption('[data-property=surfGrid]','2x2');assert.equal((await page.evaluate(()=>pro.mapping())).surfaces[0].pts.length,9,'Curved warp adds points');
    await page.locator('[data-property=mapTest] [data-value=false]').click();
    const kept=await page.evaluate(()=>{pro.loadTemplate('Fluid bloom');return pro.getProject().mapping.surfaces.length;});assert.equal(kept,3,'Templates keep the venue mapping');
    for(const bad of [{on:true,surfaces:[{id:'a',cols:2,rows:1,pts:[[0,0]]}]},{on:true,surfaces:Array.from({length:9},(_,i)=>({id:'s'+i,cols:1,rows:1,pts:[[0,0],[1,0],[0,1],[1,1]]}))}])
      assert.ok(await page.evaluate(b=>{try{const P=pro.getProject();P.mapping=b;pro.validate(P);return false;}catch{return true;}},bad),'Invalid mapping is rejected');
    await page.locator('[data-property=mapOn] [data-value=false]').click();
    await page.locator('#modeStudio').click();assert.ok(!(await page.locator('#mapOverlay').isVisible()),'Studio mode hides the handles');}

    // Autopilot: words → graph, every example builds a valid rendering project, live changes glide the palette.
    {await page.locator('#modeAuto').click();assert.ok(await page.locator('#autoPanel').isVisible(),'Autopilot workspace shows its panel');
    const it=await page.evaluate(()=>{const r=pro.autopilot.parse('blue fluid with gold spiral, no glow');return {v:r.visuals.map(v=>v.mode+':'+(v.colors||[]).join('+')),no:[...r.no]};});
    assert.deepEqual(it.v,['simfluid:blue','spiral:gold'],'Colours belong to the visual they describe');assert.ok(it.no.includes('glow'),'Negations are read');
    await page.fill('[data-property=apPrompt]','intense red fluid, swirling, sparks on the beat, glitchy');
    assert.ok((await page.locator('.ap-chip').allTextContents()).includes('Swirl'),'The panel shows what it understood');
    await page.press('[data-property=apPrompt]','Enter');await lit(.5,25000);
    const types=(await project()).layers[0].nodes.map(n=>n.type);
    for(const t of ['gpuParticles','swirl','palette','fracture','bloom','output'])assert.ok(types.includes(t),`Autopilot builds ${t}`);
    for(const ex of await page.evaluate(()=>pro.autopilot.examples)){await page.evaluate(t=>pro.autopilot.create(t),ex);
      await lit(.02,25000).catch(async()=>assert.fail(`Autopilot “${ex}”: ${JSON.stringify(await page.evaluate(()=>pro.stats().errors))}`));}
    await page.evaluate(()=>pro.autopilot.settings({changes:'mood',fade:.3}));await page.locator('[data-property=apLive] [data-value=true]').click();
    const pal=()=>page.evaluate(()=>pro.getProject().layers.flatMap(g=>g.nodes.filter(n=>n.type==='palette').map(n=>[n.props.c1,n.props.c2,n.props.c3,n.props.c4].join())).join());
    const p0=await pal(),h0=await page.evaluate(()=>pro.stats().frame);await page.locator('[data-property=apNext]').click();await page.waitForTimeout(1200);
    assert.notEqual(await pal(),p0,'A live change glides to new colours');assert.equal((await page.evaluate(()=>pro.autopilot.status())).tweens,0,'Tweens finish');
    const n0=await page.evaluate(()=>pro.getProject().layers[0].id);await page.evaluate(()=>{pro.autopilot.settings({changes:'all'});pro.autopilot.change('drop');});
    assert.notEqual(await page.evaluate(()=>pro.getProject().layers[0].id),n0,'Everything mode builds a new look on a drop');
    await page.evaluate(()=>pro.undo());assert.equal(await page.evaluate(()=>pro.getProject().layers[0].id),n0,'A rebuilt look is one undo step');
    // Write: Autopilot writes and builds its own description; typing takes over.
    await page.locator('[data-property=apWrite] [data-value=true]').click();await page.waitForTimeout(400);
    const wr=await page.evaluate(()=>pro.autopilot.settings());assert.ok(wr.write&&wr.live&&wr.prompt.length>8,'Write turns Autopilot on and writes a prompt');
    assert.equal(await page.evaluate(()=>pro.autopilot.parse(pro.autopilot.settings().prompt).read.length>2),true,'Written prompts are understood');
    await page.locator('[data-property=apPrompt]').pressSequentially('x');assert.equal((await page.evaluate(()=>pro.autopilot.settings())).write,false,'Typing turns Write off');
    await page.locator('#modeMap').click();await page.locator('#modeAuto').click();assert.ok(!(await page.locator('#mapPanel').isVisible()),'Mapping panel hides in Autopilot');
    for(const sel of ['.graph-region','.inspector'])assert.ok(!(await page.locator(sel).isVisible()),sel+' hides in Autopilot');
    await page.fill('[data-property=apPrompt]','');await page.locator('[data-property=apPrompt]').pressSequentially('pink spiral');await page.waitForTimeout(1800);
    assert.ok((await project()).layers[0].nodes.some(n=>n.props.mode==='spiral'),'Typing builds after a pause');
    await page.locator('[data-property=apLive] [data-value=false]').click();await page.locator('#modeStudio').click();}

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
