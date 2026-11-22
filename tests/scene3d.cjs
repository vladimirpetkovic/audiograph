const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),fixture=require('./pbr-fixture.cjs');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+url.pathname+(url.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(file));
});
const scene={format:'audiograph-pro',version:10,layers:[{id:'L',name:'Shared space',visible:true,opacity:1,blend:'source-over',nodes:[
  {id:'o',type:'waveform3d',x:0,y:0,props:{mode:'model',render:'normal'}},
  {id:'s',type:'waveform3d',x:0,y:160,props:{mode:'model',render:'normal'}},
  {id:'d',type:'value',x:0,y:320,props:{value:0}},{id:'ds',type:'value',x:0,y:400,props:{value:0}},
  ...['co','cs'].map((id,i)=>({id,type:'camera3d',x:200,y:i*160,props:{orbit:0,turn:0,tilt:0,zoom:100,dof:0}})),
  {id:'e',type:'gpuParticles',x:400,y:160,props:{mode:'simparticles',space:'3d',particleInitialSpeed:0,particleTrails:false,particleSpread:0,opts:{pSpTrail:0}}},
  {id:'m',type:'merge',x:620,y:0,props:{}},{id:'out',type:'output',x:800,y:0,props:{}}],edges:[
  ...['o','s'].map(to=>({from:'ds',out:'value',to,input:'drive'})),{from:'d',out:'value',to:'e',input:'drive'},
  {from:'o',out:'shape',to:'co',input:'shape'},{from:'s',out:'shape',to:'cs',input:'shape'},
  {from:'co',out:'shape',to:'e',input:'emit'},{from:'co',out:'shape',to:'m',input:'a'},
  {from:'e',out:'shape',to:'m',input:'b'},{from:'m',out:'image',to:'out',input:'image'}]}]};
