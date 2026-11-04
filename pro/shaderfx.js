// Shader runner for Post FX: one shared WebGL2 context runs Shadertoy-style fragment shaders over a picture.
// Built-ins (Melt, Tunnel) and the user's Shader node use the same path:
//   iChannel0 = the incoming picture, iChannel1 = sound (row 0 spectrum, row 1 waveform, 512 × 2 like Shadertoy),
//   iChannel2 = this node's previous output (feedback), plus iResolution, iTime, iTimeDelta, iFrame and
//   uBass, uMids, uHigh, uLevel, uBeat (0–1) and uKnob[4].
export const KNOBS=4;
const HEAD=`#version 300 es
precision highp float;
uniform vec3 iResolution;uniform float iTime,iTimeDelta;uniform int iFrame;uniform vec4 iMouse;
uniform sampler2D iChannel0,iChannel1,iChannel2;
uniform float uBass,uMids,uHigh,uLevel,uBeat;uniform float uKnob[${KNOBS}];
out vec4 agOut;
#define texture2D texture
`;
const TAIL=`
void main(){vec4 c=vec4(0,0,0,1);mainImage(c,gl_FragCoord.xy);agOut=c;}`;
const VS=`#version 300 es
in vec2 p;void main(){gl_Position=vec4(p,0,1);}`;
const COPY=`#version 300 es
precision highp float;uniform sampler2D t;uniform vec2 r;out vec4 o;void main(){o=texture(t,gl_FragCoord.xy/r);}`;

