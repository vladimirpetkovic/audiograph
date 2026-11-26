const assert=require('node:assert/strict');
(async()=>{
  const {paletteMesh}=await import('../pro/palette-map.js');
  const {validate}=await import('../pro/graph.js');
  const arr=new Float32Array(48);arr[16]=1;arr[33]=1;arr[8]=arr[24]=arr[40]=1;
  arr[15]=arr[31]=arr[47]=2.7;
  const pbrUV=new Float32Array(24);pbrUV[8]=1;pbrUV[17]=1;
  const mesh={arr,pbrUV},settings={mode:'uv',axis:'u',tiling:1,offset:0,rotation:0,primitive:null};
  const mapped=paletteMesh(mesh,settings);
  assert.ok(Math.abs(mapped[31]-2.998)<1e-6,'UV gradient reaches the end of the palette');
  assert.equal(mapped[15],2);assert.equal(mapped[47],2);
  assert.ok([15,31,47].every(i=>Math.floor(mapped[i]+.001)===2),'Mapping preserves native shape IDs');
  assert.equal(arr[15],Math.fround(2.7),'Mapping does not alter the cached source mesh');
  const vertical=paletteMesh(mesh,{...settings,axis:'v'});
  assert.ok(vertical[47]>2.99&&vertical[31]===2,'The gradient follows V when Vertical is selected');
  const front=paletteMesh(mesh,{...settings,mode:'front'});
  assert.ok(front[31]>2.99,'Front projection follows local geometry without UVs');
  assert.throws(()=>paletteMesh({arr},{...settings}),/no usable UV/);
  assert.equal(paletteMesh({arr},{...settings,primitive:'sphere'}).length,48,'Built-in primitives have procedural UVs');
  const scene=validate({format:'audiograph-pro',version:18,layers:[{id:'l',name:'Palette',visible:true,opacity:1,blend:'source-over',
    nodes:[{id:'c',type:'cloner',x:0,y:0,props:{paletteBy:'clone'}},{id:'o',type:'output',x:300,y:0,props:{}}],
    edges:[{from:'c',out:'shape',to:'o',input:'image'}]}]});
  assert.equal(scene.layers[0].nodes[0].props.paletteBy,'clone');
  console.log('ok - UV/projection palette mapping, primitive UVs, axis selection and shape ID preservation');
})().catch(e=>{console.error(e);process.exitCode=1;});
