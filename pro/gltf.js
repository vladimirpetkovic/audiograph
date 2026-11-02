// glTF 2.0 / GLB models for the 3D Object node: meshes, node hierarchy, skinning, morph targets and animation clips.
// parseGLTF reads the file once; pose(model,clip,t) returns the mesh the original renderers draw ({verts,faces,normals})
// at time t, always in the same normalized frame so an animated model moves instead of being re-fitted every frame.
const COMP={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array};
const SIZE={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
const NORM={5120:127,5121:255,5122:32767,5123:65535};
const MAX_FACES=40000;

function readGLB(buf){
  const dv=new DataView(buf);
  if(dv.getUint32(0,true)!==0x46546C67)return null;
  if(dv.getUint32(4,true)!==2)throw Error('Only glTF 2.0 files are supported');
  let off=12,json=null,bin=null;
  while(off+8<=buf.byteLength){
    const len=dv.getUint32(off,true),type=dv.getUint32(off+4,true),start=off+8;
    if(start+len>buf.byteLength)throw Error('GLB chunk runs past the end of the file');
    if(type===0x4E4F534A)json=JSON.parse(new TextDecoder().decode(new Uint8Array(buf,start,len)));
    else if(type===0x004E4942&&!bin)bin=buf.slice(start,start+len);
    off=start+len+((4-len%4)%4);
  }
  if(!json)throw Error('GLB has no JSON chunk');
  return {json,bin};
}
function dataURI(uri){
  const m=/^data:[^;,]*(;base64)?,(.*)$/s.exec(uri);if(!m)throw Error('This .gltf points to external files; export it as a single .glb instead');
  if(!m[1])return new TextEncoder().encode(decodeURIComponent(m[2])).buffer;
  const s=atob(m[2]),b=new Uint8Array(s.length);for(let i=0;i<s.length;i++)b[i]=s.charCodeAt(i);return b.buffer;
}
// Accessor as a flat typed array (floats, normalized integers become 0–1 / -1–1 when the accessor says so).
function accessor(g,buffers,i,float=true){
  const a=g.accessors?.[i];if(!a)throw Error('Missing accessor '+i);
  const C=COMP[a.componentType],k=SIZE[a.type];if(!C||!k)throw Error('Unsupported accessor type');
  const out=float?new Float32Array(a.count*k):new Uint32Array(a.count*k);
  if(a.bufferView!==undefined){
    const v=g.bufferViews[a.bufferView],buf=buffers[v.buffer],bs=C.BYTES_PER_ELEMENT,stride=v.byteStride||k*bs,base=(v.byteOffset||0)+(a.byteOffset||0);
    if(base+stride*(a.count-1)+k*bs>buf.byteLength)throw Error('Accessor runs past its buffer');
    const dv=new DataView(buf),get={5120:'getInt8',5121:'getUint8',5122:'getInt16',5123:'getUint16',5125:'getUint32',5126:'getFloat32'}[a.componentType];
    const scale=float&&a.normalized&&NORM[a.componentType]||0;
    for(let e=0;e<a.count;e++)for(let c=0;c<k;c++){let x=dv[get](base+e*stride+c*bs,true);if(scale)x=Math.max(x/scale,-1);out[e*k+c]=x;}
  }
  if(a.sparse){
    const s=a.sparse,idx=accessor({...g,accessors:[{bufferView:s.indices.bufferView,byteOffset:s.indices.byteOffset,componentType:s.indices.componentType,count:s.count,type:'SCALAR'}]},buffers,0,false),
      val=accessor({...g,accessors:[{bufferView:s.values.bufferView,byteOffset:s.values.byteOffset,componentType:a.componentType,normalized:a.normalized,count:s.count,type:a.type}]},buffers,0,float);
    for(let j=0;j<s.count;j++)for(let c=0;c<k;c++)out[idx[j]*k+c]=val[j*k+c];
  }
  return out;
}

// --- small mat4 / quat helpers (column-major, like glTF) ---
const I4=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
function mul(a,b,o=new Float32Array(16)){
  for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];
  return o;
}
function trs(t,q,s,o=new Float32Array(16)){
  const [x,y,z,w]=q,[sx,sy,sz]=s;
  o[0]=(1-2*(y*y+z*z))*sx;o[1]=2*(x*y+z*w)*sx;o[2]=2*(x*z-y*w)*sx;o[3]=0;
  o[4]=2*(x*y-z*w)*sy;o[5]=(1-2*(x*x+z*z))*sy;o[6]=2*(y*z+x*w)*sy;o[7]=0;
  o[8]=2*(x*z+y*w)*sz;o[9]=2*(y*z-x*w)*sz;o[10]=(1-2*(x*x+y*y))*sz;o[11]=0;
  o[12]=t[0];o[13]=t[1];o[14]=t[2];o[15]=1;return o;
}
function slerp(a,b,u){
  let d=a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3],s=1;if(d<0){d=-d;s=-1;}
  let k0=1-u,k1=u*s;
  if(d<.9995){const th=Math.acos(d),sn=Math.sin(th);k0=Math.sin((1-u)*th)/sn;k1=Math.sin(u*th)/sn*s;}
  const o=[a[0]*k0+b[0]*k1,a[1]*k0+b[1]*k1,a[2]*k0+b[2]*k1,a[3]*k0+b[3]*k1],l=Math.hypot(...o)||1;return o.map(v=>v/l);
}

