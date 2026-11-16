// Phone remote link. No server: the studio makes a WebRTC offer and shows it as a QR code (a link to remote.html);
// the phone answers with a short code that goes back by paste (or the webcam reads its QR). Same-computer remotes
// use a BroadcastChannel instead. SDPs are cut down to what a data channel needs so the codes stay small.
export const CHANNEL='audiograph-remote';
const ICE=[{urls:'stun:stun.l.google.com:19302'}];
const b64=u=>btoa(String.fromCharCode(...u)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
// ICE ufrag/pwd may hold '+' and '/', which URLs mangle ('+' reads as a space), so codes carry '-' and '_' instead.
const safe=t=>t.replace(/\+/g,'-').replace(/\//g,'_'),unsafe=t=>t.replace(/[- ]/g,'+').replace(/_/g,'/');

// ufrag~pwd~fingerprint~candidates; a candidate is h|s, address and port.
export function packSdp(sdp){
  const g=re=>(sdp.match(re)||[])[1],uf=g(/a=ice-ufrag:(\S+)/),pw=g(/a=ice-pwd:(\S+)/),fp=sdp.match(/a=fingerprint:(\S+) (\S+)/);
  if(!uf||!pw||!fp)throw Error('Incomplete session description');
  const seen=new Set(),cs=[];
  for(const m of sdp.matchAll(/a=candidate:\S+ 1 udp \d+ (\S+) (\d+) typ (host|srflx)/gi)){const k=m[1]+':'+m[2];if(seen.has(k))continue;seen.add(k);cs.push((m[3]==='host'?'h':'s')+m[1]+'_'+m[2]);}
  if(!cs.length)throw Error('No network route found');
  const alg=fp[1].toLowerCase()==='sha-256'?'':fp[1]+'!';
  return [safe(uf),safe(pw),alg+b64(fp[2].split(':').map(h=>parseInt(h,16))),cs.slice(0,6).join(',')].join('~');
}
export function unpackSdp(code,type){
  let [uf,pw,f,c]=String(code).trim().split('~');if(!uf||!pw||!f||!c)throw Error('That code is not a remote code');uf=unsafe(uf);pw=unsafe(pw);
  const [alg,fh]=f.includes('!')?f.split('!'):['sha-256',f],fp=[...unb64(fh)].map(x=>x.toString(16).padStart(2,'0').toUpperCase()).join(':');
  const cand=c.split(',').map((x,i)=>{const host=x[0]==='h',[a,p]=x.slice(1).split('_');return `a=candidate:${i+1} 1 udp ${(host?2122260223:1686052607)-i} ${a} ${p} typ ${host?'host':'srflx raddr 0.0.0.0 rport 0'}`;});
  return {type,sdp:['v=0','o=- 1 2 IN IP4 127.0.0.1','s=-','t=0 0','a=group:BUNDLE 0','a=msid-semantic: WMS','m=application 9 UDP/DTLS/SCTP webrtc-datachannel','c=IN IP4 0.0.0.0',...cand,
    `a=ice-ufrag:${uf}`,`a=ice-pwd:${pw}`,'a=ice-options:trickle',`a=fingerprint:${alg} ${fp}`,`a=setup:${type==='offer'?'actpass':'active'}`,'a=mid:0','a=sctp-port:5000','a=max-message-size:262144',''].join('\r\n')};
}
const gathered=pc=>new Promise(ok=>{if(pc.iceGatheringState==='complete')return ok();const t=setTimeout(ok,4000);pc.addEventListener('icegatheringstatechange',()=>{if(pc.iceGatheringState==='complete'){clearTimeout(t);ok();}});});

// A link: send(obj), onmessage(obj), onstate(open|closed), close().
class Link{constructor(){this.open=false;this.onmessage=null;this.onstate=null;}
  wire(dc){this.dc=dc;dc.onopen=()=>{this.open=true;this.onstate?.('open');};dc.onclose=()=>{this.open=false;this.onstate?.('closed');};dc.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch{return;}this.onmessage?.(m);};}
  send(m){if(this.open)try{this.dc.send(JSON.stringify(m));}catch{}}
  close(){try{this.dc?.close();this.pc?.close();}catch{}this.open=false;}}

// Studio side: an offer code (put it in the remote URL), then accept the phone's answer code.
export async function hostLink(){const L=new Link(),pc=new RTCPeerConnection({iceServers:ICE});L.pc=pc;L.wire(pc.createDataChannel('remote',{ordered:true}));
  await pc.setLocalDescription(await pc.createOffer());await gathered(pc);L.offer=packSdp(pc.localDescription.sdp);
  L.accept=async code=>{await pc.setRemoteDescription(unpackSdp(code,'answer'));};
  pc.onconnectionstatechange=()=>{if(['failed','closed'].includes(pc.connectionState)){L.open=false;L.onstate?.('closed');}};return L;}
// Phone side: answer the studio's offer code; give the returned answer code back to the studio.
export async function joinLink(offer){const L=new Link(),pc=new RTCPeerConnection({iceServers:ICE});L.pc=pc;pc.ondatachannel=e=>L.wire(e.channel);
  await pc.setRemoteDescription(unpackSdp(offer,'offer'));await pc.setLocalDescription(await pc.createAnswer());await gathered(pc);L.answer=packSdp(pc.localDescription.sdp);
  pc.onconnectionstatechange=()=>{if(['failed','closed'].includes(pc.connectionState)){L.open=false;L.onstate?.('closed');}};return L;}
// Same computer: every remote tab and the studio share one channel.
export function localLink(){const L=new Link(),bc=new BroadcastChannel(CHANNEL);L.dc={send:t=>bc.postMessage(t),close:()=>bc.close()};L.open=true;bc.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch{return;}L.onmessage?.(m);};return L;}
