let sourcePromise;
async function engineSource() {
  if(!sourcePromise)sourcePromise=fetch(new URL('../index.html',location.href)).then(async r=>{
    if(!r.ok)throw Error(`Cannot load Audiograph engine: HTTP ${r.status}`);
    let html=await r.text();
    if(!html.includes('function getDefaultLayerParams'))throw Error('The parent page is not an Audiograph engine');
    // Load the trusted local app, not any project-provided source. Keep fonts and media offline.
    html=html.replace(/@import\s+url\([^;]+\);/g,'');
    const base=new URL('../',location.href).href;
    const policy="default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' data: blob:";
    return html.replace('<head>',`<head><base href="${base}"><meta http-equiv="Content-Security-Policy" content="${policy}">`);
  });
  return sourcePromise;
}
const WIDTH=960,HEIGHT=540;
export class EmitterEngine {
  constructor(id,onError) {
    this.id=id;this.onError=onError;this.status='starting';this.disposed=false;this.mode='';this.mediaName='';this.mediaKind='';this.generation=0;
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
    if(typeof w.getDefaultLayerParams!=='function'||!w.agSim||!w.agDrawDensity)throw Error('Renderer API unavailable in the parent app');
    this.w=w;
    w.addEventListener('error',event=>this.fail(`Emitter engine: ${event.message}`));
    w.alert=message=>this.fail(String(message));
    w.audioBuffer=null;w.playing=false;w.particlesOn=false;w.stackMode=false;w.stackLayouts=[];w.agSim.noPrewarm=true;
    if(w.rafId)w.cancelVisualFrame(w.rafId);
    this.params=w.getDefaultLayerParams();this.params._particlesOn=false;this.params._simId=1;
    this.params._sim={...w.AG_SIM_DEF_OPT,q:'low',auto:'off'};
    this.params.pSimExpo=0;this.params.pSimReact=0;this.params.pSimSwirlSnd=0;
    this.params._lines=96;this.params._height=70;this.params._thick=3;this.params._colorMode='toneramp';
    this.status='ready';return true;
  }
  fail(message) {
    if(this.disposed)return;
    this.status='error';this.error=message;this.onError(message);
  }
  configure(props) {
    const w=this.w,p=this.params;
    const solid=['knot','cube','torus'].includes(props.mode);
    const mode=solid?'object':props.mode;
    if(mode!==this.mode) {
      if(this.video){if(mode==='video')this.video.play().catch(error=>this.fail('Video playback: '+error.message));else this.video.pause();}
      w.agSim.reset();this.mode=mode;this.generation++;
      w.layoutMode=mode;
      if(mode.startsWith('sim')&&!w._agIsSim(mode))throw Error(`${props.mode} is not available in this Audiograph build`);
    }
    if(mode==='object')w.objBuiltin=solid?props.mode:'file';
    p.pSimEnergy=props.energy;p.pSpSize=props.size;p._thick=props.size;
    w.layoutMode=mode;w.setLayoutParams(p);
    if(solid)w.objBuiltin=props.mode;
    if(mode==='text'&&this.lastText!==props.text) {
      w.document.getElementById('textLayoutInput').value=props.text;w.generateTextLayout();this.lastText=props.text;
    }
    // Math is the built-in expression in the trusted application only. No imported code.
  }
  draw(props,drive,time) {
    if(this.status==='error')throw Error(this.error);
    if(this.status!=='ready')return null;
    const w=this.w;
    this.configure(props);
    if(['image','pixelwarp'].includes(this.mode)&&this.mediaKind!=='image')throw Error(`${props.mode}: load an image in the selected Emitter properties`);
    if(this.mode==='video'&&this.mediaKind!=='video')throw Error('Video: load a video in the selected Emitter properties');
    if(this.mode==='object'&&props.mode==='object'&&this.mediaKind!=='object')throw Error('3D Object: load an OBJ file in the selected Emitter properties');
    if(this.mode==='video')w.sampleVideoFrame();
    const value=Math.max(0,Math.min(2,drive));
    const values=Array.from({length:96},(_,i)=>Math.max(0,Math.min(1,value*(.58+.42*Math.sin(i*.14+time)))));
    w.globalFrame++;w.agSim.inject({spec:value,onset:0});w.agSim.beginFrame();w.agGpu.beginFrame();
    const ctx=this.ctx;ctx.resetTransform();ctx.clearRect(0,0,WIDTH,HEIGHT);ctx.save();
    ctx.filter=`hue-rotate(${props.hue}deg)`;
    w.agDrawDensity(ctx,WIDTH,HEIGHT,values,w.P(),false);ctx.restore();
    if(this.mode.startsWith('sim')){
      const stats=w.agSim.stats();
      if(!['ready','idle','init'].includes(stats.status))throw Error(`Native WebGPU: ${stats.msg||stats.status}`);
      this.backend=`Native WebGPU${stats.status==='ready'?'':' (starting)'}`;
    }else this.backend=w.agGpu.status().t;
    return this.canvas;
  }
  async media(file,kind) {
    if(file.size>80*1024*1024)throw Error('Media limit is 80 MB per file');
    await this.ready;if(!this.w||this.disposed)throw Error('Emitter engine is not ready');
    const w=this.w;this.mediaKind='';this.mediaName='';
    if(kind==='image') {
      if(!['image/png','image/jpeg','image/webp','image/gif','image/avif'].includes(file.type))throw Error('Use a raster PNG, JPEG, WebP, GIF or AVIF image');
      const bitmap=await createImageBitmap(file);
      if(bitmap.width*bitmap.height>16000000){bitmap.close();throw Error('Image limit is 16 megapixels');}
      const cv=w.document.createElement('canvas');cv.width=bitmap.width;cv.height=bitmap.height;cv.getContext('2d').drawImage(bitmap,0,0);bitmap.close();
      w.imgLayoutImg=cv;w.imgSource='raster';w.sampleLayoutImage();
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
    }else{
      if(!file.name.toLowerCase().endsWith('.obj'))throw Error('Choose an OBJ file');
      w.objModelData=w.agParseObj(await file.text());w.objBuiltin='file';
    }
    this.mediaKind=kind;this.mediaName=file.name;
  }
  stats() {return this.w?{status:this.status,mode:this.mode,generation:this.generation,sim:this.w.agSim.stats(),renderer:this.w.agGpu.stats()}: {status:this.status};}
  dispose() {
    this.disposed=true;this.cancelLoad?.();
    if(this.video){this.video.pause();this.video.removeAttribute('src');}
    if(this.videoURL)URL.revokeObjectURL(this.videoURL);
    if(this.w){this.w.agSim.reset();if(this.w.agSim.status()==='ready')this.w.agSim.loseDevice();}
    this.iframe?.remove();this.w=null;this.canvas.width=this.canvas.height=1;
  }
}
