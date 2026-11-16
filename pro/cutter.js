// Cutter: cuts any picture into geometric pieces (golden ratio, grid, columns, rows, Mondrian, triangles)
// and plays them like a puzzle with the sound: hits shuffle what each piece shows (gliding), pop, nudge, flip and recolour pieces.
export const PATTERNS=[['golden','Golden ratio'],['random','Random shards'],['grid','Grid'],['columns','Columns'],['rows','Rows'],['mondrian','Mondrian'],['triangles','Triangles']];

function rng(seed){let s=(seed>>>0)||1;return ()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
const rect=(x,y,w,h)=>({x,y,w,h,pts:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]]});
function poly(pts){const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys);return {x,y,w:Math.max(...xs)-x,h:Math.max(...ys)-y,pts};}
function area(pts){let a=0;for(let i=0;i<pts.length;i++){const [x1,y1]=pts[i],[x2,y2]=pts[(i+1)%pts.length];a+=x1*y2-x2*y1;}return Math.abs(a)/2;}
// Splits a convex polygon along the line through (px,py) at angle t.
function split(pts,px,py,t){
  const nx=-Math.sin(t),ny=Math.cos(t),side=([x,y])=>(x-px)*nx+(y-py)*ny,A=[],B=[];
  for(let i=0;i<pts.length;i++){const p=pts[i],q=pts[(i+1)%pts.length],a=side(p),b=side(q);
    (a>=0?A:B).push(p);if(a*b<0){const k=a/(a-b),m=[p[0]+(q[0]-p[0])*k,p[1]+(q[1]-p[1])*k];A.push(m);B.push(m);}}
  return [A,B];
}

// Pieces as polygons with their bounding boxes, in pixels. flip: bit 1 mirrors X, bit 2 mirrors Y.
export function layout(pattern,pieces,seed,W,H,flip=0){
  const n=Math.max(2,Math.min(64,Math.round(pieces))),r=rng(seed*7919+n),out=[];
  if(pattern==='golden'){
    // Cut the largest square off the long side, turning round the rectangle (right, bottom, left, top) like the golden spiral.
    let x=0,y=0,w=W,h=H;const dirs=['r','b','l','t'];let d=0;
    for(let i=0;i<n-1;i++){
      const wide=w>=h;while((dirs[d%4]==='r'||dirs[d%4]==='l')!==wide)d++;const s=Math.min(w,h),side=dirs[d++%4];
      if(side==='r'){out.push(rect(x+w-s,y,s,h));w-=s;}else if(side==='l'){out.push(rect(x,y,s,h));x+=s;w-=s;}
      else if(side==='b'){out.push(rect(x,y+h-s,w,s));h-=s;}else{out.push(rect(x,y,w,s));y+=s;h-=s;}
      if(w<2||h<2)break;
    }
    if(w>=1&&h>=1)out.push(rect(x,y,w,h));
  }else if(pattern==='random'){
    // Shards: the biggest piece is split along a line at a random angle through a point near its middle.
    let cells=[[[0,0],[W,0],[W,H],[0,H]]];
    for(let guard=0;cells.length<n&&guard<n*4;guard++){
      let i=0;for(let j=1;j<cells.length;j++)if(area(cells[j])>area(cells[i]))i=j;
      const c=cells[i],b=poly(c),[A,B]=split(c,b.x+b.w*(.35+r()*.3),b.y+b.h*(.35+r()*.3),r()*Math.PI);
      if(A.length>=3&&B.length>=3&&area(A)>W*H*.002&&area(B)>W*H*.002)cells.splice(i,1,A,B);
    }
    out.push(...cells.map(poly));
  }else if(pattern==='columns'||pattern==='rows'){
    // Uneven widths (from the seed) read as cuts rather than a plain grid.
    const ws=Array.from({length:n},()=>.5+r()),t=ws.reduce((a,b)=>a+b,0);let a=0;
    for(const v of ws){const f=v/t;out.push(pattern==='columns'?rect(a*W,0,f*W,H):rect(0,a*H,W,f*H));a+=f;}
  }else if(pattern==='mondrian'){
    const cells=[rect(0,0,W,H)];
    while(cells.length<n){
      let i=0;for(let j=1;j<cells.length;j++)if(cells[j].w*cells[j].h>cells[i].w*cells[i].h)i=j;
      const c=cells.splice(i,1)[0],f=.3+r()*.4;
      if(c.w/W>=c.h/H)cells.push(rect(c.x,c.y,c.w*f,c.h),rect(c.x+c.w*f,c.y,c.w*(1-f),c.h));
      else cells.push(rect(c.x,c.y,c.w,c.h*f),rect(c.x,c.y+c.h*f,c.w,c.h*(1-f)));
    }
    out.push(...cells);
  }else{
    const tri=pattern==='triangles',m=tri?Math.max(1,Math.round(n/2)):n,cols=Math.max(1,Math.round(Math.sqrt(m*W/H))),rows=Math.max(1,Math.round(m/cols)),cw=W/cols,ch=H/rows;
    for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
      const x=i*cw,y=j*ch;if(!tri){out.push(rect(x,y,cw,ch));continue;}
      const a=[x,y],b=[x+cw,y],c=[x+cw,y+ch],d=[x,y+ch],alt=(i+j)%2;
      for(const pts of alt?[[a,b,c],[a,c,d]]:[[a,b,d],[b,c,d]]){const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),bx=Math.min(...xs),by=Math.min(...ys);
        out.push({x:bx,y:by,w:Math.max(...xs)-bx,h:Math.max(...ys)-by,pts});}
    }
  }
  if(flip)for(const c of out){if(flip&1){c.x=W-c.x-c.w;c.pts=c.pts.map(([px,py])=>[W-px,py]);}if(flip&2){c.y=H-c.y-c.h;c.pts=c.pts.map(([px,py])=>[px,H-py]);}}
  return out;
}

