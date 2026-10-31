import {TYPES,CATEGORIES,MODES,emitterNames,isEngine,engineSpec,nodeTitle,MEDIA_KIND,VERSION,PALETTES,PORT_COLORS,EQ_KEYS,EQ_HZ,LIMITS,LAYER_BLENDS,SOLID_PRESETS,paletteStops,inputsOf,portType,OPT_PORT,compatible,clone,node,layer,project,validate,order,connect,filterFor,modulate,applyShapeNode,fxSettings} from './graph.js';
import {EmitterEngine,WIDTH,HEIGHT,BINS,setCameraProvider} from './engine.js';
import * as ui from './ui.js';

const $=id=>document.getElementById(id),el=ui.el;
const catOf=type=>CATEGORIES.find(c=>c.id===TYPES[type].category);
let state=project(),active=state.layers[0].id,selected=null,pending=null,paused=false,pageHidden=false;
const lastValues=new Map(),history=[],future=[],engines=new Map(),surfaces=new Map(),view={x:20,y:20,zoom:.9},nodeState=new Map(),fxSlots=new Map(),thumbs=new Map();
let plans=new Map(),frame=0,lastTime=0,elapsed=0,renderErrors=[],nodeErrors=new Set(),statusSource='action',liveBefore=null;
const preview=$('preview'),previewCtx=preview.getContext('2d');
const graph=()=>state.layers.find(g=>g.id===active)||state.layers[0];
const findNode=id=>{for(const g of state.layers){const n=g.nodes.find(n=>n.id===id);if(n)return n;}};
function message(text,error=false,source='action'){statusSource=source;$('status').textContent=text;$('status').classList.toggle('error',error);}
function attempt(fn){try{return fn();}catch(error){message(error.message,true);return false;}}

// ---------- project state ----------
function reconcile(){
  const emitterIDs=new Set(state.layers.flatMap(g=>g.nodes.filter(n=>isEngine(n.type)).map(n=>n.id)));
  const anyFx=state.layers.some(g=>g.nodes.some(n=>TYPES[n.type].fx));
  for(const [id,engine] of engines)if(id==='__fx'?(!anyFx||emitterIDs.size>0):!emitterIDs.has(id)){engine.dispose();engines.delete(id);}
  const nodeIDs=new Set(state.layers.flatMap(g=>g.nodes.map(n=>n.id)));
  for(const map of [surfaces,thumbs])for(const [id,cv] of map)if(!nodeIDs.has(id.split(':')[0])){cv.width=cv.height=1;map.delete(id);}
  for(const id of nodeState.keys())if(!nodeIDs.has(id))nodeState.delete(id);
  plans=new Map(state.layers.map(g=>{
    const needed=new Set(g.nodes.filter(n=>n.type==='output').map(n=>n.id)),queue=[...needed];
    for(let i=0;i<queue.length;i++)for(const edge of g.edges)if(edge.to===queue[i]&&!needed.has(edge.from)){needed.add(edge.from);queue.push(edge.from);}
    return [g.id,order(g).filter(n=>needed.has(n.id))];
  }));
  if(!state.layers.some(g=>g.id===active))active=state.layers[0].id;
  if(!graph().nodes.some(n=>n.id===selected))selected=null;
}
function commit(next,label='Updated graph',before=state){
  const clean=validate(next);
  if(JSON.stringify(clean)===JSON.stringify(before))return;
  history.push(clone(before));if(history.length>100)history.shift();future.length=0;state=clean;
  pending=null;reconcile();renderUI();message(label);if(paused)draw(elapsed);
}
function edit(fn,label){return attempt(()=>{const next=clone(state);fn(next,next.layers.find(g=>g.id===active));commit(next,label);return true;});}
// Knob drags update the live state every frame and become one undo step on release.
function live(fn){if(!liveBefore)liveBefore=clone(state);fn(state);updateSummaries();if(paused)draw(elapsed);}
function liveCommit(label){
  const before=liveBefore||clone(state);liveBefore=null;
  try{commit(clone(state),label,before);}catch(error){state=before;reconcile();renderUI();message(error.message,true);}
}
function restoreSnapshot(snapshot){state=validate(snapshot);pending=null;reconcile();renderUI();if(paused)draw(elapsed);}
function undo(){if(history.length){future.push(clone(state));restoreSnapshot(history.pop());message('Undone');}}
function redo(){if(future.length){history.push(clone(state));restoreSnapshot(future.pop());message('Redone');}}
function importProject(raw,label='Imported project. Reload media files in the Input nodes.'){
  const clean=validate(raw);commit(clean,label);active=state.layers[0].id;selected=null;renderUI();fit();return clone(state);
}
// Chain nodes pass a shape/image (or an audio signal, e.g. Audio EQ) through: they splice into wires and heal when removed.
const isChain=type=>{const t=TYPES[type],i=Object.values(t.inputs),o=Object.values(t.outputs);if(!o.length)return false;
  if(i.includes('audio')&&o.every(x=>x==='audio'))return true;return (i.includes('shape')||i.includes('image'))&&o.every(x=>x==='shape'||x==='image');};
// Adding a modifier while a node is selected splices it into that node's chain.
function addNode(type,x,y,props={}){
  let made=null;
  const ok=edit((p,g)=>{
    const sel=g.nodes.find(n=>n.id===selected),n=node(type,0,0,props);made=n;
    if(x===undefined){
      if(sel&&isChain(type)&&Object.keys(TYPES[sel.type].outputs).length){
        const out=Object.keys(TYPES[sel.type].outputs)[0],inPort=Object.keys(TYPES[type].inputs)[0],outPort=Object.keys(TYPES[type].outputs)[0];
        if(compatible(TYPES[sel.type].outputs[out],TYPES[type].inputs[inPort])){
          for(const m of g.nodes)if(m.x>sel.x+20)m.x+=210;
          n.x=sel.x+210;n.y=sel.y;g.nodes.push(n);
          const downstream=g.edges.filter(e=>e.from===sel.id&&e.out===out);
          g.edges=g.edges.filter(e=>!(e.from===sel.id&&e.out===out));
          g.edges.push({from:sel.id,out,to:n.id,input:inPort});
          for(const e of downstream)if(compatible(TYPES[type].outputs[outPort],inputsOf(g.nodes.find(m=>m.id===e.to).type)[e.input]))g.edges.push({...e,from:n.id,out:outPort});
          return;
        }
      }
      const vp=$('graphViewport'),cx=(vp.clientWidth/2-view.x)/view.zoom,cy=(vp.clientHeight/3-view.y)/view.zoom;
      if(sel){n.x=sel.x+(['controls','audio','inputs'].includes(TYPES[type].category)&&!isEngine(type)?-210:30);n.y=sel.y+150;}else{n.x=cx-84;n.y=cy;}
    }else{n.x=x;n.y=y;}
    g.nodes.push(n);
    // A new renderer listens to the layer's Audio node straight away.
    const src=isEngine(type)&&g.nodes.find(m=>m.type==='audioIn');if(src)g.edges.push({from:src.id,out:'audio',to:n.id,input:'audio'});
  },`Added ${TYPES[type].label}`);
  if(ok&&made){selected=made.id;renderUI();return made.id;}
}
function addLayer(){
  const next=clone(state),g=layer(next.layers.length+1);next.layers.push(g);
  return attempt(()=>{commit(next,'Added layer');active=g.id;selected=g.nodes.find(n=>isEngine(n.type)).id;renderUI();return g.id;});
}
// Remove a node's wires; a chain node's input source is reconnected to its downstream inputs.
function detachEdges(g,id){
  const n=g.nodes.find(n=>n.id===id),inE=g.edges.find(e=>e.to===id&&['shape','image','audio'].includes(e.input)),outE=g.edges.filter(e=>e.from===id);
  g.edges=g.edges.filter(e=>e.from!==id&&e.to!==id);
  if(n&&inE&&isChain(n.type))for(const e of outE){const src=g.nodes.find(m=>m.id===inE.from),dst=g.nodes.find(m=>m.id===e.to);if(src&&dst&&compatible(TYPES[src.type].outputs[inE.out],inputsOf(dst.type)[e.input]))g.edges.push({from:inE.from,out:inE.out,to:e.to,input:e.input});}
}
function removeSelected(){
  if(!selected)return;const id=selected;
  edit((p,g)=>{detachEdges(g,id);g.nodes=g.nodes.filter(n=>n.id!==id);},'Deleted node');
}
function duplicateSelected(){
  const n=graph().nodes.find(n=>n.id===selected);if(!n)return;
  const id=addNode(n.type,n.x+30,n.y+30,clone(n.props));if(id)selected=id;
}
function connection(from,out,to,input){return edit((p,g)=>connect(g,from,out,to,input),'Connected');}

