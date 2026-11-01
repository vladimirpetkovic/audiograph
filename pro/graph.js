// Audiograph Pro graph model: categorized node catalog, typed ports, validation and migration.
// Emitter modes by node type: each is one of the original Audiograph renderers.
import {cleanMapping} from './mapping.js';
import {TEMPLATE_NAMES} from './morph.js';
export const MODES = {
  waveform2d: [['linear','Linear'],['circle','Circle'],['concentric','Concentric'],['spiral','Spiral'],['phyllotaxis','Phyllotaxis'],['fractal','Fractal'],['growth','Growth'],['sacred','Sacred'],['graph','Graph'],['lissajous','Harmonic'],['scatter','Scatter'],['sine','Sine'],['custom','Math']],
  waveform3d: [['sphere','Sphere'],['cube','Cube'],['torus','Torus'],['cylinder','Cylinder'],['cone','Cone'],['ico','Icosphere'],['pyramid','Pyramid'],['frame','Frame'],['knot','Knot'],['tetrahedron','Tetrahedron'],['dna','DNA'],['terrain','Terrain'],['model','Model']],
  gpuParticles: [['simparticles','Particles'],['simfluid','Fluid'],['simsmoke','Smoke'],['simsand','Granular Sand']]
};
export const emitterNames = {...Object.fromEntries(Object.values(MODES).flat()),simcloner:'Cloner'};