// The part of the picture a piece shows: centred on the source piece, shaped like the destination piece, kept inside the picture.
function crop(src,dst,W,H){
  const a=dst.w/Math.max(1,dst.h);let w=src.w,h=w/a;if(h<src.h){h=src.h;w=h*a;}
  const k=Math.min(1,W/w,H/h);w*=k;h*=k;
  const cx=src.x+src.w/2,cy=src.y+src.h/2;return [Math.max(0,Math.min(W-w,cx-w/2)),Math.max(0,Math.min(H-h,cy-h/2)),w,h];
}
const ease=t=>t<0?0:t>1?1:t*t*(3-2*t);
const lerp=(a,b,t)=>a+(b-a)*t;

const FX=['hues','duo','mono','invert','chroma'];
// Chromatic aberration on one piece: its red and cyan halves drawn apart (shift grows with the strength).
let chA=null,chB=null;
function chroma(ctx,src,c,k,W){
  const w=Math.max(1,Math.ceil(c.w)),h=Math.max(1,Math.ceil(c.h)),d=Math.max(1,k*W*.012);
  chA||=document.createElement('canvas');chB||=document.createElement('canvas');
  for(const [cv,col] of [[chA,'#f00'],[chB,'#0ff']]){if(cv.width<w)cv.width=w;if(cv.height<h)cv.height=h;const x=cv.getContext('2d');
    x.globalCompositeOperation='copy';x.drawImage(src,c.cr[0],c.cr[1],c.cr[2],c.cr[3],0,0,w,h);x.globalCompositeOperation='multiply';x.fillStyle=col;x.fillRect(0,0,w,h);
    x.globalCompositeOperation='destination-in';x.drawImage(src,c.cr[0],c.cr[1],c.cr[2],c.cr[3],0,0,w,h);}
  ctx.fillStyle='#000';ctx.fillRect(-c.w/2,-c.h/2,c.w,c.h);ctx.globalCompositeOperation='lighter';
  ctx.drawImage(chA,0,0,w,h,-c.w/2-d,-c.h/2,c.w,c.h);ctx.drawImage(chB,0,0,w,h,-c.w/2+d,-c.h/2,c.w,c.h);ctx.globalCompositeOperation='source-over';
}
// One-click looks: the cut and how it moves.
export const PRESETS={
  'Golden':{pattern:'golden',pieces:7,react:'beat',every:'1',shuffle:50,scale:30,move:10,rotate:15,glide:400,recolor:20,recolorOn:'hits',colors:'hues',gap:6,lines:2,recut:8},
  'Puzzle':{pattern:'grid',pieces:12,react:'beat',every:'1',shuffle:35,scale:0,move:0,rotate:30,glide:450,recolor:0,recolorOn:'hits',gap:4,lines:0,recut:0},
  'Random shards':{pattern:'random',pieces:14,react:'bass',threshold:45,shuffle:40,scale:45,move:50,rotate:20,glide:250,recolor:30,recolorOn:'hits',colors:'mix',gap:14,lines:0,recut:6},
  'Collage':{pattern:'mondrian',pieces:9,react:'beat',every:'2',shuffle:60,scale:20,move:15,rotate:10,glide:500,recolor:45,recolorOn:'hits',colors:'duo',gap:0,lines:4,lineColor:'#000000',recut:4},
  'Glitch':{pattern:'rows',pieces:16,react:'high',threshold:35,shuffle:70,scale:0,move:60,rotate:0,glide:60,decay:120,recolor:45,recolorOn:'hits',colors:'chroma',gap:0,lines:0,recut:0},
  'Pop art':{pattern:'grid',pieces:4,react:'beat',every:'1',shuffle:25,scale:25,move:0,rotate:0,glide:300,recolor:90,recolorOn:'all',colors:'hues',gap:0,lines:6,lineColor:'#ffffff',recut:0},
  'Noir':{pattern:'triangles',pieces:16,react:'beat',every:'2',shuffle:40,scale:30,move:20,rotate:20,glide:350,recolor:70,recolorOn:'hits',colors:'mono',gap:0,lines:1.5,lineColor:'#ffffff',recut:0}
};
export function createState(){return {key:'',cells:[],perm:[],beat:null,count:0,armed:true,step:-1,hits:0,flip:0,seed:0,rnd:rng(1)};}

