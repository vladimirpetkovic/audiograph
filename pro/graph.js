// Audiograph Pro graph model: categorized node catalog, typed ports, validation and migration.
// Emitter modes by node type: each is one of the original Audiograph renderers.
export const MODES = {
  waveform2d: [['linear','Linear'],['circle','Circle'],['concentric','Concentric'],['spiral','Spiral'],['phyllotaxis','Phyllotaxis'],['fractal','Fractal'],['growth','Growth'],['sacred','Sacred'],['graph','Graph'],['lissajous','Harmonic'],['scatter','Scatter'],['sine','Sine'],['custom','Math']],
  waveform3d: [['terrain','Terrain'],['sphere','Sphere'],['tetrahedron','Tetrahedron'],['dna','DNA'],['knot','Knot'],['cube','Cube'],['torus','Torus']],
  gpuParticles: [['simparticles','Particles'],['simfluid','Fluid'],['simsmoke','Smoke'],['simboids','Boids'],['simsand','Granular Sand'],['simferro','Ferrofluid'],['simcloner','3D Cloner']]
};
export const emitterNames = Object.fromEntries(Object.values(MODES).flat());

export const CATEGORIES = [
  {id:'inputs',label:'Inputs',color:'#5eead4',hint:'Sound, pictures, camera, text and 3D you bring in'},
  {id:'waveforms',label:'Waveforms',color:'#f59e0b',hint:'Audio-reactive line patterns, flat and 3D'},
  {id:'emitters',label:'Emitters',color:'#fb7185',hint:'Particles: classic and native WebGPU simulations'},
  {id:'deformers',label:'Deformers',color:'#c084fc',hint:'Bend the shape'},
  {id:'color',label:'Color',color:'#f472b6',hint:'Palettes and hue'},
  {id:'style',label:'Style',color:'#fbbf24',hint:'Line style and outlines'},
  {id:'postfx',label:'Post FX',color:'#22d3ee',hint:'Image effects (GPU shaders)'},
  {id:'controls',label:'Controls',color:'#6ee7b7',hint:'Numbers that move knobs'},
  {id:'audio',label:'Audio analysis',color:'#a3e635',hint:'Turn sound into numbers or reshape it'},
  {id:'composite',label:'Composite',color:'#dddde0',hint:'Mix and output'}
];
export const PORT_COLORS={number:'#6ee7b7',shape:'#f59e0b',image:'#8aa2ff',audio:'#a3e635'};

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
const FX=(label,description,props)=>({category:'postfx',label,description,...FX_IO,fx:true,props});
// Lines, transform, motion and symmetry live on every renderer node (grouped in its inspector).
const G=(group,spec)=>({...spec,group});
export const GEO_PROPS={
  density:G('Lines',n('Density',350,80,800,10,{key:'_lines'})),height:G('Lines',n('Height',80,5,300,5,{key:'_height'})),thick:G('Lines',n('Thickness',1,.5,15,.25,{key:'_thick'})),
  contrast:G('Lines',n('Contrast',75,5,100,1,{key:'_contrast'})),sensitivity:G('Lines',n('Sensitivity',100,5,200,5,{key:'_sensitivity'})),fade:G('Lines',n('Fade edges',0,0,100,5,{key:'_fadeEdge'})),
  varyHeight:G('Lines',bool('Vary height',true,{key:'_varyHeight'})),varyThick:G('Lines',bool('Vary thickness',false,{key:'_varyThick'})),
  scale:G('Transform',n('Scale',100,50,400,10,{key:'_zoom'})),rotation:G('Transform',n('Rotation',0,-180,180,1,{key:'_rotation'})),x:G('Transform',n('Offset X',0,-100,100,1,{key:'_offX'})),y:G('Transform',n('Offset Y',0,-100,100,1,{key:'_offY'})),
  tilt:G('Transform',n('3D tilt',0,-180,180,1,{key:'_dragRotX',rad:true})),turn:G('Transform',n('3D rotate',0,-180,180,1,{key:'_dragRotY',rad:true})),pulse:G('Transform',bool('Zoom on loud',false,{key:'_zoomLoud'})),
  spin:G('Motion',n('Spin',0,-5,5,.1,{key:'_spin'})),speed:G('Motion',n('Speed',1,.1,5,.1,{key:'_speed'})),
  symmetry:G('Symmetry',pick('Symmetry','none',SYMS.map(s=>s[0]),{labels:SYMS,key:'_symmetryMode'})),symGap:G('Symmetry',n('Gap',0,0,100,1,{key:'_symGap'})),
  flipH:G('Symmetry',bool('Flip H',false,{key:'_flipH'})),flipV:G('Symmetry',bool('Flip V',false,{key:'_flipV'})),mirror:G('Symmetry',bool('Reflection',false,{key:'_mirrorOn'}))};
