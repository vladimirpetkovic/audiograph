// Autopilot: turns a plain-language description into a node graph, and keeps it moving with the music.
// parse(text) reads the description; build(intent,options) makes project layers; Director follows the song's sections.
import {TYPES,MODES,PALETTES,node} from './graph.js';

// ---------- small helpers ----------
export function rng(seed=Date.now()){let s=(seed>>>0)||1;return ()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return ((s>>>0)%100000)/100000;};}
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const pick=(r,a)=>a[Math.floor(r()*a.length)%a.length];
const typeOf=mode=>mode==='simcloner'?'cloner':Object.keys(MODES).find(t=>MODES[t].some(m=>m[0]===mode));
const label=mode=>{for(const t of Object.keys(MODES))for(const [m,l] of MODES[t])if(m===mode)return l;return mode;};
function hex2hsl(h){const n=parseInt(h.slice(1,7),16),r=(n>>16&255)/255,g=(n>>8&255)/255,b=(n&255)/255,mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2;
  if(mx===mn)return [0,0,l*100];const d=mx-mn,s=l>.5?d/(2-mx-mn):d/(mx+mn);let hh=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4;return [hh*60,s*100,l*100];}
export function hsl2hex(h,s,l){h=((h%360)+360)%360;s=clamp(s,0,100)/100;l=clamp(l,0,100)/100;const k=n=>(n+h/30)%12,a=s*Math.min(l,1-l),f=n=>l-a*Math.max(-1,Math.min(k(n)-3,9-k(n),1));
  return '#'+[f(0),f(8),f(4)].map(x=>Math.round(x*255).toString(16).padStart(2,'0')).join('');}
const shade=(h,dl,ds=0)=>{const [H,S,L]=hex2hsl(h);return hsl2hex(H,S+ds,L+dl);};
export function mixHex(a,b,t){const p=x=>[1,3,5].map(i=>parseInt(x.slice(i,i+2),16)),A=p(a),B=p(b);return '#'+A.map((v,i)=>Math.round(v+(B[i]-v)*t).toString(16).padStart(2,'0')).join('');}

// ---------- vocabulary ----------
const COLORS={red:'#e5383b',crimson:'#c1121f',scarlet:'#ff2400',ruby:'#c0134f',orange:'#ff7b00',amber:'#ffb000',gold:'#ffc83d',golden:'#ffc83d',yellow:'#ffe600',
  lime:'#b6ff00',green:'#2ecc71',emerald:'#10b981',mint:'#7dffc4',olive:'#8a9a3b',teal:'#00a6a6',turquoise:'#30d5c8',cyan:'#00f0ff',aqua:'#33fff5',sky:'#7cc7ff',
  blue:'#2f6bff',azure:'#1e90ff',cobalt:'#0047ab',navy:'#0b1f5c',indigo:'#4b2bd1',violet:'#8f3cff',purple:'#9d4edd',magenta:'#ff00e5',fuchsia:'#ff2bd6',
  pink:'#ff5fa2','hot pink':'#ff1f8e',rose:'#ff4d6d',coral:'#ff6f59',peach:'#ffb38a',salmon:'#ff8c7a',lavender:'#b8a1ff',lilac:'#c8a2c8',maroon:'#6a040f',
  burgundy:'#800020',white:'#ffffff',silver:'#c9ced6',grey:'#8d99ae',gray:'#8d99ae',black:'#000000',brown:'#8b5a2b',copper:'#c8733a',bronze:'#cd7f32',
  ivory:'#fff8e7',cream:'#fff1c1',sand:'#e2c290',beige:'#e8d5b0',chartreuse:'#c6ff00',ice:'#d6f4ff',neon:'#39ff14'};
