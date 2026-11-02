// AI nodes: stream frames to a local diffusion bridge (ai/bridge.py) and get restyled frames back.
// One WebSocket per server URL; each AI Render node keeps one frame in flight and shows the newest result.
export const AI_DEFAULT_URL='ws://127.0.0.1:7861';
export const AI_MODELS=[['sd-turbo','SD-Turbo'],['sdxl-turbo','SDXL-Turbo'],['lcm','SD 1.5 + LCM']];
const clients=new Map();

class Client{
  constructor(url){this.url=url;this.state='offline';this.info=null;this.note='';this.ws=null;this.waiting=new Map();this.retryAt=0;this.usedAt=0;this.lastMs=0;}
  use(){this.usedAt=performance.now();if(!this.ws&&this.usedAt>=this.retryAt)this.open();}
  open(){
    let ws;try{ws=new WebSocket(this.url);}catch(e){this.fail('Bad server address');return;}
    this.ws=ws;this.state='connecting';
    ws.onopen=()=>{this.state='connected';this.note='';ws.send(JSON.stringify({type:'hello'}));};
    ws.onmessage=ev=>{let m;try{m=JSON.parse(ev.data);}catch{return;}
      if(m.type==='info')this.info=m;
      else if(m.type==='status'){this.note=m.state==='loading'?(m.message||'Loading '+m.model+'…'):'';if(m.state==='ready'&&this.info)for(const x of this.info.models||[])if(x.id===m.model)x.loaded=true;}
      else if(m.type==='result'||m.type==='error'){const w=this.waiting.get(m.id);if(m.type==='error')this.note=m.message;if(w){this.waiting.delete(m.id);m.type==='result'?(this.note='',this.lastMs=m.ms||0,w.ok(m)):w.no(Error(m.message));}}
    };
    ws.onclose=()=>{if(this.ws!==ws)return;this.ws=null;for(const w of this.waiting.values())w.no(Error('Disconnected'));this.waiting.clear();this.fail(this.state==='connected'?'Disconnected':'Not running');};
    ws.onerror=()=>{};
  }
  fail(note){this.state='offline';this.note=note;this.retryAt=performance.now()+3000;}
  send(msg){
    if(this.state!=='connected')return Promise.reject(Error('offline'));
    return new Promise((ok,no)=>{this.waiting.set(msg.id,{ok,no});try{this.ws.send(JSON.stringify(msg));}catch(e){this.waiting.delete(msg.id);no(e);}});
  }
}
export function aiClient(url){url=(url||AI_DEFAULT_URL).trim();let c=clients.get(url);if(!c){c=new Client(url);clients.set(url,c);}return c;}

// Human status line for a server (inspector + node hint).
export function aiStatus(url,model){
  const c=aiClient(url);
  if(c.state==='connecting')return 'Connecting to '+c.url+'…';
  if(c.state!=='connected')return (c.note?c.note+' — ':'')+'start the AI bridge (ai/start.command), then it connects by itself.';
  const m=c.info?.models?.find(x=>x.id===model),dev=c.info?.mock?'mock mode (no model)':c.info?.device||'';
  if(c.note)return c.note;
  return `Connected · ${dev}${m?` · ${m.label}${m.loaded?'':' (loads on first frame)'}`:''}${c.lastMs?` · ${Math.round(c.lastMs)} ms/frame`:''}`;
}

let nextId=1;
const scratch=document.createElement('canvas'),sctx=scratch.getContext('2d');
// Runs every frame for an AI Render node; returns the newest AI picture (or null until the first arrives).
export function aiRender(st,src,job){
  const c=aiClient(job.url);c.use();
  if(!st.busy&&c.state==='connected'&&src&&src.width){
    const k=job.size/Math.max(src.width,src.height),w=Math.max(64,Math.round(src.width*k/8)*8),h=Math.max(64,Math.round(src.height*k/8)*8);
    if(scratch.width!==w||scratch.height!==h){scratch.width=w;scratch.height=h;}
    sctx.drawImage(src,0,0,w,h);
    const id=nextId++;st.busy=true;st.sentAt=performance.now();
    c.send({type:'frame',id,model:job.model,prompt:job.prompt,negative:job.negative,prompt2:job.prompt2,mix:job.mix,strength:job.strength,steps:job.steps,seed:job.seed,guidance:job.guidance,size:job.size,control:job.control,image:scratch.toDataURL('image/jpeg',.82)})
      .then(m=>{const img=new Image();img.onload=()=>{st.prev=st.img;st.img=img;st.at=performance.now();st.busy=false;st.frames=(st.frames||0)+1;};img.onerror=()=>{st.busy=false;};img.src=m.image;})
      .catch(()=>{st.busy=false;});
  }
  // A stuck request (server died mid-frame) frees the slot after 20 s.
  if(st.busy&&performance.now()-st.sentAt>20000)st.busy=false;
  // Offline: drop the held AI picture so the source shows through.
  if(c.state!=='connected'){st.img=null;st.acc=null;}
  return st.img||null;
}
