import {EXRLoader} from './vendor/exr-loader.js';
import {FloatType} from './exr-types.js';
const MAX_FILE=32*1024*1024, MAX_PIXELS=32*1024*1024;
const decoded=new Map();
const CACHE_SIZE=2;
let lastData=null,lastImage=null;

export function decodeHDR(input){
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
  let at=0;
  const line=()=>{
    const start=at;while(at<bytes.length&&bytes[at]!==10)at++;
    if(at===bytes.length)throw Error('Invalid HDR: truncated header');
    let end=at++;if(end>start&&bytes[end-1]===13)end--;
    return String.fromCharCode(...bytes.subarray(start,Math.min(end,start+4096)));
  };
  if(!/^#\?(RADIANCE|RGBE)$/.test(line()))throw Error('Invalid HDR: missing Radiance signature');
  let format=false,s;
  do{s=line();if(s==='FORMAT=32-bit_rle_rgbe')format=true;}while(s);
  if(!format)throw Error('Invalid HDR: unsupported Radiance format');
  const match=/^([+-])([XY])\s+(\d+)\s+([+-])([XY])\s+(\d+)$/.exec(line());
  if(!match||match[2]===match[5])throw Error('Invalid HDR: unsupported image orientation');
  const major=+match[3],minor=+match[6],width=match[2]==='X'?major:minor,height=match[2]==='Y'?major:minor;
  if(!width||!height||width*height>MAX_PIXELS)throw Error('HDR image dimensions are too large');
  const pixels=new Float32Array(width*height*3),scan=new Uint8Array(minor*4);
  const read=()=>{if(at>=bytes.length)throw Error('Invalid HDR: truncated pixels');return bytes[at++];};
  for(let row=0;row<major;row++){
    const a=read(),b=read(),c=read(),d=read();
    if(minor>=8&&minor<=32767&&a===2&&b===2&&!(c&128)){
      if((c<<8|d)!==minor)throw Error('Invalid HDR: scanline width mismatch');
      for(let channel=0;channel<4;channel++){
        let x=0;
        while(x<minor){
          const n=read();
          if(n>128){const count=n-128,value=read();if(!count||x+count>minor)throw Error('Invalid HDR: bad RLE run');for(let i=0;i<count;i++)scan[(x++)*4+channel]=value;}
          else{if(!n||x+n>minor)throw Error('Invalid HDR: bad RLE literal');for(let i=0;i<n;i++)scan[(x++)*4+channel]=read();}
        }
      }
    }else{
      let x=0,shift=0,prev=null,rgba=[a,b,c,d];
      while(x<minor){
        if(rgba[0]===1&&rgba[1]===1&&rgba[2]===1){
          const count=rgba[3]*Math.pow(256,shift++);
          if(!prev||shift>4||x+count>minor)throw Error('Invalid HDR: bad old RLE run');
          for(let i=0;i<count;i++)scan.set(prev,(x++)*4);
        }else{scan.set(rgba,x++*4);prev=rgba;shift=0;}
        if(x<minor)rgba=[read(),read(),read(),read()];
      }
    }
    for(let x=0;x<minor;x++){
      const position=(axis,sign,value)=>axis==='X'?(sign==='+'?value:width-1-value):(sign==='-'?value:height-1-value);
      const a=position(match[2],match[1],row),b=position(match[5],match[4],x);
      const xx=match[2]==='X'?a:b,yy=match[2]==='Y'?a:b,src=x*4,dst=(yy*width+xx)*3,e=scan[src+3];
      const scale=e?Math.pow(2,e-136):0;
      for(let k=0;k<3;k++)pixels[dst+k]=scan[src+k]*scale;
    }
  }
  return {width,height,pixels};
}
export function decodeEXR(input){
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
  if(bytes.length<8||bytes.length>MAX_FILE)throw Error('Invalid EXR: truncated or oversized file');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(view.getUint32(0,true)!==20000630)throw Error('Invalid EXR: missing OpenEXR signature');
  if(view.getUint32(4,true)&0x1800)throw Error('EXR deep and multipart images are not supported; export a single RGB panorama');
  let at=8,dimensions=false;
  const text=()=>{
    const start=at;while(at<bytes.length&&bytes[at]&&at-start<256)at++;
    if(at>=bytes.length||bytes[at])throw Error('Invalid EXR: malformed header');
    return new TextDecoder().decode(bytes.subarray(start,at++));
  };
  while(at<bytes.length){
    const name=text();if(!name)break;
    const type=text();
    if(at+4>bytes.length)throw Error('Invalid EXR: truncated attribute');
    const size=view.getUint32(at,true);at+=4;
    if(size>bytes.length-at)throw Error('Invalid EXR: truncated attribute');
    if(name==='dataWindow'){
      if(type!=='box2i'||size!==16)throw Error('Invalid EXR: malformed data window');
      const width=view.getInt32(at+8,true)-view.getInt32(at,true)+1;
      const height=view.getInt32(at+12,true)-view.getInt32(at+4,true)+1;
      if(width<=0||height<=0||width*height>MAX_PIXELS)throw Error('EXR image dimensions are too large');
      dimensions=true;
    }
    at+=size;
  }
  if(!dimensions)throw Error('Invalid EXR: missing data window');
  const result=new EXRLoader().setDataType(FloatType).parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  const {width,height,data}=result,pixels=new Float32Array(width*height*3);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++){
    const value=data[((height-1-y)*width+x)*4+c];
    if(!Number.isFinite(value))throw Error('Invalid EXR: non-finite lighting value');
    pixels[(y*width+x)*3+c]=value;
  }
  return {width,height,pixels};
}
export function decodeEnvironment(input){
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
  return bytes.length>=4&&new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(0,true)===20000630?decodeEXR(bytes):decodeHDR(bytes);
}

