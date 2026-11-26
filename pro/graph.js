// Audiograph Pro graph model: categorized node catalog, typed ports, validation and migration.
// Emitter modes by node type: each is one of the original Audiograph renderers.
import {ATTRACTOR_LIST} from './attractors.js';
import {EPI_LIST,POLAR_LIST,CA_LIST,SCOPE_LIST,LINE_STYLES,CELL_SHAPES} from './mathviz.js';
import {cleanMapping} from './mapping.js';
import {SHADER_EXAMPLES,SHADER_DEFAULT,parseKnobs,knobDefault} from './shaderfx.js';
import {TEMPLATE_NAMES} from './morph.js';
import {legacyPosition} from './object-transform.js';
import {wander} from './wander.js';
import {validateEnvironment} from './environment.js';
import {CAMERA_MOTIONS} from './camera.js';
import {withMaterials} from './model-materials.js';
export const MODES = {
  waveform2d: [['linear','Linear'],['circle','Circle'],['concentric','Concentric'],['spiral','Spiral'],['phyllotaxis','Phyllotaxis'],['fractal','Fractal'],['growth','Growth'],['sacred','Sacred'],['water','Water'],['graph','Graph'],['lissajous','Harmonic'],['scatter','Scatter'],['sine','Sine'],['custom','Math']],
  waveform3d: [['sphere','Sphere'],['cube','Cube'],['torus','Torus'],['cylinder','Cylinder'],['cone','Cone'],['ico','Icosphere'],['pyramid','Pyramid'],['frame','Frame'],['knot','Knot'],['tetrahedron','Tetrahedron'],['dna','DNA'],['terrain','Terrain'],['text3d','3D text'],['model','3D model']],
  gpuParticles: [['simparticles','Particles'],['simfluid','Fluid'],['simfluid3d','3D Fluid'],['simsmoke','Smoke'],['simsand','Granular Sand']]
};
// Retired modes: still load and render in old scenes, but are no longer offered.
// Library groups for each waveform mode (Waveforms lists every mode as its own entry).
export const MODE_GROUPS={waveform2d:{linear:'Classic',circle:'Classic',concentric:'Classic',spiral:'Classic',sine:'Classic',phyllotaxis:'Organic',growth:'Organic',water:'Organic',scatter:'Organic',fractal:'Math',sacred:'Math',lissajous:'Math',custom:'Math',graph:'Tech'}};
export const HIDDEN_MODES=new Set(['lissajous','simsand']);
export const emitterNames = {...Object.fromEntries(Object.values(MODES).flat()),simcloner:'Cloner'};

export const CATEGORIES = [
  {id:'inputs',label:'Inputs',color:'#71f4d3',hint:'Sound, pictures, camera, text and 3D you bring in'},
  {id:'waveforms',label:'Waveforms',color:'#71ecf4',hint:'Audio-reactive line patterns'},
  {id:'emitters',label:'Emitters',color:'#71c3f4',hint:'Particles: classic and native WebGPU simulations'},
  {id:'3d',label:'3D',color:'#7199f4',hint:'3D waveforms, and the Cloner with its objects, effectors, material, light and camera'},
  {id:'forces',label:'Forces',color:'#7271f4',hint:'Spin any shape; push and steer WebGPU simulations: gravity, drag, swirl, wind…'},
  {id:'deformers',label:'Deformers',color:'#9b71f4',hint:'Bend, mirror and repeat the shape, add noise, or cut the picture into pieces'},
  {id:'color',label:'Color',color:'#c471f4',hint:'Palettes and hue'},
  {id:'postfx',label:'Post FX',color:'#ed71f4',hint:'Image effects (GPU shaders)'},
  {id:'controls',label:'Controls',color:'#f471d1',hint:'Numbers that move knobs'},
  {id:'audio',label:'Audio analysis',color:'#f471a8',hint:'Turn sound into numbers or reshape it'},
  {id:'composite',label:'Composite',color:'#f4717f',hint:'Mix and output'},
  {id:'ai',label:'AI',color:'#f4a271',hint:'Restyle your visuals live with diffusion models (needs the local AI bridge)'}
];
export const PORT_COLORS={number:'#6ee7b7',shape:'#f59e0b',image:'#8aa2ff',audio:'#a3e635',visual:'#f472b6',source:'#fb7185',object3d:'#fde047',colors:'#c084fc',model:'#fca5a5',prompt:'#fdba74',control:'#5eead4',any:'#e5e7eb'};

const n=(label,value,min,max,step=1,extra={})=>({kind:'number',label,value,min,max,step,...extra});
const pick=(label,value,choices,extra={})=>({kind:'select',label,value,choices,...extra});
const bool=(label,value=false,extra={})=>({kind:'bool',label,value,...extra});
const color=(label,value)=>({kind:'color',label,value});
const text=(label,value,max=100)=>({kind:'text',label,value,max});
const dict=(label,limit,valueKind)=>({kind:'dict',label,value:{},limit,valueKind});
const SYMS=[['none','Off'],['x','X'],['y','Y'],['xy','XY'],['r3','3'],['r4','4'],['r6','6'],['r8','8']];
const SHAPE_IO={inputs:{shape:'shape'},outputs:{shape:'shape'}};
const FX_IO={inputs:{image:'image'},outputs:{image:'image'}};
const DEFORM=(label,key,min,max,value,description,step=1)=>({category:'deformers',label,description,...SHAPE_IO,props:{amount:n('Amount',value,min,max,step,{key})}});
const F=(label,value,min,max,key,sims)=>n(label,value,min<0?min*10:min,max*10,1,{key,sims});
const FORCE_INTENSITY=n('Intensity',100,0,1000,10,{unit:'%'});
const FORCE=(label,description,props)=>({category:'forces',force:true,label,description,...SHAPE_IO,props:{intensity:FORCE_INTENSITY,...props}});
// Cloner parts (Cinema 4D style): each knob sets one original cloner option ("key" = knob id, "sim" = choice).
const C3=(label,value,min,max,key,step=1)=>n(label,value,min,max,step,{key,sims:['simcloner']});
const C3P=(label,value,choices,sim)=>pick(label,value,choices.map(c=>c[0]),{labels:choices,sim,sims:['simcloner']});
const C3D=(group,label,description,props)=>({category:'3d',group,label,description,...SHAPE_IO,props});
export const OBJECT_RENDERS=[['normal','Normal'],['waveform','Waveform'],['polygons','Polygons'],['points','Point cloud']];
export const PRIM_PROPS={size:n('Size',60,2,300,5),detail:n('Detail',4,1,10,1),stretchX:n('Stretch X',100,10,500,5),stretchY:n('Stretch Y',100,10,500,5),stretchZ:n('Stretch Z',100,10,500,5)};
export const PRIMITIVES=[['sphere','Sphere'],['cube','Cube'],['cylinder','Cylinder'],['cone','Cone'],['pyramid','Pyramid'],['torus','Torus'],['ico','Icosphere'],['frame','Frame'],['knot','Knot']];
export const CLONER_LAYOUTS=[['grid','Grid'],['linear','Linear'],['ring','Radial'],['sphere','Sphere'],['scatter','Scatter'],['spiral','Spiral'],['helix','Helix'],['network','Network']];
const FX=(label,description,props)=>({category:'postfx',label,description,...FX_IO,fx:true,props});
// Lines, transform, motion and symmetry live on every renderer node (grouped in its inspector).
const G=(group,spec)=>({...spec,group});
const POSITION_PROPS=Object.fromEntries(['X','Y','Z'].map(a=>['move'+a,G('Transforms',n('Move '+a,0,-100,100,.01))]));
export const GEO_PROPS={
  density:G('Lines',n('Line count',350,80,800,10,{key:'_lines'})),height:G('Lines',n('Height',80,5,300,5,{key:'_height'})),thick:G('Lines',n('Thickness',1,.5,15,.25,{key:'_thick'})),
  contrast:G('Lines',n('Contrast',75,5,100,1,{key:'_contrast'})),sensitivity:G('Lines',n('Sensitivity',100,5,200,5,{key:'_sensitivity'})),fade:G('Lines',n('Fade edges',0,0,100,5,{key:'_fadeEdge'})),
  varyHeight:G('Lines',bool('Vary height',true,{key:'_varyHeight'})),varyThick:G('Lines',bool('Vary thickness',false,{key:'_varyThick'})),
  scale:G('Transform',n('Scale',100,50,400,10,{key:'_zoom'})),rotation:G('Transform',n('Rotation',0,-180,180,1,{key:'_rotation'})),x:G('Transform',n('Offset X',0,-100,100,1,{key:'_offX'})),y:G('Transform',n('Offset Y',0,-100,100,1,{key:'_offY'})),
  tilt:G('Transform',n('3D tilt',0,-180,180,1,{key:'_dragRotX',rad:true})),turn:G('Transform',n('3D rotate',0,-180,180,1,{key:'_dragRotY',rad:true})),pulse:G('Transform',bool('Zoom on loud',false,{key:'_zoomLoud'})),
  };
// Spin (Forces), Symmetry and Mirror (Deformers) are nodes; a renderer without them draws still and unmirrored.
const MOTION_BASE={_spin:0,_spinDir:1,_speed:1,_symmetryMode:'none',_symGap:0,_flipH:false,_flipV:false,_mirrorOn:false};
const LINE_SHAPES=[['straight','Straight'],['rounded','Rounded'],['dotted','Dotted'],['dashed','Dashed'],['pins','Pins'],['tapered','Tapered'],['caps','Caps'],['cross','Cross'],['numbers','Numbers'],['symbols','Symbols'],['words','Words'],['cascade','Cascade'],['barcode','Feather'],['circles','Circles'],['braille','Braille'],['arrows','Arrows'],['slash','Slash'],['needles','Needles'],['diamonds','Diamonds'],['inkwater','Ink in Water'],['off','Off']];
// Line style and outline live on the waveform nodes (grouped, closed by default).
export const STYLE_PROPS={
  lineShape:G('Line style',pick('Style','straight',LINE_SHAPES.map(s=>s[0]),{labels:LINE_SHAPES,key:'_lineShape'})),styleSize:G('Line style',n('Size',100,30,250,5,{key:'_styleSize'})),
  styleDensity:G('Line style',n('Density',100,30,250,5,{key:'_styleDensity'})),styleAngle:G('Line style',n('Angle',0,-90,90,1,{key:'_styleAngle'})),
  outline:G('Outline',bool('Show outline',false,{key:'_showOutline'})),outlineStyle:G('Outline',pick('Style','solid',['solid','dotted','dashed','connected','fill'],{key:'_outlineStyle'})),
  outlineOpacity:G('Outline',n('Opacity',60,5,100,5,{key:'_outlineOpacity'})),outlineWeight:G('Outline',n('Weight',2,.5,8,.25,{key:'_outlineWeight'})),
  outlineGap:G('Outline',n('Gap',0,0,30,1,{key:'_outlineDist'})),outlineCount:G('Outline',n('Count',1,1,10,1,{key:'_outlineCount'})),outlineSpacing:G('Outline',n('Spacing',4,1,20,1,{key:'_outlineSpace'}))};
const LOOK_PROPS={...GEO_PROPS,...STYLE_PROPS};
// Original layer parameters for a renderer's geometry props (spin carries its direction).
export function geoMods(p){
  const out={...MOTION_BASE};
  for(const [k,s] of Object.entries(LOOK_PROPS)){let v=p[k];if(v===undefined)continue;if(s.rad)v=v*Math.PI/180;out[s.key]=v;}
  return out;
}
// Spin / Symmetry / Mirror nodes for an original look or for old renderer props: [[type, props], …] (only the ones in use).
export function motionNodes(v){
  const out=[];
  if((v.symmetry&&v.symmetry!=='none')||v.symGap)out.push(['symmetry',{mode:SYMS.some(s=>s[0]===v.symmetry)?v.symmetry:'none',gap:v.symGap??0}]);
  if(v.flipH||v.flipV||v.mirror)out.push(['mirror',{flipH:!!v.flipH,flipV:!!v.flipV,reflect:!!v.mirror}]);
  if((v.spin??0)!==0||(v.speed??1)!==1)out.push(['spin',{...spinProps(v.spin??0),speed:v.speed??1}]);
  return out;
}
// A signed spin amount as the Spin node's knob (0–5) and direction.
export const spinProps=v=>({spin:Math.abs(v),dir:v<0?'left':'right'});
export function motionFromLook(look){
  const sp=typeof look._spin==='number'?look._spin*(look._spinDir<0?-1:1):0;
  return motionNodes({symmetry:look._symmetryMode,symGap:look._symGap,flipH:look._flipH===true,flipV:look._flipV===true,mirror:look._mirrorOn===true,
    spin:Math.max(-5,Math.min(5,Math.round(sp*10)/10)),speed:typeof look._speed==='number'?Math.max(.1,Math.min(5,Math.round(look._speed*10)/10)):1});
}
// Geometry props seeded from an original layer look (templates).
export function geoFromLook(look){
  const out={};
  for(const [k,s] of Object.entries(LOOK_PROPS)){
    let v=look[s.key];if(v===undefined)continue;
    if(s.kind==='number'){if(typeof v!=='number')continue;if(s.rad)v=v*180/Math.PI;out[k]=Math.max(s.min,Math.min(s.max,Math.round(v/s.step)*s.step));}
    else if(s.kind==='bool'){if(typeof v==='boolean')out[k]=v;}
    else if(s.choices.includes(v))out[k]=v;
  }
  return out;
}
// Renderer nodes: each owns one isolated Audiograph engine. "audio" overrides the project sound; "drive" replaces it with a number.
// Masking: every generator (waveforms, emitters, 3D, text, pictures, video) takes an optional mask — anything visual —
// and shows only where the mask is bright (or opaque), or only where it is not.
const MASK_PROPS={maskBy:G('Mask',pick('Mask by','luma',['luma','alpha'],{labels:[['luma','Brightness'],['alpha','Alpha']]})),maskInvert:G('Mask',bool('Invert mask')),maskFeather:G('Mask',n('Mask feather',0,0,40,1,{noPort:true}))};
export const MASK_KEYS=Object.keys(MASK_PROPS);
// Compositing (last section of every visual source): how its picture sits over what is beneath it (earlier Merge inputs, or the layers below).
const LINE_STYLE=()=>G('Look',pick('Line style','solid',LINE_STYLES.map(a=>a[0]),{labels:LINE_STYLES})),CELL_SHAPE=l=>G('Look',pick(l,'square',CELL_SHAPES.map(a=>a[0]),{labels:CELL_SHAPES}));
const COMP_PROPS={compOpacity:G('Compositing',n('Opacity',100,0,100,1,{unit:'%'})),compBlend:G('Compositing',pick('Blend','source-over',['source-over','screen','lighter','multiply','difference','overlay'],
  {labels:[['source-over','Normal'],['screen','Screen'],['lighter','Add'],['multiply','Multiply'],['difference','Difference'],['overlay','Overlay']]}))};
export const COMP_KEYS=Object.keys(COMP_PROPS);
const ENGINE=(category,label,description,props,outputs={},group)=>({category,group,label,description,engine:true,inputs:{audio:'audio',drive:'number',mask:'visual'},outputs:{shape:'shape',...outputs},
  props:{...props,...GEO_PROPS,drive:n('Drive',.7,0,2,.01,{noPort:true}),intensity:G('Sound',n('Intensity',category==='waveforms'?85:100,0,200,5)),punch:G('Sound',n('Bass punch',category==='waveforms'?65:60,0,100,1)),release:G('Sound',n('Bass release',category==='waveforms'?150:220,60,800,10)),dynamics:G('Sound',n('Dynamics',50,0,100,1)),
    opts:dict('Options',120,'number'),chips:dict('Choices',60,'string'),look:{kind:'look',label:'Template look',value:{}},...MASK_PROPS,...COMP_PROPS}});
const RIGID_PROPS={
  collide:G('Rigid body',bool('Collider body',false)),
  rigidBody:G('Rigid body',bool('Rigid body',false)),
  collisionShape:G('Rigid body',pick('Collision shape','auto',['auto','box','sphere'],{labels:[['auto','Auto bounds'],['box','Box'],['sphere','Sphere']]})),
  mass:G('Rigid body',n('Mass',1,.05,100,.05)),
  bounce:G('Rigid body',n('Bounce',.65,0,1,.05)),
  friction:G('Rigid body',n('Friction',.4,0,1,.05)),
  damping:G('Rigid body',n('Damping',.08,0,1,.01))
};
const MEDIA=(label,description,cam)=>({category:'inputs',group:'Media',label,description,inputs:{audio:'audio',mask:'visual'},
  outputs:{image:'image',palette:'colors',brightness:'number',...(label==='Image'?{}:{motion:'number'})},
  props:{fit:pick('Fit','cover',['cover','contain'],{labels:[['cover','Fill'],['contain','Fit']]}),
    warp:pick('Audio warp','wave',['none','wave','slices','pulse'],{labels:[['none','Off'],['wave','Wave'],['slices','Slices'],['pulse','Pulse']]}),
    amount:n('Warp amount',50,0,100,1),...(cam?{mirror:bool('Mirror',true)}:{}),...MASK_PROPS}});
export const TEXT_FONTS=['Impact','Arial Black','Helvetica','Georgia','Courier New','Futura','Verdana','Palatino'];
const PART_SHAPES=[['circle','Circle'],['square','Square'],['star','Star'],['diamond','Diamond'],['ring','Ring'],['triangle','Triangle'],['spark','Spark'],['line','Line'],['numbers','Numbers'],['symbols','Symbols'],['words','Words']];
// The original Audiograph's gradient presets: [background (fades by "Low opacity"), colors…].
export const PALETTES={
  Classic:['#1a1a2e','#e94560','#f5a623','#6ee7b7'],Dusk:['#1a0a2e','#6b2fa0','#e0457b','#f7d26a'],Sunset:['#0a1028','#3b5bdb','#c2255c','#ff922b','#ffe066'],
  Lagoon:['#00141a','#0b7285','#22d3ee','#c084fc','#f9a8d4'],Synthwave:['#10001a','#7a5cff','#ff4ecd','#ffb86b'],Meadow:['#0a1400','#2f9e44','#a9e34b','#ffd43b','#ff6b6b'],
  Tropic:['#001020','#1c7ed6','#38d9a9','#fab005'],Fire:['#1a0008','#c92a2a','#f76707','#fcc419','#fff3bf'],Aurora:['#0d001a','#5f3dc4','#4dabf7','#63e6be','#f8f9fa'],
  Rose:['#14000f','#a61e4d','#f06595','#ffa94d','#69db7c'],Indigo:['#000814','#364fc7','#e64980','#ffd8a8'],Coral:['#0a0a00','#e8590c','#f783ac','#74c0fc'],
  Candy:['#120a00','#ff6b6b','#ffd43b','#4dabf7','#9775fa'],Mono:['#0d0d0d','#424242','#9e9e9e','#fafafa']
};
export const SOLID_PRESETS=['#dddde0','#ffffff','#f87171','#fb923c','#fbbf24','#a3e635','#34d399','#22d3ee','#818cf8','#f472b6','#191950','#000000'];
// Gradient stops the original renderer receives for a Palette node.
// Palette blend modes (Canvas composite operations); Normal replaces the colors that came before.
export const PALETTE_BLENDS=[['normal','Normal'],['multiply','Multiply'],['screen','Screen'],['overlay','Overlay'],['soft-light','Soft light'],['hard-light','Hard light'],
  ['color','Color'],['hue','Hue'],['saturation','Saturation'],['luminosity','Luminosity'],['color-dodge','Dodge'],['color-burn','Burn'],['lighter','Add'],['difference','Difference'],['exclusion','Exclusion']];