// ---------- audio ----------
const audio={context:null,buffer:null,source:null,live:null,analyser:null,monitor:null,dest:null,startedAt:0,offset:0,name:''};
const A={freq:new Uint8Array(BINS),wave:new Float32Array(2048),rate:48000,bands:{bass:0,mids:0,high:0,full:0},beat:0,beatPulse:0,avg:0,lastBeat:0,live:false};
// Routing: source → analyser → dest (recording) and analyser → monitor → speakers.
// The monitor is muted for mic / system input so it never feeds back.
function audioContext(){
  if(!audio.context||audio.context.state==='closed'){
    const c=audio.context=new AudioContext({latencyHint:'interactive'}),a=c.createAnalyser();a.fftSize=BINS*2;a.smoothingTimeConstant=.78;a.minDecibels=-100;a.maxDecibels=-30;
    audio.analyser=a;audio.monitor=c.createGain();audio.dest=c.createMediaStreamDestination();
    a.connect(audio.monitor);audio.monitor.connect(c.destination);a.connect(audio.dest);
  }
  return audio.context;
}
// Browsers only start audio inside a user gesture: create/resume synchronously in the click itself.
function unlockAudio(){const c=audioContext();if(c.state!=='running')c.resume().catch(()=>{});return c;}
document.addEventListener('pointerdown',()=>{if(audio.context&&audio.context.state==='suspended'&&(audio.source||audio.live))audio.context.resume().catch(()=>{});},true);
async function ensureRunning(){
  const c=audioContext();if(c.state!=='running')await Promise.race([c.resume(),new Promise(r=>setTimeout(r,400))]);
  if(c.state!=='running')message('The browser blocked sound · click anywhere on the page to enable it',true);
}
function stopAudio(keepOffset=false){
  if(audio.source){audio.source.onended=null;try{audio.source.stop();}catch{}audio.source.disconnect();if(keepOffset)audio.offset+=audio.context.currentTime-audio.startedAt;audio.source=null;}
  if(!keepOffset)audio.offset=0;$('play').textContent='Play';$('play').classList.remove('on');
}
// Source buttons live in the Audio node's inspector, so they may not exist right now.
function sourceName(){return audio.live?(audio.live.kind==='mic'?'Microphone':'System audio'):audio.name&&audio.buffer?audio.name:'Demo beat';}
function updateAudioUI(){
  for(const k of ['mic','system'])$(k)?.classList.toggle('on',audio.live?.kind===k);
  const name=sourceName();$('audioName').textContent=name==='Demo beat'?'Demo beat · add audio':name;
  const cur=document.querySelector('.audio-source');if(cur)cur.textContent='Now: '+name+(audio.live||audio.source||name==='Demo beat'?'':' (stopped)');
  updateSummaries();
}
function stopLive(){
  if(!audio.live)return;const {kind,stream,node}=audio.live;audio.live=null;
  stream.getTracks().forEach(t=>t.stop());node.disconnect();if(audio.monitor)audio.monitor.gain.value=1;updateAudioUI();
}
async function play(){
  if(!audio.buffer)throw Error('Load an audio file first (or use Mic / System)');
  if(audio.source){stopAudio(true);message('Paused audio');return;}
  stopLive();unlockAudio();audio.monitor.gain.value=1;
  const source=audio.context.createBufferSource();source.buffer=audio.buffer;source.connect(audio.analyser);audio.source=source;
  const offset=audio.offset%audio.buffer.duration;audio.startedAt=audio.context.currentTime;audio.offset=offset;
  source.onended=()=>{if(audio.source===source){audio.source=null;audio.offset=0;$('play').textContent='Play';$('play').classList.remove('on');}};
  source.start(0,offset);$('play').textContent='Pause';$('play').classList.add('on');message('Playing '+audio.name);updateAudioUI();
  await ensureRunning();
}
async function startLive(kind,getStream){
  if(audio.live?.kind===kind){stopLive();message(kind==='mic'?'Microphone off':'System audio off');return;}
  stopAudio();stopLive();unlockAudio();
  if(!navigator.mediaDevices)throw Error('needs HTTPS or localhost');
  const stream=await getStream(),tracks=stream.getAudioTracks();
  stream.getVideoTracks().forEach(t=>{t.stop();stream.removeTrack(t);});
  if(!tracks.length){stream.getTracks().forEach(t=>t.stop());throw Error(kind==='system'?'no audio was shared · tick “Share system audio” (or share a tab with its audio)':'no microphone found');}
  const node=audio.context.createMediaStreamSource(stream);node.connect(audio.analyser);audio.monitor.gain.value=0;
  audio.live={kind,stream,node};updateAudioUI();
  tracks[0].addEventListener('ended',()=>{if(audio.live?.stream===stream){stopLive();message(kind==='mic'?'Microphone disconnected':'System audio sharing ended');}});
  await ensureRunning();
  message(kind==='mic'?`Listening to ${tracks[0].label||'the microphone'}`:'System audio connected · the visuals follow whatever your computer plays');
}
const toggleMic=()=>startLive('mic',()=>navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}}));
const toggleSystem=()=>startLive('system',()=>{
  if(!navigator.mediaDevices.getDisplayMedia)throw Error('not supported in this browser · use desktop Chrome or Edge');
  message('Pick Entire screen and turn on “Share system audio” (or pick a tab and “Share tab audio”)');
  return navigator.mediaDevices.getDisplayMedia({audio:{suppressLocalAudioPlayback:false,echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:true,systemAudio:'include',selfBrowserSurface:'exclude',monitorTypeSurfaces:'include'});
});
const audioError=(label,e)=>message(`${label}: ${e.name==='NotAllowedError'?'permission denied · allow it in the address bar and try again':e.message}`,true);
// Demo signal: a 120 BPM groove so everything moves before audio is loaded.
// Demo signal: a 120 BPM groove with a music-like (dB-scaled, pink) spectrum so everything moves before audio is loaded.
const toByte=db=>Math.max(0,Math.min(255,(db+100)/70*255));
function musicDb(f,kick,hat,pad,i,t){
  const lf=Math.log2(Math.max(20,f)/200);
  return -40-8.5*Math.max(0,lf)+kick*16*Math.exp(-f/160)+pad*9*Math.exp(-((lf-1.8)**2)/2)+hat*12*Math.exp(-((lf-5.5)**2)/.8)+3*Math.sin(i*.37+t*3)+2*Math.sin(i*.071-t*1.7);
}
function demoSpectrum(t){
  const beatT=t%.5,kick=Math.exp(-beatT*9),hat=Math.exp(-((t+.25)%.5)*22),pad=.5+.3*Math.sin(t*.9)+.2*Math.sin(t*2.3),hz=A.rate/(BINS*2);
  for(let i=0;i<BINS;i++)A.freq[i]=toByte(musicDb(i*hz,kick,hat,pad,i,t)-(i<2?30:0));
  for(let i=0;i<A.wave.length;i++)A.wave[i]=kick*.8*Math.sin(i/48000*2*Math.PI*55)+pad*.15*Math.sin(i*.09+t);
}
function readAudio(t){
  A.live=!!(audio.analyser&&(audio.source||audio.live));
  if(A.live){A.rate=audio.context.sampleRate;audio.analyser.getByteFrequencyData(A.freq);audio.analyser.getFloatTimeDomainData(A.wave);}
  else{A.rate=48000;demoSpectrum(t);}
  A.bands=bandsOf(A.freq);
  const b=A.bands.bass;A.avg=A.avg*.95+b*.05;
  if(b>A.avg*1.25+.04&&t-A.lastBeat>.22){A.lastBeat=t;A.beat++;A.beatPulse=1;}
  A.beatPulse*=.86;
}
function bandsOf(freq){
  const hz=A.rate/(BINS*2),band=(a,b)=>{let s=0,c=0;for(let i=Math.max(1,Math.floor(a/hz));i<Math.min(BINS,Math.ceil(b/hz));i++){s+=freq[i]/255;c++;}return c?s/c:0;};
  return {bass:band(30,250),mids:band(250,2500),high:band(2500,14000),full:band(30,14000)};
}
// The value on an "audio" wire. Unwired audio inputs hear the project sound.
const projectSignal=()=>({freq:A.freq,wave:A.wave,bands:A.bands,beat:A.beat,pulse:A.beatPulse});
// An emitter driven by a number: a synthetic spectrum whose loudness follows the number.
function driveSpectrum(level,t){
  const freq=new Uint8Array(BINS),wave=new Float32Array(2048),hz=A.rate/(BINS*2),l=Math.max(0,level),gain=l>0?20*Math.log10(l):-100;
  for(let i=0;i<BINS;i++)freq[i]=toByte(musicDb(i*hz,Math.min(1,l),0,.5,i,t)+gain+6);
  for(let i=0;i<wave.length;i++)wave[i]=Math.min(1,l)*.7*Math.sin(i/48000*2*Math.PI*60);
  return {freq,wave};
}
const eqCache=new Map();
function eqGains(props){
  const key=JSON.stringify(props);if(eqCache.has(key))return eqCache.get(key);
  const g=new Float32Array(BINS),hz=A.rate/(BINS*2),logs=EQ_HZ.map(Math.log2);
  for(let i=0;i<BINS;i++){
    const lf=Math.log2(Math.max(16,i*hz));let k=0;while(k<logs.length-1&&lf>logs[k+1])k++;
    const t=Math.max(0,Math.min(1,(lf-logs[k])/((logs[k+1]??logs[k]+1)-logs[k]))),a=props[EQ_KEYS[k]],b=props[EQ_KEYS[Math.min(k+1,9)]];
    g[i]=(a+(b-a)*t)/100*props.gain/100;
  }
  if(eqCache.size>40)eqCache.clear();eqCache.set(key,g);return g;
}

// ---------- evaluation ----------
function surface(id){
  if(!surfaces.has(id)){const cv=document.createElement('canvas');cv.width=WIDTH;cv.height=HEIGHT;surfaces.set(id,cv);}
  const canvas=surfaces.get(id),ctx=canvas.getContext('2d');ctx.resetTransform();ctx.clearRect(0,0,WIDTH,HEIGHT);ctx.filter='none';ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  return {canvas,ctx};
}
function engineFor(id){if(!engines.has(id))engines.set(id,new EmitterEngine(id,m=>message(m,true,'render')));return engines.get(id);}
function fxEngine(){
  for(const e of engines.values())if(e.status==='ready')return e;
  if(!engines.size)engineFor('__fx');return null;
}
const nstate=(id,init)=>{if(!nodeState.has(id))nodeState.set(id,init());return nodeState.get(id);};
const waves={sine:p=>.5+.5*Math.sin(p*2*Math.PI),triangle:p=>1-Math.abs((p%1)*2-1),saw:p=>p%1,square:p=>(p%1)<.5?1:0};
function execute(g,time,dt){
  const outputs=new Map(),byInput=new Map(g.edges.map(e=>[e.to+':'+e.input,e])),rendered=new Map();let image=null;
  const input=(n,key)=>{const e=byInput.get(n.id+':'+key);return e?outputs.get(e.from)?.[e.out]:undefined;};
  const props=n=>{
    const p={...n.props};
    for(const [k,s] of Object.entries(TYPES[n.type].props))if(s.kind==='number'&&!s.noPort&&byInput.has(n.id+':'+k))p[k]=modulate(s,p[k],input(n,k));
    return p;
  };
  // A shape becomes an image by rendering its emitter with the accumulated overrides.
  const asImage=(v,consumer)=>{
    if(!v||v instanceof HTMLCanvasElement)return v;
    const key=v.emitter.id+'|'+JSON.stringify(v.mods)+'|'+v.hue;
    if(rendered.has(key))return rendered.get(key);
    const e=engineFor(v.emitter.id),out=e.draw({...v.job,mods:v.mods,hue:v.hue});
    if(!out)return null;
    const {canvas,ctx}=surface(consumer+':r');ctx.drawImage(out,0,0);rendered.set(key,canvas);return canvas;
  };
  const need=(n,key,label)=>{const v=input(n,key);if(v===undefined){nodeErrors.add(n.id);throw Error(`${g.name}: connect ${label} to ${TYPES[n.type].label}`);}return v;};
  for(const n of plans.get(g.id)||[]){
    const t=TYPES[n.type],p=props(n);let r={};
    if(t.engine){
      const sig=input(n,'audio')??projectSignal(),driven=byInput.has(n.id+':drive');let freq=sig.freq,wave=sig.wave;
      if(driven){const d=driveSpectrum(Math.max(0,input(n,'drive')??0),time);freq=d.freq;wave=d.wave;}
      const lvl=driven?Math.max(0,input(n,'drive')??0):sig.bands.bass,spec=engineSpec(n);
      let opts=p.opts;
      for(const e of g.edges)if(e.to===n.id&&OPT_PORT.test(e.input)){
        const id=e.input.slice(4),range=engines.get(n.id)?.optRange(jobOf(n),id);
        if(range){if(opts===p.opts)opts={...opts};opts[id]=modulate(range,opts[id]??range.value,input(n,e.input));}
      }
      r.shape={emitter:n,mods:{},hue:0,job:{...spec,label:nodeTitle(n),opts,chips:p.chips,response:{intensity:p.intensity,punch:p.punch,release:p.release,dynamics:p.dynamics},text:p.text,audio:{freq,wave,rate:A.rate,drive:{bass:lvl,beat:driven?lvl:sig.pulse}}}};
      if(n.type==='camera'&&g.edges.some(e=>e.from===n.id&&e.out!=='shape')){const c=cameraNumbers();r.motion=c.motion;r.brightness=c.brightness;}
    }else switch(n.type){
      case 'value':r.value=p.value;break;
      case 'oscillator':{const s=nstate(n.id,()=>({phase:0,v:0,next:0}));s.phase+=dt*p.rate;
        let w;if(p.wave==='random'){if(s.phase>=s.next){s.next=Math.floor(s.phase)+1;s.target=Math.random();}s.v+=((s.target??.5)-s.v)*Math.min(1,dt*8);w=s.v;}else w=waves[p.wave](s.phase);
        r.value=p.offset+p.depth*w;break;}
      case 'map':r.value=(input(n,'value')??0)*p.scale+p.offset;break;
      case 'smooth':{const s=nstate(n.id,()=>({v:0})),x=input(n,'value')??0,ms=x>s.v?p.attack:p.release;s.v+=(x-s.v)*(ms<=0?1:1-Math.exp(-dt*1000/ms));r.value=s.v;break;}
      case 'math':{const a=input(n,'a')??p.a,b=input(n,'b')??p.b;r.value={add:a+b,multiply:a*b,subtract:a-b,min:Math.min(a,b),max:Math.max(a,b)}[p.op];break;}
      case 'random':{const s=nstate(n.id,()=>({v:Math.random(),target:Math.random(),beat:A.beat,acc:0,gate:false})),trig=input(n,'trigger');s.acc+=dt;
        // A wired trigger replaces the beat/rate clock: a new value each time it rises above 0.5.
        const gate=trig!==undefined&&trig>.5,fire=trig!==undefined?gate&&!s.gate:p.trigger==='beat'?A.beat!==s.beat:s.acc>=1/p.rate;s.gate=gate;
        if(fire){s.beat=A.beat;s.acc=0;s.target=Math.random();}
        s.v+=(s.target-s.v)*(p.glide<=0?1:Math.min(1,dt*(1.2/p.glide)));r.value=s.v;break;}
      case 'audioIn':{const sig=projectSignal(),s=nstate(n.id,()=>({beat:A.beat,v:0}));
        if(sig.beat!==s.beat){s.beat=sig.beat;s.v=1;}else s.v*=Math.exp(-dt*1000/p.decay);
        r.audio=sig;r.level=sig.bands.full*p.gain;r.bass=sig.bands.bass*p.gain;r.mids=sig.bands.mids*p.gain;r.high=sig.bands.high*p.gain;r.beat=s.v*p.gain;break;}
      case 'audio':r.value=(input(n,'audio')??projectSignal()).bands[p.band]*p.gain;break;
      case 'beat':{const sig=input(n,'audio')??projectSignal(),s=nstate(n.id,()=>({beat:sig.beat,v:0}));if(sig.beat!==s.beat){s.beat=sig.beat;s.v=1;}else s.v*=Math.exp(-dt*1000/p.decay);r.value=s.v*p.gain;break;}
      case 'spectrum':{const sig=input(n,'audio')??projectSignal(),gains=eqGains(p),f=new Uint8Array(BINS);
        for(let i=0;i<BINS;i++)f[i]=Math.min(255,sig.freq[i]*gains[i]);
        // Beats stay with the source; levels follow the reshaped spectrum.
        r.audio={...sig,freq:f,bands:bandsOf(f)};break;}
      case 'background':{const {canvas,ctx}=surface(n.id);
        if(p.fill==='flat')ctx.fillStyle=p.c1;
        else{const gr=p.fill==='vertical'?ctx.createLinearGradient(0,0,0,HEIGHT):ctx.createRadialGradient(WIDTH/2,HEIGHT/2,0,WIDTH/2,HEIGHT/2,WIDTH*.6);gr.addColorStop(0,p.fill==='vertical'?p.c1:p.c2);gr.addColorStop(1,p.fill==='vertical'?p.c2:p.c1);ctx.fillStyle=gr;}
        ctx.fillRect(0,0,WIDTH,HEIGHT);r.image=canvas;break;}
      case 'effect':{const src=asImage(need(n,'image','an image'),n.id),{canvas,ctx}=surface(n.id);if(src){ctx.filter=filterFor(p.kind,p.amount);ctx.drawImage(src,0,0);ctx.filter='none';}r.image=canvas;break;}
      case 'cornerPin':{const src=asImage(need(n,'image','an image'),n.id),{canvas,ctx}=surface(n.id);
        const q=[[p.tlx,p.tly],[100+p.trx,p.try],[100+p.brx,100+p.bry],[p.blx,100+p.bly]].map(([x,y])=>[x*WIDTH/100,y*HEIGHT/100]);
        if(src)warpQuad(ctx,src,q);if(p.grid==='on')drawPinGrid(ctx,q);r.image=canvas;break;}
      case 'blend':{const a=asImage(need(n,'a','image A'),n.id+'a'),b=asImage(need(n,'b','image B'),n.id+'b'),{canvas,ctx}=surface(n.id);
        if(a)ctx.drawImage(a,0,0);if(b){ctx.globalAlpha=p.mix;ctx.globalCompositeOperation=p.mode;ctx.drawImage(b,0,0);}ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';r.image=canvas;break;}
      case 'output':image=asImage(need(n,'image','an image'),n.id);r.image=image;break;
      default:
        if(t.fx){
          const src=asImage(need(n,'image','an image'),n.id),e=fxEngine(),{canvas,ctx}=surface(n.id);
          if(!fxSlots.has(n.id))fxSlots.set(n.id,1000+fxSlots.size);
          if(src&&e){const out=e.fx(fxSlots.get(n.id),src,fxSettings(n.type,p),{bass:A.bands.bass,beat:A.beatPulse});if(out)ctx.drawImage(out,0,0,WIDTH,HEIGHT);}
          else if(src)ctx.drawImage(src,0,0);
          r.image=canvas;
        }else if(t.outputs.shape){
          const s=need(n,'shape','a shape');
          if(s instanceof HTMLCanvasElement)throw Error(`${g.name}: ${t.label} needs a shape from an Emitter, not an image`);
          const mods=applyShapeNode(n.type,p,s.mods);let hue=s.hue;
          if(n.type==='hue')hue+=p.hue+p.cycle*time;
          r.shape={...s,mods,hue:((hue%360)+360)%360};
        }
    }
    outputs.set(n.id,r);{const v=r.value??(n.type==='audioIn'?r.level:undefined);if(v!==undefined)lastValues.set(n.id,v);}
    if(r.image&&thumbs.has(n.id)&&frame%4===0)drawThumb(n.id,r.image);
  }
  // Emitter thumbnails show the raw emitter render.
  for(const [key,canvas] of rendered){const id=key.split('|')[0];if(thumbs.has(id)&&frame%4===0)drawThumb(id,canvas);}
  if(!g.nodes.some(n=>n.type==='output'))throw Error(`${g.name}: add an Output node`);
  return image;
}
// Perspective-ish warp of a full frame onto quad q (TL,TR,BR,BL) via bilinear mesh of affine triangles.
function quadPoint(q,u,v){const a=[q[0][0]+(q[1][0]-q[0][0])*u,q[0][1]+(q[1][1]-q[0][1])*u],b=[q[3][0]+(q[2][0]-q[3][0])*u,q[3][1]+(q[2][1]-q[3][1])*u];return [a[0]+(b[0]-a[0])*v,a[1]+(b[1]-a[1])*v];}
function warpTri(ctx,img,s0,s1,s2,d0,d1,d2){
  const cx=(d0[0]+d1[0]+d2[0])/3,cy=(d0[1]+d1[1]+d2[1])/3,grow=p=>{const dx=p[0]-cx,dy=p[1]-cy,l=Math.hypot(dx,dy)||1;return [p[0]+dx/l*.7,p[1]+dy/l*.7];};
  const [e0,e1,e2]=[grow(d0),grow(d1),grow(d2)];
  const den=(s1[0]-s0[0])*(s2[1]-s0[1])-(s2[0]-s0[0])*(s1[1]-s0[1]);if(!den)return;
  const a=((d1[0]-d0[0])*(s2[1]-s0[1])-(d2[0]-d0[0])*(s1[1]-s0[1]))/den,b=((d1[1]-d0[1])*(s2[1]-s0[1])-(d2[1]-d0[1])*(s1[1]-s0[1]))/den,
    c=((d2[0]-d0[0])*(s1[0]-s0[0])-(d1[0]-d0[0])*(s2[0]-s0[0]))/den,d=((d2[1]-d0[1])*(s1[0]-s0[0])-(d1[1]-d0[1])*(s2[0]-s0[0]))/den;
  ctx.save();ctx.beginPath();ctx.moveTo(...e0);ctx.lineTo(...e1);ctx.lineTo(...e2);ctx.closePath();ctx.clip();
  ctx.setTransform(a,b,c,d,d0[0]-a*s0[0]-c*s0[1],d0[1]-b*s0[0]-d*s0[1]);ctx.drawImage(img,0,0,WIDTH,HEIGHT);ctx.restore();
}
function warpQuad(ctx,img,q){
  if(q.every((p,i)=>p[0]===[0,WIDTH,WIDTH,0][i]&&p[1]===[0,0,HEIGHT,HEIGHT][i])){ctx.drawImage(img,0,0);return;}
  const N=12;for(let j=0;j<N;j++)for(let i=0;i<N;i++){
    const u0=i/N,u1=(i+1)/N,v0=j/N,v1=(j+1)/N,s=(u,v)=>[u*WIDTH,v*HEIGHT],d=(u,v)=>quadPoint(q,u,v);
    warpTri(ctx,img,s(u0,v0),s(u1,v0),s(u1,v1),d(u0,v0),d(u1,v0),d(u1,v1));warpTri(ctx,img,s(u0,v0),s(u1,v1),s(u0,v1),d(u0,v0),d(u1,v1),d(u0,v1));
  }
}
function drawPinGrid(ctx,q){ctx.save();ctx.strokeStyle='rgba(255,255,255,.75)';ctx.lineWidth=1.5;
  for(let k=0;k<=8;k++){const t=k/8;ctx.beginPath();ctx.moveTo(...quadPoint(q,t,0));ctx.lineTo(...quadPoint(q,t,1));ctx.moveTo(...quadPoint(q,0,t));ctx.lineTo(...quadPoint(q,1,t));ctx.stroke();}
  ctx.fillStyle='#d2ff3a';for(const p of q){ctx.beginPath();ctx.arc(p[0],p[1],7,0,7);ctx.fill();}ctx.restore();}
function drawThumb(id,src){const cv=thumbs.get(id);if(!cv?.isConnected)return;const c=cv.getContext('2d');c.fillStyle='#000';c.fillRect(0,0,cv.width,cv.height);c.drawImage(src,0,0,cv.width,cv.height);}
function draw(time,dt=1/30){
  if(pageHidden)return;
  readAudio(time);renderErrors=[];const prevErrors=nodeErrors;nodeErrors=new Set();
  previewCtx.globalAlpha=1;previewCtx.filter='none';previewCtx.globalCompositeOperation='source-over';previewCtx.fillStyle='#000';previewCtx.fillRect(0,0,WIDTH,HEIGHT);
  for(const g of state.layers)if(g.visible&&g.opacity>0){
    try{const image=execute(g,time,dt);if(image){previewCtx.globalAlpha=g.opacity;previewCtx.globalCompositeOperation=g.blend;previewCtx.drawImage(image,0,0);}}
    catch(error){renderErrors.push(error.message);}
  }
  previewCtx.globalAlpha=1;previewCtx.globalCompositeOperation='source-over';frame++;
  if(frame%2===0)drawSpectrum();
  $('audioMeter').value=A.bands.full;
  const list=[...engines.values()],starting=list.some(e=>e.status==='starting');
  $('backend').textContent=starting?'Starting engines…':[...new Set(list.map(e=>e.backend||(e.status==='ready'?'Canvas2D':e.status)))].join(' / ')||'No Emitters';
  if(renderErrors.length&&!starting)message(renderErrors[0]+(renderErrors.length>1?` (+${renderErrors.length-1})`:''),true,'render');
  else if(statusSource==='render'&&!renderErrors.length)message('Rendering');
  if(prevErrors.size!==nodeErrors.size||[...nodeErrors].some(id=>!prevErrors.has(id)))document.querySelectorAll('.node').forEach(e=>e.classList.toggle('error',nodeErrors.has(e.dataset.id)));
}
function drawSpectrum(){
  const cv=$('spectrum'),c=cv.getContext('2d'),w=cv.width,h=cv.height,bars=48;c.clearRect(0,0,w,h);
  for(let i=0;i<bars;i++){
    const a=Math.floor(Math.pow(BINS*.45,i/bars)),b=Math.max(a+1,Math.floor(Math.pow(BINS*.45,(i+1)/bars)));let m=0;for(let k=a;k<b;k++)m=Math.max(m,A.freq[k]);
    const v=m/255;c.fillStyle=`hsl(${160-v*140} 80% ${40+v*20}%)`;c.fillRect(i*(w/bars),h-v*h,w/bars-1,v*h);
  }
}
// One shared camera stream for every engine (Webcam node, Video emitter camera source). Released when unused.
let camPromise=null,camStream=null;
function camProvider(){
  if(!navigator.mediaDevices?.getUserMedia)return Promise.reject(Error('Camera requires HTTPS or localhost'));
  if(!camPromise)camPromise=navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480}},audio:false})
    .then(s=>(camStream=s),e=>{camPromise=null;throw Error('Could not start camera: '+e.message);});
  return camPromise;
}
setCameraProvider(camProvider);
// Camera motion / brightness numbers: a tiny grey copy of the shared stream, compared frame to frame.
const camNum={video:null,canvas:null,prev:null,frame:-1,used:-1e9,motion:0,brightness:0};
function cameraNumbers(){
  camNum.used=frame;if(camNum.frame===frame)return camNum;camNum.frame=frame;
  if(!camNum.video){
    const v=camNum.video=document.createElement('video');v.muted=true;v.playsInline=true;
    camProvider().then(s=>{if(camNum.video===v){v.srcObject=s;v.play().catch(()=>{});}}).catch(e=>{message(e.message,true,'render');});
    camNum.canvas=document.createElement('canvas');camNum.canvas.width=32;camNum.canvas.height=24;
  }
  const v=camNum.video;if(v.readyState<2)return camNum;
  const c=camNum.canvas.getContext('2d',{willReadFrequently:true});c.drawImage(v,0,0,32,24);
  const d=c.getImageData(0,0,32,24).data,g=new Float32Array(768);let sum=0,diff=0;
  for(let i=0;i<768;i++){g[i]=(d[i*4]*.3+d[i*4+1]*.59+d[i*4+2]*.11)/255;sum+=g[i];if(camNum.prev)diff+=Math.abs(g[i]-camNum.prev[i]);}
  camNum.prev=g;camNum.brightness=sum/768;camNum.motion+=(Math.min(1,diff/768*12)-camNum.motion)*.5;
  return camNum;
}
function releaseCameraIfUnused(){
  if(camNum.video&&frame-camNum.used>30){camNum.video.srcObject=null;camNum.video=null;camNum.prev=null;}
  if(!camStream||camNum.video||[...engines.values()].some(e=>e.usesCamera()))return;
  camStream.getTracks().forEach(t=>t.stop());camStream=null;camPromise=null;
}
function loop(now){
  if(frame%60===59)releaseCameraIfUnused();
  if(!pageHidden&&!paused&&now-lastTime>1000/31){const dt=lastTime?Math.min(.1,(now-lastTime)/1000):1/30;elapsed+=dt;lastTime=now;try{draw(elapsed,dt);}catch(e){message(e.message,true,'render');}}
  requestAnimationFrame(loop);
}

