import earcut from './vendor/earcut.js';
// Triangulates one polygon given as [[x,y,z],…]; returns local index triples.
// Triangles and convex quads fan; larger or concave n-gons (walls with openings, L-shapes) are ear-clipped on their best-fit plane.
export function triangulate(pts){
  const n=pts.length,fan=()=>{const t=[];for(let k=1;k+1<n;k++)t.push([0,k,k+1]);return t;};
  if(n<4)return n===3?[[0,1,2]]:[];
  if(pts.some(p=>!p))return fan();
  const N=[0,0,0];for(let i=0;i<n;i++){const a=pts[i],b=pts[(i+1)%n];N[0]+=(a[1]-b[1])*(a[2]+b[2]);N[1]+=(a[2]-b[2])*(a[0]+b[0]);N[2]+=(a[0]-b[0])*(a[1]+b[1]);}
  const ax=N.map(Math.abs),drop=ax[2]>=ax[0]&&ax[2]>=ax[1]?2:ax[0]>=ax[1]?0:1,[u,v]=[[1,2],[0,2],[0,1]][drop];
  if(n===4){// A quad is convex when all corners turn the same way in its plane.
    let s=0;for(let i=0;i<4;i++){const a=pts[i],b=pts[(i+1)%4],c=pts[(i+2)%4],z=(b[u]-a[u])*(c[v]-b[v])-(b[v]-a[v])*(c[u]-b[u]);s|=z>0?1:z<0?2:0;}
    if(s!==3)return fan();}
  const flat=[];for(const p of pts)flat.push(p[u],p[v]);
  const idx=earcut(flat);if(idx.length/3<n-2)return fan();
  const t=[];for(let i=0;i<idx.length;i+=3)t.push([idx[i],idx[i+1],idx[i+2]]);return t;
}
