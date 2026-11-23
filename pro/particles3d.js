import {DEPTH_WGSL,flowPhase,routeSample,surfaceRoutes} from './scene3d.js';
import {COLLISION_WGSL} from './colliders.js';
export const SCENE_DISTANCE=.78/Math.sin(.4)*.92;
const TRAIL_POINTS=8, BASE_TRAIL_POINTS=4;
const PARTICLE_BYTES=64+TRAIL_POINTS*8;
const trailSegments=t=>`min(${TRAIL_POINTS}.0,${t}*${BASE_TRAIL_POINTS}.0)`;
const CONTROLS=`
struct ParticleControls{launch:vec4f,lens:vec4f,screen0:vec4f,screen1:vec4f,floor:vec4f};
@group(1) @binding(0) var<uniform> controls:ParticleControls;
`;
const STRUCT=`
// data: remaining lifetime, initial lifetime, random seed, palette position.
// Half-precision history fits the same particle buffer at Ultra; history.y also carries validity.
struct Part3{pos:vec4f,vel:vec4f,data:vec4f,color:vec4f,history:array<vec2u,${TRAIL_POINTS}>};
fn trailPoint(p:vec2u)->vec4f{return vec4f(unpack2x16float(p.x),unpack2x16float(p.y));}
struct Source3{pos:vec4f,color:vec4f,normal:vec4f};
`;
const STEP=STRUCT+CONTROLS+DEPTH_WGSL+`
@group(0) @binding(2) var<storage,read_write> parts:array<Part3>;
@group(0) @binding(3) var<storage,read> sources:array<Source3>;
@group(1) @binding(9) var currentSurface:texture_2d<f32>;
@group(1) @binding(10) var previousSurface:texture_2d<f32>;
${COLLISION_WGSL}
fn surfacePosition(t:texture_2d<f32>,i:u32)->vec3f{
  return vec3f(decodeSceneDepth(textureLoad(t,vec2i(i32(i),0),0)),decodeSceneDepth(textureLoad(t,vec2i(i32(i),1),0)),decodeSceneDepth(textureLoad(t,vec2i(i32(i),2),0)));
}
fn sourceAt(i:u32)->Source3{
  if(u.x8<1.5){return sources[i];}
  var s:Source3;s.pos=vec4f(surfacePosition(currentSurface,i),1.0);
  let n=vec3f(decodeSceneDepth(textureLoad(currentSurface,vec2i(i32(i),3),0)),decodeSceneDepth(textureLoad(currentSurface,vec2i(i32(i),4),0)),decodeSceneDepth(textureLoad(currentSurface,vec2i(i32(i),5),0)));
  s.normal=vec4f(n/max(length(n),0.00001),0.0);
  s.color=vec4f((s.pos.xyz-surfacePosition(previousSurface,i))/max(controls.lens.w,0.0041667),1.0);return s;
}
fn rn(i:u32,k:u32)->f32{return f32(pcg(i*9781u+k*6271u+u32(u.pseed)*26699u+911u))/4294967295.0;}
fn sphere(a:f32,b:f32)->vec3f{
  let y=2.0*b-1.0;let r=sqrt(max(0.0,1.0-y*y));let t=a*2.0*PI;
  return vec3f(r*cos(t),y,r*sin(t));
}
fn turn(v:vec3f,a:f32)->vec3f{
  let ct=cos(u.x11);let st=sin(u.x11);let q=vec3f(v.x,v.y*ct-v.z*st,v.y*st+v.z*ct);
  let c=cos(a);let s=sin(a);return vec3f(q.x*c-q.z*s,q.y,q.x*s+q.z*c);
}
fn emitterVector(v:vec3f)->vec3f{
  let q=turn(v*u.emitScale,u.x9);let ca=cos(u.emitAngle+u.erot);let sa=sin(u.emitAngle+u.erot);
  return vec3f(q.x*ca-q.y*sa,q.x*sa+q.y*ca,q.z);
}
fn releaseSound()->f32{return (u.level+u.onset)*controls.launch.z;}
fn releaseSpeed()->f32{return max(u.jet,0.075);}
fn noise3(p:vec3f)->vec3f{
  return vec3f(curlN(p.yz).x,curlN(p.zx+vec2f(13.1,7.3)).x,curlN(p.xy+vec2f(5.7,19.4)).x);
}
fn birth(i:u32)->Part3{
  var p:Part3;let a=rn(i,1u);let b=rn(i,2u);let c=rn(i,3u);let d=rn(i,4u);
  var dir=sphere(a,b);var pos=dir*0.5;var normal=dir;
  if(u.x8>0.5){
    if(u.sourceN<1.0){return p;}
    let src=sourceAt(min(u32(a*u.sourceN),u32(u.sourceN)-1u));
    pos=turn(src.pos.xyz*u.emitScale,u.x9);
    normal=turn(src.normal.xyz,u.x9);p.color=src.color;
  }else if(u.emitType>=4.0){
    if(u.sourceN<1.0){return p;}
    let src=sources[min(u32(a*u.sourceN),u32(u.sourceN)-1u)];
    pos=vec3f(src.pos.xy*u.emitScale,0.0);
    p.color=src.color;normal=normalize(pos+vec3f(0.00001));
  }else if(u.emitType<0.5){pos=dir*(0.42+0.1*specAt(a));}
  else if(u.emitType<1.5){pos=vec3f((a*2.0-1.0)*u.asp*0.92,0.96,(b-0.5)*u.x5);normal=vec3f(0.0,-1.0,0.0);}
  else if(u.emitType<2.5){pos=dir*0.03*pow(c,1.0/3.0);}
  else{pos=dir*(0.18+0.6*c);normal=normalize(cross(dir,vec3f(0.0,1.0,0.001)));}
  let ca=cos(u.emitAngle+u.erot);let sa=sin(u.emitAngle+u.erot);
  pos=vec3f(pos.x*ca-pos.y*sa,pos.x*sa+pos.y*ca,pos.z);
  normal=vec3f(normal.x*ca-normal.y*sa,normal.x*sa+normal.y*ca,normal.z);
  let speed=u.jet*(0.25+(1.6*specAt(a)+0.5*u.onset)*controls.launch.z)*(0.6+0.8*d);
  var velocity=(normal+dir*u.x10)*speed+cross(normal,vec3f(0.0,1.0,0.0))*speed*u.swirl;
  var held=0.0;
  if(u.x8>0.5){
    let ix=min(u32(a*u.sourceN),u32(u.sourceN)-1u);
    if(controls.screen0.w>0.5){
      let life=u.plife*(0.55+0.9*b);
      p.pos=vec4f(sourceAt(ix).pos.xyz,0.0);p.vel=vec4f(0.0,0.0,0.0,f32(ix)+1.0);p.data=vec4f(life,life,d,a);return p;
    }
    velocity=velocity+emitterVector(sourceAt(ix).color.xyz)*controls.launch.w;
    if(controls.launch.x>0.5){
      let sound=releaseSound();
      if(sound>0.01){velocity=velocity+normal*releaseSpeed()*sound;}
      else if(length(velocity)<0.01){held=f32(ix)+1.0;velocity=vec3f(0.0);}
    }
  }
  let life=u.plife*(0.55+0.9*b);
  p.pos=vec4f(pos,0.0);p.vel=vec4f(velocity,held);p.data=vec4f(life,life,d,a);
  return p;
}
@compute @workgroup_size(64) fn pStep3(@builtin(global_invocation_id) g:vec3u){
  let i=g.x;let n=u32(u.pn);if(i>=n){return;}
  var p=parts[i];let rel=(i+n-u32(u.pcursor))%n;
  if(rel<u32(u.pemit)){p=birth(i);}
  else if(p.data.x>0.0){
    var x=p.pos.xyz;var v=p.vel.xyz;let r=length(x)+0.001;let rd=x/r;
    var attached=false;
    if(controls.screen0.w>0.5&&u.sourceN>0.0){
      let ix=min(u32(p.data.w*u.sourceN),u32(u.sourceN)-1u);x=sourceAt(ix).pos.xyz;v=vec3f(0.0);p.vel.w=f32(ix)+1.0;attached=true;
    }else if(p.vel.w>0.0&&u.sourceN>0.0){
      let src=sourceAt(min(u32(p.vel.w-1.0),u32(u.sourceN)-1u));
      let sound=releaseSound();
      let motion=emitterVector(src.color.xyz)*controls.launch.w;
      if(sound>0.01||length(motion)>0.01){
        v=v+emitterVector(src.normal.xyz)*releaseSpeed()*sound+motion;p.vel.w=0.0;
      }else{
        var pos=turn(src.pos.xyz*u.emitScale,u.x9);
        let ca=cos(u.emitAngle+u.erot);let sa=sin(u.emitAngle+u.erot);
        x=vec3f(pos.x*ca-pos.y*sa,pos.x*sa+pos.y*ca,pos.z);v=vec3f(0.0);attached=true;
      }
    }
    if(!attached){
    var acc=vec3f(0.0,-u.pgrav,0.0)-rd*u.pattract*(1.0+u.bass*1.5)*r/(0.15+r*r);
    acc=acc+cross(vec3f(0.0,1.0,0.0),rd)*(u.pvort+u.torque*0.3)*r/(0.2+r*r);
    acc=acc+noise3(x*u.pcscale+vec3f(u.time*0.15,-u.time*0.11,u.time*0.09))*u.pcurl*(1.0+u.mid*1.5+u.treb);
    acc=acc+noise3(x*1.7+vec3f(u.time*0.3))*(select(0.5,0.0,controls.launch.x>0.5)+5.0*u.level+3.0*u.mid)*u.response*u.sstr;
    acc=acc+rd*u.bass*u.bpun*u.response*(7.0*sin(r*7.0-u.time*6.0)+9.0*u.onset)*exp(-r*0.6);
    v=(v+acc*u.dt)*exp(-u.pdrag*u.dt);v=v*min(1.0,7.0/max(length(v),0.00001));
    if(controls.launch.y>0.0||controls.floor.x>0.0){let contact=bounceScene(x,v,u.dt);x=contact.p;v=contact.v;}else{x+=v*u.dt;}
    }
    let interval=max(1.0,u.x12*${BASE_TRAIL_POINTS}.0/${TRAIL_POINTS}.0)/30.0;
    var elapsed=p.pos.w+u.dt;
    if(elapsed>=interval||p.history[0].y==0u){
      for(var j=${TRAIL_POINTS-1};j>0;j--){p.history[j]=p.history[j-1];}
      p.history[0]=vec2u(pack2x16float(p.pos.xy),pack2x16float(vec2f(p.pos.z,1.0)));elapsed=max(0.0,elapsed-interval);
    }
    p.pos=vec4f(x,elapsed);p.vel=vec4f(v,p.vel.w);p.data.x=max(0.0,p.data.x-u.dt);
  }
  parts[i]=p;
}
`;
const DRAW=STRUCT+CONTROLS+DEPTH_WGSL+`
@group(0) @binding(2) var<storage,read> parts:array<Part3>;
@group(0) @binding(3) var rampT:texture_2d<f32>;
${Array.from({length:8},(_,i)=>`@group(1) @binding(${i+1}) var occluder${i}:texture_2d<f32>;`).join('\n')}
struct VO3{@builtin(position) pos:vec4f,@location(0) uv:vec2f,@location(1) col:vec3f,@location(2) seg:f32,@location(3) depth:f32,@location(4) alpha:f32};
var<private> corners3:array<vec2f,6>=array<vec2f,6>(vec2f(-1.0,-1.0),vec2f(1.0,-1.0),vec2f(-1.0,1.0),vec2f(-1.0,1.0),vec2f(1.0,-1.0),vec2f(1.0,1.0));
fn camera3(x:vec3f)->vec3f{
  let cy=cos(u.x1);let sy=sin(u.x1);let ct=cos(u.x2);let st=sin(u.x2);
  let v=vec3f(x.x*cy-x.z*sy,x.y,x.x*sy+x.z*cy);
  return vec3f(v.x,v.y*ct-v.z*st,v.y*st+v.z*ct);
}
fn project3(x:vec3f)->vec3f{
  let v=camera3(x);let f=max(0.1,u.x4)/tan(0.4);let dist=select(2.6*f/max(0.3,u.x3),controls.lens.x,controls.lens.x>0.0);
  let z=dist-v.z;let scale=f/max(z,0.02);
  return vec3f(v.x*scale/u.asp+u.x6,v.y*scale+u.x7,z);
}
fn particleVertex(vi:u32,ii:u32)->VO3{
  var o:VO3;o.pos=vec4f(2.0,2.0,0.0,1.0);o.uv=vec2f(0.0);o.col=vec3f(0.0);o.seg=0.0;o.depth=256.0;o.alpha=1.0;
  let p=parts[ii];if(p.data.x<=0.0){return o;}
  let segment=vi/6u;
  var head=p.pos.xyz;
  if(segment>1u){head=trailPoint(p.history[segment-2u]).xyz;}
  let q=project3(head);if(q.z<=0.05){return o;}
  let age=1.0-p.data.x/max(p.data.y,0.001);let fade=smoothstep(0.0,0.06,age)*(1.0-smoothstep(0.55,1.0,age));
  let speed=length(p.vel.xyz);var t=p.data.w;
  if(u.colorBy>0.5&&u.colorBy<1.5){t=age;}else if(u.colorBy>1.5){t=clamp(speed*0.45,0.0,1.0);}
  let color=select(textureSampleLevel(rampT,smp,vec2f(t,0.5),0.0).rgb,p.color.rgb,u.emitColor>0.5&&p.color.a>0.5);
  let dist=select(2.6*max(0.1,u.x4)/tan(0.4)/max(0.3,u.x3),controls.lens.x,controls.lens.x>0.0);
  o.depth=q.z-dist;
  let sharp=max(0.2,u.psize*(0.55+0.65*fade)*(0.7+0.6*p.data.z)*dist/max(q.z,0.1));
  let blur=controls.lens.y*abs(o.depth-controls.lens.z)/max(q.z,0.1);
  let size=sqrt(sharp*sharp+blur*blur);
  let cr=corners3[vi%6u];var offset=cr;let dim=sharp*sharp/(size*size);o.uv=cr;
  if(segment>0u){
    let point=trailPoint(p.history[segment-1u]);
    let segments=${trailSegments('u.x12')};
    let fraction=clamp(segments-f32(segment-1u),0.0,1.0);
    if(point.w==0.0||fraction<=0.0){o.pos=vec4f(2.0,2.0,0.0,1.0);return o;}
    let prev=project3(mix(head,point.xyz,fraction));
    if(prev.z<=0.05){o.pos=vec4f(2.0,2.0,0.0,1.0);return o;}
    let delta=(q.xy-prev.xy)*vec2f(u.ow,u.oh)*0.5;let len=length(delta);
    if(len<0.25){o.pos=vec4f(2.0,2.0,0.0,1.0);return o;}
    let dir=delta/len;let seg=len/size;
    let along=mix(-seg,0.0,(cr.x+1.0)*0.5);
    offset=dir*along+vec2f(-dir.y,dir.x)*cr.y;o.uv=vec2f(along,cr.y);o.seg=seg;
    o.depth=mix(prev.z,q.z,(cr.x+1.0)*0.5)-dist;
    o.alpha=min(u.x12,1.0)*(1.0-f32(segment-1u)/max(${BASE_TRAIL_POINTS}.0,segments))*0.7*min(1.0,len/size);
  }
  o.pos=vec4f(q.xy+offset*size*2.0/vec2f(u.ow,u.oh),0.0,1.0);
  o.col=color*u.pglow*fade*dim*o.alpha*(0.45+0.55*clamp(speed,0.0,2.0))*(1.0+0.9*u.bass*u.bpun*u.response);
  return o;
}
@vertex fn pVS3(@builtin(vertex_index) vi:u32,@builtin(instance_index) ii:u32)->VO3{return particleVertex(vi,ii);}
@vertex fn pDepthVS3(@builtin(vertex_index) vi:u32,@builtin(instance_index) ii:u32)->VO3{
  var o=particleVertex(vi,ii);o.pos.z=clamp(o.depth/512.0+0.5,0.0,0.99999994);return o;
}
fn hidden(i:VO3)->bool{
  let xy=vec3f(i.pos.xy,1.0);
  let uv=vec2f(dot(controls.screen0.xyz,xy),dot(controls.screen1.xyz,xy));
  if(any(uv<vec2f(0.0))||any(uv>vec2f(1.0))){return false;}
  ${Array.from({length:8},(_,j)=>`{
    let size=vec2f(textureDimensions(occluder${j}));
    let p=clamp(vec2i(uv*size),vec2i(0),vec2i(size)-vec2i(1));
    let z=textureLoad(occluder${j},p,0);
    if(z.a>0.5&&i.depth>decodeSceneDepth(z)+0.0002){return true;}
  }`).join('\n')}
  return false;
}
@fragment fn pFS3(i:VO3)->@location(0) vec4f{
  let x=i.uv.x-clamp(i.uv.x,-i.seg,0.0);let d=x*x+i.uv.y*i.uv.y;if(d>1.0){discard;}
  if(hidden(i)){discard;}
  let k=exp(-d*4.5)+0.12*(1.0-d);return vec4f(i.col*k,k*i.alpha);
}
@fragment fn pDepthFS3(i:VO3)->@location(0) vec4f{
  let x=i.uv.x-clamp(i.uv.x,-i.seg,0.0);if(x*x+i.uv.y*i.uv.y>1.0||hidden(i)){discard;}
  return encodeSceneDepth(i.depth);
}
`;

