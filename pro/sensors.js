// Non-audio inputs: the computer's load, a clock, mouse & keys, and MIDI. Every value is 0–1.
// Sources start lazily, the first time a node reads them.
const clamp=v=>Math.max(0,Math.min(1,Number.isFinite(v)?v:0));
const ease=(cur,target,dt,k)=>cur+(target-cur)*(1-Math.exp(-dt*k));

// ---------- Computer ----------
// Browser estimates: CPU from the Compute Pressure API and main-thread lag, render load from our own
// frame time, JS memory (Chrome), frame rate, network bandwidth and battery. The optional local helper
// (pro/tools/computer-feed.mjs) reports the real CPU, GPU, memory and network use.
const comp={started:false,pressure:null,lag:0,frameMs:0,fps:30,battery:null,charging:0,helper:null,helperAt:0,helperErr:'',polling:false,port:0,
  out:{cpu:0,gpu:0,memory:0,fps:0,network:0,battery:1}};
const PRESSURE={nominal:.15,fair:.45,serious:.75,critical:1};
function startComputer(){
  if(comp.started)return;comp.started=true;
  try{
    if('PressureObserver' in globalThis){
      const o=new PressureObserver(rec=>{const r=rec[rec.length-1];if(r)comp.pressure=PRESSURE[r.state]??null;});
      o.observe('cpu',{sampleInterval:500}).catch(()=>{});
    }
  }catch{}
  // Main-thread lag: how late a 100 ms timer fires. A busy machine (or tab) fires late.
  let last=performance.now();
  setInterval(()=>{const now=performance.now(),late=Math.max(0,now-last-100);last=now;comp.lag=ease(comp.lag,clamp(late/60),.1,6);},100);
  navigator.getBattery?.().then(b=>{const up=()=>{comp.battery=b.level;comp.charging=b.charging?1:0;};up();b.addEventListener('levelchange',up);b.addEventListener('chargingchange',up);}).catch(()=>{});
}
async function pollHelper(port){
  if(comp.polling)return;comp.polling=true;
  try{
    const r=await fetch(`http://127.0.0.1:${port}/`,{cache:'no-store',signal:AbortSignal.timeout(1500)});
    const d=await r.json();if(!d||typeof d!=='object')throw Error('bad reply');
    comp.helper=d;comp.helperAt=performance.now();comp.helperErr='';
  }catch(e){comp.helperErr=e.name==='TimeoutError'?'no reply':'not running';if(performance.now()-comp.helperAt>3000)comp.helper=null;}
  finally{comp.polling=false;}
}
let lastPoll=0;
export function frameTiming(ms,dt){comp.frameMs=ease(comp.frameMs,ms,dt,4);if(dt>0)comp.fps=ease(comp.fps,1/dt,dt,3);}
export function computer(p,dt){
  startComputer();
  const now=performance.now(),useHelper=p.source==='helper';
  if(useHelper&&now-lastPoll>500){lastPoll=now;pollHelper(p.port);}
  const h=useHelper&&comp.helper,mem=performance.memory;
  const net=navigator.connection?.downlink;
  const target={
    cpu:h&&Number.isFinite(h.cpu)?h.cpu:Math.max(comp.pressure??0,comp.lag),
    gpu:h&&Number.isFinite(h.gpu)?h.gpu:clamp(comp.frameMs/33),
    memory:h&&Number.isFinite(h.memory)?h.memory:mem?mem.usedJSHeapSize/mem.jsHeapSizeLimit:0,
    fps:clamp(comp.fps/60),
    // Network: bytes/s from the helper on a log scale (1 KB/s → 0.2, 100 MB/s → 1), else the link speed.
    network:h&&Number.isFinite(h.net)?Math.log10(1+h.net/1000)/5:net?Math.log10(1+net)/2:0,
    battery:comp.battery??1
  };
  const k=1/Math.max(.02,p.smooth*p.smooth*2);
  for(const key of Object.keys(comp.out))comp.out[key]=clamp(p.smooth<=0?target[key]:ease(comp.out[key],clamp(target[key]),dt,k));
  return comp.out;
}
export function computerStatus(p){
  if(p.source==='helper')return comp.helper?`Local helper connected${comp.helper.gpu==null?' (no GPU reading on this machine)':''}.`:`Local helper ${comp.helperErr||'connecting…'} on port ${p.port}. Using browser estimates until it answers.`;
  const parts=[comp.pressure!=null?'CPU pressure':'CPU from main-thread lag','GPU = render load',performance.memory?'JS memory':'no memory reading (Chrome only)',navigator.connection?'link speed':'no network reading',comp.battery!=null?'battery':'no battery reading'];
  return 'Browser estimates: '+parts.join(', ')+'. Use the local helper for real CPU, GPU, memory and network.';
}

