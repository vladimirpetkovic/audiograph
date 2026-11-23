import {MAX_STOPS} from './graph.js';

const COMMON=`
struct Params {
  grid:vec4f, flow:vec4f, camera:vec4f, screen:vec4f, look:vec4f, detail:vec4f,
  ramp:array<vec4f,${MAX_STOPS}>
};
@group(0) @binding(0) var<uniform> u:Params;
fn cell(id:u32)->vec3i{
  let n=u32(u.grid.x);return vec3i(i32(id%n),i32(id/n%n),i32(id/(n*n)));
}
fn idx(p:vec3i)->u32{
  let n=i32(u.grid.x);return u32(p.x+n*(p.y+n*p.z));
}
fn within(p:vec3i)->bool{return all(p>=vec3i(0))&&all(p<vec3i(i32(u.grid.x)));}
fn world(p:vec3f)->vec3f{return ((p+0.5)/u.grid.x*2.0-1.0)*u.grid.y;}
fn coords(p:vec3f)->vec3f{return (p/u.grid.y*0.5+0.5)*u.grid.x-0.5;}
`;

const SOLVE=COMMON+`
@group(0) @binding(1) var<storage,read> src:array<vec4f>;
@group(0) @binding(2) var<storage,read_write> dst:array<vec4f>;
@group(0) @binding(3) var<storage,read_write> walls:array<u32>;
@group(0) @binding(4) var<storage,read> inject:array<vec4f>;
@group(0) @binding(5) var<storage,read> mesh:array<vec4f>;
@group(0) @binding(6) var<storage,read> pressure:array<f32>;
@group(0) @binding(7) var<storage,read_write> nextP:array<f32>;
@group(0) @binding(8) var<storage,read_write> divergence:array<f32>;
@group(0) @binding(9) var densityOut:texture_storage_3d<rgba16float,write>;
struct Deposit{ flow:vec4f, cell:vec4f };
@group(0) @binding(10) var<storage,read> deposits:array<Deposit>;
@group(0) @binding(11) var<storage,read_write> injection:array<vec4f>;
fn solid(p:vec3i)->bool{if(!within(p)){return true;}return walls[idx(p)]!=0u;}
@compute @workgroup_size(64) fn deposit(@builtin(global_invocation_id) id:vec3u){
  if(id.x>=u32(u.look.z)){return;}
  let s=deposits[id.x];
  if(s.cell.y>=0.0&&(walls[u32(s.cell.y)]==0u||walls[u32(s.cell.w)]==0u)){return;}
  injection[u32(s.cell.x)]=s.flow;
}
fn field(p:vec3i)->vec4f{if(solid(p)){return vec4f(0);}return src[idx(p)];}
fn sample(p:vec3f)->vec4f{
  let b=vec3i(floor(p));let f=fract(p);var v=vec4f(0);var sum=0.0;
  for(var z=0;z<2;z++){for(var y=0;y<2;y++){for(var x=0;x<2;x++){
    let o=vec3i(x,y,z);
    if(!solid(b+o)){let w=mix(1.0-f,f,vec3f(o));let weight=w.x*w.y*w.z;
      v+=src[idx(b+o)]*weight;sum+=weight;}
  }}}
  return v/max(sum,1e-6);
}
fn separates(axis:vec3f,a:vec3f,b:vec3f,c:vec3f,h:f32)->bool{
  let r=dot(abs(axis),vec3f(h));let x=dot(axis,a);let y=dot(axis,b);let z=dot(axis,c);
  return min(x,min(y,z))>r||max(x,max(y,z))< -r;
}
fn overlaps(p:vec3f,h:f32,i:u32)->bool{
  let a=mesh[i].xyz-p;let e=mesh[i+1u].xyz;let f=mesh[i+2u].xyz;let b=a+e;let c=a+f;
  if(separates(cross(e,f),a,b,c,h)){return false;}
  let axes=array<vec3f,3>(vec3f(1,0,0),vec3f(0,1,0),vec3f(0,0,1));
  let edges=array<vec3f,3>(e,f,f-e);
  for(var j=0u;j<3u;j++){for(var k=0u;k<3u;k++){
    if(separates(cross(axes[j],edges[k]),a,b,c,h)){return false;}
  }}
  return true;
}
@compute @workgroup_size(64) fn voxelize(@builtin(global_invocation_id) id:vec3u){
  let i=id.x;if(i>=arrayLength(&walls)){return;}
  let c=cell(i);let p=world(vec3f(c));let h=u.grid.y/u.grid.x*1.04;
  var node=0u;walls[i]=0u;
  if(u.detail.y>0.0&&c.y==i32(floor(coords(vec3f(0,-1,0)).y+.5))&&
      all(abs(p.xz)<vec2f(u.detail.y+h))){walls[i]=1u;return;}
  while(node<u32(u.grid.w)){
    let lo=mesh[node];let hi=mesh[node+1u];
    if(any(p+h<lo.xyz)||any(p-h>hi.xyz)){node=u32(hi.w);continue;}
    if(lo.w>0.0&&overlaps(p,h,u32(lo.w))){walls[i]=1u;return;}
    node+=2u;
  }
}
const X=vec3i(1,0,0);const Y=vec3i(0,1,0);const Z=vec3i(0,0,1);
fn bounded(p:vec3i,v:vec3f)->vec3f{
  return vec3f(select(v.x,0.0,solid(p+select(-X,X,v.x>0.0))),
    select(v.y,0.0,solid(p+select(-Y,Y,v.y>0.0))),
    select(v.z,0.0,solid(p+select(-Z,Z,v.z>0.0))));
}
@compute @workgroup_size(64) fn advect(@builtin(global_invocation_id) id:vec3u){
  let i=id.x;if(i>=arrayLength(&walls)){return;}
  let p=cell(i);if(solid(p)){dst[i]=vec4f(0);return;}
  let dt=u.grid.z;let h=2.0*u.grid.y/u.grid.x;
  let v0=bounded(p,src[i].xyz);let delta=clamp(v0*dt/h,vec3f(-0.85),vec3f(0.85));
  var q=vec3f(p)-delta;if(solid(vec3i(round(q)))){q=vec3f(p);}
  let v=sample(q);let w=world(vec3f(p));var s=inject[i];s.w=abs(s.w);let t=u.detail.w;
  if(u.detail.z>0.5){
    let r=length(w);let dir=w/max(r,1e-5);
    let lobe=1.0+.19*sin(8.0*dir.x+t*.8)*sin(7.0*dir.y-t)*sin(6.0*dir.z+t*.65);
    let core=1.0-smoothstep(.12,.35,r/lobe);
    let push=core+.56*(1.0-smoothstep(.26,.75,r))*smoothstep(.08,.28,r);
    s=vec4f(dir*(3.2*push),4.0*core);
  }else if(u.look.w>0.0){
    let z=i32(u.grid.x*.5);
    let pad=i32(u.look.w);
    let edge=clamp(p.z,z-pad,z+pad-1);
    let distance=f32(abs(p.z-edge))*h;
    if(distance>0.0&&distance<.4){
      let jet=inject[idx(vec3i(p.xy,edge))].z;
      s.z=jet*.9*(1.0-smoothstep(0.0,.4,distance));
    }
  }
  let curl=sin(w.yzx*vec3f(4.3,4.9,4.6))*cos(t*vec3f(1,.81,.9)+vec3f(0,1.7,3.1))+
    .56*sin(w.zxy*vec3f(8.4,7.8,8.1))*sin(t*vec3f(.6,.7,.8)+vec3f(1.1,2.6,4.2));
  let a=s.xyz*u.flow.x+vec3f(0.0,-u.flow.z*min(v.w+s.w*dt,1.0),0.0)+curl*(u.flow.w*min(v.w,1.0));
  let velocity=bounded(p,clamp(v.xyz*exp(-dt*0.9)+a*dt,vec3f(-3),vec3f(3)));
  dst[i]=vec4f(velocity,min(5.0,v.w*exp(-u.flow.y*dt)+s.w*u.flow.x*dt));
}
@compute @workgroup_size(64) fn measure(@builtin(global_invocation_id) id:vec3u){
  let i=id.x;if(i>=arrayLength(&walls)){return;}
  let p=cell(i);if(solid(p)){divergence[i]=0.0;return;}
  divergence[i]=0.5*(field(p+X).x-field(p-X).x+field(p+Y).y-field(p-Y).y+field(p+Z).z-field(p-Z).z);
}
@compute @workgroup_size(64) fn jacobi(@builtin(global_invocation_id) id:vec3u){
  let i=id.x;if(i>=arrayLength(&walls)){return;}
  let p=cell(i);if(solid(p)){nextP[i]=0.0;return;}
  let neighbors=array<vec3i,6>(p+X,p-X,p+Y,p-Y,p+Z,p-Z);
  var sum=0.0;var count=0.0;
  for(var j=0u;j<6u;j++){let q=neighbors[j];if(!solid(q)){sum+=pressure[idx(q)];count+=1.0;}}
  nextP[i]=(sum-divergence[i])/max(count,1.0);
}
fn press(p:vec3i,fallback:f32)->f32{if(solid(p)){return fallback;}return pressure[idx(p)];}
@compute @workgroup_size(64) fn project(@builtin(global_invocation_id) id:vec3u){
  let i=id.x;if(i>=arrayLength(&walls)){return;}
  let p=cell(i);
  if(solid(p)){
    dst[i]=vec4f(0);
    let s=inject[i];var contact=0.0;
    // Extend visible dye to the emitting surface, without moving fluid through solid voxels.
    if(s.w<0.0){
      let neighbors=array<vec3i,6>(X,-X,Y,-Y,Z,-Z);
      for(var j=0u;j<6u;j++){
        let o=neighbors[j];
        if(dot(s.xyz,vec3f(o))>0.0){contact=max(contact,field(p+o).w);}
      }
    }
    textureStore(densityOut,p,vec4f(contact*.8,0,0,0));return;
  }
  let a=pressure[i];let grad=0.5*vec3f(press(p+X,a)-press(p-X,a),press(p+Y,a)-press(p-Y,a),press(p+Z,a)-press(p-Z,a));
  dst[i]=vec4f(bounded(p,src[i].xyz-grad),src[i].w);
  textureStore(densityOut,p,vec4f(src[i].w,0,0,0));
}`;