// `uniform float warp; // @knob 0..2 =0.5` becomes knob 1 (range 0..2, default 0.5). Up to four knobs.
const KNOB_RE=/^[ \t]*uniform\s+float\s+([A-Za-z_]\w*)\s*;\s*\/\/\s*@knob\b([^\n]*)$/gm;
export function parseKnobs(code){
  const out=[];
  for(const m of String(code).matchAll(KNOB_RE)){
    if(out.length>=KNOBS)break;
    const r=/(-?[\d.]+)\s*\.\.\s*(-?[\d.]+)/.exec(m[2]),d=/=\s*(-?[\d.]+)/.exec(m[2]);
    let min=r?+r[1]:0,max=r?+r[2]:1;if(!Number.isFinite(min)||!Number.isFinite(max)||min===max){min=0;max=1;}
    const def=d&&Number.isFinite(+d[1])?Math.min(Math.max(+d[1],Math.min(min,max)),Math.max(min,max)):(min+max)/2;
    out.push({name:m[1],min,max,def,label:m[1].replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ').replace(/^./,c=>c.toUpperCase())});
  }
  return out;
}
// Real values ({name: value}) as the 0–1 knob positions the shader reads.
export function knobValues(code,values){return parseKnobs(code).map(k=>{const v=values[k.name]??k.def;return Math.max(0,Math.min(1,(v-k.min)/(k.max-k.min)));});}
// Compiles code without drawing; returns an Error or null (null too when WebGL2 is missing: the node reports it when it runs).
export function checkShader(code){if(!gl&&!init(16,16))return null;try{program(code);return null;}catch(e){return e;}}
// Knob value (0–100) for a knob's default.
export const knobDefault=k=>Math.round((k.def-k.min)/(k.max-k.min)*100);
function wrap(code){
  const knobs=parseKnobs(code);let body=String(code);
  knobs.forEach((k,i)=>{body=body.replace(new RegExp(`^[ \\t]*uniform\\s+float\\s+${k.name}\\s*;[^\\n]*$`,'m'),`#define ${k.name} mix(${k.min.toFixed(6)},${k.max.toFixed(6)},uKnob[${i}])`);});
  return {src:HEAD+body+TAIL,headLines:HEAD.split('\n').length-1};
}

let gl=null,quad,copyProg,inTex,sndTex,blackTex;const progs=new Map(),fb=new Map(),snd=new Uint8Array(512*2);
function texture(w=1,h=1,data=null,filter){
  const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,filter||gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,filter||gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,data);return t;
}
function compile(fs){
  const sh=(type,s)=>{const x=gl.createShader(type);gl.shaderSource(x,s);gl.compileShader(x);if(!gl.getShaderParameter(x,gl.COMPILE_STATUS)){const log=gl.getShaderInfoLog(x);gl.deleteShader(x);throw Error(log||'compile failed');}return x;};
  const v=sh(gl.VERTEX_SHADER,VS),f=sh(gl.FRAGMENT_SHADER,fs),p=gl.createProgram();gl.attachShader(p,v);gl.attachShader(p,f);gl.bindAttribLocation(p,0,'p');gl.linkProgram(p);
  gl.deleteShader(v);gl.deleteShader(f);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS)){const log=gl.getProgramInfoLog(p);gl.deleteProgram(p);throw Error(log||'link failed');}
  return p;
}
function init(w,h){
  const c=document.createElement('canvas');c.width=w;c.height=h;
  gl=c.getContext('webgl2',{premultipliedAlpha:false,preserveDrawingBuffer:true,alpha:true});if(!gl)return false;
  quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  copyProg=compile(COPY);inTex=texture();blackTex=texture(1,1,new Uint8Array([0,0,0,0]));
  sndTex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,sndTex);
  for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,k,v);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,512,2,0,gl.RED,gl.UNSIGNED_BYTE,null);
  c.addEventListener('webglcontextlost',e=>{e.preventDefault();gl=null;progs.clear();fb.clear();});
  return true;
}
// Compiled program for a shader source (cached); throws the compile log with line numbers of the user's code.
function program(code){
  let p=progs.get(code);if(p)return p;
  const {src,headLines}=wrap(code);
  if(!/\bmainImage\s*\(/.test(code))throw Error('The shader needs a mainImage(out vec4 fragColor, in vec2 fragCoord) function, as on Shadertoy');
  try{p={prog:compile(src),loc:{}};}
  catch(e){throw Error(String(e.message).replace(/ERROR:\s*0:(\d+):/g,(_,l)=>`line ${Math.max(1,l-headLines)}:`).trim().split('\n').slice(0,4).join('\n'));}
  for(const k of ['iResolution','iTime','iTimeDelta','iFrame','iMouse','iChannel0','iChannel1','iChannel2','uBass','uMids','uHigh','uLevel','uBeat','uKnob'])p.loc[k]=gl.getUniformLocation(p.prog,k);
  if(progs.size>=24){const [k,old]=progs.entries().next().value;gl.deleteProgram(old.prog);progs.delete(k);}
  progs.set(code,p);return p;
}
// Per-node ping-pong targets for feedback (previous output in iChannel2).
function targets(id,w,h){
  let f=fb.get(id);
  if(!f||f.w!==w||f.h!==h){
    if(f)for(const t of f.tex){gl.deleteTexture(t);}if(f)for(const b of f.fbo)gl.deleteFramebuffer(b);
    f={w,h,i:0,tex:[texture(w,h),texture(w,h)],fbo:[gl.createFramebuffer(),gl.createFramebuffer()]};
    for(let k=0;k<2;k++){gl.bindFramebuffer(gl.FRAMEBUFFER,f.fbo[k]);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,f.tex[k],0);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);}
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);fb.set(id,f);
  }
  return f;
}
export function dropShaderState(keep){for(const [id,f] of fb)if(!keep.has(id)&&gl){for(const t of f.tex)gl.deleteTexture(t);for(const b of f.fbo)gl.deleteFramebuffer(b);fb.delete(id);}}
// The sound as a 512 × 2 texture: row 0 the spectrum (lower 3/4 of the bins, where the music is), row 1 the waveform.
function soundTexture(sig){
  const f=sig?.freq,w=sig?.wave;
  if(f?.length){const n=Math.floor(f.length*.75);for(let i=0;i<512;i++)snd[i]=f[Math.floor(i*n/512)];}else snd.fill(0,0,512);
  if(w?.length){for(let i=0;i<512;i++)snd[512+i]=Math.max(0,Math.min(255,Math.round((w[Math.floor(i*w.length/512)]*.5+.5)*255)));}else snd.fill(128,512);
  gl.bindTexture(gl.TEXTURE_2D,sndTex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,512,2,gl.RED,gl.UNSIGNED_BYTE,snd);
}
/** Runs `code` over `src` (a canvas, or null for a generator) into ctx. Returns null when it drew, or an Error.
 *  opts: {id, time, dt, frame, sig:{freq,wave,bands,pulse}, knobs:[0..1 ×4], feedback} */
