import {triangulate} from './polygon.js';
import {parseGLTF,rawPose,I4,mul} from './gltf.js';
import {parseFBXModel} from './fbx-model.js';
import {parseUSDModel} from './usd-model.js';
import {sampleTrack,cleanTrack} from './camera-import.js';
const clamp=(v,a,b,d)=>Number.isFinite(+v)?Math.max(a,Math.min(b,+v)):d;
const models=new Map(),primitives=new Map();
export const PRIMITIVES=['Cube','Sphere','Cylinder','Two walls'];
// Box projection rotation (XYZ Euler, degrees). Row-major R handed to GL as column-major = R⁻¹, which maps object space into the box.
export function boxMatrix(b){const [x,y,z]=[b.rx,b.ry,b.rz].map(v=>v*Math.PI/180),cx=Math.cos(x),sx=Math.sin(x),cy=Math.cos(y),sy=Math.sin(y),cz=Math.cos(z),sz=Math.sin(z);
  return new Float32Array([cy*cz,sx*sy*cz-cx*sz,cx*sy*cz+sx*sz, cy*sz,sx*sy*sz+cx*cz,cx*sy*sz-sx*cz, -sy,sx*cy,cx*cy]);}
// Auto: projection knobs that drift by themselves. key → [min, max, drift amplitude] in stored units.
const C=[0,1,.1],BM=[-2,2,.3],BR=[-180,180,40],BS=[.05,20,.4];
export const MAP_AUTO={crop0:C,crop1:C,crop2:C,crop3:C,tile:[.1,20,.5],fade:[0,1,.35],'box.x':BM,'box.y':BM,'box.z':BM,'box.rx':BR,'box.ry':BR,'box.rz':BR,'box.sx':BS,'box.sy':BS,'box.sz':BS,'box.scale':BS};
// Scale drift is locked uniform: every scale key follows one shared curve as a factor, so the box never skews.
const SCALE_AUTO=new Set(['box.sx','box.sy','box.sz','box.scale']);
export function cleanAuto(a){return Array.isArray(a)?[...new Set(a.filter(k=>typeof k==='string'&&Object.hasOwn(MAP_AUTO,k)))]:[];}
const autoGet=(s,k)=>k.startsWith('crop')?s.crop[+k[4]]:k.startsWith('box.')?s.box[k.slice(4)]:s[k];
function wander(seed,clock){let h=2166136261;for(let i=0;i<seed.length;i++){h^=seed.charCodeAt(i);h=Math.imul(h,16777619);}
  const r=k=>((h>>>(k*5))&1023)/1023;return .6*Math.sin(r(0)*6.283+clock*6.283/(16+r(2)*14))+.4*Math.sin(r(1)*6.283+clock*6.283/(7+r(3)*6));}
// The mapping as drawn at this moment: surfaces with Auto knobs get drifted copies; values lands in `shown` (surfaceId:key).
export function driftMapping(m,clock,shown){
  if(!m?.surfaces.some(s=>s.auto?.length))return m;
  return {...m,surfaces:m.surfaces.map(s=>{if(!s.auto?.length)return s;const t={...s,crop:s.crop&&[...s.crop],box:s.box&&{...s.box}};
    const zf=2**(wander(s.id+'box.scale',clock)*.5);
    for(const k of s.auto){const [lo,hi,amp]=MAP_AUTO[k],home=autoGet(s,k);if(home===undefined)continue;const v=Math.max(lo,Math.min(hi,SCALE_AUTO.has(k)?home*zf:home+wander(s.id+k,clock)*amp));
      if(k.startsWith('crop'))t.crop[+k[4]]=v;else if(k.startsWith('box.'))t.box[k.slice(4)]=v;else t[k]=v;}
    if(t.crop){t.crop[0]=Math.min(t.crop[0],.98);t.crop[1]=Math.min(t.crop[1],.98);t.crop[2]=Math.max(t.crop[2],t.crop[0]+.02);t.crop[3]=Math.max(t.crop[3],t.crop[1]+.02);}
    for(const k of s.auto)shown?.set(s.id+':'+k,autoGet(t,k));return t;})};
}
export const LATTICE_RES=[0,2,3,4];
// Lattice: res³ control points; d holds each point's offset in units of the object's size (x,y,z flattened).
export function cleanLattice(l){const res=LATTICE_RES.includes(+l?.res)?+l.res:0,n=res**3*3,d=Array.isArray(l?.d)&&l.d.length===n?l.d.map(v=>clamp(v,-2,2,0)):new Array(n).fill(0);return {res,d};}
// Mesh animation: Displace (along normals), Edges (crease lines), Build (faces grow in) and Explode (faces fly apart).
const pick=(v,list)=>list.includes(v)?v:list[0];
export const FX_DRIVES={flow:['loop','bass','beat','full'],disp:['bass','full','high'],reveal:['beat','kick'],build:['loop','level'],explode:['beat','bass','hold'],scan:['full','bass','high','beat'],shock:['beat','bass','full'],flicker:['beat','high','loop'],outline:['full','bass','steady'],curves:['bass','full','steady'],light:['steady','bass','full','mids'],echo:['steady','bass','full'],morph:['full','bass','high','steady']};
// Levels: floors light in a chase up the building on the beat; Facades: one side at a time (then the roof); Mirror: random pieces, the same on both halves.
// Clouds, Veins, Dissolve and Rings are noise maps for an uneven reveal: drifting cloud islands, thin ridged veins, grain that
// dissolves in and out over two beats, and rings that roll out from a point that jumps every bar.
export const FX_MAPS=['all','depth','sound','uv','parts','random','noise','levels','facades','mirror','camera','windows','columns','roof','accent','clouds','veins','dissolve','rings'];
export const REVEAL_PATTERNS=['cells','tiles','bands','organic','clouds','veins','dissolve','rings'];
// Part tags (Windows, Columns, Roof, Accent) are clicked onto a model's parts; each has its own Map.
export const TAGS=['windows','columns','roof','accent'];
// Parts / Random re-pick: on every beat and every 3 s (auto), or only every N beats.
export const FX_REPICK=['auto','1','2','4','8'];
// Element: the opacity map Explode, Build and Flicker break the picture into, laid in the object's own space so the mesh's
// triangles never show: Cells (organic shards), Tiles (panels), Bands (floors) or Organic (soft noise islands).
export const FX_ELEMENTS=['cells','tiles','bands','organic'];
const OLD_ELEMENTS={poly:'cells',edge:'tiles',vert:'organic'};
const pickEl=v=>pick(OLD_ELEMENTS[v]||v,FX_ELEMENTS);
// Autopilot phrase: it changes look only every 4, 8 or 16 bars.
export const FX_AUTO_EVERY=['4','8','16'];
export const FX_KEYS=['disp','edges','build','explode','flow','scan','shock','flicker','snake','outline','curves','light','morph','echo','reveal','impact'];
// Post FX on a 3D surface: brightness, contrast and kaleidoscope work on the picture on the mesh; trails and feedback reuse the last frame, clipped to the mesh.
export function cleanPost(p={}){return {bright:clamp(p?.bright,-1,1,0),contrast:clamp(p?.contrast,-1,1,0),kaleido:Math.round(clamp(p?.kaleido,0,12,0)),kspin:clamp(p?.kspin,-2,2,0),trails:clamp(p?.trails,0,.98,0),feedback:clamp(p?.feedback,0,.98,0),zoom:clamp(p?.zoom,-.1,.1,.02),rotate:clamp(p?.rotate,-5,5,0),space:pick(p?.space,['screen','surface'])};}
export function cleanFx(f={}){const d=f.disp||{},e=f.edges||{},b=f.build||{},x=f.explode||{},fl=f.flow||{},sc=f.scan||{},sh=f.shock||{},fk=f.flicker||{},sn=f.snake||{},ol=f.outline||{},cv=f.curves||{},li=f.light||{},mo=f.morph||{},ec=f.echo||{},rv=f.reveal||{},im=f.impact||{},o={
  // Reveal: the object waits in the dark and each beat (or kick) reveals different parts; Stack adds parts through the bar, Swap cuts.
  reveal:{on:!!rv.on,pattern:pick(rv.pattern,REVEAL_PATTERNS),mode:pick(rv.mode,['beat','stack','swap']),every:pick(String(rv.every??'1'),['1','2','0.5']),amount:clamp(rv.amount,.05,1,.45),dark:clamp(rv.dark,0,1,.85),drive:pick(rv.drive,FX_DRIVES.reveal)},
  // Impact: a hit on drops, every bar or on strong kicks: Flash bursts white and breaks off cell by cell, Glitch tears and splits it, Slam blacks it out and snaps the cells back.
  impact:{on:!!im.on,style:pick(im.style,['all','flash','glitch','slam']),trigger:pick(im.trigger,['drops','bars','beats']),length:clamp(im.length,.25,4,1),amount:clamp(im.amount,0,1,1)},
  echo:{on:!!ec.on,style:pick(ec.style,['up','depth','out','random']),length:clamp(ec.length,.05,1,.6),amount:clamp(ec.amount,0,1,1),drive:pick(ec.drive,FX_DRIVES.echo)},
  morph:{on:!!mo.on,style:pick(mo.style,['liquid','swirl','melt']),scale:clamp(mo.scale,.2,8,2),speed:clamp(mo.speed,0,4,.5),amount:clamp(mo.amount,0,2,.6),drive:pick(mo.drive,FX_DRIVES.morph)},
  flow:(()=>{const old=fl.dir==='spin';return {on:!!fl.on,dir:pick(old?'up':fl.dir,['up','side','diag']),move:clamp(fl.move??(old?0:fl.speed),-2,2,.3),rotate:clamp(fl.rotate??(old?fl.speed:0),-2,2,0),scale:clamp(fl.scale,0,1,0),zspeed:clamp(fl.zspeed,.05,4,.5),drive:pick(fl.drive,FX_DRIVES.flow)};})(),
  scan:{on:!!sc.on,axis:pick(sc.axis,['up','across','depth']),speed:clamp(sc.speed,.05,4,.5),width:clamp(sc.width,.02,.5,.1),drive:pick(sc.drive,FX_DRIVES.scan)},
  shock:{on:!!sh.on,from:pick(sh.from,['bottom','top','side']),width:clamp(sh.width,.02,.3,.08),drive:pick(sh.drive,FX_DRIVES.shock)},
  flicker:{on:!!fk.on,amount:clamp(fk.amount,0,1,.6),speed:clamp(fk.speed,.5,20,4),drive:pick(fk.drive,FX_DRIVES.flicker),el:pickEl(fk.el)},
  snake:{on:!!sn.on,speed:clamp(sn.speed,.02,2,.3),length:clamp(sn.length,.02,.5,.12),count:Math.round(clamp(sn.count,1,8,2))},
  outline:{on:!!ol.on,width:clamp(ol.width,.05,1,.5),drive:pick(ol.drive,FX_DRIVES.outline)},
  curves:{on:!!cv.on,amount:clamp(cv.amount,0,2,.8),drive:pick(cv.drive,FX_DRIVES.curves)},
  light:{on:!!li.on,amount:clamp(li.amount,0,1,.6),speed:clamp(li.speed,0,2,.3),drive:pick(li.drive,FX_DRIVES.light)},
  disp:{on:!!d.on,amount:clamp(d.amount,0,1,.3),pattern:pick(d.pattern,['ripple','swell','noise']),drive:pick(d.drive,FX_DRIVES.disp),speed:clamp(d.speed,0,4,1)},
  edges:{on:!!e.on,mode:pick(e.mode,['trace','pulse','sweep']),width:clamp(e.width,1,16,3),speed:clamp(e.speed,.05,4,1),angle:clamp(e.angle,1,90,10),fill:clamp(e.fill,0,1,.35)},
  build:{on:!!b.on,order:pick(b.order,['up','out','random']),drive:pick(b.drive,FX_DRIVES.build),speed:clamp(b.speed,.02,2,.2),el:pickEl(b.el)},
  explode:{on:!!x.on,amount:clamp(x.amount,0,2,.5),drive:pick(x.drive,FX_DRIVES.explode),el:pickEl(x.el)}};
  // Map: where on the object each effect shows (everywhere, near the projector, by the spectrum, along the UVs, on random parts or faces).
  for(const k of FX_KEYS){o[k].map=pick(f[k]?.map,FX_MAPS);o[k].fade=!!f[k]?.fade;o[k].mix=clamp(f[k]?.mix,0,1,1);}o.repick=pick(String(f.repick??'auto'),FX_REPICK);const au=f.auto||{};o.auto={on:!!au.on,every:pick(String(au.every??'8'),FX_AUTO_EVERY),count:Math.round(clamp(au.count,1,4,2)),maps:au.maps!==false};return o;}
