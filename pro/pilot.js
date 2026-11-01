// Autopilot, ported from the original Audiograph: it listens for the song's sections (breakdown, groove, build-up,
// drop), and at each one generates a fitting stack of 1–3 layers with the original's own look generator
// (agAI.toLayer, running inside an engine frame). Studio crossfades the stack; nothing here touches the DOM.
export const ROLE_OP=[100,70,55];
export const MIN_GAP=8;
export const SIMS=['simparticles','simfluid','simsmoke','simsand'];
export const isSim=n=>SIMS.includes(n);
const SOLIDS=['knot','torus','cube'];
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const q=(a,p)=>{const s=a.slice().sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(p*s.length))];};
const any=a=>a[Math.floor(Math.random()*a.length)];

// Loudness and treble from a byte spectrum, as the original measures them (bins up to ~12 kHz).
export function features(freq){
  const n=Math.floor(freq.length*.5),hs=Math.floor(n*.35);let e=0,h=0;
  for(let i=1;i<n;i++){e+=freq[i];if(i>=hs)h+=freq[i];}
  return {energy:e/(n*255),treble:h/((n-hs)*255)};
}

// Song structure from loudness: the level is relative to the song's own recent range (8th–95th percentile).
// Saturated, mid-light version of a #rrggbb colour (alpha suffix kept).
export function vivid(c){
  if(!/^#[0-9a-f]{6}/i.test(c))return c;
  const [r,g,b]=[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)/255),mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;
  if(d<.05)return c;
  let h=0;h=mx===r?((g-b)/d+6)%6:mx===g?(b-r)/d+2:(r-g)/d+4;
  const L=Math.min(.62,Math.max(.4,(mx+mn)/2)),S=Math.max(.8,d?d/(1-Math.abs(mx+mn-1)):0),C=(1-Math.abs(2*L-1))*S,X=C*(1-Math.abs(h%2-1)),m=L-C/2;
  const [R,G,B]=[[C,X,0],[X,C,0],[0,C,X],[0,X,C],[X,0,C],[C,0,X]][Math.floor(h)%6];
  return '#'+[R,G,B].map(v=>Math.round((v+m)*255).toString(16).padStart(2,'0')).join('')+c.slice(7);
}
export class Pilot{
  constructor(){this.reset();}
  reset(){Object.assign(this,{fast:0,mid:0,slow:0,treb:0,hist:[],levHist:[],histT:0,lo:0,hi:1,level:0,section:'waiting',secT:0,since:MIN_GAP,silentT:0});}
  // One analysis step. Returns {kind,dur} when the music asks for a change.
  step(dt,f,every,fading){
    if(f.energy<.004){this.silentT+=dt;if(this.silentT>2){this.section='waiting';return null;}}else this.silentT=0;
    const k=tau=>1-Math.exp(-dt/tau);
    this.fast+=(f.energy-this.fast)*k(.25);this.mid+=(f.energy-this.mid)*k(1.2);this.slow+=(f.energy-this.slow)*k(6);this.treb+=(f.treble-this.treb)*k(1.5);
    this.histT+=dt;
    if(this.histT>=.25){this.histT=0;this.hist.push(this.mid);if(this.hist.length>360)this.hist.shift();
      if(this.hist.length>8){this.lo=q(this.hist,.08);this.hi=Math.max(this.lo+.02,q(this.hist,.95));}
      this.levHist.push(this.level);if(this.levHist.length>24)this.levHist.shift();}
    this.level=clamp((this.mid-this.lo)/(this.hi-this.lo),0,1);
    this.secT+=dt;this.since+=dt;
    const s=this.section,lv=this.level,t=this.secT,lh=this.levHist,rise=lh.length>=16?lv-lh[lh.length-16]:0;let next=s;
    if(s==='waiting')next=lv>.62?'drop':lv<.35?'calm':'groove';
    else if(lv>.68&&s!=='drop'&&(s==='calm'||s==='build'||t>3))next='drop';
    else if(lv<.3&&s!=='calm'&&t>2.5)next='calm';
    else if(s==='drop'&&lv<.52&&t>4)next='groove';
    else if(s==='calm'&&lv>.4&&t>3)next='groove';
    else if((s==='groove'||s==='calm')&&rise>.22&&lv>.35&&lv<.68&&t>3)next='build';
    else if(s==='build'&&rise<.02&&t>6)next='groove';
    if(next!==s){this.section=next;this.secT=0;
      if((s!=='waiting'||next!=='groove')&&(this.since>=MIN_GAP||next==='drop'))return {kind:next,dur:durFor(next,every)};}
    else if(this.since>every&&!fading)return {kind:'phrase',dur:10};
    return null;
  }
}
export const durFor=(kind,every)=>kind==='drop'?2.5:kind==='build'?clamp(every*.5,6,12):kind==='calm'?9:kind==='phrase'?10:7;

