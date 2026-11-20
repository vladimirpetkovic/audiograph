// Math and Tech waveforms drawn on a 2D canvas: Fourier Epicycles, Polar Plot, Cellular Automaton (Math), Oscilloscope and
// Radar Sweep (Tech). Each draws in shades of its Color (grey by default) so a Palette after it spreads its whole ramp.
// draw(ctx,W,H,s,p,sig,dt): s is the node's persistent state, p its props, sig the audio signal ({freq,wave,bands,beat,pulse}).
const TAU=Math.PI*2;
const rgbOf=c=>{const h=/^#?([\da-f]{6})$/i.exec(c||'')?.[1]||'ffffff';return [0,2,4].map(o=>parseInt(h.slice(o,o+2),16));};
const tone=(rgb,t)=>`rgb(${rgb.map(v=>Math.round(v*Math.max(0,Math.min(1,t)))).join(',')})`;
const FONT=sz=>`600 ${sz}px "Helvetica Neue", Arial, sans-serif`;
const pad=(v,w)=>String(Math.max(0,Math.round(v))).padStart(w,'0');
const band=(sig,b)=>b==='beat'?(sig.pulse??0):(sig.bands?.[b]??0);
// A fixed-size offscreen canvas kept in the node's state (afterglow, phosphor).
function buffer(s,key,W,H){let c=s[key];if(!c||c.width!==W||c.height!==H){c=document.createElement('canvas');c.width=W;c.height=H;s[key]=c;}return c;}
// Hits: Beats, or a band jumping above its recent level (at most one per 0.15 s).
function hit(s,sig,react,dt){
  if(react==='beat'){if(s._beat===undefined)s._beat=sig.beat;const h=sig.beat!==s._beat;s._beat=sig.beat;return h;}
  const v=band(sig,react);s._avg=(s._avg??v)+(v-(s._avg??v))*Math.min(1,dt*2);s._gap=(s._gap??0)+dt;
  if(v>s._avg*1.3+.06&&s._gap>.15){s._gap=0;return true;}return false;
}
// Spectrum value (0..1) at a position f in 0..1 along a log frequency axis.
const specAt=(sig,f)=>{const F=sig.freq;if(!F?.length)return 0;const n=F.length*.6,i=Math.min(F.length-1,Math.floor(Math.pow(n,Math.max(0,Math.min(1,f)))));return F[i]/255;};
const meter=(ctx,x,y,w,h,v,lw)=>{ctx.lineWidth=lw;ctx.strokeRect(x,y,w,h);ctx.fillRect(x,y,w*Math.max(0,Math.min(1,v)),h);};
const lines=(ctx,arr,x,y,lh)=>arr.forEach((l,i)=>ctx.fillText(l,x,y+i*lh));
// Line style: a dash pattern scaled to the line width (dots are zero-length dashes with round caps).
export const LINE_STYLES=[['solid','Solid'],['dashed','Dashed'],['dotted','Dotted'],['dashdot','Dash-dot'],['long','Long dash']];
export function lineDash(c,style,lw){const u=Math.max(1.5,lw),d=style==='dashed'?[u*5,u*3.5]:style==='dotted'?[0,u*2.6]:style==='dashdot'?[u*7,u*2.6,0,u*2.6]:style==='long'?[u*16,u*6]:[];
  c.setLineDash(d);c.lineCap=d.length?'round':c.lineCap;return d.length>0;}
// Cell / dot shapes, added to a Path2D and filled (rings and crosses keep their holes with the nonzero rule).
export const CELL_SHAPES=[['square','Square'],['dot','Dot'],['ring','Ring'],['cross','Cross']];
export function cellShape(P,shape,x,y,z){const r=z/2,cx=x+r,cy=y+r;
  if(shape==='dot'){P.moveTo(cx+r,cy);P.arc(cx,cy,r,0,TAU);}
  else if(shape==='ring'){P.moveTo(cx+r,cy);P.arc(cx,cy,r,0,TAU);P.moveTo(cx+r*.55,cy);P.arc(cx,cy,r*.55,0,TAU,true);}
  else if(shape==='cross'){const t=z*.28;P.rect(x,cy-t/2,z,t);P.rect(cx-t/2,y,t,cy-t/2-y);P.rect(cx-t/2,cy+t/2,t,y+z-cy-t/2);}
  else P.rect(x,y,z,z);}

// ---------- Fourier Epicycles ----------
// A chain of rotating circles (a Fourier series) whose tip draws a shape. The sound bends each circle's radius by its
// own part of the spectrum, so the drawing breathes and distorts; beats jolt the rotation.
const EPI_SHAPES={
  star:t=>{const u=t/TAU*10,i=Math.floor(u)%10,f=u-Math.floor(u),v=j=>{const a=-Math.PI/2+j*Math.PI/5,r=j%2?.42:1;return [r*Math.cos(a),r*Math.sin(a)];},a=v(i),b=v((i+1)%10);return [a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];},
  heart:t=>[16*Math.sin(t)**3/17,-(13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t))/17],
  infinity:t=>{const d=1+Math.sin(t)**2;return [Math.cos(t)/d,1.4*Math.sin(t)*Math.cos(t)/d];},
  square:t=>{const u=t/TAU*4,i=Math.floor(u)%4,f=u-Math.floor(u),C=[[-1,-1],[1,-1],[1,1],[-1,1]],a=C[i],b=C[(i+1)%4];return [a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];},
  trefoil:t=>[Math.sin(t)+2*Math.sin(2*t),Math.cos(t)-2*Math.cos(2*t)],
};
export const EPI_LIST=[['star','Star'],['heart','Heart'],['infinity','Infinity'],['square','Square'],['trefoil','Trefoil'],['spectrum','Spectrum (live)'],['wave','Waveform (live)']];
const M=256;
function dft(pts,K,byAmp){
  const cs=[];for(let k=-K;k<=K;k++){if(!k)continue;let re=0,im=0;for(let m=0;m<M;m++){const a=-TAU*k*m/M;re+=pts[m][0]*Math.cos(a)-pts[m][1]*Math.sin(a);im+=pts[m][0]*Math.sin(a)+pts[m][1]*Math.cos(a);}cs.push({k,re:re/M,im:im/M,amp:Math.hypot(re,im)/M});}
  cs.sort(byAmp?(a,b)=>b.amp-a.amp:(a,b)=>Math.abs(a.k)-Math.abs(b.k)||b.k-a.k);return cs;
}
function normalise(pts){let cx=0,cy=0;for(const q of pts){cx+=q[0];cy+=q[1];}cx/=pts.length;cy/=pts.length;let r=0;for(const q of pts)r=Math.max(r,Math.hypot(q[0]-cx,q[1]-cy));return pts.map(q=>[(q[0]-cx)/(r||1),(q[1]-cy)/(r||1)]);}
export function epicycles(ctx,W,H,s,p,sig,dt){
  const k=H/1080,rgb=rgbOf(p.color),N=Math.max(2,Math.round(p.circles)),live=p.shape==='spectrum'||p.shape==='wave',K=Math.ceil(N/2)+1;
  if(live){s.lf=(s.lf||0)+dt;}
  if(!live&&s.key!==p.shape+'|'+N){s.key=p.shape+'|'+N;const f=EPI_SHAPES[p.shape]||EPI_SHAPES.star;s.cs=dft(normalise(Array.from({length:M},(_,m)=>f(TAU*m/M))),Math.max(K,N),true).slice(0,N);s.trace=[];}
  if(live&&(!s.cs||s.lf>1/20||s.key!==p.shape+'|'+N)){s.lf=0;const fresh=s.key!==p.shape+'|'+N;s.key=p.shape+'|'+N;
    const w=sig.wave,pts=Array.from({length:M},(_,m)=>{const a=TAU*m/M;let r;if(p.shape==='spectrum'){const f=m<M/2?m/(M/2):(M-m)/(M/2);r=.35+.65*specAt(sig,f);}else{const i=Math.floor(m/M*Math.min(1024,w?.length||1)),e=Math.min(m,M-m)/8;r=.65+.35*Math.max(-1,Math.min(1,(w?.[i]||0)*3))*Math.min(1,e);}return [r*Math.sin(a),-r*Math.cos(a)];});
    const cs=dft(pts,K,false).slice(0,N);if(fresh||!s.cs||s.cs.length!==cs.length)s.cs=cs;else s.cs.forEach((c,i)=>{c.re+=(cs[i].re-c.re)*.5;c.im+=(cs[i].im-c.im)*.5;c.amp=Math.hypot(c.re,c.im);});}
  const cs=s.cs,full=sig.bands?.full??0;
  if(!s.mod||s.mod.length!==cs.length)s.mod=new Float32Array(cs.length);
  for(let j=0;j<cs.length;j++){const v=specAt(sig,.15+.85*j/cs.length);s.mod[j]+=(v-s.mod[j])*Math.min(1,dt*4);}
  let avg=0;for(let j=0;j<cs.length;j++)avg+=s.mod[j];avg/=cs.length||1;
  const mj=j=>Math.max(0,1+wob*(.3*(avg-.3)+.25*(s.mod[j]-avg)/(1+j*.1)));
  if(hit(s,sig,p.react,dt)){s.kick=1;s.th=(s.th||0)+p.jolt/100*.08;}s.kick=Math.max(0,(s.kick||0)-dt*3);
  const om=p.speed*(.35+p.boost/100*Math.min(1.5,full*2.2)),sub=4,dth=TAU*om*dt/sub;
  const S=H*p.size/100/2*(1+.06*s.kick),cx=W/2,cy=H/2,wob=p.wobble/100;
  const tip=th=>{let x=cx,y=cy;for(let j=0;j<cs.length;j++){const c=cs[j],m=mj(j),a=c.k*th;x+=(c.re*Math.cos(a)-c.im*Math.sin(a))*S*m;y+=(c.re*Math.sin(a)+c.im*Math.cos(a))*S*m;}return [x,y];};
  s.trace??=[];s.th??=0;for(let q=0;q<sub;q++){s.th+=dth;s.trace.push([...tip(s.th),s.th]);}
  const keep=TAU*Math.max(.02,p.trail/100);while(s.trace.length>2&&s.th-s.trace[0][2]>keep)s.trace.shift();if(s.trace.length>4000)s.trace.splice(0,s.trace.length-4000);
  // The drawn path: oldest dim, newest bright, in a few grey levels.
  const T=s.trace,G=6,lw=Math.max(.5,p.line*k);ctx.lineWidth=lw;ctx.lineCap='round';ctx.lineJoin='round';lineDash(ctx,p.lineStyle,lw);
  for(let g=0;g<G;g++){ctx.beginPath();let any=false,last=-9;for(let i=1;i<T.length;i++){const age=(s.th-T[i][2])/keep;if(Math.min(G-1,Math.floor((1-age)*G))!==g)continue;if(last!==i-1)ctx.moveTo(T[i-1][0],T[i-1][1]);ctx.lineTo(T[i][0],T[i][1]);last=i;any=true;}
    if(any){ctx.strokeStyle=tone(rgb,.22+.78*(g+1)/G);ctx.stroke();}}
  ctx.setLineDash([]);
  // The circles and their arms.
  if(p.showCircles){let x=cx,y=cy;const arms=[[x,y]];ctx.lineWidth=Math.max(.5,k);ctx.strokeStyle=tone(rgb,.32);ctx.beginPath();
    for(let j=0;j<cs.length;j++){const c=cs[j],m=mj(j),a=c.k*s.th,r=c.amp*S*m;if(r>.6){ctx.moveTo(x+r,y);ctx.arc(x,y,r,0,TAU);}x+=(c.re*Math.cos(a)-c.im*Math.sin(a))*S*m;y+=(c.re*Math.sin(a)+c.im*Math.cos(a))*S*m;arms.push([x,y]);}
    ctx.stroke();ctx.strokeStyle=tone(rgb,.6);ctx.beginPath();arms.forEach(([ax,ay],i)=>i?ctx.lineTo(ax,ay):ctx.moveTo(ax,ay));ctx.stroke();
    ctx.fillStyle=tone(rgb,.6);for(const [ax,ay] of arms.slice(0,24))ctx.fillRect(ax-1.5*k,ay-1.5*k,3*k,3*k);}
  const [tx,ty]=T[T.length-1],col=tone(rgb,1),sz=11*k;ctx.fillStyle=col;ctx.strokeStyle=col;ctx.lineWidth=Math.max(.5,k);
  {const r=8*k;ctx.strokeRect(tx-r,ty-r,r*2,r*2);ctx.beginPath();ctx.moveTo(tx-r*2,ty);ctx.lineTo(tx-r,ty);ctx.moveTo(tx+r,ty);ctx.lineTo(tx+r*2,ty);ctx.moveTo(tx,ty-r*2);ctx.lineTo(tx,ty-r);ctx.moveTo(tx,ty+r);ctx.lineTo(tx,ty+r*2);ctx.stroke();
   ctx.font=FONT(sz);ctx.textAlign='left';ctx.textBaseline='bottom';ctx.fillText(`z = ${((tx-cx)/S).toFixed(3)} ${(cy-ty)/S<0?'−':'+'} ${Math.abs((cy-ty)/S).toFixed(3)}i`,tx+r*2.4,ty-r);}
  if(p.hud){const sz=12*k,m=40*k,lh=sz*1.35;ctx.font=FONT(sz);ctx.textBaseline='top';ctx.textAlign='left';
    lines(ctx,['FOURIER SERIES · EPICYCLES','',`z(t) = Σ cₖ · e^(i·k·ωt)`,`N = ${N}   ω = ${om.toFixed(3)} rev/s`,`θ = ${((s.th/TAU%1)*360).toFixed(1).padStart(5,'0')}°   SHAPE: ${p.shape.toUpperCase()}`],m,m,lh);
    ctx.textAlign='right';lines(ctx,cs.slice(0,6).map(c=>`c${c.k>0?'+':'−'}${Math.abs(c.k)}  ${c.amp.toFixed(3)} ∠ ${(Math.atan2(c.im,c.re)*180/Math.PI).toFixed(1).padStart(6,' ')}°`),W-m,m,lh);
    const lab=({beat:'BEATS',bass:'BASS',mids:'MIDS',high:'HIGHS',full:'LEVEL'})[p.react]||'',y=H-m-sz;ctx.textAlign='left';ctx.fillText('JOLT: '+lab,m,y);meter(ctx,m+ctx.measureText('JOLT: '+lab).width+6*k,y+k,70*k,sz*.8,Math.max(s.kick,band(sig,p.react)),Math.max(.5,k));}
}

