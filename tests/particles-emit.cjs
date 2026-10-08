// v58: particles emit from each layout's drawn shape (3D, media inputs, Sacred, Graph, Growth, ...); Stars removed
process.env.AUDIOGRAPH_PARTICLE_BUILD=process.env.AUDIOGRAPH_EMIT_BUILD||'versions/audiograph_58.html';
const assert=(c,m)=>{if(!c){console.error('FAIL: '+m);process.exit(1)}console.log('ok - '+m)};
const {execFileSync}=require('node:child_process');const CLIP=(process.env.TMPDIR||'/tmp')+'/ag-emit.webm';
execFileSync('ffmpeg',['-loglevel','error','-y','-f','lavfi','-i','testsrc=size=320x180:rate=30:duration=3','-c:v','libvpx','-b:v','400k',CLIP]);
// min share of spawns landing on drawn ink (Grid/Edge image styles draw too faintly to measure; Fractal/Growth/Sphere move a lot)
const MIN={linear:.9,circle:.9,concentric:.9,spiral:.9,phyllotaxis:.9,sacred:.85,graph:.85,scatter:.7,terrain:.85,tetrahedron:.7,dna:.85,pixelwarp:.85,text:.9,custom:.9,object:.85,'image:led':.9,'image:vector':.8,video:.85,fractal:.2,growth:.2,sphere:.45,'image:grid':0,'image:edge':0};
const { open, wav, sine, kicks, load } = require('./audio-common.cjs');
const SVG=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle cx="100" cy="100" r="60" fill="none" stroke="#fff"/><path d="M20 180 L100 20 L180 180Z" fill="none" stroke="#fff"/></svg>`;
(async()=>{const t=await open({viewport:{width:1280,height:800}});const {page,errors}=t;
 const tone=wav([[60,s=>kicks(0.6)(s)+sine(220,0.25)(s)+sine(1760,0.08)(s)]],'s.wav');
 await load(page,{name:tone.name,mimeType:tone.mimeType,buffer:tone.buffer});
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=240;c.height=160;const g=c.getContext('2d');g.fillStyle='#000';g.fillRect(0,0,240,160);g.fillStyle='#fff';g.beginPath();g.arc(70,80,45,0,7);g.fill();return c.toDataURL('image/png').split(',')[1]});
 await page.setInputFiles('#imgLayoutInput',{name:'disc.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await page.waitForFunction(()=>imgLayoutData&&imgLayoutData.grid.length>0);
 await page.evaluate(()=>{window.__sp=[];const o=spawnParticles;window.spawnParticles=function(e,W,H,p,lp,li){const a=getParticles(li||0),n=a.length;o.apply(this,arguments);for(let i=n;i<a.length;i++)__sp.push([a[i].x/W,a[i].y/H]);};if(!playing)togglePlay()});
 const only=(process.env.ONLY||'').split(',').filter(Boolean);
 let cases=await page.evaluate(()=>[...document.querySelectorAll('[onclick^="setLayout(\'"]')].map(b=>b.getAttribute('onclick').match(/'(\w+)'/)[1]));
 cases=[...new Set(cases)].filter(c=>c!=='image'&&c!=='video');cases.push('object','image:led','image:grid','image:edge','image:vector','text','video');
 if(only.length)cases=cases.filter(c=>only.includes(c));
 const res=[];
 for(const c of cases){const [lay,sub]=c.split(':');
  await page.evaluate(([lay,sub])=>{particlesOn=false;setLayout(lay,document.querySelector('[onclick^="setLayout(\''+lay+'\'"]'));
    if(lay==='image'){if(sub==='vector'){setImgSource('vector')}else{setImgSource('raster');setImgStyle(sub)}}
    if(lay==='text'){var ti=document.getElementById('textInput')||document.querySelector('#layoutOpts_text input[type=text],#layoutOpts_text textarea');}
    if(lay==="video"&&typeof vidEl!=="undefined"&&vidEl){var cv=document.createElement('canvas');cv.width=320;cv.height=180;var g=cv.getContext('2d');(function d(){g.fillStyle='#000';g.fillRect(0,0,320,180);g.fillStyle='#fff';g.fillRect(200+Math.sin(Date.now()/500)*30,40,80,100);requestAnimationFrame(d)})();vidEl.srcObject=cv.captureStream(30);vidEl.play()}
  },[lay,sub]);
  if(lay==='video'){const inp=await page.$('input[type=file][onchange*="loadLayoutVideo"]');await inp.setInputFiles(CLIP);await page.waitForFunction(()=>vidEl&&vidEl.readyState>=2)}
  if(sub==='vector'&&!(await page.evaluate(()=>!!imgVecGeom)))await page.setInputFiles('#imgVectorInput',{name:'v.svg',mimeType:'image/svg+xml',buffer:Buffer.from(SVG)}).catch(e=>console.log('svg input',e.message));
  await page.waitForTimeout(900);
  // ink mask without particles
  const mask=await page.evaluate(()=>{const c=document.getElementById('frameCv'),x=document.createElement('canvas');x.width=160;x.height=100;const g=x.getContext('2d');g.drawImage(c,0,0,160,100);const d=g.getImageData(0,0,160,100).data,m=[];for(let i=0;i<d.length;i+=4)m.push(d[i]+d[i+1]+d[i+2]>60?1:0);return m});
  await page.evaluate(()=>{particlesOn=true;var s=document.getElementById('pPartSpread');if(s)s.value=0;upP();__sp=[]});
  await page.waitForTimeout(1200);
  const sp=await page.evaluate(()=>{const a=__sp.slice(0,600);particlesOn=false;return a});
  const near=(x,y)=>{const cx=Math.round(x*160),cy=Math.round(y*100);for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){const X=cx+dx,Y=cy+dy;if(X>=0&&X<160&&Y>=0&&Y<100&&mask[Y*160+X])return 1}return 0};
  const hit=sp.length?sp.reduce((a,p)=>a+near(p[0],p[1]),0)/sp.length:0;
  const inkN=mask.reduce((a,b)=>a+b,0);
  const ys=sp.map(p=>p[1]),xs=sp.map(p=>p[0]);const r=a=>a.length?(Math.min(...a).toFixed(2)+'..'+Math.max(...a).toFixed(2)):'-';
  const info=[c,sp.length,inkN,hit.toFixed(2),'x '+r(xs),'y '+r(ys)].join(' ');
  assert(sp.length>100,c+' emits particles ('+info+')');
  assert(hit>=(MIN[c]??.85),c+' particles start on the drawn shape ('+info+')');
  if(c!=='linear'&&c!=='custom'&&c!=='text'&&c!=='scatter')assert(Math.max(...ys)-Math.min(...ys)>0.25,c+' does not fall back to the horizontal band');
  if(process.env.SHOT){const d=await page.evaluate(sp=>{const c=document.getElementById('frameCv'),x=document.createElement('canvas');x.width=640;x.height=400;const g=x.getContext('2d');g.drawImage(c,0,0,640,400);g.fillStyle='#f00';sp.forEach(p=>{g.fillRect(p[0]*640-1,p[1]*400-1,2,2)});return x.toDataURL('image/png').split(',')[1]},sp);require('fs').writeFileSync('/tmp/ap/ps-'+c.replace(':','-')+'.png',Buffer.from(d,'base64'))}
 }
 // a layout that draws nothing (Video with no source) must not reuse the previous layout's shape
 await page.evaluate(()=>{setLayout('sacred',document.querySelector('[onclick^="setLayout(\'sacred\'"]'))});await page.waitForTimeout(400);
 const stale=await page.evaluate(async()=>{lastFrameLines={lines:[],W:1,H:1};const W=800,H=500;drawDensity(document.createElement('canvas').getContext('2d'),W,H,new Array(120).fill(.5),P(),false);const n=lastFrameLines.lines.length;layoutMode='video';var o=vidEl;vidEl=null;drawDensity(document.createElement('canvas').getContext('2d'),W,H,new Array(120).fill(.5),P(),false);const a=getParticles(0),k=a.length;spawnParticles(.8,W,H,P(),{pPartDensity:50},0);const m=a.length-k;vidEl=o;layoutMode='sacred';return[n,m]});
 assert(stale[0]>0&&stale[1]===0,'no stale emission when the layout draws nothing '+stale);
 // Stars removed; old saves fall back to Sacred
 assert(await page.locator('[onclick^="setLayout(\'constellation\'"]').count()===0&&await page.evaluate(()=>typeof agStars==='undefined'),'Stars button removed');
 const st=await page.evaluate(()=>{const s=getState();s.stackLayouts[s.activeLayerIdx||0].layout='constellation';applyState(s);return layoutMode});
 assert(st==='sacred','old Stars saves open as Sacred ('+st+')');
 assert(errors.length===0,'no page errors '+JSON.stringify(errors));
 process.exit(0)})();