// ---------- the description ----------
const SIM_W=[['simfluid',/\b(fluid|liquid|navier|dye|ink in water|paint swirl|marbl)/],['simsmoke',/\b(smoke|smoky|fog|mist|steam|incense|campfire|cloud|plume)/],
  ['simparticles',/\b(particles?|particle field|firework|embers?|sparks?|stardust|confetti|fountain)/],['simsand',/\b(sand|granular|dunes?|hourglass)/]];
const LAYOUT_NAMES=['spiral','phyllotaxis','concentric','sphere','growth','circle','tetrahedron','dna','scatter','sacred','graph','fractal','lissajous'];
const SOLID_W=[['knot',/\b(knot|tangle)/],['torus',/\b(torus|donut|doughnut)/],['cube',/\b(cube|box)/]];
// The original's reading of a description: tempo, energy, palette, layouts and styles (steers; the music decides when).
export function readVibe(w,text){
  const t=' '+String(text||'').toLowerCase()+' ';if(!t.trim()||!w?.agAI)return null;
  const kw=w.agAI.keywords(t),h=kw._hit||{},v={kw,hit:h,layouts:[],shapes:[],tempo:1,bpm:0,energy:h.energy?kw.energy:null};
  const add=n=>{if(!v.layouts.includes(n))v.layouts.push(n);};
  w.agAI.LAYW.forEach(x=>{if(x[0]!=='linear'&&x[1].test(t))add(x[0]);});
  LAYOUT_NAMES.forEach(n=>{if(new RegExp('\\b'+n).test(t))add(n);});
  SIM_W.forEach(x=>{if(x[1].test(t))add(x[0]);});
  SOLID_W.forEach(x=>{if(x[1].test(t))add(x[0]);});
  if(/\bink\s+in\s+water\b/.test(t))v.layouts=v.layouts.filter(n=>n!=='linear');
  w.agAI.SHAPEW.forEach(x=>{if(x[1].test(t)&&!/^(words|numbers|symbols|braille|cascade|barcode)$/.test(x[0])&&!v.shapes.includes(x[0]))v.shapes.push(x[0]);});
  if(/\bink\s+in\s+water\b/.test(t))v.shapes=v.shapes.filter(n=>n!=='tapered');
  const b=t.match(/(\d{2,3})\s*bpm/);
  if(b){v.bpm=+b[1];v.tempo=clamp(v.bpm/120,.5,1.6);}
  else if(/\b(slow|calm|ambient|gentle|chill|lazy|serene|drift|meditat|downtempo|dreamy)/.test(t))v.tempo=.6;
  else if(/\b(fast|quick|rapid|frantic|energetic|hyper|drum ?n ?bass|dnb|techno|rave)/.test(t))v.tempo=1.4;
  v.palette=!!h.colors||kw.colors.join()!=='#e94560,#f5a623,#6ee7b7';
  v.dark=/\b(dark|moody|night|noir|gloom|shadow)/.test(t);
  return v;
}
const NAMES={simparticles:'particles',simfluid:'fluid',simsmoke:'smoke',simsand:'sand',lissajous:'harmonic',inkwater:'ink in water'};
export const nameOf=n=>NAMES[n]||n;
export function vibeText(v){
  if(!v)return '';const o=[];
  if(v.energy!=null)o.push(v.energy<40?'calm':v.energy>70?'intense':'medium energy');
  if(v.bpm)o.push(v.bpm+' bpm');else if(v.tempo!==1)o.push(v.tempo<1?'slow motion':'fast motion');
  if(v.palette)o.push(v.hit.colors?'your colours':'themed palette');
  if(v.layouts.length)o.push(v.layouts.map(nameOf).join(', '));
  if(v.shapes.length)o.push(v.shapes.map(nameOf).join(', ')+' style');
  ['thickness','density','glow','trails','warp','particles','symmetry'].forEach(k=>{if(v.hit[k]||(k==='glow'||k==='trails'||k==='warp')&&v.kw[k])o.push(k==='thickness'?(v.kw.thickness<30?'thin':'thick'):k==='density'?(v.kw.density<40?'sparse':'dense'):k);});
  if(v.dark)o.push('dark');
  return o.length?'Reads: '+o.join(' · '):'No keywords recognised yet: try a tempo, mood, colours or shapes.';
}