// Named looks: four stops, darkest first.
const THEMES=[
  [/sunset|dusk|golden hour/,'sunset',['#1a0b2e','#c2255c','#ff922b','#ffe066']],
  [/ocean|underwater|deep sea|\bsea\b|marine|aquatic|lagoon/,'ocean',['#001219','#005f73','#0a9396','#94d2bd']],
  [/forest|jungle|nature|woods|leaf|leaves|moss/,'forest',['#081c15','#1b4332','#52b788','#d8f3dc']],
  [/fire|flame|lava|inferno|volcan|magma|burning|blaze/,'fire',['#03071e','#9d0208','#e85d04','#ffba08']],
  [/\bice\b|icy|arctic|frozen|frost|winter|glacier|snow/,'ice',['#03045e','#0077b6','#90e0ef','#ffffff']],
  [/cyberpunk|neon city|blade runner/,'cyberpunk',['#0d0221','#ff00e5','#00f0ff','#f9f871']],
  [/vaporwave|synthwave|retrowave|outrun|\b80s\b|miami/,'synthwave',['#120458','#ff2bd6','#7a04eb','#00e5ff']],
  [/pastel|candy|soft colou?rs|cotton candy/,'pastel',['#2b2d42','#ffafcc','#bde0fe','#fdffb6']],
  [/monochrome|black and white|grayscale|greyscale|\bmono\b|noir/,'mono',['#000000','#444444','#aaaaaa','#ffffff']],
  [/luxury|royal|gold and black|elegant/,'luxury',['#0a0a0a','#3d2c00','#c9a227','#fff3b0']],
  [/space|cosmic|galax|nebula|universe|stars|astral/,'cosmic',['#03001c','#3c096c','#c77dff','#e0f4ff']],
  [/aurora|northern lights/,'aurora',['#020b1a','#0b6e4f','#21d19f','#c792ea']],
  [/desert|dune|sahara/,'desert',['#2b1a0e','#9c6644','#e6b17e','#fff1d6']],
  [/toxic|acid|radioactive|slime/,'toxic',['#0a0f00','#2b9348','#aacc00','#eeff41']],
  [/blood|horror|sinister|evil|demonic/,'blood',['#000000','#3d0000','#950101','#ff0000']],
  [/rainbow|prism|spectral|pride/,'rainbow',['#1a0033','#ff006e','#ffbe0b','#3a86ff']],
  [/matrix|hacker|terminal|code rain/,'matrix',['#000000','#003b00','#00ff41','#d1ffd6']],
  [/tropical|tropic|summer|beach|paradise/,'tropic',['#001b2e','#00b4d8','#ffd166','#ef476f']],
  [/autumn|fall leaves|harvest/,'autumn',['#1b0e04','#9a3412','#ea580c','#facc15']],
  [/spring|bloom(ing)? flowers|cherry blossom|sakura/,'spring',['#1f1d2b','#f9a8d4','#bbf7d0','#fef9c3']],
  [/electric|lightning|plasma/,'electric',['#00010d','#3a0ca3','#4cc9f0','#ffffff']],
  [/earth|earthy|natural tones|clay/,'earth',['#1c1917','#78350f','#a3a380','#f5f5dc']]
];
const VISUALS=[
  [/\bfluid|liquid(?! metal)|\bink\b|paint|marbl|\bdye\b|water(?!fall)|watercolou?r|honey|syrup/,'simfluid'],
  [/smoke|smoky|\bfog|mist|steam|incense|vapou?r|haze|\bclouds?\b|plume|wisp/,'simsmoke'],
  [/firework|embers?|sparks? fountain|stardust|confetti|fountain|particle (field|system|storm)|particles?\b(?! overlay)/,'simparticles'],
  [/flock|boids?|swarm|murmuration|\bbirds?\b|school of fish|\bfish\b|insects|fireflies/,'simparticles'],
  [/\bsand\b|granular|hourglass|\bdust\b|powder/,'simsand'],
  [/ferro|liquid metal|mercury|magnetic (fluid|liquid)|chrome blob|oil slick|metallic blob/,'simfluid'],
  [/clon(e|er)|\bcubes\b|blocks|voxels?|array of|grid of (cubes|boxes|spheres)|instances/,'simcloner'],
  [/terrain|landscape|mountains?|hills|valley|\bfloor\b|\bground\b/,'terrain'],
  [/sphere|globe|planet|\borbs?\b|\bball\b/,'sphere'],
  [/tetrahedr|pyramid|crystal|prism shape/,'tetrahedron'],
  [/\bdna\b|helix|double helix|genetic/,'dna'],
  [/torus knot|\bknots?\b|tangle/,'knot'],
  [/\bcube\b|\bbox\b/,'cube'],
  [/torus|donut|doughnut/,'torus'],
  [/spiral|galaxy|whirl|vortex|hypnotic swirl/,'spiral'],
  [/phyllotaxis|sunflower|seeds?|flower|petals?|mandala|floral|dahlia|lotus/,'phyllotaxis'],
  [/concentric|ripples|rings|target|tunnel|portal|wormhole/,'concentric'],
  [/fractal|tree|branch(es|ing)?/,'fractal'],
  [/growth|vines?|coral|organic|roots?|tendrils?|mycel/,'growth'],
  [/sacred|metatron|flower of life|seed of life|geometry/,'sacred'],
  [/graph|network|neural|synapse|connections|web\b|constellations?|nodes/,'graph'],
  [/lissajous|harmonograph|loops?|figure.?eight|orbits?|spirograph/,'lissajous'],
  [/scatter|starfield|\bstars\b|\bdots\b|points|bokeh|snowflakes|\brain\b/,'scatter'],
  [/sine|waveforms?|\bwaves?\b|oscillat|\bsea\b|ocean|river|tides?/,'sine'],
  [/\bcircle|\bring\b|\bround\b|halo|circular|\bsun\b|eclipse/,'circle'],
  [/\bbars\b|equali[sz]er|spectrum|meters?|audio bars|linear|straight lines?|scan ?lines? of sound/,'linear']
];
// Prefer a simulation when one of these words describes the main visual.
const SIM_MODES=['simparticles','simfluid','simsmoke','simsand','simcloner'];
const MOOD=[
  [/calm|chill|ambient|gentle|soft|serene|peaceful|dreamy|meditat|lazy|relax|zen|floating|tranquil|quiet|lullaby|sleepy|smooth/,25,.6],
  [/groov|funky|bouncy|playful|happy|upbeat|dance/,60,1.05],
  [/intense|aggressive|energetic|\bhard\b|heavy bass|\brave\b|techno|frantic|wild|chaotic|explosive|hyper|crazy|insane|epic|massive|banger|drum ?(and|n|&) ?bass|dnb|dubstep|heavy metal|\bpunk|violent/,88,1.4]
];
const TEMPO=[[/\bslow(ly)?\b|languid|lazy|glacial/,.55],[/\bfast\b|quick|rapid|speedy|hectic|racing/,1.5]];
const DEFORM=[
  ['twist',/twist(ed|ing|y)?/,{amount:45}],['bulge',/bulg|inflat|swell|fisheye|bubbl/,{amount:45}],['wave',/wavy|wobbl|undulat|ripply|wiggl|\bsway/,{amount:40,speed:5}],
  ['shear',/shear|slant|skew|italic|lean/,{amount:30}],['depth',/\bdepth\b|deep 3d|extrud/,{amount:80}],['ripple',/rippl(e|ing)|shockwave/,{amount:40}],
  ['jitter',/jitter|shaky|shaking|nervous|vibrat|trembl|buzz/,{amount:35}],['disorder',/messy|disorder|scattered|broken up|fragmented|scrambl/,{amount:45}],
  ['turbulence',/turbulen|storm(y)?|tempest|rough/,{amount:55,scale:60,smoke:40}],['flowField',/flowing|\bflow\b|drift(ing)?|perlin|curl noise|meander/,{perlin:45,curl:25,scale:30,speed:20}]
];
const FORCES=[
  ['gravity',/falling|\brain(ing)?\b|dripping|drip|cascad|waterfall|heavy|sinking/,{gravity:45,sand:100,buoyancy:60}],
  ['gravity',/rising|floating up|ascend|buoyant|upward|lift(ing)? off|levitat/,{gravity:-30,sand:40,buoyancy:180}],
  ['swirl',/swirl|vortex|whirlpool|tornado|twister|cyclone|spinning|maelstrom/,{swirl:65,fluidSwirl:60,spin:40,fluidSpin:40,smokeSpin:40}],
  ['wind',/wind|breeze|blowing|gust|windy/,{smoke:55,sand:45}],
  ['attract',/attract|magnet|pulled in|black hole|implod|gravitational|converg/,{pull:65}],
  ['attract',/repel|explod|explosion|burst(ing)? out|push(ed)? away|diverg|supernova/,{pull:-65}],
  ['drag',/viscous|honey|syrup|thick liquid|slow motion|molasses|gooey/,{drag:100,viscosity:70,friction:60}],
  ['vorticity',/curly|curls|eddies|eddy|turbulent|chaotic swirl/,{fluid:85,smoke:85}],
];
const LINE_SHAPES=[[/dotted|dots? line|polka/,'dotted'],[/dashed|dashes/,'dashed'],[/\bpins?\b|needles?/,'pins'],[/tapered|brush|calligraph|ink stroke/,'tapered'],
  [/rounded|soft lines|pill/,'rounded'],[/\bcaps\b/,'caps'],[/cross(es)?\b|plus signs/,'cross'],[/numbers|digits|numeric/,'numbers'],[/symbols|glyphs|runes|ascii/,'symbols'],
  [/\bwords\b|letters|typograph|text art/,'words'],[/matrix rain|code rain|cascade|falling code/,'cascade']];