// ---------- library ----------
function renderLibrary(){
  const root=$('library');root.replaceChildren();
  for(const cat of CATEGORIES){
    const types=Object.keys(TYPES).filter(t=>TYPES[t].category===cat.id);
    if(GROUPS[cat.id]){
      const items=groupedItems(cat.id),{root:pr,body}=ui.panel({id:cat.id,title:cat.label,color:cat.color,count:items.length});
      for(const group of GROUPS[cat.id]){
        const list=items.filter(it=>it.group===group);if(!list.length)continue;
        body.append(el('div','lib-sub',group));
        const box=el('div','chips');for(const it of list)box.append(libraryButton(it.type,it.label,it.description,it.props,cat.color));
        body.append(box);
      }
      root.append(pr);continue;
    }
    const {root:pr,body}=ui.panel({id:cat.id,title:cat.label,color:cat.color,count:types.length,open:!['controls','audio','composite','style'].includes(cat.id)});
    const box=el('div','chips');for(const t of types)box.append(libraryButton(t,TYPES[t].label,TYPES[t].description,{},cat.color));
    body.append(box);root.append(pr);
  }
}
// Waveforms and Emitters are listed per mode: each waveform / simulation is its own library entry.
const GROUPS={waveforms:['2D','3D'],emitters:['Particles','WebGPU particles']};
function groupedItems(cat){
  const items=[];
  for(const t of Object.keys(TYPES).filter(t=>TYPES[t].category===cat)){
    const T=TYPES[t],group=T.group||'Particles';
    if(MODES[t])for(const [mode,label] of MODES[t])items.push({type:t,props:{mode},label,group,description:`${label} · ${T.label}. ${T.description}`});
    else items.push({type:t,props:{},label:T.label,group,description:T.description});
  }
  return items;
}
function libraryButton(type,label,description,props,color){
  const b=el('button','mbtn library-node');b.type='button';b.draggable=true;b.dataset.type=type;if(props.mode)b.dataset.mode=props.mode;
  b.title=description+(isChain(type)?' · Click to insert after the selected node.':'');b.style.setProperty('--cat',color);
  b.append(el('span','dot'),document.createTextNode(label));
  b.addEventListener('dragstart',e=>e.dataTransfer.setData('application/audiograph-node',JSON.stringify({type,props})));
  b.onclick=()=>addNode(type,undefined,undefined,props);
  return b;
}
$('librarySearch').addEventListener('input',()=>{
  const q=$('librarySearch').value.trim().toLowerCase();
  document.querySelectorAll('#library .library-node').forEach(b=>b.classList.toggle('hidden',!!q&&!(b.textContent+' '+b.title).toLowerCase().includes(q)));
  document.querySelectorAll('#library .panel').forEach(p=>{const any=[...p.querySelectorAll('.library-node')].some(b=>!b.classList.contains('hidden'));p.classList.toggle('lib-empty',!any);if(q&&any)p.classList.remove('collapsed');});
  document.querySelectorAll('#library .lib-sub').forEach(s=>{const box=s.nextElementSibling;s.classList.toggle('hidden',![...box.children].some(b=>!b.classList.contains('hidden')));});
});

