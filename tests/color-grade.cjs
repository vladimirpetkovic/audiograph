const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const types={'.js':'text/javascript','.html':'text/html','.css':'text/css'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+url.pathname+(url.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
});
// A 2³ LUT that swaps red and blue (red changes fastest in .cube data).
const swap=['TITLE "Swap RB"','LUT_3D_SIZE 2'];
for(let b=0;b<2;b++)for(let g=0;g<2;g++)for(let r=0;r<2;r++)swap.push(`${b} ${g} ${r}`);
(async()=>{
  let browser;await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const cube=path.join(os.tmpdir(),'swap-rb.cube');fs.writeFileSync(cube,swap.join('\n'));
  try{
    browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--ignore-gpu-blocklist']});
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto((process.env.AUDIOGRAPH_PRO_URL||`http://127.0.0.1:${server.address().port}/pro/`)+'?demo');
    await page.waitForFunction(()=>window.pro);
    const settle=()=>page.waitForTimeout(1200);
    const load=fx=>page.evaluate(fx=>{
      pro.importProject({format:'audiograph-pro',version:21,layers:[{id:'L',name:'Grade',visible:true,opacity:1,blend:'source-over',nodes:[
        {id:'bg',type:'background',x:0,y:0,props:{fill:'flat',c1:'#c04020'}},{id:'fx',type:fx,x:200,y:0,props:{}},{id:'out',type:'output',x:400,y:0,props:{}}],
        edges:[{from:'bg',out:'image',to:'fx',input:'image'},{from:'fx',out:'image',to:'out',input:'image'}]}]});
      pro.select('fx');
    },fx).then(settle);
    const pixel=()=>page.evaluate(()=>{pro.draw();const c=document.querySelector('#preview');return Array.from(c.getContext('2d').getImageData(c.width>>1,c.height>>1,1,1).data.slice(0,3));});
    const near=(a,b,tol=3)=>a.every((v,i)=>Math.abs(v-b[i])<=tol);
    const set=(k,v)=>page.evaluate(([k,v])=>pro.setProperty('fx',k,v),[k,v]);

    assert.ok(await page.evaluate(()=>!!document.querySelector('.library-node[data-type=colorAdjust]')),'Color adjust is in the library');
    assert.ok(await page.evaluate(()=>!!document.querySelector('.library-node[data-type=lut]')),'LUT is in the library');

    await load('colorAdjust');
    const base=await pixel();
    assert.ok(near(base,[0xc0,0x40,0x20]),'Default Color adjust leaves the picture unchanged: '+base);
    await set('saturation',-100);const grey=await pixel();
    assert.ok(Math.max(...grey)-Math.min(...grey)<=2,'Saturation −100 makes grey: '+grey);
    await set('saturation',0);await set('invert',100);
    assert.ok(near(await pixel(),[0x3f,0xbf,0xdf]),'Invert flips the colour');
    await set('invert',0);await set('inBlack',0x40);
    const lv=await pixel();assert.ok(lv[1]<=2&&Math.abs(lv[0]-171)<=3,'Input black crushes darker channels and stretches the rest: '+lv);
    await set('inBlack',0);await set('gamma',2);
    const gm=await pixel();assert.ok(gm[0]>0xc0&&gm[1]>0x40,'Gamma above 1 lifts midtones: '+gm);
    await set('gamma',1);await set('outWhite',128);
    const ow=await pixel();assert.ok(ow[0]<=0x62&&ow[0]>=0x5c,'Output white caps the range: '+ow);
    await set('outWhite',255);await set('exposure',1);
    const ex=await pixel();assert.ok(ex[0]>0xf0&&ex[1]>0x40,'Exposure +1 stop brightens: '+ex);
    await set('exposure',0);await set('hue',180);
    const hu=await pixel();assert.ok(hu[2]>hu[0],'Hue 180 turns orange toward blue: '+hu);
    await set('hue',0);await set('contrast',100);
    const ct=await pixel();assert.ok(ct[0]>0xe8&&ct[2]<0x10,'Contrast pushes values apart: '+ct);
    await set('mix',0);assert.ok(near(await pixel(),base),'Mix 0 shows the original');
    assert.deepEqual(await page.evaluate(()=>pro.stats().errors),[]);

    await load('lut');
    assert.ok(near(await pixel(),base),'An empty LUT node passes the picture through');
    assert.ok(await page.getByRole('button',{name:'Choose .cube LUT'}).isVisible(),'The LUT inspector offers a file picker');
    await page.locator('input[aria-label="LUT file"]').setInputFiles(cube);
    await page.waitForFunction(()=>pro.getProject().layers[0].nodes.find(n=>n.id==='fx').props.lutData);
    const swapped=await pixel();
    assert.ok(near(swapped,[0x20,0x40,0xc0],4),'The LUT swaps red and blue: '+swapped);
    assert.equal(await page.evaluate(()=>pro.getProject().layers[0].nodes.find(n=>n.id==='fx').props.lutName),'Swap RB');
    assert.ok(await page.locator('.media-item',{hasText:'Swap RB'}).isVisible(),'The loaded LUT is shown by name');
    await set('amount',50);const half=await pixel();
    assert.ok(near(half,[0x70,0x40,0x70],4),'Amount blends with the original: '+half);
    const saved=await page.evaluate(()=>pro.getProject());
    await page.evaluate(p=>{pro.importProject(p);pro.select('fx');},saved);await settle();
    assert.ok(near(await pixel(),half,4),'The LUT is saved in the project');
    fs.writeFileSync(cube,'LUT_3D_SIZE 3\n0 0 0\n');
    assert.ok(await page.getByRole('button',{name:'Replace'}).isVisible(),'A loaded LUT can be replaced');
    await page.locator('input[aria-label="LUT file"]').setInputFiles(cube);
    await page.waitForFunction(()=>/expected 27 entries/.test(document.body.innerText));
    assert.equal(await page.evaluate(()=>pro.getProject().layers[0].nodes.find(n=>n.id==='fx').props.lutName),'Swap RB','A broken LUT file keeps the previous LUT');
    await page.getByRole('button',{name:'Remove LUT'}).click();
    assert.ok(near(await pixel(),base),'Removing the LUT restores the picture');
    assert.deepEqual(errors,[]);
    console.log('ok - Color adjust (basic, levels, mix) and LUT (.cube load, amount, save, errors, remove)');
  }finally{await browser?.close();server.close();fs.rmSync(cube,{force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