export function shaderInto(ctx,src,code,opts){
  const w=ctx.canvas.width,h=ctx.canvas.height;
  if(!gl&&!init(w,h))return Error('WebGL2 is not available in this browser');
  let p;try{p=program(code);}catch(e){return e;}
  if(gl.canvas.width!==w||gl.canvas.height!==h){gl.canvas.width=w;gl.canvas.height=h;}
  gl.viewport(0,0,w,h);gl.useProgram(p.prog);gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  gl.activeTexture(gl.TEXTURE0);
  if(src){gl.bindTexture(gl.TEXTURE_2D,inTex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,src);}
  else gl.bindTexture(gl.TEXTURE_2D,blackTex);
  gl.activeTexture(gl.TEXTURE1);soundTexture(opts.sig);
  const f=opts.feedback?targets(opts.id,w,h):null;
  gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,f?f.tex[f.i]:blackTex);
  const L=p.loc,b=opts.sig?.bands||{};
  gl.uniform1i(L.iChannel0,0);gl.uniform1i(L.iChannel1,1);gl.uniform1i(L.iChannel2,2);
  gl.uniform3f(L.iResolution,w,h,1);gl.uniform1f(L.iTime,opts.time||0);gl.uniform1f(L.iTimeDelta,opts.dt||0);gl.uniform1i(L.iFrame,opts.frame||0);gl.uniform4f(L.iMouse,0,0,0,0);
  gl.uniform1f(L.uBass,b.bass||0);gl.uniform1f(L.uMids,b.mids||0);gl.uniform1f(L.uHigh,b.high||0);gl.uniform1f(L.uLevel,b.full||0);gl.uniform1f(L.uBeat,opts.sig?.pulse||0);
  const k=new Float32Array(KNOBS);(opts.knobs||[]).slice(0,KNOBS).forEach((v,i)=>k[i]=v);if(L.uKnob)gl.uniform1fv(L.uKnob,k);
  gl.disable(gl.BLEND);
  if(f){
    // Draw into the other buffer (it reads this one as the previous frame), then show it.
    const o=1-f.i;gl.bindFramebuffer(gl.FRAMEBUFFER,f.fbo[o]);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    gl.useProgram(copyProg);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,f.tex[o]);
    gl.uniform1i(gl.getUniformLocation(copyProg,'t'),0);gl.uniform2f(gl.getUniformLocation(copyProg,'r'),w,h);f.i=o;
  }
  gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  ctx.clearRect(0,0,w,h);ctx.drawImage(gl.canvas,0,0,w,h);
  return null;
}

// ── Built-in shaders ──
// Melt: bright areas drip downward like wax, longer and faster with the sound; quiet passages let it heal.
export const MELT=`uniform float drip; // @knob 0..1
uniform float speed; // @knob 0..1
uniform float threshold; // @knob 0..1
uniform float hold; // @knob 0..1
float h1(float x){return fract(sin(x*127.1)*43758.5453);}
float vn(float x){float i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(h1(i),h1(i+1.),f);}
void mainImage(out vec4 o,in vec2 fc){
  vec2 uv=fc/iResolution.xy;vec4 cur=texture(iChannel0,uv);
  // Each column drips at its own pace (wide wax streaks, with fine variation).
  float col=.35+.65*vn(uv.x*38.)*(.7+.3*vn(uv.x*160.+3.));
  float px=1./iResolution.y,v=speed*(1.5+14.*col);
  float sway=(vn(uv.y*6.+iTime*.7+uv.x*9.)-.5)*px*2.*drip;
  // The previous frame, one step higher: what was above slides down this frame.
  vec4 prev=texture(iChannel2,uv+vec2(sway,v*px));
  float lum=max(prev.r,max(prev.g,prev.b));
  float wax=smoothstep(threshold-.08,threshold+.12,lum);
  float keep=step(.001,drip)*wax*mix(.95,.998,hold)*mix(.9,1.,drip);
  vec4 d=prev*keep;
  o=vec4(max(cur.rgb,d.rgb),max(cur.a,d.a));
}`;
// Tunnel: endless zoom into recursive copies of the picture, turning as it goes. Dark areas reveal the copies behind.
export const TUNNEL=`uniform float shrink; // @knob 0.35..0.9
uniform float twist; // @knob -1..1
uniform float phase; // @knob 0..1
uniform float key; // @knob 0..1
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
vec4 tap(vec2 q){
  vec2 uv=q/vec2(iResolution.x/iResolution.y,1.)+.5;
  if(any(lessThan(uv,vec2(0)))||any(greaterThan(uv,vec2(1))))return vec4(0);
  vec4 c=texture(iChannel0,uv);float l=max(c.r,max(c.g,c.b));
  c.a*=mix(1.,smoothstep(.03,.22,l),key);return c;}
void mainImage(out vec4 o,in vec2 fc){
  vec2 p=(fc-.5*iResolution.xy)/iResolution.y;
  // The picture itself stays on top; copies 1..N shrink toward the centre and grow as Phase runs 0→1.
  vec4 acc=tap(p);vec3 col=acc.rgb*acc.a;float a=acc.a;
  const int N=9;
  for(int i=1;i<=N;i++){
    if(a>.995)break;
    float lv=float(i)-phase,s=pow(shrink,lv);
    vec2 q=rot(twist*3.14159*lv)*p/s;
    vec4 c=tap(q);
    float w=(i==1?1.-phase:1.)*(i==N?phase:1.)*pow(.86,lv);
    c.a*=w;col+=(1.-a)*c.rgb*c.a;a+=(1.-a)*c.a;
  }
  o=vec4(a>0.?col/a:col,a);
}`;