// ---------- graph editor ----------
function summary(n){
  const p=n.props,t=TYPES[n.type];
  if(n.type==='audioIn')return sourceName();
  if(MODES[n.type])return t.label;
  if(n.type==='text')return p.text;
  if(isEngine(n.type)){const m=engines.get(n.id)?.mediaName,r=t.props.render?.labels.find(l=>l[0]===p.render)?.[1];return [r,m||(MEDIA_KIND[n.type]?(n.type==='object'?'built-in knot':n.type==='splat'?'demo cloud':'no file'):'')].filter(Boolean).join(' · ');}
  if(n.type==='value')return String(p.value);
  if(n.type==='oscillator')return `${p.wave} · ${p.rate} Hz`;
  if(n.type==='audio')return `${p.band} ×${p.gain}`;
  if(n.type==='palette')return p.mode==='solid'?'solid':paletteStops(p).simple.join(' ');
  for(const [k,s] of Object.entries(t.props)){if(s.kind==='select')return String(s.labels?.find(l=>l[0]===p[k])?.[1]??p[k]);if(s.kind==='number')return `${s.label} ${+p[k].toFixed(2)}`;}
  return t.description;
}
function updateSummaries(){updatePalettePreview();for(const box of document.querySelectorAll('#nodes .node')){const n=findNode(box.dataset.id);if(n)box.querySelector('.node-summary').textContent=summary(n);}}
function visiblePorts(g,n){
  const t=TYPES[n.type],all=inputsOf(n.type),ins=[];
  for(const [k,type] of Object.entries(all))if(Object.hasOwn(t.inputs,k)||g.edges.some(e=>e.to===n.id&&e.input===k))ins.push([k,type]);
  if(isEngine(n.type))for(const e of g.edges)if(e.to===n.id&&OPT_PORT.test(e.input))ins.push([e.input,'number']);
  return {ins,outs:Object.entries(t.outputs)};
}
const jobOf=n=>({...engineSpec(n),chips:n.props.chips});
function optLabel(n,key){const r=engines.get(n.id)?.optRange(jobOf(n),key.slice(4));return r?.label||key.slice(4);}
function portLabel(n,key){return TYPES[n.type].props[key]?.label||(OPT_PORT.test(key)?optLabel(n,key):key);}
function renderGraph(){
  const g=graph();$('nodes').replaceChildren();
  for(const old of thumbs.keys())thumbs.delete(old);
  for(const n of g.nodes){
    const t=TYPES[n.type],box=el('article','node'+(n.id===selected?' selected':'')+(nodeErrors.has(n.id)?' error':''));
    box.dataset.id=n.id;box.dataset.type=n.type;box.style.left=n.x+'px';box.style.top=n.y+'px';box.style.setProperty('--cat',catOf(n.type).color);
    const head=el('div','node-head');head.append(el('div','node-title',nodeTitle(n)),el('div','node-summary',summary(n)));box.append(head);
    if(t.engine||t.fx||n.type==='output'){const c=el('canvas','node-thumb');c.width=160;c.height=90;box.append(c);thumbs.set(n.id,c);}
    const ports=el('div','ports'),{ins,outs}=visiblePorts(g,n);
    for(const [dir,list] of [['in',ins],['out',outs]])for(const [key,type] of list){
      const connected=g.edges.some(e=>dir==='in'?e.to===n.id&&e.input===key:e.from===n.id&&e.out===key);
      const label=dir==='in'?portLabel(n,key):key;
      const port=el('button',`port ${dir} ${type}${connected?' connected':''}`,label);
      port.type='button';port.dataset.node=n.id;port.dataset.port=key;port.dataset.direction=dir;port.dataset.ptype=type;port.title=`${dir==='in'?'Input':'Output'}: ${label} (${type})`;
      if(pending?.id===n.id&&pending.port===key&&dir==='out')port.classList.add('pending');
      if(dir==='out')port.addEventListener('pointerdown',e=>startWire(e,n,key,type));
      port.onclick=e=>{
        e.stopPropagation();
        if(dir==='out'){if(port._dragged){port._dragged=false;return;}pending={id:n.id,port:key,type};message(`Now click an input (or a node) to connect ${key}. Esc cancels.`);renderGraph();}
        else if(pending){const p=pending;pending=null;connection(p.id,p.port,n.id,key);}
        else if(connected)edit((p,g)=>{g.edges=g.edges.filter(e=>!(e.to===n.id&&e.input===key));},'Disconnected');
        else message('Drag from an output dot to this input.',true);
      };
      ports.append(port);
    }
    box.append(ports);
    box.addEventListener('pointerdown',e=>{
      if(e.target.closest('.port'))return;
      if(pending){e.stopPropagation();const p=pending;pending=null;portMenu(n,p,e.clientX,e.clientY);return;}
      if(selected!==n.id){selected=n.id;renderProperties();document.querySelectorAll('#nodes .node').forEach(x=>x.classList.toggle('selected',x.dataset.id===n.id));updateHint();}
    });
    head.addEventListener('pointerdown',e=>{if(!pending)startMove(e,n,box);});
    $('nodes').append(box);
  }
  if(!g.nodes.length){const empty=el('div','graph-empty','Click an Emitter in the library to start.');$('nodes').append(empty);}
  applyView();requestAnimationFrame(renderWires);
}
const portEl=(id,port,dir)=>$('nodes').querySelector(`.port[data-node="${id}"][data-port="${port}"][data-direction="${dir}"]`);
function portXY(p,dir){
  const r=p.getBoundingClientRect(),b=$('graphViewport').getBoundingClientRect();
  return [((dir==='out'?r.right:r.left)-b.left-view.x)/view.zoom,(r.top+r.height/2-b.top-view.y)/view.zoom];
}
const curve=(x1,y1,x2,y2)=>{const bend=Math.max(40,Math.abs(x2-x1)*.45);return `M ${x1} ${y1} C ${x1+bend} ${y1},${x2-bend} ${y2},${x2} ${y2}`;};
function renderWires(){
  const svg=$('wires');[...svg.querySelectorAll('.wire')].forEach(w=>w.remove());const g=graph();
  for(const edge of g.edges){
    const a=portEl(edge.from,edge.out,'out'),b=portEl(edge.to,edge.input,'in');if(!a||!b)continue;
    const [x1,y1]=portXY(a,'out'),[x2,y2]=portXY(b,'in'),wire=document.createElementNS('http://www.w3.org/2000/svg','path');
    wire.setAttribute('d',curve(x1,y1,x2,y2));wire.setAttribute('class','wire '+a.dataset.ptype);Object.assign(wire.dataset,{from:edge.from,out:edge.out,to:edge.to,input:edge.input});
    wire.setAttribute('tabindex','0');wire.setAttribute('role','button');wire.setAttribute('aria-label',`Remove connection ${edge.out} → ${edge.input}`);
    const remove=()=>edit((p,g)=>{g.edges=g.edges.filter(e=>!(e.from===edge.from&&e.out===edge.out&&e.to===edge.to&&e.input===edge.input));},'Removed connection');
    wire.onclick=remove;wire.onkeydown=e=>{if(e.key==='Enter'||e.key==='Delete')remove();};svg.append(wire);
  }
}
function startWire(event,n,key,type){
  if(event.button!==0)return;event.preventDefault();event.stopPropagation();
  const src=event.currentTarget,svg=$('wires'),ghost=document.createElementNS('http://www.w3.org/2000/svg','path');ghost.setAttribute('class','wire-ghost');
  const [x1,y1]=portXY(src,'out'),start={x:event.clientX,y:event.clientY};let moved=false,target=null;
  const vb=()=>$('graphViewport').getBoundingClientRect();
  const move=e=>{
    if(!moved&&Math.hypot(e.clientX-start.x,e.clientY-start.y)<5)return;
    if(!moved){moved=true;svg.append(ghost);}
    const b=vb(),x2=(e.clientX-b.left-view.x)/view.zoom,y2=(e.clientY-b.top-view.y)/view.zoom;ghost.setAttribute('d',curve(x1,y1,x2,y2));
    const hit=document.elementFromPoint(e.clientX,e.clientY)?.closest('.port.in,.node');
    if(target!==hit){target?.classList.remove('drop-target');target=hit&&hit.classList.contains('port')&&compatible(type,hit.dataset.ptype)?hit:hit?.classList.contains('node')?hit:null;if(target?.classList.contains('port'))target.classList.add('drop-target');}
  };
  const end=e=>{
    window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);ghost.remove();target?.classList.remove('drop-target');
    if(!moved)return;src._dragged=true;setTimeout(()=>{src._dragged=false;},0);
    if(target?.classList.contains('port'))connection(n.id,key,target.dataset.node,target.dataset.port);
    else if(target?.classList.contains('node')&&target.dataset.id!==n.id)portMenu(findNode(target.dataset.id),{id:n.id,port:key,type},e.clientX,e.clientY);
  };
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',end);
}
// ---------- Tab: node search ----------
const pointer={x:0,y:0,inGraph:false};
function searchItems(){
  const items=[];
  for(const cat of CATEGORIES){
    if(GROUPS[cat.id]){for(const it of groupedItems(cat.id))items.push({type:it.type,props:it.props,label:it.label,cat:`${cat.label} · ${it.group}`,color:cat.color,text:`${it.label} ${cat.label} ${it.group} ${it.description}`});continue;}
    for(const t of Object.keys(TYPES))if(TYPES[t].category===cat.id)items.push({type:t,props:{},label:TYPES[t].label,cat:cat.label,color:cat.color,text:`${TYPES[t].label} ${cat.label} ${TYPES[t].description}`});
  }
  return items;
}
function rankItems(items,q){
  q=q.trim().toLowerCase();if(!q)return items;
  const words=q.split(/\s+/);
  return items.map(it=>{const l=it.label.toLowerCase(),t=it.text.toLowerCase();if(!words.every(w=>t.includes(w)))return null;
    return [l===q?0:l.startsWith(q)?1:l.split(/\W+/).some(w=>w.startsWith(words[0]))?2:l.includes(q)?3:it.cat.toLowerCase().includes(q)?4:5,it];})
    .filter(Boolean).sort((a,b)=>a[0]-b[0]).map(x=>x[1]);
}
// Place a node at a graph point; dropped on a wire, a chain node is spliced into it.
function placeNode(it,gx,gy,wire){
  let made=null;
  const ok=edit((p,g)=>{
    const n=node(it.type,Math.round(gx-84),Math.round(gy-20),clone(it.props));made=n;g.nodes.push(n);
    const e=wire&&g.edges.find(e=>e.from===wire.from&&e.out===wire.out&&e.to===wire.to&&e.input===wire.input);
    if(!e||!isChain(it.type))return;
    const src=g.nodes.find(m=>m.id===e.from),dst=g.nodes.find(m=>m.id===e.to),srcType=TYPES[src.type].outputs[e.out];
    const inPort=Object.entries(inputsOf(it.type)).find(([,t])=>compatible(srcType,t))?.[0],outPort=Object.entries(TYPES[it.type].outputs).find(([,t])=>compatible(t,inputsOf(dst.type)[e.input]))?.[0];
    if(!inPort||!outPort)return;
    g.edges=g.edges.filter(x=>x!==e);g.edges.push({from:e.from,out:e.out,to:n.id,input:inPort},{from:n.id,out:outPort,to:e.to,input:e.input});
  },`Added ${it.label}`);
  if(ok&&made){selected=made.id;renderUI();}
}
function closeSearch(){document.querySelector('.node-search')?.remove();}
function openSearch(){
  closeSearch();closeMenu();
  const vp=$('graphViewport'),r=vp.getBoundingClientRect();
  const cx=pointer.inGraph?pointer.x:r.left+r.width/2,cy=pointer.inGraph?pointer.y:r.top+r.height/3;
  const gx=(cx-r.left-view.x)/view.zoom,gy=(cy-r.top-view.y)/view.zoom;
  const w=document.elementsFromPoint(cx,cy).find(x=>x.classList?.contains('wire')),wire=w?{...w.dataset}:null;
  const box=el('div','node-search'),input=el('input'),list=el('div','node-search-list'),items=searchItems();
  input.type='search';input.placeholder=wire?'Insert into wire…':'Search nodes…';input.setAttribute('aria-label','Search nodes');list.setAttribute('role','listbox');
  let shown=[],active=0;
  const pick=it=>{closeSearch();placeNode(it,gx,gy,wire);};
  const render=()=>{
    shown=rankItems(items,input.value).slice(0,40);active=Math.min(active,Math.max(0,shown.length-1));list.replaceChildren();
    if(!shown.length)list.append(el('div','node-search-empty','No match'));
    shown.forEach((it,i)=>{const b=el('button','node-search-item'+(i===active?' active':''));b.type='button';b.setAttribute('role','option');b.style.setProperty('--cat',it.color);
      b.append(el('span','dot'),el('span','ns-label',it.label),el('span','ns-cat',it.cat));
      b.onpointerdown=e=>e.preventDefault();b.onclick=()=>pick(it);list.append(b);});
    list.querySelector('.active')?.scrollIntoView({block:'nearest'});
  };
  input.oninput=()=>{active=0;render();};
  input.onkeydown=e=>{
    const up=box.style.flexDirection==='column-reverse',next=e.key==='Tab'?!e.shiftKey:e.key===(up?'ArrowUp':'ArrowDown'),prev=e.key==='Tab'?e.shiftKey:e.key===(up?'ArrowDown':'ArrowUp');
    if(next){e.preventDefault();active=(active+1)%Math.max(1,shown.length);render();}
    else if(prev){e.preventDefault();active=(active-1+shown.length)%Math.max(1,shown.length);render();}
    else if(e.key==='Enter'){e.preventDefault();if(shown[active])pick(shown[active]);}
    else if(e.key==='Escape'){e.preventDefault();closeSearch();}
  };
  input.onblur=()=>setTimeout(()=>{if(!box.contains(document.activeElement))closeSearch();},0);
  box.append(input,list);document.body.append(box);render();
  const b=box.getBoundingClientRect();box.style.left=Math.max(8,Math.min(cx,innerWidth-b.width-8))+'px';
  // Near the bottom edge the box grows upward from the cursor, so filtering keeps it next to the cursor.
  if(cy+b.height+8>innerHeight&&cy>innerHeight/2){box.style.bottom=Math.max(8,innerHeight-cy)+'px';box.style.flexDirection=list.style.flexDirection='column-reverse';}else box.style.top=Math.max(8,cy)+'px';
  input.focus();
}
function closeMenu(){document.querySelector('.port-menu')?.remove();}
function portMenu(target,from,x,y){
  closeMenu();renderGraph();
  const t=TYPES[target.type],options=Object.entries(inputsOf(target.type)).filter(([,type])=>compatible(from.type,type));
  if(isEngine(target.type)&&from.type==='number'){
    const e=engines.get(target.id);let ctl=[];try{ctl=e?.status==='ready'?e.controls(jobOf(target))||[]:[];}catch{}
    for(const c of ctl)if(c.type==='range')options.push(['opt_'+c.id,'number']);
  }
  if(!options.length){message(`${t.label} has no ${from.type} input`,true);return;}
  if(options.length===1){connection(from.id,from.port,target.id,options[0][0]);return;}
  const menu=el('div','port-menu');menu.setAttribute('role','menu');
  menu.append(el('div','port-menu-title',`Connect to ${t.label}`));
  for(const [k] of options){const b=el('button','',portLabel(target,k));b.type='button';b.dataset.port=k;b.onclick=()=>{closeMenu();connection(from.id,from.port,target.id,k);};menu.append(b);}
  document.body.append(menu);
  const r=menu.getBoundingClientRect();menu.style.left=Math.min(x,innerWidth-r.width-8)+'px';menu.style.top=Math.min(y,innerHeight-r.height-8)+'px';
  menu.querySelector('button')?.focus();
}
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.port-menu'))closeMenu();},true);
function applyView(){$('graphWorld').style.transform=`translate(${view.x}px,${view.y}px) scale(${view.zoom})`;}
// Drag the header to move. Press and hold (or Alt-drag) to pull the node out of its chain; the chain heals.
const HOLD_MS=380;
function startMove(event,n,box){
  if(event.button!==0)return;event.preventDefault();const before=clone(state),start={x:event.clientX,y:event.clientY,nx:n.x,ny:n.y};box.setPointerCapture(event.pointerId);box.classList.add('dragging');
  const live=findNode(n.id);let moved=false,detached=false;
  const detach=()=>{
    if(detached)return;detached=true;clearTimeout(hold);
    const g=state.layers.find(g=>g.id===active),had=g.edges.some(e=>e.from===n.id||e.to===n.id);
    if(!had){box.classList.remove('hold');return;}
    detachEdges(g,n.id);box.classList.remove('hold');box.classList.add('detached');renderWires();message('Detached · drop it anywhere');
  };
  const hold=setTimeout(()=>{if(!moved){box.classList.add('hold');detach();}},HOLD_MS);
  if(event.altKey)detach();
  const move=e=>{
    if(!moved&&Math.hypot(e.clientX-start.x,e.clientY-start.y)<4)return;moved=true;clearTimeout(hold);
    live.x=Math.round(Math.max(-10000,Math.min(10000,start.nx+(e.clientX-start.x)/view.zoom)));live.y=Math.round(Math.max(-10000,Math.min(10000,start.ny+(e.clientY-start.y)/view.zoom)));box.style.left=live.x+'px';box.style.top=live.y+'px';renderWires();
  };
  const end=()=>{clearTimeout(hold);box.classList.remove('dragging','hold','detached');box.removeEventListener('pointermove',move);box.removeEventListener('pointerup',end);box.removeEventListener('pointercancel',end);attempt(()=>commit(clone(state),detached?'Detached node':'Moved node',before));};
  box.addEventListener('pointermove',move);box.addEventListener('pointerup',end);box.addEventListener('pointercancel',end);
}
function fit(){
  const g=graph(),vp=$('graphViewport');if(!g.nodes.length){view.x=20;view.y=20;view.zoom=.9;applyView();return;}
  const xs=g.nodes.map(n=>n.x),ys=g.nodes.map(n=>n.y),minX=Math.min(...xs)-20,minY=Math.min(...ys)-20,maxX=Math.max(...xs)+190,maxY=Math.max(...ys)+230;
  view.zoom=Math.max(.35,Math.min(1,Math.min(vp.clientWidth/(maxX-minX),vp.clientHeight/(maxY-minY))));
  view.x=(vp.clientWidth-(maxX-minX)*view.zoom)/2-minX*view.zoom;view.y=Math.max(4,(vp.clientHeight-(maxY-minY)*view.zoom)/2)-minY*view.zoom;applyView();requestAnimationFrame(renderWires);
}

