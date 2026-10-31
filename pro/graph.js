// Audiograph Pro graph model: categorized node catalog, typed ports, validation and migration.
export const EMITTERS = {
  General: [['linear','Linear'],['circle','Circle'],['concentric','Concentric'],['spiral','Spiral'],['phyllotaxis','Phyllotaxis'],['fractal','Fractal'],['growth','Growth'],['sacred','Sacred'],['graph','Graph'],['lissajous','Harmonic'],['scatter','Scatter']],
  Simulations: [['simparticles','Particles'],['simfluid','Fluid'],['simsmoke','Smoke'],['simboids','Boids'],['simsand','Granular Sand'],['simferro','Ferrofluid'],['simcloner','3D Cloner']],
  '3D': [['terrain','Terrain'],['sphere','Sphere'],['tetrahedron','Tetrahedron'],['dna','DNA'],['knot','Knot'],['cube','Cube'],['torus','Torus']],
  Input: [['image','Image'],['video','Video'],['simsplat','Gaussian Splat'],['pixelwarp','Pixel Warp'],['text','Text'],['custom','Math'],['object','3D Object (OBJ)']]
};
export const emitterNames = Object.fromEntries(Object.values(EMITTERS).flat());

export const CATEGORIES = [
  {id:'emitters',label:'Emitters',color:'#f59e0b',hint:'Audio-reactive renderers from Audiograph'},
  {id:'geometry',label:'Geometry & Motion',color:'#8aa2ff',hint:'Lines, transform, motion, symmetry'},
  {id:'deformers',label:'Deformers',color:'#c084fc',hint:'Bend the shape'},
  {id:'color',label:'Color',color:'#f472b6',hint:'Palettes and hue'},
  {id:'style',label:'Style',color:'#fbbf24',hint:'Line style and outlines'},
  {id:'particles',label:'Particles',color:'#fb923c',hint:'Particles spawned from the shape'},
  {id:'postfx',label:'Post FX',color:'#22d3ee',hint:'Image effects (GPU shaders)'},
  {id:'controls',label:'Controls',color:'#6ee7b7',hint:'Numbers that move knobs'},
  {id:'audio',label:'Audio',color:'#a3e635',hint:'Sound analysis'},
  {id:'composite',label:'Composite',color:'#dddde0',hint:'Mix and output'}
];
export const PORT_COLORS={number:'#6ee7b7',shape:'#f59e0b',image:'#8aa2ff',spectrum:'#a3e635'};

const n=(label,value,min,max,step=1,extra={})=>({kind:'number',label,value,min,max,step,...extra});
const pick=(label,value,choices,extra={})=>({kind:'select',label,value,choices,...extra});
const bool=(label,value=false,extra={})=>({kind:'bool',label,value,...extra});
const color=(label,value)=>({kind:'color',label,value});
const text=(label,value,max=100)=>({kind:'text',label,value,max});
const dict=(label,limit,valueKind)=>({kind:'dict',label,value:{},limit,valueKind});
const SHAPE_IO={inputs:{shape:'shape'},outputs:{shape:'shape'}};
const FX_IO={inputs:{image:'image'},outputs:{image:'image'}};
const DEFORM=(label,key,min,max,value,description,step=1)=>({category:'deformers',label,description,...SHAPE_IO,props:{amount:n('Amount',value,min,max,step,{key})}});
const FX=(label,description,props)=>({category:'postfx',label,description,...FX_IO,fx:true,props});
const SYMS=[['none','Off'],['x','X'],['y','Y'],['xy','XY'],['r3','3'],['r4','4'],['r6','6'],['r8','8']];
const LINE_SHAPES=[['straight','Straight'],['rounded','Rounded'],['dotted','Dotted'],['dashed','Dashed'],['pins','Pins'],['tapered','Tapered'],['caps','Caps'],['cross','Cross'],['numbers','Numbers'],['symbols','Symbols'],['words','Words'],['cascade','Cascade'],['off','Off']];
const PART_SHAPES=[['circle','Circle'],['square','Square'],['star','Star'],['diamond','Diamond'],['ring','Ring'],['triangle','Triangle'],['spark','Spark'],['line','Line'],['numbers','Numbers'],['symbols','Symbols'],['words','Words']];
export const PALETTES={
  Classic:['#1a1a2e','#e94560','#f5a623','#6ee7b7'],Sunset:['#2d0b3a','#ff4d6d','#ff9e00','#ffe66d'],Ocean:['#03045e','#0077b6','#00b4d8','#caf0f8'],
  Neon:['#10002b','#ff00e5','#00f0ff','#b6ff00'],Fire:['#200000','#c1121f','#ff6d00','#ffd60a'],Ice:['#0b132b','#5bc0be','#a9def9','#ffffff'],
  Forest:['#081c15','#2d6a4f','#74c69d','#d8f3dc'],Mono:['#000000','#555555','#aaaaaa','#ffffff']
};

