// Isolated Audiograph engines. Each Emitter owns one same-origin iframe running the real app; Pro drives
// the app's own live render loop (liveAnimLoop) one frame at a time with a synthetic analyser, so every
// original feature that lives in the composite (symmetry, flip, mirror, spin, particles, per-layer Post FX)
// renders exactly as in Audiograph.
let sourcePromise;
async function engineSource() {
  if(!sourcePromise)sourcePromise=fetch(new URL('../index.html',location.href)).then(async r=>{
    if(!r.ok)throw Error(`Cannot load Audiograph engine: HTTP ${r.status}`);
    let html=await r.text();
    if(!html.includes('function getDefaultLayerParams'))throw Error('The parent page is not an Audiograph engine');
    // Load the trusted local app, not any project-provided source. Keep fonts and media offline.
    html=html.replace(/@import\s+url\((['"]?)[^'")]*\1\)\s*;?/g,'');
    const base=new URL('../',location.href).href;
    const policy="default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self' data: blob:; img-src 'self' data: blob:; media-src 'self' data: blob:";
    return html.replace('<head>',`<head><base href="${base}"><meta http-equiv="Content-Security-Policy" content="${policy}">`);
  });
  return sourcePromise;
}
export const WIDTH=960,HEIGHT=540,BINS=2048;
const SOLIDS=['knot','cube','torus'];
// The page owns the one camera stream; engines receive clones, so the frames never ask for permission themselves.
let cameraProvider=null;
export function setCameraProvider(fn){cameraProvider=fn;}
const OPT_ID=/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/;
// Chips Pro expresses as node types instead (media source, built-in model, OBJ → point cloud).
const HIDDEN=/setVidSource|setPixelWarpSource|objToPointCloud|setObjModel|setObjLayout/;
const jobKey=job=>[job.mode,job.source||'',job.mesh?'mesh':'',JSON.stringify(job.chips||{}),job.look&&Object.keys(job.look).length?JSON.stringify(job.look):''].join('|');

function lowpass(src,dst,rate,hz){
  const w=2*Math.PI*hz/rate,al=Math.sin(w)/(2*Math.SQRT1_2),c=Math.cos(w),a0=1+al,b0=(1-c)/2/a0,b1=(1-c)/a0,b2=b0,a1=-2*c/a0,a2=(1-al)/a0;
  const n=Math.min(src.length,dst.length);
  for(let pass=0;pass<2;pass++){let x1=0,x2=0,y1=0,y2=0;const from=pass?dst:src;
    for(let i=0;i<n;i++){const x=from[i],y=b0*x+b1*x1+b2*x2-a1*y1-a2*y2;x2=x1;x1=x;y2=y1;y1=y;dst[i]=y;}}
  for(let i=n;i<dst.length;i++)dst[i]=0;
}
// A fake AnalyserNode living in the engine realm. Pro writes freq/wave each frame.
function fakeAnalyser(audio) {
  const dummy=()=>({type:'',frequency:{value:0},Q:{value:0},gain:{value:0},connect(){},disconnect(){}});
  // The original detects bass hits on the sound low-passed at 140 Hz (two 12 dB biquads); do the same here.
  const bass={fftSize:2048,frequencyBinCount:1024,getFloatTimeDomainData(buf){lowpass(audio.wave,buf,context.sampleRate,140);},getByteFrequencyData(buf){buf.fill(0);},connect(){},disconnect(){}};
  const context={sampleRate:48000,createBiquadFilter:dummy,createGain:dummy,createAnalyser:()=>bass,destination:{}};
  return {fftSize:BINS*2,frequencyBinCount:BINS,smoothingTimeConstant:.75,minDecibels:-100,maxDecibels:-30,context,
    getByteFrequencyData(buf){buf.set(audio.freq.subarray(0,buf.length));},
    getFloatFrequencyData(buf){for(let i=0;i<buf.length;i++)buf[i]=-100+audio.freq[i]/255*70;},
    getByteTimeDomainData(buf){for(let i=0;i<buf.length;i++)buf[i]=128+audio.wave[i%audio.wave.length]*127;},
    getFloatTimeDomainData(buf){for(let i=0;i<buf.length;i++)buf[i]=audio.wave[i%audio.wave.length];},
    connect(){},disconnect(){}};
}

export class EmitterEngine {
  constructor(id,onError) {
    this.id=id;this.onError=onError;this.status='starting';this.disposed=false;this.mode='';this.mediaName='';this.mediaKind='';this.generation=0;
    this.baseKey='';this.base=null;this.lastText=null;this.frames=0;
    this.audio={freq:new Uint8Array(BINS),wave:new Float32Array(2048)};
    this.canvas=document.createElement('canvas');this.canvas.width=WIDTH;this.canvas.height=HEIGHT;this.ctx=this.canvas.getContext('2d');
    this.ready=this.init().catch(error=>{if(!this.disposed){this.status='error';this.error=error.message;this.onError(error.message);}return false;});
  }
  async init() {
    const html=await engineSource();if(this.disposed)return false;
    const iframe=document.createElement('iframe');this.iframe=iframe;
    iframe.title='Isolated Audiograph Emitter engine';
    iframe.setAttribute('allow','camera \'none\'; microphone \'none\'; display-capture \'none\'');
    const loaded=new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error('Audiograph engine did not start within 20 seconds')),20000);
      iframe.onload=()=>{clearTimeout(timeout);resolve();};iframe.onerror=()=>{clearTimeout(timeout);reject(Error('Audiograph engine frame failed to load'));};
      this.cancelLoad=()=>{clearTimeout(timeout);resolve();};
    });
    iframe.srcdoc=html;document.getElementById('engines').append(iframe);await loaded;
    if(this.disposed)return false;
    const w=iframe.contentWindow;
    if(typeof w.getDefaultLayerParams!=='function'||!w.agSim||!w.agDrawDensity||typeof w.liveAnimLoop!=='function')throw Error('Renderer API unavailable in the parent app');
    this.w=w;
    w.addEventListener('error',event=>this.fail(`Emitter engine: ${event.message}`));
    w.alert=message=>{message=String(message);if(/camera/i.test(message)){this.camError=message;this.onError(message);}else this.fail(message);};
    if(w.navigator.mediaDevices)w.navigator.mediaDevices.getUserMedia=async c=>{
      if(!c?.video||c.audio||!cameraProvider)throw Error('Only the shared camera is available to Pro engines');
      return (await cameraProvider()).clone();
    };
    if(w.rafId)w.cancelVisualFrame(w.rafId);
    w.requestVisualFrame=()=>0;w.cancelVisualFrame=()=>{};
    w.audioBuffer=null;w.playing=false;w.particlesOn=false;w.agSim.noPrewarm=true;w.dprCap=1;w.canvasBg='rgba(0,0,0,0)';
    const fc=w.frameCv;fc.style.cssText=`position:fixed;left:0;top:0;width:${WIDTH}px;height:${HEIGHT}px;display:block`;
    w.analyser=fakeAnalyser(this.audio);w.liveMode=true;w.livePaused=false;
    try{w.localStorage.removeItem('audiograph_bass');}catch{}
    this.defaults=w.getDefaultLayerParams();
    // Simulations keep the original's sound reaction (audio contrast, swirl by sound, exposure) and quality.
    Object.assign(this.defaults,{_particlesOn:false,_simId:1});
    this.defaults._sim={...w.AG_SIM_DEF_OPT};
    w.stackMode=true;w.activeLayerIdx=0;w.stackLayouts=[{layout:'linear',opacity:100,params:this.defaults}];
    this.status='ready';return true;
  }
  fail(message) {if(this.disposed)return;this.status='error';this.error=message;this.onError(message);}
  container(mode=this.mode){return this.w?.document.getElementById('layoutOpts_'+mode);}
  // Switch the trusted app to a layout, replay chip choices, snapshot the resulting parameters.
  prepare(job) {
    const w=this.w,solid=SOLIDS.includes(job.mode),mode=solid?'object':job.mode;
    const key=jobKey(job);
    if(key===this.baseKey)return mode;
    if(mode!==this.mode){
      if(this.video){if(mode==='video')this.video.play().catch(error=>this.fail('Video playback: '+error.message));else this.video.pause();}
      w.agSim.reset();this.mode=mode;this.generation++;this.lastText=null;
      if(mode.startsWith('sim')&&!w._agIsSim(mode))throw Error(`${job.mode} is not available in this Audiograph build`);
    }
    w.stackLayouts[0].layout=mode;w.layoutMode=mode;w.setLayoutParams(this.withLook(job.look));
    if(mode==='object'){w.objBuiltin=solid?job.mode:(this.mediaKind==='object'?'file':'knot');}
    try{if(mode==='object')w.setObjLayout(w.objBuiltin,null);else w.setLayout(mode,null);}catch(e){console.warn(e);}
    if(job.source){const b=[...(this.container()?.querySelectorAll('.mode-btns button')||[])].find(b=>(b.getAttribute('onclick')||'').includes(job.source));if(b&&!b.classList.contains('on'))try{b.click();}catch(e){console.warn(e);}}
    if(job.mesh){w.simOpt.spSrc='mesh';w.simOpt.spMesh=this.mediaKind==='object'?'obj':'knot';try{w.syncSimUI();}catch{}w.agSim.reset();}
    else if(job.splat&&w.simOpt.spSrc==='mesh'){w.simOpt.spSrc='galaxy';try{w.syncSimUI();}catch{}}
    const groups=this.chipGroups();
    for(const [k,label] of Object.entries(job.chips||{})){
      const g=groups[k];if(!g)continue;
      const b=g.buttons.find(b=>b.textContent.trim()===label);
      if(b&&!b.classList.contains('on'))try{b.click();}catch(e){console.warn(e);}
    }
    this.base={...this.withLook(job.look),...w.getLayoutParams()};this.baseKey=key;return mode;
  }
  // Template looks: original layer parameters on top of the engine defaults (simulations never auto-switch).
  withLook(look) {
    if(!look||!Object.keys(look).length)return this.defaults;
    const p={...this.defaults,...look};
    if(look._sim)p._sim={...this.defaults._sim,...look._sim,auto:'off'};
    if(look._postFx)p._postFx=this.w.pfxNorm(look._postFx);
    return p;
  }
  chipGroups() {
    const box=this.container();if(!box)return [];
    return [...box.querySelectorAll('.mode-btns')].map(g=>({el:g,buttons:[...g.querySelectorAll('button')]}));
  }
  // Introspect the original panel for the current layout: knobs, chips, text fields.
  controls(job) {
    if(this.status!=='ready')return null;
    this.prepare(job);
    const box=this.container();if(!box)return [];
    const shown=e=>{for(let x=e;x&&x!==box;x=x.parentElement){if(x.style.display==='none'||x.hidden||x.classList.contains('ag-na'))return false;}return true;};
    const label=e=>{const row=e.closest('.prow,.sim-row,.ag-row')||e.parentElement;const l=row?.querySelector('.prow-label,.sublabel,label,span');return (l&&!l.contains(e)?l.textContent:'').trim().replace(/\s+/g,' ').slice(0,40);};
    const out=[],groups=this.chipGroups();
    for(const e of box.querySelectorAll('input[type=range],.mode-btns')){
      if(!shown(e))continue;
      if(e.classList.contains('mode-btns')){
        const hide=job.mesh?/setSimOpt\('sp(Src|Mesh)'/:job.splat?/setSimOpt\('(spSrc','mesh|spMesh)'/:null;
        const idx=groups.findIndex(g=>g.el===e),buttons=groups[idx].buttons.filter(b=>{const on=b.getAttribute('onclick')||'';return b.style.display!=='none'&&!/getElementById\([^)]*\)\.click\(\)/.test(on)&&!HIDDEN.test(on)&&!hide?.test(on);});
        if(!buttons.length)continue;
        const action=buttons.every(b=>/simRestart|simReset|simReinit|Preset|Shuffle|objToPointCloud|click\(\)/i.test(b.getAttribute('onclick')||''));
        out.push({type:'chips',key:String(idx),label:label(e),action,options:buttons.map(b=>({label:b.textContent.trim(),on:b.classList.contains('on')}))});
      }else if(OPT_ID.test(e.id))out.push({type:'range',id:e.id,label:label(e)||e.id,min:+e.min,max:+e.max,step:+e.step||1,value:+e.value,def:+(this.defaults[e.id]??e.defaultValue)});
    }
    return out;
  }
  // Range of one emitter option knob (for driven option ports), cached per layout + chip state.
  optRange(job,id) {
    if(this.status!=='ready')return null;
    const key=jobKey(job);
    if(this.rangeKey!==key){this.ranges=new Map((this.controls(job)||[]).filter(c=>c.type==='range').map(c=>[c.id,c]));this.rangeKey=key;}
    return this.ranges.get(id)||null;
  }
  // Perform a chip click (presets / restart / choice) and report the resulting range values.
  click(job,key,label) {
    this.prepare(job);
    const g=this.chipGroups()[key];if(!g)throw Error('That option is no longer available');
    const b=g.buttons.find(b=>b.textContent.trim()===label);if(!b)throw Error('Unknown option '+label);
    b.click();this.base=this.w.getLayoutParams();
    const ranges={};
    for(const e of this.container().querySelectorAll('input[type=range]'))if(OPT_ID.test(e.id)&&+e.value!==+(this.defaults[e.id]??e.defaultValue))ranges[e.id]=+e.value;
    return {ranges,on:b.classList.contains('on')};
  }
  // Render one frame of the emitter with parameter overrides. Returns the engine canvas.
  draw(job) {
    if(this.status==='error')throw Error(this.error);
    if(this.status!=='ready')return null;
    const w=this.w,mode=this.prepare(job);
    if(job.need&&this.mediaKind!==job.need)throw Error(`${job.label||job.mode}: load ${job.need==='image'?'an image':'a video'} in its properties`);
    const p={...this.base};
    for(const [k,v] of Object.entries(job.opts||{}))if(OPT_ID.test(k))p[k]=v;
    const cam=job.mods?._cam;
    Object.assign(p,job.mods||{});delete p._cam;
    this.camera(cam);
    if(job.mods?._postFx)p._postFx=w.pfxNorm({...job.mods._postFx,enabled:true});
    w.stackLayouts[0].params=p;w.stackLayouts[0].layout=mode;w.layoutMode=mode;w.activeLayerIdx=0;
    w.setLayoutParams(p);
    if(mode==='object')w.objBuiltin=SOLIDS.includes(job.mode)?job.mode:'file';
    if(mode==='text'&&this.lastText!==job.text){w.document.getElementById('textLayoutInput').value=job.text||' ';w.generateTextLayout();this.lastText=job.text;}
    if(mode==='video'||(mode==='pixelwarp'&&(this.mediaKind==='video'||w.vidCamStream)))w.sampleVideoFrame?.();
    const r=job.response;
    if(r){const d=w.document,set=(id,v)=>{const e=d.getElementById(id);if(e&&+e.value!==v)e.value=v;};set('pIntensity',r.intensity);set('pBassPunch',r.punch);set('pBassRelease',r.release);set('pDynamics',r.dynamics);}
    this.audio.freq.set(job.audio.freq);this.audio.wave.set(job.audio.wave);
    w.analyser.context.sampleRate=job.audio.rate||48000;
    w.__agFractureDrive=job.audio.drive;
    const fc=w.frameCv,fctx=w.frameCtx;fctx.setTransform(1,0,0,1,0,0);fctx.clearRect(0,0,fc.width,fc.height);
    w.liveAnimLoop();this.frames++;
    const ctx=this.ctx;ctx.resetTransform();ctx.globalCompositeOperation='source-over';ctx.clearRect(0,0,WIDTH,HEIGHT);
    ctx.filter=job.hue?`hue-rotate(${job.hue}deg)`:'none';
    const pf=w.document.getElementById('postFxCv');
    ctx.drawImage(pf&&pf.style.display!=='none'&&w.postFxEnabled?pf:fc,0,0,WIDTH,HEIGHT);ctx.filter='none';
    if(mode.startsWith('sim')){
      const stats=w.agSim.stats();
      if(!['ready','idle','init'].includes(stats.status))throw Error(`Native WebGPU: ${stats.msg||stats.status}`);
      this.backend=`Native WebGPU${stats.status==='ready'?'':' (starting)'}`;
    }else this.backend=w.agGpu.status().t;
    return this.canvas;
  }
  // Webcam node: start/stop the app's own camera colour and displacement feature and set its controls.
  camera(cam) {
    const w=this.w,d=w.document;
    if(!cam){this.camError='';if(w.camActive||w.camStarting)w.stopCam();return;}
    if(!w.camActive&&!w.camStarting&&!this.camError)w.toggleCam();
    d.getElementById('camDisplace').value=cam.displace;d.getElementById('camSmooth').value=cam.smooth;
    w.camDispDir=cam.dir;w.camUseColors=!!(cam.colors&&w.camActive);
    if(w.camActive)w.sampleCamLoop();
  }
  usesCamera(){return !!(this.w&&(this.w.camActive||this.w.camStarting||this.w.vidCamStream));}
  // Run the original per-layer Post FX shader on any canvas. `slot` keeps trail history per node.
  fx(slot,src,settings,drive) {
    if(this.status!=='ready')return null;
    const w=this.w;w.__agFractureDrive=drive;
    const out=w.applyLayerFx(slot,src,w.pfxNorm({...settings,enabled:true}));
    return out;
  }
  async media(file,kind) {
    if(file.size>80*1024*1024)throw Error('Media limit is 80 MB per file');
    await this.ready;if(!this.w||this.disposed)throw Error('Emitter engine is not ready');
    const w=this.w;this.mediaKind='';this.mediaName='';this.baseKey='';
    if(kind==='image') {
      if(!['image/png','image/jpeg','image/webp','image/gif','image/avif'].includes(file.type))throw Error('Use a raster PNG, JPEG, WebP, GIF or AVIF image');
      const bitmap=await createImageBitmap(file);
      if(bitmap.width*bitmap.height>16000000){bitmap.close();throw Error('Image limit is 16 megapixels');}
      const cv=w.document.createElement('canvas');cv.width=bitmap.width;cv.height=bitmap.height;cv.getContext('2d').drawImage(bitmap,0,0);bitmap.close();
      w.imgLayoutImg=cv;w.imgSource='raster';w.sampleLayoutImage();
      if(w.agPixelWarp?.setImage)try{w.agPixelWarp.setImage(cv);}catch(e){console.warn(e);}
    }else if(kind==='video') {
      if(!file.type.startsWith('video/'))throw Error('Choose a video file');
      const url=URL.createObjectURL(file),video=w.document.createElement('video');
      try{
        video.muted=true;video.loop=true;video.playsInline=true;video.src=url;
        await new Promise((resolve,reject)=>{
          const timeout=setTimeout(()=>reject(Error('Video did not decode within 20 seconds')),20000);
          video.onloadeddata=()=>{clearTimeout(timeout);resolve();};
          video.onerror=()=>{clearTimeout(timeout);reject(Error('This video format could not be decoded: '+(video.error?.message||'media error')));};
        });
        await video.play();
      }catch(error){URL.revokeObjectURL(url);throw error;}
      if(this.video){this.video.pause();this.video.removeAttribute('src');}
      if(this.videoURL)URL.revokeObjectURL(this.videoURL);
      this.videoURL=url;this.video=video;w.vidEl=video;w.sampleVideoFrame();
    }else if(kind==='splat') {
      if(!/\.(ply|splat)$/i.test(file.name))throw Error('Choose a .ply or .splat file');
      const r=w.agSplatParse(await file.arrayBuffer(),file.name);
      Object.assign(w.AG_SPLAT,{file:r.data,n:r.n,name:file.name,err:''});w.AG_SPLAT.ver++;
      this.mediaKind=kind;this.mediaName=file.name;return {flip:!!r.flip};
    }else{
      if(!file.name.toLowerCase().endsWith('.obj'))throw Error('Choose an OBJ file');
      w.objModelData=w.agParseObj(await file.text());w.objBuiltin='file';w.AG_SPLAT.meshVer=(w.AG_SPLAT.meshVer||0)+1;
    }
    this.mediaKind=kind;this.mediaName=file.name;
  }
  stats() {return this.w?{status:this.status,mode:this.mode,generation:this.generation,frames:this.frames,sim:this.w.agSim.stats(),renderer:this.w.agGpu.stats()}: {status:this.status};}
  dispose() {
    this.disposed=true;this.cancelLoad?.();
    if(this.video){this.video.pause();this.video.removeAttribute('src');}
    if(this.videoURL)URL.revokeObjectURL(this.videoURL);
    if(this.w){try{this.w.stopCam?.();this.w.stopWebcamFeed?.();}catch{}try{this.w.agSim.reset();if(this.w.agSim.status()==='ready')this.w.agSim.loseDevice();}catch{}}
    this.iframe?.remove();this.w=null;this.canvas.width=this.canvas.height=1;
  }
}
