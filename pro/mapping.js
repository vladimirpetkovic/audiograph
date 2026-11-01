// Projection mapping: the finished picture (or one layer) is cropped, masked and warped onto surfaces.
// A surface is a grid of control points in output space (0–1). A 1×1 grid is a true perspective corner pin
// (homography); bigger grids bend smoothly through every point (Catmull-Rom) for curved or uneven walls.
export const MAX_SURFACES=8,MAX_GRID=4;
const ID=/^[a-zA-Z][a-zA-Z0-9_-]{0,40}$/;
const num=(v,lo,hi,d)=>{v=+v;return Number.isFinite(v)?Math.max(lo,Math.min(hi,v)):d;};

export function gridPoints(cols,rows,q=[[0,0],[1,0],[1,1],[0,1]]){
  const pts=[];for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++)pts.push(bilinear(q,i/cols,j/rows));return pts;
}
function bilinear(q,u,v){const a=[q[0][0]+(q[1][0]-q[0][0])*u,q[0][1]+(q[1][1]-q[0][1])*u],b=[q[3][0]+(q[2][0]-q[3][0])*u,q[3][1]+(q[2][1]-q[3][1])*u];return [a[0]+(b[0]-a[0])*v,a[1]+(b[1]-a[1])*v];}
export function corners(s){const c=s.cols,r=s.rows,w=c+1;return [s.pts[0],s.pts[c],s.pts[r*w+c],s.pts[r*w]];}
export function surface(id,name,q,extra={}){return {id,name,source:'all',cols:1,rows:1,pts:gridPoints(1,1,q),crop:[0,0,1,1],opacity:1,feather:0,mask:'rect',...extra};}
// Change the grid size while keeping the surface's current shape.
export function regrid(s,cols,rows){
  const old={...s},sample=(u,v)=>pointAt(old,u,v),pts=[];
  for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++)pts.push(sample(i/cols,j/rows).map(x=>Math.round(x*10000)/10000));
  return {...s,cols,rows,pts,wrap:'flat'};
}

export function cleanMapping(m){
  if(m===undefined||m===null)return undefined;
  if(typeof m!=='object'||Array.isArray(m))throw Error('Invalid mapping');
  if(!Array.isArray(m.surfaces)||m.surfaces.length>MAX_SURFACES)throw Error(`Mapping allows up to ${MAX_SURFACES} surfaces`);
  const ids=new Set();
  const surfaces=m.surfaces.map((s,k)=>{
    if(!s||typeof s!=='object')throw Error('Invalid mapping surface');
    const id=String(s.id);if(!ID.test(id)||ids.has(id))throw Error('Invalid mapping surface ID');ids.add(id);
    const cols=Math.round(num(s.cols,1,MAX_GRID,1)),rows=Math.round(num(s.rows,1,MAX_GRID,1));
    if(!Array.isArray(s.pts)||s.pts.length!==(cols+1)*(rows+1))throw Error('Mapping surface points do not match its grid');
    const pts=s.pts.map(p=>{if(!Array.isArray(p)||p.length!==2)throw Error('Invalid mapping point');return [num(p[0],-1,2,0),num(p[1],-1,2,0)];});
    const c=Array.isArray(s.crop)&&s.crop.length===4?s.crop.map((v,i)=>num(v,0,1,i<2?0:1)):[0,0,1,1];
    if(c[2]-c[0]<.01||c[3]-c[1]<.01)throw Error('Mapping crop is too small');
    const source=s.source==='all'||s.source===undefined?'all':Math.round(num(s.source,1,4,1));
    if(s.wrap!==undefined&&!['flat','cap'].includes(s.wrap))throw Error('Invalid mapping wrap');
    if(s.wrap==='cap'&&(cols!==1||rows!==1))throw Error('Cube cap needs four corners');
    return {id,name:typeof s.name==='string'&&s.name.trim()?s.name.slice(0,40):`Surface ${k+1}`,source,cols,rows,pts,crop:c,
      opacity:num(s.opacity,0,1,1),feather:num(s.feather,0,.5,0),mask:s.mask==='ellipse'?'ellipse':'rect',...(s.wrap!==undefined?{wrap:s.wrap}:{})};
  });
  // Older cube presets used a rectangle on the cap, which cannot meet both side crops at their shared vertex.
  const top=surfaces.find(s=>s.id==='top'),left=surfaces.find(s=>s.id==='left'),right=surfaces.find(s=>s.id==='right');
  if(top&&left&&right&&top.wrap===undefined&&top.cols===1&&top.rows===1&&
    JSON.stringify([top.crop,left.crop,right.crop])==='[[0,0,1,0.5],[0,0.5,0.5,1],[0.5,0.5,1,1]]'&&
    JSON.stringify([corners(top)[0],corners(top)[2],corners(top)[3]])===JSON.stringify([corners(left)[0],corners(right)[1],corners(left)[1]]))top.wrap='cap';
  return {on:!!m.on,test:!!m.test,surfaces};
}

