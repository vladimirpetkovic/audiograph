// v59: 3D objects get Signal = Shape (old displacement) or Surface (fixed mesh, audio lines travel over it, all styles);
// richer multi-colour gradient presets (black & white kept).
process.env.AUDIOGRAPH_PARTICLE_BUILD=process.env.AUDIOGRAPH_OBJSURF_BUILD||'versions/audiograph_59.html';
const { open, wav, sine, kicks, load } = require('./audio-common.cjs');
const assert=(c,m)=>{if(!c){console.error('FAIL: '+m);process.exit(1)}console.log('ok - '+m)};
(async()=>{const t=await open({viewport:{width:1280,height:800}});const {page,errors}=t;
 const tone=wav([[30,s=>kicks(0.6)(s)+sine(220,0.25)(s)+sine(1760,0.08)(s)]],'s.wav');
 await load(page,{name:tone.name,mimeType:tone.mimeType,buffer:tone.buffer});
 await page.evaluate(()=>{particlesOn=false;setObjLayout('knot',document.querySelector('[onclick^="setObjLayout(\'knot\'"]'));if(!playing)togglePlay()});
 assert(await page.evaluate(()=>objSignal==='shape'),'Shape (old behaviour) is the default');
 const vis=sel=>page.evaluate(s=>[...document.querySelectorAll(s)].map(e=>e.offsetParent!==null),sel);
 assert((await vis('#layoutOpts_object .obj-surf-only')).every(v=>!v)&&(await vis('#layoutOpts_object .obj-shape-only')).every(v=>v),'Shape mode shows Elevation/Noise, hides surface rows');
 await page.evaluate(()=>setObjSignal('surface'));await page.waitForTimeout(300);
 assert((await vis('#layoutOpts_object .obj-surf-only')).every(v=>v)&&(await vis('#layoutOpts_object .obj-shape-only')).every(v=>!v),'Surface mode shows Flow/Lines/Travel/Count/Wire/Back');
 assert(await page.evaluate(()=>!document.getElementById('rowVaryH').classList.contains('ag-na')&&!document.getElementById('rowContrast').classList.contains('ag-na')),'Vary height and Contrast are available in Surface mode');
 // geometry is fixed: identical projected vertices for silent vs loud input; Shape mode moves them
 const geo=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=800;c.height=500;const g=c.getContext('2d'),z=new Array(120).fill(0),l=new Array(120).fill(1),r={};
   const run=v=>{const ph=wavePhase;drawObjModel(g,800,500,v,P(),false);return JSON.stringify(_objSurfDbg.verts)};
   r.surf=run(z)===run(l);objSignal='shape';drawObjModel(g,800,500,z,P(),false);const a=JSON.stringify(_objSpawnPts.slice(0,20));drawObjModel(g,800,500,l,P(),false);r.shape=a!==JSON.stringify(_objSpawnPts.slice(0,20));objSignal='surface';return r});
 assert(geo.surf,'Surface keeps the mesh fixed regardless of audio');
 assert(geo.shape,'Shape still displaces the mesh');
 // signal travels: same values, different time -> different line lengths; Travel 0 -> no change
 const tr=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=800;c.height=500;const g=c.getContext('2d'),v=new Array(120).fill(0).map((_,i)=>i/119),out={},w0=wavePhase;
   const at=(ph)=>{wavePhase=ph;drawObjModel(g,800,500,v,P(),false);return JSON.stringify(_objSurfDbg.lh)};
   document.getElementById('pObjTravel').value=60;out.moves=at(10)!==at(13);document.getElementById('pObjTravel').value=0;out.still=at(10)===at(13);document.getElementById('pObjTravel').value=35;wavePhase=w0;return out});
 assert(tr.moves,'audio lines travel over the surface with time');
 assert(tr.still,'Travel 0 holds the pattern still');
 const ink=()=>page.evaluate(()=>{const c=document.getElementById('frameCv'),x=document.createElement('canvas');x.width=200;x.height=125;const g=x.getContext('2d');g.drawImage(c,0,0,200,125);const d=g.getImageData(0,0,200,125).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]+d[i+1]+d[i+2]>90)n++;return n});
 for(const m of ['knot','cube','torus'])for(const f of ['rings','sweep','spiral','scatter'])for(const k of ['across','along']){
   await page.evaluate(([m,f,k])=>{objBuiltin=m;setObjFlow(f);setObjTick(k)},[m,f,k]);await page.waitForTimeout(160);
   const d=await page.evaluate(()=>_objSurfDbg);assert(d.front>40&&d.flow===f,`${m} ${f} ${k} draws surface lines (${d.front})`)}
 await page.evaluate(()=>{objBuiltin='knot';setObjFlow('rings');setObjTick('across')});
 const styles=await page.evaluate(()=>[...document.querySelectorAll('.styleb')].map(b=>b.getAttribute('onclick').match(/'(\w+)'/)[1]).filter(s=>s!=='off'));
 for(const st of styles){await page.evaluate(st=>setShape(st,[...document.querySelectorAll('.styleb')].find(b=>b.getAttribute('onclick').includes("'"+st+"'"))),st);await page.waitForTimeout(220);const n=await ink();assert(n>40,'style '+st+' renders on the surface ('+n+')')}
 await page.evaluate(()=>setShape('straight',[...document.querySelectorAll('.styleb')].find(b=>b.getAttribute('onclick').includes("'straight'"))));
 // particles emit from the surface lines
 assert(await page.evaluate(()=>lastFrameLines.lines.length>40),'surface lines feed particle emission');
 // state round-trip
 await page.evaluate(()=>{setObjFlow('spiral');setObjTick('along');document.getElementById('pObjTravel').value=77;document.getElementById('pObjWire').value=12});
 const st=await page.evaluate(()=>JSON.stringify(getState()));
 await page.evaluate(()=>{setObjSignal('shape');setObjFlow('rings');setObjTick('across');document.getElementById('pObjTravel').value=5});
 await page.evaluate(s=>applyState(JSON.parse(s)),st);
 assert(await page.evaluate(()=>objSignal==='surface'&&objFlow==='spiral'&&objTick==='along'&&+document.getElementById('pObjTravel').value===77&&+document.getElementById('pObjWire').value===12),'signal/flow/lines/sliders restored via state');
 // palettes: multi-colour gradients, default first, black & white kept
 const pal=await page.evaluate(()=>({t:tonePresets,s:simplePresets}));
 assert(pal.t[0].join()==='#1a1a2e00,#e94560,#f5a623,#6ee7b7'&&pal.s[0].join()==='#e94560,#f5a623,#6ee7b7','default gradients stay first');
 assert(pal.t.every(p=>p.length>=4&&p.length<=6)&&pal.s.every(p=>p.length>=3&&p.length<=6),'every gradient preset mixes 3+ colours');
 assert(pal.t.some(p=>p.join()==='#0d0d0d00,#424242,#9e9e9e,#fafafa'),'black & white tone ramp kept');
 assert(errors.length===0,'no page errors '+JSON.stringify(errors));
 process.exit(0)})();