// Original layer parameters for a renderer's geometry props (spin carries its direction).
export function geoMods(p){
  const out={};
  for(const [k,s] of Object.entries(GEO_PROPS)){let v=p[k];if(v===undefined)continue;if(s.rad)v=v*Math.PI/180;out[s.key]=v;}
  out._spin=Math.abs(p.spin??0);out._spinDir=(p.spin??0)<0?-1:1;return out;
}
// Geometry props seeded from an original layer look (templates).
export function geoFromLook(look){
  const out={};
  for(const [k,s] of Object.entries(GEO_PROPS)){
    let v=look[s.key];if(v===undefined)continue;
    if(k==='spin'){v=v*(look._spinDir<0?-1:1);}
    if(s.kind==='number'){if(typeof v!=='number')continue;if(s.rad)v=v*180/Math.PI;out[k]=Math.max(s.min,Math.min(s.max,Math.round(v/s.step)*s.step));}
    else if(s.kind==='bool'){if(typeof v==='boolean')out[k]=v;}
    else if(s.choices.includes(v))out[k]=v;
  }
  return out;
}
// Renderer nodes: each owns one isolated Audiograph engine. "audio" overrides the project sound; "drive" replaces it with a number.
const ENGINE=(category,label,description,props,outputs={},group)=>({category,group,label,description,engine:true,inputs:{audio:'audio',drive:'number'},outputs:{shape:'shape',...outputs},
  props:{...props,...GEO_PROPS,drive:n('Drive',.7,0,2,.01,{noPort:true}),intensity:G('Sound response',n('Intensity',100,0,200,5)),punch:G('Sound response',n('Bass punch',60,0,100,1)),release:G('Sound response',n('Bass release',220,60,800,10)),dynamics:G('Sound response',n('Dynamics',50,0,100,1)),
    opts:dict('Options',120,'number'),chips:dict('Choices',60,'string'),look:{kind:'look',label:'Template look',value:{}}}});
const LINE_SHAPES=[['straight','Straight'],['rounded','Rounded'],['dotted','Dotted'],['dashed','Dashed'],['pins','Pins'],['tapered','Tapered'],['caps','Caps'],['cross','Cross'],['numbers','Numbers'],['symbols','Symbols'],['words','Words'],['cascade','Cascade'],['off','Off']];
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
export function paletteStops(props){
  const cols=[props.c2,props.c3,props.c4];if(props.colors==='4')cols.push(props.c5);
  return {tone:[props.c1+Math.round(props.fade*255).toString(16).padStart(2,'0'),...cols],simple:cols};
}

