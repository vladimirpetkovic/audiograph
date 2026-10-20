export const EMITTERS = {
  General: [['linear','Linear'],['circle','Circle'],['concentric','Concentric'],['spiral','Spiral'],['phyllotaxis','Phyllotaxis'],['fractal','Fractal'],['growth','Growth'],['sacred','Sacred'],['graph','Graph'],['lissajous','Harmonic'],['scatter','Scatter']],
  Simulations: [['simparticles','Particles'],['simfluid','Fluid'],['simsmoke','Smoke'],['simboids','Boids'],['simsand','Granular Sand'],['simferro','Ferrofluid'],['simcloner','3D Cloner']],
  '3D': [['terrain','Terrain'],['sphere','Sphere'],['tetrahedron','Tetrahedron'],['dna','DNA'],['knot','Knot'],['cube','Cube'],['torus','Torus']],
  Input: [['image','Image'],['video','Video'],['simsplat','Gaussian Splat'],['pixelwarp','Pixel Warp'],['text','Text'],['custom','Math (built-in)'],['object','3D Object (OBJ file)']]
};
export const emitterNames = Object.fromEntries(Object.values(EMITTERS).flat());
const number = (label, value, min, max, step=.01) => ({label, value, min, max, step, kind:'number'});
const choice = (label, value, choices) => ({label, value, choices, kind:'select'});
export const TYPES = {
  value: {label:'Value', description:'A constant numeric signal', inputs:{}, outputs:{value:'number'}, props:{value:number('Value',.7,0,2)}},
  oscillator: {label:'Oscillator', description:'A slow, animated control', inputs:{}, outputs:{value:'number'}, props:{rate:number('Rate (Hz)',.28,.01,8),depth:number('Depth',.7,0,1),offset:number('Offset',.25,0,1)}},
  audio: {label:'Audio band', description:'One shared audio analyser', inputs:{}, outputs:{value:'number'}, props:{band:choice('Band','bass',['bass','mids','high','full']),gain:number('Gain',1,0,8)}},
  map: {label:'Map range', description:'Scale and offset a control', inputs:{value:'number'}, outputs:{value:'number'}, props:{scale:number('Scale',1,-4,4),offset:number('Offset',0,-2,2)}},
  emitter: {label:'Emitter', description:'An existing Audiograph renderer', inputs:{drive:'number'}, outputs:{image:'image'}, props:{mode:choice('Emitter','simfluid',Object.keys(emitterNames)),drive:number('Unconnected drive',.7,0,2),energy:number('Energy (%)',100,0,200,1),size:number('Line / particle size',3,1,20,1),hue:number('Hue rotation',0,-180,180,1),text:{kind:'text',label:'Text',value:'AUDIOGRAPH',max:100}}},
  effect: {label:'Image effect', description:'Colour, brightness and blur', inputs:{image:'image',amount:'number'}, outputs:{image:'image'}, props:{kind:choice('Effect','hue',['hue','brightness','saturate','blur','invert']),amount:number('Unconnected amount',.35,0,2)}},
  blend: {label:'Blend', description:'Combine two image branches', inputs:{a:'image',b:'image'}, outputs:{image:'image'}, props:{mode:choice('Blend mode','screen',['screen','source-over','multiply','difference','lighter']),mix:number('Second image mix',.5,0,1)}},
  output: {label:'Output', description:'Send this graph to its layer', inputs:{image:'image'}, outputs:{}, props:{}}
};
export const clone = value => JSON.parse(JSON.stringify(value));
export function node(type,x=40,y=50) {
  if (!Object.hasOwn(TYPES,type)) throw Error('Unknown node type');
  return {id:crypto.randomUUID(),type,x,y,props:Object.fromEntries(Object.entries(TYPES[type].props).map(([k,v])=>[k,v.value]))};
}
export function layer(index=1) {
  const control=node(index===1?'oscillator':'audio',32,60), emitter=node('emitter',230,60), effect=node('effect',430,60), output=node('output',630,60);
  if(index!==1) emitter.props.mode='circle';
  return {id:crypto.randomUUID(),name:`Layer ${index}`,visible:true,opacity:1,nodes:[control,emitter,effect,output],edges:[
    {from:control.id,out:'value',to:emitter.id,input:'drive'},
    {from:emitter.id,out:'image',to:effect.id,input:'image'},
    {from:effect.id,out:'image',to:output.id,input:'image'}
  ]};
}
export function project() { return {format:'audiograph-pro',version:1,layers:[layer()]}; }
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
    const sourcePorts=TYPES[from.type].outputs,targetPorts=TYPES[to.type].inputs;
    if(!Object.hasOwn(sourcePorts,e.out)||!Object.hasOwn(targetPorts,e.input))throw Error('Connection references a missing port');
    const out=sourcePorts[e.out],input=targetPorts[e.input];
    if(out!==input)throw Error(`Type mismatch: ${out} cannot connect to ${input}`);
    const key=e.to+':'+e.input;
    if(occupied.has(key))throw Error('An input can have only one connection');
    occupied.add(key);indegree.set(to.id,indegree.get(to.id)+1);adjacency.get(from.id).push(to.id);
  }
  const queue=graph.nodes.filter(n=>indegree.get(n.id)===0), result=[];
  for(let i=0;i<queue.length;i++) {
    const n=queue[i];result.push(n);
    for(const next of adjacency.get(n.id)){indegree.set(next,indegree.get(next)-1);if(indegree.get(next)===0)queue.push(nodes.get(next));}
  }
  if(result.length!==graph.nodes.length)throw Error('Cycle rejected. Use internal Emitter state, not feedback wires.');
  return result;
}
export function validate(raw) {
  if(!raw||raw.format!=='audiograph-pro'||raw.version!==1)throw Error('Expected an Audiograph Pro version 1 project');
  if(!Array.isArray(raw.layers)||raw.layers.length<1||raw.layers.length>4)throw Error('A project needs 1–4 layer graphs');
  const ids=new Set();let emitters=0;
  const unique=value=>{const key=id(value);if(ids.has(key))throw Error('Duplicate ID');ids.add(key);return key;};
  const layers=raw.layers.map(g=>{
    if(!g||typeof g.name!=='string'||g.name.length>80||!g.name.trim())throw Error('Layer name must contain 1–80 characters');
    if(typeof g.visible!=='boolean')throw Error('Layer visibility must be boolean');
    if(!Array.isArray(g.nodes)||g.nodes.length>40||!Array.isArray(g.edges)||g.edges.length>100)throw Error('Limit: 40 nodes and 100 connections per layer');
    const clean={id:unique(g.id),name:g.name,visible:g.visible,opacity:finite(g.opacity,0,1,'Opacity'),nodes:[],edges:[]};
    clean.nodes=g.nodes.map(n=>{
      if(!n||!Object.hasOwn(TYPES,n.type))throw Error('Unknown node type');
      if(n.type==='emitter')emitters++;
      if(!n.props||typeof n.props!=='object'||Array.isArray(n.props))throw Error('Node properties are missing');
      const props={};
      for(const key of Object.keys(n.props))if(!Object.hasOwn(TYPES[n.type].props,key))throw Error(`Unknown property: ${key}`);
      for(const [key,s] of Object.entries(TYPES[n.type].props)) {
        const v=n.props[key];
        if(s.kind==='number')props[key]=finite(v,s.min,s.max,s.label);
        else if(s.kind==='select'){if(!s.choices.includes(v))throw Error(`Invalid ${s.label}`);props[key]=v;}
        else {if(typeof v!=='string'||v.length>s.max)throw Error(`Invalid ${s.label}`);props[key]=v;}
      }
      return {id:unique(n.id),type:n.type,x:finite(n.x,-10000,10000,'Node X'),y:finite(n.y,-10000,10000,'Node Y'),props};
    });
    if(clean.nodes.filter(n=>n.type==='output').length>1)throw Error('Only one Output is allowed per layer');
    clean.edges=g.edges.map(e=>{if(!e)throw Error('Invalid connection');return {from:id(e.from),to:id(e.to),out:id(e.out),input:id(e.input)};});
    order(clean);return clean;
  });
  if(emitters>4)throw Error('Limit: four Emitters per project (isolated GPU contexts)');
  return {format:'audiograph-pro',version:1,layers};
}
export function connect(graph,from,out,to,input) {
  const candidate={from,out,to,input},edges=graph.edges.filter(e=>e.to!==to||e.input!==input);
  const trial={...graph,edges:[...edges,candidate]};order(trial);graph.edges=trial.edges;
}
export function filterFor(kind,amount) {
  const a=Math.max(0,Math.min(2,amount));
  return {hue:`hue-rotate(${a*180}deg)`,brightness:`brightness(${a*2})`,saturate:`saturate(${a*3})`,blur:`blur(${a*8}px)`,invert:`invert(${Math.min(1,a)})`}[kind];
}