function dataBytes(data){
  if(typeof data!=='string'||!/^data:[^,]*;base64,/i.test(data))throw Error('Invalid environment: expected embedded data URL');
  const encoded=data.slice(data.indexOf(',')+1);
  if(encoded.length>Math.ceil(MAX_FILE*4/3)+4||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))throw Error('Invalid environment: invalid or oversized data');
  let binary;try{binary=atob(encoded);}catch{throw Error('Invalid environment: malformed base64');}
  return Uint8Array.from(binary,c=>c.charCodeAt(0));
}
function digest(data){
  let a=0x811c9dc5,b=0x9e3779b9;
  for(let i=0;i<data.length;i++){const c=data.charCodeAt(i);a=Math.imul(a^c,0x01000193);b=Math.imul(b^c,0x85ebca6b)^(b>>>13);}
  return data.length+':'+(a>>>0).toString(36)+':'+(b>>>0).toString(36);
}
// Caches only downsampled upload images under a content digest, so stale scenes do not retain decoded HDRs or base64 strings.
function imageFor(data){
  if(data===lastData)return lastImage;
  const id=digest(data);let image=decoded.get(id);
  if(image)decoded.delete(id);
  else image=uploadPixels(decodeEnvironment(dataBytes(data)));
  decoded.set(id,image);
  while(decoded.size>CACHE_SIZE)decoded.delete(decoded.keys().next().value);
  lastData=data;lastImage=image;return image;
}
export function clearEnvironmentCache(){decoded.clear();lastData=lastImage=null;}
export function validateEnvironment(value){
  if(value?.data)imageFor(value.data);
  return value;
}
export async function importEnvironment(file){
  if(!file||file.size>MAX_FILE)throw Error('Environment file exceeds 32 MB');
  const bytes=new Uint8Array(await file.arrayBuffer());if(bytes.length>MAX_FILE)throw Error('Environment file exceeds 32 MB');
  decodeEnvironment(bytes);
  let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return {name:String(file.name||'Environment.hdr'),data:'data:application/octet-stream;base64,'+btoa(binary),intensity:1,rotation:0};
}

