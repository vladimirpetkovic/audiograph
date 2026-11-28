const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const types={'.js':'text/javascript','.html':'text/html','.css':'text/css'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+url.pathname+(url.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
});
const scene={format:'audiograph-pro',version:21,layers:[{id:'L',name:'Media',visible:true,opacity:1,blend:'source-over',nodes:[
  {id:'img',type:'image',x:0,y:0,props:{}},{id:'out',type:'output',x:300,y:0,props:{}}],edges:[{from:'img',out:'image',to:'out',input:'image'}]}]};
(async()=>{
  let browser;await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ag-media-'));
  try{
    browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--ignore-gpu-blocklist']});
    const url=(process.env.AUDIOGRAPH_PRO_URL||`http://127.0.0.1:${server.address().port}/pro/`)+'?demo',errors=[];
    const open=async ctx=>{const page=await ctx.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));
      await page.goto(url);await page.waitForFunction(()=>window.pro);return page;};
    const load=(page,p)=>page.evaluate(p=>{pro.importProject(p);pro.select('img');},p);
    const media=page=>page.evaluate(()=>pro.getProject().layers[0].nodes.find(n=>n.id==='img').media);
    const thumb=page=>page.locator('.inspector .media-item img');

    const ctxA=await browser.newContext({acceptDownloads:true}),a=await open(ctxA);
    await load(a,scene);
    const png=Buffer.from(await a.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=8;const x=c.getContext('2d');x.fillStyle='#e03010';x.fillRect(0,0,8,8);return c.toDataURL('image/png').split(',')[1];}),'base64');
    await a.locator('#emitterMedia').setInputFiles({name:'red.png',mimeType:'image/png',buffer:png});
    await a.waitForFunction(()=>pro.getProject().layers[0].nodes.find(n=>n.id==='img').media?.main);
    const kept=await media(a);assert.equal(kept.main.name,'red.png');assert.match(kept.main.key,/^[0-9a-f]{32}$/);
    await a.keyboard.press('Meta+z');await a.waitForFunction(()=>!pro.getProject().layers[0].nodes.find(n=>n.id==='img').media);
    await a.locator('.inspector .media-choose').waitFor();
    await a.keyboard.press('Meta+Shift+z');await thumb(a).waitFor();
    const saved=await a.evaluate(()=>pro.getProject());
    await load(a,scene);await a.locator('.inspector .media-choose').waitFor();
    await load(a,saved);await thumb(a).waitFor();

    // A second tab in the same browser finds the file by key.
    const a2=await open(ctxA);await load(a2,saved);await thumb(a2).waitFor();

    // Save writes a bundle; a fresh browser opens it complete.
    await a.evaluate(()=>{window.showSaveFilePicker=undefined;});
    const [dl]=await Promise.all([a.waitForEvent('download'),a.evaluate(()=>{const s=document.querySelector('#save');s.value='scene';s.dispatchEvent(new Event('change'));})]);
    const file=path.join(tmp,'scene.ag');await dl.saveAs(file);
    assert.equal(fs.readFileSync(file).subarray(0,2).toString(),'PK','A scene with media saves as a bundle');
    const ctxB=await browser.newContext(),b=await open(ctxB);
    await load(b,saved);
    await b.locator('.inspector .media-choose',{hasText:'Relink red.png'}).waitFor();
    await b.locator('#import').setInputFiles(file);
    await b.waitForFunction(()=>pro.getProject().layers[0].nodes.find(n=>n.id==='img').media?.main?.name==='red.png');
    await b.evaluate(()=>pro.select('img'));await thumb(b).waitFor();

    // Removing the file clears the reference; a plain scene still saves as JSON.
    await b.evaluate(()=>document.querySelector('.inspector .media-x').click());
    await b.waitForFunction(()=>!pro.getProject().layers[0].nodes.find(n=>n.id==='img').media);
    await b.evaluate(()=>{window.showSaveFilePicker=undefined;});
    const ctxC=await browser.newContext({acceptDownloads:true}),c=await open(ctxC);await load(c,scene);
    await c.evaluate(()=>{window.showSaveFilePicker=undefined;});
    const [dl2]=await Promise.all([c.waitForEvent('download'),c.evaluate(()=>{const s=document.querySelector('#save');s.value='scene';s.dispatchEvent(new Event('change'));})]);
    const plain=path.join(tmp,'plain.ag');await dl2.saveAs(plain);JSON.parse(fs.readFileSync(plain,'utf8'));
    // A 3D model on a 3D Object node comes back in another tab.
    const obj='v 0 0 0\nv 1 0 0\nv 0 1 0\nv 0 0 1\nf 1 2 3\nf 1 2 4\nf 1 3 4\nf 2 3 4\n';
    const model={format:'audiograph-pro',version:21,layers:[{id:'L',name:'Model',visible:true,opacity:1,blend:'source-over',nodes:[
      {id:'img',type:'waveform3d',x:0,y:0,props:{mode:'model',render:'normal'}},{id:'out',type:'output',x:300,y:0,props:{}}],edges:[{from:'img',out:'shape',to:'out',input:'image'}]}]};
    await load(a,model);
    await a.locator('#emitterMedia').setInputFiles({name:'tetra.obj',mimeType:'text/plain',buffer:Buffer.from(obj)});
    await a.waitForFunction(()=>pro.getProject().layers[0].nodes.find(n=>n.id==='img').media?.main?.name==='tetra.obj');
    const withModel=await a.evaluate(()=>pro.getProject()),a3=await open(ctxA);await load(a3,withModel);
    await a3.locator('.inspector .media-item',{hasText:'tetra.obj'}).waitFor();
    assert.deepEqual(errors,[]);
    console.log('ok - Media (image, 3D model) kept by key across undo, tabs and scenes; .ag bundles carry files; missing files offer Relink');
  }finally{await browser?.close();server.close();fs.rmSync(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
