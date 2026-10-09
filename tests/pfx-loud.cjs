// v62: with Scale loud + layer Post FX, the FX pipeline canvas must keep a fixed size (no per-frame GL realloc)
const {chromium}=require('playwright');const path=require('path');const fs=require('fs');
(async()=>{const b=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 const page=await (await b.newContext({viewport:{width:1200,height:800}})).newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('file://'+path.resolve(__dirname,'..',process.env.AUDIOGRAPH_PFXLOUD_BUILD||'versions/audiograph_62.html'));await page.waitForTimeout(800);
 await page.setInputFiles('#fileInput',{name:'m.mp3',mimeType:'audio/mpeg',buffer:fs.readFileSync(path.resolve(__dirname,'../../../music_tracks/ES_Closer - Tigerblood Jewel.mp3'))});
 await page.waitForTimeout(2500);
 let fail=0;
 for(const m of ['linear','sphere','terrain']){
  await page.evaluate(m=>{setLayout(m,[...document.querySelectorAll('button')].find(b=>(b.getAttribute('onclick')||'').includes("setLayout('"+m+"'")));particlesOn=false;zoomLoud=true;if(!playing)togglePlay();setPfxTarget('layer');setPostFx(true,document.querySelector('[onclick^="setPostFx(true"]'));document.getElementById('pfxBloom').value=60;upPostFx()},m);
  await page.waitForTimeout(600);
  const r=await page.evaluate(()=>new Promise(res=>{const s=new Set();let n=0;(function k(){if(_pfxLayerPipe)s.add(_pfxLayerPipe.cv.width+'x'+_pfxLayerPipe.cv.height);if(++n<90)requestAnimationFrame(k);else res([...s])})()}));
  const ok=r.length===1;if(!ok)fail++;console.log(ok?'PASS':'FAIL',m,'pipe sizes',r.slice(0,5).join(','),r.length>5?'…('+r.length+')':'')}
 if(errors.length){fail++;console.log('FAIL errors',errors.slice(0,3))}
 await b.close();console.log(fail?'FAILED '+fail:'ALL PASS');process.exit(fail?1:0)})();
