const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const types={'.js':'text/javascript','.html':'text/html','.css':'text/css'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+url.pathname+(url.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
});
// Each layer's node types, and whether its renderers are wired from Audio through to Output.
const describe=()=>pro.getProject().layers.map(g=>{
  const type=id=>g.nodes.find(n=>n.id===id)?.type,reach=new Set(g.nodes.filter(n=>n.type==='audioIn').map(n=>n.id));
  for(let size=-1;size!==reach.size;){size=reach.size;for(const e of g.edges)if(reach.has(e.from))reach.add(e.to);}
  return {name:g.name,blend:g.blend,types:g.nodes.map(n=>n.type).sort(),wired:g.nodes.some(n=>n.type==='output'&&reach.has(n.id)),
    paletteBy:g.nodes.find(n=>n.type==='cloner')?.props.paletteBy,chain:g.edges.filter(e=>!['audio','object'].includes(e.out)).map(e=>type(e.from)+'>'+type(e.to)).sort()};
});
(async()=>{
  let browser;await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--ignore-gpu-blocklist']});
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto((process.env.AUDIOGRAPH_PRO_URL||`http://127.0.0.1:${server.address().port}/pro/`)+'?demo');
    await page.waitForFunction(()=>window.pro);
    const info=()=>page.evaluate(`(${describe})()`);
    const start=(await info())[0];

    await page.locator('#addLayer').click();
    assert.deepEqual((await info())[1].types,[],'A new layer starts empty');
    assert.ok(await page.locator('.graph-empty').isVisible(),'The empty layer explains how to start');
    for(const [type,props,expect] of [['waveform2d',{mode:'circle'},['audioIn','merge','output','waveform2d']],['gpuParticles',{mode:'simparticles'},['audioIn','gpuParticles','merge','output']],
      ['cloner',{},['audioIn','cloner','merge','output','soundEffector','waveform3d']]]){
      await page.evaluate(()=>{pro.addLayer();});
      await page.evaluate(([t,p])=>pro.addNode(t,undefined,undefined,p),[type,props]);
      const g=(await info()).at(-1);
      assert.deepEqual(g.types,expect,`${type} in an empty layer brings Audio and Output`);
      assert.ok(g.wired,`${type} is wired from Audio to Output`);
      await page.evaluate(()=>pro.undo());await page.evaluate(()=>pro.undo());
    }
    await page.evaluate(()=>{pro.addLayer();pro.addNode('waveform2d',undefined,undefined,{mode:'spiral'});pro.addNode('waveform2d',undefined,undefined,{mode:'circle'});});
    assert.deepEqual((await info()).at(-1).types.filter(t=>['audioIn','output'].includes(t)),['audioIn','output'],'A second renderer reuses the layer’s Audio and Output');
    await page.evaluate(()=>pro.importProject({format:'audiograph-pro',version:21,layers:[{id:'a',name:'Layer 1',visible:true,opacity:1,blend:'source-over',nodes:[],edges:[]}]},'reset'));

    assert.deepEqual(await page.evaluate(()=>pro.setups()),['Spiral Waveform','Cloner','Particles']);
    assert.deepEqual(await page.locator('#library .library-setup').allTextContents(),['Spiral Waveform','Cloner','Particles'],'Layers section lists the setups');
    await page.locator('#library .library-setup[data-setup="Spiral Waveform"]').click();
    let layers=await info();
    assert.equal(layers.length,1,'A setup fills the empty layer');
    assert.deepEqual({...layers[0],name:start.name},start,'Spiral Waveform matches the default graph');
    await page.locator('#library .library-setup[data-setup="Cloner"]').click();
    layers=await info();const cl=layers[1];
    assert.equal(cl.name,'Cloner');assert.ok(cl.wired,'Cloner setup is wired to Output');
    assert.deepEqual(cl.types,['audioIn','cloner','merge','output','palette','soundEffector','waveform3d']);
    assert.ok(cl.chain.includes('cloner>soundEffector')&&cl.chain.includes('soundEffector>palette')&&cl.chain.includes('palette>merge'),'Cloner → Sound effector → Palette → Merge');
    assert.equal(cl.paletteBy,'sound','The palette reacts to sound');
    await page.locator('#library .library-setup[data-setup="Particles"]').click();
    layers=await info();
    assert.equal(layers.length,4,'Particles adds the two Waterfall layers');
    const waterfall=await page.evaluate(()=>{pro.loadTemplate('Waterfall');return pro.getProject().layers.map(g=>g.nodes.map(n=>n.type+JSON.stringify(n.props)).sort());});
    await page.evaluate(()=>pro.undo());
    assert.deepEqual(await page.evaluate(()=>pro.getProject().layers.slice(2).map(g=>g.nodes.map(n=>n.type+JSON.stringify(n.props)).sort())),waterfall,'Particles is the Waterfall template');
    await page.locator('#library .library-setup[data-setup="Cloner"]').click();
    assert.equal((await info()).length,4,'The layer limit is respected');
    // Merge works with any single wire: one input, or only its Output while the layer is being built.
    for(const [label,nodes,edges] of [
      ['only Output',[],[]],
      ['one input',[{id:'w',type:'waveform2d',x:0,y:0,props:{mode:'circle'}}],[{from:'s',out:'audio',to:'w',input:'audio'},{from:'w',out:'shape',to:'m',input:'c'}]]]){
      const r=await page.evaluate(async([nodes,edges])=>{
        pro.importProject({format:'audiograph-pro',version:21,layers:[{id:'M',name:'M',visible:true,opacity:1,blend:'source-over',
          nodes:[{id:'s',type:'audioIn',x:0,y:0,props:{}},...nodes,{id:'m',type:'merge',x:200,y:0,props:{}},{id:'o',type:'output',x:400,y:0,props:{}}],
          edges:[...edges,{from:'m',out:'image',to:'o',input:'image'}]}]},'merge');
        await new Promise(r=>setTimeout(r,1200));return {errors:pro.stats().errors,px:pro.pixels()};},[nodes,edges]);
      assert.deepEqual(r.errors,[],`Merge with ${label} does not fail the layer`);
      if(label==='one input')assert.ok(r.px>.1,'A single Merge input draws');
    }
    await page.evaluate(()=>pro.undo());
    await page.waitForTimeout(1500);
    const stats=await page.evaluate(()=>pro.stats());
    assert.deepEqual(stats.errors,[],'All setups render without errors');
    assert.deepEqual(errors,[]);
    console.log('ok - Empty new layers, auto Audio/Output on new renderers, and Layers setups (Spiral Waveform, Cloner, Particles)');
  }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
