export function rotatePoint(v,angles,inverse=false){
  const [rx,ry,rz]=angles.map(a=>a*Math.PI/180);
  const turn=(p,a,b,t)=>{const c=Math.cos(t),s=Math.sin(t),q=[...p];q[a]=p[a]*c-p[b]*s;q[b]=p[a]*s+p[b]*c;return q;};
  return inverse?turn(turn(turn(v,0,1,-rz),1,2,-rx),2,0,-ry):turn(turn(turn(v,2,0,ry),1,2,rx),0,1,rz);
}
export function rotationMatrix(angles){
  const cols=[[1,0,0],[0,1,0],[0,0,1]].map(v=>rotatePoint(v,angles));
  return Array.from({length:9},(_,i)=>cols[i%3][Math.floor(i/3)]);
}
export function transformView(view,position,angles,rotated=false){
  const old=view.slice(),p=rotated?rotatePoint(position,angles,true):position;
  if(!rotated){
    const R=rotationMatrix(angles);
    for(let c=0;c<3;c++)for(let r=0;r<4;r++)view[c*4+r]=old[r]*R[c]+old[4+r]*R[3+c]+old[8+r]*R[6+c];
  }
  for(let r=0;r<3;r++)view[12+r]+=old[r]*p[0]+old[4+r]*p[1]+old[8+r]*p[2];
}
export function projectPoint(v,c,W,H){
  const cy=Math.cos(c.yaw),sy=Math.sin(c.yaw),ct=Math.cos(c.tilt),st=Math.sin(c.tilt),
    x=v[0]*cy-v[2]*sy,z=v[0]*sy+v[2]*cy,y=v[1]*ct-z*st,depth=c.distance-(v[1]*st+z*ct),
    f=H*.5*c.f/Math.tan(.4);
  return [W*.5+(x*f+(c.panX||0)*W*.5*c.distance)/depth,H*.5-(y*f+(c.panY||0)*H*.5*c.distance)/depth,depth];
}
export function legacyPosition(x,y,c){
  const f=c.f/Math.tan(.4),vx=x*.02*c.distance*c.aspect/f,vy=-y*.02*c.distance/f,
    ct=Math.cos(c.tilt),st=Math.sin(c.tilt),cy=Math.cos(c.yaw),sy=Math.sin(c.yaw);
  return [vx*cy-vy*st*sy,vy*ct,-vx*sy-vy*st*cy];
}
export function soundTransform(pose,mods,size,level){
  const rotation=['X','Y','Z'].map(a=>(mods['pG3EfR'+a]||0)*level),
    uniform=Math.max(.02,1+(mods.pG3EfScale||0)/100*level),
    scale=['X','Y','Z'].map(a=>Math.max(.02,1+(mods['pG3Sc'+a]||0)/100*level)*uniform),
    move=['X','Y','Z'].map(a=>(mods['pG3Ef'+a]||0)/100*level*size*3),
    growth=[0,(mods.pG3Anchor||0)/100*.7*size*(scale[1]-1),0],
    localOffset=rotatePoint(growth,rotation).map((v,i)=>v+move[i]);
  const vector=(v,normal=false)=>rotatePoint(rotatePoint(rotatePoint(v,pose.rotation,true).map((x,i)=>normal?x/scale[i]:x*scale[i]),rotation),pose.rotation),
    matrix=normal=>{const cols=[[1,0,0],[0,1,0],[0,0,1]].map(v=>vector(v,normal));return Array.from({length:9},(_,i)=>cols[i%3][Math.floor(i/3)]);},
    offset=rotatePoint(localOffset,pose.rotation).map((v,i)=>v+pose.position[i]-vector(pose.position)[i]);
  return {rotation,scale,localOffset,matrix:matrix(),normals:matrix(true),offset};
}