export function surface3d(id,name='3D object'){return clean3d({id,name,kind:'3d'});}
// AI texture: a prompt the AI bridge turns into the surface's picture; Evolve makes a new one on every section change.
export function cleanAiTex(a){return a&&typeof a.prompt==='string'&&a.prompt.trim()?{ai:{prompt:a.prompt.trim().slice(0,200),evolve:!!a.evolve}}:{};}
export function clean3d(s){
  const c=s.camera||{};return {id:s.id,name:String(s.name||'3D object').slice(0,40),kind:'3d',source:s.source==='ai'?'ai':s.source==='all'||s.source===undefined?'all':Math.round(clamp(s.source,1,4,1)),...cleanAiTex(s.ai),opacity:clamp(s.opacity,0,1,1),primitive:PRIMITIVES.includes(s.primitive)?s.primitive:'Cube',model:typeof s.model==='string'?s.model.slice(0,240):'',modelKey:typeof s.modelKey==='string'?s.modelKey.slice(0,280):'',projection:['uv','front','box'].includes(s.projection)?s.projection:'uv',fade:clamp(s.fade,0,1,.5),tile:clamp(s.tile,.1,20,1),box:(b=>({x:clamp(b.x,-2,2,0),y:clamp(b.y,-2,2,0),z:clamp(b.z,-2,2,0),rx:clamp(b.rx,-180,180,0),ry:clamp(b.ry,-180,180,0),rz:clamp(b.rz,-180,180,0),scale:clamp(b.scale,.05,20,1),sx:clamp(b.sx,.05,20,1),sy:clamp(b.sy,.05,20,1),sz:clamp(b.sz,.05,20,1)}))(s.box||{}),anim:(a=>({on:a.on!==false,clip:Math.round(clamp(a.clip,0,63,0)),speed:clamp(a.speed,.05,4,1)}))(s.anim||{}),xf:(t=>({x:clamp(t.x,-10,10,0),y:clamp(t.y,-10,10,0),z:clamp(t.z,-10,10,0),rx:clamp(t.rx,-180,180,0),ry:clamp(t.ry,-180,180,0),rz:clamp(t.rz,-180,180,0),scale:clamp(t.scale,.01,100,1),sx:clamp(t.sx,.01,100,1),sy:clamp(t.sy,.01,100,1),sz:clamp(t.sz,.01,100,1)}))(s.xf||{}),lattice:cleanLattice(s.lattice),ao:(a=>({on:!!a.on,strength:clamp(a.strength,0,1,.6),radius:clamp(a.radius,.01,1,.1)}))(s.ao||{}),fx:cleanFx(s.fx),post:cleanPost(s.post),...(Array.isArray(s.tags)&&s.tags.length?{tags:s.tags.slice(0,4000).filter(t=>Array.isArray(t)&&Number.isInteger(t[0])&&t[0]>=0&&t[0]<10112&&[1,2,3,4].includes(t[1])).map(t=>[t[0],t[1]])}:{}),...(Array.isArray(s.calib?.pts)&&s.calib.pts.length?{calib:{use:!!s.calib.use,pts:s.calib.pts.slice(0,24).filter(c=>Array.isArray(c?.q)&&c.q.length===3&&Array.isArray(c.t)&&c.t.length===2).map(c=>({q:c.q.map(v=>clamp(v,-1e8,1e8,0)),t:c.t.map(v=>clamp(v,-1,2,0))}))}}:{}),...(Array.isArray(s.cues)&&s.cues.length?{cues:s.cues.slice(0,9).map(c=>({name:String(c?.name||'Cue').slice(0,24),fx:(({auto,...f})=>f)(cleanFx(c?.fx)),post:cleanPost(c?.post)}))}:{}),...(a=>a.length?{auto:a}:{})(cleanAuto(s.auto)),scale:clamp(s.scale,.0001,10000,1),wire:!!s.wire,upAxis:s.upAxis==='Z'?'Z':'Y',camera:{yaw:clamp(c.yaw,-360,360,30),pitch:clamp(c.pitch,-89,89,20),distance:clamp(c.distance,.001,100000,6),roll:clamp(c.roll,-180,180,0),panX:clamp(c.panX,-2,2,0),panY:clamp(c.panY,-2,2,0),focal:clamp(c.focal,10,200,35),target:Array.isArray(c.target)&&c.target.length===3?c.target.map(v=>clamp(v,-1e8,1e8,0)):[0,0,0]},...(s.track?{track:cleanTrack(s.track)}:{}),trackOn:s.trackOn!==false,playing:s.playing!==false,speed:clamp(s.speed,.05,4,1),sync:s.sync!==false,hold:clamp(s.hold,0,1e7,0),offset:clamp(s.offset,-1e9,1e9,0)};
}
function geometry(verts,faces,uv=[]){const data=[],lines=[],lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(const v of verts){if(!v||v.length!==3||!v.every(Number.isFinite))throw Error('Invalid model vertex');for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],v[k]);hi[k]=Math.max(hi[k],v[k]);}}const span=hi.map((x,k)=>x-lo[k]||1);
  // Smooth normals: area-weighted face normals summed per position, so seams and split UVs still shade as one surface.
  const key=v=>v.map((x,k)=>Math.round((x-lo[k])/span[k]*1e5)).join(),acc=new Map(),fn=f=>{const [a,b,c]=f.map(i=>verts[i]),e=b.map((x,i)=>x-a[i]),h=c.map((x,i)=>x-a[i]);return [e[1]*h[2]-e[2]*h[1],e[2]*h[0]-e[0]*h[2],e[0]*h[1]-e[1]*h[0]];};
  for(const f of faces){if(f.some(i=>!verts[i]))throw Error('Invalid model face');const n=fn(f);for(const i of f){const k=key(verts[i]),a=acc.get(k);if(a){a[0]+=n[0];a[1]+=n[1];a[2]+=n[2];}else acc.set(k,[...n]);}}
  const nrm=v=>{const a=acc.get(key(v)),l=Math.hypot(...a)||1;return a.map(x=>x/l);};
  for(const f of faces){const n=fn(f).map(Math.abs),axes=n[2]>=n[0]&&n[2]>=n[1]?[0,1]:n[0]>=n[1]?[2,1]:[0,2];for(const i of f)data.push(...verts[i],...(uv[i]||axes.map(k=>(verts[i][k]-lo[k])/span[k])),...nrm(verts[i]));for(let j=0;j<3;j++)lines.push(...verts[f[j]],...verts[f[(j+1)%3]]);}if(!data.length)throw Error('No triangle geometry');return {data:new Float32Array(data),lines:new Float32Array(lines),verts,lo,span};}