export const TYPES = {
  // Inputs: what you bring in. Visual inputs render with the original's own renderer for that content.
  audioIn:{category:'inputs',label:'Audio',description:'The sound: a file, the microphone or system audio. Wire “audio” into emitters (or an Audio EQ); the numbers drive any knob.',
    inputs:{},outputs:{audio:'audio',level:'number',bass:'number',mids:'number',high:'number',beat:'number'},props:{gain:n('Number gain',1,0,8,.05),decay:n('Beat decay (ms)',350,30,3000,10)}},
  computer:{category:'inputs',group:'Data',label:'Computer',description:'This computer’s load as numbers: CPU, GPU, memory, frame rate, network and battery. Real values with the local helper, browser estimates without it.',
    inputs:{},outputs:{cpu:'number',gpu:'number',memory:'number',fps:'number',network:'number',battery:'number'},
    props:{source:pick('Source','browser',['browser','helper'],{labels:[['browser','Browser'],['helper','Local helper']]}),port:n('Helper port',7703,1024,65535,1,{noPort:true}),smooth:n('Smoothing',.5,0,.95,.01,{noPort:true})}},
  clock:{category:'inputs',group:'Data',label:'Clock',description:'Time as numbers: position in the minute, hour, day and week, plus a tempo beat (phase and pulse).',
    inputs:{},outputs:{second:'number',minute:'number',hour:'number',day:'number',beat:'number',pulse:'number'},props:{bpm:n('Tempo (BPM)',120,20,300,1,{noPort:true})}},
  pointer:{category:'inputs',group:'Data',label:'Mouse & keys',description:'Your hands as numbers: mouse position and speed, clicks, held button, typing and scrolling.',
    inputs:{},outputs:{x:'number',y:'number',speed:'number',click:'number',held:'number',keys:'number',scroll:'number'},
    props:{decay:n('Pulse decay (ms)',400,30,3000,10,{noPort:true}),flipY:bool('Up is 1',true)}},
  midi:{category:'inputs',group:'Data',label:'MIDI',description:'A MIDI controller or keyboard: one CC knob/fader, a note (or any note), gate, pitch and pitch bend.',
    inputs:{},outputs:{cc:'number',note:'number',gate:'number',pitch:'number',bend:'number'},
    props:{channel:n('Channel (0 = any)',0,0,16,1,{noPort:true}),cc:n('CC number',1,0,127,1,{noPort:true}),note:n('Note (-1 = any)',-1,-1,127,1,{noPort:true})}},
  image:ENGINE('inputs','Image','A picture drawn as audio-reactive lines, or warped by the sound.',{render:pick('Render','lines',['lines','warp'],{labels:[['lines','Lines'],['warp','Pixel warp']]})}),
  video:ENGINE('inputs','Video','A video file drawn as audio-reactive lines, or warped by the sound.',{render:pick('Render','lines',['lines','warp'],{labels:[['lines','Lines'],['warp','Pixel warp']]})}),
  camera:ENGINE('inputs','Camera','Your camera drawn as audio-reactive lines, or warped by the sound. Its motion and brightness are numbers for any knob.',{render:pick('Render','lines',['lines','warp'],{labels:[['lines','Lines'],['warp','Pixel warp']]})},{motion:'number',brightness:'number'}),
  text:ENGINE('inputs','Text','Your words drawn as audio-reactive lines.',{text:text('Text','AUDIOGRAPH')}),
  object:ENGINE('inputs','3D Object','An OBJ model (the built-in knot until you load one), as a mesh or as a point cloud.',{render:pick('Render','mesh',['mesh','cloud'],{labels:[['mesh','Mesh'],['cloud','Point cloud']]})}),
  splat:ENGINE('inputs','Gaussian Splat','A .ply / .splat point cloud that reacts to the sound (a demo cloud until you load one).',{}),
  // Waveforms and Emitters (particles)
  waveform2d:ENGINE('waveforms','Waveform 2D','Flat audio-reactive line patterns.',{mode:pick('Waveform','circle',MODES.waveform2d.map(m=>m[0]),{labels:MODES.waveform2d})},{},'2D'),
  waveform3d:ENGINE('waveforms','Waveform 3D','Audio-reactive lines on 3D forms.',{mode:pick('Waveform','sphere',MODES.waveform3d.map(m=>m[0]),{labels:MODES.waveform3d})},{},'3D'),
  gpuParticles:ENGINE('emitters','WebGPU particles','Native WebGPU simulations: particles, fluid, smoke, flocks, sand, ferrofluid, 3D cloner.',{mode:pick('Simulation','simfluid',MODES.gpuParticles.map(m=>m[0]),{labels:MODES.gpuParticles})},{},'WebGPU particles'),
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
    c1:color('Low','#1a1a2e'),c2:color('Mid','#e94560'),c3:color('High','#f5a623'),c4:color('Peak','#6ee7b7'),c5:color('Max','#ffffff'),colors:pick('Colors','3',['3','4']),
    fade:n('Low opacity',0,0,1,.05),solid:color('Solid','#dddde0')}},
  hue:{category:'color',label:'Hue shift',description:'Rotate hues, optionally cycling over time.',...SHAPE_IO,props:{hue:n('Hue',60,-180,180,1),cycle:n('Cycle (°/s)',0,-120,120,1)}},
  // Style
  lineStyle:{category:'style',label:'Line style',description:'How each line is drawn.',...SHAPE_IO,props:{
    shape:pick('Style','dotted',LINE_SHAPES.map(s=>s[0]),{labels:LINE_SHAPES,key:'_lineShape'}),size:n('Size',100,30,250,5,{key:'_styleSize'}),density:n('Density',100,30,250,5,{key:'_styleDensity'}),angle:n('Angle',0,-90,90,1,{key:'_styleAngle'})}},
  outline:{category:'style',label:'Outline',description:'Outline around the shape.',...SHAPE_IO,props:{
    style:pick('Style','solid',['solid','dotted','dashed','connected','fill'],{key:'_outlineStyle'}),opacity:n('Opacity',60,5,100,5,{key:'_outlineOpacity'}),weight:n('Weight',2,.5,8,.25,{key:'_outlineWeight'}),
    gap:n('Gap',0,0,30,1,{key:'_outlineDist'}),count:n('Count',1,1,10,1,{key:'_outlineCount'}),spacing:n('Spacing',4,1,20,1,{key:'_outlineSpace'})}},
  // Particles
  particles:{category:'emitters',group:'Particles',label:'Particles',description:'Particles spawned from the shape, driven by loudness.',...SHAPE_IO,props:{
    shape:pick('Shape','circle',PART_SHAPES.map(s=>s[0]),{labels:PART_SHAPES,key:'_particleShape'}),density:n('Density',20,1,50,1,{key:'pPartDensity'}),energy:n('Energy',1,.1,5,.1,{key:'pPartEnergy'}),
    speed:n('Speed',3,0,10,.1,{key:'pPartSpeed'}),life:n('Life',120,10,300,10,{key:'pPartLife'}),size:n('Size',12,1,40,.5,{key:'pPartSize'}),spread:n('Spread',50,0,100,5,{key:'pPartSpread'}),
    gravity:n('Gravity',0,-5,5,.1,{key:'pPartGravity'}),damping:n('Damping',97,80,100,.5,{key:'pPartDamping'}),trail:n('Trail',0,0,60,1,{key:'pPartTrail'})}},
  flowField:{category:'emitters',group:'Particles',label:'Flow field',description:'Noise forces that steer particles.',...SHAPE_IO,props:{
    perlin:n('Perlin',40,0,100,1,{key:'pNoisePerlin'}),curl:n('Curl',0,0,100,1,{key:'pNoiseCurl'}),brownian:n('Brownian',0,0,100,1,{key:'pNoiseBrownian'}),vortex:n('Vortex',0,0,100,1,{key:'pNoiseVortex'}),
    scale:n('Scale',30,1,100,1,{key:'pNoiseScale'}),speed:n('Speed',20,1,100,1,{key:'pNoiseSpeed'})}},
  // Post FX (original per-layer GPU shaders)
  bloom:FX('Bloom','Glow around bright areas.',{bloom:n('Bloom',60,0,100,1,{key:'pfxBloom'}),edge:n('Edge glow',0,0,100,1,{key:'pfxEdgeGlow'})}),
  grade:FX('Color correct','Brightness, contrast, saturation, hue.',{brightness:n('Brightness',0,-100,100,1,{key:'pfxBrightness'}),contrast:n('Contrast',10,-100,100,1,{key:'pfxContrast'}),
    saturation:n('Saturation',20,-100,200,1,{key:'pfxSaturation'}),hue:n('Hue',0,-180,180,1,{key:'pfxHue'}),invert:n('Invert',0,0,100,1,{key:'pfxInvert'})}),
  blur:FX('Blur','Directional, radial and focal blur.',{x:n('Blur X',20,0,100,1,{key:'pfxBlurX'}),y:n('Blur Y',0,0,100,1,{key:'pfxBlurY'}),radial:n('Radial',0,0,100,1,{key:'pfxBlurRadial'}),focal:n('Focal area',0,0,100,1,{key:'pfxFocal'})}),
  lens:FX('Lens','Chromatic aberration, vignette, sharpen, scanlines.',{chroma:n('Chromatic',30,0,100,1,{key:'pfxChroma'}),vignette:n('Vignette',40,0,100,1,{key:'pfxVignette'}),sharpen:n('Sharpen',0,0,100,1,{key:'pfxSharpen'}),grain:n('Grain',0,0,100,1,{key:'pfxGrain'}),scanlines:n('Scanlines',0,0,100,1,{key:'pfxScanlines'})}),
  kaleido:FX('Kaleido','Kaleidoscope and reflection.',{kaleido:n('Kaleido',50,0,100,1,{key:'pfxKaleido'}),reflect:n('Reflect',0,0,100,1,{key:'pfxReflect'})}),
  trails:FX('Trails','Motion trails and zoom feedback.',{trails:n('Trails',60,0,100,1,{key:'pfxTrails'}),feedback:n('Feedback',0,0,100,1,{key:'pfxFeedback'})}),
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
    decay:n('Persistence',.85,0,.98,.01),zoom:n('Zoom',1.03,.85,1.2,.005),rotate:n('Rotate (°)',1,-15,15,.1),hue:n('Hue drift',0,-60,60,1)}},
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
const MEDIA_SOURCE={image:"setPixelWarpSource('image'",video:"setPixelWarpSource('video'",camera:"setPixelWarpSource('camera'"};
// How a renderer node maps onto the original app: layout mode, forced source button, required media.
export function engineSpec(n){
  const p=n.props;
  switch(n.type){
    case 'image':return p.render==='warp'?{mode:'pixelwarp',source:MEDIA_SOURCE.image,need:'image'}:{mode:'image',need:'image'};
    case 'video':return p.render==='warp'?{mode:'pixelwarp',source:MEDIA_SOURCE.video,need:'video'}:{mode:'video',source:"setVidSource('file'",need:'video'};
    case 'camera':return p.render==='warp'?{mode:'pixelwarp',source:MEDIA_SOURCE.camera}:{mode:'video',source:"setVidSource('camera'"};
    case 'text':return {mode:'text'};
    case 'object':return p.render==='cloud'?{mode:'simsplat',mesh:true}:{mode:'object'};
    case 'splat':return {mode:'simsplat',splat:true};
    default:return {mode:p.mode};
  }
}
export const MEDIA_KIND={image:'image',video:'video',object:'object',splat:'splat'};
export function nodeTitle(n){return TYPES[n.type].props.mode?.kind==='select'&&isEngine(n.type)?emitterNames[n.props.mode]:TYPES[n.type].label;}
export const compatible=(out,input)=>out===input||(out==='shape'&&input==='image');
export const clone = value => JSON.parse(JSON.stringify(value));
const uid=()=>crypto.randomUUID();
export function defaults(type){return Object.fromEntries(Object.entries(TYPES[type].props).map(([k,v])=>[k,clone(v.value)]));}
export function node(type,x=40,y=50,props={}) {
  if (!Object.hasOwn(TYPES,type)) throw Error('Unknown node type');
  return {id:uid(),type,x,y,props:{...defaults(type),...props}};
}
export function layer(index=1) {
  const sound=node('audioIn',40,70),emitter=index===1?node('gpuParticles',250,70):node('waveform2d',250,70),fx=node('bloom',460,70),output=node('output',670,70);
  return {id:uid(),name:`Layer ${index}`,visible:true,opacity:1,blend:'screen',nodes:[sound,emitter,fx,output],edges:[
    {from:sound.id,out:'audio',to:emitter.id,input:'audio'},
    {from:emitter.id,out:'shape',to:fx.id,input:'image'},
    {from:fx.id,out:'image',to:output.id,input:'image'}
  ]};
}
export const VERSION=4;
export function project() { return {format:'audiograph-pro',version:VERSION,layers:[layer()]}; }
export const LIMITS={layers:4,nodes:60,edges:160,emitters:8};
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
  text:{type:'text',props:{}},object:{type:'object',props:{render:'mesh'}},simsplat:{type:'splat',props:{}}};
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
  for(const g of out.layers||[])foldGeometry(g);
  out.version=VERSION;return out;
}
// Version 4: the Lines, Transform, Motion and Symmetry nodes became renderer properties.
const OLD_GEO={lines:{density:'density',height:'height',thick:'thick',contrast:'contrast',sensitivity:'sensitivity',fade:'fade',varyHeight:'varyHeight',varyThick:'varyThick'},
  transform:{scale:'scale',rotation:'rotation',x:'x',y:'y',tilt:'tilt',turn:'turn',pulse:'pulse'},motion:{spin:'spin',speed:'speed'},
  symmetry:{mode:'symmetry',gap:'symGap',flipH:'flipH',flipV:'flipV',mirror:'mirror'}};
