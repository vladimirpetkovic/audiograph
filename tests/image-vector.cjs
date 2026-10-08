// v55: Image layout — Import raster (Grid/Edge/LED equalizer) or Import vector (SVG traced like Sacred)
process.env.AUDIOGRAPH_PARTICLE_BUILD=process.env.AUDIOGRAPH_IMGVEC_BUILD||'versions/audiograph_55.html';
const { open, wav, sine, kicks, load } = require('./audio-common.cjs');
const assert=(c,m)=>{if(!c){console.error('FAIL: '+m);process.exit(1)}console.log('ok - '+m)};
const SVG=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" onload="window.__pwned=1">
<script>window.__pwned=2</script>
<g transform="translate(100 100) rotate(15)"><circle r="60" fill="none" stroke="#fff"/><rect x="-40" y="-40" width="80" height="80" fill="none" stroke="#fff"/></g>
<path d="M20 180 L60 140 M140 140 L180 180 C150 120 50 120 20 180Z" fill="none" stroke="#fff" onclick="window.__pwned=3"/>
<defs><path id="hidden" d="M0 0 L500 500"/></defs></svg>`;
(async()=>{const t=await open({viewport:{width:1280,height:800}});const {page,errors}=t;
 const tone=wav([[20,s=>kicks(0.6)(s)+sine(220,0.2)(s)+sine(1760,0.06)(s)]],'s.wav');
 await load(page,{name:tone.name,mimeType:tone.mimeType,buffer:tone.buffer});
 await page.evaluate(()=>{particlesOn=false;setLayout('image',document.querySelector('[onclick^="setLayout(\'image\'"]'));if(!playing)togglePlay()});
 const vis=sel=>page.evaluate(s=>[...document.querySelectorAll(s)].map(e=>e.offsetParent!==null),sel);
 assert(await page.locator('#imgSrcRow').isVisible(),'Source row (Raster/Vector) shown');
 assert((await vis('#layoutOpts_image .img-vector-only')).every(v=>!v),'vector rows hidden in raster mode');
 assert(await page.evaluate(()=>imgStyle==='led'),'raster defaults to LED style');
 // raster import
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=240;c.height=160;const g=c.getContext('2d');g.fillStyle='#000';g.fillRect(0,0,240,160);g.fillStyle='#fff';g.beginPath();g.arc(120,80,60,0,7);g.fill();return c.toDataURL('image/png').split(',')[1]});
 await page.setInputFiles('#imgLayoutInput',{name:'disc.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await page.waitForFunction(()=>imgLayoutData&&imgLayoutData.grid.length>0);await page.waitForTimeout(800);
 const ledLines=await page.evaluate(()=>lastFrameLines.lines.length);
 assert(ledLines>20,'raster LED draws lit segments ('+ledLines+')');
 assert((await vis('#layoutOpts_image .img-led-only')).every(v=>v),'LED gap/floor shown for LED');
 await page.locator('#frameCv').screenshot({path:'/tmp/ap/img-led.png'});
 await page.evaluate(()=>setImgStyle('grid'));await page.waitForTimeout(300);
 assert((await vis('#layoutOpts_image .img-led-only')).every(v=>!v),'LED rows hidden for Grid');
 assert(await page.evaluate(()=>lastFrameLines.lines.length>20),'raster Grid still draws');
 await page.evaluate(()=>setImgStyle('led'));
 // vector import
 await page.setInputFiles('#imgVectorInput',{name:'shape.svg',mimeType:'image/svg+xml',buffer:Buffer.from(SVG)});
 await page.waitForFunction(()=>imgVecGeom!==null);await page.waitForTimeout(800);
 assert(await page.evaluate(()=>imgSource==='vector'),'importing SVG switches to Vector');
 assert(await page.evaluate(()=>window.__pwned===undefined),'SVG scripts/handlers do not run');
 assert(await page.evaluate(()=>!document.querySelector('body > div[style*="-10000px"]')),'off-screen measuring host removed');
 const g=await page.evaluate(()=>({n:imgVecGeom.P.length,bw:imgVecGeom.bw,bh:imgVecGeom.bh,lines:lastFrameLines.lines.length}));
 assert(g.n>200&&g.lines>50,'SVG traced into segments '+JSON.stringify(g));
 assert(g.bw<=2.01&&g.bh<=2.01&&g.bw>1.5,'defs paths ignored and drawing normalised '+JSON.stringify(g));
 assert((await vis('#layoutOpts_image .img-vector-only')).every(v=>v)&&(await vis('#layoutOpts_image .img-raster-only')).every(v=>!v),'vector rows shown, raster rows hidden');
 await page.locator('#frameCv').screenshot({path:'/tmp/ap/img-vec.png'});
 await page.evaluate(()=>setImgVTick('across'));await page.waitForTimeout(300);await page.locator('#frameCv').screenshot({path:'/tmp/ap/img-vec-across.png'});
 // state round-trip
 await page.evaluate(()=>{setImgVMap('shapes');document.getElementById('pImgVBloom').value=66});
 const st=await page.evaluate(()=>JSON.stringify(getState()));
 await page.evaluate(()=>{setImgSource('raster');setImgVMap('along');setImgVTick('along');document.getElementById('pImgVBloom').value=0});
 await page.evaluate(s=>applyState(JSON.parse(s)),st);
 assert(await page.evaluate(()=>imgSource==='vector'&&imgVMap==='shapes'&&imgVTick==='across'&&+document.getElementById('pImgVBloom').value===66),'source/map/lines/bloom restored via state');
 // bad file
 await page.setInputFiles('#imgVectorInput',{name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('not svg')});await page.waitForTimeout(400);
 assert(await page.evaluate(()=>/valid SVG/.test(document.getElementById('imgVectorName').textContent)&&imgVecGeom!==null),'invalid SVG reports an error and keeps the previous drawing');
 assert(errors.length===0,'no page errors '+JSON.stringify(errors));
 process.exit(0)})();
