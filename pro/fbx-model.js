// FBX models (binary or ASCII; e.g. Mixamo characters): mesh, skin clusters and animation stacks are converted
// into the same rig gltf.js poses, so an FBX animates exactly like a GLB everywhere a model can be loaded.
import {fbxRecords} from './camera-import.js';
import {I4,mul,trs,fitModel} from './gltf.js';

const KTIME=46186158000,FPS=30,MAX_SAMPLES=3000;
const ORDERS=['XYZ','XZY','YZX','YXZ','ZXY','ZYX'];
function axisRot(axis,deg){const a=deg*Math.PI/180,c=Math.cos(a),s=Math.sin(a),m=I4();
  if(axis===0){m[5]=c;m[6]=s;m[9]=-s;m[10]=c;}else if(axis===1){m[0]=c;m[2]=-s;m[8]=s;m[10]=c;}else{m[0]=c;m[1]=s;m[4]=-s;m[5]=c;}return m;}
// FBX order 'XYZ' applies X first: R = Rz·Ry·Rx.
function euler(v,order='XYZ'){let m=I4();for(const a of order){const k='XYZ'.indexOf(a);if(v[k])m=mul(axisRot(k,v[k]),m);}return m;}
const move=v=>{const m=I4();m[12]=v[0];m[13]=v[1];m[14]=v[2];return m;};
const scaling=v=>{const m=I4();m[0]=v[0];m[5]=v[1];m[10]=v[2];return m;};
function invert(m){const o=new Float32Array(16),[a0,a1,a2,a3,a4,a5,a6,a7,a8,a9,a10,a11,a12,a13,a14,a15]=m;
  const b0=a0*a5-a1*a4,b1=a0*a6-a2*a4,b2=a0*a7-a3*a4,b3=a1*a6-a2*a5,b4=a1*a7-a3*a5,b5=a2*a7-a3*a6,b6=a8*a13-a9*a12,b7=a8*a14-a10*a12,b8=a8*a15-a11*a12,b9=a9*a14-a10*a13,b10=a9*a15-a11*a13,b11=a10*a15-a11*a14;
  let d=b0*b11-b1*b10+b2*b9+b3*b8-b4*b7+b5*b6;if(!d)return I4();d=1/d;
  o[0]=(a5*b11-a6*b10+a7*b9)*d;o[1]=(a2*b10-a1*b11-a3*b9)*d;o[2]=(a13*b5-a14*b4+a15*b3)*d;o[3]=(a10*b4-a9*b5-a11*b3)*d;
  o[4]=(a6*b8-a4*b11-a7*b7)*d;o[5]=(a0*b11-a2*b8+a3*b7)*d;o[6]=(a14*b2-a12*b5-a15*b1)*d;o[7]=(a8*b5-a10*b2+a11*b1)*d;
  o[8]=(a4*b10-a5*b8+a7*b6)*d;o[9]=(a1*b8-a0*b10-a3*b6)*d;o[10]=(a12*b4-a13*b2+a15*b0)*d;o[11]=(a9*b2-a8*b4-a11*b0)*d;
  o[12]=(a5*b7-a4*b9-a6*b6)*d;o[13]=(a0*b9-a1*b7+a2*b6)*d;o[14]=(a13*b1-a12*b3-a14*b0)*d;o[15]=(a8*b3-a9*b1+a10*b0)*d;return o;}
// Affine matrix → translation, rotation quaternion, scale (FBX bones have no shear).
function decompose(m){
  const sx=Math.hypot(m[0],m[1],m[2])||1,sy=Math.hypot(m[4],m[5],m[6])||1,sz=Math.hypot(m[8],m[9],m[10])||1;
  const r=[m[0]/sx,m[1]/sx,m[2]/sx,m[4]/sy,m[5]/sy,m[6]/sy,m[8]/sz,m[9]/sz,m[10]/sz],t=r[0]+r[4]+r[8];let q;
  if(t>0){const s=Math.sqrt(t+1)*2;q=[(r[5]-r[7])/s,(r[6]-r[2])/s,(r[1]-r[3])/s,s/4];}
  else if(r[0]>r[4]&&r[0]>r[8]){const s=Math.sqrt(1+r[0]-r[4]-r[8])*2;q=[s/4,(r[3]+r[1])/s,(r[6]+r[2])/s,(r[5]-r[7])/s];}
  else if(r[4]>r[8]){const s=Math.sqrt(1+r[4]-r[0]-r[8])*2;q=[(r[3]+r[1])/s,s/4,(r[7]+r[5])/s,(r[6]-r[2])/s];}
  else{const s=Math.sqrt(1+r[8]-r[0]-r[4])*2;q=[(r[6]+r[2])/s,(r[7]+r[5])/s,s/4,(r[1]-r[3])/s];}
  const l=Math.hypot(...q)||1;return {t:[m[12],m[13],m[14]],r:q.map(v=>v/l),s:[sx,sy,sz]};
}