function primitive(name){if(primitives.has(name))return primitives.get(name);const v=[],u=[],f=[],quad=(a,b,c,d)=>{const k=v.length;v.push(a,b,c,d);u.push([0,0],[1,0],[1,1],[0,1]);f.push([k,k+1,k+2],[k,k+2,k+3]);};
  if(name==='Sphere'||name==='Cylinder'){const sphere=name==='Sphere',N=32,R=sphere?16:1;for(let j=0;j<=R;j++)for(let i=0;i<=N;i++){const a=i/N*Math.PI*2,b=j/R*Math.PI,r=sphere?Math.sin(b):1;v.push([Math.cos(a)*r,sphere?Math.cos(b):1-j*2,Math.sin(a)*r]);u.push([i/N,1-j/R]);}for(let j=0;j<R;j++)for(let i=0;i<N;i++){const k=j*(N+1)+i;f.push([k,k+N+1,k+1],[k+1,k+N+1,k+N+2]);}if(!sphere){const top=v.length;v.push([0,1,0],[0,-1,0]);u.push([.5,.5],[.5,.5]);for(let i=0;i<N;i++)f.push([top,i+1,i],[top+1,N+1+i,N+2+i]);}}
  else{quad([-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]);quad([1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1]);if(name!=='Two walls'){quad([1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]);quad([-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]);quad([-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]);quad([-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]);}}
  const g=geometry(v,f,u);primitives.set(name,g);return g;
}
// Loaders thin very dense meshes for the CPU Model renderer; the GPU mapping view draws every triangle.
const MAX_TRIS=1000000;
function fullDetail(m){let n=0;for(const me of m.meshes)for(const p of me.prims)n+=p.idx.length/3;if(n>MAX_TRIS)throw Error('Model exceeds 1,000,000 triangles');m.faceStep=1;m.faces=null;}
export function hasModel(s){return !s.model||models.has(s.modelKey||s.model);}
export async function loadModel(file){
  if(file.size>100*1024*1024)throw Error('Mapping models are limited to 100 MB');
  const buf=await file.arrayBuffer(),key=file.name+':'+file.size;let g;
  if(/\.obj$/i.test(file.name)){const v=[],uv=[],vv=[],uu=[],faces=[];for(const line of new TextDecoder().decode(buf).split(/\r?\n/)){const [k,...a]=line.split('#')[0].trim().split(/\s+/);if(k==='v')v.push(a.slice(0,3).map(Number));if(k==='vt')uv.push([+a[0],+(a[1]||0)]);if(k==='f'){const ids=a.map(token=>{const [p,t]=token.split('/').map(Number),i=vv.length;vv.push(v[p<0?v.length+p:p-1]);uu.push(uv[t<0?uv.length+t:t-1]);return i;});for(const [x,y,z] of triangulate(ids.map(i=>vv[i])))faces.push([ids[x],ids[y],ids[z]]);if(faces.length>MAX_TRIS)throw Error('Model exceeds 1,000,000 triangles');}}g=geometry(vv,faces,uu);}
  else{const m=/\.fbx$/i.test(file.name)?await parseFBXModel(buf,file.name):/\.usd[acz]?$/i.test(file.name)?await parseUSDModel(buf,file.name):parseGLTF(buf,file.name),_=fullDetail(m),p=rawPose(m,-1,0),uv=[];for(const i of m.order)for(const prim of m.meshes[m.nodes[i].mesh]?.prims||[])for(let j=0;j<prim.pos.length/3;j++)uv.push(prim.uv?[prim.uv[j*2],1-prim.uv[j*2+1]]:undefined);g=geometry(Array.from({length:p.pos.length/3},(_,i)=>p.pos.slice(i*3,i*3+3)),p.faces,uv);if(m.clips.length)g.rig=rig(m,g,p.faces);}
  if(!g.data.every(Number.isFinite))throw Error('Model contains invalid coordinates');models.set(key,g);if(models.size>16)models.delete(models.keys().next().value);const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(const v of g.verts)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],v[k]);hi[k]=Math.max(hi[k],v[k]);}return {model:file.name,modelKey:key,clips:clipsOf(g),target:lo.map((x,k)=>(x+hi[k])/2),distance:Math.max(...hi.map((x,k)=>x-lo[k]))*3||6};
}
let renderer;
function init(){const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl2',{alpha:true,antialias:true,preserveDrawingBuffer:true});if(!gl)throw Error('3D mapping needs WebGL2');
  const shader=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;},p=gl.createProgram();
  gl.attachShader(p,shader(gl.VERTEX_SHADER,`#version 300 es
  in vec3 position;in vec2 uv;in vec3 normal;uniform mat4 vp;uniform float scale;uniform int upAxis;uniform vec3 objectOffset;uniform float objectSize;uniform vec3 lo;uniform vec3 span;uniform int latRes;uniform vec3 lat[64];uniform mat3 objRot;uniform vec3 pivot;uniform vec3 objMove;uniform vec3 objScale;in vec3 fcenter;in vec3 fnormal;in vec4 fmeta;in vec3 fA;in vec3 fB;in vec3 fC;flat out vec3 tA;flat out vec3 tB;flat out vec3 tC;out vec3 fcen;uniform vec3 eye;uniform float time;uniform vec4 disp;uniform vec2 explode;uniform vec3 build;out vec2 tex;out vec3 obj;out vec3 nrm;out vec3 wpos;out vec3 bary;out float eflags;out float frnd;out float ford;out vec3 wnrm;out float fpart;out float vdep;
  float bern(int n,int i,float t){float c=n==1?1.:n==2?(i==1?2.:1.):(i==1||i==2?3.:1.);return c*pow(t,float(i))*pow(1.-t,float(n-i));}
  void main(){obj=position;tex=uv;nrm=normal;vec3 q=position;int vi=gl_VertexID%3;bary=vi==0?vec3(1,0,0):vi==1?vec3(0,1,0):vec3(0,0,1);eflags=fmeta.y;frnd=fmeta.x;ford=fmeta.z;fpart=fmeta.w;tA=fA;tB=fB;tC=fC;fcen=fcenter;float S=max(span.x,max(span.y,span.z));
    // The animations never move the mesh (the projection must stay on the real object); they only change the picture on each face.
    if(latRes>1){vec3 u=clamp((position-lo)/span,0.,1.),d=vec3(0);int n=latRes-1;for(int i=0;i<4;i++){if(i>n)break;float bi=bern(n,i,u.x);for(int j=0;j<4;j++){if(j>n)break;float bj=bi*bern(n,j,u.y);for(int k=0;k<4;k++){if(k>n)break;d+=bj*bern(n,k,u.z)*lat[(i*latRes+j)*latRes+k];}}}q+=d*span;}
    vec3 w=(upAxis==1?vec3(q.x,q.z,-q.y):q)*objectSize+objectOffset;w=pivot+objRot*((w-pivot)*objScale)+objMove;wpos=w*scale;wnrm=objRot*((upAxis==1?vec3(normal.x,normal.z,-normal.y):normal)/objScale);
    vec3 c=lo+span*.5,wc=(upAxis==1?vec3(c.x,c.z,-c.y):c)*objectSize+objectOffset;wc=(pivot+objRot*((wc-pivot)*objScale)+objMove)*scale;float rad=max(length(span)*.5*objectSize*max(objScale.x,max(objScale.y,objScale.z))*scale,1e-6);vdep=clamp((length(wc-eye)-length(wpos-eye))/rad,0.,1.);gl_Position=vp*vec4(wpos,1.);}`));
  gl.attachShader(p,shader(gl.FRAGMENT_SHADER,`#version 300 es
  precision highp float;in vec2 tex;in vec3 obj;in vec3 nrm;in vec3 wpos;uniform sampler2D picture;uniform sampler2D camTex;uniform sampler2D tagTex;uniform bool tagShow;uniform highp sampler2D posTex;uniform sampler2D aoTex;uniform int pass;uniform bool aoOn;uniform float aoStrength;uniform float aoRadius;uniform float pxScale;uniform vec3 eye;uniform int mode;uniform bool wire;uniform vec2 size;uniform vec3 lo;uniform vec3 span;uniform float fade;uniform float tile;uniform mat3 boxRot;uniform vec3 boxMove;uniform vec3 boxScale;in vec3 bary;in float eflags;in float frnd;in float ford;flat in vec3 tA;flat in vec3 tB;flat in vec3 tC;in vec3 fcen;uniform vec3 felem;uniform float fzoom;uniform vec3 build;in vec3 wnrm;in float fpart;in float vdep;uniform float fmap[16];uniform float fpres[16];uniform float fsoft[16];uniform vec4 frev;uniform vec4 frev2;uniform vec4 fimp;uniform vec4 fmorph;uniform vec4 fecho;uniform highp sampler2DArray hist;uniform vec4 fpost;uniform vec3 fseed;uniform vec4 fband;uniform float fstep;uniform vec4 fflow;uniform vec4 fscan;uniform vec4 fshock;uniform vec4 fflick;uniform vec4 fsnake;uniform vec4 foutl;uniform vec2 fcurv;uniform vec4 flight;uniform float time;uniform highp int upAxis;uniform vec4 edge;uniform vec3 edge2;uniform vec4 disp;uniform vec2 explode;out vec4 color;vec2 shift;mat2 spin=mat2(1.);float zoom=1.;vec2 tl(vec2 t){vec2 p=spin*((t-.5)*tile*zoom)+.5+shift;
    // Kaleidoscope: folds the picture's own coordinates, so it wraps each surface of the mesh.
    if(fpost.z>1.5){vec2 c=p-.5;float r=length(c),s=6.2832/fpost.z,a=mod(atan(c.y,c.x)+fpost.w,s);a=abs(a-s*.5);p=.5+r*vec2(cos(a),sin(a));}return p;}
  float h3(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
  float vn(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z);}
  float fbm(vec3 p){return vn(p)*.55+vn(p*2.03+5.1)*.3+vn(p*4.1+9.7)*.15;}
  // Element opacity maps, in object space (the triangulation never shows): Cells are organic shards, Tiles panels across each face,
  // Bands floors up the object and Organic soft noise islands. key: the region's random number; m: distance to its border
  // (0 on it, about 1/3 in the middle); C: its centre.
  vec3 h33(vec3 p){return fract(sin(vec3(dot(p,vec3(127.1,311.7,74.7)),dot(p,vec3(269.5,183.3,246.1)),dot(p,vec3(113.5,271.9,124.6))))*43758.5453);}
  void vor(vec3 q,out float d1,out float d2,out vec3 id){vec3 i=floor(q),f=fract(q);d1=8.;d2=8.;id=i;
    for(int z=-1;z<=1;z++)for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec3 g=vec3(x,y,z);float d=length(g+.15+.7*h33(i+g)-f);if(d<d1){d2=d1;d1=d;id=i+g;}else if(d<d2)d2=d;}}
  float vkey(vec3 q){float a,b;vec3 id;vor(q,a,b,id);return h3(id*.37+1.3);}
  vec3 oq(){return (obj-lo)/max(span.x,max(span.y,span.z));}
  void cell(float e,out float key,out float m,out vec3 C){float S=max(span.x,max(span.y,span.z));vec3 q=oq();
    if(e<.5){float K=5.,d1,d2;vec3 id;vor(q*K,d1,d2,id);key=h3(id*.37+1.3);m=(d2-d1)*.75;C=lo+(id+.5+.35*(h33(id)-.5))/K*S;return;}
    if(e<1.5){float K=6.;vec3 p=q*K+.5,id=floor(p),f=fract(p),b=min(f,1.-f),n=abs(normalize(cross(dFdx(obj),dFdy(obj))));
      m=(n.x>=n.y&&n.x>=n.z?min(b.y,b.z):n.y>=n.z?min(b.x,b.z):min(b.x,b.y))*.66;key=h3(id*.71+2.9);C=lo+(id-.5+.5)/K*S;return;}
    if(e<2.5){vec3 c=(obj-lo)/span;float N=8.,h=clamp(upAxis==1?c.z:c.y,0.,.9999)*N,id=floor(h),f=h-id;m=min(f,1.-f)*.66;key=h3(vec3(id,7.,3.));C=obj;
      if(upAxis==1)C.z=lo.z+(id+.5)/N*span.z;else C.y=lo.y+(id+.5)/N*span.y;return;}
    float v=clamp((vn(q*1.7+3.1)-.5)*2.+.5,0.,.9999)*3.,id=floor(v),f=v-id;m=min(f,1.-f)*.66;key=h3(vec3(id,1.7,9.1));C=obj;}
  // Map: how much effect i shows here (1 everywhere for All).
  // Parts and Random: with Fade on, the old pick crossfades into the new one.
  float pick(float x,int i){float b=step(.5,fract(x+fseed.y*.618034));return fsoft[i]>.5?mix(step(.5,fract(x+fseed.x*.618034)),b,fseed.z):b;}
  // A part's tag: looked up by its part number in a 128-wide table.
  int tagAt(){int k=int(fpart*10007.+.5);return int(texelFetch(tagTex,ivec2(k%128,k/128),0).r*255.+.5);}
  // Noise maps: Clouds drift (bass opens them), Veins are thin ridges, Dissolve grains in and out over two beats, Rings roll out each beat.
  float nmap(int m){vec3 q=oq();if(m==15)return smoothstep(.5-.12*fband.x,.62-.12*fband.x,fbm(q*2.2+vec3(0,time*.12,time*.08)));
    if(m==16)return smoothstep(.86,.93,1.-abs(fbm(q*2.+vec3(time*.05,0,0))*2.-1.));
    if(m==17){float k=1.-abs(fract(fstep*.5)*2.-1.),n=vn(q*11.+floor(fstep*.5)*3.7);return smoothstep(n-.08,n+.02,k);}
    vec3 p0=h33(vec3(floor(fstep/4.),4.,1.));float v=fract(length(q-p0)*3.-fract(fstep));return smoothstep(0.,.08,v)*(1.-smoothstep(.3,.45,v));}
  float msk0(int i){int m=int(fmap[i]+.5);if(m==0)return 1.;if(m>=15)return nmap(m);if(m==1)return smoothstep(.05,.75,vdep);
    // Camera: movement seen by the webcam, laid over the output (so a performer's motion lights the object where it overlaps).
    if(m==10)return texture(camTex,gl_FragCoord.xy/size).r;
    if(m>=11)return float(tagAt()==m-10);
    if(m==2){vec3 c=(obj-lo)/span;float h=clamp(upAxis==1?c.z:c.y,0.,1.),b=h<.5?mix(fband.x,fband.y,h*2.):mix(fband.y,fband.z,h*2.-1.);return clamp(b*1.5,0.,1.);}
    if(m==3)return smoothstep(.35,.65,.5+.5*sin((tex.x*3.+tex.y*2.)*6.2832-time*1.5));
    if(m==4)return pick(fpart,i);
    if(m==6)return smoothstep(.42,.58,vn((obj-lo)/span*2.5+vec3(0,time*.25,time*.15)));
    if(m>=7){vec3 c=clamp((obj-lo)/span,0.,.999);float h=upAxis==1?c.z:c.y;
      if(m==7){float b=floor(h*6.);return exp(-mod(fstep-b,6.)*1.1);}
      if(m==8){vec3 n=normalize(nrm);float up=upAxis==1?n.z:n.y,a=upAxis==1?atan(n.y,n.x):atan(n.z,n.x),side=abs(up)>.7?4.:mod(floor(a/1.5708+.5),4.);return 1.-step(.5,abs(side-mod(floor(fstep*.5),5.)));}
      return pick(h3(vec3(floor(abs(c.x-.5)*8.),floor(h*6.),3.)),i);}
    return pick(vkey(oq()*3.),i);}
  // fpres: how far the effect has faded in (1 without Fade).
  float msk(int i){return msk0(i)*fpres[i];}
  // Echo: the picture from a few frames ago, delayed more the higher (or nearer, further out, or per face) the point is.
  float edel=0.,emk=0.;
  vec4 pic(vec2 p){vec4 c=texture(picture,p);if(emk<=0.)return c;float k=edel*fecho.y,l0=floor(k),N=24.;
    vec4 h=mix(texture(hist,vec3(p,mod(fecho.z-l0,N))),texture(hist,vec3(p,mod(fecho.z-l0-1.,N))),k-l0);return mix(c,h,emk);}
  // Ambient occlusion (screen space): nearby surfaces from the position prepass that rise above this point's plane darken it.
  float occlusion(){vec3 n=normalize(cross(dFdx(wpos),dFdy(wpos)));if(dot(n,eye-wpos)<0.)n=-n;
    float r=clamp(aoRadius*pxScale*gl_FragCoord.w,2.,size.y*.15),a0=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))*6.2832,occ=0.;ivec2 hi=ivec2(size)-1;
    for(int i=0;i<16;i++){float k=(float(i)+.5)/16.,a=a0+float(i)*2.3999632;vec4 q=texelFetch(posTex,clamp(ivec2(gl_FragCoord.xy+vec2(cos(a),sin(a))*k*r),ivec2(0),hi),0);if(q.w<.5)continue;
      vec3 v=q.xyz-wpos;float d=length(v);if(d<1e-7)continue;occ+=max(0.,dot(v/d,n)-.15)*(1.-smoothstep(aoRadius*.5,aoRadius*1.5,d));}
    return clamp(1.-aoStrength*occ/6.,0.,1.);}
  // 4×4 blur of the AO buffer, skipping samples from other surfaces so edges stay crisp.
  float aoSmooth(){ivec2 c=ivec2(gl_FragCoord.xy),hi=ivec2(size)-1;float a=0.,w=0.;for(int y=-2;y<2;y++)for(int x=-2;x<2;x++){ivec2 p=clamp(c+ivec2(x,y),ivec2(0),hi);vec4 q=texelFetch(posTex,p,0);if(q.w<.5||distance(q.xyz,wpos)>aoRadius*.3)continue;a+=texelFetch(aoTex,p,0).r;w+=1.;}return w>0.?a/w:1.;}
  void main(){if(pass==1){color=vec4(wpos,1.);return;}if(pass==2){color=vec4(vec3(occlusion()),1.);return;}vec2 t=tex;if(mode==1)t=gl_FragCoord.xy/size;if(wire){color=vec4(.15,1.,.75,1.);return;}float dw=.5,dmk=0.;
    // Explode: each cell's picture slides by its own random offset. Build: cells appear in height, distance or random order; the growing front glows.
    float ek=0.,em=1.,bk=0.,bm=1.;vec3 eC=obj,bC=obj;if(explode.x>0.||explode.y>0.)cell(felem.x,ek,em,eC);if(build.x>.5)cell(felem.y,bk,bm,bC);float ang=ek*6.2832;shift=vec2(cos(ang),sin(ang))*explode.x*.12*(.35+ek)*msk(3);
    float bgrow=1.,bglow=0.;if(build.x>.5){vec3 c=(bC-lo)/span;float k=build.z<.5?(upAxis==1?c.z:c.y):build.z<1.5?length(c-.5)*1.1547:bk;k=clamp(k,0.,1.)*.9;bgrow=smoothstep(k,k+.1,build.y);bglow=bgrow>0.&&bgrow<1.?1.-bgrow:0.;}
    if(fecho.x>0.){vec3 c=(obj-lo)/span;float e=fecho.w<.5?(upAxis==1?c.z:c.y):fecho.w<1.5?vdep:fecho.w<2.5?length(c-.5)*1.1547:vkey(oq()*4.);edel=clamp(e,0.,1.);emk=fecho.x*msk(13);}
    // Morph: a flowing noise field in object space warps the picture, continuous across faces, so the mesh never moves.
    if(fmorph.x>0.){vec3 q=(obj-lo)/span*fmorph.z;float T=fmorph.w;vec2 w;
      if(fmorph.y<.5){vec3 a=vec3(vn(q+T),vn(q+vec3(5.2,1.3,2.8)-T*.7),vn(q+vec3(9.1,4.7,3.3)+T*.5));w=vec2(vn(q+a*2.5+vec3(1.7,9.2,0)+T*.3),vn(q+a*2.5+vec3(8.3,2.8,4.1)-T*.4))-.5;}
      else if(fmorph.y<1.5){float a=vn(q*.6+T*.4)*12.566;w=vec2(cos(a),sin(a))*(vn(q*1.7-T)-.15)*.7;}
      else{vec3 c=q*vec3(1,0,1);w=vec2((vn(q+T*.2)-.5)*.2,pow(vn(c*3.+vec3(0,T*.6,0)),1.5)*1.8);}
      shift+=w*fmorph.x*.3*msk(12);}
    // Flow: the picture moves (up, sideways or diagonally), turns and scales across the surface.
    if(fflow.x>.5){float fm=msk(4);shift+=(fflow.z<.5?vec2(0,1):fflow.z<1.5?vec2(1,0):vec2(.7071))*fflow.y;float a=fflow.w;spin=mat2(cos(a),sin(a),-sin(a),cos(a));zoom=1./(1.+fzoom*fm);}
    // Displace: a wave pattern on the surface warps the picture and shades it like relief.
    if(disp.x!=0.){vec3 u=(obj-lo)/span-.5;dmk=msk(0);float ph=disp.y<.5?length(u)*18.-time*disp.z*4.:disp.y<1.5?time*disp.z*3.:dot(u,vec3(9.1,7.3,11.7))+time*disp.z*2.;dw=disp.y<1.5?.5+.5*sin(ph):.5+.5*sin(ph)*sin(dot(u,vec3(-5.3,12.1,6.7))-time*disp.z*1.3);shift+=(disp.y<1.5?normalize(u.xy+1e-5)*(dw-.5):vec2(cos(ph),sin(ph))*.5)*disp.x*.12*dmk;}
float gk=0.;if(fimp.y>0.){vec3 q=oq();float sg=fimp.z+floor(time*15.)*7.1,r=h3(vec3(floor(q.y*(8.+h3(vec3(sg))*28.)),sg,1.)),r2=h3(vec3(floor(q.x*5.),floor(q.y*7.),sg+3.));gk=step(1.-fimp.y*.7,r);shift+=vec2((r2-.5)*.35,(h3(vec3(r,sg,9.))-.5)*.05)*gk;}
    if(mode==2){vec3 n=abs(boxRot*(dot(nrm,nrm)>1e-8?normalize(nrm):normalize(cross(dFdx(obj),dFdy(obj)))));vec3 p=boxRot*((obj-lo)/span-.5-boxMove)/boxScale+.5;if(fade<.001){t=n.z>=n.x&&n.z>=n.y?p.xy:n.x>=n.y?p.zy:p.xz;color=pic(tl(t));}else{vec3 w=pow(n,vec3(exp2(4.*(1.-fade))));w/=w.x+w.y+w.z;color=pic(tl(p.zy))*w.x+pic(tl(p.xz))*w.y+pic(tl(p.xy))*w.z;}}else color=pic(tl(t));color.rgb*=color.a;if(fimp.y>0.&&mode!=2){float o=.006+.03*fimp.y;vec4 a=pic(tl(t+vec2(o,0))),b=pic(tl(t-vec2(o,0)));color.r=mix(color.r,a.r*a.a,fimp.y);color.b=mix(color.b,b.b*b.a,fimp.y);}if(aoOn)color.rgb*=aoSmooth();
    if(disp.x!=0.)color.rgb*=1.+(dw-.5)*min(disp.x*2.,1.)*.9*dmk;
    // The rest only recolour the picture where it already is: cs is the picture's own colour at full strength.
    float mx0=max(color.r,max(color.g,color.b));vec3 cs=mx0>1e-4?color.rgb/mx0*min(1.,mx0*2.5):vec3(0),c01=(obj-lo)/span;float hU=upAxis==1?c01.z:c01.y;
    vec3 N=dot(nrm,nrm)>1e-8?normalize(nrm):normalize(cross(dFdx(obj),dFdy(obj)));
    // Light: a moving light shades the object's real shape.
    if(flight.x>.5){vec3 c0=color.rgb;float a=flight.z;vec3 L=normalize(upAxis==1?vec3(cos(a),sin(a),.6):vec3(cos(a),.6,sin(a)));color.rgb*=mix(1.,.15+1.4*max(dot(N,L),0.),flight.y);color.rgb=mix(c0,color.rgb,msk(11));}
    // Curves: rounded and detailed parts of the mesh glow, flat parts dim.
    if(fcurv.x>0.){vec3 c0=color.rgb;float k=clamp(length(fwidth(N))/max(length(fwidth(obj)),1e-6)*max(span.x,max(span.y,span.z))*.15,0.,1.),a=min(fcurv.x,1.);color.rgb=mix(color.rgb*(1.-.5*a),cs,min(k*fcurv.x*1.2,1.));color.rgb=mix(c0,color.rgb,msk(10));}
    // Scan: a band of light moves through the object.
    if(fscan.x>0.){vec3 c0=color.rgb;float h=fscan.w<.5?hU:fscan.w<1.5?c01.x:(upAxis==1?c01.y:c01.z),b=exp(-pow((h-fscan.y)/fscan.z,2.));color.rgb=mix(color.rgb*.3,mix(color.rgb,cs,min(fscan.x*.6,1.)),b);color.rgb=mix(c0,color.rgb,msk(5));}
    // Shockwave: a ring spreads over the surface from a point.
    if(fshock.x>0.){vec3 c0=color.rgb;vec3 p0=fshock.w>1.5?vec3(0.,.5,.5):upAxis==1?vec3(.5,.5,fshock.w<.5?0.:1.):vec3(.5,fshock.w<.5?0.:1.,.5);float d=length(c01-p0)/1.23,g=exp(-pow((d-fshock.y)/fshock.z,2.))*fshock.x;color.rgb=mix(color.rgb,cs,min(g*1.5,1.));color.rgb=mix(c0,color.rgb,msk(6));}
    // Flicker: random faces flash and others go dark.
    if(fflick.x>.5){vec3 c0=color.rgb,fC;float fk,fm_;cell(felem.z,fk,fm_,fC);float ft=time*fflick.z,h=step(.5,fract(sin((fk*91.7+floor(ft))*78.233)*43758.5453));if(fsoft[7]>.5)h=mix(h,step(.5,fract(sin((fk*91.7+floor(ft)+1.)*78.233)*43758.5453)),smoothstep(0.,1.,fract(ft)));color.rgb=mix(color.rgb,mix(color.rgb*.15,cs,h),fflick.y);color.rgb=mix(c0,color.rgb,msk(7));}
    // Snake: soft ribbons of light crawl up and around the object along a noise field (not face by face).
    if(fsnake.x>.5){vec3 c0=color.rgb,c=(obj-lo)/span;float o=vn(oq()*1.8+7.)*.6+(upAxis==1?c.z:c.y)*.4,x=fract((fsnake.y-o)*fsnake.w),l=x<fsnake.z?1.-x/fsnake.z:smoothstep(.97,1.,x);color.rgb=mix(color.rgb*.2,cs,l);color.rgb=mix(c0,color.rgb,msk(8));}
    // Reveal: the object waits in the dark; each beat reveals different parts (regions or noise) with a glowing front.
    if(frev.x>.5){vec3 c0=color.rgb,q=oq();float ph=frev.y,sd=frev.z,pt=frev.w,cov=frev2.x,md=frev2.y,dk=frev2.z,v,
      grow=md>1.5?1.:smoothstep(0.,.2,ph),dec=md<.5?1.-smoothstep(.35,1.,ph)*.8:1.,st=mod(sd,4.),lim=md>.5&&md<1.5?cov*(st+1.)*.5:cov,lp=md>.5&&md<1.5?cov*st*.5:0.,ss=md>.5&&md<1.5?floor(sd/4.):sd;
      if(pt<3.5){float k,m;vec3 C;cell(pt,k,m,C);float sel=fract(k*7.13+ss*.6180339),g=vn(q*13.+sd*1.7);v=sel<lp?1.:step(sel,lim)*smoothstep(g-.15,g,grow*1.15);}
      else{vec3 o=vec3(ss*3.1,ss*1.7,ss*2.3);float f=pt<4.5?fbm(q*2.4+o):pt<5.5?1.-abs(fbm(q*2.+o)*2.-1.):pt<6.5?vn(q*10.+o):1.-fract(length(q-h33(vec3(ss,2.,5.)))*2.5-ph*.6);
        if(pt>4.5&&pt<5.5)f=pow(f,10.);float th=1.-mix(lp,lim,grow);v=smoothstep(th-.05,th+.05,f);}
      v*=dec;float fr=v*(1.-v)*4.;color.rgb=mix(color.rgb*(1.-dk),color.rgb,v)+cs*fr*.7;color.rgb=mix(c0,color.rgb,msk(14));}
    // Outline: the object's silhouette, as seen from the projector, lights up.
    if(foutl.x>0.){vec3 c0=color.rgb;vec3 wn=normalize(wnrm),v=normalize(eye-wpos);float o=smoothstep(1.-foutl.y,1.,1.-abs(dot(wn,v)))*foutl.x;color.rgb=mix(color.rgb*(1.-.4*min(foutl.x,1.)),cs,min(o*2.5,1.));color.rgb=mix(c0,color.rgb,msk(9));}
    // Explode gaps and Build growth stay inside each face's outline: the face shows only its inner part.
    {float ce=explode.y*.12*msk(3),cb=(1.-bgrow)*.34*msk(2),ae=fwidth(em),ab=fwidth(bm);if(ce>0.)color*=smoothstep(ce*.7,ce*1.3+ae*1.5,em);if(cb>0.)color*=smoothstep(cb*.7,cb*1.3+ab*1.5,bm);if(bgrow<1.&&bgrow>0.){float mx=max(color.r,max(color.g,color.b));if(mx>1e-4)color.rgb=mix(color.rgb,color.rgb/mx*color.a,bglow*msk(2));}}
    // Edges: crease edges (flag bits) drawn by distance to the triangle side, in pixels.
    if(edge.x>.5){vec4 e0=color;int f=int(eflags+.5);float e=0.,h=upAxis==1?(obj.z-lo.z)/span.z:(obj.y-lo.y)/span.y;
      for(int i=0;i<3;i++){if(((f>>i)&1)==0)continue;float d=bary[i]/max(fwidth(bary[i]),1e-6),a=1.-smoothstep(edge.z*.5-.75,edge.z*.5+.75,d),I=edge.w;
        if(edge.y>.5&&edge.y<1.5){float b1=bary[(i+1)%3],b2=bary[(i+2)%3],ph=fract(b2/max(b1+b2,1e-6)-time*edge2.x*.8+frnd);I*=smoothstep(0.,.04,ph)*(1.-smoothstep(.32,.38,ph));}
        else if(edge.y>1.5){float pos=fract(time*edge2.x*.3)*1.4-.2;I*=.12+1.2*exp(-pow((h-pos)/.07,2.));}
        e=max(e,a*min(I,1.5));}
      float mx=max(color.r,max(color.g,color.b));vec3 ec=mx>1e-4?color.rgb/mx*min(1.,mx*2.5):vec3(0);color=vec4(color.rgb*edge2.z,color.a*max(edge2.z,.001));color.rgb=mix(color.rgb,ec,min(e,1.));color.a=max(color.a,min(e,1.));color=mix(e0,color,msk(1));}
    // Impact: Flash bursts over the object and breaks off cell by cell, Glitch tears blocks (some flip colour or go dark), Slam blacks it out and snaps the cells back.
    if(fimp.x>0.||fimp.y>0.||fimp.w>0.){float im=msk(15),k=vkey(oq()*4.+fimp.z*.37);
      if(gk>.5)color.rgb=mix(color.rgb,k>.6?color.gbr*1.4:k>.3?color.rgb*.12:color.rgb,im);
      if(fimp.w>0.){float v=smoothstep(k-.06,k+.06,1.-fimp.w);color.rgb=mix(color.rgb,color.rgb*v+cs*v*(1.-v)*2.4,im);}
      if(fimp.x>0.){float f=pow(fimp.x,1.+k*3.)*im;color.rgb=mix(color.rgb,mix(vec3(1),cs,.15),f);color.a=max(color.a,f);}}
    // Post: brightness and contrast on the picture (premultiplied, so outside the mesh stays clear).
    if(fpost.x!=0.||fpost.y!=0.){color.rgb=clamp((color.rgb-.5*color.a)*(1.+fpost.y)+.5*color.a+fpost.x*color.a,0.,1.)*step(.001,color.a);}
    // While tagging, tagged parts are tinted in their tag's colour.
    if(tagShow&&pass==0){int t=tagAt();if(t>0){vec3 tc=t==1?vec3(.3,.75,1):t==2?vec3(1,.75,.25):t==3?vec3(.45,1,.45):vec3(1,.35,.8);float a=max(color.a,.55);color=vec4(mix(color.rgb,tc*a,.6),a);}}}`));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));const uniforms={};for(const k of ['camTex','tagTex','tagShow','fstep','felem','fzoom','fmap','fpres','fsoft','fseed','fecho','hist','fmorph','fpost','fband','frev','frev2','fimp','fflow','fscan','fshock','fflick','fsnake','foutl','fcurv','flight','time','disp','explode','build','edge','edge2','vp','scale','picture','mode','wire','size','lo','span','upAxis','objectOffset','objectSize','fade','tile','boxRot','boxMove','boxScale','latRes','lat','objRot','pivot','objMove','objScale','posTex','pass','aoOn','aoStrength','aoRadius','pxScale','eye','aoTex'])uniforms[k]=gl.getUniformLocation(p,k);const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.MIRRORED_REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.MIRRORED_REPEAT);return {canvas,gl,p,uniforms,tex,buffer:gl.createBuffer(),position:gl.getAttribLocation(p,'position'),uv:gl.getAttribLocation(p,'uv'),normal:gl.getAttribLocation(p,'normal'),fcenter:gl.getAttribLocation(p,'fcenter'),fnormal:gl.getAttribLocation(p,'fnormal'),fmeta:gl.getAttribLocation(p,'fmeta'),fA:gl.getAttribLocation(p,'fA'),fB:gl.getAttribLocation(p,'fB'),fC:gl.getAttribLocation(p,'fC'),fxBuffer:gl.createBuffer(),fxData:null,mesh:null};}
