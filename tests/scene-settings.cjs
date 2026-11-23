const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const types={'.js':'text/javascript','.html':'text/html','.css':'text/css'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+url.pathname+(url.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
});
const n=(id,type,props)=>({id,type,props,x:0,y:0});
const edge=(from,out,to,input)=>({from,out,to,input});
const layer=(id,nodes,edges)=>({id,name:id,visible:true,opacity:1,blend:'source-over',nodes:[...nodes,n(id+'Out','output',{})],edges});
const scene={format:'audiograph-pro',version:10,layers:[
  layer('Mesh',[n('mesh','waveform3d',{mode:'cube',render:'waveform'}),n('camera','camera3d',{turn:35,tilt:40,dof:45})],[
    edge('mesh','shape','camera','shape'),edge('camera','shape','MeshOut','image')]),
  layer('Particles',[n('particles','gpuParticles',{mode:'simparticles',sim:{q:'high'}})],[
    edge('particles','shape','ParticlesOut','image')]),
  layer('Flat',[n('flat','waveform2d',{mode:'circle'})],[edge('flat','shape','FlatOut','image')]),
  layer('OtherMesh',[n('other','waveform3d',{mode:'cube',render:'normal'})],[edge('other','shape','OtherMeshOut','image')])
]};
(async()=>{
  let browser;await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--ignore-gpu-blocklist']});
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto((process.env.AUDIOGRAPH_PRO_URL||`http://127.0.0.1:${server.address().port}/pro/`)+'?demo');
    await page.waitForFunction(()=>window.pro);
    assert.equal((await page.evaluate(()=>pro.getProject())).settings.camera,null,'New scenes use wired cameras by default');
    await page.evaluate(scene=>{pro.dissolve(false);pro.importProject(scene);},scene);
    await page.waitForFunction(()=>['particles','other'].every(id=>pro.engine(id)?.w?.agSim.stats().live>0));
    await page.evaluate(()=>pro.pause(true));
    const project=()=>page.evaluate(()=>pro.getProject()),panel=page.locator('#properties .scene-inspector');
    const field=label=>panel.getByLabel(label,{exact:true}),gear=page.getByRole('button',{name:'Scene settings'});
    assert.ok(await gear.evaluate(el=>el.previousElementSibling.id==='reset'));
    assert.equal(await page.evaluate(()=>pro.engine('mesh').w.__agDofCfg.amt),45);
    const flat=()=>page.evaluate(()=>{
      const {w}=pro.engine('flat');return [w.__agFocal,w.__agDofCfg,w.stackLayouts[0].params._dragRotX,w.stackLayouts[0].params._dragRotY];
    });
    const flatBefore=await flat();
    const gutter=page.locator('.gutter[data-resize=inspector]');
    await gutter.dblclick();
    await gear.focus();await page.keyboard.press('Enter');
    assert.equal(await gear.getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('dialog[open]').count(),0,'Scene settings never opens a dialog');
    assert.equal(await panel.getByRole('heading',{name:'Scene settings'}).evaluate(el=>document.activeElement===el),true);
    assert.deepEqual(await panel.locator('legend').allTextContents(),['3D camera','Output','Performance','2D composition']);
    assert.equal(await field('Camera mode').inputValue(),'legacy');
    const knob=(k,mode='sceneCamera')=>page.locator(`#properties input[data-property="${mode}:${k}"]`);
    const setKnob=(k,value,commit,mode)=>knob(k,mode).evaluate((el,{value,commit})=>{
      el.value=value;el.dispatchEvent(new Event(commit?'change':'input',{bubbles:true}));
    },{value,commit});
    assert.equal(await knob('dof','wiredCamera').inputValue(),'45');
    await setKnob('dof',60,false,'wiredCamera');
    assert.equal(await page.evaluate(()=>pro.engine('mesh').w.__agDofCfg.amt),60,'The gear exposes live wired camera controls');
    await setKnob('dof',60,true,'wiredCamera');
    assert.equal((await project()).settings?.camera??null,null);
    await page.evaluate(()=>pro.undo());
    assert.equal(await knob('dof','wiredCamera').inputValue(),'45');
    await field('Camera mode').focus();
    await field('Camera mode').selectOption('shared');
    assert.equal(await field('Camera mode').evaluate(el=>document.activeElement===el),true);
    assert.equal(await knob('turn').inputValue(),'35');
    assert.equal(await knob('dof').inputValue(),'45');
    await setKnob('dof',75,false);
    assert.equal(await page.evaluate(()=>pro.engine('mesh').w.__agDofCfg.amt),75,'Depth of field updates before the knob is released');
    await setKnob('dof',75,true);
    await page.evaluate(()=>pro.undo());
    assert.equal((await project()).settings.camera.dof,45);
    await setKnob('turn',80,false);await setKnob('turn',80,true);
    assert.equal((await project()).settings.camera.turn,80);
    assert.equal((await project()).layers[0].nodes.find(n=>n.id==='camera').props.turn,35);
    assert.deepEqual(await flat(),flatBefore,'Shared camera does not move or blur the flat renderer');
    assert.equal(await page.evaluate(()=>pro.engine('particles').w.__agParticles3d.yaw),80*Math.PI/180);
    assert.deepEqual(...await page.evaluate(()=>['mesh','other'].map(id=>pro.engine(id).w.__agScene.camera)));
    await page.evaluate(()=>pro.select('camera'));
    assert.equal(await panel.isVisible(),false,'Selecting a node returns to the node inspector');
    assert.equal(await gear.getAttribute('aria-pressed'),'false');
    assert.equal(await knob('turn').inputValue(),'80','A selected camera shows the active shared knobs');
    await gear.click();
    await field('Live resolution').selectOption('720');
    assert.equal(await page.locator('#resolution').inputValue(),'720');
    assert.equal(await page.locator('#preview').evaluate(el=>el.height),720);
    await field('Canvas background').fill('#102030');
    await field('Video quality').selectOption('max');
    const tiers=()=>page.evaluate(()=>['particles','other'].map(id=>{
      const e=pro.engine(id),s=e.w.agSim.stats();
      return {applied:e.applied?._sim.q,active:s.layers[s.simUid]?.q,live:Object.values(s.layers).map(l=>l.q)};
    }));
    const baseline=await tiers();
    await field('Live frame-rate cap').selectOption('15');
    await field('WebGPU simulation quality').selectOption('low');
    await field('3D lens effects').selectOption('false');
    const tuned=await project();
    assert.deepEqual(tuned.settings.performance,{fps:15,simulation:'low',lensEffects:false});
    assert.equal(tuned.settings.background,'#102030');
    assert.equal(tuned.settings.video.quality,'max');
    const reduced=await tiers();
    assert.ok(reduced.every(s=>s.applied==='low'&&s.active==='low'),JSON.stringify(reduced));
    assert.equal(await page.evaluate(()=>pro.engine('mesh').w.__agDofCfg),null);
    await field('3D lens effects').focus();
    await page.keyboard.press('Escape');assert.equal(await panel.isVisible(),false);
    assert.equal(await gear.evaluate(el=>document.activeElement===el),true);
    const preview=await page.locator('#preview').boundingBox();
    const x=preview.x+preview.width/2,y=preview.y+preview.height/2;
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+40,y+25);await page.mouse.up();
    assert.equal((await project()).settings.camera.turn,64,'Preview orbit edits the shared camera');
    await page.evaluate(()=>pro.undo());
    await page.evaluate(()=>{pro.undo();pro.undo();});
    assert.deepEqual((await tiers()).map(s=>s.active),baseline.map(s=>s.active));
    assert.equal(await page.evaluate(()=>pro.engine('mesh').w.__agDofCfg.amt),45);
    await page.evaluate(p=>pro.importProject(JSON.parse(JSON.stringify(p))),tuned);
    assert.deepEqual((await project()).settings,tuned.settings);
    await page.setViewportSize({width:390,height:740});await gear.click();
    const box=await panel.boundingBox();
    assert.ok(box.x>=0&&box.x+box.width<=390);
    assert.equal(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth),true,'Mobile inspector has no horizontal overflow');
    await panel.getByRole('button',{name:'Done'}).click();
    await page.evaluate(p=>{p.settings.camera=null;p.layers[2].nodes.push({id:'camera2',type:'camera3d',x:200,y:50,props:{dof:20}});pro.importProject(p);},tuned);
    await gear.click();
    assert.equal(await field('Wired camera').inputValue(),'camera');
    await field('Wired camera').selectOption('camera2');
    assert.equal(await knob('dof','wiredCamera').inputValue(),'20');
    await setKnob('dof',25,false,'wiredCamera');await setKnob('dof',25,true,'wiredCamera');
    assert.equal((await project()).layers[2].nodes.find(n=>n.id==='camera2').props.dof,25);
    assert.equal((await project()).layers[0].nodes.find(n=>n.id==='camera').props.dof,45);
    await field('Camera mode').selectOption('shared');
    await field('Copy wired camera').selectOption('camera2');
    assert.equal(await knob('dof').inputValue(),'25');
    await page.evaluate(p=>{const l=p.layers[2];l.visible=false;p.layers=[l];pro.importProject(p);pro.pause(false);},tuned);
    const frames=await page.evaluate(async()=>{
      const count=pro.stats().frame;await new Promise(r=>setTimeout(r,1200));return pro.stats().frame-count;
    });
    assert.ok(frames>=12&&frames<=21,`Expected about 18 live frames at 15 fps; got ${frames}`);
    assert.deepEqual(await page.locator('#preview').evaluate(c=>[...c.getContext('2d').getImageData(0,0,1,1).data]),[16,32,48,255]);
    assert.equal(await page.evaluate(()=>pro.stats().errors.length),0);
    assert.deepEqual(errors,[]);
    console.log('ok - Scene settings inspector, live wired and shared cameras, performance, undo, persistence, and mobile');
  }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