// ---------- Polar Plot ----------
// r = f(θ) traced around a polar grid: roses, the superformula, the butterfly curve or the live spectrum. A band of the
// sound bends the curve's parameter, loudness swells it, and echoes keep its last shapes.
export const POLAR_LIST=[['rose','Rose  r = cos(kθ)'],['super','Superformula'],['butterfly','Butterfly'],['cardioid','Limaçon'],['spectrum','Spectrum (live)']];
function polarR(curve,k,th,sig){
  switch(curve){
    case 'rose':return Math.cos(k*th);
    case 'super':{const n1=Math.max(.15,1.6-k*.18),n2=1.2+k*.15,a=Math.abs(Math.cos(k*th/4)),b=Math.abs(Math.sin(k*th/4));return Math.pow(Math.pow(a,n2)+Math.pow(b,n2),-1/n1)*.6;}
    case 'butterfly':return (Math.exp(Math.sin(th))-2*Math.cos(k*th)+Math.pow(Math.sin((2*th-Math.PI)/24),5))/4.4;
    case 'cardioid':return (.5+Math.cos(th)*(.4+k*.07)+.15*Math.cos(k*th))/1.2;
    default:{const t=((th%TAU)+TAU)%TAU,f=t<Math.PI?t/Math.PI:(TAU-t)/Math.PI;return .2+.8*specAt(sig,f);}
  }
}
const polarSpan=(curve,k,cycles)=>curve==='butterfly'?TAU*6*cycles:curve==='spectrum'||curve==='cardioid'?TAU:TAU*(Number.isInteger(Math.round(k*100)/100)?1:cycles);
const polarEq=(c,k)=>({rose:`r(θ) = cos(${k.toFixed(2)}·θ)`,super:`r(θ) = (|cos(${k.toFixed(2)}θ/4)|ⁿ² + |sin(${k.toFixed(2)}θ/4)|ⁿ²)^(−1/n₁)`,butterfly:`r(θ) = e^sinθ − 2cos(${k.toFixed(2)}θ) + sin⁵((2θ − π)/24)`,cardioid:`r(θ) = 0.5 + ${(.4+k*.07).toFixed(2)}cosθ + 0.15cos(${k.toFixed(2)}θ)`,spectrum:'r(θ) = |X(f(θ))|  ·  LOG FREQUENCY'})[c];
export function polarPlot(ctx,W,H,s,p,sig,dt){
  const k=H/1080,rgb=rgbOf(p.color),v=band(sig,p.react),full=sig.bands?.full??0;
  s.v=(s.v??0)+(Math.min(1,v*1.6)-(s.v??0))*Math.min(1,dt*4);s.rot=(s.rot||0)+dt*p.spin*Math.PI/180;s.t=(s.t||0)+dt;
  if(hit(s,sig,p.react==='beat'?'beat':p.react,dt))s.kick=1;s.kick=Math.max(0,(s.kick||0)-dt*3);
  const kk=p.petals*(1+p.morph/100*s.v*.6),amp=1+p.swell/100*Math.min(1.2,full*1.5)*.5+s.kick*.05,R=H*p.size/100/2,cx=W/2,cy=H/2,n=1400;
  const curve=th=>polarR(p.curve,kk,th,sig);
  const span=polarSpan(p.curve,kk,p.cycles),pts=new Float32Array(n*2);let rmax=0;
  for(let i=0;i<n;i++){const th=span*i/(n-1),r=curve(th);rmax=Math.max(rmax,Math.abs(r));pts[i*2]=r*Math.cos(th);pts[i*2+1]=r*Math.sin(th);}
  const norm=rmax>1.05?1/rmax:1;
  // Echoes: the last few curves, older ones dimmer and lagging in the spin.
  s.hist??=[];s.he=(s.he||0)+dt;if(s.he>.07){s.he=0;s.hist.unshift({pts,amp,norm,rot:s.rot});}s.hist.length=Math.min(s.hist.length,Math.max(0,p.echoes|0));
  const lw=Math.max(.5,p.line*k);ctx.lineCap='round';ctx.lineJoin='round';
  if(p.grid){ctx.strokeStyle=tone(rgb,.28);ctx.fillStyle=tone(rgb,.5);ctx.lineWidth=Math.max(.5,k);ctx.beginPath();
    for(const f of [.25,.5,.75,1]){ctx.moveTo(cx+R*f,cy);ctx.arc(cx,cy,R*f,0,TAU);}
    for(let a=0;a<360;a+=30){const t=a*Math.PI/180;ctx.moveTo(cx,cy);ctx.lineTo(cx+R*1.04*Math.cos(t),cy-R*1.04*Math.sin(t));}ctx.stroke();
    ctx.font=FONT(10*k);ctx.textAlign='center';ctx.textBaseline='middle';for(let a=0;a<360;a+=30){const t=a*Math.PI/180;ctx.fillText(a+'°',cx+R*1.1*Math.cos(t),cy-R*1.1*Math.sin(t));}
    ctx.textAlign='left';ctx.textBaseline='bottom';for(const f of [.25,.5,.75,1])ctx.fillText(f.toFixed(2),cx+R*f+3*k,cy-2*k);}
  const plot=(P,a,nm,rot,t)=>{ctx.beginPath();const c=Math.cos(rot),sn=Math.sin(rot);for(let i=0;i<n;i++){const x=P[i*2]*nm*a,y=P[i*2+1]*nm*a,X=cx+(x*c-y*sn)*R,Y=cy-(x*sn+y*c)*R;i?ctx.lineTo(X,Y):ctx.moveTo(X,Y);}ctx.strokeStyle=tone(rgb,t);lineDash(ctx,p.lineStyle,ctx.lineWidth);ctx.stroke();ctx.setLineDash([]);};
  ctx.lineWidth=lw;for(let e=s.hist.length-1;e>=1;e--){const h=s.hist[e];plot(h.pts,h.amp,h.norm,h.rot,.2+.55*(1-e/(s.hist.length+1)));}
  ctx.lineWidth=lw*1.4;plot(pts,amp,norm,s.rot,1);
  // Tracer: a point running along the curve with its r and θ.
  const ti=Math.floor((s.t*.12%1)*n),c=Math.cos(s.rot),sn=Math.sin(s.rot),x=pts[ti*2]*norm*amp,y=pts[ti*2+1]*norm*amp,X=cx+(x*c-y*sn)*R,Y=cy-(x*sn+y*c)*R,r0=7*k,sz=11*k;
  ctx.strokeStyle=ctx.fillStyle=tone(rgb,1);ctx.lineWidth=Math.max(.5,k);ctx.strokeRect(X-r0,Y-r0,r0*2,r0*2);ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(X,Y);ctx.setLineDash([4*k,4*k]);ctx.stroke();ctx.setLineDash([]);
  ctx.font=FONT(sz);ctx.textAlign='left';ctx.textBaseline='bottom';ctx.fillText(`r ${Math.hypot(x,y).toFixed(3)}`,X+r0*1.6,Y-r0*.2);ctx.textBaseline='top';ctx.fillText(`θ ${(((Math.atan2(y,x)+s.rot)*180/Math.PI%360+360)%360).toFixed(1)}°`,X+r0*1.6,Y+r0*.2);
  if(p.hud){const sz=12*k,m=40*k,lh=sz*1.35;ctx.font=FONT(sz);ctx.textBaseline='top';ctx.textAlign='left';
    lines(ctx,['POLAR PLOT','',polarEq(p.curve,kk),`k = ${kk.toFixed(3)}   θ ∈ [0, ${(span/Math.PI).toFixed(0)}π]`],m,m,lh);
    ctx.textAlign='right';lines(ctx,[`SAMPLES: ${pad(n,5)}`,`ECHOES: ${pad(s.hist.length,2)}`,`SPIN: ${(((s.rot*180/Math.PI)%360+360)%360).toFixed(1).padStart(5,'0')}°`,`SWELL: ${pad(amp*100,3)}%`],W-m,m,lh);
    const lab=({beat:'BEATS',bass:'BASS',mids:'MIDS',high:'HIGHS',full:'LEVEL'})[p.react]||'',yy=H-m-sz;ctx.textAlign='left';ctx.fillText('MORPH: '+lab,m,yy);meter(ctx,m+ctx.measureText('MORPH: '+lab).width+6*k,yy+k,70*k,sz*.8,s.v,Math.max(.5,k));}
}