// One frame: st is per-node state, p the node's props, sig {bands,beat}; returns how hard it hit (0..1) for the node's meter.
export function render(ctx,src,st,p,sig,time,dt,W,H){
  const b=sig.bands||{},th=p.threshold/100;
  // When does it move? Beats (every N), a band crossing the threshold, or a steady rate.
  let hit=false;const newBeat=st.beat!==null&&sig.beat!==st.beat;st.beat=sig.beat;
  if(p.react==='beat'){if(newBeat&&++st.count%(+p.every||1)===0)hit=true;}
  else if(p.react==='tempo'){const s=Math.floor(time*p.rate);if(s!==st.step){if(st.step>=0)hit=true;st.step=s;}}
  else{const lv=p.react==='bass'?b.bass:p.react==='high'?Math.min(1,(b.high||0)*1.6):b.full,on=(lv||0)>th;if(on&&st.armed)hit=true;if(on)st.armed=false;else if((lv||0)<th*.8)st.armed=true;}
  if(hit&&p.recut>0&&++st.hits%p.recut===0){st.flip=(st.flip+1+Math.floor(st.rnd()*3))%4;st.seed++;st.key='';}
  const key=[p.pattern,p.pieces,p.seed,W,H,st.flip,st.seed].join();
  if(st.key!==key){
    st.key=key;const L=layout(p.pattern,p.pieces,p.seed+st.seed*31,W,H,st.flip);st.rnd=rng(p.seed*13+7);
    st.cells=L.map((c,i)=>({...c,cr:crop(c,c,W,H),from:null,to:null,t0:-9,pop:0,ox:0,oy:0,tx:0,ty:0,rot:0,rotTo:0,fx:1,fy:1,tint:null,tintA:0,tintTo:0,kind:'hues'}));st.perm=L.map((_,i)=>i);
  }
  const C=st.cells,n=C.length,R=st.rnd,glide=Math.max(.02,p.glide/1000);
  if(hit){
    // Shuffle: a share of the pieces swap what they show, in a ring so every chosen piece changes.
    const k=Math.min(n,Math.round(n*p.shuffle/100));
    if(k>=2){const idx=[...Array(n).keys()].sort(()=>R()-.5).slice(0,k),srcs=idx.map(i=>st.perm[i]);
      idx.forEach((i,j)=>{st.perm[i]=srcs[(j+1)%k];const c=C[i];c.from=c.cr.slice();c.to=crop(C[st.perm[i]],c,W,H);c.t0=time;});}
    for(const c of C){
      if(R()<p.scale/100*.6)c.pop=1;
      if(R()<p.move/100*.6){const a=R()*Math.PI*2,d=(.02+R()*.08)*Math.min(W,H)*p.move/50;c.tx=Math.cos(a)*d;c.ty=Math.sin(a)*d;}
      if(R()<p.rotate/100*.5){const sq=Math.abs(c.w/c.h-1)<.15;if(sq)c.rotTo+=(R()<.5?1:-1)*Math.PI/2;else if(R()<.5)c.fx*=-1;else c.fy*=-1;}
      if(p.recolorOn!=='all'&&R()<p.recolor/100*.6){c.tint=R();c.kind=FX[Math.floor(R()*FX.length)];c.tintTo=c.tintTo>0&&R()<.4?0:1;}
    }
  }
  if(p.recolorOn==='all')C.forEach((c,i)=>{if(c.tint===null){c.tint=(i*.618034+.13)%1;c.kind=FX[i%FX.length];}c.tintTo=1;});
  const fall=Math.exp(-dt*1000/Math.max(40,p.decay)),bass=b.bass||0;
  ctx.clearRect(0,0,W,H);if(!src)return 0;
  const order=[...Array(n).keys()].sort((i,j)=>C[i].pop-C[j].pop);
  ctx.lineJoin='round';
  for(const i of order){
    const c=C[i];
    if(c.to){const t=ease((time-c.t0)/glide);c.cr=c.from.map((v,j)=>lerp(v,c.to[j],t));if(t>=1)c.to=null;}
    c.pop*=fall;c.ox=lerp(c.ox,c.tx,1-Math.exp(-dt*6));c.oy=lerp(c.oy,c.ty,1-Math.exp(-dt*6));c.tx*=Math.exp(-dt*.6);c.ty*=Math.exp(-dt*.6);
    c.rot=lerp(c.rot,c.rotTo,1-Math.exp(-dt*1000/Math.max(40,p.glide*.6)));
    c.tintA=lerp(c.tintA,c.tintTo,1-Math.exp(-dt*5));
    const s=1+c.pop*p.scale/100*.35+bass*p.scale/100*.06*((i%3)/2),gap=p.gap/100*Math.min(c.w,c.h)*.12,cx=c.x+c.w/2+c.ox,cy=c.y+c.h/2+c.oy;
    ctx.save();ctx.translate(cx,cy);ctx.rotate(c.rot);ctx.scale(s*c.fx,s*c.fy);
    const sh=gap?Math.max(0,1-2*gap/Math.min(c.w,c.h)):1;ctx.scale(sh,sh);
    ctx.beginPath();c.pts.forEach(([px,py],j)=>j?ctx.lineTo(px-c.x-c.w/2,py-c.y-c.h/2):ctx.moveTo(px-c.x-c.w/2,py-c.y-c.h/2));ctx.closePath();
    ctx.save();ctx.clip();
    const [sx,sy,sw,shh]=c.cr,k=c.tint===null?0:Math.min(1,c.tintA*p.recolor/100*1.4),kind=p.colors==='mix'?c.kind:p.colors;
    if(kind==='chroma'&&k>.01)chroma(ctx,src,c,k,W);else ctx.drawImage(src,sx,sy,sw,shh,-c.w/2,-c.h/2,c.w,c.h);
    if(k>.01&&kind!=='chroma'){
      ctx.globalAlpha=kind==='mono'?Math.min(1,k*1.2):k;
      if(kind==='invert'){ctx.globalCompositeOperation='difference';ctx.fillStyle='#fff';}
      else if(kind==='mono'){ctx.globalCompositeOperation='saturation';ctx.fillStyle='#808080';}
      else{ctx.globalCompositeOperation='color';ctx.fillStyle=kind==='duo'?(c.tint<.5?p.c1:p.c2):`hsl(${Math.round(c.tint*360)},85%,55%)`;}
      ctx.fillRect(-c.w/2,-c.h/2,c.w,c.h);
    }
    ctx.restore();
    if(p.lines>0){ctx.lineWidth=p.lines/Math.max(.2,s*sh);ctx.strokeStyle=p.lineColor;ctx.stroke();}
    ctx.restore();
  }
  return hit?1:0;
}