const RENDER=COMMON+`
@group(0) @binding(1) var volume:texture_3d<f32>;
@group(0) @binding(2) var geometry:texture_2d_array<f32>;
@group(0) @binding(3) var linearSampler:sampler;
struct Vertex { @builtin(position) position:vec4f, @location(0) uv:vec2f };
struct Result { @location(0) color:vec4f, @location(1) depth:vec4f };
@vertex fn vertex(@builtin(vertex_index) i:u32)->Vertex{
  let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));
  return Vertex(vec4f(p[i],0,1),p[i]);
}
fn inverse(v:vec3f)->vec3f{
  let cy=cos(u.camera.x);let sy=sin(u.camera.x);let ct=cos(u.camera.y);let st=sin(u.camera.y);
  let y=v.y*ct+v.z*st;let z=-v.y*st+v.z*ct;
  return vec3f(v.x*cy+z*sy,y,-v.x*sy+z*cy);
}
fn sample(p:vec3f)->f32{
  let uv=p/(2.0*u.grid.y)+.5;return textureSampleLevel(volume,linearSampler,uv,0).r;
}
fn shade(d:f32)->vec4f{
  let ramp=(1.0-exp(-1.15*d))*(u.look.y-1.0);let stop=u32(ramp);
  return mix(u.ramp[stop],u.ramp[min(stop+1u,u32(u.look.y)-1u)],fract(ramp));
}
@fragment fn fragment(i:Vertex)->Result{
  let q=(i.uv-u.screen.xy)*vec2f(u.screen.z,1.0)/u.camera.z;
  let eye=inverse(vec3f(0,0,u.camera.w));let dir=inverse(vec3f(q,-1));
  let inv=1.0/select(dir,vec3f(1e-7),abs(dir)<vec3f(1e-7));
  let a=(-u.grid.y-eye)*inv;let b=(u.grid.y-eye)*inv;let lo=min(a,b);let hi=max(a,b);
  var start=max(0.02,max(lo.x,max(lo.y,lo.z)));var end=min(hi.x,min(hi.y,hi.z));
  let xy=vec2i((i.uv*vec2f(.5,-.5)+.5)*vec2f(textureDimensions(geometry)));
  for(var j=0;j<i32(u.screen.w);j++){
    let d=textureLoad(geometry,xy,j,0);
    if(d.a>0.5){let c=vec3u(round(d.rgb*255.0));
      end=min(end,u.camera.w+f32((c.x<<16u)|(c.y<<8u)|c.z)/16777215.0*512.0-256.0);}
  }
  if(end<=start){return Result(vec4f(0),vec4f(0));}
  let step=max((end-start)/u.detail.x,1.35*u.grid.y/u.grid.x/length(dir));
  start+=step*(0.15+0.7*fract(52.9829189*fract(dot(i.position.xy,vec2f(.06711056,.00583715)))));
  var c=vec4f(0);var front=end;
  for(var t=start;t<end;t+=step){
    let p=eye+dir*t;let d=sample(p);
    if(d>0.0005){
      let shadow=sample(p+vec3f(-.055,.08,.035));
      let edge=tanh((d-shadow)*1.9);
      let lit=clamp(.81+edge*.49,.32,1.25);
      let dye=shade(d);
      let alpha=1.0-exp(-d*step*length(dir)*u.look.x*dye.a);
      let rgb=min(dye.rgb*lit,vec3f(1));
      c+=(1.0-c.a)*alpha*vec4f(rgb,1.0);
      if(c.a>.012&&front==end){front=t;}
      if(c.a>.992){break;}
    }
  }
  if(front==end){return Result(c,vec4f(0));}
  let z=u32(round(clamp((front-u.camera.w+256.0)/512.0,0.0,1.0)*16777215.0));
  return Result(c,vec4f(vec3f(vec3u((z>>16u)&255u,(z>>8u)&255u,z&255u))/255.0,1.0));
}`;

