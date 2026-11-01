// Live Data: public, keyless feeds turned into the same four numbers (level, change, pulse, phase) plus a palette,
// so every source flows alike. Feeds are shared by every node reading the same source and place, polled only while
// something reads them, and fall back to a simulated signal when offline.

export const LIVE_SOURCES=[['iss','ISS orbit'],['space','Space weather'],['ocean','Ocean swell'],['weather','Weather'],['quakes','Earthquakes'],['wiki','Wikipedia edits']];
export const LIVE_PLACES=[['here','Here'],['newyork','New York'],['lisbon','Lisbon'],['reykjavik','Reykjavík'],['tokyo','Tokyo'],['sydney','Sydney'],['capetown','Cape Town'],['honolulu','Honolulu']];
// Offshore points so the marine model has sea under them.
const PLACES={newyork:[40.45,-73.75],lisbon:[38.65,-9.5],reykjavik:[64.15,-22.2],tokyo:[34.95,139.95],sydney:[-33.85,151.35],capetown:[-33.95,18.3],honolulu:[21.25,-157.9]};
const LOCAL=new Set(['ocean','weather']);
const clamp=v=>Math.max(0,Math.min(1,v));
const hsl=(h,s,l)=>{h=((h%360)+360)%360;s=clamp(s);l=clamp(l);const k=n=>(n+h/30)%12,a=s*Math.min(l,1-l),f=n=>l-a*Math.max(-1,Math.min(k(n)-3,9-k(n),1));
  return '#'+[f(0),f(8),f(4)].map(x=>Math.round(x*255).toString(16).padStart(2,'0')).join('');};
const ramp=(h,spread,sat,dark=.07,light=.78)=>[0,1,2,3].map(i=>hsl(h+spread*i,sat,dark+(light-dark)*i/3));
const lerp=(a,b,t)=>a+(b-a)*t;
const getJSON=async url=>{const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error(r.status);return r.json();};

let here=null,hereAsked=false,hereNote='';
function coords(place){
  if(place!=='here')return PLACES[place]||PLACES.newyork;
  if(!hereAsked){hereAsked=true;hereNote='Finding you…';
    if(navigator.geolocation)navigator.geolocation.getCurrentPosition(p=>{here=[+p.coords.latitude.toFixed(2),+p.coords.longitude.toFixed(2)];hereNote='';},()=>{hereNote='Location blocked, using New York';},{timeout:8000,maximumAge:3600e3});
    else hereNote='Location unavailable, using New York';}
  return here||PLACES.newyork;
}