// ---------- Cellular Automaton ----------
// Conway's Life, Brian's Brain or a 1D rule scrolling up the frame. Loudness sets the step rate, each hit drops a pattern
// (a glider, an R-pentomino…) or switches the 1D rule, and the highs sprinkle live cells. Newborn cells are brightest.
export const CA_LIST=[['life','Life (B3/S23)'],['brain',"Brian's Brain"],['rule','1D rule (scrolling)'],['highlife','HighLife (B36/S23)']];
const PATTERNS=[[[1,0],[2,1],[0,2],[1,2],[2,2]],[[1,0],[2,0],[0,1],[1,1],[1,2]],[[1,0],[3,1],[0,2],[1,2],[4,2],[5,2],[6,2]],[[0,0],[3,0],[4,1],[0,2],[4,2],[1,3],[2,3],[3,3],[4,3]],[[0,0],[1,0],[2,0],[1,1],[0,2],[1,2],[2,2],[0,4],[1,4],[2,4],[1,5],[0,6],[1,6],[2,6]]];
const RULES=[30,110,90,45,73,105,150,54,22,126,60,18];
export function cellular(ctx,W,H,s,p,sig,dt){
  const k=H/1080,rgb=rgbOf(p.color),c=Math.max(3,p.cell*k),cols=Math.max(8,Math.floor(W/c)),rows=Math.max(8,Math.floor(H/c)),N=cols*rows,full=sig.bands?.full??0;
  const key=p.mode+'|'+cols+'x'+rows;
  const seed=()=>{s.A.fill(0);s.age.fill(0);if(p.mode==='rule'){s.rule=p.rule|0;s.head=0;s.A[(rows-1)*cols+(cols>>1)]=1;for(let i=0;i<cols;i++)if(Math.random()<.04)s.A[(rows-1)*cols+i]=1;}
    else for(let i=0;i<N;i++)s.A[i]=Math.random()<(p.mode==='brain'?.12:.22)?1:0;s.gen=0;s.still=0;};
  if(s.key!==key){s.key=key;s.A=new Uint8Array(N);s.B=new Uint8Array(N);s.age=new Uint16Array(N);s.ghost=new Uint8Array(N);seed();}
  const A=s.A,B=s.B,age=s.age,gh=s.ghost;
  const stamp=()=>{if(p.mode==='rule'){s.rule=RULES[(RULES.indexOf(s.rule)+1+Math.floor(Math.random()*3))%RULES.length];return;}
    const P=PATTERNS[Math.floor(Math.random()*PATTERNS.length)],ox=Math.floor(Math.random()*cols),oy=Math.floor(Math.random()*rows),rot=Math.floor(Math.random()*4);
    for(const [x,y] of P){const [a,b]=[[x,y],[-y,x],[-x,-y],[y,-x]][rot],i=((oy+b+rows)%rows)*cols+(ox+a+cols)%cols;A[i]=1;age[i]=0;}};
  if(hit(s,sig,p.react,dt)){const n=1+Math.round(p.inject/100*4);for(let q=0;q<n;q++)stamp();s.flash=1;}s.flash=Math.max(0,(s.flash||0)-dt*3);
  s.acc=(s.acc||0)+dt*p.speed*(.25+p.boost/100*Math.min(1.5,full*2.5));let steps=0;
  while(s.acc>=1&&steps<6){s.acc-=1;steps++;s.gen++;
    if(p.mode==='rule'){const r=s.rule,src=((s.head+rows-1)%rows)*cols,dst=s.head*cols;
      for(let x=0;x<cols;x++){const l=A[src+(x+cols-1)%cols],m=A[src+x],rr=A[src+(x+1)%cols];A[dst+x]=(r>>(l<<2|m<<1|rr))&1;}
      const sp=p.sprinkle/100*Math.min(1,(sig.bands?.high??0)*2)*cols*.05;for(let q=0;q<sp;q++)A[dst+Math.floor(Math.random()*cols)]^=1;s.head=(s.head+1)%rows;}
    else{for(let y=0;y<rows;y++){const ym=((y+rows-1)%rows)*cols,y0=y*cols,yp=((y+1)%rows)*cols;
        for(let x=0;x<cols;x++){const xm=(x+cols-1)%cols,xp=(x+1)%cols,i=y0+x;
          if(p.mode==='brain'){let f=0;if(A[ym+xm]===1)f++;if(A[ym+x]===1)f++;if(A[ym+xp]===1)f++;if(A[y0+xm]===1)f++;if(A[y0+xp]===1)f++;if(A[yp+xm]===1)f++;if(A[yp+x]===1)f++;if(A[yp+xp]===1)f++;
            B[i]=A[i]===1?2:A[i]===2?0:f===2?1:0;}
          else{const nb=A[ym+xm]+A[ym+x]+A[ym+xp]+A[y0+xm]+A[y0+xp]+A[yp+xm]+A[yp+x]+A[yp+xp];B[i]=A[i]?(nb===2||nb===3?1:0):(nb===3||(p.mode==='highlife'&&nb===6)?1:0);}}}
      for(let i=0;i<N;i++){if(B[i]===1)age[i]=A[i]===1?Math.min(65535,age[i]+1):0;else if(!B[i]){if(A[i]===1)gh[i]=255;age[i]=0;}A[i]=B[i];}
      const sp=p.sprinkle/100*Math.min(1,(sig.bands?.high??0)*2)*N*.002;for(let q=0;q<sp;q++){const i=Math.floor(Math.random()*N);if(!A[i]){A[i]=1;age[i]=0;}}}}
  for(let i=0;i<N;i++)if(gh[i])gh[i]=Math.max(0,gh[i]-Math.round(dt*255*(2.5-p.ghost/100*2.2)));
  let pop=0;for(let i=0;i<N;i++)if(A[i]===1)pop++;
  if(p.mode!=='rule'&&steps){if(pop===s.lastPop)s.still++;else s.still=0;s.lastPop=pop;if(pop<N*.004||s.still>90)seed();}
  // Cells in grey levels: newborn brightest, older and refractory dimmer, ghosts of dead cells faint.
  const ox=(W-cols*c)/2,oy=(H-rows*c)/2,g=c*p.gap/100,sz=c-g,G=6,paths=Array.from({length:G},()=>new Path2D());
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const i=y*cols+x;let t=-1;
    if(p.mode==='rule'){if(A[i]){const ageR=((s.head-1-y)+rows*2)%rows;t=1-ageR/rows*.8;}}
    else if(A[i]===1)t=p.mode==='brain'?1:Math.max(.35,1-age[i]/24);else if(A[i]===2)t=.45;else if(gh[i]&&p.ghost>0)t=gh[i]/255*.3;
    if(t<0)continue;const lv=Math.min(G-1,Math.floor(t*G));
    const yy=p.mode==='rule'?oy+(((y-s.head)+rows)%rows)*c:oy+y*c;cellShape(paths[lv],p.cellShape,ox+x*c+g/2,yy+g/2,sz);}
  paths.forEach((P,lv)=>{ctx.fillStyle=tone(rgb,.12+.88*(lv+1)/G);ctx.fill(P);});
  if(p.hud){const sz=12*k,m=40*k,lh=sz*1.35;ctx.font=FONT(sz);ctx.textBaseline='top';ctx.textAlign='left';ctx.fillStyle=tone(rgb,1);ctx.strokeStyle=tone(rgb,1);
    const rule=p.mode==='rule'?`RULE ${s.rule}  (${s.rule.toString(2).padStart(8,'0')})`:p.mode==='brain'?"BRIAN'S BRAIN  B2/S/3":p.mode==='highlife'?'HIGHLIFE  B36/S23':'CONWAY  B3/S23';
    lines(ctx,['CELLULAR AUTOMATON','',rule,`GRID ${cols}×${rows}`],m,m,lh);
    ctx.textAlign='right';lines(ctx,[`GEN: ${pad(s.gen,7)}`,`POP: ${pad(pop,6)}`,`DENSITY: ${(pop/N*100).toFixed(1).padStart(5,'0')}%`,`RATE: ${(p.speed*(.25+p.boost/100*Math.min(1.5,full*2.5))).toFixed(1)} /s`],W-m,m,lh);
    const lab=({beat:'BEATS',bass:'BASS',mids:'MIDS',high:'HIGHS',full:'LEVEL'})[p.react]||'',yy=H-m-sz;ctx.textAlign='left';ctx.fillText('INJECT: '+lab,m,yy);meter(ctx,m+ctx.measureText('INJECT: '+lab).width+6*k,yy+k,70*k,sz*.8,Math.max(s.flash,band(sig,p.react)),Math.max(.5,k));}
}

