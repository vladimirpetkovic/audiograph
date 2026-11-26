import {World,Body,Box,Sphere,Cylinder,Vec3,Quaternion,Material,ContactMaterial,SAPBroadphase} from './vendor/cannon-es.js';

const STEP=1/120;
const V=(a)=>new Vec3(...a);
const euler=q=>{
  const {x,y,z,w}=q;
  const m12=2*(x*y-z*w),m22=1-2*(x*x+z*z),m31=2*(x*z-y*w),m32=2*(y*z+x*w),m33=1-2*(x*x+y*y);
  const rx=Math.asin(Math.max(-1,Math.min(1,m32)));
  return Math.abs(m32)<.9999999?[rx,Math.atan2(-m31,m33),Math.atan2(-m12,m22)]:
    [rx,0,Math.atan2(2*(x*y+z*w),1-2*(y*y+z*z))];
};
export function meshBounds(arr){
  const bounds=[];
  for(let o=0;o<arr.length;o+=16){
    const id=Math.floor(arr[o+15]+.001);
    const b=bounds[id]??={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
    for(let j=0;j<3;j++){b.min[j]=Math.min(b.min[j],arr[o+j]);b.max[j]=Math.max(b.max[j],arr[o+j]);}
  }
  return bounds.map(b=>({center:b.min.map((v,j)=>(v+b.max[j])/2),half:b.min.map((v,j)=>Math.max(.001,(b.max[j]-v)/2))}));
}
function random(i,k,seed){
  const s=(Math.imul((Math.imul(i,9781)+Math.imul(k,6271)+Math.imul(seed,26699)+1)>>>0,747796405)+2891336453)>>>0;
  const w=Math.imul((s>>>((s>>>28)+4))^s,277803737)>>>0;
  return ((w>>>22)^w)>>>0;
}
function scaleOf(data,i,u){
  const o=i*12,v=data[o+3],scale=data[o+7]*u[31];
  const axes=[0,1,2].map(j=>Math.max(.02,1+u[192+j]*v)*u[89+j]*scale);
  for(const [j,k,amount] of [[0,61,u[1260]||0],[1,60,u[200]||0],[2,62,u[1262]||0]])
    axes[j]*=Math.exp(amount*1.6*(2*random(i,k,Math.round(u[75]))/4294967295-1));
  return axes;
}
function instanceMapper(data,i,u,map){
  const o=i*12,axes=scaleOf(data,i,u),anchor=u[195]*.7;
  const rotation=new Quaternion().setFromEuler(...data.subarray(o+4,o+7),'ZXY');
  return (x,y,z)=>{
    const p=rotation.vmult(new Vec3(x*axes[0],y*axes[1]+anchor*(axes[1]-u[31]),z*axes[2]));
    const point=map([p.x+data[o],p.y+data[o+1],p.z+data[o+2]]);
    if(!point.every(Number.isFinite))throw Error('Collider transform is invalid');
    return point;
  };
}
export function instanceBoxBounds(arr,data,u,map){
  const bounds=meshBounds(arr),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<data.length/12;i++){
    const bound=bounds[Math.round(data[i*12+9])];
    if(!bound)throw Error('Cloner mesh bounds are missing');
    const point=instanceMapper(data,i,u,map);
    for(let corner=0;corner<8;corner++){
      const p=point(...bound.center.map((v,j)=>v+bound.half[j]*(corner&(1<<j)?1:-1)));
      for(let j=0;j<3;j++){min[j]=Math.min(min[j],p[j]);max[j]=Math.max(max[j],p[j]);}
    }
  }
  return {min,max};
}
export function instanceCollider(arr,data,u,map,previousFaces){
  const groups=[];
  for(let o=0;o<arr.length;o+=48){
    const id=Math.floor(arr[o+15]+.001);
    (groups[id]||=[]).push(o);
  }
  const count=Array.from({length:data.length/12},(_,i)=>groups[Math.round(data[i*12+9])]?.length||0).reduce((a,b)=>a+b,0);
  if(count>500000)throw Error('Particle collision supports up to 500,000 triangles across the scene');
  const verts=[],faces=previousFaces?.length===count?previousFaces:[];
  for(let i=0;i<data.length/12;i++){
    const o=i*12,point=instanceMapper(data,i,u,map);
    for(const start of groups[Math.round(data[o+9])]||[]){
      const first=verts.length;
      for(let j=0;j<3;j++){
        const k=start+j*16;
        verts.push(point(arr[k],arr[k+1],arr[k+2]));
      }
      if(faces!==previousFaces)faces.push([first,first+1,first+2]);
    }
  }
  return {verts,faces,world:true};
}
function soundAt(data,i,u){
  const seed=Math.round(u[75]),hr=k=>random(i,k,seed)/4294967295;
  const x=Math.max(0,Math.min(1,data[i*12+8]*(1-u[80])+hr(1)*u[80])),f=x*63,a=Math.floor(f),b=Math.min(63,a+1);
  const sample=offset=>u[offset+a]*(1-(f-a))+u[offset+b]*(f-a);
  let sv=sample(96);
  if(u[203]>.001){
    const count=data.length/12,idx=count>1?i/(count-1):.5,lag=u[203]*idx*14,fa=Math.floor(lag),t=lag-fa;
    sv=sample(208+fa*64)*(1-t)+sample(208+(fa+1)*64)*t;
  }
  const gain=Math.max(0,1+u[81]*(2*hr(2)-1));
  return Math.max(0,sv*(.9+1.1*x)*gain+.35*u[46]*(1-.6*u[80]*hr(3)));
}

