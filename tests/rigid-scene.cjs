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
    assert.equal(await panel.getByLabel('Ground enabled',{exact:true}).inputValue(),'true');
    await panel.getByLabel('Ground enabled',{exact:true}).selectOption('false');
    assert.equal(await page.evaluate(()=>pro.getProject().settings.ground.enabled),false);
    assert.equal(await page.evaluate(()=>pro.stats().rigid.ground),false);
    await page.evaluate(()=>pro.undo());
    assert.equal(await page.evaluate(()=>pro.getProject().settings.ground.enabled),true);
    await page.evaluate(()=>{pro.selectLayer('Clones');pro.select('clones');});
    if(await page.locator('.insp-fold[data-group="Rigid body"]').evaluate(e=>e.classList.contains('closed')))
      await page.locator('.insp-fold[data-group="Rigid body"] .insp-fold-head').click();
    assert.ok(await page.locator('[data-property="rigidBody"]').isVisible(),'Cloner exposes its rigid-body toggle');
    await page.evaluate(()=>{pro.setProperty('clones','rigidBody',false);pro.draw();});
    assert.equal(await page.evaluate(()=>pro.stats().rigid.bodies),1,'Disabling a cloner removes only its instances');
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
