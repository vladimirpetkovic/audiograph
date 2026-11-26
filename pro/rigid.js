import {World,Body,Box,Sphere,Vec3,Quaternion,Material,ContactMaterial,SAPBroadphase} from './vendor/cannon-es.js';

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
    const id=Math.round(arr[o+15]);
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
  axes[1]*=Math.exp(u[200]*1.6*(2*random(i,60,Math.round(u[75]))/4294967295-1));
  return axes;
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
    this.world=new World({gravity:new Vec3(0,-9.81,0),allowSleep:true});
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
    const floorShape=this.floor.shapes[0];
    if(floorShape.halfExtents.x!==half){
      floorShape.halfExtents.set(half,.05,half);floorShape.updateConvexPolyhedronRepresentation();
      floorShape.updateBoundingSphereRadius();this.floor.updateBoundingRadius();this.floor.aabbNeedsUpdate=true;
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
        g.levels[i]=level;g.data[i*12+3]=level;
        if(rise>.002)b.applyImpulse(new Vec3(
          (mods.pG3EfX||0)/100*rise*p.soundForce*b.mass,
          rise*p.soundForce*b.mass*(1+(mods.pG3EfY||0)/100),
          (mods.pG3EfZ||0)/100*rise*p.soundForce*b.mass));
        const torque=((mods.pG3Spin||0)/100+rise*(mods.pG3EfRot||0)/180)*b.mass;
        if(torque)b.applyTorque(new Vec3(0,torque,0));
        const gravity=mods._rigidGravity??p.bodyGravity;
        const wind=mods._rigidWind??0,swirl=mods._rigidSwirl??0;
        const noise=(mods._rigidTurbulence??0)/100;
        const field=mods._sim?.g3Field,strength=(mods.pG3FieldAmt||0)/100;
        if(gravity!==9.81||wind||swirl||noise||strength&&field&&field!=='none'){
          const t=this.world.time;
          const size=Math.max(.01,(mods.pG3FieldSize??100)/100*g.u[28]*3),time=t*(mods.pG3FieldSpd??50)/50;
          const wave=field==='ripple'?Math.sin(Math.hypot(b.position.x,b.position.z)/size*Math.PI-time*2):
            field==='noise'?Math.sin(b.position.x/size*4+time)*Math.cos(b.position.z/size*3-time*.6):
              Math.sin(Math.PI*(b.position.x/size+b.position.z/size*.5)-time*2);
          const lift=field&&field!=='none'?wave*strength*10*(.35+level):0;
          b.applyForce(new Vec3(
            b.mass*(wind-swirl*b.position.z+noise*10*Math.sin(t*2.13+i*1.7)),
            b.mass*(9.81-gravity+lift+noise*10*Math.sin(t*1.71+i*2.3)),
            b.mass*(swirl*b.position.x+noise*10*Math.cos(t*1.93+i*2.7))));
        }
        this.updateShape(g,i);
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
    const g={key,data:new Float32Array(data),u:new Float32Array(u),bounds,props,mods,rotation,inverse,origin:V(origin),bodies:[],levels:new Float32Array(data.length/12),centers:[]};
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
      const b=new Body({mass:props.mass,shape,material,linearDamping:props.damping,angularDamping:props.damping,sleepSpeedLimit:.06,sleepTimeLimit:1});
      const local=new Quaternion().setFromEuler(...data.subarray(o+4,o+7),'ZXY');
      rotation.mult(local,b.quaternion);
      const center=bound.center.map((v,j)=>v*axes[j]);
      center[1]+=u[195]*.7*(axes[1]-u[31]*data[o+7]);
      local.vmult(V(center),b.position);b.position.vadd(V(Array.from(data.subarray(o,o+3))),b.position);
      rotation.vmult(b.position,b.position);b.position.vadd(g.origin,b.position);this.world.addBody(b);
      g.bodies.push(b);g.centers.push(center);g.levels[i]=soundAt(data,i,u);
    }
    this.groups.set(id,g);return g;
  }
  update(id,u,props,mods){
    const g=this.groups.get(id);if(!g)return;
    g.u.set(u);g.props=props;g.mods=mods;
    for(const b of g.bodies){
      if(b.mass!==props.mass){b.mass=props.mass;b.updateMassProperties();b.wakeUp();}
      b.material.friction=props.friction;b.material.restitution=props.bounce;
      b.linearDamping=mods._rigidDrag??props.damping;b.angularDamping=b.linearDamping;
    }
    g.contact.friction=props.friction;g.contact.restitution=props.bounce;
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
    g.centers[i][1]+=g.u[195]*.7*(axes[1]-g.u[31]*g.data[i*12+7]);
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
  scene.rigidModel=model=>{
    const c=scene.rigidConfig,scale=w.__agCam?.scale;
    if(!c?.props.rigidBody||!scale)return model;
    c.world.rendered.add(c.id);
    const u=new Float32Array(1264),key=['classic',model.verts.length,scale,c.props.collisionShape].join('|');
    u[31]=scale;u[89]=u[90]=u[91]=1;
    for(let i=0;i<64;i++)u[96+i]=(c.audio?.freq?.[Math.floor(i*(c.audio.freq.length-1)/63)]||0)/255;
    u[46]=c.audio?.drive?.beat||0;
    if(c.world.groups.get(c.id)?.key!==key){
      const arr=new Float32Array(model.verts.length*16);
      model.verts.forEach((v,i)=>arr.set([v[0],-v[1],v[2]],i*16));
      const data=new Float32Array([0,0,0,0,0,0,0,1,.18,0,.5,0]);
      c.world.register(c.id,key,data,u,meshBounds(arr),[c.object?.shape],c.props,c.mods);
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
    if(!c?.props.rigidBody){if(upload)release();return;}
    c.world.rendered.add(c.id);
    if(dev!==device){release();dev=device;}
    scene.matrix=Array.from(st.cu.slice(0,16));scene.distance=st.g3dist;
    const origin=scene.mapper()?.([0,0,0])??[0,0,0];
    const key=keyOf(st,mesh,n,c)+'|'+origin.map(v=>Math.round(v*10000)).join(','),group=c.world.groups.get(c.id);
    if(group?.key===key){
      if(group.meshArray!==mesh.arr){group.bounds=meshBounds(mesh.arr);group.meshArray=mesh.arr;}
      c.world.update(c.id,st.cu,c.props,c.mods);
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
    // This is the only GPU readback: seed the bodies from the actual generated clone transforms.
    queueMicrotask(async()=>{
      try{
        await buffer.mapAsync(GPUMapMode.READ);
        const data=new Float32Array(buffer.getMappedRange()).slice();
        if(token===generation&&c.world.epoch===epoch&&scene.rigidConfig?.id===c.id&&scene.rigidConfig.world===c.world)c.world.register(c.id,key,data,u,bounds,shapes,c.props,c.mods,origin);
      }catch(error){if(token===generation)c.world.errors.set(c.id,'Rigid bodies: '+error.message);}
      finally{buffer.destroy();if(pending===buffer)pending=null;}
    });
  };
  scene.disposeRigid=release;
}