// ---------- inspector ----------
function section(root,label){const s=el('div','insp-section');if(label)s.append(el('div','insp-label',label));root.append(s);return s;}
function setProp(n,key,value,label){return edit((p,g)=>{g.nodes.find(x=>x.id===n.id).props[key]=value;},`${TYPES[n.type].label}: ${label}`);}
function propControl(n,key,s,connected){
  const set=v=>setProp(n,key,v,s.label);
  if(s.kind==='number')return ui.knob({label:s.label,min:s.min,max:s.max,step:s.step,value:n.props[key],def:s.value,property:key,modulated:connected,
    onInput:v=>live(st=>{const x=findNode(n.id);if(x)x.props[key]=v;}),onChange:()=>liveCommit(`${TYPES[n.type].label}: ${s.label}`)});
  if(s.kind==='select')return ui.chips({options:s.labels||s.choices.map(c=>[c,c]),value:n.props[key],property:key,onChange:set});
  if(s.kind==='bool')return ui.field(s.label,ui.toggle({value:n.props[key],property:key,onChange:set}));
  if(s.kind==='color')return ui.colorField({label:s.label,value:n.props[key],property:key,onChange:v=>live(()=>{findNode(n.id).props[key]=v;})});
  if(s.kind==='text'){const i=el('input');i.type='text';i.maxLength=s.max;i.value=n.props[key];i.dataset.property=key;i.onchange=()=>set(i.value);return ui.field(s.label,i);}
}
function renderProps(root,n,keys){
  const t=TYPES[n.type],g=graph(),wired=k=>g.edges.some(e=>e.to===n.id&&e.input===k);
  let grid=null,sec=section(root,null);
  for(const k of keys){
    const s=t.props[k],c=propControl(n,k,s,wired(k));if(!c)continue;
    if(s.kind==='number'){if(!grid){grid=el('div','knob-grid');sec.append(grid);}grid.append(c);continue;}
    grid=null;
    if(s.kind==='select'){const sub=section(root,s.label);sub.append(c);sec=section(root,null);}
    else sec.append(c);
  }
  // Color pickers commit on close, not on every input event.
  root.querySelectorAll('input[type=color]').forEach(i=>i.addEventListener('change',()=>liveCommit('Changed color')));
}
function renderProperties(){
  $('previewWrap').classList.toggle('pinning',!!pinNode());
  const root=$('properties');root.replaceChildren();closeMenu();
  const g=graph(),n=g.nodes.find(n=>n.id===selected);
  if(!n){renderLayerInspector(root,g);return;}
  const t=TYPES[n.type],cat=catOf(n.type),head=el('div','insp-head'),h=el('h3');
  const dot=el('span','dot');dot.style.background=cat.color;h.append(dot,document.createTextNode(nodeTitle(n)));
  head.append(h,el('div','insp-desc',t.description));root.append(head);
  if(t.engine)renderEmitter(root,n);
  else{
    if(n.type==='audioIn')renderAudioSource(root);
    if(n.type==='palette')renderPalettePresets(root,n);
    renderProps(root,n,n.type==='palette'?paletteKeys(n.props):Object.keys(t.props));
    const wired=Object.keys(t.props).filter(k=>t.props[k].kind==='number'&&!t.props[k].noPort);
    if(wired.length&&t.category!=='controls'&&n.type!=='audioIn')section(root).append(el('p','insp-note','Any knob can be driven: drag a wire from a Control or Audio node onto this node and pick the knob. 0 keeps the knob value, 1 pushes it to the maximum.'));
    if(t.category==='controls'||t.category==='audio'&&n.type!=='spectrum'||n.type==='audioIn'){const v=el('p','insp-note live-value');v.dataset.node=n.id;section(root).append(v);}
  }
  const actions=section(root).appendChild(el('div','insp-actions'));
  const dup=el('button','btn','Duplicate');dup.id='duplicateNode';dup.onclick=duplicateSelected;
  const del=el('button','btn danger','Delete');del.id='deleteNode';del.onclick=removeSelected;actions.append(dup,del);
  updateHint();
}
// Palette: live gradient preview of the active stops plus the original's preset swatches.
const gradientCss=stops=>stops.length>1?`linear-gradient(to right,${stops.join(',')})`:stops[0];
function paletteCss(p){return p.mode==='solid'?p.solid:gradientCss(p.mode==='simpleramp'?paletteStops(p).simple:paletteStops(p).tone);}
function updatePalettePreview(){const pv=document.querySelector('.pal-preview');if(!pv)return;const n=findNode(pv.dataset.node);if(n)pv.style.background=paletteCss(n.props);}
function paletteKeys(p){
  if(p.mode==='solid')return ['mode','solid'];
  return ['mode','colors',...(p.mode==='toneramp'?['c1']:[]),'c2','c3','c4',...(p.colors==='4'?['c5']:[]),...(p.mode==='toneramp'?['fade']:[])];
}
function renderPalettePresets(root,n){
  const s=section(root,'Palette'),pv=el('div','pal-preview');pv.dataset.node=n.id;pv.style.background=paletteCss(n.props);s.append(pv);
  const box=el('div','pal-presets');box.dataset.property=n.props.mode==='solid'?'solidPreset':'palettePreset';
  if(n.props.mode==='solid')for(const c of SOLID_PRESETS){
    const b=el('button','pal-swatch solid');b.type='button';b.title=c;b.dataset.value=c;b.style.background=c;b.classList.toggle('on',n.props.solid.toLowerCase()===c);
    b.onclick=()=>edit((p,g)=>{g.nodes.find(x=>x.id===n.id).props.solid=c;},'Palette: '+c);box.append(b);
  }
  else for(const [name,st] of Object.entries(PALETTES)){
    const p=n.props,cur=[p.c1,p.c2,p.c3,p.c4,...(p.colors==='4'?[p.c5]:[])].join().toLowerCase();
    const b=el('button','pal-swatch');b.type='button';b.title=name;b.dataset.value=name;b.setAttribute('aria-label','Palette '+name);
    b.style.background=gradientCss(n.props.mode==='simpleramp'?st.slice(1):[st[0]+'00',...st.slice(1)]);b.classList.toggle('on',cur===st.join().toLowerCase());
    b.onclick=()=>edit((p,g)=>{const x=g.nodes.find(x=>x.id===n.id).props;[x.c1,x.c2,x.c3,x.c4]=st;x.c5=st[4]||x.c5;x.colors=st.length>4?'4':'3';x.fade=0;},'Palette: '+name);
    box.append(b);
  }
  s.append(box);
}
// A new emitter type starts from its defaults; wires into the old type's option knobs are dropped.
function setMode(g,n,mode,key='mode'){if(n.props[key]===mode)return;n.props[key]=mode;n.props.opts={};n.props.chips={};g.edges=g.edges.filter(e=>!(e.to===n.id&&OPT_PORT.test(e.input)));}
// The Audio node's inspector holds the project's sound source (shared by every Audio node).
function renderAudioSource(root){
  const s=section(root,'Source'),row=el('div','audio-src');
  const load=el('label','btn teal','Load file'),f=el('input');f.type='file';f.id='audioFile';f.accept='audio/*';f.hidden=true;load.title='Play an audio file';load.append(f);
  load.addEventListener('click',unlockAudio);f.onchange=()=>{const file=f.files[0];if(file)loadAudioFile(file);};
  const mic=el('button','btn','Mic');mic.id='mic';mic.type='button';mic.title='Use the microphone';mic.onclick=()=>toggleMic().catch(e=>audioError('Mic',e));
  const sys=el('button','btn','System');sys.id='system';sys.type='button';sys.title='React to whatever your computer plays (desktop Chrome / Edge: share the screen or a tab with audio)';sys.onclick=()=>toggleSystem().catch(e=>audioError('System audio',e));
  row.append(load,mic,sys);s.append(row,el('p','insp-note audio-source'),el('p','insp-note','Every Audio node hears this one source. Wire “audio” into visual inputs, waveforms, emitters or an Audio EQ; bass, mids, high, level and beat are numbers for any knob.'));
  updateAudioUI();
}
async function loadAudioFile(file){
  try{
    if(file.size>200*1024*1024)throw Error('Audio limit is 200 MB');
    stopAudio();stopLive();audio.buffer=await audioContext().decodeAudioData(await file.arrayBuffer());audio.name=file.name;
    updateAudioUI();await play();
  }catch(error){message('Audio: '+error.message,true);}
}
// After a splat file loads, pick the "Loaded file" cloud and apply the parser's orientation hint.
function useSplatFile(n,e,res){
  const job=jobOf(n),cloud=(e.controls(job)||[]).find(c=>c.type==='chips'&&c.options.some(o=>o.label==='Loaded file'));
  edit((p,g)=>{const x=g.nodes.find(x=>x.id===n.id);if(cloud)x.props.chips={...x.props.chips,[cloud.key]:'Loaded file'};if(res?.flip)x.props.opts={...x.props.opts,pGsRX:180};},'Gaussian Splat: loaded file');
}
function renderEmitter(root,n){
  const T=TYPES[n.type],s=section(root,MODES[n.type]?T.label:'Source');
  if(MODES[n.type]){
    const sel=el('select');sel.dataset.property='mode';sel.setAttribute('aria-label',T.props.mode.label);
    for(const [id,label] of MODES[n.type]){const o=el('option','',label);o.value=id;sel.append(o);}
    sel.value=n.props.mode;sel.onchange=()=>edit((p,g)=>{const x=g.nodes.find(x=>x.id===n.id);setMode(g,x,sel.value);},`${T.label}: ${emitterNames[sel.value]}`);
    s.append(ui.field(T.props.mode.label,sel));
  }
  if(T.props.render)s.append(ui.chips({options:T.props.render.labels,value:n.props.render,property:'render',onChange:v=>edit((p,g)=>{setMode(g,g.nodes.find(x=>x.id===n.id),v,'render');},`${T.label}: ${v}`)}));
  if(n.type==='text')s.append(propControl(n,'text',T.props.text));
  if(n.type==='camera')s.append(el('p','insp-note','Uses your camera (the browser asks once). Its motion and brightness outputs are numbers for any knob.'));
  const kind=MEDIA_KIND[n.type];
  if(kind){
    const f=el('input');f.type='file';f.id='emitterMedia';f.accept=kind==='image'?'image/png,image/jpeg,image/webp,image/gif,image/avif':kind==='video'?'video/*':kind==='splat'?'.ply,.splat':'.obj';
    f.onchange=async()=>{try{if(!f.files[0])return;const e=engineFor(n.id),res=await e.media(f.files[0],kind);if(kind==='splat')useSplatFile(n,e,res);message('Loaded '+f.files[0].name);renderProperties();if(paused)draw(elapsed);}catch(e){message(e.message,true);}};
    s.append(ui.field(`Load ${kind==='object'?'OBJ':kind==='splat'?'.ply / .splat':kind}`,f),el('p','insp-note',engines.get(n.id)?.mediaName?`Loaded: ${engines.get(n.id).mediaName} (not saved in projects)`:'Media files are not saved in projects.'));
  }
  const d=section(root,'Response');
  const wiredDrive=graph().edges.some(e=>e.to===n.id&&e.input==='drive');
  const rg=el('div','knob-grid');for(const k of ['intensity','punch','release','dynamics'])rg.append(propControl(n,k,T.props[k],graph().edges.some(e=>e.to===n.id&&e.input===k)));d.append(rg);
  const wiredAudio=graph().edges.find(e=>e.to===n.id&&e.input==='audio'),from=wiredAudio&&findNode(wiredAudio.from);
  d.append(el('p','insp-note',wiredDrive?'Driven by the connected number (it replaces the music).':`Hears ${from?TYPES[from.type].label:'the project sound'} (${sourceName()}). Connect a number to “drive” to override.`));
  const opts=section(root,'Options');opts.dataset.emitterOptions='';
  const e=engineFor(n.id);
  const fill=()=>{
    if(selected!==n.id||!opts.isConnected)return;
    let controls;try{controls=e.controls(jobOf(n));}catch(err){opts.append(el('p','insp-note',err.message));return;}
    if(!controls){opts.append(el('p','insp-note','Engine starting…'));return;}
    opts.replaceChildren(el('div','insp-label','Options'));
    let grid=null;
    for(const c of controls){
      if(c.type==='range'){
        if(!grid){grid=el('div','knob-grid');opts.append(grid);}
        const cur=n.props.opts[c.id]??c.value;
        grid.append(ui.knob({label:c.label,min:c.min,max:c.max,step:c.step,value:cur,def:c.def,property:'opt:'+c.id,modulated:graph().edges.some(e=>e.to===n.id&&e.input==='opt_'+c.id),
          onInput:v=>live(()=>{const x=findNode(n.id);if(x)x.props.opts={...x.props.opts,[c.id]:v};}),onChange:()=>liveCommit('Emitter: '+c.label)}));
      }else{
        grid=null;const wrap=el('div','opt-chips');if(c.label)wrap.append(el('div','insp-sublabel',c.label));
        const current=c.options.find(o=>o.on)?.label;
        wrap.append(ui.chips({options:c.options.map(o=>[o.label,o.label]),value:c.action?null:current,property:'chip:'+c.key,onChange:label=>{
          attempt(()=>{
            const job=jobOf(n),res=e.click(job,c.key,label);
            if(c.action){message(label);if(Object.keys(res.ranges).length)edit((p,g)=>{const x=g.nodes.find(x=>x.id===n.id);x.props.opts={...x.props.opts,...res.ranges};},'Emitter: '+label);return;}
            edit((p,g)=>{const x=g.nodes.find(x=>x.id===n.id);x.props.chips={...x.props.chips,[c.key]:label};x.props.opts={...x.props.opts,...res.ranges};},'Emitter: '+label);
          });
        }}));
        opts.append(wrap);
      }
    }
    if(!controls.length)opts.append(el('p','insp-note','This emitter has no extra options. Add Geometry, Deformer, Color or Style nodes after it.'));
  };
  if(e.status==='ready')fill();else{opts.append(el('p','insp-note','Engine starting…'));e.ready.then(()=>{if(opts.isConnected){opts.replaceChildren();fill();}});}
}
function renderLayerInspector(root,g){
  const head=el('div','insp-head'),h=el('h3');h.append(el('span','dot'),document.createTextNode(g.name));head.append(h,el('div','insp-desc','Layer settings. Select a node in the graph to edit it.'));root.append(head);
  const s=section(root,null),name=el('input');name.type='text';name.maxLength=80;name.value=g.name;name.dataset.property='layerName';
  name.onchange=()=>edit((p,l)=>{l.name=name.value.trim()||l.name;},'Renamed layer');s.append(ui.field('Name',name));
  s.append(ui.field('Visible',ui.toggle({value:g.visible,property:'layerVisible',onChange:v=>edit((p,l)=>{l.visible=v;},'Layer visibility')})));
  const grid=el('div','knob-grid');grid.append(ui.knob({label:'Opacity',min:0,max:100,step:1,value:Math.round(g.opacity*100),def:100,unit:'%',property:'layerOpacity',
    onInput:v=>live(()=>{graph().opacity=v/100;}),onChange:()=>liveCommit('Layer opacity')}));s.append(grid);
  const b=section(root,'Blend with layers below');b.append(ui.chips({options:LAYER_BLENDS.map(m=>[m,{'source-over':'Normal',screen:'Screen',lighter:'Add',multiply:'Multiply',difference:'Difference',overlay:'Overlay'}[m]]),value:g.blend,property:'layerBlend',onChange:v=>edit((p,l)=>{l.blend=v;},'Layer blend')}));
  section(root).append(el('p','insp-note','Tip: select a node, then click a Deformer, Color, Style or Post FX node in the library to insert it right after.'));
  updateHint();
}
function updateHint(){const n=graph().nodes.find(n=>n.id===selected);$('selectionHint').textContent=n?`${TYPES[n.type].label} selected · library clicks insert after it`:`${graph().name}`;}
function renderLayers(){
  $('layers').replaceChildren();
  for(const g of state.layers){
    const tab=el('div','layer-tab'+(g.id===active?' active':''));tab.setAttribute('role','tab');tab.dataset.id=g.id;
    const vis=el('input','layer-vis');vis.type='checkbox';vis.checked=g.visible;vis.title='Show layer';vis.setAttribute('aria-label',`Show ${g.name}`);
    vis.onclick=e=>e.stopPropagation();vis.onchange=()=>edit(p=>{p.layers.find(l=>l.id===g.id).visible=vis.checked;},'Layer visibility');
    const name=el('span','layer-name',g.name),x=el('button','layer-x','×');x.type='button';x.title='Delete layer';x.hidden=state.layers.length===1;
    x.onclick=e=>{e.stopPropagation();edit(p=>{p.layers=p.layers.filter(l=>l.id!==g.id);},'Deleted layer');};
    tab.append(vis,name,x);tab.onclick=()=>{if(active!==g.id){active=g.id;selected=null;pending=null;renderUI();fit();}};
    $('layers').append(tab);
  }
  $('addLayer').disabled=state.layers.length>=LIMITS.layers||state.layers.flatMap(g=>g.nodes).filter(n=>isEngine(n.type)).length>=LIMITS.emitters;
}
function renderUI(){renderGraph();renderProperties();renderLayers();$('undo').disabled=!history.length;$('redo').disabled=!future.length;}