// Each stop has its own opacity (a, 0–1). Older scenes have none: the tone ramp's first stop then uses the legacy Low opacity (fade).
export const stopAlpha=(props,i,tone)=>{const a=props.stops[i]?.a;return typeof a==='number'?a:tone&&i===0?(props.fade??0):1;};
export function paletteStops(props){
  const cols=props.stops.map(s=>s.c),withA=tone=>cols.map((c,i)=>{const a=Math.max(0,Math.min(1,stopAlpha(props,i,tone)));return a>=1?c:c+Math.round(a*255).toString(16).padStart(2,'0');});
  return {tone:withA(true),simple:withA(false)};
}
export const MAX_STOPS=8;
// Prompt styles: a phrase appended to the prompt (and to the Morph / list prompts).
export const AI_STYLES=[['none','None',''],['cinematic','Cinematic',', cinematic lighting, film still, dramatic, high detail'],['oil','Oil painting',', thick oil painting, impasto brush strokes, rich colour'],
  ['watercolor','Watercolour',', delicate watercolour painting, soft bleeding pigment, paper texture'],['neon','Neon',', neon cyberpunk, glowing signs, synthwave colours'],['glass','Liquid glass',', iridescent liquid glass, caustics, refraction, glossy'],
  ['ink','Ink',', black ink illustration, sumi-e, expressive brush strokes'],['anime','Anime',', anime key visual, cel shading, vibrant'],['stained','Stained glass',', stained glass window, lead lines, jewel colours'],
  ['cosmic','Cosmic',', nebula, galaxies, cosmic dust, deep space'],['bio','Bioluminescent',', bioluminescent, glowing, deep sea, dark water'],['marble','Marble',', carved white marble sculpture, museum lighting'],
  ['pixel','Pixel art',', pixel art, 16-bit, crisp pixels'],['clay','Claymation',', claymation, plasticine, stop motion']];
export const aiStyled=(text,style)=>{const s=AI_STYLES.find(x=>x[0]===style);return text&&s?.[2]?text+s[2]:text;};
// Older Palette nodes (and templates) give fixed Low/Mid/High/Peak/Max colours; they become ramp stops.
const LEGACY_PAL=['c1','c2','c3','c4','c5','colors'];
export function legacyPalette(props){
  if(!LEGACY_PAL.some(k=>k in props))return props;
  const d={c1:'#1a1a2e',c2:'#e94560',c3:'#f5a623',c4:'#6ee7b7',c5:'#ffffff'},c=k=>props[k]??d[k];
  const cols=[...(props.mode==='simpleramp'?[]:[c('c1')]),c('c2'),c('c3'),c('c4'),...(props.colors==='4'?[c('c5')]:[])];
  const out={...props,stops:cols.map(x=>({c:x,auto:false}))};for(const k of LEGACY_PAL)delete out[k];return out;
}
const hexHsl=h=>{const r=parseInt(h.slice(1,3),16)/255,g=parseInt(h.slice(3,5),16)/255,b=parseInt(h.slice(5,7),16)/255,mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2,d=mx-mn;
  if(!d)return [0,0,l];const s=d/(1-Math.abs(2*l-1)),hh=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;return [hh*60,s,l];};
const hslHex=(h,s,l)=>{h=((h%360)+360)%360;const k=n=>(n+h/30)%12,a=s*Math.min(l,1-l),f=n=>Math.round(255*(l-a*Math.max(-1,Math.min(k(n)-3,9-k(n),1)))).toString(16).padStart(2,'0');return '#'+f(0)+f(8)+f(4);};
export const rotateHue=(hex,deg)=>{const [h,s,l]=hexHsl(hex);return hslHex(h+deg,s,l);};
// Auto colours wander slowly around the whole hue circle, each on its own seeded path.
export function paletteAuto(props,id,clock){
  if(!props.stops.some(s=>s.auto))return props;
  return {...props,stops:props.stops.map((s,i)=>{if(!s.auto)return s;let h=0;for(const ch of id+i)h=(h*31+ch.charCodeAt(0))>>>0;
    const a=(h%1000)/1000*6.283,b=((h>>>10)%1000)/1000*6.283;return {...s,c:rotateHue(s.c,150*Math.sin(a+clock*.045)+90*Math.sin(b+clock*.071))};})};
}

