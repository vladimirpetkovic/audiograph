const STRUCT=`
// data: remaining lifetime, initial lifetime, random seed, palette position.
struct Part3{pos:vec4f,vel:vec4f,data:vec4f,color:vec4f};
struct Source3{pos:vec4f,color:vec4f,normal:vec4f};
`;
const STEP=STRUCT+`
@group(0) @binding(2) var<storage,read_write> parts:array<Part3>;
@group(0) @binding(3) var<storage,read> sources:array<Source3>;
fn rn(i:u32,k:u32)->f32{return f32(pcg(i*9781u+k*6271u+u32(u.pseed)*26699u+911u))/4294967295.0;}
fn sphere(a:f32,b:f32)->vec3f{
  let y=2.0*b-1.0;let r=sqrt(max(0.0,1.0-y*y));let t=a*2.0*PI;
  return vec3f(r*cos(t),y,r*sin(t));
}
fn turn(v:vec3f,a:f32)->vec3f{
  let ct=cos(u.x11);let st=sin(u.x11);let q=vec3f(v.x,v.y*ct-v.z*st,v.y*st+v.z*ct);
  let c=cos(a);let s=sin(a);return vec3f(q.x*c-q.z*s,q.y,q.x*s+q.z*c);
}
fn noise3(p:vec3f)->vec3f{
  return vec3f(curlN(p.yz).x,curlN(p.zx+vec2f(13.1,7.3)).x,curlN(p.xy+vec2f(5.7,19.4)).x);
}
fn birth(i:u32)->Part3{
  var p:Part3;let a=rn(i,1u);let b=rn(i,2u);let c=rn(i,3u);let d=rn(i,4u);
  var dir=sphere(a,b);var pos=dir*0.5;var normal=dir;
  if(u.x8>0.5){
    if(u.sourceN<1.0){return p;}
    let src=sources[min(u32(a*u.sourceN),u32(u.sourceN)-1u)];
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
  let speed=u.jet*(0.25+1.6*specAt(a)+0.5*u.onset)*(0.6+0.8*d);
  let velocity=(normal+dir*u.x10)*speed+cross(normal,vec3f(0.0,1.0,0.0))*speed*u.swirl;
  let life=u.plife*(0.55+0.9*b);
  p.pos=vec4f(pos,1.0);p.vel=vec4f(velocity,0.0);p.data=vec4f(life,life,d,a);
  return p;
}
@compute @workgroup_size(64) fn pStep3(@builtin(global_invocation_id) g:vec3u){
  let i=g.x;let n=u32(u.pn);if(i>=n){return;}
  var p=parts[i];let rel=(i+n-u32(u.pcursor))%n;
  if(rel<u32(u.pemit)){p=birth(i);}
  else if(p.data.x>0.0){
    var x=p.pos.xyz;var v=p.vel.xyz;let r=length(x)+0.001;let rd=x/r;
    var acc=vec3f(0.0,u.pgrav,0.0)-rd*u.pattract*(1.0+u.bass*1.5)*r/(0.15+r*r);
    acc=acc+cross(vec3f(0.0,1.0,0.0),rd)*(u.pvort+u.torque*0.3)*r/(0.2+r*r);
    acc=acc+noise3(x*u.pcscale+vec3f(u.time*0.15,-u.time*0.11,u.time*0.09))*u.pcurl*(1.0+u.mid*1.5+u.treb);
    acc=acc+noise3(x*1.7+vec3f(u.time*0.3))*(0.5+5.0*u.level+3.0*u.mid)*u.response*u.sstr;
    acc=acc+rd*u.bass*u.bpun*u.response*(7.0*sin(r*7.0-u.time*6.0)+9.0*u.onset)*exp(-r*0.6);
    v=(v+acc*u.dt)*exp(-u.pdrag*u.dt);v=v*min(1.0,7.0/max(length(v),0.00001));x=x+v*u.dt;
    let bounds=vec3f(u.asp,1.0,max(0.1,u.x5*0.5));
    if(u.pbounds<0.5){x=fract((x+bounds)/(2.0*bounds))*2.0*bounds-bounds;}
    else if(u.pbounds<1.5){
      for(var k=0u;k<3u;k++){if(abs(x[k])>bounds[k]){x[k]=clamp(x[k],-bounds[k],bounds[k]);v[k]=-v[k]*0.7;}}
    }else if(any(abs(x)>bounds*1.2)){p.data.x=0.0;}
    p.pos=vec4f(x,1.0);p.vel=vec4f(v,0.0);p.data.x=max(0.0,p.data.x-u.dt);
  }
  parts[i]=p;
}
`;
const DRAW=STRUCT+`
@group(0) @binding(2) var<storage,read> parts:array<Part3>;
@group(0) @binding(3) var rampT:texture_2d<f32>;
struct VO3{@builtin(position) pos:vec4f,@location(0) uv:vec2f,@location(1) col:vec3f,@location(2) seg:f32};
var<private> corners3:array<vec2f,6>=array<vec2f,6>(vec2f(-1.0,-1.0),vec2f(1.0,-1.0),vec2f(-1.0,1.0),vec2f(-1.0,1.0),vec2f(1.0,-1.0),vec2f(1.0,1.0));
fn camera3(x:vec3f)->vec3f{
  let cy=cos(u.x1);let sy=sin(u.x1);let ct=cos(u.x2);let st=sin(u.x2);
  let v=vec3f(x.x*cy-x.z*sy,x.y,x.x*sy+x.z*cy);
  return vec3f(v.x,v.y*ct-v.z*st,v.y*st+v.z*ct);
}
fn project3(x:vec3f)->vec3f{
  let v=camera3(x);let f=max(0.1,u.x4)/tan(0.4);let dist=2.6*f/max(0.3,u.x3);
  let z=dist-v.z;let scale=f/max(z,0.02);
  return vec3f((v.x*scale+u.x6)/u.asp,-v.y*scale+u.x7,z);
}
@vertex fn pVS3(@builtin(vertex_index) vi:u32,@builtin(instance_index) ii:u32)->VO3{
  var o:VO3;o.pos=vec4f(2.0,2.0,0.0,1.0);o.uv=vec2f(0.0);o.col=vec3f(0.0);o.seg=0.0;
  let p=parts[ii];if(p.data.x<=0.0){return o;}
  let q=project3(p.pos.xyz);if(q.z<=0.05){return o;}
  let age=1.0-p.data.x/max(p.data.y,0.001);let fade=smoothstep(0.0,0.06,age)*(1.0-smoothstep(0.55,1.0,age));
  let speed=length(p.vel.xyz);var t=p.data.w;
  if(u.colorBy>0.5&&u.colorBy<1.5){t=age;}else if(u.colorBy>1.5){t=clamp(speed*0.45,0.0,1.0);}
  let color=select(textureSampleLevel(rampT,smp,vec2f(t,0.5),0.0).rgb,p.color.rgb,u.emitColor>0.5&&p.color.a>0.5);
  let size=max(0.2,u.psize*(0.55+0.65*fade)*(0.7+0.6*p.data.z)*2.6*max(0.1,u.x4)/tan(0.4)/max(q.z,0.1));
  let cr=corners3[vi];var offset=cr;var dim=1.0;
  let prev=project3(p.pos.xyz-p.vel.xyz*u.dt*(1.0+u.x12*8.0));
  if(prev.z>0.05){
    let delta=(q.xy-prev.xy)*vec2f(u.ow,u.oh)*0.5;let len=length(delta);
    if(len>size*0.3){
      let dir=delta/max(len,0.00001);let seg=min(80.0,len/size);
      let along=mix(-seg-1.0,1.0,(cr.x+1.0)*0.5);
      offset=dir*along+vec2f(-dir.y,dir.x)*cr.y;o.uv=vec2f(along,cr.y);o.seg=seg;dim=1.0/(1.0+0.12*seg);
    }else{o.uv=cr;}
  }else{o.uv=cr;}
  o.pos=vec4f(q.xy+offset*size*2.0/vec2f(u.ow,u.oh),0.0,1.0);
  o.col=color*u.pglow*fade*dim*(0.45+0.55*clamp(speed,0.0,2.0))*(1.0+0.9*u.bass*u.bpun*u.response);
  return o;
}
@fragment fn pFS3(i:VO3)->@location(0) vec4f{
  let x=i.uv.x-clamp(i.uv.x,-i.seg,0.0);let d=x*x+i.uv.y*i.uv.y;if(d>1.0){discard;}
  let k=exp(-d*4.5)+0.12*(1.0-d);return vec4f(i.col*k,k);
}
`;