(async()=>{
  const {surfaceRoutes,routeSample}=await import('../pro/scene3d.js');
  const routes=surfaceRoutes([[0,1,2],[1,0,3],[4,5,6]],[{triangle:0,weights:[.2,.3,.5]},{triangle:2,weights:[.3,.3,.4]}]);
  assert.equal(routeSample(routes,0,.5).triangle,0);
  assert.equal(routeSample(routes,0,1.5).triangle,1,'Route crosses a shared edge');
  const before=routeSample(routes,0,1-1e-5).weights,after=routeSample(routes,0,1).weights;
  assert.ok(Math.abs(before[0]-after[1])<1e-5&&Math.abs(before[1]-after[0])<1e-5,'Edge crossing preserves the actual world point');
  for(let t=0;t<16;t+=.1){
    const {triangle,weights}=routeSample(routes,1,t);
    assert.equal(triangle,2,'Route does not jump to disconnected triangles');
    assert.ok(weights.every(w=>w>=0)&&Math.abs(weights.reduce((a,b)=>a+b)-1)<1e-6);
  }
  let browser;await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args:['--ignore-gpu-blocklist','--enable-gpu-rasterization']});
    const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto((process.env.AUDIOGRAPH_PRO_URL||`http://127.0.0.1:${server.address().port}/pro/`)+'?demo');
    await page.waitForFunction(()=>window.pro);await page.evaluate(()=>pro.dissolve(false));
    await page.evaluate(scene=>pro.importProject(scene),scene);
    const wait=async(ms=350)=>{await page.waitForTimeout(ms);assert.deepEqual(await page.evaluate(()=>pro.stats().errors),[]);};
    const load=async(id,options={})=>{
      await page.evaluate(id=>pro.select(id),id);
      await page.locator('#emitterMedia').setInputFiles({...fixture.glb(options),name:id+'.glb'});
      await page.waitForFunction(id=>pro.engine(id)?.mediaName===id+'.glb',id,{timeout:20000});await wait();
    };
    await load('o');await load('s');
    try{await page.waitForFunction(()=>pro.engine('e')?.w?.agSim.status()==='ready'&&pro.engine('e')?.w?.__agParticles3d?.gpuSource,null,{timeout:45000});}
    catch(error){console.error('Surface initialization',await page.evaluate(()=>Object.fromEntries(['o','s','e'].map(id=>{const e=pro.engine(id);return [id,{status:e?.status,stats:e?.w?.agSim.stats(),source:e?.w?.__agScene.sourceValid,cfg:!!e?.w?.__agParticles3d?.gpuSource}];}))),errors);throw error;}
    const state=()=>page.evaluate(async()=>{
      const data=await pro.engine('e').w.agSim.particleState();let alive=0,held=0,moving=0,maxSpeed=0,minZ=Infinity,maxZ=-Infinity;
      for(let i=0;i<data.length;i+=16)if(data[i+8]>0){alive++;if(data[i+7]>0)held++;const speed=Math.hypot(...data.slice(i+4,i+7));
        if(speed>.001)moving++;maxSpeed=Math.max(maxSpeed,speed);minZ=Math.min(minZ,data[i+2]);maxZ=Math.max(maxZ,data[i+2]);}
      return {alive,held,moving,maxSpeed,minZ,maxZ};
    });
    const pixels=id=>page.evaluate(id=>{
      const c=pro.engine(id).canvas,d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let energy=0,filled=0,edge=0;
      const signature=[];for(let i=0;i<d.length;i+=4){energy+=(d[i]+d[i+1]+d[i+2])*d[i+3]/255;if(d[i+3]>20&&Math.max(...d.subarray(i,i+3))>20)filled++;
        if(i>=4&&i%(c.width*4)!==0)edge+=(d[i+3]-d[i-1])**2;if(i%128===0)signature.push(...d.subarray(i,i+4));}
      return {energy,filled,edge,signature};
    },id);
    const held=await state();console.log('Surface hold',held);
    assert.ok(held.alive>100&&held.held===held.alive&&held.maxSpeed<.0001&&Math.abs(held.maxZ)<.0001,'Zero launch follows the actual camera.shape mesh and stays still in silence');
    assert.equal(await page.evaluate(()=>pro.engine('e').w.__agParticles3d.gpuSource.image.width),2048,'Native mesh emission is a GPU surface source, not an image plane');
    const positions=()=>page.evaluate(async()=>Array.from(await pro.engine('e').w.agSim.particleState()));
    const changedPositions=(a,b)=>{let moved=0;for(let i=0;i<a.length;i+=16)if(a[i+8]>0&&b[i+8]>0&&a[i+11]===b[i+11]&&Math.hypot(a[i]-b[i],a[i+1]-b[i+1],a[i+2]-b[i+2])>.003)moved++;return moved;};
    const flow=async()=>{
      const a=await positions();await wait(220);const b=await positions(),s=await state();
      assert.ok(s.alive>100&&s.held===s.alive&&s.moving===0&&changedPositions(a,b)>100,'Particles travel while attached: '+JSON.stringify(s));
      return s;
    };
    await page.evaluate(()=>{pro.select('e');pro.setProperty('e','particleInitialSpeed',100);});
    const inspector=page.getByRole('complementary',{name:'Properties'});
    assert.equal(await inspector.getByText('Surface flow',{exact:true}).count(),1);
    await inspector.locator('[data-property="particleSurfaceFlow"]').getByRole('button',{name:'On',exact:true}).click();
    await wait();
    const planar=await flow();
    assert.ok(Math.abs(planar.minZ)<.0001&&Math.abs(planar.maxZ)<.0001,'Flow cannot leave the source plane');
    await page.evaluate(()=>pro.engine('e').w.agSim.reset());
    await page.evaluate(scene=>{scene.layers[0].edges.find(e=>e.to==='e'&&e.input==='emit').from='cs';pro.importProject(scene);},scene);
    const shift=async z=>{
      await page.evaluate(z=>{
        const e=pro.engine('s'),mesh=e.w.objModelData;
        for(const p of mesh.verts)p[2]=z;e.w.__agG3MeshVer=(e.w.__agG3MeshVer||0)+1;e.surfaceCache={};
      },z);await wait(500);
    };
    await shift(-.8);const far=await pixels('e'),farState=await state();console.log('Behind opaque object',far.energy,farState);
    assert.ok(farState.maxZ<-.3&&far.energy===0,'Particles behind a solid disappear per fragment');
    await shift(.8);const near=await pixels('e'),nearState=await state();
    assert.ok(nearState.minZ>.3&&near.energy>10000,'Particles in front remain visible');
    await page.evaluate(()=>{const p=pro.getProject();for(const e of p.layers[0].edges)if(e.to==='m')e.input=e.input==='a'?'b':'a';pro.importProject(p);});
    await wait();assert.ok((await pixels('e')).energy>near.energy*.8,'Reversing Merge inputs does not hide front particles');
    await shift(-.8);await load('o',{mask:true});const cutout=await pixels('e');
    assert.ok(cutout.energy>1000,'Masked material holes reveal particles behind the mesh');
    await load('o',{blend:true});assert.ok((await pixels('e')).energy>cutout.energy,'Transparent materials do not become opaque particle blockers');
    await shift(.8);await load('o');
    await page.evaluate(()=>pro.engine('e').w.agSim.reset());await wait(350);
    assert.ok((await state()).held>100,'The stationary surface has particles before the sound arrives');
    await page.evaluate(()=>pro.setProperty('d','value',1));await wait(150);
    const sounding=await state();assert.ok(sounding.moving>100,'Sound-only mode releases particles from a stationary surface: '+JSON.stringify(sounding));
    await page.evaluate(()=>{pro.setProperty('e','particleResponse','motion');pro.setProperty('d','value',1);pro.engine('e').w.agSim.reset();});await wait(450);
    const motionSilent=await state();assert.ok(motionSilent.alive>100&&motionSilent.moving===0,'Motion-only mode ignores particle audio while its surface is stationary');
    await page.evaluate(()=>{pro.setProperty('d','value',0);pro.setProperty('s','turn',30);});await wait(100);
    const rotated=await state();console.log('Rotation release',rotated);
    assert.ok(rotated.moving>100,'Rendered object rotation releases particles with inherited surface velocity');
    await page.evaluate(()=>{pro.pause(true);pro.engine('e').w.agSim.expMode(true);pro.setProperty('e','particleTrails',true);});await wait(100);
    const streak=await pixels('e'),frozen=await state();
    await page.evaluate(()=>pro.setProperty('e','particleTrails',false));await wait(100);
    const round=await pixels('e');
    assert.ok(streak.signature.filter((v,i)=>Math.abs(v-round.signature[i])>8).length>50,'Trails-off removes even the one-step velocity stretch');
    assert.deepEqual(await state(),frozen,'Occlusion replay and rendering-only changes do not advance particle state');
    await page.evaluate(()=>{pro.setProperty('cs','dof',100);pro.setProperty('cs','focus',0);});await wait(100);
    const blur=await pixels('e');
    assert.ok(blur.filled>round.filled&&blur.edge<round.edge,'Particle depth of field broadens and softens sprites');
    await page.evaluate(()=>{pro.engine('e').w.agSim.expMode(false);pro.pause(false);pro.setProperty('e','particleResponse','both');pro.setProperty('d','value',1);});await wait(200);
    assert.ok((await state()).moving>100,'Combined sound and motion mode releases particles');
    const poly=JSON.parse(JSON.stringify(scene));
    poly.layers[0].nodes.find(n=>n.id==='s').props.render='polygons';
    poly.layers[0].nodes.find(n=>n.id==='e').props.particleResponse='motion';
    poly.layers[0].edges.find(e=>e.to==='e'&&e.input==='emit').from='cs';
    await page.evaluate(p=>pro.importProject(p),poly);await load('s');
    await page.evaluate(()=>pro.engine('e').w.agSim.reset());await wait(700);
    assert.ok(await page.evaluate(()=>pro.engine('s').w.__agScene.surfaceMesh?.world),'Polygon emission uses actual projected/deformed faces');
    assert.ok((await state()).held>100,'Zero-speed particles also stay on Polygon surfaces');
    await page.evaluate(()=>pro.setProperty('s','turn',20));await wait(100);
    assert.ok((await state()).moving>100,'Polygon motion releases attached particles');
    await page.evaluate(()=>pro.setProperty('e','particleSurfaceFlow',true));await wait();
    await flow();
    const nested=JSON.parse(JSON.stringify(scene)),g=nested.layers[0];
    g.edges.find(e=>e.to==='e'&&e.input==='emit').from='cs';
    g.nodes.find(n=>n.id==='m').props.mode='screen';
    g.nodes.push({id:'bg',type:'background',x:300,y:400,props:{}},{id:'m2',type:'merge',x:700,y:0,props:{}});
    g.edges=g.edges.filter(e=>e.to!=='m'&&e.to!=='out');
    g.edges.push({from:'e',out:'shape',to:'m',input:'a'},{from:'bg',out:'image',to:'m',input:'b'},
      {from:'m',out:'image',to:'m2',input:'a'},{from:'co',out:'shape',to:'m2',input:'b'},{from:'m2',out:'image',to:'out',input:'image'});
    await page.evaluate(p=>pro.importProject(p),nested);await shift(-.8);await page.evaluate(()=>pro.engine('e').w.agSim.reset());await wait(450);
    assert.equal((await pixels('e')).energy,0,'Nested Screen/Normal merges preserve particle roots through 2D inputs');
    const layers=JSON.parse(JSON.stringify(scene)),base=layers.layers[0];
    const bodyNodes=base.nodes.filter(n=>['o','co'].includes(n.id));
    base.nodes=base.nodes.filter(n=>!['o','co','m'].includes(n.id));
    base.edges=base.edges.filter(e=>!['o','co','m','out'].includes(e.to)&&!['o','co','m'].includes(e.from));
    base.edges.push({from:'cs',out:'shape',to:'e',input:'emit'},{from:'e',out:'shape',to:'out',input:'image'});
    layers.layers.push({id:'B',name:'Body',visible:true,opacity:1,blend:'source-over',nodes:[...bodyNodes,
      {id:'db',type:'value',x:0,y:200,props:{value:0}},{id:'ob',type:'output',x:400,y:0,props:{}}],
      edges:[{from:'db',out:'value',to:'o',input:'drive'},{from:'o',out:'shape',to:'co',input:'shape'},{from:'co',out:'shape',to:'ob',input:'image'}]});
    await page.evaluate(p=>pro.importProject(p),layers);await wait(500);
    assert.equal((await pixels('e')).energy,0,'Separate project layers share opaque geometry depth');
    await page.evaluate(()=>{const p=pro.getProject();p.layers.reverse();pro.importProject(p);});await wait();
    assert.equal((await pixels('e')).energy,0,'Layer order does not reveal particles behind geometry');
    await page.selectOption('#resolution','720');await wait(600);
    assert.equal((await pixels('e')).energy,0,'Occlusion survives compositor/renderer resizing');
    await page.selectOption('#resolution','540');await wait(400);
    await page.evaluate(()=>{const p=pro.getProject();p.layers.find(l=>l.id==='B').opacity=.5;pro.importProject(p);});await wait();
    assert.ok((await pixels('e')).energy>10000,'A translucent project layer is not an opaque blocker');
    const clones=JSON.parse(JSON.stringify(scene)),cg=clones.layers[0];
    cg.nodes=cg.nodes.filter(n=>['d','ds','e','cs','out'].includes(n.id));
    cg.nodes.push({id:'cl',type:'cloner',x:0,y:0,props:{countX:2,countY:1,countZ:2,spacingZ:100}},
      {id:'cube',type:'waveform3d',x:0,y:160,props:{mode:'cube',size:20}},
      {id:'cone',type:'waveform3d',x:0,y:320,props:{mode:'cone',size:20}});
    cg.edges=[{from:'cube',out:'object',to:'cl',input:'object'},{from:'cone',out:'object',to:'cl',input:'object2'},
      {from:'ds',out:'value',to:'cl',input:'drive'},{from:'d',out:'value',to:'e',input:'drive'},
      {from:'cl',out:'shape',to:'cs',input:'shape'},{from:'cs',out:'shape',to:'e',input:'emit'},{from:'e',out:'shape',to:'out',input:'image'}];
    await page.evaluate(p=>pro.importProject(p),clones);
    await page.waitForFunction(()=>pro.engine('e')?.w?.__agParticles3d?.gpuSource?.key.startsWith('cl:'),null,{timeout:45000});
    await page.evaluate(()=>pro.engine('e').w.agSim.reset());await wait(500);
    const cloned=await state();assert.ok(cloned.held>100&&cloned.maxZ-cloned.minZ>.25,'Cloner emits from actual transformed instances at different Z positions');
    await page.evaluate(()=>pro.setProperty('e','particleSurfaceFlow',true));await wait();
    assert.ok((await flow()).maxZ-(await state()).minZ>.25,'Surface flow follows separate transformed clone instances');
    assert.deepEqual(errors,[]);
    for(const id of ['cl','e'])assert.deepEqual(await page.evaluate(id=>pro.engine(id).w.agSim.stats().errors,id),[]);
    console.log('Shared 3D depth, native/Polygon surface motion, launch controls, trails and particle DOF passed');
  }catch(error){console.error(error);process.exitCode=1;}
  finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})();
