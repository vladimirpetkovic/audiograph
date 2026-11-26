export const CAMERA_MOTIONS=[['static','Static'],['orbit','Orbit'],['pendulum','Pendulum'],['dolly','Dolly'],['spiral','Spiral']];
export const SCENE_DISTANCE=.78/Math.sin(.4)*.92;
export const CAMERA_ZOOM_MIN=.01,CAMERA_ZOOM_MAX=300;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

export function frameCamera(camera,radius,aspect){
  if(!Number.isFinite(radius)||radius<=0||!Number.isFinite(aspect)||aspect<=0)throw Error('Scene bounds are not ready');
  const focal=camera.focal/28,half=Math.atan(Math.tan(.4)*Math.min(1,aspect)/focal);
  const distance=radius/Math.sin(half*.9);
  const movement=camera.motion==='spiral'?Math.exp(camera.range*.006):camera.motion==='dolly'?1+camera.range*.0055:1;
  return {...camera,zoom:clamp(SCENE_DISTANCE*focal/distance*100/movement,CAMERA_ZOOM_MIN,CAMERA_ZOOM_MAX),px:0,py:0};
}

export function cameraPose(camera,phase=0){
  const c={...camera,orbit:0,orbitSound:0,yaw:0};
  const wave=Math.sin(phase),range=camera.range??35,height=camera.height??25;
  if(camera.motion==='orbit'||camera.motion==='spiral')c.yaw=phase*180/Math.PI;
  if(camera.motion==='pendulum')c.yaw=wave*range*1.8;
  if(camera.motion==='dolly')c.zoom=clamp(camera.zoom*(1+wave*range*.0055),CAMERA_ZOOM_MIN,CAMERA_ZOOM_MAX);
  if(camera.motion==='spiral'){
    c.zoom=clamp(camera.zoom*Math.exp(wave*range*.006),CAMERA_ZOOM_MIN,CAMERA_ZOOM_MAX);
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