export const TYPES = {
  // Inputs: what you bring in. Visual inputs render with the original's own renderer for that content.
  audioIn:{category:'inputs',label:'Audio',description:'The sound: a file, the microphone or system audio. Wire “audio” into emitters (or an Audio EQ); the numbers drive any knob.',
    inputs:{},outputs:{audio:'audio',level:'number',bass:'number',mids:'number',high:'number',beat:'number'},props:{gain:n('Number gain',1,0,8,.05),decay:n('Beat decay (ms)',350,30,3000,10)}},
  computer:{category:'inputs',group:'Data',label:'Computer',description:'This computer’s load as numbers: CPU (average and busiest core), GPU, memory, frame rate, network, battery and activity (spikes when anything changes). Auto range stretches each to its recent low–high so small swings move a lot. Real values with the local helper, browser estimates without it.',
    inputs:{},outputs:{cpu:'number',core:'number',gpu:'number',memory:'number',fps:'number',network:'number',battery:'number',activity:'number'},
    props:{source:pick('Source','browser',['browser','helper'],{labels:[['browser','Browser'],['helper','Local helper']]}),port:n('Helper port',7703,1024,65535,1,{noPort:true}),
      range:pick('Range','auto',['auto','absolute'],{labels:[['auto','Auto (stretch)'],['absolute','Absolute']]}),window:n('Range window (s)',15,2,120,1,{noPort:true}),smooth:n('Smoothing',.2,0,.95,.01,{noPort:true})}},
  clock:{category:'inputs',group:'Data',label:'Clock',description:'Time as numbers: position in the minute, hour, day and week, plus a tempo beat (phase and pulse).',
    inputs:{},outputs:{second:'number',minute:'number',hour:'number',day:'number',beat:'number',pulse:'number'},props:{bpm:n('Tempo (BPM)',120,20,300,1,{noPort:true})}},
  pointer:{category:'inputs',group:'Data',label:'Mouse & keys',description:'Your hands as numbers: mouse position and speed, clicks, held button, typing and scrolling.',
    inputs:{},outputs:{x:'number',y:'number',speed:'number',click:'number',held:'number',keys:'number',scroll:'number'},
    props:{decay:n('Pulse decay (ms)',400,30,3000,10,{noPort:true}),flipY:bool('Up is 1',true)}},
  liveData:{category:'inputs',group:'Data',label:'Live data',description:'The world as numbers: the ISS orbit, space weather, ocean swell, weather, earthquakes or Wikipedia edits. Every source gives the same smooth level, change, pulse (events) and phase, plus a palette made from the data for a Palette’s “colors” input.',
    inputs:{},outputs:{level:'number',change:'number',pulse:'number',phase:'number',palette:'colors'},props:{
    source:pick('Source','iss',['iss','space','ocean','weather','quakes','wiki'],{labels:[['iss','ISS orbit'],['space','Space weather'],['ocean','Ocean swell'],['weather','Weather'],['quakes','Earthquakes'],['wiki','Wikipedia edits']]}),
    place:pick('Place','here',['here','newyork','lisbon','reykjavik','tokyo','sydney','capetown','honolulu'],{labels:[['here','Here'],['newyork','New York'],['lisbon','Lisbon'],['reykjavik','Reykjavík'],['tokyo','Tokyo'],['sydney','Sydney'],['capetown','Cape Town'],['honolulu','Honolulu']]}),
    glide:n('Glide (s)',4,0,30,.5,{noPort:true}),stretch:n('Auto range',.6,0,1,.05,{noPort:true})}},
  midi:{category:'inputs',group:'Data',label:'MIDI',description:'A MIDI controller or keyboard: one CC knob/fader, a note (or any note), gate, pitch and pitch bend. Channel 0 listens to every channel; Note -1 to every note.',
    inputs:{},outputs:{cc:'number',note:'number',gate:'number',pitch:'number',bend:'number'},
    props:{channel:n('Channel',0,0,16,1,{noPort:true}),cc:n('CC number',1,0,127,1,{noPort:true}),note:n('Note',-1,-1,127,1,{noPort:true})}},
  // Pictures: Image, Video and Camera are sources, not renderers. They give an image (warped by audio when it is wired),
  // brightness and motion numbers, a palette from their colours, and feed GPU Particles' "emit" input.
  image:MEDIA('Image','A picture. Wire audio in to warp it; its image, palette and brightness drive other nodes (e.g. GPU Particles emit).'),
  video:MEDIA('Video','A video file. Wire audio in to warp it; its image, palette, brightness and motion drive other nodes.'),
  camera:MEDIA('Camera','Your camera. Wire audio in to warp it; its image, palette, brightness and motion drive other nodes.',true),
  // Plain letters as a picture (Inputs); the EQ versions (Waveforms) draw words, pictures and video as audio-reactive lines.
  plainText:{category:'inputs',group:'Media',label:'Text',description:'Your words as plain letters: a picture for effects, masks or GPU Particles emit. Wire audio in and Bounce scales them with the sound.',inputs:{audio:'audio',mask:'visual'},
    outputs:{image:'image'},props:{text:text('Text','SOUND'),font:pick('Font','Impact',TEXT_FONTS),
      weight:pick('Weight','900',['400','700','900'],{labels:[['400','Regular'],['700','Bold'],['900','Black']]}),color:color('Color','#ffffff'),bounce:n('Bounce',0,0,100,1),...MASK_PROPS}},
  text:ENGINE('waveforms','Text EQ','Your words drawn as audio-reactive lines.',{text:text('Text','SOUND')},{},'Media'),
  imageEQ:ENGINE('waveforms','Image EQ','A picture drawn as audio-reactive lines (the original Image layout). Load the image in its properties.',{},{},'Media'),
  videoEQ:ENGINE('waveforms','Video EQ','A video drawn as audio-reactive lines (the original Video layout). Load the video in its properties.',{},{},'Media'),
  splat:ENGINE('inputs','Gaussian Splat','A .ply / .splat point cloud that reacts to the sound (a demo cloud until you load one).',{}),
  // Waveforms and Emitters (particles)
  templateMorph:{category:'composite',group:'Templates',label:'Preset Morph',engine:true,description:'Blend original Audiograph templates: matching layouts interpolate; different layouts crossfade. Audio drives the full stack; its finished image feeds palettes, post effects and Output.',
    inputs:{audio:'audio',drive:'number'},outputs:{image:'image'},props:{
    from:pick('From',TEMPLATE_NAMES[0],TEMPLATE_NAMES,{noPort:true}),to:pick('To',TEMPLATE_NAMES[1],TEMPLATE_NAMES,{noPort:true}),
    mix:n('Morph',0,0,100,1,{unit:'%'}),...COMP_PROPS}},
  attractor:{category:'waveforms',group:'Math',label:'Strange Attractor',description:'Thousands of points flowing through a chaotic 3D system (Lorenz, Aizawa, Thomas, Halvorsen, Dadras, Rössler), drawn as glowing trails. A band of the sound morphs the equations (the HUD prints them live), loudness speeds the flow and spin, each beat kicks the points outward and the attractor pulls them back. Probes follow single points with their x, y, z. White: wire a Palette after it for colour.',
    inputs:{audio:'audio'},outputs:{image:'image'},props:{
    system:pick('System','lorenz',ATTRACTOR_LIST.map(a=>a[0]),{labels:ATTRACTOR_LIST}),
    react:G('Sound',pick('Morph from','bass',['bass','mids','high','full'],{labels:[['bass','Bass'],['mids','Mids'],['high','Highs'],['full','Level']]})),
    morph:G('Sound',n('Morph',60,0,100,1,{unit:'%'})),speed:G('Sound',n('Flow',40,1,200,1)),boost:G('Sound',n('Flow from loudness',100,0,200,1,{unit:'%'})),
    kick:G('Sound',n('Beat kick',30,0,100,1,{unit:'%'})),vibrate:G('Sound',n('Vibrate',40,0,100,1,{unit:'%'})),vibeFrom:G('Sound',pick('Vibrate from','high',['bass','mids','high','full'],{labels:[['bass','Bass'],['mids','Mids'],['high','Highs'],['full','Level']]})),spin:G('Sound',n('Spin',8,-90,90,1,{unit:'°/s'})),spinBoost:G('Sound',n('Spin from loudness',50,0,200,1,{unit:'%'})),
    count:G('Form',n('Particles',2000,100,8000,100)),size:G('Form',n('Size',80,10,150,1,{unit:'%'})),tilt:G('Form',n('Tilt',15,-90,90,1,{unit:'°'})),depth:G('Form',n('Perspective',40,0,100,1,{unit:'%'})),
    trail:G('Look',n('Trail',60,0,100,1,{unit:'%'})),res:G('Look',n('Resolution',2,1,8,1,{unit:'×'})),line:G('Look',n('Line',1,.5,4,.5)),lineStyle:LINE_STYLE(),glow:G('Look',n('Brightness',60,5,100,1,{unit:'%'})),
    shade:G('Look',pick('Shade by','speed',['speed','depth','glow'],{labels:[['speed','Speed'],['depth','Depth'],['glow','Glow (add up)']]})),probes:G('Look',n('Probes',2,0,6,1)),hud:G('Look',bool('HUD',true)),color:G('Look',color('Color','#ffffff')),...COMP_PROPS}},
  techLines:{category:'waveforms',group:'Tech',label:'Tech Lines',description:'A straight-line path (0°, 45° and 90° runs) with pixel coordinates at every corner. Every sound hit turns it (a crosshair marks the turn) and loudness sets its speed; the HUD meter shows what it listens to. It never crosses itself, closes into a solid shape that stays, and the next shape grows in the empty space. When the area is full they all flash and it starts over. White: wire a Palette after it for colour.',
    inputs:{audio:'audio'},outputs:{image:'image'},props:{
    react:G('Sound',pick('Turn on','beat',['beat','bass','mids','high','full'],{labels:[['beat','Beats'],['bass','Bass hits'],['mids','Mids hits'],['high','Highs hits'],['full','Level hits']]})),
    sens:G('Sound',n('Turn chance',100,0,100,1,{unit:'%'})),thresh:G('Sound',n('Hit sensitivity',60,0,100,1,{unit:'%'})),
    speed:G('Sound',n('Speed',30,1,120,1)),boost:G('Sound',n('Speed from loudness',100,0,200,1,{unit:'%'})),wander:G('Sound',n('Random turns',0,0,100,1,{unit:'%'})),
    minRun:G('Shape',n('Min run',2,1,20,1)),hug:G('Shape',n('Hug',60,0,100,1,{unit:'%'})),turns:G('Shape',n('Turns per shape',24,4,200,1)),reach:G('Shape',n('Shape reach',25,10,100,1,{unit:'%'})),grid:G('Shape',n('Grid',16,6,60,1)),
    size:G('Shape',n('Size',80,20,100,1,{unit:'%'})),area:G('Shape',pick('Area','square',['square','frame'],{labels:[['square','Square'],['frame','Whole frame']]})),
    chamfer:G('Shape',n('Chamfer',60,0,100,1,{unit:'%'})),gap:G('Shape',n('Gap',1,0,4,1)),fill:G('Shape',n('Fill until',70,20,95,1,{unit:'%'})),
    pause:G('Shape',n('Pause',.4,0,5,.1,{unit:'s'})),flash:G('Shape',n('Flashes',4,0,8,1)),hold:G('Shape',n('Hold',1,0,10,.1,{unit:'s'})),
    line:G('Look',n('Line',1.5,.5,8,.5)),lineStyle:LINE_STYLE(),labels:G('Look',n('Labels',10,0,30,1)),hud:G('Look',bool('HUD',true)),color:G('Look',color('Color','#ffffff')),...COMP_PROPS}},
  epicycles:{category:'waveforms',group:'Math',label:'Fourier Epicycles',description:'A chain of spinning circles, each riding on the last, whose tip traces a shape: the Fourier series of a star, heart, infinity sign, square or trefoil, or the live spectrum or waveform itself. Loudness speeds the drawing, beats jolt the circles and a band of the sound wobbles their radii. The HUD lists the biggest terms. White: wire a Palette after it for colour.',
    inputs:{audio:'audio'},outputs:{image:'image'},props:{
    shape:pick('Shape','star',EPI_LIST.map(a=>a[0]),{labels:EPI_LIST}),
    react:G('Sound',pick('Wobble from','bass',['beat','bass','mids','high','full'],{labels:[['beat','Beats'],['bass','Bass'],['mids','Mids'],['high','Highs'],['full','Level']]})),wobble:G('Sound',n('Wobble',60,0,100,1,{unit:'%'})),jolt:G('Sound',n('Beat jolt',40,0,100,1,{unit:'%'})),
    speed:G('Sound',n('Speed',.15,.01,1,.01,{unit:'rev/s'})),boost:G('Sound',n('Speed from loudness',100,0,200,1,{unit:'%'})),
    circles:G('Form',n('Circles',40,2,128,1)),size:G('Form',n('Size',70,10,100,1,{unit:'%'})),
    trail:G('Look',n('Trail',100,5,100,1,{unit:'%'})),line:G('Look',n('Line',2,.5,8,.5)),lineStyle:LINE_STYLE(),showCircles:G('Look',bool('Circles',true)),hud:G('Look',bool('HUD',true)),color:G('Look',color('Color','#ffffff')),...COMP_PROPS}},
  polarPlot:{category:'waveforms',group:'Math',label:'Polar Plot',description:'Curves drawn in polar coordinates (r as a function of θ): roses, the superformula, the butterfly curve, limaçons, or the spectrum wrapped around a circle. The sound swells the radius and morphs the petal count; echoes repeat the curve as fading rings over a polar grid. The HUD prints the live equation. White: wire a Palette after it for colour.',
    inputs:{audio:'audio'},outputs:{image:'image'},props:{
    curve:pick('Curve','rose',POLAR_LIST.map(a=>a[0]),{labels:POLAR_LIST}),
    react:G('Sound',pick('React to','bass',['beat','bass','mids','high','full'],{labels:[['beat','Beats'],['bass','Bass'],['mids','Mids'],['high','Highs'],['full','Level']]})),swell:G('Sound',n('Swell',50,0,100,1,{unit:'%'})),morph:G('Sound',n('Morph',40,0,100,1,{unit:'%'})),spin:G('Sound',n('Spin',10,-90,90,1,{unit:'°/s'})),
    petals:G('Form',n('Petals (k)',3,1,12,.1)),cycles:G('Form',n('Cycles',2,1,12,1)),echoes:G('Form',n('Echoes',4,0,12,1)),size:G('Form',n('Size',70,10,100,1,{unit:'%'})),
    line:G('Look',n('Line',1.5,.5,8,.5)),lineStyle:LINE_STYLE(),grid:G('Look',bool('Polar grid',true)),hud:G('Look',bool('HUD',true)),color:G('Look',color('Color','#ffffff')),...COMP_PROPS}},
  cellular:{category:'waveforms',group:'Math',label:'Cellular Automaton',description:'A grid of cells living by simple rules: Conway’s Life, Brian’s Brain, HighLife or a scrolling 1D rule (Rule 30, 90, 110…). Loudness speeds the generations, beats inject fresh life and the spectrum sprinkles cells along the bottom; dead cells leave a ghost. Cells shade by age. White: wire a Palette after it for colour.',
    inputs:{audio:'audio'},outputs:{image:'image'},props:{
    mode:pick('Rule','life',CA_LIST.map(a=>a[0]),{labels:CA_LIST}),
    react:G('Sound',pick('Inject on','beat',['beat','bass','mids','high','full'],{labels:[['beat','Beats'],['bass','Bass'],['mids','Mids'],['high','Highs'],['full','Level']]})),inject:G('Sound',n('Inject',50,0,100,1,{unit:'%'})),sprinkle:G('Sound',n('Spectrum sprinkle',30,0,100,1,{unit:'%'})),
    speed:G('Sound',n('Speed',12,1,60,1,{unit:'steps/s'})),boost:G('Sound',n('Speed from loudness',100,0,200,1,{unit:'%'})),
    rule:G('Form',n('1D rule',30,0,255,1)),cell:G('Form',n('Cell',10,3,40,1,{unit:'px'})),
    cellShape:CELL_SHAPE('Cell shape'),gap:G('Look',n('Gap',15,0,50,1,{unit:'%'})),ghost:G('Look',n('Ghost',50,0,100,1,{unit:'%'})),hud:G('Look',bool('HUD',true)),color:G('Look',color('Color','#ffffff')),...COMP_PROPS}},
  oscilloscope:{category:'waveforms',group:'Tech',label:'Oscilloscope',description:'A phosphor oscilloscope reading the waveform itself: XY phase plot (the signal against a delayed copy), a triggered time trace, or a Lissajous figure whose frequencies follow the sound. Glowing persistence, graticule and readouts included. White: wire a Palette after it for colour.',
    inputs:{audio:'audio'},outputs:{image:'image'},props:{
    mode:pick('Mode','xy',SCOPE_LIST.map(a=>a[0]),{labels:SCOPE_LIST}),
    gain:G('Sound',n('Gain',3,.5,20,.1)),morph:G('Sound',n('Morph',40,0,100,1,{unit:'%'})),drift:G('Sound',n('Drift',30,0,100,1,{unit:'%'})),
    span:G('Form',n('Samples',1024,256,1780,1)),delay:G('Form',n('XY delay',24,1,200,1)),size:G('Form',n('Size',100,10,100,1,{unit:'%'})),
    persist:G('Look',n('Persistence',70,0,95,1,{unit:'%'})),line:G('Look',n('Line',1.5,.5,8,.5)),lineStyle:LINE_STYLE(),grid:G('Look',bool('Graticule',true)),hud:G('Look',bool('HUD',true)),color:G('Look',color('Color','#ffffff')),...COMP_PROPS}},
  radar:{category:'waveforms',group:'Tech',label:'Radar Sweep',description:'A radar scope: a sweeping beam paints the spectrum as returns around the dial, fading behind it. Loudness speeds the sweep, and contacts with bearing and range readouts drift across the screen, flaring on beats. White: wire a Palette after it for colour.',
    inputs:{audio:'audio'},outputs:{image:'image'},props:{
    react:G('Sound',pick('Flare on','beat',['beat','bass','mids','high','full'],{labels:[['beat','Beats'],['bass','Bass'],['mids','Mids'],['high','Highs'],['full','Level']]})),returns:G('Sound',n('Returns',100,0,200,1,{unit:'%'})),decay:G('Sound',n('Fade',60,0,100,1,{unit:'%'})),
    rpm:G('Sound',n('Sweep',12,1,60,1,{unit:'rpm'})),boost:G('Sound',n('Sweep from loudness',100,0,200,1,{unit:'%'})),
    contacts:G('Form',n('Contacts',6,0,20,1)),range:G('Form',n('Range',40,5,200,1,{unit:'NM'})),rings:G('Form',n('Rings',4,2,8,1)),size:G('Form',n('Size',80,10,100,1,{unit:'%'})),
    lineStyle:LINE_STYLE(),cellShape:CELL_SHAPE('Returns as'),labels:G('Look',bool('Labels',true)),hud:G('Look',bool('HUD',true)),color:G('Look',color('Color','#ffffff')),...COMP_PROPS}},
  waveform2d:ENGINE('waveforms','Waveform 2D','Flat audio-reactive line patterns.',{mode:pick('Waveform','circle',MODES.waveform2d.map(m=>m[0]),{labels:MODES.waveform2d}),...STYLE_PROPS},{},'2D'),
  // 3D Object: every form and primitive (and your OBJ as Model), drawn Normal (solid, lit) or as a Waveform (audio-reactive lines).
  waveform3d:ENGINE('3d','3D Object','A 3D form drawn solid (Normal), as audio-reactive lines (Waveform) or as Polygons (faces that light up and move with the sound). Model loads OBJ, FBX, USD, GLB or glTF; GLB/USD materials render as imported PBR in Normal. Animated FBX / GLB / glTF models play (Animation speed can follow the sound). Its “object” output feeds a Cloner or WebGPU particles’ emit.',{mode:pick('3D Object','sphere',MODES.waveform3d.map(m=>m[0]),{labels:MODES.waveform3d}),
    render:pick('Rendering','waveform',OBJECT_RENDERS.map(r=>r[0]),{labels:OBJECT_RENDERS}),...RIGID_PROPS,...POSITION_PROPS,...PRIM_PROPS,...STYLE_PROPS,
    modelMaterials:pick('Materials','imported',['imported','palette'],{labels:[['imported','Imported PBR'],['palette','Palette']]}),
    paletteMap:G('Palette mapping',pick('Mapping','default',['default','uv','front','box'],{labels:[['default','Default'],['uv','UV map'],['front','Front projection'],['box','Box']]})),
    paletteAxis:G('Palette mapping',pick('Gradient axis','u',['u','v'],{labels:[['u','Horizontal'],['v','Vertical']]})),
    paletteTiling:G('Palette mapping',n('Tiling',1,.1,20,.1)),
    paletteOffset:G('Palette mapping',n('Offset',0,-2,2,.01)),
    paletteRotation:G('Palette mapping',n('Rotation',0,-180,180,1)),
    words:text('Text','SOUND'),font3d:pick('Font','Impact',TEXT_FONTS),depth:n('Depth',30,5,150,5,{noPort:true}),
    animSpeed:n('Animation speed',1,0,4,.05),clip:n('Clip',1,1,32,1,{noPort:true})},{object:'object3d'},'Objects'),
  gpuParticles:(t=>({...t,inputs:{...t.inputs,emit:'source'}}))(ENGINE('emitters','WebGPU particles','GPU-powered particles, fluid and smoke. Particles emit from a 3D Object or Cloner’s surface, or follow the bright parts of a flat picture.',{mode:pick('Simulation','simfluid',MODES.gpuParticles.map(m=>m[0]),{labels:MODES.gpuParticles}),
    space:pick('Dimensions','auto',['auto','2d','3d'],{labels:[['auto','Automatic'],['2d','2D'],['3d','3D']],noPort:true,sims:['simparticles']}),
    ...Object.fromEntries(Object.entries({...POSITION_PROPS,
      uniformScale:G('Transforms',n('Scale',100,5,400,5)),
      ...Object.fromEntries(['X','Y','Z'].flatMap(a=>[
        ['scale'+a,G('Transforms',n('Scale '+a,100,5,500,5))],
        ['rot'+a,G('Transforms',n('Rotate '+a,0,-180,180,1))]]))
    }).map(([key,spec])=>[key,{...spec,sims:['simparticles']}])),
    particleDepth:n('Depth',2,.2,8,.1,{sims:['simparticles']}),
    particleSpread:n('Surface spread',15,0,100,5,{sims:['simparticles']}),
    particleResponse:pick('Release on','sound',['sound','motion','both'],{labels:[['sound','Sound'],['motion','Object motion'],['both','Sound + object motion']],sims:['simparticles']}),
    particleSurfaceFlow:bool('Surface flow',false,{sims:['simparticles']}),
    particleFloor:bool('Enabled',true,{sims:['simparticles']}),
    particleFloorSize:n('Size',100,10,800,5,{unit:'%',noPort:true,sims:['simparticles']}),
    fluidResolution:n('Resolution',128,24,128,8,{unit:' voxels / side',noPort:true,sims:['simfluid3d']}),
    fluidDomain:n('Container size',110,100,800,5,{unit:'%',noPort:true,sims:['simfluid3d']}),
    fluidRate:n('Amount',500,0,500,5,{unit:'%',sims:['simfluid3d']}),
    fluidSpeed:n('Time scale',40,25,200,5,{unit:'%',sims:['simfluid3d']}),
    fluidSwirl:n('Turbulence',260,0,300,5,{unit:'%',sims:['simfluid3d']}),
    fluidFade:n('Dissipation',400,0,400,5,{unit:'%',sims:['simfluid3d']}),
    fluidPressure:n('Pressure iterations',10,4,24,2,{noPort:true,sims:['simfluid3d']}),
    fluidBand:pick('React to','bass',['bass','mids','high','full'],{labels:[['bass','Bass'],['mids','Mids'],['high','Highs'],['full','Full range']],sims:['simfluid3d']}),
    fluidAttack:n('Attack (ms)',0,0,500,5,{sims:['simfluid3d']}),
    fluidRelease:n('Release (ms)',0,0,2000,10,{sims:['simfluid3d']}),
    fluidSoundSwirl:n('Sound turbulence',0,0,300,5,{unit:'%',sims:['simfluid3d']}),
    fluidSoundSpeed:n('Sound speed',0,0,200,5,{unit:'%',sims:['simfluid3d']}),
    fluidOpacity:n('Opacity',100,0,250,5,{unit:'%',sims:['simfluid3d']}),
    fluidColor:{...color('Color','#6bd2ff'),sims:['simfluid3d']},
    fluidFloor:bool('Enabled',false,{sims:['simfluid3d']}),
    fluidFloorSize:n('Size',100,10,800,5,{unit:'%',noPort:true,sims:['simfluid3d']}),
    emitColors:pick('Emit colors','source',['source','palette'],{labels:[['source','Picture'],['palette','Palette']]})},{},'WebGPU emitters')),
  // 3D: the Cloner copies objects into an array; effectors, material, light and camera are nodes after it.
  cloner:{...ENGINE('3d','Cloner','Copies 3D objects into an array that reacts to the sound. Wire up to three objects into it. Enable Rigid body to make instances bounce off each other and other rigid objects. Ground is in Scene settings.',{
    layout:pick('Layout','grid',CLONER_LAYOUTS.map(c=>c[0]),{labels:CLONER_LAYOUTS,sim:'g3Mode'}),...RIGID_PROPS,...POSITION_PROPS,
    paletteBy:G('Palette mapping',pick('Palette by','inherit',['inherit','clone','face','height','sound'],{labels:[['inherit','Follow Material'],['clone','Clone'],['face','Polygon'],['height','Height'],['sound','Sound']]})),
    countX:G('Count',n('Count X',5,1,60,1,{key:'pG3Nx'})),countY:G('Count',n('Count Y',5,1,60,1,{key:'pG3Ny'})),countZ:G('Count',n('Count Z',5,1,60,1,{key:'pG3Nz'})),
    spacingX:G('Spacing',n('Spacing X',150,20,1000,5,{key:'pG3SpX'})),spacingY:G('Spacing',n('Spacing Y',150,0,1000,5,{key:'pG3SpY'})),spacingZ:G('Spacing',n('Spacing Z',150,0,1000,5,{key:'pG3SpZ'})),
    twist:G('Steps',n('Twist',0,-45,45,1,{key:'pG3StRotY'})),endScale:G('Steps',n('End scale',100,10,300,5,{key:'pG3StScale'})),cloneSpin:G('Steps',n('Spin',0,-100,100,5,{key:'pG3Spin'})),
    scale:G('Scale',n('Scale',100,5,400,5)),scaleX:G('Scale',n('Scale X',100,5,500,5)),scaleY:G('Scale',n('Scale Y',100,5,500,5)),scaleZ:G('Scale',n('Scale Z',100,5,500,5)),
    rotX:G('Rotate',n('Rotate X',0,-180,180,1,{key:'pG3GrX'})),rotY:G('Rotate',n('Rotate Y',0,-180,180,1,{key:'pG3GrY'})),rotZ:G('Rotate',n('Rotate Z',0,-180,180,1,{key:'pG3GrZ'})),
    variety:G('Objects',n('Variety',100,0,100,5,{key:'pG3Mix'}))},{},'Cloner'),inputs:{audio:'audio',drive:'number',object:'object3d',object2:'object3d',object3:'object3d',mask:'visual'}},
  soundEffector:C3D('Effectors','Sound effector','Connected objects and clones respond to sound: move, rotate and scale with shared sensitivity and response controls.',{
    listen:C3P('Spectrum distribution','index',[['index','Order'],['distance','Distance'],['x','X'],['y','Y'],['z','Z'],['random','Random']],'g3Map'),
    sensitivity:G('Response',C3('Sensitivity',100,0,200,'pSimSens',5)),attack:G('Response',C3('Attack',40,5,400,'pSimAttack',5)),
    release:G('Response',C3('Release',350,50,2000,'pSimRelease',10)),bass:G('Response',C3('Bass reaction',100,0,300,'pSimBass',5)),
    energy:G('Response',C3('Energy',100,0,200,'pSimEnergy',5)),burst:G('Response',C3('Beat burst',100,0,200,'pSimBurst',5)),
    spectrumTilt:G('Response',C3('Spectrum tilt',0,-100,100,'pSimTilt',5)),
    soundForce:G('Response',C3('Sound impulse',5,0,30,'_rigidSoundForce',.5)),
    intensity:G('Response',C3('Intensity',100,0,200,'_soundIntensity',5)),punch:G('Response',C3('Bass punch',60,0,100,'_soundPunch')),
    responseRelease:G('Response',C3('Bass release',220,60,800,'_soundRelease',10)),dynamics:G('Response',C3('Dynamics',50,0,100,'_soundDynamics')),
    grow:G('Scale',C3('Grow from base',0,0,100,'pG3Anchor',5)),spread:G('Distribution',C3('Spread',35,0,100,'pG3Indep',5)),delay:G('Distribution',C3('Delay',0,0,100,'pG3Delay',5)),
    moveX:G('Move',C3('Move X',0,-300,300,'pG3EfX',5)),moveY:G('Move',C3('Move Y',0,-300,300,'pG3EfY',5)),moveZ:G('Move',C3('Move Z',0,-300,300,'pG3EfZ',5)),
    rotateX:G('Rotate',C3('Rotate X',0,-360,360,'pG3EfRX',5)),rotateY:G('Rotate',C3('Rotate Y',0,-360,360,'pG3EfRY',5)),rotateZ:G('Rotate',C3('Rotate Z',0,-360,360,'pG3EfRZ',5)),
    uniformScale:G('Scale',C3('Uniform scale',0,-100,800,'pG3EfScale',5)),
    scaleX:G('Scale',C3('Scale X',40,-100,800,'pG3ScX',5)),scaleY:G('Scale',C3('Scale Y',40,-100,800,'pG3ScY',5)),scaleZ:G('Scale',C3('Scale Z',40,-100,800,'pG3ScZ',5))}),
  fieldEffector:C3D('Effectors','Field effector','A moving pattern lifts and scales the clones.',{
    field:C3P('Field','wave',[['noise','Noise'],['wave','Wave'],['ripple','Ripple']],'g3Field'),
    strength:C3('Strength',100,0,200,'pG3FieldAmt',5),size:C3('Size',100,20,400,'pG3FieldSize',5),speed:C3('Speed',50,0,300,'pG3FieldSpd',5)}),
  randomEffector:C3D('Effectors','Random effector','Random scale, rotation and position per clone, on each axis, plus colour.',{
    seed:C3('Seed',1,0,999,'pG3Seed'),color:C3('Colour',30,0,100,'pG3RndCol',5),
    size:G('Scale',C3('Uniform',40,0,100,'pG3RndScale',5)),scaleX:G('Scale',C3('X',0,0,100,'pG3RndSX',5)),height:G('Scale',C3('Y',0,0,100,'pG3RndH',5)),scaleZ:G('Scale',C3('Z',0,0,100,'pG3RndSZ',5)),
    rotX:G('Rotation',C3('X',0,0,180,'pG3RndRX',5)),rotY:G('Rotation',C3('Y',0,0,180,'pG3RndRY',5)),rotZ:G('Rotation',C3('Z',0,0,180,'pG3RndRZ',5)),
    posX:G('Position',C3('X',0,0,300,'pG3RndPosX',5)),posY:G('Position',C3('Y',0,0,300,'pG3RndPosY',5)),posZ:G('Position',C3('Z',0,0,300,'pG3RndPosZ',5))}),
  links:C3D('Effectors','Links','Connect each clone to its nearest neighbours with glowing lines: how many, how far, how thick, how bright and how much they pulse. Their colour is Material › Edges.',{
    links:C3('Links per clone',3,0,8,'pG3Links'),distance:C3('Distance',150,20,400,'pG3LinkDist',5),
    width:C3('Width',1.2,.2,8,'pG3LinkW',.1),glow:C3('Glow',80,0,200,'pG3LinkA',5),pulse:C3('Sound pulse',100,0,100,'pG3LinkPulse',5)}),
  material:C3D('Look','Material','Surface of the clones: shading, gloss, metal, glow and colour.',{
    display:C3P('Display','solid',[['solid','Shaded'],['wire','Wireframe'],['edges','Shaded + edges']],'g3Style'),
    shading:C3P('Normals','smooth',[['smooth','Smooth'],['flat','Faceted']],'g3Shade'),
    opacity:C3('Opacity',100,5,100,'pG3Alpha',5),roughness:C3('Roughness',35,0,100,'pG3Rough',5),metallic:C3('Metallic',20,0,100,'pG3Metal',5),rim:C3('Rim',30,0,100,'pG3Rim',5),emission:C3('Emission',0,0,300,'pG3Emit',5),
    colorBy:G('Colour',C3P('Palette by','height',[['clone','Clone'],['face','Polygon'],['height','Height'],['sound','Sound']],'g3CBy')),
    surface:G('Colour',C3P('Surface','palette',[['palette','Palette'],['custom','Picked']],'g3CSrc')),surfaceColor:G('Colour',{...color('Picked surface','#4aa3ff'),key:'pG3Col'}),
    edges:G('Colour',C3P('Edges','custom',[['palette','Palette'],['custom','Picked']],'g3ESrc')),edgeColor:G('Colour',{...color('Picked edges','#ffffff'),key:'pG3EdgeCol'})}),
  light:C3D('Look','Light','Key and ambient light, soft cast shadows and bounce light. Ground and HDR/EXR environment lighting are controlled in Scene settings.',{
    key:C3('Key light',100,0,200,'pG3Light',5),ambient:C3('Ambient',35,0,150,'pG3Amb',5),angle:C3('Angle',-42,-180,180,'pG3LitAz'),height:C3('Height',45,-20,89,'pG3LitEl'),
    shadow:G('Shadows',C3('Cast shadows',60,0,100,'pG3Shadow',5)),size:G('Shadows',C3('Light size',35,0,100,'pG3LitSize',5)),
    ao:G('Shadows',C3('Occlusion',50,0,100,'pG3Ao',5)),aoRadius:G('Shadows',C3('Radius',60,10,300,'pG3AoRad',5)),bounce:G('Shadows',C3('Bounce light',40,0,100,'pG3Bounce',5)),
    floor:G('Floor',C3('Floor',0,0,100,'pG3Floor',5)),floorHeight:G('Floor',C3('Height',0,-100,100,'pG3FloorY',5)),floorTint:G('Floor',C3('Tint',30,0,100,'pG3FloorTint',5))}),
  camera3d:C3D('Look','3D camera','Rotate, orbit (on its own or with the music), tilt and zoom, lens focal length (14–200 mm), depth of field (every 3D Object render, Waveform included) and motion blur. Drag in the preview to look around.',{
    turn:C3('Rotate',0,-180,180,'pG3Yaw'),orbit:C3('Orbit',0,-100,100,'pG3Orbit'),orbitSound:C3('Orbit with sound',0,0,100,'pG3OrbitSnd',5),tilt:C3('Tilt',18,-180,180,'pG3Tilt'),zoom:C3('Zoom',100,30,300,'pG3Zoom',5),
    focal:G('Lens',pick('Focal length','28',['14','18','24','28','35','50','85','135','200'],{key:'pG3Focal',sims:['simcloner','simparticles','simfluid3d'],labels:[['14','14 mm ultra wide'],['18','18 mm'],['24','24 mm wide'],['28','28 mm'],['35','35 mm'],['50','50 mm normal'],['85','85 mm portrait'],['135','135 mm tele'],['200','200 mm long tele']]})),dof:G('Lens',C3('Depth of field',0,0,100,'pG3Dof',5)),focus:G('Lens',C3('Focus',50,0,100,'pG3Focus',5)),blur:G('Lens',C3('Motion blur',0,0,100,'pG3Mb',5))}),
  // Deformers
  symmetry:{category:'deformers',group:'Symmetry',label:'Symmetry',description:'Repeat the shape: mirror across X / Y or turn it into 3- to 8-fold rotations.',...SHAPE_IO,props:{
    mode:pick('Symmetry','r6',SYMS.map(s=>s[0]),{labels:SYMS,key:'_symmetryMode'}),gap:n('Gap',0,0,100,1,{key:'_symGap'})}},
  mirror:{category:'deformers',group:'Symmetry',label:'Mirror',description:'Flip the shape and add a reflection.',...SHAPE_IO,props:{
    flipH:bool('Flip H',false,{key:'_flipH'}),flipV:bool('Flip V',false,{key:'_flipV'}),reflect:bool('Reflection',true,{key:'_mirrorOn'})}},
  twist:DEFORM('Twist','_twist',-100,100,40,'Twist around the centre.'),
  bulge:DEFORM('Bulge','_bulge',-100,100,40,'Inflate or pinch the centre.'),
  wave:{category:'deformers',label:'Wave',description:'Travelling sine displacement.',...SHAPE_IO,props:{amount:n('Amount',40,0,100,1,{key:'_wave'}),speed:n('Wave speed',5,1,20,1,{key:'_waveFreq'})}},
  shear:DEFORM('Shear','_shear',-100,100,30,'Slant the shape.'),
  depth:DEFORM('Depth','_depth',0,200,60,'Perspective depth.'),
  ripple:DEFORM('Ripple','_ripple',-100,100,40,'Concentric ripples.'),
  water:{category:'deformers',label:'Water ripples',description:'Beats drop stones into the shape; the rings travel out and push it around.',...SHAPE_IO,props:{
    amount:n('Amount',50,0,100,1,{key:'_water'}),drops:pick('Drops','beats',['beats','centre'],{labels:[['beats','Beats'],['centre','Centre']],key:'_waterSrc'}),
    len:n('Wavelength',40,10,100,1,{key:'_waterLen'}),speed:n('Speed',60,10,200,1,{key:'_waterSpeed'}),rain:n('Rain',30,0,100,1,{key:'_waterRain'})}},
  jitter:{...DEFORM('Jitter','_jitter',0,100,30,'Random shake.'),group:'Noise'},
  disorder:{...DEFORM('Disorder','_rDisorder',0,100,40,'Scatter elements out of place.'),group:'Noise'},
  randomize:{category:'deformers',group:'Noise',label:'Randomize',description:'Per-element randomness.',...SHAPE_IO,props:{
    global:n('Global',30,0,100,1,{key:'_rGlobal'}),dist:n('Distribution',0,0,100,1,{key:'_rDist'}),appear:n('Appearance',0,0,100,1,{key:'_rAppear'}),outline:n('Outline',0,0,100,1,{key:'_rOutline'}),color:n('Color',0,0,100,1,{key:'_rColor'})}},
  webcam:{category:'deformers',label:'Webcam',description:'Your camera displaces the shape by brightness and can colour it.',...SHAPE_IO,props:{
    displace:n('Displace',40,0,100,1),colors:pick('Camera colors','on',['on','off'],{labels:[['on','On'],['off','Off']]}),
    dir:pick('Direction','radial',['radial','vertical','horizontal'],{labels:[['radial','Radial'],['vertical','Vertical'],['horizontal','Horiz.']]}),smooth:n('Smoothing',5,1,20,1)}},
  turbulence:{category:'deformers',force:true,group:'Noise',label:'Turbulence',description:'Noise that churns WebGPU Particles and Smoke.',...SHAPE_IO,props:{
    intensity:FORCE_INTENSITY,amount:F('Turbulence',46,0,100,'pSpTurb',['simparticles']),scale:F('Noise scale',66,10,100,'pSpTurbScale',['simparticles']),smoke:F('Smoke turbulence',30,0,100,'pSmTurb',['simsmoke']),rigid:F('Body turbulence',30,0,100,'_rigidTurbulence',['simrigid','simcloner'])}},
  spin:FORCE('Spin','Keep the shape turning, right (clockwise) or left. Speed sets how fast its animation runs.',{
    spin:n('Spin',1,0,50,.1,{key:'_spin'}),dir:pick('Direction','right',['right','left'],{labels:[['right','Spin right ↻'],['left','Spin left ↺']]}),speed:n('Speed',1,.1,50,.1,{key:'_speed'})}),
  // Forces: WebGPU simulation physics, one idea per node. Each knob lists the simulations it moves; defaults match the simulation.
  gravity:FORCE('Gravity','Pull down (or up). Smoke rises by buoyancy.',{gravity:F('Gravity',-3,-100,100,'pSpGravity',['simparticles']),fluidGravity:F('Gravity',50,-100,100,'_fluidGravity',['simfluid3d']),sand:F('Sand gravity',100,0,100,'pSaGravity',['simsand']),buoyancy:F('Buoyancy',100,0,200,'pSmBuoy',['simsmoke']),rigid:{...F('Body gravity',9.81,-30,30,'_rigidGravity',['simrigid','simcloner']),step:.1}}),
  drag:FORCE('Drag','Slow things down: air drag, viscosity, friction, damping.',{drag:F('Drag',100,0,100,'pSpDrag',['simparticles']),viscosity:F('Viscosity',15,0,100,'pSfVisc',['simfluid']),friction:F('Friction',35,0,100,'pSaFriction',['simsand']),rigid:{...F('Body drag',.1,0,1,'_rigidDrag',['simrigid','simcloner']),max:1,step:.01}}),
  swirl:FORCE('Swirl','Rotate the flow and spin the emitters.',{swirl:F('Swirl',43,-100,100,'pSpSwirl',['simparticles']),fluidSwirl:F('Fluid swirl',40,-100,100,'pSfSwirl',['simfluid']),
    spin:F('Emitter spin',0,-100,100,'pSpSpin',['simparticles']),fluidSpin:F('Jet spin',0,-100,100,'pSfSpin',['simfluid']),smokeSpin:F('Burner spin',0,-100,100,'pSmSpin',['simsmoke']),rigid:F('Body swirl',1,-10,10,'_rigidSwirl',['simrigid','simcloner'])}),
  attract:{...FORCE('Attract','Pull 3D particles, fluid and rigid bodies toward a connected 3D Object or Cloner. Without a target, pull toward the scene origin. Negative values repel.',{
    pull:F('Particle pull',30,-100,100,'pSpAttract',['simparticles']),
    rigid:{...F('Body pull',4,-30,30,'_rigidAttract',['simrigid','simcloner']),step:.1},
    fluid:{...F('Fluid pull',4,-30,30,'_fluidAttract',['simfluid3d']),step:.1}}),inputs:{shape:'shape',target:'source'}},
  wind:FORCE('Wind','Blow sideways.',{smoke:F('Wind',0,-100,100,'pSmWind',['simsmoke']),sand:F('Sand wind',0,-100,100,'pSaWind',['simsand']),rigid:F('Body wind',2,-30,30,'_rigidWind',['simrigid','simcloner'])}),
  vorticity:FORCE('Vorticity','Curl the flow into eddies.',{fluid:F('Fluid vorticity',45,0,100,'pSfVort',['simfluid']),smoke:F('Smoke vorticity',55,0,100,'pSmVort',['simsmoke'])}),
  // Color
  palette:{category:'color',label:'Palette',description:'Recolor anything: a shape or any image (a Merge, Post FX…). Normal replaces the colors before it; the other blend modes mix with them. Wire a Live data palette into “colors” to let the data pick them.',inputs:{shape:'visual',colors:'colors'},outputs:{shape:'shape'},props:{
    mode:pick('Mode','toneramp',['toneramp','simpleramp','solid'],{labels:[['toneramp','Tone ramp'],['simpleramp','Simple ramp'],['solid','Solid']]}),
    stops:{kind:'stops',label:'Colors',value:[{c:'#1a1a2e',a:1,auto:false},{c:'#e94560',a:1,auto:false},{c:'#f5a623',a:1,auto:false},{c:'#6ee7b7',a:1,auto:false}]},
    fade:n('Low opacity',0,0,1,.05),solid:color('Solid','#dddde0'),
    blend:pick('Blend','normal',PALETTE_BLENDS.map(b=>b[0]),{labels:PALETTE_BLENDS}),mix:n('Mix',1,0,1,.01),opacity:n('Opacity',1,0,1,.01)}},
  hue:{category:'color',label:'Hue shift',description:'Rotate hues of a shape or any image, optionally cycling over time.',inputs:{shape:'visual'},outputs:{shape:'shape'},props:{hue:n('Hue',60,-180,180,1),cycle:n('Cycle (°/s)',0,-120,120,1)}},
  // Style
  // Particles
  particles:{category:'emitters',group:'Simple emitters',label:'Simple particles',description:'Particles spawned from the shape, driven by loudness.',...SHAPE_IO,props:{
    shape:pick('Shape','circle',PART_SHAPES.map(s=>s[0]),{labels:PART_SHAPES,key:'_particleShape'}),density:n('Density',20,1,50,1,{key:'pPartDensity'}),energy:n('Energy',1,.1,5,.1,{key:'pPartEnergy'}),
    speed:n('Speed',3,0,10,.1,{key:'pPartSpeed'}),life:n('Life',120,10,300,10,{key:'pPartLife'}),size:n('Size',12,1,40,.5,{key:'pPartSize'}),spread:n('Spread',50,0,100,5,{key:'pPartSpread'}),
    gravity:n('Gravity',0,-5,5,.1,{key:'pPartGravity'}),damping:n('Damping',97,80,100,.5,{key:'pPartDamping'}),trail:n('Trail',0,0,60,1,{key:'pPartTrail'})}},
  flowField:{category:'deformers',group:'Noise',label:'Flow field',description:'Noise forces that steer classic Particles.',...SHAPE_IO,props:{
    perlin:n('Perlin',40,0,100,1,{key:'pNoisePerlin'}),curl:n('Curl',0,0,100,1,{key:'pNoiseCurl'}),brownian:n('Brownian',0,0,100,1,{key:'pNoiseBrownian'}),vortex:n('Vortex',0,0,100,1,{key:'pNoiseVortex'}),
    scale:n('Scale',30,1,100,1,{key:'pNoiseScale'}),speed:n('Speed',20,1,100,1,{key:'pNoiseSpeed'})}},
  // Cutter: cuts any picture (an emitter's shape, a layer, video, image) into geometric pieces and plays them like a puzzle with the sound (cutter.js).
  cutter:{category:'deformers',label:'Cutter',description:'Cuts the picture into pieces (golden ratio, random shards, grid, columns, rows, Mondrian, triangles) and plays them like a puzzle with the sound: hits shuffle what the pieces show, pop, nudge and flip them, and colour them (hues, two colours, black & white, invert, chromatic aberration). Presets set it all in one click. Works on anything: shapes, layers, video, images.',
    inputs:{image:'image',audio:'audio'},outputs:{image:'image'},props:{
    pattern:pick('Cut','golden',['golden','random','grid','columns','rows','mondrian','triangles'],{labels:[['golden','Golden ratio'],['random','Random shards'],['grid','Grid'],['columns','Columns'],['rows','Rows'],['mondrian','Mondrian'],['triangles','Triangles']]}),
    pieces:n('Pieces',7,2,64,1),seed:n('Seed',1,0,999,1),
    react:G('Moves on',pick('Moves on','beat',['beat','bass','high','level','tempo'],{labels:[['beat','Beats'],['bass','Bass'],['high','Highs'],['level','Loudness'],['tempo','Steady rate']]})),
    every:G('Moves on',pick('Every','1',['1','2','4','8'],{labels:[['1','Beat'],['2','2 beats'],['4','4 beats'],['8','8 beats']]})),
    threshold:G('Moves on',n('Threshold',45,0,95,1)),rate:G('Moves on',n('Rate (per s)',2,.25,12,.25)),recut:G('Moves on',n('Re-cut every (hits)',0,0,32,1)),
    shuffle:G('Pieces',n('Shuffle',50,0,100,1)),scale:G('Pieces',n('Scale',40,0,100,1)),move:G('Pieces',n('Move',25,0,100,1)),rotate:G('Pieces',n('Flip / turn',20,0,100,1)),
    glide:G('Pieces',n('Glide (ms)',350,0,2000,10)),decay:G('Pieces',n('Pop decay (ms)',300,40,2000,10)),
    recolor:G('Colour',n('Colour amount',30,0,100,1)),recolorOn:G('Colour',pick('Colour on','hits',['hits','all'],{labels:[['hits','Pieces it hits'],['all','Every piece']]})),
    colors:G('Colour',pick('Colour effect','hues',['hues','duo','mono','invert','chroma','mix'],{labels:[['hues','Hues'],['duo','Two colours'],['mono','Black & white'],['invert','Invert'],['chroma','Chromatic aberration'],['mix','Mix']]})),
    c1:G('Colour',color('Colour A','#ff3d7f')),c2:G('Colour',color('Colour B','#3dd6ff')),
    gap:G('Lines',n('Gap',10,0,100,1)),lines:G('Lines',n('Line width',0,0,12,.5)),lineColor:G('Lines',color('Line colour','#3d8bff'))}},
  // Post FX (original per-layer GPU shaders)
  // Glitch and Strobe: canvas Post FX that hit with the sound (beats, a band or loudness), each with an optional audio input.
  glitch:{category:'postfx',label:'Glitch',description:'Digital breakup that hits with the sound: sliced and shifted rows, RGB split, displaced blocks and stuttering frames. Quiet parts stay clean.',
    inputs:{image:'image',audio:'audio'},outputs:{image:'image'},props:{
    amount:n('Amount',70,0,100,1),react:pick('Hits on','beat',['beat','bass','high','level','always'],{labels:[['beat','Beats'],['bass','Bass'],['high','Highs'],['level','Loudness'],['always','Always']]}),
    threshold:n('Threshold',25,0,95,1),decay:n('Decay (ms)',220,40,1200,10),speed:n('Speed',14,1,40,1),
    slices:G('Look',n('Slices',70,0,100,1)),rgb:G('Look',n('RGB split',50,0,100,1)),blocks:G('Look',n('Blocks',40,0,100,1)),stutter:G('Look',n('Stutter',30,0,100,1))}},
  strobe:{category:'postfx',label:'Strobe',description:'Flashes on the beat: white or coloured flash, blackout or invert. Safe mode keeps it to 3 flashes a second (photosensitivity guideline).',
    inputs:{image:'image',audio:'audio'},outputs:{image:'image'},props:{
    amount:n('Amount',80,0,100,1),react:pick('Flashes on','beat',['beat','bass','high','level','tempo'],{labels:[['beat','Beats'],['bass','Bass'],['high','Highs'],['level','Loudness'],['tempo','Steady rate']]}),
    every:pick('Every','1',['1','2','4','8'],{labels:[['1','Beat'],['2','2 beats'],['4','4 beats'],['8','8 beats']]}),
    threshold:n('Threshold',45,0,95,1),rate:n('Rate (per s)',2,.25,12,.25),decay:n('Decay (ms)',120,20,1000,10),
    style:G('Look',pick('Style','flash',['flash','blackout','invert'],{labels:[['flash','Flash'],['blackout','Blackout'],['invert','Invert']]})),
    color:G('Look',color('Colour','#ffffff')),safe:bool('Safe (max 3 / s)',true)}},
  // Melt, Tunnel and Shader run fragment shaders (shaderfx.js) over the picture, with the sound as uniforms.
  melt:{category:'postfx',label:'Melt',description:'Bright parts of the picture drip downward like wax, longer and faster with the sound. Quiet passages let it heal.',
    inputs:{image:'image',audio:'audio'},outputs:{image:'image'},props:{
    amount:n('Amount',75,0,100,1),react:pick('Drips with','level',['beat','bass','level','always'],{labels:[['beat','Beats'],['bass','Bass'],['level','Loudness'],['always','Always']]}),sound:n('Sound',70,0,100,1),
    speed:n('Speed',45,0,100,1),threshold:n('Threshold',35,0,95,1),length:n('Length',60,0,100,1)}},
  tunnel:{category:'postfx',label:'Zoom tunnel',description:'An endless zoom into copies of the picture inside itself, turning as they come. Bass speeds it up, beats kick it forward; dark areas show the copies behind.',
    inputs:{image:'image',audio:'audio'},outputs:{image:'image'},props:{
    scale:n('Copy size',62,35,90,1),speed:n('Speed',25,0,100,1),bass:n('Bass push',50,0,100,1),kick:n('Beat kick',40,0,100,1),
    twist:n('Twist',12,-180,180,1),twistBeat:n('Beat twist',0,0,90,1),key:n('See-through dark',100,0,100,1)}},
  warpTunnel:{category:'postfx',label:'Warp tunnel',description:'Depth motion blur: the picture streaks toward a vanishing point that drifts and curves the streaks around it, and the light flies out of the tunnel. Bass (or beats, or loudness) lengthens the streaks, speeds the flight and brightens it, eased in and out.',
    inputs:{image:'image',audio:'audio'},outputs:{image:'image'},props:{
    amount:n('Intensity',60,0,100,1),curve:n('Curve',35,-100,100,1),swirl:n('Swirl',10,-100,100,1),speed:n('Speed',35,0,100,1),trails:n('Trails',55,0,100,1),
    react:G('Sound',pick('Reacts to','bass',['bass','beat','level','always'],{labels:[['bass','Bass'],['beat','Beats'],['level','Loudness'],['always','Nothing (steady)']]})),sound:G('Sound',n('Sound',60,0,100,1)),
    drift:G('Centre',n('Centre drift',35,0,100,1)),x:G('Centre',n('Centre X',0,-50,50,1)),y:G('Centre',n('Centre Y',0,-50,50,1))}},
  motionBlur:{category:'postfx',label:'Motion blur',description:'Blurs movement. Shutter averages the last frames (a real camera shutter), Smear keeps the picture sharp with a fading tail behind it, Directional, Zoom and Spin streak it along a line, out from the centre or around it. The sound lengthens the blur.',
    inputs:{image:'image',audio:'audio'},outputs:{image:'image'},props:{
    mode:pick('Mode','shutter',['shutter','smear','directional','zoom','spin'],{labels:[['shutter','Shutter (frames)'],['smear','Smear (tail)'],['directional','Directional'],['zoom','Zoom'],['spin','Spin']]}),
    amount:n('Amount',60,0,100,1,{unit:'%'}),samples:n('Samples',8,2,24,1),fade:n('Tail fade',40,0,100,1,{unit:'%'}),angle:n('Angle',0,-180,180,1,{unit:'°'}),
    react:G('Sound',pick('Reacts to','level',['bass','beat','level','always'],{labels:[['bass','Bass'],['beat','Beats'],['level','Loudness'],['always','Nothing (steady)']]})),sound:G('Sound',n('Sound',50,0,100,1,{unit:'%'}))}},
  shader:{category:'postfx',label:'Shader',description:'Your own GLSL fragment shader, Shadertoy style: write mainImage(), read the picture from iChannel0 and the sound from iChannel1 or uBass / uMids / uHigh / uLevel / uBeat. “uniform float x; // @knob 0..1” lines become knobs. Works without a picture too.',
    inputs:{image:'image',audio:'audio'},outputs:{image:'image'},props:{
    example:pick('Example',SHADER_DEFAULT,[...Object.keys(SHADER_EXAMPLES),'Custom']),code:text('Code',SHADER_EXAMPLES[SHADER_DEFAULT],20000),
    ...Object.fromEntries([0,1,2,3].map(i=>{const k=parseKnobs(SHADER_EXAMPLES[SHADER_DEFAULT])[i];return ['k'+(i+1),n('Knob '+(i+1),k?knobDefault(k):50,0,100,1)];}))}},
  bloom:FX('Bloom','Glow around bright areas.',{bloom:n('Bloom',60,0,100,1,{key:'pfxBloom'}),edge:n('Edge glow',0,0,100,1,{key:'pfxEdgeGlow'})}),
  grade:{...FX('Color correct','Brightness, contrast, saturation, hue.',{brightness:n('Brightness',0,-100,100,1,{key:'pfxBrightness'}),contrast:n('Contrast',10,-100,100,1,{key:'pfxContrast'}),
    saturation:n('Saturation',20,-100,200,1,{key:'pfxSaturation'}),hue:n('Hue',0,-180,180,1,{key:'pfxHue'}),invert:n('Invert',0,0,100,1,{key:'pfxInvert'})}),category:'color'},
  blur:FX('Blur','Directional, radial and focal blur.',{x:n('Blur X',20,0,100,1,{key:'pfxBlurX'}),y:n('Blur Y',0,0,100,1,{key:'pfxBlurY'}),radial:n('Radial',0,0,100,1,{key:'pfxBlurRadial'}),focal:n('Focal area',0,0,100,1,{key:'pfxFocal'})}),
  lens:FX('Lens','Chromatic aberration, vignette, sharpen, scanlines.',{chroma:n('Chromatic',30,0,100,1,{key:'pfxChroma'}),vignette:n('Vignette',40,0,100,1,{key:'pfxVignette'}),sharpen:n('Sharpen',0,0,100,1,{key:'pfxSharpen'}),grain:n('Grain',0,0,100,1,{key:'pfxGrain'}),scanlines:n('Scanlines',0,0,100,1,{key:'pfxScanlines'})}),
  kaleido:FX('Kaleido','Kaleidoscope and reflection.',{kaleido:n('Kaleido',50,0,100,1,{key:'pfxKaleido'}),reflect:n('Reflect',0,0,100,1,{key:'pfxReflect'})}),
  trails:FX('Trails','Motion trails and zoom feedback. Smooth fills the gaps between echoes.',{trails:n('Trails',90,0,100,1,{key:'pfxTrails'}),feedback:n('Feedback',0,0,100,1,{key:'pfxFeedback'}),smooth:n('Smooth',100,0,100,1)}),
  fracture:FX('Fracture','Cracks ease open on bass and beats, then settle. Flow drifts; Shatter keeps the same crack pattern.',{
    mode:pick('Mode','flow',['flow','shatter'],{key:'pfxFracMode'}),cells:n('Cells',44,8,64,1,{key:'pfxFracCells'}),size:n('Size var',65,0,100,1,{key:'pfxFracSize'}),gap:n('Crack gap',30,0,100,1,{key:'pfxFracGap'}),
    disp:n('Displace',58,0,100,1,{key:'pfxFracDisp'}),rot:n('Rotate',34,0,100,1,{key:'pfxFracRot'}),drift:n('Drift',45,0,100,1,{key:'pfxFracDrift'}),bass:n('Bass resp',125,0,200,1,{key:'pfxFracBass'}),
    beat:n('Beat resp',150,0,200,1,{key:'pfxFracBeat'}),recover:n('Recovery',48,0,100,1,{key:'pfxFracRecover'}),glow:n('Crack glow',62,0,100,1,{key:'pfxFracGlow'}),noise:n('Noise',35,0,100,1,{key:'pfxFracNoise'}),seed:n('Seed',17,0,999,1,{key:'pfxFracSeed'})}),
  liquidGlass:FX('Liquid glass','Blobs of liquid glass drift over the picture, refracting and flipping what is behind them, with rainbow fringes and a bright rim. Bass swells them, beats make them wobble.',{
    blobs:G('Blobs',n('Blobs',7,1,16,1)),size:G('Blobs',n('Size',55,5,150,1)),merge:G('Blobs',n('Merge',45,0,100,1)),spread:G('Blobs',n('Spread',80,0,120,1)),speed:G('Blobs',n('Speed',35,0,200,1)),seed:G('Blobs',n('Seed',7,0,999,1)),
    refraction:G('Glass',n('Refraction',60,0,150,1)),edge:G('Glass',n('Edge bend',50,0,100,1)),chroma:G('Glass',n('Chromatic',40,0,100,1)),rim:G('Glass',n('Rim',55,0,100,1)),highlight:G('Glass',n('Highlight',60,0,100,1)),frost:G('Glass',n('Frost',0,0,100,1)),
    tint:G('Tint',color('Tint','#bfe8ff')),tintAmt:G('Tint',n('Tint amount',0,0,100,1)),dim:G('Tint',n('Dim outside',0,0,100,1)),
    bass:G('Sound',n('Bass resp',80,0,200,1)),beat:G('Sound',n('Beat resp',60,0,200,1)),wobble:G('Sound',n('Wobble',25,0,100,1))}),
  cornerPin:{category:'postfx',label:'Corner pin',description:'Projection mapping: drag the corners on the preview (or turn the knobs) to fit a wall, screen or object. Pair with Output for a second display.',...FX_IO,props:{
    tlx:n('Top-left X',0,-50,50,.5),tly:n('Top-left Y',0,-50,50,.5),trx:n('Top-right X',0,-50,50,.5),try:n('Top-right Y',0,-50,50,.5),
    brx:n('Bottom-right X',0,-50,50,.5),bry:n('Bottom-right Y',0,-50,50,.5),blx:n('Bottom-left X',0,-50,50,.5),bly:n('Bottom-left Y',0,-50,50,.5),grid:pick('Test grid','off',['off','on'])}},
  // Retired (Color correct and Blur cover it); kept so older scenes still load.
  effect:{category:'postfx',label:'Quick filter',retired:true,description:'Simple canvas filter.',...FX_IO,props:{kind:pick('Filter','hue',['hue','brightness','saturate','blur','invert']),amount:n('Amount',.35,0,2,.01)}},
  // AI (Comfy-style): Model + Prompt (+ ControlNet) feed AI Render, which restyles a picture via ai/bridge.py.
  aiModel:{category:'ai',label:'AI Model',description:'Which diffusion model the AI bridge runs, and where the bridge listens. SD-Turbo is fastest, SDXL-Turbo is sharper, SD 1.5 + LCM has the widest range of styles.',inputs:{},outputs:{model:'model'},
    props:{model:pick('Model','sd-turbo',['sd-turbo','sdxl-turbo','lcm'],{labels:[['sd-turbo','SD-Turbo'],['sdxl-turbo','SDXL-Turbo'],['lcm','SD 1.5 + LCM']]}),server:text('Bridge address','ws://127.0.0.1:7861',200)}},
  aiPrompt:{category:'ai',label:'Prompt',description:'What the AI should paint. Morph blends towards a second prompt; wire Audio or an LFO into Morph to let the music steer the style.',inputs:{},outputs:{prompt:'prompt'},
    props:{prompt:text('Prompt','luminous liquid light sculpture, iridescent glass, cinematic, high detail',400),style:pick('Style','none',AI_STYLES.map(s=>s[0]),{labels:AI_STYLES}),negative:text('Negative','blurry, text, watermark, low quality',400),prompt2:text('Morph to','',400),mix:n('Morph',0,0,1,.01)}},
  aiPromptList:{category:'ai',label:'Prompt list',description:'A sequence of prompts, one per line. It steps to the next every few beats (or seconds) and morphs smoothly into it, so the AI travels through scenes with the music. Wire it into AI Render’s prompt.',inputs:{},outputs:{prompt:'prompt',index:'number'},
    props:{prompts:text('Prompts (one per line)','a misty forest at dawn, volumetric light\nan ocean of liquid chrome under a violet sky\na cathedral made of glowing crystal\na nebula blooming like a flower',2000),style:pick('Style','none',AI_STYLES.map(s=>s[0]),{labels:AI_STYLES}),
      negative:text('Negative','blurry, text, watermark, low quality',400),advance:pick('Advance','beats',['beats','seconds'],{labels:[['beats','Every N beats'],['seconds','Every N seconds']]}),every:n('Every',8,1,64,1),
      morph:n('Morph (s)',2,0,10,.1),order:pick('Order','loop',['loop','pingpong','random'],{labels:[['loop','Loop'],['pingpong','Ping-pong'],['random','Random']]})}},
  aiControl:{category:'ai',label:'ControlNet',description:'Keeps the AI on your shapes: Edges follows the outlines of the picture, Depth follows its 3D form. Strength sets how tightly.',inputs:{},outputs:{control:'control'},
    props:{kind:pick('Guide','canny',['canny','depth'],{labels:[['canny','Edges'],['depth','Depth']]}),strength:n('Strength',.8,0,2,.01),low:n('Edge low',100,0,255,1,{noPort:true}),high:n('Edge high',200,0,255,1,{noPort:true})}},
  aiRender:{category:'ai',label:'AI Render',description:'Restyles the picture wired into it with a diffusion model on the AI bridge. Wire a Model, a Prompt and optionally a ControlNet. Strength sets how far it departs from your visuals; Smooth blends successive AI frames.',
    inputs:{image:'image',model:'model',prompt:'prompt',control:'control'},outputs:{image:'image'},primary:['image'],
    props:{strength:n('Strength',.5,.05,1,.01),steps:n('Steps',2,1,8,1,{noPort:true}),guidance:n('Guidance',0,0,10,.1),seed:n('Seed (-1 random)',42,-1,99999,1,{noPort:true}),
      reseed:pick('New seed','off',['off','beat','bar'],{labels:[['off','Fixed'],['beat','Every beat'],['bar','Every 4 beats']]}),
      size:pick('Resolution','512',['256','384','512','768','1024']),smooth:n('Smooth',.3,0,.95,.01),mix:n('Mix original',0,0,1,.01),
      dream:n('Dream',0,0,1,.01),zoom:n('Dream zoom',1.03,.9,1.2,.005),spin:n('Dream spin',0,-10,10,.1)}},
  // Controls
  value:{category:'controls',label:'Value',description:'A constant number.',inputs:{},outputs:{value:'number'},props:{value:n('Value',.7,0,2,.01)}},
  oscillator:{category:'controls',label:'LFO',description:'A slow animated wave.',inputs:{},outputs:{value:'number'},props:{wave:pick('Wave','sine',['sine','triangle','saw','square','random']),rate:n('Rate (Hz)',.28,.01,8,.01),depth:n('Depth',.7,0,1,.01),offset:n('Offset',.25,0,1,.01)}},
  map:{category:'controls',label:'Map range',description:'Scale and offset a number.',inputs:{value:'number'},outputs:{value:'number'},primary:['value'],props:{scale:n('Scale',1,-4,4,.01),offset:n('Offset',0,-2,2,.01)}},
  smooth:{category:'controls',label:'Smooth',description:'Soften a signal with separate attack and release.',inputs:{value:'number'},outputs:{value:'number'},primary:['value'],props:{attack:n('Attack (ms)',30,0,2000,5),release:n('Release (ms)',300,0,4000,10)}},
  math:{category:'controls',label:'Math',description:'Combine two numbers.',inputs:{a:'number',b:'number'},outputs:{value:'number'},primary:['a','b'],props:{op:pick('Operation','add',['add','multiply','subtract','min','max']),a:n('A',0,-2,2,.01,{noPort:true}),b:n('B',0,-2,2,.01,{noPort:true})}},
  amplify:{category:'controls',label:'Amplify',description:'Pass-through that boosts whatever flows through it: a number, an audio signal, a shape (the sound driving it) or an image (brightness).',inputs:{in:'any'},outputs:{out:'any'},primary:['in'],props:{gain:n('Gain',2,0,8,.05)}},
  random:{category:'controls',label:'Random',description:'A new random value at a rate, on every beat, or whenever the “trigger” input rises above 0.5.',inputs:{trigger:'number'},outputs:{value:'number'},props:{trigger:pick('Trigger','beat',['beat','rate']),rate:n('Rate (Hz)',1,.05,10,.05),glide:n('Glide',.3,0,1,.01)}},
  // Audio
  audio:{category:'audio',label:'Audio band',description:'Level of one frequency band (of the wired audio, or the project sound).',inputs:{audio:'audio'},outputs:{value:'number'},props:{band:pick('Band','bass',['bass','mids','high','full']),gain:n('Gain',1,0,8,.05)}},
  beat:{category:'audio',label:'Beat',description:'A pulse on every detected beat (of the wired audio, or the project sound).',inputs:{audio:'audio'},outputs:{value:'number'},props:{decay:n('Decay (ms)',350,30,3000,10),gain:n('Gain',1,0,4,.05)}},
  spectrum:{category:'audio',label:'Audio EQ',description:'Reshape the sound before an emitter or an analysis node hears it.',inputs:{audio:'audio'},outputs:{audio:'audio'},props:{
    gain:n('Gain',100,0,300,5),eq32:n('32 Hz',100,0,200,5),eq64:n('64 Hz',100,0,200,5),eq125:n('125 Hz',100,0,200,5),eq250:n('250 Hz',100,0,200,5),eq500:n('500 Hz',100,0,200,5),
    eq1k:n('1 kHz',100,0,200,5),eq2k:n('2 kHz',100,0,200,5),eq4k:n('4 kHz',100,0,200,5),eq8k:n('8 kHz',100,0,200,5),eq16k:n('16 kHz',100,0,200,5)}},
  // Composite
  background:{category:'composite',label:'Background',description:'A solid or gradient fill.',inputs:{},outputs:{image:'image'},props:{fill:pick('Fill','radial',['flat','vertical','radial']),c1:color('Color A','#0f0f12'),c2:color('Color B','#1c3d30')}},
  blend:{category:'composite',label:'Blend',description:'Combine two images.',inputs:{a:'image',b:'image'},outputs:{image:'image'},primary:['a','b'],props:{mode:pick('Blend mode','screen',['screen','source-over','multiply','difference','lighter','overlay']),mix:n('Mix',.5,0,1,.01)}},
  merge:{category:'composite',label:'Merge',description:'Combine up to four inputs. 3D contributors share scene depth; 2D inputs remain backgrounds or overlays. Each input has its own opacity.',inputs:{a:'image',b:'image',c:'image',d:'image'},outputs:{image:'image'},primary:['a','b','c','d'],props:{
    mode:pick('Blend mode','source-over',['source-over','screen','lighter','multiply','difference','overlay'],{labels:[['source-over','Normal'],['screen','Screen'],['lighter','Add'],['multiply','Multiply'],['difference','Difference'],['overlay','Overlay']]}),
    a:n('Opacity A',1,0,1,.01),b:n('Opacity B',1,0,1,.01),c:n('Opacity C',1,0,1,.01),d:n('Opacity D',1,0,1,.01)}},
  mask:{category:'composite',label:'Mask',description:'Show the image only where the mask image is drawn (or only where it is not).',inputs:{image:'image',mask:'image'},outputs:{image:'image'},primary:['image','mask'],props:{invert:bool('Invert'),feather:n('Feather',0,0,40,1)}},
  feedback:{category:'composite',label:'Feedback',description:'Feeds the last frame back under the new one, zoomed and rotated, for tunnels and echoes.',inputs:{image:'image'},outputs:{image:'image'},props:{
    decay:n('Persistence',.85,0,.98,.01),zoom:n('Zoom',1.03,.85,1.2,.005),rotate:n('Rotate (°)',1,-15,15,.1),hue:n('Hue drift',0,-60,60,1),smooth:n('Smooth',100,0,100,1)}},
  imageTransform:{category:'composite',label:'Image transform',description:'Move, scale, rotate and fade an image.',inputs:{image:'image'},outputs:{image:'image'},props:{
    scale:n('Scale',1,.1,4,.01),rotate:n('Rotate (°)',0,-180,180,1),x:n('Offset X',0,-100,100,1),y:n('Offset Y',0,-100,100,1),opacity:n('Opacity',1,0,1,.01),spin:n('Spin (°/s)',0,-180,180,1)}},
  layerIn:{category:'composite',label:'Layer',description:'Another layer’s picture as an image, to remix it here (the previous frame if that layer comes later).',inputs:{},outputs:{image:'image'},props:{layer:n('Layer',1,1,4,1,{noPort:true})}},
  lights:{category:'composite',label:'Lights',description:'An output for real LED lights: sends whatever picture is wired in to a WLED controller or Arduino over USB. Use it next to Output (same picture or a different one). Chrome or Edge.',inputs:{image:'image',audio:'audio'},outputs:{},props:{
    count:n('LEDs',60,1,1000,1,{noPort:true}),layout:pick('Layout','row',['row','edges','average'],{labels:[['row','Strip across the middle'],['edges','Around the edges'],['average','One colour']]}),
    brightness:n('Brightness',80,0,100,1),sound:n('Sound',30,0,100,1),smooth:n('Smooth',40,0,95,1),
    baud:pick('Baud rate','115200',['115200','230400','460800','921600'])}},
  output:{category:'composite',label:'Output',description:'The end of the chain: what this layer shows.',inputs:{image:'image'},outputs:{},props:{}}
};
export const EQ_KEYS=['eq32','eq64','eq125','eq250','eq500','eq1k','eq2k','eq4k','eq8k','eq16k'];
for(const type of ['waveform3d','cloner'])TYPES[type].props.scale=G('Transforms',n('Uniform scale',100,1,1600,1,{unit:'%'}));
export const EQ_HZ=[32,64,125,250,500,1000,2000,4000,8000,16000];