export const TYPES = {
  // Emitters
  emitter:{category:'emitters',label:'Emitter',description:'An Audiograph renderer. Reacts to the shared audio, or to “drive” when connected.',inputs:{drive:'number',spectrum:'spectrum'},outputs:{shape:'shape'},primary:['drive'],
    props:{mode:pick('Emitter','simfluid',Object.keys(emitterNames)),drive:n('Drive',.7,0,2,.01,{noPort:true}),text:text('Text','AUDIOGRAPH'),opts:dict('Options',120,'number'),chips:dict('Choices',60,'string')}},
  // Geometry & Motion
  lines:{category:'geometry',label:'Lines',description:'Density, height and thickness of the drawn lines.',...SHAPE_IO,props:{
    density:n('Density',350,80,800,10,{key:'_lines'}),height:n('Height',80,5,300,5,{key:'_height'}),thick:n('Thickness',1,.5,15,.25,{key:'_thick'}),
    contrast:n('Contrast',75,5,100,1,{key:'_contrast'}),sensitivity:n('Sensitivity',100,5,200,5,{key:'_sensitivity'}),fade:n('Fade edges',0,0,100,5,{key:'_fadeEdge'}),
    varyHeight:bool('Vary height',true,{key:'_varyHeight'}),varyThick:bool('Vary thickness',false,{key:'_varyThick'})}},
  transform:{category:'geometry',label:'Transform',description:'Scale, rotate, offset and tilt in 3D.',...SHAPE_IO,props:{
    scale:n('Scale',100,50,400,10,{key:'_zoom'}),rotation:n('Rotation',0,-180,180,1,{key:'_rotation'}),x:n('Offset X',0,-100,100,1,{key:'_offX'}),y:n('Offset Y',0,-100,100,1,{key:'_offY'}),
    tilt:n('3D tilt',0,-180,180,1,{key:'_dragRotX',rad:true}),turn:n('3D rotate',0,-180,180,1,{key:'_dragRotY',rad:true}),pulse:bool('Zoom on loud',false,{key:'_zoomLoud'})}},
  motion:{category:'geometry',label:'Motion',description:'Spin and animation speed.',...SHAPE_IO,props:{spin:n('Spin',0,-5,5,.1,{key:'_spin'}),speed:n('Speed',1,.1,5,.1,{key:'_speed'})}},
  symmetry:{category:'geometry',label:'Symmetry',description:'Mirror, flip and radial symmetry.',...SHAPE_IO,props:{
    mode:pick('Symmetry','r4',SYMS.map(s=>s[0]),{labels:SYMS,key:'_symmetryMode'}),gap:n('Gap',0,0,100,1,{key:'_symGap'}),
    flipH:bool('Flip H',false,{key:'_flipH'}),flipV:bool('Flip V',false,{key:'_flipV'}),mirror:bool('Reflection',false,{key:'_mirrorOn'})}},
  // Deformers
  amplify:DEFORM('Amplify','_amplify',.5,5,1.6,'Boost the audio response of the shape.',.1),
  twist:DEFORM('Twist','_twist',-100,100,40,'Twist around the centre.'),
  bulge:DEFORM('Bulge','_bulge',-100,100,40,'Inflate or pinch the centre.'),
  wave:{category:'deformers',label:'Wave',description:'Travelling sine displacement.',...SHAPE_IO,props:{amount:n('Amount',40,0,100,1,{key:'_wave'}),speed:n('Wave speed',5,1,20,1,{key:'_waveFreq'})}},
  shear:DEFORM('Shear','_shear',-100,100,30,'Slant the shape.'),
  depth:DEFORM('Depth','_depth',0,200,60,'Perspective depth.'),
  ripple:DEFORM('Ripple','_ripple',-100,100,40,'Concentric ripples.'),
  jitter:DEFORM('Jitter','_jitter',0,100,30,'Random shake.'),
  disorder:DEFORM('Disorder','_rDisorder',0,100,40,'Scatter elements out of place.'),
  randomize:{category:'deformers',label:'Randomize',description:'Per-element randomness.',...SHAPE_IO,props:{
    global:n('Global',30,0,100,1,{key:'_rGlobal'}),dist:n('Distribution',0,0,100,1,{key:'_rDist'}),appear:n('Appearance',0,0,100,1,{key:'_rAppear'}),outline:n('Outline',0,0,100,1,{key:'_rOutline'}),color:n('Color',0,0,100,1,{key:'_rColor'})}},
  webcam:{category:'deformers',label:'Webcam',description:'Your camera displaces the shape by brightness and can colour it.',...SHAPE_IO,props:{
    displace:n('Displace',40,0,100,1),colors:pick('Camera colors','on',['on','off'],{labels:[['on','On'],['off','Off']]}),
    dir:pick('Direction','radial',['radial','vertical','horizontal'],{labels:[['radial','Radial'],['vertical','Vertical'],['horizontal','Horiz.']]}),smooth:n('Smoothing',5,1,20,1)}},
  // Color
  palette:{category:'color',label:'Palette',description:'Color mode and gradient stops.',...SHAPE_IO,props:{
    mode:pick('Mode','toneramp',['toneramp','simpleramp','solid'],{labels:[['toneramp','Tone ramp'],['simpleramp','Simple ramp'],['solid','Solid']]}),
    c1:color('Low','#1a1a2e'),c2:color('Mid','#e94560'),c3:color('High','#f5a623'),c4:color('Peak','#6ee7b7'),
    fade:n('Low opacity',0,0,1,.05),solid:color('Solid','#dddde0')}},
  hue:{category:'color',label:'Hue shift',description:'Rotate hues, optionally cycling over time.',...SHAPE_IO,props:{hue:n('Hue',60,-180,180,1),cycle:n('Cycle (°/s)',0,-120,120,1)}},
  // Style
  lineStyle:{category:'style',label:'Line style',description:'How each line is drawn.',...SHAPE_IO,props:{
    shape:pick('Style','dotted',LINE_SHAPES.map(s=>s[0]),{labels:LINE_SHAPES,key:'_lineShape'}),size:n('Size',100,30,250,5,{key:'_styleSize'}),density:n('Density',100,30,250,5,{key:'_styleDensity'}),angle:n('Angle',0,-90,90,1,{key:'_styleAngle'})}},
  outline:{category:'style',label:'Outline',description:'Outline around the shape.',...SHAPE_IO,props:{
    style:pick('Style','solid',['solid','dotted','dashed','connected','fill'],{key:'_outlineStyle'}),opacity:n('Opacity',60,5,100,5,{key:'_outlineOpacity'}),weight:n('Weight',2,.5,8,.25,{key:'_outlineWeight'}),
    gap:n('Gap',0,0,30,1,{key:'_outlineDist'}),count:n('Count',1,1,10,1,{key:'_outlineCount'}),spacing:n('Spacing',4,1,20,1,{key:'_outlineSpace'})}},
  // Particles
  particles:{category:'particles',label:'Particles',description:'Particles spawned from the shape, driven by loudness.',...SHAPE_IO,props:{
    shape:pick('Shape','circle',PART_SHAPES.map(s=>s[0]),{labels:PART_SHAPES,key:'_particleShape'}),density:n('Density',20,1,50,1,{key:'pPartDensity'}),energy:n('Energy',1,.1,5,.1,{key:'pPartEnergy'}),
    speed:n('Speed',3,0,10,.1,{key:'pPartSpeed'}),life:n('Life',120,10,300,10,{key:'pPartLife'}),size:n('Size',12,1,40,.5,{key:'pPartSize'}),spread:n('Spread',50,0,100,5,{key:'pPartSpread'}),
    gravity:n('Gravity',0,-5,5,.1,{key:'pPartGravity'}),damping:n('Damping',97,80,100,.5,{key:'pPartDamping'}),trail:n('Trail',0,0,60,1,{key:'pPartTrail'})}},
  flowField:{category:'particles',label:'Flow field',description:'Noise forces that steer particles.',...SHAPE_IO,props:{
    perlin:n('Perlin',40,0,100,1,{key:'pNoisePerlin'}),curl:n('Curl',0,0,100,1,{key:'pNoiseCurl'}),brownian:n('Brownian',0,0,100,1,{key:'pNoiseBrownian'}),vortex:n('Vortex',0,0,100,1,{key:'pNoiseVortex'}),
    scale:n('Scale',30,1,100,1,{key:'pNoiseScale'}),speed:n('Speed',20,1,100,1,{key:'pNoiseSpeed'})}},
  // Post FX (original per-layer GPU shaders)
  bloom:FX('Bloom','Glow around bright areas.',{bloom:n('Bloom',60,0,100,1,{key:'pfxBloom'}),edge:n('Edge glow',0,0,100,1,{key:'pfxEdgeGlow'})}),
  grade:FX('Color correct','Brightness, contrast, saturation, hue.',{brightness:n('Brightness',0,-100,100,1,{key:'pfxBrightness'}),contrast:n('Contrast',10,-100,100,1,{key:'pfxContrast'}),
    saturation:n('Saturation',20,-100,200,1,{key:'pfxSaturation'}),hue:n('Hue',0,-180,180,1,{key:'pfxHue'}),invert:n('Invert',0,0,100,1,{key:'pfxInvert'})}),
  blur:FX('Blur','Directional, radial and focal blur.',{x:n('Blur X',20,0,100,1,{key:'pfxBlurX'}),y:n('Blur Y',0,0,100,1,{key:'pfxBlurY'}),radial:n('Radial',0,0,100,1,{key:'pfxBlurRadial'}),focal:n('Focal area',0,0,100,1,{key:'pfxFocal'})}),
  lens:FX('Lens','Chromatic aberration, vignette, sharpen, scanlines.',{chroma:n('Chromatic',30,0,100,1,{key:'pfxChroma'}),vignette:n('Vignette',40,0,100,1,{key:'pfxVignette'}),sharpen:n('Sharpen',0,0,100,1,{key:'pfxSharpen'}),scanlines:n('Scanlines',0,0,100,1,{key:'pfxScanlines'})}),
  kaleido:FX('Kaleido','Kaleidoscope and reflection.',{kaleido:n('Kaleido',50,0,100,1,{key:'pfxKaleido'}),reflect:n('Reflect',0,0,100,1,{key:'pfxReflect'})}),
  trails:FX('Trails','Motion trails and zoom feedback.',{trails:n('Trails',60,0,100,1,{key:'pfxTrails'}),feedback:n('Feedback',0,0,100,1,{key:'pfxFeedback'})}),
  fracture:FX('Fracture','Shatter the image along cracks that open on bass and beats.',{
    mode:pick('Mode','flow',['flow','shatter'],{key:'pfxFracMode'}),cells:n('Cells',44,8,64,1,{key:'pfxFracCells'}),size:n('Size var',65,0,100,1,{key:'pfxFracSize'}),gap:n('Crack gap',30,0,100,1,{key:'pfxFracGap'}),
    disp:n('Displace',58,0,100,1,{key:'pfxFracDisp'}),rot:n('Rotate',34,0,100,1,{key:'pfxFracRot'}),drift:n('Drift',45,0,100,1,{key:'pfxFracDrift'}),bass:n('Bass resp',125,0,200,1,{key:'pfxFracBass'}),
    beat:n('Beat resp',150,0,200,1,{key:'pfxFracBeat'}),recover:n('Recovery',48,0,100,1,{key:'pfxFracRecover'}),glow:n('Crack glow',62,0,100,1,{key:'pfxFracGlow'}),noise:n('Noise',35,0,100,1,{key:'pfxFracNoise'}),seed:n('Seed',17,0,999,1,{key:'pfxFracSeed'})}),
  effect:{category:'postfx',label:'Quick filter',description:'Simple canvas filter.',...FX_IO,props:{kind:pick('Filter','hue',['hue','brightness','saturate','blur','invert']),amount:n('Amount',.35,0,2,.01)}},
  // Controls
  value:{category:'controls',label:'Value',description:'A constant number.',inputs:{},outputs:{value:'number'},props:{value:n('Value',.7,0,2,.01)}},
  oscillator:{category:'controls',label:'LFO',description:'A slow animated wave.',inputs:{},outputs:{value:'number'},props:{wave:pick('Wave','sine',['sine','triangle','saw','square','random']),rate:n('Rate (Hz)',.28,.01,8,.01),depth:n('Depth',.7,0,1,.01),offset:n('Offset',.25,0,1,.01)}},
  map:{category:'controls',label:'Map range',description:'Scale and offset a number.',inputs:{value:'number'},outputs:{value:'number'},primary:['value'],props:{scale:n('Scale',1,-4,4,.01),offset:n('Offset',0,-2,2,.01)}},
  smooth:{category:'controls',label:'Smooth',description:'Soften a signal with separate attack and release.',inputs:{value:'number'},outputs:{value:'number'},primary:['value'],props:{attack:n('Attack (ms)',30,0,2000,5),release:n('Release (ms)',300,0,4000,10)}},
  math:{category:'controls',label:'Math',description:'Combine two numbers.',inputs:{a:'number',b:'number'},outputs:{value:'number'},primary:['a','b'],props:{op:pick('Operation','add',['add','multiply','subtract','min','max']),a:n('A',0,-2,2,.01,{noPort:true}),b:n('B',0,-2,2,.01,{noPort:true})}},
  random:{category:'controls',label:'Random',description:'A new random value at a rate or on every beat.',inputs:{},outputs:{value:'number'},props:{trigger:pick('Trigger','beat',['beat','rate']),rate:n('Rate (Hz)',1,.05,10,.05),glide:n('Glide',.3,0,1,.01)}},
  // Audio
  audio:{category:'audio',label:'Audio band',description:'Level of one frequency band.',inputs:{},outputs:{value:'number'},props:{band:pick('Band','bass',['bass','mids','high','full']),gain:n('Gain',1,0,8,.05)}},
  beat:{category:'audio',label:'Beat',description:'A pulse on every detected beat.',inputs:{},outputs:{value:'number'},props:{decay:n('Decay (ms)',350,30,3000,10),gain:n('Gain',1,0,4,.05)}},
  spectrum:{category:'audio',label:'Audio EQ',description:'Shape the spectrum an Emitter hears.',inputs:{},outputs:{spectrum:'spectrum'},props:{
    gain:n('Gain',100,0,300,5),eq32:n('32 Hz',100,0,200,5),eq64:n('64 Hz',100,0,200,5),eq125:n('125 Hz',100,0,200,5),eq250:n('250 Hz',100,0,200,5),eq500:n('500 Hz',100,0,200,5),
    eq1k:n('1 kHz',100,0,200,5),eq2k:n('2 kHz',100,0,200,5),eq4k:n('4 kHz',100,0,200,5),eq8k:n('8 kHz',100,0,200,5),eq16k:n('16 kHz',100,0,200,5)}},
  // Composite
  background:{category:'composite',label:'Background',description:'A solid or gradient fill.',inputs:{},outputs:{image:'image'},props:{fill:pick('Fill','radial',['flat','vertical','radial']),c1:color('Color A','#0f0f12'),c2:color('Color B','#1c3d30')}},
  blend:{category:'composite',label:'Blend',description:'Combine two images.',inputs:{a:'image',b:'image'},outputs:{image:'image'},primary:['a','b'],props:{mode:pick('Blend mode','screen',['screen','source-over','multiply','difference','lighter','overlay']),mix:n('Mix',.5,0,1,.01)}},
  output:{category:'composite',label:'Output',description:'The end of the chain: what this layer shows.',inputs:{image:'image'},outputs:{},props:{}}
};
export const EQ_KEYS=['eq32','eq64','eq125','eq250','eq500','eq1k','eq2k','eq4k','eq8k','eq16k'];
export const EQ_HZ=[32,64,125,250,500,1000,2000,4000,8000,16000];

