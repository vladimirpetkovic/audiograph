module.exports=function exrFixture({zip=false,half=false}={}){
  const i=v=>{const b=Buffer.alloc(4);b.writeInt32LE(v);return b;};
  const f=v=>{const b=Buffer.alloc(4);b.writeFloatLE(v);return b;};
  const attr=(name,type,data)=>Buffer.concat([Buffer.from(name+'\0'+type+'\0'),i(data.length),data]);
  const channels=Buffer.concat(['B','G','R'].map(c=>Buffer.concat([Buffer.from(c+'\0'),i(half?1:2),Buffer.from([0,0,0,0]),i(1),i(1)])));
  const box=Buffer.concat([i(0),i(0),i(1),i(1)]);
  const header=Buffer.concat([i(20000630),i(2),attr('channels','chlist',Buffer.concat([channels,Buffer.from([0])])),
    attr('compression','compression',Buffer.from([zip?3:0])),attr('dataWindow','box2i',box),attr('displayWindow','box2i',box),
    attr('lineOrder','lineOrder',Buffer.from([0])),attr('pixelAspectRatio','float',f(1)),
    attr('screenWindowCenter','v2f',Buffer.concat([f(0),f(0)])),attr('screenWindowWidth','float',f(1)),Buffer.from([0])]);
  const encode=half?v=>{const b=Buffer.alloc(2);b.writeUInt16LE((Math.log2(v)+15)<<10);return b;}:f;
  const values=[[1,.25,2,.5,4,1],[.125,.5,.25,1,.5,2]].map(row=>Buffer.concat(row.map(encode)));
  let rows;
  if(zip){
    const raw=Buffer.concat(values),predicted=Buffer.alloc(raw.length);
    for(let n=0;n<raw.length;n++)predicted[n%2?raw.length/2+Math.floor(n/2):n/2]=raw[n];
    for(let n=predicted.length-1;n>0;n--)predicted[n]=(predicted[n]-predicted[n-1]+128)&255;
    const packed=require('node:zlib').deflateSync(predicted);
    rows=[Buffer.concat([i(0),i(packed.length),packed])];
  }else rows=values.map((data,y)=>Buffer.concat([i(y),i(data.length),data]));
  const table=Buffer.alloc(rows.length*8);let offset=header.length+table.length;
  rows.forEach((row,n)=>{table.writeBigUInt64LE(BigInt(offset),n*8);offset+=row.length;});
  return Buffer.concat([header,table,...rows]);
};
