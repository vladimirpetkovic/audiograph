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
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'application/octet-stream');
  res.end(fs.readFileSync(file));
});
const scene=(space='3d',shape='sphere')=>({format:'audiograph-pro',version:10,layers:[{id:'L',name:'3D particles',visible:true,opacity:1,blend:'source-over',
  nodes:[{id:'o',type:'waveform3d',x:0,y:180,props:{mode:shape,render:'normal',stretchZ:180}},
    {id:'d',type:'value',x:0,y:0,props:{value:1}},
    {id:'w',type:'waveform2d',x:0,y:360,props:{mode:'sine'}},
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
    const inspectorScene=scene('2d');inspectorScene.layers[0].nodes.find(n=>n.id==='e').props.mode='simfluid';
    await page.evaluate(p=>{pro.importProject(p);pro.select('e');},inspectorScene);
    const inspector=page.locator('#properties');
    await inspector.getByRole('combobox',{name:'Simulation'}).selectOption('simparticles');
    const emission=inspector.locator('[data-group="Emission"]'),look=inspector.locator('[data-group="Look"]');
    for(const key of ['opt:pSpSpeed','opt:pEmitScale','particleDepth','particleSpread','particleResponse','particleSurfaceFlow'])await emission.locator(`[data-property="${key}"]`).first().waitFor({state:'attached'});
    await look.locator('[data-property="opt:pSpTrail"]').first().waitFor({state:'attached'});
    assert.equal(await page.evaluate(()=>pro.engine('e').w.document.getElementById('pSpTrail').max),'1000');
    await emission.getByRole('button',{name:'Ultra',exact:true,includeHidden:true}).waitFor({state:'attached'});
    const floorSection=inspector.locator('[data-group="Floor"]');
    await floorSection.locator('[data-property="particleFloorSize"]').first().waitFor({state:'attached'});
    assert.equal(await floorSection.locator('[data-property="particleFloor"]').count(),1);
    assert.equal(await inspector.locator('[data-group="Quality"]').count(),0,'Quality is part of Look');
    assert.equal(await inspector.locator('[data-property="space"],[data-property="particleInitialSpeed"],[data-property="particleTrails"]').count(),0);
    assert.equal(await inspector.getByText('Aurora ribbons',{exact:true}).count(),0);
    assert.equal(await inspector.getByRole('combobox',{name:'Simulation'}).locator('option[value="simsand"]').count(),0);
    const legacy=scene();Object.assign(legacy.layers[0].nodes.find(n=>n.id==='e').props,{particleInitialSpeed:50,particleTrails:false,opts:{pSpSpeed:70,pSpTrail:60}});
    assert.deepEqual(await page.evaluate(p=>pro.validate(p).layers[0].nodes.find(n=>n.id==='e').props.opts,legacy),{pSpSpeed:35,pSpTrail:0});
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
    const setTrails=value=>page.evaluate(v=>pro.setProperty('e','opts',{pSpTrail:v}),value);
    const trailSegments=count=>page.waitForFunction(n=>Object.values(pro.engine('e')?.w?.agSim.stats().layers||{})
      .some(s=>s.dimensions===3&&s.trailSegments===n),count);
    await setTrails(100);await trailSegments(4);
    await setTrails(1000);await trailSegments(8);
    assert.ok(await page.evaluate(()=>pro.pixels())>.02,'Maximum trails render in 3D');
    await setTrails(0);await trailSegments(0);
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
    await page.evaluate(()=>pro.setProperty('c','tilt',78));
    await page.locator('#preview').scrollIntoViewIfNeeded();
    const preview=await page.locator('#preview').boundingBox();
    assert.ok(preview,'The preview is visible and can be dragged');
    const x=preview.x+preview.width/2,y=preview.y+preview.height*.25;
    await page.mouse.move(x,y);
    await page.mouse.down();
    await page.mouse.move(x,y+105,{steps:4});
    await page.mouse.up();
    await page.waitForTimeout(150);
    const pitch=await page.evaluate(()=>pro.getProject().layers[0].nodes.find(n=>n.id==='c').props.tilt);
    assert.equal(pitch,120,'Camera pitch can orbit over the pole');
    assert.ok((await pixels()).some((v,i)=>v!==image2[i]),'The camera projects the cloud from the other side of the pole');
    assert.deepEqual(await state(),before,'Orbiting over the pole preserves the world-space state');
    await page.evaluate(()=>{pro.engine('e').w.agSim.expMode(false);pro.pause(false);});
    // Live rewiring to a flat waveform and back rebuilds the correct buffer stride.
    assert.ok(await page.evaluate(()=>pro.connect('w','shape','e','emit')));
    await page.waitForFunction(()=>Object.values(pro.engine('e').w.agSim.stats().layers).some(s=>s.dimensions===2&&s.emitted>100),null,{timeout:20000});
    await page.waitForFunction(()=>pro.emitPoints('e')?.length>0,null,{timeout:15000});
    assert.ok(await page.evaluate(()=>pro.emitPoints('e')?.length>0),'2D samples the rendered waveform');
    await setTrails(1000);
    await page.waitForFunction(()=>pro.engine('e').w.getLayoutParams().pSpTrail===1000&&pro.pixels()>.02);
    await setTrails(55);
    await page.evaluate(()=>pro.select('e'));
    assert.equal(await floorSection.count(),0,'Flat emitters do not show a 3D floor');
    assert.ok(await page.evaluate(()=>pro.connect('o','object','e','emit')));
    await page.waitForFunction(()=>Object.values(pro.engine('e').w.agSim.stats().layers).some(s=>s.dimensions===3&&s.emitted>100),null,{timeout:20000});
    assert.ok(active(await state()).some(p=>Math.abs(p[2])>.1),'Switching back restores Z');
    for(const shape of ['cube','torus','cone','model']){
      await load(scene('3d',shape));
      assert.ok(active(await state()).some(p=>Math.abs(p[2])>.05),shape+' emits from its mesh');
    }
    const placement=scene('3d','cube');
    const model=placement.layers[0].nodes.find(n=>n.id==='o'),emitter=placement.layers[0].nodes.find(n=>n.id==='e');
    Object.assign(model.props,{size:72,stretchY:65,stretchZ:145,x:14,y:-8,turn:28,tilt:12,rotation:17});
    emitter.props.opts={pSpSpeed:0,pSpTrail:0};
    placement.layers[0].nodes.find(n=>n.id==='d').props.value=0;
    placement.layers[0].view={yaw:12,pit:9,px:.08,py:.04,zm:1.15};
    placement.layers[0].edges.splice(2,2,{from:'e',out:'shape',to:'out',input:'image'});
    placement.layers[0].edges.push({from:'d',out:'value',to:'o',input:'drive'});
    await page.evaluate(p=>{pro.importProject(p);pro.select('o');},placement);
    const modelMenu=inspector.getByRole('combobox',{name:'3D Object'});
    assert.equal(await modelMenu.locator('..').locator('.prop-label').textContent(),'3D Object');
    assert.equal(await inspector.locator('[data-property="render"]').first().locator('..').locator('.prop-label').textContent(),'Rendering');
    await page.evaluate(()=>pro.select(null));
    const footprint=(id,depth=false)=>page.evaluate(([id,depth])=>{
      const e=pro.engine(id),c=depth?e.w.__agScene.depth:e.canvas,d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      const box=[c.width,c.height,0,0];
      for(let i=0;i<d.length;i+=4)if(d[i+3]>15&&(depth||d[i]+d[i+1]+d[i+2]>36)){
        const x=i/4%c.width,y=Math.floor(i/4/c.width);
        box[0]=Math.min(box[0],x);box[1]=Math.min(box[1],y);box[2]=Math.max(box[2],x);box[3]=Math.max(box[3],y);
      }
      return box;
    },[id,depth]);
    const projectedSurface=()=>page.evaluate(()=>{
      const a=pro.engine('o').w.__agScene,c=a.camera,cy=Math.cos(c.yaw),sy=Math.sin(c.yaw),ct=Math.cos(c.tilt),st=Math.sin(c.tilt),f=c.f/Math.tan(.4);
      const {width,height}=a.placement(),box=[width,height,0,0];
      for(const [x,y,z] of a.surfaceMesh.verts){
        const qx=x*cy-z*sy,qz=x*sy+z*cy,d=c.distance-y*st-qz*ct;
        const u=(1+c.panX+qx*f/(c.aspect*d))*width/2,v=(1-c.panY-(y*ct-qz*st)*f/d)*height/2;
        box[0]=Math.min(box[0],u);box[1]=Math.min(box[1],v);box[2]=Math.max(box[2],u);box[3]=Math.max(box[3],v);
      }
      return box.map(Math.round);
    });
    let solid;
    for(const mode of ['normal','waveform','polygons']){
      await page.evaluate(mode=>{
        pro.setProperty('o','render',mode);
        pro.setProperty('o','opts',{pObjNoise:0,pObjGap:0,pObjElev:0});
        pro.engine('e')?.w?.agSim.reset();
      },mode);
      await page.waitForFunction(async mode=>{
        const o=pro.engine('o'),e=pro.engine('e'),cfg=e?.w?.__agParticles3d;
        if(!o?.frames||!(mode==='normal'?o.mode==='simcloner'&&cfg?.gpuSource:cfg?.source&&o.mode==='object'&&(o.w.objSignal==='poly')===(mode==='polygons')))return false;
        const data=await e.w.agSim.particleState();
        return (data?.filter((v,i)=>i%16===7&&v>0).length||0)>700;
      },mode,{timeout:20000});
      await page.waitForFunction(()=>{
        const c=pro.engine('o').canvas;
        return c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>15);
      });
      await page.waitForTimeout(450);
      const modelBox=mode==='waveform'?await projectedSurface():await footprint('o',true),particleBox=await footprint('e',true);
      assert.ok(modelBox[2]-modelBox[0]>100,`${mode}: visible model ${modelBox}`);
      if(mode==='waveform'){
        const lines=await footprint('o');
        assert.ok(lines[2]-lines[0]>100&&lines[0]>=modelBox[0]-3&&lines[1]>=modelBox[1]-3&&lines[2]<=modelBox[2]+3&&lines[3]<=modelBox[3]+3,
          `The drawn lines ${lines} stay on projected geometry ${modelBox}`);
      }
      if(!solid)solid=modelBox;
      assert.ok(modelBox.every((v,i)=>Math.abs(v-solid[i])<14),`${mode}: model footprint ${modelBox} matches ${solid}`);
      assert.ok(particleBox.every((v,i)=>Math.abs(v-modelBox[i])<22),`${mode}: emitted particles ${particleBox} match ${modelBox}`);
    }
    await load(scene('3d','model'));
    // An animated model supplies the current posed mesh rather than a screenshot.
    await page.evaluate(()=>pro.select('o'));
    await page.locator('#emitterMedia').setInputFiles(gltfFile());
    await page.waitForFunction(()=>pro.engine('o')?.anim,null,{timeout:20000});
    await page.waitForTimeout(200);
    const mesh1=await page.evaluate(()=>{const c=pro.engine('e').w.__agParticles3d.gpuSource.image;return Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data);});
    await page.waitForTimeout(500);
    const mesh2=await page.evaluate(()=>{const c=pro.engine('e').w.__agParticles3d.gpuSource.image;return Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data);});
    assert.ok(mesh1.some((v,i)=>v!==mesh2[i]),'Animated source surface updates');
    await page.evaluate(()=>{
      pro.select(null);
      pro.setProperty('o','animSpeed',0);
      pro.setProperty('o','render','points');
      pro.setProperty('o','x',12);
      pro.setProperty('c','tilt',18);
      pro.setProperty('c','zoom',55);
      pro.setProperty('e','opts',{pSpSpeed:0,pSpTrail:0});
      pro.setProperty('d','value',0);
      pro.engine('e').w.agSim.reset();
    });
    await page.waitForFunction(async()=>{
      const o=pro.engine('o'),w=pro.engine('e')?.w;
      if(o?.mode!=='simsplat'||!o.w.__agScene.matrix||!w?.__agParticles3d?.source)return false;
      return (await w.agSim.particleState())?.filter((v,i)=>i%16===7&&v>0).length>700;
    },null,{timeout:20000});
    await page.waitForTimeout(450);
    const cloudBox=await footprint('o'),cloudParticles=await footprint('e');
    assert.ok(cloudBox[2]-cloudBox[0]>50&&cloudParticles.every((v,i)=>Math.abs(v-cloudBox[i])<26),
      `Imported Point cloud ${cloudBox} emits from its visible surface ${cloudParticles}`);
    const clones=scene(),layer=clones.layers[0];
    layer.nodes.push({id:'clones',type:'cloner',x:220,y:180,props:{countX:2,countY:2,countZ:2}});
    layer.edges[1]={from:'clones',out:'shape',to:'e',input:'emit'};
    layer.edges.push({from:'o',out:'object',to:'clones',input:'object'});
    await load(clones);
    assert.ok(active(await state()).some(p=>Math.abs(p[2])>.1),'Cloner surfaces emit in 3D');
    const collisionScene=scene(),arena=collisionScene.layers[0];
    arena.nodes=arena.nodes.filter(n=>['d','e','out'].includes(n.id));
    const floor=(id,x,render)=>({id,type:'waveform3d',x:0,y:200,props:{mode:'cube',render,collide:true,size:120,stretchX:45,stretchY:10,x,y:14,opts:{pObjGap:0}}});
    arena.nodes.push(floor('left',-9,'normal'),floor('right',9,'polygons'),
      {id:'floorMix',type:'merge',x:350,y:200,props:{}},{id:'mix',type:'merge',x:540,y:200,props:{}});
    const emitterProps=arena.nodes.find(n=>n.id==='e').props;
    emitterProps.particleFloor=false;
    emitterProps.look={_sim:{pEmit:'ring'}};
    emitterProps.opts={pSpSpeed:0,pSpGravity:100,pSpTurb:0,pSpSwirl:0,pSpDrag:0,pSpTrail:0,pSimBass:0,pSimSwirlSnd:0,pSpLife:60};
    arena.edges=[arena.edges[0],{from:'left',out:'shape',to:'floorMix',input:'a'},{from:'right',out:'shape',to:'floorMix',input:'b'},
      {from:'floorMix',out:'image',to:'mix',input:'a'},{from:'e',out:'shape',to:'mix',input:'b'},{from:'mix',out:'image',to:'out',input:'image'}];
    await load(collisionScene);
    const collisionStats=()=>page.evaluate(async()=>{
      const parts=await pro.engine('e').w.agSim.particleState(),stats={left:0,right:0,down:0};
      for(let i=0;i<(parts?.length||0);i+=16)if(parts[i+8]>0){
        if(parts[i+5]>.07){if(parts[i]<-.1)stats.left++;if(parts[i]>.1)stats.right++;}
        if(parts[i+5]<-.15)stats.down++;
      }
      return stats;
    });
    const waitStats=async ok=>{
      for(let i=0;i<30;i++){const s=await collisionStats();if(ok(s))return s;await page.waitForTimeout(100);}
      return collisionStats();
    };
    const both=await waitStats(s=>s.left>10&&s.right>10&&s.down>10);
    assert.ok(both.left>10&&both.right>10&&both.down>10,`Gravity pulls down and both meshes bounce particles up: ${JSON.stringify(both)}`);
    await page.evaluate(()=>{pro.select('right');});
    await inspector.locator('[data-property="collide"]').getByRole('button',{name:'Off',exact:true}).click();
    await page.evaluate(()=>pro.engine('e').w.agSim.reset());
    const one=await waitStats(s=>s.left>10&&s.right===0);
    assert.ok(one.left>10&&one.right===0,`Turning off one collider leaves the other active: ${JSON.stringify(one)}`);
    const floorScene=structuredClone(collisionScene),floorLayer=floorScene.layers[0];
    floorLayer.nodes=floorLayer.nodes.filter(n=>['d','e','out'].includes(n.id));
    floorLayer.edges=[floorLayer.edges[0],{from:'e',out:'shape',to:'out',input:'image'}];
    const floorProps=floorLayer.nodes.find(n=>n.id==='e').props;
    Object.assign(floorProps,{particleFloor:true,particleFloorSize:40,particleDepth:4,look:{_sim:{pEmit:'fountain'}}});
    await load(floorScene);
    const floorStats=()=>page.evaluate(async()=>{
      const pts=await pro.engine('e').w.agSim.particleState(),s={bounce:0,below:0,insideBelow:0,outsideBounce:0,nearX:0,nearZ:0};
      for(let i=0;i<(pts?.length||0);i+=16)if(pts[i+8]>0){
        const x=Math.abs(pts[i]),z=Math.abs(pts[i+2]),r=Math.max(x,z),inside=r<.79;
        if(pts[i+1]<-1.05){s.below++;if(inside)s.insideBelow++;}
        if(pts[i+5]>.08){s.bounce++;if(r>.81)s.outsideBounce++;if(x>.6)s.nearX++;if(z>.6)s.nearZ++;}
      }
      return s;
    });
    const waitFloor=async ok=>{
      for(let i=0;i<30;i++){const s=await floorStats();if(ok(s))return s;await page.waitForTimeout(100);}
      return floorStats();
    };
    const small=await waitFloor(s=>s.nearX>5&&s.nearZ>5&&s.below>100);
    assert.ok(small.nearX>5&&small.nearZ>5&&small.below>100&&small.insideBelow===0&&small.outsideBounce===0,
      `The finite floor catches particles equally along X and Z: ${JSON.stringify(small)}`);
    await page.evaluate(()=>{pro.setProperty('e','particleFloorSize',100);pro.engine('e').w.agSim.reset();});
    const large=await waitFloor(s=>s.outsideBounce>100);
    assert.ok(large.outsideBounce>100,'Increasing Floor Size catches particles beyond the previous edges');
    await page.evaluate(()=>pro.select('e'));
    await floorSection.locator('button.insp-fold-head').click();
    await floorSection.locator('[data-property="particleFloor"]').getByRole('button',{name:'Off',exact:true}).click();
    await page.evaluate(()=>pro.engine('e').w.agSim.reset());
    const off=await waitFloor(s=>s.insideBelow>100);
    assert.ok(off.insideBelow>100&&off.bounce===0,'Disabling Floor lets particles fall straight through');
    assert.deepEqual(await page.evaluate(()=>pro.stats().errors),[]);
    assert.deepEqual(await page.evaluate(()=>pro.engine('e').w.agSim.stats().errors),[]);
    assert.deepEqual(errors,[]);
    console.log('3D particle acceptance passed');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
