export const materialDefaults=()=>({
  name:'Material',base:[1,1,1,1],roughness:1,metallic:0,emissive:[0,0,0],emissiveStrength:1,
  normalScale:1,occlusionStrength:1,alphaMode:'OPAQUE',alphaCutoff:.5,doubleSided:false,maps:Array(7).fill(null)
});
export const textureMap=(image,options={})=>({
  image,offset:[0,0],scale:[1,1],rotation:0,texCoord:0,channel:0,
  sampleScale:[1,1,1,1],sampleBias:[0,0,0,0],wrapS:10497,wrapT:10497,minFilter:9987,magFilter:9729,...options
});
export function validateMaterial(m){
  const vector=(a,n)=>Array.isArray(a)&&a.length===n&&a.every(Number.isFinite);
  if(!vector(m.base,4)||!vector(m.emissive,3)||![m.roughness,m.metallic,m.normalScale,m.occlusionStrength,m.emissiveStrength,m.alphaCutoff].every(Number.isFinite))
    throw Error('Invalid PBR material factors');
  if(!['OPAQUE','MASK','BLEND'].includes(m.alphaMode))throw Error('Invalid PBR alpha mode');
  for(const t of m.maps)if(t){
    if(!vector(t.offset,2)||!vector(t.scale,2)||!vector(t.sampleScale,4)||!vector(t.sampleBias,4)||!Number.isFinite(t.rotation))
      throw Error('Invalid model texture transform');
    if(![0,1].includes(t.texCoord)||![0,1,2,3].includes(t.channel))throw Error('Unsupported model texture coordinate/channel');
  }
  return m;
}
function embedded(uri){
  const m=/^data:([^;,]*)(;base64)?,(.*)$/s.exec(uri);
  if(!m)throw Error('External model textures are not loaded; embed them in GLB or package them in USDZ');
  const text=m[2]?atob(m[3]):m[3].replace(/%([a-f\d]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
  return {data:Uint8Array.from(text,c=>c.charCodeAt(0)),mime:m[1]};
}
export function gltfMaterials(g,buffers,used){
  const images=new Map();
  const image=index=>{
    if(images.has(index))return images.get(index);
    const src=g.images?.[index];if(!src)throw Error('Missing glTF texture image '+index);
    let asset;
    if(src.uri)asset=embedded(src.uri);
    else{
      const view=g.bufferViews?.[src.bufferView],buf=view&&buffers[view.buffer];
      if(!buf||!(view.byteLength>0)||(view.byteOffset||0)+view.byteLength>buf.byteLength)throw Error('Invalid glTF image buffer');
      asset={data:new Uint8Array(buf,view.byteOffset||0,view.byteLength),mime:src.mimeType};
    }
    images.set(index,asset);return asset;
  };
  const map=(info,options={})=>{
    if(!info)return null;
    const tex=g.textures?.[info.index];
    if(!tex||tex.source===undefined)throw Error('Unsupported glTF texture: export PNG/JPEG images instead of compressed GPU textures');
    const transform=info.extensions?.KHR_texture_transform||{},uv=transform.texCoord??info.texCoord??0;
    if(uv!==0&&uv!==1)throw Error('Model textures support UV sets 0 and 1');
    return textureMap(image(tex.source),{...g.samplers?.[tex.sampler],
      texCoord:uv,offset:transform.offset||[0,0],scale:transform.scale||[1,1],rotation:transform.rotation||0,...options});
  };
  return (g.materials||[]).map((src,index)=>{
    if(used&&!used.has(index))return {...materialDefaults(),name:src.name||'Material'};
    if(src.extensions?.KHR_materials_pbrSpecularGlossiness)throw Error('Export glTF materials using metallic/roughness PBR, not specular/glossiness');
    const p=src.pbrMetallicRoughness||{},m={...materialDefaults(),name:src.name||'Material',
      base:p.baseColorFactor||[1,1,1,1],roughness:p.roughnessFactor??1,metallic:p.metallicFactor??1,
      emissive:src.emissiveFactor||[0,0,0],emissiveStrength:src.extensions?.KHR_materials_emissive_strength?.emissiveStrength??1,
      normalScale:src.normalTexture?.scale??1,occlusionStrength:src.occlusionTexture?.strength??1,
      alphaMode:src.alphaMode||'OPAQUE',alphaCutoff:src.alphaCutoff??.5,doubleSided:!!src.doubleSided};
    m.maps=[map(p.baseColorTexture,{srgb:true}),map(p.metallicRoughnessTexture,{channel:1}),
      map(p.metallicRoughnessTexture,{channel:2}),map(src.normalTexture),map(src.occlusionTexture),
      map(src.emissiveTexture,{srgb:true}),null];
    return validateMaterial(m);
  });
}
export async function decodeMaterials(model){
  const decoded=[];
  try{
    const assets=new Set((model.materials||[]).flatMap(m=>m.maps.filter(Boolean).map(t=>t.image)));
    for(const a of assets){
      if(!a.mime||!/^image\/(png|jpeg|webp|avif)$/.test(a.mime))throw Error('Unsupported model texture format; use PNG, JPEG or WebP');
      a.bitmap=await createImageBitmap(new Blob([a.data],{type:a.mime}),{colorSpaceConversion:'none',premultiplyAlpha:'none'});
      decoded.push(a.bitmap);
    }
    model.textureBitmaps=decoded;return model;
  }catch(error){for(const b of decoded)b.close();throw Error('Model texture: '+error.message);}
}
export function releaseMaterials(model){
  for(const b of model?.textureBitmaps||[])b.close();
  if(model)model.textureBitmaps=[];
}
const variants=new WeakMap();
export function withMaterials(mesh,enabled){
  if(!mesh||typeof mesh!=='object'||!mesh.materials?.length||enabled)return mesh;
  if(!variants.has(mesh))variants.set(mesh,{...mesh,materials:null});
  return variants.get(mesh);
}
