// Isolated Audiograph engines. Each Emitter owns one same-origin iframe running the real app; Pro drives
// the app's own live render loop (liveAnimLoop) one frame at a time with a synthetic analyser, so every
// original feature that lives in the composite (symmetry, flip, mirror, spin, particles, per-layer Post FX)
// renders exactly as in Audiograph.
import {TEMPLATE_BY_NAME} from './morph.js';
// 3D objects and Cloner, after the WebGPU Cornell box sample: soft cast shadows from the key light (a light-space
// depth map read with rotated Poisson PCF), an area-light size that widens both the penumbra and the highlights,
// palette-coloured bounce light (colour bleeding between clones and the floor) and an optional floor that catches
// shadows and fades into the background.
function patch3dLighting(patch){
  patch("hist:array<vec4f,256>};","hist:array<vec4f,256>,lvp:mat4x4f,sh:vec4f,gi:vec4f,fl:vec4f};");
  patch("G3UF=1232,","G3UF=1260,");
  patch("struct VIn{@location(0) pos:vec3f",`@group(0) @binding(6) var shT:texture_depth_2d;
@group(0) @binding(7) var shS:sampler_comparison;
fn shadowAt(wp:vec3f,n:vec3f,px:vec2f)->f32{
  if(c.sh.x<0.001){return 1.0;}
  let L=normalize(c.lit.xyz);
  let q=c.lvp*vec4f(wp+n*c.sh.z*2.0+L*c.sh.z,1.0);
  let uv=vec2f(q.x*0.5+0.5,0.5-q.y*0.5);
  if(uv.x<0.0||uv.y<0.0||uv.x>1.0||uv.y>1.0||q.z>1.0){return 1.0;}
  let a=fract(sin(dot(px,vec2f(12.9898,78.233)))*43758.5453)*6.2831853;let cs=cos(a);let sn=sin(a);
  var s=0.0;
  for(var i=0u;i<12u;i=i+1u){
    let fi=f32(i);let rr=sqrt((fi+0.5)/12.0);let th=fi*2.39996323;
    let o=vec2f(cos(th),sin(th))*rr;
    s=s+textureSampleCompareLevel(shT,shS,uv+vec2f(o.x*cs-o.y*sn,o.x*sn+o.y*cs)*c.sh.y,q.z-c.sh.w);}
  return mix(1.0,s/12.0,c.sh.x);}
fn palAvg()->vec3f{var s=vec3f(0.0);for(var i=0;i<5;i=i+1){s=s+pow(textureSampleLevel(rampT,smp,vec2f(0.1+0.2*f32(i),0.5),0.0).rgb,vec3f(2.2));}return s/5.0;}
fn floorCol()->vec3f{return mix(vec3f(0.42,0.43,0.46),palAvg()*0.8,c.fl.x);}
struct VIn{@location(0) pos:vec3f`);
  patch("fn envC(r:vec3f,rough:f32)->vec3f{",`@vertex fn vsh(vin:VIn,@builtin(instance_index) ii:u32)->@builtin(position) vec4f{
  let I=inst[ii];
  if(abs(floor(vin.fid+0.001)-I.dat.y)>0.5){return vec4f(2.0,2.0,2.0,1.0);}
  let wp=I.pos.xyz+rotM(I.rot.xyz)*(anch(vin.pos,cloneS(I,ii))*c.sp.w*I.rot.w);
  return c.lvp*vec4f(wp,1.0);}
struct FlO{@builtin(position) pos:vec4f,@location(0) wp:vec3f,@location(1) cp:vec4f,@location(2) pp:vec4f};
@vertex fn vsf(@builtin(vertex_index) vi:u32)->FlO{
  let q=array<vec2f,6>(vec2f(-1.0,-1.0),vec2f(1.0,-1.0),vec2f(-1.0,1.0),vec2f(-1.0,1.0),vec2f(1.0,-1.0),vec2f(1.0,1.0));
  let p=vec3f(q[vi].x*c.gi.w,c.gi.z,q[vi].y*c.gi.w);
  var o:FlO;o.pos=c.vp*vec4f(p,1.0);o.wp=p;o.cp=o.pos;o.pp=c.pvp*vec4f(p,1.0);return o;}
@fragment fn fsf(fi:FlO)->FOut{
  let n=vec3f(0.0,1.0,0.0);let L=normalize(c.lit.xyz);let V=normalize(c.cam.xyz-fi.wp);
  let r=length(fi.wp.xz)/c.gi.w;let a=c.fl.w*(1.0-smoothstep(0.3,1.0,r));
  if(a<0.004){discard;}
  let shd=shadowAt(fi.wp,n,fi.pos.xy);
  let base=floorCol();
  let H=normalize(L+V);
  var col=base*(c.lit.w*max(L.y,0.0)*shd*0.95+c.l2.x*0.5*vec3f(0.85,0.9,1.05));
  col=col+vec3f(0.05)*pow(max(H.y,0.0),40.0)*c.lit.w*shd*3.0;
  let vel=fi.cp.xy/fi.cp.w-fi.pp.xy/max(fi.pp.w,0.001);
  return FOut(vec4f(col*a,a),vec4f(vel,fi.cp.w-length(c.cam.xyz),1.0),vec2f(dot(n,c.vx.xyz),dot(n,c.vy.xyz)));}
fn envC(r:vec3f,rough:f32)->vec3f{`);
  patch("let rough=clamp(c.mt.x,0.05,1.0);let met=c.mt.y;let a2=pow(rough,4.0);",
    "let rough=clamp(c.mt.x,0.05,1.0);let met=c.mt.y;let a2=pow(clamp(rough+c.gi.y*0.3*(1.0-rough),0.05,1.0),4.0);");
  patch("var col=c.lit.w*(dif+spc*3.0);","let shd=shadowAt(fi.wp,n,fi.pos.xy);var col=c.lit.w*(dif+spc*3.0)*shd;");
  patch("col=col+base*(1.0-met)*(hemi*c.l2.x+envC(n,1.0)*0.12);",
    "col=col+base*(1.0-met)*(hemi*c.l2.x+envC(n,1.0)*0.12);"+
    "let bc=mix(mix(palAvg(),base,0.45),floorCol(),c.fl.w*0.7);"+
    "col=col+base*(1.0-met*0.7)*bc*c.gi.x*(0.3+0.7*(0.5-0.5*n.y))*(c.lit.w*max(L.y,0.0)*1.2+c.l2.x*0.5);");
  // Pipelines: the main layout gains the shadow map; the depth-only shadow pass keeps the original layout.
  patch("var mc=await mod(dev,'g3c',AG_G3_C)","P.g3sL=Lr;Lr=dev.createBindGroupLayout({entries:[{binding:0,visibility:V|F,buffer:{type:'uniform'}},{binding:1,visibility:V,buffer:{type:'read-only-storage'}},{binding:2,visibility:V|F,texture:{sampleType:'float'}},{binding:3,visibility:V|F,sampler:{type:'filtering'}},{binding:4,visibility:V,buffer:{type:'read-only-storage'}},{binding:5,visibility:V,buffer:{type:'read-only-storage'}},{binding:6,visibility:F,texture:{sampleType:'depth'}},{binding:7,visibility:F,sampler:{type:'comparison'}}]});var mc=await mod(dev,'g3c',AG_G3_C)");
  patch("P.g3o=await mk(false);P.g3t=await mk(true);","P.g3o=await mk(false);P.g3t=await mk(true);"+
    "P.g3sh=await dev.createRenderPipelineAsync({layout:dev.createPipelineLayout({bindGroupLayouts:[P.g3sL]}),vertex:{module:mr,entryPoint:'vsh',buffers:[vb]},primitive:{topology:'triangle-list',cullMode:'none'},depthStencil:{format:'depth32float',depthWriteEnabled:true,depthCompare:'less',depthBias:2,depthBiasSlopeScale:2.5}});"+
    "P.g3fl=await dev.createRenderPipelineAsync({layout:pl,vertex:{module:mr,entryPoint:'vsf'},fragment:{module:mr,entryPoint:'fsf',targets:[{format:'rgba16float',blend:blend},{format:'rgba16float'},{format:'rg16float'}]},primitive:{topology:'triangle-list',cullMode:'none'},depthStencil:{format:'depth24plus',depthWriteEnabled:true,depthCompare:'less'},multisample:{count:4}});");
  patch("st.g3bgR=dev.createBindGroup({layout:G.P.g3L.r,entries:[",
    "var _e=[{binding:0,resource:{buffer:st.cub}},{binding:1,resource:{buffer:st.ibuf}},{binding:2,resource:st.rampV},{binding:3,resource:G.smp},{binding:4,resource:{buffer:st.ipv}},{binding:5,resource:{buffer:st.ebuf}}];"+
    "if(st.g3shT)st.g3shT.destroy();st.g3shN=simOpt.q==='low'?1024:2048;st.g3shT=dev.createTexture({size:[st.g3shN,st.g3shN],format:'depth32float',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING});st.g3shV=st.g3shT.createView();"+
    "G.g3shS=G.g3shS||dev.createSampler({compare:'less',magFilter:'linear',minFilter:'linear'});"+
    "st.g3bgS=dev.createBindGroup({layout:G.P.g3sL,entries:_e});"+
    "st.g3bgR=dev.createBindGroup({layout:G.P.g3L.r,entries:[{binding:6,resource:st.g3shV},{binding:7,resource:G.g3shS},");
  // Light-space camera: an orthographic box round the array (and the floor), looking down the key light.
  patch("dev.queue.writeBuffer(st.cub,0,U);",
    "var shA=style===1?0:K('pG3Shadow',60)/100,shSz=K('pG3LitSize',35)/100,flA=K('pG3Floor',0)/100;"+
    "var hy=[(ny-1)/2*sy,(ny-1)/2*sy,B,ny*sy/2,0,B,0,n/nx*sy/2][mdi]||0;"+
    "hy+=rad*oY*(1+Math.max(0,scA[1])*0.8)+rpY*sy*0.9+Math.abs(mv[1])*sy*0.8+rad*(Math.exp(1.6*rndH)-1)*0.8;"+
    "var fy=-hy*1.02+K('pG3FloorY',0)/100*bnd;if(eye[1]<fy+bnd*0.02)flA=0;"+
    "var shR=bnd*1.2+(flA>0.001?bnd*1.0:0),lu=Math.abs(l[1])>0.95?[1,0,0]:[0,1,0];"+
    "var lX=nrm3([lu[1]*l[2]-lu[2]*l[1],lu[2]*l[0]-lu[0]*l[2],lu[0]*l[1]-lu[1]*l[0]]),lY=[l[1]*lX[2]-l[2]*lX[1],l[2]*lX[0]-l[0]*lX[2],l[0]*lX[1]-l[1]*lX[0]],lp=[l[0]*shR*2,l[1]*shR*2,l[2]*shR*2];"+
    "var dt3=function(a){return a[0]*lp[0]+a[1]*lp[1]+a[2]*lp[2]};"+
    "var lvw=new Float32Array([lX[0],lY[0],l[0],0,lX[1],lY[1],l[1],0,lX[2],lY[2],l[2],0,-dt3(lX),-dt3(lY),-dt3(l),1]),lpr=new Float32Array(16);"+
    "lpr[0]=1/shR;lpr[5]=1/shR;lpr[10]=-1/(4*shR);lpr[15]=1;U.set(g3Mul(lpr,lvw),1232);"+
    "set(1248,shA,(1.2+shSz*shSz*40*Math.max(1,rad/shR*12))/(st.g3shN||2048),2*shR/(st.g3shN||2048),0.0008);"+
    "set(1252,K('pG3Bounce',40)/100,shSz,fy,bnd*2.4);set(1256,K('pG3FloorTint',30)/100,0,0,flA);"+
    "dev.queue.writeBuffer(st.cub,0,U);");
  patch("var pipe=(style===1||alpha<0.995)?P.g3t:P.g3o;",
    "if(shA>0.001&&P.g3sh&&st.g3bgS){var shp=enc.beginRenderPass({colorAttachments:[],depthStencilAttachment:{view:st.g3shV,depthClearValue:1,depthLoadOp:'clear',depthStoreOp:'store'}});shp.setPipeline(P.g3sh);shp.setBindGroup(0,st.g3bgS);shp.setVertexBuffer(0,m.buf);shp.draw(m.verts,n);shp.end();S.dispatches++}"+
    "var pipe=(style===1||alpha<0.995)?P.g3t:P.g3o;");
  patch("rp.setPipeline(pipe);rp.setBindGroup(0,st.g3bgR);",
    "if(flA>0.001&&P.g3fl){rp.setPipeline(P.g3fl);rp.setBindGroup(0,st.g3bgR);rp.draw(6)}rp.setPipeline(pipe);rp.setBindGroup(0,st.g3bgR);");
  // Smooth cubes: face normals bent slightly toward the corners read as softly bevelled boxes, not blotchy spheres.
  patch("p[a[0]]=h*a[1];p[u]=h*(2*i/n-1);p[v]=h*(2*j/n-1);gg[i][j]=V(p)}}","p[a[0]]=h*a[1];p[u]=h*(2*i/n-1);p[v]=h*(2*j/n-1);var fq=[p[0]*0.3,p[1]*0.3,p[2]*0.3];fq[a[0]]=a[1];gg[i][j]=V(p,nrm(fq))}}");
  // The knobs the Light node drives.
  patch("['pG3Ao','Ambient occlusion',",
    "['pG3Shadow','Cast shadows',0,100,60,5,'%','Soft shadows the key light casts from clone to clone and onto the floor. 0 turns them off.'],"+
    "['pG3LitSize','Light size',0,100,35,5,'%','Size of the key light: a larger light gives softer shadow edges and broader highlights.'],"+
    "['pG3Bounce','Bounce light',0,100,40,5,'%','Light bounced between clones and off the floor, tinted by their colours.'],"+
    "['pG3Floor','Floor',0,100,0,5,'%','A floor under the objects that catches their shadows and fades into the background. 0 hides it.'],"+
    "['pG3FloorY','Floor height',-100,100,0,5,'%','Moves the floor down or up from the bottom of the objects.'],"+
    "['pG3FloorTint','Floor tint',0,100,30,5,'%','0 is a neutral grey floor, 100 takes the palette colours.'],"+
    "['pG3Ao','Ambient occlusion',");
  patch("['Light',['pG3Light','pG3Amb','pG3LitAz','pG3LitEl']]","['Light',['pG3Light','pG3Amb','pG3LitAz','pG3LitEl','pG3Shadow','pG3LitSize','pG3Bounce','pG3Floor','pG3FloorY','pG3FloorTint']]");
  patch("'g3-fx':['pG3Ao','pG3AoRad','pG3Mb']","'g3-sh':['pG3Shadow','pG3LitSize','pG3Bounce'],'g3-fl':['pG3Floor','pG3FloorY','pG3FloorTint'],'g3-fx':['pG3Ao','pG3AoRad','pG3Mb']");
}
let sourcePromise;
async function engineSource() {
  if(!sourcePromise)sourcePromise=fetch(new URL('../index.html',location.href)).then(async r=>{
    if(!r.ok)throw Error(`Cannot load Audiograph engine: HTTP ${r.status}`);
    let html=await r.text();
    if(!html.includes('function getDefaultLayerParams'))throw Error('The parent page is not an Audiograph engine');
    // Load the trusted local app, not any project-provided source. Keep fonts and media offline.
    html=html.replace(/@import\s+url\((['"]?)[^'")]*\1\)\s*;?/g,'');
    // Cloner: shapes "mesh0".."mesh2" are the 3D objects wired into the Cloner node (an OBJ or the knot).
    const patch=(from,to)=>{if(!html.includes(from))throw Error('Audiograph engine patch target missing');html=html.replace(from,to);};
    patch("if(shape==='sphere'){","if(/^mesh\\d$/.test(shape)){var om=(window.__agG3Meshes||[])[+shape[4]];if(om&&om.verts){var ov=om.verts,on=om.normals;for(var fi=0;fi<om.faces.length&&fi<40000;fi++)poly(om.faces[fi].map(function(ix){return V([ov[ix][0]*.7,ov[ix][1]*.7,ov[ix][2]*.7],on[ix])}))}}else if(shape==='sphere'){");
    patch("function g3MeshMix(list,D){","function g3MeshMix(list,D){if(G.g3mv!==window.__agG3MeshVer){G.g3mv=window.__agG3MeshVer;for(var _k in G.g3m)if(_k.indexOf('mesh')>=0)delete G.g3m[_k]}");
    // Cloner spacing: Y and Z reach as far as X.
    patch("['pG3SpY','Spacing Y',0,600,","['pG3SpY','Spacing Y',0,1000,");patch("['pG3SpZ','Spacing Z',0,600,","['pG3SpZ','Spacing Z',0,1000,");
    patch("return AG_G3_SHAPES.some(function(q){return q[0]===x})","return /^mesh\\d$/.test(x)?!!(window.__agG3Meshes||[])[+x[4]]:AG_G3_SHAPES.some(function(q){return q[0]===x})");
    // WebGPU particles: each particle is drawn as a streak from where it was last frame (motion blur), so fast
    // particles leave continuous trails instead of rings of separate dots.
    patch("struct VO{@builtin(position) pos:vec4f,@location(0) uv:vec2f,@location(1) col:vec3f};","struct VO{@builtin(position) pos:vec4f,@location(0) uv:vec2f,@location(1) col:vec3f,@location(2) seg:f32};");
    patch("var o:VO;o.uv=vec2f(0.0);o.col=vec3f(0.0);o.pos=vec4f(2.0,2.0,0.0,1.0);","var o:VO;o.uv=vec2f(0.0);o.col=vec3f(0.0);o.seg=0.0;o.pos=vec4f(2.0,2.0,0.0,1.0);");
    patch("let cl=vec2f(p.pos.x/u.asp,-p.pos.y)+corner*szp*2.0/vec2f(u.ow,u.oh);",
      "var cl=vec2f(p.pos.x/u.asp,-p.pos.y)+corner*szp*2.0/vec2f(u.ow,u.oh);var uvv=cr;var dim=1.0;"+
      "if(u.x12<0.5){let dpx=vec2f(p.vel.x/u.asp,-p.vel.y)*u.dt*0.5*vec2f(u.ow,u.oh);let dl=length(dpx);let L=min(dl,szp*28.0);"+
      "if(L>szp*0.3){let dir=dpx/max(dl,1e-5);let nrm=vec2f(-dir.y,dir.x);let sg=L/szp;let along=mix(-sg-1.0,1.0,(cr.x+1.0)*0.5);"+
      "cl=vec2f(p.pos.x/u.asp,-p.pos.y)+(dir*along+nrm*cr.y)*szp*2.0/vec2f(u.ow,u.oh);uvv=vec2f(along,cr.y);o.seg=sg;dim=1.0/(1.0+0.12*sg);}}");
    patch("o.pos=vec4f(cl,0.0,1.0);o.uv=cr;o.col=c*u.pglow","o.pos=vec4f(cl,0.0,1.0);o.uv=uvv;o.col=dim*c*u.pglow");
    patch("@fragment fn pFS(i:VO)->@location(0) vec4f{let d=dot(i.uv,i.uv);","@fragment fn pFS(i:VO)->@location(0) vec4f{let qx=i.uv.x-clamp(i.uv.x,-i.seg,0.0);let d=qx*qx+i.uv.y*i.uv.y;");
    patch("var o=baseUniforms(st,k,st.lastDt||1/60);setU(st,o);upload(st);","var o=baseUniforms(st,k,(st.lastDt||1/60)*(kd==='particles'?(st.subs||1):1));setU(st,o);upload(st);");
    // A selected output resolution controls render targets; simulation grid/particle quality stays independent.
    patch("var tr=st.tr,sc=Math.min(1,tr.o/Math.max(W,H));","var tr=st.tr,sc=window.__agProOutputResolution?1:Math.min(1,tr.o/Math.max(W,H));");
    patch3dLighting(patch);
    const base=new URL('../',location.href).href;
    const policy="default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self' data: blob:; img-src 'self' data: blob:; media-src 'self' data: blob:";
    // Smoke takes its palette: the original keeps a quarter of a fixed grey in its albedo, which turns coloured smoke grey.
    patch("let albedo=mix(vec3f(0.78,0.8,0.84),tint,select(u.tintMix,1.0,sourceColor));","let albedo=mix(vec3f(0.78,0.8,0.84),tint,select(max(u.tintMix,0.95),1.0,sourceColor));");
    return html.replace('<head>',`<head><base href="${base}"><meta http-equiv="Content-Security-Policy" content="${policy}">`);
  });
  return sourcePromise;
}
export let WIDTH=960,HEIGHT=540;
export const BINS=2048;
export function setRenderResolution(height){
  if(![540,720,1080,1440,2160].includes(height))throw Error('Unsupported output resolution');
  HEIGHT=height;WIDTH=height*16/9;
}
// A small preview of a loaded picture or video frame for the inspector.
function thumb(src,w,h){try{const k=Math.min(1,160/Math.max(w,h,1)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(w*k));c.height=Math.max(1,Math.round(h*k));c.getContext('2d').drawImage(src,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.8);}catch{return '';}}
const SOLIDS=['knot','cube','torus','cylinder','cone','ico','pyramid','frame'];
// The page owns the one camera stream; engines receive clones, so the frames never ask for permission themselves.
let cameraProvider=null;
export function setCameraProvider(fn){cameraProvider=fn;}
const OPT_ID=/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/;
// Chips Pro expresses as node types instead (media source, built-in model, OBJ → point cloud).
const HIDDEN=/setVidSource|setPixelWarpSource|objToPointCloud|setObjModel|setObjLayout/;
const strCache=new WeakMap();
const str=o=>{if(!o||typeof o!=='object')return JSON.stringify(o??{});let v=strCache.get(o);if(v===undefined){v=JSON.stringify(o);strCache.set(o,v);}return v;};
const jobKey=job=>[job.mode,job.source||'',job.mesh?'mesh':'',str(job.chips||{}),job.look&&Object.keys(job.look).length?str(job.look):''].join('|');
// Same parameters as last frame? (objects compare by content; they are small)
function sameParams(a,b){
  if(!a||!b)return false;
  for(const k in a){const x=a[k],y=b[k];if(x===y)continue;if(x&&y&&typeof x==='object'&&typeof y==='object'&&str(x)===str(y))continue;return false;}
  for(const k in b)if(!(k in a))return false;
  return true;
}

function lowpass(src,dst,rate,hz){
  const w=2*Math.PI*hz/rate,al=Math.sin(w)/(2*Math.SQRT1_2),c=Math.cos(w),a0=1+al,b0=(1-c)/2/a0,b1=(1-c)/a0,b2=b0,a1=-2*c/a0,a2=(1-al)/a0;
  const n=Math.min(src.length,dst.length);
  for(let pass=0;pass<2;pass++){let x1=0,x2=0,y1=0,y2=0;const from=pass?dst:src;
    for(let i=0;i<n;i++){const x=from[i],y=b0*x+b1*x1+b2*x2-a1*y1-a2*y2;x2=x1;x1=x;y2=y1;y1=y;dst[i]=y;}}
  for(let i=n;i<dst.length;i++)dst[i]=0;
}
// A fake AnalyserNode living in the engine realm. Pro writes freq/wave each frame.
function fakeAnalyser(audio) {
  const dummy=()=>({type:'',frequency:{value:0},Q:{value:0},gain:{value:0},connect(){},disconnect(){}});
  // The original detects bass hits on the sound low-passed at 140 Hz (two 12 dB biquads); do the same here.
  const bass={fftSize:2048,frequencyBinCount:1024,getFloatTimeDomainData(buf){lowpass(audio.wave,buf,context.sampleRate,140);},getByteFrequencyData(buf){buf.fill(0);},connect(){},disconnect(){}};
  const context={sampleRate:48000,createBiquadFilter:dummy,createGain:dummy,createAnalyser:()=>bass,destination:{}};
  return {fftSize:BINS*2,frequencyBinCount:BINS,smoothingTimeConstant:.75,minDecibels:-100,maxDecibels:-30,context,
    getByteFrequencyData(buf){buf.set(audio.freq.subarray(0,buf.length));},
    getFloatFrequencyData(buf){for(let i=0;i<buf.length;i++)buf[i]=-100+audio.freq[i]/255*70;},
    getByteTimeDomainData(buf){for(let i=0;i<buf.length;i++)buf[i]=128+audio.wave[i%audio.wave.length]*127;},
    getFloatTimeDomainData(buf){for(let i=0;i<buf.length;i++)buf[i]=audio.wave[i%audio.wave.length];},
    connect(){},disconnect(){}};
}

// Pro's sound reaction for the WebGPU simulations: snappier attack, shorter release, more audio contrast and
// beat bursts than the original's calm defaults (measured: about 2x the beat-driven motion). Presets and knobs override it.
const PUNCH={pSimSens:60,pSimReact:70,pSimBurst:100,pSimBass:170,pSimAttack:12,pSimRelease:180,pSimEnergy:115};
// Fluid fills the frame quickly: half energy keeps it readable.
// Particles keep the original's defaults: its long, smooth flowing strands are the look.
export const SIM_TUNE={simparticles:{},simfluid:{...PUNCH,pSimEnergy:50},simsand:PUNCH,
  // Smoke accumulates density: full punch clips it to white, so it gets faster timing and bigger bursts only.
  simsmoke:{pSimSens:60,pSimReact:45,pSimBurst:100,pSimBass:120,pSimAttack:25,pSimRelease:250}};
export class EmitterEngine {
  constructor(id,onError) {
    this.id=id;this.onError=onError;this.status='starting';this.disposed=false;this.mode='';this.mediaName='';this.mediaKind='';this.generation=0;
    this.baseKey='';this.base=null;this.lastText=null;this.frames=0;
    this.audio={freq:new Uint8Array(BINS),wave:new Float32Array(2048)};
    this.canvas=document.createElement('canvas');this.canvas.width=WIDTH;this.canvas.height=HEIGHT;this.ctx=this.canvas.getContext('2d');
    this.ready=this.init().catch(error=>{if(!this.disposed){this.status='error';this.error=error.message;this.onError(error.message);}return false;});
  }
  async init() {
    const html=await engineSource();if(this.disposed)return false;
    const iframe=document.createElement('iframe');this.iframe=iframe;
    iframe.title='Isolated Audiograph Emitter engine';
    iframe.setAttribute('allow','camera \'none\'; microphone \'none\'; display-capture \'none\'');
    const loaded=new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error('Audiograph engine did not start within 20 seconds')),20000);
      iframe.onload=()=>{clearTimeout(timeout);resolve();};iframe.onerror=()=>{clearTimeout(timeout);reject(Error('Audiograph engine frame failed to load'));};
      this.cancelLoad=()=>{clearTimeout(timeout);resolve();};
    });
    iframe.srcdoc=html;document.getElementById('engines').append(iframe);await loaded;
    if(this.disposed)return false;
    const w=iframe.contentWindow;
    if(typeof w.getDefaultLayerParams!=='function'||!w.agSim||!w.agDrawDensity||typeof w.liveAnimLoop!=='function')throw Error('Renderer API unavailable in the parent app');
    this.w=w;
    w.addEventListener('error',event=>this.fail(`Emitter engine: ${event.message}`));
    w.alert=message=>{message=String(message);if(/camera/i.test(message)){this.camError=message;this.onError(message);}else this.fail(message);};
    if(w.navigator.mediaDevices)w.navigator.mediaDevices.getUserMedia=async c=>{
      if(!c?.video||c.audio||!cameraProvider)throw Error('Only the shared camera is available to Pro engines');
      return (await cameraProvider()).clone();
    };
    if(w.rafId)w.cancelVisualFrame(w.rafId);
    w.requestVisualFrame=()=>0;w.cancelVisualFrame=()=>{};
    w.audioBuffer=null;w.playing=false;w.particlesOn=false;w.agSim.noPrewarm=true;w.dprCap=1;w.canvasBg='rgba(0,0,0,0)';
    this.resize();
    w.analyser=fakeAnalyser(this.audio);w.liveMode=true;w.livePaused=false;
    try{w.localStorage.removeItem('audiograph_bass');}catch{}
    // The app's stacked render loop reads the panel back (getLayoutParams) and re-applies it (setLayoutParams) twice per
    // frame. During a Pro frame the parameters are already applied, so those round trips return / skip the frame's object.
    const realSet=w.setLayoutParams,realGet=w.getLayoutParams;this.realSet=realSet;
    w.setLayoutParams=q=>{if(this.frameP&&q===this.frameP)return;this.applied=null;realSet(q);};
    w.getLayoutParams=()=>this.frameP||realGet();
    this.defaults=w.getDefaultLayerParams();
    // Simulations keep the original's sound reaction (audio contrast, swirl by sound, exposure) and quality.
    Object.assign(this.defaults,{_particlesOn:false,_simId:1});
    this.defaults._sim={...w.AG_SIM_DEF_OPT};
    w.stackMode=true;w.activeLayerIdx=0;w.stackLayouts=[{layout:'linear',opacity:100,params:this.defaults}];
    this.status='ready';return true;
  }
  fail(message) {if(this.disposed)return;this.status='error';this.error=message;this.onError(message);}
  resize(){
    this.canvas.width=WIDTH;this.canvas.height=HEIGHT;
    if(this.iframe){this.iframe.style.width=WIDTH+'px';this.iframe.style.height=HEIGHT+'px';}
    if(this.w){this.w.__agProOutputResolution=HEIGHT>540;const fc=this.w.frameCv;fc.style.cssText=`position:fixed;left:0;top:0;width:${WIDTH}px;height:${HEIGHT}px;display:block`;this.w.sizeCanvas(fc);}
  }
  container(mode=this.mode){return this.w?.document.getElementById('layoutOpts_'+mode);}
  // Switch the trusted app to a layout, replay chip choices, snapshot the resulting parameters.
  prepare(job) {
    const w=this.w,solid=SOLIDS.includes(job.mode),mode=solid?'object':job.mode;
    const key=jobKey(job);
    if(key===this.baseKey)return mode;
    this.applied=null;
    if(mode!==this.mode){
      if(this.video){if(mode==='video')this.video.play().catch(error=>this.fail('Video playback: '+error.message));else this.video.pause();}
      w.agSim.reset();this.mode=mode;this.generation++;this.lastText=null;
      if(mode.startsWith('sim')&&!w._agIsSim(mode))throw Error(`${job.mode} is not available in this Audiograph build`);
    }
    w.stackLayouts[0].layout=mode;w.layoutMode=mode;w.setLayoutParams(this.withLook(job.look));
    // Shapes the original has no built-in model for arrive as a mesh from the 3D Object node.
    if(solid&&job.solidMesh&&!w._objBuiltinCache[job.mode]){const m=w._objNormalizeModel(job.solidMesh.verts.map(v=>v.slice()),job.solidMesh.faces.map(f=>f.slice()));m.isDefault=true;w._objBuiltinCache[job.mode]=m;}
    if(mode==='object'){w.objBuiltin=solid?job.mode:(this.mediaKind==='object'?'file':'knot');}
    try{if(mode==='object')w.setObjLayout(w.objBuiltin,null);else w.setLayout(mode,null);}catch(e){console.warn(e);}
    if(job.source){const b=[...(this.container()?.querySelectorAll('.mode-btns button')||[])].find(b=>(b.getAttribute('onclick')||'').includes(job.source));if(b&&!b.classList.contains('on'))try{b.click();}catch(e){console.warn(e);}}
    if(job.mesh){w.simOpt.spSrc='mesh';w.simOpt.spMesh=this.mediaKind==='object'?'obj':'knot';try{w.syncSimUI();}catch{}w.agSim.reset();}
    else if(job.splat&&w.simOpt.spSrc==='mesh'){w.simOpt.spSrc='galaxy';try{w.syncSimUI();}catch{}}
    const groups=this.chipGroups();
    // Growth starts as Coral unless the look or a chip picks the type.
    if(mode==='growth'&&!job.look?._growType){const b=groups.flatMap(g=>g.buttons).find(b=>/setGrowType\('coral'/.test(b.getAttribute('onclick')||''));
      if(b&&!b.classList.contains('on')&&!Object.values(job.chips||{}).includes('Vine'))try{b.click();}catch(e){console.warn(e);}}
    for(const [k,label] of Object.entries(job.chips||{})){
      const g=groups[k];if(!g)continue;
      const b=g.buttons.find(b=>b.textContent.trim()===label);
      if(b&&!b.classList.contains('on'))try{b.click();}catch(e){console.warn(e);}
    }
    this.base={...this.withLook(job.look),...w.getLayoutParams()};this.baseKey=key;return mode;
  }
  // Template looks: original layer parameters on top of the engine defaults (simulations never auto-switch).
  withLook(look) {
    const tune=SIM_TUNE[this.mode];
    if(!look||!Object.keys(look).length)return tune?{...this.defaults,...tune}:this.defaults;
    const p={...this.defaults,...tune,...look};
    if(look._sim)p._sim={...this.defaults._sim,...look._sim,auto:'off'};
    if(look._postFx)p._postFx=this.w.pfxNorm(look._postFx);
    return p;
  }
  chipGroups() {
    const box=this.container();if(!box)return [];
    return [...box.querySelectorAll('.mode-btns')].map(g=>({el:g,buttons:[...g.querySelectorAll('button')]}));
  }
  // Introspect the original panel for the current layout: knobs, chips, text fields.
  controls(job) {
    if(this.status!=='ready')return null;
    this.prepare(job);
    const box=this.container();if(!box)return [];
    const shown=e=>{for(let x=e;x&&x!==box;x=x.parentElement){if(x.style.display==='none'||x.hidden||x.classList.contains('ag-na'))return false;}return true;};
    const label=e=>{const row=e.closest('.prow,.sim-row,.ag-row')||e.parentElement;const l=row?.querySelector('.prow-label,.sublabel,label,span');return (l&&!l.contains(e)?l.textContent:'').trim().replace(/\s+/g,' ').slice(0,40);};
    const out=[],groups=this.chipGroups();
    for(const e of box.querySelectorAll('input[type=range],.mode-btns')){
      if(!shown(e))continue;
      if(e.classList.contains('mode-btns')){
        const hide=job.mesh?/setSimOpt\('sp(Src|Mesh)'/:job.splat?/setSimOpt\('(spSrc','mesh|spMesh)'/:null;
        const idx=groups.findIndex(g=>g.el===e),buttons=groups[idx].buttons.filter(b=>{const on=b.getAttribute('onclick')||'';return b.style.display!=='none'&&!/getElementById\([^)]*\)\.click\(\)/.test(on)&&!HIDDEN.test(on)&&!hide?.test(on);});
        if(!buttons.length)continue;
        const action=buttons.every(b=>/simRestart|simReset|simReinit|Preset|Shuffle|objToPointCloud|click\(\)/i.test(b.getAttribute('onclick')||''));
        out.push({type:'chips',key:String(idx),label:label(e),action,onclick:buttons[0].getAttribute('onclick')||'',options:buttons.map(b=>({label:b.textContent.trim(),on:b.classList.contains('on')}))});
      }else if(OPT_ID.test(e.id))out.push({type:'range',id:e.id,label:label(e)||e.id,min:+e.min,max:+e.max,step:+e.step||1,value:+e.value,def:+(SIM_TUNE[this.mode]?.[e.id]??this.defaults[e.id]??e.defaultValue)});
    }
    return out;
  }
  // Range of one emitter option knob (for driven option ports), cached per layout + chip state.
  optRange(job,id) {
    if(this.status!=='ready')return null;
    const key=jobKey(job);
    if(this.rangeKey!==key){this.ranges=new Map((this.controls(job)||[]).filter(c=>c.type==='range').map(c=>[c.id,c]));this.rangeKey=key;}
    return this.ranges.get(id)||null;
  }
  // Perform a chip click (presets / restart / choice) and report the resulting range values.
  click(job,key,label) {
    this.prepare(job);
    const g=this.chipGroups()[key];if(!g)throw Error('That option is no longer available');
    const b=g.buttons.find(b=>b.textContent.trim()===label);if(!b)throw Error('Unknown option '+label);
    b.click();this.applied=null;this.base=this.w.getLayoutParams();
    const ranges={};
    for(const e of this.container().querySelectorAll('input[type=range]'))if(OPT_ID.test(e.id)&&+e.value!==+(SIM_TUNE[this.mode]?.[e.id]??this.defaults[e.id]??e.defaultValue))ranges[e.id]=+e.value;
    return {ranges,on:b.classList.contains('on')};
  }
  // Render one frame of the emitter with parameter overrides. Returns the engine canvas.
  draw(job) {
    if(this.status==='error')throw Error(this.error);
    this.drawnAt=performance.now();
    if(this.status!=='ready')return null;
    if(job.templateMorph)return this.drawTemplateMorph(job);
    const w=this.w,mode=this.prepare(job);
    if(job.need&&this.mediaKind!==job.need)throw Error(`${job.label||job.mode}: load ${job.need==='image'?'an image':'a video'} in its properties`);
    const p={...this.base};
    for(const [k,v] of Object.entries(job.opts||{}))if(OPT_ID.test(k))p[k]=v;
    const cam=job.mods?._cam;
    Object.assign(p,job.mods||{});delete p._cam;
    if(job.mods?._sim)p._sim={...this.base._sim,...job.mods._sim};
    if(job.emitAsset)p._simEmitter=job.emitAsset;
    if(job.meshes&&!(this.meshes&&this.meshes.length===job.meshes.length&&this.meshes.every((m,i)=>m===job.meshes[i]))){
      this.meshes=job.meshes;
      w.__agG3Meshes=job.meshes.map(m=>m==='knot'?(w._objDefault||(w._objDefault=w._objDefaultModel())):m);
      w.__agG3MeshVer=(w.__agG3MeshVer||0)+1;
    }
    this.camera(cam);
    if(job.mods?._postFx)p._postFx=w.pfxNorm({...job.mods._postFx,enabled:true});
    w.stackLayouts[0].params=p;w.stackLayouts[0].layout=mode;w.layoutMode=mode;w.activeLayerIdx=0;
    if(!sameParams(p,this.applied)){this.realSet(p);this.applied=p;}
    if(mode==='object')w.objBuiltin=SOLIDS.includes(job.mode)?job.mode:'file';
    if(mode==='text'&&this.lastText!==job.text){w.document.getElementById('textLayoutInput').value=job.text||' ';w.generateTextLayout();this.lastText=job.text;}
    if(mode==='video'||(mode==='pixelwarp'&&(this.mediaKind==='video'||w.vidCamStream)))w.sampleVideoFrame?.();
    const r=job.response;
    if(r){const d=w.document,set=(id,v)=>{const e=d.getElementById(id);if(e&&+e.value!==v)e.value=v;};set('pIntensity',r.intensity);set('pBassPunch',r.punch);set('pBassRelease',r.release);set('pDynamics',r.dynamics);}
    this.audio.freq.set(job.audio.freq);this.audio.wave.set(job.audio.wave);
    w.analyser.context.sampleRate=job.audio.rate||48000;
    w.__agFractureDrive=job.audio.drive;
    const fc=w.frameCv,fctx=w.frameCtx;fctx.setTransform(1,0,0,1,0,0);fctx.clearRect(0,0,fc.width,fc.height);
    this.frameP=p;try{w.liveAnimLoop();}finally{this.frameP=null;}this.frames++;
    const ctx=this.ctx;ctx.resetTransform();ctx.globalCompositeOperation='source-over';ctx.clearRect(0,0,WIDTH,HEIGHT);
    ctx.filter=job.hue?`hue-rotate(${job.hue}deg)`:'none';
    const pf=w.document.getElementById('postFxCv');
    const sim=mode.startsWith('sim')?w.agSim.stats():null;
    // While the GPU starts the original paints a notice; Pro shows nothing until the simulation is ready.
    if(!sim||sim.status==='ready')ctx.drawImage(pf&&pf.style.display!=='none'&&w.postFxEnabled?pf:fc,0,0,WIDTH,HEIGHT);
    ctx.filter='none';
    if(sim){
      if(!['ready','idle','init'].includes(sim.status))throw Error(`Native WebGPU: ${sim.msg||sim.status}`);
      this.backend='Native WebGPU';
    }else this.backend=w.agGpu.status().t;
    return this.canvas;
  }
  templateBlend(from,to,mix){
    const w=this.w;
    if(!w)throw Error('Template renderer is not ready');
    const normalize=name=>{
      if(!this.templateCache)this.templateCache=new Map();
      if(!this.templateCache.has(name)){
        const p=TEMPLATE_BY_NAME.get(name);if(!p)throw Error('Unknown morph template');
        this.templateCache.set(name,{layers:p.layers.map(l=>({layout:l.layout,opacity:l.opacity??100,params:{...w.getDefaultLayerParams(),...l.look}})),postFx:p.postFx||{}});
      }
      return this.templateCache.get(name);
    };
    const A=normalize(from),B=normalize(to),fx={enabled:true};
    for(const k of new Set([...Object.keys(A.postFx),...Object.keys(B.postFx)]))fx[k]=(A.postFx[k]||0)*(1-mix)+(B.postFx[k]||0)*mix;
    return {layers:w.pmBlendNorm(A,B,mix),postFx:fx};
  }
  drawTemplateMorph(job){
    const w=this.w,{from,to,mix}=job.templateMorph,blend=this.templateBlend(from,to,mix/100);
    this.mode='templateMorph';w.pmActive=true;w.pmSpinLive=true;w.stackMode=true;
    w.stackLayouts=blend.layers;w.activeLayerIdx=0;w.layoutMode=blend.layers[0].layout;w.canvasBg='#000000';
    w.compFx=w.pfxNorm(blend.postFx);w.postFxEnabled=true;
    if(!w.postFxGl)w.initPostFx();
    const pf=w.document.getElementById('postFxCv');pf.style.display='block';
    this.audio.freq.set(job.audio.freq);this.audio.wave.set(job.audio.wave);w.analyser.context.sampleRate=job.audio.rate||48000;
    this.realSet(blend.layers[0].params);
    w.liveAnimLoop();this.frames++;
    this.ctx.resetTransform();this.ctx.globalCompositeOperation='copy';this.ctx.drawImage(pf,0,0,WIDTH,HEIGHT);this.ctx.globalCompositeOperation='source-over';
    const sim=w.agSim.stats();if(sim.errors?.length)throw Error('Template WebGPU: '+sim.errors[0]);
    this.backend='Original template morph';return this.canvas;
  }
  // Webcam node: start/stop the app's own camera colour and displacement feature and set its controls.
  camera(cam) {
    const w=this.w,d=w.document;
    if(!cam){this.camError='';if(w.camActive||w.camStarting)w.stopCam();return;}
    if(!w.camActive&&!w.camStarting&&!this.camError)w.toggleCam();
    d.getElementById('camDisplace').value=cam.displace;d.getElementById('camSmooth').value=cam.smooth;
    w.camDispDir=cam.dir;w.camUseColors=!!(cam.colors&&w.camActive);
    if(w.camActive)w.sampleCamLoop();
  }
  usesCamera(){return !!(this.w&&(this.w.camActive||this.w.camStarting||this.w.vidCamStream));}
  // Run the original per-layer Post FX shader on any canvas. `slot` keeps trail history per node.
  fx(slot,src,settings,drive) {
    if(this.status!=='ready')return null;
    const w=this.w;w.__agFractureDrive=drive;
    const out=w.applyLayerFx(slot,src,w.pfxNorm({...settings,enabled:true}));
    return out;
  }
  async media(file,kind) {
    if(file.size>80*1024*1024)throw Error('Media limit is 80 MB per file');
    await this.ready;if(!this.w||this.disposed)throw Error('Emitter engine is not ready');
    const w=this.w;this.mediaKind='';this.mediaName='';this.mediaThumb='';this.baseKey='';this.applied=null;
    if(kind==='image') {
      if(!['image/png','image/jpeg','image/webp','image/gif','image/avif'].includes(file.type))throw Error('Use a raster PNG, JPEG, WebP, GIF or AVIF image');
      const bitmap=await createImageBitmap(file);
      if(bitmap.width*bitmap.height>16000000){bitmap.close();throw Error('Image limit is 16 megapixels');}
      const cv=w.document.createElement('canvas');cv.width=bitmap.width;cv.height=bitmap.height;cv.getContext('2d').drawImage(bitmap,0,0);bitmap.close();
      cv.complete=true;// Pixel warp only samples images that report complete.
      this.mediaThumb=thumb(cv,cv.width,cv.height);
      w.imgLayoutImg=cv;w.imgSource='raster';w.sampleLayoutImage();
      if(w.agPixelWarp?.setImage)try{w.agPixelWarp.setImage(cv);}catch(e){console.warn(e);}
    }else if(kind==='video') {
      if(!file.type.startsWith('video/'))throw Error('Choose a video file');
      const url=URL.createObjectURL(file),video=w.document.createElement('video');
      try{
        video.muted=true;video.loop=true;video.playsInline=true;video.src=url;
        await new Promise((resolve,reject)=>{
          const timeout=setTimeout(()=>reject(Error('Video did not decode within 20 seconds')),20000);
          video.onloadeddata=()=>{clearTimeout(timeout);resolve();};
          video.onerror=()=>{clearTimeout(timeout);reject(Error('This video format could not be decoded: '+(video.error?.message||'media error')));};
        });
        await video.play();
      }catch(error){URL.revokeObjectURL(url);throw error;}
      if(this.video){this.video.pause();this.video.removeAttribute('src');}
      if(this.videoURL)URL.revokeObjectURL(this.videoURL);
      this.videoURL=url;this.video=video;w.vidEl=video;w.sampleVideoFrame();this.mediaThumb=thumb(video,video.videoWidth,video.videoHeight);
    }else if(kind==='splat') {
      if(!/\.(ply|splat)$/i.test(file.name))throw Error('Choose a .ply or .splat file');
      const r=w.agSplatParse(await file.arrayBuffer(),file.name);
      Object.assign(w.AG_SPLAT,{file:r.data,n:r.n,name:file.name,err:''});w.AG_SPLAT.ver++;
      this.mediaKind=kind;this.mediaName=file.name;return {flip:!!r.flip};
    }else{
      if(!file.name.toLowerCase().endsWith('.obj'))throw Error('Choose an OBJ file');
      w.objModelData=w.agParseObj(await file.text());w.objBuiltin='file';w.AG_SPLAT.meshVer=(w.AG_SPLAT.meshVer||0)+1;
    }
    this.mediaKind=kind;this.mediaName=file.name;
  }
  // Forget the loaded file: the node falls back to its empty state (built-in model, demo cloud, no picture).
  clearMedia() {
    const w=this.w;if(!w)return;
    if(this.mediaKind==='image'){w.imgLayoutImg=null;try{w.agPixelWarp?.setImage?.(null);}catch{}}
    if(this.mediaKind==='video'&&this.video){this.video.pause();this.video.removeAttribute('src');if(this.videoURL)URL.revokeObjectURL(this.videoURL);this.video=null;this.videoURL='';w.vidEl=null;}
    if(this.mediaKind==='object'){w.objModelData=null;w.objBuiltin='knot';w.AG_SPLAT.meshVer=(w.AG_SPLAT.meshVer||0)+1;}
    if(this.mediaKind==='splat'){Object.assign(w.AG_SPLAT,{file:null,n:0,name:''});w.AG_SPLAT.ver++;}
    this.mediaKind='';this.mediaName='';this.mediaThumb='';this.baseKey='';this.applied=null;
  }
  stats() {return this.w?{status:this.status,mode:this.mode,generation:this.generation,frames:this.frames,sim:this.w.agSim.stats(),renderer:this.w.agGpu.stats()}: {status:this.status};}
  dispose() {
    this.disposed=true;this.cancelLoad?.();
    if(this.video){this.video.pause();this.video.removeAttribute('src');}
    if(this.videoURL)URL.revokeObjectURL(this.videoURL);
    if(this.w){try{this.w.stopCam?.();this.w.stopWebcamFeed?.();}catch{}try{this.w.agSim.reset();if(this.w.agSim.status()==='ready')this.w.agSim.loseDevice();}catch{}}
    this.iframe?.remove();this.w=null;this.canvas.width=this.canvas.height=1;
  }
}
