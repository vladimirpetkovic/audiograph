// Loaded media (images, videos, models, splats) kept in the browser's IndexedDB by content hash,
// so projects only carry the key; .ag bundles (zip) carry the files themselves.
const DB='audiograph-media',STORE='assets',KEEP=30*864e5;
export const ASSET_KEY=/^[0-9a-f]{32}$/;
let dbp=null;
const db=()=>dbp||=new Promise((ok,no)=>{
  const r=indexedDB.open(DB,1);
  r.onupgradeneeded=()=>r.result.createObjectStore(STORE);
  r.onsuccess=()=>ok(r.result);r.onerror=()=>{dbp=null;no(r.error||Error('Browser storage is unavailable'));};
});
const tx=async(mode,fn)=>{const d=await db();return new Promise((ok,no)=>{const t=d.transaction(STORE,mode),s=t.objectStore(STORE);let out;const r=fn(s);if(r)r.onsuccess=()=>{out=r.result;};t.oncomplete=()=>ok(out);t.onerror=t.onabort=()=>no(t.error||Error('Browser storage failed'));});};
const hex=b=>[...new Uint8Array(b)].map(v=>v.toString(16).padStart(2,'0')).join('');

export async function assetKey(file){return hex(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())).slice(0,32);}
/** Stores the file (once per content) and returns its key. */
export async function putAsset(file){
  const key=await assetKey(file),now=Date.now();
  await tx('readwrite',s=>s.put({name:file.name,type:file.type,blob:file,used:now},key));
  navigator.storage?.persist?.().catch(()=>{});
  return key;
}
/** The stored file for a key, or null when this browser does not have it. */
export async function getAsset(key){
  if(!ASSET_KEY.test(key||''))return null;
  const r=await tx('readonly',s=>s.get(key));if(!r)return null;
  tx('readwrite',s=>s.put({...r,used:Date.now()},key)).catch(()=>{});
  return new File([r.blob],r.name,{type:r.type||r.blob.type});
}
export async function hasAsset(key){return ASSET_KEY.test(key||'')&&!!await tx('readonly',s=>s.getKey(key));}
/** Forgets files no project used for 30 days, except the keys still in use. */
export async function pruneAssets(inUse){
  const d=await db(),old=Date.now()-KEEP;
  await new Promise((ok,no)=>{const t=d.transaction(STORE,'readwrite'),c=t.objectStore(STORE).openCursor();
    c.onsuccess=()=>{const cur=c.result;if(!cur)return;if(!inUse.has(cur.key)&&!(cur.value.used>old))cur.delete();cur.continue();};
    t.oncomplete=ok;t.onerror=()=>no(t.error);});
}

// Zip (stored, no compression: media is already compressed). Reads stored and deflated entries.
const CRC=new Uint32Array(256).map((_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^c>>>1:c>>>1;return c>>>0;});
const crc32=b=>{let c=~0;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&255]^c>>>8;return ~c>>>0;};
/** entries: [{name, data:Uint8Array}] → Blob */
export function zip(entries){
  const parts=[],dir=[],enc=new TextEncoder();let off=0;
  for(const e of entries){
    const name=enc.encode(e.name),crc=crc32(e.data),h=new DataView(new ArrayBuffer(30));
    h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint32(14,crc,true);h.setUint32(18,e.data.length,true);h.setUint32(22,e.data.length,true);h.setUint16(26,name.length,true);
    const c=new DataView(new ArrayBuffer(46));
    c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint32(16,crc,true);c.setUint32(20,e.data.length,true);c.setUint32(24,e.data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,off,true);
    parts.push(h,name,e.data);dir.push(c,name);off+=30+name.length+e.data.length;
  }
  const size=dir.reduce((s,p)=>s+p.byteLength,0),end=new DataView(new ArrayBuffer(22));
  end.setUint32(0,0x06054b50,true);end.setUint16(8,entries.length,true);end.setUint16(10,entries.length,true);end.setUint32(12,size,true);end.setUint32(16,off,true);
  return new Blob([...parts,...dir,end],{type:'application/zip'});
}
export const isZip=b=>b.length>3&&b[0]===0x50&&b[1]===0x4b&&b[2]===3&&b[3]===4;
/** Uint8Array → Map(name → Uint8Array) */
export async function unzip(b){
  const v=new DataView(b.buffer,b.byteOffset,b.byteLength),dec=new TextDecoder(),out=new Map();
  let e=b.length-22;while(e>=0&&v.getUint32(e,true)!==0x06054b50)e--;if(e<0)throw Error('Damaged scene bundle');
  let p=v.getUint32(e+16,true);
  for(let i=0,n=v.getUint16(e+10,true);i<n;i++){
    if(v.getUint32(p,true)!==0x02014b50)throw Error('Damaged scene bundle');
    const method=v.getUint16(p+10,true),size=v.getUint32(p+20,true),nl=v.getUint16(p+28,true),xl=v.getUint16(p+30,true),cl=v.getUint16(p+32,true),at=v.getUint32(p+42,true);
    const name=dec.decode(b.subarray(p+46,p+46+nl)),start=at+30+v.getUint16(at+26,true)+v.getUint16(at+28,true),raw=b.subarray(start,start+size);
    if(method===0)out.set(name,raw);
    else if(method===8)out.set(name,new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()));
    else throw Error('Unsupported compression in scene bundle');
    p+=46+nl+xl+cl;
  }
  return out;
}
