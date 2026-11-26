const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),mime={'.js':'text/javascript','.html':'text/html','.css':'text/css'};
const server=http.createServer((req,res)=>{
  let file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!fs.existsSync(file)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
});
const node=(id,type,props={})=>({id,type,x:0,y:0,props});
const layer=(id,nodes,source)=>({id,name:id,visible:true,opacity:1,blend:'source-over',
  nodes:[...nodes,node(id+'Out','output')],edges:[{from:source,out:'shape',to:id+'Out',input:'image'}]});
const scene={format:'audiograph-pro',version:16,settings:{ground:{enabled:true,visible:true,height:-1.2,size:20}},layers:[
  layer('Object',[node('object','waveform3d',{mode:'cube',render:'normal',rigidBody:true,bodyGravity:9.81})],'object'),
  layer('Clones',[node('clones','cloner',{rigidBody:true,countX:2,countY:1,countZ:1,spacingX:60,bodyGravity:9.81})],'clones')
]};
(async()=>{
  let browser;await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless:true,args:['--ignore-gpu-blocklist']});
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/pro/?demo`);await page.waitForFunction(()=>window.pro);
    await page.evaluate(p=>{pro.dissolve(false);pro.importProject(p);},{
      format:'audiograph-pro',version:21,settings:{ground:{enabled:false,visible:false}},
      layers:[{...layer('Passive',[
        node('sphere','waveform3d',{mode:'sphere',render:'normal',detail:4}),
        node('passive','cloner',{collide:true,rigidBody:false,countX:6,countY:3,countZ:1,spacingX:20,spacingY:20,moveY:0})
      ],'passive'),edges:[
        {from:'sphere',out:'object',to:'passive',input:'object'},
        {from:'passive',out:'shape',to:'PassiveOut',input:'image'}
      ]}]
    });
    await page.waitForFunction(()=>pro.engine('passive')?.w?.agSim.stats().status==='ready');
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(()=>pro.stats().rigid.bodies),0,'Collider-only clones never create rigid bodies or self-collide');
    assert.equal(await page.evaluate(()=>pro.engine('passive').w.__agScene.nativeCollider),null,'Sphere collision meshes are not read back without a consuming simulation');
    assert.ok(await page.evaluate(()=>pro.pixels()>0),'Overlapping passive clones stay visible');
    await page.evaluate(()=>{
      const api=pro.engine('passive').w.__agScene,original=api.colliderMesh;
      window.passiveReadbacks=0;api.colliderMesh=function(...args){window.passiveReadbacks++;return original.apply(this,args);};
    });
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(()=>window.passiveReadbacks),0,'Passive sphere Cloners skip per-frame CPU collision work');
    await page.evaluate(scene=>{pro.dissolve(false);pro.importProject(scene);},scene);
    await page.waitForFunction(()=>pro.stats().rigid.bodies===3,{},{timeout:30000});
    await page.waitForFunction(()=>pro.stats().rigid.steps>20);
    assert.deepEqual(await page.evaluate(()=>pro.stats().rigid.groups.map(g=>[g.id,g.count]).sort()),[['clones',2],['object',1]]);
    assert.ok(await page.evaluate(()=>pro.stats().rigid.groups.every(g=>g.positions.every(p=>p.every(Number.isFinite)))));
    assert.ok(await page.evaluate(()=>pro.pixels()>0),'Physical objects remain visible: '+JSON.stringify(await page.evaluate(()=>pro.stats())));
    assert.deepEqual(await page.evaluate(()=>Object.values(pro.stats().engines).flatMap(e=>e.sim?.errors||[])),[],'Physics uploads and shared ground have no GPU validation errors');
    await page.evaluate(()=>pro.pause(true));
    const positions=await page.evaluate(()=>pro.stats().rigid.groups.map(g=>g.positions));
    await page.evaluate(()=>{pro.draw();pro.draw();});
    assert.deepEqual(await page.evaluate(()=>pro.stats().rigid.groups.map(g=>g.positions)),positions,'Paused redraws preserve physical poses');
    await page.getByRole('button',{name:'Scene settings',exact:true}).click();
    const panel=page.locator('.scene-inspector');
    assert.equal(await panel.getByLabel('Ground enabled',{exact:true}).getByRole('button',{name:'On',exact:true}).getAttribute('aria-pressed'),'true');
    await panel.getByLabel('Ground enabled',{exact:true}).getByRole('button',{name:'Off',exact:true}).click();
    assert.equal(await page.evaluate(()=>pro.getProject().settings.ground.enabled),false);
    assert.equal(await page.evaluate(()=>pro.stats().rigid.ground),false);
    await page.evaluate(()=>pro.undo());
    assert.equal(await page.evaluate(()=>pro.getProject().settings.ground.enabled),true);
    await page.evaluate(()=>{pro.selectLayer('Clones');pro.select('clones');});
    if(await page.locator('.insp-fold[data-group="Rigid body"]').evaluate(e=>e.classList.contains('closed')))
      await page.locator('.insp-fold[data-group="Rigid body"] .insp-fold-head').click();
    assert.ok(await page.locator('[data-property="rigidBody"]').isVisible(),'Cloner exposes its rigid-body toggle');
    await page.evaluate(()=>{pro.setProperty('clones','rigidBody',false);pro.draw();});
    assert.equal(await page.evaluate(()=>pro.stats().rigid.bodies),3,'Connected Gravity remains active when the Cloner Rigid body toggle is off');
    await page.evaluate(()=>{
      const p=pro.getProject();p.layers[1].nodes.find(n=>n.id==='clones').bypass=true;pro.importProject(p);
    });
    await page.waitForFunction(()=>pro.stats().rigid.bodies===1);
    await page.evaluate(scene=>{scene.layers=scene.layers.slice(0,1);scene.layers[0].nodes[0].props.render='waveform';pro.importProject(scene);pro.pause(false);},scene);
    await page.waitForFunction(()=>pro.stats().rigid.bodies===1);
    await page.waitForFunction(()=>pro.stats().rigid.groups[0].positions[0][1]<-.1);
    assert.ok(await page.evaluate(()=>pro.pixels()>0),'Waveform-rendered objects also remain visible with physics');
    assert.deepEqual(await page.evaluate(()=>pro.stats().errors),[]);
    await page.evaluate(scene=>pro.importProject(scene),{
      format:'audiograph-pro',version:16,settings:{camera:{},ground:{enabled:true,visible:true,height:-.6,size:20}},
      layers:[layer('Particles',[node('particles','gpuParticles',{mode:'simparticles'})],'particles')]
    });
    await page.waitForFunction(()=>pro.engine('particles')?.w?.__agParticles3d?.floorHeight===-.6);
    await page.waitForFunction(()=>pro.engine('__ground')&&pro.engine('__ground').stats().status!=='starting');
    assert.equal(await page.evaluate(()=>pro.engine('particles').w.__agParticles3d.floorHalf),10,'Particle-only scenes use the shared ground size');
    assert.deepEqual(await page.evaluate(()=>Object.values(pro.stats().engines).flatMap(e=>e.sim?.errors||[])),[]);
    await page.evaluate(()=>{const scene=pro.getProject();scene.settings.ground.visible=false;pro.importProject(scene);pro.draw();});
    assert.equal(await page.evaluate(()=>!!pro.engine('__ground')),false,'Collision-only ground does not draw a floor');
    await page.evaluate(p=>pro.importProject(p),{
      format:'audiograph-pro',version:20,settings:{ground:{enabled:false,visible:false}},
      layers:[{...layer('Effects',[
        node('shape','waveform3d',{mode:'cube',render:'normal',size:60}),
        node('colliders','cloner',{collide:true,rigidBody:false,countX:2,countY:1,countZ:1,spacingX:220,moveY:1,collisionShape:'box',bounce:1,damping:0}),
        node('random','randomEffector',{size:0,scaleX:0,height:0,scaleZ:0,seed:5}),
        node('field','fieldEffector',{strength:0}),
        node('force','gravity',{rigid:0})
      ],'force'),edges:[
        {from:'shape',out:'object',to:'colliders',input:'object'},
        {from:'colliders',out:'shape',to:'random',input:'shape'},
        {from:'random',out:'shape',to:'field',input:'shape'},
        {from:'field',out:'shape',to:'force',input:'shape'},
        {from:'force',out:'shape',to:'EffectsOut',input:'image'}
      ]}]
    });
    await page.evaluate(()=>pro.pause(false));
    await page.waitForFunction(()=>pro.stats().rigid.bodies===2);
    const initialBodies=await page.evaluate(()=>pro.stats().rigid.groups[0].positions);
    await page.waitForTimeout(500);
    assert.deepEqual(await page.evaluate(()=>pro.stats().rigid.groups[0].positions),initialBodies,'Zero connected Gravity leaves clones stationary');
    await page.evaluate(()=>pro.setProperty('random','scaleX',100));
    await page.waitForFunction(()=>{
      const group=pro.engine('colliders').w.__agScene.rigidConfig.world.groups.get('colliders');
      return group?.effectU[1260]===1;
    });
    assert.ok(await page.evaluate(positions=>pro.stats().rigid.groups[0].positions.every((p,i)=>p.every((v,j)=>Math.abs(v-positions[i][j])<.0001)),initialBodies),'Gravity-only clones do not separate when an effector changes scale');
    await page.evaluate(()=>pro.setProperty('colliders','rigidBody',true));
    await page.waitForFunction(()=>{
      const g=pro.engine('colliders').w.__agScene.rigidConfig.world.groups.get('colliders'),[a,b]=g.bodies;
      return Math.abs(a.position.x-b.position.x)>=a.shapes[0].halfExtents.x+b.shapes[0].halfExtents.x-.01;
    });
    await page.evaluate(()=>pro.setProperty('force','rigid',9.81));
    await page.waitForFunction(()=>pro.stats().rigid.groups[0].positions.every(p=>p[1]<0));
    await page.evaluate(()=>pro.setProperty('colliders','rigidBody',false));
    assert.equal(await page.evaluate(()=>pro.stats().rigid.bodies),2,'Attached Gravity does not require the Cloner Rigid body toggle');
    await page.evaluate(()=>pro.setProperty('colliders','rigidBody',true));
    assert.deepEqual(await page.evaluate(()=>pro.stats().rigid.errors),[],'Live effector readbacks have no validation errors');
    await page.evaluate(()=>pro.pause(true));
    const pausedSteps=await page.evaluate(()=>pro.stats().rigid.steps);
    await page.evaluate(()=>{pro.setProperty('random','posX',100);pro.setProperty('field','strength',100);});
    await page.waitForFunction(()=>{
      const g=pro.engine('colliders').w.__agScene.rigidConfig.world.groups.get('colliders');
      return g.effectU[72]===1&&g.effectU[197]===1;
    });
    await page.waitForTimeout(150);
    const pausedFrames=await page.evaluate(()=>pro.engine('colliders').frames);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(()=>pro.engine('colliders').frames),pausedFrames,'Animated effector edits do not cause a paused redraw loop');
    assert.equal(await page.evaluate(()=>pro.stats().rigid.steps),pausedSteps,'Readback refreshes do not advance paused physics');
    await page.evaluate(()=>{pro.setProperty('colliders','rigidBody',false);pro.setProperty('colliders','collide',false);});
    assert.equal(await page.evaluate(()=>pro.stats().rigid.bodies),2,'Attached Gravity also activates Cloners without Collider body');
    await page.evaluate(()=>pro.setProperty('force','rigid',0));
    const driftY=await page.evaluate(()=>pro.stats().rigid.groups[0].positions[0][1]);
    await page.evaluate(()=>pro.pause(false));
    await page.waitForFunction(y=>pro.stats().rigid.groups[0]?.positions[0][1]<y-.1,driftY);
    assert.equal(await page.evaluate(()=>pro.stats().rigid.bodies),2,'Zero Gravity preserves existing Cloner bodies and momentum');
    await page.evaluate(p=>pro.importProject(p),{
      format:'audiograph-pro',version:21,settings:{gravity:9.81,ground:{enabled:true,visible:true,height:0,size:20}},
      layers:[{...layer('Automatic',[
        node('automatic','cloner',{countX:2,countY:1,countZ:1,moveY:2,rigidBody:false,collide:false}),
        node('nodeGravity','gravity')
      ],'automatic'),edges:[
        {from:'automatic',out:'shape',to:'AutomaticOut',input:'image'}
      ]},layer('AutomaticObject',[
        node('automaticObject','waveform3d',{mode:'cube',render:'normal',moveX:3,moveY:2,rigidBody:false,collide:false}),
        node('objectGravity','gravity')
      ],'automaticObject')]
    });
    assert.equal(await page.evaluate(()=>pro.stats().rigid.bodies),0,'An unattached Gravity node and legacy Scene gravity do not affect a Cloner');
    assert.equal(await page.evaluate(()=>pro.getProject().settings.gravity),undefined,'Legacy Scene gravity is removed from saved settings');
    await page.evaluate(()=>{
      const p=pro.getProject();p.layers[0].edges=[
        {from:'automatic',out:'shape',to:'nodeGravity',input:'shape'},
        {from:'nodeGravity',out:'shape',to:'AutomaticOut',input:'image'}
      ];p.layers[1].edges=[
        {from:'automaticObject',out:'shape',to:'objectGravity',input:'shape'},
        {from:'objectGravity',out:'shape',to:'AutomaticObjectOut',input:'image'}
      ];pro.importProject(p);
    });
    await page.waitForFunction(()=>pro.stats().rigid.bodies===3&&pro.stats().rigid.groups.every(g=>g.positions.every(p=>p[1]<1.5)));
    await page.waitForFunction(()=>pro.stats().rigid.contacts>0);
    assert.ok(await page.evaluate(()=>pro.stats().rigid.groups.every(g=>g.positions.every(p=>p[1]>0))),'The shared ground catches Gravity-driven Cloners and Objects');
    assert.equal(await page.evaluate(()=>pro.getProject().layers[0].nodes.find(n=>n.id==='automatic').props.rigidBody),false);
    await page.evaluate(()=>{
      const p=pro.getProject();p.layers[1].nodes.find(n=>n.id==='automaticObject').props.render='waveform';pro.importProject(p);
    });
    await page.waitForFunction(()=>pro.stats().rigid.bodies===3&&pro.stats().rigid.groups.find(g=>g.id==='automaticObject')?.positions[0][1]<1.5);
    assert.equal(await page.evaluate(()=>pro.getProject().layers[1].nodes.find(n=>n.id==='automaticObject').props.rigidBody),false,'Gravity also works on waveform-rendered Objects without Rigid body');
    for(const [name,count] of [['HUD',3],['Propane',1],['Waterfall',2]]){
      await page.evaluate(name=>pro.loadTemplate(name),name);
      const project=await page.evaluate(()=>pro.getProject());
      assert.equal(project.layers.length,count,name+' is a built-in template with all supplied layers');
      assert.equal(await page.evaluate(()=>pro.stats().rigid.bodies),0,'Loading a template clears old physical bodies');
      await page.waitForFunction(()=>Object.values(pro.stats().engines).every(e=>e.status!=='starting'));
      assert.deepEqual(await page.evaluate(()=>pro.stats().errors),[],name+' renders without node errors');
    }
    assert.deepEqual(errors,[]);
    console.log('ok - Rendered shared object/cloner physics, pause, scene ground, inspector, waveform physics and supplied templates');
  }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
