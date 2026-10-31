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
    const project=()=>page.evaluate(()=>pro.getProject());
    const layer0=async()=>(await project()).layers[0];
    const idOf=async type=>(await layer0()).nodes.find(n=>n.type===type)?.id;
    const ids={emitter:await idOf('emitter'),bloom:await idOf('bloom'),output:await idOf('output')};
    const lit=(min=.5,timeout=20000)=>page.waitForFunction(min=>pro.pixels()>min&&!pro.stats().errors.length,min,{timeout});

    // 1. Default graph: the native WebGPU Fluid runs inside the real Audiograph engine and reaches the preview.
    const native=await page.evaluate(async id=>{const e=pro.engine(id);await e.ready;return {status:await e.w.agSim.ready(),stats:e.w.agSim.stats()};},ids.emitter);
    assert.equal(native.status,'ready',JSON.stringify(native.stats));
    assert.ok(native.stats.adapter&&!/swiftshader|software/i.test(native.stats.adapter),native.stats.adapter);
    await lit(1);
    const pixels=()=>page.evaluate(()=>Array.from(document.getElementById('preview').getContext('2d').getImageData(0,0,960,540).data).filter((_,i)=>i%4!==3));
    const a=await pixels();await page.waitForTimeout(400);assert.ok(difference(a,await pixels())>.05,'Preview animates');
    assert.equal(await page.locator('.library-node[data-mode]').count(),32,'All 32 Audiograph emitters are in the library');
    for(const label of ['Emitters','Geometry & Motion','Deformers','Color','Style','Particles','Post FX','Controls','Audio','Composite'])
      assert.equal(await page.locator('.panel-title',{hasText:label}).count()>=1,true,`Library category ${label}`);

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

    // 3. Mode change via the inspector, then click-to-insert: Twist and Palette splice into the chain after the selection.
    await page.locator('select[data-property="mode"]').selectOption('circle');
    await page.locator(`.node[data-id="${ids.emitter}"] .node-head`).click();
    await page.locator('.library-node[data-type="twist"]').click();
    let g=await layer0();const twist=g.nodes.find(n=>n.type==='twist');
    assert.ok(g.edges.some(e=>e.from===ids.emitter&&e.to===twist.id),'Emitter → Twist');
    assert.ok(g.edges.some(e=>e.from===twist.id&&e.to===ids.bloom),'Twist → Bloom (spliced)');
    await page.locator('.library-node[data-type="palette"]').click();
    g=await layer0();const palette=g.nodes.find(n=>n.type==='palette');
    assert.ok(g.edges.some(e=>e.from===twist.id&&e.to===palette.id)&&g.edges.some(e=>e.from===palette.id&&e.to===ids.bloom),'Twist → Palette → Bloom');
    await page.locator('[data-property="palettePreset"] [data-value="Fire"]').click();
    assert.equal((await layer0()).nodes.find(n=>n.id===palette.id).props.c2,'#c1121f');
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

    // 6. Wire click removes it; deleting a chain node heals the chain.
    const nWires=(await layer0()).edges.length;await page.locator('.wire.number').first().click();
    assert.equal((await layer0()).edges.length,nWires-1,'Clicking a wire removes it');
    await page.evaluate(id=>pro.select(id),palette.id);await page.keyboard.press('Delete');
    g=await layer0();assert.ok(g.edges.some(e=>e.from===twist.id&&e.to===ids.bloom),'Deleting Palette reconnects Twist → Bloom');

    // 7. Post FX run on images without any emitter (background → kaleido → output) via a helper engine.
    await page.evaluate(()=>pro.importProject({format:'audiograph-pro',version:2,layers:[{id:'L1',name:'Bg',visible:true,opacity:1,blend:'source-over',
      nodes:[{id:'bg',type:'background',x:0,y:0,props:{fill:'radial',c1:'#000000',c2:'#ff00aa'}},{id:'gr',type:'grade',x:200,y:0,props:{hue:120,saturation:100}},{id:'out',type:'output',x:400,y:0,props:{}}],
      edges:[{from:'bg',out:'image',to:'gr',input:'image'},{from:'gr',out:'image',to:'out',input:'image'}]}]}));
    await page.waitForFunction(()=>Object.keys(pro.stats().engines).includes('__fx')&&pro.stats().engines.__fx.status==='ready',null,{timeout:30000});
    await page.waitForTimeout(300);
    const rgb=await page.evaluate(()=>Array.from(document.getElementById('preview').getContext('2d').getImageData(480,270,1,1).data));
    assert.ok(rgb[1]>rgb[0],'Color correct hue-shifted magenta toward green: '+rgb);

    // 8. Stage-1 (version 1) projects still import; unsafe or invalid data is rejected.
    const v1={format:'audiograph-pro',version:1,layers:[{id:'a',name:'Old',visible:true,opacity:1,nodes:[
      {id:'e',type:'emitter',x:0,y:0,props:{mode:'circle',drive:.5,energy:1,size:1,hue:0}},{id:'o',type:'output',x:200,y:0,props:{}}],edges:[{from:'e',out:'image',to:'o',input:'image'}]}]};
    const migrated=await page.evaluate(p=>pro.importProject(p),v1);
    assert.equal(migrated.version,2);assert.equal(migrated.layers[0].edges[0].out,'shape');
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
