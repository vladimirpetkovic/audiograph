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
      n('fluid','gpuParticles',1500,640,{mode:'simfluid3d',fluidResolution:32}),n('cam','camera3d',2400,640),
      n('ball','waveform3d',40,610,{mode:'sphere',render:'normal',collide:true,size:35,x:26}),
      n('merge','merge',3200,640),n('out','output',3900,640),...Array.from({length:12},(_,i)=>n(`loose${i}`,'value',40+i*190,-400))];
    const edges=[edge('sound','value','fluid','drive'),edge('cube','object','fluid','emit'),
      edge('fluid','shape','cam','shape'),edge('cam','shape','merge','a'),edge('ball','shape','merge','b'),edge('merge','image','out','image')];
    await load(scene(nodes,edges));
    await page.locator('#fit').click();
    const fitted=await page.evaluate(()=>pro.getProject().layers[0]);
    assert.deepEqual(fitted.edges,edges.filter(e=>e.to!=='cam').map(e=>e.from==='cam'?{...e,from:'fluid'}:e));
    assert.ok(!fitted.nodes.some(n=>n.type==='camera3d'),'The legacy camera migrates into Scene settings');
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
    assert.equal(await page.locator('#properties [data-property="fluidBand"]').count(),0,'A wired Drive replaces the band picker');
    for(const key of ['fluidResolution','fluidDomain','fluidSpeed','fluidPressure'])await emission.locator(`[data-property="${key}"]`).first().waitFor({state:'attached'});
    assert.equal(await page.locator('#properties [data-property="fluidLift"]').count(),0);
    assert.equal(await page.locator('#properties [data-property="fluidFloor"]').count(),0,'Ground is no longer a per-emitter toggle');
    await page.getByRole('button',{name:'Scene settings',exact:true}).click();
    assert.equal(await page.getByLabel('Ground enabled',{exact:true}).inputValue(),'true');
    await page.locator('.scene-inspector').getByRole('button',{name:'Done',exact:true}).click();
    try{
      await page.waitForFunction(()=>{const e=pro.engine('fluid'),s=e?.fluid?.stats();return s?.steps>=14&&s.sourceCells>80&&e.fluid.collisions.end>0&&pro.pixels()>.25;},null,{timeout:35000});
    }catch(e){console.log(await page.evaluate(()=>pro.stats()));throw e;}
    const grid=await page.evaluate(()=>{const f=pro.engine('fluid').fluid;
      return {n:f.n,size:f.field.size,colliders:f.collisions.end,depth:f.depth.width};});
    assert.ok(grid.n===32&&grid.size===32**3*16&&grid.colliders>0&&grid.depth>1,
      'XYZ grid uses the shared collider BVH and geometry depth: '+JSON.stringify(grid));
    const before=await page.evaluate(()=>pro.engine('fluid').fluid.lastSource);
    assert.ok(Object.values(before).some((z,i)=>i%12===2&&Math.abs(z)>.25),'mesh emission samples extend through Z');
    const flow=await page.evaluate(async()=>{
      const f=pro.engine('fluid').fluid,d=f.device;
      const buffers=[f.wall,f.field],copy=b=>d.createBuffer({size:b.size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
      const [walls,values]=buffers.map(copy),enc=d.createCommandEncoder();
      const visible=copy({size:f.n**3*8});
      enc.copyBufferToBuffer(f.wall,0,walls,0,walls.size);
      enc.copyBufferToBuffer(f.field,0,values,0,values.size);
      enc.copyTextureToBuffer({texture:f.density},{buffer:visible,bytesPerRow:f.n*8,rowsPerImage:f.n},[f.n,f.n,f.n]);
      d.queue.submit([enc.finish()]);
      await Promise.all([walls,values,visible].map(b=>b.mapAsync(GPUMapMode.READ)));
      try{
        const mask=new Uint32Array(walls.getMappedRange()),field=new Float32Array(values.getMappedRange());
        const dye=new Uint16Array(visible.getMappedRange()),surface=new Set(),scale=f.n/(2*f.domain);
        for(let i=0;i<f.lastSource.length;i+=12){
          const [x,y,z]=f.lastSource.subarray(i,i+3).map(p=>Math.floor(p*scale+f.n/2));
          if([x,y,z].every(p=>p>=0&&p<f.n))surface.add(x+f.n*(y+f.n*z));
        }
        let solids=0,leaks=0,moving=0,layers=new Set(),valid=true;
        mask.forEach((solid,i)=>{
          const o=i*4,density=field[o+3];valid&&=field.subarray(o,o+4).every(Number.isFinite);
          if(solid){solids++;if(density||field[o]||field[o+1]||field[o+2])leaks++;}
          else if(density>.02){layers.add(Math.floor(i/f.n**2));if(Math.hypot(field[o],field[o+1],field[o+2])>.025)moving++;}
        });
        const onSurface=[...surface].filter(i=>mask[i]),contact=onSurface.filter(i=>dye[i*4]>0).length;
        return {solids,leaks,moving,depth:layers.size,valid,contact,anchors:onSurface.length};
      }finally{walls.destroy();values.destroy();visible.destroy();}
    });
    assert.ok(flow.valid&&flow.solids>100&&flow.leaks===0&&flow.moving>100&&flow.depth>4,JSON.stringify(flow));
    assert.ok(flow.anchors>100&&flow.contact>flow.anchors*.7,'visible dye touches the colliding mesh: '+JSON.stringify(flow));
    const colliderSize=await page.evaluate(()=>pro.engine('fluid').fluid.collisions.end);
    await page.evaluate(()=>pro.setProperty('cube','collide',false));
    await page.waitForFunction(previous=>{const end=pro.engine('fluid')?.fluid?.collisions?.end;return end>0&&end<previous;},colliderSize);
    await page.evaluate(()=>pro.setProperty('ball','collide',false));
    await page.waitForFunction(()=>!pro.engine('fluid')?.fluid?.collisions?.end);
    await page.getByRole('button',{name:'Scene settings',exact:true}).click();
    await page.getByLabel('Ground height',{exact:true}).fill('-0.5');
    await page.getByLabel('Ground height',{exact:true}).press('Tab');
    await page.waitForFunction(()=>pro.engine('fluid').fluid.floorHeight===-.5&&pro.engine('fluid').fluid.floor===10);
    await page.getByLabel('Ground enabled',{exact:true}).selectOption('false');
    await page.waitForFunction(()=>pro.engine('fluid').fluid.floor===0);
    await page.locator('.scene-inspector').getByRole('button',{name:'Done',exact:true}).click();
    const video=await page.evaluate(()=>pro.exportVideo({tone:.25,height:540,fps:24}));
    assert.ok(video.bytes>1000&&video.frames>=5,'3D Fluid renders through offline export');
    await page.evaluate(()=>pro.setProperty('fluid','mode','simfluid'));
    await page.waitForFunction(()=>pro.engine('fluid')?.mode==='simfluid'&&!pro.engine('fluid').fluid);
    console.log('ok 3D Fluid emits from the cube, uses multiple colliders and shared depth, and switches back to 2D');
    const physics=await page.evaluate(async()=>{
      const {Fluid3D,prepareFluid3D}=await import('/pro/fluid3d.js'),{defaults}=await import('/pro/graph.js');
      await prepareFluid3D();
      const fluid=new Fluid3D(),props={...defaults('gpuParticles'),fluidResolution:32,fluidDomain:220,
        fluidRate:180,fluidSpeed:100,fluidSwirl:0,fluidFade:72,fluidPressure:6};
      const camera={yaw:0,tilt:.25,f:1,distance:2.5,panX:0,panY:0};
      const read=async(...buffers)=>{
        const d=fluid.device,enc=d.createCommandEncoder(),copies=buffers.map(b=>{
          const dst=d.createBuffer({size:b.size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
          enc.copyBufferToBuffer(b,0,dst,0,b.size);return dst;
        });
        d.queue.submit([enc.finish()]);
        try{await Promise.all(copies.map(b=>b.mapAsync(GPUMapMode.READ)));return copies.map(b=>b.getMappedRange().slice(0));}
        finally{copies.forEach(b=>b.destroy());}
      };
      const run=async(gravity,flat)=>{
        fluid.dispose();
        for(let frame=0;frame<36;frame++)fluid.draw({camera,width:160,height:90,quality:'low',dt:1/30,
          time:frame/30,frame,level:.5,beat:0,props,gravity,flat});
        const [raw,mask]=await read(fluid.field,fluid.wall),field=new Float32Array(raw),walls=new Uint32Array(mask),n=fluid.n;
        let mass=0,fy=0,solids=0,leaks=0,positive=0,negative=0;
        const outward=Array(6).fill(0);
        for(let i=0;i<walls.length;i++){
          const x=i%n+.5-n/2,y=Math.floor(i/n)%n+.5-n/2,z=Math.floor(i/n**2)+.5-n/2,o=i*4,d=field[o+3];
          if(walls[i]){solids++;if(field.subarray(o,o+4).some(v=>v!==0))leaks++;}
          mass+=d;fy+=y*d;
          if(z>1)positive+=d;if(z< -1)negative+=d;
          [x,y,z].forEach((q,j)=>{if(Math.abs(q)>1&&field[o+j]*q>.025&&d>.025)outward[j*2+(q>0?1:0)]++;});
        }
        return {centroid:fy/mass,outward,solids,leaks,positive,negative};
      };
      try{
        props.fluidSwirl=defaults('gpuParticles').fluidSwirl;
        const neutral=await run(0);
        props.fluidSwirl=0;
        const down=await run(70),up=await run(-70);
        const flat=await run(0,new Float32Array([0,0,0,0,0]));
        fluid.dispose();
        const source=new Float32Array([.49,0,0,1,0,0,0,1,1,0,0,0]);
        fluid.draw({camera,width:160,height:90,quality:'low',dt:1/30,time:0,frame:0,level:.5,beat:0,props,source});
        const [mesh]=await read(fluid.field),cells=new Float32Array(mesh),i=19+32*(16+32*16);
        const startsAtSurface=cells[i*4+3]>.01&&cells[(i+1)*4+3]===0;
        Object.assign(props,{fluidFloor:true,fluidFloorSize:50});
        const floor=await run(70);
        return {neutral,down,up,flat,floor,startsAtSurface};
      }finally{fluid.dispose();}
    });
    assert.ok(physics.neutral.outward.every(n=>n>8)&&Math.abs(physics.neutral.centroid)<.5,JSON.stringify(physics));
    assert.ok(physics.down.centroid<-.75&&physics.up.centroid>.75,JSON.stringify(physics));
    assert.ok(physics.flat.positive>.01&&Math.abs(physics.flat.positive-physics.flat.negative)<.01,JSON.stringify(physics));
    assert.ok(physics.floor.solids>100&&physics.floor.solids<32**2&&physics.floor.leaks===0,JSON.stringify(physics));
    assert.equal(physics.startsAtSurface,true,'a non-colliding mesh injects into its actual surface voxel on the first step');
    console.log('ok default flow spreads in all six directions, flat flow uses both sides, and ground and gravity work');
    const ramp=[{c:'#ff3300',a:0},{c:'#ff3300',a:1},{c:'#1111ff',a:1}];
    await load(scene([n('fluid','gpuParticles',40,200,{mode:'simfluid3d',fluidResolution:64,fluidDomain:220,
      fluidRate:340,fluidSpeed:100,fluidSwirl:80,fluidFade:72}),
      n('gravity','gravity',250,200,{fluidGravity:0}),n('palette','palette',460,200,{mode:'simpleramp',stops:ramp}),n('out','output',670,200)],
    [edge('fluid','shape','gravity','shape'),edge('gravity','shape','palette','shape'),edge('palette','shape','out','image')]));
    await page.evaluate(()=>pro.select('gravity'));
    await page.locator('#properties [data-property="fluidGravity"]').first().waitFor({state:'attached'});
    assert.equal(await page.locator('#properties [data-property="buoyancy"]').count(),0);
    const colors=()=>page.evaluate(()=>{
      const f=pro.engine('fluid')?.fluid;if(!f?.canvas)return null;
      const c=document.createElement('canvas');c.width=f.canvas.width;c.height=f.canvas.height;
      const ctx=c.getContext('2d');ctx.drawImage(f.canvas,0,0);const data=ctx.getImageData(0,0,c.width,c.height).data;
      let red=0,blue=0,green=0;
      for(let i=0;i<data.length;i+=4)if(data[i+3]>25){
        if(data[i]>1.3*data[i+2]&&data[i]>1.3*data[i+1])red++;
        if(data[i+2]>1.3*data[i]&&data[i+2]>1.3*data[i+1])blue++;
        if(data[i+1]>1.3*data[i]&&data[i+1]>1.3*data[i+2])green++;
      }
      return {red,blue,green};
    });
    await page.waitForFunction(()=>pro.engine('fluid')?.fluid?.steps>=35,null,{timeout:35000});
    const simple=await colors();
    assert.ok(simple.red>25&&simple.blue>10,JSON.stringify(simple));
    await page.evaluate(()=>pro.setProperty('palette','mode','toneramp'));
    await page.waitForTimeout(200);
    const tone=await colors();
    assert.ok(tone.red>25&&tone.blue>10,JSON.stringify(tone));
    if(process.env.FLUID_PREVIEW)await page.locator('#preview').screenshot({path:process.env.FLUID_PREVIEW});
    await page.evaluate(()=>{pro.setProperty('palette','solid','#00ff44');pro.setProperty('palette','mode','solid');});
    await page.waitForTimeout(200);
    const solid=await colors();
    assert.ok(solid.green>25&&solid.red===0&&solid.blue===0,JSON.stringify(solid));
    await page.evaluate(()=>{pro.setProperty('fluid','fluidDomain',300);pro.setProperty('fluid','fluidResolution',128);});
    await page.waitForFunction(()=>{const f=pro.engine('fluid')?.fluid;return f?.n===128&&f.domain===3&&f.steps>=2;},null,{timeout:35000});
    console.log('ok Palette colors by density in both ramp modes, Solid overrides the dye, and resolution is independent of container size');
    const newFluid=scene([n('fluid','gpuParticles',40,200,{mode:'simfluid'}),n('out','output',400,200)],[edge('fluid','shape','out','image')]);
    const expected={fluidResolution:128,fluidDomain:110,fluidRate:500,fluidSpeed:40,fluidSwirl:260,fluidFade:400,fluidPressure:10};
    const values=async()=>Object.fromEntries(await Promise.all(Object.keys(expected).map(async key=>
      [key,Number(await page.locator(`#properties input[data-property="${key}"]`).inputValue())])));
    await load(newFluid);
    await page.evaluate(()=>pro.select('fluid'));
    await page.getByLabel('Simulation',{exact:true}).selectOption('simfluid3d');
    assert.deepEqual(await values(),expected,'The new 3D Fluid defaults match the Emission panel');
    await page.waitForFunction(()=>{const f=pro.engine('fluid')?.fluid;return f?.n===128&&f.domain===1.1&&f.steps>=2;},null,{timeout:35000});
    const legacy=structuredClone(newFluid);
    legacy.version=15;
    Object.assign(legacy.layers[0].nodes[0].props,{mode:'simfluid3d',fluidRate:0,fluidResolution:32});
    await load(legacy);
    await page.evaluate(()=>pro.select('fluid'));
    const saved=await page.evaluate(keys=>{const {props}=pro.getProject().layers[0].nodes[0];return Object.fromEntries(keys.map(key=>[key,props[key]]));},Object.keys(expected));
    assert.deepEqual(saved,{fluidResolution:32,fluidDomain:220,fluidRate:0,fluidSpeed:100,fluidSwirl:80,fluidFade:72,fluidPressure:10},
      'Older scenes preserve explicit values and their original defaults');
    await page.locator('#resetNode').click();
    assert.deepEqual(await values(),expected,'Reset restores the new defaults and keeps 3D Fluid selected');
    await load(scene([
      n('audio','audioIn',40,50),n('bass','audio',40,150,{band:'bass'}),n('high','audio',40,250,{band:'high'}),
      n('fluid','gpuParticles',280,100,{mode:'simfluid3d',fluidResolution:24}),n('out','output',550,100)
    ],[edge('audio','audio','fluid','audio'),edge('audio','audio','bass','audio'),edge('audio','audio','high','audio'),
      edge('bass','value','fluid','fluidSpeed'),edge('high','value','fluid','fluidSwirl'),edge('fluid','shape','out','image')]));
    await page.waitForFunction(()=>pro.engine('fluid')?.fluid?.steps>1&&Math.abs(pro.value('bass')-pro.value('high'))>.05);
    await page.evaluate(()=>{pro.pause(true);pro.select('fluid');});
    const sound=page.locator('#properties [data-group="Sound"]');
    await sound.getByRole('button',{name:'Sound',exact:true}).click();
    const bandButton=label=>sound.getByRole('button',{name:label,exact:true});
    await bandButton('Highs').click();
    await page.evaluate(()=>pro.draw());
    assert.ok(await page.evaluate(()=>Math.abs(pro.engine('fluid').fluid.audioLevel-pro.value('high'))<.0001));
    await bandButton('Bass').click();
    await page.evaluate(()=>pro.draw());
    assert.ok(await page.evaluate(()=>Math.abs(pro.engine('fluid').fluid.audioLevel-pro.value('bass'))<.0001));
    for(const label of ['Mids','Full range'])assert.ok(await bandButton(label).isVisible());
    for(const label of ['Attack (ms)','Release (ms)','Sound turbulence','Sound speed'])await sound.getByRole('slider',{name:label}).waitFor({state:'attached'});
    const response=await page.evaluate(async()=>{
      const {Fluid3D,prepareFluid3D}=await import('/pro/fluid3d.js'),{defaults}=await import('/pro/graph.js');
      await prepareFluid3D();
      const f=new Fluid3D(),camera={yaw:0,tilt:0,f:1,distance:2.5,panX:0,panY:0};
      const props={...defaults('gpuParticles'),fluidResolution:24,fluidSpeed:100,fluidSwirl:0,punch:0};
      const draw=(frame,level,renderOnly=false)=>f.draw({frame,level,beat:0,camera,props,renderOnly,width:160,height:90,dt:.04,time:frame*.04});
      draw(0,0);
      const q=f.device.queue,write=q.writeBuffer;
      let values;
      q.writeBuffer=function(buffer,...args){if(buffer===f.uniform)values=args[1];return write.call(this,buffer,...args);};
      const sample=()=>[f.audioLevel,values[2],values[4],values[7]];
      try{
        draw(1,1);const original=sample();
        draw(2,0);
        Object.assign(props,{fluidAttack:200,fluidRelease:500,fluidSoundSpeed:100,fluidSoundSwirl:200,intensity:0});
        draw(3,1);const attack=sample();
        draw(3,1,true);const redraw=sample();
        draw(4,0);const release=sample();
        return {original,attack,redraw,release};
      }finally{q.writeBuffer=write;f.dispose();}
    });
    assert.ok(response.original[0]===1&&Math.abs(response.original[1]-.04)<1e-6&&Math.abs(response.original[2]-8.75)<1e-6&&response.original[3]===0,
      'Neutral controls preserve the existing response');
    assert.ok(response.attack[0]>0&&response.attack[0]<1&&response.attack[1]>.04&&response.attack[3]>0,
      'Attack smooths the response and sound can drive speed and turbulence');
    assert.equal(response.attack[2],2.25,'Intensity can mute audio-driven emission without muting motion');
    assert.deepEqual(response.redraw,response.attack,'A depth-only redraw does not advance the audio envelope');
    assert.ok(response.release[0]>0&&response.release[0]<response.attack[0],'Release lets the response decay');
    assert.deepEqual(errors,[]);
    assert.deepEqual(await page.evaluate(()=>pro.stats().errors),[]);
  }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
