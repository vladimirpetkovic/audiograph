// v64: saved compositions are built-in presets and Rorschach is removed
process.env.AUDIOGRAPH_PARTICLE_BUILD=process.env.AUDIOGRAPH_PRESET_BUILD||'versions/audiograph_64.html';
const assert=(c,m)=>{if(!c){console.error('FAIL: '+m);process.exit(1)}console.log('ok - '+m)};
const { open, wav, sine, kicks, load } = require('./audio-common.cjs');
(async()=>{const t=await open({viewport:{width:1280,height:800}});const {page,errors}=t;
 const tone=wav([[30,s=>kicks(0.6)(s)+sine(220,0.25)(s)]],'s.wav');await load(page,{name:tone.name,mimeType:tone.mimeType,buffer:tone.buffer});
 await page.evaluate(()=>{if(!playing)togglePlay()});
 for(const [name,lays] of [['tree',['growth','phyllotaxis','object']],['sacred_geometry',['sacred','sacred','sacred']],['universe',['object','sacred','graph','circle']]]){
  const btn=page.locator('#presetList button',{hasText:name});
  assert(await btn.count()===1,name+' built-in button listed');
  await btn.click();await page.waitForTimeout(1200);
  const st=await page.evaluate(()=>({lays:stackLayouts.map(l=>l.layout)}));
  assert(JSON.stringify(st.lays)===JSON.stringify(lays),name+' loads layers '+st.lays);
  const ink=await page.evaluate(()=>{const c=document.getElementById('frameCv'),x=document.createElement('canvas');x.width=160;x.height=100;const g=x.getContext('2d');g.drawImage(c,0,0,160,100);const d=g.getImageData(0,0,160,100).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]+d[i+1]+d[i+2]>60)n++;return n});
  assert(ink>200,name+' renders ('+ink+' lit px)');
  if(process.env.SHOT)await page.screenshot({path:'/tmp/ap/preset-'+name+'.png'});
 }
 assert(await page.locator('#presetList button',{hasText:'rorschach'}).count()===0,'Rorschach built-in removed');
 assert(errors.length===0,'no page errors '+JSON.stringify(errors));process.exit(0)})();
