const MAPS=7;
const MIP_WGSL=`
@group(0) @binding(0) var source:texture_2d<f32>;
@group(0) @binding(1) var sourceSampler:sampler;
struct MipVertex{@builtin(position) pos:vec4f,@location(0) uv:vec2f};
@vertex fn vs(@builtin(vertex_index) i:u32)->MipVertex{
  let p=array<vec2f,3>(vec2f(-1.0,-1.0),vec2f(3.0,-1.0),vec2f(-1.0,3.0))[i];
  var o:MipVertex;o.pos=vec4f(p,0.0,1.0);o.uv=vec2f(p.x*0.5+0.5,0.5-p.y*0.5);return o;
}
@fragment fn fs(i:MipVertex)->@location(0) vec4f{return textureSample(source,sourceSampler,i.uv);}
`;
const MATERIAL_WGSL=`
struct TextureMap{transform:vec4f,info:vec4f,scale:vec4f,bias:vec4f};
struct ImportedMaterial{base:vec4f,surface:vec4f,emissive:vec4f,alpha:vec4f,maps:array<TextureMap,7>};
@group(1) @binding(0) var<uniform> material:ImportedMaterial;
${Array.from({length:MAPS},(_,i)=>`@group(1) @binding(${i+1}) var map${i}:texture_2d<f32>;
@group(1) @binding(${i+8}) var sampler${i}:sampler;`).join('\n')}
fn mapUV(uv:vec4f,i:u32)->vec2f{
  let m=material.maps[i];let p=select(uv.xy,uv.zw,m.info.y>0.5)*m.transform.zw;
  let cs=cos(m.info.x);let sn=sin(m.info.x);return vec2f(p.x*cs-p.y*sn,p.x*sn+p.y*cs)+m.transform.xy;
}
fn mapColor(uv:vec4f,i:u32)->vec4f{
  let m=material.maps[i];if(m.info.w<0.5){return vec4f(1.0);}
  var color=vec4f(1.0);
  ${Array.from({length:MAPS},(_,i)=>`${i?'else ':''}if(i==${i}u){color=textureSample(map${i},sampler${i},mapUV(uv,i));}`).join('\n')}
  let uvMap=mapUV(uv,i);let flags=u32(m.info.w);
  if(((flags&2u)>0u&&(uvMap.x<0.0||uvMap.x>1.0))||((flags&4u)>0u&&(uvMap.y<0.0||uvMap.y>1.0))){return vec4f(0.0);}
  return color*m.scale+m.bias;
}
fn mapValue(uv:vec4f,i:u32)->f32{return mapColor(uv,i)[u32(clamp(material.maps[i].info.z,0.0,3.0))];}
fn importedAlpha(uv:vec4f,vertexAlpha:f32)->f32{
  let colorAlpha=select(mapColor(uv,0u).a,1.0,(u32(material.maps[0].info.w)&8u)>0u);
  let a=material.base.a*colorAlpha*mapValue(uv,6u)*vertexAlpha;
  if(material.alpha.x<0.5){return 1.0;}
  if(material.alpha.x<1.5){if(a<material.alpha.y){discard;}return 1.0;}
  return clamp(a,0.0,1.0);
}
struct ShadowVertex{@builtin(position) pos:vec4f,@location(0) uv:vec4f,@location(1) tint:vec4f};
@vertex fn vshMaterial(vin:VIn,@builtin(instance_index) ii:u32)->ShadowVertex{
  let I=inst[ii];var o:ShadowVertex;o.uv=vin.uv;o.tint=vin.tint;
  if(abs(floor(vin.fid+0.001)-I.dat.y)>0.5){o.pos=vec4f(2.0,2.0,2.0,1.0);return o;}
  let wp=I.pos.xyz+rotM(I.rot.xyz)*(anch(vin.pos,cloneS(I,ii),I.rot.w)*c.sp.w*I.rot.w);
  o.pos=c.lvp*vec4f(wp,1.0);return o;
}
@fragment fn shadowMaterial(fi:ShadowVertex,@builtin(front_facing) ff:bool){
  if(!ff&&material.alpha.z<0.5){discard;}
  if(importedAlpha(fi.uv,fi.tint.a)<0.01){discard;}
}
`;
function materialShader(source){
  const patch=(from,to)=>{if(!source.includes(from))throw Error('PBR shader contract missing: '+from);source=source.replace(from,to);};
  patch('@location(5) fid:f32};','@location(5) fid:f32,@location(6) uv:vec4f,@location(7) tint:vec4f};');
  patch('@location(7) pp:vec4f};','@location(7) pp:vec4f,@location(8) uv:vec4f,@location(9) tint:vec4f};');
  patch('var o:VOut;','var o:VOut;o.uv=vin.uv;o.tint=vin.tint;');
  patch('o.nrm=R*(mix(vin.nf,vin.ns,c.mt2.w)/S);','o.nrm=R*(vin.ns/S);');
  patch('let base=mix(pal,pow(c.col.rgb,vec3f(2.2)),c.col.w);','let base=material.base.rgb*mapColor(fi.uv,0u).rgb*fi.tint.rgb;');
  patch('let style=c.mt2.y;let alpha=c.mt.z;','let style=c.mt2.y;let alpha=c.mt.z*importedAlpha(fi.uv,fi.tint.a);');
  patch('var n=normalize(fi.nrm);if(!ff){n=-n;}',`var n=normalize(fi.nrm);if(!ff){if(material.alpha.z<0.5){discard;}n=-n;}
  let normalUV=mapUV(fi.uv,3u);let dx=dpdx(fi.wp);let dy=dpdy(fi.wp);let ux=dpdx(normalUV);let uy=dpdy(normalUV);
  if(material.maps[3].info.w>0.5){
    var q=mapColor(fi.uv,3u).xyz;if(abs(material.alpha.w)<0.5){q=q*2.0-1.0;}if(material.alpha.w<0.0){q.y=-q.y;}q=vec3f(q.xy*material.surface.z,q.z);
    let det=ux.x*uy.y-ux.y*uy.x;let t=(dx*uy.y-dy*ux.y);let b=(dy*ux.x-dx*uy.x);
    let projected=t-n*dot(n,t);
    if(abs(det)>0.000001&&length(projected)>0.000001&&length(b)>0.000001){
      let T=normalize(projected)*sign(det);let crossB=cross(n,T);let B=crossB*sign(dot(crossB,b*sign(det)));
      let mapped=T*q.x+B*q.y+n*q.z;if(dot(mapped,mapped)>0.0000000001){n=normalize(mapped);}
    }
  }
  let ao=mix(1.0,clamp(mapValue(fi.uv,4u),0.0,1.0),material.surface.w);`);
  patch('let rough=clamp(c.mt.x,0.05,1.0);let met=c.mt.y;','let rough=clamp(material.surface.x*mapValue(fi.uv,1u),0.05,1.0);let met=clamp(material.surface.y*mapValue(fi.uv,2u),0.0,1.0);');
  patch('let dif=base*(1.0-met)*nl/3.14159265*3.0;','let dif=base*(1.0-met)*(vec3f(1.0)-F)*nl/3.14159265*3.0;');
  patch('(hemi*c.l2.x+select(envC(n,1.0)*0.12,importedDiffuse(n),envSettings.x>0.5));','(hemi*c.l2.x+select(envC(n,1.0)*0.12,importedDiffuse(n),envSettings.x>0.5))*ao;');
  patch('select(envC(reflect(-V,n),rough)*c.env.y,importedSpecular(reflect(-V,n),rough),envSettings.x>0.5)*Fe;','select(envC(reflect(-V,n),rough)*c.env.y,importedSpecular(reflect(-V,n),rough),envSettings.x>0.5)*Fe*ao;');
  patch('var rgb=col;var a=alpha;','var rgb=col+material.emissive.rgb*material.emissive.w*mapColor(fi.uv,5u).rgb;var a=alpha;');
  return source+'\n'+MATERIAL_WGSL+MATERIAL_DEPTH;
}
export function patchPbr(patch){
  patch('var out=[],faces=0;','var out=[],faces=0,pbrUV=[],pbrGroups=[],pbrMaterial=null;');
  patch('function V(p,n){return {p:p,n:n||nrm(p)}}','function V(p,n,uv,tint){return {p:p,n:n||nrm(p),uv:uv,tint:tint}}');
  patch('[a,b,c].forEach(function(v){out.push',`var group=pbrGroups[pbrGroups.length-1];if(!group||group.material!==pbrMaterial){group={start:out.length/16,count:0,material:pbrMaterial};pbrGroups.push(group);}group.count+=3;
        [a,b,c].forEach(function(v){pbrUV.push.apply(pbrUV,v.uv||[0,0,0,0]);pbrUV.push.apply(pbrUV,v.tint||[1,1,1,1]);out.push`);
  patch('var buf=G.dev.createBuffer({size:arr.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});G.dev.queue.writeBuffer(buf,0,arr);',
    'if(!G.dev)return window.__agPbr.decorate(null,{verts:arr.length/16,tris:arr.length/48,faces:faces,arr:arr},pbrUV,pbrGroups);var buf=G.dev.createBuffer({size:arr.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});G.dev.queue.writeBuffer(buf,0,arr);');
  patch('return G.g3m[key]={buf:buf,verts:arr.length/16,tris:arr.length/48,faces:faces,arr:arr}}',
    'return G.g3m[key]=window.__agPbr.decorate(G.dev,{buf:buf,verts:arr.length/16,tris:arr.length/48,faces:faces,arr:arr},pbrUV,pbrGroups)}');
  patch('var arr=new Float32Array(len),o=0,fc=0;','var arr=new Float32Array(len),o=0,fc=0,mixedUV=new Float32Array(len/2),mixedGroups=[];');
  patch('parts.forEach(function(a,ix){arr.set(a,o);',
    'parts.forEach(function(a,ix){var child=g3Mesh(list[ix],D);mixedUV.set(child.pbrUV,o/2);child.pbrGroups.forEach(function(g){mixedGroups.push({start:g.start+o/16,count:g.count,material:g.material});});arr.set(a,o);');
  patch("return G.g3m[key]={buf:buf,verts:arr.length/16,tris:arr.length/48,faces:fc,arr:arr}",
    "return G.g3m[key]=window.__agPbr.decorate(G.dev,{buf:buf,verts:arr.length/16,tris:arr.length/48,faces:fc,arr:arr},mixedUV,mixedGroups)");
  patch("P.g3pa=await pf(P.g3paL,'fsa');P.g3p=await pf(P.g3pL,'fs');",
    "P.g3pa=await pf(P.g3paL,'fsa');P.g3p=await pf(P.g3pL,'fs');await window.__agPbr.build(dev,P,AG_G3_R,vb,blend);");
  patch('shp.setPipeline(P.g3sh);shp.setBindGroup(0,st.g3bgS);shp.setVertexBuffer(0,m.buf);shp.draw(m.verts,n);',
    "if(!window.__agPbr.draw(shp,st,m,n,P.g3sh,P,true)){shp.setPipeline(P.g3sh);shp.setBindGroup(0,st.g3bgS);shp.setVertexBuffer(0,m.buf);shp.draw(m.verts,n);}");
  patch('rp.setPipeline(pipe);rp.setBindGroup(0,st.g3bgR);rp.setVertexBuffer(0,m.buf);rp.draw(m.verts,n);',
    "if(!window.__agPbr.draw(rp,st,m,n,pipe,P,false)){rp.setPipeline(pipe);rp.setBindGroup(0,st.g3bgR);rp.setVertexBuffer(0,m.buf);rp.draw(m.verts,n);}");
  patch('G.g3m[_k].buf.destroy()','G.g3m[_k].buf.destroy();if(G.g3m[_k].pbrUVBuf)G.g3m[_k].pbrUVBuf.destroy()');
}
export function installPbr(w){
  const textures=new Map(),materials=new Map(),mipPipelines=new Map();
  let device=null,defaultTexture=null,defaultSampler=null;
  const destroy=()=>{
    for(const value of materials.values())value.buffer.destroy();
    for(const list of textures.values())for(const tex of list.values())tex.destroy();
    materials.clear();textures.clear();mipPipelines.clear();defaultTexture?.destroy();defaultTexture=null;defaultSampler=null;device=null;
  };
  const texture=(dev,map)=>{
    if(!map)return defaultTexture;
    let list=textures.get(map.image);if(!list){list=new Map();textures.set(map.image,list);}
    const format=map.srgb?'rgba8unorm-srgb':'rgba8unorm';
    if(list.has(format))return list.get(format);
    const image=map.image.bitmap;if(!image)throw Error('Model texture was not decoded');
    const limit=Math.min(4096,dev.limits.maxTextureDimension2D),ratio=Math.min(1,limit/Math.max(image.width,image.height));
    let width=Math.max(1,Math.round(image.width*ratio)),height=Math.max(1,Math.round(image.height*ratio));
    const levels=1+Math.floor(Math.log2(Math.max(width,height)));
    const tex=dev.createTexture({size:[width,height],format,mipLevelCount:levels,
      usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});
    let source=image;
    if(ratio<1){source=document.createElement('canvas');source.width=width;source.height=height;source.getContext('2d').drawImage(image,0,0,width,height);}
    dev.queue.copyExternalImageToTexture({source},{texture:tex,premultipliedAlpha:false},[width,height]);
    if(levels>1){
      let pipeline=mipPipelines.get(format);
      if(!pipeline){
        const module=dev.createShaderModule({label:'PBR mipmaps',code:MIP_WGSL});
        pipeline=dev.createRenderPipeline({layout:'auto',vertex:{module,entryPoint:'vs'},fragment:{module,entryPoint:'fs',targets:[{format}]},primitive:{topology:'triangle-list'}});
        mipPipelines.set(format,pipeline);
      }
      const encoder=dev.createCommandEncoder();
      for(let level=1;level<levels;level++){
        const group=dev.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[
          {binding:0,resource:tex.createView({baseMipLevel:level-1,mipLevelCount:1})},{binding:1,resource:defaultSampler}]});
        const pass=encoder.beginRenderPass({colorAttachments:[{view:tex.createView({baseMipLevel:level,mipLevelCount:1}),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:0}}]});
        pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.draw(3);pass.end();
      }
      dev.queue.submit([encoder.finish()]);
    }
    list.set(format,tex);return tex;
  };
  const materialGroup=(dev,P,mat)=>{
    if(materials.has(mat))return materials.get(mat).group;
    const U=new Float32Array(128);
    U.set(mat.base,0);U.set([mat.roughness,mat.metallic,mat.normalScale,mat.occlusionStrength],4);
    U.set([...mat.emissive,mat.emissiveStrength],8);
    U.set([{OPAQUE:0,MASK:1,BLEND:2}[mat.alphaMode]??0,mat.alphaCutoff,mat.doubleSided?1:0,mat.normalSigned?(mat.normalY===-1?-1:1):0],12);
    const entries=[];
    for(let i=0;i<MAPS;i++){
      const map=mat.maps[i],off=16+i*16;
      U.set([...(map?.offset||[0,0]),...(map?.scale||[1,1])],off);
      U.set([map?.rotation||0,map?.texCoord||0,map?.channel||0,map?1+(map.wrapS===0?2:0)+(map.wrapT===0?4:0)+(map.ignoreAlpha?8:0):0],off+4);
      U.set(map?.sampleScale||[1,1,1,1],off+8);U.set(map?.sampleBias||[0,0,0,0],off+12);
      entries.push({binding:i+1,resource:texture(dev,map).createView()});
      const wrap=value=>value===33071?'clamp-to-edge':value===33648?'mirror-repeat':'repeat';
      const sampler=map?dev.createSampler({addressModeU:wrap(map.wrapS),addressModeV:wrap(map.wrapT),
        magFilter:map.magFilter===9728?'nearest':'linear',minFilter:[9728,9984,9986].includes(map.minFilter)?'nearest':'linear',
        mipmapFilter:[9984,9985].includes(map.minFilter)?'nearest':'linear',lodMaxClamp:[9728,9729].includes(map.minFilter)?0:32}):defaultSampler;
      entries.push({binding:i+8,resource:sampler});
    }
    const buffer=dev.createBuffer({size:U.byteLength,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    dev.queue.writeBuffer(buffer,0,U);entries.push({binding:0,resource:{buffer}});
    const group=dev.createBindGroup({layout:P.pbrL,entries});materials.set(mat,{group,buffer});return group;
  };
  w.__agPbr={
    async build(dev,P,shader,vb,blend){
      if(device&&device!==dev)destroy();device=dev;
      const F=GPUShaderStage.FRAGMENT;
      const entries=[{binding:0,visibility:F,buffer:{type:'uniform'}}];
      for(let i=0;i<MAPS;i++){entries.push({binding:i+1,visibility:F,texture:{sampleType:'float'}},{binding:i+8,visibility:F,sampler:{type:'filtering'}});}
      P.pbrL=dev.createBindGroupLayout({entries});
      const module=dev.createShaderModule({label:'Imported PBR materials',code:materialShader(shader)});
      const info=await module.getCompilationInfo(),errors=info.messages.filter(m=>m.type==='error');
      if(errors.length)throw Error('PBR shader: '+errors.map(m=>m.lineNum+': '+m.message).join('; '));
      const buffers=[vb,{arrayStride:32,attributes:[{shaderLocation:6,offset:0,format:'float32x4'},{shaderLocation:7,offset:16,format:'float32x4'}]}];
      const layout=dev.createPipelineLayout({bindGroupLayouts:[P.g3L.r,P.pbrL]});
      const make=transparent=>dev.createRenderPipelineAsync({layout,vertex:{module,entryPoint:'vs',buffers},
        fragment:{module,entryPoint:'fs',targets:[transparent?{format:'rgba16float',blend}:{format:'rgba16float'},{format:'rgba16float'},{format:'rg16float'}]},
        primitive:{topology:'triangle-list',cullMode:'none'},depthStencil:{format:'depth24plus',depthWriteEnabled:!transparent,depthCompare:'less'},multisample:{count:4}});
      P.pbrOpaque=await make(false);P.pbrBlend=await make(true);
      const scene=entryPoint=>dev.createRenderPipelineAsync({layout,vertex:{module,entryPoint:'vs',buffers},
        fragment:{module,entryPoint,targets:[{format:'rgba8unorm'}]},primitive:{topology:'triangle-list'},
        depthStencil:{format:'depth24plus',depthWriteEnabled:true,depthCompare:'less'}});
      P.pbrSceneDepth=await scene('sceneMaterialDepth');P.pbrSceneOpaque=await scene('sceneMaterialOpaque');
      P.pbrShadow=await dev.createRenderPipelineAsync({layout:dev.createPipelineLayout({bindGroupLayouts:[P.g3sL,P.pbrL]}),
        vertex:{module,entryPoint:'vshMaterial',buffers},fragment:{module,entryPoint:'shadowMaterial',targets:[]},
        primitive:{topology:'triangle-list',cullMode:'none'},depthStencil:{format:'depth32float',depthWriteEnabled:true,depthCompare:'less',depthBias:2,depthBiasSlopeScale:2.5}});
      defaultTexture=dev.createTexture({size:[1,1],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
      dev.queue.writeTexture({texture:defaultTexture},new Uint8Array([255,255,255,255]),{bytesPerRow:4},[1,1]);
      defaultSampler=dev.createSampler({magFilter:'linear',minFilter:'linear'});
    },
    decorate(dev,mesh,uv,groups){
      mesh.pbrUV=uv;mesh.pbrGroups=groups;
      if(dev&&groups.some(g=>g.material)){
        mesh.pbrUVBuf=dev.createBuffer({size:Math.max(16,uv.length*4),usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});
        if(uv.length)dev.queue.writeBuffer(mesh.pbrUVBuf,0,new Float32Array(uv));
      }
      return mesh;
    },
    draw(pass,st,mesh,n,legacy,P,shadow){
      if(!mesh.pbrUVBuf)return false;
      const groups=[...mesh.pbrGroups].sort((a,b)=>(a.material?.alphaMode==='BLEND')-(b.material?.alphaMode==='BLEND'));
      for(const g of groups){
        if(g.material){
          pass.setPipeline(shadow?P.pbrShadow:g.material.alphaMode==='BLEND'||legacy===P.g3t?P.pbrBlend:P.pbrOpaque);
          pass.setBindGroup(0,shadow?st.g3bgS:st.g3bgR);pass.setBindGroup(1,materialGroup(device,P,g.material));
          pass.setVertexBuffer(1,mesh.pbrUVBuf);
        }else{pass.setPipeline(legacy);pass.setBindGroup(0,shadow?st.g3bgS:st.g3bgR);}
        pass.setVertexBuffer(0,mesh.buf);pass.draw(g.count,n,g.start);
      }
      return true;
    },
    depth(pass,st,mesh,n,P,opaque){
      for(const g of mesh.pbrGroups){
        if(g.material){
          pass.setPipeline(opaque?P.pbrSceneOpaque:P.pbrSceneDepth);
          pass.setBindGroup(1,materialGroup(device,P,g.material));pass.setVertexBuffer(1,mesh.pbrUVBuf);
        }else pass.setPipeline(opaque?P.sceneOpaque:P.sceneDepth);
        pass.setBindGroup(0,st.g3bgR);pass.setVertexBuffer(0,mesh.buf);pass.draw(g.count,n,g.start);
      }
    },
    retain(meshes){
      const keep=new Set(meshes.flatMap(m=>m?.materials||[])),images=new Set([...keep].flatMap(m=>m.maps.filter(Boolean).map(t=>t.image)));
      for(const [key,value] of materials)if(!keep.has(key)){value.buffer.destroy();materials.delete(key);}
      for(const [key,list] of textures)if(!images.has(key)){for(const tex of list.values())tex.destroy();textures.delete(key);}
    },
    stats:()=>({materials:materials.size,images:textures.size}),
    destroy
  };
}
import {MATERIAL_DEPTH} from './scene3d.js';
