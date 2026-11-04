// USD models (.usda text, .usdc binary crate, .usdz package): mesh prims with their xform stacks are flattened
// into the same model gltf.js poses. Only the root layer is read; references to other files are not composed.
import {triangulate} from './polygon.js';
import {I4,mul,trs,fitModel} from './gltf.js';
import {euler,invert} from './fbx-model.js';

const SPEC=['def','over','class'];

// ---------- USDA text ----------
function parseUSDA(text){
  let i=0;const s=text,n=s.length;
  const fail=m=>{throw Error('USDA: '+m+' at line '+(s.slice(0,i).split('\n').length));};
  const ws=()=>{for(;;){const c=s.charCodeAt(i);if(c===32||c===9||c===10||c===13||c===59)i++;else if(c===35){const e=s.indexOf('\n',i);i=e<0?n:e;}else break;}};
  const peek=()=>{ws();return s[i];};
  const eat=c=>{if(peek()!==c)fail('expected '+c);i++;};
  const ID=/[A-Za-z_!][\w:.!\-]*(?:\[\])?/y;
  const ident=()=>{ws();ID.lastIndex=i;const m=ID.exec(s);if(!m)fail('unexpected '+JSON.stringify(s.slice(i,i+12)));i=ID.lastIndex;return m[0];};
  const str=()=>{ws();const q=s[i];if(s.startsWith(q+q+q,i)){const e=s.indexOf(q+q+q,i+3);if(e<0)fail('unterminated string');const r=s.slice(i+3,e);i=e+3;return r;}
    let r='';i++;while(i<n&&s[i]!==q){if(s[i]==='\\'){i++;r+=({n:'\n',t:'\t'})[s[i]]??s[i];}else r+=s[i];i++;}i++;return r;};
  const skip=(o,c)=>{eat(o);let d=1;while(i<n&&d){const ch=s[i];if(ch==='"'||ch==="'"){str();continue;}if(ch==='#'){ws();continue;}if(ch===o)d++;else if(ch===c)d--;i++;}};
  const NUM=/^[\s\d.,()eE+\-]*$/,NUMS=/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
  const flat=(a,o=[])=>{for(const v of a)Array.isArray(v)?flat(v,o):o.push(v);return o;};
  function value(){
    const c=peek();
    if(c==='['){const e=s.indexOf(']',i),sub=s.slice(i+1,e);
      if(e>0&&NUM.test(sub)){i=e+1;const m=sub.match(NUMS);return {nums:m?Float64Array.from(m,Number):new Float64Array(0),tuple:sub.includes('(')};}
      i++;const a=[];while(peek()!==']'){a.push(value());if(peek()===',')i++;}i++;return a;}
    if(c==='('){i++;const a=[];while(peek()!==')'){a.push(value());if(peek()===',')i++;}i++;
      const f=flat(a);return f.every(v=>typeof v==='number')?f:a;}
    if(c==='"'||c==="'")return str();
    if(c==='{'){skip('{','}');return null;}
    if(c==='@'){const q=s.startsWith('@@@',i)?'@@@':'@',e=s.indexOf(q,i+q.length);const r={asset:s.slice(i+q.length,e)};i=e+q.length;
      if(peek()==='<')value();if(peek()==='(')skip('(',')');return r;}
    if(c==='<'){const e=s.indexOf('>',i);const r={path:s.slice(i+1,e)};i=e+1;return r;}
    NUMS.lastIndex=0;const m=/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(s.slice(i,i+40));
    if(m){i+=m[0].length;return +m[0];}
    const w=ident();return w==='true'?true:w==='false'?false:w==='None'?null:w==='inf'?Infinity:w==='-inf'?-Infinity:w==='nan'?NaN:w;
  }
  function meta(){const o={};eat('(');
    while(peek()!==')'){if(peek()==='"'||peek()==="'"){o.doc=str();continue;}
      let k=ident();if(/^(prepend|append|add|delete|reorder)$/.test(k))k=ident();
      if(peek()==='='){i++;o[k]=value();}}
    i++;return o;}
  const quat=(t,v)=>/^quat/.test(t)&&v?.length?Array.from({length:v.length},(_,k)=>v[(k&~3)+((k&3)+1)%4]):v;
  function prim(spec){
    const p={spec,type:'',name:'',attrs:{},children:[],meta:{}};
    if(peek()!=='"'&&peek()!=="'")p.type=ident();
    p.name=str();if(peek()==='(')p.meta=meta();eat('{');
    while(peek()!=='}'){if(i>=n)fail('unexpected end of file');
      let w=ident();
      if(SPEC.includes(w)){p.children.push(prim(w));continue;}
      if(w==='variantSet'){str();eat('=');skip('{','}');continue;}
      if(w==='reorder'){ident();eat('=');value();continue;}
      while(/^(uniform|custom|varying|config|prepend|append|add|delete)$/.test(w))w=ident();
      if(w==='rel'){ident();if(peek()==='='){i++;value();}if(peek()==='(')meta();continue;}
      const type=w,name=ident();
      if(name.endsWith('.timeSamples')){eat('=');eat('{');const samples=[];
        while(peek()!=='}'){const t=value();eat(':');samples.push([t,norm(type,value())]);if(peek()===',')i++;}i++;
        (p.attrs[name.slice(0,-12)]??={type,meta:{}}).samples=samples.sort((a,b)=>a[0]-b[0]);continue;}
      let v;if(peek()==='='){i++;v=peek()==='{'?(skip('{','}'),null):value();}
      const m=peek()==='('?meta():{};
      if(/\.(connect|spline)$/.test(name))continue;
      const a=p.attrs[name]??={type,meta:{}};Object.assign(a.meta,m);if(v!==undefined)a.value=norm(type,v);}
    i++;return p;}
  const norm=(t,v)=>v&&v.nums?quat(t,v.nums):quat(t,v);
  if(!s.startsWith('#usda'))throw Error('Not a USDA file');
  const root={spec:'def',type:'',name:'',attrs:{},children:[],meta:{}};
  i=s.indexOf('\n');if(i<0)i=n;
  if(peek()==='(')root.meta=meta();
  while(peek()!==undefined){const w=ident();if(!SPEC.includes(w))fail('expected def, over or class');root.children.push(prim(w));}
  return root;
}