export async function parseFBXModel(buf,name='model.fbx'){
  const root=await fbxRecords(buf),find=(ns,n)=>ns.find(x=>x.name===n),objects=find(root,'Objects')?.children||[];
  const links=(find(root,'Connections')?.children||[]).filter(n=>n.name==='C').map(n=>n.p),byID=new Map(objects.map(o=>[o.p[0],o]));
  const props=o=>{const p={};for(const n of find(o?.children||[],'Properties70')?.children||[])if(n.name==='P')p[n.p[0]]=n.p.slice(4);return p;};
  const array=(o,key)=>{const r=find(o?.children||[],key);return Array.isArray(r?.p[0])?r.p[0]:find(r?.children||[],'a')?.p||[];};
  const value=(o,key)=>find(o?.children||[],key)?.p[0];
  const childrenOf=(id,type)=>links.filter(c=>c[0]==='OO'&&c[2]===id).map(c=>byID.get(c[1])).filter(o=>o&&(!type||o.name===type));
  const parentOf=(id,type)=>links.filter(c=>c[0]==='OO'&&c[1]===id).map(c=>byID.get(c[2])).find(o=>o&&(!type||o.name===type));

  // Nodes: one synthetic root converts FBX units (centimetres by default) to metres and Z-up to Y-up.
  const G=props(find(root,'GlobalSettings')),unit=(+G.UnitScaleFactor?.[0]||1)*.01,zup=+G.UpAxis?.[0]===2;
  const models=objects.filter(o=>o.name==='Model'),index=new Map(models.map((o,i)=>[o.p[0],i+1]));
  const nodes=[{children:[],t:[0,0,0],r:zup?[-Math.SQRT1_2,0,0,Math.SQRT1_2]:[0,0,0,1],s:[unit,unit,unit],matrix:null}];
  const info=[null];
  for(const o of models){const p=props(o),order=ORDERS[+p.RotationOrder?.[0]||0]||'XYZ';
    const base={T:p['Lcl Translation']||[0,0,0],R:p['Lcl Rotation']||[0,0,0],S:p['Lcl Scaling']||[1,1,1]};
    const pre=euler(p.PreRotation||[0,0,0]),post=invert(euler(p.PostRotation||[0,0,0])),rp=p.RotationPivot||[0,0,0],sp=p.ScalingPivot||[0,0,0];
    const ro=move(p.RotationOffset||[0,0,0]),so=move(p.ScalingOffset||[0,0,0]),rpm=move(rp),sm=move(sp),rpi=move(rp.map(v=>-v)),spi=move(sp.map(v=>-v));
    // L = T·Roff·Rp·Rpre·R·Rpost⁻¹·Rp⁻¹·Soff·Sp·S·Sp⁻¹
    const local=(T,R,S)=>[move(T),ro,rpm,pre,euler(R,order),post,rpi,so,sm,scaling(S),spi].reduce((a,b)=>mul(a,b));
    const d=decompose(local(base.T,base.R,base.S));info.push({o,base,local});
    nodes.push({children:[],t:d.t,r:d.r,s:d.s,matrix:null,
      geo:mul(mul(move(p.GeometricTranslation||[0,0,0]),euler(p.GeometricRotation||[0,0,0])),scaling(p.GeometricScaling||[1,1,1]))});}
  const parent=new Int32Array(nodes.length).fill(-1);
  models.forEach((o,k)=>{const i=k+1,pm=parentOf(o.p[0],'Model'),pi=pm?index.get(pm.p[0]):0;parent[i]=pi;nodes[pi].children.push(i);});
  const fbxGlobal=i=>{const l=trs(nodes[i].t,nodes[i].r,nodes[i].s);return parent[i]>0?mul(fbxGlobal(parent[i]),l):l;};
  const order=[],walk=i=>{order.push(i);nodes[i].children.forEach(walk);};walk(0);

  // Meshes: control points split only where UVs differ, so shared vertices keep smooth normals.
  const meshes=[],skins=[];
  for(const geo of objects.filter(o=>o.name==='Geometry'&&o.p[2]==='Mesh')){
    const owner=parentOf(geo.p[0],'Model');if(!owner)continue;const ni=index.get(owner.p[0]),node=nodes[ni];
    const cp=array(geo,'Vertices'),pvi=array(geo,'PolygonVertexIndex');if(!cp.length||!pvi.length)continue;
    const uvL=find(geo.children,'LayerElementUV'),uvData=uvL?array(uvL,'UV'):[],uvIdx=uvL?array(uvL,'UVIndex'):[];
    const uvMap=String(value(uvL,'MappingInformationType')||''),uvRef=String(value(uvL,'ReferenceInformationType')||'');
    const uvAt=(pv,c)=>{if(!uvData.length)return -1;const k=/Polygon/.test(uvMap)&&!/^ByPolygon$/.test(uvMap)?pv:c;return /Index/.test(uvRef)?uvIdx[k]:k;};
    // Skin clusters → per-control-point joints/weights (strongest four).
    const skinObj=childrenOf(geo.p[0],'Deformer').find(d=>d.p[2]==='Skin');let joints=null,cpw=null,skin;
    if(skinObj){const jl=[],ibm=[];cpw=Array.from({length:cp.length/3},()=>[]);
      for(const cl of childrenOf(skinObj.p[0],'Deformer').filter(d=>d.p[2]==='Cluster')){
        const bone=links.filter(c=>c[0]==='OO'&&c[2]===cl.p[0]).map(c=>byID.get(c[1])).find(o=>o?.name==='Model');if(!bone)continue;
        const idx=array(cl,'Indexes'),w=array(cl,'Weights'),tl=array(cl,'TransformLink');
        const j=jl.length;jl.push(index.get(bone.p[0]));
        // Exporters disagree on what the cluster's Transform holds; bone bind (TransformLink) and the mesh's own placement are reliable.
        ibm.push(...mul(invert(tl.length===16?Float32Array.from(tl):fbxGlobal(index.get(bone.p[0]))),fbxGlobal(ni)));
        idx.forEach((v,k)=>{if(cpw[v]&&w[k]>0)cpw[v].push([j,w[k]]);});}
      if(jl.length){skin=skins.length;skins.push({joints:jl,ibm:Float32Array.from(ibm)});joints=true;}}
    const g=node.geo,key=new Map(),pos=[],uv=[],jo=[],we=[],idx=[];
    const vert=(c,u)=>{const k=c+'/'+u;let i=key.get(k);if(i!==undefined)return i;i=pos.length/3;key.set(k,i);
      const x=cp[c*3],y=cp[c*3+1],z=cp[c*3+2];pos.push(g[0]*x+g[4]*y+g[8]*z+g[12],g[1]*x+g[5]*y+g[9]*z+g[13],g[2]*x+g[6]*y+g[10]*z+g[14]);
      if(uvData.length)uv.push(uvData[u*2]||0,uvData[u*2+1]||0);
      if(joints){const l=cpw[c].sort((a,b)=>b[1]-a[1]).slice(0,4);for(let k=0;k<4;k++){jo.push(l[k]?.[0]||0);we.push(l[k]?.[1]||0);}}
      return i;};
    let poly=[];
    pvi.forEach((raw,pv)=>{const c=raw<0?~raw:raw;poly.push(vert(c,uvAt(pv,c)));
      if(raw<0){for(let k=1;k+1<poly.length;k++)idx.push(poly[0],poly[k],poly[k+1]);poly=[];}});
    if(!idx.length)continue;
    const prim={pos:Float32Array.from(pos),idx:Uint32Array.from(idx),uv:uvData.length?Float32Array.from(uv.map((v,k)=>k%2?1-v:v)):null,
      joints:joints?Uint32Array.from(jo):null,weights:joints?Float32Array.from(we):null,targets:[]};
    if(node.mesh===undefined){node.mesh=meshes.length;meshes.push({weights:[],prims:[]});if(skin!==undefined)node.skin=skin;}
    meshes[node.mesh].prims.push(prim);
  }

  // Animation stacks → clips, baked at 30 fps into translation / rotation / scale channels per animated node.
  const curves=new Map();
  for(const o of objects.filter(o=>o.name==='AnimationCurve')){const T=array(o,'KeyTime').map(x=>x/KTIME),V=array(o,'KeyValueFloat');if(T.length&&T.length===V.length)curves.set(o.p[0],{T,V});}
  const evalCurve=({T,V},t)=>{if(t<=T[0])return V[0];if(t>=T[T.length-1])return V[V.length-1];let lo=0,hi=T.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(T[m]<=t)lo=m;else hi=m;}return V[lo]+(V[hi]-V[lo])*(t-T[lo])/(T[hi]-T[lo]||1);};
  const clips=[];
  for(const stack of objects.filter(o=>o.name==='AnimationStack')){
    const cnodes=childrenOf(stack.p[0],'AnimationLayer').flatMap(l=>childrenOf(l.p[0],'AnimationCurveNode'));
    const anim=new Map();let start=Infinity,end=-Infinity;
    for(const cn of cnodes){const tgt=links.find(c=>c[0]==='OP'&&c[1]===cn.p[0]&&index.has(c[2]));if(!tgt)continue;
      const prop={'Lcl Translation':'T','Lcl Rotation':'R','Lcl Scaling':'S'}[tgt[3]];if(!prop)continue;
      const ax=[null,null,null];
      for(const c of links.filter(c=>c[0]==='OP'&&c[2]===cn.p[0])){const cv=curves.get(c[1]),k='XYZ'.indexOf(String(c[3]).slice(-1));if(!cv||k<0)continue;ax[k]=cv;start=Math.min(start,cv.T[0]);end=Math.max(end,cv.T[cv.T.length-1]);}
      if(!ax.some(Boolean))continue;const ni=index.get(tgt[2]);if(!anim.has(ni))anim.set(ni,{});anim.get(ni)[prop]=ax;}
    if(!anim.size||!(end>start))continue;
    const duration=end-start,n=Math.min(MAX_SAMPLES,Math.ceil(duration*FPS)+1),times=Float32Array.from({length:n},(_,i)=>duration*i/(n-1)),channels=[];
    for(const [ni,a] of anim){const {base,local}=info[ni],tv=[],rv=[],sv=[];let prev=null;
      for(let i=0;i<n;i++){const t=start+times[i],at=(ax,b)=>b.map((v,k)=>ax?.[k]?evalCurve(ax[k],t):v);
        const d=decompose(local(at(a.T,base.T),at(a.R,base.R),at(a.S,base.S)));
        if(prev&&prev[0]*d.r[0]+prev[1]*d.r[1]+prev[2]*d.r[2]+prev[3]*d.r[3]<0)d.r=d.r.map(v=>-v);prev=d.r;
        tv.push(...d.t);rv.push(...d.r);sv.push(...d.s);}
      channels.push({node:ni,path:'translation',interp:'LINEAR',times,values:Float32Array.from(tv)},{node:ni,path:'rotation',interp:'LINEAR',times,values:Float32Array.from(rv)},{node:ni,path:'scale',interp:'LINEAR',times,values:Float32Array.from(sv)});}
    const nm=String(stack.p[1]||'').split('\x00')[0].replace(/^AnimStack::/,'')||'Clip '+(clips.length+1);
    clips.push({name:nm,channels,duration});
  }
  // Exporters often add an empty or one-frame take next to the real one.
  const real=clips.filter(c=>c.duration>=.1);
  return fitModel({name,cameras:[],nodes,parent,order,meshes,skins,clips:real.length?real:clips,faceStep:1});
}
