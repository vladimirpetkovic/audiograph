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
const scene={format:'audiograph-pro',version:10,settings:{ground:{enabled:false}},layers:[
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
    assert.equal((await page.evaluate(()=>pro.getProject())).settings.camera.motion,'static','New scenes always have one scene camera');
    assert.equal((await page.evaluate(()=>pro.getProject())).settings.camera.dof,0,'New scenes have depth of field disabled');
    assert.equal((await page.evaluate(()=>pro.getProject())).settings.gravity,undefined,'Scene settings have no global gravity');
    await page.evaluate(scene=>{pro.dissolve(false);pro.importProject(scene);},scene);
    await page.waitForFunction(()=>['particles','other'].every(id=>pro.engine(id)?.w?.agSim.stats().live>0));
    await page.evaluate(()=>pro.pause(true));
    const project=()=>page.evaluate(()=>pro.getProject()),panel=page.locator('#properties .scene-inspector');
    const field=label=>panel.getByLabel(label,{exact:true}),gear=page.getByRole('button',{name:'Scene settings'});
    const choose=async(label,value)=>{
      const control=field(label);
      if(await control.getAttribute('role')==='group')await control.locator(`button[data-value="${value}"]`).click();
      else await control.selectOption(value);
    };
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
    assert.deepEqual(await panel.locator('legend').allTextContents(),['3D camera','Ground','Global lighting','Output','Performance','2D composition']);
    assert.equal(await field('Scene gravity').count(),0,'Gravity belongs only to attached nodes');
    assert.equal(await page.evaluate(()=>{const p=pro.getProject();p.settings.gravity=9.81;return pro.validate(p).settings.gravity;}),undefined,'Legacy Scene gravity cannot reappear after loading');
    assert.equal(await field('Camera mode').count(),0,'There is no per-node camera mode');
    const knob=(k,mode='sceneCamera')=>page.locator(`#properties input[data-property="${mode}:${k}"]`);
    const setKnob=(k,value,commit,mode)=>knob(k,mode).evaluate((el,{value,commit})=>{
      el.value=value;el.dispatchEvent(new Event(commit?'change':'input',{bubbles:true}));
    },{value,commit});
    assert.equal(await knob('dof').inputValue(),'45');
    await setKnob('dof',60,false);
    assert.equal(await page.evaluate(()=>pro.engine('mesh').w.__agDofCfg.amt),60,'The gear exposes live universal camera controls');
    await setKnob('dof',60,true);
    assert.equal((await project()).settings.camera.dof,60);
    await page.evaluate(()=>pro.undo());
    assert.equal(await knob('dof').inputValue(),'45');
    assert.equal(await knob('turn').inputValue(),'35');
    assert.equal(await knob('dof').inputValue(),'45');
    await setKnob('dof',75,false);
    assert.equal(await page.evaluate(()=>pro.engine('mesh').w.__agDofCfg.amt),75,'Depth of field updates before the knob is released');
    await setKnob('dof',75,true);
    await page.evaluate(()=>pro.undo());
    assert.equal((await project()).settings.camera.dof,45);
    await setKnob('turn',80,false);await setKnob('turn',80,true);
    assert.equal((await project()).settings.camera.turn,80);
    assert.equal((await project()).layers.flatMap(g=>g.nodes).filter(n=>n.type==='camera3d').length,0,'Legacy camera nodes migrate into Scene settings');
    assert.deepEqual(await flat(),flatBefore,'Shared camera does not move or blur the flat renderer');
    assert.equal(await page.evaluate(()=>pro.engine('particles').w.__agParticles3d.yaw),80*Math.PI/180);
    assert.deepEqual(...await page.evaluate(()=>['mesh','other'].map(id=>pro.engine(id).w.__agScene.camera)));
    await page.evaluate(()=>pro.select('mesh'));
    assert.equal(await panel.isVisible(),false,'Selecting a node returns to the node inspector');
    assert.equal(await gear.getAttribute('aria-pressed'),'false');
    assert.equal(await knob('turn').count(),0,'Object inspectors do not expose a private camera');
    await gear.click();
    assert.equal(await knob('turn').inputValue(),'80');
    await choose('Live resolution','720');
    assert.equal(await page.locator('#resolution').inputValue(),'720');
    assert.equal(await page.locator('#preview').evaluate(el=>el.height),720);
    await field('Canvas background').fill('#102030');
    await choose('Video quality','max');
    const tiers=()=>page.evaluate(()=>['particles','other'].map(id=>{
      const e=pro.engine(id),s=e.w.agSim.stats();
      return {applied:e.applied?._sim.q,active:s.layers[s.simUid]?.q,live:Object.values(s.layers).map(l=>l.q)};
    }));
    const baseline=await tiers();
    await choose('Live frame-rate cap','15');
    await choose('WebGPU simulation quality','low');
    await choose('3D lens effects','false');
    const tuned=await project();
    assert.deepEqual(tuned.settings.performance,{fps:15,simulation:'low',lensEffects:false});
    assert.equal(tuned.settings.background,'#102030');
    assert.equal(tuned.settings.video.quality,'max');
    const reduced=await tiers();
    assert.ok(reduced.every(s=>s.applied==='low'&&s.active==='low'),JSON.stringify(reduced));
    assert.equal(await page.evaluate(()=>pro.engine('mesh').w.__agDofCfg),null);
    await field('3D lens effects').locator('button[data-value="false"]').focus();
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
    await gear.click();
    await field('Haze strength (%)').fill('75');
    assert.equal((await project()).settings.lighting.hazeStrength,75,'Scene knobs update live without rebuilding the inspector');
    await field('Haze strength (%)').dispatchEvent('change');
    await page.evaluate(()=>pro.undo());
    assert.equal((await project()).settings.lighting.hazeStrength,tuned.settings.lighting.hazeStrength);
    await field('Haze end').fill('1');await field('Haze end').dispatchEvent('change');
    assert.equal((await project()).settings.lighting.hazeEnd,tuned.settings.lighting.hazeEnd,'Invalid haze ranges restore the last valid setting');
    assert.equal(await field('Haze end').inputValue(),String(tuned.settings.lighting.hazeEnd));
    await page.screenshot({path:'/tmp/audiograph-scene-controls-desktop.png',fullPage:true});
    await page.setViewportSize({width:390,height:740});
    const box=await panel.boundingBox();
    assert.ok(box.x>=0&&box.x+box.width<=390);
    assert.equal(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth),true,'Mobile inspector has no horizontal overflow');
    await page.screenshot({path:'/tmp/audiograph-scene-controls-mobile.png',fullPage:true});
    await panel.getByRole('button',{name:'Done'}).click();
    const conflict=structuredClone(scene),other=conflict.layers[3];
    other.nodes.push(n('camera2','camera3d',{dof:20}));
    other.edges=[edge('other','shape','camera2','shape'),edge('camera2','shape','OtherMeshOut','image')];
    await page.evaluate(p=>pro.importProject(p),conflict);
    assert.match(await page.locator('#status').textContent(),/Conflicting legacy cameras/,'Conflicting cameras are reported during import');
    await gear.click();
    assert.equal(await knob('dof').inputValue(),'45','The connected primary camera is preserved');
    assert.equal(await field('Wired camera').count(),0);
    assert.equal(await field('Copy wired camera').count(),0);
    await page.evaluate(p=>{const l=p.layers[2];l.visible=false;p.layers=[l];pro.importProject(p);pro.pause(false);},tuned);
    const frames=await page.evaluate(async()=>{
      const count=pro.stats().frame;await new Promise(r=>setTimeout(r,1200));return pro.stats().frame-count;
    });
    assert.ok(frames>=12&&frames<=21,`Expected about 18 live frames at 15 fps; got ${frames}`);
    assert.deepEqual(await page.locator('#preview').evaluate(c=>[...c.getContext('2d').getImageData(0,0,1,1).data]),[16,32,48,255]);
    const dragPreview=async()=>{
      const box=await page.locator('#preview').boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
      await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+40,y+25);await page.mouse.up();
    };
    await page.setViewportSize({width:1440,height:900});
    await page.evaluate(scene=>{
      scene.layers=[scene.layers[0]];
      const g=scene.layers[0];
      g.nodes.unshift({id:'unused',type:'camera3d',x:50,y:150,props:{turn:12}});
      g.nodes.push({id:'boost',type:'amplify',x:300,y:50,props:{gain:1}});
      g.edges.find(e=>e.to==='MeshOut').from='boost';
      g.edges.find(e=>e.to==='MeshOut').out='out';
      g.edges.push({from:'camera',out:'shape',to:'boost',input:'in'});
      pro.importProject(scene);
    },scene);
    await page.waitForFunction(()=>pro.engine('mesh')?.w?.__agScene.camera);
    await page.evaluate(()=>pro.pause(true));
    await dragPreview();
    const angle=async()=> (await project()).settings.camera.turn;
    assert.equal(await angle(),19,'Dragging rotates the universal camera chosen from the connected legacy camera');
    await page.evaluate(()=>pro.undo());
    await page.evaluate(()=>{pro.select('mesh');pro.draw();});
    await page.keyboard.press('v');
    await page.evaluate(()=>pro.draw());
    const thumb=()=>page.locator('#preview').evaluate(src=>{
      const c=document.createElement('canvas');c.width=320;c.height=180;
      const ctx=c.getContext('2d');ctx.drawImage(src,0,0,c.width,c.height);
      return [...ctx.getImageData(0,0,c.width,c.height).data];
    });
    const beforeOrbit=await thumb();
    await dragPreview();
    assert.equal(await angle(),19,'Solo 3D previews use the same universal camera');
    assert.equal((await project()).layers[0].view,undefined,'3D preview does not create a private layer camera');
    const orbitDifference=(await thumb()).filter((v,i)=>Math.abs(v-beforeOrbit[i])>12).length;
    assert.ok(orbitDifference>100,`The solo object visibly rotates (${orbitDifference} changed channels)`);
    await page.keyboard.press('Escape');
    const bypass=structuredClone(scene);bypass.layers=[bypass.layers[0]];bypass.layers[0].nodes.find(n=>n.id==='camera').bypass=true;
    await page.evaluate(p=>pro.importProject(p),bypass);
    await dragPreview();
    assert.equal(await angle(),-16,'Bypassed legacy cameras do not override the universal default');
    assert.equal((await project()).layers[0].view,undefined);
    assert.equal(await page.evaluate(()=>pro.stats().errors.length),0);
    assert.deepEqual(errors,[]);
    console.log('ok - Universal scene camera, legacy migration, preview navigation, performance, undo, persistence, and mobile');
  }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