// ---------- geometry ----------
function homography(q){
  // Unit square → quad (Heckbert). Returns f(u,v)→[x,y].
  const [[x0,y0],[x1,y1],[x2,y2],[x3,y3]]=q,dx1=x1-x2,dx2=x3-x2,dy1=y1-y2,dy2=y3-y2,sx=x0-x1+x2-x3,sy=y0-y1+y2-y3;
  let g=0,h=0;const den=dx1*dy2-dx2*dy1;
  if(Math.abs(den)>1e-12&&(Math.abs(sx)>1e-12||Math.abs(sy)>1e-12)){g=(sx*dy2-dx2*sy)/den;h=(dx1*sy-sx*dy1)/den;}
  const a=x1-x0+g*x1,b=x3-x0+h*x3,d=y1-y0+g*y1,e=y3-y0+h*y3;
  return (u,v)=>{const w=g*u+h*v+1||1e-9;return [(a*u+b*v+x0)/w,(d*u+e*v+y0)/w];};
}
const cr=(p0,p1,p2,p3,t)=>{const t2=t*t,t3=t2*t;return .5*(2*p1+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t2+(-p0+3*p1-3*p2+p3)*t3);};
// Point on the surface at (u,v) in 0–1, in output units (0–1).
export function pointAt(s,u,v){
  if(s.cols===1&&s.rows===1)return homography(corners(s))(u,v);
  const w=s.cols+1,P=(i,j)=>{i=Math.max(0,Math.min(s.cols,i));j=Math.max(0,Math.min(s.rows,j));return s.pts[j*w+i];};
  const fx=u*s.cols,fy=v*s.rows,i=Math.min(s.cols-1,Math.floor(fx)),j=Math.min(s.rows-1,Math.floor(fy)),tu=fx-i,tv=fy-j,out=[0,0];
  for(const k of [0,1]){
    const row=jj=>cr(P(i-1,jj)[k],P(i,jj)[k],P(i+1,jj)[k],P(i+2,jj)[k],tu);
    out[k]=cr(row(j-1),row(j),row(j+1),row(j+2),tv);
  }
  return out;
}
export function inside(s,x,y){
  // Hit test on the surface outline (sampled).
  const N=8,poly=[];for(let i=0;i<N;i++)poly.push(pointAt(s,i/N,0));for(let j=0;j<N;j++)poly.push(pointAt(s,1,j/N));
  for(let i=N;i>0;i--)poly.push(pointAt(s,i/N,1));for(let j=N;j>0;j--)poly.push(pointAt(s,0,j/N));
  let c=false;for(let i=0,k=poly.length-1;i<poly.length;k=i++){const [xi,yi]=poly[i],[xk,yk]=poly[k];if((yi>y)!==(yk>y)&&x<(xk-xi)*(y-yi)/(yk-yi)+xi)c=!c;}
  return c;
}
export function outline(s,N=24){const p=[];for(let i=0;i<N;i++)p.push(pointAt(s,i/N,0));for(let j=0;j<N;j++)p.push(pointAt(s,1,j/N));for(let i=N;i>0;i--)p.push(pointAt(s,i/N,1));for(let j=N;j>0;j--)p.push(pointAt(s,0,j/N));return p;}