// Each source: how often to poll and how to turn its reply into level (0–1), a phase (absolute) or speed (cycles/s),
// events (a count; each new one fires a pulse of the given strength) and a palette.
const SOURCES={
  iss:{every:4000,async fetch(f){const j=await getJSON('https://api.wheretheiss.at/v1/satellites/25544');
    const lit=j.visibility==='daylight';if(f.lit!==undefined&&f.lit!==lit)f.event(1);f.lit=lit;
    const h=200+((j.longitude+180)/360)*140;
    return {level:(j.latitude+51.7)/103.4,phase:(j.longitude+180)/360,pal:lit?ramp(h-170,22,.75,.08,.85):ramp(h,25,.7,.04,.7),
      text:`${j.latitude.toFixed(1)}°, ${j.longitude.toFixed(1)}° · ${Math.round(j.velocity).toLocaleString()} km/h · ${lit?'sunlit':'in shadow'}`};}},
  space:{every:60000,async fetch(f){const [kp,sw,mag]=await Promise.all([getJSON('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json'),
      getJSON('https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json'),getJSON('https://services.swpc.noaa.gov/products/summary/solar-wind-mag-field.json')]);
    const k=+(kp.at(-1)?.estimated_kp??kp.at(-1)?.kp_index??2),v=+(sw[0]?.proton_speed??400),bz=+(mag[0]?.bz_gsm??0),bt=+(mag[0]?.bt??5);
    if(f.kp!==undefined&&Math.abs(k-f.kp)>.2)f.event(clamp(Math.abs(k-f.kp)));f.kp=k;
    const level=.6*k/9+.4*clamp((v-280)/520);
    return {level,speed:.03+v/8000,pal:[hsl(250,.6,.05),hsl(150-k*8,.8,.32),hsl(160+k*18,.75,.5),hsl(300-bz*3,.6,.82)],
      text:`Kp ${k.toFixed(1)} · wind ${Math.round(v)} km/s · Bz ${bz} nT (Bt ${bt})`};}},
  ocean:{every:600000,async fetch(f,place){const [la,lo]=coords(place);
    const j=await getJSON(`https://marine-api.open-meteo.com/v1/marine?latitude=${la}&longitude=${lo}&current=wave_height,wave_period,sea_surface_temperature`);
    const c=j.current||{},h=+(c.wave_height??1),per=Math.max(3,+(c.wave_period??8)),t=+(c.sea_surface_temperature??15);f.crest=true;
    return {level:clamp(h/6),speed:1/per,pal:ramp(215-clamp((t-2)/28)*45,-8,.7,.05,.82),text:`${h.toFixed(2)} m waves every ${per.toFixed(1)} s · sea ${t.toFixed(1)}°C`};}},
  weather:{every:600000,async fetch(f,place){const [la,lo]=coords(place);
    const j=await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&current=temperature_2m,wind_speed_10m,cloud_cover,precipitation,is_day`);
    const c=j.current||{},t=+(c.temperature_2m??15),w=+(c.wind_speed_10m??10),cl=+(c.cloud_cover??50)/100,pr=+(c.precipitation??0),day=!!c.is_day;
    f.gust=clamp(w/60)*.6+clamp(pr/4)*.8;
    return {level:clamp(.55*w/50+.25*cl+.2*clamp(pr/4)),speed:.02+w/400,pal:ramp(230-clamp((t+10)/45)*200,14,.75-.45*cl,day?.1:.04,day?.85:.62),
      text:`${t.toFixed(1)}°C · wind ${w.toFixed(0)} km/h · clouds ${Math.round(cl*100)}%${pr?` · rain ${pr} mm`:''} · ${day?'day':'night'}`};}},
  quakes:{every:60000,async fetch(f){const j=await getJSON('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson');
    const qs=(j.features||[]).map(q=>({id:q.id,m:+(q.properties.mag??0),place:q.properties.place||''}));f.seen??=new Set(qs.map(q=>q.id));
    for(const q of qs)if(!f.seen.has(q.id)){f.seen.add(q.id);f.event(clamp(.3+q.m/6));}
    const max=qs.reduce((m,q)=>Math.max(m,q.m),0),last=qs[0];
    return {level:clamp(.7*max/6+.3*clamp(qs.length/25)),speed:.02+qs.length/600,pal:ramp(8+clamp(max/7)*30,10,.8,.04,.8),
      text:last?`${qs.length} in the last hour · latest M${last.m.toFixed(1)} ${last.place}`:'No earthquakes in the last hour'};}},
  // Wikipedia changes arrive as a stream: count edits per second; big edits fire pulses.
  wiki:{stream:true,open(f){
    const es=new EventSource('https://stream.wikimedia.org/v2/stream/recentchange');f.es=es;f.count=0;f.rate=0;f.t0=performance.now();
    es.onmessage=e=>{let d;try{d=JSON.parse(e.data);}catch{return;}if(d.type!=='edit'||d.bot)return;f.count++;
      const big=Math.abs((d.length?.new??0)-(d.length?.old??0));if(big>1500)f.event(clamp(big/12000+.3));f.lastTitle=`${d.wiki}: ${d.title}`;};
    es.onerror=()=>{if(es.readyState===2){f.ok=false;f.close?.();}};
    f.close=()=>{es.close();clearInterval(f.tick);f.es=null;};
    f.tick=setInterval(()=>{const now=performance.now(),r=f.count/((now-f.t0)/1000);f.count=0;f.t0=now;f.rate=f.rate?lerp(f.rate,r,.3):r;
      f.ok=true;f.data={level:clamp(f.rate/25),speed:.03+f.rate/300,pal:ramp(190+f.rate*4,40,.55,.06,.85),text:`${f.rate.toFixed(1)} human edits/s · ${f.lastTitle||''}`};},2000);}},
};

const feeds=new Map();
function feed(source,place){
  const key=source+'|'+(LOCAL.has(source)?place:'');let f=feeds.get(key);
  if(!f){f={key,source,place,events:0,strength:0,ok:null,data:null,busy:false,next:0,seen:undefined};f.event=s=>{f.events++;f.strength=s;};feeds.set(key,f);}
  f.demand=performance.now();return f;
}
async function poll(f){
  const s=SOURCES[f.source];if(s.stream){if(!f.es)s.open(f);return;}
  if(f.busy||performance.now()<f.next)return;f.busy=true;
  try{f.data=await s.fetch(f,f.place);f.ok=true;f.next=performance.now()+s.every;}
  catch{f.ok=false;f.next=performance.now()+Math.min(s.every,30000);}
  f.busy=false;
}
setInterval(()=>{const now=performance.now();
  for(const f of feeds.values()){if(now-f.demand<8000)poll(f);else if(f.es)f.close();}},1000);

// Offline stand-in: slow, seeded drift so visuals keep moving without a connection.
function simulated(f,t){let h=0;for(const ch of f.key)h=(h*31+ch.charCodeAt(0))>>>0;const a=(h%997)/997*6.28;
  const level=.5+.28*Math.sin(t*.11+a)+.14*Math.sin(t*.037+a*2);if(Math.sin(t*.7+a)>.995&&!f.simBeat){f.simBeat=true;f.event(.6);}else if(Math.sin(t*.7+a)<.9)f.simBeat=false;
  return {level,speed:.05,pal:ramp(200+80*Math.sin(t*.02+a),30,.65),text:''};}

export function liveData(p,state,dt){
  const f=feed(p.source,p.place),t=performance.now()/1000,d=f.ok?f.data:f.ok===false||!f.data?simulated(f,t):f.data;
  if(!d)return {level:0,change:0,pulse:0,phase:0,palette:null};
  // Glide every value so slow feeds (one reading a minute) still move smoothly.
  const k=p.glide<=0?1:1-Math.exp(-dt/p.glide);
  state.raw??=d.level;state.raw+=(clamp(d.level)-state.raw)*k;
  // Auto range: blend the absolute level with where it sits between its recent low and high.
  state.lo=Math.min(state.lo??state.raw,state.raw);state.hi=Math.max(state.hi??state.raw,state.raw);
  const relax=1-Math.exp(-dt/120);state.lo+=(state.raw-state.lo)*relax;state.hi+=(state.raw-state.hi)*relax;
  const span=state.hi-state.lo,rel=span>.02?(state.raw-state.lo)/span:.5,level=clamp(lerp(state.raw,rel,p.stretch));
  const prev=state.level??level;state.level=level;
  state.change=lerp(state.change??0,clamp(Math.abs(level-prev)/Math.max(dt,1e-3)*6),1-Math.exp(-dt*2));
  // Phase: absolute when the data is cyclic (ISS longitude), otherwise integrated from the feed's own speed.
  if(d.phase!==undefined){const target=d.phase,cur=state.phase??target;let dp=target-cur;dp-=Math.round(dp);state.phase=((cur+dp*k)%1+1)%1;}
  else{const before=state.phase??0;state.phase=(before+dt*(d.speed??.05))%1;if(f.crest&&state.phase<before)state.pulse=Math.max(state.pulse??0,.4+.6*d.level);}
  if(f.source==='weather'&&f.gust&&Math.random()<dt*f.gust*.8)f.event(.3+.7*Math.random()*f.gust);
  if(state.events===undefined)state.events=f.events;
  if(f.events!==state.events){state.events=f.events;state.pulse=Math.max(state.pulse??0,f.strength||1);}
  else state.pulse=(state.pulse??0)*Math.exp(-dt*3);
  // Palette colours glide too (never jump).
  const target=d.pal.map(hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)));
  state.pal=state.pal?state.pal.map((c,i)=>c.map((v,j)=>v+(target[i][j]-v)*Math.min(1,k*.6))):target;
  const palette=state.pal.map(c=>'#'+c.map(v=>Math.round(v).toString(16).padStart(2,'0')).join(''));
  return {level,change:state.change,pulse:state.pulse,phase:state.phase,palette};
}

export function liveStatus(p){
  const f=feeds.get(p.source+'|'+(LOCAL.has(p.source)?p.place:''));
  const note=LOCAL.has(p.source)&&p.place==='here'&&hereNote?hereNote+' · ':'';
  if(!f||f.ok===null)return note+'Connecting…';
  if(f.ok===false)return note+'Offline: showing a simulated stream until the feed answers.';
  return note+(f.data?.text||'Live');
}
