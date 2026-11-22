const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css'})[path.extname(file)]||'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});

(async()=>{
  const {VERSION}=await import('../pro/graph.js');
  let browser;
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args:['--ignore-gpu-blocklist','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
    const page=await browser.newPage({viewport:{width:1440,height:900},permissions:['camera']}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{
      if(window!==top)return;
      window.cameraTracks=[];
      const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia=async c=>{const stream=await get(c);cameraTracks.push(...stream.getVideoTracks());return stream;};
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/pro/?demo`);
    await page.waitForFunction(()=>window.pro);
    const png=await page.evaluate(()=>{
      const c=document.createElement('canvas');c.width=64;c.height=32;
      const x=c.getContext('2d');x.fillStyle='red';x.fillRect(0,0,32,32);return c.toDataURL().split(',')[1];
    });
    const scene=(mode,source)=>({format:'audiograph-pro',version:VERSION,settings:{resolution:540,performance:{simulation:'low',fps:24}},
      layers:[{id:'L',name:'Emitter media',visible:true,opacity:1,blend:'source-over',nodes:[
        {id:'d',type:'value',x:0,y:0,props:{value:1}},
        ...(source==='camera'?[{id:'cam',type:'camera',x:0,y:200,props:{warp:'none'}}]:source==='mesh'?[{id:'mesh',type:'waveform3d',x:0,y:200,props:{mode:'cube',render:'normal'}}]:[]),
        {id:'e',type:'gpuParticles',x:240,y:0,props:{mode}},
        {id:'out',type:'output',x:480,y:0,props:{}}],
      edges:[{from:'d',out:'value',to:'e',input:'drive'},{from:'e',out:'shape',to:'out',input:'image'},
        ...(source?[{from:source==='camera'?'cam':'mesh',out:source==='camera'?'image':'object',to:'e',input:'emit'}]:[])]}]});
    const load=async (mode,source)=>{
      await page.evaluate(p=>{pro.dissolve(false);pro.importProject(p);pro.select('e');},scene(mode,source));
      await page.waitForFunction(()=>pro.engine('e')?.status==='ready');
    };
    const openEmission=async()=>{
      const fold=page.locator('[data-group="Emission"]');
      const title=fold.getByRole('button',{name:'Emission',exact:true});
      if(await title.getAttribute('aria-expanded')==='false')await title.click();
      return fold;
    };
    const samples=async name=>page.waitForFunction(name=>{
      const w=pro.engine('e')?.w;
      const a=w?.simEmitterData,s=Object.values(w?.agSim.stats().layers||{}).find(s=>s.kind==='particles'||s.kind==='fluid');
      return a?.name===name&&a.points.length===2048*5&&s?.steps>0;
    },name);
    const simulationSections=async (emission,mode)=>{
      const props=page.locator('#properties'),look=props.locator('[data-group="Look"]');
      await emission.locator('[data-property="opt:pSimSpeed"]').first().waitFor({state:'attached'});
      await emission.getByRole('button',{name:'Ultra',exact:true,includeHidden:true}).waitFor({state:'attached'});
      await emission.getByRole('button',{name:'Restart',exact:true,includeHidden:true}).waitFor({state:'attached'});
      await look.locator('[data-property="opt:pSimExpo"]').first().waitFor({state:'attached'});
      assert.equal(await look.locator('[data-property="opt:pSimSpeed"]').count(),0);
      assert.equal(await props.locator('[data-group="Form"],[data-property="opt:pSmSpeed"],[data-property="opt:pEmitRZ"]').count(),0);
      assert.equal(await props.getByRole('button',{name:'Reset settings',exact:true,includeHidden:true}).count(),0);
      if(mode==='simparticles')await look.locator('[data-property="opt:pSpSize"]').first().waitFor({state:'attached'});
      else await emission.locator(`[data-property="opt:${mode==='simfluid'?'pSfIter':'pSmIter'}"]`).first().waitFor({state:'attached'});
      if(mode==='simfluid'){
        for(const id of ['pSfDye','pSfFade'])await emission.locator(`[data-property="opt:${id}"]`).first().waitFor({state:'attached'});
        await look.locator('[data-property="opt:pSfShade"]').first().waitFor({state:'attached'});
      }
    };
    for(const mode of ['simparticles','simfluid']){
      await load(mode);
      let emission=await openEmission();
      await simulationSections(emission,mode);
      await emission.getByRole('button',{name:'Image',exact:true}).click();
      emission=await openEmission();
      await emission.getByRole('button',{name:/^(Upload|Replace) image$/}).waitFor({timeout:8000});
      await emission.getByLabel('Emitter image').setInputFiles({name:`${mode}.png`,mimeType:'image/png',buffer:Buffer.from(png,'base64')});
      await samples(`${mode}.png`);
      assert.ok(await page.evaluate(()=>{const w=pro.engine('e').w,a=w.simEmitterData.points;
        return w.simOpt.pSpace!=='3d'&&a.every((v,i)=>i%5===0?v<=0:i%5===2?v===1:i%5===1||v===0);}));
      await emission.getByRole('button',{name:'Replace image'}).waitFor();
      if(mode==='simfluid'){
        assert.equal(await emission.locator('[data-property="opt:pSfJets"]').count(),0);
        await emission.locator('[data-property="opt:pEmitPoints"]').first().waitFor({state:'attached'});
      }
      assert.equal(await page.locator('#properties').getByText('Presets',{exact:true}).count(),0);
      await emission.getByRole('button',{name:'Webcam',exact:true}).click();
      emission=await openEmission();
      await emission.getByRole('button',{name:'Start camera'}).click();
      await samples('Webcam');
      await page.evaluate(()=>{window.firstCameraAsset=pro.engine('e').w.simEmitterData;});
      await page.waitForFunction(()=>pro.engine('e').w.simEmitterData!==firstCameraAsset);
      await emission.getByRole('button',{name:'Ring',exact:true}).click();
      await page.waitForFunction(()=>cameraTracks.at(-1)?.readyState==='ended'&&!pro.engine('e').w.simEmitterData);
      await load(mode,'camera');
      await samples('Picture');
      await load('simsmoke');
      await simulationSections(await openEmission(),'simsmoke');
      assert.ok(await page.evaluate(()=>pro.emitPoints('e')?.length>0));
      console.log(`ok ${mode}: uploaded image, direct Webcam, wired Camera`);
    }
    await load('simfluid','mesh');
    const emission=await openEmission();
    await emission.getByText(/rendered silhouette in 2D/).waitFor({state:'attached'});
    await samples('Picture');
    assert.deepEqual(errors,[]);
    assert.deepEqual(await page.evaluate(()=>pro.stats().errors),[]);
    console.log('pro-emitter-media: PASS (including grouped simulation controls)');
  }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
