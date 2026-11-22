import {SCENE_CAMERA,TYPES,VERSION,node,validate} from './graph.js';
import {rng} from './autopilot.js';

const PALETTES={
  ice:['#071021','#2149b6','#46bce5','#d5faff'],
  ember:['#200817','#963659','#ec6947','#ffe0a6'],
  jade:['#071714','#1d765c','#80bd8d','#e5ffd0'],
  violet:['#170a29','#67429a','#c16ed3','#f7d6ff']
};
export const SCENE_PALETTES=Object.keys(PALETTES);

const RECIPES={
  orbit:{name:'Orbital Filaments',webgpu:true,build(g){
    const mesh=g.voice('waveform3d',{mode:g.pick(['torus','knot','ico']),render:'waveform',size:72,thick:1.5},1);
    const surface=g.palette(mesh,2,1);
    const dust=g.voice('gpuParticles',{mode:'simparticles',particleSurfaceFlow:true,particleSpread:0,particleFloor:false,
      emitColors:'palette',opts:{pSpSpeed:0,pSpTrail:44,pSpAmount:g.level(50,90),pSpSize:7}},3,1);
    g.wire(surface,'shape',dust,'emit');
    const accent=g.palette(dust,4,1);
    return g.merge(surface,accent,5,.72);
  },camera:{zoom:65,tilt:14,dof:15,focus:52,orbit:8,orbitSound:6}},
  kinetic:{name:'Kinetic Array',webgpu:true,build(g){
    const form=g.add('waveform3d',{mode:g.pick(['ico','cube','pyramid'])},0,1);
    const layout=g.pick(['ring','helix','grid']);
    const cloner=g.voice('cloner',{layout,countX:layout==='grid'?8:28,countY:layout==='grid'?5:1,countZ:1,
      spacingX:layout==='grid'?115:265,spacingY:layout==='grid'?115:170,opts:{pG3Size:45}},1);
    g.wire(form,'object',cloner,'object');
    const sound=g.after(cloner,'soundEffector',{listen:'index',scaleX:25,scaleY:g.level(40,90),scaleZ:25,delay:15},2);
    const field=g.after(sound,'fieldEffector',{field:g.pick(['wave','ripple']),strength:38,size:155,speed:30},3);
    const material=g.after(field,'material',{display:'edges',surface:'palette',edges:'palette',colorBy:'sound',
      roughness:48,metallic:25,emission:14},4);
    const lit=g.after(material,'light',{ambient:90,key:135,shadow:25},5);
    return g.palette(lit,6);
  },camera:{zoom:70,tilt:23,dof:22,focus:55,orbit:10,orbitSound:5}},
  attractor:{name:'Strange Currents',build(g){
    const field=g.voice('attractor',{system:g.pick(TYPES.attractor.props.system.choices),count:1700,trail:65,hud:false,
      probes:0,morph:g.level(16,48),boost:72,size:95,color:g.colors[2],vibrate:18},1);
    return g.after(field,'motionBlur',{mode:'smear',amount:18,samples:4,fade:55,sound:25},2);
  }},
  signal:{name:'Signal Fragments',build(g){
    const signal=g.voice('oscilloscope',{},1);
    const split=g.after(signal,'cutter',{pattern:g.pick(['mondrian','columns','golden']),pieces:7,gap:4,lines:0,
      shuffle:g.level(14,34),move:10,recut:0,every:'4'},2);
    g.wire(g.sound,'audio',split,'audio');
    return g.palette(split,3);
  }},
  contour:{name:'Resonant Contours',build(g){
    const form=g.voice('waveform2d',{mode:g.pick(['sacred','lissajous','concentric','phyllotaxis']),thick:1.8,
      density:270,scale:88},1);
    const bend=g.after(form,'ripple',{amount:9},2);
    const beat=g.voice('beat',{decay:480},1,1),range=g.after(beat,'map',{scale:g.level(10,40)/100,offset:0},2,1);
    g.wire(range,'value',bend,'amount');
    const colored=g.palette(bend,3);
    return g.after(colored,'bloom',{bloom:24,edge:6},4);
  }},
  fluid:{name:'Chromatic Eddies',webgpu:true,build(g){
    const liquid=g.voice('gpuParticles',{mode:g.pick(['simfluid','simsmoke'])},1);
    const curl=g.after(liquid,'vorticity',{fluid:g.level(38,64),smoke:g.level(32,54)},2);
    const color=g.palette(curl,3);
    return g.after(color,'lens',{chroma:7,vignette:30,grain:3},4);
  }},
  type:{name:'Living Type',build(g){
    const cells=g.voice('cellular',{mode:'life',cell:8,ghost:65,inject:g.level(25,60),hud:false},1);
    const letters=g.voice('plainText',{text:g.pick(['PULSE','PHASE','ECHO']),bounce:8},1,1);
    const cut=g.after(cells,'mask',{},2);
    g.wire(letters,'image',cut,'mask');
    const colored=g.palette(cut,3);
    return g.after(colored,'bloom',{bloom:18,edge:12},4);
  }}
};

export const SCENE_RECIPES=Object.fromEntries(Object.entries(RECIPES).map(([id,{name,webgpu}])=>[id,{name,webgpu:!!webgpu}]));

// Both Random and a future agent submit the same bounded, reproducible scene brief.
export function directScene(project,{recipe,seed,palette,energy=50}){
  if(!Object.hasOwn(RECIPES,recipe))throw Error('Unknown scene recipe');
  if(!Number.isSafeInteger(seed))throw Error('A scene recipe needs an integer seed');
  if(palette!==undefined&&!Object.hasOwn(PALETTES,palette))throw Error('Unknown scene palette');
  if(!Number.isFinite(energy)||energy<0||energy>100)throw Error('Scene energy must be between 0 and 100');
  const {name,build,camera}=RECIPES[recipe],r=rng(seed),pick=arr=>arr[Math.floor(r()*arr.length)];
  const defaultPalette=pick(SCENE_PALETTES),colors=PALETTES[palette??defaultPalette];
  const level=(lo,hi)=>Math.round(lo+(hi-lo)*energy/100);
  const graph={id:crypto.randomUUID(),name,visible:true,opacity:1,blend:'source-over',nodes:[],edges:[]};
  const add=(type,props,x,row=0)=>{const n=node(type,40+x*220,70+row*150,props);graph.nodes.push(n);return n;};
  const wire=(a,out,b,input)=>graph.edges.push({from:a.id,out,to:b.id,input});
  const after=(a,type,props,x,row)=>{
    const b=add(type,props,x,row);
    wire(a,Object.keys(TYPES[a.type].outputs)[0],b,Object.keys(TYPES[type].inputs)[0]);
    return b;
  };
  const sound=add('audioIn',{},0);
  const voice=(type,props,x,row)=>{const b=add(type,props,x,row);wire(sound,'audio',b,'audio');return b;};
  const colorize=(a,x,row)=>after(a,'palette',{stops:colors.map(c=>({c,a:1,auto:false}))},x,row);
  const merge=(a,b,x,opacity)=>{
    const m=after(a,'merge',{b:opacity},x);
    wire(b,Object.keys(TYPES[b.type].outputs)[0],m,'b');
    return m;
  };
  const hero=build({add,wire,after,sound,voice,palette:colorize,merge,colors,pick,level});
  after(hero,'output',{},1+Math.max(...graph.nodes.map(n=>(n.x-40)/220)));
  const next=validate({...project,version:VERSION,layers:[graph],
    ...(camera&&{settings:{...project.settings,camera:{...SCENE_CAMERA,...camera}}})});
  return {project:next,name};
}