function foldGeometry(g){
  if(!Array.isArray(g?.nodes)||!Array.isArray(g.edges))return;
  for(const old of g.nodes.filter(n=>OLD_GEO[n?.type])){
    const into=g.edges.find(e=>e&&e.to===old.id&&e.input==='shape');
    // Walk up the shape chain to the renderer that draws it.
    let up=into&&g.nodes.find(n=>n&&n.id===into.from);const seen=new Set();
    while(up&&!TYPES[up.type]?.engine&&!seen.has(up.id)){seen.add(up.id);const e=g.edges.find(e=>e&&e.to===up.id&&e.input==='shape');up=e&&g.nodes.find(n=>n&&n.id===e.from);}
    const map=OLD_GEO[old.type];
    if(up&&TYPES[up.type]?.engine){up.props=up.props||{};for(const [k,to] of Object.entries(map))if(old.props?.[k]!==undefined)up.props[to]=old.props[k];
      for(const e of g.edges)if(e&&e.to===old.id&&map[e.input]){e.to=up.id;e.input=map[e.input];}}
    g.edges=g.edges.filter(e=>e&&e.to!==old.id);
    for(const e of g.edges)if(e.from===old.id&&into){e.from=into.from;e.out=into.out;}
    g.edges=g.edges.filter(e=>e.from!==old.id);
    g.nodes=g.nodes.filter(n=>n!==old);
  }
}
export function validate(input) {
  if(!input||input.format!=='audiograph-pro'||![1,2,3,4].includes(input.version))throw Error('Expected an Audiograph Pro project');
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
      if(isEngine(nd.type))emitters++;
      if(!nd.props||typeof nd.props!=='object'||Array.isArray(nd.props))throw Error('Node properties are missing');
      const props={};
      for(const [key,s] of Object.entries(TYPES[nd.type].props))props[key]=cleanProp(s,nd.props[key],s.label);
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
  return {format:'audiograph-pro',version:VERSION,layers};
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