// ---------- USDC crate ----------
function lz4(src,cap){const out=new Uint8Array(cap);let s=0,d=0;const n=src.length;
  while(s<n){const tok=src[s++];let lit=tok>>4;if(lit===15){let b;do{b=src[s++];lit+=b;}while(b===255);}
    out.set(src.subarray(s,s+lit),d);d+=lit;s+=lit;if(s>=n)break;
    const off=src[s]|src[s+1]<<8;s+=2;let ml=tok&15;if(ml===15){let b;do{b=src[s++];ml+=b;}while(b===255);}ml+=4;
    if(!off||off>d)throw Error('USDC: corrupt compressed data');
    for(let k=0;k<ml;k++,d++)out[d]=out[d-off];}
  return out.subarray(0,d);}
function fastDecompress(src,cap){const chunks=src[0];if(!chunks)return lz4(src.subarray(1),cap);
  const parts=[];let p=1,tot=0;const dv=new DataView(src.buffer,src.byteOffset,src.byteLength);
  for(let c=0;c<chunks;c++){const sz=dv.getInt32(p,true);p+=4;const b=lz4(src.subarray(p,p+sz),Math.min(cap,0x7fffffff));p+=sz;parts.push(b);tot+=b.length;}
  const out=new Uint8Array(tot);let o=0;for(const b of parts){out.set(b,o);o+=b.length;}return out;}
function decodeInts(buf,count,wide){
  const dv=new DataView(buf.buffer,buf.byteOffset,buf.byteLength),w=wide?8:4;
  const common=wide?Number(dv.getBigInt64(0,true)):dv.getInt32(0,true);let codes=w,data=w+((count*2+7)>>3),prev=0;const out=new Float64Array(count);
  for(let k=0;k<count;k++){const c=(buf[codes+(k>>2)]>>((k&3)*2))&3;let v;
    if(c===0)v=common;
    else if(wide){if(c===1){v=dv.getInt16(data,true);data+=2;}else if(c===2){v=dv.getInt32(data,true);data+=4;}else{v=Number(dv.getBigInt64(data,true));data+=8;}}
    else if(c===1){v=dv.getInt8(data);data+=1;}else if(c===2){v=dv.getInt16(data,true);data+=2;}else{v=dv.getInt32(data,true);data+=4;}
    prev+=v;out[k]=prev;}
  return out;}
