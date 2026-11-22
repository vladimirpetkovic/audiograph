const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+name+(name.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css'})[path.extname(file)]||'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
const n=(id,type,x,y,props={})=>({id,type,x,y,props});
const edge=(from,out,to,input)=>({from,out,to,input});
(async()=>{
  const {VERSION,SCENE_CAMERA}=await import('../pro/graph.js');
  const scene=(nodes,edges)=>({format:'audiograph-pro',version:VERSION,settings:{camera:SCENE_CAMERA,resolution:540,performance:{simulation:'low',fps:24}},
    layers:[{id:'L',name:'Test',visible:true,opacity:1,blend:'source-over',nodes,edges}]});
  let browser;
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args:['--ignore-gpu-blocklist','--enable-gpu-rasterization']});
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',msg=>{if(msg.type()==='error'&&/fluid|shader|invalid|binding/i.test(msg.text()))console.log(msg.text());});
    await page.goto(`http://127.0.0.1:${server.address().port}/pro/?demo`);
    await page.waitForFunction(()=>window.pro);
    const load=project=>page.evaluate(p=>{pro.dissolve(false);pro.importProject(p);},project);
    const nodes=[n('sound','value',40,70,{value:1}),n('cube','waveform3d',40,330,{mode:'cube',render:'normal',collide:true}),
      n('fluid','gpuParticles',1500,640,{mode:'simfluid3d'}),n('cam','camera3d',2400,640),
      n('ball','waveform3d',40,610,{mode:'sphere',render:'normal',collide:true,size:35,x:26}),
      n('merge','merge',3200,640),n('out','output',3900,640),...Array.from({length:12},(_,i)=>n(`loose${i}`,'value',40+i*190,-400))];
    const edges=[edge('sound','value','fluid','drive'),edge('cube','object','fluid','emit'),
      edge('fluid','shape','cam','shape'),edge('cam','shape','merge','a'),edge('ball','shape','merge','b'),edge('merge','image','out','image')];
    await load(scene(nodes,edges));
    await page.locator('#fit').click();
    const fitted=await page.evaluate(()=>pro.getProject().layers[0]);
    assert.deepEqual(fitted.edges,edges);
    assert.ok(fitted.nodes.find(n=>n.id==='out').x<1300,'Fit compacts an already left-to-right graph');
    await page.waitForFunction(()=>{
      const vp=document.querySelector('#graphViewport').getBoundingClientRect();
      const boxes=[...document.querySelectorAll('#nodes .node')].map(el=>el.getBoundingClientRect());
      return boxes.every((r,i)=>r.left>=vp.left&&r.right<=vp.right&&r.top>=vp.top&&r.bottom<=vp.bottom&&
        boxes.slice(i+1).every(b=>r.right<=b.left||b.right<=r.left||r.bottom<=b.top||b.bottom<=r.top));
    });
    await page.locator('#fit').click();
    assert.deepEqual(await page.evaluate(()=>pro.getProject().layers[0]),fitted,'A second Fit keeps the layout');
    await page.evaluate(()=>pro.undo());
    assert.equal(await page.evaluate(()=>pro.getProject().layers[0].nodes.find(n=>n.id==='out').x),3900);
    console.log('ok Fit compacts spaced graphs, frames all nodes, and supports undo');
    await page.evaluate(()=>pro.select('fluid'));
    const emission=page.locator('#properties [data-group="Emission"]');
    for(const key of ['fluidDomain','fluidSpeed','fluidPressure'])await emission.locator(`[data-property="${key}"]`).first().waitFor({state:'attached'});
    try{
      await page.waitForFunction(()=>{const e=pro.engine('fluid'),s=e?.fluid?.stats();return s?.steps>=14&&s.sourceCells>80&&pro.pixels()>.25;},null,{timeout:35000});
    }catch(e){console.log(await page.evaluate(()=>pro.stats()));throw e;}
    assert.ok(await page.evaluate(()=>{const f=pro.engine('fluid').fluid;
      return f.n===28&&f.field.size===28**3*16&&f.collisions.end>0&&f.depth.width>1;}),'XYZ grid uses the shared collider BVH and geometry depth');
    const before=await page.evaluate(()=>pro.engine('fluid').fluid.lastSource);
    assert.ok(Object.values(before).some((z,i)=>i%12===2&&Math.abs(z)>.25),'mesh emission samples extend through Z');
    const flow=await page.evaluate(async()=>{
      const f=pro.engine('fluid').fluid,d=f.device;
      const buffers=[f.wall,f.field],copy=b=>d.createBuffer({size:b.size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
      const [walls,values]=buffers.map(copy),enc=d.createCommandEncoder();
      enc.copyBufferToBuffer(f.wall,0,walls,0,walls.size);
      enc.copyBufferToBuffer(f.field,0,values,0,values.size);
      d.queue.submit([enc.finish()]);
      await Promise.all([walls.mapAsync(GPUMapMode.READ),values.mapAsync(GPUMapMode.READ)]);
      try{
        const mask=new Uint32Array(walls.getMappedRange()),field=new Float32Array(values.getMappedRange());
        let solids=0,leaks=0,moving=0,layers=new Set(),valid=true;
        mask.forEach((solid,i)=>{
          const o=i*4,density=field[o+3];valid&&=field.subarray(o,o+4).every(Number.isFinite);
          if(solid){solids++;if(density||field[o]||field[o+1]||field[o+2])leaks++;}
          else if(density>.02){layers.add(Math.floor(i/f.n**2));if(Math.hypot(field[o],field[o+1],field[o+2])>.025)moving++;}
        });
        return {solids,leaks,moving,depth:layers.size,valid};
      }finally{walls.destroy();values.destroy();}
    });
    assert.ok(flow.valid&&flow.solids>100&&flow.leaks===0&&flow.moving>100&&flow.depth>4,JSON.stringify(flow));
    const colliderSize=await page.evaluate(()=>pro.engine('fluid').fluid.collisions.end);
    await page.evaluate(()=>pro.setProperty('cube','collide',false));
    await page.waitForFunction(previous=>{const end=pro.engine('fluid')?.fluid?.collisions?.end;return end>0&&end<previous;},colliderSize);
    await page.evaluate(()=>pro.setProperty('ball','collide',false));
    await page.waitForFunction(()=>!pro.engine('fluid')?.fluid?.collisions?.end);
    const video=await page.evaluate(()=>pro.exportVideo({tone:.25,height:540,fps:24}));
    assert.ok(video.bytes>1000&&video.frames>=5,'3D Fluid renders through offline export');
    await page.evaluate(()=>pro.setProperty('fluid','mode','simfluid'));
    await page.waitForFunction(()=>pro.engine('fluid')?.mode==='simfluid'&&!pro.engine('fluid').fluid);
    assert.deepEqual(errors,[]);
    assert.deepEqual(await page.evaluate(()=>pro.stats().errors),[]);
    console.log('ok 3D Fluid emits from the cube, uses multiple colliders and shared depth, and switches back to 2D');
  }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
