// Image, Video and Camera inputs: a picture source drawn into the graph as an image,
// optionally warped by audio, plus numbers (brightness, motion), a palette and a particle emitter.
const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
const hex=c=>'#'+c.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');

// Resolves once a video has a frame on screen (a thumbnail taken earlier is black); gives up after 1.5 s.
export const firstFrame=v=>new Promise(ok=>{const t=setTimeout(ok,1500),done=()=>{clearTimeout(t);ok();};v.requestVideoFrameCallback?v.requestVideoFrameCallback(done):setTimeout(done,150);});
export class Media{
  constructor(kind){this.kind=kind;this.el=null;this.name='';this.thumb='';this.url='';this.prev=null;this.motion=0;this.brightness=0;this.palette=null;this.tPal=-1;this.asset=null;this.tAsset=-1;this.base=null;}
  async load(file){
    const url=URL.createObjectURL(file);let el;
    try{
      if(this.kind==='image'){el=new Image();el.src=url;await el.decode();}
      else{el=document.createElement('video');Object.assign(el,{muted:true,loop:true,playsInline:true,src:url});
        await new Promise((ok,no)=>{el.onloadeddata=ok;el.onerror=()=>no(Error('Could not read that video'));});el.play().catch(()=>{});await firstFrame(el);}
    }catch(e){URL.revokeObjectURL(url);throw Error(this.kind==='image'?'Could not read that image':e.message);}
    this.clear();this.el=el;this.url=url;this.name=file.name;
    const [w,h]=this.size(),s=Math.min(1,160/Math.max(w,h)),t=canvas(Math.max(1,Math.round(w*s)),Math.max(1,Math.round(h*s)));
    t.getContext('2d').drawImage(el,0,0,t.width,t.height);this.thumb=t.toDataURL('image/jpeg',.8);
  }
  stream(s){if(this.el?.srcObject===s)return;const v=document.createElement('video');Object.assign(v,{muted:true,playsInline:true,autoplay:true});v.srcObject=s;v.play().catch(()=>{});this.el=v;}
  clear(){if(this.el?.pause)this.el.pause();if(this.el&&this.kind!=='camera')this.el.removeAttribute('src');if(this.url)URL.revokeObjectURL(this.url);
    this.el=null;this.url='';this.name='';this.thumb='';this.prev=null;this.palette=null;this.asset=null;}
  ready(){const e=this.el;return !!e&&(e instanceof HTMLImageElement?e.complete&&e.naturalWidth>0:e.readyState>=2&&e.videoWidth>0);}
  size(){const e=this.el;return e instanceof HTMLImageElement?[e.naturalWidth,e.naturalHeight]:[e.videoWidth,e.videoHeight];}
}

// Draws the source into ctx (W×H): fit, mirror, then the audio warp (only when sig is given).
export function drawMedia(m,ctx,W,H,p,sig,time){
  ctx.clearRect(0,0,W,H);if(!m.ready())return false;
  if(!m.base||m.base.width!==W||m.base.height!==H)m.base=canvas(W,H);
  const b=m.base.getContext('2d'),[w,h]=m.size(),s=(p.fit==='contain'?Math.min:Math.max)(W/w,H/h),dw=w*s,dh=h*s;
  b.clearRect(0,0,W,H);b.save();if(p.mirror){b.translate(W,0);b.scale(-1,1);}b.drawImage(m.el,(W-dw)/2,(H-dh)/2,dw,dh);b.restore();
  const amt=(p.amount??50)/100,src=m.base;
  if(!sig||p.warp==='none'||amt<=0){ctx.drawImage(src,0,0);return true;}
  const f=sig.freq,band=t=>f[Math.min(f.length-1,Math.floor(Math.pow(t,1.6)*f.length*.7))]/255;
  if(p.warp==='wave'){
    const N=54,sh=H/N;
    for(let i=0;i<N;i++){const e=band(1-i/N),dx=Math.sin(i*.45+time*3)*e*amt*W*.08;ctx.drawImage(src,0,i*sh,W,sh+1,dx,i*sh,W,sh+1);}
  }else if(p.warp==='slices'){
    const N=48,sw=W/N;
    for(let i=0;i<N;i++){const e=band(i/N),k=1+e*amt*.7,dh2=H*k;ctx.drawImage(src,i*sw,0,sw+1,H,i*sw,(H-dh2)/2,sw+1,dh2);}
  }else{
    const bass=sig.bands?.bass??0,pulse=sig.pulse??0,z=1+(bass*.18+pulse*.12)*amt,sx=(Math.random()-.5)*pulse*amt*W*.03,sy=(Math.random()-.5)*pulse*amt*H*.03;
    ctx.drawImage(src,(W-W*z)/2+sx,(H-H*z)/2+sy,W*z,H*z);
  }
  return true;
}