export class RigidWorld{
  constructor(){
    this.world=new World({gravity:new Vec3(0,0,0),allowSleep:true});
    this.world.broadphase=new SAPBroadphase(this.world);
    this.world.solver.iterations=12;
    this.groups=new Map();this.errors=new Map();this.steps=0;this.epoch=0;this.rendered=new Set();
    this.floor=new Body({mass:0,shape:new Box(new Vec3(10,.05,10))});
    this.floor.material=new Material({friction:.5,restitution:.6});
    this.world.addBody(this.floor);
  }
  reset(){
    this.epoch++;
    for(const id of [...this.groups.keys()])this.remove(id);
    this.errors.clear();this.world.time=0;this.world.accumulator=0;this.steps=0;
  }
  remove(id){
    const group=this.groups.get(id);
    if(group)for(const b of group.bodies)this.world.removeBody(b);
    if(group?.contact)this.world.removeContactMaterial(group.contact);
    this.groups.delete(id);this.errors.delete(id);
  }
  begin(dt,ground,ids){
    this.rendered.clear();
    for(const id of this.groups.keys())if(!ids.has(id))this.remove(id);
    for(const id of this.errors.keys())if(!ids.has(id))this.errors.delete(id);
    const enabled=ground.enabled;
    const groundChanged=enabled!==!!this.floor.world;
    if(enabled&&!this.floor.world)this.world.addBody(this.floor);
    if(!enabled&&this.floor.world)this.world.removeBody(this.floor);
    if(groundChanged)for(const g of this.groups.values())for(const b of g.bodies)b.wakeUp();
    const half=Math.max(.1,ground.size/2);
    const key=ground.shape+':'+half;
    if(this.floorKey!==key){
      this.floor.removeShape(this.floor.shapes[0]);
      this.floor.addShape(ground.shape==='circle'?new Cylinder(half,half,.1,64):new Box(new Vec3(half,.05,half)));
      this.floorKey=key;this.floor.updateBoundingRadius();this.floor.aabbNeedsUpdate=true;
      for(const g of this.groups.values())for(const b of g.bodies)b.wakeUp();
    }
    if(this.floor.position.y!==ground.height-.05){
      this.floor.position.set(0,ground.height-.05,0);this.floor.aabbNeedsUpdate=true;
      for(const g of this.groups.values())for(const b of g.bodies)b.wakeUp();
    }
    if(!(dt>0))return;
    for(const g of this.groups.values()){
      const p=g.props,mods=g.mods;
      for(let i=0;i<g.bodies.length;i++){
        const b=g.bodies[i],level=soundAt(g.data,i,g.u),rise=Math.max(0,level-g.levels[i]);
        g.levels[i]=level;g.data[i*12+3]=level;g.data[i*12+7]=g.baseScales[i]*Math.max(.02,1+g.u[35]*level);
        this.updateShape(g,i);
        const gravity=p.rigidBody||p.gravityBody?(mods._rigidGravity??0):0;
        b.force.y-=b.mass*gravity;
        if(!p.rigidBody)continue;
        const impulse=mods._soundEffector?(mods._rigidSoundForce??p.soundForce??5):0;
        if(rise>.002)b.applyImpulse(new Vec3(
          (mods.pG3EfX||0)/100*rise*impulse*b.mass,
          rise*impulse*b.mass*(1+(mods.pG3EfY||0)/100),
          (mods.pG3EfZ||0)/100*rise*impulse*b.mass));
        const torque=rise*b.mass/180;
        if(mods.pG3Spin||mods.pG3EfRX||mods.pG3EfRY||mods.pG3EfRZ)b.applyTorque(new Vec3(
          (mods.pG3EfRX||0)*torque,(mods.pG3Spin||0)/100*b.mass+(mods.pG3EfRY||0)*torque,(mods.pG3EfRZ||0)*torque));
        const wind=mods._rigidWind??0,swirl=mods._rigidSwirl??0;
        const noise=(mods._rigidTurbulence??0)/100;
        const attract=mods._rigidAttract??0,target=mods._attractPoint||[0,0,0];
        if(attract){
          const delta=new Vec3(...target).vsub(b.position),scale=b.mass*attract/(1+.5*delta.length());
          b.applyForce(delta.scale(scale));
        }
        const field=g.nativeEffects?null:mods._sim?.g3Field,strength=(mods.pG3FieldAmt||0)/100;
        if(wind||swirl||noise||strength&&field&&field!=='none'){
          const t=this.world.time;
          const size=Math.max(.01,(mods.pG3FieldSize??100)/100*g.u[28]*3),time=t*(mods.pG3FieldSpd??50)/50;
          const wave=field==='ripple'?Math.sin(Math.hypot(b.position.x,b.position.z)/size*Math.PI-time*2):
            field==='noise'?Math.sin(b.position.x/size*4+time)*Math.cos(b.position.z/size*3-time*.6):
              Math.sin(Math.PI*(b.position.x/size+b.position.z/size*.5)-time*2);
          const lift=field&&field!=='none'?wave*strength*10*(.35+level):0;
          b.applyForce(new Vec3(
            b.mass*(wind-swirl*b.position.z+noise*10*Math.sin(t*2.13+i*1.7)),
            b.mass*(lift+noise*10*Math.sin(t*1.71+i*2.3)),
            b.mass*(swirl*b.position.x+noise*10*Math.cos(t*1.93+i*2.7))));
        }
      }
    }
    this.world.step(STEP,Math.min(dt,1/15),8);this.steps++;
  }
  register(id,key,data,u,bounds,shapes,props,mods,origin=[0,0,0]){
    if(!data.length||data.length%12||!data.every(Number.isFinite)||
      Array.from({length:data.length/12},(_,i)=>Math.round(data[i*12+9])).some(id=>!bounds[id]))
      throw Error('Rigid-body mesh transforms or bounds are invalid');
    this.remove(id);
    const rotation=new Quaternion().setFromEuler(
      (mods.pG3GrX||0)*Math.PI/180,(mods.pG3GrY||0)*Math.PI/180,(mods.pG3GrZ||0)*Math.PI/180,'ZXY');
    const inverse=rotation.inverse();
    const g={key,data:new Float32Array(data),effectData:new Float32Array(data),effectU:new Float32Array(u),u:new Float32Array(u),bounds,props,mods,rotation,inverse,origin:V(origin),bodies:[],levels:new Float32Array(data.length/12),centers:[]};
    g.baseScales=Array.from({length:data.length/12},(_,i)=>data[i*12+7]/Math.max(.02,1+u[35]*data[i*12+3]));
    const material=new Material({friction:props.friction,restitution:props.bounce});
    g.contact=new ContactMaterial(material,this.floor.material,{friction:props.friction,restitution:props.bounce});
    this.world.addContactMaterial(g.contact);
    for(let i=0;i<data.length/12;i++){
      const o=i*12,sid=Math.round(data[o+9]),bound=bounds[sid];
      if(!bound)throw Error('Rigid-body mesh bounds are missing');
      const axes=scaleOf(data,i,u);
      const half=bound.half.map((v,j)=>Math.max(.002,v*axes[j]));
      const sphere=props.collisionShape==='sphere'||props.collisionShape==='auto'&&shapes[sid]==='sphere';
      const shape=sphere?new Sphere(Math.max(...half)):new Box(V(half));
      const b=new Body({mass:props.mass,shape,material,linearDamping:props.damping,angularDamping:props.damping,sleepSpeedLimit:.06,sleepTimeLimit:1,
        collisionFilterGroup:props.rigidBody?2:4,collisionFilterMask:props.rigidBody?3:1});
      const local=new Quaternion().setFromEuler(...data.subarray(o+4,o+7),'ZXY');
      rotation.mult(local,b.quaternion);
      const center=bound.center.map((v,j)=>v*axes[j]);
      center[1]+=u[195]*.7*(axes[1]-u[31]);
      local.vmult(V(center),b.position);b.position.vadd(V(Array.from(data.subarray(o,o+3))),b.position);
      rotation.vmult(b.position,b.position);b.position.vadd(g.origin,b.position);this.world.addBody(b);
      g.bodies.push(b);g.centers.push(center);g.levels[i]=soundAt(data,i,u);
    }
    this.groups.set(id,g);return g;
  }
  applyEffects(id,data,u){
    const g=this.groups.get(id);
    if(!g)return;
    if(data.length!==g.data.length||!data.every(Number.isFinite))throw Error('Effector collision transforms are invalid');
    for(let i=0;i<g.bodies.length;i++){
      const o=i*12,b=g.bodies[i],bound=g.bounds[Math.round(data[o+9])];
      if(!bound)throw Error('Effector collision mesh bounds are missing');
      const center=(d,uniforms)=>{
        const axes=scaleOf(d,i,uniforms),p=bound.center.map((v,j)=>v*axes[j]);
        p[1]+=uniforms[195]*.7*(axes[1]-uniforms[31]);
        const q=new Quaternion().setFromEuler(...d.subarray(o+4,o+7),'ZXY');
        return {q,p:q.vmult(V(p)).vadd(V(Array.from(d.subarray(o,o+3))))};
      };
      const before=center(g.effectData,g.effectU),after=center(data,u);
      const shift=g.rotation.vmult(after.p.vsub(before.p));
      const turn=g.rotation.mult(after.q.mult(before.q.inverse())).mult(g.inverse);
      b.position.vadd(shift,b.position);turn.mult(b.quaternion,b.quaternion);
      if(shift.lengthSquared()>1e-10||Math.abs(turn.w)<.999999){b.aabbNeedsUpdate=true;b.wakeUp();}
      g.baseScales[i]=data[o+7]/Math.max(.02,1+u[35]*data[o+3]);
    }
    g.data.set(data);g.effectData.set(data);g.effectU.set(u);
    for(let i=0;i<g.bodies.length;i++)this.updateShape(g,i);
  }
  update(id,u,props,mods){
    const g=this.groups.get(id);if(!g)return;
    const gravityChanged=g.mods._rigidGravity!==mods._rigidGravity;
    g.u.set(u);g.props=props;g.mods=mods;
    for(const b of g.bodies){
      if(gravityChanged)b.wakeUp();
      const group=props.rigidBody?2:4,mask=props.rigidBody?3:1;
      if(b.collisionFilterGroup!==group||b.collisionFilterMask!==mask){
        b.collisionFilterGroup=group;b.collisionFilterMask=mask;b.aabbNeedsUpdate=true;b.wakeUp();
      }
      if(b.mass!==props.mass){b.mass=props.mass;b.updateMassProperties();b.wakeUp();}
      b.material.friction=props.friction;b.material.restitution=props.bounce;
      b.linearDamping=mods._rigidDrag??props.damping;b.angularDamping=b.linearDamping;
    }
    g.contact.friction=props.friction;g.contact.restitution=props.bounce;
    for(let i=0;i<g.bodies.length;i++){g.data[i*12+7]=g.baseScales[i]*Math.max(.02,1+u[35]*g.data[i*12+3]);this.updateShape(g,i);}
  }
  updateShape(g,i){
    const b=g.bodies[i],bound=g.bounds[Math.round(g.data[i*12+9])],axes=scaleOf(g.data,i,g.u);
    const half=bound.half.map((v,j)=>Math.max(.002,v*axes[j])),shape=b.shapes[0];
    const old=shape instanceof Sphere?[shape.radius]:[...shape.halfExtents.toArray()];
    const next=shape instanceof Sphere?[Math.max(...half)]:half;
    if(next.some((v,j)=>Math.abs(v-old[j])>.001)){
      if(shape instanceof Sphere)shape.radius=next[0];
      else{shape.halfExtents.copy(V(half));shape.updateConvexPolyhedronRepresentation();}
      shape.updateBoundingSphereRadius();b.updateBoundingRadius();b.updateMassProperties();b.aabbNeedsUpdate=true;b.wakeUp();
    }
    g.centers[i]=bound.center.map((v,j)=>v*axes[j]);
    g.centers[i][1]+=g.u[195]*.7*(axes[1]-g.u[31]);
  }
  instances(id){
    const g=this.groups.get(id);if(!g)return null;
    for(let i=0;i<g.bodies.length;i++){
      const b=g.bodies[i],o=i*12,local=g.inverse.mult(b.quaternion);
      const center=local.vmult(V(g.centers[i]));
      const position=g.inverse.vmult(b.position.vsub(g.origin)).vsub(center);
      g.data.set(position.toArray(),o);g.data.set(euler(local),o+4);
    }
    return g.data;
  }
  end(){
    for(const id of this.groups.keys())if(!this.rendered.has(id))this.remove(id);
  }
  stats(){
    return {bodies:[...this.groups.values()].reduce((n,g)=>n+g.bodies.length,0),steps:this.steps,
      groups:[...this.groups].map(([id,g])=>({id,count:g.bodies.length,positions:g.bodies.map(b=>b.position.toArray()),velocities:g.bodies.map(b=>b.velocity.toArray())})),
      contacts:this.world.contacts.length,ground:!!this.floor.world,errors:[...this.errors.values()]};
  }
}