const WGSL=`
@group(0) @binding(0) var source:texture_2d<f32>;
@group(0) @binding(1) var samp:sampler;
@group(0) @binding(2) var output:texture_storage_2d<rgba16float,write>;
struct Params{rough:f32, diffuse:f32, pad:vec2f};
@group(0) @binding(3) var<uniform> p:Params;
const PI:f32=3.14159265359;
fn radical(i:u32)->f32{
 var x=i;x=(x<<16u)|(x>>16u);x=((x&0x55555555u)<<1u)|((x&0xaaaaaaaau)>>1u);
 x=((x&0x33333333u)<<2u)|((x&0xccccccccu)>>2u);x=((x&0x0f0f0f0fu)<<4u)|((x&0xf0f0f0f0u)>>4u);
 x=((x&0x00ff00ffu)<<8u)|((x&0xff00ff00u)>>8u);return f32(x)*2.3283064365386963e-10;
}
fn uv(d:vec3f)->vec2f{return vec2f(atan2(d.z,d.x)/(2.0*PI)+0.5,acos(clamp(d.y,-1.0,1.0))/PI);}
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) id:vec3u){
 let size=textureDimensions(output);if(id.x>=size.x||id.y>=size.y){return;}
 let q=(vec2f(id.xy)+0.5)/vec2f(size);let phi=(q.x-0.5)*2.0*PI;let theta=q.y*PI;
 let n=vec3f(sin(theta)*cos(phi),cos(theta),sin(theta)*sin(phi));
 let up=select(vec3f(0.0,1.0,0.0),vec3f(1.0,0.0,0.0),abs(n.y)>0.99);
 let t=normalize(cross(up,n));let b=cross(n,t);var sum=vec3f(0.0);var weight=0.0;
 for(var i=0u;i<64u;i++){
   let xi=vec2f((f32(i)+0.5)/64.0,radical(i));let a=2.0*PI*xi.x;
   var ct=sqrt(1.0-xi.y);
   if(p.diffuse<0.5){let alpha=max(p.rough*p.rough,0.0001);ct=sqrt((1.0-xi.y)/(1.0+(alpha*alpha-1.0)*xi.y));}
   let st=sqrt(max(0.0,1.0-ct*ct));let h=t*(cos(a)*st)+b*(sin(a)*st)+n*ct;
   var l=h;var w=1.0;
   if(p.diffuse<0.5){l=normalize(2.0*dot(n,h)*h-n);w=max(dot(n,l),0.0);}
   sum+=textureSampleLevel(source,samp,uv(l),0.0).rgb*w;weight+=w;
 }
 textureStore(output,id.xy,vec4f(sum/max(weight,0.00001),1.0));
}`;

const SHADER=`
@group(0) @binding(8) var envSpecTex:texture_2d<f32>;
@group(0) @binding(9) var envDiffTex:texture_2d<f32>;
@group(0) @binding(10) var envSampler:sampler;
@group(0) @binding(11) var<uniform> envSettings:vec4f;
fn envUV(r:vec3f)->vec2f{
 let cs=cos(envSettings.z);let sn=sin(envSettings.z);
 let d=normalize(vec3f(cs*r.x+sn*r.z,r.y,-sn*r.x+cs*r.z));
 return vec2f(atan2(d.z,d.x)/6.28318530718+0.5,acos(clamp(d.y,-1.0,1.0))/3.14159265359);
}
fn importedDiffuse(r:vec3f)->vec3f{return textureSampleLevel(envDiffTex,envSampler,envUV(r),0.0).rgb*envSettings.y;}
fn importedSpecular(r:vec3f,rough:f32)->vec3f{return textureSampleLevel(envSpecTex,envSampler,envUV(r),rough*envSettings.w).rgb*envSettings.y;}
`;