// Examples for the Shader node. Each one uses @knob uniforms, the picture (iChannel0) and/or the sound.
export const SHADER_EXAMPLES={
  'Sound rings':`// Rings that ripple out from the centre, one per spectrum band. A generator: no picture needed.
uniform float rings; // @knob 4..40 =14
uniform float glow; // @knob 0..2 =1
uniform float hue; // @knob 0..1 =0.6
vec3 pal(float t){return .5+.5*cos(6.2831*(t+vec3(0,.33,.67)));}
void mainImage(out vec4 fragColor,in vec2 fragCoord){
  vec2 p=(fragCoord-.5*iResolution.xy)/iResolution.y;
  float r=length(p),band=fract(r*rings-iTime*.4);
  float fft=texture(iChannel1,vec2(clamp(r*1.4,0.,1.),.25)).r;
  float ring=smoothstep(.5,.0,abs(band-.5)-.12-fft*.25);
  vec3 c=pal(hue+r*.6+fft*.3)*ring*(.25+fft*1.4)*glow;
  c+=pal(hue)*uBeat*.25*exp(-r*4.);
  fragColor=vec4(c,1);
}`,
  'Wobble':`// Waves the picture with the bass and splits its colours on the beat.
uniform float amount; // @knob 0..0.08 =0.025
uniform float waves; // @knob 1..30 =8
uniform float split; // @knob 0..0.03 =0.008
void mainImage(out vec4 fragColor,in vec2 fragCoord){
  vec2 uv=fragCoord/iResolution.xy;
  float a=amount*(.3+uBass*1.4);
  uv+=a*vec2(sin(uv.y*waves+iTime*2.),cos(uv.x*waves*.7+iTime*1.6));
  float s=split*(1.+uBeat*3.);
  fragColor=vec4(texture(iChannel0,uv+vec2(s,0)).r,texture(iChannel0,uv).g,texture(iChannel0,uv-vec2(s,0)).b,texture(iChannel0,uv).a);
}`,
  'Kaleidoscope':`// Folds the picture into mirrored slices that turn with the music.
uniform float slices; // @knob 2..16 =6
uniform float spin; // @knob -1..1 =0.2
uniform float zoom; // @knob 0.5..3 =1.2
void mainImage(out vec4 fragColor,in vec2 fragCoord){
  vec2 p=(fragCoord-.5*iResolution.xy)/iResolution.y;
  float r=length(p)/zoom,a=atan(p.y,p.x)+iTime*spin+uBass*.3,seg=6.2831/floor(slices);
  a=abs(mod(a,seg)-seg*.5);
  vec2 q=r*vec2(cos(a),sin(a));
  vec2 uv=q*vec2(iResolution.y/iResolution.x,1.)+.5;
  fragColor=texture(iChannel0,uv);
}`,
  'Plasma':`// Classic plasma: a generator whose colours shift with the bands.
uniform float scale; // @knob 1..12 =4
uniform float speed; // @knob 0..3 =1
uniform float bright; // @knob 0..2 =1
void mainImage(out vec4 fragColor,in vec2 fragCoord){
  vec2 p=fragCoord/iResolution.y*scale;float t=iTime*speed;
  float v=sin(p.x+t)+sin(p.y*1.3-t*.8)+sin((p.x+p.y)*.7+t*1.2)+sin(length(p-scale*.5)*2.-t*2.-uBass*4.);
  vec3 c=.5+.5*cos(v*1.6+vec3(0,2.1,4.2)+uMids*3.);
  fragColor=vec4(c*bright*(.7+uLevel*.8),1);
}`,
  'Edge glow':`// Outlines the picture's edges and makes them glow with the highs.
uniform float strength; // @knob 0..6 =2.5
uniform float keep; // @knob 0..1 =0.4
void mainImage(out vec4 fragColor,in vec2 fragCoord){
  vec2 uv=fragCoord/iResolution.xy,px=1./iResolution.xy;
  vec4 c=texture(iChannel0,uv);
  vec3 gx=texture(iChannel0,uv+vec2(px.x,0)).rgb-texture(iChannel0,uv-vec2(px.x,0)).rgb;
  vec3 gy=texture(iChannel0,uv+vec2(0,px.y)).rgb-texture(iChannel0,uv-vec2(0,px.y)).rgb;
  vec3 e=sqrt(gx*gx+gy*gy)*strength*(1.+uHigh*2.);
  fragColor=vec4(c.rgb*keep+e,max(c.a,max(e.r,max(e.g,e.b))));
}`,
};
export const SHADER_DEFAULT='Wobble';
