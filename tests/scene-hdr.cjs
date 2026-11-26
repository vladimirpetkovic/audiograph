const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),fixture=require('./pbr-fixture.cjs');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+url.pathname+(url.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(file));
});
const header=(size='-Y 16 +X 32')=>Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n${size}\n`);
function hdr(color){
  const rows=[];
  for(let y=0;y<16;y++){
    const channels=Array.from({length:4},()=>[]);
    for(let x=0;x<32;x++){
      const c=typeof color==='function'?color(x,y):color;
      for(let k=0;k<4;k++)channels[k].push(c[k]);
    }
    rows.push(Buffer.from([2,2,0,32,...channels.flatMap(c=>[32,...c])]));
  }
  return Buffer.concat([header(),...rows]);
}
const scene={format:'audiograph-pro',version:10,layers:[{id:'L',name:'HDR',visible:true,opacity:1,blend:'source-over',
  nodes:[{id:'o',type:'waveform3d',x:0,y:0,props:{mode:'cube',render:'normal'}},
    {id:'d',type:'value',x:0,y:150,props:{value:0}},{id:'out',type:'output',x:300,y:0,props:{}}],
  edges:[{from:'d',out:'value',to:'o',input:'drive'},{from:'o',out:'shape',to:'out',input:'image'}]}]};
(async()=>{
  const {decodeHDR,importEnvironment,validateEnvironment}=await import('../pro/environment.js');
  const red=hdr([255,0,0,130]),image=decodeHDR(red);
  assert.equal(image.width,32);assert.equal(image.height,16);assert.ok(image.pixels[0]>3.9);
  const old=Buffer.concat([header('+X 2 -Y 1'),Buffer.from([128,0,0,129,0,128,0,129])]);
  assert.deepEqual(Array.from(decodeHDR(old).pixels),[1,0,0,0,1,0]);
  assert.throws(()=>decodeHDR(Buffer.from('not HDR')),/HDR/);
  assert.throws(()=>decodeHDR(red.subarray(0,red.length-1)),/HDR/);
  const asset=await importEnvironment({name:'red.hdr',size:red.length,arrayBuffer:async()=>red});
  assert.equal(asset.name,'red.hdr');assert.equal(asset.intensity,1);assert.equal(asset.rotation,0);
  assert.equal(validateEnvironment(asset),asset);
  assert.throws(()=>validateEnvironment({...asset,data:'data:application/octet-stream;base64,YmFk'}),/HDR/);
  await assert.rejects(importEnvironment({name:'fake.hdr',size:3,arrayBuffer:async()=>Buffer.from('bad')}),/HDR/);
  const directional=await importEnvironment({name:'directional.hdr',size:red.length,
    arrayBuffer:async()=>hdr(x=>x<16?[255,0,0,130]:[0,255,0,130])});
  const spot=await importEnvironment({name:'spot.hdr',size:red.length,
    arrayBuffer:async()=>hdr((x,y)=>x>=4&&x<10&&y>=4&&y<12?[255,255,255,132]:[0,0,0,0])});
  let browser;await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args:['--ignore-gpu-blocklist','--enable-gpu-rasterization']});
    const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto((process.env.AUDIOGRAPH_PRO_URL||`http://127.0.0.1:${server.address().port}/pro/`)+'?demo');
    await page.waitForFunction(()=>window.pro);await page.evaluate(scene=>{pro.dissolve(false);pro.importProject(scene);},scene);
    await page.waitForFunction(()=>pro.engine('o')?.w?.agSim.status()==='ready',null,{timeout:45000});
    await page.waitForFunction(()=>{
      const c=pro.engine('o').canvas,d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      for(let i=3;i<d.length;i+=64)if(d[i]>20)return true;return false;
    },null,{timeout:45000});
    const set=async value=>{
      await page.evaluate(value=>{const project=pro.getProject();project.settings={...project.settings,environment:value};pro.importProject(project);},value);
      await page.waitForTimeout(1000);
    };
    const pixels=(stage=false)=>page.evaluate(stage=>{
      const c=stage?document.getElementById('preview'):pro.engine('o').canvas,d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      let r=0,g=0,b=0;for(let i=0;i<d.length;i+=4){r+=d[i]*d[i+3]/255;g+=d[i+1]*d[i+3]/255;b+=d[i+2]*d[i+3]/255;}
      return [r,g,b];
    },stage);
    await set(null);const base=await pixels();
    await page.getByRole('button',{name:'Scene settings'}).click();
    await page.getByLabel('Import HDR environment').setInputFiles({name:'invalid.hdr',mimeType:'application/octet-stream',buffer:Buffer.from('bad')});
    await page.waitForFunction(()=>document.getElementById('status').classList.contains('error'));
    assert.match(await page.locator('#status').textContent(),/HDR environment:/);
    await page.getByLabel('Import HDR environment').setInputFiles({name:'red.hdr',mimeType:'application/octet-stream',buffer:red});
    await page.waitForFunction(()=>pro.getProject().settings?.environment?.name==='red.hdr');
    await page.waitForTimeout(1000);const lit=await pixels();
    assert.ok(lit[0]>base[0]*1.15,'HDR illuminates native mesh: '+JSON.stringify({base,lit,stats:await page.evaluate(()=>pro.engine('o').stats()),errors}));
    assert.deepEqual(await page.evaluate(()=>pro.getProject().settings.environment),asset,'Scene round-trip embeds the HDR');
    await set({...asset,intensity:0});const dark=await pixels();
    assert.ok(lit[0]>dark[0]*1.15,'Environment intensity controls illumination');
    await set(directional);const a=await pixels();await set({...directional,rotation:180});const b=await pixels();
    assert.ok(Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])>100000,'Environment rotation changes illumination');
    const floorGain=async visible=>{
      await page.evaluate(visible=>{const project=pro.getProject();project.settings={...project.settings,ground:{enabled:true,visible,height:-1.2,size:20}};pro.importProject(project);},visible);
      await set(null);const off=await pixels(true);await set(asset);const on=await pixels(true);return on[0]-off[0];
    };
    const floorShown=await floorGain(true),floorHidden=await floorGain(false);
    assert.ok(floorShown>floorHidden*1.05+1000,'HDR diffuse illuminates the native floor: '+JSON.stringify({floorShown,floorHidden}));
    await page.evaluate(()=>{pro.setProperty('o','mode','model');pro.select('o');});
    await page.locator('#emitterMedia').setInputFiles(fixture.glb());
    await page.waitForFunction(()=>pro.engine('o')?.mediaName==='textured.glb',null,{timeout:20000});
    await set({...asset,intensity:0});const pbrDark=await pixels();await set(asset);const pbrLit=await pixels();
    assert.ok(pbrLit[0]>pbrDark[0]*1.1,'HDR illuminates imported PBR: '+JSON.stringify({pbrDark,pbrLit}));
    const metallic=async roughness=>{
      await page.evaluate(()=>pro.select('o'));
      await page.locator('#emitterMedia').setInputFiles({...fixture.glb({metallic:1,roughness}),name:`rough-${roughness}.glb`});
      await page.waitForFunction(name=>pro.engine('o')?.mediaName===name,`rough-${roughness}.glb`);
      await set({...spot,intensity:4,rotation:0});const first=await pixels();
      await set({...spot,intensity:4,rotation:180});const second=await pixels();
      return first.reduce((sum,v,i)=>sum+Math.abs(v-second[i]),0);
    };
    const sharp=await metallic(.05),rough=await metallic(1);
    assert.ok(sharp>rough*1.1,'Roughness broadens specular HDR reflections: '+JSON.stringify({sharp,rough}));
    assert.deepEqual(await page.evaluate(()=>pro.engine('o').w.agSim.stats().errors),[]);
    assert.deepEqual(await page.evaluate(()=>pro.stats().errors),[]);
    assert.deepEqual(errors,[]);
    console.log('Scene HDR decoding and native/PBR illumination passed');
  }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
