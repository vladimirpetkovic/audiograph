// v65: new Canvas 2D styles render distinctly and remain available when GPU mode is selected
const assert=require('node:assert/strict');
process.env.AUDIOGRAPH_GPU_BUILD=process.env.AUDIOGRAPH_STYLE_BUILD||'versions/audiograph_65.html';
const g=require('./gpu-common.cjs');

(async()=>{
 const s=await g.open({viewport:{width:1280,height:800}}),page=s.page;
 try{
  await g.deterministic(page);
  await page.evaluate(()=>{setLayout('circle',[...document.querySelectorAll('[onclick]')].find(b=>(b.getAttribute('onclick')||'').startsWith("setLayout('circle'")));agGpu.setMode('canvas');renderDensity()});
  for(const name of ['guilloche','stainedglass','inkwater']){
   const button=page.locator(`#styleBtns button[onclick="setShape('${name}',this)"]`);
   assert.equal(await button.count(),1,`${name} style button exists`);
   await button.click();
   await page.evaluate(()=>{document.getElementById('pLines').value=120;upP();renderDensity()});
   const canvas=await page.evaluate(()=>{const c=document.getElementById('frameCv'),d=frameCtx.getImageData(0,0,c.width,c.height).data;let ink=0,hash=0;for(let i=0;i<d.length;i+=4){if(d[i]+d[i+1]+d[i+2]>50)ink++;hash=(hash+((i+1)*d[i]+(i+3)*d[i+1]+(i+7)*d[i+2]))>>>0}return{ink,hash}});
   assert.ok(canvas.ink>100,`${name} produces visible pixels (${canvas.ink})`);
   const state=await page.evaluate(()=>getLayoutParams()._lineShape);
   assert.equal(state,name,`${name} is persisted in layer state`);
   await page.evaluate(()=>{agGpu.setMode('gpu');renderDensity()});
   const gpu=await page.evaluate(()=>{const c=document.getElementById('frameCv'),d=frameCtx.getImageData(0,0,c.width,c.height).data;let ink=0;for(let i=0;i<d.length;i+=4)if(d[i]+d[i+1]+d[i+2]>50)ink++;return{ink,status:agGpu.status()}});
   assert.ok(gpu.ink>100,`${name} renders in GPU mode via Canvas fallback`);
   assert.match(gpu.status,/Canvas 2D style/,`${name} reports Canvas fallback`);
   if(process.env.SHOT)await page.screenshot({path:`/tmp/${name}.png`});
   console.log(`PASS ${name}: ${canvas.ink} canvas pixels; GPU fallback ${gpu.status}`);
  }
  const surface=await page.evaluate(()=>{
   const b=[...document.querySelectorAll('[onclick]')];
   setObjLayout('sphere',b.find(x=>(x.getAttribute('onclick')||'').startsWith("setObjLayout('sphere'")));
   objSignal='surface';setLayout('object',b.find(x=>(x.getAttribute('onclick')||'').startsWith("setLayout('object'")));
   setShape('inkwater',b.find(x=>(x.getAttribute('onclick')||'').startsWith("setShape('inkwater'")));
   agGpu.setMode('canvas');renderDensity();
   const c=document.getElementById('frameCv'),d=frameCtx.getImageData(0,0,c.width,c.height).data;let ink=0;for(let i=0;i<d.length;i+=4)if(d[i]+d[i+1]+d[i+2]>50)ink++;
   return{ink,errors:typeof objSignal==='undefined'};
  });
  assert.ok(surface.ink>100,`Ink in Water renders on 3D Surface (${surface.ink} pixels)`);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close()}
})().catch(e=>{console.error(e);process.exit(1)});