let gpuPromise,gpu,error;
function backend(){
  if(error)throw error;
  if(!gpuPromise)gpuPromise=(async()=>{
    if(!navigator.gpu)throw Error('3D Fluid requires WebGPU');
    const adapter=await navigator.gpu.requestAdapter();
    if(!adapter)throw Error('No WebGPU adapter for 3D Fluid');
    const device=await adapter.requestDevice();
    device.addEventListener('uncapturederror',e=>{error=Error('3D Fluid GPU: '+e.error.message);});
    device.lost.then(info=>{error=Error('3D Fluid GPU: '+info.message);});
    const compute=device.createShaderModule({label:'3D fluid solver',code:SOLVE});
    const shader=device.createShaderModule({label:'3D fluid volume',code:RENDER});
    const passes=await Promise.all(['voxelize','advect','measure','jacobi','project','deposit'].map(entryPoint=>
      device.createComputePipelineAsync({layout:'auto',compute:{module:compute,entryPoint}})));
    const render=await device.createRenderPipelineAsync({layout:'auto',vertex:{module:shader,entryPoint:'vertex'},
      fragment:{module:shader,entryPoint:'fragment',targets:[{format:'rgba8unorm'},{format:'rgba8unorm'}]}});
    gpu={device,passes,render,sampler:device.createSampler({minFilter:'linear',magFilter:'linear'})};
  })().catch(e=>{error=e;});
  return gpu;
}
export async function prepareFluid3D(){
  backend();await gpuPromise;if(error)throw error;
}