// ---------- templates ----------
function chain(name,specs,extra){
  const g={id:crypto.randomUUID(),name,visible:true,opacity:1,blend:'screen',nodes:[],edges:[]};let prev=null,x=40;
  for(const [type,props] of specs){
    const n=node(type,x,80,props);g.nodes.push(n);x+=210;
    if(prev){const out=Object.keys(TYPES[prev.type].outputs)[0],inp=Object.keys(TYPES[type].inputs)[0];g.edges.push({from:prev.id,out,to:n.id,input:inp});}
    prev=n;
  }
  extra?.(g);return g;
}
const drive=(g,ctrlType,ctrlProps,targetType,input,y=300)=>{const t=g.nodes.find(n=>n.type===targetType),c=node(ctrlType,t.x,y,ctrlProps);g.nodes.push(c);g.edges.push({from:c.id,out:'value',to:t.id,input});};
const E=mode=>[Object.keys(MODES).find(t=>MODES[t].some(m=>m[0]===mode)),{mode}];
// Wire one of the layer's Audio node numbers into a knob.
const audioTo=(g,out,targetType,input,via)=>{const a=g.nodes.find(n=>n.type==='audioIn'),t=g.nodes.find(n=>n.type===targetType);
  if(via){const s=node(via[0],a.x+210,300,via[1]);g.nodes.push(s);g.edges.push({from:a.id,out,to:s.id,input:'value'},{from:s.id,out:'value',to:t.id,input});}
  else g.edges.push({from:a.id,out,to:t.id,input});};