const half=h=>{const e=(h>>10)&31,f=h&1023,sg=h>>15?-1:1;return e===0?sg*f*2**-24:e===31?(f?NaN:sg*Infinity):sg*(1+f/1024)*2**(e-15);};
// type id → [scalar kind, components]
const TYPES={1:['b',1],2:['b',1],3:['i',1],4:['u',1],5:['l',1],6:['L',1],7:['h',1],8:['f',1],9:['d',1],10:['s',1],11:['t',1],12:['s',1],
  13:['d',4],14:['d',9],15:['d',16],16:['d',4],17:['f',4],18:['h',4],19:['d',2],20:['f',2],21:['h',2],22:['i',2],23:['d',3],24:['f',3],25:['h',3],26:['i',3],
  27:['d',4],28:['f',4],29:['h',4],30:['i',4],42:['i',1],44:['i',1],56:['d',1]};
const SIZE={b:1,i:4,u:4,l:8,L:8,h:2,f:4,d:8,s:4,t:4};

function parseUSDC(bytes){
  const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u64=o=>Number(dv.getBigUint64(o,true));
  if(new TextDecoder().decode(bytes.subarray(0,8))!=='PXR-USDC')throw Error('Not a USDC file');
  const ver=bytes[8]*100+bytes[9];if(ver<4)throw Error('USDC crate version 0.'+bytes[9]+' is too old; re-save the file with a current USD');
  const toc=u64(16),sections={};
  for(let k=0,c=u64(toc);k<c;k++){const o=toc+8+k*32;sections[new TextDecoder().decode(bytes.subarray(o,o+16)).replace(/\0.*$/s,'')]=u64(o+16);}
  let at=0;const rd=()=>{const v=u64(at);at+=8;return v;};
  const ints=(count,wide)=>{const size=rd(),src=bytes.subarray(at,at+size);at+=size;return decodeInts(fastDecompress(src,count*(wide?9:5)+16),count,wide);};
  at=sections.TOKENS;const nt=rd(),usize=rd(),csize=rd();
  const tokens=new TextDecoder().decode(fastDecompress(bytes.subarray(at,at+csize),usize)).split('\0').slice(0,nt);
  at=sections.STRINGS;const strings=Array.from({length:rd()},(_,k)=>tokens[dv.getUint32(at+k*4,true)]);
  at=sections.FIELDS;const nf=rd(),ftok=ints(nf),rsize=rd(),reps=fastDecompress(bytes.subarray(at,at+rsize),nf*8),rdv=new DataView(reps.buffer,reps.byteOffset);
  const fields=Array.from({length:nf},(_,k)=>({name:tokens[ftok[k]],lo:rdv.getUint32(k*8,true),hi:rdv.getUint32(k*8+4,true)}));
  at=sections.FIELDSETS;const fsets=ints(rd());
  at=sections.PATHS;const np=rd(),ne=rd(),pIdx=ints(ne),eTok=ints(ne),jumps=ints(ne),paths=new Array(np);
  const build=(cur,parent)=>{let child,sib;do{const k=cur++;
      if(parent<0){paths[pIdx[k]]={parent:-1,name:'',prop:false};parent=pIdx[k];}
      else{const t=eTok[k];paths[pIdx[k]]={parent,name:tokens[Math.abs(t)],prop:t<0};}
      child=jumps[k]>0||jumps[k]===-1;sib=jumps[k]>=0;
      if(child){if(sib)build(k+jumps[k],parent);parent=pIdx[k];}}while(child||sib);};
  if(ne)build(0,-1);
  at=sections.SPECS;const ns=rd(),sPath=ints(ns),sSet=ints(ns),sType=ints(ns);

  const scalar=(kind,o)=>kind==='b'?bytes[o]:kind==='i'?dv.getInt32(o,true):kind==='u'?dv.getUint32(o,true):kind==='l'?Number(dv.getBigInt64(o,true)):kind==='L'?u64(o)
    :kind==='h'?half(dv.getUint16(o,true)):kind==='f'?dv.getFloat32(o,true):kind==='d'?dv.getFloat64(o,true):kind==='t'?tokens[dv.getUint32(o,true)]:strings[dv.getUint32(o,true)];
  const many=(kind,comp,o,count)=>{const sz=SIZE[kind];
    if(kind==='t'||kind==='s')return Array.from({length:count},(_,k)=>scalar(kind,o+k*sz));
    const out=new Float64Array(count*comp);for(let k=0;k<count*comp;k++)out[k]=scalar(kind,o+k*sz);return out;};
  function value(lo,hi){
    const type=(hi>>>16)&255,isArr=hi>>>31,inl=(hi>>>30)&1,comp=(hi>>>29)&1,off=lo+(hi&0xffff)*2**32,T=TYPES[type];
    if(type===51)return null;
    if(type===41||type===48||type===40){const c=u64(off);return many(type===48?'d':'t',1,off+8,c);}
    if(type===46){at=off;const o1=dv.getBigInt64(at,true);at+=8;at+=Number(o1)-8;
      const tp=at,times=value(dv.getUint32(tp,true),dv.getUint32(tp+4,true));at=tp+8;const o2=Number(dv.getBigInt64(at,true));at+=8;at+=o2-8;
      const c=rd(),base=at,vals=[];for(let k=0;k<c;k++)vals.push(value(dv.getUint32(base+k*8,true),dv.getUint32(base+k*8+4,true)));
      return {samples:Array.from(times||[],(t,k)=>[t,vals[k]])};}
    if(!T)return undefined;
    const [kind,n]=T;
    if(inl){
      if(n===1){if(kind==='t')return tokens[lo];if(kind==='s')return strings[lo];if(kind==='f'||kind==='d')return new Float32Array(new Uint32Array([lo]).buffer)[0];
        if(kind==='h')return half(lo&0xffff);if(kind==='b')return type===1?!!lo:lo;return kind==='i'?lo|0:lo;}
      const b=new Int8Array(new Uint32Array([lo,hi&0xffff]).buffer);
      if(type>=13&&type<=15){const d=Math.round(Math.sqrt(n)),o=new Float64Array(n);for(let k=0;k<d;k++)o[k*d+k]=b[k];return o;}
      return Float64Array.from(b.subarray(0,n));}
    if(!isArr){if(type===1)return !!bytes[off];return n===1?scalar(kind,off):many(kind,1,off,n);}
    if(!off)return new Float64Array(0);
    at=off;let count;if(ver<5){at+=4;count=dv.getUint32(at,true);at+=4;}else if(ver<7){count=dv.getUint32(at,true);at+=4;}else count=rd();
    if(comp&&count>=16){
      if('iulL'.includes(kind))return ints(count,kind==='l'||kind==='L');
      const code=String.fromCharCode(bytes[at++]);
      if(code==='i')return ints(count);
      if(code==='t'){const lsz=dv.getUint32(at,true);at+=4;const lut=many(kind,1,at,lsz);at+=lsz*SIZE[kind];return ints(count).map(k=>lut[k]);}
      throw Error('USDC: unknown array compression');}
    return many(kind,n,at,count);
  }
  const prims=new Map(),fieldsOf=k=>{const o={};for(let j=sSet[k];j<fsets.length&&fsets[j]>=0&&fsets[j]<4294967295;j++){const f=fields[fsets[j]];o[f.name]=f;}return o;};
  const get=(f,name)=>f[name]?value(f[name].lo,f[name].hi):undefined;
  const order=[];
  for(let k=0;k<ns;k++){const t=sType[k];if(t!==6&&t!==7)continue;const f=fieldsOf(k),pi=sPath[k],p=paths[pi];
    const sp=['def','over','class'][get(f,'specifier')??0];
    const prim={spec:sp,type:get(f,'typeName')||'',name:p.name,attrs:{},children:[],meta:{}};
    for(const key in f)if(!/^(specifier|typeName|primChildren|properties)$/.test(key))try{prim.meta[key]=get(f,key);}catch{}
    prim.childNames=get(f,'primChildren');prims.set(pi,prim);order.push(pi);}
  for(let k=0;k<ns;k++){if(sType[k]!==1)continue;const p=paths[sPath[k]],owner=prims.get(p.parent);if(!owner)continue;
    const f=fieldsOf(k),a={type:get(f,'typeName')||'',meta:{}};
    for(const key of ['interpolation','elementSize'])if(f[key])a.meta[key]=get(f,key);
    if(f.default){const v=get(f,'default');if(v!==undefined)a.value=v;}
    if(f.timeSamples){const ts=get(f,'timeSamples');if(ts)a.samples=ts.samples;}
    owner.attrs[p.name]=a;}
  let root;for(const pi of order){const p=paths[pi],prim=prims.get(pi);if(p.parent<0)root=prim;else prims.get(p.parent)?.children.push(prim);}
  for(const prim of prims.values())if(Array.isArray(prim.childNames)){const rank=new Map(prim.childNames.map((x,k)=>[x,k]));prim.children.sort((a,b)=>(rank.get(a.name)??1e9)-(rank.get(b.name)??1e9));}
  if(!root)throw Error('USDC: no root prim');
  return root;
}