export function patchParticles3d(patch){
  patch('var AG_SIM_BOIDS=AG_SIM_HEAD',`var AG_SIM_PART3D=AG_SIM_HEAD+${JSON.stringify(STEP)};\nvar AG_SIM_PREND3D=AG_SIM_HEAD+${JSON.stringify(DRAW)};\nvar AG_SIM_BOIDS=AG_SIM_HEAD`);
  patch("P.pStep=dev.createComputePipeline({layout:PL(L.part),compute:{module:mp,entryPoint:'pStep'}});",
    `P.pStep=dev.createComputePipeline({layout:PL(L.part),compute:{module:mp,entryPoint:'pStep'}});
    P.p3Extra=dev.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.COMPUTE|GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}},...Array.from({length:8},(_,i)=>({binding:i+1,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'float'}})),...Array.from({length:2},(_,i)=>({binding:i+9,visibility:GPUShaderStage.COMPUTE,texture:{sampleType:'float'}})),{binding:11,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}}]});
    var mp3=await mod(dev,'particles3d',AG_SIM_PART3D),mr3=await mod(dev,'particles3d render',AG_SIM_PREND3D);
    P.pStep3=dev.createComputePipeline({layout:dev.createPipelineLayout({bindGroupLayouts:[L.part,P.p3Extra]}),compute:{module:mp3,entryPoint:'pStep3'}});`);
  patch("P.pFade=dev.createRenderPipeline", `var pr3=dev.createPipelineLayout({bindGroupLayouts:[L.rend,P.p3Extra]});
    P.pDraw3=dev.createRenderPipeline({layout:pr3,vertex:{module:mr3,entryPoint:'pVS3'},fragment:{module:mr3,entryPoint:'pFS3',targets:[{format:'rgba16float',blend:add}]},primitive:{topology:'triangle-list'}});
    P.pDepth3=dev.createRenderPipeline({layout:pr3,vertex:{module:mr3,entryPoint:'pDepthVS3'},fragment:{module:mr3,entryPoint:'pDepthFS3',targets:[{format:'rgba8unorm'}]},primitive:{topology:'triangle-list'},depthStencil:{format:'depth24plus',depthWriteEnabled:true,depthCompare:'less'}});
    P.pFade=dev.createRenderPipeline`);
  patch('st.pn=tr.p;st.pbuf=dev.createBuffer({size:st.pn*48,usage:GPUBufferUsage.STORAGE});',
    `st.space3=simOpt.pSpace==='3d';st.pn=tr.p;st.pbuf=dev.createBuffer({size:st.pn*(st.space3?${PARTICLE_BYTES}:48),usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});`);
  patch('st.emitterBuf=dev.createBuffer({size:32,',
    "st.emitterBuf=dev.createBuffer({size:kind==='particles'&&simOpt.pSpace==='3d'?48:32,");
  patch("return kind==='boids'?K('pBdAmount',80)", "return kind==='particles'?(simOpt.pSpace==='3d'?3:2):kind==='boids'?K('pBdAmount',80)");
  patch("var key=_simEmitterKey('sim'+st.kind)",`if(st.space3){
      var cfg=window.__agParticles3d||{},data=cfg.source,gpu=cfg.gpuSource;
      st.zeroLaunch=o.jet===0;
      if(cfg.response==='motion'){o.response=0;o.bass=0;o.mid=0;o.treb=0;o.onset=0;o.level=0;}
      o.pglow*=10.0;
      Object.assign(o,{x1:cfg.yaw||0,x2:cfg.tilt||0,x3:cfg.zoom||1,x4:cfg.focal||1,x5:cfg.depth||2,x6:cfg.panX||0,x7:cfg.panY||0,x8:gpu?2:data?1:0,x9:cfg.sourceAngle||0,x10:cfg.spread||0,x11:cfg.sourceTilt||0,x12:K('pSpTrail',55)/100});
      if(gpu){o.sourceN=gpu.image.width;o.emitScale=K('pEmitScale',100)/100;o.emitAngle=K('pEmitRZ',0)*Math.PI/180;o.emitColor=0;o.emitType=4;st.sourceCount=o.sourceN;st.emitType=4;return;}
      if(data){
        if(st.emitterAsset!==data){
          if(data.byteLength>st.emitterBuf.size){st.emitterBuf.destroy();st.emitterBuf=G.dev.createBuffer({size:data.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});st.emitterCapacity=data.length/12;st.bgc={};}
          G.dev.queue.writeBuffer(st.emitterBuf,0,data);st.emitterAsset=data;
        }
        o.sourceN=data.length/12;o.emitScale=K('pEmitScale',100)/100;o.emitAngle=K('pEmitRZ',0)*Math.PI/180;o.emitColor=0;o.emitType=4;st.sourceCount=o.sourceN;st.emitType=4;return;
      }
    }
    if(st.kind==='particles'&&!st.space3)o.x12=-K('pSpTrail',55)/100;
    var key=_simEmitterKey('sim'+st.kind)`);
  // 3D's source buffer includes a normal; image sources are expanded from the existing validated asset.
  patch('var n=pts.length/5,d=new Float32Array(n*8);',
    'var n=pts.length/5,stride=st.space3?12:8,d=new Float32Array(n*stride);');
  patch('if(n>st.emitterCapacity){','if(st.space3?d.byteLength>st.emitterBuf.size:n>st.emitterCapacity){');
  patch('for(var i=0;i<n;i++){d.set(pts.slice(i*5,i*5+2),i*8);d[i*8+3]=1;d.set(pts.slice(i*5+2,i*5+5),i*8+4);d[i*8+7]=1}',
    'for(var i=0;i<n;i++){d.set(pts.slice(i*5,i*5+2),i*stride);d[i*stride+3]=1;d.set(pts.slice(i*5+2,i*5+5),i*stride+4);d[i*stride+7]=1}');
  patch('p.setPipeline(P.pStep);','p.setPipeline(st.space3?P.pStep3:P.pStep);if(st.space3)p.setBindGroup(1,window.__agP3.bind(G.dev,G.P,st,true));');
  patch('rp.setPipeline(P.pDraw);','rp.setPipeline(st.space3?P.pDraw3:P.pDraw);if(st.space3)rp.setBindGroup(1,window.__agP3.bind(G.dev,G.P,st));');
  patch('rp.draw(6,st.pn);S.dispatches+=2}',`st.trailVerts=st.space3?6*(1+Math.ceil(Math.min(${TRAIL_POINTS},o.x12*${BASE_TRAIL_POINTS}))):6;rp.draw(st.trailVerts,st.pn);S.dispatches+=2}`);
  patch('rp.end();\n    }else if(XK[kd])','rp.end();if(st.space3)window.__agScene.particles(st,enc,P,bgR);\n    }else if(XK[kd])');
  patch('function disposeState(st,lost){','function disposeState(st,lost){window.__agP3.destroy(st);');
  patch('Math.min(1.2,levelDrive*1.05)*gov;',
    "Math.min(1.2,st.space3&&o.x8>0.5&&(window.__agParticles3d.surfaceFlow||st.zeroLaunch)?1:levelDrive*1.05)*gov;");
  patch('if(o.emitType>=4&&!o.sourceN)st.carry=0;',
    "var hold=st.space3&&o.x8>0.5&&o.sourceN>0&&(window.__agParticles3d.surfaceFlow||st.zeroLaunch);if(hold&&!st.surfaceHold)st.carry+=Math.min(st.pn,2048);st.surfaceHold=hold;\n    if(o.emitType>=4&&!o.sourceN)st.carry=0;");
  patch("var fadeK=0,tr=K(kd==='boids'?", "var fadeK=0,tr=st.space3?0:K(kd==='boids'?");
  patch("if((st.kind==='particles'||st.kind==='boids')&&sv.hdr&&!sv.ac){",
    "if((st.kind==='particles'||st.kind==='boids')&&!st.space3&&sv.hdr&&!sv.ac){");
  patch('kind:s.kind,q:s.q,grid:', 'kind:s.kind,dimensions:s.space3?3:2,sourcePoints:s.sourceCount||0,trailSegments:s.space3?Math.max(0,(s.trailVerts||6)/6-1):0,q:s.q,grid:');
  patch('api.splat=function(){',`api.particleState=async function(){
    var st=ST[simUid];if(!st||st.kind!=='particles')return null;
    var count=Math.min(st.pn,4096),stride=st.space3?${PARTICLE_BYTES}:48,size=count*stride,dev=G.dev,b=dev.createBuffer({size:size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    try{var enc=dev.createCommandEncoder();enc.copyBufferToBuffer(st.pbuf,0,b,0,size);dev.queue.submit([enc.finish()]);await b.mapAsync(GPUMapMode.READ);
      var data=new Float32Array(b.getMappedRange());if(!st.space3)return Array.from(data);
      var out=[];for(var i=0;i<count;i++)out.push(...data.subarray(i*stride/4,i*stride/4+16));return out;}
    finally{b.destroy();}
  };
  api.particleMesh=function(shape,detail){
    G.g3m=G.g3m||{};var m=g3Mesh(shape,detail);if(m.surface)return m.surface;
    var verts=[],normals=[],faces=[],ids=new Map(),groups=new Map();
    for(var i=0;i<m.arr.length;i+=48){
      var triangle=[];
      for(var j=0;j<3;j++){var o=i+j*16,v=Array.from(m.arr.slice(o,o+3)),key=v.join(','),ix=ids.get(key);
        if(ix===undefined){ix=verts.length;ids.set(key,ix);verts.push(v);normals.push(Array.from(m.arr.slice(o+9,o+12)));}
        triangle.push(ix);
      }

      faces.push(triangle);
      var fid=Math.round(m.arr[i+15]*m.faces),edges=groups.get(fid);if(!edges){edges=[];groups.set(fid,edges);}
      for(var j=0;j<3;j++){var a=triangle[(j+1)%3],b=triangle[(j+2)%3];if(m.arr[i+12+j]>.5&&a!==b)edges.push([a,b]);}
    }
    var polygons=[];for(var edges of groups.values()){
      var next=new Map(edges),loop=[],first=edges[0]&&edges[0][0],ix=first;
      if(next.size<3)continue;
      while(ix!==undefined&&!loop.includes(ix)){loop.push(ix);ix=next.get(ix);}
      if(loop.length>=3&&ix===first)polygons.push(loop);
      else throw Error('Native mesh polygon boundary is incomplete');
    }
    return m.surface={verts:verts,normals:normals,faces:faces,polygons:polygons};
  };
  api.splat=function(){`);
}

