process.env.AUDIOGRAPH_GPU_BUILD='versions/audiograph_87.html';
const {open}=require('../tests/gpu-common.cjs');
(async()=>{const t=await open();const page=t.page;
for(const sstr of [100]){
const r=await page.evaluate(async sstr=>{stackLayouts.splice(1);selectLayer(0);setLayout('simfluid');agSim.reset();renderDensity();await agSim.ready();
for(let i=0;i<320;i++){const sp=[];for(let j=0;j<64;j++)sp.push(Math.min(1.2,0.95*(1-0.55*j/63)*(0.9+0.1*Math.sin(i*0.2+j))));agSim.inject({spec:sp,onset:i%28==0?0.9:0});agSim.advance(1);}
agSim.reset();renderDensity();
for(let i=0;i<200;i++){const sp=[];for(let j=0;j<64;j++){const f=j/63;sp.push(0.4*Math.max(0,(0.8-0.6*f)*(0.5+0.5*Math.sin(i*0.21+j*0.5))*(0.6+0.4*Math.sin(i*0.05))));}agSim.inject({spec:sp,onset:0});agSim.advance(1);}
renderDensity();const d=frameCtx.getImageData(0,0,frameCv.width,frameCv.height).data;let lit=0;for(let i=0;i<d.length;i+=4)if(Math.max(d[i],d[i+1],d[i+2])>40)lit++;const lv=Object.values(agSim.stats().layers)[0];return {lv:JSON.stringify(lv).slice(0,400),lit,err:JSON.stringify(agSim.stats()).slice(0,300)}},sstr);
console.log(sstr,r);}
await t.browser.close();process.exit(0)})();