// Brightness / motion every frame from a 32×24 copy; a 4-colour palette twice a second.
const tiny=canvas(32,24),tctx=tiny.getContext('2d',{willReadFrequently:true});
export function analyse(m,img,time){
  tctx.clearRect(0,0,32,24);tctx.drawImage(img,0,0,32,24);
  const d=tctx.getImageData(0,0,32,24).data,g=new Float32Array(768);let sum=0,diff=0;
  for(let i=0;i<768;i++){g[i]=(d[i*4]*.3+d[i*4+1]*.59+d[i*4+2]*.11)/255;sum+=g[i];if(m.prev)diff+=Math.abs(g[i]-m.prev[i]);}
  m.prev=g;m.brightness=sum/768;m.motion+=(Math.min(1,diff/768*12)-m.motion)*.5;
  if(time-m.tPal>.5||time<m.tPal||!m.palette){
    m.tPal=time;const idx=[...g.keys()].sort((a,b)=>g[a]-g[b]),q=[];
    for(let k=0;k<4;k++){const c=[0,0,0],lo=Math.floor(k*192),hi=lo+192;for(let j=lo;j<hi;j++){const o=idx[j]*4;c[0]+=d[o];c[1]+=d[o+1];c[2]+=d[o+2];}q.push(hex(c.map(v=>v/192)));}
    m.palette=q;
  }
}

// Particle emitter points (the original's image emitter format), refreshed ~8× a second for moving pictures.
const samp=canvas(160,90),sctx=samp.getContext('2d',{willReadFrequently:true});
export function emitterAsset(m,img,time,still){
  if(m.asset&&(still||time-m.tAsset<.12)&&time>=m.tAsset)return m.asset;
  m.tAsset=time;const W=img.width,H=img.height,s=Math.min(1,160/Math.max(W,H)),w=Math.max(1,Math.round(W*s)),h=Math.max(1,Math.round(H*s));
  if(samp.width!==w||samp.height!==h){samp.width=w;samp.height=h;}
  sctx.clearRect(0,0,w,h);sctx.drawImage(img,0,0,w,h);
  const data=sctx.getImageData(0,0,w,h).data,cum=new Float64Array(w*h);let total=0;
  for(let i=0;i<cum.length;i++){const o=i*4;total+=(data[o]*.2126+data[o+1]*.7152+data[o+2]*.0722)*data[o+3]/65025;cum[i]=total;}
  if(!total)return m.asset;
  const pts=[],side=Math.max(w,h);let seed=71;const r=()=>(seed=(seed*16807)%2147483647)/2147483647;
  for(let j=0;j<2048;j++){
    const t=r()*total;let lo=0,hi=cum.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(cum[mid]<=t)lo=mid+1;else hi=mid;}
    const x=((lo%w+r())/w*2-1)*w/side,y=((Math.floor(lo/w)+r())/h*2-1)*h/side;
    pts.push(Math.max(-1,Math.min(1,Math.round(x*1e5)/1e5)),Math.max(-1,Math.min(1,Math.round(y*1e5)/1e5)),data[lo*4]/255,data[lo*4+1]/255,data[lo*4+2]/255);
  }
  return m.asset={kind:'image',name:m.name||m.kind,points:pts,frame:true};
}