export function patchParticles3d(patch){
  patch('var AG_SIM_BOIDS=AG_SIM_HEAD',`var AG_SIM_PART3D=AG_SIM_HEAD+${JSON.stringify(STEP)};\nvar AG_SIM_PREND3D=AG_SIM_HEAD+${JSON.stringify(DRAW)};\nvar AG_SIM_BOIDS=AG_SIM_HEAD`);
  patch("P.pStep=dev.createComputePipeline({layout:PL(L.part),compute:{module:mp,entryPoint:'pStep'}});",
    "P.pStep=dev.createComputePipeline({layout:PL(L.part),compute:{module:mp,entryPoint:'pStep'}});var mp3=await mod(dev,'particles3d',AG_SIM_PART3D),mr3=await mod(dev,'particles3d render',AG_SIM_PREND3D);P.pStep3=dev.createComputePipeline({layout:PL(L.part),compute:{module:mp3,entryPoint:'pStep3'}});");
  patch("P.pFade=dev.createRenderPipeline", "P.pDraw3=dev.createRenderPipeline({layout:PL(L.rend),vertex:{module:mr3,entryPoint:'pVS3'},fragment:{module:mr3,entryPoint:'pFS3',targets:[{format:'rgba16float',blend:add}]},primitive:{topology:'triangle-list'}});\nP.pFade=dev.createRenderPipeline");
  patch('st.pn=tr.p;st.pbuf=dev.createBuffer({size:st.pn*48,usage:GPUBufferUsage.STORAGE});',
    "st.space3=simOpt.pSpace==='3d';st.pn=tr.p;st.pbuf=dev.createBuffer({size:st.pn*(st.space3?64:48),usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});");
  patch('st.emitterBuf=dev.createBuffer({size:32,',
    "st.emitterBuf=dev.createBuffer({size:kind==='particles'&&simOpt.pSpace==='3d'?48:32,");
  patch("return kind==='boids'?K('pBdAmount',80)", "return kind==='particles'?(simOpt.pSpace==='3d'?3:2):kind==='boids'?K('pBdAmount',80)");
  patch("var key=_simEmitterKey('sim'+st.kind)",`if(st.space3){
      var cfg=window.__agParticles3d||{},data=cfg.source;
      o.pglow*=10.0;
      Object.assign(o,{x1:cfg.yaw||0,x2:cfg.tilt||0,x3:cfg.zoom||1,x4:cfg.focal||1,x5:cfg.depth||2,x6:cfg.panX||0,x7:cfg.panY||0,x8:data?1:0,x9:cfg.sourceAngle||0,x10:cfg.spread||0,x11:cfg.sourceTilt||0,x12:K('pSpTrail',55)/100});
      if(data){
        if(st.emitterAsset!==data){
          if(data.byteLength>st.emitterBuf.size){st.emitterBuf.destroy();st.emitterBuf=G.dev.createBuffer({size:data.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});st.emitterCapacity=data.length/12;st.bgc={};}
          G.dev.queue.writeBuffer(st.emitterBuf,0,data);st.emitterAsset=data;
        }
        o.sourceN=data.length/12;o.emitScale=K('pEmitScale',65)/65;o.emitAngle=K('pEmitRZ',0)*Math.PI/180;o.emitColor=0;o.emitType=4;st.sourceCount=o.sourceN;st.emitType=4;return;
      }
    }
    var key=_simEmitterKey('sim'+st.kind)`);
  // 3D's source buffer includes a normal; image sources are expanded from the existing validated asset.
  patch('var n=pts.length/5,d=new Float32Array(n*8);',
    'var n=pts.length/5,stride=st.space3?12:8,d=new Float32Array(n*stride);');
  patch('if(n>st.emitterCapacity){','if(st.space3?d.byteLength>st.emitterBuf.size:n>st.emitterCapacity){');
  patch('for(var i=0;i<n;i++){d.set(pts.slice(i*5,i*5+2),i*8);d[i*8+3]=1;d.set(pts.slice(i*5+2,i*5+5),i*8+4);d[i*8+7]=1}',
    'for(var i=0;i<n;i++){d.set(pts.slice(i*5,i*5+2),i*stride);d[i*stride+3]=1;d.set(pts.slice(i*5+2,i*5+5),i*stride+4);d[i*stride+7]=1}');
  patch('p.setPipeline(P.pStep);','p.setPipeline(st.space3?P.pStep3:P.pStep);');
  patch('rp.setPipeline(P.pDraw);','rp.setPipeline(st.space3?P.pDraw3:P.pDraw);');
  patch("var fadeK=0,tr=K(kd==='boids'?", "var fadeK=0,tr=st.space3?0:K(kd==='boids'?");
  patch("if((st.kind==='particles'||st.kind==='boids')&&sv.hdr&&!sv.ac){",
    "if((st.kind==='particles'||st.kind==='boids')&&!st.space3&&sv.hdr&&!sv.ac){");
  patch('kind:s.kind,q:s.q,grid:', 'kind:s.kind,dimensions:s.space3?3:2,sourcePoints:s.sourceCount||0,q:s.q,grid:');
  patch('api.splat=function(){',`api.particleState=async function(){
    var st=ST[simUid];if(!st||st.kind!=='particles')return null;
    var size=Math.min(st.pn,4096)*(st.space3?64:48),dev=G.dev,b=dev.createBuffer({size:size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    try{var enc=dev.createCommandEncoder();enc.copyBufferToBuffer(st.pbuf,0,b,0,size);dev.queue.submit([enc.finish()]);await b.mapAsync(GPUMapMode.READ);return Array.from(new Float32Array(b.getMappedRange()).slice());}
    finally{b.destroy();}
  };
  api.particleMesh=function(shape,detail){
    G.g3m=G.g3m||{};var m=g3Mesh(shape,detail);if(m.surface)return m.surface;
    var verts=[],faces=[];for(var i=0;i<m.arr.length;i+=48){var j=verts.length;verts.push(Array.from(m.arr.slice(i,i+3)),Array.from(m.arr.slice(i+16,i+19)),Array.from(m.arr.slice(i+32,i+35)));faces.push([j,j+1,j+2]);}
    return m.surface={verts:verts,faces:faces};
  };
  api.splat=function(){`);
}