// ---------- USDZ package ----------
async function unzip(bytes){
  const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let e=bytes.length-22;
  while(e>=0&&dv.getUint32(e,true)!==0x06054b50)e--;if(e<0)throw Error('USDZ: not a zip package');
  const files=[];let p=dv.getUint32(e+16,true);
  for(let k=0,c=dv.getUint16(e+10,true);k<c;k++){if(dv.getUint32(p,true)!==0x02014b50)break;
    const method=dv.getUint16(p+10,true),csz=dv.getUint32(p+20,true),nl=dv.getUint16(p+28,true),xl=dv.getUint16(p+30,true),cl=dv.getUint16(p+32,true),lo=dv.getUint32(p+42,true);
    const name=new TextDecoder().decode(bytes.subarray(p+46,p+46+nl));p+=46+nl+xl+cl;
    const start=lo+30+dv.getUint16(lo+26,true)+dv.getUint16(lo+28,true);files.push({name,method,data:bytes.subarray(start,start+csz)});}
  const f=files.find(f=>/\.usd[ac]?$/i.test(f.name));if(!f)throw Error('USDZ package contains no USD layer');
  if(f.method===8)return new Uint8Array(await new Response(new Blob([f.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  if(f.method)throw Error('USDZ: unsupported compression');
  return f.data;
}

// ---------- Stage → model ----------
const val=a=>a?(a.value!==undefined?a.value:a.samples?.[0]?.[1]):undefined;
function opMatrix(kind,v){
  if(v==null)return I4();
  if(kind==='transform')return Float32Array.from(v);
  if(kind==='translate'){const m=I4();m[12]=v[0];m[13]=v[1];m[14]=v[2];return m;}
  if(kind==='scale'){const m=I4();m[0]=v[0];m[5]=v[1];m[10]=v[2];return m;}
  if(kind==='orient')return trs([0,0,0],Array.from(v),[1,1,1]);
  const r=/^rotate([XYZ]{1,3})$/.exec(kind);if(!r)return I4();
  if(r[1].length===1){const e=[0,0,0];e['XYZ'.indexOf(r[1])]=+v;return euler(e,'XYZ');}
  return euler(v,r[1]);
}
function localXform(p){
  const order=val(p.attrs.xformOpOrder);let L=I4(),reset=false;
  if(!Array.isArray(order))return {L,reset};
  for(let op of order){if(op==='!resetXformStack!'){reset=true;L=I4();continue;}
    const inv=op.startsWith('!invert!');if(inv)op=op.slice(8);
    const A=opMatrix(op.split(':')[1],val(p.attrs[op]));L=mul(L,inv?invert(A):A);}
  return {L,reset};
}
function meshPrim(p,M){
  const A=p.attrs,pts=val(A.points),counts=val(A.faceVertexCounts),fvi=val(A.faceVertexIndices);
  if(!pts?.length||!counts?.length||!fvi?.length)return null;
  const holes=new Set(val(A.holeIndices)||[]),left=val(A.orientation)==='leftHanded';
  const uvName=A['primvars:st']?'primvars:st':Object.keys(A).find(k=>k.startsWith('primvars:')&&!k.endsWith(':indices')&&/^texCoord2|^float2\[\]/.test(A[k].type)&&(/^texCoord2/.test(A[k].type)||/st|uv/i.test(k)));
  const uvData=uvName?val(A[uvName]):null,uvIdx=uvName?val(A[uvName+':indices']):null,nuv=uvData?(uvIdx?.length||uvData.length/2):0;
  const interp=uvData?(A[uvName].meta.interpolation||(nuv===fvi.length?'faceVarying':nuv===pts.length/3?'vertex':nuv===counts.length?'uniform':'constant')):null;
  const uvAt=(fv,c,face)=>{if(!uvData)return -1;const k=interp==='faceVarying'?fv:interp==='uniform'?face:interp==='constant'?0:c;return uvIdx?uvIdx[k]:k;};
  const key=new Map(),pos=[],uv=[],idx=[];
  const vert=(c,u)=>{const k=c*4194304+u+1;let i=key.get(k);if(i!==undefined)return i;i=pos.length/3;key.set(k,i);
    const x=pts[c*3],y=pts[c*3+1],z=pts[c*3+2];pos.push(M[0]*x+M[4]*y+M[8]*z+M[12],M[1]*x+M[5]*y+M[9]*z+M[13],M[2]*x+M[6]*y+M[10]*z+M[14]);
    if(uvData)uv.push(uvData[u*2]||0,1-(uvData[u*2+1]||0));return i;};
  let fv=0;
  for(let f=0;f<counts.length;f++){const c=counts[f];
    if(c>=3&&!holes.has(f)&&fv+c<=fvi.length){const poly=[];for(let k=0;k<c;k++){const pi=fvi[fv+k];poly.push(vert(pi,uvAt(fv+k,pi,f)));}
      if(left)poly.reverse();
      for(const [a,b,d] of triangulate(poly.map(i=>pos.slice(i*3,i*3+3))))idx.push(poly[a],poly[b],poly[d]);}
    fv+=c;}
  if(!idx.length)return null;
  return {pos:Float32Array.from(pos),idx:Uint32Array.from(idx),uv:uvData?Float32Array.from(uv):null,joints:null,weights:null,targets:[]};
}

export async function parseUSDModel(buf,name='model.usd'){
  let bytes=new Uint8Array(buf);
  if(bytes[0]===0x50&&bytes[1]===0x4b)bytes=await unzip(bytes);
  const magic=new TextDecoder().decode(bytes.subarray(0,8));
  const root=magic==='PXR-USDC'?parseUSDC(bytes):magic.startsWith('#usda')?parseUSDA(new TextDecoder().decode(bytes)):(()=>{throw Error('Not a USD file');})();
  const mpu=+(root.meta.metersPerUnit??.01)||.01,zup=root.meta.upAxis==='Z';
  const nodes=[{children:[],t:[0,0,0],r:zup?[-Math.SQRT1_2,0,0,Math.SQRT1_2]:[0,0,0,1],s:[mpu,mpu,mpu],matrix:null}],meshes=[];
  let refs=0;
  const walk=(p,W)=>{
    if(p.spec==='class'||p.meta.active===false||p.type==='PointInstancer')return;
    if(p.meta.references||p.meta.payload)refs++;
    if(val(p.attrs.visibility)==='invisible'||val(p.attrs.purpose)==='guide')return;
    const {L,reset}=localXform(p),M=mul(reset?I4():W,L);
    if(p.type==='Mesh'){const prim=meshPrim(p,M);
      if(prim){nodes[0].children.push(nodes.length);nodes.push({children:[],t:[0,0,0],r:[0,0,0,1],s:[1,1,1],matrix:null,mesh:meshes.length});meshes.push({weights:[],prims:[prim]});}}
    for(const c of p.children)walk(c,M);};
  for(const c of root.children)walk(c,I4());
  if(!meshes.length)throw Error(refs?'No meshes in '+name+' — it references other USD files; export a flattened USD (e.g. usdcat --flatten)':'No mesh geometry found in '+name);
  const parent=new Int32Array(nodes.length).fill(0);parent[0]=-1;
  return fitModel({name,cameras:[],nodes,parent,order:nodes.map((_,k)=>k),meshes,skins:[],clips:[],faceStep:1});
}
