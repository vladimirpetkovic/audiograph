// Song structure memory: one offline pass over a decoded song finds its tempo, where the beats and bars fall, its sections
// (intro, build, drop, break) and the moments the drops land, so Autopilot knows what is coming instead of reacting late.
const HOP=512;
const LABELS=['intro','build','drop','break'];

// Onset strength (rises in loudness, bass weighted) and loudness per hop of 512 samples.
function envelopes(buffer){
  const n=buffer.length,sr=buffer.sampleRate,ch=[];for(let c=0;c<buffer.numberOfChannels;c++)ch.push(buffer.getChannelData(c));
  const frames=Math.floor(n/HOP),loud=new Float32Array(frames),low=new Float32Array(frames),k=1-Math.exp(-2*Math.PI*150/sr);
  let lp=0;
  for(let f=0;f<frames;f++){let e=0,l=0;
    for(let i=f*HOP,end=i+HOP;i<end;i++){let x=0;for(const d of ch)x+=d[i];x/=ch.length;lp+=(x-lp)*k;e+=x*x;l+=lp*lp;}
    loud[f]=Math.sqrt(e/HOP);low[f]=Math.sqrt(l/HOP);}
  const onset=new Float32Array(frames);
  for(let f=1;f<frames;f++)onset[f]=Math.max(0,Math.log1p(80*loud[f])-Math.log1p(80*loud[f-1]))+1.5*Math.max(0,Math.log1p(80*low[f])-Math.log1p(80*low[f-1]));
  return {loud,onset,fps:sr/HOP};
}

// Tempo from the autocorrelation of the onsets, leaning gently towards 120 BPM; then the phase that lines the beats up best.
function tempo(onset,fps){
  const m=onset.reduce((a,b)=>a+b,0)/Math.max(1,onset.length),o=onset.map(x=>x-m);let best=0,lag=fps/2;
  for(let bpm=60;bpm<=200;bpm+=.25){const L=fps*60/bpm,a=Math.floor(L),w=L-a;let s=0;
    for(let i=0;i+a+1<o.length;i++)s+=o[i]*(o[i+a]*(1-w)+o[i+a+1]*w);
    s*=Math.exp(-((Math.log2(bpm/120))**2)/(2*.5*.5));if(s>best){best=s;lag=L;}}
  // Fine pass: a comb over the whole song is sharp enough to pin the tempo to a twentieth of a BPM, and its phase.
  const val=t=>{const i=Math.floor(t),w=t-i;return (onset[i]||0)*(1-w)+(onset[i+1]||0)*w;},b0=60*fps/lag;let bb=b0,ph=0,pb=-1;
  for(let bpm=b0-2;bpm<=b0+2;bpm+=.05){const L=fps*60/bpm;for(let p=0;p<L;p+=.5){let s=0;for(let t=p;t<o.length;t+=L)s+=val(t);if(s>pb){pb=s;ph=p;bb=bpm;}}}
  return {bpm:bb,beat0:ph/fps};
}

export function analyse(buffer){
  const {loud,onset,fps}=envelopes(buffer),duration=buffer.length/buffer.sampleRate;
  let {bpm,beat0}=tempo(onset,fps);const beatLen=60/bpm;
  // The downbeat: of the 4 beats in a bar, the one where the song changes loudness in clean steps (sections start on bar 1),
  // or failing a clear winner, the one with the strongest onsets.
  const at=t=>onset[Math.round(t*fps)]||0,jump=[],hits=[];
  for(let k=0;k<4;k++){let s=0,j=0,prev=null;for(let t=beat0+k*beatLen;t<duration;t+=4*beatLen){s+=at(t);
      const f0=Math.floor(t*fps),f1=Math.min(loud.length,Math.floor((t+4*beatLen)*fps));let e=0;for(let f=f0;f<f1;f++)e+=loud[f];e/=Math.max(1,f1-f0);if(prev!=null)j+=(e-prev)**2;prev=e;}
    hits.push(s);jump.push(j);}
  const js=[...jump].sort((a,b)=>b-a),pick=js[0]>js[1]*1.3?jump:hits,db=pick.indexOf(Math.max(...pick));
  beat0+=db*beatLen;while(beat0-4*beatLen>=0)beat0-=4*beatLen;
  const barLen=4*beatLen,nb=Math.max(1,Math.ceil((duration-beat0)/barLen)),bars=new Float32Array(nb);
  for(let b=0;b<nb;b++){const f0=Math.floor((beat0+b*barLen)*fps),f1=Math.min(loud.length,Math.floor((beat0+(b+1)*barLen)*fps));let s=0;for(let f=f0;f<f1;f++)s+=loud[f];bars[b]=f1>f0?s/(f1-f0):0;}
  const sorted=[...bars].sort((a,b)=>a-b),peak=sorted[Math.floor(sorted.length*.95)]||sorted.at(-1)||1;
  // Each bar by its loudness, smoothed over 3 bars, then whole phrases of at least 4 bars.
  const rel=[...bars].map((_,b)=>{let s=0,c=0;for(let j=b-1;j<=b+1;j++)if(j>=0&&j<nb){s+=bars[j];c++;}return s/c/Math.max(1e-6,peak);});
  let lab=rel.map(r=>r>.78?2:r>.5?1:0);
  const runs=l=>{const r=[];for(let b=0;b<l.length;){let e=b;while(e<l.length&&l[e]===l[b])e++;r.push([b,e,l[b]]);b=e;}return r;};
  for(let pass=0;pass<3;pass++){const r=runs(lab);for(let i=0;i<r.length;i++){const [b,e]=r[i];if(e-b<4&&r.length>1){const v=(r[i-1]||r[i+1])[2];for(let j=b;j<e;j++)lab[j]=v;}}}
  // Quiet after a drop is a break; the phrase right before a drop builds up to it.
  let seenDrop=false;lab=lab.map(v=>{if(v===2)seenDrop=true;return v===0&&seenDrop?3:v;});
  const r=runs(lab),drops=[];
  for(let i=0;i<r.length;i++)if(r[i][2]===2&&i>0){drops.push(beat0+r[i][0]*barLen);const p=r[i-1];for(let j=Math.max(p[0],r[i][0]-8);j<r[i][0];j++)if(lab[j]!==2)lab[j]=1;}
  const sections=runs(lab).map(([b,e,v])=>({t0:Math.max(0,beat0+b*barLen),t1:Math.min(duration,beat0+e*barLen),kind:LABELS[v]}));
  if(sections.length)sections[0].t0=0;
  return {bpm:Math.round(bpm*10)/10,beat0,duration,bars:[...rel],sections,drops};
}

// Where the song is: its section, beats to the next drop and whether a drop landed since the last look (prev time).
export function at(song,time,prev=time){
  const s=song.sections.find(x=>time>=x.t0&&time<x.t1)||song.sections.at(-1),next=song.drops.find(d=>d>time);
  return {section:s?.kind||'intro',toDrop:next==null?Infinity:(next-time)*song.bpm/60,
    drop:time>=prev&&time-prev<1&&song.drops.some(d=>d>prev&&d<=time),beat:(time-song.beat0)*song.bpm/60,bpm:song.bpm};
}