export function surfaceSource(w,object,cache){
  const mesh=object.mesh&&typeof object.mesh!=='string'?object.mesh:
    object.prim&&object.shape!=='knot'?w.agSim.particleMesh(object.shape,object.detail??4):
    object.shape==='knot'||object.mesh==='knot'?((cache.builtins||={}).knot||=w._objDefaultModel()):null;
  if(!mesh)throw Error('This object has no mesh surface for 3D emission');
  const key=[object.size,object.stretchX,object.stretchY,object.stretchZ].join(',');
  if(cache.mesh===mesh&&cache.key===key)return cache.data;
  const scale=(object.size??60)/100,s=[object.stretchX??100,object.stretchY??100,object.stretchZ??100].map(v=>v/100*scale);
  const transformed={verts:mesh.verts.map(v=>[v[0]*s[0],v[1]*s[1],v[2]*s[2]]),
    faces:mesh.faces.flatMap(f=>Array.from({length:f.length-2},(_,i)=>[f[0],f[i+1],f[i+2]]))};
  const sample=w.agSurfaceSampler(transformed),data=new Float32Array(2048*12);
  for(let i=0;i<2048;i++){
    const p=sample((i+.5)/2048,((i+1)*.61803398875)%1,((i+1)*.41421356237)%1),o=i*12;
    data.set([p.pos[0],-p.pos[1],p.pos[2],1,1,1,1,1,p.normal[0],-p.normal[1],p.normal[2],0],o);
  }
  cache.mesh=mesh;cache.key=key;cache.data=data;return data;
}