export function patchEnvironment(patch){
  patch('fn envC(r:vec3f,rough:f32)->vec3f{',SHADER+'\nfn envC(r:vec3f,rough:f32)->vec3f{');
  patch('var col=base*(c.lit.w*max(L.y,0.0)*shd*0.95+c.l2.x*0.5*vec3f(0.85,0.9,1.05));','var col=base*(c.lit.w*max(L.y,0.0)*shd*0.95+c.l2.x*0.5*vec3f(0.85,0.9,1.05)+select(vec3f(0.0),importedDiffuse(n),envSettings.x>0.5));');
  patch('(hemi*c.l2.x+envC(n,1.0)*0.12);','(hemi*c.l2.x+select(envC(n,1.0)*0.12,importedDiffuse(n),envSettings.x>0.5));');
  patch('envC(reflect(-V,n),rough)*Fe*c.env.y;','select(envC(reflect(-V,n),rough)*c.env.y,importedSpecular(reflect(-V,n),rough),envSettings.x>0.5)*Fe;');
  patch("{binding:7,visibility:F,sampler:{type:'comparison'}}]});var mc=",
    "{binding:7,visibility:F,sampler:{type:'comparison'}},{binding:8,visibility:F,texture:{sampleType:'float'}},{binding:9,visibility:F,texture:{sampleType:'float'}},{binding:10,visibility:F,sampler:{type:'filtering'}},{binding:11,visibility:F,buffer:{type:'uniform'}}]});var mc=");
  patch('st.g3bgR=dev.createBindGroup({layout:G.P.g3L.r,entries:[{binding:6,resource:st.g3shV},{binding:7,resource:G.g3shS},{binding:0,resource:{buffer:st.cub}},{binding:1,resource:{buffer:st.ibuf}},{binding:2,resource:st.rampV},{binding:3,resource:G.smp},{binding:4,resource:{buffer:st.ipv}},{binding:5,resource:{buffer:st.ebuf}}]});',
    'st.__agEnvBind=function(){return dev.createBindGroup({layout:G.P.g3L.r,entries:[{binding:6,resource:st.g3shV},{binding:7,resource:G.g3shS},{binding:0,resource:{buffer:st.cub}},{binding:1,resource:{buffer:st.ibuf}},{binding:2,resource:st.rampV},{binding:3,resource:G.smp},{binding:4,resource:{buffer:st.ipv}},{binding:5,resource:{buffer:st.ebuf}}].concat(window.__agEnvironment.entries(dev))})};st.g3bgR=st.__agEnvBind();st.__agEnvVersion=window.__agEnvironment.version();');
  patch('if(P.g3err||!st.g3bgR)return;','if(P.g3err||!st.g3bgR)return;window.__agEnvironment.update(dev);if(st.__agEnvVersion!==window.__agEnvironment.version()){st.g3bgR=st.__agEnvBind();st.__agEnvVersion=window.__agEnvironment.version();}');
}