export const CATEGORIES = [
  {id:'inputs',label:'Inputs',color:'#71f4d3',hint:'Sound, pictures, camera, text and 3D you bring in'},
  {id:'waveforms',label:'Waveforms',color:'#71ecf4',hint:'Audio-reactive line patterns'},
  {id:'emitters',label:'Emitters',color:'#71c3f4',hint:'Particles: classic and native WebGPU simulations'},
  {id:'3d',label:'3D',color:'#7199f4',hint:'3D waveforms, and the Cloner with its objects, effectors, material, light and camera'},
  {id:'forces',label:'Forces',color:'#7271f4',hint:'Spin any shape; push and steer WebGPU simulations: gravity, drag, swirl, wind…'},
  {id:'deformers',label:'Deformers',color:'#9b71f4',hint:'Bend, mirror and repeat the shape, or add noise'},
  {id:'color',label:'Color',color:'#c471f4',hint:'Palettes and hue'},
  {id:'postfx',label:'Post FX',color:'#ed71f4',hint:'Image effects (GPU shaders)'},
  {id:'controls',label:'Controls',color:'#f471d1',hint:'Numbers that move knobs'},
  {id:'audio',label:'Audio analysis',color:'#f471a8',hint:'Turn sound into numbers or reshape it'},
  {id:'composite',label:'Composite',color:'#f4717f',hint:'Mix and output'}
];
export const PORT_COLORS={number:'#6ee7b7',shape:'#f59e0b',image:'#8aa2ff',audio:'#a3e635',visual:'#f472b6',source:'#fb7185',object3d:'#fde047',colors:'#c084fc',any:'#e5e7eb'};

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
const F=(label,value,min,max,key,sims)=>n(label,value,min,max,1,{key,sims});
const FORCE=(label,description,props)=>({category:'forces',label,description,...SHAPE_IO,props});
// Cloner parts (Cinema 4D style): each knob sets one original cloner option ("key" = knob id, "sim" = choice).
const C3=(label,value,min,max,key,step=1)=>n(label,value,min,max,step,{key,sims:['simcloner']});
const C3P=(label,value,choices,sim)=>pick(label,value,choices.map(c=>c[0]),{labels:choices,sim,sims:['simcloner']});
const C3D=(group,label,description,props)=>({category:'3d',group,label,description,...SHAPE_IO,props});
export const OBJECT_RENDERS=[['normal','Normal'],['waveform','Waveform'],['points','Points']];
export const PRIM_PROPS={size:n('Size',60,2,300,5),detail:n('Detail',4,1,10,1),stretchX:n('Stretch X',100,10,500,5),stretchY:n('Stretch Y',100,10,500,5),stretchZ:n('Stretch Z',100,10,500,5)};
export const PRIMITIVES=[['sphere','Sphere'],['cube','Cube'],['cylinder','Cylinder'],['cone','Cone'],['pyramid','Pyramid'],['torus','Torus'],['ico','Icosphere'],['frame','Frame'],['knot','Knot']];
export const CLONER_LAYOUTS=[['grid','Grid'],['linear','Linear'],['ring','Radial'],['sphere','Sphere'],['scatter','Scatter'],['spiral','Spiral'],['helix','Helix'],['network','Network']];
const FX=(label,description,props)=>({category:'postfx',label,description,...FX_IO,fx:true,props});
// Lines, transform, motion and symmetry live on every renderer node (grouped in its inspector).
const G=(group,spec)=>({...spec,group});
export const GEO_PROPS={
  density:G('Lines',n('Density',350,80,800,10,{key:'_lines'})),height:G('Lines',n('Height',80,5,300,5,{key:'_height'})),thick:G('Lines',n('Thickness',1,.5,15,.25,{key:'_thick'})),
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
const ENGINE=(category,label,description,props,outputs={},group)=>({category,group,label,description,engine:true,inputs:{audio:'audio',drive:'number'},outputs:{shape:'shape',...outputs},
  props:{...props,...GEO_PROPS,drive:n('Drive',.7,0,2,.01,{noPort:true}),intensity:G('Sound',n('Intensity',100,0,200,5)),punch:G('Sound',n('Bass punch',60,0,100,1)),release:G('Sound',n('Bass release',220,60,800,10)),dynamics:G('Sound',n('Dynamics',50,0,100,1)),
    opts:dict('Options',120,'number'),chips:dict('Choices',60,'string'),look:{kind:'look',label:'Template look',value:{}}}});
const MEDIA=(label,description,cam)=>({category:'inputs',group:'Media',label,description,inputs:{audio:'audio'},
  outputs:{image:'image',palette:'colors',brightness:'number',...(label==='Image'?{}:{motion:'number'})},
  props:{fit:pick('Fit','cover',['cover','contain'],{labels:[['cover','Fill'],['contain','Fit']]}),
    warp:pick('Audio warp','wave',['none','wave','slices','pulse'],{labels:[['none','Off'],['wave','Wave'],['slices','Slices'],['pulse','Pulse']]}),
    amount:n('Warp amount',50,0,100,1),...(cam?{mirror:bool('Mirror',true)}:{})}});
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
export function paletteStops(props){
  const cols=props.stops.map(s=>s.c);
  return {tone:[cols[0]+Math.round(props.fade*255).toString(16).padStart(2,'0'),...cols.slice(1)],simple:cols};
}
export const MAX_STOPS=8;
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
  text:ENGINE('inputs','Text','Your words drawn as audio-reactive lines.',{text:text('Text','AUDIOGRAPH')}),
  splat:ENGINE('inputs','Gaussian Splat','A .ply / .splat point cloud that reacts to the sound (a demo cloud until you load one).',{}),
  // Waveforms and Emitters (particles)
  templateMorph:{category:'composite',group:'Templates',label:'Preset Morph',engine:true,description:'Blend original Audiograph templates: matching layouts interpolate; different layouts crossfade. Audio drives the full stack; its finished image feeds palettes, post effects and Output.',
    inputs:{audio:'audio',drive:'number'},outputs:{image:'image'},props:{
    from:pick('From',TEMPLATE_NAMES[0],TEMPLATE_NAMES,{noPort:true}),to:pick('To',TEMPLATE_NAMES[1],TEMPLATE_NAMES,{noPort:true}),
    mix:n('Morph',0,0,100,1,{unit:'%'})}},
  waveform2d:ENGINE('waveforms','Waveform 2D','Flat audio-reactive line patterns.',{mode:pick('Waveform','circle',MODES.waveform2d.map(m=>m[0]),{labels:MODES.waveform2d}),...STYLE_PROPS},{},'2D'),
  // 3D Object: every form and primitive (and your OBJ as Model), drawn Normal (solid, lit) or as a Waveform (audio-reactive lines).
  waveform3d:ENGINE('3d','3D Object','A 3D form drawn solid (Normal) or as audio-reactive lines (Waveform). Model loads an OBJ, GLB or glTF; animated GLB / glTF models play (Animation speed can follow the sound). Its “object” output feeds a Cloner or WebGPU particles’ emit.',{mode:pick('Shape','sphere',MODES.waveform3d.map(m=>m[0]),{labels:MODES.waveform3d}),
    render:pick('Render','waveform',OBJECT_RENDERS.map(r=>r[0]),{labels:OBJECT_RENDERS}),...PRIM_PROPS,...STYLE_PROPS,
    animSpeed:n('Animation speed',1,0,4,.05),clip:n('Clip',1,1,32,1,{noPort:true})},{object:'object3d'},'Objects'),
  gpuParticles:(t=>({...t,inputs:{...t.inputs,emit:'source'}}))(ENGINE('emitters','WebGPU particles','Native WebGPU simulations: particles, fluid, smoke and sand. Wire anything visual into “emit” (Camera, Video, Image, a waveform or emitter, a 3D Object, even a turning one) and particles spawn from its bright parts; the sound still sets how many.',{mode:pick('Simulation','simfluid',MODES.gpuParticles.map(m=>m[0]),{labels:MODES.gpuParticles}),
    emitColors:pick('Emit colors','source',['source','palette'],{labels:[['source','Picture'],['palette','Palette']]})},{},'WebGPU particles')),
  // 3D: the Cloner copies objects into an array; effectors, material, light and camera are nodes after it.
  cloner:{...ENGINE('3d','Cloner','Copies 3D objects into an array that reacts to the sound. Wire up to three objects into it.',{
    layout:pick('Layout','grid',CLONER_LAYOUTS.map(c=>c[0]),{labels:CLONER_LAYOUTS,sim:'g3Mode'}),
    countX:G('Count',n('Count X',5,1,60,1,{key:'pG3Nx'})),countY:G('Count',n('Count Y',5,1,60,1,{key:'pG3Ny'})),countZ:G('Count',n('Count Z',5,1,60,1,{key:'pG3Nz'})),
    spacingX:G('Spacing',n('Spacing X',150,20,1000,5,{key:'pG3SpX'})),spacingY:G('Spacing',n('Spacing Y',150,0,1000,5,{key:'pG3SpY'})),spacingZ:G('Spacing',n('Spacing Z',150,0,1000,5,{key:'pG3SpZ'})),
    twist:G('Steps',n('Twist',0,-45,45,1,{key:'pG3StRotY'})),endScale:G('Steps',n('End scale',100,10,300,5,{key:'pG3StScale'})),cloneSpin:G('Steps',n('Spin',0,-100,100,5,{key:'pG3Spin'})),
    rotX:G('Rotate',n('Rotate X',0,-180,180,1,{key:'pG3GrX'})),rotY:G('Rotate',n('Rotate Y',0,-180,180,1,{key:'pG3GrY'})),rotZ:G('Rotate',n('Rotate Z',0,-180,180,1,{key:'pG3GrZ'})),
    variety:G('Objects',n('Variety',100,0,100,5,{key:'pG3Mix'}))},{},'Cloner'),inputs:{audio:'audio',drive:'number',object:'object3d',object2:'object3d',object3:'object3d'}},
  soundEffector:C3D('Effectors','Sound effector','Loud clones move, grow and tumble.',{
    listen:C3P('Listen by','index',[['index','Order'],['distance','Distance'],['x','X'],['y','Y'],['z','Z'],['random','Random']],'g3Map'),
    rotate:C3('Rotate',0,-360,360,'pG3EfRot',5),grow:C3('Grow from base',0,0,100,'pG3Anchor',5),spread:C3('Spread',35,0,100,'pG3Indep',5),delay:C3('Delay',0,0,100,'pG3Delay',5),
    moveX:G('Move',C3('Move X',0,-300,300,'pG3EfX',5)),moveY:G('Move',C3('Move Y',0,-300,300,'pG3EfY',5)),moveZ:G('Move',C3('Move Z',0,-300,300,'pG3EfZ',5)),
    scaleX:G('Scale',C3('Scale X',40,-100,800,'pG3ScX',5)),scaleY:G('Scale',C3('Scale Y',40,-100,800,'pG3ScY',5)),scaleZ:G('Scale',C3('Scale Z',40,-100,800,'pG3ScZ',5))}),
  fieldEffector:C3D('Effectors','Field effector','A moving pattern lifts and scales the clones.',{
    field:C3P('Field','wave',[['noise','Noise'],['wave','Wave'],['ripple','Ripple']],'g3Field'),
    strength:C3('Strength',100,0,200,'pG3FieldAmt',5),size:C3('Size',100,20,400,'pG3FieldSize',5),speed:C3('Speed',50,0,300,'pG3FieldSpd',5)}),
  randomEffector:C3D('Effectors','Random effector','Random scale, rotation and position per clone, on each axis, plus colour.',{
    seed:C3('Seed',1,0,999,'pG3Seed'),color:C3('Colour',30,0,100,'pG3RndCol',5),
    size:G('Scale',C3('Uniform',40,0,100,'pG3RndScale',5)),scaleX:G('Scale',C3('X',0,0,100,'pG3RndSX',5)),height:G('Scale',C3('Y',0,0,100,'pG3RndH',5)),scaleZ:G('Scale',C3('Z',0,0,100,'pG3RndSZ',5)),
    rotX:G('Rotation',C3('X',45,0,180,'pG3RndRX',5)),rotY:G('Rotation',C3('Y',45,0,180,'pG3RndRY',5)),rotZ:G('Rotation',C3('Z',45,0,180,'pG3RndRZ',5)),
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
  light:C3D('Look','Light','Key and ambient light, soft cast shadows, bounce light and an optional floor.',{
    key:C3('Key light',100,0,200,'pG3Light',5),ambient:C3('Ambient',35,0,150,'pG3Amb',5),angle:C3('Angle',-42,-180,180,'pG3LitAz'),height:C3('Height',45,-20,89,'pG3LitEl'),
    shadow:G('Shadows',C3('Cast shadows',60,0,100,'pG3Shadow',5)),size:G('Shadows',C3('Light size',35,0,100,'pG3LitSize',5)),
    ao:G('Shadows',C3('Occlusion',50,0,100,'pG3Ao',5)),aoRadius:G('Shadows',C3('Radius',60,10,300,'pG3AoRad',5)),bounce:G('Shadows',C3('Bounce light',40,0,100,'pG3Bounce',5)),
    floor:G('Floor',C3('Floor',0,0,100,'pG3Floor',5)),floorHeight:G('Floor',C3('Height',0,-100,100,'pG3FloorY',5)),floorTint:G('Floor',C3('Tint',30,0,100,'pG3FloorTint',5))}),
  camera3d:C3D('Look','3D camera','Orbit (on its own or with the music), tilt and zoom, depth of field (every 3D Object render, Waveform included) and motion blur. Drag in the preview to look around.',{
    orbit:C3('Orbit',0,-100,100,'pG3Orbit'),orbitSound:C3('Orbit with sound',0,0,100,'pG3OrbitSnd',5),tilt:C3('Tilt',18,-80,80,'pG3Tilt'),zoom:C3('Zoom',100,30,300,'pG3Zoom',5),
    dof:G('Lens',C3('Depth of field',30,0,100,'pG3Dof',5)),focus:G('Lens',C3('Focus',50,0,100,'pG3Focus',5)),blur:G('Lens',C3('Motion blur',0,0,100,'pG3Mb',5))}),
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
  jitter:{...DEFORM('Jitter','_jitter',0,100,30,'Random shake.'),group:'Noise'},
  disorder:{...DEFORM('Disorder','_rDisorder',0,100,40,'Scatter elements out of place.'),group:'Noise'},
  randomize:{category:'deformers',group:'Noise',label:'Randomize',description:'Per-element randomness.',...SHAPE_IO,props:{
    global:n('Global',30,0,100,1,{key:'_rGlobal'}),dist:n('Distribution',0,0,100,1,{key:'_rDist'}),appear:n('Appearance',0,0,100,1,{key:'_rAppear'}),outline:n('Outline',0,0,100,1,{key:'_rOutline'}),color:n('Color',0,0,100,1,{key:'_rColor'})}},
  webcam:{category:'deformers',label:'Webcam',description:'Your camera displaces the shape by brightness and can colour it.',...SHAPE_IO,props:{
    displace:n('Displace',40,0,100,1),colors:pick('Camera colors','on',['on','off'],{labels:[['on','On'],['off','Off']]}),
    dir:pick('Direction','radial',['radial','vertical','horizontal'],{labels:[['radial','Radial'],['vertical','Vertical'],['horizontal','Horiz.']]}),smooth:n('Smoothing',5,1,20,1)}},
  turbulence:{category:'deformers',group:'Noise',label:'Turbulence',description:'Noise that churns WebGPU Particles and Smoke.',...SHAPE_IO,props:{
    amount:F('Turbulence',46,0,100,'pSpTurb',['simparticles']),scale:F('Noise scale',66,10,100,'pSpTurbScale',['simparticles']),smoke:F('Smoke turbulence',30,0,100,'pSmTurb',['simsmoke'])}},
  spin:{category:'forces',label:'Spin',description:'Keep the shape turning, right (clockwise) or left. Speed sets how fast its animation runs.',...SHAPE_IO,props:{
    spin:n('Spin',1,0,5,.1,{key:'_spin'}),dir:pick('Direction','right',['right','left'],{labels:[['right','Spin right ↻'],['left','Spin left ↺']]}),speed:n('Speed',1,.1,5,.1,{key:'_speed'})}},
  // Forces: WebGPU simulation physics, one idea per node. Each knob lists the simulations it moves; defaults match the simulation.
  gravity:FORCE('Gravity','Pull down (or up). Smoke rises by buoyancy.',{gravity:F('Gravity',-3,-100,100,'pSpGravity',['simparticles']),sand:F('Sand gravity',100,0,100,'pSaGravity',['simsand']),buoyancy:F('Buoyancy',100,0,200,'pSmBuoy',['simsmoke'])}),
  drag:FORCE('Drag','Slow things down: air drag, viscosity, friction, damping.',{drag:F('Drag',100,0,100,'pSpDrag',['simparticles']),viscosity:F('Viscosity',15,0,100,'pSfVisc',['simfluid']),friction:F('Friction',35,0,100,'pSaFriction',['simsand'])}),
  swirl:FORCE('Swirl','Rotate the flow and spin the emitters.',{swirl:F('Swirl',43,-100,100,'pSpSwirl',['simparticles']),fluidSwirl:F('Fluid swirl',40,-100,100,'pSfSwirl',['simfluid']),
    spin:F('Emitter spin',0,-100,100,'pSpSpin',['simparticles']),fluidSpin:F('Jet spin',0,-100,100,'pSfSpin',['simfluid']),smokeSpin:F('Burner spin',0,-100,100,'pSmSpin',['simsmoke'])}),
  attract:FORCE('Attract','Pull toward the centre or the magnets (negative pushes away).',{pull:F('Centre pull',0,-100,100,'pSpAttract',['simparticles'])}),
  wind:FORCE('Wind','Blow sideways.',{smoke:F('Wind',0,-100,100,'pSmWind',['simsmoke']),sand:F('Sand wind',0,-100,100,'pSaWind',['simsand'])}),
  vorticity:FORCE('Vorticity','Curl the flow into eddies.',{fluid:F('Fluid vorticity',45,0,100,'pSfVort',['simfluid']),smoke:F('Smoke vorticity',55,0,100,'pSmVort',['simsmoke'])}),
  // Color
  palette:{category:'color',label:'Palette',description:'Recolor anything: a shape or any image (a Merge, Post FX…). Normal replaces the colors before it; the other blend modes mix with them. Wire a Live data palette into “colors” to let the data pick them.',inputs:{shape:'visual',colors:'colors'},outputs:{shape:'shape'},props:{
    mode:pick('Mode','toneramp',['toneramp','simpleramp','solid'],{labels:[['toneramp','Tone ramp'],['simpleramp','Simple ramp'],['solid','Solid']]}),
    stops:{kind:'stops',label:'Colors',value:[{c:'#1a1a2e',auto:false},{c:'#e94560',auto:false},{c:'#f5a623',auto:false},{c:'#6ee7b7',auto:false}]},
    fade:n('Low opacity',0,0,1,.05),solid:color('Solid','#dddde0'),
    blend:pick('Blend','normal',PALETTE_BLENDS.map(b=>b[0]),{labels:PALETTE_BLENDS}),mix:n('Mix',1,0,1,.01)}},
  hue:{category:'color',label:'Hue shift',description:'Rotate hues of a shape or any image, optionally cycling over time.',inputs:{shape:'visual'},outputs:{shape:'shape'},props:{hue:n('Hue',60,-180,180,1),cycle:n('Cycle (°/s)',0,-120,120,1)}},
  // Style
  // Particles
  particles:{category:'emitters',group:'Particles',label:'Particles',description:'Particles spawned from the shape, driven by loudness.',...SHAPE_IO,props:{
    shape:pick('Shape','circle',PART_SHAPES.map(s=>s[0]),{labels:PART_SHAPES,key:'_particleShape'}),density:n('Density',20,1,50,1,{key:'pPartDensity'}),energy:n('Energy',1,.1,5,.1,{key:'pPartEnergy'}),
    speed:n('Speed',3,0,10,.1,{key:'pPartSpeed'}),life:n('Life',120,10,300,10,{key:'pPartLife'}),size:n('Size',12,1,40,.5,{key:'pPartSize'}),spread:n('Spread',50,0,100,5,{key:'pPartSpread'}),
    gravity:n('Gravity',0,-5,5,.1,{key:'pPartGravity'}),damping:n('Damping',97,80,100,.5,{key:'pPartDamping'}),trail:n('Trail',0,0,60,1,{key:'pPartTrail'})}},
  flowField:{category:'deformers',group:'Noise',label:'Flow field',description:'Noise forces that steer classic Particles.',...SHAPE_IO,props:{
    perlin:n('Perlin',40,0,100,1,{key:'pNoisePerlin'}),curl:n('Curl',0,0,100,1,{key:'pNoiseCurl'}),brownian:n('Brownian',0,0,100,1,{key:'pNoiseBrownian'}),vortex:n('Vortex',0,0,100,1,{key:'pNoiseVortex'}),
    scale:n('Scale',30,1,100,1,{key:'pNoiseScale'}),speed:n('Speed',20,1,100,1,{key:'pNoiseSpeed'})}},
  // Post FX (original per-layer GPU shaders)
  bloom:FX('Bloom','Glow around bright areas.',{bloom:n('Bloom',60,0,100,1,{key:'pfxBloom'}),edge:n('Edge glow',0,0,100,1,{key:'pfxEdgeGlow'})}),
  grade:{...FX('Color correct','Brightness, contrast, saturation, hue.',{brightness:n('Brightness',0,-100,100,1,{key:'pfxBrightness'}),contrast:n('Contrast',10,-100,100,1,{key:'pfxContrast'}),
    saturation:n('Saturation',20,-100,200,1,{key:'pfxSaturation'}),hue:n('Hue',0,-180,180,1,{key:'pfxHue'}),invert:n('Invert',0,0,100,1,{key:'pfxInvert'})}),category:'color'},
  blur:FX('Blur','Directional, radial and focal blur.',{x:n('Blur X',20,0,100,1,{key:'pfxBlurX'}),y:n('Blur Y',0,0,100,1,{key:'pfxBlurY'}),radial:n('Radial',0,0,100,1,{key:'pfxBlurRadial'}),focal:n('Focal area',0,0,100,1,{key:'pfxFocal'})}),
  lens:FX('Lens','Chromatic aberration, vignette, sharpen, scanlines.',{chroma:n('Chromatic',30,0,100,1,{key:'pfxChroma'}),vignette:n('Vignette',40,0,100,1,{key:'pfxVignette'}),sharpen:n('Sharpen',0,0,100,1,{key:'pfxSharpen'}),grain:n('Grain',0,0,100,1,{key:'pfxGrain'}),scanlines:n('Scanlines',0,0,100,1,{key:'pfxScanlines'})}),
  kaleido:FX('Kaleido','Kaleidoscope and reflection.',{kaleido:n('Kaleido',50,0,100,1,{key:'pfxKaleido'}),reflect:n('Reflect',0,0,100,1,{key:'pfxReflect'})}),
  trails:FX('Trails','Motion trails and zoom feedback. Smooth fills the gaps between echoes.',{trails:n('Trails',90,0,100,1,{key:'pfxTrails'}),feedback:n('Feedback',0,0,100,1,{key:'pfxFeedback'}),smooth:n('Smooth',100,0,100,1)}),
  fracture:FX('Fracture','Shatter the image along cracks that open on bass and beats.',{
    mode:pick('Mode','flow',['flow','shatter'],{key:'pfxFracMode'}),cells:n('Cells',44,8,64,1,{key:'pfxFracCells'}),size:n('Size var',65,0,100,1,{key:'pfxFracSize'}),gap:n('Crack gap',30,0,100,1,{key:'pfxFracGap'}),
    disp:n('Displace',58,0,100,1,{key:'pfxFracDisp'}),rot:n('Rotate',34,0,100,1,{key:'pfxFracRot'}),drift:n('Drift',45,0,100,1,{key:'pfxFracDrift'}),bass:n('Bass resp',125,0,200,1,{key:'pfxFracBass'}),
    beat:n('Beat resp',150,0,200,1,{key:'pfxFracBeat'}),recover:n('Recovery',48,0,100,1,{key:'pfxFracRecover'}),glow:n('Crack glow',62,0,100,1,{key:'pfxFracGlow'}),noise:n('Noise',35,0,100,1,{key:'pfxFracNoise'}),seed:n('Seed',17,0,999,1,{key:'pfxFracSeed'})}),
  cornerPin:{category:'postfx',label:'Corner pin',description:'Projection mapping: drag the corners on the preview (or turn the knobs) to fit a wall, screen or object. Pair with Output for a second display.',...FX_IO,props:{
    tlx:n('Top-left X',0,-50,50,.5),tly:n('Top-left Y',0,-50,50,.5),trx:n('Top-right X',0,-50,50,.5),try:n('Top-right Y',0,-50,50,.5),
    brx:n('Bottom-right X',0,-50,50,.5),bry:n('Bottom-right Y',0,-50,50,.5),blx:n('Bottom-left X',0,-50,50,.5),bly:n('Bottom-left Y',0,-50,50,.5),grid:pick('Test grid','off',['off','on'])}},
  effect:{category:'postfx',label:'Quick filter',description:'Simple canvas filter.',...FX_IO,props:{kind:pick('Filter','hue',['hue','brightness','saturate','blur','invert']),amount:n('Amount',.35,0,2,.01)}},
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
  merge:{category:'composite',label:'Merge',description:'Stack up to four images (A at the bottom), each with its own opacity.',inputs:{a:'image',b:'image',c:'image',d:'image'},outputs:{image:'image'},primary:['a','b','c','d'],props:{
    mode:pick('Blend mode','source-over',['source-over','screen','lighter','multiply','difference','overlay'],{labels:[['source-over','Normal'],['screen','Screen'],['lighter','Add'],['multiply','Multiply'],['difference','Difference'],['overlay','Overlay']]}),
    a:n('Opacity A',1,0,1,.01),b:n('Opacity B',1,0,1,.01),c:n('Opacity C',1,0,1,.01),d:n('Opacity D',1,0,1,.01)}},
  mask:{category:'composite',label:'Mask',description:'Show the image only where the mask image is drawn (or only where it is not).',inputs:{image:'image',mask:'image'},outputs:{image:'image'},primary:['image','mask'],props:{invert:bool('Invert'),feather:n('Feather',0,0,40,1)}},
  feedback:{category:'composite',label:'Feedback',description:'Feeds the last frame back under the new one, zoomed and rotated, for tunnels and echoes.',inputs:{image:'image'},outputs:{image:'image'},props:{
    decay:n('Persistence',.85,0,.98,.01),zoom:n('Zoom',1.03,.85,1.2,.005),rotate:n('Rotate (°)',1,-15,15,.1),hue:n('Hue drift',0,-60,60,1),smooth:n('Smooth',100,0,100,1)}},
  imageTransform:{category:'composite',label:'Image transform',description:'Move, scale, rotate and fade an image.',inputs:{image:'image'},outputs:{image:'image'},props:{
    scale:n('Scale',1,.1,4,.01),rotate:n('Rotate (°)',0,-180,180,1),x:n('Offset X',0,-100,100,1),y:n('Offset Y',0,-100,100,1),opacity:n('Opacity',1,0,1,.01),spin:n('Spin (°/s)',0,-180,180,1)}},
  layerIn:{category:'composite',label:'Layer',description:'Another layer’s picture as an image, to remix it here (the previous frame if that layer comes later).',inputs:{},outputs:{image:'image'},props:{layer:n('Layer',1,1,4,1,{noPort:true})}},
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
export function objectOf(p,modelMesh){
  if(p.mode==='model')return {mesh:modelMesh||'knot'};
  const prim={shape:p.mode,size:p.size,detail:p.detail,stretchX:p.stretchX,stretchY:p.stretchY,stretchZ:p.stretchZ,prim:true};
  if(CLONE_SHAPES.has(p.mode))return prim;
  return {...prim,prim:false,mesh:shapeMesh(p.mode)};
}
export function engineSpec(n){
  const p=n.props;
  switch(n.type){
    case 'templateMorph':return {mode:'templateMorph'};
    case 'text':return {mode:'text'};
    case 'waveform3d':
      if(p.render==='normal')return {mode:'simcloner',single:true};
      if(p.mode==='model')return p.render==='points'?{mode:'simsplat',mesh:true}:{mode:'object'};
      return SHAPE_MESHES[p.mode]&&!['tetrahedron','dna','terrain'].includes(p.mode)?{mode:p.mode,solidMesh:shapeMesh(p.mode)}:{mode:p.mode};
    case 'splat':return {mode:'simsplat',splat:true};
    case 'cloner':return {mode:'simcloner'};
    default:return {mode:p.mode};
  }
}
export const MEDIA_KIND={splat:'splat'};
export const mediaKind=n=>n.type==='waveform3d'?(n.props.mode==='model'?'object':undefined):MEDIA_KIND[n.type];
export function nodeTitle(n){return TYPES[n.type].props.mode?.kind==='select'&&isEngine(n.type)?emitterNames[n.props.mode]:TYPES[n.type].label;}
// A 'visual' input (Palette, Hue shift) takes a shape or an image.
// 'any' (Amplify) passes through whatever is wired into it.
export const compatible=(out,input)=>out===input||out==='any'||input==='any'||(out==='shape'&&input==='image')||(input==='visual'&&(out==='shape'||out==='image'))||(input==='source'&&['shape','image','object3d'].includes(out));
export const clone = value => JSON.parse(JSON.stringify(value));
const uid=()=>crypto.randomUUID();
export function defaults(type){return Object.fromEntries(Object.entries(TYPES[type].props).map(([k,v])=>[k,clone(v.value)]));}
export function node(type,x=40,y=50,props={}) {
  if (!Object.hasOwn(TYPES,type)) throw Error('Unknown node type');
  const p={...defaults(type),...props};
  return {id:uid(),type,x,y,props:type==='palette'?legacyPalette(p):p};
}
export function layer(index=1) {
  const sound=node('audioIn',40,70),emitter=index===1?node('gpuParticles',250,70):node('waveform2d',250,70),pal=node('palette',460,70),fx=node('bloom',670,70,{bloom:20}),output=node('output',880,70);
  return {id:uid(),name:`Layer ${index}`,visible:true,opacity:1,blend:'screen',nodes:[sound,emitter,pal,fx,output],edges:[
    {from:sound.id,out:'audio',to:emitter.id,input:'audio'},
    {from:emitter.id,out:'shape',to:pal.id,input:'shape'},
    {from:pal.id,out:'shape',to:fx.id,input:'image'},
    {from:fx.id,out:'image',to:output.id,input:'image'}
  ]};
}
export const VERSION=13;
export function project() { return {format:'audiograph-pro',version:VERSION,layers:[layer()]}; }
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
    return v.map(x=>{const c=typeof x==='string'?x:x?.c;if(typeof c!=='string'||!/^#[0-9a-fA-F]{6}$/.test(c))throw Error(`${label} must be #rrggbb colours`);return {c:c.toLowerCase(),auto:typeof x==='object'&&x.auto===true};});
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
  if(raw.version===VERSION)return raw;
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
export const VIEW_LIMITS={yaw:[-3600,3600],pit:[-85,85],px:[-4,4],py:[-4,4],zm:[.2,6]};
export function cleanView(v){
  if(!v||typeof v!=='object')return null;
  const o={yaw:0,pit:0,px:0,py:0,zm:1};
  for(const [k,[lo,hi]] of Object.entries(VIEW_LIMITS))if(Number.isFinite(v[k]))o[k]=Math.max(lo,Math.min(hi,v[k]));
  return o.yaw||o.pit||o.px||o.py||o.zm!==1?o:null;
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
    clean.nodes=g.nodes.map(nd=>{
      if(!nd||!Object.hasOwn(TYPES,nd.type))throw Error('Unknown node type');
      if(isEngine(nd.type))emitters++;
      if(!nd.props||typeof nd.props!=='object'||Array.isArray(nd.props))throw Error('Node properties are missing');
      const props={},src=nd.type==='palette'?legacyPalette(nd.props):nd.props;
      for(const [key,s] of Object.entries(TYPES[nd.type].props))props[key]=cleanProp(s,src[key],s.label);
      const out={id:unique(nd.id),type:nd.type,x:finite(nd.x,-10000,10000,'Node X'),y:finite(nd.y,-10000,10000,'Node Y'),props};
      if(nd.auto!==undefined){
        if(!Array.isArray(nd.auto)||nd.auto.length>64)throw Error('Invalid auto knobs');
        const auto=[...new Set(nd.auto)].filter(k=>typeof k==='string'&&(autoKnob(nd.type,k)));if(auto.length)out.auto=auto;
      }
      return out;
    });
    if(clean.nodes.filter(nd=>nd.type==='output').length>1)throw Error('Only one Output is allowed per layer');
    clean.edges=g.edges.map(e=>{if(!e)throw Error('Invalid connection');return {from:id(e.from),to:id(e.to),out:id(e.out),input:id(e.input)};});
    order(clean);return clean;
  });
  if(emitters>LIMITS.emitters)throw Error(`Limit: ${LIMITS.emitters} renderer nodes per project (each is an isolated GPU engine)`);
  const mapping=cleanMapping(raw.mapping);
  return mapping?{format:'audiograph-pro',version:VERSION,layers,mapping}:{format:'audiograph-pro',version:VERSION,layers};
}
// Knobs that can run in Auto mode: number properties with a port, and renderer option knobs ("opt:<id>").
export function autoKnob(type,key){
  const s=TYPES[type]?.props[key];if(s)return s.kind==='number'&&!s.noPort;
  return !!TYPES[type]?.engine&&/^opt:[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(key);
}
// Auto drift: two slow sines per knob (seeded by node and knob) around the knob's own value.
export function autoDrift(s,home,seed,clock){
  let h=2166136261;for(let i=0;i<seed.length;i++){h^=seed.charCodeAt(i);h=Math.imul(h,16777619);}
  const r=k=>((h>>>(k*5))&1023)/1023,ph1=r(0)*6.283,ph2=r(1)*6.283,w1=6.283/(16+r(2)*14),w2=6.283/(7+r(3)*6);
  const u=.6*Math.sin(ph1+clock*w1)+.4*Math.sin(ph2+clock*w2);
  return Math.max(s.min,Math.min(s.max,home+u*(s.max-s.min)*.35));
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
    const st=paletteStops(props);
    out._colorMode=props.mode;out._solidColor=props.solid;out._toneStops=st.tone;out._simpleStops=st.simple;
    // A Palette after particles emitted from a picture recolours them instead of keeping the picture's colours.
    if(out._sim?.emitColor==='source')out._sim={...out._sim,emitColor:'palette'};
    return out;
  }
  if(type==='motion'||type==='spin'){out._spin=Math.abs(props.spin);out._spinDir=(props.spin<0?-1:1)*(props.dir==='left'?-1:1);out._speed=props.speed;return out;}
  if(type==='particles')out._particlesOn=true;
  if(type==='webcam'){out._cam={displace:props.displace,colors:props.colors==='on',dir:props.dir,smooth:props.smooth};return out;}
  for(const [k,s] of Object.entries(TYPES[type].props)){
    if(s.sim){out._sim={...out._sim,[s.sim]:props[k]};continue;}
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