export function cameraPose(s,time=0){if(s.track&&s.trackOn)return sampleTrack(s.track,s.playing?(s.sync?time:performance.now()/1000)*s.speed+s.offset:s.hold);const c=s.camera,a=c.yaw*Math.PI/180,b=c.pitch*Math.PI/180,r=c.roll*Math.PI/180,cp=Math.cos(b),sp=Math.sin(b),ca=Math.cos(a),sa=Math.sin(a),cr=Math.cos(r),sr=Math.sin(r),right=[ca,0,-sa],up=[-sa*sp,cp,-ca*sp],back=[sa*cp,sp,ca*cp],m=I4();for(let i=0;i<3;i++){m[i]=right[i]*cr+up[i]*sr;m[i+4]=up[i]*cr-right[i]*sr;m[i+8]=back[i];m[i+12]=c.target[i]*s.scale+back[i]*c.distance;}return {matrix:Array.from(m),focal:c.focal};}
// Animated glTF: the mesh is re-posed from its rig (≤30 times a second), keeping UVs, rest bounds and the welded smooth normals.
function rig(m,g,faces){const weld=new Int32Array(g.verts.length),ids=new Map(),key=v=>v.map((x,k)=>Math.round((x-g.lo[k])/g.span[k]*1e5)).join();
  g.verts.forEach((v,i)=>{const k=key(v);let id=ids.get(k);if(id===undefined){id=ids.size;ids.set(k,id);}weld[i]=id;});
  return {m,faces,weld,groups:ids.size,clips:m.clips.map((c,i)=>({name:c.name||'Clip '+(i+1),duration:c.duration})),cache:null};}
export function clipsOf(g){return g?.rig?.clips||[];}
export function modelClips(s){return clipsOf(models.get(s.modelKey||s.model));}
function posed(g,s,time){const R=g.rig;if(!R||!s.anim.on)return g;const c=Math.min(s.anim.clip,R.clips.length-1),dur=R.clips[c].duration||1,t=((time*s.anim.speed)%dur+dur)%dur,q=Math.round(t*30);
  if(R.cache&&R.cache.c===c&&R.cache.q===q)return R.cache.g;
  const pos=rawPose(R.m,c,q/30).pos,F=R.faces,acc=new Float32Array(R.groups*3),data=new Float32Array(g.data),lines=new Float32Array(F.length*18);
  for(const f of F){const a=f[0]*3,b=f[1]*3,d=f[2]*3,ex=pos[b]-pos[a],ey=pos[b+1]-pos[a+1],ez=pos[b+2]-pos[a+2],hx=pos[d]-pos[a],hy=pos[d+1]-pos[a+1],hz=pos[d+2]-pos[a+2],nx=ey*hz-ez*hy,ny=ez*hx-ex*hz,nz=ex*hy-ey*hx;
    for(const i of f){const w=R.weld[i]*3;acc[w]+=nx;acc[w+1]+=ny;acc[w+2]+=nz;}}
  F.forEach((f,fi)=>{for(let j=0;j<3;j++){const i=f[j],o=(fi*3+j)*8,w=R.weld[i]*3,l=Math.hypot(acc[w],acc[w+1],acc[w+2])||1;data[o]=pos[i*3];data[o+1]=pos[i*3+1];data[o+2]=pos[i*3+2];data[o+5]=acc[w]/l;data[o+6]=acc[w+1]/l;data[o+7]=acc[w+2]/l;
    const e=f[(j+1)%3],lo=(fi*3+j)*6;lines[lo]=pos[i*3];lines[lo+1]=pos[i*3+1];lines[lo+2]=pos[i*3+2];lines[lo+3]=pos[e*3];lines[lo+4]=pos[e*3+1];lines[lo+5]=pos[e*3+2];}});
  const out={...g,data,lines,base:g};R.cache={c,q,g:out};return out;}
export const meshOf=(s,time)=>{const g=models.get(s.modelKey||s.model)||primitive(s.primitive);return time===undefined?g:posed(g,s,time);};
function viewProj(s,W,H,time){const cal=calibrated(s);if(cal)return cal;const pose=cameraPose(s,time),m=pose.matrix,v=I4();for(let i=0;i<3;i++)for(let j=0;j<3;j++)v[i*4+j]=m[j*4+i];for(let j=0;j<3;j++)v[12+j]=-(v[j]*m[12]+v[4+j]*m[13]+v[8+j]*m[14]);const f=2*pose.focal/36,n=Math.max(1e-6,Math.hypot(...s.camera.target.map((t,i)=>m[12+i]-t*s.scale))*.001),far=Math.max(100,n*1e7),P=new Float32Array([f,0,0,0,0,f*W/H,0,0,-2*s.camera.panX,-2*s.camera.panY,-(far+n)/(far-n),-1,0,0,-2*far*n/(far-n),0]);return {vp:mul(P,v),m,f};}
const up=(a,v)=>a==='Z'?[v[0],v[2],-v[1]]:v;
// Projector calibration: pairs of a point on the model and where it really lands on the object (as a fraction of the output).
// With 6 or more, a direct linear transform (DLT) solves the projector's full 3×4 camera, lens shift and all, which then
// replaces the hand-set camera. The solved camera is also split into an eye position and focal for lighting and AO.
function eigMin(a,n){const v=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>+(i===j)));
  for(let sweep=0;sweep<80;sweep++){let off=0;for(let p=0;p<n;p++)for(let q=p+1;q<n;q++)off+=a[p][q]**2;if(off<1e-24)break;
    for(let p=0;p<n;p++)for(let q=p+1;q<n;q++){if(Math.abs(a[p][q])<1e-300)continue;const th=(a[q][q]-a[p][p])/(2*a[p][q]),t=(th>=0?1:-1)/(Math.abs(th)+Math.sqrt(th*th+1)),c=1/Math.sqrt(t*t+1),sn=t*c;
      for(let k=0;k<n;k++){const x=a[k][p],y=a[k][q];a[k][p]=c*x-sn*y;a[k][q]=sn*x+c*y;}
      for(let k=0;k<n;k++){const x=a[p][k],y=a[q][k];a[p][k]=c*x-sn*y;a[q][k]=sn*x+c*y;}
      for(let k=0;k<n;k++){const x=v[k][p],y=v[k][q];v[k][p]=c*x-sn*y;v[k][q]=sn*x+c*y;}}}
  let m=0;for(let i=1;i<n;i++)if(a[i][i]<a[m][m])m=i;return v.map(r=>r[m]);}
export function solveDLT(X,U){const n=X.length;if(n<6||U.length!==n)return null;
  const cx=[0,1,2].map(k=>X.reduce((a,p)=>a+p[k],0)/n),cu=[0,1].map(k=>U.reduce((a,p)=>a+p[k],0)/n),
    sx=Math.sqrt(3)/(X.reduce((a,p)=>a+Math.hypot(p[0]-cx[0],p[1]-cx[1],p[2]-cx[2]),0)/n||1),su=Math.SQRT2/(U.reduce((a,p)=>a+Math.hypot(p[0]-cu[0],p[1]-cu[1]),0)/n||1);
  const M=Array.from({length:12},()=>new Array(12).fill(0)),add=r=>{for(let i=0;i<12;i++)if(r[i])for(let j=0;j<12;j++)M[i][j]+=r[i]*r[j];};
  for(let i=0;i<n;i++){const x=X[i].map((v,k)=>(v-cx[k])*sx),u=(U[i][0]-cu[0])*su,v=(U[i][1]-cu[1])*su;
    add([...x,1,0,0,0,0,...x.map(t=>-u*t),-u]);add([0,0,0,0,...x,1,...x.map(t=>-v*t),-v]);}
  const p=eigMin(M,12),Pn=[p.slice(0,4),p.slice(4,8),p.slice(8,12)];
  // Undo the normalisations: P = Tu⁻¹ · Pn · Tx.
  const PT=Pn.map(r=>[r[0]*sx,r[1]*sx,r[2]*sx,r[3]-sx*(r[0]*cx[0]+r[1]*cx[1]+r[2]*cx[2])]);
  const P=[PT[0].map((v,j)=>v/su+cu[0]*PT[2][j]),PT[1].map((v,j)=>v/su+cu[1]*PT[2][j]),PT[2]];
  const z=X.reduce((a,x)=>a+P[2][0]*x[0]+P[2][1]*x[1]+P[2][2]*x[2]+P[2][3],0),k=(z<0?-1:1)/(Math.hypot(P[2][0],P[2][1],P[2][2])||1);
  return P.map(r=>r.map(v=>v*k));}
