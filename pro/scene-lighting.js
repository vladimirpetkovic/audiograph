import {DEPTH_WGSL,sceneOf,setScene} from './scene3d.js';
import {SCENE_DISTANCE} from './particles3d.js';

const UNIFORM=`
struct Lighting{lens:vec4f,ao:vec4f,haze:vec4f,color:vec4f};
`;
const VERTEX=`
@vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4f{
  return vec4f(array<vec2f,3>(vec2f(-1.0,-1.0),vec2f(3.0,-1.0),vec2f(-1.0,3.0))[i],0.0,1.0);
}
`;
const AO=DEPTH_WGSL+UNIFORM+VERTEX+`
@group(0) @binding(0) var depth:texture_2d<f32>;
@group(0) @binding(1) var<uniform> light:Lighting;
fn point(p:vec2i)->vec3f{
  let xy=clamp(p,vec2i(0),vec2i(textureDimensions(depth))-1);
  let d=max(0.001,decodeSceneDepth(textureLoad(depth,xy,0))+light.lens.z);
  let ndc=(vec2f(xy)+0.5)/light.ao.zw*2.0-1.0;
  return vec3f(ndc.x*light.lens.x*d/light.lens.y,-ndc.y*d/light.lens.y,-d);
}
@fragment fn fs(@builtin(position) p:vec4f)->@location(0) vec4f{
  let xy=vec2i(p.xy*light.ao.zw/ceil(light.ao.zw*0.5));
  if(textureLoad(depth,xy,0).a<0.5){return vec4f(1.0);}
  let c=point(xy);let left=point(xy-vec2i(1,0));let right=point(xy+vec2i(1,0));
  let up=point(xy-vec2i(0,1));let down=point(xy+vec2i(0,1));
  let dx=select(c-left,right-c,abs(right.z-c.z)<abs(left.z-c.z));
  let dy=select(c-up,down-c,abs(down.z-c.z)<abs(up.z-c.z));
  let crossNormal=cross(dx,dy);let len=length(crossNormal);
  if(len<0.0000001){return vec4f(1.0);}
  var normal=crossNormal/len;
  if(dot(normal,-c)<0.0){normal=-normal;}
  let radius=light.lens.w;
  let pixels=clamp(radius*light.lens.y*light.ao.w/max(0.001,-2.0*c.z),2.0,light.ao.w*0.15);
  var sum=0.0;
  for(var i=0u;i<16u;i++){
    let t=(f32(i)+0.5)/16.0;let angle=f32(i)*2.39996323;
    let sample=clamp(xy+vec2i(vec2f(cos(angle),sin(angle))*sqrt(t)*pixels),
      vec2i(0),vec2i(textureDimensions(depth))-1);
    if(textureLoad(depth,sample,0).a<0.5){continue;}
    let delta=point(sample)-c;let d=length(delta);
    if(d>0.00001){sum+=max(0.0,dot(delta/d,normal)-0.12)*(1.0-smoothstep(radius*0.5,radius*1.5,d));}
  }
  return vec4f(vec3f(clamp(1.0-light.ao.x*sum/6.0,0.05,1.0)),1.0);
}
`;
const SHADE=DEPTH_WGSL+UNIFORM+VERTEX+`
@group(0) @binding(0) var image:texture_2d<f32>;
@group(0) @binding(1) var depth:texture_2d<f32>;
@group(0) @binding(2) var occlusion:texture_2d<f32>;
@group(0) @binding(3) var<uniform> light:Lighting;
@group(0) @binding(4) var sceneDepth:texture_2d<f32>;
@fragment fn fs(@builtin(position) p:vec4f)->@location(0) vec4f{
  let xy=vec2i(p.xy);let color=textureLoad(image,xy,0);
  let encoded=textureLoad(depth,xy,0);
  if(encoded.a<0.5||color.a<0.001){return vec4f(color.rgb*color.a,color.a);}
  let z=decodeSceneDepth(encoded);var ao=1.0;
  if(light.ao.y>0.5){
    let size=vec2i(textureDimensions(occlusion));
    let q=vec2i(p.xy*vec2f(size)/light.ao.zw);
    var sum=0.0;var weight=0.0;
    for(var y=-1;y<=1;y++){for(var x=-1;x<=1;x++){
      let sample=clamp(q+vec2i(x,y),vec2i(0),size-1);
      let full=clamp(vec2i((vec2f(sample)+0.5)*light.ao.zw/vec2f(size)),
        vec2i(0),vec2i(textureDimensions(depth))-1);
      let d=textureLoad(sceneDepth,full,0);
      if(d.a<0.5){continue;}
      let w=exp(-abs(decodeSceneDepth(d)-z)/max(0.001,light.lens.w*0.15));
      sum+=textureLoad(occlusion,sample,0).r*w;weight+=w;
    }}
    if(weight>0.0001){ao=sum/weight;}
  }
  let distance=max(0.0,z+light.lens.z);
  let fog=select(0.0,smoothstep(light.haze.x,light.haze.y,distance)*light.haze.z,light.haze.w>0.5);
  return vec4f(mix(color.rgb*ao,light.color.rgb,fog)*color.a,color.a);
}
`;
let gpu=null,error=null,promise=null;
const passes=new Map();
const active=new Set();
function initialize(onReady){
  if(error)throw error;
  if(!promise)promise=(async()=>{
    if(!navigator.gpu)throw Error('Scene lighting requires WebGPU');
    const adapter=await navigator.gpu.requestAdapter();
    if(!adapter)throw Error('No WebGPU adapter for scene lighting');
    const device=await adapter.requestDevice();
    device.addEventListener('uncapturederror',e=>{error=Error('Scene lighting: '+e.error.message);onReady?.();});
    const make=(label,code,format)=>{
      const module=device.createShaderModule({label,code});
      return device.createRenderPipelineAsync({label,layout:'auto',
        vertex:{module,entryPoint:'vs'},fragment:{module,entryPoint:'fs',targets:[{format}]}});
    };
    const [ao,shade]=await Promise.all([make('Scene ambient occlusion',AO,'r8unorm'),make('Scene depth lighting',SHADE,'rgba8unorm')]);
    gpu={device,ao,shade};onReady?.();
  })().catch(e=>{error=e;onReady?.();});
  return gpu;
}
function dispose(id,s){
  for(const texture of s.textures)texture.destroy();
  s.uniform.destroy();s.canvas.getContext('webgpu').unconfigure();passes.delete(id);
}
export function pruneSceneLighting(ids){
  for(const [id,s] of passes)if(!ids.has(id.split(':')[0]))dispose(id,s);
}
export function beginSceneLighting(){active.clear();}
export function endSceneLighting(){
  for(const [id,s] of passes)if(!active.has(id))dispose(id,s);
}
export function shadeScene(id,image,settings,onReady,aoDepth){
  const meta=sceneOf(image);
  const ao=settings?.ambientOcclusion&&settings.aoStrength>0,haze=settings?.depthHaze&&settings.hazeStrength>0;
  if(!meta?.camera||!meta.depth||!ao&&!haze){if(passes.has(id))dispose(id,passes.get(id));return image;}
  active.add(id);
  const context=initialize(onReady);if(!context)return image;
  const {device}=context,w=image.width,h=image.height,global=!!aoDepth&&aoDepth!==meta.depth;
  let s=passes.get(id);
  if(s&&(s.w!==w||s.h!==h||s.global!==global)){dispose(id,s);s=null;}
  if(!s){
    const texture=(size,format,usage)=>device.createTexture({size,format,usage});
    const input=GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT;
    const color=texture([w,h],'rgba8unorm',input),depth=texture([w,h],'rgba8unorm',input),
      occlusion=texture([Math.ceil(w/2),Math.ceil(h/2)],'r8unorm',GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.RENDER_ATTACHMENT);
    const sceneDepth=global?texture([w,h],'rgba8unorm',input):depth;
    const uniform=device.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    canvas.getContext('webgpu').configure({device,format:'rgba8unorm',alphaMode:'premultiplied'});
    const aoGroup=device.createBindGroup({layout:context.ao.getBindGroupLayout(0),
      entries:[{binding:0,resource:sceneDepth.createView()},{binding:1,resource:{buffer:uniform}}]});
    const shadeGroup=device.createBindGroup({layout:context.shade.getBindGroupLayout(0),
      entries:[color,depth,occlusion].map((t,binding)=>({binding,resource:t.createView()})).concat(
        {binding:3,resource:{buffer:uniform}},{binding:4,resource:sceneDepth.createView()})});
    s={w,h,global,textures:[color,depth,occlusion,...(global?[sceneDepth]:[])],uniform,canvas,aoGroup,shadeGroup};passes.set(id,s);
  }
  const [,,zoom,focal]=JSON.parse(meta.camera),f=Number(focal)/28;
  const hex=settings.hazeColor.slice(1),rgb=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255);
  device.queue.writeBuffer(s.uniform,0,new Float32Array([
    w/h,f/Math.tan(.4),SCENE_DISTANCE*f/(Number(zoom)/100),settings.aoRadius,
    settings.aoStrength/100,ao?1:0,w,h,
    settings.hazeStart,settings.hazeEnd,settings.hazeStrength/100,haze?1:0,
    ...rgb,1
  ]));
  for(const [i,source] of [image,meta.depth].entries())
    device.queue.copyExternalImageToTexture({source},{texture:s.textures[i],premultipliedAlpha:false},[w,h]);
  if(global)device.queue.copyExternalImageToTexture({source:aoDepth},{texture:s.textures[3],premultipliedAlpha:false},[w,h]);
  const encoder=device.createCommandEncoder();
  if(ao){
    const pass=encoder.beginRenderPass({colorAttachments:[{view:s.textures[2].createView(),loadOp:'clear',storeOp:'store',clearValue:{r:1,g:0,b:0,a:1}}]});
    pass.setPipeline(context.ao);pass.setBindGroup(0,s.aoGroup);pass.draw(3);pass.end();
  }
  const pass=encoder.beginRenderPass({colorAttachments:[{view:s.canvas.getContext('webgpu').getCurrentTexture().createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:0}}]});
  pass.setPipeline(context.shade);pass.setBindGroup(0,s.shadeGroup);pass.draw(3);pass.end();device.queue.submit([encoder.finish()]);
  setScene(s.canvas,meta);return s.canvas;
}
