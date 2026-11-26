const clamp=v=>Math.max(0,Math.min(1,v));
export function paletteMesh(mesh,settings){
  const {mode,axis,tiling,offset,rotation,primitive}=settings,src=mesh.arr;
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let o=0;o<src.length;o+=16)for(let j=0;j<3;j++){min[j]=Math.min(min[j],src[o+j]);max[j]=Math.max(max[j],src[o+j]);}
  const uv=mesh.pbrUV,hasUV=uv?.some((v,i)=>i%8<2&&Math.abs(v)>1e-8);
  if(mode==='uv'&&!primitive&&!hasUV)throw Error('This model has no usable UV map. Choose Front projection or Box instead.');
  const arr=src.slice(),angle=rotation*Math.PI/180;
  for(let o=0;o<arr.length;o+=16){
    const p=[0,1,2].map(j=>(src[o+j]-min[j])/Math.max(1e-8,max[j]-min[j]));
    let u=p[0],v=1-p[1];
    if(mode==='uv'&&hasUV){u=uv[o/2];v=uv[o/2+1];}
    else if(mode==='uv'&&['sphere','ico','torus'].includes(primitive)){
      const x=src[o],y=src[o+1],z=src[o+2],r=Math.max(1e-8,Math.hypot(x,y,z));
      u=.5+Math.atan2(z,x)/(2*Math.PI);v=.5-Math.asin(Math.max(-1,Math.min(1,y/r)))/Math.PI;
    }else if(mode==='box'||mode==='uv'){
      const n=[src[o+6],src[o+7],src[o+8]].map(Math.abs);
      if(n[0]>=n[1]&&n[0]>=n[2]){u=p[2];v=1-p[1];}
      else if(n[1]>=n[2]){u=p[0];v=p[2];}
    }
    const x=(u-.5)*Math.cos(angle)-(v-.5)*Math.sin(angle)+.5;
    const y=(u-.5)*Math.sin(angle)+(v-.5)*Math.cos(angle)+.5;
    let value=(axis==='u'?x:y)*tiling+offset;
    value=tiling===1&&offset===0?clamp(value):value-Math.floor(value);
    // Keep the integer shape ID intact: native shape selection adds a .001 tolerance.
    arr[o+15]=Math.floor(src[o+15]+.001)+value*.998;
  }
  return arr;
}
export function patchPalette(patch){
  patch('var m=g3MeshMix(shl,D);shape=shl.join(\'+\');',"var m=g3MeshMix(shl,D);m=window.__agPalette.mesh(G.dev,m);shape=shl.join('+');");
  patch('{clone:0,face:1,height:2,sound:3}[simOpt.g3CBy]','{clone:0,face:1,height:2,sound:3,mapped:4}[simOpt.g3CBy]');
  patch('else{ct=clamp(pv*0.9+0.1+0.3*I.pos.w,0.0,1.0);}','else if(cb<3.5){ct=clamp(pv*0.9+0.1+0.3*I.pos.w,0.0,1.0);}else{ct=clamp(fract(vin.fid)/0.998,0.0,1.0);}');
}
export function installPalette(w){
  let previous=null,key='',mapped=null;
  const destroy=()=>{mapped?.buf.destroy();mapped=null;previous=null;key='';};
  w.__agPalette={destroy,mesh(dev,mesh){
    const settings=w.__agPaletteSettings;
    if(!settings||settings.mode==='default')return mesh;
    const next=JSON.stringify(settings);
    if(previous===mesh&&next===key)return mapped;
    const arr=paletteMesh(mesh,settings);
    destroy();
    const buf=dev.createBuffer({size:arr.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});
    dev.queue.writeBuffer(buf,0,arr);mapped={...mesh,buf,arr};previous=mesh;key=next;
    return mapped;
  }};
}