const calibCache=new Map();
export function calibPoints(s){const g=meshOf(s),o=objectFrame(s,g);return (s.calib?.pts||[]).map(c=>({world:toWorld(s,g,o,c.q),t:c.t}));}
function calibrated(s){const C=s.calib;if(!C?.use||(C.pts?.length||0)<6)return null;
  const key=JSON.stringify([C.pts,s.xf,s.scale,s.upAxis,s.model,s.primitive]);let r=calibCache.get(key);if(r)return r;
  const pts=calibPoints(s),P=solveDLT(pts.map(p=>p.world),pts.map(p=>p.t));if(!P||!P.flat().every(Number.isFinite))return null;
  const d=pts.map(p=>P[2][0]*p.world[0]+P[2][1]*p.world[1]+P[2][2]*p.world[2]+P[2][3]),near=Math.max(1e-6,Math.min(...d)*.01),far=Math.max(near*10,Math.max(...d)*1000),
    A=(far+near)/(far-near),B=-2*far*near/(far-near),rows=[P[0].map((v,j)=>2*v-P[2][j]),P[1].map((v,j)=>P[2][j]-2*v),P[2].map((v,j)=>A*v+(j===3?B:0)),P[2]],vp=new Float32Array(16);
  for(let r=0;r<4;r++)for(let c=0;c<4;c++)vp[c*4+r]=rows[r][c];
  // Eye = the camera centre (M·C = −p4); its axes from the rows; focal from the horizontal row.
  const Mx=P.map(r=>r.slice(0,3)),inv=inv3(Mx),eye=inv?[0,1,2].map(i=>-(inv[i][0]*P[0][3]+inv[i][1]*P[1][3]+inv[i][2]*P[2][3])):[0,0,0],fwd=P[2].slice(0,3),
    dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],orth=a=>{const t=dot(a,fwd);return a.map((x,i)=>x-t*fwd[i]);},nrm=a=>{const l=Math.hypot(...a)||1;return a.map(x=>x/l);},
    a1=rows[0].slice(0,3),right=nrm(orth(a1)),back=fwd.map(x=>-x),upv=[back[1]*right[2]-back[2]*right[1],back[2]*right[0]-back[0]*right[2],back[0]*right[1]-back[1]*right[0]],
    m=[...right,0,...upv,0,...back,0,...eye,1],f=Math.hypot(...orth(a1));
  const err=pts.reduce((a,p)=>{const w=dot(P[2],p.world)+P[2][3];return a+Math.hypot((dot(P[0],p.world)+P[0][3])/w-p.t[0],(dot(P[1],p.world)+P[1][3])/w-p.t[1]);},0)/pts.length;
  r={vp,m,f,P,err};calibCache.set(key,r);if(calibCache.size>32)calibCache.delete(calibCache.keys().next().value);return r;}
function inv3(m){const [a,b,c]=m,d=a[0]*(b[1]*c[2]-b[2]*c[1])-a[1]*(b[0]*c[2]-b[2]*c[0])+a[2]*(b[0]*c[1]-b[1]*c[0]);if(Math.abs(d)<1e-30)return null;
  return [[(b[1]*c[2]-b[2]*c[1])/d,(a[2]*c[1]-a[1]*c[2])/d,(a[1]*b[2]-a[2]*b[1])/d],[(b[2]*c[0]-b[0]*c[2])/d,(a[0]*c[2]-a[2]*c[0])/d,(a[2]*b[0]-a[0]*b[2])/d],[(b[0]*c[1]-b[1]*c[0])/d,(a[1]*c[0]-a[0]*c[1])/d,(a[0]*b[1]-a[1]*b[0])/d]];}
// The calibration pairs on screen: where each model point lands with the current camera, and where it should land.
export function calibHandles(s,W,H,time=0){const {vp}=viewProj(s,W,H,time);return calibPoints(s).map((p,i)=>{const w=p.world,c=[0,1,2,3].map(r=>vp[r]*w[0]+vp[4+r]*w[1]+vp[8+r]*w[2]+vp[12+r]);
  return {i,x:(c[0]/c[3]+1)/2*W,y:(1-c[1]/c[3])/2*H,front:c[3]>0,tx:p.t[0]*W,ty:p.t[1]*H};});}
// The webcam's movement (unit 4) and the part tag table (unit 5).
const tagTables=new WeakMap();
export function tagTable(s){const T=s.tags;if(!T?.length)return null;let t=tagTables.get(T);if(!t){t=new Uint8Array(128*79);for(const [k,v] of T)if(k>=0&&k<t.length)t[k]=v;tagTables.set(T,t);}return t;}
function liveTextures(R,s,sig,u){const gl=R.gl;
  if(!R.camTex){R.camTex=gl.createTexture();R.tagTex=gl.createTexture();for(const [unit,t] of [[4,R.camTex],[5,R.tagTex]]){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);
      gl.texImage2D(gl.TEXTURE_2D,0,unit===4?gl.RGBA:gl.R8,1,1,0,unit===4?gl.RGBA:gl.RED,gl.UNSIGNED_BYTE,new Uint8Array(unit===4?4:1));for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,unit===4?gl.LINEAR:gl.NEAREST],[gl.TEXTURE_MAG_FILTER,unit===4?gl.LINEAR:gl.NEAREST],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,k,v);}}
  const F=s.fx,used=m=>FX_KEYS.some(k=>(F?.[k]?.on||R.fades?.get(s.id||'_')?.lv?.[k]>.001)&&F[k].map===m);
  if(sig?.cam&&R.camSeen!==sig.cam.stamp&&(used('camera')||F?.auto?.on)){R.camSeen=sig.cam.stamp;gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,R.camTex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,sig.cam.canvas);}
  const T=tagTable(s);if(R.tagNow!==T){R.tagNow=T;gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,R.tagTex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
    if(T)gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,128,79,0,gl.RED,gl.UNSIGNED_BYTE,T);else gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,1,1,0,gl.RED,gl.UNSIGNED_BYTE,new Uint8Array(1));gl.pixelStorei(gl.UNPACK_ALIGNMENT,4);}
  gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,R.camTex);gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,R.tagTex);gl.activeTexture(gl.TEXTURE0);
  gl.uniform1i(u.camTex,4);gl.uniform1i(u.tagTex,5);gl.uniform1i(u.tagShow,sig?.tagShow===s.id?1:0);}
export function calibError(s,W,H){const c=calibrated(s);return c?c.err*Math.max(W,H):null;}
// The model point under an output pixel (a ray through the current camera against every triangle), in model coordinates.
export function pickPoint(s,W,H,x,y,time=0){return pickHit(s,W,H,x,y,time)?.q||null;}
// The tag key of the part under an output pixel (or -1).
export function pickPart(s,W,H,x,y,time=0){const h=pickHit(s,W,H,x,y,time);if(!h)return -1;const b=facetData(s);return Math.round(b[h.f*57+9]*10007);}
function pickHit(s,W,H,x,y,time=0){const g=meshOf(s,time),o=objectFrame(s,g),{vp}=viewProj(s,W,H,time),iv=inv4(vp);if(!iv)return null;
  const un=z=>{const p=[(x/W)*2-1,1-(y/H)*2,z,1],c=[0,1,2,3].map(r=>iv[r]*p[0]+iv[4+r]*p[1]+iv[8+r]*p[2]+iv[12+r]*p[3]);return c.slice(0,3).map(v=>v/c[3]);};
  const a=un(-1),b=un(1),dir=b.map((v,i)=>v-a[i]),D=g.data;let best=Infinity,hit=null;
  for(let i=0;i+23<D.length;i+=24){const t=[0,1,2].map(j=>toWorld(s,g,o,[D[i+j*8],D[i+j*8+1],D[i+j*8+2]])),e1=t[1].map((v,k)=>v-t[0][k]),e2=t[2].map((v,k)=>v-t[0][k]),
      pv=[dir[1]*e2[2]-dir[2]*e2[1],dir[2]*e2[0]-dir[0]*e2[2],dir[0]*e2[1]-dir[1]*e2[0]],det=e1[0]*pv[0]+e1[1]*pv[1]+e1[2]*pv[2];if(Math.abs(det)<1e-30)continue;
    const tv=a.map((v,k)=>v-t[0][k]),u=(tv[0]*pv[0]+tv[1]*pv[1]+tv[2]*pv[2])/det;if(u<0||u>1)continue;const qv=[tv[1]*e1[2]-tv[2]*e1[1],tv[2]*e1[0]-tv[0]*e1[2],tv[0]*e1[1]-tv[1]*e1[0]],
      w=(dir[0]*qv[0]+dir[1]*qv[1]+dir[2]*qv[2])/det;if(w<0||u+w>1)continue;const d=(e2[0]*qv[0]+e2[1]*qv[1]+e2[2]*qv[2])/det;
    if(d>=0&&d<best){best=d;hit={f:i/24,q:[0,1,2].map(k=>D[i+k]*(1-u-w)+D[i+8+k]*u+D[i+16+k]*w)};}}
  return hit;}
function inv4(m){const a=Array.from(m),r=new Array(16),A=(i,j)=>a[j*4+i];
  // Gauss-Jordan on a row-major copy.
  const M=[0,1,2,3].map(i=>[A(i,0),A(i,1),A(i,2),A(i,3),+(i===0),+(i===1),+(i===2),+(i===3)]);
  for(let c=0;c<4;c++){let p=c;for(let i=c+1;i<4;i++)if(Math.abs(M[i][c])>Math.abs(M[p][c]))p=i;if(Math.abs(M[p][c])<1e-30)return null;[M[c],M[p]]=[M[p],M[c]];
    const d=M[c][c];for(let j=0;j<8;j++)M[c][j]/=d;for(let i=0;i<4;i++)if(i!==c){const f=M[i][c];for(let j=0;j<8;j++)M[i][j]-=f*M[c][j];}}
  for(let i=0;i<4;i++)for(let j=0;j<4;j++)r[j*4+i]=M[i][4+j];return r;}
// Object transform: rotate/scale about the object's centre, move in units of its size.
function objectFrame(s,g){const missing=!!s.model&&!hasModel(s),size=missing?Math.max(.001,s.camera.distance/6):1,offset=missing?s.camera.target:[0,0,0],c=up(s.upAxis,g.lo.map((l,k)=>l+g.span[k]/2)).map((x,k)=>x*size+offset[k]),unit=Math.max(...g.span)*size,R=boxMatrix(s.xf),rotT=new Float32Array([R[0],R[3],R[6],R[1],R[4],R[7],R[2],R[5],R[8]]);
  return {size,offset,pivot:c,move:[s.xf.x*unit,s.xf.y*unit,s.xf.z*unit],R,rotT};}
const xfScale=t=>[t.scale*(t.sx??1),t.scale*(t.sy??1),t.scale*(t.sz??1)];
const apply=(R,v)=>[R[0]*v[0]+R[1]*v[1]+R[2]*v[2],R[3]*v[0]+R[4]*v[1]+R[5]*v[2],R[6]*v[0]+R[7]*v[1]+R[8]*v[2]];
function toWorld(s,g,o,q){const w=up(s.upAxis,q).map((x,k)=>x*o.size+o.offset[k]),S=xfScale(s.xf),r=apply(o.R,w.map((x,k)=>(x-o.pivot[k])*S[k]));return r.map((x,k)=>(o.pivot[k]+x+o.move[k])*s.scale);}
// Lattice handles in output pixels (for the overlay), in the same pose the frame was drawn with.
export function latticeHandles(s,W,H,time=0){const L=s.lattice;if(!L?.res)return [];const g=meshOf(s),o=objectFrame(s,g),{vp}=viewProj(s,W,H,time),n=L.res,out=[];
  for(let i=0;i<n;i++)for(let j=0;j<n;j++)for(let k=0;k<n;k++){const id=(i*n+j)*n+k,q=[i,j,k].map((t,a)=>g.lo[a]+g.span[a]*(t/(n-1)+L.d[id*3+a])),w=toWorld(s,g,o,q),c=[0,1,2,3].map(r=>vp[r]*w[0]+vp[4+r]*w[1]+vp[8+r]*w[2]+vp[12+r]);
    out.push({id,ijk:[i,j,k],x:(c[0]/c[3]+1)/2*W,y:(1-c[1]/c[3])/2*H,depth:c[3],front:c[3]>0});}
  return out;}
// Drag a lattice handle by (dx,dy) output pixels in the camera's view plane; returns the new offsets.
export function latticeDrag(s,d0,id,depth,dx,dy,W,H,time=0){const g=meshOf(s),o=objectFrame(s,g),{m,f}=viewProj(s,W,H,time),k=2*depth/(f*W),wd=[0,1,2].map(a=>(m[a]*dx-m[4+a]*dy)*k/s.scale);
  const local=[0,1,2].map(a=>o.R[a]*wd[0]+o.R[3+a]*wd[1]+o.R[6+a]*wd[2]).map((x,k)=>x/xfScale(s.xf)[k]/o.size),q=s.upAxis==='Z'?[local[0],-local[2],local[1]]:local,d=[...d0];
  for(let a=0;a<3;a++)d[id*3+a]=Math.max(-2,Math.min(2,Math.round((d0[id*3+a]+q[a]/g.span[a])*1e4)/1e4));return d;}
