const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright'),{wav,kicks,silence}=require('./audio-common.cjs');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+url.pathname+(url.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'application/octet-stream');
  res.end(fs.readFileSync(file));
});
(async()=>{
  let browser;
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args:['--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
    const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto((process.env.AUDIOGRAPH_PRO_URL||`http://127.0.0.1:${server.address().port}/pro/`)+'?v=sound-tuning');
    await page.waitForFunction(()=>window.pro);
    const ids=await page.evaluate(()=>{
      pro.dissolve(false);
      const p=pro.getProject(),layer=p.layers[0],legacy=structuredClone(layer);
      legacy.id='old';legacy.name='Previous settings';
      for(const n of legacy.nodes)n.id='old-'+n.id;
      for(const e of legacy.edges){e.from='old-'+e.from;e.to='old-'+e.to;}
      const fresh=layer.nodes.find(n=>n.type==='waveform2d'),old=legacy.nodes.find(n=>n.type==='waveform2d');
      Object.assign(old.props,{intensity:100,punch:60,release:220,dynamics:50});
      p.layers.push(legacy);pro.importProject(p);pro.select(fresh.id);
      return {ids:[fresh.id,old.id],audio:layer.nodes.find(n=>n.type==='audioIn').id};
    });
    const {ids:waves,audio}=ids;
    await page.waitForFunction(ids=>ids.every(id=>pro.engine(id)?.status==='ready'),waves);
    assert.equal(await page.locator('#properties [data-property="intensity"]').count(),1,'Starter exposes Intensity without a wire');
    await page.evaluate(ids=>{
      window.samples={};
      for(const id of ids){
        const w=pro.engine(id).w,rows=samples[id]=[],shape=w.agAudio.shape;
        w.agAudio.shape=(vals,an)=>{
          const out=shape(vals,an),t=w.audio?.currentTime;
          if(t!=null&&t!==rows.at(-1)?.t){
            const gain=w.getIntensity(),line=out.map(v=>Math.min(v*gain,1));
            rows.push({t,env:w.agAudio.features().env,mean:line.reduce((a,b)=>a+b,0)/line.length,
              top:Math.max(...line)});
          }
          return out;
        };
      }
    },waves);
    await page.evaluate(audio=>pro.select(audio),audio);
    await page.locator('#audioFile').setInputFiles(wav([[1,silence],[4,kicks(.85,.1)],[1,silence]],'kick-contrast.wav'));
    await page.waitForFunction(ids=>ids.every(id=>samples[id].at(-1)?.t>5.5),waves,{timeout:15000});
    const metrics=await page.evaluate(ids=>ids.map(id=>{
      const w=pro.engine(id).w,rows=samples[id],peak=rows.filter(r=>r.t>1.5&&r.t<4.9&&r.t%0.5<.15),between=rows.filter(r=>r.t>1.5&&r.t<4.9&&r.t%0.5>.27&&r.t%0.5<.38);
      const mean=(set,k)=>set.reduce((s,r)=>s+r[k],0)/set.length;
      return {settings:[w.getIntensity(),w.agAudio.get().punch,w.agAudio.get().release,w.getDynamics()],
        peak:mean(peak,'mean'),between:mean(between,'mean'),tail:mean(between,'env'),max:Math.max(...peak.map(r=>r.top)),
        silent:Math.max(...rows.filter(r=>r.t>.45&&r.t<.9).map(r=>r.env))};
    }),waves);
    const [fresh,old]=metrics;
    assert.deepEqual(fresh.settings,[.85,65,150,50]);
    assert.deepEqual(old.settings,[1,60,220,50],'Explicit saved knobs retain their values');
    assert.ok(fresh.max<=.85&&fresh.max<old.max,'Less crowding at the top of the response range');
    assert.ok(fresh.tail<old.tail*.9&&fresh.between<old.between*.9,'Shorter decay lets the visual settle between kicks');
    assert.ok(fresh.peak>fresh.between*1.12&&fresh.peak/fresh.between>=old.peak/old.between,'Kicks retain clear contrast over the bed');
    assert.equal(fresh.silent,0,'Silence does not trigger bass punch');
    await page.evaluate(ids=>{for(const id of ids)samples[id].length=0;},waves);
    await page.locator('#audioFile').setInputFiles(path.join(root,'audio/default-track.m4a'));
    await page.waitForFunction(ids=>ids.every(id=>samples[id].some(r=>r.t>3&&r.t<4)),waves,{timeout:15000});
    const music=await page.evaluate(ids=>ids.map(id=>{
      const rows=samples[id].filter(r=>r.t>.5&&r.t<3).map(r=>r.mean).sort((a,b)=>a-b);
      return [rows[Math.floor(rows.length*.1)],rows[Math.floor(rows.length*.9)]];
    }),waves);
    assert.ok(music[0][1]<music[1][1]&&music[0][1]>music[0][0]*1.1&&music[0][1]>music[1][1]*.65,
      'The demo track keeps motion and contrast without the old peaks: '+JSON.stringify(music));
    await page.evaluate(([freshId])=>{
      const p=pro.getProject(),g=p.layers[0];p.layers=[g];
      const n=g.nodes.find(n=>n.type==='waveform2d');
      n.id='gpu';n.type='gpuParticles';n.props={mode:'simfluid'};
      for(const e of g.edges){if(e.from===freshId)e.from='gpu';if(e.to===freshId)e.to='gpu';}
      pro.importProject(p);
    },waves);
    await page.waitForFunction(()=>Object.keys(pro.engine('gpu')?.w?.agSim.stats().layers||{}).length>0);
    const gpu=await page.evaluate(()=>{
      const w=pro.engine('gpu').w,sim=w.agSim;
      const stats=()=>sim.stats().layers[sim.stats().simUid];
      const measure=()=>{
        sim.inject({spec:0});sim.advance(55,1/30);
        sim.inject({spec:.8,onset:.9});sim.advance(1,1/60);
        const hit=stats();
        sim.inject({spec:0});sim.advance(12,1/60);
        return {hit:hit.kick,attack:hit.level,tail:stats().level};
      };
      const fresh=measure();
      w.document.getElementById('pSimAttack').value=12;
      w.document.getElementById('pSimRelease').value=180;
      const old=measure();
      sim.inject(null);
      return {fresh,old,errors:sim.stats().errors};
    });
    assert.deepEqual(gpu.errors,[]);
    assert.ok(gpu.fresh.hit>.85&&gpu.fresh.hit===gpu.old.hit,'Fluid keeps the full beat burst');
    assert.ok(gpu.fresh.attack>.35&&gpu.fresh.tail<gpu.old.tail*.9,'Fluid responds promptly and settles faster');
    assert.deepEqual(await page.evaluate(()=>pro.stats().errors),[]);
    assert.deepEqual(errors,[]);
    console.log('Pro audio response:',JSON.stringify({fresh,old,music,gpu}));
  }catch(error){console.error(error);process.exitCode=1;}
  finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})();
