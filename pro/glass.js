// Liquid glass: drifting metaballs of glass that refract (and invert) what is behind them,
// with chromatic fringes, a thin bright rim and a specular highlight.
const MAX=16;
const FS=`#version 300 es
precision highp float;
uniform sampler2D src;uniform vec3 blobs[${MAX}];uniform int count;
uniform float aspect,refr,chroma,rim,spec,frost,merge,wobble,t,tintAmt,bg,edge;uniform vec3 tint;
in vec2 uv;out vec4 o;
float field(vec2 p){float f=0.;for(int i=0;i<${MAX};i++){if(i>=count)break;vec2 d=p-blobs[i].xy;float r2=blobs[i].z*blobs[i].z;f+=r2*1.15/(dot(d,d)+r2*.15);}
  // Merge raises the falloff: low values keep blobs separate, high values pool them into one liquid body.
  f=pow(f,1./merge);
  if(wobble>0.)f*=1.+wobble*.12*sin(p.x*13.+t*2.7)*sin(p.y*11.-t*2.1);
  return f;}
float dome(float f){float k=clamp(1./max(f,1e-4),0.,1.);return sqrt(max(1.-k*k,0.));}
vec3 tap(vec2 s){return texture(src,clamp(s,vec2(0),vec2(1))).rgb;}
vec3 frosted(vec2 s,float r){if(r<=0.)return tap(s);vec3 c=tap(s)*.2;
  for(int i=0;i<8;i++){float a=float(i)*.785398+.39;c+=tap(s+vec2(cos(a),sin(a)*aspect)*r)*.1;}return c;}
void main(){
  vec2 p=vec2(uv.x*aspect,uv.y);vec4 base=texture(src,uv);
  float f=field(p);
  if(f<.92){o=vec4(base.rgb*bg,base.a);return;}
  // Height field: a dome over the liquid (0 at its edge); normals come from its slope, continuous everywhere.
  float h=dome(f),hx=dome(field(p+vec2(.002,0))),hy=dome(field(p+vec2(0,.002)));
  vec2 sl=-vec2(hx-h,hy-h)/.002*.09;
  // ng: the true surface (rim and highlights); n: an exaggerated normal for the refraction (Edge bend).
  vec3 ng=normalize(vec3(sl,1)),n=normalize(vec3(sl*edge,1));
  vec3 rd=refract(vec3(0,0,-1),n,1./1.45);
  vec2 off=rd.xy*refr*(.35+.65*h);off.x/=aspect;
  float fr=frost*.012*h;
  vec3 c=vec3(frosted(uv+off*(1.+chroma),fr).r,frosted(uv+off,fr).g,frosted(uv+off*(1.-chroma),fr).b);
  c=mix(c,c*tint,tintAmt);
  float fres=pow(1.-clamp(ng.z,0.,1.),4.)*.7+exp(-h*h*60.)*.8;
  vec3 H=normalize(normalize(vec3(-.45,.55,.7))+vec3(0,0,1)),H2=normalize(normalize(vec3(.5,-.5,.7))+vec3(0,0,1));
  float sp=pow(max(dot(ng,H),0.),90.)*spec*1.6,sp2=pow(max(dot(ng,H2),0.),30.)*spec*.3;
  c+=vec3(fres*rim)+vec3(sp+sp2);
  float m=smoothstep(.92,1.04,f);
  o=vec4(mix(base.rgb*bg,c,m),max(base.a,m));
}`;
const VS=`#version 300 es
in vec2 p;out vec2 uv;void main(){uv=p*.5+.5;gl_Position=vec4(p,0,1);}`;
let gl=null,prog,tex,loc={};
function init(w,h){
  const c=document.createElement('canvas');c.width=w;c.height=h;
  gl=c.getContext('webgl2',{premultipliedAlpha:false,preserveDrawingBuffer:true});if(!gl)return false;
  const sh=(t,s)=>{const x=gl.createShader(t);gl.shaderSource(x,s);gl.compileShader(x);if(!gl.getShaderParameter(x,gl.COMPILE_STATUS))console.warn('Liquid glass shader:',gl.getShaderInfoLog(x));return x;};
  prog=gl.createProgram();gl.attachShader(prog,sh(gl.VERTEX_SHADER,VS));gl.attachShader(prog,sh(gl.FRAGMENT_SHADER,FS));gl.linkProgram(prog);
  if(!gl.getProgramParameter(prog,gl.LINK_STATUS)){gl=null;return false;}
  gl.useProgram(prog);
  const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  const pl=gl.getAttribLocation(prog,'p');gl.enableVertexAttribArray(pl);gl.vertexAttribPointer(pl,2,gl.FLOAT,false,0,0);
  tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  for(const k of ['blobs','count','aspect','refr','chroma','rim','spec','frost','merge','wobble','t','tintAmt','tint','bg','edge'])loc[k]=gl.getUniformLocation(prog,k);
  return true;
}
const rnd=s=>{s=Math.sin(s*127.1+311.7)*43758.5453;return s-Math.floor(s);};
const hex=c=>{const v=parseInt(String(c||'#ffffff').slice(1),16);return [(v>>16&255)/255,(v>>8&255)/255,(v&255)/255];};
// Blob centres and radii in aspect-corrected space (x in 0..aspect, y in 0..1).
export function glassBlobs(p,time,aspect,{bass=0,beat=0}={}){
  const N=Math.max(1,Math.min(MAX,Math.round(p.blobs))),out=[],sp=p.speed/100,sz=p.size/100*.16;
  for(let i=0;i<N;i++){
    const r=k=>rnd(p.seed*13.7+i*7.31+k);
    const fx=.15+r(1)*.35,fy=.12+r(2)*.33,ph=r(3)*6.283,ph2=r(4)*6.283,tt=time*sp;
    const x=(.5+(.42*Math.sin(tt*fx+ph)+.08*Math.sin(tt*fx*2.3+ph2))*(p.spread/100))*aspect;
    const y=.5+(.4*Math.cos(tt*fy+ph2)+.08*Math.sin(tt*fy*1.7+ph))*(p.spread/100);
    const rad=sz*(.55+r(5)*.9)*(1+bass*p.bass/100*.45)*(1+beat*p.beat/100*.18*Math.sin(i*1.7+time*9));
    out.push(x,y,rad);
  }
  return out;
}
// Draws the glass over src into ctx; returns false if WebGL2 is unavailable.
export function glassInto(ctx,src,p,time,audio={}){
  const w=src.width,h=src.height;
  if(!gl&&!init(w,h))return false;
  if(gl.canvas.width!==w||gl.canvas.height!==h){gl.canvas.width=w;gl.canvas.height=h;}
  gl.viewport(0,0,w,h);gl.bindTexture(gl.TEXTURE_2D,tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,src);
  const aspect=w/h,b=glassBlobs(p,time,aspect,audio),arr=new Float32Array(MAX*3);arr.set(b);
  gl.uniform3fv(loc.blobs,arr);gl.uniform1i(loc.count,b.length/3);gl.uniform1f(loc.aspect,aspect);
  gl.uniform1f(loc.refr,p.refraction/100*.9);gl.uniform1f(loc.chroma,p.chroma/100*.6);gl.uniform1f(loc.rim,p.rim/100);gl.uniform1f(loc.spec,p.highlight/100);
  gl.uniform1f(loc.frost,p.frost/100*4);gl.uniform1f(loc.merge,.6+p.merge/100*1.8);gl.uniform1f(loc.wobble,p.wobble/100);gl.uniform1f(loc.t,time);
  gl.uniform1f(loc.tintAmt,p.tintAmt/100);gl.uniform3fv(loc.tint,hex(p.tint));gl.uniform1f(loc.bg,1-p.dim/100);gl.uniform1f(loc.edge,1+p.edge/100*5);
  gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  ctx.drawImage(gl.canvas,0,0,ctx.canvas.width,ctx.canvas.height);
  return true;
}