// Transform gizmo: screen geometry for moving / rotating / scaling the Object or the projection Box, and the drag
// math that turns a pointer drag on one of its handles into new transform values. Rotation rings are gimbal axes
// (R = Rz·Ry·Rx), so dragging a ring changes exactly one Euler angle and turns about the axis it is drawn around.
const MOVE_LEN=.35,wrap=a=>((a+180)%360+360)%360-180,cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=v=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l);};
function gizmoFrame(s,target,W,H,time){
  const g=meshOf(s),o=objectFrame(s,g),{vp}=viewProj(s,W,H,time),scr=w=>{const c=[0,1,2,3].map(r=>vp[r]*w[0]+vp[4+r]*w[1]+vp[8+r]*w[2]+vp[12+r]);return [(c[0]/c[3]+1)/2*W,(1-c[1]/c[3])/2*H,c[3]];};
  if(target==='box'){const b=s.box,R=boxMatrix(b),S=[b.sx,b.sy,b.sz].map(v=>v*b.scale);
    return {R,S,c:[b.x,b.y,b.z],ring:.62*Math.max(...S,.3),toScreen:n=>scr(toWorld(s,g,o,n.map((x,k)=>g.lo[k]+g.span[k]*(x+.5))))};}
  const unit=Math.max(...g.span)*o.size,S=xfScale(s.xf),ext=up(s.upAxis,g.span).map((x,k)=>Math.max(.16,Math.abs(x)*o.size*S[k]/unit));
  return {R:o.R,S:ext,c:[0,1,2].map(k=>(o.pivot[k]+o.move[k])/unit),ring:.62*Math.max(...ext,.3),toScreen:p=>scr(p.map(x=>x*unit*s.scale))};
}
export function gizmo(s,target,W,H,time=0){
  const F=gizmoFrame(s,target,W,H,time),c=F.toScreen(F.c),E=[[1,0,0],[0,1,0],[0,0,1]],at=(v,k=1)=>F.toScreen(F.c.map((x,i)=>x+v[i]*k));
  const col=a=>[F.R[a],F.R[3+a],F.R[6+a]];
  const move=E.map(e=>at(e,MOVE_LEN)),scale=[0,1,2].map(a=>at(col(a),F.S[a]/2));
  const T=target==='box'?s.box:s.xf,Rz=boxMatrix({rx:0,ry:0,rz:T.rz}),Ryz=boxMatrix({rx:0,ry:T.ry,rz:T.rz});
  const axes=[apply(Ryz,[1,0,0]),apply(Rz,[0,1,0]),[0,0,1]];
  const rings=axes.map(ax=>{const u=norm(cross(ax,Math.abs(ax[0])<.9?[1,0,0]:[0,1,0])),v=cross(ax,u),pts=[];
    for(let i=0;i<=48;i++){const t=i/48*Math.PI*2;pts.push(at(u.map((x,k)=>x*Math.cos(t)+v[k]*Math.sin(t)),F.ring));}
    const a=pts[0],b=pts[2],sign=Math.sign((a[0]-c[0])*(b[1]-c[1])-(a[1]-c[1])*(b[0]-c[0]))||1;return {pts,sign};});
  const corners=[];for(let i=0;i<8;i++)corners.push(at(apply(F.R,[(i&1?.5:-.5)*F.S[0],(i&2?.5:-.5)*F.S[1],(i&4?.5:-.5)*F.S[2]])));
  const flat=p=>[p[0],p[1]];
  return {c:flat(c),front:c[2]>0,move:move.map(flat),scale:scale.map(flat),rings:rings.map(r=>({pts:r.pts.map(flat),sign:r.sign})),corners:corners.map(flat),edges:[[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]]};
}
// Which gizmo handle is under (x,y) output pixels: {tool,axis} or null. axis 3 = uniform scale (the centre square).
export function gizmoHit(G,tool,x,y,tol=10){
  const seg=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);},P=[x,y];
  let best=null,bd=tol;const try_=(d,axis)=>{if(d<bd){bd=d;best={tool,axis};}};
  if(tool==='scale'){try_(Math.max(Math.abs(x-G.c[0]),Math.abs(y-G.c[1]))-2,3);G.scale.forEach((t,a)=>try_(Math.min(seg(P,G.c,t),Math.hypot(x-t[0],y-t[1])-3),a));}
  else if(tool==='move')G.move.forEach((t,a)=>try_(seg(P,G.c,t),a));
  else if(tool==='rotate')G.rings.forEach((r,a)=>{let d=1e9;for(let i=1;i<r.pts.length;i++)d=Math.min(d,seg(P,r.pts[i-1],r.pts[i]));try_(d,a);});
  return best;
}
// New transform values (Object xf or Box) after dragging handle h from p0 to p1 (output pixels). s0 is the surface when the drag began.
export function gizmoDrag(s0,target,h,p0,p1,W,H,time=0){
  const G=gizmo(s0,target,W,H,time),t0=target==='box'?s0.box:s0.xf,t={...t0},d=[p1[0]-p0[0],p1[1]-p0[1]],a=h.axis,K='xyz'[a];
  const along=tip=>{const v=[tip[0]-G.c[0],tip[1]-G.c[1]];return (d[0]*v[0]+d[1]*v[1])/(v[0]*v[0]+v[1]*v[1]||1);};
  const lim=target==='box'?[2,.05,20]:[10,.01,100],r4=v=>Math.round(v*1e4)/1e4;
  if(h.tool==='move')t[K]=r4(Math.max(-lim[0],Math.min(lim[0],t0[K]+along(G.move[a])*MOVE_LEN)));
  else if(h.tool==='scale'){if(a===3)t.scale=r4(Math.max(lim[1],Math.min(lim[2],t0.scale*Math.exp((d[0]-d[1])/160))));
    else t['s'+K]=r4(Math.max(lim[1],Math.min(lim[2],t0['s'+K]*Math.max(.02,1+along(G.scale[a])))));}
  else if(h.tool==='rotate'){const ang=p=>Math.atan2(p[1]-G.c[1],p[0]-G.c[0])*180/Math.PI;t['r'+K]=Math.round(wrap(t0['r'+K]+wrap(ang(p1)-ang(p0))*G.rings[a].sign)*10)/10;}
  return t;
}
// Position target for the AO prepass (float colour buffers); null when the GPU cannot render to one.
function aoTarget(R,W,H){const gl=R.gl;if(R.aoFail)return null;
  if(!R.ao){if(!gl.getExtension('EXT_color_buffer_float')){R.aoFail=true;return null;}R.ao={tex:gl.createTexture(),depth:gl.createRenderbuffer(),fb:gl.createFramebuffer(),occ:gl.createTexture(),fb2:gl.createFramebuffer(),w:0,h:0};}
  const A=R.ao;if(A.w!==W||A.h!==H){gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,A.tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,W,H,0,gl.RGBA,gl.FLOAT,null);for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.NEAREST],[gl.TEXTURE_MAG_FILTER,gl.NEAREST],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,k,v);gl.bindTexture(gl.TEXTURE_2D,A.occ);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,W,H,0,gl.RGBA,gl.UNSIGNED_BYTE,null);for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.NEAREST],[gl.TEXTURE_MAG_FILTER,gl.NEAREST],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,k,v);gl.bindTexture(gl.TEXTURE_2D,null);gl.activeTexture(gl.TEXTURE0);
    gl.bindRenderbuffer(gl.RENDERBUFFER,A.depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,W,H);gl.bindFramebuffer(gl.FRAMEBUFFER,A.fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,A.tex,0);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,A.depth);
    let ok=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;gl.bindFramebuffer(gl.FRAMEBUFFER,A.fb2);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,A.occ,0);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,A.depth);ok=ok&&gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;gl.bindFramebuffer(gl.FRAMEBUFFER,null);if(!ok){R.aoFail=true;return null;}A.w=W;A.h=H;}
  return A;}
// Per-face data for the mesh animations: centre, face normal, a random value and which of its 3 sides are crease edges.
// Topology (welded neighbours and the angle across each side) is computed once per mesh; animated poses reuse it.
const topos=new WeakMap(),facetCache=new WeakMap();
function topology(g){let t=topos.get(g);if(t)return t;const D=g.data,T=D.length/24,lo=g.lo,sp=g.span,weld=new Map(),vid=new Int32Array(T*3);
  for(let i=0;i<T*3;i++){const o=i*8,k=Math.round((D[o]-lo[0])/sp[0]*1e5)*1e10+Math.round((D[o+1]-lo[1])/sp[1]*1e5)*1e5+Math.round((D[o+2]-lo[2])/sp[2]*1e5);let w=weld.get(k);if(w===undefined){w=weld.size;weld.set(k,w);}vid[i]=w;}
  const fn=faceNormals(D,T),N=weld.size,edges=new Map(),cos=new Float32Array(T*3).fill(-2),nb=new Int32Array(T*3).fill(-1);
  for(let f=0;f<T;f++)for(let i=0;i<3;i++){const a=vid[f*3+(i+1)%3],b=vid[f*3+(i+2)%3];if(a===b)continue;const k=Math.min(a,b)*N+Math.max(a,b),o=edges.get(k);
    if(o===undefined)edges.set(k,f*3+i);else if(o>=0){const g2=Math.floor(o/3),c=fn[f*3]*fn[g2*3]+fn[f*3+1]*fn[g2*3+1]+fn[f*3+2]*fn[g2*3+2];cos[f*3+i]=cos[o]=Math.abs(c)>1?Math.sign(c):c;nb[f*3+i]=g2;nb[o]=f;edges.set(k,-1);}else{cos[f*3+i]=-2;}}
  // Snake order: a depth-first walk, so consecutive faces are mostly neighbours.
  const order=new Float32Array(T),seen=new Uint8Array(T);let n=0;for(let s0=0;s0<T;s0++){if(seen[s0])continue;const st=[s0];while(st.length){const f=st.pop();if(seen[f])continue;seen[f]=1;order[f]=n++/T;for(let i=2;i>=0;i--){const q=nb[f*3+i];if(q>=0&&!seen[q])st.push(q);}}}
  // Parts: separate meshes and regions split by sharp (over 30°) edges, each with its own random value.
  const par=new Int32Array(T).map((_,i)=>i),root=i=>{while(par[i]!==i)i=par[i]=par[par[i]];return i;},lim=Math.cos(Math.PI/6);
  for(let f=0;f<T;f++)for(let i=0;i<3;i++){const q=nb[f*3+i];if(q>=0&&cos[f*3+i]>=lim){const a=root(f),b=root(q);if(a!==b)par[a]=b;}}
  // A piece covering over a quarter of the mesh is split into patches (a 3×3×3 grid), so Parts still has pieces to pick.
  const cnt=new Map();for(let f=0;f<T;f++){const r=root(f);cnt.set(r,(cnt.get(r)||0)+1);}const GD=g.data,cell=f=>{let k=0;for(let a=0;a<3;a++){const c=(GD[f*24+a]+GD[f*24+8+a]+GD[f*24+16+a])/3;k=k*3+Math.min(2,Math.floor((c-lo[a])/sp[a]*3));}return k;};
  const part=new Float32Array(T);for(let f=0;f<T;f++){let h=Math.imul(root(f)*29+(cnt.get(root(f))>T/4?cell(f)+1:0)+7,2654435761)>>>0;h=(h^(h>>>16))>>>0;h=Math.imul(h,2246822519)>>>0;h=(h^(h>>>13))>>>0;part[f]=(h%10007)/10007;}
  t={cos,T,order,part};topos.set(g,t);return t;}
function faceNormals(D,T){const n=new Float32Array(T*3);for(let f=0;f<T;f++){const a=f*24,ex=D[a+8]-D[a],ey=D[a+9]-D[a+1],ez=D[a+10]-D[a+2],hx=D[a+16]-D[a],hy=D[a+17]-D[a+1],hz=D[a+18]-D[a+2];let x=ey*hz-ez*hy,y=ez*hx-ex*hz,z=ex*hy-ey*hx;const l=Math.hypot(x,y,z)||1;n[f*3]=x/l;n[f*3+1]=y/l;n[f*3+2]=z/l;}return n;}
function facets(g,angle){const c=facetCache.get(g);if(c&&c.angle===angle)return c.buf;const D=g.data,T=D.length/24,top=topology(g.base||g),fn=faceNormals(D,T),lim=Math.cos(angle*Math.PI/180),buf=new Float32Array(T*57);
  for(let f=0;f<T;f++){const a=f*24,b=f*57,cx=(D[a]+D[a+8]+D[a+16])/3,cy=(D[a+1]+D[a+9]+D[a+17])/3,cz=(D[a+2]+D[a+10]+D[a+18])/3;let h=Math.imul(f+1,2654435761)>>>0;h^=h>>>15;h=Math.imul(h,2246822519)>>>0;h=(h^(h>>>13))>>>0;
    let flags=0;for(let i=0;i<3;i++)if(top.cos[f*3+i]<lim)flags|=1<<i;
    for(let j=0;j<3;j++){const o=b+j*19;for(let v=0;v<3;v++)for(let d=0;d<3;d++)buf[o+10+v*3+d]=D[a+v*8+d];buf[o+8]=top.order[f]||0;buf[o+9]=top.part[f];buf[o]=cx;buf[o+1]=cy;buf[o+2]=cz;buf[o+3]=fn[f*3];buf[o+4]=fn[f*3+1];buf[o+5]=fn[f*3+2];buf[o+6]=(h%10007)/10007;buf[o+7]=flags;}}
  facetCache.set(g,{angle,buf});return buf;}
const ZERO_SIG={bands:{bass:0,mids:0,high:0,full:0},pulse:0};
// Turns the surface's fx settings and the music into shader uniforms.
// Fade (per effect): it eases in and out when switched, follows smoothed music, and Parts / Random picks crossfade.
function fadeState(R,s,F,time,test,B,pulse,seed){R.fades??=new Map();const id=s.id||'_';let st=R.fades.get(id);const dt=st?time-st.t:0,snap=!st||test||dt<0||dt>.5,ease=(a,b,up,down)=>snap?b:a+(b-a)*Math.min(1,dt*(b>a?up:down));
  if(!st){st={lv:{},b:{},p:0,seed:[seed,seed,1]};R.fades.set(id,st);if(R.fades.size>64)R.fades.delete(R.fades.keys().next().value);}st.t=time;st.dt=snap?0:dt;
  // Autopilot crossfades slower than a hand toggle.
  const fd=F.fd||(F.auto?.on?1.6:.8);
  for(const k of FX_KEYS){const to=F[k].on?1:0,a=st.lv[k]??to;st.lv[k]=snap||!F[k].fade?to:to>a?Math.min(to,a+dt/fd):Math.max(to,a-dt/fd);}
  for(const k of ['bass','mids','high','full'])st.b[k]=ease(st.b[k]??B[k],B[k],10,2.5);st.p=ease(st.p,pulse,14,2);
  const S=st.seed;if(seed!==S[1]){S[0]=snap?seed:S[1];S[1]=seed;S[2]=snap?1:0;}else S[2]=snap?1:Math.min(1,S[2]+dt/.6);return st;}
