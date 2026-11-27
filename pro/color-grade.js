// Color adjust and LUT Post FX: one shared WebGL2 context grades a picture.
// LUTs are stored in projects as "size:base64", 16-bit RGB samples with red changing fastest (the .cube order).
export const LUT_MAX_SIZE=65;
export const LUT_DATA_MAX=Math.ceil(LUT_MAX_SIZE**3*6/3)*4+3;

/** Parses an Adobe/Resolve .cube file (3D or 1D) into {size,data,title}; 1D curves become a 33³ cube. */
export function parseCube(text){
  if(typeof text!=='string')throw Error('LUT: not a text file');
  let size3=0,size1=0,title='';const min=[0,0,0],max=[1,1,1],values=[];
  for(const raw of text.split(/\r?\n/)){
    const line=raw.replace(/#.*/,'').trim();if(!line)continue;
    const parts=line.split(/\s+/),key=parts[0].toUpperCase();
    if(key==='TITLE'){title=line.slice(5).trim().replace(/^"|"$/g,'');continue;}
    if(key==='LUT_3D_SIZE'){size3=+parts[1];continue;}
    if(key==='LUT_1D_SIZE'){size1=+parts[1];continue;}
    if(key==='DOMAIN_MIN'||key==='DOMAIN_MAX'){const v=parts.slice(1,4).map(Number);if(v.length!==3||v.some(x=>!Number.isFinite(x)))throw Error('LUT: invalid '+key);(key==='DOMAIN_MIN'?min:max).splice(0,3,...v);continue;}
    if(/^[A-Z_]+$/.test(key))continue;
    if(parts.length<3)throw Error('LUT: invalid data line “'+line.slice(0,40)+'”');
    for(let i=0;i<3;i++){const v=+parts[i];if(!Number.isFinite(v))throw Error('LUT: invalid number “'+parts[i]+'”');values.push(v);}
  }
  if(min.some(v=>v!==0)||max.some(v=>v!==1))throw Error('LUT: only the standard 0–1 input domain is supported');
  const norm=v=>Math.max(0,Math.min(1,v));
  if(size3){
    if(!Number.isInteger(size3)||size3<2||size3>LUT_MAX_SIZE)throw Error(`LUT: size must be 2–${LUT_MAX_SIZE}`);
    if(values.length!==size3**3*3)throw Error(`LUT: expected ${size3**3} entries, found ${Math.floor(values.length/3)}`);
    return {size:size3,data:Float32Array.from(values,norm),title};
  }
  if(size1){
    if(!Number.isInteger(size1)||size1<2||size1>65536)throw Error('LUT: 1D size must be 2–65536');
    if(values.length!==size1*3)throw Error(`LUT: expected ${size1} entries, found ${Math.floor(values.length/3)}`);
    const n=33,data=new Float32Array(n**3*3),curve=(c,t)=>{const x=t*(size1-1),i=Math.min(size1-2,Math.floor(x)),f=x-i;return values[i*3+c]*(1-f)+values[(i+1)*3+c]*f;};
    for(let b=0;b<n;b++)for(let g=0;g<n;g++)for(let r=0;r<n;r++){const o=((b*n+g)*n+r)*3;data[o]=norm(curve(0,r/(n-1)));data[o+1]=norm(curve(1,g/(n-1)));data[o+2]=norm(curve(2,b/(n-1)));}
    return {size:n,data,title};
  }
  throw Error('LUT: missing LUT_3D_SIZE');
}
export function encodeLut({size,data}){
  const u=new Uint8Array(data.length*2);
  for(let i=0;i<data.length;i++){const v=Math.round(Math.max(0,Math.min(1,data[i]))*65535);u[i*2]=v&255;u[i*2+1]=v>>8;}
  let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode(...u.subarray(i,i+0x8000));
  return size+':'+btoa(s);
}
const decoded=new Map();
export function decodeLut(text){
  if(decoded.has(text))return decoded.get(text);
  const m=/^(\d+):([A-Za-z0-9+/]+={0,2})$/.exec(text||'');if(!m)throw Error('LUT: invalid saved data');
  const size=+m[1],bin=atob(m[2]);
  if(size<2||size>LUT_MAX_SIZE||bin.length!==size**3*6)throw Error('LUT: invalid saved data');
  const data=new Uint16Array(size**3*3);for(let i=0;i<data.length;i++)data[i]=bin.charCodeAt(i*2)|bin.charCodeAt(i*2+1)<<8;
  const lut={size,data};if(decoded.size>8)decoded.clear();decoded.set(text,lut);return lut;
}

const VS=`#version 300 es
in vec2 p;void main(){gl_Position=vec4(p,0,1);}`;
const HEAD=`#version 300 es
precision highp float;precision highp sampler3D;
uniform sampler2D src;uniform vec2 res;out vec4 o;
vec3 toLinear(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(.04045,c));}
vec3 toSrgb(vec3 c){c=max(c,0.);return mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(.0031308,c));}
float luma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
`;
const ADJUST=HEAD+`
uniform vec4 basic;   // exposure (stops), brightness, contrast, saturation
uniform vec4 tone;    // vibrance, hue (radians), shadows, highlights
uniform vec4 levels;  // in black, in white, gamma, mix
uniform vec4 extra;   // out black, out white, temperature, tint
uniform float invert;
vec3 hueRotate(vec3 c,float a){
  const vec3 k=vec3(.57735);float s=sin(a),co=cos(a);
  return c*co+cross(k,c)*s+k*dot(k,c)*(1.-co);
}
void main(){
  vec4 px=texture(src,gl_FragCoord.xy/res);vec3 c=px.rgb;vec3 orig=c;
  vec3 lin=toLinear(c)*exp2(basic.x);
  lin*=vec3(1.+extra.z*.3,1.,1.-extra.z*.3)*vec3(1.,1.-extra.w*.3,1.);
  c=toSrgb(lin);
  c=clamp((c-levels.x)/max(.0001,levels.y-levels.x),0.,1.);
  c=pow(c,vec3(1./levels.z));
  c=mix(vec3(extra.x),vec3(extra.y),c);
  c+=basic.y;
  float l=luma(c);
  c+=tone.z*(1.-smoothstep(0.,.55,l))*.5+tone.w*smoothstep(.45,1.,l)*.5;
  c=(c-.5)*basic.z+.5;
  c=hueRotate(c,tone.y);
  l=luma(c);c=mix(vec3(l),c,basic.w);
  float mx=max(c.r,max(c.g,c.b)),mn=min(c.r,min(c.g,c.b)),sat=mx-mn;
  c=mix(vec3(luma(c)),c,1.+tone.x*(1.-clamp(sat,0.,1.)));
  c=mix(c,1.-c,invert);
  o=vec4(mix(orig,clamp(c,0.,1.),levels.w),px.a);
}`;
const LUT=HEAD+`
uniform sampler3D lut;uniform float size,amount;
void main(){
  vec4 px=texture(src,gl_FragCoord.xy/res);
  vec3 g=texture(lut,(clamp(px.rgb,0.,1.)*(size-1.)+.5)/size).rgb;
  o=vec4(mix(px.rgb,g,amount),px.a);
}`;
let gl=null,quad,inTex,lutTex,lutKey='',progs={};
function init(){
  const c=document.createElement('canvas');
  gl=c.getContext('webgl2',{premultipliedAlpha:false,preserveDrawingBuffer:true,alpha:true});
  if(!gl)return false;
  quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  inTex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,inTex);
  for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.NEAREST],[gl.TEXTURE_MAG_FILTER,gl.NEAREST],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,k,v);
  lutTex=gl.createTexture();gl.bindTexture(gl.TEXTURE_3D,lutTex);
  for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_R,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_3D,k,v);
  c.addEventListener('webglcontextlost',()=>{gl=null;progs={};lutKey='';});
  return true;
}
function program(name,fs){
  if(progs[name])return progs[name];
  const sh=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
  const p=gl.createProgram();gl.attachShader(p,sh(gl.VERTEX_SHADER,VS));gl.attachShader(p,sh(gl.FRAGMENT_SHADER,fs));gl.bindAttribLocation(p,0,'p');gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));
  const loc=new Proxy({},{get:(o,k)=>o[k]??=gl.getUniformLocation(p,k)});
  return progs[name]={prog:p,loc};
}
function run(ctx,src,name,fs,set){
  const w=ctx.canvas.width,h=ctx.canvas.height;
  if(!gl&&!init())throw Error('WebGL2 is not available in this browser');
  const p=program(name,fs);
  if(gl.canvas.width!==w||gl.canvas.height!==h){gl.canvas.width=w;gl.canvas.height=h;}
  gl.viewport(0,0,w,h);gl.useProgram(p.prog);gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,inTex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,src);
  gl.uniform1i(p.loc.src,0);gl.uniform2f(p.loc.res,w,h);set(p.loc);
  gl.disable(gl.BLEND);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  ctx.clearRect(0,0,w,h);ctx.drawImage(gl.canvas,0,0,w,h);
}
/** Color adjust: p holds the node's knob values (see the colorAdjust node in graph.js). */
export function colorAdjustInto(ctx,src,p){
  run(ctx,src,'adjust',ADJUST,L=>{
    gl.uniform4f(L.basic,p.exposure,p.brightness/200,4**(p.contrast/100),1+p.saturation/100);
    gl.uniform4f(L.tone,p.vibrance/100,p.hue*Math.PI/180,p.shadows/100,p.highlights/100);
    gl.uniform4f(L.levels,p.inBlack/255,Math.max(p.inBlack+1,p.inWhite)/255,p.gamma,p.mix/100);
    gl.uniform4f(L.extra,p.outBlack/255,p.outWhite/255,p.temperature/100,p.tint/100);
    gl.uniform1f(L.invert,p.invert/100);
  });
}
/** LUT: applies a saved LUT ("size:base64") at `amount` (0–1). */
export function lutInto(ctx,src,saved,amount){
  const lut=decodeLut(saved);
  run(ctx,src,'lut',LUT,L=>{
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_3D,lutTex);
    if(lutKey!==saved){
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
      const f=new Float32Array(lut.data.length);for(let i=0;i<f.length;i++)f[i]=lut.data[i]/65535;
      gl.texImage3D(gl.TEXTURE_3D,0,gl.RGB16F,lut.size,lut.size,lut.size,0,gl.RGB,gl.FLOAT,f);lutKey=saved;
    }
    gl.uniform1i(L.lut,1);gl.uniform1f(L.size,lut.size);gl.uniform1f(L.amount,amount);
  });
}