const TEMPLATES={
  'Fluid bloom':()=>[chain('Fluid',[['audioIn',{}],E('simfluid'),['bloom',{}],['output',{}]])],
  'Kaleido spectrum':()=>[chain('Kaleido',[['audioIn',{}],E('circle'),['twist',{amount:35}],['symmetry',{mode:'r6'}],['palette',{c1:'#10002b',c2:'#ff00e5',c3:'#00f0ff',c4:'#b6ff00'}],['bloom',{bloom:45}],['output',{}]],g=>drive(g,'oscillator',{rate:.1,depth:1,offset:0},'twist','amount'))],
  'Particle storm':()=>[chain('Storm',[['audioIn',{}],E('linear'),['particles',{density:30,trail:20}],['flowField',{curl:60,perlin:20}],['trails',{trails:70}],['output',{}]])],
  'Shattered rings':()=>[chain('Shatter',[['audioIn',{}],E('concentric'),['palette',{c1:'#200000',c2:'#c1121f',c3:'#ff6d00',c4:'#ffd60a'}],['fracture',{}],['output',{}]])],
  'Bass bulge sphere':()=>[chain('Sphere',[['audioIn',{}],E('sphere'),['bulge',{amount:0}],['palette',{c1:'#0b132b',c2:'#5bc0be',c3:'#a9def9',c4:'#ffffff'}],['hue',{hue:0,cycle:20}],['output',{}]],g=>{g.nodes.find(n=>n.type==='audioIn').props.gain=2;audioTo(g,'bass','bulge','amount',['smooth',{attack:10,release:250}]);})],
  'Beat kaleidoscope':()=>[chain('Beat',[['audioIn',{}],E('phyllotaxis'),['lines',{thick:3,height:140}],['ripple',{amount:0}],['palette',{c1:'#03001c',c2:'#7b2cbf',c3:'#ff4d6d',c4:'#ffd166'}],['kaleido',{kaleido:70}],['bloom',{bloom:50}],['output',{}]],g=>{g.nodes.find(n=>n.type==='audioIn').props.decay=400;audioTo(g,'beat','ripple','amount');})],
  'Ferro pulse':()=>[chain('Ferro',[['audioIn',{}],E('simferro'),['grade',{contrast:30,saturation:20}],['lens',{chroma:40,vignette:60}],['output',{}]])],
  'Flocking trails':()=>[chain('Boids',[['audioIn',{}],E('simboids'),['hue',{hue:0,cycle:25}],['trails',{trails:80}],['bloom',{bloom:40}],['output',{}]])],
  'Glowing DNA':()=>[chain('DNA',[['audioIn',{}],E('dna'),['palette',{c1:'#001219',c2:'#0a9396',c3:'#94d2bd',c4:'#e9d8a6'}],['bloom',{bloom:55}],['output',{}]])],
  'Drifting terrain':()=>[chain('Terrain',[['audioIn',{}],E('terrain'),['transform',{tilt:0}],['wave',{amount:20}],['palette',{c1:'#0d1b2a',c2:'#1b998b',c3:'#c5d86d',c4:'#f4f1de'}],['output',{}]],g=>drive(g,'oscillator',{rate:.05,depth:.4,offset:0},'transform','tilt'))],
  'Glitch sand':()=>[chain('Sand',[['audioIn',{}],E('simsand'),['lens',{chroma:70,scanlines:40,vignette:30}],['fracture',{}],['output',{}]])],
  'Webcam mirror':()=>[chain('Mirror',[['audioIn',{}],E('circle'),['webcam',{displace:60}],['symmetry',{mode:'x',mirror:true}],['bloom',{bloom:45}],['output',{}]])],
  'Two layers':()=>[chain('Smoke',[['audioIn',{}],E('simsmoke'),['grade',{saturation:60}],['output',{}]]),chain('Spiral',[['audioIn',{}],E('spiral'),['symmetry',{mode:'x'}],['hue',{cycle:30}],['output',{}]])]
};
function loadTemplate(name){
  const layers=TEMPLATES[name]();layers.forEach((g,i)=>{if(i===0)g.blend='source-over';});
  importProject({format:'audiograph-pro',version:VERSION,layers},`Template: ${name}`);
}