export function installRigid(w,scene){
  let dev=null,upload=null,pending=null,generation=0;
  const release=()=>{generation++;upload?.destroy();upload=null;};
  scene.rigidBounds=base=>{
    if(scene.groundOnly)return Math.max(base,scene.groundConfig?.size||20);
    const c=scene.rigidConfig,g=c&&c.world.groups.get(c.id);
    return g?Math.max(base,...g.bodies.map(b=>b.position.distanceTo(g.origin)+b.boundingRadius)):base;
  };
  const keyOf=(st,mesh,n,c)=>[n,st.g3shape,mesh.tris,st.cu[31],...st.cu.slice(24,31),...st.cu.slice(89,92),...st.cu.slice(92,96),
    c.props.collisionShape,c.mods.pG3GrX||0,c.mods.pG3GrY||0,c.mods.pG3GrZ||0].join('|');
  const effectKeyOf=(u,c)=>{
    const values=[...u.slice(32,40),u[47],u[57],...u.slice(72,86),u[87],...u.slice(192,204),...u.slice(1260,1264)];
    if(u[85]>0)values.push(u[86]);
    if(u[196]>0&&u[197]>0)values.push(u[19]);
    const soundTransforms=[...u.slice(32,39),u[84],...u.slice(192,195),u[197]].some(v=>v!==0);
    if(c.mods._soundEffector&&soundTransforms)values.push(u[46],...u.slice(96,160),...(u[203]>0?u.slice(208,1260):[]));
    return values.join('|');
  };
  scene.rigidModel=model=>{
    const c=scene.rigidConfig,scale=w.__agCam?.scale;
    if(!c||!c.props.rigidBody&&!c.props.gravityBody||!scale)return model;
    c.world.rendered.add(c.id);
    const u=new Float32Array(1264),key=['classic',model.verts.length,scale,c.props.collisionShape].join('|');
    u[31]=scale;u[89]=u[90]=u[91]=1;
    for(let i=0;i<64;i++)u[96+i]=(c.audio?.freq?.[Math.floor(i*(c.audio.freq.length-1)/63)]||0)/255;
    u[46]=c.audio?.drive?.beat||0;
    if(c.world.groups.get(c.id)?.key!==key){
      const arr=new Float32Array(model.verts.length*16);
      model.verts.forEach((v,i)=>arr.set([v[0],-v[1],v[2]],i*16));
      const data=new Float32Array([0,0,0,0,0,0,0,1,.18,0,.5,0]);
      c.world.register(c.id,key,data,u,meshBounds(arr),[c.object?.shape],c.props,c.mods,w.__agObjectTransform?.position||[0,0,0]);
    }
    c.world.update(c.id,u,c.props,c.mods);
    const g=c.world.groups.get(c.id),b=g.bodies[0];
    const verts=model.verts.map(v=>{
      const point=b.quaternion.vmult(new Vec3(v[0]*scale,-v[1]*scale,v[2]*scale).vsub(V(g.centers[0])));
      point.vadd(b.position,point);return [point.x/scale,-point.y/scale,point.z/scale];
    });
    const normals=model.normals.map(v=>{
      const n=b.quaternion.vmult(new Vec3(v[0],-v[1],v[2]));return [n.x,-n.y,n.z];
    });
    return {...model,verts,normals};
  };
  scene.rigid=(st,enc,mesh,n,device)=>{
    const c=scene.rigidConfig;
    if(!c||!c.props.rigidBody&&!c.props.collide&&!c.props.gravityBody){if(upload)release();return;}
    c.world.rendered.add(c.id);
    if(dev!==device){release();dev=device;}
    scene.matrix=Array.from(st.cu.slice(0,16));scene.distance=st.g3dist;
    const origin=scene.mapper()?.([0,0,0])??[0,0,0];
    const key=keyOf(st,mesh,n,c)+'|'+origin.map(v=>Math.round(v*10000)).join(','),group=c.world.groups.get(c.id);
    if(group?.key===key){
      if(group.meshArray!==mesh.arr){group.bounds=meshBounds(mesh.arr);group.meshArray=mesh.arr;}
      c.world.update(c.id,st.cu,c.props,c.mods);
      const effectKey=effectKeyOf(st.cu,c);
      if(group.effectKey!==effectKey&&!pending){
        const token=generation,epoch=c.world.epoch,u=st.cu.slice(),
          buffer=dev.createBuffer({size:n*48,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
        enc.copyBufferToBuffer(st.ibuf,0,buffer,0,n*48);pending=buffer;
        queueMicrotask(async()=>{
          try{
            await buffer.mapAsync(GPUMapMode.READ);
            const data=new Float32Array(buffer.getMappedRange()).slice();
            if(token===generation&&c.world.epoch===epoch&&c.world.groups.get(c.id)===group){
              c.world.applyEffects(c.id,data,u);group.effectKey=effectKey;c.onUpdate?.();
            }
          }catch(error){if(token===generation)c.world.errors.set(c.id,'Effector collisions: '+error.message);}
          finally{buffer.destroy();if(pending===buffer)pending=null;}
        });
      }
      const data=c.world.instances(c.id);
      if(!upload||upload.size<data.byteLength){upload?.destroy();upload=dev.createBuffer({size:data.byteLength,usage:GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});}
      dev.queue.writeBuffer(upload,0,data);enc.copyBufferToBuffer(upload,0,st.ibuf,0,data.byteLength);
      return;
    }
    if(group)c.world.remove(c.id);
    if(pending)return;
    const token=generation,epoch=c.world.epoch,buffer=dev.createBuffer({size:n*48,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    const u=st.cu.slice(),bounds=meshBounds(mesh.arr),shapes=st.g3shape.split('+');
    enc.copyBufferToBuffer(st.ibuf,0,buffer,0,n*48);
    pending=buffer;
    // Seed from native transforms; later effector changes retain the collision-resolved pose.
    queueMicrotask(async()=>{
      try{
        await buffer.mapAsync(GPUMapMode.READ);
        const data=new Float32Array(buffer.getMappedRange()).slice();
        if(token===generation&&c.world.epoch===epoch&&scene.rigidConfig?.id===c.id&&scene.rigidConfig.world===c.world){
          const g=c.world.register(c.id,key,data,u,bounds,shapes,c.props,c.mods,origin);
          g.nativeEffects=true;g.effectKey=effectKeyOf(u,c);c.onUpdate?.();
        }
      }catch(error){if(token===generation)c.world.errors.set(c.id,'Rigid bodies: '+error.message);}
      finally{buffer.destroy();if(pending===buffer)pending=null;}
    });
  };
  scene.disposeRigid=release;
}
