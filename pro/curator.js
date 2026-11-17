// Curator: the Autopilot's taste. It knows every deformer, force, particle accent and image effect Pro has, the ranges
// in which each one looks good, and how they combine, the way a VJ builds a look in TouchDesigner, Notch or Resolume:
//   one hero visual · one kind of motion · at most one "signature" effect · a light finish · punctuation saved for drops.
// Every look spends an intensity budget set by the song's section (a breakdown is sparse, a drop fuller but never thick),
// every sound drive is smoothed (nothing twitches on raw audio), and a least-recently-used rotation makes sure
// everything gets its turn over a set. plan() is pure: it returns what to add; autopilot.enhance wires it.
import {FORCE_KNOBS} from './graph.js';

const L=(r,a,b)=>a+(b-a)*r(),I=(r,a,b)=>Math.round(L(r,a,b)),sg=r=>r()<.5?-1:1,one=(r,a)=>a[Math.floor(r()*a.length)%a.length];
const SIMS=['simparticles','simfluid','simsmoke','simsand'];

// Each entry: role · w (visual weight against the section's budget) · E (energies it suits) · sim (true: also on simulations,
// 'only': simulations only) · props(r,e,ctx) · drive(r,e,ctx) → [[source,key,low,high,smoothMs]] (sources: see enhance's source()).
export const VOCAB={
  // ---- motion: one slow, organic movement of the shape ----
  wave:{role:'motion',w:.6,E:[0,100],props:(r,e)=>({amount:12,speed:I(r,2,3+e*3)}),drive:(r,e)=>[['sway','amount',6,I(r,16,20+e*14),0]]},
  twist:{role:'motion',w:.6,E:[0,100],props:(r)=>({amount:sg(r)*I(r,12,24)}),drive:(r,e)=>{const a=I(r,10,14+e*10);return [['slow','amount',-a,a,0]];}},
  bulge:{role:'motion',w:.7,E:[20,100],props:()=>({amount:6}),drive:(r,e)=>[['bass','amount',4,I(r,14,18+e*16),480]]},
  ripple:{role:'motion',w:.7,E:[10,100],props:()=>({amount:8}),drive:(r,e)=>[['bass','amount',6,I(r,18,22+e*14),520]]},
  water:{role:'motion',w:.7,E:[0,85],props:(r,e)=>({amount:I(r,24,36),drops:r()<.7?'beats':'centre',len:I(r,30,48),speed:I(r,40,60+e*15),rain:I(r,6,18)})},
  depth:{role:'motion',w:.5,E:[0,90],props:()=>({amount:50}),drive:(r)=>[['slow','amount',I(r,30,40),I(r,70,95),0]]},
  flowField:{role:'motion',w:.6,E:[0,100],sim:true,props:(r,e)=>({perlin:I(r,25,40),curl:I(r,0,20),brownian:0,vortex:I(r,0,12),scale:I(r,25,40),speed:I(r,8,12+e*10)}),drive:(r,e)=>[['mids','perlin',20,I(r,34,40+e*16),650]]},
  turbulence:{role:'motion',w:.6,E:[0,100],sim:true,props:(r)=>({amount:22,scale:I(r,50,70),smoke:I(r,18,32)}),drive:(r,e)=>[['level','amount',16,I(r,28,30+e*18),700]]},
  // ---- forces: simulations only, a gentle push (the sim's own preset does the rest) ----
  swirl:{role:'motion',w:.5,E:[0,100],sim:'only',force:true,props:(r,e)=>({swirl:sg(r)*I(r,18,32),fluidSwirl:sg(r)*I(r,15,30),spin:sg(r)*I(r,0,14),fluidSpin:I(r,0,12),smokeSpin:sg(r)*I(r,8,22)}),
    drive:(r,e,c)=>c.mode==='simparticles'?[['mids','swirl',14,I(r,26,30+e*16),700]]:c.mode==='simfluid'?[['mids','fluidSwirl',12,I(r,24,28+e*14),700]]:[]},
  attract:{role:'motion',w:.5,E:[10,100],sim:'only',force:true,props:(r)=>({pull:sg(r)*I(r,10,24)})},
  gravity:{role:'motion',w:.4,E:[0,100],sim:'only',force:true,props:(r)=>({gravity:-I(r,6,18),sand:I(r,55,95),buoyancy:I(r,90,140)})},
  wind:{role:'motion',w:.4,E:[0,90],sim:'only',force:true,props:(r)=>({smoke:sg(r)*I(r,10,24),sand:sg(r)*I(r,8,22)})},
  vorticity:{role:'motion',w:.5,E:[0,100],sim:'only',force:true,props:(r)=>({fluid:I(r,28,50),smoke:I(r,32,55)})},
  drag:{role:'motion',w:.3,E:[0,60],sim:'only',force:true,props:(r)=>({drag:I(r,60,85),viscosity:I(r,10,28),friction:I(r,30,50)})},
  // ---- texture: fine grain on top of the motion, only once the music has some drive ----
  jitter:{role:'texture',w:.5,E:[35,100],sim:true,props:()=>({amount:0}),drive:(r,e)=>[['high','amount',0,I(r,5,6+e*7),170]]},
  disorder:{role:'texture',w:.5,E:[40,100],sim:true,props:()=>({amount:6}),drive:(r,e)=>[['beat','amount',5,I(r,12,14+e*12),420]]},
  randomize:{role:'texture',w:.5,E:[30,100],props:(r)=>({global:I(r,8,16),dist:I(r,0,12),appear:0,outline:0,color:I(r,10,28)})},
  mirror:{role:'texture',w:.4,E:[0,100],props:(r)=>({flipH:r()<.6,flipV:r()<.25,reflect:true}),needsNoSym:true},
  // ---- accent: sparkles shed by the shape ----
  particles:{role:'accent',w:.7,E:[10,100],props:(r,e)=>({shape:one(r,['spark','star','circle','ring','diamond','spark']),density:I(r,6,10+e*8),energy:+L(r,.5,.8+e*.4).toFixed(2),speed:+L(r,1,1.8+e*1.4).toFixed(1),
    life:I(r,70,130),size:I(r,4,9),spread:I(r,30,60),gravity:+L(r,-.6,.2).toFixed(1),damping:I(r,94,98),trail:I(r,6,18)})},
  // ---- signature: the one effect that gives the look its character ----
  kaleido:{role:'signature',img:true,w:1.2,E:[20,90],props:(r)=>({kaleido:I(r,20,42),reflect:I(r,0,24)})},
  fracture:{role:'signature',img:true,w:1.4,E:[50,100],props:(r,e,c)=>c.section==='drop'&&r()<.4?{mode:'shatter',cells:I(r,20,32),size:I(r,55,70),gap:I(r,15,28),disp:I(r,25,40),rot:I(r,15,28),drift:I(r,30,45),bass:I(r,60,90),beat:I(r,50,80),recover:I(r,58,70),glow:I(r,25,40),noise:I(r,18,30),seed:I(r,1,999)}
    :{mode:'flow',cells:I(r,24,40),size:I(r,55,70),gap:I(r,15,28),disp:I(r,22,38),rot:I(r,12,26),drift:I(r,30,48),bass:I(r,50,85),beat:I(r,30,65),recover:I(r,52,66),glow:I(r,25,42),noise:I(r,18,32),seed:I(r,1,999)}},
  liquidGlass:{role:'signature',img:true,w:1.1,E:[0,75],props:(r)=>({blobs:I(r,4,7),size:I(r,40,60),merge:I(r,45,60),spread:I(r,70,90),speed:I(r,10,22),seed:I(r,1,999),refraction:I(r,22,40),edge:I(r,40,55),chroma:I(r,12,26),rim:I(r,35,50),highlight:I(r,35,52),bass:I(r,25,50),beat:I(r,10,28),wobble:I(r,15,28)})},
  tunnel:{role:'signature',img:true,w:1.3,E:[45,100],props:(r)=>({scale:I(r,56,70),speed:I(r,8,15),bass:I(r,22,38),kick:I(r,10,20),twist:sg(r)*I(r,4,12),twistBeat:0,key:100})},
  warpTunnel:{role:'signature',img:true,w:1.3,E:[40,100],props:(r,e)=>({amount:I(r,38,52+e*14),curve:sg(r)*I(r,18,45),swirl:sg(r)*I(r,0,14),speed:I(r,18,30+e*16),trails:I(r,35,55),react:'bass',sound:I(r,40,60),drift:I(r,25,45),x:0,y:0})},
  melt:{role:'signature',img:true,w:1.2,E:[30,85],props:(r)=>({amount:I(r,14,24),react:'level',sound:I(r,40,58),speed:I(r,15,25),threshold:35,length:I(r,30,44)})},
  cutter:{role:'signature',img:true,w:1.4,E:[40,100],props:(r,e,c)=>{const hot=c.section==='drop';return {pattern:one(r,['golden','mondrian','triangles','grid','columns','rows','random']),pieces:I(r,5,hot?11:8),seed:I(r,1,999),
    react:'beat',every:hot?'2':c.section==='build'?'4':'8',threshold:55,rate:2,recut:hot?4:0,shuffle:I(r,18,hot?45:32),scale:I(r,10,24),move:I(r,8,18),rotate:I(r,0,10),glide:I(r,550,900),decay:I(r,420,700),
    recolor:I(r,8,22),recolorOn:'hits',colors:one(r,['hues','duo','mono','chroma','hues']),gap:I(r,3,8),lines:0};}},
  shader:{role:'signature',img:true,w:1,E:[20,90],props:(r)=>({example:one(r,['Wobble','Edge glow','Kaleidoscope']),k1:I(r,10,24),k2:I(r,10,24),k3:I(r,10,24),k4:50})},
  feedback:{role:'signature',img:true,w:.9,E:[0,65],props:(r)=>({decay:+L(r,.6,.74).toFixed(2),zoom:+L(r,1.004,1.014).toFixed(3),rotate:+(sg(r)*L(r,.1,.35)).toFixed(2)})},
  trails:{role:'signature',img:true,w:.8,E:[0,60],props:(r)=>({trails:I(r,30,52),feedback:0,smooth:100})},
  cornerPin:{role:'signature',img:true,w:.6,E:[0,60],props:(r)=>{const a=I(r,3,7);return {tlx:a,tly:0,trx:-a,try:0,brx:0,bry:0,blx:0,bly:0,grid:'off'};}},
  // ---- finish: the cinematic polish the templates share (soft edges, vignette, a touch of fringe, richer colour) ----
  lens:{role:'finish',img:true,w:.3,E:[0,100],props:(r,e)=>({chroma:I(r,6,14+e*6),vignette:I(r,30,52),sharpen:I(r,8,22),grain:I(r,0,12),scanlines:0})},
  blur:{role:'finish',img:true,w:.3,E:[0,80],props:(r)=>({x:0,y:0,radial:I(r,16,34),focal:I(r,50,64)})},
  grade:{role:'finish',img:true,w:.2,E:[0,100],props:(r)=>({brightness:0,contrast:I(r,6,18),saturation:I(r,12,32),hue:0,invert:0})},
  effect:{role:'finish',img:true,w:.2,E:[0,100],props:(r)=>({kind:'saturate',amount:+L(r,.38,.45).toFixed(2)})},
  bloom:{role:'finish',img:true,w:.4,E:[0,100],props:(r)=>({bloom:I(r,18,32),edge:I(r,0,14)}),drive:(r,e,c)=>c.section==='drop'||c.section==='build'?[['beat','bloom',18,I(r,34,46),260]]:[]},
  // ---- colour: a slow drift through neighbouring hues ----
  hue:{role:'colour',w:.3,E:[0,100],props:()=>({hue:0,cycle:0}),drive:(r)=>{const a=I(r,12,22);return [['colour','hue',-a,a,0]];}},
  // ---- punctuation: impact saved for the drop (and, lightly, the top of a build) ----
  glitch:{role:'punct',img:true,w:1.1,E:[60,100],props:(r)=>({amount:I(r,18,30),react:'beat',threshold:I(r,55,70),decay:I(r,140,220),speed:12,slices:I(r,30,55),rgb:I(r,25,45),blocks:I(r,15,30),stutter:I(r,5,15)})},
  strobe:{role:'punct',img:true,w:1,E:[70,100],props:(r)=>({amount:I(r,16,26),react:'beat',every:'4',threshold:55,rate:2,decay:90,style:'flash',safe:true})}
};
// ---- Cloner effectors (only on a Cloner): the clones drift on a field or settle into a random arrangement ----
Object.assign(VOCAB,{
  fieldEffector:{role:'motion',cl:'only',w:.6,E:[0,100],props:(r,e)=>({field:one(r,['wave','wave','noise','ripple']),strength:I(r,40,70+e*30),size:I(r,110,200),speed:I(r,25,40+e*30)}),
    drive:(r,e)=>[['bass','strength',I(r,35,55),I(r,80,100+e*40),520]]},
  randomEffector:{role:'texture',cl:'only',w:.5,E:[0,100],props:(r)=>({seed:I(r,1,999),color:I(r,10,30),size:I(r,15,35),rotX:I(r,0,40),rotY:I(r,10,60),rotZ:I(r,0,40),posX:I(r,0,25),posY:I(r,0,25),posZ:I(r,0,25)})}
});
// A Cloner look the way the Cloned template builds one: an array of a solid or two, lit, coloured by the sound through the
// palette, its clones growing with the music; sparse when calm, fuller (and sometimes linked) as the energy rises.
const rigRecent=[];
export function clonerRig(o={}){
  const r=o.r||rngOf(o.seed),E=Math.max(0,Math.min(100,o.energy??50)),e=E/100;
  const layout=one(r,['grid','ring','sphere','spiral','helix','scatter','network'].filter(x=>!rigRecent.includes(x)));rigRecent.push(layout);if(rigRecent.length>2)rigRecent.shift();
  const C={grid:[I(r,6,9),I(r,4,6),I(r,1,2),I(r,200,250)],linear:[I(r,10,16),1,1,I(r,90,130)],ring:[I(r,14,22),I(r,1,2),1,I(r,260,320)],sphere:[I(r,8,11),I(r,6,8),1,I(r,300,360)],
    spiral:[I(r,30,48),1,1,I(r,220,280)],helix:[I(r,30,48),1,1,I(r,210,260)],scatter:[I(r,30,50),1,1,I(r,200,260)],network:[I(r,8,11),I(r,8,10),I(r,5,8),I(r,700,900)]}[layout];
  const objects=[one(r,['cube','cube','sphere','ico','torus','cylinder','pyramid','frame'])];if(r()<.35)objects.push(one(r,['sphere','cube','ico','cone']));
  const chain=[['light',{key:I(r,120,155),ambient:I(r,90,120),angle:I(r,-60,-25),height:I(r,35,55),shadow:I(r,45,65),ao:50,bounce:40}],
    ['soundEffector',{listen:one(r,['random','index','distance']),spread:I(r,25,45),grow:r()<.4?I(r,40,80):0,rotate:r()<.3?I(r,20,60)*sg(r):0,
      scaleX:I(r,20,40+e*25),scaleY:I(r,35,60+e*45),scaleZ:I(r,20,40+e*25),delay:I(r,0,30)}],
    ['material',{display:'solid',shading:r()<.7?'smooth':'flat',roughness:I(r,25,55),metallic:I(r,10,45),rim:I(r,25,50),emission:I(r,0,20+e*40),colorBy:one(r,['sound','sound','clone','height']),surface:'palette',edges:'palette'}]];
  if(layout==='network'||(E>45&&r()<.3))chain.splice(1,0,['links',{links:I(r,2,5),distance:I(r,150,260),width:+L(r,.8,1.6).toFixed(1),glow:I(r,50,90),pulse:80}]);
  return {props:{layout,countX:C[0],countY:C[1],countZ:C[2],spacingX:C[3],spacingY:C[3],spacingZ:C[3],twist:/spiral|helix/.test(layout)?I(r,5,15)*sg(r):0,cloneSpin:I(r,0,30)*sg(r),variety:100,opts:{pG3Size:{grid:I(r,40,55),ring:I(r,40,55),sphere:I(r,30,42),spiral:I(r,40,55),helix:I(r,40,55),scatter:I(r,28,42),network:I(r,3,5)}[layout]}},objects,chain};
}
export const ROLES=['motion','texture','accent','signature','finish','colour','punct'];
// What each section can afford (sum of weights) and how likely each role is.
const BUDGET={calm:2.2,groove:3,build:3.4,drop:4.2};
const ODDS={calm:{signature:.5,texture:.1,accent:.25,colour:.35,punct:0,finish:.8},groove:{signature:.7,texture:.35,accent:.2,colour:.3,punct:0,finish:.8},
  build:{signature:.7,texture:.5,accent:.2,colour:.25,punct:.3,finish:.8},drop:{signature:.85,texture:.4,accent:.15,colour:.2,punct:.9,finish:.85}};