const SYM=[[/kaleido|mandala|six.?fold|hexagonal|snowflake/,'r6'],[/eight.?fold|octagon|8.?fold/,'r8'],[/four.?fold|4.?fold|quad|cross symmetry/,'r4'],
  [/three.?fold|triangular|trinity|3.?fold/,'r3'],[/mirror(ed)?|symmetr|reflected|rorschach|butterfly/,'x']];
const EXAMPLES=['slow dreamy blue and gold smoke with soft glow','intense red fluid, swirling, sparks on the beat, glitchy','cyberpunk neon spiral, kaleidoscope, thin lines, fast spin',
  'calm ocean waves with long trails and film grain','sunset sphere over a starfield, pulsing with the bass','pink particle swarm rising, dreamy blur, 90 bpm',
  'black and white sacred geometry, mirrored, high contrast','toxic green liquid metal pulled into a black hole'];
export {EXAMPLES};

// ---------- prompt writer ----------
// Writes a new description in words parse() understands, matched to the energy of the music (0–100).
// `keep` (0–1) reuses the subject of the previous prompt so a song's looks feel related.
const W_MOOD=[['slow dreamy','calm','gentle floating','serene','soft ambient'],['groovy','playful','bouncy','upbeat','funky'],['intense','explosive','wild','energetic','chaotic']];
const W_SUBJECT=[['smoke','ink fluid','fireflies','liquid metal','sand','mandala','sacred geometry','waves','starfield','lissajous loops','rings','sphere','dna helix'],
  ['particles','fluid','spiral','rings','flower','neural network','fractal tree','terrain','knot','torus','birds','vines','circle'],
  ['particles','fluid','spiral','smoke','liquid metal','spectrum bars','tunnel','sphere','cube','knot','fireworks','swarm','sacred geometry']];
const W_COLOR=['sunset','ocean','aurora','cyberpunk','synthwave','ice','fire','toxic','cosmic','luxury','pastel','tropical','forest','desert','electric','monochrome',
  'blue and gold','pink and teal','violet and lime','red and black','orange and cyan','magenta and ice','emerald and gold','white and silver'];
const W_EXTRA=[['with soft glow','with long trails','drifting','rising','mirrored','slowly rotating','pulsing with the bass','with film grain','blur'],
  ['swirling','with trails','pulsing with the bass','kaleidoscope','wavy','rotating','sparks on the beat','glow'],
  ['swirling','glitchy','sparks on the beat','kaleidoscope','shockwave','fast spin','pulsing with the bass','shattered','strong glow','turbulent']];
export function write({energy=50,seed=Date.now(),prev='',keep=0}={}){
  const r=rng(seed),band=energy<40?0:energy<70?1:2;
  const old=W_SUBJECT.flat().find(w=>new RegExp('\\b'+w+'\\b').test(prev));
  const subject=old&&r()<keep?old:pick(r,W_SUBJECT[band]);
  const extras=[...W_EXTRA[band]].sort(()=>r()-.5).slice(0,1+(r()<.6?1:0));
  return `${pick(r,W_MOOD[band])} ${pick(r,W_COLOR)} ${subject}, ${extras.join(', ')}`;
}