function half(v){
  if(!Number.isFinite(v))return 0x7bff;
  v=Math.max(0,Math.min(65504,v));if(v<0.00006103515625)return Math.round(v/5.960464477539063e-8);
  const e=Math.floor(Math.log2(v));return Math.min(0x7bff,((e+15)<<10)+Math.round((v/Math.pow(2,e)-1)*1024));
}
function uploadPixels(image){
  const width=Math.min(512,image.width),height=Math.min(256,image.height);
  const sum=new Float64Array(width*height*4),pixels=new Uint16Array(width*height*4);
  for(let y=0;y<image.height;y++){
    const yy=Math.min(height-1,Math.floor(y*height/image.height)),weight=Math.sin(Math.PI*(y+.5)/image.height);
    for(let x=0;x<image.width;x++){
      const xx=Math.min(width-1,Math.floor(x*width/image.width)),dst=(yy*width+xx)*4,src=(y*image.width+x)*3;
      sum[dst]+=image.pixels[src]*weight;sum[dst+1]+=image.pixels[src+1]*weight;sum[dst+2]+=image.pixels[src+2]*weight;sum[dst+3]+=weight;
    }
  }
  for(let i=0;i<pixels.length;i+=4){
    for(let c=0;c<3;c++)pixels[i+c]=half(sum[i+c]/sum[i+3]);
    pixels[i+3]=0x3c00;
  }
  return {width,height,pixels};
}
export function installEnvironment(w){
  let device=null,source=null,spec=null,diff=null,uniform=null,sampler=null,pipeline=null,key='',settings=null,revision=0,paramsKey='';
  function destroyTextures(){source?.destroy();spec?.destroy();diff?.destroy();source=spec=diff=null;}
  function destroy(){destroyTextures();uniform?.destroy();uniform=null;device=null;sampler=null;pipeline=null;key='';paramsKey='';revision++;}
  function init(dev){
    if(device===dev)return;if(device)destroy();device=dev;
    uniform=dev.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    sampler=dev.createSampler({addressModeU:'repeat',addressModeV:'clamp-to-edge',magFilter:'linear',minFilter:'linear',mipmapFilter:'linear'});
    const module=dev.createShaderModule({label:'HDR environment prefilter',code:WGSL});
    pipeline=dev.createComputePipeline({layout:'auto',compute:{module,entryPoint:'main'}});
  }
  function rebuild(dev,data){
    const image=data?imageFor(data):null;
    const scaled=image?image:{width:1,height:1,pixels:new Uint16Array(4)};
    const {width,height,pixels}=scaled;
    const levels=1+Math.floor(Math.log2(Math.max(width,height)));
    const tex=(size,mipLevelCount,usage)=>dev.createTexture({size,format:'rgba16float',mipLevelCount,usage});
    const input=tex([width,height],1,GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST);
    dev.queue.writeTexture({texture:input},pixels,{bytesPerRow:width*8},[width,height]);
    const output=tex([width,height],levels,GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.STORAGE_BINDING);
    const irradiance=tex([32,16],1,GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.STORAGE_BINDING);
    const encoder=dev.createCommandEncoder(),buffers=[];
    for(let level=0;level<=levels;level++){
      const diffuse=level===levels,target=diffuse?irradiance:output,mip=diffuse?0:level;
      const buffer=dev.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});buffers.push(buffer);
      dev.queue.writeBuffer(buffer,0,new Float32Array([level/Math.max(1,levels-1),diffuse?1:0,0,0]));
      const group=dev.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[
        {binding:0,resource:input.createView()},{binding:1,resource:sampler},{binding:2,resource:target.createView({baseMipLevel:mip,mipLevelCount:1})},{binding:3,resource:{buffer}}]});
      const pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group);
      pass.dispatchWorkgroups(Math.ceil((diffuse?32:Math.max(1,width>>mip))/8),Math.ceil((diffuse?16:Math.max(1,height>>mip))/8));pass.end();
    }
    dev.queue.submit([encoder.finish()]);dev.queue.onSubmittedWorkDone().then(()=>buffers.forEach(b=>b.destroy()),()=>buffers.forEach(b=>b.destroy()));
    destroyTextures();source=input;spec=output;diff=irradiance;key=data||'';revision++;
  }
  function update(dev){
    init(dev);const data=settings?.data||'';
    if(!spec||key!==data)rebuild(dev,data);
    const values=[data?1:0,Math.max(0,Number.isFinite(settings?.intensity)?settings.intensity:1),(Number.isFinite(settings?.rotation)?settings.rotation:0)*Math.PI/180,spec.mipLevelCount-1];
    const k=values.join(',');if(k!==paramsKey){dev.queue.writeBuffer(uniform,0,new Float32Array(values));paramsKey=k;}
  }
  w.__agEnvironment={
    set(value){if(value?.data&&value.data!==settings?.data)validateEnvironment(value);settings=value?.data?value:null;},
    update,
    entries(dev){update(dev);return [{binding:8,resource:spec.createView()},{binding:9,resource:diff.createView()},{binding:10,resource:sampler},{binding:11,resource:{buffer:uniform}}];},
    version:()=>revision,
    destroy
  };
}