// Every numeric property (unless noPort) can be driven by a number wire on an input port of the same name.
TYPES.camera3d.retired=true;
export function inputsOf(type){
  const t=TYPES[type],inputs={...t.inputs};
  for(const [k,s] of Object.entries(t.props))if(s.kind==='number'&&!s.noPort&&!inputs[k])inputs[k]='number';
  return inputs;
}
// Emitters also take a number on any of their own option knobs: input "opt_<option id>".
export const OPT_PORT=/^opt_[a-zA-Z][a-zA-Z0-9_]{0,40}$/;
export function portType(n,key){return inputsOf(n.type)[key]??(isEngine(n.type)&&OPT_PORT.test(key)?'number':undefined);}
export const isEngine=type=>!!TYPES[type]?.engine;
// How a renderer node maps onto the original app: layout mode, forced source button, required media.
// Meshes for shapes the original has no line model for (Waveform render) or no clone shape for (Cloner).
const meshCache={};
function gridMesh(U,V,at,wrapU=false,wrapV=false){
  const verts=[],faces=[];for(let i=0;i<U;i++)for(let j=0;j<V;j++)verts.push(at(i/(wrapU?U:U-1),j/(wrapV?V:V-1)));
  for(let i=0;i<(wrapU?U:U-1);i++)for(let j=0;j<(wrapV?V:V-1);j++){const a=i*V+j,b=((i+1)%U)*V+j,c=((i+1)%U)*V+(j+1)%V,d=i*V+(j+1)%V;faces.push([a,b,c],[a,c,d]);}
  return {verts,faces};
}
function joinMeshes(list){const verts=[],faces=[];for(const m of list){const o=verts.length;verts.push(...m.verts);faces.push(...m.faces.map(f=>f.map(i=>i+o)));}return {verts,faces};}
function box(c,h){const v=[];for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])v.push([c[0]+x*h[0],c[1]+y*h[1],c[2]+z*h[2]]);
  return {verts:v,faces:[[0,1,3],[0,3,2],[4,6,7],[4,7,5],[0,4,5],[0,5,1],[2,3,7],[2,7,6],[0,2,6],[0,6,4],[1,5,7],[1,7,3]]};}