// ---------- record / fullscreen ----------
let recorder=null,chunks=[];
function toggleRecord(){
  if(recorder){recorder.stop();return;}
  const stream=preview.captureStream(30);
  if(audio.dest)for(const t of audio.dest.stream.getAudioTracks())stream.addTrack(t);
  const type=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4'].find(t=>MediaRecorder.isTypeSupported(t));
  recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:12e6});chunks=[];
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  recorder.onstop=()=>{const blob=new Blob(chunks,{type:recorder.mimeType}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=`audiograph-pro-${Date.now()}.${type.includes('mp4')?'mp4':'webm'}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);recorder=null;$('record').classList.remove('on');$('record').textContent='Rec';message('Recording saved');};
  recorder.start(500);$('record').classList.add('on');$('record').textContent='Stop rec';message('Recording… press Stop rec to save');
}
function toggleFullscreen(){if(document.fullscreenElement)document.exitFullscreen();else $('previewWrap').requestFullscreen?.().catch(e=>message(e.message,true));}

// ---------- wiring ----------
// The source label opens the active layer's Audio node (adding one, wired to its emitters, if needed).
$('audioName').onclick=()=>{
  const a=graph().nodes.find(n=>n.type==='audioIn');if(a){selected=a.id;renderUI();return;}
  let id=null;edit((p,g)=>{const e=g.nodes.filter(n=>isEngine(n.type)),x=Math.min(...g.nodes.map(n=>n.x),40)-210,n=node('audioIn',x,e[0]?.y??70);g.nodes.push(n);id=n.id;
    for(const m of e)if(!g.edges.some(w=>w.to===m.id&&w.input==='audio'))g.edges.push({from:n.id,out:'audio',to:m.id,input:'audio'});},'Added Audio');
  if(id){selected=id;renderUI();}
};
$('play').onclick=()=>play().catch(e=>message(e.message,true));
$('stop').onclick=()=>{stopAudio();stopLive();updateAudioUI();message('Audio stopped');};
$('record').onclick=()=>attempt(toggleRecord);
// With a Corner pin selected, its corners can be dragged directly on the preview.
const PIN_KEYS=[['tlx','tly',0,0],['trx','try',100,0],['brx','bry',100,100],['blx','bly',0,100]];
function pinNode(){const n=graph().nodes.find(n=>n.id===selected);return n?.type==='cornerPin'?n:null;}
function previewPoint(ev){const r=preview.getBoundingClientRect();return [(ev.clientX-r.left)/r.width*100,(ev.clientY-r.top)/r.height*100];}
let pinDrag=null;
preview.addEventListener('pointerdown',ev=>{
  const n=pinNode();if(!n)return;const [x,y]=previewPoint(ev),r=preview.getBoundingClientRect();
  let best=-1,dist=Infinity;PIN_KEYS.forEach(([kx,ky,bx,by],i)=>{const d=Math.hypot((bx+n.props[kx]-x)*r.width/100,(by+n.props[ky]-y)*r.height/100);if(d<dist){dist=d;best=i;}});
  if(dist>40)return;pinDrag={id:n.id,i:best};preview.setPointerCapture(ev.pointerId);ev.preventDefault();
});
preview.addEventListener('pointermove',ev=>{
  const n=pinNode();preview.style.cursor=n?'crosshair':'';if(!pinDrag)return;
  const [x,y]=previewPoint(ev),[kx,ky,bx,by]=PIN_KEYS[pinDrag.i],c=v=>Math.round(Math.max(-50,Math.min(50,v))*2)/2;
  live(st=>{const m=st.layers.flatMap(g=>g.nodes).find(m=>m.id===pinDrag.id);if(m){m.props[kx]=c(x-bx);m.props[ky]=c(y-by);}});
});
const endPin=()=>{if(pinDrag){pinDrag=null;liveCommit('Moved corner');}};
preview.addEventListener('pointerup',endPin);preview.addEventListener('pointercancel',endPin);

// Output window for a projector / second display: mirrors the preview as a live stream.
let outWin=null;
$('output').onclick=()=>{
  if(outWin&&!outWin.closed){outWin.focus();return;}
  outWin=window.open('','audiograph-pro-output','popup,width=960,height=540');
  if(!outWin)return message('Allow pop-ups to open the output window',true);
  const d=outWin.document;d.title='Audiograph Pro · Output';
  d.body.style.cssText='margin:0;background:#000;overflow:hidden;cursor:none';d.body.replaceChildren();
  const v=d.createElement('video');v.muted=true;v.autoplay=true;v.playsInline=true;v.style.cssText='width:100vw;height:100vh;object-fit:contain;display:block';
  v.srcObject=preview.captureStream(60);d.body.append(v);v.play().catch(()=>{});
  v.ondblclick=()=>d.fullscreenElement?d.exitFullscreen():d.documentElement.requestFullscreen().catch(()=>{});
  outWin.addEventListener('pagehide',()=>{v.srcObject?.getTracks().forEach(t=>t.stop());outWin=null;});
  message('Output window open · move it to the projector and double-click for fullscreen');
};
addEventListener('pagehide',()=>{if(outWin&&!outWin.closed)outWin.close();});
$('snap').onclick=()=>preview.toBlob(blob=>{if(!blob)return message('Snapshot failed',true);const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=`audiograph-pro-${Date.now()}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);message('Snapshot saved');},'image/png');
$('fullscreen').onclick=toggleFullscreen;
$('pause').onclick=()=>{paused=!paused;lastTime=0;$('pause').textContent=paused?'Resume':'Pause';$('pause').classList.toggle('on',paused);message(paused?'Visuals paused':'Visuals resumed');};
$('undo').onclick=undo;$('redo').onclick=redo;$('addLayer').onclick=addLayer;
for(const name of Object.keys(TEMPLATES)){const o=el('option','',name);o.value=name;$('templates').append(o);}
$('templates').onchange=()=>{const v=$('templates').value;$('templates').value='';if(v)attempt(()=>loadTemplate(v));};
$('save').onclick=()=>attempt(()=>{localStorage.setItem('audiograph-pro-v2',JSON.stringify(validate(state)));message('Saved in this browser (media files are not stored)');});
$('restore').onclick=()=>attempt(()=>{const raw=localStorage.getItem('audiograph-pro-v2')||localStorage.getItem('audiograph-pro-v1');if(!raw)throw Error('Nothing saved in this browser yet');importProject(JSON.parse(raw),'Restored saved project');});
$('export').onclick=()=>attempt(()=>{const blob=new Blob([JSON.stringify(validate(state),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='audiograph-pro.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message('Exported project JSON');});
$('import').onchange=async()=>{try{const file=$('import').files[0];if(!file)return;if(file.size>1024*1024)throw Error('Project JSON limit is 1 MB');importProject(JSON.parse(await file.text()));}catch(error){message('Import: '+error.message,true);}finally{$('import').value='';}};
$('helpBody').innerHTML=`
<p>Build visuals by chaining nodes. Every graph is one <b>layer</b>; layers stack in the preview using each layer's blend mode.</p>
<p><b>Inputs</b> are what you bring in: the <b>Audio</b> source, an Image, Video, Camera, Text, 3D Object or Gaussian Splat. <b>Waveforms</b> are audio-reactive line patterns (2D and 3D). <b>Emitters</b> are particles: classic Particles / Flow field and the native WebGPU simulations. Every visual input, waveform and emitter has a <span style="color:${PORT_COLORS.shape}">shape</span> output that flows through <b>Geometry</b>, <b>Deformer</b>, <b>Color</b> and <b>Style</b> nodes, which change how it draws. <b>Post FX</b> nodes process the finished <span style="color:${PORT_COLORS.image}">image</span>. End every chain in <b>Output</b>.</p>
<p><b>Quick build:</b> select a node, then click a node in the library. It is inserted right after the selection.</p>
<p><b>Drive any knob:</b> drag from a <span style="color:${PORT_COLORS.number}">number</span> output (Audio bass / beat, LFO, Random, Camera motion…) onto a node and pick the knob. 0 keeps the knob setting, 1 pushes it to the maximum.</p>
<p><b>Audio:</b> select an <b>Audio</b> node (or click the source name in the transport) to load a file, use the Mic or System audio. Without audio, a demo beat plays. Its <span style="color:${PORT_COLORS.audio}">audio</span> wire feeds emitters; put an <b>Audio EQ</b> in the wire to reshape what one emitter hears. Connecting a number to an emitter's <b>drive</b> replaces the music for that emitter.</p>
<p><b>Graph:</b> drag empty space to pan, wheel to zoom, click a wire to delete it, Delete removes the selected node (the chain heals), press and hold a node's title (or Alt-drag) to pull it out of its chain, <b>Tab</b> over the graph searches every node and drops it at the cursor (over a wire it is inserted into the wire), ⌘Z / ⇧⌘Z undo and redo. <b>Space</b> pauses, <b>F</b> goes fullscreen.</p>
<p>Not in Pro (use the original Audiograph): projection mapping, AI Look, autopilot and morphing. Webcam is also a Deformer node.</p>`;
$('helpButton').onclick=()=>$('help').showModal();$('closeHelp').onclick=()=>$('help').close();
const viewport=$('graphViewport');
viewport.ondragover=e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';};
viewport.addEventListener('pointermove',e=>{pointer.x=e.clientX;pointer.y=e.clientY;pointer.inGraph=true;});
viewport.addEventListener('pointerleave',()=>{pointer.inGraph=false;});
viewport.ondrop=e=>{e.preventDefault();let d;try{d=JSON.parse(e.dataTransfer.getData('application/audiograph-node'));}catch{return;}if(!Object.hasOwn(TYPES,d?.type))return;const r=viewport.getBoundingClientRect();addNode(d.type,(e.clientX-r.left-view.x)/view.zoom-84,(e.clientY-r.top-view.y)/view.zoom-20,d.props||{});};
viewport.onpointerdown=event=>{
  if(event.target.closest('.node')||event.target.closest('.wire')||event.button!==0)return;
  viewport.focus();if(pending){pending=null;renderGraph();}
  if(selected){selected=null;renderProperties();document.querySelectorAll('#nodes .node.selected').forEach(x=>x.classList.remove('selected'));}
  const start={x:event.clientX,y:event.clientY,vx:view.x,vy:view.y};viewport.setPointerCapture(event.pointerId);viewport.classList.add('panning');
  const move=e=>{view.x=start.vx+e.clientX-start.x;view.y=start.vy+e.clientY-start.y;applyView();};
  const end=()=>{viewport.classList.remove('panning');viewport.removeEventListener('pointermove',move);viewport.removeEventListener('pointerup',end);viewport.removeEventListener('pointercancel',end);};
  viewport.addEventListener('pointermove',move);viewport.addEventListener('pointerup',end);viewport.addEventListener('pointercancel',end);
};
function zoom(factor,cx=viewport.clientWidth/2,cy=viewport.clientHeight/2){const next=Math.max(.3,Math.min(1.8,view.zoom*factor)),ratio=next/view.zoom;view.x=cx-(cx-view.x)*ratio;view.y=cy-(cy-view.y)*ratio;view.zoom=next;applyView();}
viewport.addEventListener('wheel',e=>{e.preventDefault();const r=viewport.getBoundingClientRect();if(e.ctrlKey||Math.abs(e.deltaY)>=Math.abs(e.deltaX)&&!e.shiftKey)zoom(e.deltaY<0?1.08:1/1.08,e.clientX-r.left,e.clientY-r.top);else{view.x-=e.deltaX;view.y-=e.deltaY;applyView();}},{passive:false});
$('zoomIn').onclick=()=>zoom(1.15);$('zoomOut').onclick=()=>zoom(1/1.15);$('fit').onclick=fit;
document.addEventListener('keydown',e=>{
  if(e.target.closest('input,textarea,select,[contenteditable]')||$('help').open)return;
  const k=e.key.toLowerCase();
  if(e.key==='Tab'&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&(pointer.inGraph||e.target.closest?.('#graphViewport'))){e.preventDefault();openSearch();}
  else if((e.metaKey||e.ctrlKey)&&k==='z'){e.preventDefault();e.shiftKey?redo():undo();}
  else if((e.metaKey||e.ctrlKey)&&k==='y'){e.preventDefault();redo();}
  else if((e.metaKey||e.ctrlKey)&&k==='d'){e.preventDefault();duplicateSelected();}
  else if(e.key==='Delete'||e.key==='Backspace'){if(selected){e.preventDefault();removeSelected();}}
  else if(e.key==='Escape'){closeMenu();if(pending){pending=null;renderGraph();message('Connection cancelled');}}
  else if(e.key===' '&&!e.target.closest('button')){e.preventDefault();$('pause').click();}
  else if(k==='f'&&!e.metaKey&&!e.ctrlKey){toggleFullscreen();}
});
window.addEventListener('resize',()=>requestAnimationFrame(renderWires));
window.addEventListener('pagehide',event=>{
  pageHidden=true;for(const engine of engines.values())engine.dispose();engines.clear();stopAudio();stopLive();
  if(audio.context){const c=audio.context;if(event.persisted)c.suspend().catch(()=>{});else{audio.context=null;c.close().catch(()=>{});}}
});
window.addEventListener('pageshow',()=>{pageHidden=false;lastTime=0;renderUI();if(paused)draw(elapsed);});
setInterval(()=>{
  // Live readout for the selected control node.
  const v=document.querySelector('.live-value');if(!v)return;const n=findNode(v.dataset.node);if(!n)return;
  const out=lastValues.get(n.id);v.textContent=out!==undefined?`Now: ${out.toFixed(3)}`:'Not connected to an Output yet';
},200);
window.pro={
  getProject:()=>clone(state),validate,importProject,addNode,addLayer,connect:connection,undo,redo,loadTemplate,templates:Object.keys(TEMPLATES),
  select:id=>{selected=id;renderUI();},selectLayer:id=>{if(!state.layers.some(g=>g.id===id))throw Error('Missing layer');active=id;selected=null;renderUI();},
  setProperty:(id,key,value)=>edit((p,g)=>{const n=g.nodes.find(n=>n.id===id);if(!n)throw Error('Missing node');if(isEngine(n.type)&&(key==='mode'||key==='render'))setMode(g,n,value,key);else n.props[key]=value;},'Updated node property'),
  stats:()=>({frame,paused,active,selected,errors:[...renderErrors],bands:{...A.bands},beat:A.beat,live:A.live,audio:{state:audio.context?.state||null,monitor:audio.monitor?.gain.value??null,input:audio.source?"file":audio.live?.kind||null},engines:Object.fromEntries([...engines].map(([id,e])=>[id,e.stats()]))}),
  draw:()=>draw(elapsed),engine:id=>engines.get(id),value:id=>lastValues.get(id),pixels:()=>{const d=previewCtx.getImageData(0,0,WIDTH,HEIGHT).data;let s=0;for(let i=0;i<d.length;i+=16)s+=d[i]+d[i+1]+d[i+2];return s/(d.length/16)/3;}
};
reconcile();renderLibrary();renderUI();requestAnimationFrame(()=>{fit();if(graph().nodes[0]){selected=graph().nodes.find(n=>isEngine(n.type))?.id||null;renderUI();}});
requestAnimationFrame(loop);