// ---------- Clock ----------
export function clock(p,state,dt){
  const d=new Date(),ms=d.getMilliseconds()/1000,s=d.getSeconds()+ms,m=d.getMinutes()+s/60,h=d.getHours()+m/60;
  state.phase=(state.phase??0)+dt*p.bpm/60;
  const beat=Math.floor(state.phase);if(beat!==state.beat){state.beat=beat;state.pulse=1;}else state.pulse=(state.pulse??0)*Math.exp(-dt*6);
  return {second:s/60,minute:m/60,hour:h/24,day:((d.getDay()+6)%7+h/24)/7,beat:state.phase%1,pulse:state.pulse};
}

// ---------- Mouse & keys ----------
const ptr={started:false,x:.5,y:.5,speed:0,move:0,click:0,keys:0,scroll:0,down:0,lastX:null,lastY:null,lastT:0};
function startPointer(){
  if(ptr.started)return;ptr.started=true;
  addEventListener('pointermove',e=>{
    const t=performance.now();ptr.x=clamp(e.clientX/innerWidth);ptr.y=clamp(e.clientY/innerHeight);
    if(ptr.lastX!=null&&t>ptr.lastT){const d=Math.hypot(e.clientX-ptr.lastX,e.clientY-ptr.lastY)/Math.hypot(innerWidth,innerHeight);ptr.move+=d;}
    ptr.lastX=e.clientX;ptr.lastY=e.clientY;ptr.lastT=t;
  },{passive:true});
  addEventListener('pointerdown',()=>{ptr.click=1;ptr.down=1;},{passive:true});
  addEventListener('pointerup',()=>{ptr.down=0;},{passive:true});
  addEventListener('keydown',e=>{if(!e.repeat)ptr.keys=Math.min(1,ptr.keys+.25);},{passive:true});
  addEventListener('wheel',e=>{ptr.scroll=Math.min(1,ptr.scroll+Math.abs(e.deltaY)/400);},{passive:true});
}
export function pointer(p,dt){
  startPointer();
  // Speed: screen diagonals per second, eased; the pulses decay at the chosen rate.
  ptr.speed=ease(ptr.speed,clamp(ptr.move/Math.max(dt,1/120)/3),dt,8);ptr.move=0;
  const decay=Math.exp(-dt*1000/p.decay);
  const out={x:ptr.x,y:p.flipY?1-ptr.y:ptr.y,speed:ptr.speed,click:ptr.click,held:ptr.down,keys:ptr.keys,scroll:ptr.scroll};
  ptr.click*=decay;ptr.keys*=decay;ptr.scroll*=decay;
  return out;
}

// ---------- MIDI ----------
const midi={access:null,error:'',cc:new Float32Array(16*128),notes:new Float32Array(16*128),lastNote:0,lastVel:0,held:0,learn:null,devices:[],pitch:.5,listeners:new Set()};
function onMidi(e){
  const [st,a=0,b=0]=e.data,type=st&0xf0,ch=st&0x0f;
  if(type===0xb0){midi.cc[ch*128+a]=b/127;if(midi.learn){midi.learn({cc:a,channel:ch+1});midi.learn=null;}}
  else if(type===0x90&&b>0){midi.notes[ch*128+a]=b/127;midi.lastNote=a;midi.lastVel=b/127;midi.held++;midi.lastCh=ch;}
  else if(type===0x80||type===0x90){midi.notes[ch*128+a]=0;midi.held=Math.max(0,midi.held-1);}
  else if(type===0xe0)midi.pitch=((b<<7)|a)/16383;
  for(const f of midi.listeners)f();
}
function hook(access){
  midi.access=access;midi.devices=[];
  for(const input of access.inputs.values()){input.onmidimessage=onMidi;midi.devices.push(input.name||'MIDI input');}
}
export async function connectMidi(){
  if(midi.access)return midi;
  if(!navigator.requestMIDIAccess){midi.error='This browser has no Web MIDI (use Chrome or Edge).';throw Error(midi.error);}
  try{const a=await navigator.requestMIDIAccess();hook(a);a.onstatechange=()=>hook(a);midi.error='';}
  catch(e){midi.error='MIDI access was blocked.';throw Error(midi.error);}
  return midi;
}
// Reconnect without a prompt when the permission was already given.
export function autoMidi(){navigator.permissions?.query({name:'midi'}).then(s=>{if(s.state==='granted')connectMidi().catch(()=>{});}).catch(()=>{});}
export const midiInfo=()=>({connected:!!midi.access,devices:midi.devices,error:midi.error});
export function midiLearn(){return new Promise(res=>{midi.learn=res;});}
export function midiValues(p){
  const chs=p.channel?[p.channel-1]:[...Array(16).keys()];
  let cc=0,note=0;for(const c of chs){cc=Math.max(cc,midi.cc[c*128+p.cc]);note=Math.max(note,p.note<0?0:midi.notes[c*128+p.note]);}
  if(p.note<0)note=midi.held?midi.lastVel:0;
  return {cc,note,gate:(p.note<0?midi.held>0:note>0)?1:0,pitch:midi.lastNote/127,bend:midi.pitch};
}
