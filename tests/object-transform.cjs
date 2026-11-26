const assert=require('node:assert/strict');
(async()=>{
  const {rotatePoint,transformView,projectPoint,legacyPosition,soundTransform}=await import('../pro/object-transform.js');
  const angles=[23,-37,61],position=[.2,-.4,.8],point=[.7,.3,-.5];
  const restored=rotatePoint(rotatePoint(point,angles),angles,true);
  restored.forEach((v,i)=>assert.ok(Math.abs(v-point[i])<1e-12));
  const view=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,-4,1]);
  const full=view.slice(),split=view.slice();
  transformView(full,position,angles);
  transformView(split,[0,0,0],angles);transformView(split,position,angles,true);
  full.forEach((v,i)=>assert.ok(Math.abs(v-split[i])<1e-6,'Native and point-cloud transforms agree'));
  const transformed=rotatePoint(point,angles).map((v,i)=>v+position[i]);
  for(let r=0;r<3;r++){
    const actual=full[r]*point[0]+full[4+r]*point[1]+full[8+r]*point[2]+full[12+r];
    assert.ok(Math.abs(actual-(transformed[r]-(r===2?4:0)))<1e-6);
  }
  const camera={distance:4,f:1,aspect:16/9,yaw:.6,tilt:.3,panX:0,panY:0};
  const screen=projectPoint(legacyPosition(25,10,camera),camera,960,540);
  assert.ok(Math.abs(screen[0]-720)<1e-9);
  assert.ok(Math.abs(screen[1]-324)<1e-9);
  const {gizmoFromFrame,dragGizmo}=await import('../pro/map3d.js'),
    transform={x:0,y:0,z:0,rx:0,ry:0,rz:0,sx:1,sy:1,sz:1,scale:1},
    gizmo=size=>gizmoFromFrame({R:[1,0,0,0,1,0,0,0,1],S:size,c:[0,0,0],ring:1,
      toScreen:p=>[480+p[0]*100+p[2]*40,270-p[1]*100-p[2]*20,10+p[2]]},transform),
    small=gizmo([1,1,1]),large=gizmo([2,10,3]),tiny=gizmo([.01,.01,.01]);
  assert.ok(Math.hypot(...large.move[0].map((v,i)=>v-large.c[i]))>5*Math.hypot(...small.move[0].map((v,i)=>v-small.c[i])),'Move handles grow with the full object bounds');
  assert.deepEqual(tiny.move,small.move,'Tiny objects retain usable move handles');
  for(const G of [small,large]){
    const moved=dragGizmo(G,transform,{tool:'move',axis:0},G.move[0],[G.move[0][0]+40,G.move[0][1]]);
    assert.equal(moved.x,.4,'Larger handles must not change translation sensitivity');
    assert.equal(moved.y,0);assert.equal(moved.z,0);
  }
  const perspective=size=>gizmoFromFrame({R:[1,0,0,0,1,0,0,0,1],S:size,c:[0,0,0],ring:1,
    moveLimits:[36,160],toScreen:p=>projectPoint(p,camera,960,540)},transform),
    compact=perspective([.1,.1,.1]),expanded=perspective([100,100,100]);
  for(const G of [compact,expanded]){
    const lengths=G.move.map(p=>Math.hypot(p[0]-G.c[0],p[1]-G.c[1]));
    assert.ok(Math.max(...lengths)>=36-1e-9&&Math.max(...lengths)<=160+1e-9,'Screen limits keep tiny and oversized gizmos usable');
  }
  const drag=G=>dragGizmo(G,transform,{tool:'move',axis:0},G.move[0],[G.move[0][0]+40,G.move[0][1]]);
  assert.deepEqual(drag(compact),drag(expanded),'Perspective drag sensitivity is independent of gizmo size');
  const apply=(m,v)=>[0,1,2].map(r=>m[r*3]*v[0]+m[r*3+1]*v[1]+m[r*3+2]*v[2]);
  const pose={position,rotation:angles},neutral=soundTransform(pose,{pG3EfScale:100,pG3EfRX:60,pG3EfX:100},.6,0);
  apply(neutral.matrix,point).map((v,i)=>v+neutral.offset[i]).forEach((v,i)=>assert.ok(Math.abs(v-point[i])<1e-12,'Disconnected/quiet sound preserves the world pose'));
  const grow=soundTransform({position:[0,0,0],rotation:[0,0,0]},{pG3EfScale:100,pG3ScY:50,pG3Anchor:100},.6,1);
  const bottom=[0,-.7*.6,0];
  assert.ok(Math.abs(apply(grow.matrix,bottom)[1]+grow.offset[1]-bottom[1])<1e-12,'Uniform and axis sound scale grow from the same base');
  const moved=soundTransform({position:[0,0,0],rotation:[0,90,0]},{pG3EfX:100},.6,1);
  assert.ok(Math.abs(moved.offset[2]+1.8)<1e-12,'Sound movement follows the object local axes');
  const animated=soundTransform(pose,{pG3ScX:80,pG3ScY:25,pG3ScZ:-40,pG3EfRX:37,pG3EfRY:-19,pG3EfRZ:22},.6,1),
    tangent=apply(animated.matrix,rotatePoint([1,0,0],angles)),normal=apply(animated.normals,rotatePoint([0,1,0],angles));
  assert.ok(Math.abs(tangent.reduce((sum,v,i)=>sum+v*normal[i],0))<1e-12,'Nonuniform sound scaling keeps transformed normals perpendicular');
  const {validate,VERSION}=await import('../pro/graph.js');
  const old={format:'audiograph-pro',version:19,settings:{camera:{zoom:55,turn:25,tilt:18}},layers:[{id:'l',name:'Transform',visible:true,opacity:1,blend:'source-over',nodes:[
    {id:'c',type:'cloner',x:0,y:0,props:{x:25,y:10,scale:200}},{id:'out',type:'output',x:400,y:0,props:{}}],
    edges:[{from:'c',out:'shape',to:'out',input:'image'}]}]};
  const migrated=validate(old),props=migrated.layers[0].nodes[0].props;
  assert.equal(migrated.version,VERSION);assert.equal(props.x,0);assert.equal(props.y,0);assert.equal(props.scale,400);
  assert.ok(Math.hypot(props.moveX,props.moveY,props.moveZ)>0);
  assert.deepEqual(validate(migrated),migrated);
  const implicit=structuredClone(old);implicit.version=16;delete implicit.settings.camera;
  Object.assign(implicit.layers[0].nodes[0],{type:'waveform3d',props:{x:25,y:10}});
  const implicitPose=validate(implicit).layers[0].nodes.find(n=>n.id==='c').props,
    expected=legacyPosition(25,10,{...camera,distance:.78/Math.sin(.4)*.92/.55,yaw:0,tilt:18*Math.PI/180});
  expected.forEach((v,i)=>assert.ok(Math.abs(v-implicitPose[['moveX','moveY','moveZ'][i]])<1e-10,'Legacy offsets use the original implicit lens, not the new zoomed-out camera'));
  console.log('ok - Shared world transforms, native/point-cloud matrices, inverse rotations and legacy positioning');
})().catch(error=>{console.error(error);process.exit(1);});
