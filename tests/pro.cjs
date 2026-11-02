const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const gltfFile = require('./gltf-fixture.cjs');
const fbxFile = require('./fbx-fixture.cjs');
const cameraFixtures = require('./camera-fixture.cjs');
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
    // A mock AI bridge (routes must exist before the page loads).
    const red='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#ff0000"/></svg>').toString('base64');
    const aiSeen=[];let inFlight=0,maxInFlight=0;
    await page.routeWebSocket(/:7861/,ws=>ws.onMessage(raw=>{const m=JSON.parse(raw);
      if(m.type==='hello')ws.send(JSON.stringify({type:'info',version:1,device:'mock-cpu',mock:true,models:[{id:'sd-turbo',label:'SD-Turbo',loaded:true},{id:'sdxl-turbo',label:'SDXL-Turbo',loaded:false}],controls:['none','canny','depth']}));
      if(m.type==='frame'){aiSeen.push(m);inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);setTimeout(()=>{inFlight--;ws.send(JSON.stringify({type:'result',id:m.id,image:red,ms:42}));},60);}
    }));
    await page.goto(process.env.AUDIOGRAPH_PRO_URL||`http://127.0.0.1:${server.address().port}/audiograph/pro/`);
    await page.waitForFunction(()=>window.pro&&Object.values(pro.stats().engines).some(e=>e.status==='ready'),null,{timeout:30000});
    await page.evaluate(()=>pro.dissolve(false));
    const project=()=>page.evaluate(()=>pro.getProject());
    const lit=(min=.5,timeout=20000)=>page.waitForFunction(min=>pro.pixels()>min&&!pro.stats().errors.length,min,{timeout});
    const L=(nodes,edges)=>({format:'audiograph-pro',version:10,layers:[{id:'L',name:'L',visible:true,opacity:1,blend:'source-over',nodes:[{id:'a',type:'audioIn',x:0,y:0,props:{}},...nodes,{id:'out',type:'output',x:900,y:0,props:{}}],edges}]});
    if(!process.env.AUDIOGRAPH_RESOLUTION_ONLY&&!process.env.AUDIOGRAPH_MORPH_ONLY&&!process.env.AUDIOGRAPH_TOUR_ONLY){
    // AI: Model + Prompt + ControlNet feed AI Render, which streams frames to the bridge (mocked here) one at a time.
    const aiLib=await page.evaluate(()=>[...document.querySelectorAll('#library .library-node')].filter(b=>['aiModel','aiPrompt','aiControl','aiRender'].includes(b.dataset.type)).length);
    assert.equal(aiLib,4,'AI category lists Model, Prompt, ControlNet and AI Render');
    const aiGraph=(server)=>L([{id:'w',type:'waveform2d',x:200,y:0,props:{}},{id:'m',type:'aiModel',x:200,y:200,props:{model:'sdxl-turbo',server}},{id:'q',type:'aiPrompt',x:200,y:300,props:{prompt:'neon jellyfish',prompt2:'molten gold'}},
      {id:'c',type:'aiControl',x:200,y:400,props:{kind:'canny'}},{id:'r',type:'aiRender',x:500,y:0,props:{smooth:0,size:'384'}}],
      [{from:'a',out:'audio',to:'w',input:'audio'},{from:'w',out:'shape',to:'r',input:'image'},{from:'m',out:'model',to:'r',input:'model'},{from:'q',out:'prompt',to:'r',input:'prompt'},{from:'c',out:'control',to:'r',input:'control'},
       {from:'a',out:'level',to:'q',input:'mix'},{from:'r',out:'image',to:'out',input:'image'}]);
    const redness=()=>page.evaluate(()=>{const c=document.getElementById('preview'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let r=0,g=0;for(let i=0;i<d.length;i+=64){r+=d[i];g+=d[i+1];}return r/Math.max(1,g);});
    await page.evaluate(p=>pro.importProject(p),aiGraph('ws://127.0.0.1:7861'));
    await page.waitForFunction(()=>pro.stats().errors.length===0);
    await page.waitForFunction(()=>{const c=document.getElementById('preview'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let r=0,g=0;for(let i=0;i<d.length;i+=64){r+=d[i];g+=d[i+1];}return r>g*8&&r>1000;},null,{timeout:15000});
    await page.waitForTimeout(800);
    assert.ok(aiSeen.length>=3,'Frames keep streaming: '+aiSeen.length);assert.equal(maxInFlight,1,'Only one frame is in flight');
    const f=aiSeen.at(-1);
    assert.deepEqual([f.model,f.prompt,f.prompt2,f.control.kind,f.size],['sdxl-turbo','neon jellyfish','molten gold','canny',384],'Model, prompt and ControlNet reach the bridge');
    assert.ok(f.image.startsWith('data:image/jpeg')&&f.mix>=0&&f.mix<=1,'Frame is a JPEG with an audio-driven morph');
    await page.evaluate(()=>pro.select('r'));
    await page.waitForFunction(()=>/Connected · mock mode \(no model\) · SDXL-Turbo/.test(document.querySelector('#properties .ai-status')?.textContent||''),null,{timeout:5000});
    // No bridge: the picture passes through and the inspector says how to start it.
    await page.evaluate(p=>pro.importProject(p),aiGraph('ws://127.0.0.1:7999'));
    await page.evaluate(()=>pro.select('r'));
    await page.waitForFunction(()=>/start the AI bridge/.test(document.querySelector('#properties .ai-status')?.textContent||''),null,{timeout:8000});
    await lit(.02);assert.ok(await redness()<3,'Without a bridge the picture passes through');
    assert.ok(await page.evaluate(()=>document.querySelector('#properties code.cmd')?.textContent.includes('start.command')),'Inspector shows the setup command');
    assert.deepEqual(errors,[],'No page errors in AI nodes');
    console.log('AI tests passed');
    if(process.env.AUDIOGRAPH_AI_ONLY)return;
    await page.evaluate(()=>localStorage.clear());await page.reload();
    await page.waitForFunction(()=>window.pro&&Object.values(pro.stats().engines).some(e=>e.status==='ready'),null,{timeout:30000});
    await page.evaluate(()=>pro.dissolve(false));
    }
    if(!process.env.AUDIOGRAPH_RESOLUTION_ONLY&&!process.env.AUDIOGRAPH_MORPH_ONLY&&!process.env.AUDIOGRAPH_TOUR_ONLY){
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

    // 1. Default graph: the native WebGPU Fluid runs inside the real Audiograph engine and reaches the preview.
    const native=await page.evaluate(async id=>{const e=pro.engine(id);await e.ready;return {status:await e.w.agSim.ready(),stats:e.w.agSim.stats()};},ids.emitter);
    assert.equal(native.status,'ready',JSON.stringify(native.stats));
    assert.equal(await page.evaluate(id=>pro.engine(id).base.pSimEnergy,ids.emitter),50,'Fluid energy defaults to 50');
    assert.ok(native.stats.adapter&&!/swiftshader|software/i.test(native.stats.adapter),native.stats.adapter);
    await lit(1);
    const pixels=()=>page.evaluate(()=>Array.from(document.getElementById('preview').getContext('2d').getImageData(0,0,960,540).data).filter((_,i)=>i%4!==3));
    const a=await pixels();await page.waitForTimeout(400);assert.ok(difference(a,await pixels())>.05,'Preview animates');
    assert.equal(await page.locator('.library-node[data-mode]').count(),30,'Every waveform, 3D Object shape and WebGPU simulation is in the library');
    assert.deepEqual(await page.locator('#library .panel-title').allTextContents().then(t=>t.map(x=>x.replace(/\d+$/,'').trim())),['Inputs','Waveforms','Emitters','3D','Forces','Deformers','Color','Post FX','Controls','Audio analysis','Composite','AI'],'Library categories, Inputs first');
    assert.deepEqual(await page.locator('#library .panel').first().locator('.library-node').allTextContents(),['Audio','Image','Video','Camera','Text','Gaussian Splat','Computer','Clock','Mouse & keys','Live data','MIDI'],'Inputs');
    assert.deepEqual(await page.locator('#library .lib-sub').allTextContents(),['Media','Data','2D','Particles','WebGPU particles','Objects','Cloner','Effectors','Look','Bend','Symmetry','Noise'],'Input, Waveform, Emitter, 3D and Deformer groups');
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
    assert.equal((await layer0()).nodes.find(n=>n.id===palette.id).props.stops[1].c,'#c92a2a');
    {const stopsOf=async()=>(await layer0()).nodes.find(n=>n.id===palette.id).props.stops,n0=(await stopsOf()).length,ramp=page.locator('.pal-ramp'),box=await ramp.boundingBox();
      await page.mouse.click(box.x+box.width*.37,box.y+box.height/2);assert.equal((await stopsOf()).length,n0+1,'Clicking the ramp adds a colour');
      const st=page.locator('.pal-stop').nth(1),sb=await st.boundingBox();await page.mouse.move(sb.x+sb.width/2,sb.y+sb.height/2);await page.mouse.down();await page.mouse.move(sb.x+sb.width/2,sb.y+80,{steps:5});await page.mouse.up();
      assert.equal((await stopsOf()).length,n0,'Dragging a stop off the ramp removes it');
      await page.locator('.pal-auto').first().click();assert.equal((await stopsOf())[0].auto,true,'Per-colour Auto toggles');
      const c0=await page.evaluate(()=>getComputedStyle(document.querySelectorAll('.pal-stop')[0]).backgroundColor);await page.waitForTimeout(2500);
      assert.notEqual(await page.evaluate(()=>getComputedStyle(document.querySelectorAll('.pal-stop')[0]).backgroundColor),c0,'An Auto colour drifts');
      await page.locator('.pal-auto').first().click();}
    await lit(.3);

    // 4. Deformers change the real render.
    await page.evaluate(()=>pro.pause(true));
    for(let i=0;i<3;i++)await page.evaluate(()=>pro.draw());
    const before=await pixels();
    await page.evaluate(id=>pro.setProperty(id,'amount',100),twist.id);for(let i=0;i<3;i++)await page.evaluate(()=>pro.draw());
    assert.ok(difference(before,await pixels())>.2,'Twist changes the rendered output');
    await page.evaluate(()=>pro.pause(false));

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

    // 6e. Camera input gives the live picture (no renderer of its own); its brightness number drives knobs.
    await page.evaluate(()=>pro.importProject({format:'audiograph-pro',version:3,layers:[{id:'L1',name:'Cam',visible:true,opacity:1,blend:'source-over',
      nodes:[{id:'a',type:'audioIn',x:0,y:0,props:{}},{id:'c',type:'camera',x:200,y:0,props:{}},{id:'m',type:'map',x:200,y:200,props:{}},{id:'b',type:'bloom',x:400,y:0,props:{}},{id:'out',type:'output',x:600,y:0,props:{}}],
      edges:[{from:'a',out:'audio',to:'c',input:'audio'},{from:'c',out:'shape',to:'b',input:'image'},{from:'c',out:'brightness',to:'m',input:'value'},{from:'m',out:'value',to:'b',input:'bloom'},{from:'b',out:'image',to:'out',input:'image'}]}]}));
    await lit(.05,25000);await page.waitForFunction(()=>pro.value('m')>0,null,{timeout:10000});
    assert.ok(!(await page.evaluate(()=>Object.keys(pro.stats().engines))).includes('c'),'Camera is an input, not an engine');
    // 6f. Camera image → WebGPU particles emit: the sim spawns from the picture.
    await page.evaluate(()=>pro.importProject({format:'audiograph-pro',version:11,layers:[{id:'L1',name:'Emit',visible:true,opacity:1,blend:'source-over',
      nodes:[{id:'a',type:'audioIn',x:0,y:0,props:{}},{id:'c',type:'camera',x:200,y:0,props:{}},{id:'g',type:'gpuParticles',x:400,y:0,props:{}},{id:'out',type:'output',x:600,y:0,props:{}}],
      edges:[{from:'a',out:'audio',to:'g',input:'audio'},{from:'c',out:'image',to:'g',input:'emit'},{from:'g',out:'shape',to:'out',input:'image'}]}]}));
    await page.waitForFunction(()=>pro.engine('g')?.w?.simEmitterData?.kind==='image',null,{timeout:20000});
    // 6g. A v10 camera that fed a deformer keeps the layer alive through a particle emitter.
    const v10=await page.evaluate(()=>pro.validate({format:'audiograph-pro',version:10,layers:[{id:'L',name:'L',visible:true,opacity:1,blend:'source-over',nodes:[{id:'a',type:'audioIn',x:0,y:0,props:{}},{id:'c',type:'camera',x:0,y:0,props:{render:'lines'}},{id:'d',type:'twist',x:0,y:0,props:{}},{id:'out',type:'output',x:0,y:0,props:{}}],
      edges:[{from:'a',out:'audio',to:'c',input:'audio'},{from:'c',out:'shape',to:'d',input:'shape'},{from:'d',out:'shape',to:'out',input:'image'}]}]}));
    assert.deepEqual(v10.layers[0].edges.filter(e=>e.to==='c_particles'||e.from==='c_particles').map(e=>e.from+'.'+e.out+'>'+e.to+'.'+e.input).sort(),['a.audio>c_particles.audio','c.image>c_particles.emit','c_particles.shape>d.shape']);
    // 6h. Swapping the 3D object under a Cloner keeps drawing (idle helper engines no longer hold the fade), and Ripple bends the clones.
    await page.evaluate(()=>pro.importProject({format:'audiograph-pro',version:11,layers:[{id:'L1',name:'Cl',visible:true,opacity:1,blend:'source-over',
      nodes:[{id:'a',type:'audioIn',x:0,y:0,props:{}},{id:'o',type:'waveform3d',x:200,y:0,props:{}},{id:'cl',type:'cloner',x:400,y:0,props:{}},{id:'out',type:'output',x:600,y:0,props:{}}],
      edges:[{from:'a',out:'audio',to:'cl',input:'audio'},{from:'o',out:'object',to:'cl',input:'object'},{from:'cl',out:'shape',to:'out',input:'image'}]}]}));
    await lit(.05,25000);
    await page.evaluate(()=>pro.setProperty('o','mode','knot'));await page.waitForTimeout(600);
    const drawn=await page.evaluate(async()=>{const before=pro.pixels();let changed=0;for(let i=0;i<8;i++){await new Promise(r=>setTimeout(r,150));if(Math.abs(pro.pixels()-before)>.001)changed++;}return changed;});
    assert.ok(drawn>2,'Preview keeps drawing after swapping the Cloner object: '+drawn);
    // 6i. Light: cast shadows and a shadow-catching floor render without WebGPU errors; the floor adds lit pixels.
    {const lightScene=props=>page.evaluate(props=>pro.importProject({format:'audiograph-pro',version:11,layers:[{id:'L1',name:'Lit',visible:true,opacity:1,blend:'source-over',
        nodes:[{id:'a',type:'audioIn',x:0,y:0,props:{}},{id:'o',type:'waveform3d',x:200,y:0,props:{mode:'cube'}},{id:'cl',type:'cloner',x:400,y:0,props:{countX:4,countY:1,countZ:4}},{id:'li',type:'light',x:600,y:0,props},{id:'out',type:'output',x:800,y:0,props:{}}],
        edges:[{from:'a',out:'audio',to:'cl',input:'audio'},{from:'o',out:'object',to:'cl',input:'object'},{from:'cl',out:'shape',to:'li',input:'shape'},{from:'li',out:'shape',to:'out',input:'image'}]}]}),props);
      await lightScene({shadow:80,floor:0});await lit(.05,25000);await page.waitForTimeout(1500);const bare=await page.evaluate(()=>pro.pixels());
      await page.evaluate(()=>pro.setProperty('li','floor',90));await page.waitForTimeout(1500);
      const floored=await page.evaluate(()=>({px:pro.pixels(),errors:pro.stats().errors}));
      assert.deepEqual(floored.errors,[],'Shadows and floor render without errors');
      assert.ok(floored.px>bare*1.2,'The floor catches light: '+bare+' → '+floored.px);
      // Nothing rotates by default: auto orbit, orbit with sound and clone spin start at 0.
      const turn=await page.evaluate(()=>{const d=pro.engine('cl').w.document;return ['pG3Orbit','pG3OrbitSnd','pG3Spin'].map(id=>d.getElementById(id)?.value);});
      assert.deepEqual(turn,['0','0','0'],'Cloner does not turn on its own');
      // Viewport camera: dragging the preview orbits the 3D camera natively, double-click resets, undo restores.
      const box=await page.locator('#preview').boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height/2;
      await page.mouse.move(cx,cy);await page.mouse.down();await page.mouse.move(cx+100,cy+40,{steps:5});await page.mouse.up();
      const orb=await page.evaluate(()=>({view:pro.getProject().layers[0].view,so:(({vYaw,vPit})=>({vYaw,vPit}))(pro.engine('cl').w.simOpt)}));
      assert.ok(orb.view&&orb.view.yaw<-20&&orb.view.pit>5&&!orb.view.px,'Drag orbits a 3D layer: '+JSON.stringify(orb.view));
      await page.waitForTimeout(200);
      const so=await page.evaluate(()=>{const s=pro.engine('cl').w.simOpt;return [s.vYaw,s.vPit];});
      assert.deepEqual(so,[orb.view.yaw,orb.view.pit],'The Cloner camera follows the view');
      await page.mouse.dblclick(cx,cy);assert.equal((await project()).layers[0].view,undefined,'Double-click resets the view');
      await page.evaluate(()=>pro.undo());assert.ok((await project()).layers[0].view?.yaw<-20,'Undo restores the view');}
    // 6j. 2D layers: drag pans the picture, the wheel zooms toward the pointer, and the view is saved with the project.
    {await page.evaluate(()=>pro.importProject({format:'audiograph-pro',version:2,layers:[{id:'L1',name:'Flat',visible:true,opacity:1,blend:'source-over',
        nodes:[{id:'bg',type:'background',x:0,y:0,props:{fill:'flat',c1:'#ff00aa',c2:'#000000'}},{id:'out',type:'output',x:400,y:0,props:{}}],
        edges:[{from:'bg',out:'image',to:'out',input:'image'}]}]}));
      await page.waitForTimeout(400);
      const box=await page.locator('#preview').boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height/2;
      await page.mouse.move(cx,cy);await page.mouse.down();await page.mouse.move(cx+box.width/4,cy,{steps:4});await page.mouse.up();
      const v=(await project()).layers[0].view;assert.ok(Math.abs(v.px-.5)<.05&&!v.yaw,'Drag pans a 2D layer: '+JSON.stringify(v));
      await page.waitForTimeout(300);
      const left=await page.evaluate(()=>Array.from(document.getElementById('preview').getContext('2d').getImageData(20,270,1,1).data));
      assert.ok(left[0]<20,'The panned picture uncovers the left edge: '+left);
      await page.mouse.move(cx,cy);await page.mouse.wheel(0,-300);await page.waitForTimeout(500);
      const z=(await project()).layers[0].view;assert.ok(z.zm>1.3,'Wheel zooms: '+JSON.stringify(z));
      const saved=await page.evaluate(()=>pro.validate(pro.getProject()).layers[0].view);assert.deepEqual(saved,z,'The view is saved with the project');}

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
    assert.equal(migrated.version,13);assert.equal(migrated.layers[0].edges[0].out,'shape');assert.equal(migrated.layers[0].nodes[0].type,'waveform2d');
    // Version 2 emitters become Input / Emitter nodes; a camera-sourced Video becomes a Camera node, EQ wires become audio wires.
    const v2=await page.evaluate(()=>pro.validate({format:'audiograph-pro',version:2,layers:[{id:'a',name:'x',visible:true,opacity:1,blend:'screen',nodes:[{id:'e',type:'emitter',x:0,y:0,props:{mode:'video',chips:{'0':'Camera'}}},{id:'f',type:'emitter',x:0,y:0,props:{mode:'pixelwarp'}},{id:'q',type:'spectrum',x:0,y:0,props:{}},{id:'o',type:'output',x:0,y:0,props:{}}],edges:[{from:'q',out:'spectrum',to:'e',input:'spectrum'},{from:'e',out:'shape',to:'o',input:'image'}]}]}));
    assert.deepEqual(v2.layers[0].nodes.slice(0,2).map(n=>[n.type,n.props.warp]),[['camera','wave'],['image','wave']]);
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
      [{mode:'r4',gap:0},{flipH:true,flipV:false,reflect:false},{spin:2,dir:'left',speed:1.5},['gap'],undefined],'Motion props moved into nodes');
    assert.ok(e6.some(e=>e.from==='o'&&e.to===n6('spin').id&&e.input==='spin')&&e6.some(e=>e.from===n6('spin').id&&e.to==='out'),'Motion wires follow');
    const sd=await page.evaluate(async()=>{const {applyShapeNode}=await import('./graph.js');const d=p=>applyShapeNode('spin',{speed:1,...p},{})._spinDir;return [d({spin:2,dir:'right'}),d({spin:2,dir:'left'})];});
    assert.deepEqual(sd,[1,-1],'Spin right / Spin left turn opposite ways');
    const r6=await page.evaluate(async p=>{pro.importProject(p);for(let i=0;i<6;i++){pro.draw();await new Promise(r=>requestAnimationFrame(r));}return pro.stats().errors;},v6);
    assert.deepEqual(r6,[],'Spin / Symmetry / Mirror nodes render');
    // Version 8: Boids / Ferrofluid become Particles / Fluid; Flocking nodes are removed and the chain heals.
    const v7=await page.evaluate(()=>pro.validate({format:'audiograph-pro',version:7,layers:[{id:'a',name:'x',visible:true,opacity:1,blend:'screen',nodes:[
      {id:'b',type:'gpuParticles',x:0,y:0,props:{mode:'simboids'}},{id:'f',type:'flocking',x:0,y:0,props:{cohesion:100}},{id:'r',type:'gpuParticles',x:0,y:0,props:{mode:'simferro'}},{id:'out',type:'output',x:0,y:0,props:{}}],
      edges:[{from:'b',out:'shape',to:'f',input:'shape'},{from:'f',out:'shape',to:'out',input:'image'}]}]}));
    assert.deepEqual([v7.layers[0].nodes.map(n=>n.props.mode||n.type),v7.layers[0].edges.map(e=>[e.from,e.to])],[['simparticles','simfluid','output'],[['b','out']]],'v8 retires Boids / Ferrofluid / Flocking');
    // Templates and Autopilot build the nodes too.
    const tm=await page.evaluate(()=>{pro.loadTemplate('Glass');const a=pro.getProject().layers[0].nodes.map(n=>n.type);pro.autopilot.create('kaleidoscope spiral, fast spin');const b=pro.getProject().layers.flatMap(g=>g.nodes.map(n=>n.type));return [a.includes('symmetry'),b.includes('symmetry'),b.includes('spin')];});
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
      const t=await page.locator('.transport').boundingBox(),d=await page.locator('#output').boundingBox(),sp=await page.locator('#spectrum').boundingBox();
      assert.ok(Math.abs(sp.x+sp.width/2-(t.x+t.width/2))<t.width*.05&&d.x+d.width>t.x+t.width*.85,'Spectrum centred, Detach on the right');assert.equal(await page.locator('#audioMeter').count(),0,'No level bar');
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
    {const t=await page.evaluate(()=>[pro.templates.includes('Cloned'),[...document.querySelectorAll('#templates optgroup')].map(g=>g.label)]);
     assert.ok(t[0],'The Cloned scene is a template');assert.deepEqual(t[1],['Audiograph presets'],'Only Audiograph presets until a user template is saved');}
    await page.locator('#templates').selectOption('Cloned');await lit(.05,25000);assert.ok((await layer0()).nodes.some(n=>n.type==='cloner'&&n.props.layout==='network'),'Cloned scene loads');
    {const r=await page.evaluate(async()=>{const L=pro.getProject().layers[0],lk=L.nodes.find(n=>n.type==='links'),cl=L.nodes.find(n=>n.type==='cloner');
       pro.select(lk.id);const knobs=[...document.querySelectorAll('#properties [data-property]')].map(k=>k.dataset.property);
       const P=pro.getProject();P.layers[0].nodes.find(n=>n.id===lk.id).props.width=4.5;pro.importProject(P,'links');await new Promise(r=>setTimeout(r,1200));
       return {knobs,w:+pro.engine(cl.id).w.document.getElementById('pG3LinkW')?.value};});
     assert.ok(['width','glow','pulse'].every(k=>r.knobs.includes(k)),'Links has width, glow and sound pulse: '+r.knobs);assert.equal(r.w,4.5,'Link width reaches the cloner');}
    // Random effector: scale, rotation and position on each axis; an old single Tilt turns every axis.
    {const r=await page.evaluate(async()=>{
      const P=pro.validate({format:'audiograph-pro',version:11,layers:[{id:'R',name:'R',visible:true,opacity:1,blend:'source-over',nodes:[
        {id:'a',type:'audioIn',x:0,y:0,props:{}},{id:'o',type:'waveform3d',x:0,y:200,props:{mode:'cube',render:'normal'}},{id:'c',type:'cloner',x:200,y:0,props:{}},
        {id:'r',type:'randomEffector',x:400,y:0,props:{tilt:90,scaleX:0}},{id:'v',type:'value',x:400,y:200,props:{}},{id:'out',type:'output',x:600,y:0,props:{}}],
        edges:[{from:'a',out:'audio',to:'c',input:'audio'},{from:'o',out:'object',to:'c',input:'object'},{from:'c',out:'shape',to:'r',input:'shape'},{from:'r',out:'shape',to:'out',input:'image'},{from:'v',out:'value',to:'r',input:'tilt'}]}]});
      const rn=P.layers[0].nodes.find(n=>n.id==='r');pro.importProject(P,'random');pro.select('r');
      const groups=[...document.querySelectorAll('#properties [data-group]')].map(g=>g.dataset.group);
      const Q=pro.getProject();Object.assign(Q.layers[0].nodes.find(n=>n.id==='r').props,{scaleX:60,scaleZ:30});pro.importProject(Q,'random2');await new Promise(r=>setTimeout(r,1500));
      const d=pro.engine('c').w.document;
      return {rot:[rn.props.rotX,rn.props.rotY,rn.props.rotZ,'tilt' in rn.props],wire:P.layers[0].edges.find(e=>e.from==='v').input,groups,sx:+d.getElementById('pG3RndSX')?.value,sz:+d.getElementById('pG3RndSZ')?.value,ry:+d.getElementById('pG3RndRY')?.value,err:pro.stats().errors};});
    assert.deepEqual(r.rot,[90,90,90,false],'Old Tilt becomes rotation on every axis');assert.equal(r.wire,'rotY','Wired tilt follows to Y');
    assert.ok(['Scale','Rotation','Position'].every(g=>r.groups.includes(g)),'Scale / Rotation / Position groups: '+r.groups);
    assert.deepEqual([r.sx,r.sz],[60,30],'Per-axis scale reaches the cloner');assert.ok(r.ry>0&&!r.err.length,'Rotation Y is driven: '+JSON.stringify(r));}
    await page.evaluate(()=>pro.loadTemplate('Glass'));await lit(.05,25000);
    // Knobs turn like the original: dragging clockwise around the centre raises the value; the centre dot toggles Auto.
    await page.evaluate(()=>{const l=pro.getProject().layers.find(l=>l.nodes.some(n=>n.type==='waveform2d'));pro.selectLayer(l.id);const id=pro.addNode('waveform2d',undefined,undefined,{mode:'growth'});pro.select(id);});
    await page.waitForFunction(()=>[...document.querySelectorAll('#properties [data-property^="chip:"] .on')].some(b=>b.textContent==='Coral'),null,{timeout:8000});
    await page.evaluate(()=>{const l=pro.getProject().layers.find(l=>l.nodes.some(n=>n.type==='waveform2d'));pro.select(l.nodes.find(n=>n.type==='waveform2d').id);});
    // Inspector sections are an accordion: opening one closes the others.
    await page.locator('#properties .insp-fold[data-group="Lines"] > .insp-fold-head').click();
    assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('#properties .insp-fold:not(.closed)')].map(f=>f.dataset.group)),['Lines'],'One inspector section open at a time');
    const dial=page.locator('#properties .knob').filter({has:page.locator('[data-property="thick"]')}).first();
    if(await dial.count()){
      const before=await dial.evaluate(k=>k.getValue());const b=await dial.locator('.knob-dial').boundingBox(),cx=b.x+b.width/2,cy=b.y+b.height/2;
      await page.mouse.move(cx-15,cy+15);await page.mouse.down();for(const a of [135,180,225,270,315])await page.mouse.move(cx+20*Math.cos(a*Math.PI/180),cy+20*Math.sin(a*Math.PI/180));await page.mouse.up();
      assert.ok(await dial.evaluate(k=>k.getValue())>before,'Rotary drag raises the knob');
      await dial.locator('.knob-auto').click();
      assert.ok((await project()).layers.some(l=>l.nodes.some(n=>n.auto?.includes('thick'))),'Auto dot switches the knob to Auto');
    }else assert.fail('No Thickness knob in the inspector');
    await page.locator('#addLayer').click();await page.locator('#addLayer').click();assert.equal((await project()).layers.length,3,'One template layer + two more');
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
    // Lean inspector: one Sound section, no section named after the node, sim nodes skip the generic sound knobs and 3D tilt.
    {const r=await page.evaluate(async()=>{
      const groups=async(type,props)=>{pro.dissolve(false);pro.importProject({format:'audiograph-pro',version:11,layers:[{id:'L',name:'L',visible:true,opacity:1,blend:'source-over',
        nodes:[{id:'o',type:'waveform3d',x:0,y:200,props:{}},{id:'n',type,x:200,y:0,props},{id:'out',type:'output',x:600,y:0,props:{}}],
        edges:[...(type==='cloner'?[{from:'o',out:'object',to:'n',input:'object'}]:[]),{from:'n',out:'shape',to:'out',input:'image'}]}]},'lean');pro.select('n');
        await new Promise(r=>{const t=setInterval(()=>{if(document.querySelector('#properties [data-property^="opt:"]')){clearInterval(t);r();}},100);setTimeout(r,8000);});
        const keys=[...document.querySelectorAll('#properties [data-property]')].map(k=>k.dataset.property);
        return {groups:[...document.querySelectorAll('#properties [data-group]')].map(g=>g.dataset.group),props:keys,sound:[...document.querySelectorAll('#properties [data-group="Sound"] [data-property]')].map(k=>k.dataset.property)};};
      return {cl:await groups('cloner',{}),old:await groups('cloner',{intensity:150}),wf:await groups('waveform2d',{}),w3n:await groups('waveform3d',{render:'normal'}),w3:await groups('waveform3d',{tilt:30}),rot:await new Promise(r=>setTimeout(()=>r(pro.engine('n').applied?._dragRotX),800))};});
    assert.equal(r.cl.groups.filter(g=>g==='Sound').length,1,'Cloner has one Sound section');
    assert.ok(r.w3n.props.length<40&&!r.w3n.props.some(k=>/^opt:pG3/.test(k))&&!r.w3n.props.includes('intensity'),'A Normal 3D Object is not a full Cloner inspector: '+r.w3n.props.length);
    assert.ok(!r.cl.groups.some(g=>['Sound response','Cloner','3D nodes','Look','Objects'].includes(g)),'No duplicate or node-named sections: '+r.cl.groups);
    assert.ok(r.cl.props.includes('opt:pSimSens')&&!r.cl.props.includes('intensity')&&!r.cl.props.includes('tilt'),'Sim sound knobs only; no dead 3D tilt');
    assert.ok(r.old.props.includes('intensity'),'A changed generic sound knob stays visible');
    assert.ok(['sensitivity','contrast','fade'].every(k=>r.wf.sound.includes(k)),'Waveform Sound has Sensitivity, Contrast, Fade edges: '+r.wf.sound);
    assert.ok(r.wf.props.includes('sensitivity')&&!r.wf.props.includes('intensity')&&!r.wf.props.includes('tilt'),'Waveform: Sensitivity is the gain; no 3D tilt on 2D');
    assert.ok(r.w3.props.includes('tilt'),'Classic 3D keeps 3D tilt');
    assert.ok(Math.abs(r.rot-Math.PI/6)<1e-6,'3D tilt still reaches the engine with the viewport orbit: '+r.rot);}
    // The old Amplify deformer becomes the pass-through Amplify node.
    {const r=await page.evaluate(()=>{
      const P=pro.validate({format:'audiograph-pro',version:4,layers:[{id:'a',name:'A',visible:true,opacity:1,blend:'source-over',nodes:[
        {id:'w',type:'waveform2d',x:0,y:0,props:{mode:'circle'}},{id:'m',type:'amplify',x:200,y:0,props:{amount:3}},{id:'o',type:'output',x:400,y:0,props:{}}],
        edges:[{from:'w',out:'shape',to:'m',input:'shape'},{from:'m',out:'shape',to:'o',input:'image'}]}]});
      const m=P.layers[0].nodes.find(n=>n.id==='m');return {gain:m.props.gain,edges:P.layers[0].edges.map(e=>`${e.from}.${e.out}>${e.to}.${e.input}`)};});
    assert.equal(r.gain,3,'Amount becomes gain');
    assert.deepEqual(r.edges,['w.shape>m.in','m.out>o.image'],'Amplify ports are renamed');}

    // Deleting a node dissolves instead of cutting to black.
    {await page.evaluate(()=>{pro.dissolve(true);pro.loadTemplate('Glass');});await page.waitForTimeout(1500);
     const lit0=await page.evaluate(()=>pro.pixels());
     const after=await page.evaluate(async()=>{const p=pro.getProject(),g=p.layers[0],w=g.nodes.find(n=>n.type==='waveform2d');g.nodes=g.nodes.filter(n=>n!==w);g.edges=g.edges.filter(e=>e.from!==w.id&&e.to!==w.id);pro.importProject(p);
       await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const a=pro.pixels();await new Promise(r=>setTimeout(r,1500));return [a,pro.pixels()];});
     assert.ok(after[0]>lit0*.4&&after[1]<after[0]*.5,`A deleted visual fades out (${lit0.toFixed(2)} → ${after.map(v=>v.toFixed(2))})`);await page.evaluate(()=>{pro.undo();pro.dissolve(false);});}

    // Projection mapping: layouts, warped output, point drag + undo, validation, saved with the project.
    {await page.locator('#modeMap').click();assert.ok(await page.locator('#mapPanel').isVisible(),'Map mode shows the mapping panel');assert.ok(!(await page.locator('#autoPanel').isVisible()),'Only one workspace panel');
      for(const sel of ['.graph-region','.inspector','#templates','#library'])assert.ok(!(await page.locator(sel).isVisible()),sel+' is Studio only');
    await page.selectOption('[data-property=mapPreset]','Cube (3 faces)');await page.waitForTimeout(300);
    let m=await page.evaluate(()=>pro.mapping());assert.deepEqual(m.surfaces.map(s=>s.name),['Top','Left','Right']);assert.ok(m.on);
    assert.equal(await page.locator('[data-property=surfGrid]').inputValue(),'cap','Cube preset selects folded cap mapping');
    await page.locator('[data-property=mapTest] [data-value=true]').click();await page.evaluate(()=>pro.draw());
    const corner=await page.evaluate(()=>{const d=document.getElementById('preview').getContext('2d').getImageData(0,0,40,40).data;let s=0;for(let i=0;i<d.length;i+=4)s+=d[i]+d[i+1]+d[i+2];return s;});
    assert.equal(corner,0,'Outside the surfaces the mapped output is black');assert.ok(await page.evaluate(()=>pro.pixels())>3,'The test card is drawn on the surfaces');
    const pt=await page.locator('#mapOverlay circle').first().boundingBox();
    await page.mouse.move(pt.x+pt.width/2,pt.y+pt.height/2);await page.mouse.down();await page.mouse.move(pt.x+60,pt.y+30,{steps:4});await page.mouse.up();
    const moved=(await page.evaluate(()=>pro.mapping())).surfaces[0].pts[0];assert.ok(moved[0]>m.surfaces[0].pts[0][0],'Dragging a handle moves the point');
    await page.evaluate(()=>pro.undo());assert.deepEqual((await page.evaluate(()=>pro.mapping())).surfaces[0].pts[0],m.surfaces[0].pts[0],'Point moves undo');
    // Snap: a point dropped near another surface's point lands exactly on it; Alt drags freely; the toggle turns it off.
    {const box=await page.locator('#preview').boundingBox(),M=await page.evaluate(()=>pro.mapping()),tgt=M.surfaces[1].pts.find(q=>M.surfaces[0].pts.every(p=>Math.hypot(p[0]-q[0],p[1]-q[1])>.05)),src=M.surfaces[0].pts[0];
      const drag=async(alt)=>{await page.mouse.move(box.x+src[0]*box.width,box.y+src[1]*box.height);await page.mouse.down();if(alt)await page.keyboard.down('Alt');
        await page.mouse.move(box.x+tgt[0]*box.width+6,box.y+tgt[1]*box.height-5,{steps:6});await page.mouse.up();if(alt)await page.keyboard.up('Alt');return (await page.evaluate(()=>pro.mapping())).surfaces[0].pts[0];};
      assert.ok(await page.locator('[data-property=mapSnap] [data-value=true]').evaluate(b=>b.classList.contains('on')||b.getAttribute('aria-pressed')==='true'),'Snap is on by default');
      assert.deepEqual(await drag(false),tgt,'A dragged point snaps onto a nearby point of another surface');await page.evaluate(()=>pro.undo());
      assert.notDeepEqual(await drag(true),tgt,'Alt drags freely');await page.evaluate(()=>pro.undo());
      await page.locator('[data-property=mapSnap] [data-value=false]').click();assert.notDeepEqual(await drag(false),tgt,'Snap off drags freely');await page.evaluate(()=>pro.undo());
      await page.locator('[data-property=mapSnap] [data-value=true]').click();}
    await page.selectOption('[data-property=surfGrid]','2x2');assert.equal((await page.evaluate(()=>pro.mapping())).surfaces[0].pts.length,9,'Curved warp adds points');
    await page.locator('[data-property=mapTest] [data-value=false]').click();
    const kept=await page.evaluate(()=>{pro.loadTemplate('Ink');return pro.getProject().mapping.surfaces.length;});assert.equal(kept,3,'Templates keep the venue mapping');
    for(const bad of [{on:true,surfaces:[{id:'a',cols:2,rows:1,pts:[[0,0]]}]},{on:true,surfaces:Array.from({length:9},(_,i)=>({id:'s'+i,cols:1,rows:1,pts:[[0,0],[1,0],[0,1],[1,1]]}))}])
      assert.ok(await page.evaluate(b=>{try{const P=pro.getProject();P.mapping=b;pro.validate(P);return false;}catch{return true;}},bad),'Invalid mapping is rejected');
    await page.locator('[data-property=mapOn] [data-value=false]').click();
    await page.locator('#modeStudio').click();assert.ok(!(await page.locator('#mapOverlay').isVisible()),'Studio mode hides the handles');}

    // Autopilot (the original's): it reads the prompt, runs its own four layers and crossfades looks at the music's sections.
    {await page.locator('#modeAuto').click();assert.ok(await page.locator('#autoPanel').isVisible(),'Autopilot workspace shows its panel');
    await page.evaluate(()=>pro.autopilot.settings({changes:'everything',layers:'auto',match:85,every:24,write:false}));
    await page.fill('[data-property=apPrompt]','blue fluid with gold spirals');
    assert.match(await page.locator('[data-property=apRead]').textContent(),/fluid/,'The panel shows what it understood');
    await page.press('[data-property=apPrompt]','Enter');await lit(.5,25000);
    // The four renderers start in their own frames; wait until the base look is up.
    await page.waitForFunction(()=>pro.autopilot.status().slots.some(s=>s.role===0&&s.opacity>.9),null,{timeout:40000});
    const apIds=()=>page.evaluate(()=>({layers:pro.getProject().layers.map(g=>g.id),engines:Object.keys(pro.stats().engines)}));
    assert.deepEqual((await apIds()).layers,['ap-L0','ap-L1','ap-L2','ap-L3'],'Everything runs in four Autopilot layers');
    const settle=()=>page.waitForFunction(()=>!pro.autopilot.status().fading,null,{timeout:20000});
    await settle();
    // Sections change the look: no new engines, never a blank frame.
    for(const k of ['phrase','drop','calm','build','phrase']){
      await page.evaluate(k=>pro.autopilot.change(k,1),k);let min=1e9;
      for(let t=0;t<12;t++){min=Math.min(min,await page.evaluate(()=>pro.pixels()));if(!(await page.evaluate(()=>pro.autopilot.status().fading)))break;await page.waitForTimeout(250);}
      await settle();const st=await page.evaluate(()=>pro.autopilot.status());
      assert.ok(st.slots.some(s=>s.role===0&&s.opacity>.9),`${k}: a lit base layer ${JSON.stringify(st.slots)} ${JSON.stringify(await page.evaluate(()=>pro.stats().engines))}`);assert.ok(min>.3,`${k}: no blank frame (${min})`);
      assert.ok((await apIds()).engines.every(id=>/^ap-r[0-3]$/.test(id)),`${k}: changes reuse the four engines`);
      assert.deepEqual(await page.evaluate(()=>pro.stats().errors),[],`${k}: renders without errors`);
    }
    // Colours and Mood restyle your own project in place.
    await page.evaluate(()=>{pro.loadTemplate('Cloned');pro.autopilot.settings({changes:'colors'});});await lit(.02,25000);
    const pal=()=>page.evaluate(()=>pro.getProject().layers.flatMap(g=>g.nodes.filter(n=>n.type==='palette').map(n=>n.props.stops.map(s=>s.c).join())).join());
    const p0=await pal(),ids0=JSON.stringify(await apIds());await page.evaluate(()=>pro.autopilot.change('phrase',.3));await page.waitForTimeout(1000);
    assert.notEqual(await pal(),p0,'Colours glide to a new palette');assert.equal((await page.evaluate(()=>pro.autopilot.status())).tweens,0,'Tweens finish');
    assert.equal(JSON.stringify(await apIds()),ids0,'Colours keep your graph');
    await page.evaluate(()=>{pro.autopilot.settings({changes:'mood'});pro.autopilot.change('drop',.3);});await page.waitForTimeout(1000);
    assert.equal(JSON.stringify(await apIds()),ids0,'Mood keeps your graph');
    // Write: Autopilot writes its own description; typing takes over.
    await page.evaluate(()=>pro.autopilot.settings({changes:'everything'}));
    await page.locator('[data-property=apWrite] [data-value=true]').click();await page.waitForTimeout(600);
    const wr=await page.evaluate(()=>pro.autopilot.settings());assert.ok(wr.write&&wr.live&&wr.prompt.length>8,'Write turns Autopilot on and writes a prompt');
    assert.match(await page.evaluate(()=>pro.autopilot.read(pro.autopilot.settings().prompt)),/·/,'Written prompts are understood');
    await page.locator('[data-property=apPrompt]').pressSequentially('x');assert.equal((await page.evaluate(()=>pro.autopilot.settings())).write,false,'Typing turns Write off');
    await page.locator('#modeMap').click();await page.locator('#modeAuto').click();assert.ok(!(await page.locator('#mapPanel').isVisible()),'Mapping panel hides in Autopilot');
    for(const sel of ['.graph-region','.inspector'])assert.ok(!(await page.locator(sel).isVisible()),sel+' hides in Autopilot');
    await page.evaluate(()=>pro.autopilot.settings({match:100}));
    await page.fill('[data-property=apPrompt]','');await page.locator('[data-property=apPrompt]').pressSequentially('pink spiral');
    await page.waitForFunction(()=>pro.autopilot.status().slots.some(s=>s.role===0&&s.layout==='spiral'),null,{timeout:15000});
    assert.ok((await page.evaluate(()=>pro.autopilot.status())).slots.some(s=>s.role===0&&s.layout==='spiral'),'Typing builds after a pause');
    for(const layout of ['concentric','spiral']){
      await page.evaluate(layout=>pro.autopilot.create('pink '+layout),layout);
      assert.ok((await page.evaluate(()=>pro.autopilot.status())).slots.some(s=>s.role===0&&s.layout===layout),'A new description replaces the base with '+layout);
    }
    await page.locator('[data-property=apLive] [data-value=false]').click();
    await page.evaluate(()=>pro.autopilot.settings({match:85}));await page.locator('#modeStudio').click();}

    // Off and Hold must not brighten a deliberately dark Autopilot scene.
    await page.waitForFunction(()=>!pro.autopilot.status().fading&&pro.autopilot.status().tweens===0,null,{timeout:20000});
    await page.evaluate(async()=>{
      const G=await import(new URL('graph.js',location.href).href),P=pro.getProject();pro.autopilot.stop();
      for(const g of P.layers)for(const n of g.nodes){
        if(/^ap-r/.test(n.id)){n.type='waveform2d';n.props={...G.defaults(n.type),mode:'circle',sensitivity:5};}
        if(n.type==='palette'){n.props.stops=n.props.stops.map(s=>({...s,c:'#000000'}));n.props.fade=0;}
      }
      pro.importProject(P);
    });
    const dark=await project();
    await page.waitForTimeout(3500);
    assert.deepEqual(await project(),dark,'Off preserves the dark scene');
    await page.evaluate(()=>{pro.autopilot.start();pro.autopilot.settings({hold:true});});
    await page.waitForTimeout(3500);
    assert.deepEqual(await project(),dark,'Hold preserves the dark scene');
    await page.evaluate(()=>pro.autopilot.stop());
    // A steady quiet opening is not a drop, however the detector's history starts.
    const opening=await page.evaluate(async()=>{const {Pilot}=await import(new URL('pilot.js',location.href).href),pl=new Pilot(),seen=new Set();
      for(let i=0;i<1800;i++){pl.step(1/60,{energy:.12+.015*Math.sin(i/40)+.005*Math.cos(i/7),treble:.05},24,false);seen.add(pl.section);}return [...seen];});
    assert.ok(!opening.includes('drop'),'Calm opening read as '+opening.join(','));
    // Random creates a wired, editable scene, stops Autopilot and remains one undo step.
    for(let i=0;i<3;i++){
      await page.evaluate(()=>pro.pause(true));
      const before=await project();
      await page.locator('#randomGraph').click();
      const random=await project();
      assert.notDeepEqual(random.layers.map(g=>g.id),before.layers.map(g=>g.id),'Random replaces the graph');
      assert.ok(random.layers.every(g=>g.nodes.some(n=>n.type==='output')&&g.edges.length>=3),'Random builds wired nodes');
      assert.equal(await page.evaluate(()=>pro.autopilot.status().live),false,'Random stops Autopilot');
      await page.evaluate(()=>pro.pause(false));
      await page.waitForTimeout(4000);
      await lit(.02,25000);
      await page.evaluate(()=>{pro.pause(true);pro.undo();});
      assert.deepEqual(await project(),before,'Undo restores the scene before Random');
      await page.evaluate(()=>pro.pause(false));
    }
    // 10. Save / restore round trip.
    // Exercise the download/browser-storage path without a native Save dialog stealing keyboard focus.
    await page.evaluate(()=>{window.showSaveFilePicker=undefined;});
    const [sceneDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#save').selectOption('scene')]);
    // Save as template: it appears under User templates and loads back.
    {page.once('dialog',d=>d.accept('My look'));await page.locator('#save').selectOption('template');
     assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('#templates optgroup')].map(g=>g.label)),['User templates','Audiograph presets'],'User templates group appears');
     const mine=await project();await page.evaluate(()=>pro.loadTemplate('Ink'));await page.locator('#templates').selectOption('user:My look');
     assert.deepEqual((await project()).layers.map(l=>l.nodes.length),mine.layers.map(l=>l.nodes.length),'A user template loads back');
     page.once('dialog',d=>d.accept('My look'));await page.locator('#save').selectOption('remove');
     assert.ok(!(await page.evaluate(()=>!!document.querySelector('#templates option[value="user:My look"]'))),'A user template can be removed');}
    await sceneDownload.path();const saved=await project();
    await page.evaluate(()=>pro.loadTemplate('Ink'));await page.locator('#restore').click();
    assert.deepEqual((await project()).layers.map(l=>l.name),saved.layers.map(l=>l.name));
    // .ag scenes: ⌘O opens one (also by dropping it), the file holds the project.
    await page.evaluate(()=>pro.loadTemplate('Ink'));
    await page.locator('#graphViewport').focus();
    // Headless Chrome sometimes drops a picker under load: press again before giving up.
    let chooser;for(let i=0;i<3&&!chooser;i++)[chooser]=await Promise.all([page.waitForEvent('filechooser',{timeout:8000}).catch(()=>null),page.keyboard.press('Meta+o')]);
    assert.ok(chooser,'⌘O opens the file picker');
    await chooser.setFiles({name:'scene.ag',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});await page.waitForTimeout(300);
    assert.deepEqual((await project()).layers.map(l=>l.name),saved.layers.map(l=>l.name),'Opens an .ag scene');
    assert.ok(await page.evaluate(()=>getComputedStyle(document.body).zoom)==='1.2'||(await page.viewportSize()).width<1440,'UI is 20% bigger on wide screens');

    assert.deepEqual(errors,[],'No page errors');
    await page.screenshot({path:path.join(root,'..','pro-prototype.png')});

    // 11. Narrow screens: no horizontal overflow.
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow at 390px');
    console.log('Audiograph Pro tests passed');
    // 3D category: a Cloner clones several primitives and renders; v8 cloner projects split into nodes.
    await page.evaluate(p=>pro.importProject(p),L([{id:'s',type:'waveform3d',x:0,y:300,props:{mode:'sphere',render:'normal'}},{id:'k',type:'waveform3d',x:0,y:420,props:{mode:'cube',render:'normal'}},
      {id:'c',type:'cloner',x:200,y:0,props:{layout:'scatter'}},{id:'p',type:'palette',x:400,y:0,props:{}}],
      [{from:'a',out:'audio',to:'c',input:'audio'},{from:'s',out:'object',to:'c',input:'object'},{from:'k',out:'object',to:'c',input:'object2'},{from:'c',out:'shape',to:'p',input:'shape'},{from:'p',out:'shape',to:'out',input:'image'}]));
    await page.waitForTimeout(4000);
    const litCount=()=>page.evaluate(()=>{const c=document.getElementById('preview'),x=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<x.length;i+=16)if(x[i]+x[i+1]+x[i+2]>60)n++;return n;});
    assert.ok(await litCount()>500,'Cloner renders');
    const v8=await page.evaluate(()=>pro.validate({format:'audiograph-pro',version:8,layers:[{id:'L',name:'L',visible:true,opacity:1,blend:'source-over',nodes:[{id:'a',type:'audioIn',x:0,y:0,props:{}},{id:'c',type:'gpuParticles',x:200,y:0,props:{mode:'simcloner',opts:{pG3Nx:9,pG3Links:4,pG3Size:30},chips:{'1':'Cube','2':'Spiral'}}},{id:'o',type:'output',x:400,y:0,props:{}}],edges:[{from:'a',out:'audio',to:'c',input:'audio'},{from:'c',out:'shape',to:'o',input:'image'}]}]}));
    const vn=v8.layers[0].nodes,by=t=>vn.find(n=>n.type===t);
    assert.deepEqual([by('cloner')?.props.layout,by('cloner')?.props.countX,by('waveform3d')?.props.mode,by('waveform3d')?.props.size,by('links')?.props.links],['spiral',9,'cube',30,4],'v8 Cloner migrates to 3D nodes');
    assert.ok(v8.layers[0].edges.some(e=>e.from===by('waveform3d').id&&e.to===by('cloner').id&&e.input==='object'),'Primitive feeds the Cloner');
    // 3D Object: one node for every shape (and your OBJ as Model), drawn Normal or as a Waveform; any of them feeds a Cloner.
    const objItems=await page.evaluate(()=>[...document.querySelectorAll('#library .library-node[data-type="waveform3d"]')].map(b=>b.textContent.trim()));
    for(const s of ['Sphere','Cylinder','Frame','DNA','Terrain','3D model'])assert.ok(objItems.some(t=>t.startsWith(s)),`3D Objects lists ${s}`);
    for(const [mode,render] of [['cylinder','normal'],['frame','waveform'],['dna','normal'],['cone','waveform']]){
      await page.evaluate(p=>pro.importProject(p),L([{id:'o',type:'waveform3d',x:200,y:0,props:{mode,render}},{id:'p',type:'palette',x:400,y:0,props:{}}],[{from:'a',out:'audio',to:'o',input:'audio'},{from:'o',out:'shape',to:'p',input:'shape'},{from:'p',out:'shape',to:'out',input:'image'}]));
      await page.waitForTimeout(2500);assert.ok(await litCount()>300,`3D Object ${mode} renders ${render}`);
    }
    await page.evaluate(p=>pro.importProject(p),L([{id:'o',type:'waveform3d',x:0,y:200,props:{mode:'terrain',render:'waveform'}},{id:'m',type:'waveform3d',x:0,y:300,props:{mode:'model',render:'waveform'}},{id:'c',type:'cloner',x:200,y:0,props:{}}],
      [{from:'a',out:'audio',to:'c',input:'audio'},{from:'o',out:'object',to:'c',input:'object'},{from:'m',out:'object',to:'c',input:'object2'},{from:'c',out:'shape',to:'out',input:'image'}]));
    await page.waitForTimeout(3000);assert.ok(await litCount()>500,'A Cloner clones a Terrain form and a Model');
    const v9=await page.evaluate(()=>pro.validate({format:'audiograph-pro',version:9,layers:[{id:'L',name:'L',visible:true,opacity:1,blend:'source-over',nodes:[{id:'p',type:'primitive',x:0,y:0,props:{shape:'cone',size:40}},{id:'o',type:'object',x:0,y:0,props:{render:'cloud'}},{id:'w',type:'waveform3d',x:0,y:0,props:{mode:'dna'}},{id:'q',type:'palette',x:0,y:0,props:{c1:'#000000',c2:'#ff0000',c3:'#00ff00',c4:'#0000ff',colors:'3'}}],edges:[]}]}));
    assert.deepEqual(v9.layers[0].nodes.map(n=>[n.type,n.props.mode,n.props.render]),[['waveform3d','cone','normal'],['waveform3d','model','points'],['waveform3d','dna','waveform'],['palette','toneramp',undefined]],'v9 objects become 3D Objects');
    assert.deepEqual(v9.layers[0].nodes[3].props.stops.map(s=>s.c),['#000000','#ff0000','#00ff00','#0000ff'],'Old palette colours become ramp stops');
    // Any visual feeds WebGPU particles' emit; a 3D Object emits from its live pose.
    const emitFrom=async tilt=>{await page.evaluate(p=>pro.importProject(p),L([{id:'o',type:'waveform3d',x:0,y:200,props:{mode:'cone',render:'normal',tilt}},{id:'e',type:'gpuParticles',x:200,y:0,props:{mode:'simparticles'}}],
      [{from:'a',out:'audio',to:'e',input:'audio'},{from:'o',out:'object',to:'e',input:'emit'},{from:'e',out:'shape',to:'out',input:'image'}]));
      await page.waitForFunction(()=>pro.emitPoints('e')?.length>1000,null,{timeout:15000});await page.waitForTimeout(1500);const pts=await page.evaluate(()=>pro.emitPoints('e'));
      let y=0;for(let i=1;i<pts.length;i+=5)y+=pts[i];return y/(pts.length/5);};
    const up=await emitFrom(0),side=await emitFrom(90);
    assert.ok(Math.abs(up-side)>.02,`A 3D Object wired into emit spawns from its current pose (${up.toFixed(3)} vs ${side.toFixed(3)})`);
    // A Palette after particles emitted from a waveform recolours them (the waveform's own colours no longer win).
    {await page.evaluate(p=>pro.importProject(p),L([{id:'w',type:'waveform2d',x:0,y:200,props:{mode:'circle'}},{id:'e',type:'gpuParticles',x:200,y:0,props:{mode:'simparticles'}},{id:'q',type:'palette',x:400,y:0,props:{mode:'solid',solid:'#ff0000'}}],
      [{from:'a',out:'audio',to:'w',input:'audio'},{from:'a',out:'audio',to:'e',input:'audio'},{from:'w',out:'shape',to:'e',input:'emit'},{from:'e',out:'shape',to:'q',input:'shape'},{from:'q',out:'shape',to:'out',input:'image'}]));
     await page.waitForFunction(()=>pro.emitPoints('e')?.length>1000,null,{timeout:15000});await page.waitForTimeout(2500);
     const [r,g,b,n]=await page.evaluate(()=>{const c=document.getElementById('preview'),x=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let r=0,g=0,b=0,n=0;for(let i=0;i<x.length;i+=16)if(x[i]+x[i+1]+x[i+2]>60){r+=x[i];g+=x[i+1];b+=x[i+2];n++;}return [r,g,b,n];});
     assert.ok(n>100&&r>2*(g+b)/2,`Palette colours emitted particles (rgb ${r},${g},${b} over ${n})`);}
    // Emitted particles spawn where the driver is drawn: a big ring keeps its hole (they used to start from a small ring whatever the scale).
    {await page.evaluate(p=>pro.importProject(p),L([{id:'w',type:'waveform2d',x:0,y:200,props:{mode:'circle',scale:150}},{id:'e',type:'gpuParticles',x:200,y:0,props:{mode:'simparticles'}}],
      [{from:'a',out:'audio',to:'w',input:'audio'},{from:'a',out:'audio',to:'e',input:'audio'},{from:'w',out:'shape',to:'e',input:'emit'},{from:'e',out:'shape',to:'out',input:'image'}]));
     await page.waitForFunction(()=>pro.emitPoints('e')?.length>1000,null,{timeout:15000});await page.waitForTimeout(3000);
     const hole=await page.evaluate(()=>{const c=document.getElementById('preview'),x=c.getContext('2d').getImageData(c.width/2-45,c.height/2-45,90,90).data;let n=0;for(let i=0;i<x.length;i+=4)if(x[i]+x[i+1]+x[i+2]>60)n++;return n;});
     assert.ok(hole<300,'Particles spawn at the waveform\'s drawn size: '+hole+' lit pixels inside a scale-150 ring');}
    // A 3D camera's depth of field also reaches the Waveform render of a 3D Object (classic Canvas 2D line drawers).
    {const sharp=async dof=>{await page.evaluate(p=>pro.importProject(p),L([{id:'o',type:'waveform3d',x:0,y:200,props:{mode:'sphere',render:'waveform'}},{id:'c',type:'camera3d',x:200,y:0,props:{dof,focus:100}}],[{from:'a',out:'audio',to:'o',input:'audio'},{from:'o',out:'shape',to:'c',input:'shape'},{from:'c',out:'shape',to:'out',input:'image'}]));
       await page.waitForTimeout(900);return page.evaluate(()=>{pro.draw();const c=document.getElementById('preview'),x=c.getContext('2d').getImageData(0,0,c.width,c.height).data,W=c.width;let g=0,n=0;for(let y=0;y<c.height;y+=2)for(let X=1;X<W;X+=2){const i=(y*W+X)*4;g+=Math.abs(x[i]+x[i+1]+x[i+2]-x[i-4]-x[i-3]-x[i-2]);n++;}return g/n;});};
     const s0=await sharp(0),s1=await sharp(100);
     assert.ok(s1<s0*.5,'Depth of field blurs a Waveform-render sphere: sharpness '+s0.toFixed(2)+' → '+s1.toFixed(2));}
    // Animated GLB / glTF models play in the 3D Object (and so in Cloners and emit); skinned rigs follow their joints.
    {await page.evaluate(p=>pro.importProject(p),L([{id:'o',type:'waveform3d',x:0,y:200,props:{mode:'model',render:'normal'}}],[{from:'a',out:'audio',to:'o',input:'audio'},{from:'o',out:'shape',to:'out',input:'image'}]));
     await page.evaluate(()=>pro.select('o'));await page.waitForTimeout(1200);await page.setInputFiles('#emitterMedia',gltfFile());await page.waitForTimeout(800);
     const cx=()=>page.evaluate(()=>{const m=pro.engine('o').w.objModelData;return m.verts.slice(0,8).reduce((s,v)=>s+v[0],0)/8;});
     const xs=[];for(let i=0;i<4;i++){xs.push(await cx());await page.waitForTimeout(260);}
     assert.ok(Math.max(...xs)-Math.min(...xs)>.3,'An animated glTF moves: '+xs.map(x=>x.toFixed(2)));
     assert.ok(await page.locator('#properties [data-property=animSpeed]').count(),'Animated models get an Animation speed knob');
     const q=await project();q.layers[0].nodes.find(n=>n.id==='o').props.animSpeed=0;await page.evaluate(p=>pro.importProject(p,'still'),q);await page.waitForTimeout(400);
     const s0=await cx();await page.waitForTimeout(500);assert.equal(await cx(),s0,'Speed 0 holds the pose');
     assert.ok(await litCount()>200,'The animated model renders');
     const sk=await page.evaluate(async t=>{const {parseGLTF,pose}=await import('./gltf.js');const m=parseGLTF(new TextEncoder().encode(t).buffer);
       const at=s=>pose(m,0,s).verts.slice(0,8).reduce((a,v)=>a+v[0],0)/8;return [m.skins.length,at(0),at(.5),at(.99)];},gltfFile.skinned().buffer.toString());
     assert.ok(sk[0]===1&&sk[1]<sk[2]&&sk[2]<sk[3],'A skinned mesh follows its animated joint: '+sk);}
    // Animated FBX (e.g. Mixamo) plays like a GLB: the skinned quad slides with its bone; the empty one-frame take is skipped.
    {await page.evaluate(p=>pro.importProject(p),L([{id:'o',type:'waveform3d',x:0,y:200,props:{mode:'model',render:'normal'}}],[{from:'a',out:'audio',to:'o',input:'audio'},{from:'o',out:'shape',to:'out',input:'image'}]));
     await page.evaluate(()=>pro.select('o'));await page.waitForTimeout(1200);await page.setInputFiles('#emitterMedia',fbxFile());await page.waitForTimeout(800);
     const st=await page.evaluate(()=>({clips:pro.engine('o').anim?.clips.map(c=>c.name),msg:document.body.innerText.includes('playing its animation')}));
     assert.deepEqual(st.clips,['Slide'],'FBX takes become clips (empty take skipped)');assert.ok(st.msg,'Loading says the FBX animation plays');
     const cx=()=>page.evaluate(()=>{const m=pro.engine('o').w.objModelData;return m.verts.reduce((s,v)=>s+v[0],0)/m.verts.length;});
     const xs=[];for(let i=0;i<4;i++){xs.push(await cx());await page.waitForTimeout(230);}
     assert.ok(Math.max(...xs)-Math.min(...xs)>.3,'An animated FBX moves: '+xs.map(x=>x.toFixed(2)));}
    // Liquid glass refracts the picture inside drifting blobs and leaves the rest untouched.
    {await page.evaluate(p=>pro.importProject(p),L([{id:'w',type:'waveform2d',x:200,y:0,props:{}},{id:'g',type:'liquidGlass',x:400,y:0,props:{blobs:5,size:90}}],
       [{from:'a',out:'audio',to:'w',input:'audio'},{from:'w',out:'shape',to:'g',input:'image'},{from:'g',out:'image',to:'out',input:'image'}]));
     await page.waitForTimeout(1500);
     const grab=()=>page.evaluate(()=>{pro.draw();const c=document.getElementById('preview'),x=c.getContext('2d').getImageData(0,0,c.width,c.height).data,o=[];for(let i=0;i<x.length;i+=4*97)o.push(x[i],x[i+1],x[i+2]);return o;});
     const on=await grab();
     const q=await project();q.layers[0].nodes.find(n=>n.id==='g').bypass=true;await page.evaluate(p=>pro.importProject(p,'off'),q);await page.waitForTimeout(400);
     const off=await grab();
     assert.ok(difference(on,off)>2,'Liquid glass changes the picture: '+difference(on,off).toFixed(2));
     assert.deepEqual(errors,[],'No page errors with Liquid glass');}
    assert.deepEqual(errors,[],'No page errors in 3D');
    // Live data: every source gives the same normalized numbers and a palette that can drive a Palette's colors.
    await page.evaluate(p=>pro.importProject(p),L([{id:'d',type:'liveData',x:0,y:200,props:{source:'quakes'}},{id:'o',type:'waveform3d',x:200,y:0,props:{mode:'sphere',render:'waveform'}},{id:'p',type:'palette',x:400,y:0,props:{}}],
      [{from:'a',out:'audio',to:'o',input:'audio'},{from:'o',out:'shape',to:'p',input:'shape'},{from:'p',out:'shape',to:'out',input:'image'},{from:'d',out:'palette',to:'p',input:'colors'},{from:'d',out:'level',to:'p',input:'mix'}]));
    await page.waitForTimeout(3000);
    const ld=await page.evaluate(()=>pro.outputs('d'));
    assert.ok(['level','change','pulse','phase'].every(k=>ld[k]>=0&&ld[k]<=1)&&ld.palette.length===4,'Live data gives normalized numbers and a palette');
    await page.evaluate(()=>pro.select('d'));await page.waitForTimeout(1200);
    assert.ok(await page.locator('#properties .data-status').textContent()>'' && await page.locator('.live-value .meter.swatches i').count()===4,'Live data shows status and palette');
    assert.ok(!(await page.locator('#properties').textContent()).includes('Place'),'Place only for local sources');
    await page.evaluate(()=>pro.setProperty('d','source','ocean'));await page.waitForTimeout(300);
    assert.ok((await page.locator('#properties').textContent()).includes('Place'),'Ocean asks for a place');
    assert.ok(await litCount()>300,'Live data palette renders');
    // Help text sits behind the ? in the inspector header.
    await page.evaluate(()=>{const id=pro.addNode('camera');pro.select(id);});
    const desc=page.locator('#properties .insp-desc');assert.ok(!(await desc.isVisible()),'Tips hidden by default');
    await page.click('#properties .tips-btn');assert.ok(await desc.isVisible(),'? shows tips');await page.click('#properties .tips-btn');
    // Multi-select: a box on empty graph space selects nodes; copy/paste, delete and Save as custom node work on the group.
    await page.setViewportSize({width:1540,height:1020});await page.evaluate(()=>{pro.loadTemplate('Ink');});await page.click('#fit');await page.waitForTimeout(400);
    const vpb=await page.locator('#graphViewport').boundingBox(),last=await page.locator('#nodes .node').nth(2).boundingBox(),count=async()=>page.evaluate(()=>pro.getProject().layers[0].nodes.length),c0=await count();
    void last;await page.mouse.move(vpb.x+vpb.width-30,vpb.y+vpb.height-12);await page.mouse.down();await page.mouse.move(vpb.x+12,vpb.y+40,{steps:8});await page.mouse.up();
    assert.equal((await page.evaluate(()=>pro.selection())).length,c0,'Selection box picks nodes');
    await page.keyboard.press('Meta+c');await page.keyboard.press('Meta+v');await page.waitForTimeout(200);
    assert.equal(await count(),c0*2-1,'Paste adds the copied nodes (one Output per layer)');
    await page.fill('[data-property=customName]','Test group');await page.click('[data-property=customSave]');
    await page.keyboard.press('Delete');await page.waitForTimeout(200);assert.equal(await count(),c0,'Delete removes the selection');
    await page.click('#library .custom-node[data-custom="Test group"]');await page.waitForTimeout(200);assert.equal(await count(),c0*2-1,'Custom node adds its group');
    await page.evaluate(()=>pro.removeCustom('Test group'));
    // Media inputs: one Choose button; a loaded picture shows as a thumbnail with × to remove it.
    const img=await page.evaluate(()=>{const id=pro.addNode('image');pro.select(id);return id;});
    const png=Buffer.from((await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');g.fillStyle='#f00';g.fillRect(0,0,64,64);return c.toDataURL('image/png');})).split(',')[1],'base64');
    await page.locator('#properties .media-choose').waitFor({timeout:15000});
    await page.locator('#emitterMedia').setInputFiles({name:'red.png',mimeType:'image/png',buffer:png});
    await page.locator('#properties .media-item img').waitFor({timeout:8000});
    await page.click('[data-property=mediaRemove]');await page.locator('#properties .media-choose').waitFor({timeout:8000});
    assert.equal(await page.locator('#properties .media-item').count(),0,'Removing the picture brings back Choose');
    void img;
    }
    if(!process.env.AUDIOGRAPH_RESOLUTION_ONLY&&!process.env.AUDIOGRAPH_TOUR_ONLY){
    // Template Morph reuses the original interpolation and keeps a stable renderer while blending.
    await page.evaluate(()=>{pro.autopilot.stop();pro.loadTemplate('Glass');pro.pause(true);pro.morph.settings({list:['Firepit','Glass'],duration:10,random:false,beat:false,ping:false});pro.workspace('auto');});
    const beforeMorph=await project();
    await page.evaluate(()=>pro.morph.scrub(0));
    const morphID=await page.evaluate(()=>pro.morph.status().node);
    await page.waitForFunction(id=>pro.engine(id)?.status==='ready',morphID,{timeout:30000});
    await page.evaluate(()=>{pro.draw();pro.pause(false);});
    await lit(.02,25000);
    assert.ok(await page.evaluate(id=>pro.engine(id).w.pmActive,morphID),'Preview uses the original morph render loop');
    const morphGeneration=await page.evaluate(id=>pro.engine(id).generation,morphID);
    const blends=await page.evaluate(id=>{
      const e=pro.engine(id),a=e.templateBlend('Glass','Sacred circle',0),b=e.templateBlend('Glass','Sacred circle',1),m=e.templateBlend('Glass','Sacred circle',.5);
      const same=a.layers[0].layout===b.layers[0].layout;
      const numeric=Object.keys(a.layers[0].params).find(k=>typeof a.layers[0].params[k]==='number'&&typeof b.layers[0].params[k]==='number'&&a.layers[0].params[k]!==b.layers[0].params[k]);
      return {same,numeric,mid:m.layers[0].params[numeric],expected:(a.layers[0].params[numeric]+b.layers[0].params[numeric])/2,
        different:e.templateBlend('Echo','Firepit',.5).layers.map(l=>({layout:l.layout,opacity:l.opacity}))};
    },morphID);
    assert.ok(blends.numeric,'Templates have a varying numeric parameter');
    assert.ok(blends.same,'The interpolation test uses matching layouts');
    assert.equal(blends.mid,blends.expected,'Matching layouts interpolate numeric parameters');
    assert.ok(blends.different.length>1&&blends.different.some(l=>l.opacity>0&&l.opacity<100),'Different layouts crossfade');
    for(const v of [10,25,40]){
      await page.evaluate(v=>pro.morph.scrub(v),v);await page.waitForTimeout(400);
      assert.equal(await page.evaluate(()=>pro.morph.status().node),morphID,'Scrub keeps one renderer');
      assert.equal(await page.evaluate(id=>pro.engine(id).generation,morphID),morphGeneration,'Scrub does not reinitialize the renderer');
      assert.deepEqual(await page.evaluate(()=>pro.stats().errors),[],'Morph renders without errors');
      const renderedBlend=await page.evaluate(id=>pro.engine(id).w.stackLayouts.map(l=>({layout:l.layout,opacity:l.opacity})),morphID);
      assert.ok(renderedBlend.some(l=>l.layout==='phyllotaxis')&&renderedBlend.some(l=>l.layout==='spiral'),'Both template layouts are actually rendered');
      assert.ok(renderedBlend.every(l=>l.opacity>0&&l.opacity<100),'Rendered layer opacity follows the scrub position');
    }
    await page.evaluate(()=>pro.morph.start());
    const pos=await page.evaluate(()=>pro.morph.status().position);
    await page.waitForFunction(p=>pro.morph.status().position>p+.1,pos,{timeout:10000});
    assert.equal(await page.evaluate(()=>pro.autopilot.status().live),false,'Template Morph excludes generative Autopilot');
    await page.evaluate(()=>{pro.morph.stop();pro.pause(true);});
    const held=await project();await page.waitForTimeout(700);assert.deepEqual(await project(),held,'Pause freezes the morph');
    await page.evaluate(()=>pro.morph.scrub(25));
    assert.equal(await page.evaluate(()=>pro.morph.apply()),true,'Apply produces editable nodes');
    assert.ok((await project()).layers[0].nodes.some(n=>n.type==='output'),'Applied blend is wired');
    assert.ok(!(await project()).layers[0].nodes.some(n=>n.type==='templateMorph'),'Small blends expand into renderer nodes');
    await page.evaluate(()=>{pro.undo();pro.undo();});
    assert.deepEqual(await project(),beforeMorph,'Undo restores the pre-morph graph');
    await page.evaluate(()=>{pro.morph.settings({list:['Cell','Zodiac']});pro.morph.scrub(25);});
    const denseID=await page.evaluate(()=>pro.morph.status().node);
    await page.waitForFunction(id=>pro.engine(id)?.status==='ready',denseID,{timeout:30000});
    await page.evaluate(()=>pro.draw());
    assert.equal(await page.evaluate(()=>pro.morph.apply()),true,'Dense blends remain an exact editable stack');
    const dense=await project();assert.ok(dense.layers[0].nodes.some(n=>n.type==='templateMorph'),'Dense blend keeps a Template Morph node');
    await page.evaluate(()=>pro.validate(pro.getProject()));
    await page.evaluate(()=>pro.pause(false));
    await page.waitForFunction(id=>pro.engine(id)?.frames>8,denseID,{timeout:30000});
    await lit(.02,25000);
    await page.evaluate(id=>pro.select(id),denseID);
    assert.equal(await page.locator('#properties [data-property=from]').count(),1,'Applied stack has an editable source template');
    assert.equal(await page.locator('#properties [data-property=to]').count(),1,'Applied stack has an editable target template');
    await page.evaluate(()=>pro.autopilot.start());
    assert.equal(await page.evaluate(()=>pro.morph.status().playing),false,'Starting generative Autopilot stops morph transport');
    await page.evaluate(()=>pro.autopilot.stop());
    await page.evaluate(()=>{pro.morph.settings({list:['Waves','Glass'],random:false});pro.morph.scrub(0);});
    const customID=await page.evaluate(()=>pro.morph.status().node);
    await page.waitForFunction(id=>pro.engine(id)?.status==='ready',customID,{timeout:30000});
    await page.evaluate(()=>pro.draw());
    const customFn=await page.evaluate(id=>pro.engine(id).templateBlend('Waves','Glass',0).layers[0].params.customFnX,customID);
    assert.equal(await page.evaluate(()=>pro.morph.apply()),true,'Custom template can be baked');
    assert.ok((await project()).layers[0].nodes.some(n=>n.props.mode==='custom'&&n.props.look.customFnX===customFn),'Apply preserves the shipped math expression');
    const timing=await page.evaluate(async()=>{
      const {TemplateMorph}=await import(new URL('morph.js',location.href).href),p=new TemplateMorph();
      p.configure({list:['Firepit','Glass'],duration:10});p.start(0);for(let i=0;i<101;i++)p.step(.1,0);
      const next=p.pair();p.configure({beat:true,beatMode:'glide4'});p.position=0;p.start(0);p.step(.01,1);for(let i=0;i<150;i++)p.step(.01,1);
      const beat=p.position;p.configure({random:true,beat:false,ping:false});p.position=.999;p.start(1);const old=p.pair().to;p.step(.1,1);
      const random=p.pair();p.configure({random:false,ping:true});p.position=1.999;p.direction=1;p.start(1);p.step(.1,1);const reversed=p.direction;
      p.configure({beat:true,beatMode:'snap',ping:false});p.position=0;p.start(0);for(let i=0;i<46;i++)p.step(.01,1);
      const snap=p.position;p.configure({list:['Echo','Echo'],random:true});const duplicate=p.pair();
      let invalid=false;try{p.scrub(NaN);}catch{invalid=true;}
      return {next,beat,random,old,reversed,snap,duplicate,invalid};
    });
    assert.equal(timing.next.from,'Glass','Sequential playback advances to the next template');
    assert.ok(Math.abs(timing.beat-.25)<.002,'Beat glide advances a quarter template then settles');
    assert.equal(timing.random.from,timing.old,'Random continues from its prior target');
    assert.notEqual(timing.random.from,timing.random.to,'Random does not repeat a template');
    assert.equal(timing.reversed,-1,'Ping-pong reverses at the playlist end');
    assert.equal(timing.snap,1,'Snap completes one transition over 0.45 seconds');
    assert.notEqual(timing.duplicate.from,timing.duplicate.to,'Random handles a playlist containing only repeated copies');
    assert.ok(timing.invalid,'Invalid scrub position is rejected');
    await page.evaluate(()=>pro.morph.settings({list:['Echo','Glass'],duration:30,beatMode:'glide1'}));
    await page.reload();await page.waitForFunction(()=>window.pro);
    assert.deepEqual(await page.evaluate(()=>pro.morph.settings().list),['Echo','Glass'],'Playlist is remembered');
    assert.equal(await page.evaluate(()=>pro.morph.status().playing),false,'Reload does not start morph playback');
    assert.deepEqual(errors,[],'No page errors during template morph');
    console.log('Template Morph tests passed');
    }
    if(!process.env.AUDIOGRAPH_MORPH_ONLY&&!process.env.AUDIOGRAPH_TOUR_ONLY){
    // A cube cap shares the same source pixels with both front faces, not a separately rotated rectangle.
    const capCheck=await page.evaluate(async()=>{
      const M=await import(new URL('mapping.js',location.href).href),W=960,H=540,src=document.createElement('canvas');src.width=W;src.height=H;
      const x=src.getContext('2d'),im=x.createImageData(W,H);
      for(let j=0;j<H;j++)for(let i=0;i<W;i++){const k=(j*W+i)*4;im.data[k]=Math.round(i/W*180);im.data[k+1]=Math.round(j/H*180);im.data[k+3]=255;}x.putImageData(im,0,0);
      const ss=M.PRESETS['Cube (3 faces)'](),draw=s=>{const c=document.createElement('canvas');c.width=W;c.height=H;M.render(c.getContext('2d'),{test:false,surfaces:[s]},()=>src,W,H);return c.getContext('2d');};
      const top=draw(ss[0]),flat=draw({...ss[0],wrap:'flat'}),back=M.corners(ss[0])[1];let max=0,oldMax=0;
      for(const face of ss.slice(1)){const side=draw(face);
        for(const u of [.13,.27,.43,.57,.73,.87]){
          const edge=M.pointAt(face,u,0),above=edge.map((v,i)=>v+(back[i]-v)*.02),below=M.pointAt(face,u,.01);
          const sample=(ctx,[px,py])=>[...ctx.getImageData(Math.round(px*W),Math.round(py*H),1,1).data].slice(0,2),a=sample(top,above),b=sample(side,below),c=sample(flat,above);
          max=Math.max(max,...a.map((v,i)=>Math.abs(v-b[i])));oldMax=Math.max(oldMax,...c.map((v,i)=>Math.abs(v-b[i])));
        }
      }
      const legacy=structuredClone(ss);delete legacy[0].wrap;
      const explicit=structuredClone(ss);explicit[0].wrap='flat';
      return {max,oldMax,migrated:M.cleanMapping({on:true,surfaces:legacy}).surfaces[0].wrap,explicit:M.cleanMapping({on:true,surfaces:explicit}).surfaces[0].wrap,
        curved:M.regrid(ss[0],2,2).wrap,cap:M.cleanMapping({on:true,surfaces:ss}).surfaces[0].wrap};
    });
    assert.ok(capCheck.max<=5,'Cube cap joins both sides: max colour gap '+capCheck.max);
    assert.ok(capCheck.oldMax>30,'The regression detects the old rectangular cap');
    assert.equal(capCheck.migrated,'cap','Old cube presets gain the corrected cap');
    assert.equal(capCheck.explicit,'flat','An explicitly flat cap remains flat');
    assert.equal(capCheck.curved,'flat','Changing to a curved grid leaves cap mapping');
    assert.equal(capCheck.cap,'cap','Cap mode survives project validation');
    const boxMix=await page.evaluate(async()=>{
      const M=await import('./mapping.js'),D=pro.mapping3d,W=320,H=200,src=document.createElement('canvas'),out=document.createElement('canvas');src.width=out.width=W;src.height=out.height=H;const x=src.getContext('2d');for(let i=0;i<8;i++){x.fillStyle=i%2?'#ff3060':'#30c0ff';x.fillRect(i*W/8,0,W/8,H);}
      const ctx=out.getContext('2d'),s={...D.surface3d('b'),primitive:'Sphere',projection:'box'};const draw=c=>{M.render(ctx,{on:true,surfaces:[{...s,...c}]},()=>src,W,H);const d=ctx.getImageData(0,0,W,H).data;let h=0,jump=0;for(let y=0;y<H;y++)for(let X=1;X<W;X++){const i=(y*W+X)*4;h=(h+d[i]*(i%97+1)+d[i+2])%1e9;if(d[i+3]&&d[i-1])jump+=Math.abs(d[i]-d[i-4])>90?1:0;}return {h,jump};};
      return {hard:draw({fade:0}),soft:draw({fade:1}),tiled:draw({fade:.5,tile:3}),base:draw({fade:.5}),turned:draw({fade:.5,box:{...s.box,ry:45}}),moved:draw({fade:.5,box:{...s.box,x:.3,scale:.5}}),xf:draw({fade:.5,xf:{...s.xf,x:.3,rz:30,scale:.6}}),lat:draw({fade:.5,lattice:{res:2,d:Array.from({length:24},(_,i)=>i===22?.5:0)}}),badLat:M.cleanMapping({surfaces:[{...s,lattice:{res:5,d:[1]}}]}).surfaces[0].lattice,def:M.cleanMapping({surfaces:[{...s}]}).surfaces[0],wild:M.cleanMapping({surfaces:[{...s,box:{rx:900,scale:-1}}]}).surfaces[0].box};
    });
    assert.equal(boxMix.def.fade,.5,'Box fade defaults to 50%');assert.equal(boxMix.def.tile,1,'Tiling defaults to 1x');
    assert.notEqual(boxMix.hard.h,boxMix.soft.h,'Box fade blends the projections');assert.notEqual(boxMix.soft.h,boxMix.tiled.h,'Tiling changes the mapped picture');
    assert.deepEqual(boxMix.def.box,{x:0,y:0,z:0,rx:0,ry:0,rz:0,scale:1},'Box transform defaults to identity');assert.equal(boxMix.wild.rx,180);assert.equal(boxMix.wild.scale,.05,'Box transform is clamped');
    assert.notEqual(boxMix.base.h,boxMix.xf.h,'Object move/rotate/scale moves the model');assert.notEqual(boxMix.base.h,boxMix.lat.h,'Moving a lattice point bends the model');
    assert.deepEqual(boxMix.badLat,{res:0,d:[]},'Invalid lattices are dropped');assert.deepEqual(boxMix.def.lattice,{res:0,d:[]});
    assert.notEqual(boxMix.base.h,boxMix.turned.h,'Rotating the box turns the projection');assert.notEqual(boxMix.base.h,boxMix.moved.h,'Moving and scaling the box shifts the projection');
    assert.ok(boxMix.tiled.jump>boxMix.soft.jump,'Tiling repeats the stripes: '+boxMix.tiled.jump+' vs '+boxMix.soft.jump);
    const three=await page.evaluate(async fixtures=>{
      const M=await import('./mapping.js'),C=await import('./camera-import.js'),D=pro.mapping3d,W=480,H=270,src=document.createElement('canvas'),out=document.createElement('canvas');src.width=out.width=W;src.height=out.height=H;const x=src.getContext('2d');x.fillStyle='#ffae55';x.fillRect(0,0,W,H);const s=D.surface3d('cube'),ctx=out.getContext('2d');
      const draw=(change={},test=false)=>{const a={...s,...change,camera:{...s.camera,...change.camera}};M.render(ctx,{on:true,test,surfaces:[a]},()=>src,W,H);const d=ctx.getImageData(0,0,W,H).data;let lit=0,hash=0;for(let i=0;i<d.length;i+=4){if(d[i]+d[i+1]+d[i+2]>15)lit++;hash=(hash+d[i]*(i%103+1)+d[i+1])%1e9;}return {lit,hash};};
      const base=draw(),orbit=draw({camera:{yaw:65,pitch:35}}),zoom=draw({camera:{focal:55}}),card=draw({wire:true},true),P=pro.getProject();P.mapping={on:true,surfaces:[s]};const saved=pro.validate(JSON.parse(JSON.stringify(P))).mapping.surfaces[0],old=M.cleanMapping({on:true,surfaces:M.PRESETS['Single screen']()});
      const tracks={};for(const [kind,bytes] of Object.entries(fixtures)){const track=await C.parseCamera(new Uint8Array(bytes).buffer,'camera.'+(kind==='binary'?'fbx':kind));tracks[kind]={...C.sampleTrack(track,.5),duration:track.duration,count:track.samples.length};if(kind==='usda'){P.mapping.surfaces[0].track=track;pro.validate(P);}}
      const matrixUSD=`#usda 1.0
(metersPerUnit = 1)
def Camera "Camera" {
 matrix4d xformOp:transform.timeSamples = {
  0: ((1,0,0,0),(0,1,0,0),(0,0,1,0),(0,0,5,1)),
  24: ((1,0,0,0),(0,1,0,0),(0,0,1,0),(2,0,5,1)),
 }
 uniform token[] xformOpOrder = ["xformOp:transform"]
 float focalLength = 35
 float horizontalAperture.timeSamples = {0: 36, 24: 72}
}`;
      const longTrack=await C.parseCamera(new TextEncoder().encode(new TextDecoder().decode(new Uint8Array(fixtures.usda)).replaceAll('24:', '2400:')).buffer,'long.usda');
      const matrixTrack=await C.parseCamera(new TextEncoder().encode(matrixUSD).buffer,'matrix.usda'),matrixPose=C.sampleTrack(matrixTrack,.5),obj=await D.loadModel(new File(['v 10 20 0\nv 12 20 0\nv 12 22 0\nv 10 22 0\nf -4 -3 -2 -1 # quad\n'],'stage.obj'));
      const imported=D.surface3d('imported');Object.assign(imported,obj);imported.camera={...imported.camera,target:obj.target,distance:obj.distance};M.render(ctx,{on:true,test:false,surfaces:[imported]},()=>src,W,H);const modelLit=[...ctx.getImageData(0,0,W,H).data].filter((v,i)=>i%4!==3&&v>0).length,missing=D.hasModel({...imported,modelKey:'missing'}),validTrack=M.cleanMapping({surfaces:[{...s,track:matrixTrack}]}).surfaces[0].track;
      M.render(ctx,{on:true,test:true,surfaces:[{...imported,modelKey:'missing'}]},()=>src,W,H);const placeholderLit=[...ctx.getImageData(0,0,W,H).data].filter((v,i)=>i%4!==3&&v>0).length;
      const held={...s,track:matrixTrack,trackOn:true,playing:false,hold:.5},holdA=D.cameraPose(held,0),holdB=D.cameraPose(held,100),loop=C.sampleTrack(matrixTrack,1.5);
      let binaryUSD='';try{await C.parseCamera(new TextEncoder().encode('PXR-USDC').buffer,'scene.usdc');}catch(e){binaryUSD=e.message;}
      P.mapping.test=true;P.mapping.surfaces[0].trackOn=false;pro.importProject(P);pro.selectSurface('cube');pro.draw(0);return {base,orbit,zoom,card,saved,old:old.surfaces[0].pts.length,tracks,binaryUSD,matrixPose,modelLit,placeholderLit,missing,longCount:longTrack.samples.length,trackSamples:validTrack.samples.length,holdA,holdB,loop,preview:pro.pixels()};
    },cameraFixtures());
    assert.ok(three.base.lit>1000,'3D cube renders textured pixels');assert.notEqual(three.base.hash,three.orbit.hash,'Projector orbit changes output');assert.ok(three.zoom.lit>three.base.lit*1.5,'Focal length zooms the model');assert.notEqual(three.card.hash,three.base.hash,'Test card and wireframe render on the mesh');assert.equal(three.saved.kind,'3d');assert.equal(three.saved.camera.focal,35);assert.equal(three.old,4,'Legacy 2D surfaces still load');assert.ok(three.preview>0,'3D mapping reaches program preview');
    for(const kind of ['fbx','binary','usda','gltf']){const c=three.tracks[kind];assert.equal(c.duration,1);assert.equal(c.count,31);assert.ok(Math.abs(c.matrix[12]-1)<.00001,kind+' sampled translation');assert.ok(Math.abs(c.focal-(kind==='gltf'?35:52.5))<.0001,kind+' sampled focal length');}
    assert.ok(Math.abs(three.tracks.fbx.matrix[14]-5)<.0001,'FBX centimetres convert to metres');assert.ok(Math.abs(three.tracks.usda.matrix[13]-7)<.0001,'USD parent and Z-up convert together');assert.ok(Math.abs(three.tracks.gltf.matrix[13]-2)<.0001,'glTF parent transform is preserved');assert.ok(Math.abs(three.tracks.gltf.matrix[0]-Math.SQRT1_2)<.0001,'glTF rotation interpolates');assert.ok(Math.abs(three.tracks.fbx.matrix[0]-Math.SQRT1_2)<.0001,'FBX rotation and camera axis convert');assert.match(three.binaryUSD,/export as \.usda/);assert.equal(three.matrixPose.matrix[12],1,'USD matrix timeSamples preserve translation');assert.ok(Math.abs(three.matrixPose.focal-35*2/3)<.00001,'Animated USD aperture changes equivalent focal');assert.ok(three.modelLit>100,'Imported OBJ renders without UVs');assert.equal(three.missing,false,'Missing model can request reload');assert.ok(three.placeholderLit>100,'Missing model placeholder remains in the saved camera frame');assert.equal(three.trackSamples,31,'Camera track survives validation');assert.equal(three.longCount,2000,'Long imported clips cap saved samples');assert.deepEqual(three.holdA,three.holdB,'Hold freezes the camera');assert.deepEqual(three.loop,three.matrixPose,'Imported tracks loop');
    await page.locator('#modeMap').click();
    await page.locator('[data-property=surf3dfocal]').evaluate(e=>{e.value='55';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));});assert.equal((await page.evaluate(()=>pro.mapping())).surfaces[0].camera.focal,55,'Projector knob updates the surface');await page.evaluate(()=>pro.undo());assert.equal((await page.evaluate(()=>pro.mapping())).surfaces[0].camera.focal,35,'Projector knob is undoable');
    const projectorRect=await page.locator('#preview').boundingBox(),projectorYaw=(await page.evaluate(()=>pro.mapping())).surfaces[0].camera.yaw;
    await page.mouse.move(projectorRect.x+projectorRect.width*.5,projectorRect.y+projectorRect.height*.5);await page.mouse.down();await page.mouse.move(projectorRect.x+projectorRect.width*.6,projectorRect.y+projectorRect.height*.55,{steps:3});await page.mouse.up();assert.notEqual((await page.evaluate(()=>pro.mapping())).surfaces[0].camera.yaw,projectorYaw,'Preview drag orbits the projector');await page.evaluate(()=>pro.undo());assert.equal((await page.evaluate(()=>pro.mapping())).surfaces[0].camera.yaw,projectorYaw,'Projector drag is undoable');
    // Lattice: pick 3³, drag a point in the view, undo.
    await page.locator('[data-property=surf3dLattice] button',{hasText:'3³'}).click();assert.equal(await page.locator('.map-overlay .lpt').count(),27,'A 3³ lattice shows 27 points');
    {const b=await page.locator('.map-overlay .lpt[data-lattice="16"]').boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y-60,{steps:3});await page.mouse.up();}
    {const m=(await page.evaluate(()=>pro.mapping())).surfaces[0];assert.ok(m.lattice.d.slice(48,51).some(v=>Math.abs(v)>.01)&&m.lattice.d.filter(v=>v).length<=3,'Dragging a lattice point moves only that point');assert.equal(m.camera.yaw,projectorYaw,'A lattice drag does not orbit');}
    await page.evaluate(()=>pro.undo());assert.ok((await page.evaluate(()=>pro.mapping())).surfaces[0].lattice.d.every(v=>!v),'Lattice drag is undoable');
    // Animated glTF on a mapping surface: Play shows its clip over time, Rest pose holds the bind pose.
    {const [fc]=await Promise.all([page.waitForEvent('filechooser'),page.locator('[data-property=mapLoadModel]').click()]);await fc.setFiles(gltfFile());
    await page.waitForSelector('[data-property=surf3dAnim]');
    const an=await page.evaluate(()=>{const M=pro.mapping3d,s=pro.mapping().surfaces[0],sum=g=>{let a=0;for(let i=0;i<g.data.length;i+=8)a+=g.data[i];return a;};
      return {clips:M.modelClips(s).map(c=>c.name),anim:s.anim,a:sum(M.meshOf(s,0)),b:sum(M.meshOf(s,.5)),rest:sum(M.meshOf({...s,anim:{...s.anim,on:false}},.5))};});
    assert.deepEqual(an.clips,['Slide'],'Mapping lists the model clips');assert.equal(an.anim.on,true,'Animated models play by default');
    assert.notEqual(an.a,an.b,'An animated model moves over time on the mapping surface');assert.notEqual(an.b,an.rest,'Rest pose holds the bind pose');
    await page.locator('[data-property=surf3dAnim] .mbtn',{hasText:'Rest pose'}).click();assert.equal((await page.evaluate(()=>pro.mapping())).surfaces[0].anim.on,false,'Rest pose toggle stops the animation');}
    await page.evaluate(()=>{const p=pro.getProject();p.mapping={on:false,surfaces:[]};pro.importProject(p);});await page.locator('#modeStudio').click();
    // Bypass passes a node's input straight through; Preview shows one node's picture in the viewport.
    {await page.evaluate(()=>{pro.dissolve(false);pro.importProject({format:'audiograph-pro',version:10,layers:[{id:'BP',name:'BP',visible:true,opacity:1,blend:'source-over',nodes:[{id:'a',type:'audioIn',x:0,y:0,props:{}},{id:'w',type:'waveform2d',x:200,y:0,props:{mode:'circle'}},{id:'b',type:'bloom',x:420,y:0,props:{}},{id:'o',type:'oscillator',x:420,y:220,props:{}},{id:'out',type:'output',x:640,y:0,props:{},bypass:true}],edges:[{from:'a',out:'audio',to:'w',input:'audio'},{from:'w',out:'shape',to:'b',input:'image'},{from:'b',out:'image',to:'out',input:'image'}]}]});});
    await page.waitForFunction(()=>pro.engine('w')?.status==='ready',null,{timeout:30000});await page.waitForTimeout(500);
    const lit=async()=>{let s=0;for(let i=0;i<4;i++)s+=await page.evaluate(()=>{pro.draw();return pro.pixels();});return s/4;},errs=()=>page.evaluate(()=>pro.stats().errors),bp=id=>page.evaluate(id=>pro.getProject().layers[0].nodes.find(n=>n.id===id).bypass,id);
    assert.equal(await bp('out'),undefined,'Output cannot be bypassed');assert.equal(await page.locator('.node[data-id="out"] .act-bypass').count(),0);assert.equal(await page.locator('.node[data-id="o"] .act-preview').count(),0,'Number nodes have no preview');
    const bloomOn=await lit();await page.locator('.node[data-id="b"] .node-head').hover();await page.locator('.node[data-id="b"] .act-bypass').click();
    assert.equal(await bp('b'),true,'Bypass is stored on the node');assert.ok(await page.locator('.node[data-id="b"].bypassed').count(),'Bypassed node is dimmed');
    const bloomOff=await lit();assert.deepEqual(await errs(),[]);assert.ok(bloomOff>0.3&&bloomOff<bloomOn*.9,'Bypassed Bloom passes the plain emitter through: '+bloomOff+' vs '+bloomOn);
    await page.locator('.node[data-id="w"] .node-head').click();await page.keyboard.press('b');assert.equal(await bp('w'),true,'B bypasses the selection');
    assert.equal(await lit(),0,'A bypassed emitter draws nothing');assert.deepEqual(await errs(),[],'Bypassing never breaks the chain');
    await page.evaluate(()=>pro.undo());assert.equal(await bp('w'),undefined,'Bypass is undoable');
    await page.keyboard.press('v');await page.waitForTimeout(200);assert.ok(await page.locator('#previewBadge').isVisible(),'V previews the selected node');assert.match(await page.locator('#previewBadge').textContent(),/Circle/);
    await page.evaluate(()=>{const p=pro.getProject();p.layers[0].visible=false;pro.importProject(p);});assert.ok(await lit()>0.3,'Preview shows the node even in a hidden layer');
    await page.keyboard.press('Escape');assert.ok(await page.locator('#previewBadge').isHidden(),'Esc leaves preview');assert.equal(await lit(),0,'Back to the (hidden) composition');}
    // Resolution changes the render itself, not just CSS, without replacing the graph or its engines.
    await page.evaluate(()=>pro.loadTemplate('Ink'));
    const fluidID=await page.evaluate(()=>pro.getProject().layers[0].nodes.find(n=>n.type==='gpuParticles').id);
    await page.waitForFunction(id=>pro.engine(id)?.w?.agSim.stats().live>0,fluidID,{timeout:30000});
    const simCreated=await page.evaluate(id=>pro.engine(id).w.agSim.stats().created,fluidID);
    for(const height of [720,1080,540]){
      await page.selectOption('#resolution',String(height));
      await page.waitForFunction(({id,h})=>Object.values(pro.engine(id).w.agSim.stats().layers).some(s=>s.out[0]===h*16/9&&s.out[1]===h),{id:fluidID,h:height},{timeout:30000});
      assert.equal(await page.evaluate(id=>pro.engine(id).w.agSim.stats().created,fluidID),simCreated,'Resizing preserves the running simulation');
    }
    await page.evaluate(p=>pro.importProject(p),L([{id:'r',type:'waveform2d',x:200,y:0,props:{mode:'circle'}},{id:'p',type:'palette',x:400,y:0,props:{}}],
      [{from:'a',out:'audio',to:'r',input:'audio'},{from:'r',out:'shape',to:'p',input:'shape'},{from:'p',out:'shape',to:'out',input:'image'}]));
    await page.waitForFunction(()=>pro.engine('r')?.status==='ready'&&pro.engine('r').frames>8,null,{timeout:30000});
    await lit(.02,25000);
    const resolutionProject=await project(),generation=await page.evaluate(()=>pro.engine('r').generation);
    for(const height of [720,1080,1440,2160,540]){
      await page.selectOption('#resolution',String(height));
      await page.waitForFunction(h=>{const c=document.querySelector('#preview'),e=pro.engine('r');return c.width===h*16/9&&c.height===h&&e.canvas.width===c.width&&e.w.frameCv.width===c.width&&e.w.frameCv.height===h;},height);
      await lit(.02,25000);
      assert.deepEqual(await project(),resolutionProject,'Resolution preserves the graph');
      assert.equal(await page.evaluate(()=>pro.engine('r').generation),generation,'Resolution reuses the engine');
    }
    await page.evaluate(()=>pro.pause(true));await page.selectOption('#resolution','720');
    assert.equal(await page.evaluate(()=>pro.stats().paused),true,'Resolution preserves pause');
    assert.ok(await page.evaluate(()=>pro.pixels())>.02,'A paused frame survives resizing');
    const [snapshot]=await Promise.all([page.waitForEvent('download'),page.click('#snap')]);
    const snapshotData=fs.readFileSync(await snapshot.path());
    assert.deepEqual([snapshotData.readUInt32BE(16),snapshotData.readUInt32BE(20)],[1280,720],'PNG has selected resolution');
    await page.evaluate(()=>pro.pause(false));
    const [detached]=await Promise.all([page.waitForEvent('popup'),page.click('#output')]);
    await detached.waitForFunction(()=>document.querySelector('video').videoWidth===1280);
    await page.selectOption('#resolution','1080');
    await detached.waitForFunction(()=>document.querySelector('video').videoWidth===1920&&document.querySelector('video').videoHeight===1080);
    await detached.close();
    await page.click('#audioName');await page.click('#mic');
    await page.waitForFunction(()=>pro.stats().audio.input==='mic');
    await page.click('#mic');await page.waitForFunction(()=>!pro.stats().audio.input);
    await page.click('#record');await page.waitForFunction(()=>document.querySelector('#resolution').disabled);
    assert.ok(await page.locator('#resolution').isDisabled(),'Resolution locks while recording');
    const recordingFrame=await page.evaluate(()=>pro.stats().frame);
    await page.waitForFunction(f=>pro.stats().frame>f+20,recordingFrame,{timeout:15000});
    await page.waitForTimeout(1000);
    const [recording]=await Promise.all([page.waitForEvent('download'),page.click('#record')]);
    assert.ok(fs.statSync(await recording.path()).size>0,'Recording is saved');
    const videoSize=await page.evaluate(async b64=>{
      const v=document.createElement('video'),url=URL.createObjectURL(new Blob([Uint8Array.from(atob(b64),c=>c.charCodeAt(0))],{type:'video/webm'}));
      try{await new Promise((resolve,reject)=>{v.onloadedmetadata=resolve;v.onerror=()=>reject(Error('Recorded video could not be read'));v.src=url;});return [v.videoWidth,v.videoHeight];}
      finally{v.removeAttribute('src');v.load();URL.revokeObjectURL(url);}
    },fs.readFileSync(await recording.path()).toString('base64'));
    assert.deepEqual(videoSize,[1920,1080],'Recorded video has selected resolution');
    assert.ok(await page.locator('#resolution').isEnabled(),'Resolution unlocks after recording');
    await page.reload();
    await page.waitForFunction(()=>window.pro&&document.querySelector('#preview').width===1920&&Object.values(pro.stats().engines).some(e=>e.status==='ready'),null,{timeout:30000});
    assert.equal(await page.locator('#resolution').inputValue(),'1080','Resolution survives reload');
    await page.selectOption('#resolution','540');
    for(const width of [1540,1100,700,390]){
      await page.setViewportSize({width,height:900});
      const fits=await page.evaluate(()=>{
        const r=document.querySelector('#resolution').getBoundingClientRect(),s=document.querySelector('#spectrum').getBoundingClientRect(),t=document.querySelector('.transport').getBoundingClientRect();
        return r.left>=t.left&&r.right<=t.right&&!(r.left<s.right&&r.right>s.left&&r.top<s.bottom&&r.bottom>s.top);
      });
      assert.ok(fits,'Resolution fits without overlapping the spectrum at '+width+'px');
    }
    assert.deepEqual(errors,[],'No page errors during resolution changes');
    console.log('Resolution tests passed');
    }
    {
    // First Mile: builds one real scene step by step, keeps its renderer, highlights each target, and is one undo step.
    await page.evaluate(()=>{pro.autopilot.stop();pro.morph.stop();pro.workspace('studio');pro.loadTemplate('Firepit');pro.pause(false);});
    const beforeTour=JSON.stringify(await page.evaluate(()=>pro.getProject()));
    const titles=await page.evaluate(()=>pro.tour.steps);
    assert.ok(titles.length>=12,'Tutorial has its steps');
    await page.click('#tourButton');
    await page.locator('#tourCard.show').waitFor({timeout:5000});
    const ids=await page.evaluate(()=>pro.tour.status().ids);
    await page.waitForFunction(id=>pro.engine(id)?.status==='ready',ids.W,{timeout:30000});
    await page.evaluate(id=>{pro.engine(id).__tourMark=1;},ids.W);
    const ringFits=()=>page.evaluate(()=>{const r=document.querySelector('#tourRing');if(!r.classList.contains('show'))return null;const a=r.getBoundingClientRect();
      const t=document.querySelector('#audioName').getBoundingClientRect();return {a:[a.left,a.top,a.right,a.bottom],t:[t.left,t.top,t.right,t.bottom]};});
    await page.waitForTimeout(500);
    const fit0=await ringFits();assert.ok(fit0,'Ring shows on step 1');
    assert.ok(fit0.a[0]<=fit0.t[0]+1&&fit0.a[1]<=fit0.t[1]+1&&fit0.a[3]>=fit0.t[3]-1,'Ring surrounds the audio source at UI zoom: '+JSON.stringify(fit0));
    for(let i=0;i<titles.length;i++){
      assert.equal(await page.textContent('#tourTitle'),titles[i],'Step title '+i);
      assert.equal(await page.textContent('#tourStep'),`Step ${i+1} of ${titles.length}`);
      await page.waitForTimeout(450);
      assert.ok(await page.evaluate(()=>document.querySelector('#tourRing').classList.contains('show')),'Step highlights its target: '+titles[i]);
      const card=await page.evaluate(()=>{const c=document.querySelector('#tourCard').getBoundingClientRect(),r=document.querySelector('#tourRing').getBoundingClientRect();
        return {inside:c.left>=0&&c.top>=0&&c.right<=innerWidth&&c.bottom<=innerHeight,overlap:Math.max(0,Math.min(c.right,r.right)-Math.max(c.left,r.left))*Math.max(0,Math.min(c.bottom,r.bottom)-Math.max(c.top,r.top))/(c.width*c.height)};});
      assert.ok(card.inside,'Card on screen at step '+i);
      if(!['Nodes and wires','Tune it in the Inspector','Add from the Library'].includes(titles[i]))assert.ok(card.overlap<.35,'Card mostly clear of the highlight at '+titles[i]+': '+card.overlap);
      if(titles[i]==='Tune it in the Inspector')assert.equal(await page.evaluate(id=>pro.getProject().layers[0].nodes.find(n=>n.id===id).props.mode,ids.W),'spiral');
      if(titles[i]==='Let something drive a knob')assert.ok(await page.evaluate(i=>pro.getProject().layers[0].edges.some(e=>e.from===i.L&&e.to===i.T&&e.input==='amount'),ids),'LFO drives Twist');
      if(titles[i]==='Stack Layers')assert.equal(await page.evaluate(()=>pro.getProject().layers.length),2,'Tutorial adds a layer');
      if(i===2)await page.screenshot({path:process.env.AUDIOGRAPH_TOUR_SHOT||'/tmp/ag-tour.png'});
      await page.click('#tourNext');
    }
    await page.waitForFunction(()=>!document.querySelector('#tourCard').classList.contains('show'));
    const tourScene=await page.evaluate(()=>pro.getProject());
    assert.deepEqual(tourScene.layers[0].nodes.map(n=>n.type),['audioIn','waveform2d','particles','twist','palette','bloom','trails','output','oscillator'],'Finished tutorial scene stays');
    assert.equal(await page.evaluate(id=>pro.engine(id).__tourMark,ids.W),1,'Tutorial steps reuse the same renderer');
    assert.equal(await page.evaluate(()=>pro.stats().paused),false,'Tutorial plays');
    assert.equal(await page.evaluate(()=>localStorage.getItem('agpro.tourSeen')),'1','Tutorial is remembered');
    await lit(.02,25000);
    await page.evaluate(()=>pro.undo());
    assert.equal(JSON.stringify(await page.evaluate(()=>pro.getProject())),beforeTour,'One Undo restores the scene before the tutorial');
    await page.evaluate(()=>pro.tour.start());await page.locator('#tourCard.show').waitFor();
    await page.keyboard.press('ArrowRight');assert.equal(await page.textContent('#tourTitle'),titles[1],'Arrow keys step');
    await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#tourCard').classList.contains('show'));
    await page.evaluate(()=>pro.tour.invite());await page.locator('#tourCard.show').waitFor();
    assert.equal(await page.textContent('#tourTitle'),'New to Audiograph Pro?');
    await page.click('#tourSkip');await page.waitForFunction(()=>!document.querySelector('#tourCard').classList.contains('show'));
    assert.deepEqual(errors,[],'No page errors during the tutorial');
    console.log('First Mile tests passed');
    }
  }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exit(1);});