function fxUniforms(R,s,g,time,sig,test){const gl=R.gl,u=R.uniforms,F0=s.fx?.light?s.fx:cleanFx(s.fx),B0=sig?.bands||ZERO_SIG.bands,B=Object.fromEntries(['bass','mids','high','full'].map(k=>[k,Math.min(1,Math.max(0,+B0[k]||0))])),pulse=Math.min(1,Math.max(0,+sig?.pulse||0));
  // Parts and Random re-pick their pieces on every beat (and every few seconds without one).
  if(pulse>.8&&!(R.lastPulse>.8))R.beats=(R.beats||0)+1;R.lastPulse=pulse;const rp=F0.repick||'auto',seed=rp==='auto'?(R.beats||0)+Math.floor(time/3)*17:Math.floor((R.beats||0)/+rp);
  const st=fadeState(R,s,F0,time,test,B,pulse,seed),F=Object.fromEntries(FX_KEYS.map(k=>[k,{...F0[k],on:F0[k].on||st.lv[k]>.001}])),soft=FX_KEYS.some(k=>F0[k].fade),
    lv=(fx,k)=>(F0[fx].fade?st.b:B)[k]??0,pu=fx=>F0[fx].fade?st.p:pulse,on=FX_KEYS.some(k=>F[k].on)||sig?.tagShow===s.id,drv=(fx,k)=>k==='beat'?pu(fx):k==='steady'||k==='hold'||k==='loop'?1:lv(fx,k);
  gl.uniform1f(u.time,time);gl.uniform1f(u.fstep,Number.isFinite(sig?.beat)?sig.beat:time*2);
  gl.uniform4f(u.disp,F.disp.on?F.disp.amount*(.15+lv('disp',F.disp.drive)*1.2):0,['ripple','swell','noise'].indexOf(F.disp.pattern),F.disp.speed,0);
  const ex=F.explode.on?(F.explode.drive==='hold'?1:F.explode.drive==='beat'?pu('explode'):lv('explode','bass')):0;gl.uniform2f(u.explode,ex*F.explode.amount,ex);
  let bp=1;if(F.build.on){if(F.build.drive==='level')bp=Math.min(1,lv('build','full')*1.6);else{const t=((time*F.build.speed)%1+1)%1;bp=t<.45?t/.45:t<.55?1:t<.95?1-(t-.55)/.4:0;}}
  gl.uniform3f(u.build,F.build.on?1:0,bp,['up','out','random'].indexOf(F.build.order));
  const L=lv('edges','full');gl.uniform4f(u.edge,F.edges.on?1:0,['pulse','trace','sweep'].indexOf(F.edges.mode),F.edges.width*(R.dpr||1),F.edges.mode==='pulse'?.3+L*1.6:1+L*.8);gl.uniform3f(u.edge2,F.edges.speed,0,F.edges.on?F.edges.fill:1);
  gl.uniform1fv(u.fmap,new Float32Array(FX_KEYS.map(k=>FX_MAPS.indexOf(F[k].map||'all'))));gl.uniform1fv(u.fpres,new Float32Array(FX_KEYS.map(k=>(F0[k].fade?st.lv[k]:1)*(F0[k].mix??1))));gl.uniform1fv(u.fsoft,new Float32Array(FX_KEYS.map(k=>F0[k].fade?1:0)));
  gl.uniform3f(u.fseed,...st.seed);const Bm=soft?st.b:B;gl.uniform4f(u.fband,Bm.bass,Bm.mids,Bm.high,seed);
  const Mo=F.morph;gl.uniform4f(u.fmorph,Mo.on?Mo.amount*(Mo.drive==='steady'?1:.3+lv('morph',Mo.drive)*1.4):0,['liquid','swirl','melt'].indexOf(Mo.style),Mo.scale,time*Mo.speed);
  const Ec=F.echo,eh=R.echoNow;gl.uniform4f(u.fecho,Ec.on&&eh?Ec.amount:0,eh?Math.min(23,eh.filled-1)*Ec.length*(Ec.drive==='steady'?1:.35+lv('echo',Ec.drive)*.9):0,eh?eh.head:0,['up','depth','out','random'].indexOf(Ec.style));
  const P=s.post||cleanPost();gl.uniform4f(u.fpost,P.bright,P.contrast,P.kaleido,time*P.kspin);
  const X=F.flow,Sc=F.scan,Sh=F.shock,Fl=F.flicker,Sn=F.snake,O=F.outline,C=F.curves,Li=F.light;
  // Flow travels by integrating its speed (eased by Fade), so fading or changing speed never jumps or races;
  // fading out it settles back to an equivalent position (the picture mirrors every 2, turns every 2π).
  const fl=st.fl??={on:false,p:0,a:0},flv=F0.flow.fade?st.lv.flow:1,P0=time*X.move*.25,A0=time*X.rotate*.1*6.2832;let fp=P0,fa=A0;
  if(!X.on)fl.on=false;
  else if(!test){if(!fl.on){fl.on=true;fl.p=P0;fl.a=A0;}else if(F0.flow.on){fl.p+=X.move*.25*st.dt;fl.a+=X.rotate*.1*6.2832*st.dt;}
    const wp=Math.round(fl.p/2)*2,wa=Math.round(fl.a/6.2832)*6.2832;fp=wp+(fl.p-wp)*flv;fa=wa+(fl.a-wa)*flv;}
  gl.uniform4f(u.fflow,X.on?1:0,fp,['up','side','diag'].indexOf(X.dir),fa);gl.uniform1f(u.fzoom,X.on?X.scale*(X.drive==='loop'?.5-.5*Math.cos(time*X.zspeed*Math.PI):drv('flow',X.drive)):0);
  gl.uniform3f(u.felem,...['explode','build','flicker'].map(k=>Math.max(0,FX_ELEMENTS.indexOf(F[k].el))));
  gl.uniform4f(u.fscan,Sc.on?.4+drv('scan',Sc.drive)*1.8:0,(((time*Sc.speed*.3)%1)+1)%1*1.4-.2,Sc.width,['up','across','depth'].indexOf(Sc.axis));
  const sb=Sh.drive==='beat';gl.uniform4f(u.fshock,Sh.on?(sb?pu('shock'):lv('shock',Sh.drive)):0,sb?1-pu('shock'):(time*.6)%1,Sh.width,['bottom','top','side'].indexOf(Sh.from));
  // Reveal steps on the beat clock (every 1, 2 or ½ beat) or on detected kicks.
  const Rv=F.reveal,bt=Number.isFinite(sig?.beat)?sig.beat:time*2,rk=Rv.drive==='kick',rb=bt/+Rv.every;
  gl.uniform4f(u.frev,Rv.on?1:0,rk?1-pu('reveal'):rb-Math.floor(rb),rk?(R.beats||0):Math.floor(rb),REVEAL_PATTERNS.indexOf(Rv.pattern));gl.uniform4f(u.frev2,Rv.amount,['beat','stack','swap'].indexOf(Rv.mode),Rv.dark,0);
  // Impact fires on a drop (the song map's, a jump in loudness, or Autopilot's), on every bar or on strong kicks, then decays over Length beats.
  const Im=F.impact,ist=st.imp??={n:0,t:-1e9,ef:0,es:0,pk:.35,ld:-1e9};let fire=false;
  if(!test){const dt=st.dt,fu=B.full;ist.ef+=(fu-ist.ef)*Math.min(1,dt*2);ist.es+=(fu-ist.es)*Math.min(1,dt/8);ist.pk=Math.max(.35,fu,ist.pk*Math.exp(-dt/30));
    if(F0.impact.on){const song=sig?.song?.section?sig.song:null,drop=song?!!song.drop:ist.ef-ist.es>.15&&ist.ef/ist.pk>.7,bar=Math.floor(bt/4);
      if(F0.kick!==undefined&&F0.kick!==ist.kick)fire=true;
      if(Im.trigger==='drops'&&drop&&time-ist.ld>(song?1:8)){fire=true;ist.ld=time;}
      if(Im.trigger==='bars'&&ist.bar!==undefined&&bar!==ist.bar)fire=true;
      if(Im.trigger==='beats'&&pulse>.8&&!(ist.lp>.8)&&B.bass>.45)fire=true;ist.bar=bar;}
    ist.kick=F0.kick;ist.lp=pulse;}
  if(fire){ist.n++;ist.t=time;}
  const ie=Im.on?Im.amount*Math.exp(-Math.max(0,time-ist.t)/(Im.length*60/Math.min(200,Math.max(60,+sig?.bpm||120)))*2.5):0,ig=ie>.01?ie:0,jit=((Math.sin(Math.floor(time*24)*91.3)*43758.5)%1+1)%1;
  gl.uniform4f(u.fimp,Im.style==='all'||Im.style==='flash'?ig:0,Im.style==='all'||Im.style==='glitch'?ig*(jit>.3?1:.25):0,ist.n,Im.style==='slam'?ig:0);
  gl.uniform4f(u.fflick,Fl.on?1:0,Fl.amount*drv('flicker',Fl.drive),Fl.speed,0);
  gl.uniform4f(u.fsnake,Sn.on?1:0,time*Sn.speed*.1,Sn.length,Sn.count);
  gl.uniform4f(u.foutl,O.on?.4+drv('outline',O.drive)*1.2:0,O.width,0,0);
  gl.uniform2f(u.fcurv,C.on?C.amount*(C.drive==='steady'?1:.3+lv('curves',C.drive)*1.4):0,0);
  gl.uniform4f(u.flight,Li.on?1:0,Li.amount*(Li.drive==='steady'?1:.3+lv('light',Li.drive)*1.2),time*Li.speed*1.57,0);
  const attrs=[[R.fcenter,3,0],[R.fnormal,3,12],[R.fmeta,4,24],[R.fA,3,40],[R.fB,3,52],[R.fC,3,64]].filter(a=>a[0]>=0);
  if(!on){for(const [loc] of attrs){gl.disableVertexAttribArray(loc);gl.vertexAttrib4f(loc,0,0,0,0);}return;}
  const buf=facets(g,F.edges.angle);gl.bindBuffer(gl.ARRAY_BUFFER,R.fxBuffer);if(R.fxData!==buf){gl.bufferData(gl.ARRAY_BUFFER,buf,gl.STATIC_DRAW);R.fxData=buf;}
  for(const [loc,n,off] of attrs){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,n,gl.FLOAT,false,76,off);}gl.bindBuffer(gl.ARRAY_BUFFER,R.buffer);}
export function facetData(s,time){const g=meshOf(s,time);return facets(g,(s.fx||cleanFx()).edges.angle);}
// Animate Autopilot: a choreographer. It plays curated looks (a hero effect plus quieter supports), keeps each one for a whole phrase
// (4, 8 or 16 bars on the beat clock), picks looks that suit the song's section (intro, build, drop, break), fires a one-bar Impact
// when a drop lands, varies one setting per bar inside a look and crossfades over one bar. Effects cost: Echo 3, Morph 2, others 1.
const RECIPES=[
  ['blueprint','Blueprint','intro',['edges',{mode:'trace',fill:.15}],[['outline',{drive:'steady'}],['light',{drive:'mids'}]]],
  ['scanlines','Scan lines','intro',['scan',{axis:'up',drive:'full'}],[['edges',{mode:'pulse',fill:.5,map:'levels'}],['outline',{drive:'full'}]]],
  ['clouds','Clouds','intro',['reveal',{pattern:'clouds',mode:'beat',every:'2',dark:.6,amount:.55}],[['light',{drive:'mids'}],['outline',{drive:'steady'}]]],
  ['contour','Contour','intro',['outline',{drive:'full'}],[['curves',{drive:'bass'}],['light',{drive:'mids'}]]],
  ['floors','Floor by floor','build',['build',{order:'up',drive:'level',el:'bands'}],[['edges',{mode:'pulse',fill:.4}],['light',{drive:'mids'}]]],
  ['snake','Snake','build',['snake',{count:3}],[['outline',{drive:'full'}],['flicker',{drive:'high',el:'tiles'}]]],
  ['facadechase','Facade chase','build',['flicker',{drive:'high',el:'tiles',map:'facades'}],[['outline',{drive:'bass'}],['scan',{axis:'up',drive:'beat'}]]],
  ['morphbuild','Morph build','build',['morph',{style:'liquid',drive:'full'}],[['light',{drive:'mids',map:'clouds'}],['edges',{mode:'sweep',fill:.5}]]],
  ['stackfloors','Stack floors','build',['reveal',{pattern:'bands',mode:'stack'}],[['scan',{axis:'up',drive:'beat'}],['outline',{drive:'bass'}]]],
  ['veins','Veins','build',['reveal',{pattern:'veins',mode:'stack',amount:.5}],[['outline',{drive:'full'}],['light',{drive:'mids'}]]],
  ['rings','Rings','build',['reveal',{pattern:'rings',mode:'beat',amount:.5}],[['edges',{mode:'pulse',fill:.4}],['light',{drive:'mids'}]]],
  ['levels','Levels','build',['build',{order:'up',drive:'loop',map:'levels'}],[['scan',{axis:'up',drive:'full'}],['outline',{drive:'bass'}]]],
  ['impact','Impact','drop',['shock',{drive:'beat',from:'bottom'}],[['explode',{drive:'beat',el:'cells'}],['flicker',{drive:'high',map:'veins'}]]],
  ['shatter','Shatter','drop',['explode',{drive:'bass',el:'cells',map:'parts'}],[['edges',{mode:'pulse',fill:.6}],['light',{drive:'mids'}]]],
  ['pulsefloors','Pulse floors','drop',['disp',{drive:'bass',pattern:'swell',map:'levels'}],[['flicker',{drive:'high',map:'dissolve'}],['outline',{drive:'bass'}]]],
  ['facadestorm','Facade storm','drop',['flicker',{drive:'beat',el:'organic',map:'facades'}],[['shock',{drive:'beat'}],['light',{drive:'mids'}]]],
  ['beatreveal','Beat reveal','drop',['reveal',{pattern:'cells',mode:'beat'}],[['impact',{trigger:'bars',style:'flash'}],['outline',{drive:'bass'}]]],
  ['glitchstorm','Glitch storm','drop',['reveal',{pattern:'tiles',mode:'swap',every:'0.5',amount:.55}],[['impact',{trigger:'beats',style:'glitch',length:.5}],['light',{drive:'mids'}]]],
  ['veinburst','Vein burst','drop',['reveal',{pattern:'veins',mode:'beat',amount:.6}],[['impact',{trigger:'bars',style:'slam'}],['curves',{drive:'bass'}]]],
  ['mirror','Mirror','drop',['explode',{drive:'bass',el:'cells',map:'mirror'}],[['light',{drive:'mids'}],['edges',{mode:'pulse',fill:.5}]]],
  ['drift','Drift','break',['flow',{move:.15,rotate:.05,drive:'loop'}],[['light',{drive:'mids'}],['outline',{drive:'steady'}]]],
  ['echotrace','Echo trace','break',['echo',{style:'up',drive:'steady'}],[['edges',{mode:'trace',fill:.2}]]],
  ['dissolve','Dissolve','break',['reveal',{pattern:'dissolve',mode:'beat',every:'2',dark:.7,amount:.6}],[['light',{drive:'mids'}],['outline',{drive:'steady'}]]],
  ['melt','Melt','break',['morph',{style:'melt',drive:'steady',amount:.5}],[['outline',{drive:'steady'}],['light',{drive:'mids'}]]]];
// The drop hit: Flash + Glitch over the whole object, the reveal cutting new cells every half beat, and a shockwave.
const HIT=['hit','Impact','drop',['impact',{style:'all',trigger:'drops',length:2}],[['reveal',{pattern:'cells',mode:'swap',every:'0.5',amount:.6,dark:.9}],['shock',{drive:'beat',from:'bottom',width:.2}]]];
const FX_COST={echo:3,morph:2,impact:0};
// Per bar inside a look: one setting steps through its options.
const VARY={shock:['from',['bottom','top','side']],scan:['axis',['up','across']],edges:['mode',['pulse','sweep']],disp:['pattern',['swell','ripple']],flicker:['el',FX_ELEMENTS],reveal:['pattern',REVEAL_PATTERNS],impact:['style',['flash','glitch','slam']]};
const rand=k=>{let x=(k>>>0)||1;return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};};
// Tagged parts take over: Facades plays on the Windows, Mirror on the Accents, and supporting edges trace the Columns.
function tagMap(x,m,i,tags){if(!tags)return m;if(m==='facades'&&tags.has(1))return 'windows';if(m==='mirror'&&tags.has(4))return 'accent';if(i&&m==='all'&&(x==='edges'||x==='outline')&&tags.has(2))return 'columns';return m;}
function lookFx(F,A,rc,prev,bar,tags){const o={repick:F.repick,auto:A},[,,,hero,sup]=rc,on={},budget=A.count+1;let cost=0;
  for(const [i,[x,set]] of [hero,...sup].slice(0,A.count).entries()){const c=FX_COST[x]??1;if(i&&cost+c>budget)continue;cost+=c;
    const e={...F[x],...set,on:true,fade:true,mix:i?.4:1};if(!A.maps)e.map='all';else e.map=tagMap(x,set.map||'all',i,tags);
    const v=VARY[x];if(!i&&v&&bar>0)e[v[0]]=v[1][bar%v[1].length];on[x]=e;}
  if(rc[2]==='drop'&&rc[0]!=='hit'&&!on.impact)on.impact={...F.impact,on:true,fade:true,mix:.45,map:'all',trigger:'bars',length:1,style:['flash','glitch','slam'][Math.max(0,bar)%3]};
  for(const x of FX_KEYS)o[x]=on[x]||{...(prev?.[x]||F[x]),on:false,fade:true};
  // An effect carried over between looks keeps its settings, so it never jumps.
  if(prev)for(const x of FX_KEYS)if(on[x]&&prev[x].on)o[x]={...prev[x],mix:on[x].mix,map:on[x].map,[VARY[x]?.[0]??'_']:on[x][VARY[x]?.[0]??'_']};return o;}
