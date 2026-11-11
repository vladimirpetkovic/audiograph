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
export function cleanAuto(a){return Array.isArray(a)?[...new Set(a.filter(k=>typeof k==='string'&&Object.hasOwn(MAP_AUTO,k)))]:[];}
const autoGet=(s,k)=>k.startsWith('crop')?s.crop[+k[4]]:k.startsWith('box.')?s.box[k.slice(4)]:s[k];
function wander(seed,clock){let h=2166136261;for(let i=0;i<seed.length;i++){h^=seed.charCodeAt(i);h=Math.imul(h,16777619);}
  const r=k=>((h>>>(k*5))&1023)/1023;return .6*Math.sin(r(0)*6.283+clock*6.283/(16+r(2)*14))+.4*Math.sin(r(1)*6.283+clock*6.283/(7+r(3)*6));}
// The mapping as drawn at this moment: surfaces with Auto knobs get drifted copies; values lands in `shown` (surfaceId:key).
export function driftMapping(m,clock,shown){
  if(!m?.surfaces.some(s=>s.auto?.length))return m;
  return {...m,surfaces:m.surfaces.map(s=>{if(!s.auto?.length)return s;const t={...s,crop:s.crop&&[...s.crop],box:s.box&&{...s.box}};
    for(const k of s.auto){const [lo,hi,amp]=MAP_AUTO[k],home=autoGet(s,k);if(home===undefined)continue;const v=Math.max(lo,Math.min(hi,home+wander(s.id+k,clock)*amp));
      if(k.startsWith('crop'))t.crop[+k[4]]=v;else if(k.startsWith('box.'))t.box[k.slice(4)]=v;else t[k]=v;}
    if(t.crop){t.crop[0]=Math.min(t.crop[0],.98);t.crop[1]=Math.min(t.crop[1],.98);t.crop[2]=Math.max(t.crop[2],t.crop[0]+.02);t.crop[3]=Math.max(t.crop[3],t.crop[1]+.02);}
    for(const k of s.auto)shown?.set(s.id+':'+k,autoGet(t,k));return t;})};
}
export const LATTICE_RES=[0,2,3,4];
// Lattice: res³ control points; d holds each point's offset in units of the object's size (x,y,z flattened).
export function cleanLattice(l){const res=LATTICE_RES.includes(+l?.res)?+l.res:0,n=res**3*3,d=Array.isArray(l?.d)&&l.d.length===n?l.d.map(v=>clamp(v,-2,2,0)):new Array(n).fill(0);return {res,d};}
// Mesh animation: Displace (along normals), Edges (crease lines), Build (faces grow in) and Explode (faces fly apart).
const pick=(v,list)=>list.includes(v)?v:list[0];
export const FX_DRIVES={disp:['bass','full','high'],build:['loop','level'],explode:['beat','bass','hold']};
export function cleanFx(f={}){const d=f.disp||{},e=f.edges||{},b=f.build||{},x=f.explode||{};return {
  disp:{on:!!d.on,amount:clamp(d.amount,0,1,.12),pattern:pick(d.pattern,['ripple','swell','noise']),drive:pick(d.drive,FX_DRIVES.disp),speed:clamp(d.speed,0,4,1)},
  edges:{on:!!e.on,mode:pick(e.mode,['trace','pulse','sweep']),width:clamp(e.width,1,16,3),speed:clamp(e.speed,.05,4,1),angle:clamp(e.angle,1,90,10),color:pick(e.color,['picture','white']),fill:clamp(e.fill,0,1,.35)},
  build:{on:!!b.on,order:pick(b.order,['up','out','random']),drive:pick(b.drive,FX_DRIVES.build),speed:clamp(b.speed,.02,2,.2)},
  explode:{on:!!x.on,amount:clamp(x.amount,0,2,.5),drive:pick(x.drive,FX_DRIVES.explode)}};}
