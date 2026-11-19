// Physical lights over USB: Web Serial (Chrome / Edge) sending Adalight frames, which WLED controllers
// and the bundled tools/audiograph-lights.ino sketch understand.
const link={port:null,writer:null,busy:false,error:'',baud:0,last:0,sent:0,name:''};

// Adalight frame: 'Ada', LED count-1 (hi, lo), checksum hi^lo^0x55, then R,G,B per LED.
export function adalight(rgb){
  const count=rgb.length/3,hi=(count-1)>>8&255,lo=(count-1)&255,out=new Uint8Array(6+rgb.length);
  out.set([65,100,97,hi,lo,hi^lo^0x55]);out.set(rgb,6);return out;
}

export const supported=()=>!!navigator.serial;
export function info(){
  if(!supported())return 'This browser has no Web Serial: use Chrome or Edge on a computer.';
  if(link.error)return link.error;
  if(!link.port)return 'Not connected. Plug the controller in by USB and press Connect.';
  return `Connected${link.name?' to '+link.name:''} at ${link.baud} baud, ${link.sent} frames sent.`;
}
export const connected=()=>!!link.writer;

export async function connect(baud=115200){
  if(!supported())throw Error('This browser has no Web Serial: use Chrome or Edge on a computer.');
  await disconnect();
  const port=await navigator.serial.requestPort();
  try{await port.open({baudRate:baud,bufferSize:8192});}catch(e){link.error='Could not open the port (is another app using it?)';throw Error(link.error);}
  const i=port.getInfo?.()||{};
  Object.assign(link,{port,writer:port.writable.getWriter(),baud,error:'',sent:0,busy:false,name:i.usbVendorId?`USB ${i.usbVendorId.toString(16)}:${(i.usbProductId||0).toString(16)}`:''});
  port.addEventListener?.('disconnect',()=>{link.port=link.writer=null;link.error='The controller was unplugged.';});
}
export async function disconnect(){
  const {port,writer}=link;link.port=link.writer=null;link.busy=false;
  try{if(writer){await writer.close().catch(()=>{});writer.releaseLock();}}catch{}
  try{await port?.close();}catch{}
}

// One frame at most every 1/fps, and never while the previous one is still being written.
// Serial carries baud/10 bytes a second, so the rate also drops for long strips.
export function send(rgb,fps=40){
  if(!link.writer||link.busy)return false;
  const now=performance.now(),need=1000*(rgb.length+6)*10/link.baud;
  if(now-link.last<Math.max(1000/fps,need))return false;
  link.last=now;link.busy=true;
  link.writer.write(adalight(rgb)).then(()=>{link.sent++;},e=>{link.error='Lost the controller: '+e.message;link.writer=null;}).finally(()=>{link.busy=false;});
  return true;
}

// Picture → LED colours. Layouts: a strip across the middle, a frame around the edges
// (clockwise from bottom-left, like a TV backlight), or one colour for the whole picture.
// Each LED takes the brightest of the pixels it covers, so thin glowing lines still light it.
const pad=document.createElement('canvas'),pctx=pad.getContext('2d',{willReadFrequently:true});
const lum=(d,k)=>d[k]*.3+d[k+1]*.59+d[k+2]*.11;
function grab(src,W,H,w,h,sy=0,sh=H){pad.width=w;pad.height=h;pctx.clearRect(0,0,w,h);if(src)pctx.drawImage(src,0,sy,W,sh,0,0,w,h);return pctx.getImageData(0,0,w,h).data;}
export function sample(src,W,H,count,layout){
  const out=new Uint8Array(count*3),put=(i,d,k)=>{out[i*3]=d[k];out[i*3+1]=d[k+1];out[i*3+2]=d[k+2];};
  if(layout==='average'){
    // The mean of the brightest pixels: the picture's main colour, not its black background.
    const d=grab(src,W,H,32,18),ks=[];for(let k=0;k<d.length;k+=4)ks.push(k);ks.sort((a,b)=>lum(d,b)-lum(d,a));
    const top=ks.slice(0,Math.max(1,ks.length/12|0)),c=[0,0,0];for(const k of top){c[0]+=d[k];c[1]+=d[k+1];c[2]+=d[k+2];}
    for(let i=0;i<count;i++)out.set(c.map(v=>v/top.length),i*3);return out;
  }
  if(layout==='edges'){
    const w=64,h=36,d=grab(src,W,H,w,h),ring=[],depth=6;
    for(let y=h-1;y>0;y--)ring.push([0,y,1,0]);for(let x=0;x<w-1;x++)ring.push([x,0,0,1]);for(let y=0;y<h-1;y++)ring.push([w-1,y,-1,0]);for(let x=w-1;x>0;x--)ring.push([x,h-1,0,-1]);
    for(let i=0;i<count;i++){const [x,y,dx,dy]=ring[Math.floor(i/count*ring.length)];let best=0,bk=0;
      for(let s=0;s<depth;s++){const k=((y+dy*s)*w+x+dx*s)*4,l=lum(d,k);if(l>=best){best=l;bk=k;}}put(i,d,bk);}
    return out;
  }
  const rows=12,cols=Math.min(count,512),d=grab(src,W,H,cols,rows,H*.3,H*.4);
  for(let i=0;i<count;i++){const x=Math.min(cols-1,Math.floor(i/count*cols));let best=-1,bk=0;for(let y=0;y<rows;y++){const k=(y*cols+x)*4,l=lum(d,k);if(l>best){best=l;bk=k;}}put(i,d,bk);}
  return out;
}

// Smoothing, brightness, sound pumping and a gamma curve (LEDs look washed out without it).
export function shape(rgb,st,p,level){
  if(!st.prev||st.prev.length!==rgb.length)st.prev=new Float32Array(rgb.length);
  const k=1-Math.min(.95,p.smooth/100),gain=p.brightness/100*(1-p.sound/100+p.sound/100*level),out=new Uint8Array(rgb.length);
  for(let i=0;i<rgb.length;i++){st.prev[i]+=(rgb[i]-st.prev[i])*k;out[i]=Math.round(255*Math.pow(Math.min(1,st.prev[i]/255*gain),1.8));}
  return out;
}