// Use counts over the session: rarely used nodes are favoured, the last few are held back.
const uses=new Map(),recent=[];
export function usage(){return Object.fromEntries(uses);}
export function resetUsage(){uses.clear();recent.length=0;}
const sectionOf=E=>E<35?'calm':E<62?'groove':E<84?'build':'drop';
function fits(type,ctx){
  const v=VOCAB[type];if(!v)return false;
  if(v.cl==='only'?ctx.mode!=='simcloner':ctx.mode==='simcloner'&&!v.img)return false;
  if(ctx.sim&&!v.sim&&!v.img)return false;if(!ctx.sim&&v.sim==='only')return false;
  if(v.force&&!(FORCE_KNOBS[ctx.mode]&&Object.values(FORCE_KNOBS[ctx.mode]).some(k=>k[0]===type)))return false;
  if(v.needsNoSym&&ctx.symmetry)return false;
  if(ctx.taken.has(type)||ctx.no(type))return false;
  return ctx.E>=v.E[0]-8&&ctx.E<=v.E[1]+8;
}
function choose(r,ctx,role){
  const list=Object.keys(VOCAB).filter(t=>VOCAB[t].role===role&&fits(t,ctx));if(!list.length)return null;
  const wt=list.map(t=>{const v=VOCAB[t],mid=(v.E[0]+v.E[1])/2,half=(v.E[1]-v.E[0])/2+12,fit=Math.max(.25,1-Math.abs(ctx.E-mid)/half),n=uses.get(t)||0,held=recent.slice(-6).includes(t)?.2:1;
    return fit*held/(1+.6*n);});
  let x=r()*wt.reduce((a,b)=>a+b,0),i=0;while(i<list.length-1&&(x-=wt[i])>0)i++;
  return list[i];
}
// Engine post FX the look already carries (the scenes give each look a bloom, vignette, kaleidoscope…): don't double them.
function engineTaken(fx={}){
  const t=new Set();if(!fx||fx.enabled===false)return t;
  if((fx.pfxBloom||0)>24)t.add('bloom');if((fx.pfxVignette||0)>25||(fx.pfxChroma||0)>18)t.add('lens');if((fx.pfxBlurRadial||0)>20)t.add('blur');
  if((fx.pfxKaleido||0)>10||fx.pfxFracture)t.add('@signature');if((fx.pfxTrails||0)>30||(fx.pfxFeedback||0)>20){t.add('trails');t.add('feedback');}
  return t;
}
// plan({energy, section, role, mode, symmetry, postFx, have:[types already in the graph], no:type=>bool, seed|r})
// → [{type, role, img, props, drive}] in wiring order (shape stages first, then image effects inner → outer).
export function plan(o={}){
  const r=o.r||rngOf(o.seed),E=Math.max(0,Math.min(100,o.energy??50)),section=o.section&&BUDGET[o.section]?o.section:sectionOf(E),role=o.role||0,e=E/100;
  const mode=o.mode||'circle',sim=SIMS.includes(mode),pre=engineTaken(o.postFx);
  const ctx={E,section,mode,sim,symmetry:!!o.symmetry&&o.symmetry!=='none',taken:new Set([...(o.have||[]),...[...pre].filter(t=>t[0]!=='@')]),no:o.no||(()=>false)};
  let budget=(BUDGET[section]||3)*(role?.35:1);const out=[],odds=ODDS[section];
  const add=(type)=>{if(!type)return false;const v=VOCAB[type];if(v.w>budget+.05)return false;budget-=v.w;ctx.taken.add(type);
    out.push({type,role:v.role,img:!!v.img,props:v.props(r,e,ctx),drive:v.drive?v.drive(r,e,ctx):[]});uses.set(type,(uses.get(type)||0)+1);recent.push(type);if(recent.length>24)recent.shift();return true;};
  const has=role=>(o.have||[]).some(t=>VOCAB[t]?.role===role);
  if(role){
    // A supporting layer gets at most one quiet movement (or a nudge for its simulation), sometimes sparkles.
    if(r()<.55&&!has('motion'))add(choose(r,ctx,'motion'));
    if(!sim&&r()<.12)add(choose(r,ctx,'accent'));
    return out;
  }
  if(!has('motion')&&r()<.92)add(choose(r,ctx,'motion'));
  if(sim&&r()<(section==='calm'?.25:.45))add(choose(r,ctx,'motion'));
  const sigFree=!pre.has('@signature')&&!has('signature');
  if(section==='drop'&&r()<odds.punct&&!has('punct'))add(choose(r,ctx,'punct'));
  if(sigFree&&r()<odds.signature)add(choose(r,ctx,'signature'));
  if(r()<odds.texture&&!has('texture'))add(choose(r,ctx,'texture'));
  if(r()<odds.accent&&!has('accent'))add(choose(r,ctx,'accent'));
  if(r()<odds.colour&&!has('colour'))add(choose(r,ctx,'colour'));
  if(section==='build'&&r()<odds.punct&&!has('punct'))add(choose(r,ctx,'punct'));
  // A finish or two, cheapest last.
  if(r()<odds.finish)add(choose(r,ctx,'finish'));
  if(r()<odds.finish*.5)add(choose(r,ctx,'finish'));
  // Signature effects work on the picture before it is polished; punctuation sits outermost so a flash hits the whole frame.
  const order={signature:0,finish:1,punct:2};
  return [...out.filter(x=>!x.img),...out.filter(x=>x.img).sort((a,b)=>(order[a.role]??1)-(order[b.role]??1))];
}
function rngOf(seed=Date.now()){let s=(seed>>>0)||1;return ()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return ((s>>>0)%100000)/100000;};}
// Short words for the status line.
export const WORDS={fieldEffector:'field',randomEffector:'scatter',wave:'wave',twist:'twist',bulge:'bulge',ripple:'ripple',water:'water drops',depth:'depth',flowField:'flow field',turbulence:'turbulence',swirl:'swirl',attract:'attract',gravity:'gravity',
  wind:'wind',vorticity:'eddies',drag:'drag',jitter:'jitter',disorder:'disorder',randomize:'randomize',mirror:'mirror',particles:'sparkles',kaleido:'kaleidoscope',fracture:'fracture',liquidGlass:'liquid glass',
  tunnel:'tunnel',warpTunnel:'warp tunnel',melt:'melt',cutter:'cutter',shader:'shader',feedback:'echo',trails:'trails',cornerPin:'perspective',lens:'lens',blur:'soft focus',grade:'grade',effect:'saturate',bloom:'glow',hue:'hue drift',glitch:'glitch',strobe:'strobe'};