const TAU=Math.PI*2;
const SHAPE_MESHES={
  cylinder:()=>gridMesh(40,12,(u,v)=>[Math.cos(u*TAU),v*2-1,Math.sin(u*TAU)],true),
  cone:()=>gridMesh(40,12,(u,v)=>[(1-v)*Math.cos(u*TAU),v*2-1,(1-v)*Math.sin(u*TAU)],true),
  ico:()=>gridMesh(10,7,(u,v)=>{const a=u*TAU,b=v*Math.PI;return [Math.sin(b)*Math.cos(a),Math.cos(b),Math.sin(b)*Math.sin(a)];},true),
  pyramid:()=>({verts:[[0,1,0],[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]],faces:[[0,1,2],[0,2,3],[0,3,4],[0,4,1],[1,3,2],[1,4,3]]}),
  tetrahedron:()=>({verts:[[1,1,1],[-1,-1,1],[-1,1,-1],[1,-1,-1]],faces:[[0,1,2],[0,3,1],[0,2,3],[1,3,2]]}),
  frame:()=>{const t=.08,bars=[];for(const a of [-1,1])for(const b of [-1,1])bars.push(box([0,a,b],[1,t,t]),box([a,0,b],[t,1,t]),box([a,b,0],[t,t,1]));return joinMeshes(bars);},
  terrain:()=>gridMesh(28,28,(u,v)=>{const x=u*2-1,z=v*2-1;return [x,.22*Math.sin(x*5)*Math.cos(z*4)+.12*Math.sin((x+z)*9),z];}),
  dna:()=>joinMeshes([0,Math.PI].map(off=>gridMesh(72,8,(u,v)=>{const t=u*TAU*2+off,a=v*TAU,r=.09;return [.45*Math.cos(t)+r*Math.cos(a)*Math.cos(t),u*2-1+r*Math.sin(a),.45*Math.sin(t)+r*Math.cos(a)*Math.sin(t)];},false,true)))
};
function withNormals(m){
  const nm=m.verts.map(()=>[0,0,0]);
  for(const f of m.faces){const [A,B,C]=f.map(i=>m.verts[i]),e1=[B[0]-A[0],B[1]-A[1],B[2]-A[2]],e2=[C[0]-A[0],C[1]-A[1],C[2]-A[2]],c=[e1[1]*e2[2]-e1[2]*e2[1],e1[2]*e2[0]-e1[0]*e2[2],e1[0]*e2[1]-e1[1]*e2[0]];for(const i of f)for(let k=0;k<3;k++)nm[i][k]+=c[k];}
  return {...m,normals:nm.map(v=>{const l=Math.hypot(v[0],v[1],v[2])||1;return [v[0]/l,v[1]/l,v[2]/l];})};
}
export const shapeMesh=name=>SHAPE_MESHES[name]?(meshCache[name]||=withNormals(SHAPE_MESHES[name]())):null;
// What a 3D Object hands a Cloner: a clone shape the original knows, else a mesh.
const CLONE_SHAPES=new Set(PRIMITIVES.map(p=>p[0]));
// 3D text: the page builds the extruded letters (it needs a canvas); meshes are cached per text, font and depth.
let textMesher=null;export const setTextMesher=fn=>{textMesher=fn;};
export const textMesh=p=>textMesher?.(p.words??'SOUND',p.font3d??'Impact',p.depth??30)||null;
export function objectOf(p,modelMesh){
  const prim={shape:p.mode,size:p.size,detail:p.detail,stretchX:p.stretchX,stretchY:p.stretchY,stretchZ:p.stretchZ,prim:true};
  if(p.mode==='model')return {...prim,prim:false,mesh:withMaterials(modelMesh,p.modelMaterials!=='palette')||'knot'};
  if(p.mode==='text3d')return {...prim,prim:false,mesh:textMesh(p)?.norm||'knot'};
  if(CLONE_SHAPES.has(p.mode))return prim;
  return {...prim,prim:false,mesh:shapeMesh(p.mode)};
}
export function engineSpec(n){
  const p=n.props;
  switch(n.type){
    case 'templateMorph':return {mode:'templateMorph'};
    case 'text':return {mode:'text'};
    case 'imageEQ':return {mode:'image',need:'image'};
    case 'videoEQ':return {mode:'video',need:'video'};
    case 'waveform3d':
      if(p.render==='normal')return {mode:'simcloner',single:true};
      if(p.render==='points'&&p.mode==='model')return {mode:'simsplat',mesh:true};
      return {mode:p.mode,classicObject:true,poly:p.render==='polygons',sceneObject:objectOf(p),objectKey:p.mode==='text3d'?JSON.stringify([p.words,p.font3d,p.depth]):''};
    case 'splat':return {mode:'simsplat',splat:true};
    case 'cloner':return {mode:'simcloner'};
    default:return {mode:p.mode};
  }
}
export const MEDIA_KIND={splat:'splat',imageEQ:'image',videoEQ:'video'};
export const mediaKind=n=>n.type==='waveform3d'?(n.props.mode==='model'?'object':undefined):MEDIA_KIND[n.type];
export function nodeTitle(n){return TYPES[n.type].props.mode?.kind==='select'&&isEngine(n.type)?emitterNames[n.props.mode]:TYPES[n.type].label;}
// A 'visual' input (Palette, Hue shift) takes a shape or an image.
// 'any' (Amplify) passes through whatever is wired into it.
export const compatible=(out,input)=>out===input||out==='any'||input==='any'||(out==='shape'&&input==='image')||(input==='visual'&&(out==='shape'||out==='image'))||(input==='source'&&['shape','image','object3d'].includes(out));
export const clone = value => JSON.parse(JSON.stringify(value));
const uid=()=>crypto.randomUUID();
// Water ripples read best with short ticks.
export const WATER_HEIGHT=10;
export function defaults(type){return Object.fromEntries(Object.entries(TYPES[type].props).map(([k,v])=>[k,clone(v.value)]));}
export function node(type,x=40,y=50,props={}) {
  if (!Object.hasOwn(TYPES,type)) throw Error('Unknown node type');
  const p={...defaults(type),...props};
  if(type==='waveform2d'&&p.mode==='water'&&props.height===undefined)p.height=WATER_HEIGHT;
  return {id:uid(),type,x,y,props:type==='palette'?legacyPalette(p):p};
}
export function layer(index=1) {
  const sound=node('audioIn',40,70),emitter=index===1?node('gpuParticles',250,70):node('waveform2d',250,70),pal=node('palette',460,70),merge=node('merge',670,70),output=node('output',880,70);
  return {id:uid(),name:`Layer ${index}`,visible:true,opacity:1,blend:'source-over',nodes:[sound,emitter,pal,merge,output],edges:[
    {from:sound.id,out:'audio',to:emitter.id,input:'audio'},
    {from:emitter.id,out:'shape',to:pal.id,input:'shape'},
    {from:pal.id,out:'shape',to:merge.id,input:'a',auto:true},
    {from:merge.id,out:'image',to:output.id,input:'image'}
  ]};
}
export const VERSION=21;
export function project() { return {format:'audiograph-pro',version:VERSION,settings:clone(SCENE_DEFAULTS),layers:[layer()]}; }
export function routeVisual(g,source,out){
  const output=g.nodes.find(n=>n.type==='output');if(!output)return;
  const reachable=new Set([source.id]);
  for(let size=-1;size!==reachable.size;){size=reachable.size;for(const e of g.edges)if(reachable.has(e.from))reachable.add(e.to);}
  if(reachable.has(output.id))return;
  const edge=g.edges.find(e=>e.to===output.id&&e.input==='image'),root=g.nodes.find(n=>n.id===edge?.from);
  const background=source.type==='background'&&edge&&!(root?.type==='merge'&&!g.edges.some(e=>e.to===root.id));
  let merge=!background&&root?.type==='merge'?root:null;
  let slot=merge&&['a','b','c','d'].find(k=>(merge.props[k]??1)>0&&!g.edges.some(e=>e.to===merge.id&&e.input===k));
  if(!slot){
    merge=node('merge',output.x,output.y);
    output.x+=210;g.nodes.push(merge);
    if(edge){g.edges=g.edges.filter(e=>e!==edge);g.edges.push({...edge,to:merge.id,input:background?'b':'a'});}
    g.edges.push({from:merge.id,out:'image',to:output.id,input:'image'});
    slot=edge&&!background?'b':'a';
  }
  g.edges.push({from:source.id,out,to:merge.id,input:slot,auto:true});
}
function legacyCameras(raw){
  return (raw.layers||[]).flatMap(g=>(g.nodes||[]).filter(n=>n.type==='camera3d'&&!n.bypass).map(n=>{
    const queue=[{id:n.id,distance:0}],seen=new Set([n.id]),outputs=new Set((g.nodes||[]).filter(n=>n.type==='output').map(n=>n.id));
    for(let i=0;i<queue.length;i++){
      const item=queue[i];if(outputs.has(item.id))return {n,g,distance:item.distance};
      for(const e of g.edges||[])if(e.from===item.id&&!seen.has(e.to)){seen.add(e.to);queue.push({id:e.to,distance:item.distance+1});}
    }
    return {n,g,distance:Infinity};
  }));
}
function primaryCamera(cameras){
  return cameras.filter(({g,distance})=>g.visible&&g.opacity>0&&Number.isFinite(distance)).sort((a,b)=>a.distance-b.distance)[0]||
    cameras.find(({distance})=>Number.isFinite(distance));
}
export function legacyCameraNotice(raw){
  if(raw.settings?.camera)return '';
  const cameras=legacyCameras(raw),primary=primaryCamera(cameras);
  if(!primary)return '';
  const signature=n=>JSON.stringify(Object.keys(TYPES.camera3d.props).map(k=>n.props?.[k]??TYPES.camera3d.props[k].value));
  const conflict=cameras.some(({n})=>signature(n)!==signature(primary.n));
  const bindings=cameras.some(({n,g})=>n.auto?.length||Object.keys(n.midi||{}).length||g.edges?.some(e=>e.to===n.id&&e.input!=='shape'));
  return [conflict?`Conflicting legacy cameras: using the camera from ${primary.g.name} in Scene settings.`:'',
    bindings?'Legacy camera automation bindings need reassignment; use scene camera movement and audio influence.':''].filter(Boolean).join(' ');
}
export const LIMITS={layers:4,nodes:60,edges:160,emitters:8};
export const LAYER_BLENDS=['source-over','screen','lighter','multiply','difference','overlay'];
function finite(value,min,max,label) {
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw Error(`${label} must be between ${min} and ${max}`);
  return value;
}
function id(value) {if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(value))throw Error('Invalid ID');return value;}
// The real type on a pass-through ('any') output: whatever feeds the node, followed upstream.
export function resolveOut(graph,n,out,seen=new Set()){
  const t=TYPES[n.type].outputs[out];if(t!=='any'||seen.has(n.id))return t;seen.add(n.id);
  const e=graph.edges.find(e=>e.to===n.id&&inputsOf(n.type)[e.input]==='any'),src=e&&graph.nodes.find(m=>m.id===e.from);
  return src?resolveOut(graph,src,e.out,seen):'any';
}
export function order(graph) {
  const nodes=new Map(graph.nodes.map(n=>[n.id,n])), indegree=new Map(graph.nodes.map(n=>[n.id,0])), adjacency=new Map(graph.nodes.map(n=>[n.id,[]])), occupied=new Set();
  for(const e of graph.edges) {
    const from=nodes.get(e.from),to=nodes.get(e.to);
    if(!from||!to)throw Error('Connection references a missing node');
    if(e.from===e.to)throw Error('A node cannot connect to itself');
    const sourcePorts=TYPES[from.type].outputs,input=portType(to,e.input);
    if(!Object.hasOwn(sourcePorts,e.out)||!input)throw Error('Connection references a missing port');
    const out=resolveOut(graph,from,e.out);
    if(!compatible(out,input))throw Error(`Type mismatch: ${out} cannot connect to ${input}`);
    const key=e.to+':'+e.input;
    if(occupied.has(key))throw Error('An input can have only one connection');
    occupied.add(key);indegree.set(to.id,indegree.get(to.id)+1);adjacency.get(from.id).push(to.id);
  }
  const queue=graph.nodes.filter(n=>indegree.get(n.id)===0), result=[];
  for(let i=0;i<queue.length;i++) {
    const n=queue[i];result.push(n);
    for(const next of adjacency.get(n.id)){indegree.set(next,indegree.get(next)-1);if(indegree.get(next)===0)queue.push(nodes.get(next));}
  }
  if(result.length!==graph.nodes.length)throw Error('Cycle rejected. Use Trails / Feedback for feedback looks.');
  return result;
}
const OPT_KEY=/^[a-zA-Z0-9_]{1,40}$/;
function cleanProp(s,v,label){
  if(v===undefined)return clone(s.value);
  if(s.kind==='number')return finite(v,s.min,s.max,label);
  if(s.kind==='select'){if(!s.choices.includes(v))throw Error(`Invalid ${label}`);return v;}
  if(s.kind==='bool'){if(typeof v!=='boolean')throw Error(`${label} must be on or off`);return v;}
  if(s.kind==='color'){if(typeof v!=='string'||!/^#[0-9a-fA-F]{6}$/.test(v))throw Error(`${label} must be a #rrggbb color`);return v.toLowerCase();}
  if(s.kind==='stops'){
    if(!Array.isArray(v)||v.length<2||v.length>MAX_STOPS)throw Error(`${label}: 2–${MAX_STOPS} colours`);
    return v.map(x=>{const c=typeof x==='string'?x:x?.c;if(typeof c!=='string'||!/^#[0-9a-fA-F]{6}$/.test(c))throw Error(`${label} must be #rrggbb colours`);const o={c:c.toLowerCase(),auto:typeof x==='object'&&x.auto===true};if(typeof x?.a==='number'&&Number.isFinite(x.a))o.a=Math.max(0,Math.min(1,x.a));return o;});
  }
  if(s.kind==='dict'){
    if(!v||typeof v!=='object'||Array.isArray(v))throw Error(`Invalid ${label}`);
    const out={},entries=Object.entries(v);if(entries.length>s.limit)throw Error(`Too many ${label}`);
    for(const [k,x] of entries){
      if(!OPT_KEY.test(k))throw Error(`Invalid ${label} key`);
      if(s.valueKind==='number'){if(typeof x!=='number'||!Number.isFinite(x)||Math.abs(x)>1e6)throw Error(`Invalid ${label} value`);}
      else if(typeof x!=='string'||x.length>40)throw Error(`Invalid ${label} value`);
      out[k]=x;
    }
    return out;
  }
  if(s.kind==='look')return cleanLook(v);
  if(typeof v!=='string'||v.length>s.max)throw Error(`Invalid ${label}`);return v;
}
function legacyParticleOptions(p){
  if(p.mode!=='simparticles'||p.space!=='3d')return p;
  if(p.opts!==undefined&&(!p.opts||typeof p.opts!=='object'||Array.isArray(p.opts)))return p;
  const opts={...p.opts};
  if(typeof p.particleInitialSpeed==='number'&&Number.isFinite(p.particleInitialSpeed)&&p.particleInitialSpeed!==100){
    const speed=opts.pSpSpeed??p.look?.pSpSpeed??10;
    if(typeof speed==='number'&&Number.isFinite(speed))opts.pSpSpeed=Math.max(0,Math.min(400,speed*p.particleInitialSpeed/100));
  }
  if(p.particleTrails===false)opts.pSpTrail=0;
  return {...p,opts};
}
// A template look is a set of original layer parameters. Values are plain numbers, booleans, short tokens,
// colour lists and two small option objects. Math expressions are code in the original renderer, so only
// the ones shipped with its built-in presets are accepted.
export const SAFE_FN=new Set(['t * W','t*W','H/2 + Math.sin(t * Math.PI * 4) * H/3 * v','H/2 + Math.sin(t*Math.PI*5 + i*Math.PI) * v * H/3','W/2 + Math.sin(t * Math.PI * 6) * W/3','Math.cos(i*137.508*Math.PI/180) * v * H/2 + H/2']);
const TOKEN=/^[A-Za-z0-9#_.-]{0,24}$/;
function lookValue(k,x,depth){
  if(typeof x==='number'){if(!Number.isFinite(x)||Math.abs(x)>1e6)throw Error('Invalid look value');return x;}
  if(typeof x==='boolean')return x;
  if(typeof x==='string'){
    if(k==='customFnX'||k==='customFnY'){if(!SAFE_FN.has(x))throw Error('Custom math expressions are not imported');return x;}
    if(k==='textLayoutInput'){if(x.length>40||/[<>]/.test(x))throw Error('Invalid look text');return x;}
    if(!TOKEN.test(x))throw Error('Invalid look value');return x;
  }
  if(Array.isArray(x)){if(depth||x.length>16)throw Error('Invalid look list');return x.map(y=>{if(typeof y==='number'&&Number.isFinite(y))return y;if(typeof y==='string'&&TOKEN.test(y))return y;throw Error('Invalid look list');});}
  if(x&&typeof x==='object'&&!depth&&(k==='_postFx'||k==='_sim'))return cleanLook(x,1);
  throw Error('Invalid look value');
}
function cleanLook(v,depth=0){
  if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid template look');
  const entries=Object.entries(v);if(entries.length>200)throw Error('Template look is too large');
  const out={};for(const [k,x] of entries){if(!OPT_KEY.test(k))throw Error('Invalid look key');out[k]=lookValue(k,x,depth);}
  return out;
}
// Version 1 (stage 1 prototype): emitter output was "image"; legacy emitter props are dropped.
// Version 2: one "emitter" type for every renderer and a "spectrum" (EQ gains) port.
// Version 3 splits renderers into Inputs and Emitters and carries real audio on "audio" ports.
const V2_MODE={...Object.fromEntries(Object.entries(MODES).flatMap(([type,list])=>list.map(([m])=>[m,{type,props:{mode:m}}]))),
  image:{type:'image',props:{render:'lines'}},pixelwarp:{type:'image',props:{render:'warp'}},video:{type:'video',props:{render:'lines'}},
  simboids:{type:'gpuParticles',props:{mode:'simparticles'}},simferro:{type:'gpuParticles',props:{mode:'simfluid'}},
  text:{type:'text',props:{}},object:{type:'object',props:{render:'mesh'}},simsplat:{type:'splat',props:{}},simcloner:{type:'gpuParticles',props:{mode:'simcloner'}}};
function migrate(raw){
  if(raw.version===VERSION&&Array.isArray(raw.layers)&&!raw.layers.some(g=>Array.isArray(g?.nodes)&&g.nodes.some(n=>n?.type==='camera3d')))return raw;
  const out=clone(raw);
  for(const g of out.layers||[]){
    const nodes=Array.isArray(g?.nodes)?g.nodes:[],edges=Array.isArray(g?.edges)?g.edges:[],emitters=new Set(nodes.filter(n=>n?.type==='emitter').map(n=>n.id));
    if(out.version===1){
      for(const e of edges)if(e&&emitters.has(e.from)&&e.out==='image')e.out='shape';
      for(const nd of nodes)if(nd?.type==='emitter'&&nd.props){delete nd.props.energy;delete nd.props.size;delete nd.props.hue;}
      if(g.blend===undefined)g.blend='source-over';
    }
    for(const nd of nodes){
      if(nd?.type!=='emitter'||!nd.props)continue;
      const to=V2_MODE[nd.props.mode];if(!to)throw Error('Unknown emitter type '+String(nd.props.mode).slice(0,30));
      const props={...nd.props,...to.props},chips={...(props.chips||{})};
      // The old Video / Pixel warp "Source" chip becomes the node type (chip group 0 in both panels).
      if(['video','pixelwarp'].includes(nd.props.mode)){const src=chips['0'];delete chips['0'];if(src==='Camera'){nd.type='camera';props.render=nd.props.mode==='video'?'lines':'warp';}else if(src==='Video'){nd.type='video';props.render='warp';}else nd.type=to.type;}
      else nd.type=to.type;
      props.chips=chips;nd.props=props;
    }
    for(const e of edges){if(!e)continue;if(e.input==='spectrum')e.input='audio';if(e.out==='spectrum')e.out='audio';}
  }
  if(raw.version<6)for(const g of out.layers||[])foldGeometry(g);
  // Version 5: the Amplify deformer became the pass-through Amplify node (Amount → Gain).
  if(raw.version<5)for(const g of out.layers||[]){
    const amps=new Set();for(const nd of g?.nodes||[])if(nd?.type==='amplify'&&nd.props&&'amount' in nd.props){amps.add(nd.id);nd.props={gain:Math.max(0,Math.min(8,+nd.props.amount||1))};}
    for(const e of g?.edges||[]){if(!e)continue;if(amps.has(e.to)&&e.input==='shape')e.input='in';else if(amps.has(e.to)&&e.input==='amount')e.input='gain';if(amps.has(e.from)&&e.out==='shape')e.out='out';}
  }
  if(raw.version<6)for(const g of out.layers||[])extractForces(g);
  if(raw.version<7)for(const g of out.layers||[])extractMotion(g);
  if(raw.version<8)for(const g of out.layers||[])dropRetired(g);
  if(raw.version<9)for(const g of out.layers||[])splitCloner(g);
  if(raw.version<10)for(const g of out.layers||[])unifyObjects(g);
  if(raw.version<11)for(const g of out.layers||[])mediaInputs(g);
  if(raw.version<12)for(const g of out.layers||[])randomAxes(g);
  if(raw.version<13)for(const g of out.layers||[])for(const nd of g?.nodes||[])if(nd?.type==='spin'&&typeof nd.props?.spin==='number'&&nd.props.spin<0)Object.assign(nd.props,spinProps(nd.props.spin));
  // Version 14: Glitch left the deformers for Post FX; its shape wires become image wires.
  if(raw.version<14)for(const g of out.layers||[]){const ids=new Set((g?.nodes||[]).filter(nd=>nd?.type==='glitch').map(nd=>nd.id));
    for(const e of g?.edges||[]){if(!e)continue;if(ids.has(e.to)&&e.input==='shape')e.input='image';if(ids.has(e.from)&&e.out==='shape')e.out='image';}}
  // Version 15: wired emitter size is measured against the source, with 100% at its original size.
  if(raw.version<15)for(const g of out.layers||[]){
    const wired=new Set((g?.edges||[]).filter(e=>e?.input==='emit').map(e=>e.to));
    for(const nd of g?.nodes||[])if(nd?.type==='gpuParticles'&&wired.has(nd.id)){
      for(const options of [nd.props?.look,nd.props?.opts])
        if(Number.isFinite(options?.pEmitScale))options.pEmitScale=Math.round(options.pEmitScale*100/65);
    }
  }
  // Version 16: older 3D Fluid scenes that omit settings keep the original look.
  if(raw.version<16){
    const oldFluid={fluidResolution:48,fluidDomain:220,fluidRate:180,fluidSpeed:100,fluidSwirl:80,fluidFade:72};
    for(const g of out.layers||[])for(const nd of g?.nodes||[]){
      if(nd?.type==='gpuParticles'&&nd.props?.mode==='simfluid3d')nd.props={...oldFluid,...nd.props};
    }
  }
  if(raw.version<18)for(const g of out.layers||[])for(const n of [...g.nodes]){
    if(!n.props?.rigidBody)continue;
    const gravity=n.props.bodyGravity??9.81,edges=g.edges.filter(e=>e.from===n.id&&e.out==='shape');
    if(gravity&&edges.length){
      const force=node('gravity',(n.x||0)+210,n.y||0,{rigid:gravity});g.nodes.push(force);
      for(const e of edges)e.from=force.id;
      g.edges.push({from:n.id,out:'shape',to:force.id,input:'shape'});
    }
    delete n.props.bodyGravity;
  }
  if(raw.version<19)for(const g of out.layers||[]){
        for(const fx of g.nodes.filter(n=>n.type==='soundEffector')){
          if(Number.isFinite(fx.props?.rotate)){fx.props.rotateX??=fx.props.rotate*.5;fx.props.rotateY??=fx.props.rotate;fx.props.rotateZ??=0;delete fx.props.rotate;}
          for(const e of g.edges)if(e.to===fx.id&&e.input==='rotate')e.input='rotateY';
          if(fx.auto)fx.auto=fx.auto.map(k=>k==='rotate'?'rotateY':k);
        }
        for(const source of [...g.nodes].filter(n=>n.type==='waveform3d'||n.type==='cloner')){
          const outgoing=g.edges.filter(e=>e.from===source.id&&e.out==='shape');
          if(!outgoing.length)continue;
          let fx=g.nodes.find(n=>n.type==='soundEffector'&&outgoing.some(e=>e.to===n.id));
          if(!fx){fx=node('soundEffector',(source.x||0)+210,source.y||0,{moveX:0,moveY:0,moveZ:0,scaleX:0,scaleY:0,scaleZ:0});g.nodes.push(fx);
            for(const e of outgoing)e.from=fx.id;g.edges.push({from:source.id,out:'shape',to:fx.id,input:'shape'});}
          fx.props={...fx.props};
          const moveAuto=(old,key)=>{
            if(!source.auto?.includes(old))return;
            fx.auto=[...new Set([...(fx.auto||[]),key])];source.auto=source.auto.filter(k=>k!==old);
          };
          for(const [key,param] of [['sensitivity','pSimSens'],['attack','pSimAttack'],['release','pSimRelease'],['bass','pSimBass'],['energy','pSimEnergy'],['burst','pSimBurst'],['spectrumTilt','pSimTilt']]){
            const value=source.props?.opts?.[param]??source.props?.look?.[param];
            if(Number.isFinite(value))fx.props[key]=value;
            moveAuto('opt:'+param,key);
            for(const e of g.edges)if(e.to===source.id&&e.input==='opt:'+param){e.to=fx.id;e.input=key;}
            if(source.props?.opts)delete source.props.opts[param];
            if(source.props?.look)delete source.props.look[param];
          }
          for(const [old,key] of [['intensity','intensity'],['punch','punch'],['release','responseRelease'],['dynamics','dynamics'],['soundForce','soundForce']]){
            if(Number.isFinite(source.props?.[old]))fx.props[key]=source.props[old];
            moveAuto(old,key);
            for(const e of g.edges)if(e.to===source.id&&e.input===old){e.to=fx.id;e.input=key;}
          }
        }
  }
  const primary=primaryCamera(legacyCameras(out));
  if(!out.settings?.camera&&primary)out.settings={...out.settings,camera:{...defaults('camera3d'),...primary.n.props}};
  if(raw.version<20){
    const c={...SCENE_CAMERA,...out.settings?.camera},f=c.focal/28;
    for(const g of out.layers||[])for(const n of g.nodes||[])if(n.type==='waveform3d'||n.type==='cloner'){
      const p=n.props||={},wired=new Set((g.edges||[]).filter(e=>e.to===n.id).map(e=>e.input));
      if(!wired.has('x')&&!wired.has('y')&&!n.auto?.some(k=>k==='x'||k==='y')){
        const zoom=out.settings?.camera?.zoom??(raw.version<17&&n.type==='waveform3d'?55:100),
          camera={distance:0.78/Math.sin(.4)*.92*f/Math.max(.0001,zoom/100),f,aspect:16/9,yaw:c.turn*Math.PI/180,tilt:c.tilt*Math.PI/180};
        const position=legacyPosition(p.x||0,p.y||0,camera);
        for(const [i,a] of ['X','Y','Z'].entries())p['move'+a]??=position[i];
        p.x=0;p.y=0;
      }
      if(n.type==='cloner'&&!wired.has('scale')&&!n.auto?.includes('scale'))p.scale=(p.scale??100)**2/100;
    }
  }
  for(const g of out.layers||[])for(const camera of (g.nodes||[]).filter(n=>n.type==='camera3d')){
    const source=g.edges?.find(e=>e.to===camera.id&&e.input==='shape');
    g.edges=(g.edges||[]).filter(e=>e.to!==camera.id).flatMap(e=>e.from!==camera.id?[e]:source?[{...e,from:source.from,out:source.out}]:[]);
    g.nodes=g.nodes.filter(n=>n!==camera);
  }
  out.version=VERSION;return out;
}
// Version 12: the Random effector's single Tilt became rotation on each axis (wires and Auto go to Y).
function randomAxes(g){
  if(!Array.isArray(g?.nodes)||!Array.isArray(g.edges))return;
  for(const nd of g.nodes){
    if(nd?.type!=='randomEffector'||!nd.props)continue;
    if('tilt' in nd.props){const t=nd.props.tilt;delete nd.props.tilt;if(typeof t==='number')for(const k of ['rotX','rotY','rotZ'])nd.props[k]=t;}
    for(const e of g.edges)if(e&&e.to===nd.id&&e.input==='tilt')e.input='rotY';
    if(Array.isArray(nd.auto))nd.auto=nd.auto.map(a=>a==='tilt'?'rotY':a);
  }
}
// Version 11: Image, Video and Camera stopped being renderers. They output an image (plus palette and numbers);
// their old "shape" wires become image wires where the target takes one, other wires into them are dropped.
const MEDIA_TYPES=new Set(['image','video','camera']);
function mediaInputs(g){
  if(!Array.isArray(g?.nodes)||!Array.isArray(g.edges))return;
  const media=new Set(),types=new Map(g.nodes.filter(Boolean).map(n=>[n.id,n.type]));
  for(const nd of g.nodes)if(nd&&MEDIA_TYPES.has(nd.type)){media.add(nd.id);nd.props=defaults(nd.type);}
  const added=[],emitters=new Map();
  g.edges=g.edges.filter(e=>{
    if(!e)return false;
    if(media.has(e.to))return e.input==='audio';
    if(!media.has(e.from))return true;
    const t=TYPES[types.get(e.to)]?.inputs?.[e.input];
    // A media shape used to be drawn as lines: keep the layer alive with particles emitted from the picture.
    if(e.out==='shape'&&t==='shape'){
      let id=emitters.get(e.from);
      if(!id){
        const src=g.nodes.find(n=>n?.id===e.from),aud=g.edges.find(x=>x?.to===e.from&&x.input==='audio');
        id=e.from+'_particles';emitters.set(e.from,id);
        g.nodes.push({id,type:'gpuParticles',x:(+src.x||0)+40,y:(+src.y||0)+180,props:defaults('gpuParticles')});
        added.push({from:e.from,out:'image',to:id,input:'emit'});
        if(aud)added.push({from:aud.from,out:aud.out,to:id,input:'audio'});
      }
      e.from=id;return true;
    }
    if(e.out==='shape')e.out='image';
    return !!t&&compatible(TYPES[types.get(e.from)].outputs[e.out]||'none',t);
  });
  g.edges.push(...added);
}
// Version 10: Primitive, 3D Object (OBJ) and the 3D waveforms became one 3D Object node with a Render mode.
function unifyObjects(g){
  for(const nd of Array.isArray(g?.nodes)?g.nodes:[]){
    if(!nd?.props)continue;
    if(nd.type==='primitive'){const {shape,...rest}=nd.props;nd.type='waveform3d';nd.props={...rest,mode:shape||'sphere',render:'normal'};}
    else if(nd.type==='object'){nd.type='waveform3d';nd.props={...nd.props,mode:'model',render:nd.props.render==='cloud'?'points':'waveform'};}
    else if(nd.type==='waveform3d'&&!nd.props.render)nd.props.render='waveform';
  }
}
// Version 8: Boids and Ferrofluid were retired (they become Particles and Fluid) along with the Flocking force.
const RETIRED_MODE={simboids:'simparticles',simferro:'simfluid'};
function dropRetired(g){
  if(!Array.isArray(g?.nodes)||!Array.isArray(g.edges))return;
  for(const nd of g.nodes)if(nd?.type==='gpuParticles'&&RETIRED_MODE[nd.props?.mode]){nd.props.mode=RETIRED_MODE[nd.props.mode];delete nd.props.opts;}
  for(const old of g.nodes.filter(n=>n?.type==='flocking')){
    const into=g.edges.find(e=>e&&e.to===old.id&&e.input==='shape');
    g.edges=g.edges.filter(e=>e&&e.to!==old.id);
    for(const e of g.edges)if(e.from===old.id&&into){e.from=into.from;e.out=into.out;}
    g.edges=g.edges.filter(e=>e.from!==old.id);g.nodes=g.nodes.filter(n=>n!==old);
  }
}
// Version 9: the 3D Cloner left WebGPU particles for the 3D category: a Primitive wired into a Cloner node,
// with effectors, material, light and camera as nodes after it (moved there by extractForces).
const G3_SHAPE_LABEL=Object.fromEntries(PRIMITIVES.map(([k,l])=>[l,k])),G3_LAYOUT_LABEL=Object.fromEntries(CLONER_LAYOUTS.map(([k,l])=>[l,k]));
const PRIM_KEYS={pG3Size:'size',pG3Detail:'detail',pG3ObjX:'stretchX',pG3ObjY:'stretchY',pG3ObjZ:'stretchZ'};
function splitCloner(g){
  if(!Array.isArray(g?.nodes)||!Array.isArray(g.edges))return;
  for(const c of g.nodes.filter(n=>n?.type==='gpuParticles'&&n.props?.mode==='simcloner')){
    extractForces(g);
    const opts=c.props.opts||{},chips=c.props.chips||{},keyOf=Object.fromEntries(Object.entries(TYPES.cloner.props).filter(([,s])=>s.key).map(([k,s])=>[s.key,k]));
    const props={},prim={id:`${c.id}_obj`.slice(0,60),type:'primitive',x:(c.x||0)-220,y:(c.y||0)+140,props:{}};
    for(const [k,v] of Object.entries(opts)){if(keyOf[k])props[keyOf[k]]=v;else if(PRIM_KEYS[k])prim.props[PRIM_KEYS[k]]=v;}
    for(const label of Object.values(chips)){if(G3_LAYOUT_LABEL[label])props.layout=G3_LAYOUT_LABEL[label];if(G3_SHAPE_LABEL[label])prim.props.shape=G3_SHAPE_LABEL[label];}
    for(const [k,s] of Object.entries({shape:{value:'sphere'},...PRIM_PROPS}))if(prim.props[k]===undefined)prim.props[k]=s.value;
    for(const [k,s] of Object.entries(TYPES.cloner.props))if(props[k]===undefined)props[k]=s.value;
    c.type='cloner';c.props=props;
    for(const e of g.edges)if(e&&e.to===c.id&&typeof e.input==='string'&&e.input.startsWith('opt_')){const k=e.input.slice(4);if(keyOf[k])e.input=keyOf[k];}
    g.edges=g.edges.filter(e=>!(e&&e.to===c.id&&typeof e.input==='string'&&e.input.startsWith('opt_')));
    if(Array.isArray(c.auto))c.auto=c.auto.map(a=>typeof a==='string'&&a.startsWith('opt:')&&keyOf[a.slice(4)]?keyOf[a.slice(4)]:a).filter(a=>TYPES.cloner.props[a]);
    g.nodes.push(prim);g.edges.push({from:prim.id,out:'object',to:c.id,input:'object'});
  }
}
// Simulation knobs that belong to a Forces / Noise node, by simulation: {mode: {knob key: [node type, prop]}}.
export const FORCE_KNOBS={};
for(const [t,T] of Object.entries(TYPES))for(const [k,s] of Object.entries(T.props))for(const m of s.sims||[])(FORCE_KNOBS[m]||={})[s.key]=[t,k];
// Old cloner projects kept one random tilt; it becomes Tilt on the Random effector, then rotation on every axis (version 12).
FORCE_KNOBS.simcloner.pG3RndRot=['randomEffector','tilt'];
// Version 7: Spin / Speed and Symmetry / Mirror left the renderers for their own nodes, inserted right after the renderer.
const MOTION_PROPS={symmetry:['symmetry','mode'],symGap:['symmetry','gap'],flipH:['mirror','flipH'],flipV:['mirror','flipV'],mirror:['mirror','reflect'],spin:['spin','spin'],speed:['spin','speed']};
function extractMotion(g){
  if(!Array.isArray(g?.nodes)||!Array.isArray(g.edges))return;
  for(const r of g.nodes.filter(n=>TYPES[n?.type]?.engine&&n.props)){
    const vals={};for(const k of Object.keys(MOTION_PROPS))if(r.props[k]!==undefined){vals[k]=r.props[k];delete r.props[k];}
    const wired=g.edges.filter(e=>e&&e.to===r.id&&MOTION_PROPS[e.input]),autos=(Array.isArray(r.auto)?r.auto:[]).filter(a=>MOTION_PROPS[a]);
    const made=new Map(motionNodes(vals).map(([t,p])=>[t,p]));
    for(const k of [...wired.map(e=>e.input),...autos]){const [t,pk]=MOTION_PROPS[k];if(!made.has(t))made.set(t,{});const p=made.get(t);if(p[pk]===undefined&&vals[k]!==undefined)p[pk]=t==='symmetry'&&pk==='mode'&&!SYMS.some(s=>s[0]===vals[k])?'none':vals[k];}
    if(!made.size)continue;
    const chain=[...made].map(([t,p],i)=>{const nd={id:`${r.id}_${t}`.slice(0,60),type:t,x:(r.x||0)+220*(i+1),y:(r.y||0)-140,props:{}};
      for(const [k,s] of Object.entries(TYPES[t].props))nd.props[k]=p[k]??(t==='symmetry'&&k==='mode'?'none':t==='mirror'&&k==='reflect'?false:t==='spin'&&k==='spin'?0:s.value);return nd;});
    for(const e of wired){const [t,pk]=MOTION_PROPS[e.input];e.to=chain.find(n=>n.type===t).id;e.input=pk;}
    if(autos.length){r.auto=r.auto.filter(a=>!MOTION_PROPS[a]);for(const a of autos){const [t,pk]=MOTION_PROPS[a];(chain.find(n=>n.type===t).auto||=[]).push(pk);}}
    const outs=g.edges.filter(e=>e&&e.from===r.id&&e.out==='shape');
    chain.forEach((nd,i)=>{g.nodes.push(nd);g.edges.push({from:i?chain[i-1].id:r.id,out:'shape',to:nd.id,input:'shape'});});
    for(const e of outs)e.from=chain[chain.length-1].id;
  }
}
// Version 6: physics knobs set on a simulation move into Forces nodes inserted right after it.
function extractForces(g){
  if(!Array.isArray(g?.nodes)||!Array.isArray(g.edges))return;
  for(const sim of g.nodes.filter(n=>n?.type==='gpuParticles'&&n.props)){
    const map=FORCE_KNOBS[sim.props.mode];if(!map)continue;
    const opts=sim.props.opts||{},made=new Map();
    const take=key=>{const [t,k]=map[key];if(!made.has(t))made.set(t,{id:`${sim.id}_${t}`.slice(0,60),type:t,x:(sim.x||0)+220*(made.size+1),y:(sim.y||0)+140,props:{}});return [made.get(t),k];};
    for(const key of Object.keys(opts))if(map[key]){const [nd,k]=take(key);nd.props[k]=opts[key];delete opts[key];}
    for(const e of g.edges)if(e&&e.to===sim.id&&typeof e.input==='string'&&map[e.input.slice(4)]&&e.input.startsWith('opt_')){const [nd,k]=take(e.input.slice(4));e.to=nd.id;e.input=k;}
    if(Array.isArray(sim.auto))sim.auto=sim.auto.filter(a=>{if(typeof a!=='string'||!a.startsWith('opt:')||!map[a.slice(4)])return true;const [nd,k]=take(a.slice(4));(nd.auto||=[]).push(k);return false;});
    if(!made.size)continue;
    const chain=[...made.values()],outs=g.edges.filter(e=>e&&e.from===sim.id&&e.out==='shape');
    for(const [i,nd] of chain.entries()){
      for(const [k,s] of Object.entries(TYPES[nd.type].props))if(nd.props[k]===undefined)nd.props[k]=s.value;
      g.nodes.push(nd);g.edges.push({from:i?chain[i-1].id:sim.id,out:'shape',to:nd.id,input:'shape'});
    }
    const last=chain[chain.length-1].id;for(const e of outs){e.from=last;}
  }
}
// Version 4: the Lines, Transform, Motion and Symmetry nodes became renderer properties.
const OLD_GEO={lines:{density:'density',height:'height',thick:'thick',contrast:'contrast',sensitivity:'sensitivity',fade:'fade',varyHeight:'varyHeight',varyThick:'varyThick'},
  transform:{scale:'scale',rotation:'rotation',x:'x',y:'y',tilt:'tilt',turn:'turn',pulse:'pulse'},motion:{spin:'spin',speed:'speed'},
  symmetry:{mode:'symmetry',gap:'symGap',flipH:'flipH',flipV:'flipV',mirror:'mirror'},
  // Version 5: Line style and Outline became waveform properties.
  lineStyle:{shape:'lineShape',size:'styleSize',density:'styleDensity',angle:'styleAngle'},
  outline:{style:'outlineStyle',opacity:'outlineOpacity',weight:'outlineWeight',gap:'outlineGap',count:'outlineCount',spacing:'outlineSpacing'}};
function foldGeometry(g){
  if(!Array.isArray(g?.nodes)||!Array.isArray(g.edges))return;
  for(const old of g.nodes.filter(n=>OLD_GEO[n?.type])){
    const into=g.edges.find(e=>e&&e.to===old.id&&e.input==='shape');
    // Walk up the shape chain to the renderer that draws it.
    let up=into&&g.nodes.find(n=>n&&n.id===into.from);const seen=new Set();
    while(up&&!TYPES[up.type]?.engine&&!seen.has(up.id)){seen.add(up.id);const e=g.edges.find(e=>e&&e.to===up.id&&e.input==='shape');up=e&&g.nodes.find(n=>n&&n.id===e.from);}
    const map=OLD_GEO[old.type];
    if(up&&TYPES[up.type]?.engine){up.props=up.props||{};for(const [k,to] of Object.entries(map))if(old.props?.[k]!==undefined)up.props[to]=old.props[k];
      if(old.type==='outline')up.props.outline=true;if(old.type==='lineStyle'&&up.props.lineShape===undefined)up.props.lineShape='dotted';
      for(const e of g.edges)if(e&&e!==into&&e.to===old.id&&map[e.input]){e.to=up.id;e.input=map[e.input];}}
    g.edges=g.edges.filter(e=>e&&e.to!==old.id);
    for(const e of g.edges)if(e.from===old.id&&into){e.from=into.from;e.out=into.out;}
    g.edges=g.edges.filter(e=>e.from!==old.id);
    g.nodes=g.nodes.filter(n=>n!==old);
  }
}
// The layer's viewport camera, moved with the mouse in the preview: orbit (degrees), pan (half-frames) and zoom.
export const VIEW_LIMITS={yaw:[-3600,3600],pit:[-180,180],px:[-4,4],py:[-4,4],zm:[.2,6]};
export function cleanView(v){
  if(!v||typeof v!=='object')return null;
  const o={yaw:0,pit:0,px:0,py:0,zm:1};
  for(const [k,[lo,hi]] of Object.entries(VIEW_LIMITS))if(Number.isFinite(v[k]))o[k]=Math.max(lo,Math.min(hi,v[k]));
  return o.yaw||o.pit||o.px||o.py||o.zm!==1?o:null;
}
export const OUTPUT_SIZES=[540,720,1080,1440,2160];
export const VIDEO_QUALITIES=['standard','high','max'];
export const LIVE_FRAME_RATES=[15,24,30];
export const SIM_QUALITIES=[['node','Use node settings'],['low','Low'],['med','Medium'],['high','High'],['ultra','Ultra']];
export const SCENE_PERFORMANCE={fps:30,simulation:'node',lensEffects:true};
export const SCENE_CAMERA_PROPS={
  ...Object.fromEntries(['turn','tilt','zoom','focal','dof','focus','blur'].map(k=>[k,TYPES.camera3d.props[k]])),
  zoom:n('Zoom',8,.01,300,.01,{unit:'%'}),
  motion:pick('Movement','static',CAMERA_MOTIONS.map(([id])=>id),{labels:CAMERA_MOTIONS}),
  speed:n('Speed',20,-100,100,1),range:n('Range',35,0,100,1),height:n('Height',25,0,100,1),audio:n('Audio influence',0,0,100,1),
  px:n('Pan X',0,-4,4,.01),py:n('Pan Y',0,-4,4,.01)
};
export const SCENE_CAMERA=Object.fromEntries(Object.entries(SCENE_CAMERA_PROPS).map(([k,s])=>[k,clone(s.value)]));
export const SCENE_GROUND={enabled:true,visible:true,shadows:true,shape:'square',color:'#000000',height:-1.2,size:20};
export const SCENE_LIGHTING={shadows:true,ambientOcclusion:false,aoStrength:60,aoRadius:1,depthHaze:false,hazeStrength:60,hazeStart:10,hazeEnd:80,hazeColor:'#aeb0b3'};
export const SCENE_DEFAULTS={background:'#000000',camera:SCENE_CAMERA,ground:SCENE_GROUND,lighting:SCENE_LIGHTING,environment:null};
function cleanSceneSettings(s){
  if(s===undefined)s={};
  if(!s||typeof s!=='object'||Array.isArray(s))throw Error('Invalid scene settings');
  const out={camera:{...SCENE_CAMERA}};
  if(s.lighting!==undefined&&(!s.lighting||typeof s.lighting!=='object'||Array.isArray(s.lighting)))throw Error('Invalid scene lighting');
  const light={...SCENE_LIGHTING,shadows:s.ground?.shadows??SCENE_LIGHTING.shadows,...s.lighting};
  for(const k of ['shadows','ambientOcclusion','depthHaze'])if(typeof light[k]!=='boolean')throw Error('Invalid scene lighting: '+k);
  out.lighting={shadows:light.shadows,ambientOcclusion:light.ambientOcclusion,depthHaze:light.depthHaze,
    aoStrength:finite(light.aoStrength,0,100,'AO strength'),aoRadius:finite(light.aoRadius,.05,10,'AO radius'),
    hazeStrength:finite(light.hazeStrength,0,100,'Haze strength'),hazeStart:finite(light.hazeStart,0,500,'Haze start'),
    hazeEnd:finite(light.hazeEnd,.01,1000,'Haze end'),hazeColor:cleanProp(color('Haze colour',SCENE_LIGHTING.hazeColor),light.hazeColor,'Haze colour')};
  if(out.lighting.hazeEnd<=out.lighting.hazeStart)throw Error('Haze end must be farther than haze start');
  if(s.ground!==undefined){
    const g={...SCENE_GROUND,...s.ground};
    if(!s.ground||typeof s.ground!=='object'||Array.isArray(s.ground)||typeof g.enabled!=='boolean'||typeof g.visible!=='boolean'||typeof g.shadows!=='boolean')throw Error('Invalid scene ground');
    if(!['square','circle'].includes(g.shape))throw Error('Invalid ground shape');
    out.ground={enabled:g.enabled,visible:g.visible,shadows:g.shadows,shape:g.shape,color:cleanProp(color('Ground colour',SCENE_GROUND.color),g.color,'Ground colour'),height:finite(g.height,-100,100,'Ground height'),size:finite(g.size,.2,200,'Ground size')};
  }
  if(s.environment!==undefined){
    const e=s.environment;
    if(e===null)out.environment=null;
    else{
      if(!e||typeof e!=='object'||typeof e.name!=='string'||e.name.length>255||typeof e.data!=='string'||e.data.length>96*1024*1024||
        !/^data:[a-zA-Z0-9.+/-]*;base64,[A-Za-z0-9+/]+={0,2}$/.test(e.data))throw Error('Invalid environment lighting');
      out.environment={name:e.name,data:e.data,intensity:finite(e.intensity??1,0,20,'Environment intensity'),rotation:finite(e.rotation??0,-180,180,'Environment rotation')};
      validateEnvironment(out.environment);
    }
  }
  if(s.resolution!==undefined){
    if(!OUTPUT_SIZES.includes(s.resolution))throw Error('Unsupported output resolution');
    out.resolution=s.resolution;
  }
  if(s.background!==undefined)out.background=cleanProp(color('Background','#000000'),s.background,'Background');
  if(s.video!==undefined){
    const v=s.video;
    if(!v||![720,1080,1440,2160].includes(v.height)||![30,60].includes(v.fps)||!VIDEO_QUALITIES.includes(v.quality))throw Error('Invalid video export defaults');
    out.video={height:v.height,fps:v.fps,quality:v.quality};
  }
  if(s.performance!==undefined){
    const p=s.performance;
    if(!p||typeof p!=='object'||Array.isArray(p))throw Error('Invalid scene performance settings');
    const {fps,simulation,lensEffects}={...SCENE_PERFORMANCE,...p};
    if(!LIVE_FRAME_RATES.includes(fps)||!SIM_QUALITIES.some(([key])=>key===simulation)||typeof lensEffects!=='boolean')throw Error('Invalid scene performance settings');
    out.performance={fps,simulation,lensEffects};
  }
  if(s.camera!==undefined){
    if(s.camera!==null){
      if(!s.camera||typeof s.camera!=='object'||Array.isArray(s.camera))throw Error('Invalid scene camera');
      const camera={...s.camera};
      if(camera.motion===undefined&&(camera.orbit!==undefined||camera.orbitSound!==undefined))
        Object.assign(camera,{motion:camera.orbit||camera.orbitSound?'orbit':'static',speed:camera.orbit??0,audio:camera.orbitSound??0});
      out.camera=Object.fromEntries(Object.entries(SCENE_CAMERA_PROPS).map(([k,spec])=>[k,cleanProp(spec,camera[k]??SCENE_CAMERA[k],spec.label)]));
    }
  }
  return out;
}
export function validate(input) {
  if(!input||input.format!=='audiograph-pro'||!(Number.isInteger(input.version)&&input.version>=1&&input.version<=VERSION))throw Error('Expected an Audiograph Pro project');
  const raw=migrate(input);
  if(!Array.isArray(raw.layers)||raw.layers.length<1||raw.layers.length>LIMITS.layers)throw Error('A project needs 1–4 layer graphs');
  const ids=new Set();let emitters=0;
  const unique=value=>{const key=id(value);if(ids.has(key))throw Error('Duplicate ID');ids.add(key);return key;};
  const layers=raw.layers.map(g=>{
    if(!g||typeof g.name!=='string'||g.name.length>80||!g.name.trim())throw Error('Layer name must contain 1–80 characters');
    if(typeof g.visible!=='boolean')throw Error('Layer visibility must be boolean');
    if(!Array.isArray(g.nodes)||g.nodes.length>LIMITS.nodes||!Array.isArray(g.edges)||g.edges.length>LIMITS.edges)throw Error(`Limit: ${LIMITS.nodes} nodes and ${LIMITS.edges} connections per layer`);
    const blend=g.blend??'screen';if(!LAYER_BLENDS.includes(blend))throw Error('Invalid layer blend');
    const clean={id:unique(g.id),name:g.name,visible:g.visible,opacity:finite(g.opacity,0,1,'Opacity'),blend,nodes:[],edges:[]};
    const view=cleanView(g.view);if(view)clean.view=view;
    const lm=cleanMidi(g.midi,k=>k==='opacity'||k==='visible');if(lm)clean.midi=lm;
    clean.nodes=g.nodes.map(nd=>{
      if(!nd||!Object.hasOwn(TYPES,nd.type))throw Error('Unknown node type');
      if(isEngine(nd.type))emitters++;
      if(!nd.props||typeof nd.props!=='object'||Array.isArray(nd.props))throw Error('Node properties are missing');
      const props={},src=nd.type==='palette'?legacyPalette(nd.props):nd.type==='gpuParticles'?legacyParticleOptions(nd.props):nd.props;
      for(const [key,s] of Object.entries(TYPES[nd.type].props))props[key]=cleanProp(s,src[key],s.label);
      const out={id:unique(nd.id),type:nd.type,x:finite(nd.x,-10000,10000,'Node X'),y:finite(nd.y,-10000,10000,'Node Y'),props};
      if(nd.auto!==undefined){
        if(!Array.isArray(nd.auto)||nd.auto.length>64)throw Error('Invalid auto knobs');
        const auto=[...new Set(nd.auto)].filter(k=>typeof k==='string'&&(autoKnob(nd.type,k)));if(auto.length)out.auto=auto;
      }
      if(nd.bypass===true&&nd.type!=='output')out.bypass=true;
      const midi=cleanMidi(nd.midi,k=>midiKnob(nd.type,k));if(midi)out.midi=midi;
      return out;
    });
    if(clean.nodes.filter(nd=>nd.type==='output').length>1)throw Error('Only one Output is allowed per layer');
    clean.edges=g.edges.map(e=>{if(!e)throw Error('Invalid connection');return {from:id(e.from),to:id(e.to),out:id(e.out),input:id(e.input),
      ...(e.auto===true&&['a','b','c','d'].includes(e.input)&&clean.nodes.some(n=>n.id===e.to&&n.type==='merge')&&{auto:true})};});
    order(clean);return clean;
  });
  if(emitters>LIMITS.emitters)throw Error(`Limit: ${LIMITS.emitters} renderer nodes per project (each is an isolated GPU engine)`);
  const mapping=cleanMapping(raw.mapping);
  const settings=cleanSceneSettings(raw.settings);
  return {format:'audiograph-pro',version:VERSION,layers,...(mapping&&{mapping}),...(settings&&{settings})};
}
// MIDI mappings: {knob key: 'cc:<channel>:<number>' | 'note:<channel>:<number>'} on nodes (and layers: opacity, visible).
export const MIDI_BINDING=/^(cc|note):(1[0-6]|[1-9]):(\d{1,3})$/;
function cleanMidi(m,ok){
  if(m===undefined)return null;
  if(!m||typeof m!=='object'||Array.isArray(m)||Object.keys(m).length>64)throw Error('Invalid MIDI mappings');
  const out={};for(const [k,v] of Object.entries(m))if(ok(k)&&typeof v==='string'&&MIDI_BINDING.test(v)&&+v.split(':')[2]<128)out[k]=v;
  return Object.keys(out).length?out:null;
}
// Controls a MIDI knob, fader or pad can drive: number, switch and choice properties, and renderer option knobs.
export function midiKnob(type,key){
  const s=TYPES[type]?.props[key];if(s)return ['number','bool','select'].includes(s.kind);
  return !!TYPES[type]?.engine&&/^opt:[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(key);
}
// Knobs that can run in Auto mode: number properties with a port, and renderer option knobs ("opt:<id>").
export function autoKnob(type,key){
  const s=TYPES[type]?.props[key];if(s)return s.kind==='number'&&!s.noPort;
  return !!TYPES[type]?.engine&&/^opt:[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(key);
}
// Auto drift: every knob wanders on its own random path around its value (±35% of its range).
// Angles (3D tilt and rotate) sway at most ±25°: a wider swing turns the picture edge-on.
export function autoDrift(s,home,seed,clock){
  const amp=s.rad||/tilt|^rot[XYZ]$/i.test(s.key||'')?Math.min(25,(s.max-s.min)*.35):(s.max-s.min)*.35;
  return Math.max(s.min,Math.min(s.max,home+wander(seed,clock)*amp));
}
export function connect(graph,from,out,to,input) {
  const candidate={from,out,to,input},edges=graph.edges.filter(e=>e.to!==to||e.input!==input);
  const trial={...graph,edges:[...edges,candidate]};order(trial);graph.edges=trial.edges;
}
export function filterFor(kind,amount) {
  const a=Math.max(0,Math.min(2,amount));
  return {hue:`hue-rotate(${a*180}deg)`,brightness:`brightness(${a*2})`,saturate:`saturate(${a*3})`,blur:`blur(${a*8}px)`,invert:`invert(${Math.min(1,a)})`}[kind];
}
// Driven knobs: input 0 keeps the knob setting, 1 pushes it to the maximum, -1 to the minimum.
export function modulate(s,base,v){
  if(v===undefined||!Number.isFinite(v))return base;
  const out=v>=0?base+(s.max-base)*Math.min(v,1)+(v>1?(s.max-s.min)*0:0):base+(base-s.min)*Math.max(v,-1);
  return Math.max(s.min,Math.min(s.max,out));
}
// Accumulating keys add up when the same deformer is chained; the rest are overridden downstream.
const ADDITIVE=new Set(['_twist','_bulge','_wave','_shear','_depth','_ripple','_water','_jitter','_rDisorder']);
export function applyShapeNode(type,props,mods){
  const out={...mods};
  const force=TYPES[type].force,gain=force?(props.intensity??100)/100:1;
  if(force&&gain===0)return out;
  if(type==='soundEffector')out._soundEffector=true;
  if(type==='palette'){
    const st=paletteStops(props);
    out._colorMode=props.mode;out._solidColor=props.solid;out._toneStops=st.tone;out._simpleStops=st.simple;
    // A Palette after particles emitted from a picture recolours them instead of keeping the picture's colours.
    if(out._sim?.emitColor==='source')out._sim={...out._sim,emitColor:'palette'};
    return out;
  }
  if(type==='motion'||type==='spin'){out._spin=Math.abs(props.spin)*gain;out._spinDir=(props.spin<0?-1:1)*(props.dir==='left'?-1:1);out._speed=props.speed;return out;}
  if(type==='particles')out._particlesOn=true;
  if(type==='webcam'){out._cam={displace:props.displace,colors:props.colors==='on',dir:props.dir,smooth:props.smooth};return out;}
  for(const [k,s] of Object.entries(TYPES[type].props)){
    if(s.sim){out._sim={...out._sim,[s.sim]:props[k]};continue;}
    if(!s.key)continue;let v=props[k];
    if(force&&typeof v==='number'&&s.key!=='pSpTurbScale'){
      // Rigid damping is a bounded per-second fraction, not an acceleration.
      v=gain===1?v:s.key==='_rigidDrag'?1-Math.pow(1-v,gain):v*gain;
    }
    if(s.rad)v=v*Math.PI/180;
    if(ADDITIVE.has(s.key)&&typeof out[s.key]==='number')out[s.key]+=v;
    else if(s.key==='_amplify'&&typeof out._amplify==='number')out._amplify*=v;
    else out[s.key]=v;
  }
  return out;
}
export function fxSettings(type,props){
  const o={};for(const [k,s] of Object.entries(TYPES[type].props))if(s.key)o[s.key]=props[k];
  if(type==='fracture'){o.pfxFracture=true;}
  return o;
}
