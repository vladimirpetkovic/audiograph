// v59: 3D objects get Signal = Shape (old displacement) or Surface (fixed mesh, audio lines travel over it, all styles);
// richer multi-colour gradient presets (black & white kept).
// v60: the same Surface signal for Terrain, Sphere, Tetrahedron and DNA.
process.env.AUDIOGRAPH_PARTICLE_BUILD=process.env.AUDIOGRAPH_OBJSURF_BUILD||'versions/audiograph_61.html';
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
 // v60: every 3D layout gets the shared Signal block and a fixed surface
 for(const m of ['terrain','sphere','tetrahedron','dna']){
  await page.evaluate(m=>{setLayout(m,[...document.querySelectorAll('.mbtn')].find(b=>(b.getAttribute('onclick')||'').includes("setLayout('"+m+"'")));setObjSignal('surface');setObjFlow('rings');setObjTick('across')},m);await page.waitForTimeout(250);
  const u=await page.evaluate(m=>{const box=document.getElementById('ag3dSignalBox'),pan=document.getElementById('layoutOpts_'+m),sh=[...pan.querySelectorAll('.obj-shape-only')];
    return{host:box.parentNode===pan&&box.offsetParent!==null,surf:[...box.querySelectorAll('.obj-surf-only')].every(e=>e.offsetParent!==null),shapeHidden:sh.every(e=>e.offsetParent===null),nShape:sh.length,
      vary:!document.getElementById('rowVaryH').classList.contains('ag-na'),gpu:typeof agGpuStats==='function'?JSON.stringify(agGpuStats()):''}},m);
  assert(u.host&&u.surf,m+': Signal/Flow/Lines rows shown in its panel');
  assert(m==='terrain'?u.nShape===0:(u.nShape===2&&u.shapeHidden),m+': '+(m==='terrain'?'Elevation/Noise stay (they shape the fixed relief)':'Elevation/Noise hidden in Surface'));
  assert(u.vary,m+': Vary height available in Surface');
  const g=await page.evaluate(m=>{const c=document.createElement('canvas');c.width=800;c.height=500;const x=c.getContext('2d'),z=new Array(120).fill(0),l=new Array(120).fill(1);
    const draw=v=>{({terrain:drawTerrain,sphere:drawSphere,dna:drawDNA,tetrahedron:(a,b,c2,d,e,f)=>drawPolyhedron(a,b,c2,d,e,f,'tet')})[m](x,800,500,v,P(),false);return JSON.stringify(_objSurfDbg.verts)};
    const fixed=draw(z)===draw(l);const w0=wavePhase;document.getElementById('pObjTravel').value=60;wavePhase=10;draw(l.map((_,i)=>i/119));const a=JSON.stringify(_objSurfDbg.lh);wavePhase=13;draw(l.map((_,i)=>i/119));const moved=a!==JSON.stringify(_objSurfDbg.lh);wavePhase=w0;document.getElementById('pObjTravel').value=35;
    return{fixed,moved,front:_objSurfDbg.front}},m);
  assert(g.fixed,m+': geometry stays fixed with the audio');
  assert(g.moved&&g.front>40,m+': audio lines travel over it ('+g.front+')');
  for(const f of ['rings','sweep','spiral','scatter'])for(const k of ['across','along']){await page.evaluate(([f,k])=>{setObjFlow(f);setObjTick(k)},[f,k]);await page.waitForTimeout(120);const d=await page.evaluate(()=>_objSurfDbg);if(!(d.front>20&&d.flow===f))assert(false,`${m} ${f} ${k} draws (${d.front})`)}
  console.log('ok - '+m+': all flows and line directions draw');
  for(const st of ['tapered','dotted','pins','numbers']){await page.evaluate(st=>setShape(st,[...document.querySelectorAll('.styleb')].find(b=>b.getAttribute('onclick').includes("'"+st+"'"))),st);await page.waitForTimeout(200);const n=await ink();if(!(n>30))assert(false,m+' style '+st+' ink '+n)}
  await page.evaluate(()=>setShape('straight',[...document.querySelectorAll('.styleb')].find(b=>b.getAttribute('onclick').includes("'straight'"))));
  console.log('ok - '+m+': styles render on the surface');
  assert(await page.evaluate(()=>lastFrameLines.lines.length>20),m+': surface lines feed particle emission');
  await page.evaluate(()=>setObjSignal('shape'));await page.waitForTimeout(200);
  assert(await page.evaluate(m=>[...document.getElementById('layoutOpts_'+m).querySelectorAll('.obj-shape-only')].every(e=>e.offsetParent!==null)&&[...document.querySelectorAll('#ag3dSignalBox .obj-surf-only')].every(e=>e.offsetParent===null),m),m+': Shape restores its original controls');
  assert(await ink()>30,m+': Shape mode still draws');
 }
 // v61: Shape-mode styles on every 3D layout — wire stays under marker styles, markers follow the surface normal
 for(const m of ['terrain','sphere','tetrahedron','dna']){
  const r=await page.evaluate(m=>{setLayout(m,[...document.querySelectorAll('.mbtn')].find(b=>(b.getAttribute('onclick')||'').includes("setLayout('"+m+"'")));setObjSignal('shape');
    setShape('pins',[...document.querySelectorAll('.styleb')].find(b=>b.getAttribute('onclick').includes("'pins'")));
    const c=document.createElement('canvas');c.width=800;c.height=500;const x=c.getContext('2d'),v=new Array(120).fill(0).map((_,i)=>.3+.6*Math.abs(Math.sin(i*.37)));
    const f={terrain:drawTerrain,sphere:drawSphere,dna:drawDNA,tetrahedron:(a,b,c2,d,e,g)=>drawPolyhedron(a,b,c2,d,e,g,'tet')}[m];
    const orig=_ag3dMarker;let calls=0,tilted=0;_ag3dMarker=function(ctx,X,Y,nx,ny){calls++;const l=Math.hypot(nx||0,ny||0);if(l>.05&&Math.abs(Math.atan2(ny,nx)+Math.PI/2)>.2)tilted++;};
    f(x,800,500,v,P(),false);_ag3dMarker=orig;
    const d=x.getImageData(0,0,800,500).data;let ink=0;for(let i=3;i<d.length;i+=16)if(d[i]>10)ink++;
    return{calls,tilted,ink}},m);
  assert(r.calls>20,m+': marker styles draw markers in Shape mode ('+r.calls+')');
  assert(r.tilted>r.calls*.2,m+': markers follow the surface instead of all pointing up ('+r.tilted+'/'+r.calls+')');
  assert(r.ink>300,m+': wire still drawn under marker styles ('+r.ink+')');
 }
 await page.evaluate(()=>setShape('straight',[...document.querySelectorAll('.styleb')].find(b=>b.getAttribute('onclick').includes("'straight'"))));
 await page.evaluate(()=>setObjLayout('knot',document.querySelector('[onclick^="setObjLayout(\'knot\'"]')));
 assert(await page.evaluate(()=>document.getElementById('ag3dSignalBox').parentNode.id==='layoutOpts_object'),'Signal block returns to the Object panel');
 // palettes: multi-colour gradients, default first, black & white kept
 const pal=await page.evaluate(()=>({t:tonePresets,s:simplePresets}));
 assert(pal.t[0].join()==='#1a1a2e00,#e94560,#f5a623,#6ee7b7'&&pal.s[0].join()==='#e94560,#f5a623,#6ee7b7','default gradients stay first');
 assert(pal.t.every(p=>p.length>=4&&p.length<=6)&&pal.s.every(p=>p.length>=3&&p.length<=6),'every gradient preset mixes 3+ colours');
 assert(pal.t.some(p=>p.join()==='#0d0d0d00,#424242,#9e9e9e,#fafafa'),'black & white tone ramp kept');
 assert(errors.length===0,'no page errors '+JSON.stringify(errors));
 process.exit(0)})();
