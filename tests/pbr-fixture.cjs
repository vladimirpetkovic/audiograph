const zlib=require('node:zlib');
function crc(buf){
  let c=0xffffffff;for(const byte of buf){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;
}
function png(pixels){
  const chunk=(type,data)=>{const t=Buffer.from(type),n=Buffer.alloc(4),check=Buffer.alloc(4);n.writeUInt32BE(data.length);check.writeUInt32BE(crc(Buffer.concat([t,data])));return Buffer.concat([n,t,data,check]);};
  const ih=Buffer.alloc(13);ih.writeUInt32BE(4,0);ih.writeUInt32BE(4,4);ih[8]=8;ih[9]=6;
  const rows=Buffer.alloc(4*(1+4*4));for(let y=0;y<4;y++)for(let x=0;x<4;x++){const color=typeof pixels==='function'?pixels(x,y):pixels;rows.set(color,y*17+1+x*4);}
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
const colors=(x,y)=>y<2?(x<2?[255,0,0,255]:[255,220,0,255]):(x<2?[0,255,0,255]:[0,0,255,255]);
const positions=[-1,-1,0,0,-1,0,0,1,0,-1,1,0,0,-1,0,1,-1,0,1,1,0,0,1,0];
const uv=[0,1,1,1,1,0,0,0,0,1,1,1,1,0,0,0];
function gltf(options={}){
  const parts=[],views=[],accessors=[];
  const add=(array,type,count)=>{
    const data=Buffer.from(array.buffer,array.byteOffset,array.byteLength),offset=parts.reduce((n,b)=>n+b.length,0);
    parts.push(data);views.push({buffer:0,byteOffset:offset,byteLength:data.length});
    accessors.push({bufferView:views.length-1,componentType:array instanceof Float32Array?5126:5123,count,type});return accessors.length-1;
  };
  const pos=add(new Float32Array(positions),'VEC3',8),tex=add(new Float32Array(uv),'VEC2',8);
  const left=add(new Uint16Array([0,1,2,0,2,3]),'SCALAR',6),right=add(new Uint16Array([4,5,6,4,6,7]),'SCALAR',6);
  const normal=options.authored?add(new Float32Array(Array.from({length:8},()=>[.7,0,.7]).flat()),'VEC3',8):null;
  const time=options.animated?add(new Float32Array([0,.5,1]),'SCALAR',3):null;
  const move=options.animated?add(new Float32Array([-.3,0,0,.3,0,0,-.3,0,0]),'VEC3',3):null;
  const joints=options.skinned?add(new Uint16Array(32),'VEC4',8):null;
  const weights=options.skinned?add(new Float32Array(Array.from({length:8},()=>[1,0,0,0]).flat()),'VEC4',8):null;
  const colors0=options.vertexColors?add(new Float32Array(Array.from({length:8},()=>[.25,.5,1,1]).flat()),'VEC4',8):null;
  const image=png((x,y)=>{const c=colors(x,y);if(options.mask&&x<2)c[3]=0;return c;});
  const images=[{uri:'data:image/png;base64,'+image.toString('base64')}],textures=[{source:0,sampler:0}];
  const info={index:0};
  if(options.transform)info.extensions={KHR_texture_transform:{offset:[1,0],scale:[-1,1],rotation:0}};
  if(options.uv1)info.texCoord=1;
  const mat={pbrMetallicRoughness:{baseColorFactor:options.base||[1,1,1,options.blend?.35:1],baseColorTexture:info,
    metallicFactor:options.metallic??0,roughnessFactor:options.roughness??.85},doubleSided:!options.singleSided,
    alphaMode:options.mask?'MASK':options.blend?'BLEND':'OPAQUE'};
  const map=(color)=>{images.push({uri:'data:image/png;base64,'+png(color).toString('base64')});textures.push({source:images.length-1});return {index:textures.length-1};};
  if(options.normal)mat.normalTexture=map([255,128,180,255]);
  if(options.packed)mat.pbrMetallicRoughness.metallicRoughnessTexture=map([255,20,255,255]);
  if(options.ao)mat.occlusionTexture={...map([0,0,0,255]),strength:1};
  if(options.emissive){mat.emissiveFactor=[1,1,1];mat.emissiveTexture=map([255,30,10,255]);}
  const binary=Buffer.concat(parts),attributes={POSITION:pos,TEXCOORD_0:tex};
  if(options.uv1)attributes.TEXCOORD_1=tex;
  if(normal!==null)attributes.NORMAL=normal;
  if(options.skinned){attributes.JOINTS_0=joints;attributes.WEIGHTS_0=weights;}
  if(colors0!==null)attributes.COLOR_0=colors0;
  const g={asset:{version:'2.0'},buffers:[{byteLength:binary.length,uri:'data:application/octet-stream;base64,'+binary.toString('base64')}],
    bufferViews:views,accessors,images,textures,samplers:[{wrapS:33071,wrapT:33071,magFilter:9728,minFilter:9728}],
    materials:[mat,{pbrMetallicRoughness:{baseColorFactor:[.02,.1,1,1],metallicFactor:0,roughnessFactor:.85},doubleSided:!options.singleSided}],
    meshes:[{primitives:[{attributes,indices:left,material:0},{attributes:{POSITION:pos,...(options.skinned?{JOINTS_0:joints,WEIGHTS_0:weights}:{}),...(normal!==null?{NORMAL:normal}:{})},indices:right,material:1}]}],
    nodes:[{mesh:0}],scenes:[{nodes:[0]}],scene:0};
  if(options.animated)g.animations=[{samplers:[{input:time,output:move}],channels:[{sampler:0,target:{node:0,path:'translation'}}]}];
  if(options.skinned){g.nodes[0].skin=0;g.nodes.push({});g.scenes[0].nodes.push(1);g.skins=[{joints:[1]}];if(options.animated)g.animations[0].channels[0].target.node=1;}
  return {name:'textured.gltf',mimeType:'model/gltf+json',buffer:Buffer.from(JSON.stringify(g))};
}
function glb(options={}){
  const g=JSON.parse(gltf(options).buffer),binary=Buffer.from(g.buffers[0].uri.split(',')[1],'base64');
  delete g.buffers[0].uri;
  const chunks=[binary];
  for(const image of g.images){
    const bytes=Buffer.from(image.uri.split(',')[1],'base64'),offset=chunks.reduce((n,b)=>n+b.length,0);
    g.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length});image.bufferView=g.bufferViews.length-1;image.mimeType='image/png';delete image.uri;
    chunks.push(bytes,Buffer.alloc((4-bytes.length%4)%4));
  }
  const bin=Buffer.concat(chunks);g.buffers[0].byteLength=bin.length;
  const text=Buffer.from(JSON.stringify(g)),json=Buffer.concat([text,Buffer.alloc((4-text.length%4)%4,32)]),head=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);
  head.writeUInt32LE(0x46546c67);head.writeUInt32LE(2,4);head.writeUInt32LE(28+json.length+bin.length,8);
  jh.writeUInt32LE(json.length);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(bin.length);bh.writeUInt32LE(0x004e4942,4);
  return {name:'textured.glb',mimeType:'model/gltf-binary',buffer:Buffer.concat([head,jh,json,bh,bin])};
}
function usd(options={}){
  return `#usda 1.0
def Xform "Asset" {
 rel material:binding = </Asset/Looks/Color>
 def Mesh "Panels" {
  point3f[] points = [(-1,-1,0),(0,-1,0),(0,1,0),(-1,1,0),(0,-1,0),(1,-1,0),(1,1,0),(0,1,0)]
  int[] faceVertexCounts = [4,4]
  int[] faceVertexIndices = [0,1,2,3,4,5,6,7]
  texCoord2f[] primvars:st = [(0,0),(1,0),(1,1),(0,1),(0,0),(1,0),(1,1),(0,1)] (
    interpolation = "vertex"
  )
  def GeomSubset "BlueFace" {
    uniform token elementType = "face"
    int[] indices = [1]
    rel material:binding = </Asset/Looks/Blue>
  }
 }
 def Scope "Looks" {
  def Material "Color" {
   token outputs:surface.connect = </Asset/Looks/Color/Surface.outputs:surface>
   def Shader "Surface" {
    uniform token info:id = "UsdPreviewSurface"
    color3f inputs:diffuseColor.connect = </Asset/Looks/Color/Texture.outputs:rgb>
    float inputs:roughness = 0.85
    float inputs:metallic = 0
    ${options.maps?`float inputs:roughness.connect = </Asset/Looks/Color/Data.outputs:g>
    float inputs:metallic.connect = </Asset/Looks/Color/Data.outputs:b>
    normal3f inputs:normal.connect = </Asset/Looks/Color/Normal.outputs:rgb>
    color3f inputs:emissiveColor.connect = </Asset/Looks/Color/Texture.outputs:rgb>`:''}
    ${options.mask?`float inputs:opacity.connect = </Asset/Looks/Color/Texture.outputs:a>
    float inputs:opacityThreshold = 0.5`:''}
   }
   def Shader "Texture" {
    uniform token info:id = "UsdUVTexture"
    asset inputs:file = @textures/color.png@
    token inputs:sourceColorSpace = "sRGB"
    float2 inputs:st.connect = </Asset/Looks/Color/Reader.outputs:result>
   }
   def Shader "Reader" {
    uniform token info:id = "UsdPrimvarReader_float2"
    token inputs:varname = "st"
   }
   ${options.maps?`def Shader "Data" {
    uniform token info:id = "UsdUVTexture"
    asset inputs:file = @textures/data.png@
    token inputs:sourceColorSpace = "raw"
    float2 inputs:st.connect = </Asset/Looks/Color/Reader.outputs:result>
   }
   def Shader "Normal" {
    uniform token info:id = "UsdUVTexture"
    asset inputs:file = @textures/normal.png@
    token inputs:sourceColorSpace = "raw"
    float4 inputs:scale = (2,2,2,1)
    float4 inputs:bias = (-1,-1,-1,0)
    float2 inputs:st.connect = </Asset/Looks/Color/Reader.outputs:result>
   }`:''}
  }
  def Material "Blue" {
   token outputs:surface.connect = </Asset/Looks/Blue/Surface.outputs:surface>
   def Shader "Surface" {
    uniform token info:id = "UsdPreviewSurface"
    color3f inputs:diffuseColor = (0.02,0.1,1)
    float inputs:roughness = 0.85
    float inputs:metallic = 0
   }
  }
 }
}`;
}
function zip(entries){
  const files=[],central=[];let offset=0;
  for(const [name,data] of entries){
    const n=Buffer.from(name),header=Buffer.alloc(30),dir=Buffer.alloc(46),check=crc(data);
    header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt32LE(check,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(n.length,26);
    dir.writeUInt32LE(0x02014b50);dir.writeUInt16LE(20,4);dir.writeUInt16LE(20,6);dir.writeUInt32LE(check,16);dir.writeUInt32LE(data.length,20);dir.writeUInt32LE(data.length,24);dir.writeUInt16LE(n.length,28);dir.writeUInt32LE(offset,42);
    files.push(header,n,data);central.push(dir,n);offset+=30+n.length+data.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...files,directory,end]);
}
const usdz=(binary,options={})=>({name:binary?'binary-materials.usdz':'textured.usdz',mimeType:'model/vnd.usdz+zip',
  buffer:zip([[binary?'root.usdc':'root.usda',binary||Buffer.from(usd(options))],['textures/color.png',png((x,y)=>{const c=colors(x,y);if(options.mask&&x<2)c[3]=0;return c;})],
    ...(options.maps?[['textures/data.png',png([255,20,255,255])],['textures/normal.png',png([255,128,180,255])]]:[])])});
module.exports={gltf,glb,png,usd,usdz,zip};
