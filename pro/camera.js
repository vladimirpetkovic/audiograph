export const CAMERA_MOTIONS=[['static','Static'],['orbit','Orbit'],['pendulum','Pendulum'],['dolly','Dolly'],['spiral','Spiral']];
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

export function cameraPose(camera,phase=0){
  const c={...camera,orbit:0,orbitSound:0,yaw:0};
  const wave=Math.sin(phase),range=camera.range??35,height=camera.height??25;
  if(camera.motion==='orbit'||camera.motion==='spiral')c.yaw=phase*180/Math.PI;
  if(camera.motion==='pendulum')c.yaw=wave*range*1.8;
  if(camera.motion==='dolly')c.zoom=clamp(camera.zoom*(1+wave*range*.0055),30,300);
  if(camera.motion==='spiral'){
    c.zoom=clamp(camera.zoom*Math.exp(wave*range*.006),30,300);
    c.tilt=((camera.tilt+wave*height*.35+540)%360)-180;
  }
  return c;
}

export function advanceCamera(phase,camera,dt,bass=0){
  if(camera.motion==='static')return 0;
  const speed=camera.speed*.69+camera.audio*clamp(bass,0,1)*.9;
  if(dt<=0||!speed)return phase;
  return ((phase+Math.max(0,dt)*speed*Math.PI/180)%(Math.PI*2)+Math.PI*2)%(Math.PI*2);
}