// ---------- Oscilloscope ----------
// The sound itself on a phosphor screen: XY (the wave against itself a moment later), a triggered time trace, or a
// Lissajous figure whose ratio follows the bands. Fast strokes are faint and slow ones bright, like a real beam.
export const SCOPE_LIST=[['xy','XY (phase)'],['yt','Time (triggered)'],['lissajous','Lissajous']];
export function oscilloscope(ctx,W,H,s,p,sig,dt){
  const k=H/1080,rgb=rgbOf(p.color),w=sig.wave||new Float32Array(2048),L=w.length,span=Math.max(2,Math.min(L-260,Math.round(p.span||1024))),rate=48000;
  const div=Math.min(W*.86/10,H*.86/8)*p.size/100,gw=div*10,gh=div*8,cx=W/2,cy=H/2,gain=p.gain*div*2;
  const buf=buffer(s,'buf',W,H),b=buf.getContext('2d');
  b.globalCompositeOperation='destination-out';b.fillStyle=`rgba(0,0,0,${Math.min(1,1-Math.pow(p.persist/100,dt*30))})`;b.fillRect(0,0,W,H);b.globalCompositeOperation='lighter';
  const pts=[];
  if(p.mode==='yt'){let t0=1;for(let i=1;i<L-span;i++)if(w[i-1]<0&&w[i]>=0){t0=i;break;}for(let i=0;i<span;i++)pts.push([cx-gw/2+gw*i/(span-1),cy-w[t0+i]*gain]);}
  else if(p.mode==='xy'){const d=Math.max(1,Math.round(p.delay));for(let i=0;i<span;i++)pts.push([cx+w[i]*gain,cy-w[i+d]*gain]);}
  else{const bb=sig.bands||{},a=1+Math.round((bb.bass??0)*p.morph/100*4),c2=2+Math.round((bb.high??0)*p.morph/100*5);s.ph=(s.ph||0)+dt*p.drift/100*1.5;
    const R=Math.min(gw,gh)*.42;for(let i=0;i<span;i++){const t=TAU*i/(span-1);pts.push([cx+(Math.sin(a*t+s.ph)*R+w[i]*gain*.4),cy-(Math.sin(c2*t)*R+w[(i+37)%L]*gain*.4)]);}s.ratio=`${a}:${c2}`;}
  const G=5,lw=Math.max(.5,p.line*k),ps=Array.from({length:G},()=>new Path2D());
  let lg=-1;for(let i=1;i<pts.length;i++){const [x0,y0]=pts[i-1],[x1,y1]=pts[i],l=Math.hypot(x1-x0,y1-y0),t=Math.max(0,Math.min(.999,1.15-l/(div*.5)));if(!(t>=0)){lg=-1;continue;}const g=Math.floor(t*G);if(g!==lg)ps[g].moveTo(x0,y0);ps[g].lineTo(x1,y1);lg=g;}
  b.lineWidth=lw;b.lineCap='round';lineDash(b,p.lineStyle,lw);ps.forEach((P,g)=>{b.strokeStyle=tone(rgb,.25+.75*(g+1)/G);b.stroke(P);});b.setLineDash([]);
  b.globalCompositeOperation='source-over';
  if(p.grid){ctx.strokeStyle=tone(rgb,.25);ctx.lineWidth=Math.max(.5,k);ctx.beginPath();
    for(let i=0;i<=10;i++){ctx.moveTo(cx-gw/2+div*i,cy-gh/2);ctx.lineTo(cx-gw/2+div*i,cy+gh/2);}for(let j=0;j<=8;j++){ctx.moveTo(cx-gw/2,cy-gh/2+div*j);ctx.lineTo(cx+gw/2,cy-gh/2+div*j);}ctx.stroke();
    ctx.strokeStyle=tone(rgb,.45);ctx.beginPath();for(let i=0;i<=50;i++){const x=cx-gw/2+div*i/5;ctx.moveTo(x,cy-3*k);ctx.lineTo(x,cy+3*k);}for(let j=0;j<=40;j++){const y=cy-gh/2+div*j/5;ctx.moveTo(cx-3*k,y);ctx.lineTo(cx+3*k,y);}ctx.stroke();}
  ctx.drawImage(buf,0,0);
  let zc=0,mn=1,mx=-1;for(let i=1;i<L;i++){if(w[i-1]<0&&w[i]>=0)zc++;mn=Math.min(mn,w[i]);mx=Math.max(mx,w[i]);}
  if(p.hud){const sz=12*k,m=40*k,lh=sz*1.35,vdiv=div/gain;ctx.font=FONT(sz);ctx.fillStyle=tone(rgb,1);ctx.textBaseline='top';ctx.textAlign='left';
    lines(ctx,['OSCILLOSCOPE · CH1',`MODE: ${({xy:'X-Y  (x = s(t), y = s(t + '+Math.round(p.delay)+'))',yt:'Y-T  TRIG ↑ 0.00 V',lissajous:'LISSAJOUS  '+(s.ratio||'')})[p.mode]}`,`${vdiv.toFixed(3)} V/div`,`${(span/rate*1000/10).toFixed(2)} ms/div`],m,m,lh);
    ctx.textAlign='right';lines(ctx,[`FREQ: ${(zc/(L/rate)).toFixed(1).padStart(7,'0')} Hz`,`Vpp: ${(mx-mn).toFixed(3)} V`,`PERSIST: ${pad(p.persist,2)}%`,`SAMPLES: ${pad(span,4)}`],W-m,m,lh);}
}

