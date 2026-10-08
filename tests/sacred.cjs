// Sacred geometry (v53+) and Stars/constellation (v54+) layouts
process.env.AUDIOGRAPH_PARTICLE_BUILD=process.env.AUDIOGRAPH_SACRED_BUILD||'versions/audiograph_54.html';
const { open, wav, sine, kicks, load } = require('./audio-common.cjs');
const assert=(c,m)=>{if(!c){console.error('FAIL: '+m);process.exit(1)}console.log('ok - '+m)};
(async()=>{const t=await open({viewport:{width:1280,height:800}});const {page,errors}=t;
 const tone=wav([[20,s=>kicks(0.6)(s)+sine(220,0.2)(s)+sine(1760,0.06)(s)]],'s.wav');
 await load(page,{name:tone.name,mimeType:tone.mimeType,buffer:tone.buffer});
 assert(await page.locator('[onclick^="setLayout(\'sacred\'"]').count()===1,'Sacred layout button exists');
 await page.evaluate(()=>{particlesOn=false;setLayout('sacred',document.querySelector('[onclick^="setLayout(\'sacred\'"]'));if(!playing)togglePlay()});
 assert(await page.locator('#layoutOpts_sacred').isVisible(),'Sacred options panel visible');
 assert(await page.evaluate(()=>sacredTick==='along'&&sacredPat==='flower'),'defaults flower/along');
 const m=await page.evaluate(()=>agSacred.figure('metatron'));
 assert(m.circles===13&&m.edges===78,'metatron has 13 circles and 78 edges ('+JSON.stringify(m)+')');
 assert(await page.evaluate(()=>agSacred.figure('seed').circles)===7,'seed of life has 7 circles');
 const ink=()=>page.evaluate(()=>{const c=document.getElementById('frameCv'),x=document.createElement('canvas');x.width=200;x.height=125;const g=x.getContext('2d');g.drawImage(c,0,0,200,125);const d=g.getImageData(0,0,200,125).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]+d[i+1]+d[i+2]>90)n++;return n});
 for(const f of await page.evaluate(()=>SACRED_PATS)){await page.evaluate(f=>setSacredPat(f),f);await page.waitForTimeout(350);const n=await ink();assert(n>150,f+' renders ink ('+n+')')}
 await page.evaluate(()=>{setSacredPat('tree');setSacredMap('shapes');setSacredTick('across');document.getElementById('pSacBloom').value=77});
 const st=await page.evaluate(()=>JSON.stringify(getState()));
 await page.evaluate(()=>{setSacredPat('egg');setSacredMap('along');setSacredTick('along');document.getElementById('pSacBloom').value=0});
 await page.evaluate(s=>applyState(JSON.parse(s)),st);
 assert(await page.evaluate(()=>sacredPat==='tree'&&sacredMap==='shapes'&&sacredTick==='across'&&+document.getElementById('pSacBloom').value===77),'figure/map/tick/bloom restored via state');
 // bloom: at silence fewer lines are drawn
 const cnt=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=800;c.height=500;const g=c.getContext('2d'),p={};const z=new Array(120).fill(0),r=[];
   for(const b of [0,100]){document.getElementById('pSacBloom').value=b;let L;for(let i=0;i<120;i++)L=agSacred.draw(g,800,500,z,Object.assign({height:1,thick:1,glow:0},p),false);r.push(L.length)}return r});
 assert(cnt[1]<cnt[0]*0.5,'bloom hides shapes at silence ('+cnt[1]+' < '+cnt[0]+')');
 const na=await page.evaluate(()=>Object.keys(AG_LAYOUT_NA).filter(k=>AG_LAYOUT_NA[k].indexOf('sacred')>=0));
 assert(na.length>0,'Sacred hides irrelevant rows: '+na.join(','));
 // v54: figure buttons wrap instead of overflowing the panel
 const wrap=await page.evaluate(()=>{const r=document.querySelector('#sacPatRow .mode-btns'),pn=document.getElementById('layoutOpts_sacred').getBoundingClientRect(),bs=[...r.children].map(b=>b.getBoundingClientRect());return{rows:new Set(bs.map(b=>Math.round(b.top))).size,inside:bs.every(b=>b.left>=pn.left-1&&b.right<=pn.right+1)}});
 assert(wrap.rows>1&&wrap.inside,'sacred figure buttons wrap inside the panel '+JSON.stringify(wrap));
 if(await page.evaluate(()=>typeof agStars!=='undefined')){
  await page.evaluate(()=>{setLayout('constellation',document.querySelector('[onclick^="setLayout(\'constellation\'"]'));if(!playing)togglePlay()});
  assert(await page.locator('#layoutOpts_constellation').isVisible(),'Stars options panel visible');
  const cw=await page.evaluate(()=>{const r=document.querySelector('#conPatRow .mode-btns'),pn=document.getElementById('layoutOpts_constellation').getBoundingClientRect(),bs=[...r.children].map(b=>b.getBoundingClientRect());return bs.every(b=>b.left>=pn.left-1&&b.right<=pn.right+1)});
  assert(cw,'constellation figure buttons stay inside the panel');
  const o=await page.evaluate(()=>agStars.figure('orion'));assert(o.stars===15&&o.edges===15,'orion has 15 stars and 15 lines');
  const w=await page.evaluate(()=>agStars.figure('winter'));assert(w.stars===41,'winter sky combines Orion, Taurus and Gemini');
  for(const f of await page.evaluate(()=>CON_PATS)){await page.evaluate(f=>setConPat(f),f);await page.waitForTimeout(300);const n=await ink();assert(n>60,'stars '+f+' renders ink ('+n+')')}
  await page.evaluate(()=>{setConPat('leo');setConMap('shapes');setConTick('across');document.getElementById('pConField').value=77});
  const cs=await page.evaluate(()=>JSON.stringify(getState()));
  await page.evaluate(()=>{setConPat('orion');setConMap('along');setConTick('along');document.getElementById('pConField').value=0});
  await page.evaluate(s=>applyState(JSON.parse(s)),cs);
  assert(await page.evaluate(()=>conPat==='leo'&&conMap==='shapes'&&conTick==='across'&&+document.getElementById('pConField').value===77),'stars figure/map/tick/field restored via state');
  const fld=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=250;const g=c.getContext('2d'),z=new Array(120).fill(.8),cnt=()=>{const d=g.getImageData(0,0,400,250).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i+3]>0)n++;return n};
    document.getElementById('pConField').value=0;agStars.draw(g,400,250,z,{height:1,thick:1},false);const a=cnt();g.clearRect(0,0,400,250);document.getElementById('pConField').value=100;agStars.draw(g,400,250,z,{height:1,thick:1},false);return[a,cnt()]});
  assert(fld[1]>fld[0],'field adds background stars '+fld);
 }
 assert(errors.length===0,'no page errors '+JSON.stringify(errors));
 await t.close?.();process.exit(0)})();