export function parseGLTF(buf,name='',cameraOnly=false){
  let g,bin=null;
  const glb=buf.byteLength>=12&&readGLB(buf);
  if(glb){g=glb.json;bin=glb.bin;}else g=JSON.parse(new TextDecoder().decode(buf));
  if(!g.asset||String(g.asset.version||'').split('.')[0]!=='2')throw Error('Only glTF 2.0 files are supported');
  const buffers=(g.buffers||[]).map((b,i)=>b.uri===undefined?(i===0&&bin?bin:(()=>{throw Error('GLB binary chunk is missing');})()):dataURI(b.uri));
  const nodes=(g.nodes||[]).map(n=>({children:n.children||[],mesh:n.mesh,skin:n.skin,weights:n.weights,
    camera:n.camera,matrix:n.matrix?new Float32Array(n.matrix):null,t:n.translation||[0,0,0],r:n.rotation||[0,0,0,1],s:n.scale||[1,1,1]}));
  const parent=new Int32Array(nodes.length).fill(-1);nodes.forEach((n,i)=>n.children.forEach(c=>{if(nodes[c])parent[c]=i;}));
  const scene=g.scenes?.[g.scene||0],roots=scene?.nodes||nodes.map((n,i)=>i).filter(i=>parent[i]<0);
  // Every node reachable from the scene, parents before children.
  const order=[],seen=new Set(),walk=i=>{if(seen.has(i)||!nodes[i])return;seen.add(i);order.push(i);nodes[i].children.forEach(walk);};roots.forEach(walk);
  const meshes=(g.meshes||[]).map(m=>({weights:m.weights||[],prims:m.primitives.filter(p=>(p.mode??4)>=4&&p.attributes?.POSITION!==undefined).map(p=>{
    const pos=accessor(g,buffers,p.attributes.POSITION),n=pos.length/3;
    let idx=p.indices!==undefined?accessor(g,buffers,p.indices,false):Uint32Array.from({length:n},(_,i)=>i);
    const mode=p.mode??4;
    if(mode===5){const t=[];for(let i=2;i<idx.length;i++)i%2?t.push(idx[i-1],idx[i-2],idx[i]):t.push(idx[i-2],idx[i-1],idx[i]);idx=Uint32Array.from(t);}
    else if(mode===6){const t=[];for(let i=2;i<idx.length;i++)t.push(idx[0],idx[i-1],idx[i]);idx=Uint32Array.from(t);}
    for(const i of idx)if(i>=n)throw Error('A face references a missing vertex');
    return {pos,idx,uv:p.attributes.TEXCOORD_0!==undefined?accessor(g,buffers,p.attributes.TEXCOORD_0):null,joints:p.attributes.JOINTS_0!==undefined?accessor(g,buffers,p.attributes.JOINTS_0,false):null,
      weights:p.attributes.WEIGHTS_0!==undefined?accessor(g,buffers,p.attributes.WEIGHTS_0):null,
      targets:(p.targets||[]).map(t=>t.POSITION!==undefined?accessor(g,buffers,t.POSITION):null)};
  })}));
  const skins=(g.skins||[]).map(s=>({joints:s.joints,ibm:s.inverseBindMatrices!==undefined?accessor(g,buffers,s.inverseBindMatrices):null}));
  const clips=(g.animations||[]).map((a,i)=>{
    const ch=a.channels.map(c=>{const sm=a.samplers[c.sampler];return {node:c.target.node,path:c.target.path,interp:sm.interpolation||'LINEAR',
      times:accessor(g,buffers,sm.input),values:accessor(g,buffers,sm.output)};}).filter(c=>nodes[c.node]&&['translation','rotation','scale','weights'].includes(c.path));
    const duration=ch.reduce((m,c)=>Math.max(m,c.times[c.times.length-1]||0),0);
    return {name:a.name||'Clip '+(i+1),channels:ch,duration};
  }).filter(c=>c.channels.length&&c.duration>0);
  let faces=0;for(const i of order){const n=nodes[i];if(n.mesh!==undefined&&meshes[n.mesh])for(const p of meshes[n.mesh].prims)faces+=p.idx.length/3;}
  if(!faces&&!cameraOnly)throw Error('No triangle geometry found in '+(name||'the model'));
  const model={name,cameras:g.cameras||[],nodes,parent,order,meshes,skins,clips,faceStep:Math.max(1,Math.ceil(faces/MAX_FACES))};
  if(cameraOnly)return model;
  // One fixed fit for the whole animation: bounds over the rest pose and samples of the first clip.
  const box=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity],grow=v=>{for(let i=0;i<v.length;i+=3)for(let k=0;k<3;k++){box[k]=Math.min(box[k],v[i+k]);box[k+3]=Math.max(box[k+3],v[i+k]);}};
  grow(rawPose(model,-1,0).pos);
  for(const c of clips.slice(0,4))for(let s=0;s<=12;s++)grow(rawPose(model,clips.indexOf(c),c.duration*s/12).pos);
  model.center=[(box[0]+box[3])/2,(box[1]+box[4])/2,(box[2]+box[5])/2];model.scale=Math.max(box[3]-box[0],box[4]-box[1],box[5]-box[2])||1;
  return model;
}