// ---------- rendering ----------
function tri(ctx,img,sw,sh,s0,s1,s2,d0,d1,d2){
  const cx=(d0[0]+d1[0]+d2[0])/3,cy=(d0[1]+d1[1]+d2[1])/3,grow=p=>{const dx=p[0]-cx,dy=p[1]-cy,l=Math.hypot(dx,dy)||1;return [p[0]+dx/l*.6,p[1]+dy/l*.6];};
  const den=(s1[0]-s0[0])*(s2[1]-s0[1])-(s2[0]-s0[0])*(s1[1]-s0[1]);if(!den)return;
  const a=((d1[0]-d0[0])*(s2[1]-s0[1])-(d2[0]-d0[0])*(s1[1]-s0[1]))/den,b=((d1[1]-d0[1])*(s2[1]-s0[1])-(d2[1]-d0[1])*(s1[1]-s0[1]))/den,
    c=((d2[0]-d0[0])*(s1[0]-s0[0])-(d1[0]-d0[0])*(s2[0]-s0[0]))/den,d=((d2[1]-d0[1])*(s1[0]-s0[0])-(d1[1]-d0[1])*(s2[0]-s0[0]))/den;
  const [e0,e1,e2]=[grow(d0),grow(d1),grow(d2)];
  ctx.save();ctx.beginPath();ctx.moveTo(e0[0],e0[1]);ctx.lineTo(e1[0],e1[1]);ctx.lineTo(e2[0],e2[1]);ctx.closePath();ctx.clip();
  ctx.setTransform(a,b,c,d,d0[0]-a*s0[0]-c*s0[1],d0[1]-b*s0[0]-d*s0[1]);ctx.drawImage(img,0,0,sw,sh);ctx.restore();
}
function warp(ctx,img,s,W,H){
  if(s.wrap==='cap'){
    // Two source triangles share the vertical crease; their bottom edges continue the two side faces' top edges.
    const sw=img.width,sh=img.height,S=[[0,sh],[sw/2,0],[sw,sh],[sw/2,sh]],D=corners(s).map(([x,y])=>[x*W,y*H]);
    tri(ctx,img,sw,sh,S[0],S[1],S[3],D[0],D[1],D[3]);
    tri(ctx,img,sw,sh,S[1],S[2],S[3],D[1],D[2],D[3]);
    return;
  }
  const flat=s.cols===1&&s.rows===1,N=flat?10:Math.max(12,4*Math.max(s.cols,s.rows)),sw=img.width,sh=img.height,P=[];
  for(let j=0;j<=N;j++)for(let i=0;i<=N;i++){const p=pointAt(s,i/N,j/N);P.push([p[0]*W,p[1]*H]);}
  const S=(i,j)=>[i/N*sw,j/N*sh],D=(i,j)=>P[j*(N+1)+i];
  for(let j=0;j<N;j++)for(let i=0;i<N;i++){
    tri(ctx,img,sw,sh,S(i,j),S(i+1,j),S(i+1,j+1),D(i,j),D(i+1,j),D(i+1,j+1));
    tri(ctx,img,sw,sh,S(i,j),S(i+1,j+1),S(i,j+1),D(i,j),D(i+1,j+1),D(i,j+1));
  }
}
const tmp=new Map();
function scratch(k,w,h){let c=tmp.get(k);if(!c){c=document.createElement('canvas');tmp.set(k,c);}if(c.width!==w||c.height!==h){c.width=w;c.height=h;}return c;}
// Test card in surface space: numbered grid, centre circle and corner marks to line up the projector.
function testCard(x,w,h,s,index){
  const hue=(index*67+170)%360;x.fillStyle='#000';x.fillRect(0,0,w,h);
  x.strokeStyle=`hsl(${hue} 90% 60%)`;x.lineWidth=2;
  for(let k=0;k<=8;k++){x.beginPath();x.moveTo(k/8*w,0);x.lineTo(k/8*w,h);x.moveTo(0,k/8*h);x.lineTo(w,k/8*h);x.stroke();}
  x.lineWidth=4;x.strokeRect(2,2,w-4,h-4);
  x.beginPath();x.arc(w/2,h/2,Math.min(w,h)*.3,0,7);x.stroke();x.beginPath();x.moveTo(w/2-20,h/2);x.lineTo(w/2+20,h/2);x.moveTo(w/2,h/2-20);x.lineTo(w/2,h/2+20);x.stroke();
  x.fillStyle='#fff';x.font=`bold ${Math.round(h*.09)}px system-ui,sans-serif`;x.textAlign='center';x.textBaseline='middle';x.fillText(`${index+1} · ${s.name}`,w/2,h*.2);
  const m=['TL','TR','BR','BL'];x.font=`bold ${Math.round(h*.05)}px system-ui,sans-serif`;
  [[.06,.08],[.94,.08],[.94,.92],[.06,.92]].forEach(([u,v],i)=>x.fillText(m[i],u*w,v*h));
}
// Draw every surface onto ctx (W×H, cleared to black). sources(source) returns the picture for 'all' or a layer number.
export function render(ctx,mapping,sources,W,H){
  ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.filter='none';ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);ctx.restore();
  mapping.surfaces.forEach((s,index)=>{
    const img=sources(s.source);if(!img&&!mapping.test)return;
    const [l,t,r,b]=s.crop,cw=Math.max(2,Math.round((r-l)*W)),ch=Math.max(2,Math.round((b-t)*H)),c=scratch(s.id,cw,ch),x=c.getContext('2d');
    x.globalCompositeOperation='source-over';x.clearRect(0,0,cw,ch);
    if(mapping.test)testCard(x,cw,ch,s,index);else x.drawImage(img,l*img.width,t*img.height,(r-l)*img.width,(b-t)*img.height,0,0,cw,ch);
    if(s.mask==='ellipse'||s.feather>0){
      x.globalCompositeOperation='destination-in';const f=s.feather;
      if(s.mask==='ellipse'){x.save();x.translate(cw/2,ch/2);x.scale(cw/2,ch/2);const g=x.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,'#000');g.addColorStop(Math.max(0,1-f*2),'#000');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(-1,-1,2,2);x.restore();}
      else{
        const edge=(x0,y0,x1,y1)=>{const g=x.createLinearGradient(x0,y0,x1,y1);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'#000');return g;};
        const fw=f*cw,fh=f*ch;
        // Multiply four edge ramps: draw each into destination-in (alpha multiplies).
        for(const [g,rx,ry,rw,rh] of [[edge(0,0,fw,0),0,0,cw,ch],[edge(cw,0,cw-fw,0),0,0,cw,ch],[edge(0,0,0,fh),0,0,cw,ch],[edge(0,ch,0,ch-fh),0,0,cw,ch]]){x.fillStyle=g;x.fillRect(rx,ry,rw,rh);}
      }
      x.globalCompositeOperation='source-over';
    }
    ctx.save();ctx.globalAlpha=s.opacity;ctx.globalCompositeOperation=mapping.test?'source-over':'lighter';warp(ctx,c,s,W,H);ctx.restore();
  });
}

