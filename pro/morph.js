import {ORIGINAL_PRESETS} from './templates.js';

export const TEMPLATE_NAMES=ORIGINAL_PRESETS.map(p=>p.name);
export const TEMPLATE_BY_NAME=new Map(ORIGINAL_PRESETS.map(p=>[p.name,p]));

export class TemplateMorph{
  constructor(){
    this.list=[];this.duration=20;this.random=false;this.beat=false;this.beatMode='glide4';this.ping=false;
    this.playing=false;this.position=0;this.direction=1;this.velocity=0;this.target=0;this.lastBeat=null;
    this.from=null;this.to=null;
    this.snapTime=null;this.snapFrom=0;
  }
  pool(){return this.list.length>=2&&(!this.random||new Set(this.list).size>=2)?this.list:TEMPLATE_NAMES;}
  pick(exclude){const pool=this.pool().filter(n=>n!==exclude);return pool[Math.floor(Math.random()*pool.length)];}
  pair(){
    const pool=this.pool(),pos=Math.max(0,this.position);
    if(this.random){if(!this.from||!pool.includes(this.from)||!pool.includes(this.to)){this.from=pool[0];this.to=this.pick(this.from);}return {from:this.from,to:this.to,mix:Math.min(1,pos)};}
    const i=Math.floor(pos)%pool.length;
    return {from:pool[i],to:pool[(i+1)%pool.length],mix:pos-Math.floor(pos)};
  }
  scrub(percent){
    if(!Number.isFinite(percent)||percent<0||percent>100)throw Error('Morph position must be 0–100 percent');
    this.position=percent/100*(this.random?1:this.pool().length);
    this.target=this.position;this.velocity=0;this.snapTime=null;return this.pair();
  }
  progress(){return this.position/(this.random?1:this.pool().length)*100;}
  start(beat){this.playing=true;this.lastBeat=beat;this.target=this.position;this.velocity=0;this.snapTime=null;}
  step(dt,beat){
    if(!this.playing)return this.pair();
    dt=Math.max(0,Math.min(.1,dt));
    if(this.beat){
      if(this.beatMode==='snap'){
        if(beat!==this.lastBeat){this.lastBeat=beat;if(this.snapTime===null){this.snapFrom=this.position;this.target=Math.floor(this.position)+1;this.snapTime=0;}}
        if(this.snapTime!==null){this.snapTime+=dt;this.position=this.snapFrom+(this.target-this.snapFrom)*Math.min(1,this.snapTime/.45);if(this.snapTime>=.45)this.snapTime=null;}
      }else{
        if(beat!==this.lastBeat){this.lastBeat=beat;const inc=this.beatMode==='glide4'?.25:1;this.target=Math.min(this.target+inc,this.position+1.5*inc);}
        const w=this.beatMode==='glide1'?8:10,N=Math.max(1,Math.ceil(dt/.005));
        for(let i=0;i<N;i++){const h=dt/N;this.velocity+=(w*w*(this.target-this.position)-2*w*this.velocity)*h;this.position+=this.velocity*h;if(this.position>this.target){this.position=this.target;this.velocity=0;}}
      }
    }else this.position+=this.direction*dt/this.duration;
    const end=this.random?1:this.pool().length;
    if(this.position>=end){
      if(this.random&&!this.ping){this.position-=1;this.target-=1;this.from=this.to;this.to=this.pick(this.from);}
      else if(this.ping&&!this.beat){this.position=end-1e-9;this.direction=-1;}
      else{this.position-=end;this.target-=end;}
    }else if(this.position<0){this.position=0;this.target=0;this.direction=1;}
    return this.pair();
  }
  settings(){return {list:[...this.list],duration:this.duration,random:this.random,beat:this.beat,beatMode:this.beatMode,ping:this.ping};}
  configure(s){
    if(s.list!==undefined){if(!Array.isArray(s.list)||s.list.length>100||s.list.some(n=>!TEMPLATE_BY_NAME.has(n)))throw Error('Invalid template playlist');this.list=[...s.list];this.position=0;this.from=this.to=null;}
    if(s.duration!==undefined){if(!Number.isFinite(s.duration)||s.duration<10||s.duration>60)throw Error('Morph duration must be 10–60 seconds');this.duration=s.duration;}
    for(const k of ['random','beat','ping'])if(s[k]!==undefined){if(typeof s[k]!=='boolean')throw Error('Invalid morph '+k);this[k]=s[k];}
    if(s.beatMode!==undefined){if(!['glide4','glide1','snap'].includes(s.beatMode))throw Error('Invalid morph beat mode');this.beatMode=s.beatMode;}
    this.target=this.position;this.velocity=0;this.snapTime=null;
  }
}
