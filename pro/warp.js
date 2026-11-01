// Image-space deformers: the original's distortLinear() run per pixel on the GPU.
// Used when a shape's renderer ignores the deformer params (WebGPU simulations, Cloner, Growth...).
export const WARP_KEYS=['_twist','_bulge','_wave','_shear','_depth','_ripple','_jitter'];
const FS=`#version 300 es
precision highp float;
uniform sampler2D src;uniform float tw,bu,wa,wf,sh,de,ri,ji,ph;in vec2 uv;out vec4 o;
void main(){
  vec2 n=vec2(uv.x*2.-1.,1.-uv.y*2.);float r=length(n),a=atan(n.y,n.x);vec2 m=n;
  if(tw!=0.)a+=r*tw*3.14159265;
  if(bu!=0.)r=bu>0.?pow(r,1.-bu*.8):pow(r,1.-bu*.5);
  if(wa!=0.)m.x+=sin(m.y*wf+ph)*wa*.3;
  if(sh!=0.)m.x+=m.y*sh*.5;
  if(de!=0.)m*=1.-de*.6*(1.-exp(-length(n)*2.));
  if(tw!=0.||bu!=0.)m=r*vec2(cos(a),sin(a))+(m-n);
  if(ri!=0.){float rr=max(length(m),1e-4);m+=m/rr*sin(rr*wf*2.2-ph*1.5)*ri*.18;}
  if(ji!=0.){float jx=fract(sin(dot(m,vec2(91.7,47.3)))*43758.5),jy=fract(sin(dot(m,vec2(12.9,78.2)))*23421.6),j=ji*.13;
    m+=vec2((jx-.5)*j*sin(ph*2.+jx*6.283),(jy-.5)*j*cos(ph*2.+jy*6.283));}
  // Sample where the forward warp would have moved this pixel from.
  vec2 q=2.*n-m,s=vec2(q.x*.5+.5,.5-q.y*.5);
  o=(s.x<0.||s.y<0.||s.x>1.||s.y>1.)?vec4(0):texture(src,s);
}`;
const VS=`#version 300 es
in vec2 p;out vec2 uv;void main(){uv=p*.5+.5;gl_Position=vec4(p,0,1);}`;
let gl=null,prog,tex,loc={};
function init(w,h){
  const c=document.createElement('canvas');c.width=w;c.height=h;
  gl=c.getContext('webgl2',{premultipliedAlpha:true,preserveDrawingBuffer:true});if(!gl)return false;
  const sh=(t,s)=>{const x=gl.createShader(t);gl.shaderSource(x,s);gl.compileShader(x);return x;};
  prog=gl.createProgram();gl.attachShader(prog,sh(gl.VERTEX_SHADER,VS));gl.attachShader(prog,sh(gl.FRAGMENT_SHADER,FS));gl.linkProgram(prog);
  if(!gl.getProgramParameter(prog,gl.LINK_STATUS)){gl=null;return false;}
  gl.useProgram(prog);
  const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  const pl=gl.getAttribLocation(prog,'p');gl.enableVertexAttribArray(pl);gl.vertexAttribPointer(pl,2,gl.FLOAT,false,0,0);
  tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
  for(const k of ['tw','bu','wa','wf','sh','de','ri','ji','ph'])loc[k]=gl.getUniformLocation(prog,k);
  return true;
}
export const needsWarp=mods=>!!mods&&WARP_KEYS.some(k=>+mods[k]);
// Draws the warped image into ctx (same size as the source); returns false if WebGL2 is unavailable.
export function warpInto(ctx,src,mods,time){
  const w=src.width,h=src.height;
  if(!gl&&!init(w,h))return false;
  if(gl.canvas.width!==w||gl.canvas.height!==h){gl.canvas.width=w;gl.canvas.height=h;}
  gl.viewport(0,0,w,h);gl.bindTexture(gl.TEXTURE_2D,tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,src);
  const v=k=>(+mods[k]||0)/100;
  gl.uniform1f(loc.tw,v('_twist'));gl.uniform1f(loc.bu,v('_bulge'));gl.uniform1f(loc.wa,v('_wave'));gl.uniform1f(loc.wf,+mods._waveFreq||5);
  gl.uniform1f(loc.sh,v('_shear'));gl.uniform1f(loc.de,v('_depth'));gl.uniform1f(loc.ri,v('_ripple'));gl.uniform1f(loc.ji,v('_jitter'));gl.uniform1f(loc.ph,time*1.5);
  gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  ctx.clearRect(0,0,w,h);ctx.drawImage(gl.canvas,0,0);return true;
}
