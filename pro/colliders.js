export const COLLISION_WGSL=`
@group(1) @binding(11) var<storage,read> collider:array<vec4f>;
struct Collision{p:vec3f,v:vec3f};
fn bounceScene(start:vec3f,velocity:vec3f,dt:f32)->Collision{
  var p=start;var v=velocity;var remaining=dt;
  let end=u32(controls.launch.y);
  for(var impact=0u;impact<3u;impact++){
    let delta=v*remaining;
    var best=1.0;var normal=vec3f(0.0);var node=0u;
    if(controls.floor.x>0.0&&delta.y<0.0&&p.y>=controls.floor.y){
      let t=(controls.floor.y-p.y)/delta.y;
      let hit=p.xz+t*delta.xz;
      if(t<best&&select(all(abs(hit)<=vec2f(controls.floor.x)),length(hit)<=controls.floor.x,controls.floor.z>0.5)){
        best=t;normal=vec3f(0.0,1.0,0.0);
      }
    }
    let inv=1.0/select(delta,vec3f(1e-8),abs(delta)<vec3f(1e-8));
    while(node<end){
      let lo=collider[node];let hi=collider[node+1u];
      let a=(lo.xyz-p)*inv;let b=(hi.xyz-p)*inv;
      let enter=min(a,b);let exit=max(a,b);
      let near=max(0.0,max(enter.x,max(enter.y,enter.z)));
      let far=min(best,min(exit.x,min(exit.y,exit.z)));
      if(far<near){node=u32(hi.w);continue;}
      if(lo.w>0.0){
        let i=u32(lo.w);let origin=collider[i].xyz;
        let e1=collider[i+1u].xyz;let e2=collider[i+2u].xyz;
        let cross1=cross(delta,e2);let det=dot(e1,cross1);
        if(abs(det)>1e-10){
          let d=p-origin;let j=dot(d,cross1)/det;let cross2=cross(d,e1);
          let k=dot(delta,cross2)/det;let t=dot(e2,cross2)/det;
          if(j>=-0.00001&&k>=-0.00001&&j+k<=1.00001&&t>0.00001&&t<best){
            best=t;normal=normalize(cross(e1,e2));
          }
        }
      }
      node+=2u;
    }
    if(best>=1.0){p+=delta;break;}
    if(dot(normal,v)>0.0){normal=-normal;}
    p+=delta*best+normal*0.0002;
    v-=1.65*dot(v,normal)*normal;
    remaining*=1.0-best;
  }
  return Collision(p,v);
}`;

const bounds=()=>[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
function include(b,v){
  for(let i=0;i<3;i++){b[i]=Math.min(b[i],v[i]);b[i+3]=Math.max(b[i+3],v[i]);}
}

function tree(mesh){
  const triangles=[];
  for(const f of mesh.faces)for(let i=1;i+1<f.length;i++)triangles.push([f[0],f[i],f[i+1]]);
  const center=triangles.map(t=>t.reduce((c,i)=>c.map((x,k)=>x+mesh.verts[i][k]/3),[0,0,0]));
  const nodes=[];
  function split(ids){
    const node={triangle:-1,end:0};nodes.push(node);
    if(ids.length===1)node.triangle=ids[0];
    else{
      const b=bounds();for(const i of ids)include(b,center[i]);
      const size=b.slice(3).map((v,i)=>v-b[i]),axis=size.indexOf(Math.max(...size));
      ids.sort((a,b)=>center[a][axis]-center[b][axis]);
      const mid=ids.length>>1;split(ids.slice(0,mid));split(ids.slice(mid));
    }
    node.end=nodes.length;
  }
  if(triangles.length)split(triangles.map((_,i)=>i));
  return {triangles,nodes};
}

export function collisionField(meshes,cache){
  if(meshes.length===cache.meshes?.length&&meshes.every((m,i)=>m===cache.meshes[i]))return cache.field;
  cache.trees||=new WeakMap();
  let count=0;
  for(const {faces} of meshes)for(const face of faces){
    count+=Math.max(0,face.length-2);
    if(count>500000)throw Error('Particle collision supports up to 500,000 triangles across the scene');
  }
  const entries=meshes.map(mesh=>{
    let data=cache.trees.get(mesh.faces);
    if(!data){data=tree(mesh);cache.trees.set(mesh.faces,data);}
    return {mesh,...data};
  });
  const end=entries.reduce((n,e)=>n+e.nodes.length*2,0);
  const data=new Float32Array(Math.max(4,(end+count*3)*4));let start=0,triStart=end;
  for(const {mesh,nodes,triangles} of entries){
    for(let i=nodes.length-1;i>=0;i--){
      const n=nodes[i],o=(start+i*2)*4;
      let b,idx=0;
      if(n.triangle>=0){
        const [a,c,d]=triangles[n.triangle].map(i=>mesh.verts[i]);
        b=bounds();include(b,a);include(b,c);include(b,d);
        idx=triStart+n.triangle*3;
        data.set(a,idx*4);data.set(c.map((x,k)=>x-a[k]),idx*4+4);data.set(d.map((x,k)=>x-a[k]),idx*4+8);
      }else{
        const left=o+8,right=(start+nodes[i+1].end*2)*4;
        b=[0,1,2].map(k=>Math.min(data[left+k],data[right+k]));
        b.push(...[4,5,6].map(k=>Math.max(data[left+k],data[right+k])));
      }
      data.set([b[0]-.00001,b[1]-.00001,b[2]-.00001,idx,b[3]+.00001,b[4]+.00001,b[5]+.00001,start+n.end*2],o);
    }
    start+=nodes.length*2;triStart+=triangles.length*3;
  }
  cache.meshes=meshes;return cache.field={data,end};
}