// Every numeric property (unless noPort) can be driven by a number wire on an input port of the same name.
export function inputsOf(type){
  const t=TYPES[type],inputs={...t.inputs};
  for(const [k,s] of Object.entries(t.props))if(s.kind==='number'&&!s.noPort&&!inputs[k])inputs[k]='number';
  return inputs;
}
// Emitters also take a number on any of their own option knobs: input "opt_<option id>".
export const OPT_PORT=/^opt_[a-zA-Z][a-zA-Z0-9_]{0,40}$/;
export function portType(n,key){return inputsOf(n.type)[key]??(n.type==='emitter'&&OPT_PORT.test(key)?'number':undefined);}
export const compatible=(out,input)=>out===input||(out==='shape'&&input==='image');
export const clone = value => JSON.parse(JSON.stringify(value));
const uid=()=>crypto.randomUUID();
export function defaults(type){return Object.fromEntries(Object.entries(TYPES[type].props).map(([k,v])=>[k,clone(v.value)]));}
export function node(type,x=40,y=50,props={}) {
  if (!Object.hasOwn(TYPES,type)) throw Error('Unknown node type');
  return {id:uid(),type,x,y,props:{...defaults(type),...props}};
}
export function layer(index=1) {
  const emitter=node('emitter',40,70),fx=node('bloom',260,70),output=node('output',470,70);
  if(index!==1)emitter.props.mode='circle';
  return {id:uid(),name:`Layer ${index}`,visible:true,opacity:1,blend:'screen',nodes:[emitter,fx,output],edges:[
    {from:emitter.id,out:'shape',to:fx.id,input:'image'},
    {from:fx.id,out:'image',to:output.id,input:'image'}
  ]};
}
export function project() { return {format:'audiograph-pro',version:2,layers:[layer()]}; }
export const LIMITS={layers:4,nodes:60,edges:160,emitters:4};
export const LAYER_BLENDS=['source-over','screen','lighter','multiply','difference','overlay'];
function finite(value,min,max,label) {
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw Error(`${label} must be between ${min} and ${max}`);
  return value;
}
function id(value) {if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(value))throw Error('Invalid ID');return value;}
export function order(graph) {
  const nodes=new Map(graph.nodes.map(n=>[n.id,n])), indegree=new Map(graph.nodes.map(n=>[n.id,0])), adjacency=new Map(graph.nodes.map(n=>[n.id,[]])), occupied=new Set();
  for(const e of graph.edges) {
    const from=nodes.get(e.from),to=nodes.get(e.to);
    if(!from||!to)throw Error('Connection references a missing node');
    if(e.from===e.to)throw Error('A node cannot connect to itself');
    const sourcePorts=TYPES[from.type].outputs,input=portType(to,e.input);
    if(!Object.hasOwn(sourcePorts,e.out)||!input)throw Error('Connection references a missing port');
    const out=sourcePorts[e.out];
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
  if(typeof v!=='string'||v.length>s.max)throw Error(`Invalid ${label}`);return v;
}
// Version 1 (stage 1 prototype) projects: emitter output was "image"; legacy emitter props are dropped.
function migrate(raw){
  if(raw.version===2)return raw;
  const out=clone(raw);out.version=2;
  for(const g of out.layers||[]){
    const emitters=new Set((g.nodes||[]).filter(n=>n?.type==='emitter').map(n=>n.id));
    for(const e of g.edges||[])if(e&&emitters.has(e.from)&&e.out==='image')e.out='shape';
    for(const nd of g.nodes||[])if(nd?.type==='emitter'&&nd.props){delete nd.props.energy;delete nd.props.size;delete nd.props.hue;}
    if(g.blend===undefined)g.blend='source-over';
  }
  return out;
}
export function validate(input) {
  if(!input||input.format!=='audiograph-pro'||![1,2].includes(input.version))throw Error('Expected an Audiograph Pro project');
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
    clean.nodes=g.nodes.map(nd=>{
      if(!nd||!Object.hasOwn(TYPES,nd.type))throw Error('Unknown node type');
      if(nd.type==='emitter')emitters++;
      if(!nd.props||typeof nd.props!=='object'||Array.isArray(nd.props))throw Error('Node properties are missing');
      const props={};
      for(const [key,s] of Object.entries(TYPES[nd.type].props))props[key]=cleanProp(s,nd.props[key],s.label);
      return {id:unique(nd.id),type:nd.type,x:finite(nd.x,-10000,10000,'Node X'),y:finite(nd.y,-10000,10000,'Node Y'),props};
    });
    if(clean.nodes.filter(nd=>nd.type==='output').length>1)throw Error('Only one Output is allowed per layer');
    clean.edges=g.edges.map(e=>{if(!e)throw Error('Invalid connection');return {from:id(e.from),to:id(e.to),out:id(e.out),input:id(e.input)};});
    order(clean);return clean;
  });
  if(emitters>LIMITS.emitters)throw Error('Limit: four Emitters per project (isolated GPU contexts)');
  return {format:'audiograph-pro',version:2,layers};
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
const ADDITIVE=new Set(['_twist','_bulge','_wave','_shear','_depth','_ripple','_jitter','_rDisorder']);
export function applyShapeNode(type,props,mods){
  const out={...mods};
  if(type==='palette'){
    const a=Math.round(props.fade*255).toString(16).padStart(2,'0');
    out._colorMode=props.mode;out._solidColor=props.solid;
    out._toneStops=[props.c1+a,props.c2,props.c3,props.c4];out._simpleStops=[props.c2,props.c3,props.c4];
    return out;
  }
  if(type==='motion'){out._spin=Math.abs(props.spin);out._spinDir=props.spin<0?-1:1;out._speed=props.speed;return out;}
  if(type==='lineStyle'&&props.shape==='off'){out._lineShape='off';}
  if(type==='outline')out._showOutline=true;
  if(type==='particles')out._particlesOn=true;
  if(type==='webcam'){out._cam={displace:props.displace,colors:props.colors==='on',dir:props.dir,smooth:props.smooth};return out;}
  for(const [k,s] of Object.entries(TYPES[type].props)){
    if(!s.key)continue;let v=props[k];
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