export function autoFx(R,s,time,sig){const F=s.fx?.light?s.fx:cleanFx(s.fx),A=F.auto,id=s.id||'_',P=+A.every,beat=Number.isFinite(sig?.beat)?sig.beat:time*2,bpm=Math.min(200,Math.max(60,+sig?.bpm||120)),
    full=Math.min(1,Math.max(0,+(sig?.bands?.full)||0)),song=sig?.song?.section?sig.song:null,bar0=b=>song?Math.floor(b/4+1e-6)*4:b;R.autos??=new Map();let st=R.autos.get(id);
  if(st&&(time<st.t||beat<st.b0-1))st=null;
  if(!st){st={k:[...id].reduce((h,c)=>Math.imul(h^c.charCodeAt(0),16777619),2166136261)>>>0,t:time,ef:full,es:full,pk:.35,sec:'intro',hist:[],b0:bar0(beat),bar:-1,hit:-1,lastDrop:-1e9};R.autos.set(id,st);if(R.autos.size>64)R.autos.delete(R.autos.keys().next().value);}
  // Section from the loudness: a fast (½ s) and slow (8 s) follower against a slowly falling peak.
  const dt=Math.min(.5,Math.max(0,time-st.t));st.t=time;st.ef+=(full-st.ef)*Math.min(1,dt*2);st.es+=(full-st.es)*Math.min(1,dt/8);st.pk=Math.max(.35,full,st.pk*Math.exp(-dt/30));
  // A loaded song's own map knows the section (and the drops) for sure; otherwise the loudness tells.
  const rel=st.ef/st.pk,secNow=song?song.section:rel>.75?'drop':rel>.45?'build':st.sec==='drop'||st.sec==='build'||st.sec==='break'?'break':'intro',bar=Math.floor((beat-st.b0)/4);
  st.bpm=bpm;st.song=!!song;st.fd=Math.min(3,Math.max(.8,240/bpm));
  // A launched cue holds for one phrase, then the choreographer carries on.
  if(st.cue){const c=st.cue;st.cue=null;st.hit=-1;st.b0=bar0(beat);st.bar=0;st.rc=['cue',c.name,secNow,null,[]];st.sec=secNow;const o={...c.fx,auto:A,repick:F.repick};for(const x of FX_KEYS)o[x]={...(o[x]||F[x]),fade:true};st.fx=cleanFx(o);st.fx.fd=st.fd;return st.fx;}
  const choose=sec=>{const r=rand(Math.imul(++st.k,2654435761)+7),pool=RECIPES.filter(x=>x[2]===sec),fresh=pool.filter(x=>!st.hist.includes(x[0])),l=fresh.length?fresh:pool,rc=l[Math.floor(r()*l.length)%l.length];
    st.hist=[rc[0],...st.hist].slice(0,4);return rc;};
  const tags=s.tags?.length?new Set(s.tags.map(t=>t[1])):null,set=(rc,sec,b)=>{st.rc=rc;st.sec=sec;st.fx=cleanFx(lookFx(F,A,rc,st.fx,b,tags));st.fx.fd=st.fd;};
  // Next look (remote / key): a fresh look for this section now.
  if(st.next&&st.rc){st.next=false;st.hit=-1;st.b0=bar0(beat);set(choose(secNow),secNow,0);st.bar=0;return st.fx;}
  // A drop lands: one bar of Impact over the whole object, then a drop look starts a fresh phrase.
  if(st.rc&&st.hit<0&&(song?song.drop:st.ef-st.es>.15&&rel>.7&&st.sec!=='drop')&&time-st.lastDrop>(song?1:8)){st.hit=beat;st.lastDrop=time;set(HIT,'drop',0);st.fx.kick=beat;return st.fx;}
  if(st.hit>=0){if(beat-st.hit<4)return st.fx;st.hit=-1;st.b0=bar0(beat);st.bar=0;set(choose('drop'),'drop',0);return st.fx;}
  // With a song map a new section starts a new look on its first bar.
  if(!st.rc||bar>=P||song&&st.rc[0]!=='cue'&&song.section!==st.sec&&bar!==st.bar){if(song&&bar<P&&st.rc){st.b0=bar0(beat);}else if(st.rc){st.b0+=Math.floor((beat-st.b0)/4/P)*P*4;if(beat-st.b0>=P*4)st.b0=bar0(beat);}st.bar=0;set(choose(secNow),secNow,0);return st.fx;}
  if(bar!==st.bar){st.bar=bar;if(st.rc[0]!=='cue')st.fx=cleanFx(lookFx(F,A,st.rc,st.fx,bar,tags));st.fx.fd=st.fd;}
  return st.fx;}
export function autoCue(id,fx,name){const st=renderer?.autos?.get(id);if(!st)return false;st.cue={fx,name};return true;}
export function autoNext(id){const st=renderer?.autos?.get(id);if(!st)return false;st.next=true;return true;}
export function autoNow(id){const st=renderer?.autos?.get(id);return st?.fx?{fx:st.fx,look:st.rc?.[1]}:null;}
// What Autopilot is playing on a surface now (for the panel).
export function autoPlaying(id){const st=renderer?.autos?.get(id);return st?.fx?FX_KEYS.filter(k=>st.fx[k].on):[];}
export function autoStatus(id){const st=renderer?.autos?.get(id);if(!st?.rc)return null;return {look:st.rc[1],section:st.sec,bar:st.hit>=0?1:st.bar+1,bars:st.hit>=0?1:+(st.fx.auto?.every||8),bpm:Math.round(st.bpm||120),song:!!st.song};}
export function render3d(ctx,s,img,W,H,time=0,test=false,sig=null){if(!s.post)s={...s,post:cleanPost()};
  const R=renderer||(renderer=init()),{canvas,gl,p,uniforms:u}=R;if(!test&&s.fx?.auto?.on)s={...s,fx:autoFx(R,s,time,sig)};if(canvas.width!==W||canvas.height!==H){canvas.width=W;canvas.height=H;}gl.viewport(0,0,W,H);gl.useProgram(p);gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  const {vp,m:cam,f:focal}=viewProj(s,W,H,time);gl.uniformMatrix4fv(u.vp,false,vp);gl.uniform1f(u.scale,s.scale);gl.uniform1i(u.upAxis,s.upAxis==='Z'?1:0);gl.uniform2f(u.size,W,H);gl.uniform1i(u.mode,['uv','front','box'].indexOf(s.projection));gl.uniform1f(u.fade,s.fade);gl.uniform1f(u.tile,s.tile);gl.uniformMatrix3fv(u.boxRot,false,boxMatrix(s.box));gl.uniform3f(u.boxMove,s.box.x,s.box.y,s.box.z);gl.uniform3f(u.boxScale,s.box.scale*s.box.sx,s.box.scale*s.box.sy,s.box.scale*s.box.sz);gl.uniform1i(u.wire,0);gl.bindTexture(gl.TEXTURE_2D,R.tex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);if(!test)img=surfaceFeedback(R,s,img,time);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);R.echoNow=!test&&(s.fx?.echo?.on||R.fades?.get(s.id||'_')?.lv?.echo>.001)?echoPush(R,s,img,time):null;gl.uniform1i(u.hist,3);liveTextures(R,s,sig,u);
  const g=meshOf(s,time),o=objectFrame(s,g);gl.uniform3fv(u.objectOffset,o.offset);gl.uniform1f(u.objectSize,o.size);gl.uniformMatrix3fv(u.objRot,false,o.rotT);gl.uniform3fv(u.pivot,o.pivot);gl.uniform3fv(u.objMove,o.move);gl.uniform3fv(u.objScale,xfScale(s.xf));gl.uniform1i(u.latRes,s.lattice.res);if(s.lattice.res){const a=new Float32Array(192);a.set(s.lattice.d);gl.uniform3fv(u.lat,a);}gl.uniform3fv(u.lo,g.lo);gl.uniform3fv(u.span,g.span);gl.uniform3f(u.eye,cam[12],cam[13],cam[14]);gl.bindBuffer(gl.ARRAY_BUFFER,R.buffer);if(R.mesh!==g){gl.bufferData(gl.ARRAY_BUFFER,g.data,gl.STATIC_DRAW);R.mesh=g;}gl.enableVertexAttribArray(R.position);gl.enableVertexAttribArray(R.uv);gl.enableVertexAttribArray(R.normal);gl.vertexAttribPointer(R.position,3,gl.FLOAT,false,32,0);gl.vertexAttribPointer(R.uv,2,gl.FLOAT,false,32,12);gl.vertexAttribPointer(R.normal,3,gl.FLOAT,false,32,20);gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(1,1);fxUniforms(R,s,g,time,sig,test);
  const A=s.ao?.on?aoTarget(R,W,H):null;gl.uniform1i(u.aoOn,0);gl.uniform1i(u.pass,0);gl.uniform1i(u.posTex,1);
  if(A){gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,null);gl.activeTexture(gl.TEXTURE0);gl.bindFramebuffer(gl.FRAMEBUFFER,A.fb);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,null);gl.activeTexture(gl.TEXTURE0);gl.uniform1i(u.aoTex,2);gl.uniform1i(u.pass,1);gl.drawArrays(gl.TRIANGLES,0,g.data.length/8);
    gl.uniform1f(u.aoStrength,s.ao.strength);gl.uniform1f(u.aoRadius,s.ao.radius*Math.max(...g.span)*o.size*s.xf.scale*s.scale);gl.uniform1f(u.pxScale,focal*W/2);gl.uniform3f(u.eye,cam[12],cam[13],cam[14]);
    // AO into its own buffer (same depth, so only the visible surface is shaded), then the main pass blurs it.
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,A.tex);gl.activeTexture(gl.TEXTURE0);gl.bindFramebuffer(gl.FRAMEBUFFER,A.fb2);gl.clearColor(1,1,1,1);gl.clear(gl.COLOR_BUFFER_BIT);gl.clearColor(0,0,0,0);gl.depthFunc(gl.LEQUAL);gl.uniform1i(u.pass,2);gl.drawArrays(gl.TRIANGLES,0,g.data.length/8);gl.depthFunc(gl.LESS);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.uniform1i(u.pass,0);gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,A.occ);gl.activeTexture(gl.TEXTURE0);gl.uniform1i(u.aoOn,1);}
  gl.drawArrays(gl.TRIANGLES,0,g.data.length/8);gl.disable(gl.POLYGON_OFFSET_FILL);gl.uniform1i(u.aoOn,0);
  if(A){for(const t of [gl.TEXTURE1,gl.TEXTURE2]){gl.activeTexture(t);gl.bindTexture(gl.TEXTURE_2D,null);}gl.activeTexture(gl.TEXTURE0);}
  if(s.wire||test){gl.uniform1i(u.wire,1);for(const k of ['disp','edge','fflow','fscan','fshock','fflick','fsnake','foutl','flight','fmorph','fpost','fecho','frev','fimp'])gl.uniform4f(u[k],0,0,0,0);gl.uniform2f(u.fcurv,0,0);gl.uniform1f(u.fzoom,0);gl.uniform2f(u.explode,0,0);gl.uniform3f(u.build,0,1,0);for(const loc of [R.fcenter,R.fnormal,R.fmeta,R.fA,R.fB,R.fC])if(loc>=0){gl.disableVertexAttribArray(loc);gl.vertexAttrib4f(loc,0,0,0,0);}gl.bufferData(gl.ARRAY_BUFFER,g.lines,gl.STATIC_DRAW);R.mesh=null;gl.vertexAttribPointer(R.position,3,gl.FLOAT,false,12,0);gl.disableVertexAttribArray(R.uv);gl.disableVertexAttribArray(R.normal);gl.drawArrays(gl.LINES,0,g.lines.length/3);}
  ctx.save();ctx.globalAlpha=s.opacity;ctx.globalCompositeOperation='source-over';ctx.drawImage(test||s.wire||s.post.space==='surface'?canvas:postFrame(R,s,g,o,vp,canvas,W,H,time),0,0,W,H);ctx.restore();
}
// Trails and Feedback: the last frame fades (Feedback also zooms and turns it around the object), the brighter of old and new wins, and the result is cut to this frame's mesh outline.
function postFrame(R,s,g,o,vp,canvas,W,H,time){const P=s.post;if(!P||!(P.trails>0||P.feedback>0))return canvas;R.posts??=new Map();const id=s.id||'_',mk=()=>{const c=document.createElement('canvas');c.width=W;c.height=H;return c;};
  let st=R.posts.get(id);if(!st||st.a.width!==W||st.a.height!==H){st={a:mk(),b:mk(),t:null};R.posts.set(id,st);if(R.posts.size>16)R.posts.delete(R.posts.keys().next().value);}
  const dt=st.t===null?-1:time-st.t,x=st.b.getContext('2d');st.t=time;x.globalCompositeOperation='copy';x.globalAlpha=1;x.setTransform(1,0,0,1,0,0);x.drawImage(canvas,0,0);
  if(dt>=0&&dt<=.5){const k=dt*60;x.globalCompositeOperation='lighten';
    if(P.feedback>0){const w=toWorld(s,g,o,g.lo.map((l,i)=>l+g.span[i]/2)),c=[0,1,3].map(r=>vp[r]*w[0]+vp[4+r]*w[1]+vp[8+r]*w[2]+vp[12+r]),cx=c[2]>0?(c[0]/c[2]*.5+.5)*W:W/2,cy=c[2]>0?(.5-c[1]/c[2]*.5)*H:H/2;
      x.save();x.globalAlpha=P.feedback**Math.max(k,.01);x.translate(cx,cy);x.rotate(P.rotate*Math.PI/180*k);x.scale(1+P.zoom*k,1+P.zoom*k);x.translate(-cx,-cy);x.drawImage(st.a,0,0);x.restore();}
    if(P.trails>0){x.globalAlpha=P.trails**Math.max(k,.01);x.drawImage(st.a,0,0);}
    x.globalAlpha=1;x.globalCompositeOperation='destination-in';x.drawImage(canvas,0,0);}
  [st.a,st.b]=[st.b,st.a];return st.a;}
// Feedback in surface space: the trails and feedback run on the picture itself before it is wrapped on the mesh,
// so they flow along the surface (and around the object) instead of across the screen.
function surfaceFeedback(R,s,img,time){const P=s.post;if(!P||P.space!=='surface'||!(P.trails>0||P.feedback>0))return img;R.sfb??=new Map();const id=s.id||'_',W=img.width,H=img.height,mk=()=>{const c=document.createElement('canvas');c.width=W;c.height=H;return c;};
  let st=R.sfb.get(id);if(!st||st.a.width!==W||st.a.height!==H){st={a:mk(),b:mk(),t:null};R.sfb.set(id,st);if(R.sfb.size>16)R.sfb.delete(R.sfb.keys().next().value);}
  const dt=st.t===null?-1:time-st.t,x=st.b.getContext('2d');st.t=time;x.globalCompositeOperation='copy';x.globalAlpha=1;x.setTransform(1,0,0,1,0,0);x.drawImage(img,0,0);
  if(dt>=0&&dt<=.5){const k=dt*60;x.globalCompositeOperation='lighten';
    if(P.feedback>0){x.save();x.globalAlpha=P.feedback**Math.max(k,.01);x.translate(W/2,H/2);x.rotate(P.rotate*Math.PI/180*k);x.scale(1+P.zoom*k,1+P.zoom*k);x.translate(-W/2,-H/2);x.drawImage(st.a,0,0);x.restore();}
    if(P.trails>0){x.globalAlpha=P.trails**Math.max(k,.01);x.drawImage(st.a,0,0);}}
  [st.a,st.b]=[st.b,st.a];return st.a;}
// Echo history: the last 24 pictures (one every 1/30 s, at most 480 px wide) in a texture array on unit 3.
function echoPush(R,s,img,time){const gl=R.gl,N=24;R.echoes??=new Map();const id=s.id||'_',w=Math.max(1,Math.min(480,img.width)),h=Math.max(1,Math.round(w*img.height/Math.max(1,img.width)));
  let e=R.echoes.get(id);if(!e||e.w!==w||e.h!==h){if(e)gl.deleteTexture(e.tex);e={tex:gl.createTexture(),w,h,head:-1,filled:0,t:-1,cv:document.createElement('canvas')};e.cv.width=w;e.cv.height=h;
    gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D_ARRAY,e.tex);gl.texStorage3D(gl.TEXTURE_2D_ARRAY,1,gl.RGBA8,w,h,N);for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.MIRRORED_REPEAT],[gl.TEXTURE_WRAP_T,gl.MIRRORED_REPEAT]])gl.texParameteri(gl.TEXTURE_2D_ARRAY,k,v);
    R.echoes.set(id,e);if(R.echoes.size>8){const [k0,o]=R.echoes.entries().next().value;gl.deleteTexture(o.tex);R.echoes.delete(k0);}}
  gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D_ARRAY,e.tex);
  if(time<e.t||time-e.t>.5){e.filled=0;e.t=-1;}
  if(e.t<0||time-e.t>=1/30-1e-4){e.head=(e.head+1)%N;
    // GPU copy: the picture is already uploaded (R.tex), so it is scaled straight into the history layer (no canvas readback).
    const fb=R.echoFb??={r:gl.createFramebuffer(),d:gl.createFramebuffer()},iw=img.width||img.videoWidth||w,ih=img.height||img.videoHeight||h;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER,fb.r);gl.framebufferTexture2D(gl.READ_FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,R.tex,0);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,fb.d);gl.framebufferTextureLayer(gl.DRAW_FRAMEBUFFER,gl.COLOR_ATTACHMENT0,e.tex,0,e.head);
    gl.blitFramebuffer(0,0,iw,ih,0,0,w,h,gl.COLOR_BUFFER_BIT,gl.LINEAR);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,null);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,null);
    e.filled=Math.min(N,e.filled+1);e.t=time;}
  gl.activeTexture(gl.TEXTURE0);return e;}
