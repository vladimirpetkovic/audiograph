// Strange attractors: chaotic 3D flows. Each system has its classic parameters (`a`, quiet) and a second set (`b`, loud)
// that the sound morphs toward; both stay chaotic and bounded. `eq` writes the live equations for the HUD.
const f2=v=>v.toFixed(2),sg=v=>(v<0?'− ':'+ ')+Math.abs(v).toFixed(2);
export const ATTRACTORS={
  lorenz:{label:'Lorenz',dt:.005,a:[10,28,8/3],b:[10,46,8/3],names:['σ','ρ','β'],
    f:([s,r,b],x,y,z,o)=>{o[0]=s*(y-x);o[1]=x*(r-z)-y;o[2]=x*y-b*z;},
    eq:([s,r,b])=>[`dx/dt = ${f2(s)}(y − x)`,`dy/dt = x(${f2(r)} − z) − y`,`dz/dt = xy − ${f2(b)}z`]},
  aizawa:{label:'Aizawa',dt:.012,a:[.95,.7,.6,3.5,.25,.1],b:[.95,.7,.65,2.4,.25,.1],names:['a','b','c','d','e','f'],
    f:([a,b,c,d,e,f],x,y,z,o)=>{o[0]=(z-b)*x-d*y;o[1]=d*x+(z-b)*y;o[2]=c+a*z-z*z*z/3-(x*x+y*y)*(1+e*z)+f*z*x*x*x;},
    eq:([a,b,c,d,e,f])=>[`dx/dt = (z − ${f2(b)})x − ${f2(d)}y`,`dy/dt = ${f2(d)}x + (z − ${f2(b)})y`,`dz/dt = ${f2(c)} + ${f2(a)}z − z³/3 − (x² + y²)(1 + ${f2(e)}z) + ${f2(f)}zx³`]},
  thomas:{label:'Thomas',dt:.06,a:[.208186],b:[.12],names:['b'],
    f:([b],x,y,z,o)=>{o[0]=Math.sin(y)-b*x;o[1]=Math.sin(z)-b*y;o[2]=Math.sin(x)-b*z;},
    eq:([b])=>[`dx/dt = sin y − ${b.toFixed(3)}x`,`dy/dt = sin z − ${b.toFixed(3)}y`,`dz/dt = sin x − ${b.toFixed(3)}z`]},
  halvorsen:{label:'Halvorsen',dt:.006,a:[1.89],b:[1.45],names:['a'],
    f:([a],x,y,z,o)=>{o[0]=-a*x-4*y-4*z-y*y;o[1]=-a*y-4*z-4*x-z*z;o[2]=-a*z-4*x-4*y-x*x;},
    eq:([a])=>[`dx/dt = −${f2(a)}x − 4y − 4z − y²`,`dy/dt = −${f2(a)}y − 4z − 4x − z²`,`dz/dt = −${f2(a)}z − 4x − 4y − x²`]},
  dadras:{label:'Dadras',dt:.006,a:[3,2.7,1.7,2,9],b:[3,2.7,2.4,2,9],names:['a','b','c','d','e'],
    f:([a,b,c,d,e],x,y,z,o)=>{o[0]=y-a*x+b*y*z;o[1]=c*y-x*z+z;o[2]=d*x*y-e*z;},
    eq:([a,b,c,d,e])=>[`dx/dt = y − ${f2(a)}x + ${f2(b)}yz`,`dy/dt = ${f2(c)}y − xz + z`,`dz/dt = ${f2(d)}xy − ${f2(e)}z`]},
  rossler:{label:'Rössler',dt:.02,a:[.2,.2,5.7],b:[.2,.2,9],names:['a','b','c'],
    f:([a,b,c],x,y,z,o)=>{o[0]=-y-z;o[1]=x+a*y;o[2]=b+z*(x-c);},
    eq:([a,b,c])=>[`dx/dt = −y − z`,`dy/dt = x ${sg(a)}y`,`dz/dt = ${f2(b)} + z(x − ${f2(c)})`]},
};
export const ATTRACTOR_LIST=Object.entries(ATTRACTORS).map(([k,v])=>[k,v.label]);
export const attractorParams=(sys,m)=>sys.a.map((v,i)=>v+(sys.b[i]-v)*m);
// One RK4 step of length h, in place on P (x,y,z at offset i).
const k1=new Float64Array(3),k2=new Float64Array(3),k3=new Float64Array(3),k4=new Float64Array(3);
export function rk4(sys,prm,P,i,h){
  const x=P[i],y=P[i+1],z=P[i+2],f=sys.f;
  f(prm,x,y,z,k1);f(prm,x+k1[0]*h/2,y+k1[1]*h/2,z+k1[2]*h/2,k2);f(prm,x+k2[0]*h/2,y+k2[1]*h/2,z+k2[2]*h/2,k3);f(prm,x+k3[0]*h,y+k3[1]*h,z+k3[2]*h,k4);
  P[i]=x+h/6*(k1[0]+2*k2[0]+2*k3[0]+k4[0]);P[i+1]=y+h/6*(k1[1]+2*k2[1]+2*k3[1]+k4[1]);P[i+2]=z+h/6*(k1[2]+2*k2[2]+2*k3[2]+k4[2]);
  return k1[0]*k1[0]+k1[1]*k1[1]+k1[2]*k1[2];
}
// Points spread along the attractor: one long orbit (after a warm-up) sampled every few steps.
export function seedAttractor(sys,prm,count){
  const P=new Float32Array(count*3),q=new Float64Array([.1,.0,.1]);
  for(let s=0;s<3000;s++)rk4(sys,prm,q,0,sys.dt);
  for(let n=0;n<count;n++){for(let s=0;s<7;s++)rk4(sys,prm,q,0,sys.dt);P[n*3]=q[0];P[n*3+1]=q[1];P[n*3+2]=q[2];}
  return P;
}