export class Fluid3D{
  constructor(){
    this.canvas=document.createElement('canvas');this.ctx=this.canvas.getContext('webgpu');
    this.depthCanvas=document.createElement('canvas');this.depthCtx=this.depthCanvas.getContext('webgpu');
    if(!this.ctx||!this.depthCtx)throw Error('3D Fluid requires a WebGPU canvas');
    this.frames=0;this.steps=0;this.audioLevel=0;
  }
  stats(){return {grid:this.n,steps:this.steps,frames:this.frames,sourceCells:this.sourceCells??0};}
  dispose(){
    for(const b of this.buffers||[])b.destroy();
    this.depth?.destroy();this.density?.destroy();this.deposits?.destroy();
    this.ctx?.unconfigure();this.depthCtx?.unconfigure();this.buffers=null;this.depth=null;this.deposits=null;this.n=0;
  }
  draw({camera,width,height,quality,dt,time,frame,level,beat,props,palette=[props.fluidColor],gravity=0,
      source,flat,collisions,occluders=[],renderOnly=false}){
    const g=backend();if(!g)return null;
    const {device,passes,render,sampler}=g,n=8*Math.round(props.fluidResolution/8),total=n**3,half=props.fluidDomain/100;
    const floor=props.fluidFloor?props.fluidFloorSize/50:0;
    if(n!==this.n||this.domain!==half){
      this.dispose();this.n=n;this.steps=0;this.lastFrame=null;
      this.domain=half;this.device=device;
      const buffer=(size,flags=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST)=>device.createBuffer({size,usage:flags});
      this.uniform=buffer((6+MAX_STOPS)*16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);
      const diagnostic=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC;
      this.field=buffer(total*16,diagnostic);this.temp=buffer(total*16);this.inject=buffer(total*16);
      this.wall=buffer(total*4,diagnostic);this.pa=buffer(total*4);this.pb=buffer(total*4);this.div=buffer(total*4);
      this.mesh=buffer(16);this.buffers=[this.uniform,this.field,this.temp,this.inject,this.wall,this.pa,this.pb,this.div,this.mesh];
      this.density=device.createTexture({dimension:'3d',size:[n,n,n],format:'rgba16float',
        usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.COPY_SRC});
      this.ctx.configure({device,format:'rgba8unorm',alphaMode:'premultiplied'});
      this.depthCtx.configure({device,format:'rgba8unorm',alphaMode:'premultiplied'});
      this.collisions=undefined;this.floor=undefined;this.lastSource=undefined;this.lastFlat=undefined;this.groups=null;
      this.sourceCells=0;
    }
    const ratio=Math.min(1,({low:420,med:600,high:820,ultra:1080}[quality]||600)/height);
    const w=Math.round(width*ratio),h=Math.round(height*ratio);
    if(this.canvas.width!==w||this.canvas.height!==h){
      this.canvas.width=this.depthCanvas.width=w;this.canvas.height=this.depthCanvas.height=h;
    }
    const depthW=occluders[0]?.width||1,depthH=occluders[0]?.height||1,depthN=Math.max(1,occluders.length),depthKey=[depthW,depthH,depthN].join(':');
    if(!this.depth||this.depthKey!==depthKey){
      this.depth?.destroy();this.depthKey=depthKey;
      this.depth=device.createTexture({size:[depthW,depthH,depthN],format:'rgba8unorm',
        usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});
    }
    occluders.forEach((canvas,z)=>device.queue.copyExternalImageToTexture({source:canvas},
      {texture:this.depth,origin:{z}},[depthW,depthH]));
    const groups=Math.ceil(total/64),b=(binding,buffer)=>({binding,resource:{buffer}});
    const uniform=b(0,this.uniform),wall=b(3,this.wall),enc=device.createCommandEncoder();
    const bind=(i,entries)=>device.createBindGroup({layout:passes[i].getBindGroupLayout(0),entries});
    const advance=!renderOnly&&frame!==this.lastFrame;
    const wallsChanged=this.collisions!==collisions||this.floor!==floor;
    const flatLayers=!source&&flat?Math.max(1,Math.ceil(.07*n/(2*half))):0;
    let update=wallsChanged&&!!source;
    if(advance){
      if(this.collisions!==collisions){
        if(collisions){
          if(this.mesh.size<collisions.data.byteLength){
            const i=this.buffers.indexOf(this.mesh);this.mesh.destroy();
            this.buffers[i]=this.mesh=device.createBuffer({size:collisions.data.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
            this.groups=null;
          }
          device.queue.writeBuffer(this.mesh,0,collisions.data);
        }
        this.collisions=collisions;
      }
      this.floor=floor;
      if(this.lastSource!==source||this.lastFlat!==flat){
        const cells=new Map(),scale=n/(2*half);
        const index=(x,y,z)=>{
          const a=Math.floor(x*scale+n/2),b=Math.floor(y*scale+n/2),c=Math.floor(z*scale+n/2);
          return a<0||b<0||c<0||a>=n||b>=n||c>=n?-1:a+n*(b+n*c);
        };
        const add=(i,dx,dy,dz,dye,behind=-1,step=0,anchor=0)=>{
          if(i<0||cells.get(i)?.[6]<=step)return;
          cells.set(i,[dx,dy,dz,dye,i,behind,step,anchor]);
        };
        if(source){
          for(let i=0;i<source.length;i+=12){
            const x=source[i],y=source[i+1],z=source[i+2],dx=source[i+8],dy=source[i+9],dz=source[i+10];
            const anchor=index(x,y,z);if(anchor<0)continue;
            let previous=anchor;
            add(anchor,3*dx,3*dy,3*dz,-3);
            for(let step=1;step<=5;step++){
              const d=step*.45/scale,current=index(x+dx*d,y+dy*d,z+dz*d);
              if(current<0)break;
              if(current===previous)continue;
              add(current,3*dx,3*dy,3*dz,3,previous,step,anchor);
              previous=current;
            }
          }
        }else if(flat){
          for(let i=0;i<flat.length;i+=5){
            for(let j=0;j<flatLayers;j++){
              const z=(j+.5)/scale;
              add(index(flat[i],-flat[i+1],z),0,0,2.1,2);
              add(index(flat[i],-flat[i+1],-z),0,0,-2.1,2);
            }
          }
        }
        this.sourceCells=cells.size;
        update=true;
        if(cells.size){
          const data=new Float32Array(cells.size*8);let i=0;
          for(const v of cells.values()){data.set(v,i);i+=8;}
          if(!this.deposits||this.deposits.size<data.byteLength){
            this.deposits?.destroy();
            this.deposits=device.createBuffer({size:2**Math.ceil(Math.log2(data.byteLength)),usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
          }
          device.queue.writeBuffer(this.deposits,0,data);
        }
        this.lastSource=source;this.lastFlat=flat;
      }
    }
    const rgba=palette.flatMap(hex=>[1,3,5,7].map(i=>i>=hex.length?1:parseInt(hex.slice(i,i+2),16)/255));
    if(advance){
      const smooth=level>this.audioLevel?props.fluidAttack:props.fluidRelease;
      this.audioLevel=smooth>0?level+(this.audioLevel-level)*Math.exp(-dt*1000/smooth):level;
    }
    const sound=Math.min(1,this.audioLevel),motion=1+sound*props.fluidSoundSpeed/100;
    const swirl=props.fluidSwirl+sound*props.fluidSoundSwirl,emission=Math.min(2,this.audioLevel*props.intensity/100);
    device.queue.writeBuffer(this.uniform,0,new Float32Array([n,half,Math.min(1/16,dt)*props.fluidSpeed/100*motion,collisions?.end||0,
      props.fluidRate/100*(0.45+emission*1.3+Math.min(2,beat)*0.7),props.fluidFade/100,
      gravity/17,swirl/100,camera.yaw,camera.tilt,camera.f/Math.tan(.4),camera.distance,
      camera.panX,camera.panY,width/height,occluders.length,props.fluidOpacity/20,palette.length,this.sourceCells,flatLayers,
      Math.ceil(n*1.8),floor,source||flat?0:1,time,...rgba]));
    if(advance){
      const bindings=this.groups||=[
        bind(0,[uniform,wall,b(5,this.mesh)]),
        bind(1,[uniform,b(1,this.field),b(2,this.temp),wall,b(4,this.inject)]),
        bind(2,[uniform,b(1,this.temp),wall,b(8,this.div)]),
        bind(3,[uniform,wall,b(6,this.pa),b(7,this.pb),b(8,this.div)]),
        bind(3,[uniform,wall,b(6,this.pb),b(7,this.pa),b(8,this.div)]),
        bind(4,[uniform,b(1,this.temp),b(2,this.field),wall,b(4,this.inject),b(6,this.pa),{binding:9,resource:this.density.createView()}]),
      ];
      if(update)enc.clearBuffer(this.inject);
      const p=enc.beginComputePass();
      const dispatch=(i,j=i)=>{p.setPipeline(passes[i]);p.setBindGroup(0,bindings[j]);p.dispatchWorkgroups(groups);};
      if(wallsChanged)dispatch(0);
      if(update&&this.sourceCells){
        p.setPipeline(passes[5]);p.setBindGroup(0,bind(5,[uniform,wall,b(10,this.deposits),b(11,this.inject)]));
        p.dispatchWorkgroups(Math.ceil(this.sourceCells/64));
      }
      dispatch(1);dispatch(2);
      const iterations=2*Math.round(props.fluidPressure/2);
      for(let i=0;i<iterations;i++)dispatch(3,3+i%2);
      dispatch(4,5);p.end();this.steps++;this.lastFrame=frame;
    }
    const r=enc.beginRenderPass({colorAttachments:[this.ctx,this.depthCtx].map(ctx=>({
      view:ctx.getCurrentTexture().createView(),loadOp:'clear',storeOp:'store',clearValue:[0,0,0,0],
    }))});
    r.setPipeline(render);r.setBindGroup(0,device.createBindGroup({layout:render.getBindGroupLayout(0),entries:[
      uniform,{binding:1,resource:this.density.createView()},{binding:2,resource:this.depth.createView({dimension:'2d-array'})},
      {binding:3,resource:sampler}]}));r.draw(3);r.end();
    device.queue.submit([enc.finish()]);this.frames++;
    return this.canvas;
  }
}