export function surface3d(id,name='3D object'){return clean3d({id,name,kind:'3d'});}
export function clean3d(s){
  const c=s.camera||{};return {id:s.id,name:String(s.name||'3D object').slice(0,40),kind:'3d',source:s.source==='all'||s.source===undefined?'all':Math.round(clamp(s.source,1,4,1)),opacity:clamp(s.opacity,0,1,1),primitive:PRIMITIVES.includes(s.primitive)?s.primitive:'Cube',model:typeof s.model==='string'?s.model.slice(0,240):'',modelKey:typeof s.modelKey==='string'?s.modelKey.slice(0,280):'',projection:['uv','front','box'].includes(s.projection)?s.projection:'uv',fade:clamp(s.fade,0,1,.5),tile:clamp(s.tile,.1,20,1),box:(b=>({x:clamp(b.x,-2,2,0),y:clamp(b.y,-2,2,0),z:clamp(b.z,-2,2,0),rx:clamp(b.rx,-180,180,0),ry:clamp(b.ry,-180,180,0),rz:clamp(b.rz,-180,180,0),scale:clamp(b.scale,.05,20,1),sx:clamp(b.sx,.05,20,1),sy:clamp(b.sy,.05,20,1),sz:clamp(b.sz,.05,20,1)}))(s.box||{}),anim:(a=>({on:a.on!==false,clip:Math.round(clamp(a.clip,0,63,0)),speed:clamp(a.speed,.05,4,1)}))(s.anim||{}),xf:(t=>({x:clamp(t.x,-10,10,0),y:clamp(t.y,-10,10,0),z:clamp(t.z,-10,10,0),rx:clamp(t.rx,-180,180,0),ry:clamp(t.ry,-180,180,0),rz:clamp(t.rz,-180,180,0),scale:clamp(t.scale,.01,100,1),sx:clamp(t.sx,.01,100,1),sy:clamp(t.sy,.01,100,1),sz:clamp(t.sz,.01,100,1)}))(s.xf||{}),lattice:cleanLattice(s.lattice),ao:(a=>({on:!!a.on,strength:clamp(a.strength,0,1,.6),radius:clamp(a.radius,.01,1,.1)}))(s.ao||{}),fx:cleanFx(s.fx),...(a=>a.length?{auto:a}:{})(cleanAuto(s.auto)),scale:clamp(s.scale,.0001,10000,1),wire:!!s.wire,upAxis:s.upAxis==='Z'?'Z':'Y',camera:{yaw:clamp(c.yaw,-360,360,30),pitch:clamp(c.pitch,-89,89,20),distance:clamp(c.distance,.001,100000,6),roll:clamp(c.roll,-180,180,0),panX:clamp(c.panX,-2,2,0),panY:clamp(c.panY,-2,2,0),focal:clamp(c.focal,10,200,35),target:Array.isArray(c.target)&&c.target.length===3?c.target.map(v=>clamp(v,-1e8,1e8,0)):[0,0,0]},...(s.track?{track:cleanTrack(s.track)}:{}),trackOn:s.trackOn!==false,playing:s.playing!==false,speed:clamp(s.speed,.05,4,1),sync:s.sync!==false,hold:clamp(s.hold,0,1e7,0),offset:clamp(s.offset,-1e9,1e9,0)};
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
  in vec3 position;in vec2 uv;in vec3 normal;uniform mat4 vp;uniform float scale;uniform int upAxis;uniform vec3 objectOffset;uniform float objectSize;uniform vec3 lo;uniform vec3 span;uniform int latRes;uniform vec3 lat[64];uniform mat3 objRot;uniform vec3 pivot;uniform vec3 objMove;uniform vec3 objScale;in vec3 fcenter;in vec3 fnormal;in vec2 fmeta;uniform float time;uniform vec4 disp;uniform vec2 explode;uniform vec3 build;out vec2 tex;out vec3 obj;out vec3 nrm;out vec3 wpos;out vec3 bary;out float eflags;out float bglow;out float frnd;
  float bern(int n,int i,float t){float c=n==1?1.:n==2?(i==1?2.:1.):(i==1||i==2?3.:1.);return c*pow(t,float(i))*pow(1.-t,float(n-i));}
  void main(){obj=position;tex=uv;nrm=normal;vec3 q=position;int vi=gl_VertexID%3;bary=vi==0?vec3(1,0,0):vi==1?vec3(0,1,0):vec3(0,0,1);eflags=fmeta.y;frnd=fmeta.x;bglow=0.;float S=max(span.x,max(span.y,span.z));
    // Explode: each face shrinks and flies out along its own normal (random distance per face).
    if(explode.y>0.){q=fcenter+(q-fcenter)*(1.-.45*min(explode.y,1.))+(dot(fnormal,fnormal)>0.?normalize(fnormal):vec3(0))*explode.x*S*(.35+fmeta.x);}
    // Build: faces grow in from their centre in height, distance or random order; the growing front glows.
    if(build.x>.5){vec3 c=(fcenter-lo)/span;float k=build.z<.5?(upAxis==1?c.z:c.y):build.z<1.5?length(c-.5)*1.1547:fmeta.x;k=clamp(k,0.,1.)*.9;float g=smoothstep(k,k+.1,build.y);q=fcenter+(q-fcenter)*g;bglow=g>0.&&g<1.?1.-g:0.;}
    // Displace: push the surface along its smooth normals (stays closed), shaped by a pattern.
    if(disp.x!=0.){vec3 u=(position-lo)/span-.5;float w=disp.y<.5?.5+.5*sin(length(u)*18.-time*disp.z*4.):disp.y<1.5?1.:.5+.5*sin(dot(u,vec3(9.1,7.3,11.7))+time*disp.z*2.)*sin(dot(u,vec3(-5.3,12.1,6.7))-time*disp.z*1.3);q+=normal*disp.x*S*w;}
    if(latRes>1){vec3 u=clamp((position-lo)/span,0.,1.),d=vec3(0);int n=latRes-1;for(int i=0;i<4;i++){if(i>n)break;float bi=bern(n,i,u.x);for(int j=0;j<4;j++){if(j>n)break;float bj=bi*bern(n,j,u.y);for(int k=0;k<4;k++){if(k>n)break;d+=bj*bern(n,k,u.z)*lat[(i*latRes+j)*latRes+k];}}}q+=d*span;}
    vec3 w=(upAxis==1?vec3(q.x,q.z,-q.y):q)*objectSize+objectOffset;w=pivot+objRot*((w-pivot)*objScale)+objMove;wpos=w*scale;gl_Position=vp*vec4(wpos,1.);}`));
  gl.attachShader(p,shader(gl.FRAGMENT_SHADER,`#version 300 es
  precision highp float;in vec2 tex;in vec3 obj;in vec3 nrm;in vec3 wpos;uniform sampler2D picture;uniform highp sampler2D posTex;uniform sampler2D aoTex;uniform int pass;uniform bool aoOn;uniform float aoStrength;uniform float aoRadius;uniform float pxScale;uniform vec3 eye;uniform int mode;uniform bool wire;uniform vec2 size;uniform vec3 lo;uniform vec3 span;uniform float fade;uniform float tile;uniform mat3 boxRot;uniform vec3 boxMove;uniform vec3 boxScale;in vec3 bary;in float eflags;in float bglow;in float frnd;uniform float time;uniform highp int upAxis;uniform vec4 edge;uniform vec3 edge2;out vec4 color;vec2 tl(vec2 t){return (t-.5)*tile+.5;}
  // Ambient occlusion (screen space): nearby surfaces from the position prepass that rise above this point's plane darken it.
  float occlusion(){vec3 n=normalize(cross(dFdx(wpos),dFdy(wpos)));if(dot(n,eye-wpos)<0.)n=-n;
    float r=clamp(aoRadius*pxScale*gl_FragCoord.w,2.,size.y*.15),a0=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))*6.2832,occ=0.;ivec2 hi=ivec2(size)-1;
    for(int i=0;i<16;i++){float k=(float(i)+.5)/16.,a=a0+float(i)*2.3999632;vec4 q=texelFetch(posTex,clamp(ivec2(gl_FragCoord.xy+vec2(cos(a),sin(a))*k*r),ivec2(0),hi),0);if(q.w<.5)continue;
      vec3 v=q.xyz-wpos;float d=length(v);if(d<1e-7)continue;occ+=max(0.,dot(v/d,n)-.15)*(1.-smoothstep(aoRadius*.5,aoRadius*1.5,d));}
    return clamp(1.-aoStrength*occ/6.,0.,1.);}
  // 4×4 blur of the AO buffer, skipping samples from other surfaces so edges stay crisp.
  float aoSmooth(){ivec2 c=ivec2(gl_FragCoord.xy),hi=ivec2(size)-1;float a=0.,w=0.;for(int y=-2;y<2;y++)for(int x=-2;x<2;x++){ivec2 p=clamp(c+ivec2(x,y),ivec2(0),hi);vec4 q=texelFetch(posTex,p,0);if(q.w<.5||distance(q.xyz,wpos)>aoRadius*.3)continue;a+=texelFetch(aoTex,p,0).r;w+=1.;}return w>0.?a/w:1.;}
  void main(){if(pass==1){color=vec4(wpos,1.);return;}if(pass==2){color=vec4(vec3(occlusion()),1.);return;}vec2 t=tex;if(mode==1)t=gl_FragCoord.xy/size;if(wire){color=vec4(.15,1.,.75,1.);return;}if(mode==2){vec3 n=abs(boxRot*(dot(nrm,nrm)>1e-8?normalize(nrm):normalize(cross(dFdx(obj),dFdy(obj)))));vec3 p=boxRot*((obj-lo)/span-.5-boxMove)/boxScale+.5;if(fade<.001){t=n.z>=n.x&&n.z>=n.y?p.xy:n.x>=n.y?p.zy:p.xz;color=texture(picture,tl(t));}else{vec3 w=pow(n,vec3(exp2(4.*(1.-fade))));w/=w.x+w.y+w.z;color=texture(picture,tl(p.zy))*w.x+texture(picture,tl(p.xz))*w.y+texture(picture,tl(p.xy))*w.z;}}else color=texture(picture,tl(t));color.rgb*=color.a;if(aoOn)color.rgb*=aoSmooth();
    if(bglow>0.)color=vec4(mix(color.rgb,vec3(1),bglow*.7),max(color.a,bglow));
    // Edges: crease edges (flag bits) drawn by distance to the triangle side, in pixels.
    if(edge.x>.5){int f=int(eflags+.5);float e=0.,h=upAxis==1?(obj.z-lo.z)/span.z:(obj.y-lo.y)/span.y;
      for(int i=0;i<3;i++){if(((f>>i)&1)==0)continue;float d=bary[i]/max(fwidth(bary[i]),1e-6),a=1.-smoothstep(edge.z*.5-.75,edge.z*.5+.75,d),I=edge.w;
        if(edge.y>.5&&edge.y<1.5){float b1=bary[(i+1)%3],b2=bary[(i+2)%3],ph=fract(b2/max(b1+b2,1e-6)-time*edge2.x*.8+frnd);I*=smoothstep(0.,.04,ph)*(1.-smoothstep(.32,.38,ph));}
        else if(edge.y>1.5){float pos=fract(time*edge2.x*.3)*1.4-.2;I*=.12+1.2*exp(-pow((h-pos)/.07,2.));}
        e=max(e,a*min(I,1.5));}
      float mx=max(color.r,max(color.g,color.b));vec3 ec=edge2.y>.5||mx<.03?vec3(1):mix(vec3(1),color.rgb/mx,.85);color=vec4(color.rgb*edge2.z,color.a*max(edge2.z,.001));color.rgb=mix(color.rgb,ec,min(e,1.));color.a=max(color.a,min(e,1.));}}`));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));const uniforms={};for(const k of ['time','disp','explode','build','edge','edge2','vp','scale','picture','mode','wire','size','lo','span','upAxis','objectOffset','objectSize','fade','tile','boxRot','boxMove','boxScale','latRes','lat','objRot','pivot','objMove','objScale','posTex','pass','aoOn','aoStrength','aoRadius','pxScale','eye','aoTex'])uniforms[k]=gl.getUniformLocation(p,k);const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.MIRRORED_REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.MIRRORED_REPEAT);return {canvas,gl,p,uniforms,tex,buffer:gl.createBuffer(),position:gl.getAttribLocation(p,'position'),uv:gl.getAttribLocation(p,'uv'),normal:gl.getAttribLocation(p,'normal'),fcenter:gl.getAttribLocation(p,'fcenter'),fnormal:gl.getAttribLocation(p,'fnormal'),fmeta:gl.getAttribLocation(p,'fmeta'),fxBuffer:gl.createBuffer(),fxData:null,mesh:null};}
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
function viewProj(s,W,H,time){const pose=cameraPose(s,time),m=pose.matrix,v=I4();for(let i=0;i<3;i++)for(let j=0;j<3;j++)v[i*4+j]=m[j*4+i];for(let j=0;j<3;j++)v[12+j]=-(v[j]*m[12]+v[4+j]*m[13]+v[8+j]*m[14]);const f=2*pose.focal/36,n=Math.max(1e-6,Math.hypot(...s.camera.target.map((t,i)=>m[12+i]-t*s.scale))*.001),far=Math.max(100,n*1e7),P=new Float32Array([f,0,0,0,0,f*W/H,0,0,-2*s.camera.panX,-2*s.camera.panY,-(far+n)/(far-n),-1,0,0,-2*far*n/(far-n),0]);return {vp:mul(P,v),m,f};}
const up=(a,v)=>a==='Z'?[v[0],v[2],-v[1]]:v;
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
  const fn=faceNormals(D,T),N=weld.size,edges=new Map(),cos=new Float32Array(T*3).fill(-2);
  for(let f=0;f<T;f++)for(let i=0;i<3;i++){const a=vid[f*3+(i+1)%3],b=vid[f*3+(i+2)%3];if(a===b)continue;const k=Math.min(a,b)*N+Math.max(a,b),o=edges.get(k);
    if(o===undefined)edges.set(k,f*3+i);else if(o>=0){const g2=Math.floor(o/3),c=fn[f*3]*fn[g2*3]+fn[f*3+1]*fn[g2*3+1]+fn[f*3+2]*fn[g2*3+2];cos[f*3+i]=cos[o]=Math.abs(c)>1?Math.sign(c):c;edges.set(k,-1);}else{cos[f*3+i]=-2;}}
  t={cos,T};topos.set(g,t);return t;}
function faceNormals(D,T){const n=new Float32Array(T*3);for(let f=0;f<T;f++){const a=f*24,ex=D[a+8]-D[a],ey=D[a+9]-D[a+1],ez=D[a+10]-D[a+2],hx=D[a+16]-D[a],hy=D[a+17]-D[a+1],hz=D[a+18]-D[a+2];let x=ey*hz-ez*hy,y=ez*hx-ex*hz,z=ex*hy-ey*hx;const l=Math.hypot(x,y,z)||1;n[f*3]=x/l;n[f*3+1]=y/l;n[f*3+2]=z/l;}return n;}
function facets(g,angle){const c=facetCache.get(g);if(c&&c.angle===angle)return c.buf;const D=g.data,T=D.length/24,top=topology(g.base||g),fn=faceNormals(D,T),lim=Math.cos(angle*Math.PI/180),buf=new Float32Array(T*24);
  for(let f=0;f<T;f++){const a=f*24,cx=(D[a]+D[a+8]+D[a+16])/3,cy=(D[a+1]+D[a+9]+D[a+17])/3,cz=(D[a+2]+D[a+10]+D[a+18])/3;let h=Math.imul(f+1,2654435761)>>>0;h^=h>>>15;h=Math.imul(h,2246822519)>>>0;h^=h>>>13;
    let flags=0;for(let i=0;i<3;i++)if(top.cos[f*3+i]<lim)flags|=1<<i;
    for(let j=0;j<3;j++){const o=a+j*8;buf[o]=cx;buf[o+1]=cy;buf[o+2]=cz;buf[o+3]=fn[f*3];buf[o+4]=fn[f*3+1];buf[o+5]=fn[f*3+2];buf[o+6]=(h%10007)/10007;buf[o+7]=flags;}}
  facetCache.set(g,{angle,buf});return buf;}
const ZERO_SIG={bands:{bass:0,mids:0,high:0,full:0},pulse:0};
// Turns the surface's fx settings and the music into shader uniforms.
function fxUniforms(R,s,g,time,sig){const gl=R.gl,u=R.uniforms,F=s.fx||cleanFx(),B=sig?.bands||ZERO_SIG.bands,lvl=k=>Math.min(1,Math.max(0,+B[k]||0)),pulse=Math.min(1,Math.max(0,+sig?.pulse||0)),on=F.disp.on||F.edges.on||F.build.on||F.explode.on;
  gl.uniform1f(u.time,time);
  gl.uniform4f(u.disp,F.disp.on?F.disp.amount*(.15+lvl(F.disp.drive)*1.2):0,['ripple','swell','noise'].indexOf(F.disp.pattern),F.disp.speed,0);
  const ex=F.explode.on?(F.explode.drive==='hold'?1:F.explode.drive==='beat'?pulse:lvl('bass')):0;gl.uniform2f(u.explode,ex*F.explode.amount,ex);
  let bp=1;if(F.build.on){if(F.build.drive==='level')bp=Math.min(1,lvl('full')*1.6);else{const t=((time*F.build.speed)%1+1)%1;bp=t<.45?t/.45:t<.55?1:t<.95?1-(t-.55)/.4:0;}}
  gl.uniform3f(u.build,F.build.on?1:0,bp,['up','out','random'].indexOf(F.build.order));
  const L=lvl('full');gl.uniform4f(u.edge,F.edges.on?1:0,['pulse','trace','sweep'].indexOf(F.edges.mode),F.edges.width*(R.dpr||1),F.edges.mode==='pulse'?.3+L*1.6:1+L*.8);gl.uniform3f(u.edge2,F.edges.speed,F.edges.color==='white'?1:0,F.edges.on?F.edges.fill:1);
  const attrs=[[R.fcenter,3,0],[R.fnormal,3,12],[R.fmeta,2,24]].filter(a=>a[0]>=0);
  if(!on){for(const [loc] of attrs){gl.disableVertexAttribArray(loc);gl.vertexAttrib4f(loc,0,0,0,0);}return;}
  const buf=facets(g,F.edges.angle);gl.bindBuffer(gl.ARRAY_BUFFER,R.fxBuffer);if(R.fxData!==buf){gl.bufferData(gl.ARRAY_BUFFER,buf,gl.STATIC_DRAW);R.fxData=buf;}
  for(const [loc,n,off] of attrs){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,n,gl.FLOAT,false,32,off);}gl.bindBuffer(gl.ARRAY_BUFFER,R.buffer);}
export function facetData(s,time){const g=meshOf(s,time);return facets(g,(s.fx||cleanFx()).edges.angle);}
export function render3d(ctx,s,img,W,H,time=0,test=false,sig=null){
  const R=renderer||(renderer=init()),{canvas,gl,p,uniforms:u}=R;if(canvas.width!==W||canvas.height!==H){canvas.width=W;canvas.height=H;}gl.viewport(0,0,W,H);gl.useProgram(p);gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  const {vp,m:cam,f:focal}=viewProj(s,W,H,time);gl.uniformMatrix4fv(u.vp,false,vp);gl.uniform1f(u.scale,s.scale);gl.uniform1i(u.upAxis,s.upAxis==='Z'?1:0);gl.uniform2f(u.size,W,H);gl.uniform1i(u.mode,['uv','front','box'].indexOf(s.projection));gl.uniform1f(u.fade,s.fade);gl.uniform1f(u.tile,s.tile);gl.uniformMatrix3fv(u.boxRot,false,boxMatrix(s.box));gl.uniform3f(u.boxMove,s.box.x,s.box.y,s.box.z);gl.uniform3f(u.boxScale,s.box.scale*s.box.sx,s.box.scale*s.box.sy,s.box.scale*s.box.sz);gl.uniform1i(u.wire,0);gl.bindTexture(gl.TEXTURE_2D,R.tex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);
  const g=meshOf(s,time),o=objectFrame(s,g);gl.uniform3fv(u.objectOffset,o.offset);gl.uniform1f(u.objectSize,o.size);gl.uniformMatrix3fv(u.objRot,false,o.rotT);gl.uniform3fv(u.pivot,o.pivot);gl.uniform3fv(u.objMove,o.move);gl.uniform3fv(u.objScale,xfScale(s.xf));gl.uniform1i(u.latRes,s.lattice.res);if(s.lattice.res){const a=new Float32Array(192);a.set(s.lattice.d);gl.uniform3fv(u.lat,a);}gl.uniform3fv(u.lo,g.lo);gl.uniform3fv(u.span,g.span);gl.bindBuffer(gl.ARRAY_BUFFER,R.buffer);if(R.mesh!==g){gl.bufferData(gl.ARRAY_BUFFER,g.data,gl.STATIC_DRAW);R.mesh=g;}gl.enableVertexAttribArray(R.position);gl.enableVertexAttribArray(R.uv);gl.enableVertexAttribArray(R.normal);gl.vertexAttribPointer(R.position,3,gl.FLOAT,false,32,0);gl.vertexAttribPointer(R.uv,2,gl.FLOAT,false,32,12);gl.vertexAttribPointer(R.normal,3,gl.FLOAT,false,32,20);gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(1,1);fxUniforms(R,s,g,time,sig);
  const A=s.ao?.on?aoTarget(R,W,H):null;gl.uniform1i(u.aoOn,0);gl.uniform1i(u.pass,0);gl.uniform1i(u.posTex,1);
  if(A){gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,null);gl.activeTexture(gl.TEXTURE0);gl.bindFramebuffer(gl.FRAMEBUFFER,A.fb);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,null);gl.activeTexture(gl.TEXTURE0);gl.uniform1i(u.aoTex,2);gl.uniform1i(u.pass,1);gl.drawArrays(gl.TRIANGLES,0,g.data.length/8);
    gl.uniform1f(u.aoStrength,s.ao.strength);gl.uniform1f(u.aoRadius,s.ao.radius*Math.max(...g.span)*o.size*s.xf.scale*s.scale);gl.uniform1f(u.pxScale,focal*W/2);gl.uniform3f(u.eye,cam[12],cam[13],cam[14]);
    // AO into its own buffer (same depth, so only the visible surface is shaded), then the main pass blurs it.
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,A.tex);gl.activeTexture(gl.TEXTURE0);gl.bindFramebuffer(gl.FRAMEBUFFER,A.fb2);gl.clearColor(1,1,1,1);gl.clear(gl.COLOR_BUFFER_BIT);gl.clearColor(0,0,0,0);gl.depthFunc(gl.LEQUAL);gl.uniform1i(u.pass,2);gl.drawArrays(gl.TRIANGLES,0,g.data.length/8);gl.depthFunc(gl.LESS);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.uniform1i(u.pass,0);gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,A.occ);gl.activeTexture(gl.TEXTURE0);gl.uniform1i(u.aoOn,1);}
  gl.drawArrays(gl.TRIANGLES,0,g.data.length/8);gl.disable(gl.POLYGON_OFFSET_FILL);gl.uniform1i(u.aoOn,0);
  if(A){for(const t of [gl.TEXTURE1,gl.TEXTURE2]){gl.activeTexture(t);gl.bindTexture(gl.TEXTURE_2D,null);}gl.activeTexture(gl.TEXTURE0);}
  if(s.wire||test){gl.uniform1i(u.wire,1);for(const k of ['disp','edge'])gl.uniform4f(u[k],0,0,0,0);gl.uniform2f(u.explode,0,0);gl.uniform3f(u.build,0,1,0);for(const loc of [R.fcenter,R.fnormal,R.fmeta])if(loc>=0){gl.disableVertexAttribArray(loc);gl.vertexAttrib4f(loc,0,0,0,0);}gl.bufferData(gl.ARRAY_BUFFER,g.lines,gl.STATIC_DRAW);R.mesh=null;gl.vertexAttribPointer(R.position,3,gl.FLOAT,false,12,0);gl.disableVertexAttribArray(R.uv);gl.disableVertexAttribArray(R.normal);gl.drawArrays(gl.LINES,0,g.lines.length/3);}
  ctx.save();ctx.globalAlpha=s.opacity;ctx.globalCompositeOperation='source-over';ctx.drawImage(canvas,0,0,W,H);ctx.restore();
}