export function installParticleControls(w){
  w.__agP3={
    bind(dev,P,st,compute=false){
      const cfg=w.__agParticles3d||{};
      if(!st.extra3)st.extra3={buffer:dev.createBuffer({size:80,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),textures:[],sources:[]};
      const extra=st.extra3,occluders=cfg.occluders||[];if(occluders.length>8)throw Error('A shared 3D scene supports at most eight opaque renderers');
      let changed=!extra.group;
      const field=cfg.collisions,bytes=field?.data.byteLength||16;
      if(!extra.collision||extra.collision.size<bytes||bytes*4<extra.collision.size){
        extra.collision?.destroy();
        extra.collision=dev.createBuffer({size:bytes,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
        extra.field=null;changed=true;
      }
      if(compute&&field&&extra.field!==field){dev.queue.writeBuffer(extra.collision,0,field.data);extra.field=field;}
      const copy=extra.cfg!==cfg||extra.occluders!==occluders;
      for(let i=0;i<8;i++){
        const source=occluders[i],width=source?.width||1,height=source?.height||1;
        let t=extra.textures[i];
        if(!t||t.width!==width||t.height!==height){t?.destroy();t=dev.createTexture({size:[width,height],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});extra.textures[i]=t;changed=true;}
        if(source&&(copy||changed))dev.queue.copyExternalImageToTexture({source},{texture:t,premultipliedAlpha:false},[width,height]);
        else if(changed&&!source)dev.queue.writeTexture({texture:t},new Uint8Array(4),{},[1,1]);
      }
      extra.cfg=cfg;extra.occluders=occluders;
      const gpu=cfg.gpuSource,width=gpu?.image.width||1,height=gpu?.image.height||1;
      let sourceChanged=false;
      for(let i=0;i<2;i++)if(!extra.sources[i]||extra.sources[i].width!==width||extra.sources[i].height!==height){
        extra.sources[i]?.destroy();extra.sources[i]=dev.createTexture({size:[width,height],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});sourceChanged=true;changed=true;
      }
      if(gpu&&(sourceChanged||extra.sourceImage!==gpu.image||extra.sourceToken!==gpu.token)){
        const fresh=sourceChanged||extra.sourceKey!==gpu.key;
        if(!fresh&&!extra.sourcePending){extra.sources.reverse();changed=true;}
        dev.queue.copyExternalImageToTexture({source:gpu.image},{texture:extra.sources[0],premultipliedAlpha:false},[width,height]);
        if(fresh)dev.queue.copyExternalImageToTexture({source:gpu.image},{texture:extra.sources[1],premultipliedAlpha:false},[width,height]);
        if(fresh)extra.sourceTime=gpu.time;
        extra.sourceDt=Math.max(1/240,Math.min(.1,(gpu.time??0)-(extra.sourceTime??gpu.time??0)));
        extra.sourceImage=gpu.image;extra.sourceKey=gpu.key;extra.sourceToken=gpu.token;extra.sourcePending=true;
      }
      if(compute&&extra.sourcePending&&gpu){extra.sourcePending=false;extra.sourceTime=gpu.time;}
      if(changed)extra.group=dev.createBindGroup({layout:P.p3Extra,entries:[{binding:0,resource:{buffer:extra.buffer}},...extra.textures.map((t,i)=>({binding:i+1,resource:t.createView()})),...extra.sources.map((t,i)=>({binding:i+9,resource:t.createView()})),{binding:11,resource:{buffer:extra.collision}}]});
      const p=w.__agScene.placement(),m=p?.m,fw=w.frameCv.width,fh=w.frameCv.height;
      const row0=m?[m.a*p.W/st.ow/fw,m.c*p.H/st.oh/fw,m.e/fw,0]:[1/st.ow,0,0,0],
        row1=m?[m.b*p.W/st.ow/fh,m.d*p.H/st.oh/fh,m.f/fh,0]:[0,1/st.oh,0,0];
      row0[3]=cfg.surfaceFlow?1:0;
      dev.queue.writeBuffer(extra.buffer,0,new Float32Array([
        st.zeroLaunch?1:0,field?.end||0,cfg.response==='motion'?0:1,cfg.response==='sound'||!cfg.response?0:1,
        cfg.shared?SCENE_DISTANCE*(cfg.focal||1)/Math.max(.3,cfg.zoom||1):0,(cfg.dof||0)/100*st.oh*.05,((cfg.focus??50)-50)/50*2,extra.sourceDt||1/60,
        ...row0,...row1,cfg.floorHalf||0,0,0,0]));
      return extra.group;
    },
    destroy(st){if(st.extra3){st.extra3.buffer.destroy();st.extra3.collision?.destroy();for(const t of [...st.extra3.textures,...st.extra3.sources])t.destroy();st.extra3=null;}}
  };
}

export function surfaceSource(w,object,cache,frame={}){
  const mesh=object.mesh&&typeof object.mesh!=='string'?object.mesh:
    object.prim&&object.shape!=='knot'?w.agSim.particleMesh(object.shape,object.detail??4):
    object.shape==='knot'||object.mesh==='knot'?((cache.builtins||={}).knot||=w._objDefaultModel()):null;
  if(!mesh)throw Error('This object has no mesh surface for 3D emission');
  const key=[object.size,object.stretchX,object.stretchY,object.stretchZ,frame.turn,frame.tilt,frame.mapper?.key,!!frame.flow].join(',');
  if(cache.mesh===mesh&&cache.key===key&&(!frame.flow||cache.time===frame.time)){
    if(cache.time===frame.time)return cache.data;
    cache.time=frame.time;
    if(cache.motion){cache.data=cache.data.slice();for(let i=0;i<cache.data.length;i+=12)cache.data.fill(0,i+4,i+7);cache.previous=cache.data;cache.motion=false;}
    return cache.data;
  }
  const native=object.prim&&object.shape!=='knot',scale=mesh.world?1:(object.size??60)/100*(native?1:.7),s=[object.stretchX??100,object.stretchY??100,object.stretchZ??100].map(v=>v/100*scale);
  const transform=v=>{
    const p=[v[0]*s[0],v[1]*s[1]*(native||mesh.world?1:-1),v[2]*s[2]];
    if(mesh.world)return p;if(frame.mapper)return frame.mapper(p);
    const cy=Math.cos(frame.turn||0),sy=Math.sin(frame.turn||0),ct=Math.cos(frame.tilt||0),st=Math.sin(frame.tilt||0),x=p[0]*cy+p[2]*sy,z=-p[0]*sy+p[2]*cy;
    return [x,p[1]*ct-z*st,p[1]*st+z*ct];
  };
  if(cache.faces!==mesh.faces){
    cache.triangles=mesh.faces.flatMap(f=>f.length===3?[f]:Array.from({length:f.length-2},(_,i)=>[f[0],f[i+1],f[i+2]]));
    const transformed={verts:mesh.verts.map(transform),faces:cache.triangles};
    const sample=w.agSurfaceSampler(transformed);
    cache.samples=Array.from({length:2048},(_,i)=>sample((i+.5)/2048,((i+1)*.61803398875)%1,((i+1)*.41421356237)%1));
    cache.faces=mesh.faces;cache.previous=null;cache.routes=null;
  }
  if(frame.flow&&!cache.routes)cache.routes=surfaceRoutes(cache.triangles,cache.samples);
  const data=new Float32Array(2048*12),previous=cache.flow===frame.flow?cache.previous:null,dt=Math.max(1/240,Math.min(.1,(frame.time??0)-(cache.time??0))),orientation=mesh.orientation||frame.mapper?.orientation||1,phase=flowPhase(frame.time??0);
  const verts=new Map(),vertex=i=>{if(!verts.has(i))verts.set(i,transform(mesh.verts[i]));return verts.get(i);};
  cache.motion=false;
  for(let i=0;i<2048;i++){
    const sample=frame.flow?routeSample(cache.routes,i,phase):cache.samples[i],[a,b,c]=cache.triangles[sample.triangle].map(vertex),w=sample.weights,o=i*12,
      pos=a.map((v,j)=>v*w[0]+b[j]*w[1]+c[j]*w[2]),u=b.map((v,j)=>v-a[j]),v=c.map((x,j)=>x-a[j]),
      n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],len=Math.hypot(...n);
    const velocity=pos.map((x,j)=>previous?(x-previous[o+j])/dt:0);
    if(velocity.some(v=>Math.abs(v)>.00001))cache.motion=true;
    data.set([...pos,1,...velocity,1,...n.map(x=>len>1e-12?x/len*orientation:0),0],o);
  }
  cache.mesh=mesh;cache.key=key;cache.data=data;cache.previous=data;cache.time=frame.time;cache.flow=frame.flow;return data;
}
