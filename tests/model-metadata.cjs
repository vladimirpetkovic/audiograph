const assert=require('node:assert/strict');
const gltfFixture=require('./gltf-fixture.cjs');

(async()=>{
  const {parseGLTF,pose}=await import('../pro/gltf.js');
  const {parseUSDModel}=await import('../pro/usd-model.js');
  const g=JSON.parse(gltfFixture().buffer.toString());
  const original=Buffer.from(g.buffers[0].uri.split(',')[1],'base64');
  const uv=Buffer.from(new Float32Array([0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1]).buffer);
  const all=Buffer.concat([original,uv]);
  g.buffers[0]={byteLength:all.length,uri:'data:application/octet-stream;base64,'+all.toString('base64')};
  g.bufferViews.push({buffer:0,byteOffset:original.length,byteLength:uv.length});
  g.accessors.push({bufferView:g.bufferViews.length-1,componentType:5126,count:8,type:'VEC2'});
  const primitive=g.meshes[0].primitives[0];
  primitive.attributes.TEXCOORD_0=g.accessors.length-1;
  primitive.material=1;
  g.meshes[0].primitives.push({...primitive,attributes:{POSITION:0},material:2});
  g.materials=[{},{},{}];
  const model=parseGLTF(new TextEncoder().encode(JSON.stringify(g)).buffer,'animated.gltf');
  const a=pose(model,0,0),b=pose(model,0,.5);
  assert.notDeepEqual(a.verts,b.verts,'animation changes positions');
  assert.strictEqual(a.faces,b.faces);
  assert.strictEqual(a.uvs,b.uvs);
  assert.strictEqual(a.faceMaterials,b.faceMaterials);
  assert.deepEqual(Array.from(a.uvs.slice(0,8)),[0,0,1,0,1,1,0,1]);
  assert.ok(Number.isNaN(a.uvs[16]),'unmapped primitives retain their vertex offsets');
  assert.equal(a.faceMaterials[0],1);
  assert.equal(a.faceMaterials[12],2);
  assert.equal(a.faceMaterials[24],1,'instances preserve primitive assignments');
  model.faceStep=2;model.faces=null;
  const reduced=pose(model,-1,0);
  assert.equal(reduced.faces.length,24);
  assert.equal(reduced.faceMaterials.length,reduced.faces.length);
  assert.equal(reduced.faceMaterials[6],2,'assignments track face budget rebuilds');
  const skinned=parseGLTF(new TextEncoder().encode(gltfFixture.skinned().buffer.toString()).buffer,'skinned.gltf');
  const s0=pose(skinned,0,0),s1=pose(skinned,0,.5);
  assert.notDeepEqual(s0.verts,s1.verts,'skinned poses still move');
  assert.equal(s0.uvs,null);
  assert.equal(s0.faceMaterials,null);

  const usda=`#usda 1.0
def Mesh "M" {
  point3f[] points = [(0,0,0), (1,0,0), (0,1,0), (1,1,0)]
  int[] faceVertexCounts = [3,3]
  int[] faceVertexIndices = [0,1,2,1,3,2]
  texCoord2f[] primvars:st = [(0,0), (1,0), (0,1), (0.25,0), (1,1), (0,1)] (
    interpolation = "faceVarying"
  )
}`;
  const usd=await parseUSDModel(new TextEncoder().encode(usda).buffer,'seams.usda');
  const mesh=pose(usd,-1,0);
  assert.notEqual(mesh.faces[0][1],mesh.faces[1][0],'UV seams split shared corners');
  const uvAt=i=>Array.from(mesh.uvs.slice(i*2,i*2+2));
  assert.deepEqual(uvAt(mesh.faces[0][1]),[1,1]);
  assert.deepEqual(uvAt(mesh.faces[1][0]),[.25,1]);
  assert.equal(mesh.faceMaterials,null);
  console.log('model pose UV/material metadata passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