// ---------- presets ----------
const R=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
export const PRESETS={
  'Single screen':()=>[surface('s1','Screen',R(.1,.1,.9,.9))],
  'Cube (3 faces)':()=>{
    const c=[.5,.5],t=[.5,.14],l=[.21,.31],r=[.79,.31],bl=[.21,.69],br=[.79,.69],b=[.5,.86];
    return [surface('top','Top',[l,t,r,c],{crop:[0,0,1,.5],wrap:'cap'}),surface('left','Left',[l,c,b,bl],{crop:[0,.5,.5,1]}),surface('right','Right',[c,r,br,b],{crop:[.5,.5,1,1]})];
  },
  'Span 2 (side by side)':()=>[surface('a','Left',R(.03,.2,.48,.8),{crop:[0,0,.5,1]}),surface('b','Right',R(.52,.2,.97,.8),{crop:[.5,0,1,1]})],
  'Span 3 (triptych)':()=>[0,1,2].map(i=>surface('p'+(i+1),['Left','Centre','Right'][i],R(.02+i*.33,.25,.31+i*.33,.75),{crop:[i/3,0,(i+1)/3,1]})),
  'Corridor (L · C · R)':()=>[surface('l','Left wall',[[0,0],[.3,.2],[.3,.8],[0,1]],{crop:[0,0,.3,1]}),surface('c','Back wall',R(.3,.2,.7,.8),{crop:[.3,0,.7,1]}),surface('r','Right wall',[[.7,.2],[1,0],[1,1],[.7,.8]],{crop:[.7,0,1,1]})],
  'Dome / curved wall':()=>[regrid(surface('d','Curved wall',R(.06,.12,.94,.88)),3,2)].map(s=>{s.pts=s.pts.map(([x,y],k)=>{const i=k%4,j=Math.floor(k/4);return [x,y+(j===1?0:(j===0?-.07:.07)*Math.sin(i/3*Math.PI))];});return s;}),
  'Circle':()=>[surface('o','Circle',R(.25,.06,.75,.94),{mask:'ellipse',feather:.04})]
};
