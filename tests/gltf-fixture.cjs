// A tiny animated glTF for tests: a cube that slides along X over one second, plus a static cube for reference.
module.exports=function gltfFile(){
  const P=[-1,-1,-1, 1,-1,-1, 1,1,-1, -1,1,-1, -1,-1,1, 1,-1,1, 1,1,1, -1,1,1];
  const I=[0,1,2,0,2,3,4,6,5,4,7,6,0,4,5,0,5,1,3,2,6,3,6,7,0,3,7,0,7,4,1,5,6,1,6,2];
  const T=[0,1],V=[-3,0,0, 3,0,0];
  const parts=[Buffer.from(new Float32Array(P).buffer),Buffer.from(new Uint16Array(I).buffer),Buffer.from(new Float32Array(T).buffer),Buffer.from(new Float32Array(V).buffer)];
  const off=[];let o=0;for(const b of parts){off.push(o);o+=b.length;}
  const buf=Buffer.concat(parts);
  const g={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0,1]}],
    nodes:[{mesh:0,translation:[-3,0,0]},{mesh:0,translation:[0,4,0]}],
    meshes:[{primitives:[{attributes:{POSITION:0},indices:1}]}],
    buffers:[{byteLength:buf.length,uri:'data:application/octet-stream;base64,'+buf.toString('base64')}],
    bufferViews:parts.map((b,i)=>({buffer:0,byteOffset:off[i],byteLength:b.length})),
    accessors:[{bufferView:0,componentType:5126,count:8,type:'VEC3',min:[-1,-1,-1],max:[1,1,1]},{bufferView:1,componentType:5123,count:36,type:'SCALAR'},
      {bufferView:2,componentType:5126,count:2,type:'SCALAR',min:[0],max:[1]},{bufferView:3,componentType:5126,count:2,type:'VEC3'}],
    animations:[{name:'Slide',channels:[{sampler:0,target:{node:0,path:'translation'}}],samplers:[{input:2,output:3,interpolation:'LINEAR'}]}]};
  return {name:'slide.gltf',mimeType:'model/gltf+json',buffer:Buffer.from(JSON.stringify(g))};
};
// The same cube skinned to one joint; only the joint moves (the mesh node itself never animates).
module.exports.skinned=function(){
  const f=module.exports(),g=JSON.parse(f.buffer.toString());
  const raw=Buffer.from(g.buffers[0].uri.split(',')[1],'base64');
  const J=Buffer.from(new Uint8Array(32).buffer),W=Buffer.from(new Float32Array(Array.from({length:32},(_,i)=>i%4?0:1)).buffer);
  const all=Buffer.concat([raw,J,W]);
  g.buffers=[{byteLength:all.length,uri:'data:application/octet-stream;base64,'+all.toString('base64')}];
  g.bufferViews.push({buffer:0,byteOffset:raw.length,byteLength:32},{buffer:0,byteOffset:raw.length+32,byteLength:128});
  g.accessors.push({bufferView:4,componentType:5121,count:8,type:'VEC4'},{bufferView:5,componentType:5126,count:8,type:'VEC4'});
  g.meshes[0].primitives[0].attributes={POSITION:0,JOINTS_0:4,WEIGHTS_0:5};
  g.nodes=[{mesh:0,skin:0},{children:[0,2]},{translation:[-3,0,0]},{mesh:0,translation:[0,4,0]}];
  g.nodes[3]={mesh:0,translation:[0,4,0]};g.scenes=[{nodes:[1,3]}];g.skins=[{joints:[2]}];
  g.animations[0].channels[0].target.node=2;
  return {name:'skinned.gltf',mimeType:'model/gltf+json',buffer:Buffer.from(JSON.stringify(g))};
};
