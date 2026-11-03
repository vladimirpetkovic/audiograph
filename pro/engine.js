// Isolated Audiograph engines. Each Emitter owns one same-origin iframe running the real app; Pro drives
// the app's own live render loop (liveAnimLoop) one frame at a time with a synthetic analyser, so every
// original feature that lives in the composite (symmetry, flip, mirror, spin, particles, per-layer Post FX)
// renders exactly as in Audiograph.
import {TEMPLATE_BY_NAME} from './morph.js';
import {parseGLTF,pose} from './gltf.js';
import {parseFBXModel} from './fbx-model.js';
// The 3D lighting after the WebGPU Cornell box sample (soft cast shadows, light size, bounce light, floor), smooth
// cube normals and the link width / glow / pulse knobs are built into the classic engine; Pro keeps only its own defaults.
function patch3dLighting(patch){
  // Nothing turns on its own by default: auto orbit, orbit with sound and clone spin start at 0 (presets set their own).
  patch("['pG3Spin','Spin',-100,100,15,","['pG3Spin','Spin',-100,100,0,");patch("st.g3spin+=h*K('pG3Spin',15)","st.g3spin+=h*K('pG3Spin',0)");
  patch("['pG3Orbit','Auto orbit',-100,100,12,","['pG3OrbitSnd','Orbit with sound',0,100,0,5,'%','The camera turns with the music.'],['pG3Orbit','Auto orbit',-100,100,0,");
  patch("K('pG3Orbit',12)","K('pG3Orbit',0)");patch("K('pG3OrbitSnd',50)","K('pG3OrbitSnd',0)");
  patch("['Camera',['pG3Orbit','pG3Tilt','pG3Zoom']]","['Camera',['pG3Orbit','pG3OrbitSnd','pG3Tilt','pG3Zoom','pG3Focal']]");
  // Focal length (full-frame mm; 28 mm = the original 0.8 rad view). The distance follows so the array stays framed:
  // short lenses exaggerate depth, long ones flatten it. Classic 3D modes scale their Perspective by the same ratio.
  patch("['pG3Zoom','Zoom',30,300,100,5,'%','100% frames the whole array.'],","['pG3Zoom','Zoom',30,300,100,5,'%','100% frames the whole array.'],['pG3Focal','Focal length',10,200,28,1,'mm','Lens: short is wide with strong perspective, long is telephoto and flat. The array stays framed.'],");
  patch("var ow=st.ow,oh=st.oh,asp=ow/oh,fovY=0.8,","var ow=st.ow,oh=st.oh,asp=ow/oh,fovY=2*Math.atan(Math.tan(0.4)*28/Math.max(8,K('pG3Focal',28))),");
  for(const id of ['pTerrainPersp','pSpherePersp','pObjPersp','pDnaPersp'])patch(`var persp=+document.getElementById('${id}').value||`,`var persp=(window.__agFocal||1)*(+document.getElementById('${id}').value)||(window.__agFocal||1)*`);
  patch("var persp=+document.getElementById(prefix+'Persp').value||","var persp=(window.__agFocal||1)*(+document.getElementById(prefix+'Persp').value)||(window.__agFocal||1)*");
  patch("persp=g('pTerrainPersp',200),","persp=g('pTerrainPersp',200)*(window.__agFocal||1),");
  // A 3D camera wired after a 3D Model frames it like a lens: the camera's Rotate / Orbit / Tilt / Zoom / Focal length replace the
  // object's own Perspective, Tilt and Rotate, and the model keeps the same size at any resolution and in every render.
  patch("var rotAngle=_objSpinRot*_rotMul+dragRotY;","var rotAngle=window.__agCam?dragRotY-window.__agCam.yaw:_objSpinRot*_rotMul+dragRotY;if(window.__agCam){var _k=window.__agCam,_P=0.5*Math.min(W,H)*_k.f/Math.tan(0.4),_s=0.24*_k.zoom*Math.min(W,H);persp=_P;baseR=_s*_P/Math.max(_P-_s,_P*0.25);maxBump=baseR*0.15*elevScale*p.height;tiltRad=_k.tilt;}");
  // Point clouds take the same lens; a model turned into points is framed like the model drawn as lines or polygons.
  patch("asp=st.ow/st.oh,fovY=0.8,half=","asp=st.ow/st.oh,fovY=2*Math.atan(Math.tan(0.4)/(window.__agFov||1)),half=");
  patch("var bnd=1.6,dist=bnd/Math.sin(half)/Math.max(0.3,K('pGsZoom'","var bnd=window.__agSplBnd||1.6,dist=bnd/Math.sin(half)/Math.max(0.3,K('pGsZoom'");
  // Random effector on each axis: rotation X / Y / Z and scale X / Z next to the original's Y stretch.
  patch("['pG3RndRot','Random tilt',0,180,0,5,'deg','Random orientation of each clone.'],",
    "['pG3RndRX','Random rotate X',0,180,0,5,'deg','Random turn of each clone around X.'],['pG3RndRY','Random rotate Y',0,180,0,5,'deg','Random turn of each clone around Y.'],"+
    "['pG3RndRZ','Random rotate Z',0,180,0,5,'deg','Random turn of each clone around Z.'],"+
    "['pG3RndSX','Random scale X',0,100,0,5,'%','Random stretch of each clone along X.'],['pG3RndSZ','Random scale Z',0,100,0,5,'%','Random stretch of each clone along Z.'],");
  patch("'pG3RndCol','pG3RndRot','pG3RndPosX'","'pG3RndCol','pG3RndRX','pG3RndRY','pG3RndRZ','pG3RndSX','pG3RndSZ','pG3RndPosX'");
  patch("'g3-r-b':['pG3RndCol','pG3RndRot']","'g3-r-b':['pG3RndCol','pG3RndRX','pG3RndRY','pG3RndRZ','pG3RndSX','pG3RndSZ']");
  patch("var rr=K('pG3RndRot',0)*dg;set(76,rr,rr,rr,","set(1260,K('pG3RndSX',0)/100,0,K('pG3RndSZ',0)/100,0);set(76,K('pG3RndRX',0)*dg,K('pG3RndRY',0)*dg,K('pG3RndRZ',0)*dg,");
  patch("S.y=S.y*exp(c.lt.x*1.6*(2.0*hr(ii,60u)-1.0));return S;}","S=S*exp(1.6*vec3f(c.rs3.x*(2.0*hr(ii,61u)-1.0),c.lt.x*(2.0*hr(ii,60u)-1.0),c.rs3.z*(2.0*hr(ii,62u)-1.0)));return S;}");
  patch("rad*(Math.exp(1.6*rndH)-1)*0.8","rad*(Math.exp(1.6*Math.max(rndH,K('pG3RndSX',0)/100,K('pG3RndSZ',0)/100))-1)*0.8");
}
const VIEW3D=['terrain','sphere','tetrahedron','dna','object','fractal'];
// Depth of field for the classic 3D drawers (Canvas 2D lines have no depth buffer): the drawer renders offscreen while its
// projected vertices fill a coarse nearest-depth grid; the frame is then rebuilt from four blur levels, each masked to
// the grid cells whose distance from the focus plane calls for it. Focus 0 is the near side of the object, 100 the far side.
const DOF_DRAWERS=['drawTerrain','drawSphere','drawPolyhedron','drawDNA','drawObjModel'];
function installDof(w){
  const d=w.document,cv=()=>{const c=d.createElement('canvas');return [c,c.getContext('2d')];};
  const [off,octx]=cv(),[lay,lctx]=cv(),[acc,actx]=cv(),[mask,mctx]=cv();
  const GW=64;let gh=36,grid=new Float32Array(GW*gh),zmin=0,zmax=0,sw=1,sh=1;
  const dz=(x,y,z)=>{const i=Math.floor(x*sw),j=Math.floor(y*sh);if(i<0||j<0||i>=GW||j>=gh||!(z===z))return;const k=j*GW+i;if(z<grid[k])grid[k]=z;if(z<zmin)zmin=z;if(z>zmax)zmax=z;};
  for(const name of DOF_DRAWERS){
    const orig=w[name];if(typeof orig!=='function')continue;
    w[name]=function(ctx,W,H,values,p,forExport,...rest){
      const cfg=w.__agDofCfg;
      if(!cfg||forExport||!ctx?.canvas)return orig.call(this,ctx,W,H,values,p,forExport,...rest);
      const cw=ctx.canvas.width,ch=ctx.canvas.height;
      for(const c of [off,lay,acc])if(c.width!==cw||c.height!==ch){c.width=cw;c.height=ch;}
      gh=Math.max(4,Math.round(GW*H/W));if(grid.length!==GW*gh)grid=new Float32Array(GW*gh);
      grid.fill(Infinity);zmin=Infinity;zmax=-Infinity;sw=GW/W;sh=gh/H;
      octx.setTransform(1,0,0,1,0,0);octx.clearRect(0,0,cw,ch);octx.setTransform(ctx.getTransform());
      for(const k of ['globalCompositeOperation','strokeStyle','fillStyle','lineWidth','lineCap','lineJoin','font','textAlign','textBaseline'])octx[k]=ctx[k];
      octx.globalAlpha=1;
      w.__agDz=dz;let out;
      try{out=orig.call(this,octx,W,H,values,p,forExport,...rest);}finally{w.__agDz=null;}
      composite(ctx,cw,ch,cfg);
      return out;
    };
  }
  function composite(ctx,cw,ch,cfg){
    const n=GW*gh,span=zmax-zmin;
    // Fill empty cells (between vertices) from their nearest neighbours.
    for(let pass=0;pass<8;pass++){let open=0;const g=grid.slice();
      for(let j=0;j<gh;j++)for(let i=0;i<GW;i++){const k=j*GW+i;if(g[k]!==Infinity)continue;let m=Infinity;
        if(i>0)m=Math.min(m,g[k-1]);if(i<GW-1)m=Math.min(m,g[k+1]);if(j>0)m=Math.min(m,g[k-GW]);if(j<gh-1)m=Math.min(m,g[k+GW]);
        if(m===Infinity)open++;else grid[k]=m;}
      if(!open)break;}
    const f=(cfg.focus??50)/100,R=Math.min(cw,ch)*.028*Math.min(1,cfg.amt/100),lv=[0,R/3,R*2/3,R],wts=new Float32Array(n*4);
    for(let k=0;k<n;k++){const z=grid[k],t=z===Infinity||!(span>1e-6)?f:(z-zmin)/span,r=Math.min(1,Math.abs(t-f)*2)*3,a=Math.min(2,Math.floor(r)),fr=Math.min(1,r-a);wts[k*4+a]=1-fr;wts[k*4+a+1]=fr;}
    if(mask.width!==GW||mask.height!==gh){mask.width=GW;mask.height=gh;}
    actx.setTransform(1,0,0,1,0,0);actx.globalCompositeOperation='source-over';actx.clearRect(0,0,cw,ch);actx.globalCompositeOperation='lighter';
    const img=mctx.createImageData(GW,gh);
    for(let L=0;L<4;L++){let any=false;
      for(let k=0;k<n;k++){const v=wts[k*4+L];img.data[k*4+3]=Math.round(v*255);if(v>0)any=true;}
      if(!any)continue;
      mctx.putImageData(img,0,0);
      lctx.setTransform(1,0,0,1,0,0);lctx.globalCompositeOperation='source-over';lctx.clearRect(0,0,cw,ch);
      lctx.filter=lv[L]>.3?`blur(${lv[L].toFixed(1)}px)`:'none';lctx.drawImage(off,0,0);lctx.filter='none';
      lctx.globalCompositeOperation='destination-in';lctx.imageSmoothingEnabled=true;lctx.drawImage(mask,0,0,cw,ch);
      actx.drawImage(lay,0,0);}
    ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.filter='none';ctx.drawImage(acc,0,0);ctx.restore();
  }
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
    patch("if(shape==='sphere'){","if(/^mesh\\d$/.test(shape)){var om=(window.__agG3Meshes||[])[+shape[4]];if(om&&om.verts){var ov=om.verts,on=om.normals;for(var fi=0;fi<om.faces.length&&fi<40000;fi++)poly(om.faces[fi].map(function(ix){var q=on[ix];return V([ov[ix][0]*.7,-ov[ix][1]*.7,ov[ix][2]*.7],q&&[q[0],-q[1],q[2]])}))}}else if(shape==='sphere'){");
    // Animated models: a new pose keeps the faces, so the wireframe edges are reused and only the positions change.
    patch("var c=_objWireCache;if(c&&c.model===model&&c.maxFaces===maxFaces)return c.wire;","var c=_objWireCache;if(c&&c.model===model&&c.maxFaces===maxFaces)return c.wire;if(c&&c.model.faces===model.faces&&c.maxFaces===maxFaces&&model.faces.length<=maxFaces){c.model=model;c.wire={verts:model.verts,normals:model.normals,edges:c.wire.edges};return c.wire;}");
    patch("function g3MeshMix(list,D){","function g3MeshMix(list,D){if(G.g3mv!==window.__agG3MeshVer){G.g3mv=window.__agG3MeshVer;for(var _k in G.g3m)if(_k.indexOf('mesh')>=0){try{G.g3m[_k].buf.destroy()}catch(e){}delete G.g3m[_k]}}");
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
    // Depth of field for the classic 3D line drawers: every projected vertex reports its screen position and depth.
    const DZ='window.__agDz&&window.__agDz';
    patch("rowPts.push({sx:sx,sy:sy,h:hVal/Math.max(1,maxH)});",DZ+"(sx,sy,d);rowPts.push({sx:sx,sy:sy,h:hVal/Math.max(1,maxH)});");
    patch("rowPts.push({sx:sx,sy:sy,h:grid[la][lo]/Math.max(1,maxBump),vis:visible,depth:rz,",DZ+"(sx,sy,rz);rowPts.push({sx:sx,sy:sy,h:grid[la][lo]/Math.max(1,maxBump),vis:visible,depth:rz,");
    patch("projected.push({sx:sx,sy:sy,h:pt.h,nz:tnz,depth:tz,",DZ+"(sx,sy,tz);projected.push({sx:sx,sy:sy,h:pt.h,nz:tnz,depth:tz,");
    patch("projected[vi]={sx:sx,sy:sy,h:Math.max(0,h/Math.max(1,maxBump)),nz:tnz,depth:tz,",DZ+"(sx,sy,tz);projected[vi]={sx:sx,sy:sy,h:Math.max(0,h/Math.max(1,maxBump)),nz:tnz,depth:tz,");
    patch("strand1.push({sx:sx1,sy:sy1,z:rz1,",DZ+"(sx1,sy1,rz1);"+DZ+"(sx2,sy2,rz2);strand1.push({sx:sx1,sy:sy1,z:rz1,");
    patch("if(o.d3){var q=distortLinear(sx,sy,W,H,o.d3);sx=q.x;sy=q.y}return[sx,sy,c[2]]}","if(o.d3){var q=distortLinear(sx,sy,W,H,o.d3);sx=q.x;sy=q.y}"+DZ+"(sx,sy,c[2]);return[sx,sy,c[2]]}");
    // Pro's emit assets are whole frames: map the frame onto the frame so particles spawn where the driver is drawn
    // (Emitter size stays a multiplier, its default 65 % meaning 1:1).
    patch("o.emitScale=K('pEmitScale',65)/100;","o.emitScale=K('pEmitScale',65)/100*(asset&&asset.frame?(st.asp||1)/.65:1);");
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
const SOLIDS=['knot','cube','torus','cylinder','cone','ico','pyramid','frame','text3d'];
// The page owns the one camera stream; engines receive clones, so the frames never ask for permission themselves.
let cameraProvider=null;
export function setCameraProvider(fn){cameraProvider=fn;}
const OPT_ID=/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/;
// Chips Pro expresses as node types instead (media source, built-in model, OBJ → point cloud).
const HIDDEN=/setVidSource|setPixelWarpSource|objToPointCloud|setObjModel|setObjLayout/;
const strCache=new WeakMap();
const str=o=>{if(!o||typeof o!=='object')return JSON.stringify(o??{});let v=strCache.get(o);if(v===undefined){v=JSON.stringify(o);strCache.set(o,v);}return v;};
const jobKey=job=>[job.mode,job.source||'',job.mesh?'mesh':'',job.poly?'poly':'',job.solidMesh?.id||'',str(job.chips||{}),job.look&&Object.keys(job.look).length?str(job.look):''].join('|');
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
    installDof(w);
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
    const w=this.w,solid=SOLIDS.includes(job.mode)||!!(job.poly&&job.solidMesh),mode=solid?'object':job.mode;
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
    if(solid&&job.solidMesh&&w._objBuiltinCache[job.mode]?.src!==job.solidMesh){const m=w._objNormalizeModel(job.solidMesh.verts.map(v=>v.slice()),job.solidMesh.faces.map(f=>f.slice()));m.isDefault=true;m.src=job.solidMesh;w._objBuiltinCache[job.mode]=m;}
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
    // Polygons: the 3D Object's faces drawn filled (after the chips, so a remembered Signal chip can't override it).
    if(mode==='object'){w.objSignal=job.poly?'poly':w.objSignal==='poly'?'shape':w.objSignal;try{w.syncObjSignalUI();}catch(e){console.warn(e);}}
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
    // The 3D camera node's lens (Depth of field, Focus) reaches the classic 3D line drawers too.
    w.__agFocal=VIEW3D.includes(mode)&&job.mods?.pG3Focal>0?job.mods.pG3Focal/28:1;
    w.__agDofCfg=VIEW3D.includes(mode)&&mode!=='fractal'&&job.mods?.pG3Dof>0?{amt:job.mods.pG3Dof,focus:job.mods.pG3Focus??50}:null;
    // Viewport camera: the 3D cloner and splats orbit, pan and zoom natively; classic 3D modes take the orbit.
    const v=job.view||{},dg=Math.PI/180;
    this.viewMode=mode==='simcloner'||mode==='simsplat'?'sim':VIEW3D.includes(mode)?'classic':null;
    if(this.viewMode==='classic'){p._dragRotX=(p._dragRotX||0)+(v.pit||0)*dg;p._dragRotY=(p._dragRotY||0)-(v.yaw||0)*dg;}
    if(job.mods?._postFx)p._postFx=w.pfxNorm({...job.mods._postFx,enabled:true});
    w.stackLayouts[0].params=p;w.stackLayouts[0].layout=mode;w.layoutMode=mode;w.activeLayerIdx=0;
    // 3D camera after a model / primitive drawn as lines, polygons or a point cloud (the cloner reads its own camera knobs).
    const cm=job.mods||{},camOn=cm.pG3Zoom!=null&&(mode==='object'||mode==='simsplat'),now=this.drawnAt;
    if(camOn){const dt=Math.min(.1,Math.max(0,(now-(this.camAt||now))/1000)),f=job.audio?.freq,lv=f&&f.length?f.slice(0,64).reduce((a,b)=>a+b,0)/64/255:0;
      this.camYaw=((this.camYaw||0)+dt*((cm.pG3Orbit||0)/100*69+(cm.pG3OrbitSnd||0)/100*lv*90))%360;}
    this.camAt=now;
    const camYaw=(cm.pG3Yaw||0)+(camOn?this.camYaw:0);
    w.__agCam=camOn&&mode==='object'?{f:(+cm.pG3Focal||28)/28,zoom:(cm.pG3Zoom||100)/100,tilt:(cm.pG3Tilt??18)*dg,yaw:camYaw*dg}:null;
    w.__agFov=camOn&&mode==='simsplat'?(+cm.pG3Focal||28)/28:1;
    w.__agSplBnd=job.mesh?3.3:null;
    if(camOn&&mode==='simsplat'){p.pGsTilt=cm.pG3Tilt??18;p.pGsZoom=cm.pG3Zoom??100;p.pGsOrbit=0;}
    if(!sameParams(p,this.applied)){this.realSet(p);this.applied=p;}
    // A node's own 3D tilt / rotate turn the sim camera (3D Object drawn Normal, Cloner, splats) on top of the viewport orbit.
    if(this.viewMode==='sim'){const so=w.simOpt;so.vYaw=(v.yaw||0)-(p._dragRotY||0)/dg+(cm.pG3Zoom!=null?camYaw:0);so.vPit=(v.pit||0)+(p._dragRotX||0)/dg;so.vPx=v.px||0;so.vPy=v.py||0;so.vZm=v.zm||1;}
    if(mode==='object')w.objBuiltin=SOLIDS.includes(job.mode)||job.poly&&job.solidMesh?job.mode:'file';
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
      const lower=file.name.toLowerCase();
      if(/\.(glb|gltf|fbx)$/.test(lower)){
        // glTF / GLB / FBX: kept as a rig so animated models can be posed every frame (animate()).
        const buf=await file.arrayBuffer(),m=lower.endsWith('.fbx')?await parseFBXModel(buf,file.name):parseGLTF(buf,file.name);this.anim=m;this.animT=null;
        w.objModelData=pose(m,m.clips.length?0:-1,0);
      }else if(lower.endsWith('.obj')){this.anim=null;w.objModelData=w.agParseObj(await file.text());}
      else throw Error('Choose an OBJ, FBX, GLB or glTF model');
      w.objBuiltin='file';w.AG_SPLAT.meshVer=(w.AG_SPLAT.meshVer||0)+1;
    }
    this.mediaKind=kind;this.mediaName=file.name;
  }
  // Animated model: pose the clip at time t (seconds × speed), at most ~30 times a second. The posed mesh is a new object,
  // so Cloners and point clouds see it change; returns true when the pose moved.
  animate(t,speed=1,clip=0) {
    const m=this.anim,w=this.w;if(!m||!w||!m.clips.length)return false;
    const c=Math.max(0,Math.min(m.clips.length-1,Math.round(clip))),tt=t*speed;
    if(this.animT!==null&&this.animClip===c&&Math.abs(tt-this.animT)<1/30)return false;
    this.animT=tt;this.animClip=c;w.objModelData=pose(m,c,tt);w.AG_SPLAT.meshVer=(w.AG_SPLAT.meshVer||0)+1;return true;
  }
  // Forget the loaded file: the node falls back to its empty state (built-in model, demo cloud, no picture).
  clearMedia() {
    const w=this.w;if(!w)return;
    if(this.mediaKind==='image'){w.imgLayoutImg=null;try{w.agPixelWarp?.setImage?.(null);}catch{}}
    if(this.mediaKind==='video'&&this.video){this.video.pause();this.video.removeAttribute('src');if(this.videoURL)URL.revokeObjectURL(this.videoURL);this.video=null;this.videoURL='';w.vidEl=null;}
    if(this.mediaKind==='object'){this.anim=null;w.objModelData=null;w.objBuiltin='knot';w.AG_SPLAT.meshVer=(w.AG_SPLAT.meshVer||0)+1;}
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