// ---------- Radar Sweep ----------
// A rotating beam paints the spectrum as returns (centre = low, rim = high, brighter = louder) that glow and fade, and
// sound hits drop contacts that drift and get tagged with range and bearing as the beam passes them.
export function radar(ctx,W,H,s,p,sig,dt){
  const k=H/1080,rgb=rgbOf(p.color),R=H*p.size/100/2,cx=W/2,cy=H/2,full=sig.bands?.full??0;
  const buf=buffer(s,'buf',W,H),b=buf.getContext('2d');
  b.globalCompositeOperation='destination-out';b.fillStyle=`rgba(0,0,0,${Math.min(1,dt*(4-p.decay/100*3.8))})`;b.fillRect(0,0,W,H);b.globalCompositeOperation='source-over';
  const a0=s.a??-Math.PI/2,da=dt*p.rpm/60*TAU*(.5+p.boost/100*Math.min(1.5,full*2.5)),a1=a0+da;s.a=a1;s.t=(s.t||0)+dt;
  // Returns across the swept wedge: one radial line every ~0.5°.
  const G=6,ps=Array.from({length:G},()=>new Path2D()),nl=Math.max(1,Math.ceil(da/(.5*Math.PI/180))),J=64,dot=Math.max(1.5,R/J*.8);
  for(let l=0;l<nl;l++){const a=a0+da*(l+.5)/nl,ca=Math.cos(a),sa=Math.sin(a);
    for(let j=2;j<J;j++){const f=j/J,h=Math.sin(j*12.9898+Math.floor(a*80)*78.233)*43758.5453,nz=h-Math.floor(h),v=specAt(sig,f)*p.returns/100*(.55+.45*nz);if(v<.18)continue;
      const lv=Math.min(G-1,Math.floor(Math.min(1,v)*G)),r=f*R;cellShape(ps[lv],p.cellShape,cx+ca*r-dot/2,cy+sa*r-dot/2,dot);}}
  ps.forEach((P,g)=>{b.fillStyle=tone(rgb,.2+.8*(g+1)/G);b.fill(P);});
  // Contacts: spawned on hits, drifting; painted when the beam crosses them.
  s.cts??=[];s.id??=0;
  if(hit(s,sig,p.react,dt)&&p.contacts>0){s.cts.push({id:++s.id,b:Math.random()*TAU,r:.2+.75*Math.random(),vb:(Math.random()-.5)*.08,vr:(Math.random()-.5)*.05,seen:-9,trail:[]});while(s.cts.length>p.contacts)s.cts.shift();}
  const within=(x,lo,hi)=>{const d=((x-lo)%TAU+TAU)%TAU;return d<=hi-lo;};
  for(const c of s.cts){c.b+=c.vb*dt;c.r=Math.max(.08,Math.min(.98,c.r+c.vr*dt));if(c.r<=.08||c.r>=.98)c.vr*=-1;
    if(within(c.b,a0,a1)){c.seen=s.t;c.trail.push([c.b,c.r]);if(c.trail.length>6)c.trail.shift();const x=cx+Math.cos(c.b)*c.r*R,y=cy+Math.sin(c.b)*c.r*R,z=5*k;b.fillStyle=tone(rgb,1);b.fillRect(x-z,y-z,z*2,z*2);}}
  ctx.drawImage(buf,0,0);
  // Scope furniture: range rings, bearing ticks, the beam.
  const lw=Math.max(.5,k);ctx.lineWidth=lw;ctx.strokeStyle=tone(rgb,.3);ctx.fillStyle=tone(rgb,.55);ctx.beginPath();
  const rings=Math.max(2,p.rings|0);for(let i=1;i<=rings;i++){ctx.moveTo(cx+R*i/rings,cy);ctx.arc(cx,cy,R*i/rings,0,TAU);}
  ctx.moveTo(cx-R,cy);ctx.lineTo(cx+R,cy);ctx.moveTo(cx,cy-R);ctx.lineTo(cx,cy+R);lineDash(ctx,p.lineStyle,lw);ctx.stroke();ctx.setLineDash([]);ctx.lineCap='butt';ctx.beginPath();
  for(let d=0;d<360;d+=5){const t=(d-90)*Math.PI/180,l=d%30?6*k:14*k;ctx.moveTo(cx+Math.cos(t)*R,cy+Math.sin(t)*R);ctx.lineTo(cx+Math.cos(t)*(R+l),cy+Math.sin(t)*(R+l));}ctx.stroke();
  ctx.font=FONT(10*k);ctx.textAlign='center';ctx.textBaseline='middle';for(let d=0;d<360;d+=30){const t=(d-90)*Math.PI/180;ctx.fillText(String(d).padStart(3,'0'),cx+Math.cos(t)*(R+28*k),cy+Math.sin(t)*(R+28*k));}
  ctx.textAlign='left';ctx.textBaseline='bottom';for(let i=1;i<=rings;i++)ctx.fillText(Math.round(p.range*i/rings)+' NM',cx+3*k,cy-R*i/rings-2*k);
  for(let q=0;q<14;q++){const a=a1-q*.025;ctx.strokeStyle=tone(rgb,(1-q/14)*.9);ctx.lineWidth=q?Math.max(.5,k*2):Math.max(1,k*2);lineDash(ctx,p.lineStyle,ctx.lineWidth);ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(a)*R,cy+Math.sin(a)*R);ctx.stroke();}ctx.setLineDash([]);ctx.lineCap='butt';
  ctx.font=FONT(11*k);ctx.lineWidth=lw;
  for(const c of s.cts){const age=s.t-c.seen,rev=TAU/Math.max(.1,p.rpm/60*TAU);if(age>rev*1.2)continue;const al=Math.max(0,1-age/(rev*1.2)),x=cx+Math.cos(c.b)*c.r*R,y=cy+Math.sin(c.b)*c.r*R,z=10*k;
    ctx.globalAlpha=al;ctx.strokeStyle=ctx.fillStyle=tone(rgb,1);ctx.strokeRect(x-z,y-z,z*2,z*2);
    for(const [tb,tr] of c.trail.slice(0,-1))ctx.fillRect(cx+Math.cos(tb)*tr*R-1.5*k,cy+Math.sin(tb)*tr*R-1.5*k,3*k,3*k);
    if(p.labels){ctx.textAlign='left';ctx.textBaseline='bottom';ctx.fillText('TGT '+pad(c.id%1000,3),x+z*1.4,y-z*.2);ctx.textBaseline='top';ctx.fillText(`R ${(c.r*p.range).toFixed(1)}  B ${pad(((c.b*180/Math.PI+90)%360+360)%360,3)}°`,x+z*1.4,y+z*.2);}}
  ctx.globalAlpha=1;
  if(p.hud){const sz=12*k,m=40*k,lh=sz*1.35;ctx.font=FONT(sz);ctx.fillStyle=tone(rgb,1);ctx.textBaseline='top';ctx.textAlign='left';
    lines(ctx,['RADAR · PPI',`RANGE: ${p.range} NM`,`SWEEP: ${(p.rpm*(.5+p.boost/100*Math.min(1.5,full*2.5))).toFixed(1)} RPM`],m,m,lh);
    ctx.textAlign='right';lines(ctx,[`BRG: ${(((a1*180/Math.PI+90)%360+360)%360).toFixed(1).padStart(5,'0')}°`,`CONTACTS: ${pad(s.cts.length,2)}`,`RETURNS: ${pad(p.returns,3)}%`],W-m,m,lh);}
}
