export const DEPTH_WGSL=`
fn encodeSceneDepth(z:f32)->vec4f{
  let v=u32(round(clamp(z/512.0+0.5,0.0,0.99999994)*16777215.0));
  return vec4f(vec3f(f32((v>>16u)&255u),f32((v>>8u)&255u),f32(v&255u))/255.0,1.0);
}
fn decodeSceneDepth(v:vec4f)->f32{
  if(v.a<0.5){return 256.0;}
  let b=vec3u(round(v.rgb*255.0));return f32((b.x<<16u)|(b.y<<8u)|b.z)/16777215.0*512.0-256.0;
}
`;
const NATIVE_DEPTH=DEPTH_WGSL+`
@fragment fn sceneDepth(fi:VOut)->@location(0) vec4f{
  if(c.mt.z<0.005){discard;}return encodeSceneDepth(fi.cp.w-length(c.cam.xyz));
}
@fragment fn sceneOpaque(fi:VOut)->@location(0) vec4f{
  if(c.mt.z<0.995||c.mt2.y==1.0){discard;}return encodeSceneDepth(fi.cp.w-length(c.cam.xyz));
}
`;
const SOURCE_COUNT=2048;
const FLOW_STEPS=8;
const FLOW_RATE=4;
export function surfaceRoutes(faces,samples){
  // Each segment lives in one triangle. Both sides of an edge use the same world point.
  const edges=new Map(),links=new Int32Array(faces.length*3).fill(-1);
  for(let face=0;face<faces.length;face++){
    const ids=faces[face];if(!ids||new Set(ids).size!==3)continue;
    for(let side=0;side<3;side++){
      const a=ids[(side+1)%3],b=ids[(side+2)%3],key=a<b?`${a}:${b}`:`${b}:${a}`,slot=face*3+side;
      if(edges.has(key)){
        const other=edges.get(key);if(other<0)continue;
        if(links[other]>=0){links[links[other]]=-1;links[other]=-1;edges.set(key,-1);}
        else{links[other]=slot;links[slot]=other;}
      }else edges.set(key,slot);
    }
  }
  const data=new Float32Array(samples.length*FLOW_STEPS*8);
  for(const [i,sample] of samples.entries()){
    let face=sample.triangle,start=sample.weights,entry=-1;
    for(let step=0;step<FLOW_STEPS;step++){
      const choices=[0,1,2].filter(s=>s!==entry&&links[face*3+s]>=0);
      const index=Math.floor((((i+1)*.61803398875+step*.41421356237)%1)*choices.length);
      const side=choices[index]??-1,end=[0,0,0];
      const next=side<0?-1:links[face*3+side];
      if(next>=0){
        end[(side+1)%3]=.15+.7*(((i+step+1)*.569840296)%1);
        end[(side+2)%3]=1-end[(side+1)%3];
      }
      else{const w=((i+step+1)*.61803398875)%1,v=((i+step+1)*.41421356237)%1;end[0]=1-Math.sqrt(w);end[1]=Math.sqrt(w)*(1-v);end[2]=Math.sqrt(w)*v;}
      data.set([face,...start,0,...end],(i*FLOW_STEPS+step)*8);
      if(next>=0){
        const prev=face;face=Math.floor(next/3);entry=next%3;
        start=faces[face].map((id,j)=>j===entry?0:end[faces[prev].indexOf(id)]);
      }else{start=end;entry=-1;}
    }
  }
  return data;
}
export function flowPhase(time){return ((time*FLOW_RATE)%(FLOW_STEPS*2)+FLOW_STEPS*2)%(FLOW_STEPS*2);}
export function routeSample(routes,i,phase){
  const t=FLOW_STEPS-Math.abs((phase+i*.754877666)% (FLOW_STEPS*2)-FLOW_STEPS),step=Math.min(FLOW_STEPS-1,Math.floor(t)),o=(i*FLOW_STEPS+step)*8,f=t-step;
  return {triangle:routes[o],weights:[1,2,3].map(j=>routes[o+j]+(routes[o+j+4]-routes[o+j])*f)};
}
const NATIVE_SOURCE=DEPTH_WGSL+`
struct SurfaceCamera{row0:vec4f,row1:vec4f,lens:vec4f,eye:vec4f,info:vec4f,flow:vec4f};
@group(1) @binding(0) var<storage,read> surfaceSamples:array<vec4f>;
@group(1) @binding(1) var<storage,read> surfaceVertices:array<f32>;
@group(1) @binding(2) var<uniform> surfaceCamera:SurfaceCamera;
@vertex fn surfaceVS(@builtin(vertex_index) i:u32)->@builtin(position) vec4f{
  return vec4f(array<vec2f,3>(vec2f(-1.0,-1.0),vec2f(3.0,-1.0),vec2f(-1.0,3.0))[i],0.0,1.0);
}
fn surfacePoint(o:u32,ii:u32)->vec3f{
  let I=inst[ii];let v=vec3f(surfaceVertices[o],surfaceVertices[o+1u],surfaceVertices[o+2u]);
  let wp=I.pos.xyz+rotM(I.rot.xyz)*(anch(v,cloneS(I,ii))*c.sp.w*I.rot.w);
  let q=c.vp*vec4f(wp,1.0);let z=q.w-length(c.cam.xyz);
  let w=select(-max(abs(q.w),0.00001),max(abs(q.w),0.00001),q.w>=0.0);
  let ndc=vec3f(q.xy/w,1.0);
  let x=dot(surfaceCamera.row0.xyz,ndc);let y=dot(surfaceCamera.row1.xyz,ndc);
  let d=surfaceCamera.lens.x+z;let f=surfaceCamera.lens.y/tan(0.4);
  let vq=vec3f((x-surfaceCamera.eye.z)*surfaceCamera.lens.z*d/f,(y-surfaceCamera.eye.w)*d/f,-z);
  let cy=cos(surfaceCamera.eye.x);let sy=sin(surfaceCamera.eye.x);
  let ct=cos(surfaceCamera.eye.y);let st=sin(surfaceCamera.eye.y);
  let ry=vq.y*ct+vq.z*st;let rz=-vq.y*st+vq.z*ct;
  return vec3f(vq.x*cy+rz*sy,ry,-vq.x*sy+rz*cy);
}
@fragment fn surfaceFS(@builtin(position) p:vec4f)->@location(0) vec4f{
  let i=u32(p.x);let ii=min(u32(f32(i)*surfaceCamera.info.y/surfaceCamera.info.x),u32(surfaceCamera.info.y)-1u);
  let sid=min(u32(inst[ii].dat.y),u32(surfaceCamera.info.z)-1u);
  let ix=sid*u32(surfaceCamera.info.x)+i;
  var sample=surfaceSamples[ix];
  if(surfaceCamera.flow.x>=0.0){
    let span=f32(${FLOW_STEPS});let phase=surfaceCamera.flow.x+f32(i)*0.754877666;
    let t=span-abs(phase-floor(phase/(span*2.0))*(span*2.0)-span);let step=min(u32(t),${FLOW_STEPS-1}u);
    let j=u32(surfaceCamera.info.x*surfaceCamera.info.z)+(ix*${FLOW_STEPS}u+step)*2u;
    let start=surfaceSamples[j];sample=vec4f(start.x,mix(start.yzw,surfaceSamples[j+1u].yzw,t-f32(step)));
  }
  let o=u32(sample.x)*48u;
  let a=surfacePoint(o,ii);let b=surfacePoint(o+16u,ii);let d=surfacePoint(o+32u,ii);
  let position=a*sample.y+b*sample.z+d*sample.w;
  let crossNormal=cross(b-a,d-a);let len=length(crossNormal);
  let normal=crossNormal/max(len,0.00000001)*surfaceCamera.info.w;
  let row=u32(p.y);
  return encodeSceneDepth(select(position[row%3u],normal[row%3u],row>=3u));
}
`;
function nativeSamples(arr,count,flow){
  const groups=Array.from({length:count},()=>({triangles:[],cumulative:[],area:0}));
  const faces=[],vertexIDs=flow?new Map():null;
  for(let o=0;o+47<arr.length;o+=48){
    const group=groups[Math.floor(arr[o+15]+.001)];if(!group)continue;
    const ux=arr[o+16]-arr[o],uy=arr[o+17]-arr[o+1],uz=arr[o+18]-arr[o+2],
      vx=arr[o+32]-arr[o],vy=arr[o+33]-arr[o+1],vz=arr[o+34]-arr[o+2],
      area=Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx);
    if(area>1e-12){
      group.triangles.push(o/48);group.area+=area;group.cumulative.push(group.area);
      if(vertexIDs)faces[o/48]=[0,16,32].map(k=>{
        const key=[Math.floor(arr[o+15]+.001),...Array.from(arr.subarray(o+k,o+k+3),v=>Math.round(v*1e6))].join(',');
        if(!vertexIDs.has(key))vertexIDs.set(key,vertexIDs.size);
        return vertexIDs.get(key);
      });
    }
  }
  const base=count*SOURCE_COUNT*4,data=new Float32Array(base*(flow?1+FLOW_STEPS*2:1)),samples=[];
  for(const [sid,g] of groups.entries()){
    if(!g.area)throw Error('The native emitter has no nondegenerate surface');
    for(let i=0;i<SOURCE_COUNT;i++){
      const t=(i+.5)/SOURCE_COUNT*g.area;let lo=0,hi=g.cumulative.length-1;
      while(lo<hi){const mid=(lo+hi)>>1;if(g.cumulative[mid]<t)lo=mid+1;else hi=mid;}
      let u=((i+1)*.61803398875)%1,v=((i+1)*.41421356237)%1;if(u+v>1){u=1-u;v=1-v;}
      data.set([g.triangles[lo],1-u-v,u,v],(sid*SOURCE_COUNT+i)*4);
      if(flow)samples.push({triangle:g.triangles[lo],weights:[1-u-v,u,v]});
    }
  }
  if(flow)data.set(surfaceRoutes(faces,samples),base);
  return data;
}
export const MATERIAL_DEPTH=DEPTH_WGSL+`
@fragment fn sceneMaterialDepth(fi:VOut,@builtin(front_facing) ff:bool)->@location(0) vec4f{
  if(!ff&&material.alpha.z<0.5){discard;}
  if(importedAlpha(fi.uv,fi.tint.a)*c.mt.z<0.005){discard;}
  return encodeSceneDepth(fi.cp.w-length(c.cam.xyz));
}
@fragment fn sceneMaterialOpaque(fi:VOut,@builtin(front_facing) ff:bool)->@location(0) vec4f{
  if(c.mt.z<0.995||c.mt2.y==1.0||material.alpha.x>1.5){discard;}
  if(!ff&&material.alpha.z<0.5){discard;}
  if(importedAlpha(fi.uv,fi.tint.a)<0.005){discard;}
  return encodeSceneDepth(fi.cp.w-length(c.cam.xyz));
}
`;
export function patchScene(patch){
  patch("binding:1,visibility:V,buffer:{type:'read-only-storage'}","binding:1,visibility:V|F,buffer:{type:'read-only-storage'}");
  patch("binding:1,visibility:V,buffer:{type:'read-only-storage'}","binding:1,visibility:V|F,buffer:{type:'read-only-storage'}");
  patch('usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});G.dev.queue.writeBuffer(buf,0,arr);','usage:GPUBufferUsage.VERTEX|GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});G.dev.queue.writeBuffer(buf,0,arr);');
  patch('usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});G.dev.queue.writeBuffer(buf,0,arr);','usage:GPUBufferUsage.VERTEX|GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});G.dev.queue.writeBuffer(buf,0,arr);');
  patch('await window.__agPbr.build(dev,P,AG_G3_R,vb,blend);','await window.__agPbr.build(dev,P,AG_G3_R,vb,blend);await window.__agScene.build(dev,P,AG_G3_R,vb);');
  patch('rp.end();S.dispatches++;\n    st.g3fx=!direct;','rp.end();S.dispatches++;window.__agScene.native(st,enc,m,n,P);\n    st.g3fx=!direct;');
  patch('render(st,k);ctx.drawImage(st.cv,0,0,W,H);','render(st,k);ctx.drawImage(st.cv,0,0,W,H);window.__agScene.place(ctx,W,H);');
  patch('render(st,k);ctx.drawImage(ecv,0,0,W,H);','render(st,k);ctx.drawImage(ecv,0,0,W,H);window.__agScene.place(ctx,W,H);');
  patch('ensureOut(st,W,H);','ensureOut(st,W,H);window.__agScene.beforePaint(ctx,W,H);');
  patch('var lPlayModeL2=',`var _agLayerRotation=!_agIsSim(layoutMode)||window.__agObjectComposite;
      window.__agScene.layerPlacement(lCtx,sz,offCv,drawW,drawH,zoom,layer.params,_agLayerRotation,_rp.k);
      var lPlayModeL2=`);
  patch('if(lRot&&!_agIsSim(layoutMode))','if(lRot&&_agLayerRotation)');
  patch('api.splat=function(){',`api.sceneRerender=function(occluders){
    var st=ST[simUid];if(!st||!st.space3)return null;
    window.__agParticles3d.occluders=occluders;st.dirty=true;render(st,knobs());return st.cv;
  };
  api.splat=function(){`);
}
function unproject(x,y,z,c){
  const d=c.distance+z,f=c.f/Math.tan(.4),vx=(x-c.panX)*c.aspect*d/f,vy=(y-c.panY)*d/f,vz=-z,
    ct=Math.cos(c.tilt),st=Math.sin(c.tilt),cy=Math.cos(c.yaw),sy=Math.sin(c.yaw),qy=vy*ct+vz*st,qz=-vy*st+vz*ct;
  return [vx*cy+qz*sy,qy,-vx*sy+qz*cy];
}
export function installScene(w){
  let dev=null,targets=null,placement=null,enabled=false,wantSource=false,sourceFlow=null,sourceState=null,polyTargets=null,polyVertices=[],surfaceVerts=[],surfaceFaces=[];
  let modelStretch=null,collisionMesh=null,wantCollision=false,layer=null;
  const canvas=()=>{const c=w.document.createElement('canvas');return c;};
  const depth=canvas(),opaque=canvas(),depthOut=canvas(),opaqueOut=canvas();
  const source=canvas();
  const destroySource=()=>{if(sourceState){sourceState.buffer.destroy();sourceState.uniform.destroy();sourceState=null;}source.getContext('webgpu')?.unconfigure();};
  const drawSource=(st,enc,mesh,n,P)=>{
    if(!wantSource||!placement||!n||!mesh.tris)return;
    const count=Math.max(1,Math.round(st.cu[202])),key=[st.g3shape,mesh.tris,count,n,sourceFlow!=null].join('|'),
      faces=w.__agG3Meshes?.map(m=>m?.faces);
    if(!sourceState||sourceState.key!==key||faces?.some((f,i)=>f!==sourceState.faces?.[i])){
      destroySource();const data=nativeSamples(mesh.arr,count,sourceFlow!=null);
      const buffer=dev.createBuffer({size:data.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),
        uniform=dev.createBuffer({size:96,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
      dev.queue.writeBuffer(buffer,0,data);source.width=SOURCE_COUNT;source.height=6;
      source.getContext('webgpu').configure({device:dev,format:'rgba8unorm',alphaMode:'premultiplied'});
      sourceState={key,faces,buffer,uniform};api.sourceEpoch++;
    }
    const p=placement,m=p.m,c=api.camera;
    dev.queue.writeBuffer(sourceState.uniform,0,new Float32Array([
      m.a*p.W/p.width,-m.c*p.H/p.width,(m.a*p.W+m.c*p.H+2*m.e)/p.width-1,0,
      -m.b*p.W/p.height,m.d*p.H/p.height,1-(m.b*p.W+m.d*p.H+2*m.f)/p.height,0,
      c.distance,c.f,c.aspect,0,c.yaw,c.tilt,c.panX,c.panY,SOURCE_COUNT,n,count,m.a*m.d-m.b*m.c<0?-1:1,sourceFlow??-1,0,0,0]));
    const group=dev.createBindGroup({layout:P.surfaceLayout,entries:[
      {binding:0,resource:{buffer:sourceState.buffer}},{binding:1,resource:{buffer:mesh.buf}},{binding:2,resource:{buffer:sourceState.uniform}}]});
    const pass=enc.beginRenderPass({colorAttachments:[{view:source.getContext('webgpu').getCurrentTexture().createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:0}}]});
    pass.setPipeline(P.surfacePipeline);pass.setBindGroup(0,st.g3bgR);pass.setBindGroup(1,group);pass.draw(3);pass.end();
    api.sourceValid=true;api.sourceSerial++;
  };
  const destroyTargets=()=>{if(targets){targets.z.destroy();for(const t of targets.textures)t.destroy();targets=null;}};
  const ensure=st=>{
    if(targets&&depth.width===st.ow&&depth.height===st.oh)return;
    destroyTargets();const views=[];
    for(const c of [depth,opaque]){c.width=st.ow;c.height=st.oh;c.getContext('webgpu').configure({device:dev,format:'rgba8unorm',alphaMode:'premultiplied'});views.push(c.getContext('webgpu'));}
    targets={views,textures:[],z:dev.createTexture({size:[st.ow,st.oh],format:'depth24plus',usage:GPUTextureUsage.RENDER_ATTACHMENT})};
  };
  const begin=(enc,i)=>enc.beginRenderPass({colorAttachments:[{view:targets.views[i].getCurrentTexture().createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:0}}],
    depthStencilAttachment:{view:targets.z.createView(),depthLoadOp:'clear',depthStoreOp:'discard',depthClearValue:1}});
  const api=w.__agScene={
    depth:depthOut,opaque:opaqueOut,source,sourceValid:false,sourceSerial:0,sourceEpoch:0,valid:false,
    start(on,emit=false,flow=null,collide=false){enabled=on;wantSource=emit;wantCollision=collide;sourceFlow=flow;api.valid=false;api.sourceValid=false;layer=null;placement=null;polyVertices=[];surfaceVerts=[];surfaceFaces=[];api.surfaceMesh=null;api.matrix=null;},
    layerPlacement(ctx,sz,off,drawW,drawH,zoom,params,rotate,cover){
      if(!(enabled||wantSource||wantCollision))return;
      const {width,height}=w.frameCv,dpr=sz.dpr,c=ctx.canvas;
      let sx=Math.max(0,Math.round((drawW-sz.W)/2*dpr)),sy=Math.max(0,Math.round((drawH-sz.H)/2*dpr));
      let sw=Math.min(off.width-sx,Math.round(sz.W*dpr)),sh=Math.min(off.height-sy,Math.round(sz.H*dpr));
      let dx=0,dy=0,dw=Math.round(sz.W*dpr),dh=Math.round(sz.H*dpr);
      if(zoom<1){dw=sw;dh=sh;dx=Math.round((sz.W*dpr-dw)/2);dy=Math.round((sz.H*dpr-dh)/2);sx=0;sy=0;sw=off.width;sh=off.height;}
      const x=(params?._offX||0)/100*sz.W*dpr,y=(params?._offY||0)/100*sz.H*dpr,rot=params?._rotation||0;
      const m=new w.DOMMatrix().translateSelf(dx,dy).scaleSelf(dw/sw,dh/sh).translateSelf(-sx,-sy);
      if(rot&&rotate)m.translateSelf(off.width/2+x,off.height/2+y).rotateSelf(rot).scaleSelf(Math.max(1,cover),Math.max(1,cover)).translateSelf(-off.width/2-x,-off.height/2-y);
      m.translateSelf(Math.round((off.width-c.width)/2+x),Math.round((off.height-c.height)/2+y));
      if(params?._flipH||params?._flipV)m.translateSelf(params._flipH?c.width:0,params._flipV?c.height:0).scaleSelf(params._flipH?-1:1,params._flipV?-1:1);
      layer={m,width,height};
    },
    async build(device,P,shader,vb){
      if(dev!==device){destroyTargets();destroySource();}dev=device;
      const module=dev.createShaderModule({label:'Shared 3D depth',code:shader+NATIVE_DEPTH});
      const info=await module.getCompilationInfo(),errors=info.messages.filter(m=>m.type==='error');
      if(errors.length)throw Error('Shared depth shader: '+errors.map(m=>m.message).join('; '));
      const make=entryPoint=>dev.createRenderPipelineAsync({layout:dev.createPipelineLayout({bindGroupLayouts:[P.g3L.r]}),
        vertex:{module,entryPoint:'vs',buffers:[vb]},fragment:{module,entryPoint,targets:[{format:'rgba8unorm'}]},
        primitive:{topology:'triangle-list'},depthStencil:{format:'depth24plus',depthWriteEnabled:true,depthCompare:'less'}});
      P.sceneDepth=await make('sceneDepth');P.sceneOpaque=await make('sceneOpaque');
      P.surfaceLayout=dev.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.FRAGMENT,buffer:{type:'read-only-storage'}},
        {binding:1,visibility:GPUShaderStage.FRAGMENT,buffer:{type:'read-only-storage'}},{binding:2,visibility:GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}}]});
      const surfaceModule=dev.createShaderModule({label:'Live mesh surface emission',code:shader+NATIVE_SOURCE});
      const surfaceInfo=await surfaceModule.getCompilationInfo(),surfaceErrors=surfaceInfo.messages.filter(m=>m.type==='error');
      if(surfaceErrors.length)throw Error('Mesh emission shader: '+surfaceErrors.map(m=>m.message).join('; '));
      P.surfacePipeline=await dev.createRenderPipelineAsync({layout:dev.createPipelineLayout({bindGroupLayouts:[P.g3L.r,P.surfaceLayout]}),
        vertex:{module:surfaceModule,entryPoint:'surfaceVS'},fragment:{module:surfaceModule,entryPoint:'surfaceFS',targets:[{format:'rgba8unorm'}]}});
    },
    native(st,enc,mesh,n,P){
      if(!enabled&&!wantSource)return;
      api.matrix=Array.from(st.cu.slice(0,16));api.distance=st.g3dist;
      drawSource(st,enc,mesh,n,P);if(!enabled)return;
      ensure(st);
      for(let i=0;i<2;i++){
        const pass=begin(enc,i);
        w.__agPbr.depth(pass,st,mesh,n,P,i===1);pass.end();
      }
      api.valid=true;
    },
    stretchModel(model){
      const s=w.__agCam?.stretch;
      if(!s||s.every(v=>v===1))return model;
      const key=s.join(',')+':'+(w.__agG3MeshVer||0);
      if(modelStretch?.model!==model||modelStretch.key!==key){
        const verts=model.verts.map(v=>v.map((x,i)=>x*s[i]));
        const normals=model.normals.map(v=>{const n=v.map((x,i)=>x/s[i]),len=Math.hypot(...n)||1;return n.map(x=>x/len);});
        modelStretch={model,key,scaled:{...model,verts,normals}};
      }
      return modelStretch.scaled;
    },
    classicSurface(ctx,vertices,model,wire,persp){
      if(!(wantSource||wantCollision)||!w.__agCam)return;
      const faces=wire.map?w._objPolys(model,wire):model.faces;
      const {m,width,height}=placement,w2=2/width,h2=2/height;
      const verts=vertices.map(p=>{
        const [x,y,z]=Array.isArray(p)?p:[p.sx,p.sy,p.depth];
        return api.worldPoint((m.a*x+m.c*y+m.e)*w2-1,1-(m.b*x+m.d*y+m.f)*h2,-z/persp);
      });
      api.surfaceMesh={verts,faces,world:true,orientation:m.a*m.d-m.b*m.c<0?-1:1};
    },
    projectedMesh(matrix,distance){
      if(!(wantSource||wantCollision)||!w.__agSceneCam)return;
      api.matrix=Array.from(matrix.slice(0,16));api.distance=distance;
    },
    colliderMesh(object){
      if(api.surfaceMesh)return api.surfaceMesh;
      const map=api.mapper();if(!map||!object)return null;
      const native=object.prim&&object.shape!=='knot';
      const mesh=native?w.agSim.particleMesh(object.shape,object.detail??4):
        object.mesh&&object.mesh!=='knot'?object.mesh:(w._objDefault||=w._objDefaultModel());
      const s=['stretchX','stretchY','stretchZ'].map(k=>(object[k]??100)/100*(object.size??60)/100*(native?1:.7));
      const key=[map.key,...s,w.__agG3MeshVer||0].join(':');
      if(collisionMesh?.mesh!==mesh||collisionMesh.key!==key){
        const verts=mesh.verts.map(v=>map([v[0]*s[0],v[1]*s[1]*(native?1:-1),v[2]*s[2]]));
        collisionMesh={mesh,key,result:{verts,faces:mesh.faces}};
      }
      return collisionMesh.result;
    },
    polygon(ctx,pts,zs,ds,persp){
      if(!enabled||!w.__agCam)return;
      const {m,width,height}=placement,points=[];
      for(let i=0;i<zs.length;i++){
        const x=pts[i*2],y=pts[i*2+1],nx=(m.a*x+m.c*y+m.e)/width*2-1,ny=1-(m.b*x+m.d*y+m.f)/height*2,
          z=-zs[i]/persp,d=ds[i]/persp;
        points.push([nx*d,ny*d,d-.02,d,z,0]);
        surfaceVerts.push(api.worldPoint(nx,ny,z));
      }
      const start=surfaceVerts.length-zs.length;surfaceFaces.push(Array.from({length:zs.length},(_,i)=>start+i));
      for(let i=1;i<points.length-1;i++)for(const p of [points[0],points[i],points[i+1]])polyVertices.push(...p);
      api.polySize=[width,height];
      api.polyOrientation=m.a*m.d-m.b*m.c<0?-1:1;
    },
    worldPoint(x,y,z){
      return unproject(x,y,z,api.camera);
    },
    mapper(){
      if(!api.matrix||!placement)return null;
      const vp=api.matrix,distance=api.distance,p=placement,c={...api.camera};
      const mapper=point=>{
        const q=Array.from({length:4},(_,r)=>vp[r]*point[0]+vp[4+r]*point[1]+vp[8+r]*point[2]+vp[12+r]),
          x=(q[0]/q[3]+1)*p.W/2,y=(1-q[1]/q[3])*p.H/2,m=p.m;
        return unproject((m.a*x+m.c*y+m.e)/p.width*2-1,1-(m.b*x+m.d*y+m.f)/p.height*2,q[3]-distance,c);
      };
      const m=p.m;mapper.orientation=m.a*m.d-m.b*m.c<0?-1:1;mapper.key=JSON.stringify([vp,distance,m.a,m.b,m.c,m.d,m.e,m.f,c]);return mapper;
    },
    flushPolygons(){
      if(!polyVertices.length)return;
      const old=api.previousSurface,key=surfaceFaces.map(f=>f.length).join(',');
      if(old?.key===key)surfaceFaces=old.faces;
      api.surfaceMesh={verts:surfaceVerts,faces:surfaceFaces,world:true,orientation:api.polyOrientation};api.previousSurface={key,faces:surfaceFaces};
      const gpu=sharedGPU();if(!gpu)return;
      const [width,height]=api.polySize,{device,pop}=gpu;
      if(!polyTargets||polyTargets.width!==width||polyTargets.height!==height){
        if(polyTargets){polyTargets.z.destroy();polyTargets.buffer?.destroy();polyTargets.canvas.getContext('webgpu').unconfigure();}
        const c=canvas();c.width=width;c.height=height;c.getContext('webgpu').configure({device,format:'rgba8unorm',alphaMode:'premultiplied'});
        polyTargets={width,height,canvas:c,z:device.createTexture({size:[width,height],format:'depth24plus',usage:GPUTextureUsage.RENDER_ATTACHMENT})};
      }
      const data=new Float32Array(polyVertices);
      if(!polyTargets.buffer||polyTargets.buffer.size<data.byteLength){polyTargets.buffer?.destroy();polyTargets.buffer=device.createBuffer({size:data.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});}
      device.queue.writeBuffer(polyTargets.buffer,0,data);
      const encoder=device.createCommandEncoder(),pass=encoder.beginRenderPass({colorAttachments:[{view:polyTargets.canvas.getContext('webgpu').getCurrentTexture().createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:0}}],
        depthStencilAttachment:{view:polyTargets.z.createView(),depthLoadOp:'clear',depthStoreOp:'discard',depthClearValue:1}});
      pass.setPipeline(pop);pass.setVertexBuffer(0,polyTargets.buffer);pass.draw(data.length/6);pass.end();device.queue.submit([encoder.finish()]);
      for(const out of [depthOut,opaqueOut]){out.width=width;out.height=height;out.getContext('2d').drawImage(polyTargets.canvas,0,0);}
      api.valid=true;
    },
    particles(st,enc,P,group){
      if(!enabled)return;ensure(st);
      const pass=begin(enc,0);pass.setPipeline(P.pDepth3);pass.setBindGroup(0,group);pass.setBindGroup(1,w.__agP3.bind(dev,P,st));pass.draw(st.trailVerts||6,st.pn);pass.end();begin(enc,1).end();api.valid=true;
    },
    beforePaint(ctx,W,H){
      const local=ctx.getTransform();
      placement=layer?{...layer,m:layer.m.multiply(local),W,H}:{m:local,W,H,width:ctx.canvas.width,height:ctx.canvas.height};
    },
    place(ctx,W,H){
      api.beforePaint(ctx,W,H);
      if(!enabled||!api.valid)return;
      for(const [out,input] of [[depthOut,depth],[opaqueOut,opaque]]){
        out.width=placement.width;out.height=placement.height;const c=out.getContext('2d');
        c.setTransform(placement.m);c.imageSmoothingEnabled=false;c.drawImage(input,0,0,W,H);
      }
    },
    placement:()=>placement,
    destroy(){destroyTargets();destroySource();if(polyTargets){polyTargets.z.destroy();polyTargets.buffer?.destroy();polyTargets.canvas.getContext('webgpu').unconfigure();polyTargets=null;}for(const c of [depth,opaque])c.getContext('webgpu')?.unconfigure();api.valid=false;}
  };
  return api;
}
const metadata=new WeakMap();
export const sceneOf=canvas=>metadata.get(canvas);
export const setScene=(canvas,scene)=>{if(scene)metadata.set(canvas,scene);else metadata.delete(canvas);return canvas;};
const COMPOSE=DEPTH_WGSL+`
@group(0) @binding(0) var a:texture_2d<f32>;
@group(0) @binding(1) var b:texture_2d<f32>;
@group(0) @binding(2) var da:texture_2d<f32>;
@group(0) @binding(3) var db:texture_2d<f32>;
@group(0) @binding(4) var oa:texture_2d<f32>;
@group(0) @binding(5) var ob:texture_2d<f32>;
@group(0) @binding(6) var<uniform> mode:vec4u;
@vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4f{
  return vec4f(array<vec2f,3>(vec2f(-1.0,-1.0),vec2f(3.0,-1.0),vec2f(-1.0,3.0))[i],0.0,1.0);
}
@fragment fn fs(@builtin(position) p:vec4f)->@location(0) vec4f{
  let xy=vec2i(p.xy);let za=textureLoad(da,xy,0);let zb=textureLoad(db,xy,0);
  if(mode.x==1u){return select(zb,za,decodeSceneDepth(za)<decodeSceneDepth(zb));}
  if(mode.x==2u){let x=textureLoad(oa,xy,0);let y=textureLoad(ob,xy,0);return select(y,x,decodeSceneDepth(x)<decodeSceneDepth(y));}
  let ca=textureLoad(a,xy,0);let cb=textureLoad(b,xy,0);
  let frontA=za.a>0.5&&zb.a>0.5&&decodeSceneDepth(za)<decodeSceneDepth(zb);
  let f=select(cb,ca,frontA);let back=select(ca,cb,frontA);
  return vec4f(f.rgb*f.a+back.rgb*back.a*(1.0-f.a),f.a+back.a*(1.0-f.a));
}
`;
const PROJECTED=DEPTH_WGSL+`
struct Projected{@builtin(position) pos:vec4f,@location(0) depth:f32};
@vertex fn vs(@location(0) p:vec4f,@location(1) depth:f32)->Projected{var o:Projected;o.pos=p;o.depth=depth;return o;}
@fragment fn fs(i:Projected)->@location(0) vec4f{return encodeSceneDepth(i.depth);}
`;
let shared=null,sharedError=null,sharedPromise=null;
function sharedGPU(){
  if(sharedError)throw sharedError;
  if(!sharedPromise)sharedPromise=(async()=>{
    if(!navigator.gpu)throw Error('Shared 3D compositing requires WebGPU');
    const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('No WebGPU adapter for shared 3D compositing');
    const device=await adapter.requestDevice();
    device.addEventListener('uncapturederror',e=>{sharedError=Error('Shared 3D GPU: '+e.error.message);});
    const module=device.createShaderModule({label:'Shared 3D composition',code:COMPOSE});
    const pipeline=await device.createRenderPipelineAsync({layout:'auto',vertex:{module,entryPoint:'vs'},fragment:{module,entryPoint:'fs',targets:[{format:'rgba8unorm'}]}});
    const poly=device.createShaderModule({label:'Projected object depth',code:PROJECTED}),
      pop=await device.createRenderPipelineAsync({layout:'auto',vertex:{module:poly,entryPoint:'vs',buffers:[{arrayStride:24,attributes:[{shaderLocation:0,offset:0,format:'float32x4'},{shaderLocation:1,offset:16,format:'float32'}]}]},
        fragment:{module:poly,entryPoint:'fs',targets:[{format:'rgba8unorm'}]},depthStencil:{format:'depth24plus',depthWriteEnabled:true,depthCompare:'less'}});
    shared={device,pipeline,pop};
  })().catch(error=>{sharedError=error;});
  return shared;
}
const merges=new Map();
function disposeMerge(id,s){
  for(const t of s.textures)t.destroy();for(const b of s.buffers)b.destroy();
  for(const c of s.canvases)c.getContext('webgpu').unconfigure();merges.delete(id);
}
export function pruneScenes(ids){
  for(const [id,s] of merges)if(!ids.has(id.split(':')[0]))disposeMerge(id,s);
}
export function composeScene(id,a,b,canvas,sortColor=true){
  const sa=sceneOf(a),sb=sceneOf(b);
  if(!sa||!sb||!sa.camera||sa.camera!==sb.camera){
    if(sa||sb){
      const single=sa&&!sb?sa:sb&&!sa?sb:null;
      setScene(canvas,{camera:single?.camera||null,depth:single?.depth||null,opaque:single?.opaque||null,roots:[...(sa?.roots||[]),...(sb?.roots||[])],
        refresh:()=>{sa?.refresh?.();sb?.refresh?.();if(sortColor){const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(a,0,0);ctx.drawImage(b,0,0);}}});
    }
    return false;
  }
  const gpu=sharedGPU();  if(!gpu){if(sortColor)canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);return true;}
  const {device,pipeline}=gpu,w=canvas.width,h=canvas.height;
  let s=merges.get(id);
  if(s&&(s.w!==w||s.h!==h)){disposeMerge(id,s);s=null;}
  if(!s){
    const textures=Array.from({length:6},()=>device.createTexture({size:[w,h],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT}));
    const canvases=Array.from({length:3},()=>{const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('webgpu').configure({device,format:'rgba8unorm',alphaMode:'premultiplied'});return c;});
    const buffers=Array.from({length:3},(_,i)=>{const buffer=device.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(buffer,0,new Uint32Array([i,0,0,0]));return buffer;});
    const groups=buffers.map(buffer=>device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[...textures.map((t,i)=>({binding:i,resource:t.createView()})),{binding:6,resource:{buffer}}]}));
    s={w,h,textures,canvases,buffers,groups};merges.set(id,s);
  }
  for(const [i,source] of [a,b,sa.depth,sb.depth,sa.opaque,sb.opaque].entries()){
    if(source)device.queue.copyExternalImageToTexture({source},{texture:s.textures[i],premultipliedAlpha:false},[w,h]);
    else device.queue.writeTexture({texture:s.textures[i]},new Uint8Array(w*h*4),{bytesPerRow:w*4},[w,h]);
  }
  const encoder=device.createCommandEncoder();
  for(let i=0;i<3;i++){const pass=encoder.beginRenderPass({colorAttachments:[{view:s.canvases[i].getContext('webgpu').getCurrentTexture().createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:0}}]});pass.setPipeline(pipeline);pass.setBindGroup(0,s.groups[i]);pass.draw(3);pass.end();}
  device.queue.submit([encoder.finish()]);
  if(sortColor){const ctx=canvas.getContext('2d');ctx.clearRect(0,0,w,h);ctx.drawImage(s.canvases[0],0,0);}
  setScene(canvas,{camera:sa.camera,depth:s.canvases[1],opaque:s.canvases[2],roots:[...sa.roots,...sb.roots],
    refresh:()=>{sa.refresh?.();sb.refresh?.();composeScene(id,a,b,canvas,sortColor);}});return true;
}
export function occludeScene(images,nonOpaque=new Set()){
  const roots=[...new Set(images.flatMap(image=>sceneOf(image)?.roots||[]))];
  let changed=false;
  for(const p of roots)if(p.kind==='particles'){
    const geometry=roots.filter(g=>g.kind==='geometry'&&g.camera===p.camera&&g.opaque&&!nonOpaque.has(g));
    const key=geometry.map(g=>g.id).sort().join('|');
    if(key!==p.occlusion){p.refresh(geometry.map(g=>g.opaque));p.occlusion=key;changed=true;}
  }
  if(changed)for(const image of images)sceneOf(image)?.refresh?.();
}