// ---------- parse ----------
export function parse(text){
  const raw=String(text||'').slice(0,600);let t=' '+raw.toLowerCase().replace(/[“”]/g,'"')+' ';
  const read=[];const add=(kind,text)=>{if(!read.some(r=>r.kind===kind&&r.text===text))read.push({kind,text});};
  const it={raw,visuals:[],colors:null,theme:null,energy:null,tempo:1,bpm:0,dark:false,bright:false,symmetry:null,lineShape:null,spin:null,thick:null,density:null,scale:null,
    tilt:null,outline:false,deformers:[],forces:[],fx:{},react:[],intensity:null,text:null,sparkles:false,background:null,data:[],no:new Set(),layers:null};
  // Quoted words become a Text input.
  const q=raw.match(/["“']([^"”']{1,60})["”']/);if(q){it.text=q[1];t=t.replace(q[0].toLowerCase(),' ');add('Visual',`Text “${q[1]}”`);}
  // Negations: "no glow", "without trails", "not spinning".
  t=t.replace(/\b(no|without|not|zero|never|minus|less)\s+(?:any\s+|the\s+)?([a-z-]+)/g,(m,_n,w)=>{it.no.add(w);add('Off','no '+w);return ' ';});
  const has=re=>re.test(t),neg=re=>[...it.no].some(w=>re.test(' '+w+' '));
  // Visuals in the order they are mentioned, per clause so colours can follow them.
  const clauses=t.split(/,|;|\band\b|\bwith\b|\bover\b|\bon top of\b|\bplus\b|\bbehind\b|\bunder\b|\binside\b|\baround\b/);
  const found=[];
  for(const c of clauses){
    const hits=[];for(const [re,mode] of VISUALS){const m=c.match(re);if(m)hits.push([m.index,mode]);}
    hits.sort((a,b)=>a[0]-b[0]);
    // "fluid" vs "sine waves": one visual per clause unless two are clearly named.
    const modes=[...new Set(hits.map(h=>h[1]))].slice(0,2);
    const cols=colorWords(c);
    for(const mode of modes)if(!found.some(f=>f.mode===mode))found.push({mode,colors:modes.length===1&&cols.length?cols:null});
  }
  // A force word ("swirl", "vortex") is not a separate visual when a simulation is already named.
  let vis=found;if(vis.some(v=>SIM_MODES.includes(v.mode)))vis=vis.filter(v=>!(v.mode==='spiral'&&/swirl|vortex|whirl/.test(t)&&!/spiral|galaxy/.test(t)));
  if(vis.some(v=>v.mode==='scatter')&&vis.length>1&&/\bstars\b|starfield/.test(t))vis=[...vis.filter(v=>v.mode!=='scatter'),vis.find(v=>v.mode==='scatter')];
  // Only one of each simulation; at most three visuals.
  // Colours named inside a clause belong to that visual only when there are several visuals.
  if(vis.length<2)vis=vis.map(v=>({...v,colors:null}));
  it.visuals=vis.slice(0,3).map(v=>({...v,type:typeOf(v.mode)})).filter(v=>v.type);
  for(const v of it.visuals)add('Visual',label(v.mode)+(v.colors?` (${v.colors.join(' + ')})`:''));
  const n=t.match(/\b(one|two|three|1|2|3) layers?\b/);if(n)it.layers={one:1,two:2,three:3}[n[1]]||+n[1];
  // Colours: a theme, named colours, hex codes.
  for(const [re,name,stops] of THEMES)if(has(re)){it.theme=name;it.colors=stops.slice();add('Colour',name+' palette');break;}
  for(const name of Object.keys(PALETTES))if(new RegExp('\\b'+name.toLowerCase()+'\\b').test(t)&&!it.theme){it.theme=name;it.colors=PALETTES[name].slice(0,4);add('Colour',name+' palette');}
  const words=colorWords(t);
  if(words.length&&(!it.theme||words.length>1)&&!(it.visuals.length>1&&it.visuals.every(v=>v.colors))){it.colors=rampFrom(words.map(w=>COLORS[w]||w));add('Colour',words.join(' + '));}
  const bg=t.match(/\bon (?:a |an )?(black|white|dark|light|navy|deep blue|purple|red)\b(?: background)?/);if(bg){it.background={black:'#000000',white:'#f4f4f4',dark:'#06060a',light:'#e8e8ee',navy:'#0b1f5c','deep blue':'#03045e',purple:'#1a0033',red:'#3d0000'}[bg[1]];add('Colour','on '+bg[1]);}
  // Mood, energy and tempo.
  for(const [re,e,tempo] of MOOD)if(has(re)){it.energy=e;it.tempo=tempo;add('Mood',e<40?'calm':e>70?'intense':'groovy');break;}
  for(const [re,tm] of TEMPO)if(has(re)){it.tempo=tm;add('Motion',tm<1?'slow':'fast');break;}
  const bpm=t.match(/(\d{2,3})\s*bpm/);if(bpm){it.bpm=clamp(+bpm[1],40,220);it.tempo=clamp(it.bpm/120,.45,1.7);if(it.energy===null)it.energy=clamp(Math.round(it.bpm/1.6),20,95);add('Motion',it.bpm+' bpm');}
  if(has(/\bdark|moody|night|gloom|shadow|ominous|brooding|eerie/)){it.dark=true;add('Mood','dark');}
  if(has(/\bbright|vivid|vibrant|colou?rful|joyful|sunny|cheerful|saturated/)){it.bright=true;add('Mood','bright');}
  // Style.
  if(has(/\bthin|fine|delicate|hairline|wire(frame)?|subtle lines|skinny/)){it.thick=.6;add('Style','thin lines');}
  else if(has(/\bthick|bold|chunky|\bfat\b|heavy lines|wide lines/)){it.thick=6;add('Style','thick lines');}
  if(has(/\bsparse|minimal|minimalist|\bfew\b|simple|clean|empty/)){it.density=150;add('Style','sparse');}
  else if(has(/\bdense|busy|lots of|\bmany\b|packed|detailed|intricate|complex|crowded/)){it.density=650;add('Style','dense');}
  if(has(/\btiny|\bsmall|little|miniature/)){it.scale=70;add('Style','small');}
  else if(has(/\bhuge|giant|massive|enormous|fill(s|ing)? the screen|full ?screen|\bbig\b|large/)){it.scale=190;add('Style','big');}
  for(const [re,s] of LINE_SHAPES)if(has(re)&&!neg(re)){it.lineShape=s;add('Style',s+' lines');break;}
  if(has(/outlined?|neon tubes?|double lines?|echo(ed)? lines|contour/)&&!neg(/outline/)){it.outline=true;add('Style','outline');}
  for(const [re,s] of SYM)if(has(re)&&!neg(/symmetr|mirror|kaleido/)){it.symmetry=s;add('Style',s==='x'?'mirrored':s.slice(1)+'-fold symmetry');break;}
  if(has(/perspective|tilted|from above|isometric|bird'?s.?eye|3d view/)){it.tilt=55;add('Style','tilted');}
  // Motion.
  if(neg(/spin|rotat|turn|mov/)||has(/\bstill\b|static|frozen|motionless/)){it.spin=0;add('Motion','still');}
  else if(has(/spin|rotat|turning|revolv|orbiting|whirling|twirl/)){const r=has(/counter|anti.?clock|reverse|backwards/)?-1:1;it.spin=r*(has(/fast spin|spinning fast|rapid/)?2.6:has(/slow(ly)? spin|gentle spin|slowly rotat/)?.4:1.1);add('Motion',(r<0?'reverse ':'')+'spin');}
  if(has(/pulsing|pulses|\bpulse|throb|breath(ing|es)?|heartbeat|pumping/))it.react.push('pulse');
  // Shape deformers and simulation forces.
  for(const [type,re,props] of DEFORM)if(has(re)&&!neg(re)&&!it.deformers.some(d=>d.type===type)){it.deformers.push({type,props});add('Deform',TYPES[type].label);}
  for(const [type,re,props] of FORCES)if(has(re)&&!neg(re)&&!it.forces.some(f=>f.type===type)){it.forces.push({type,props});add('Force',TYPES[type].label+(type==='gravity'&&props.gravity<0?' (up)':type==='attract'&&props.pull<0?' (repel)':''));}
  // Post FX.
  const fx=(k,re,v,name)=>{if(has(re)&&!neg(re)){it.fx[k]=v;add('FX',name);}};
  fx('bloom',/glow|bloom|luminous|neon|radiant|shin(y|ing)|lumin|light ?show|gleam|halo light/,{bloom:60},'glow');
  fx('trails',/trails?\b|motion blur|streak|smear|long exposure|ghost(ing|ly)?|after.?image|persistence/,{trails:72},'trails');
  fx('feedback',/infinite|feedback|droste|endless zoom|tunnel effect|hypnotic|recursive/,{decay:.88,zoom:1.04,rotate:1.5},'feedback tunnel');
  fx('blur',/soft focus|blurr?y|out of focus|hazy|defocus|dreamy blur/,{x:18,y:0},'soft blur');
  fx('kaleido',/kaleidoscop/,{kaleido:70},'kaleidoscope');
  fx('fracture',/shatter|fracture|broken glass|broken mirror|mosaic|shards|glitch/,{mode:/glitch/.test(t)?'flow':'shatter'},/glitch/.test(t)?'glitch':'shatter');
  const lens={};if(has(/chromatic|rgb split|aberration|prismatic|glitch/))lens.chroma=60;if(has(/vignette|cinematic|\bfilm\b|movie/))lens.vignette=65;
  if(has(/grain|grainy|\bfilm\b|analog|vintage|retro|vhs|lo.?fi|old tv/))lens.grain=55;if(has(/scanlines?|\bcrt\b|vhs|arcade|old tv|retro tv/))lens.scanlines=55;
  if(Object.keys(lens).length&&!neg(/lens|grain|film|vignette/)){it.fx.lens=lens;add('FX',Object.keys(lens).join(' + '));}
  const grade={};if(has(/desaturat|washed out|muted|faded|pale/))grade.saturation=-45;else if(it.bright)grade.saturation=60;
  if(has(/high contrast|harsh|stark|crisp|punchy/))grade.contrast=55;if(has(/inverted|negative|invert/))grade.invert=100;
  if(Object.keys(grade).length){it.fx.grade=grade;add('FX','colour grade');}
  if(has(/rainbow|shifting colou?rs|colou?r.?cycl|psychedel|trippy|iridescen|holograph|chameleon|lsd/)&&!neg(/colou?r/)){it.fx.hue={hue:0,cycle:35};add('Colour','colour cycle');}
  if(has(/sparks|sparkl|glitter|twinkl|confetti|fairy dust/)&&!it.visuals.some(v=>v.mode==='simparticles')){it.sparkles=true;add('Visual','sparkles');}
  // Sound reactions.
  if(has(/very reactive|super reactive|ultra reactive|really reactive|responsive|reacts? hard|punchy|hits hard|slam/)){it.intensity=170;add('Sound','very reactive');}
  else if(has(/subtle|barely|gentle reaction|light reaction|lightly/)){it.intensity=55;add('Sound','subtle');}
  if(has(/(on|with|to) the (beat|kick|drums?)|beat.?(driven|synced|reactive)|strob|flash(es|ing)?/))it.react.push('beat');
  if(has(/(on|with|to) the bass|bass.?(driven|heavy|reactive)|sub.?bass|low end|808/))it.react.push('bass');
  if(has(/hi.?hats?|treble|highs|cymbals|shimmer/))it.react.push('high');
  for(const r of new Set(it.react))add('Sound',{pulse:'pulses',beat:'hits on the beat',bass:'follows the bass',high:'shimmers on highs'}[r]);
  it.react=[...new Set(it.react)];
  // Other inputs.
  if(has(/\bcpu|computer load|my (computer|machine)|processor/)){it.data.push('computer');add('Input','computer activity');}
  if(has(/mouse|cursor|pointer|follows? me/)){it.data.push('pointer');add('Input','mouse');}
  const LIVE=[['iss',/\biss\b|space station|orbit/,'the ISS'],['space',/space weather|solar wind|aurora|geomagnetic|sun ?storm/,'space weather'],['ocean',/ocean|\bsea\b|swell|tide|surf/,'the ocean'],
    ['weather',/weather|\bwind\b|rain|storm|temperature/,'the weather'],['quakes',/earthquake|quake|seismic|tectonic/,'earthquakes'],['wiki',/wikipedia|wiki edits|edits/,'Wikipedia edits']];
  for(const [src,re,label] of LIVE)if(has(re)&&!it.live){it.live=src;add('Input','live data: '+label);}
  if(has(/webcam|camera|my face|see me|mirror me/)&&!it.visuals.length){it.visuals.push({mode:'simparticles',type:'gpuParticles',camera:true,colors:null});add('Visual','Camera');}
  if(has(/\bcpu|computer load|processor/)&&has(/\bdata\b/)){/* already handled */}
  it.read=read;return it;
}
function colorWords(t){
  const out=[];const re=/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|hot pink|[a-z]+/g;let m;
  while((m=re.exec(t))){let w=m[0];if(w.startsWith('#')){if(w.length===4)w='#'+[...w.slice(1)].map(c=>c+c).join('');out.push(w);continue;}
    if(COLORS[w]&&!(w==='neon'&&/neon (\w+)/.test(t))&&!(w==='sand'&&/\bsand\b/.test(t)&&!/sand colou?r/.test(t))&&!(w==='ice'&&/\bice\b/.test(t))&&!(w==='gold'&&/gold and black/.test(t)&&false))out.push(w);}
  return [...new Set(out)].filter(w=>w!=='black'||out.length===1||/black (and|&)/.test(t)).slice(0,4);
}
// A tone ramp from named colours: darkest stop first.
export function rampFrom(cs){
  cs=cs.filter(Boolean);if(!cs.length)return null;
  const byL=[...cs].sort((a,b)=>hex2hsl(a)[2]-hex2hsl(b)[2]);
  if(cs.length===1)return ['#000000',shade(cs[0],-28),cs[0],shade(cs[0],25)];
  if(cs.length===2)return [shade(byL[0],-35),byL[0],byL[1],shade(byL[1],18)];
  if(cs.length===3)return [shade(byL[0],-38),...byL];
  return byL.slice(0,4);
}
function moodPalette(r,energy,dark){
  // No colours named: a harmonious ramp from a random hue (warmer and more saturated when intense).
  const h=r()*360,sat=energy>70?85:energy<35?55:70,spread=energy>70?120:60;
  return [hsl2hex(h-20,sat,dark?4:10),hsl2hex(h,sat,dark?30:42),hsl2hex(h+spread*.5,sat+5,dark?50:60),hsl2hex(h+spread,sat+10,dark?70:82)];
}
export function describe(it){return it.read;}
// A fresh palette for a live colour change. Named colours stay recognisable (small hue/brightness drift);
// otherwise a new mood ramp for the section's energy.
export function paletteFor(it,{seed=Date.now(),energy=50,index=0}={}){
  const r=rng(seed+index*7919);
  if(!it.colors)return moodPalette(r,energy,it.dark);
  const drift=(r()-.5)*(it.theme?80:30),lift=energy>70?12:energy<35?-12:0;
  let c=it.colors.map((h,k)=>{const [H,S,L]=hex2hsl(h);return hsl2hex(H+drift,S+(energy>70?10:energy<35?-10:0),L+(k?lift:0));});
  const t=c.slice(1),n=index+1+Math.floor(r()*2);for(let k=0;k<n;k++)t.push(t.shift());c=[c[0],...t];
  return c;
}

// ---------- build ----------
// Default looks per visual so every description starts from something that reads well.
const LOOK={
  circle:{height:110,thick:2},concentric:{thick:1.6,height:90},spiral:{thick:1.4},phyllotaxis:{thick:2.4,height:120},fractal:{thick:1.2},growth:{thick:1.4},
  sacred:{thick:1.2},graph:{thick:1},lissajous:{thick:1.6},scatter:{thick:2.5},sine:{thick:1.6,height:100},linear:{thick:2,height:110},
  terrain:{tilt:40,thick:1},sphere:{thick:1.2},tetrahedron:{thick:1.4},dna:{thick:1.6},knot:{thick:1.4},cube:{thick:1.4},torus:{thick:1.2}
};
export function build(it,{seed=Date.now(),energy:forced=null,match=85}={}){
  const r=rng(seed),E=forced??it.energy??(40+r()*30),explore=1-match/100;
  let visuals=it.visuals.slice();
  if(!visuals.length&&!it.text){
    const calm=['phyllotaxis','spiral','simsmoke','sphere','lissajous','growth','concentric','simfluid','sacred','terrain'],hot=['simparticles','circle','concentric','simfluid','spiral','dna','tetrahedron','scatter','sacred'];
    const m=pick(r,E>60?hot:calm);visuals=[{mode:m,type:typeOf(m),colors:null}];
    if(explore>.3&&r()<explore*.6){const m2=pick(r,E>60?hot:calm);if(m2!==m&&!(SIM_MODES.includes(m)&&SIM_MODES.includes(m2)))visuals.push({mode:m2,type:typeOf(m2),colors:null});}
  }
  if(it.text)visuals.unshift({mode:'text',type:'text',colors:null});
  const want=clamp(it.layers||visuals.length,1,3);visuals=visuals.slice(0,want);
  while(visuals.length<want){const m=pick(r,['scatter','concentric','spiral','circle','lissajous']);if(!visuals.some(v=>v.mode===m))visuals.push({mode:m,type:typeOf(m),colors:null});}
  const base=it.colors||moodPalette(r,E,it.dark);
  const layers=visuals.map((v,i)=>layerFor(it,v,i,{r,E,base,explore,count:visuals.length}));
  return layers;
}
function layerFor(it,v,i,{r,E,base,explore,count}){
  const g={id:crypto.randomUUID(),name:v.type==='text'?'Text':label(v.mode),visible:true,opacity:i?.85:1,blend:i?'screen':'source-over',nodes:[],edges:[]};
  let x=40;const Y=80;
  const add=(type,props={},y=Y)=>{const n=node(type,x,y,props);g.nodes.push(n);if(y===Y)x+=215;return n;};
  const wire=(a,out,b,input)=>g.edges.push({from:a.id,out,to:b.id,input});
  const chainTo=(prev,n)=>{const out=Object.keys(TYPES[prev.type].outputs)[0],inp=Object.keys(TYPES[n.type].inputs)[0];wire(prev,out,n,inp);return n;};
  const sound=add('audioIn',{});
  const sim=SIM_MODES.includes(v.mode),props={};
  if(v.type==='text'){props.text=it.text;props.scale=it.scale??130;props.thick=it.thick??1.5;}
  else if(!['gpuParticles','cloner'].includes(v.type)){props.mode=v.mode;Object.assign(props,LOOK[v.mode]||{});}
  if(v.type==='gpuParticles')props.mode=v.mode;
  const mo={},T=TYPES[v.type].props,set=(k,val)=>{if(T[k]&&val!=null){const s=T[k];props[k]=s.kind==='number'?clamp(val,s.min,s.max):val;}};
  if(!sim){
    set('thick',it.thick!=null?it.thick:(props.thick??1.5)*(E>70?1.4:E<35?.8:1));
    set('density',it.density??(v.mode==='scatter'||v.mode==='graph'?undefined:Math.round(260+E*2.4)));
    set('height',(props.height??80)*(E>70?1.25:E<35?.85:1));
    set('scale',it.scale??(i?110+r()*40:undefined));
    if(it.symmetry&&!['terrain','linear'].includes(v.mode))mo.symmetry=it.symmetry;
    else if(!i&&explore>.25&&E>75&&r()<.35&&!['terrain','linear','sine'].includes(v.mode))mo.symmetry=pick(r,['r4','r6','xy']);
    if(it.lineShape&&T.lineShape)set('lineShape',it.lineShape);else if(i&&T.lineShape)set('lineShape',pick(r,['straight','tapered','dotted','pins']));
    if(it.outline&&T.outline)set('outline',true);
    if(it.tilt!=null)set('tilt',it.tilt);
    const spin=it.spin!=null?it.spin:(r()<.35?0:(E>60?.3+r()*.6:.1+r()*.35)*(r()<.5?-1:1))*it.tempo;mo.spin=clamp(+spin.toFixed(2),-5,5);
    mo.speed=clamp(it.tempo,.1,5);
    if(it.react.includes('pulse'))set('pulse',true);
  }else{
    set('scale',it.scale);
    // Copies of a field simulation (smoke, fluid, sand) add up to white; only point-like ones repeat.
    if(it.symmetry&&it.symmetry!=='x'&&['simparticles','simcloner'].includes(v.mode))mo.symmetry=it.symmetry;
    if(it.spin)mo.spin=clamp(it.spin*.5,-5,5);
  }
  const reactive=it.intensity??Math.round(70+E*.8);set('intensity',i?reactive*.8:reactive);
  if(T.punch)set('punch',Math.round(40+E*.6));if(T.release)set('release',Math.round(380-E*2.4));
  if(i&&!sim){set('thick',(props.thick||1.5)*.6);set('density',(props.density||350)*.6);}
  const vis=add(v.type,props);wire(sound,'audio',vis,'audio');
  // The camera picture is where the particles spawn.
  if(v.camera)wire(add('camera',{},Y+170),'image',vis,'emit');
  let prev=vis;
  // The Cloner copies a primitive and a Sound effector makes the clones move.
  if(v.type==='cloner'){wire(add('waveform3d',{mode:pick(r,['cube','sphere','ico','torus','cylinder']),render:'normal'},Y+170),'object',vis,'object');prev=chainTo(prev,add('soundEffector',{}));}
  // Symmetry (deformer) and Spin (force) follow the visual as their own nodes.
  if(mo.symmetry)prev=chainTo(prev,add('symmetry',{mode:mo.symmetry,gap:0}));
  const spinN=mo.spin!=null&&(mo.spin||(mo.speed??1)!==1||it.data.includes('computer'))?add('spin',{spin:mo.spin,speed:mo.speed??1}):null;if(spinN)prev=chainTo(prev,spinN);
  // Deformers bend the shape; forces push simulations.
  for(const d of it.deformers){if(sim&&!['turbulence','jitter','disorder','flowField'].includes(d.type))continue;prev=chainTo(prev,add(d.type,d.props));}
  if(sim)for(const f of it.forces){const keys=Object.keys(f.props).filter(k=>TYPES[f.type].props[k]?.sims?.includes(v.mode)||!TYPES[f.type].props[k]?.sims);if(!keys.some(k=>TYPES[f.type].props[k]?.sims?.includes(v.mode)))continue;prev=chainTo(prev,add(f.type,f.props));}
  if(it.sparkles&&!i&&!sim)prev=chainTo(prev,add('particles',{shape:pick(r,['spark','star','circle']),density:22,trail:15}));
  // Colours: this visual's own colours, else the shared palette (rotated for supporting layers).
  let stops=v.colors?rampFrom(v.colors.map(w=>COLORS[w]||w)):base.slice();
  if(i&&!v.colors&&stops.length>3){const c=stops.slice(1);for(let k=0;k<i;k++)c.push(c.shift());stops=[stops[0],...c];}
  if(it.dark)stops=stops.map((c,k)=>shade(c,k?-12:-6));
  prev=chainTo(prev,add('palette',{c1:stops[0],c2:stops[1],c3:stops[2],c4:stops[3]||stops[2]}));
  if(it.fx.hue)prev=chainTo(prev,add('hue',it.fx.hue));
  // Image effects (the main layer carries the heavy ones).
  const img=[];
  if(!i&&it.fx.kaleido)img.push(['kaleido',it.fx.kaleido]);
  if(!i&&it.fx.fracture)img.push(['fracture',it.fx.fracture]);
  if(it.fx.feedback&&!i)img.push(['feedback',it.fx.feedback]);
  if(it.fx.trails)img.push(['trails',it.fx.trails]);
  if(it.fx.blur&&!i)img.push(['blur',it.fx.blur]);
  const glow=it.fx.bloom?it.fx.bloom.bloom:(it.no.has('glow')||it.no.has('bloom')?0:(sim?35:45)+E*.15);
  if(glow>0)img.push(['bloom',{bloom:Math.round(clamp(i?glow*.6:glow,0,100))}]);
  if(it.fx.grade&&!i)img.push(['grade',it.fx.grade]);
  if(it.fx.lens&&!i)img.push(['lens',it.fx.lens]);
  for(const [type,p] of img)prev=chainTo(prev,add(type,p));
  if(it.background&&!i){
    const bgN=add('background',{fill:'flat',c1:it.background,c2:it.background},Y+210),m=add('merge',{mode:'source-over'});
    wire(bgN,'image',m,'a');wire(prev,Object.keys(TYPES[prev.type].outputs)[0],m,'b');prev=m;
  }
  const out=add('output');chainTo(prev,out);
  // Sound and data reactions: wire numbers into knobs.
  let dy=Y+230;const drive=(srcNode,outKey,target,input,via)=>{
    if(!target||!TYPES[target.type].props[input])return;
    let from=srcNode,out=outKey;if(via){const s=node(via[0],srcNode.x+215,dy,via[1]);g.nodes.push(s);wire(srcNode,outKey,s,Object.keys(TYPES[via[0]].inputs)[0]);from=s;out='value';}
    if(g.edges.some(e=>e.to===target.id&&e.input===input))return;wire(from,out,target,input);dy+=110;};
  const find=t=>g.nodes.find(n=>n.type===t);
  if(it.react.includes('beat')){const b=find('bloom')||find('ripple');if(b)drive(sound,'beat',b,b.type==='bloom'?'bloom':'amount');}
  if(it.react.includes('bass')||it.react.includes('pulse')){
    const t=find('bulge')||find('twist')||(sim?null:vis);if(t)drive(sound,'bass',t,t===vis?'scale':'amount',['smooth',{attack:10,release:260}]);
    else if(!find('bloom')?.id||!it.react.includes('beat')){const b=find('bloom');if(b)drive(sound,'bass',b,'bloom',['smooth',{attack:15,release:300}]);}
  }
  if(it.react.includes('high')){const h=find('hue')||find('jitter');if(h)drive(sound,'high',h,h.type==='hue'?'hue':'amount',['smooth',{attack:5,release:150}]);}
  if(!i&&it.data.includes('computer')){const c=node('computer',40,dy);g.nodes.push(c);const t=find('turbulence')||find('hue')||find('twist');if(t)wire(c,'activity',t,t.type==='hue'?'cycle':'amount');else if(spinN)wire(c,'activity',spinN,'spin');dy+=110;}
  if(!i&&it.live){const d=node('liveData',40,dy,{source:it.live});g.nodes.push(d);dy+=110;
    const free=(n,k)=>n&&!g.edges.some(e=>e.to===n.id&&e.input===k),link=(out,n,k)=>{if(free(n,k)){wire(d,out,n,k);return true;}};
    link('palette',find('palette'),'colors');
    const b=find('bloom')||find('ripple');if(b)link('pulse',b,b.type==='bloom'?'bloom':'amount');
    const t=find('wave')||find('twist')||find('turbulence');if(!(t&&link('level',t,'amount'))&&T.scale)link('level',vis,'scale');}
  if(!i&&it.data.includes('pointer')){const p=node('pointer',40,dy);g.nodes.push(p);if(T.rotation)wire(p,'x',vis,'rotation');if(T.tilt)wire(p,'y',vis,'tilt');}
  return g;
}

// ---------- live director ----------
// Follows the song: waiting → calm / groove / build / drop, and asks for a change when a section starts
// or when nothing has changed for a while. Between sections it paces itself like a curator: arcs of
// rest → build (1–3 steps, rising) → peak → rest, so changes breathe instead of cutting at random.
export class Director{
  constructor(){this.section='waiting';this.secT=0;this.since=0;this.level=0;this.hist=[];this.changes=0;this.arc='rest';this.arcStep=0;this.builds=2;}
  // How long the current arc stage holds, relative to “every”.
  pace(){return {rest:1.4,build:1,peak:.75}[this.arc];}
  // The next stage of the arc (sections of the song pull it along: a drop is a peak, a calm is a rest).
  advance(kind){
    if(kind==='drop')this.arc='peak';else if(kind==='calm')this.arc='rest';else if(kind==='build'){this.arc='build';this.arcStep=1;}
    else if(this.arc==='rest'){this.arc='build';this.arcStep=1;this.builds=1+Math.floor(Math.random()*3);}
    else if(this.arc==='build'){if(this.arcStep>=this.builds)this.arc='peak';else this.arcStep++;}
    else this.arc='rest';
    return this.arc;
  }
  step(full,dt,every){
    this.level+=(full-this.level)*Math.min(1,dt*2.5);this.hist.push(this.level);if(this.hist.length>90)this.hist.shift();
    this.secT+=dt;this.since+=dt;const L=this.level,rise=this.hist.length>=45?L-this.hist[this.hist.length-45]:0,s=this.section;let next=s;
    if(s==='waiting'){if(this.secT>1.5)next=L>.6?'drop':L<.3?'calm':'groove';}
    else if(L>.66&&s!=='drop'&&(s==='calm'||s==='build'||this.secT>3))next='drop';
    else if(L<.28&&s!=='calm'&&this.secT>2.5)next='calm';
    else if(s==='drop'&&L<.5&&this.secT>4)next='groove';
    else if(s==='calm'&&L>.4&&this.secT>3)next='groove';
    else if((s==='groove'||s==='calm')&&rise>.18&&L>.35&&L<.66&&this.secT>3)next='build';
    else if(s==='build'&&rise<.02&&this.secT>6)next='groove';
    if(next!==s){this.section=next;this.secT=0;if(s!=='waiting'&&(this.since>=4||next==='drop')){this.since=0;this.changes++;return next;}}
    if(this.since>=every*this.pace()){this.since=0;this.changes++;return 'phrase';}
    return null;
  }
  energy(kind){
    const arc={rest:25,build:Math.min(80,40+this.arcStep*14),peak:90}[this.arc],music={drop:85,calm:25,build:70}[this.section];
    return {calm:22,groove:52,build:72,drop:92,phrase:music!==undefined?Math.round((music+arc)/2):arc,waiting:45}[kind]??50;}
}