function sample(c,t,out){
  const T=c.times,n=T.length,k=c.values.length/n/(c.interp==='CUBICSPLINE'?3:1),cs=c.interp==='CUBICSPLINE';
  const at=i=>{const o=cs?(i*3+1)*k:i*k;return Array.from(c.values.subarray(o,o+k));};
  if(t<=T[0]||n===1)return at(0);if(t>=T[n-1])return at(n-1);
  let lo=0,hi=n-1;while(hi-lo>1){const m=(lo+hi)>>1;if(T[m]<=t)lo=m;else hi=m;}
  const a=at(lo),b=at(hi);if(c.interp==='STEP')return a;
  const u=(t-T[lo])/(T[hi]-T[lo]||1);
  if(cs){const d=T[hi]-T[lo],u2=u*u,u3=u2*u,ob=c.values,ao=(lo*3+2)*k,bi=(hi*3)*k;
    const r=a.map((p,j)=>(2*u3-3*u2+1)*p+(u3-2*u2+u)*d*ob[ao+j]+(-2*u3+3*u2)*b[j]+(u3-u2)*d*ob[bi+j]);
    if(c.path==='rotation'){const l=Math.hypot(...r)||1;return r.map(v=>v/l);}return r;}
  return c.path==='rotation'?slerp(a,b,u):a.map((v,j)=>v+(b[j]-v)*u);
}
// World-space positions of every triangle vertex at time t of a clip (-1 = rest pose).
export function rawPose(m,clip,t){
  const loc=m.nodes.map(n=>({t:n.t,r:n.r,s:n.s,w:n.weights}));
  const c=m.clips[clip];
  if(c){const tt=((t%c.duration)+c.duration)%c.duration;for(const ch of c.channels){const v=sample(ch,tt);const L=loc[ch.node];if(ch.path==='translation')L.t=v;else if(ch.path==='rotation')L.r=v;else if(ch.path==='scale')L.s=v;else L.w=v;}}
  const world=new Array(m.nodes.length);
  for(const i of m.order){const n=m.nodes[i],l=n.matrix&&!(c&&c.channels.some(ch=>ch.node===i&&ch.path!=='weights'))?n.matrix:trs(loc[i].t,loc[i].r,loc[i].s),p=m.parent[i];world[i]=p>=0&&world[p]?mul(world[p],l):l;}
  // Topology never changes between poses: faces are built once and shared (renderers reuse their edges).
  const pos=[],faces=m.faces?null:[];let base=0;
  for(const i of m.order){
    const n=m.nodes[i],mesh=m.meshes[n.mesh];if(!mesh)continue;
    const mw=loc[i].w||mesh.weights,skin=n.skin!==undefined&&m.skins[n.skin],jm=skin&&skin.joints.map((j,k)=>world[j]?mul(world[j],skin.ibm?skin.ibm.subarray(k*16,k*16+16):I4()):I4());
    for(const p of mesh.prims){
      const N=p.pos.length/3;
      for(let v=0;v<N;v++){
        let x=p.pos[v*3],y=p.pos[v*3+1],z=p.pos[v*3+2];
        for(let k=0;k<p.targets.length;k++){const d=p.targets[k],w=mw?.[k]||0;if(d&&w){x+=d[v*3]*w;y+=d[v*3+1]*w;z+=d[v*3+2]*w;}}
        let M=world[i];
        if(jm&&p.joints&&p.weights){
          let ox=0,oy=0,oz=0,ws=0;
          for(let k=0;k<4;k++){const w=p.weights[v*4+k];if(!w)continue;const J=jm[p.joints[v*4+k]];if(!J)continue;ws+=w;
            ox+=w*(J[0]*x+J[4]*y+J[8]*z+J[12]);oy+=w*(J[1]*x+J[5]*y+J[9]*z+J[13]);oz+=w*(J[2]*x+J[6]*y+J[10]*z+J[14]);}
          if(ws){pos.push(ox/ws,oy/ws,oz/ws);continue;}
        }
        pos.push(M[0]*x+M[4]*y+M[8]*z+M[12],M[1]*x+M[5]*y+M[9]*z+M[13],M[2]*x+M[6]*y+M[10]*z+M[14]);
      }
      if(faces)for(let f=0;f+2<p.idx.length;f+=3*m.faceStep)faces.push([base+p.idx[f],base+p.idx[f+1],base+p.idx[f+2]]);
      base+=N;
    }
  }
  if(faces)m.faces=faces;
  return {pos,faces:m.faces};
}
// The mesh the original draws: centred, fitted to -1…1 with Y flipped (like its OBJ loader), with smooth normals.
export function pose(m,clip,t){
  const {pos,faces}=rawPose(m,clip,t),[cx,cy,cz]=m.center,s=2/m.scale,verts=new Array(pos.length/3),normals=new Array(pos.length/3);
  for(let i=0;i<verts.length;i++){verts[i]=[(pos[i*3]-cx)*s,-(pos[i*3+1]-cy)*s,(pos[i*3+2]-cz)*s];normals[i]=[0,0,0];}
  for(const f of faces){const a=verts[f[0]],b=verts[f[1]],c=verts[f[2]],e1=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],e2=[c[0]-a[0],c[1]-a[1],c[2]-a[2]],
    nx=e1[1]*e2[2]-e1[2]*e2[1],ny=e1[2]*e2[0]-e1[0]*e2[2],nz=e1[0]*e2[1]-e1[1]*e2[0];for(const j of f){normals[j][0]+=nx;normals[j][1]+=ny;normals[j][2]+=nz;}}
  for(const v of normals){const l=Math.hypot(v[0],v[1],v[2])||1;v[0]/=l;v[1]/=l;v[2]/=l;}
  return {verts,faces,normals};
}

export {I4,mul,trs,slerp,sample};