// ---------- looks ----------
// A layer: {layout (Pro renderer mode), params (full original layer parameters), opacity, spin (signed), speed}.
export class Generator{
  constructor(){this.hue=Math.random()*360;this.dir=Math.random()<.5?-1:1;this.recent=[];this.layoutCursor=0;this.shapeCursor=0;this.slot=0;this.match=85;this.vb=null;this.layers='auto';this.section='groove';}
  setVibe(w,text){this.vb=readVibe(w,text);this.layoutCursor=this.shapeCursor=0;return this.vb;}
  pick(list,free,key){
    const m=this.match;
    if(!list?.length||!(m>=100||Math.random()*100<m)){
      if(key==='layout'){const fresh=free.filter(l=>!this.recent.includes(l));if(fresh.length)free=fresh;const c=any(free);this.recent.push(c);if(this.recent.length>5)this.recent.shift();return c;}
      return any(free);}
    if(m>=100)return list[(key==='layout'?this.layoutCursor++:this.shapeCursor++)%list.length];
    return any(list);
  }
  simOK(w){
    if(!globalThis.navigator?.gpu||!w?.agSim)return false;
    try{if(['unsupported','error','lost'].includes(w.agSim.stats?.().status))return false;}catch{}
    return true;
  }
  energy(kind){return {calm:18,groove:50,build:72,drop:92,phrase:this.section==='drop'?85:this.section==='calm'?22:this.section==='build'?70:50}[kind]||50;}
  spec(w,kind,companion){
    const v=this.vb,r=Math.random,m=this.match;
    let E=this.energy(kind);if(v&&v.energy!=null)E=Math.round(E*.5+v.energy*.5);
    const j=x=>clamp(x+(r()-.5)*20*(1-m/100),0,100);
    if(!companion)this.hue+=kind==='drop'?120+r()*60:kind==='phrase'?25+r()*30:kind==='calm'?-40:15;
    const hue=this.hue,sat=E>70?80:E<30?45:62,hx=w._hslHex;
    const s={layout:'circle',shape:'straight',colors:[hx(hue-20,sat,14),hx(hue,sat,45),hx(hue+35,sat+5,62),hx(hue+70,sat+10,E>70?66:76)],background:'#000000',energy:E,
      density:E>70?60+r()*30:25+r()*35,thickness:E>70?18+r()*25:6+r()*20,spin:(E>60?40:15)*(r()<.5?-1:1),warp:E<30?20+r()*30:r()*25,glow:E>70?25+r()*20:20+r()*25,trails:E<40?35+r()*30:r()*15,
      symmetry:E>80&&r()<.35?any(['r4','r6','xy']):'none',particles:E>80&&r()<.5,growth:any(['vine','coral']),pulse:E>60};
    const calmL=['spiral','phyllotaxis','concentric','sphere','growth','sacred','graph','lissajous','fractal'],hotL=['circle','concentric','spiral','tetrahedron','sphere','dna','scatter','sacred','lissajous','graph'];
    const shapes=['straight','rounded','tapered','pins','caps','circles','needles','diamonds','dotted'];
    s.layout=this.pick(v?.layouts,E>60?hotL:calmL,'layout');
    if(!v?.layouts.length){
      // Pro adds its 3D solids, drawn as waveforms, to the mix.
      if(r()<(E>60?.12:.06))s.layout=any(SOLIDS);
      else if(this.simOK(w)&&r()<(kind==='calm'?.35:kind==='drop'?.3:.22))s.layout=any(E>60?['simfluid','simparticles','simparticles','simsmoke']:['simsmoke','simfluid','simparticles']);
    }else if(isSim(s.layout)&&!this.simOK(w))s.layout=any(E>60?hotL:calmL);
    s.shape=this.pick(v?.shapes,shapes,'shape');
    if(v){const kw=v.kw,h=v.hit;
      if(v.palette){s.colors=kw.colors.slice();if(m<100&&kind!=='calm'&&kind!=='drop'&&s.colors.length>2){const c=s.colors.slice(1);for(let n=Math.floor(r()*c.length);n>0;n--)c.push(c.shift());s.colors=[s.colors[0],...c];}}
      if(h.growth)s.growth=kw.growth;if(h.symmetry)s.symmetry=kw.symmetry;if(h.particles)s.particles=kw.particles;
      if(h.thickness)s.thickness=j(kw.thickness);if(h.density)s.density=j(kw.density);
      ['glow','trails','warp'].forEach(k=>{if(kw[k])s[k]=j(kw[k]);});
      if(v.dark)s.colors=s.colors.map((c,i)=>i?c:hx(hue-20,sat,6));
    }
    // Subtle, steady spin, one direction for the whole run (it may reverse only in a breakdown).
    if(kind==='calm'&&!companion&&r()<.3)this.dir=-this.dir;
    let amt=r()<.3?0:(E>60?.2+r()*.5:.1+r()*.35);
    if(v){if(v.hit.spin)amt=Math.max(amt,v.kw.spin>60?.9:.6);amt*=v.tempo;}
    s.spinAmt=isSim(s.layout)?0:+Math.min(1.2,amt).toFixed(2);
    // Quiet tones fade through the ramp's first stop: transparent more often when calm, partly see-through otherwise.
    const fadeP=E<30?.85:E<60?.65:.4;
    if(!v?.palette&&!isSim(s.layout)&&r()<fadeP&&s.colors.length>2&&/^#[0-9a-f]{6}$/i.test(s.colors[0])){s.colors=s.colors.slice();s.colors[0]+=r()<.5?'00':any(['33','55','77']);}
    return s;
  }
  simify(w,l,s){
    const p=l.params,e=s.energy/100,pr=w.AG_SIM_PRESETS?.[l.layout];
    if(pr?.length){const x=any(pr);Object.assign(p,x[1]);p._sim={...w.AG_SIM_DEF_OPT,...x[2]};}else p._sim={...w.AG_SIM_DEF_OPT};
    p._sim.q='med';p._sim.step='normal';
    // Pro tunes each simulation's response itself (smoke clips to white at full punch), so only glow and pace follow the music.
    for(const k of ['pSimEnergy','pSimBass','pSimSens','pSimExpo','pSimBurst','pSimReact','pSimAttack','pSimRelease'])delete p[k];
    p.pSimBloom=Math.round(Math.min(s.glow,40)*.5);p.pSimSpeed=Math.round(85+e*30);
    if('pSpAmount' in p)p.pSpAmount=Math.min(p.pSpAmount,100);
    p.pSfIter=Math.min(p.pSfIter||24,16);p.pSmIter=Math.min(p.pSmIter||24,16);
    // Hot, thick smoke presets saturate to white once coloured: keep them in the ramp's range.
    if(l.layout==='simsmoke')for(const [k,v] of [['pSmHeat',110],['pSmEmit',105],['pSmOpac',100],['pSmLightI',100],['pSmEmber',45]])if(p[k]>v)p[k]=v;
    // Dense simulations sit on the ramp's top stop: a near-white one would wash the frame out, so it takes the colour below.
    const ts=p._toneStops;
    if(Array.isArray(ts)&&ts.length>1){const hx=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)),a=hx(ts[ts.length-1]);
      if(Math.min(...a)>215){const b=hx(ts[ts.length-2]);p._toneStops=[...ts.slice(0,-1),'#'+a.map((v,i)=>Math.round(v*.45+b[i]*.55).toString(16).padStart(2,'0')).join('')];}}
    // Smoke mixes a quarter grey into its tint and lights it from above: a muted ramp reads as grey, so it gets vivid mid tones.
    if(l.layout==='simsmoke'&&Array.isArray(p._toneStops))p._toneStops=p._toneStops.map(vivid);
    p._particlesOn=false;p._spin=0;p._symmetryMode='none';p._simId=1;
    const fx=w.pfxNorm(p._postFx);fx.pfxTrails=0;p._postFx=fx;
    return l;
  }
  // spec → layer, with the original's renderer (Pro solids use the original's 3D object layout).
  toLayer(w,s){
    const solid=SOLIDS.includes(s.layout),l=w.agAI.toLayer({...s,layout:solid?'object':s.layout});
    l.layout=s.layout;if(solid){l.params._objModel=s.layout;l.params.pObjRotate=Math.round(2+s.energy/10);}
    l.params._zoomLoud=false;
    if(isSim(s.layout))this.simify(w,l,s);
    return l;
  }
  wantN(kind,curN){
    if(this.layers!=='auto')return +this.layers;
    const r=Math.random();
    if(kind==='drop')return 3;if(kind==='build')return r<.5?3:2;if(kind==='calm')return r<.35?1:2;
    if(kind==='phrase'&&curN)return curN;
    return 2;
  }
  paletteFor(s,i){if(!i||s.colors.length<3)return s.colors.slice();const c=s.colors.slice(1);for(let n=i%c.length;n>0;n--)c.push(c.shift());return [s.colors[0],...c];}
  finish(l,s,i){
    l.spin=+(s.spinAmt*(i?.7:1)).toFixed(2)*(i===1?-this.dir:this.dir);
    l.speed=clamp(+((l.params._speed||1)*(this.vb&&this.vb.tempo!==1?this.vb.tempo:1)).toFixed(1),.1,5);
    if(isSim(l.layout))l.spin=0;
    // The original frames most layouts small in the middle; Pro's larger canvas wants them to fill it.
    else{const L=l.layout,[a,b]=SOLIDS.includes(L)||L==='tetrahedron'||L==='dna'?[150,185]:/^(circle|concentric|spiral|phyllotaxis|sacred|fractal|harmonic|sphere|lissajous)$/.test(L)?[125,160]:[100,120];
      l.params._zoom=Math.round(a+Math.random()*(b-a)+(i?15:0));}
    l.opacity=ROLE_OP[i]||50;return l;
  }
  makeLayer(w,kind,s,base,i,used){
    if(i===0&&!used.includes(base.layout))return this.finish(this.toLayer(w,s),s,0);
    let c=null;
    for(let k=0;k<8;k++){c=this.spec(w,kind,true);if(!used.includes(c.layout)&&(i===0||c.layout!=='growth')&&!(isSim(c.layout)&&used.some(isSim)))break;}
    if(isSim(c.layout)&&used.some(isSim)){for(let k=0;k<8&&isSim(c.layout);k++)c=this.spec(w,kind,true);if(isSim(c.layout))c.layout='circle';}
    c.colors=this.paletteFor(s,i);c.trails=s.trails;
    if(i>0){const fine=['straight','tapered','needles','dotted','pins'];
      if(!(this.match>=90&&this.vb?.shapes.length)&&!fine.includes(c.shape))c.shape=any(fine);
      c.density*=.45;c.thickness*=.4;c.glow*=.5;c.particles=false;c.symmetry='none';}
    c.spinAmt=s.spinAmt;
    return this.finish(this.toLayer(w,c),s,i);
  }
  // Everything: a base layer plus lighter supporting layers that share its palette. Regular changes swap one layer
  // (the rest glide to the new colours); drops, and growing the stack on a build-up, rebuild it in a ripple.
  // Returns roles: [{layer, fresh}] plus a stagger per role.
  stack(w,kind,cur){
    const s=this.spec(w,kind,false),base={layout:s.layout},n=this.wantN(kind,cur.length),out=[],used=[],stagger=[];
    const full=!cur.length||kind==='drop'||n>cur.length&&kind==='build';
    if(full){for(let i=0;i<n;i++){const l=this.makeLayer(w,kind,s,base,i,used);used.push(l.layout);out.push({layer:l,fresh:true});stagger.push(i*.18);}}
    else{
      const swap=this.slot++%n;
      for(let i=0;i<n;i++)if(i!==swap&&cur[i])used.push(cur[i].layout);
      for(let i=0;i<n;i++){
        const c=cur[i];
        if(i===swap||!c){const l=this.makeLayer(w,kind,s,base,i,used);used.push(l.layout);out.push({layer:l,fresh:true});}
        else out.push({layer:c,colors:this.paletteFor(s,i),fresh:false});
        stagger.push(i===swap?.15:0);
      }
    }
    if(out.length>1)for(const o of out)if(isSim(o.layer.layout)&&o.layer.params._sim)o.layer.params._sim={...o.layer.params._sim,q:'low'};
    return {roles:out,stagger,spec:s};
  }
  // Colours / Mood on your own layers: a palette per layer and (Mood) the new look's shape, spin and speed.
  restyle(w,kind,n){
    const s=this.spec(w,kind,false),l=this.toLayer(w,isSim(s.layout)?{...s,layout:'circle'}:s);
    return {colors:Array.from({length:Math.max(1,n)},(_,i)=>this.paletteFor(s,i)),params:l.params,spinAmt:s.spinAmt||.2,speed:clamp(+((l.params._speed||1)*(this.vb?.tempo||1)).toFixed(1),.1,5)};
  }
}
export function recolor(p,colors){
  const o={_toneStops:colors.slice(),_simpleStops:colors.slice(0,4),_solidColor:colors[Math.min(2,colors.length-1)]};
  if(p._colorMode!=='solid'&&p._colorMode!=='toneramp'&&p._colorMode!=='simpleramp')o._colorMode='toneramp';
  return o;
}

export const smoother=t=>t*t*t*(t*(t*6-15)+10);
