// Random wandering for Auto knobs: each seed (node or surface + knob) glides to a random target in -1…1 over a
// random 3–14 s, then picks the next. Paths differ per knob and per session, and a fresh one starts whenever
// auto is switched on again (that knob's clock jumped).
const paths=new Map();
export function wander(seed,clock){
  const next=(d,t)=>{d.from=d.to;d.to=(Math.random()*2-1)*d.reach;d.t0=t;d.dur=3+Math.random()*11;};
  let d=paths.get(seed);
  if(!d||clock<d.last||clock-d.last>1){
    if(paths.size>4000)paths.clear();
    d={reach:.45+Math.random()*.55,to:(Math.random()*2-1)*.5,last:clock};next(d,clock);paths.set(seed,d);
  }
  d.last=clock;
  while(clock-d.t0>=d.dur)next(d,d.t0+d.dur);
  const x=(clock-d.t0)/d.dur;return d.from+(d.to-d.from)*x*x*(3-2*x);
}
