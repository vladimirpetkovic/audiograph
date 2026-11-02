import * as sensors from './sensors.js';
import {liveData,liveStatus} from './livedata.js';
import {aiRender,aiStatus,aiClient,AI_DEFAULT_URL} from './ai.js';
import {FORCE_KNOBS,TYPES,defaults,CATEGORIES,MODES,emitterNames,isEngine,engineSpec,nodeTitle,MEDIA_KIND,mediaKind,objectOf,VERSION,PALETTES,PORT_COLORS,EQ_KEYS,EQ_HZ,LIMITS,LAYER_BLENDS,SOLID_PRESETS,paletteStops,paletteAuto,MAX_STOPS,inputsOf,portType,OPT_PORT,autoDrift,motionFromLook,GEO_PROPS,STYLE_PROPS,geoMods,geoFromLook,compatible,resolveOut,clone,node,layer,project,validate,order,connect,filterFor,modulate,applyShapeNode,fxSettings} from './graph.js';
import {EmitterEngine,WIDTH,HEIGHT,BINS,setCameraProvider,setRenderResolution} from './engine.js';
import * as ui from './ui.js';
import {needsWarp,warpInto} from './warp.js';
import {cleanView,spinProps} from './graph.js';
import {Media,drawMedia,analyse,emitterAsset} from './media.js';
import * as mapping from './mapping.js';
import * as map3d from './map3d.js';
import {parseCamera} from './camera-import.js';
import * as autopilot from './autopilot.js';
import {SCENES} from './scenes.js';
import {Pilot,Generator,features,durFor,readVibe,vibeText,nameOf,recolor as recolorLook,ROLE_OP,MIN_GAP,isSim,smoother} from './pilot.js';
import {ORIGINAL_PRESETS} from './templates.js';
import {TemplateMorph,TEMPLATE_NAMES} from './morph.js';
import {createTour} from './tour.js';

const $=id=>document.getElementById(id),el=ui.el;
const catOf=type=>CATEGORIES.find(c=>c.id===TYPES[type].category);
// The simulation a shape-chain node acts on (walks up the shape wires), or null.
function upstreamSim(g,n){
  const seen=new Set();let cur=n;
  while(cur&&!seen.has(cur.id)){seen.add(cur.id);if(cur.type==='gpuParticles')return cur.props.mode;if(cur.type==='cloner')return 'simcloner';if(isEngine(cur.type))return null;
    const e=g.edges.find(e=>e.to===cur.id&&e.input==='shape');cur=e&&g.nodes.find(m=>m.id===e.from);}
  return null;
}
// Cloner: the wired objects become the original cloner's shape list; primitives by name, OBJ / knot as meshes.
const PRIM_DEFAULT={shape:'sphere',size:60,detail:4,stretchX:100,stretchY:100,stretchZ:100,prim:true};
const CLONER_KEYS=Object.keys(TYPES.cloner.props).filter(k=>k==='layout'||TYPES.cloner.props[k].key?.startsWith('pG3'));
// A 3D Object drawn Normal is a Cloner of one: itself at the centre, framed with some room around it.
const SINGLE={...defaults('cloner'),countX:1,countY:1,countZ:1};
function cloneObjects(objs,p,shape){
  if(!objs.length)objs.push(PRIM_DEFAULT);
  const names=[],meshes=[];
  for(const o of objs){if(o.prim&&o.shape!=='knot')names.push(o.shape);else{names.push('mesh'+meshes.length);meshes.push(o.prim?'knot':o.mesh);}}
  const first=objs.find(o=>o.prim)||PRIM_DEFAULT,mods=shape.mods;
  Object.assign(mods,{pG3Size:first.size,pG3Detail:first.detail,pG3ObjX:first.stretchX,pG3ObjY:first.stretchY,pG3ObjZ:first.stretchZ});
  for(const [k,s] of Object.entries(TYPES.cloner.props))if(s.key?.startsWith('pG3'))mods[s.key]=p[k];
  mods._sim={...mods._sim,g3Mode:p.layout,g3Shape:names.join(',')};
  shape.job.meshes=meshes;
}
// Physics nodes (Forces, Turbulence) only show the knobs for the simulation they are wired after.
const SIM_PROPS=type=>Object.values(TYPES[type].props).some(s=>s.sims);
function simKeys(g,n){
  const t=TYPES[n.type],keys=Object.keys(t.props);
  if(n.type==='liveData')return keys.filter(k=>k!=='place'||['ocean','weather'].includes(n.props.source));
  if(!SIM_PROPS(n.type))return keys;
  const mode=upstreamSim(g,n);if(!mode)return keys;
  const own=keys.filter(k=>!t.props[k].sims||t.props[k].sims.includes(mode));return own.length?own:keys;
}
let state=project(),active=state.layers[0].id,selected=null,pending=null,paused=false,pageHidden=false;
// Several nodes selected (marquee or Shift-click): `multi` holds them and `selected` is null.
let multi=new Set();
// The UI is drawn with CSS zoom: pointer and rect values are screen pixels, CSS lengths are divided by it.
const uiZ=()=>parseFloat(getComputedStyle(document.body).zoom)||1;
const DATA_INPUTS=new Set(['computer','clock','pointer','midi','liveData']),lastOuts=new Map();
const lastValues=new Map(),history=[],future=[],engines=new Map(),surfaces=new Map(),view={x:20,y:20,zoom:.9},nodeState=new Map(),fxSlots=new Map(),thumbs=new Map();
let plans=new Map(),frame=0,lastTime=0,elapsed=0,renderErrors=[],nodeErrors=new Set(),statusSource='action',liveBefore=null;
const preview=$('preview'),previewCtx=preview.getContext('2d');
const graph=()=>state.layers.find(g=>g.id===active)||state.layers[0];
const findNode=id=>{for(const g of state.layers){const n=g.nodes.find(n=>n.id===id);if(n)return n;}};
function message(text,error=false,source='action'){statusSource=source;$('status').textContent=text;$('status').classList.toggle('error',error);}
function attempt(fn){try{return fn();}catch(error){message(error.message,true);return false;}}

// ---------- project state ----------
function reconcile(){
  const emitterIDs=new Set(state.layers.flatMap(g=>g.nodes.filter(n=>isEngine(n.type)).map(n=>n.id)));
  const anyFx=state.layers.some(g=>g.nodes.some(n=>TYPES[n.type].fx));
  for(const [id,engine] of engines)if(id==='__fx'?(!anyFx||emitterIDs.size>0):!emitterIDs.has(id)){engine.dispose();engines.delete(id);}
  const nodeIDs=new Set(state.layers.flatMap(g=>g.nodes.map(n=>n.id)));
  for(const map of [surfaces,thumbs])for(const [id,cv] of map)if(!nodeIDs.has(id.split(':')[0])){cv.width=cv.height=1;map.delete(id);}
  for(const id of nodeState.keys())if(!nodeIDs.has(id.split(':')[0]))nodeState.delete(id);
  for(const [id,m] of mediaEls)if(!nodeIDs.has(id)){m.clear();mediaEls.delete(id);}
  plans=new Map(state.layers.map(g=>{
    // Outputs and everything feeding them run; data inputs always run (cheap) so their meters stay live.
    const needed=new Set(g.nodes.filter(n=>n.type==='output'||DATA_INPUTS.has(n.type)).map(n=>n.id)),queue=[...needed];
    for(let i=0;i<queue.length;i++)for(const edge of g.edges)if(edge.to===queue[i]&&!needed.has(edge.from)){needed.add(edge.from);queue.push(edge.from);}
    return [g.id,order(g).filter(n=>needed.has(n.id))];
  }));
  layerReaders=new Set(state.layers.flatMap(g=>g.nodes.filter(n=>n.type==='layerIn').map(n=>state.layers[n.props.layer-1]?.id)).filter(Boolean));
  mapLayers=new Set((state.mapping?.surfaces||[]).filter(s=>s.source!=='all').map(s=>state.layers[s.source-1]?.id).filter(Boolean));
  for(const id of layerImages.keys())if(!layerReaders.has(id)&&!mapLayers.has(id))layerImages.delete(id);
  if(mapSel&&!state.mapping?.surfaces.some(s=>s.id===mapSel)){mapSel=null;mapPt=-1;}
  if(!state.layers.some(g=>g.id===active))active=state.layers[0].id;
  if(!graph().nodes.some(n=>n.id===selected))selected=null;
  for(const id of multi)if(!graph().nodes.some(n=>n.id===id))multi.delete(id);if(multi.size<2)multi.clear();
}
function commit(next,label='Updated graph',before=state){
  const clean=validate(next);
  if(JSON.stringify(clean)===JSON.stringify(before))return;
  history.push(clone(before));if(history.length>100)history.shift();future.length=0;state=clean;
  pending=null;reconcile();renderUI();message(label);if(paused)draw(elapsed);
}
function edit(fn,label){return attempt(()=>{const next=clone(state);fn(next,next.layers.find(g=>g.id===active));commit(next,label);return true;});}
// Knob drags update the live state every frame and become one undo step on release.
function live(fn){if(!liveBefore)liveBefore=clone(state);fn(state);updateSummaries();if(paused)draw(elapsed);}
function liveCommit(label){
  const before=liveBefore||clone(state);liveBefore=null;
  try{commit(clone(state),label,before);}catch(error){state=before;reconcile();renderUI();message(error.message,true);}
}
function restoreSnapshot(snapshot){tm.playing=false;state=validate(snapshot);pending=null;reconcile();renderUI();if(paused)draw(elapsed);}
function undo(){if(history.length){future.push(clone(state));restoreSnapshot(history.pop());message('Undone');}}
function redo(){if(future.length){history.push(clone(state));restoreSnapshot(future.pop());message('Redone');}}
function importProject(raw,label='Imported project. Reload media files in the Input nodes.'){
  const clean=validate(raw);if(!clean.mapping&&state.mapping)clean.mapping=clone(state.mapping);tm.playing=false;commit(clean,label);active=state.layers[0].id;selected=null;renderUI();fit();return clone(state);
}
// Chain nodes pass a shape/image (or an audio signal, e.g. Audio EQ) through: they splice into wires and heal when removed.
const isChain=type=>{const t=TYPES[type],i=Object.values(t.inputs),o=Object.values(t.outputs);if(!o.length)return false;
  if(i.includes('audio')&&o.every(x=>x==='audio'))return true;if(i.includes('any'))return true;return (i.includes('shape')||i.includes('image')||i.includes('visual'))&&o.every(x=>x==='shape'||x==='image');};
// Adding a modifier while a node is selected splices it into that node's chain.
function addNode(type,x,y,props={}){
  let made=null;
  const ok=edit((p,g)=>{
    const sel=g.nodes.find(n=>n.id===selected),n=node(type,0,0,props);made=n;
    if(x===undefined){
      if(sel&&isChain(type)&&Object.keys(TYPES[sel.type].outputs).length){
        const out=Object.keys(TYPES[sel.type].outputs)[0],inPort=Object.keys(TYPES[type].inputs)[0],outPort=Object.keys(TYPES[type].outputs)[0];
        if(compatible(TYPES[sel.type].outputs[out],TYPES[type].inputs[inPort])){
          for(const m of g.nodes)if(m.x>sel.x+20)m.x+=210;
          n.x=sel.x+210;n.y=sel.y;g.nodes.push(n);
          const downstream=g.edges.filter(e=>e.from===sel.id&&e.out===out);
          g.edges=g.edges.filter(e=>!(e.from===sel.id&&e.out===out));
          g.edges.push({from:sel.id,out,to:n.id,input:inPort});
          for(const e of downstream)if(compatible(TYPES[type].outputs[outPort],inputsOf(g.nodes.find(m=>m.id===e.to).type)[e.input]))g.edges.push({...e,from:n.id,out:outPort});
          return;
        }
      }
      const vp=$('graphViewport'),cx=(vp.clientWidth/2-view.x)/view.zoom,cy=(vp.clientHeight/3-view.y)/view.zoom;
      if(sel){n.x=sel.x+(['controls','audio','inputs'].includes(TYPES[type].category)&&!isEngine(type)?-210:30);n.y=sel.y+150;}else{n.x=cx-84;n.y=cy;}
    }else{n.x=x;n.y=y;}
    g.nodes.push(n);
    // A new renderer listens to the layer's Audio node straight away.
    const src=isEngine(type)&&g.nodes.find(m=>m.type==='audioIn');if(src)g.edges.push({from:src.id,out:'audio',to:n.id,input:'audio'});
    // A Cloner always starts with an object; a new object goes into the selected Cloner's first free slot.
    if(type==='cloner'){const o=node('waveform3d',n.x-210,n.y+40,{mode:'sphere',render:'normal'});g.nodes.push(o);g.edges.push({from:o.id,out:'object',to:n.id,input:'object'});}
    const cl=TYPES[type].outputs.object&&sel?.type==='cloner'&&sel,slot=cl&&['object','object2','object3'].find(k=>!g.edges.some(e=>e.to===cl.id&&e.input===k));
    if(slot){n.x=cl.x-210;n.y=cl.y+40+130*['object','object2','object3'].indexOf(slot);g.edges.push({from:n.id,out:'object',to:cl.id,input:slot});}
  },`Added ${TYPES[type].label}`);
  if(ok&&made){selected=made.id;multi.clear();renderUI();return made.id;}
}
function addLayer(){
  const next=clone(state),g=layer(next.layers.length+1);next.layers.push(g);
  return attempt(()=>{commit(next,'Added layer');active=g.id;selected=g.nodes.find(n=>isEngine(n.type)).id;renderUI();return g.id;});
}
// Remove a node's wires; a chain node's input source is reconnected to its downstream inputs.
function detachEdges(g,id){
  const n=g.nodes.find(n=>n.id===id),inE=g.edges.find(e=>e.to===id&&['shape','image','audio'].includes(e.input)),outE=g.edges.filter(e=>e.from===id);
  g.edges=g.edges.filter(e=>e.from!==id&&e.to!==id);
  if(n&&inE&&isChain(n.type))for(const e of outE){const src=g.nodes.find(m=>m.id===inE.from),dst=g.nodes.find(m=>m.id===e.to);if(src&&dst&&compatible(TYPES[src.type].outputs[inE.out],inputsOf(dst.type)[e.input]))g.edges.push({from:inE.from,out:inE.out,to:e.to,input:e.input});}
}
function removeSelected(){
  if(multi.size){const ids=new Set(multi);multi.clear();return edit((p,g)=>{g.edges=g.edges.filter(e=>!ids.has(e.from)&&!ids.has(e.to));g.nodes=g.nodes.filter(n=>!ids.has(n.id));},`Deleted ${ids.size} nodes`);}
  if(!selected)return;const id=selected;
  edit((p,g)=>{detachEdges(g,id);g.nodes=g.nodes.filter(n=>n.id!==id);},'Deleted node');
}
function duplicateSelected(){
  if(multi.size){if(copySel(true))pasteNodes(clip);return;}
  const n=graph().nodes.find(n=>n.id===selected);if(!n)return;
  const id=addNode(n.type,n.x+30,n.y+30,clone(n.props));if(id)selected=id;
}
// ---------- multi-selection, clipboard, custom nodes ----------
let clip=null;try{clip=JSON.parse(localStorage.getItem('agpro.clip')||'null');}catch{}
const selIds=()=>multi.size?[...multi]:selected?[selected]:[];
function setSelection(ids){
  ids=[...new Set(ids)];multi=new Set(ids.length>1?ids:[]);selected=ids.length===1?ids[0]:null;
  renderProperties();document.querySelectorAll('#nodes .node').forEach(x=>x.classList.toggle('selected',x.dataset.id===selected||multi.has(x.dataset.id)));updateHint();
}
function snippet(){
  const g=graph(),ids=new Set(selIds());if(!ids.size)return null;
  return {nodes:clone(g.nodes.filter(n=>ids.has(n.id))),edges:clone(g.edges.filter(e=>ids.has(e.from)&&ids.has(e.to)))};
}
function copySel(quiet){
  const c=snippet();if(!c)return false;clip=c;try{localStorage.setItem('agpro.clip',JSON.stringify(c));}catch{}
  if(!quiet)message(`Copied ${c.nodes.length} node${c.nodes.length>1?'s':''}`);return true;
}
// Paste a snippet: fresh ids, internal wires kept, placed at (gx,gy) or offset from where it was copied.
function pasteNodes(c,gx,gy,label='Pasted'){
  if(!c?.nodes?.length)return null;
  const minX=Math.min(...c.nodes.map(n=>n.x)),minY=Math.min(...c.nodes.map(n=>n.y)),dx=gx===undefined?40:Math.round(gx-minX),dy=gy===undefined?40:Math.round(gy-minY),ids=new Map();
  const ok=edit((p,g)=>{
    // A layer has one Output: a pasted Output joins only when the layer has none.
    const hasOut=g.nodes.some(m=>m.type==='output');
    for(const n of c.nodes){if(!Object.hasOwn(TYPES,n.type)||n.type==='output'&&hasOut)continue;const m=node(n.type,n.x+dx,n.y+dy,clone(n.props));if(n.auto)m.auto=[...n.auto];ids.set(n.id,m.id);g.nodes.push(m);}
    for(const e of c.edges)if(ids.has(e.from)&&ids.has(e.to))g.edges.push({...e,from:ids.get(e.from),to:ids.get(e.to)});
  },`${label} ${c.nodes.length} node${c.nodes.length>1?'s':''}`);
  if(ok&&!ids.size)return null;
  if(!ok)return null;
  if(gx===undefined&&clip===c)clip={nodes:c.nodes.map(n=>({...n,x:n.x+40,y:n.y+40})),edges:c.edges};
  const made=[...ids.values()];multi=new Set(made.length>1?made:[]);selected=made.length===1?made[0]:null;renderUI();return made;
}
const CUSTOM_KEY='agpro.custom';
function customNodes(){try{const a=JSON.parse(localStorage.getItem(CUSTOM_KEY)||'[]');return Array.isArray(a)?a.filter(c=>c&&typeof c.name==='string'&&Array.isArray(c.nodes)):[];}catch{return [];}}
function saveCustom(name){
  const c=snippet();name=String(name||'').trim().slice(0,40);if(!c||!name)return false;
  const list=customNodes().filter(x=>x.name!==name);list.push({name,...c});
  try{localStorage.setItem(CUSTOM_KEY,JSON.stringify(list));}catch(e){message('Could not save: '+e.message,true);return false;}
  renderLibrary();message(`Saved “${name}” to Custom`);return true;
}
function removeCustom(name){try{localStorage.setItem(CUSTOM_KEY,JSON.stringify(customNodes().filter(x=>x.name!==name)));}catch{}renderLibrary();message(`Removed “${name}” from Custom`);}
// A custom node drops in where the view is centred.
function insertCustom(c,gx,gy){
  if(gx===undefined){const vp=$('graphViewport');gx=(vp.clientWidth/2-view.x)/view.zoom-120;gy=(vp.clientHeight/2-view.y)/view.zoom-60;}
  return pasteNodes(c,gx,gy,`Added ${c.name}:`);
}
function renderMulti(root){
  const head=el('div','insp-head'),h=el('h3','',`${multi.size} nodes`);head.append(h);root.append(head);
  const a=section(root).appendChild(el('div','insp-actions'));
  for(const [label,fn,prop] of [['Copy',()=>copySel(),'copy'],['Duplicate',duplicateSelected,'duplicate'],['Delete',removeSelected,'delete']]){const b=el('button','mbtn',label);b.type='button';b.dataset.property=prop;b.onclick=fn;a.append(b);}
  const s=section(root,'Save as custom node'),row=el('div','custom-save'),name=el('input');name.type='text';name.maxLength=40;name.placeholder='Name';name.dataset.property='customName';
  const save=el('button','mbtn','Save');save.type='button';save.dataset.property='customSave';save.onclick=()=>{if(saveCustom(name.value))name.value='';else name.focus();};
  name.onkeydown=e=>{if(e.key==='Enter')save.click();};row.append(name,save);s.append(row);
}
function connection(from,out,to,input){return edit((p,g)=>connect(g,from,out,to,input),'Connected');}

// ---------- audio ----------
const audio={context:null,buffer:null,source:null,live:null,analyser:null,monitor:null,dest:null,startedAt:0,offset:0,name:''};
const A={freq:new Uint8Array(BINS),wave:new Float32Array(2048),rate:48000,bands:{bass:0,mids:0,high:0,full:0},beat:0,beatPulse:0,avg:0,lastBeat:0,live:false};
// Routing: source → analyser → dest (recording) and analyser → monitor → speakers.
// The monitor is muted for mic / system input so it never feeds back.
function audioContext(){
  if(!audio.context||audio.context.state==='closed'){
    const c=audio.context=new AudioContext({latencyHint:'interactive'}),a=c.createAnalyser();a.fftSize=BINS*2;a.smoothingTimeConstant=.5;a.minDecibels=-100;a.maxDecibels=-30;
    audio.analyser=a;audio.monitor=c.createGain();audio.dest=c.createMediaStreamDestination();
    a.connect(audio.monitor);audio.monitor.connect(c.destination);a.connect(audio.dest);
  }
  return audio.context;
}
// Browsers only start audio inside a user gesture: create/resume synchronously in the click itself.
function unlockAudio(){const c=audioContext();if(c.state!=='running')c.resume().catch(()=>{});return c;}
document.addEventListener('pointerdown',()=>{if(audio.context&&audio.context.state==='suspended'&&(audio.source||audio.live))audio.context.resume().catch(()=>{});},true);
async function ensureRunning(){
  const c=audioContext();if(c.state!=='running')await Promise.race([c.resume(),new Promise(r=>setTimeout(r,400))]);
  if(c.state!=='running')message('The browser blocked sound · click anywhere on the page to enable it',true);
}
function stopAudio(keepOffset=false){
  if(audio.source){audio.source.onended=null;try{audio.source.stop();}catch{}audio.source.disconnect();if(keepOffset)audio.offset+=audio.context.currentTime-audio.startedAt;audio.source=null;}
  if(!keepOffset)audio.offset=0;syncPlay();
}
// Source buttons live in the Audio node's inspector, so they may not exist right now.
function sourceName(){return audio.live?(audio.live.kind==='mic'?'Microphone':'System audio'):audio.name&&audio.buffer?audio.name:'Demo beat';}
function updateAudioUI(){
  for(const k of ['mic','system'])$(k)?.classList.toggle('on',audio.live?.kind===k);
  const name=sourceName();$('audioName').textContent=name==='Demo beat'?'Demo beat · add audio':name;
  const cur=document.querySelector('.audio-source');if(cur)cur.textContent='Now: '+name+(audio.live||audio.source||name==='Demo beat'?'':' (stopped)');
  updateSummaries();
}
function stopLive(){
  if(!audio.live)return;const {kind,stream,node}=audio.live;audio.live=null;
  stream.getTracks().forEach(t=>t.stop());node.disconnect();if(audio.monitor)audio.monitor.gain.value=1;updateAudioUI();
}
// Play shows Pause while something runs: the audio file if one is loaded, else the visuals.
function syncPlay(){const on=audio.buffer?!!audio.source:!paused;$('play').classList.toggle('on',on);$('play').setAttribute('aria-label',on?'Pause':'Play');}
function setPaused(v){paused=v;lastTime=0;syncPlay();}
async function play(){
  if(!audio.buffer)throw Error('Load an audio file first (or use Mic / System)');
  if(audio.source){stopAudio(true);message('Paused audio');return;}
  stopLive();unlockAudio();audio.monitor.gain.value=1;
  const source=audio.context.createBufferSource();source.buffer=audio.buffer;source.connect(audio.analyser);audio.source=source;
  const offset=audio.offset%audio.buffer.duration;audio.startedAt=audio.context.currentTime;audio.offset=offset;
  source.onended=()=>{if(audio.source===source){audio.source=null;audio.offset=0;syncPlay();}};
  source.start(0,offset);syncPlay();message('Playing '+audio.name);updateAudioUI();
  await ensureRunning();
}
async function startLive(kind,getStream){
  if(audio.live?.kind===kind){stopLive();message(kind==='mic'?'Microphone off':'System audio off');return;}
  stopAudio();stopLive();unlockAudio();
  if(!navigator.mediaDevices)throw Error('needs HTTPS or localhost');
  const stream=await getStream(),tracks=stream.getAudioTracks();
  stream.getVideoTracks().forEach(t=>{t.stop();stream.removeTrack(t);});
  if(!tracks.length){stream.getTracks().forEach(t=>t.stop());throw Error(kind==='system'?'no audio was shared · tick “Share system audio” (or share a tab with its audio)':'no microphone found');}
  const node=audio.context.createMediaStreamSource(stream);node.connect(audio.analyser);audio.monitor.gain.value=0;
  audio.live={kind,stream,node};updateAudioUI();
  tracks[0].addEventListener('ended',()=>{if(audio.live?.stream===stream){stopLive();message(kind==='mic'?'Microphone disconnected':'System audio sharing ended');}});
  await ensureRunning();
  message(kind==='mic'?`Listening to ${tracks[0].label||'the microphone'}`:'System audio connected · the visuals follow whatever your computer plays');
}
const toggleMic=()=>startLive('mic',()=>navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}}));
const toggleSystem=()=>startLive('system',()=>{
  if(!navigator.mediaDevices.getDisplayMedia)throw Error('not supported in this browser · use desktop Chrome or Edge');
  message('Pick Entire screen and turn on “Share system audio” (or pick a tab and “Share tab audio”)');
  return navigator.mediaDevices.getDisplayMedia({audio:{suppressLocalAudioPlayback:false,echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:true,systemAudio:'include',selfBrowserSurface:'exclude',monitorTypeSurfaces:'include'});
});
const audioError=(label,e)=>message(`${label}: ${e.name==='NotAllowedError'?'permission denied · allow it in the address bar and try again':e.message}`,true);
// Demo signal: a 120 BPM groove so everything moves before audio is loaded.
// Demo signal: a 120 BPM groove with a music-like (dB-scaled, pink) spectrum so everything moves before audio is loaded.
const toByte=db=>Math.max(0,Math.min(255,(db+100)/70*255));
function musicDb(f,kick,hat,pad,i,t){
  const lf=Math.log2(Math.max(20,f)/200);
  return -40-8.5*Math.max(0,lf)+kick*16*Math.exp(-f/160)+pad*9*Math.exp(-((lf-1.8)**2)/2)+hat*12*Math.exp(-((lf-5.5)**2)/.8)+3*Math.sin(i*.37+t*3)+2*Math.sin(i*.071-t*1.7);
}
function demoSpectrum(t){
  const beatT=t%.5,kick=Math.exp(-beatT*9),hat=Math.exp(-((t+.25)%.5)*22),pad=.5+.3*Math.sin(t*.9)+.2*Math.sin(t*2.3),hz=A.rate/(BINS*2);
  for(let i=0;i<BINS;i++)A.freq[i]=toByte(musicDb(i*hz,kick,hat,pad,i,t)-(i<2?30:0));
  for(let i=0;i<A.wave.length;i++)A.wave[i]=kick*.8*Math.sin(i/48000*2*Math.PI*55)+pad*.15*Math.sin(i*.09+t);
}
function readAudio(t){
  A.live=!!(audio.analyser&&(audio.source||audio.live));
  if(A.live){A.rate=audio.context.sampleRate;audio.analyser.getByteFrequencyData(A.freq);audio.analyser.getFloatTimeDomainData(A.wave);}
  else{A.rate=48000;demoSpectrum(t);}
  A.bands=bandsOf(A.freq);
  const b=A.bands.bass;A.avg=A.avg*.95+b*.05;
  if(b>A.avg*1.25+.04&&t-A.lastBeat>.22){A.lastBeat=t;A.beat++;A.beatPulse=1;}
  A.beatPulse*=.86;
}
function bandsOf(freq){
  const hz=A.rate/(BINS*2),band=(a,b)=>{let s=0,c=0;for(let i=Math.max(1,Math.floor(a/hz));i<Math.min(BINS,Math.ceil(b/hz));i++){s+=freq[i]/255;c++;}return c?s/c:0;};
  return {bass:band(30,250),mids:band(250,2500),high:band(2500,14000),full:band(30,14000)};
}
// The value on an "audio" wire. Unwired audio inputs hear the project sound.
// Amplify: a louder copy of an audio signal (spectrum and waveform, clipped like a real gain stage).
function ampSignal(a,g){
  // Spectrum bytes are dB-scaled (-100…-30 dB over 0…255): a gain shifts them; the float waveform scales.
  const f=new Uint8Array(a.freq.length),w=new Float32Array(a.wave.length),shift=g>0?20*Math.log10(g)*255/70:-255;
  for(let i=0;i<f.length;i++)f[i]=a.freq[i]?Math.max(0,Math.min(255,a.freq[i]+shift)):0;
  for(let i=0;i<w.length;i++)w[i]=Math.max(-1,Math.min(1,a.wave[i]*g));
  return {...a,freq:f,wave:w,bands:bandsOf(f),pulse:Math.min(1,(a.pulse??0)*g)};
}
const projectSignal=()=>({freq:A.freq,wave:A.wave,bands:A.bands,beat:A.beat,pulse:A.beatPulse});
// Pictures (image, video, camera) stay still until audio is wired in.
const SILENT={freq:new Uint8Array(BINS),wave:new Float32Array(2048),bands:{bass:0,mids:0,high:0,full:0},beat:0,pulse:0};
// An emitter driven by a number: a synthetic spectrum whose loudness follows the number.
function driveSpectrum(level,t){
  const freq=new Uint8Array(BINS),wave=new Float32Array(2048),hz=A.rate/(BINS*2),l=Math.max(0,level),gain=l>0?20*Math.log10(l):-100;
  for(let i=0;i<BINS;i++)freq[i]=toByte(musicDb(i*hz,Math.min(1,l),0,.5,i,t)+gain+6);
  for(let i=0;i<wave.length;i++)wave[i]=Math.min(1,l)*.7*Math.sin(i/48000*2*Math.PI*60);
  return {freq,wave};
}
const eqCache=new Map();
function eqGains(props){
  const key=JSON.stringify(props);if(eqCache.has(key))return eqCache.get(key);
  const g=new Float32Array(BINS),hz=A.rate/(BINS*2),logs=EQ_HZ.map(Math.log2);
  for(let i=0;i<BINS;i++){
    const lf=Math.log2(Math.max(16,i*hz));let k=0;while(k<logs.length-1&&lf>logs[k+1])k++;
    const t=Math.max(0,Math.min(1,(lf-logs[k])/((logs[k+1]??logs[k]+1)-logs[k]))),a=props[EQ_KEYS[k]],b=props[EQ_KEYS[Math.min(k+1,9)]];
    g[i]=(a+(b-a)*t)/100*props.gain/100;
  }
  if(eqCache.size>40)eqCache.clear();eqCache.set(key,g);return g;
}

// ---------- evaluation ----------
// Palette on pixels: gradient-map luminance through the palette, then blend over the source.
const lutCache=new Map();
function paletteLut(p){
  const {tone,simple}=paletteStops(p),key=p.mode+'|'+(p.mode==='solid'?p.solid:(p.mode==='simpleramp'?simple:tone).join());
  if(lutCache.has(key))return lutCache.get(key);
  const c=document.createElement('canvas');c.width=256;c.height=1;const x=c.getContext('2d',{willReadFrequently:true});
  if(p.mode==='solid'){x.fillStyle=p.solid;x.fillRect(0,0,256,1);}
  else{const stops=p.mode==='simpleramp'?simple:tone,gr=x.createLinearGradient(0,0,256,0);stops.forEach((s,i)=>gr.addColorStop(i/Math.max(1,stops.length-1),s));x.fillStyle=gr;x.fillRect(0,0,256,1);}
  const lut=x.getImageData(0,0,256,1).data;if(lutCache.size>64)lutCache.clear();lutCache.set(key,lut);return lut;
}
const mapped=new Map();
function recolor(id,src,p){
  if(!mapped.has(id)){const c=document.createElement('canvas');c.width=WIDTH;c.height=HEIGHT;mapped.set(id,c);}
  const m=mapped.get(id),mx=m.getContext('2d',{willReadFrequently:true});mx.clearRect(0,0,WIDTH,HEIGHT);if(!src)return surface(id).canvas;mx.drawImage(src,0,0,WIDTH,HEIGHT);
  const img=mx.getImageData(0,0,WIDTH,HEIGHT),d=img.data,lut=paletteLut(p);
  for(let i=0;i<d.length;i+=4){const a=d[i+3];if(!a)continue;const l=((d[i]*54+d[i+1]*183+d[i+2]*19)>>8)*4;
    d[i]=lut[l];d[i+1]=lut[l+1];d[i+2]=lut[l+2];d[i+3]=a*lut[l+3]/255;}
  mx.putImageData(img,0,0);
  const {canvas,ctx}=surface(id);ctx.drawImage(src,0,0,WIDTH,HEIGHT);
  ctx.globalCompositeOperation=p.blend==='normal'?'source-over':p.blend;ctx.globalAlpha=p.mix;
  if(p.blend==='normal'&&p.mix>=1)ctx.clearRect(0,0,WIDTH,HEIGHT);
  ctx.drawImage(m,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';return canvas;
}
function hueImage(id,src,deg){const {canvas,ctx}=surface(id);if(src){ctx.filter=`hue-rotate(${deg%360}deg)`;ctx.drawImage(src,0,0,WIDTH,HEIGHT);ctx.filter='none';}return canvas;}
// Echo: the history drawn zoomed/rotated (one step), then — with Smooth — the new frame stamped at in-between
// zoom/rotation steps so it bridges the gap to the previous echo instead of leaving separate rings.
const xf=(ctx,zoom,rotate,f)=>{ctx.translate(WIDTH/2,HEIGHT/2);ctx.rotate(rotate*f*Math.PI/180);const z=Math.pow(zoom,f);ctx.scale(z,z);ctx.translate(-WIDTH/2,-HEIGHT/2);};
function echo(ctx,hist,{zoom=1,rotate=0,alpha=1,hue=0}){
  ctx.save();ctx.globalAlpha=alpha;xf(ctx,zoom,rotate,1);
  if(hue)ctx.filter=`hue-rotate(${hue}deg)`;
  ctx.drawImage(hist,0,0);ctx.restore();ctx.filter='none';
}
function bridge(ctx,src,{zoom=1,rotate=0,alpha=1,smooth=0}){
  const moving=Math.abs(zoom-1)>.002||Math.abs(rotate)>.05,steps=smooth>0&&moving?1+Math.round(smooth/100*7):1;
  ctx.save();ctx.globalCompositeOperation='lighten';
  for(let i=steps-1;i>=1;i--){const f=i/steps;ctx.save();ctx.globalAlpha=1-(1-alpha)*f;xf(ctx,zoom,rotate,f);ctx.drawImage(src,0,0,WIDTH,HEIGHT);ctx.restore();}
  ctx.globalAlpha=1;ctx.drawImage(src,0,0,WIDTH,HEIGHT);ctx.restore();
}
function surface(id){
  if(!surfaces.has(id)){const cv=document.createElement('canvas');cv.width=WIDTH;cv.height=HEIGHT;surfaces.set(id,cv);}
  const canvas=surfaces.get(id),ctx=canvas.getContext('2d');ctx.resetTransform();ctx.clearRect(0,0,WIDTH,HEIGHT);ctx.filter='none';ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  return {canvas,ctx};
}
function engineFor(id){if(!engines.has(id))engines.set(id,new EmitterEngine(id,m=>message(m,true,'render')));return engines.get(id);}
function fxEngine(){
  for(const e of engines.values())if(e.status==='ready')return e;
  if(!engines.size)engineFor('__fx');return null;
}
const nstate=(id,init)=>{if(!nodeState.has(id))nodeState.set(id,init());return nodeState.get(id);};
const waves={sine:p=>.5+.5*Math.sin(p*2*Math.PI),triangle:p=>1-Math.abs((p%1)*2-1),saw:p=>p%1,square:p=>(p%1)<.5?1:0};
// Preview: one node's picture fills the viewport instead of the composition (not saved; Esc or V again returns).
let previewId=null,previewImg=null;
const canPreview=n=>!!n&&Object.values(TYPES[n.type].outputs).some(t=>VISUAL_OUT.has(t));
const VISUAL_OUT=new Set(['image','shape']);
function setPreview(id){
  previewId=previewId===id?null:id;const n=previewId&&graph().nodes.find(m=>m.id===previewId);
  document.querySelectorAll('.node').forEach(e=>e.classList.toggle('previewing',e.dataset.id===previewId));
  const b=$('previewBadge');if(b){b.hidden=!previewId;b.querySelector('span').textContent=previewId?'Previewing '+(n?nodeTitle(n):'node'):'';}
  if(id!==null)message(previewId?`Previewing ${n?nodeTitle(n):'node'} — V or Esc returns to the output`:'Showing the output');
}
function toggleBypass(ids){
  const g=graph(),list=ids.map(id=>g.nodes.find(n=>n.id===id)).filter(n=>n&&n.type!=='output');if(!list.length)return;
  const on=!list.every(n=>n.bypass);
  edit((p,g)=>{for(const n of g.nodes)if(ids.includes(n.id)&&n.type!=='output'){if(on)n.bypass=true;else delete n.bypass;}},on?'Bypassed':'Enabled');
}
// Bypass: each output passes on the first input of the same kind (pictures to pictures, numbers to numbers);
// a bypassed emitter or source with nothing to pass draws an empty frame so the chain after it keeps running.
const VISUAL=new Set(['image','shape','visual','source']);let blankCv=null;
function blank(){if(!blankCv||blankCv.width!==WIDTH||blankCv.height!==HEIGHT){blankCv=document.createElement('canvas');blankCv.width=WIDTH;blankCv.height=HEIGHT;}return blankCv;}
function passThrough(n,input,asImage){
  const t=TYPES[n.type],ins=t.engine?[]:Object.entries(t.inputs),r={};
  for(const [key,type] of Object.entries(t.outputs)){
    const vis=VISUAL.has(type),from=ins.find(([,t])=>vis?VISUAL.has(t):t===type);
    const v=from?input(n,from[0]):undefined;
    if(v!==undefined)r[key]=type==='image'?asImage(v,n.id)||blank():v;else if(vis)r[key]=blank();
  }
  return r;
}
function execute(g,time,dt){
  layerView.delete(g.id);
  const outputs=new Map(),byInput=new Map(g.edges.map(e=>[e.to+':'+e.input,e])),rendered=new Map();let image=null;
  const input=(n,key)=>{const e=byInput.get(n.id+':'+key);return e?outputs.get(e.from)?.[e.out]:undefined;};
  const props=n=>{
    const p={...n.props};
    if(n.auto)for(const k of n.auto){const s=TYPES[n.type].props[k];if(s){p[k]=autoDrift(s,p[k],n.id+k,autoClock);autoValues.set(n.id+':'+k,p[k]);}}
    for(const [k,s] of Object.entries(TYPES[n.type].props))if(s.kind==='number'&&!s.noPort&&byInput.has(n.id+':'+k))p[k]=modulate(s,p[k],input(n,k));
    if(n.type==='palette'){const live=input(n,'colors');if(Array.isArray(live)&&live.length>1)p.stops=live.map(c=>({c,auto:false}));}
    return n.type==='palette'?paletteAuto(p,n.id,autoClock):p;
  };
  // A shape becomes an image by rendering its emitter with the accumulated overrides.
  const asImage=(v,consumer)=>{
    if(!v||v instanceof HTMLCanvasElement)return v;
    const key=v.emitter.id+'|'+JSON.stringify(v.mods)+'|'+v.hue+'|'+(v.amp??1);
    if(rendered.has(key))return rendered.get(key);
    const e=engineFor(v.emitter.id),out=e.draw({...v.job,mods:v.mods,hue:v.hue,view:g.view});
    if(e.viewMode)layerView.set(g.id,e.viewMode);
    if(!out)return null;
    const {canvas,ctx}=surface(consumer+':r');
    // Renderers that ignore the classic deformers (simulations, Cloner, Growth...) get them as an image warp.
    if(!(needsWarp(v.mods)&&e.w?.AG_LAYOUT_NA?.rowRipple?.includes(e.mode)&&warpInto(ctx,out,v.mods,time)))ctx.drawImage(out,0,0);
    const sym=v.mods?._symmetryMode;
    if(sym&&sym!=='none'&&e.mode?.startsWith('sim')&&e.w?.applySymmetry){const sc=e.w.applySymmetry(canvas,sym,v.mods._symGap||0,'proSym');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(sc,0,0);}
    rendered.set(key,canvas);return canvas;
  };
  const need=(n,key,label)=>{const v=input(n,key);if(v===undefined){nodeErrors.add(n.id);throw Error(`${g.name}: connect ${label} to ${TYPES[n.type].label}`);}return v;};
  for(const n of plans.get(g.id)||[]){
    const t=TYPES[n.type],p=props(n);let r={};
    if(n.bypass)r=passThrough(n,input,asImage);
    else if(t.engine){
      const sig=input(n,'audio')??(t.category==='inputs'?SILENT:projectSignal()),driven=byInput.has(n.id+':drive');let freq=sig.freq,wave=sig.wave;
      if(driven){const d=driveSpectrum(Math.max(0,input(n,'drive')??0),time);freq=d.freq;wave=d.wave;}
      const lvl=driven?Math.max(0,input(n,'drive')??0):sig.bands.bass,spec=engineSpec(n);
      let opts=p.opts;
      if(n.auto)for(const k of n.auto){if(!k.startsWith('opt:'))continue;const id=k.slice(4),range=engines.get(n.id)?.optRange(jobOf(n),id);
        if(range){if(opts===p.opts)opts={...opts};opts[id]=autoDrift(range,opts[id]??range.value,n.id+k,autoClock);autoValues.set(n.id+':'+k,opts[id]);}}
      for(const e of g.edges)if(e.to===n.id&&OPT_PORT.test(e.input)){
        const id=e.input.slice(4),range=engines.get(n.id)?.optRange(jobOf(n),id);
        if(range){if(opts===p.opts)opts={...opts};opts[id]=modulate(range,opts[id]??range.value,input(n,e.input));}
      }
      r.shape={emitter:n,mods:{...geoMods(p),...(p.look?._colorMode||p.look?._toneStops?{}:GRAY)},hue:0,job:{...spec,label:nodeTitle(n),opts,chips:p.chips,look:p.look,response:{intensity:p.intensity,punch:p.punch,release:p.release,dynamics:p.dynamics},text:p.text,audio:{freq,wave,rate:A.rate,drive:{bass:lvl,beat:driven?lvl:sig.pulse}}}};
      if(n.type==='templateMorph'){r.shape.mods={};r.shape.job.templateMorph={from:p.from,to:p.to,mix:p.mix};}
      if(n.type==='waveform3d'){const e=engines.get(n.id);if(e?.anim&&p.mode==='model')e.animate(time,p.animSpeed,p.clip-1);r.object=objectOf(p,e?.mediaKind==='object'&&e.w?.objModelData);if(p.render==='normal'){cloneObjects([r.object],SINGLE,r.shape);r.shape.mods.pG3Zoom=55;}}
      if(n.type==='cloner')cloneObjects(['object','object2','object3'].map(k=>input(n,k)).filter(Boolean),p,r.shape);
      if(n.type==='gpuParticles'&&byInput.has(n.id+':emit')){
        // Anything visual wired into "emit" spawns particles from its bright parts (the original's image emitter).
        // A 3D object emits from its own node's live render, so it follows the object as it turns or animates.
        const key={simparticles:'pEmit',simfluid:'fEmit',simsmoke:'sEmit',simsand:'saEmit'}[p.mode],src=byInput.get(n.id+':emit'),v=input(n,'emit'),img=key&&asImage(v&&!v.emitter&&!(v instanceof HTMLCanvasElement)?outputs.get(src.from)?.shape:v,n.id+'e');
        const a=img&&emitterAsset(nstate(n.id+':emit',()=>({name:'Picture'})),img,time);
        if(a){r.shape.mods._sim={...r.shape.mods._sim,[key]:'image',emitColor:p.emitColors==='palette'?'palette':'source'};r.shape.job.emitAsset=a;}
      }
    }else switch(n.type){
      case 'image':case 'video':case 'camera':{
        const m=mediaOf(n),{canvas,ctx}=surface(n.id);
        if(drawMedia(m,ctx,WIDTH,HEIGHT,p,input(n,'audio'),time)){analyse(m,canvas,time);r.palette=m.palette;r.brightness=m.brightness;if(n.type!=='image')r.motion=m.motion;}
        else{r.brightness=0;r.motion=0;}
        r.image=canvas;break;}
      case 'value':r.value=p.value;break;
      case 'oscillator':{const s=nstate(n.id,()=>({phase:0,v:0,next:0}));s.phase+=dt*p.rate;
        let w;if(p.wave==='random'){if(s.phase>=s.next){s.next=Math.floor(s.phase)+1;s.target=Math.random();}s.v+=((s.target??.5)-s.v)*Math.min(1,dt*8);w=s.v;}else w=waves[p.wave](s.phase);
        r.value=p.offset+p.depth*w;break;}
      case 'map':r.value=(input(n,'value')??0)*p.scale+p.offset;break;
      case 'smooth':{const s=nstate(n.id,()=>({v:0})),x=input(n,'value')??0,ms=x>s.v?p.attack:p.release;s.v+=(x-s.v)*(ms<=0?1:1-Math.exp(-dt*1000/ms));r.value=s.v;break;}
      case 'math':{const a=input(n,'a')??p.a,b=input(n,'b')??p.b;r.value={add:a+b,multiply:a*b,subtract:a-b,min:Math.min(a,b),max:Math.max(a,b)}[p.op];break;}
      case 'random':{const s=nstate(n.id,()=>({v:Math.random(),target:Math.random(),beat:A.beat,acc:0,gate:false})),trig=input(n,'trigger');s.acc+=dt;
        // A wired trigger replaces the beat/rate clock: a new value each time it rises above 0.5.
        const gate=trig!==undefined&&trig>.5,fire=trig!==undefined?gate&&!s.gate:p.trigger==='beat'?A.beat!==s.beat:s.acc>=1/p.rate;s.gate=gate;
        if(fire){s.beat=A.beat;s.acc=0;s.target=Math.random();}
        s.v+=(s.target-s.v)*(p.glide<=0?1:Math.min(1,dt*(1.2/p.glide)));r.value=s.v;break;}
      case 'audioIn':{const sig=projectSignal(),s=nstate(n.id,()=>({beat:A.beat,v:0}));
        if(sig.beat!==s.beat){s.beat=sig.beat;s.v=1;}else s.v*=Math.exp(-dt*1000/p.decay);
        r.audio=sig;r.level=sig.bands.full*p.gain;r.bass=sig.bands.bass*p.gain;r.mids=sig.bands.mids*p.gain;r.high=sig.bands.high*p.gain;r.beat=s.v*p.gain;break;}
      case 'computer':Object.assign(r,sensors.computer(p,dt));break;
      case 'clock':Object.assign(r,sensors.clock(p,nstate(n.id,()=>({})),dt));break;
      case 'pointer':Object.assign(r,sensors.pointer(p,dt));break;
      case 'liveData':Object.assign(r,liveData(p,nstate(n.id,()=>({})),dt));break;
      case 'midi':Object.assign(r,sensors.midiValues(p));break;
      case 'amplify':{const v=need(n,'in','something to amplify'),g2=p.gain;
        if(typeof v==='number')r.out=v*g2;
        else if(v instanceof HTMLCanvasElement){const {canvas,ctx}=surface(n.id);ctx.filter=`brightness(${g2})`;ctx.drawImage(v,0,0);ctx.filter='none';r.out=canvas;}
        else if(v.emitter){const a=v.job.audio,d=a.drive;
          r.out={...v,amp:(v.amp??1)*g2,job:{...v.job,audio:{...a,...ampSignal({freq:a.freq,wave:a.wave},g2),drive:{bass:Math.min(1,d.bass*g2),beat:Math.min(1,d.beat*g2)}}}};}
        else if(v.freq)r.out=ampSignal(v,g2);
        else r.out=v;
        break;}
      case 'audio':r.value=(input(n,'audio')??projectSignal()).bands[p.band]*p.gain;break;
      case 'beat':{const sig=input(n,'audio')??projectSignal(),s=nstate(n.id,()=>({beat:sig.beat,v:0}));if(sig.beat!==s.beat){s.beat=sig.beat;s.v=1;}else s.v*=Math.exp(-dt*1000/p.decay);r.value=s.v*p.gain;break;}
      case 'spectrum':{const sig=input(n,'audio')??projectSignal(),gains=eqGains(p),f=new Uint8Array(BINS);
        for(let i=0;i<BINS;i++)f[i]=Math.min(255,sig.freq[i]*gains[i]);
        // Beats stay with the source; levels follow the reshaped spectrum.
        r.audio={...sig,freq:f,bands:bandsOf(f)};break;}
      case 'background':{const {canvas,ctx}=surface(n.id);
        if(p.fill==='flat')ctx.fillStyle=p.c1;
        else{const gr=p.fill==='vertical'?ctx.createLinearGradient(0,0,0,HEIGHT):ctx.createRadialGradient(WIDTH/2,HEIGHT/2,0,WIDTH/2,HEIGHT/2,WIDTH*.6);gr.addColorStop(0,p.fill==='vertical'?p.c1:p.c2);gr.addColorStop(1,p.fill==='vertical'?p.c2:p.c1);ctx.fillStyle=gr;}
        ctx.fillRect(0,0,WIDTH,HEIGHT);r.image=canvas;break;}
      case 'effect':{const src=asImage(need(n,'image','an image'),n.id),{canvas,ctx}=surface(n.id);if(src){ctx.filter=filterFor(p.kind,p.amount);ctx.drawImage(src,0,0);ctx.filter='none';}r.image=canvas;break;}
      case 'aiModel':r.model={model:p.model,url:p.server};break;
      case 'aiPrompt':r.prompt={prompt:p.prompt,negative:p.negative,prompt2:p.prompt2,mix:p.mix};break;
      case 'aiControl':r.control={kind:p.kind,strength:p.strength,low:p.low,high:p.high};break;
      case 'aiRender':{
        const src=asImage(need(n,'image','a picture'),n.id+'i'),m=input(n,'model')||{model:'sd-turbo',url:AI_DEFAULT_URL},
          pr=input(n,'prompt')||{prompt:TYPES.aiPrompt.props.prompt.value,negative:TYPES.aiPrompt.props.negative.value,prompt2:'',mix:0},
          st=nstate(n.id,()=>({})),img=aiRender(st,src,{url:m.url,model:m.model,...pr,strength:p.strength,steps:p.steps,seed:p.seed,guidance:p.guidance,size:+p.size,control:input(n,'control')||{kind:'none',strength:0}}),{canvas,ctx}=surface(n.id);
        st.url=m.url;st.model=m.model;
        if(img){
          // Smooth: each frame eases the held picture towards the newest AI frame.
          if(!st.acc||st.acc.width!==WIDTH||st.acc.height!==HEIGHT){st.acc=document.createElement('canvas');st.acc.width=WIDTH;st.acc.height=HEIGHT;st.acc.getContext('2d').drawImage(img,0,0,WIDTH,HEIGHT);}
          const a=st.acc.getContext('2d');a.globalAlpha=Math.min(1,(1-p.smooth)*Math.min(4,dt*60));a.drawImage(img,0,0,WIDTH,HEIGHT);a.globalAlpha=1;ctx.drawImage(st.acc,0,0);
          if(src&&p.mix>0){ctx.globalAlpha=p.mix;ctx.drawImage(src,0,0);ctx.globalAlpha=1;}
        }else if(src)ctx.drawImage(src,0,0);
        r.image=canvas;break;}
      case 'cornerPin':{const src=asImage(need(n,'image','an image'),n.id),{canvas,ctx}=surface(n.id);
        const q=[[p.tlx,p.tly],[100+p.trx,p.try],[100+p.brx,100+p.bry],[p.blx,100+p.bly]].map(([x,y])=>[x*WIDTH/100,y*HEIGHT/100]);
        if(src)warpQuad(ctx,src,q);if(p.grid==='on')drawPinGrid(ctx,q);r.image=canvas;break;}
      case 'blend':{const a=asImage(need(n,'a','image A'),n.id+'a'),b=asImage(need(n,'b','image B'),n.id+'b'),{canvas,ctx}=surface(n.id);
        if(a)ctx.drawImage(a,0,0);if(b){ctx.globalAlpha=p.mix;ctx.globalCompositeOperation=p.mode;ctx.drawImage(b,0,0);}ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';r.image=canvas;break;}
      case 'merge':{const {canvas,ctx}=surface(n.id);let any=false;
        for(const k of ['a','b','c','d']){const v=input(n,k);if(v===undefined)continue;const img=asImage(v,n.id+k);if(!img)continue;
          ctx.globalAlpha=p[k];ctx.globalCompositeOperation=any?p.mode:'source-over';ctx.drawImage(img,0,0);any=true;}
        ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';if(!any){nodeErrors.add(n.id);throw Error(`${g.name}: connect an image to Merge`);}r.image=canvas;break;}
      case 'mask':{const src=asImage(need(n,'image','an image'),n.id+'i'),m=asImage(need(n,'mask','a mask image'),n.id+'m'),{canvas,ctx}=surface(n.id);
        if(src){ctx.drawImage(src,0,0);if(m){ctx.globalCompositeOperation=p.invert?'destination-out':'destination-in';if(p.feather)ctx.filter=`blur(${p.feather}px)`;ctx.drawImage(m,0,0);ctx.filter='none';ctx.globalCompositeOperation='source-over';}}
        r.image=canvas;break;}
      case 'feedback':{const src=asImage(need(n,'image','an image'),n.id),{canvas,ctx}=surface(n.id);
        const hist=nstate(n.id,()=>{const c=document.createElement('canvas');c.width=WIDTH;c.height=HEIGHT;return {c};}),hc=hist.c.getContext('2d');
        const look={zoom:p.zoom,rotate:p.rotate,alpha:p.decay,hue:p.hue,smooth:p.smooth??0};echo(ctx,hist.c,look);
        if(src)bridge(ctx,src,look);hc.clearRect(0,0,WIDTH,HEIGHT);hc.drawImage(canvas,0,0);r.image=canvas;break;}
      case 'imageTransform':{const src=asImage(need(n,'image','an image'),n.id),{canvas,ctx}=surface(n.id);
        if(src){ctx.globalAlpha=p.opacity;ctx.translate(WIDTH/2+p.x*WIDTH/200,HEIGHT/2+p.y*HEIGHT/200);ctx.rotate((p.rotate+p.spin*time)*Math.PI/180);ctx.scale(p.scale,p.scale);ctx.drawImage(src,-WIDTH/2,-HEIGHT/2);ctx.resetTransform();ctx.globalAlpha=1;}
        r.image=canvas;break;}
      case 'layerIn':{const target=state.layers[p.layer-1];if(!target){nodeErrors.add(n.id);throw Error(`${g.name}: there is no layer ${p.layer}`);}
        if(target.id===g.id){nodeErrors.add(n.id);throw Error(`${g.name}: a Layer node cannot show its own layer`);}
        r.image=layerImages.get(target.id)||surface(n.id).canvas;break;}
      case 'output':image=asImage(need(n,'image','an image'),n.id);r.image=image;break;
      case 'trails':{let src=asImage(need(n,'image','an image'),n.id);const {canvas,ctx}=surface(n.id);
        // Smooth: stamp the new frame at in-between zoom steps so it bridges the gap to the previous (zoomed) echo.
        if(src&&p.smooth>0&&p.feedback>0){const b=surface(n.id+':b');bridge(b.ctx,src,{zoom:1+p.feedback/100*.06,alpha:p.trails/100*.97,smooth:p.smooth});src=b.canvas;}
        const e=fxEngine();if(!fxSlots.has(n.id))fxSlots.set(n.id,1000+fxSlots.size);
        if(src&&e){const out=e.fx(fxSlots.get(n.id),src,fxSettings(n.type,p),{bass:A.bands.bass,beat:A.beatPulse});if(out)ctx.drawImage(out,0,0,WIDTH,HEIGHT);}else if(src)ctx.drawImage(src,0,0);
        r.image=canvas;break;}
      default:
        if(t.fx){
          const src=asImage(need(n,'image','an image'),n.id),e=fxEngine(),{canvas,ctx}=surface(n.id);
          if(!fxSlots.has(n.id))fxSlots.set(n.id,1000+fxSlots.size);
          if(src&&e){const out=e.fx(fxSlots.get(n.id),src,fxSettings(n.type,p),{bass:A.bands.bass,beat:A.beatPulse});if(out)ctx.drawImage(out,0,0,WIDTH,HEIGHT);}
          else if(src)ctx.drawImage(src,0,0);
          r.image=canvas;
        }else if(inputsOf(n.type).shape==='visual'&&(()=>{const v=need(n,'shape','a shape or an image');return v instanceof HTMLCanvasElement||(n.type==='palette'&&(p.blend!=='normal'||p.mix<1));})()){
          // Image (or a blended shape): recolor pixels and output an image.
          const src=asImage(need(n,'shape'),n.id);r.shape=n.type==='palette'?recolor(n.id,src,p):hueImage(n.id,src,p.hue+p.cycle*time);
        }else if(t.outputs.shape){
          const s=need(n,'shape','a shape');
          if(s===blank())r.shape=s;else if(s instanceof HTMLCanvasElement)throw Error(`${g.name}: ${t.label} needs a shape from an Emitter, not an image`);
          const mods=applyShapeNode(n.type,p,s.mods);let hue=s.hue;
          if(n.type==='hue')hue+=p.hue+p.cycle*time;
          r.shape={...s,mods,hue:((hue%360)+360)%360};
        }
    }
    if(n.type==='templateMorph'){r.image=asImage(r.shape,n.id);delete r.shape;}
    if(n.id===previewId){const v=r.image??r.shape;if(v)previewImg=asImage(v,n.id+':pv');}
    outputs.set(n.id,r);if(DATA_INPUTS.has(n.type))lastOuts.set(n.id,{...r});{const v=r.value??(typeof r.out==='number'?r.out:n.type==='audioIn'?r.level:undefined);if(v!==undefined)lastValues.set(n.id,v);}
    if(r.image&&thumbs.has(n.id)&&frame%4===0)drawThumb(n.id,r.image);
  }
  // Emitter thumbnails show the raw emitter render.
  for(const [key,canvas] of rendered){const id=key.split('|')[0];if(thumbs.has(id)&&frame%4===0)drawThumb(id,canvas);}
  if(!g.nodes.some(n=>n.type==='output'))throw Error(`${g.name}: add an Output node`);
  return image;
}
// Perspective-ish warp of a full frame onto quad q (TL,TR,BR,BL) via bilinear mesh of affine triangles.
function quadPoint(q,u,v){const a=[q[0][0]+(q[1][0]-q[0][0])*u,q[0][1]+(q[1][1]-q[0][1])*u],b=[q[3][0]+(q[2][0]-q[3][0])*u,q[3][1]+(q[2][1]-q[3][1])*u];return [a[0]+(b[0]-a[0])*v,a[1]+(b[1]-a[1])*v];}
function warpTri(ctx,img,s0,s1,s2,d0,d1,d2){
  const cx=(d0[0]+d1[0]+d2[0])/3,cy=(d0[1]+d1[1]+d2[1])/3,grow=p=>{const dx=p[0]-cx,dy=p[1]-cy,l=Math.hypot(dx,dy)||1;return [p[0]+dx/l*.7,p[1]+dy/l*.7];};
  const [e0,e1,e2]=[grow(d0),grow(d1),grow(d2)];
  const den=(s1[0]-s0[0])*(s2[1]-s0[1])-(s2[0]-s0[0])*(s1[1]-s0[1]);if(!den)return;
  const a=((d1[0]-d0[0])*(s2[1]-s0[1])-(d2[0]-d0[0])*(s1[1]-s0[1]))/den,b=((d1[1]-d0[1])*(s2[1]-s0[1])-(d2[1]-d0[1])*(s1[1]-s0[1]))/den,
    c=((d2[0]-d0[0])*(s1[0]-s0[0])-(d1[0]-d0[0])*(s2[0]-s0[0]))/den,d=((d2[1]-d0[1])*(s1[0]-s0[0])-(d1[1]-d0[1])*(s2[0]-s0[0]))/den;
  ctx.save();ctx.beginPath();ctx.moveTo(...e0);ctx.lineTo(...e1);ctx.lineTo(...e2);ctx.closePath();ctx.clip();
  ctx.setTransform(a,b,c,d,d0[0]-a*s0[0]-c*s0[1],d0[1]-b*s0[0]-d*s0[1]);ctx.drawImage(img,0,0,WIDTH,HEIGHT);ctx.restore();
}
function warpQuad(ctx,img,q){
  if(q.every((p,i)=>p[0]===[0,WIDTH,WIDTH,0][i]&&p[1]===[0,0,HEIGHT,HEIGHT][i])){ctx.drawImage(img,0,0);return;}
  const N=12;for(let j=0;j<N;j++)for(let i=0;i<N;i++){
    const u0=i/N,u1=(i+1)/N,v0=j/N,v1=(j+1)/N,s=(u,v)=>[u*WIDTH,v*HEIGHT],d=(u,v)=>quadPoint(q,u,v);
    warpTri(ctx,img,s(u0,v0),s(u1,v0),s(u1,v1),d(u0,v0),d(u1,v0),d(u1,v1));warpTri(ctx,img,s(u0,v0),s(u1,v1),s(u0,v1),d(u0,v0),d(u1,v1),d(u0,v1));
  }
}
function drawPinGrid(ctx,q){ctx.save();ctx.strokeStyle='rgba(255,255,255,.75)';ctx.lineWidth=1.5;
  for(let k=0;k<=8;k++){const t=k/8;ctx.beginPath();ctx.moveTo(...quadPoint(q,t,0));ctx.lineTo(...quadPoint(q,t,1));ctx.moveTo(...quadPoint(q,0,t));ctx.lineTo(...quadPoint(q,1,t));ctx.stroke();}
  ctx.fillStyle='#e6e6ea';for(const p of q){ctx.beginPath();ctx.arc(p[0],p[1],7,0,7);ctx.fill();}ctx.restore();}
// Layer nodes read other layers' pictures: this frame's if already drawn, otherwise the previous frame's.
const layerImages=new Map();let layerReaders=new Set(),mapLayers=new Set();
// With projection mapping on, layers composite into the program picture, which is then warped onto the surfaces.
const program=document.createElement('canvas');program.width=WIDTH;program.height=HEIGHT;const programCtx=program.getContext('2d');
const mapActive=()=>!!state.mapping?.surfaces.length&&(state.mapping.on||state.mapping.test);
function keepLayer(id,image){if(!layerImages.has(id)){const c=document.createElement('canvas');c.width=WIDTH;c.height=HEIGHT;layerImages.set(id,c);}const c=layerImages.get(id),x=c.getContext('2d');x.clearRect(0,0,WIDTH,HEIGHT);x.drawImage(image,0,0);}
function drawThumb(id,src){const cv=thumbs.get(id);if(!cv?.isConnected)return;const c=cv.getContext('2d');c.fillStyle='#000';c.fillRect(0,0,cv.width,cv.height);c.drawImage(src,0,0,cv.width,cv.height);}
// Auto knobs: a shared clock (scaled by the Auto speed) and the drifted values shown on the knobs.
let autoClock=0,knobAutoSpeed=1;const autoValues=new Map();
function showAutoKnobs(){
  if(!selected)return;
  for(const b of document.querySelectorAll('#properties .knob.auto')){const k=b.querySelector('.knob-auto')?.dataset.auto;const v=autoValues.get(selected+':'+k);if(v!==undefined)b.show?.(v);}
}
// Dissolve: any change to what is drawn (nodes, wires, layers, a template, Autopilot) fades from the last frame
// instead of cutting. New engines start behind the held frame, then it fades out like the original's layout fade.
const fadeCv=document.createElement('canvas');fadeCv.width=WIDTH;fadeCv.height=HEIGHT;const fadeCtx=fadeCv.getContext('2d');
let fade=null,fadeSigState=null,fadeSig='',nextFade=0,dissolveOn=true;
const drawSig=st=>JSON.stringify(st.layers.map(g=>[g.id,g.visible,g.blend,g.nodes.map(n=>n.id+n.type+(n.props.mode??'')+(n.props.render??'')).sort(),g.edges.map(e=>e.from+e.out+e.to+e.input).sort()]));
function dissolveCheck(){
  if(state===fadeSigState)return;fadeSigState=state;const sig=drawSig(state);
  if(sig!==fadeSig&&fadeSig&&frame>0&&dissolveOn){fadeCtx.globalAlpha=1;fadeCtx.globalCompositeOperation='copy';fadeCtx.drawImage(preview,0,0,WIDTH,HEIGHT);fadeCtx.globalCompositeOperation='source-over';
    fade={t:0,hold:0,dur:nextFade||.7};}
  nextFade=0;fadeSig=sig;
}
function dissolveDraw(dt){
  if(!fade)return;
  // Only engines drawn in the last moment hold the fade; idle ones (an Object feeding a Cloner) never get ready.
  const now=performance.now(),waiting=apBusy()||[...engines.values()].some(e=>now-(e.drawnAt||0)<500&&(e.status==='starting'||(e.mode?.startsWith?.('sim')&&e.w?.agSim?.status?.()!=='ready')));
  if(waiting&&(fade.hold+=dt)<10){}else fade.t=Math.min(1,fade.t+dt/fade.dur);
  const a=1-fade.t*fade.t*(3-2*fade.t);
  if(a>0){previewCtx.globalAlpha=a;previewCtx.globalCompositeOperation='source-over';previewCtx.drawImage(fadeCv,0,0);previewCtx.globalAlpha=1;}
  if(fade.t>=1)fade=null;
}
// Layers the engine cannot frame itself (2D, and pan/zoom of classic 3D) are moved and scaled as a picture.
const layerView=new Map();
function drawLayer(out,g,image){
  const v=g.view;if(!v||layerView.get(g.id)==='sim'||(v.zm===1&&!v.px&&!v.py)){out.drawImage(image,0,0);return;}
  out.setTransform(v.zm,0,0,v.zm,WIDTH/2*(1-v.zm)+v.px*WIDTH/2,HEIGHT/2*(1-v.zm)-v.py*HEIGHT/2);out.drawImage(image,0,0);out.setTransform(1,0,0,1,0,0);
}
function draw(time,dt=1/30){
  if(pageHidden)return;
  dissolveCheck();
  if(!paused)autoClock+=dt*knobAutoSpeed;
  readAudio(time);if(!paused)autopilotStep(dt);renderErrors=[];const prevErrors=nodeErrors;nodeErrors=new Set();
  const mapped=mapActive(),out=mapped?programCtx:previewCtx;previewImg=null;
  const previewLayer=previewId?state.layers.find(g=>g.nodes.some(n=>n.id===previewId)):null;if(previewId&&!previewLayer)setPreview(null);
  out.globalAlpha=1;out.filter='none';out.globalCompositeOperation='source-over';out.fillStyle='#000';out.fillRect(0,0,WIDTH,HEIGHT);
  for(const g of state.layers){
    // A hidden layer still renders when a mapping surface shows it on its own.
    const shown=g.visible&&g.opacity>0,forMap=mapped&&mapLayers.has(g.id);if(!shown&&!forMap&&previewLayer!==g)continue;
    try{const image=execute(g,time,dt);if(image){if(layerReaders.has(g.id)||forMap)keepLayer(g.id,image);if(shown){out.globalAlpha=g.opacity;out.globalCompositeOperation=g.blend;drawLayer(out,g,image);}}}
    catch(error){renderErrors.push(error.message);}
  }
  out.globalAlpha=1;out.globalCompositeOperation='source-over';
  if(mapped)mapTime=time;
  if(previewImg){previewCtx.globalAlpha=1;previewCtx.globalCompositeOperation='source-over';previewCtx.fillStyle='#000';previewCtx.fillRect(0,0,WIDTH,HEIGHT);previewCtx.drawImage(previewImg,0,0,WIDTH,HEIGHT);}
  else if(mapped)mapping.render(previewCtx,state.mapping,src=>src==='all'?program:layerImages.get(state.layers[src-1]?.id)||null,WIDTH,HEIGHT,time);
  dissolveDraw(paused?0:dt);
  frame++;
  if(frame%2===0){drawSpectrum();showAutoKnobs();}
  if(frame%4===0)updatePalettePreview();
  const list=[...engines.values()],starting=list.some(e=>e.status==='starting');
  if(renderErrors.length&&!starting)message(renderErrors[0]+(renderErrors.length>1?` (+${renderErrors.length-1})`:''),true,'render');
  else if(statusSource==='render'&&!renderErrors.length)message('Rendering');
  if(prevErrors.size!==nodeErrors.size||[...nodeErrors].some(id=>!prevErrors.has(id)))document.querySelectorAll('.node').forEach(e=>e.classList.toggle('error',nodeErrors.has(e.dataset.id)));
}
function drawSpectrum(){
  const cv=$('spectrum'),c=cv.getContext('2d'),w=cv.width,h=cv.height,bars=32,step=w/bars,bw=step*.6;c.clearRect(0,0,w,h);
  for(let i=0;i<bars;i++){
    const a=Math.floor(Math.pow(BINS*.45,i/bars)),b=Math.max(a+1,Math.floor(Math.pow(BINS*.45,(i+1)/bars)));let m=0;for(let k=a;k<b;k++)m=Math.max(m,A.freq[k]);
    const v=m/255;c.fillStyle=`hsl(${160-v*140} 80% ${40+v*20}%)`;c.fillRect(Math.round(i*step+(step-bw)/2),h-v*h,Math.round(bw),v*h);
  }
}
// One shared camera stream for every engine (Webcam node, Video emitter camera source). Released when unused.
let camPromise=null,camStream=null;
function camProvider(){
  if(!navigator.mediaDevices?.getUserMedia)return Promise.reject(Error('Camera requires HTTPS or localhost'));
  if(!camPromise)camPromise=navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480}},audio:false})
    .then(s=>(camStream=s),e=>{camPromise=null;throw Error('Could not start camera: '+e.message);});
  return camPromise;
}
setCameraProvider(camProvider);
// Image / Video / Camera nodes: one picture source each (files are not saved in projects).
const mediaEls=new Map();
function mediaOf(n){
  let m=mediaEls.get(n.id);
  if(!m){m=new Media(n.type);mediaEls.set(n.id,m);if(n.type==='camera')camProvider().then(st=>{if(mediaEls.get(n.id)===m)m.stream(st);}).catch(e=>message(e.message,true,'render'));}
  return m;
}
function releaseCameraIfUnused(){
  if(!camStream||state.layers.some(g=>g.nodes.some(n=>n.type==='camera'))||[...engines.values()].some(e=>e.usesCamera()))return;
  for(const [id,m] of mediaEls)if(m.kind==='camera'){m.clear();mediaEls.delete(id);}
  camStream.getTracks().forEach(t=>t.stop());camStream=null;camPromise=null;
}
function loop(now){
  if(frame%60===59)releaseCameraIfUnused();
  if(!pageHidden&&!paused&&now-lastTime>1000/31){const dt=lastTime?Math.min(.1,(now-lastTime)/1000):1/30;elapsed+=dt;lastTime=now;const t0=performance.now();try{draw(elapsed,dt);}catch(e){message(e.message,true,'render');}sensors.frameTiming(performance.now()-t0,dt);}
  requestAnimationFrame(loop);
}

// ---------- library ----------
function renderLibrary(){
  const root=$('library');root.replaceChildren();
  for(const cat of CATEGORIES){
    const types=Object.keys(TYPES).filter(t=>TYPES[t].category===cat.id);
    if(GROUPS[cat.id]){
      const items=groupedItems(cat.id),{root:pr,body}=ui.panel({id:cat.id,title:cat.label,color:cat.color,count:items.length});
      for(const group of GROUPS[cat.id]){
        const list=items.filter(it=>it.group===group);if(!list.length)continue;
        body.append(el('div','lib-sub',group));
        const box=el('div','chips');for(const it of list)box.append(libraryButton(it.type,it.label,it.description,it.props,cat.color));
        body.append(box);
      }
      root.append(pr);continue;
    }
    const {root:pr,body}=ui.panel({id:cat.id,title:cat.label,color:cat.color,count:types.length,open:!['controls','audio','composite'].includes(cat.id)});
    const box=el('div','chips');for(const t of types)box.append(libraryButton(t,TYPES[t].label,TYPES[t].description,{},cat.color));
    body.append(box);root.append(pr);
  }
  // Your saved node groups: click to add, × to forget.
  const custom=customNodes();if(!custom.length)return;
  const {root:pr,body}=ui.panel({id:'custom',title:'Custom',color:CUSTOM_COLOR,count:custom.length}),box=el('div','chips');
  for(const c of custom){
    const b=el('button','mbtn library-node custom-node');b.type='button';b.dataset.custom=c.name;b.title=`${c.nodes.length} nodes · click to add`;b.style.setProperty('--cat',CUSTOM_COLOR);b.append(document.createTextNode(c.name));
    const x=el('span','custom-x','×');x.title='Remove from Custom';x.setAttribute('role','button');x.setAttribute('aria-label','Remove '+c.name);x.onclick=e=>{e.stopPropagation();removeCustom(c.name);};
    b.append(x);b.onclick=()=>insertCustom(c);box.append(b);
  }
  body.append(box);root.append(pr);
}
const CUSTOM_COLOR='#e5e7eb';
// Waveforms and Emitters are listed per mode: each waveform / simulation is its own library entry.
const GROUPS={inputs:['Media','Data'],waveforms:['2D'],emitters:['Particles','WebGPU particles'],'3d':['Objects','Cloner','Effectors','Look'],deformers:['Bend','Symmetry','Noise']};
function groupedItems(cat){
  const items=[];
  for(const t of Object.keys(TYPES).filter(t=>TYPES[t].category===cat)){
    const T=TYPES[t],group=T.group||GROUPS[cat][0];
    if(MODES[t])for(const [mode,label] of MODES[t])items.push({type:t,props:{mode},label,group,description:`${label} · ${T.label}. ${T.description}`});
    else items.push({type:t,props:{},label:T.label,group,description:T.description});
  }
  return items;
}
function libraryButton(type,label,description,props,color){
  const b=el('button','mbtn library-node');b.type='button';b.draggable=true;b.dataset.type=type;if(props.mode)b.dataset.mode=props.mode;
  b.title=description+(isChain(type)?' · Click to insert after the selected node.':'');b.style.setProperty('--cat',color);
  b.append(document.createTextNode(label));
  b.addEventListener('dragstart',e=>e.dataTransfer.setData('application/audiograph-node',JSON.stringify({type,props})));
  b.onclick=()=>addNode(type,undefined,undefined,props);
  return b;
}
$('librarySearch').addEventListener('input',()=>{
  const q=$('librarySearch').value.trim().toLowerCase();
  document.querySelectorAll('#library .library-node').forEach(b=>b.classList.toggle('hidden',!!q&&!(b.textContent+' '+b.title).toLowerCase().includes(q)));
  document.querySelectorAll('#library .panel').forEach(p=>{const any=[...p.querySelectorAll('.library-node')].some(b=>!b.classList.contains('hidden'));p.classList.toggle('lib-empty',!any);if(q&&any)p.classList.remove('collapsed');});
  document.querySelectorAll('#library .lib-sub').forEach(s=>{const box=s.nextElementSibling;s.classList.toggle('hidden',![...box.children].some(b=>!b.classList.contains('hidden')));});
});

// ---------- graph editor ----------
function summary(n){
  const p=n.props,t=TYPES[n.type];
  if(n.type==='audioIn')return sourceName();
  if(n.type==='computer')return p.source==='helper'?`local helper :${p.port}`:'browser estimates';
  if(n.type==='clock')return `${p.bpm} BPM`;
  if(n.type==='midi')return `CC ${p.cc}${p.channel?' · ch '+p.channel:''}${p.note>=0?' · note '+p.note:''}`;
  if(n.type==='pointer')return 'mouse · keys';
  if(MODES[n.type])return t.label;
  if(n.type==='text')return p.text;
  if(['image','video'].includes(n.type))return mediaEls.get(n.id)?.name||'no file';
  if(n.type==='camera')return 'live';
  if(n.type==='templateMorph')return `${p.from} → ${p.to} · ${Math.round(p.mix)}%`;
  if(isEngine(n.type)){const m=engines.get(n.id)?.mediaName,r=t.props.render?.labels.find(l=>l[0]===p.render)?.[1];return [r,m||(mediaKind(n)?(mediaKind(n)==='object'?'built-in knot':n.type==='splat'?'demo cloud':'no file'):'')].filter(Boolean).join(' · ');}
  if(n.type==='value')return String(p.value);
  if(n.type==='oscillator')return `${p.wave} · ${p.rate} Hz`;
  if(n.type==='audio')return `${p.band} ×${p.gain}`;
  if(n.type==='palette')return p.mode==='solid'?'solid':paletteStops(p).simple.join(' ');
  for(const k of simKeys(graph(),n)){const s=t.props[k];if(s.kind==='select')return String(s.labels?.find(l=>l[0]===p[k])?.[1]??p[k]);if(s.kind==='number')return `${s.label} ${+p[k].toFixed(2)}`;}
  return t.description;
}
function updateSummaries(){updatePalettePreview();for(const box of document.querySelectorAll('#nodes .node')){const n=findNode(box.dataset.id);if(n)box.querySelector('.node-summary').textContent=summary(n);}}
function visiblePorts(g,n){
  const t=TYPES[n.type],all=inputsOf(n.type),ins=[];
  for(const [k,type] of Object.entries(all))if(Object.hasOwn(t.inputs,k)||g.edges.some(e=>e.to===n.id&&e.input===k))ins.push([k,type]);
  if(isEngine(n.type))for(const e of g.edges)if(e.to===n.id&&OPT_PORT.test(e.input))ins.push([e.input,'number']);
  return {ins,outs:Object.entries(t.outputs)};
}
const jobOf=n=>({...engineSpec(n),chips:n.props.chips,look:n.props.look});
// Engine knob labels that don't fit under a knob.
const OPT_SHORT={'Pressure iterations':'Pressure','Emitter spin':'Spin','Temperature':'Temp.'};
function optLabel(n,key){const r=engines.get(n.id)?.optRange(jobOf(n),key.slice(4));return r?.label||key.slice(4);}
function portLabel(n,key){return TYPES[n.type].props[key]?.label||(OPT_PORT.test(key)?optLabel(n,key):key);}
function renderGraph(){
  const g=graph();$('nodes').replaceChildren();
  for(const old of thumbs.keys())thumbs.delete(old);
  for(const n of g.nodes){
    const t=TYPES[n.type],box=el('article','node'+(n.id===selected||multi.has(n.id)?' selected':'')+(nodeErrors.has(n.id)?' error':''));
    box.dataset.id=n.id;box.dataset.type=n.type;box.style.left=n.x+'px';box.style.top=n.y+'px';box.style.setProperty('--cat',catOf(n.type).color);
    if(n.bypass)box.classList.add('bypassed');if(n.id===previewId)box.classList.add('previewing');
    const head=el('div','node-head');head.append(el('div','node-title',nodeTitle(n)),el('div','node-summary',summary(n)));box.append(head);
    const acts=el('div','node-acts'),act=(cls,label,title,fn)=>{const b=el('button','node-act '+cls,label);b.type='button';b.title=title;b.setAttribute('aria-label',title);b.addEventListener('pointerdown',e=>e.stopPropagation());b.onclick=e=>{e.stopPropagation();fn();};acts.append(b);return b;};
    if(canPreview(n))act('act-preview','\u25C9',n.id===previewId?'Stop previewing (V)':'Preview this node in the viewport (V)',()=>setPreview(n.id)).classList.toggle('on',n.id===previewId);
    if(n.type!=='output')act('act-bypass','\u23FB',n.bypass?'Enable this node (B)':'Bypass this node — pass its input straight through (B)',()=>toggleBypass([n.id])).classList.toggle('on',!!n.bypass);
    head.append(acts);
    if(t.engine||t.fx||n.type==='output'){const c=el('canvas','node-thumb');c.width=160;c.height=90;box.append(c);thumbs.set(n.id,c);}
    const ports=el('div','ports'),{ins,outs}=visiblePorts(g,n);
    for(const [dir,list] of [['in',ins],['out',outs]])for(const [key,type] of list){
      const connected=g.edges.some(e=>dir==='in'?e.to===n.id&&e.input===key:e.from===n.id&&e.out===key);
      const label=dir==='in'?portLabel(n,key):key;
      const port=el('button',`port ${dir} ${type}${connected?' connected':''}`,label);
      port.type='button';port.dataset.node=n.id;port.dataset.port=key;port.dataset.direction=dir;port.dataset.ptype=type;port.title=`${dir==='in'?'Input':'Output'}: ${label} (${type})`;
      if(pending?.id===n.id&&pending.port===key&&dir==='out')port.classList.add('pending');
      if(dir==='out')port.addEventListener('pointerdown',e=>startWire(e,n,key,type));
      port.onclick=e=>{
        e.stopPropagation();
        if(dir==='out'){if(port._dragged){port._dragged=false;return;}pending={id:n.id,port:key,type};message(`Now click an input (or a node) to connect ${key}. Esc cancels.`);renderGraph();}
        else if(pending){const p=pending;pending=null;connection(p.id,p.port,n.id,key);}
        else if(connected)edit((p,g)=>{g.edges=g.edges.filter(e=>!(e.to===n.id&&e.input===key));},'Disconnected');
        else message('Drag from an output dot to this input.',true);
      };
      ports.append(port);
    }
    box.append(ports);
    box.addEventListener('pointerdown',e=>{
      if(e.target.closest('.port'))return;
      if(pending){e.stopPropagation();const p=pending;pending=null;portMenu(n,p,e.clientX,e.clientY);return;}
      if(e.shiftKey||e.metaKey||e.ctrlKey){const ids=new Set(selIds());ids.has(n.id)?ids.delete(n.id):ids.add(n.id);setSelection([...ids]);return;}
      if(multi.has(n.id))return;
      if(selected!==n.id||multi.size)setSelection([n.id]);
    });
    head.addEventListener('pointerdown',e=>{if(!pending)startMove(e,n,box);});
    $('nodes').append(box);
  }
  if(!g.nodes.length){const empty=el('div','graph-empty','Click an Emitter in the library to start.');$('nodes').append(empty);}
  applyView();requestAnimationFrame(renderWires);
}
const portEl=(id,port,dir)=>$('nodes').querySelector(`.port[data-node="${id}"][data-port="${port}"][data-direction="${dir}"]`);
function portXY(p,dir){
  const r=p.getBoundingClientRect(),b=$('graphViewport').getBoundingClientRect();
  const z=uiZ();return [(((dir==='out'?r.right:r.left)-b.left)/z-view.x)/view.zoom,((r.top+r.height/2-b.top)/z-view.y)/view.zoom];
}
const curve=(x1,y1,x2,y2)=>{const bend=Math.max(40,Math.abs(x2-x1)*.45);return `M ${x1} ${y1} C ${x1+bend} ${y1},${x2-bend} ${y2},${x2} ${y2}`;};
function renderWires(){
  const svg=$('wires');[...svg.querySelectorAll('.wire')].forEach(w=>w.remove());const g=graph();
  for(const edge of g.edges){
    const a=portEl(edge.from,edge.out,'out'),b=portEl(edge.to,edge.input,'in');if(!a||!b)continue;
    const [x1,y1]=portXY(a,'out'),[x2,y2]=portXY(b,'in'),wire=document.createElementNS('http://www.w3.org/2000/svg','path');
    wire.setAttribute('d',curve(x1,y1,x2,y2));wire.setAttribute('class','wire '+(a.dataset.ptype==='any'?resolveOut(g,g.nodes.find(m=>m.id===edge.from),edge.out):a.dataset.ptype));Object.assign(wire.dataset,{from:edge.from,out:edge.out,to:edge.to,input:edge.input});
    wire.setAttribute('tabindex','0');wire.setAttribute('role','button');wire.setAttribute('aria-label',`Remove connection ${edge.out} → ${edge.input}`);
    const remove=()=>edit((p,g)=>{g.edges=g.edges.filter(e=>!(e.from===edge.from&&e.out===edge.out&&e.to===edge.to&&e.input===edge.input));},'Removed connection');
    wire.onclick=remove;wire.onkeydown=e=>{if(e.key==='Enter'||e.key==='Delete')remove();};svg.append(wire);
  }
}
function startWire(event,n,key,type){
  if(event.button!==0)return;event.preventDefault();event.stopPropagation();
  const src=event.currentTarget,svg=$('wires'),ghost=document.createElementNS('http://www.w3.org/2000/svg','path');ghost.setAttribute('class','wire-ghost');
  const [x1,y1]=portXY(src,'out'),start={x:event.clientX,y:event.clientY};let moved=false,target=null;
  const vb=()=>$('graphViewport').getBoundingClientRect();
  const move=e=>{
    if(!moved&&Math.hypot(e.clientX-start.x,e.clientY-start.y)<5)return;
    if(!moved){moved=true;svg.append(ghost);}
    const b=vb(),z=uiZ(),x2=((e.clientX-b.left)/z-view.x)/view.zoom,y2=((e.clientY-b.top)/z-view.y)/view.zoom;ghost.setAttribute('d',curve(x1,y1,x2,y2));
    const hit=document.elementFromPoint(e.clientX,e.clientY)?.closest('.port.in,.node');
    if(target!==hit){target?.classList.remove('drop-target');target=hit&&hit.classList.contains('port')&&compatible(type,hit.dataset.ptype)?hit:hit?.classList.contains('node')?hit:null;if(target?.classList.contains('port'))target.classList.add('drop-target');}
  };
  const end=e=>{
    window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);ghost.remove();target?.classList.remove('drop-target');
    if(!moved)return;src._dragged=true;setTimeout(()=>{src._dragged=false;},0);
    if(target?.classList.contains('port'))connection(n.id,key,target.dataset.node,target.dataset.port);
    else if(target?.classList.contains('node')&&target.dataset.id!==n.id)portMenu(findNode(target.dataset.id),{id:n.id,port:key,type},e.clientX,e.clientY);
  };
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',end);
}
// ---------- Tab: node search ----------
const pointer={x:0,y:0,inGraph:false};
function searchItems(){
  const items=[];
  for(const cat of CATEGORIES){
    if(GROUPS[cat.id]){for(const it of groupedItems(cat.id))items.push({type:it.type,props:it.props,label:it.label,cat:`${cat.label} · ${it.group}`,color:cat.color,text:`${it.label} ${cat.label} ${it.group} ${it.description}`});continue;}
    for(const t of Object.keys(TYPES))if(TYPES[t].category===cat.id)items.push({type:t,props:{},label:TYPES[t].label,cat:cat.label,color:cat.color,text:`${TYPES[t].label} ${cat.label} ${TYPES[t].description}`});
  }
  for(const c of customNodes())items.push({type:'custom',custom:c,props:{},label:c.name,cat:'Custom',color:CUSTOM_COLOR,text:`${c.name} Custom`});
  return items;
}
function rankItems(items,q){
  q=q.trim().toLowerCase();if(!q)return items;
  const words=q.split(/\s+/);
  return items.map(it=>{const l=it.label.toLowerCase(),t=it.text.toLowerCase();if(!words.every(w=>t.includes(w)))return null;
    return [l===q?0:l.startsWith(q)?1:l.split(/\W+/).some(w=>w.startsWith(words[0]))?2:l.includes(q)?3:it.cat.toLowerCase().includes(q)?4:5,it];})
    .filter(Boolean).sort((a,b)=>a[0]-b[0]).map(x=>x[1]);
}
// Place a node at a graph point; dropped on a wire, a chain node is spliced into it.
// Splice node n into the wire (from→to): source → n → destination. Returns false when the ports don't fit.
function spliceInto(g,n,wire){
  const e=g.edges.find(e=>e.from===wire.from&&e.out===wire.out&&e.to===wire.to&&e.input===wire.input);
  if(!e||e.from===n.id||e.to===n.id||!isChain(n.type))return false;
  const src=g.nodes.find(m=>m.id===e.from),dst=g.nodes.find(m=>m.id===e.to),srcType=TYPES[src.type].outputs[e.out];
  const inPort=Object.entries(inputsOf(n.type)).find(([,t])=>compatible(srcType,t))?.[0],outPort=Object.entries(TYPES[n.type].outputs).find(([,t])=>compatible(t,inputsOf(dst.type)[e.input]))?.[0];
  if(!inPort||!outPort)return false;
  g.edges=g.edges.filter(x=>x!==e);g.edges.push({from:e.from,out:e.out,to:n.id,input:inPort},{from:n.id,out:outPort,to:e.to,input:e.input});return true;
}
const wireAt=(x,y,exclude)=>document.elementsFromPoint(x,y).find(w=>w.classList?.contains('wire')&&w.dataset.from&&w.dataset.from!==exclude&&w.dataset.to!==exclude);
function placeNode(it,gx,gy,wire){
  if(it.custom)return insertCustom(it.custom,gx-84,gy-20);
  let made=null;
  const ok=edit((p,g)=>{
    const n=node(it.type,Math.round(gx-84),Math.round(gy-20),clone(it.props));made=n;g.nodes.push(n);
    if(wire)spliceInto(g,n,wire);
  },`Added ${it.label}`);
  if(ok&&made){selected=made.id;renderUI();}
}
function closeSearch(){document.querySelector('.node-search')?.remove();}
function openSearch(){
  closeSearch();closeMenu();
  const vp=$('graphViewport'),r=vp.getBoundingClientRect();
  const cx=pointer.inGraph?pointer.x:r.left+r.width/2,cy=pointer.inGraph?pointer.y:r.top+r.height/3;
  const z=uiZ(),gx=((cx-r.left)/z-view.x)/view.zoom,gy=((cy-r.top)/z-view.y)/view.zoom;
  const w=document.elementsFromPoint(cx,cy).find(x=>x.classList?.contains('wire')),wire=w?{...w.dataset}:null;
  const box=el('div','node-search'),input=el('input'),list=el('div','node-search-list'),items=searchItems();
  input.type='search';input.placeholder=wire?'Insert into wire…':'Search nodes…';input.setAttribute('aria-label','Search nodes');list.setAttribute('role','listbox');
  let shown=[],active=0;
  const pick=it=>{closeSearch();placeNode(it,gx,gy,wire);};
  const render=()=>{
    shown=rankItems(items,input.value).slice(0,40);active=Math.min(active,Math.max(0,shown.length-1));list.replaceChildren();
    if(!shown.length)list.append(el('div','node-search-empty','No match'));
    shown.forEach((it,i)=>{const b=el('button','node-search-item'+(i===active?' active':''));b.type='button';b.setAttribute('role','option');b.style.setProperty('--cat',it.color);
      b.append(el('span','ns-label',it.label),el('span','ns-cat',it.cat));
      b.onpointerdown=e=>e.preventDefault();b.onclick=()=>pick(it);list.append(b);});
    list.querySelector('.active')?.scrollIntoView({block:'nearest'});
  };
  input.oninput=()=>{active=0;render();};
  input.onkeydown=e=>{
    const up=box.style.flexDirection==='column-reverse',next=e.key==='Tab'?!e.shiftKey:e.key===(up?'ArrowUp':'ArrowDown'),prev=e.key==='Tab'?e.shiftKey:e.key===(up?'ArrowDown':'ArrowUp');
    if(next){e.preventDefault();active=(active+1)%Math.max(1,shown.length);render();}
    else if(prev){e.preventDefault();active=(active-1+shown.length)%Math.max(1,shown.length);render();}
    else if(e.key==='Enter'){e.preventDefault();if(shown[active])pick(shown[active]);}
    else if(e.key==='Escape'){e.preventDefault();closeSearch();}
  };
  input.onblur=()=>setTimeout(()=>{if(!box.contains(document.activeElement))closeSearch();},0);
  box.append(input,list);document.body.append(box);render();
  const b=box.getBoundingClientRect(),W=innerWidth/z,H=innerHeight/z,bw=b.width/z,bh=b.height/z,mx=cx/z,my=cy/z;box.style.left=Math.max(8,Math.min(mx,W-bw-8))+'px';
  // Near the bottom edge the box grows upward from the cursor, so filtering keeps it next to the cursor.
  if(my+bh+8>H&&my>H/2){box.style.bottom=Math.max(8,H-my)+'px';box.style.flexDirection=list.style.flexDirection='column-reverse';}else box.style.top=Math.max(8,my)+'px';
  input.focus();
}
function closeMenu(){document.querySelector('.port-menu')?.remove();}
function portMenu(target,from,x,y){
  closeMenu();renderGraph();
  const t=TYPES[target.type],keep=new Set(simKeys(graph(),target)),options=Object.entries(inputsOf(target.type)).filter(([k,type])=>compatible(from.type,type)&&(!t.props[k]||keep.has(k)));
  if(isEngine(target.type)&&from.type==='number'){
    const e=engines.get(target.id);let ctl=[];try{ctl=e?.status==='ready'?e.controls(jobOf(target))||[]:[];}catch{}
    for(const c of ctl)if(c.type==='range')options.push(['opt_'+c.id,'number']);
  }
  if(!options.length){message(`${t.label} has no ${from.type} input`,true);return;}
  if(options.length===1){connection(from.id,from.port,target.id,options[0][0]);return;}
  const menu=el('div','port-menu');menu.setAttribute('role','menu');
  menu.append(el('div','port-menu-title',`Connect to ${t.label}`));
  for(const [k] of options){const b=el('button','',portLabel(target,k));b.type='button';b.dataset.port=k;b.onclick=()=>{closeMenu();connection(from.id,from.port,target.id,k);};menu.append(b);}
  document.body.append(menu);
  const z=uiZ(),r=menu.getBoundingClientRect();menu.style.left=Math.min(x/z,(innerWidth-r.width)/z-8)+'px';menu.style.top=Math.min(y/z,(innerHeight-r.height)/z-8)+'px';
  menu.querySelector('button')?.focus();
}
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.port-menu'))closeMenu();},true);
function applyView(){$('graphWorld').style.transform=`translate(${view.x}px,${view.y}px) scale(${view.zoom})`;}
// Drag the header to move. Press and hold (or Alt-drag) to pull the node out of its chain; the chain heals.
const HOLD_MS=380;
function startMove(event,n,box){
  if(event.button!==0)return;event.preventDefault();const before=clone(state),start={x:event.clientX,y:event.clientY,nx:n.x,ny:n.y};box.setPointerCapture(event.pointerId);box.classList.add('dragging');
  const live=findNode(n.id);let moved=false,detached=false,target=null;
  // Dragging one of several selected nodes moves them all.
  const group=multi.has(n.id)?[...multi].filter(id=>id!==n.id).map(id=>{const m=findNode(id);return {m,x:m.x,y:m.y,box:$('nodes').querySelector(`.node[data-id="${id}"]`)};}):[];
  const loose=()=>{const g=state.layers.find(g=>g.id===active);return !g.edges.some(e=>e.from===n.id||e.to===n.id);};
  const mark=w=>{if(target===w)return;target?.classList.remove('wedge');target=w;w?.classList.add('wedge');};
  const detach=()=>{
    if(detached)return;detached=true;clearTimeout(hold);
    const g=state.layers.find(g=>g.id===active),had=g.edges.some(e=>e.from===n.id||e.to===n.id);
    if(!had){box.classList.remove('hold');return;}
    detachEdges(g,n.id);box.classList.remove('hold');box.classList.add('detached');renderWires();message('Detached · drop it anywhere');
  };
  const hold=group.length?0:setTimeout(()=>{if(!moved){box.classList.add('hold');detach();}},HOLD_MS);
  if(event.altKey&&!group.length)detach();
  const move=e=>{
    if(!moved&&Math.hypot(e.clientX-start.x,e.clientY-start.y)<4)return;moved=true;clearTimeout(hold);
    const z=uiZ()*view.zoom;live.x=Math.round(Math.max(-10000,Math.min(10000,start.nx+(e.clientX-start.x)/z)));live.y=Math.round(Math.max(-10000,Math.min(10000,start.ny+(e.clientY-start.y)/z)));box.style.left=live.x+'px';box.style.top=live.y+'px';for(const o of group){o.m.x=o.x+live.x-start.nx;o.m.y=o.y+live.y-start.ny;if(o.box){o.box.style.left=o.m.x+'px';o.box.style.top=o.m.y+'px';}}renderWires();
    // An unconnected node dropped on a wire wedges itself in between.
    target=null;mark(!group.length&&loose()&&isChain(n.type)?wireAt(e.clientX,e.clientY,n.id)||null:null);
  };
  const end=()=>{clearTimeout(hold);box.classList.remove('dragging','hold','detached');box.removeEventListener('pointermove',move);box.removeEventListener('pointerup',end);box.removeEventListener('pointercancel',end);
    const w=target&&{...target.dataset};mark(null);
    attempt(()=>{let label=detached?'Detached node':group.length?`Moved ${group.length+1} nodes`:'Moved node';
      if(w){const g=state.layers.find(g=>g.id===active);if(spliceInto(g,live,w))label=`Wedged ${TYPES[n.type].label} into the wire`;}
      commit(clone(state),label,before);});};
  box.addEventListener('pointermove',move);box.addEventListener('pointerup',end);box.addEventListener('pointercancel',end);
}
function fit(){
  const g=graph(),vp=$('graphViewport');if(!g.nodes.length){view.x=20;view.y=20;view.zoom=.9;applyView();return;}
  const xs=g.nodes.map(n=>n.x),ys=g.nodes.map(n=>n.y),minX=Math.min(...xs)-20,minY=Math.min(...ys)-20,maxX=Math.max(...xs)+190,maxY=Math.max(...ys)+230;
  view.zoom=Math.max(.35,Math.min(1,Math.min(vp.clientWidth/(maxX-minX),vp.clientHeight/(maxY-minY))));
  view.x=(vp.clientWidth-(maxX-minX)*view.zoom)/2-minX*view.zoom;view.y=Math.max(4,(vp.clientHeight-(maxY-minY)*view.zoom)/2)-minY*view.zoom;applyView();requestAnimationFrame(renderWires);
}

// ---------- inspector ----------
function section(root,label){const s=el('div','insp-section');if(label)s.append(el('div','insp-label',label));root.append(s);return s;}
// Inspector sections are an accordion: one open at a time, remembered per node type (the first one opens by default).
const foldKey=()=>'agpro.open.'+(findNode(selected)?.type||'layer');
function setFolds(open){
  for(const f of $('properties').querySelectorAll('.insp-fold')){const v=f.dataset.group===open;f.classList.toggle('closed',!v);f.firstChild.setAttribute('aria-expanded',v?'true':'false');}
}
// Help text (descriptions, notes, tips) sits behind a ? in each inspector header; the choice is remembered.
let tipsOn=localStorage.getItem('agpro.tips')==='1';
function tipify(root=$('properties')){
  root.querySelectorAll('.insp-desc,.insp-note:not(.live-value):not(.data-status):not(.audio-source):not(.insp-err):not(.ai-status)').forEach(t=>t.classList.add('tip'));
  root.classList.toggle('tips-on',tipsOn);
  const head=root.querySelector('.insp-head');if(!head||head.querySelector('.tips-btn')||!root.querySelector('.tip'))return;
  const b=el('button','tips-btn','?');b.type='button';b.title='Show tips';b.setAttribute('aria-label','Show tips');b.setAttribute('aria-pressed',String(tipsOn));b.dataset.property='tips';
  b.onclick=()=>{tipsOn=!tipsOn;try{localStorage.setItem('agpro.tips',tipsOn?'1':'0');}catch{}root.classList.toggle('tips-on',tipsOn);b.setAttribute('aria-pressed',String(tipsOn));};
  head.prepend(b);
}
function syncFolds(){
  const saved=localStorage.getItem(foldKey()),folds=[...$('properties').querySelectorAll('.insp-fold')];
  setFolds(saved!==null&&folds.some(f=>f.dataset.group===saved)||saved===''?saved:folds[0]?.dataset.group);
}
function fold(root,label){
  const s=el('div','insp-section insp-fold closed');
  const head=el('button','insp-label insp-fold-head',label);head.type='button';s.dataset.group=label;head.setAttribute('aria-expanded','false');
  const body=el('div','insp-fold-body');s.append(head,body);
  head.onclick=()=>{const v=s.classList.contains('closed')?label:'';setFolds(v);try{localStorage.setItem(foldKey(),v);}catch{}};
  root.append(s);return body;
}
// Renderer option knobs (read from the original's panels) are sorted into groups by their label.
// Nodes that run a WebGPU simulation with its own sound knobs.
const SIM_NODES=['gpuParticles','cloner','splat'];
const OPT_GROUPS=[['Setup',/preset|^emitter$|bound|source|model|^type|mode|shape|cloud|scene/i],['Sound',/sensitiv|attack|release|audio|sound|bass|energy|beat|spectrum|react|loud/i],
  ['Camera',/orbit|tilt|zoom|^rotate|walkthrough|camera/i],
  ['Emission',/amount|lifetime|life|size|launch|emit|jet|spawn|count|density|rate|particles|radius/i],['Forces',/drag|gravity|pull|swirl|spin|turbul|curl|flow|wind|speed|attract|viscos|vortic|force|cohes|align|separ|noise|friction|damp|pressure|diffus/i],
  ['Look',/trail|bloom|exposure|glow|colou?r|opacity|contrast|saturat|hue|fade|bright|light|shad|edge|thick|point/i],['Quality',/quality|precision|budget|simulation|time ?scale|step|resolution|iteration|detail/i]];
const optGroup=label=>(OPT_GROUPS.find(([,re])=>re.test(label||''))||['Form'])[0];
function setProp(n,key,value,label){return edit((p,g)=>{g.nodes.find(x=>x.id===n.id).props[key]=value;},`${TYPES[n.type].label}: ${label}`);}
function autoOpts(n,key,s){
  if(s&&(s.kind!=='number'||s.noPort))return {};
  return {auto:!!n.auto?.includes(key),onAuto:on=>edit((p,g)=>{const x=g.nodes.find(x=>x.id===n.id),a=new Set(x.auto||[]);on?a.add(key):a.delete(key);if(a.size)x.auto=[...a];else delete x.auto;},`${s?.label||'Knob'}: auto ${on?'on':'off'}`)};
}
function propControl(n,key,s,connected){
  const set=v=>setProp(n,key,v,s.label);
  if(s.kind==='number')return ui.knob({label:s.label,min:s.min,max:s.max,step:s.step,value:n.props[key],def:s.value,property:key,modulated:connected,...autoOpts(n,key,s),
    onInput:v=>live(st=>{const x=findNode(n.id);if(x)x.props[key]=v;}),onChange:()=>liveCommit(`${TYPES[n.type].label}: ${s.label}`)});
  if(s.kind==='select')return ui.chips({options:s.labels||s.choices.map(c=>[c,c]),value:n.props[key],property:key,onChange:set});
  if(s.kind==='bool')return ui.field(s.label,ui.toggle({value:n.props[key],property:key,onChange:set}));
  if(s.kind==='color')return ui.colorField({label:s.label,value:n.props[key],property:key,onChange:v=>live(()=>{findNode(n.id).props[key]=v;})});
  if(s.kind==='text'){const i=el(s.max>200?'textarea':'input');if(s.max>200)i.rows=3;else i.type='text';i.maxLength=s.max;i.value=n.props[key];i.dataset.property=key;i.onchange=()=>set(i.value);return ui.field(s.label,i);}
}
function renderProps(root,n,keys,folded){
  const t=TYPES[n.type],g=graph(),wired=k=>g.edges.some(e=>e.to===n.id&&e.input===k);
  // Grouped props (spec.group) go into collapsible sections after the ungrouped ones.
  const groups=new Map();if(!folded)for(const k of keys){const gr=t.props[k]?.group;if(gr){if(!groups.has(gr))groups.set(gr,[]);groups.get(gr).push(k);}}
  if(groups.size){renderProps(root,n,keys.filter(k=>!t.props[k]?.group),true);for(const [gr,ks] of groups)renderProps(fold(root,gr),n,ks,true);return;}
  let grid=null,sec=section(root,null);
  for(const k of keys){
    const s=t.props[k],c=propControl(n,k,s,wired(k));if(!c)continue;
    if(s.kind==='number'){if(!grid){grid=el('div','knob-grid');sec.append(grid);}grid.append(c);continue;}
    grid=null;
    if(s.kind==='select'){const sub=section(root,s.label);sub.append(c);sec=section(root,null);}
    else sec.append(c);
  }
  // Color pickers commit on close, not on every input event.
  root.querySelectorAll('input[type=color]').forEach(i=>i.addEventListener('change',()=>liveCommit('Changed color')));
}
function renderProperties(){
  $('previewWrap').classList.toggle('pinning',!!pinNode());
  const root=$('properties');root.replaceChildren();closeMenu();
  const g=graph(),n=g.nodes.find(n=>n.id===selected);
  if(multi.size>1){renderMulti(root);tipify();return;}
  if(!n){renderLayerInspector(root,g);tipify();return;}
  const t=TYPES[n.type],cat=catOf(n.type),head=el('div','insp-head'),h=el('h3');
  h.style.color=cat.color;h.append(document.createTextNode(nodeTitle(n)));
  head.append(h,el('div','insp-desc',t.description));root.append(head);
  if(n.type==='templateMorph'){
    for(const key of ['from','to']){const sel=el('select');sel.dataset.property=key;for(const name of TEMPLATE_NAMES)sel.append(new Option(name,name));sel.value=n.props[key];
      sel.onchange=()=>{tm.playing=false;edit((p,g)=>{g.nodes.find(m=>m.id===n.id).props[key]=sel.value;},'Morph template');};root.append(ui.field(TYPES[n.type].props[key].label,sel));}
    const knobs=el('div','knob-grid');knobs.append(ui.knob({label:'Morph',min:0,max:100,step:1,value:n.props.mix,def:0,unit:'%',property:'mix',
      onInput:v=>{tm.playing=false;live(()=>{findNode(n.id).props.mix=v;});},onChange:()=>liveCommit('Morph blend')}));root.append(knobs);
  }
  else if(t.engine)renderEmitter(root,n);
  else{
    if(n.type==='audioIn')renderAudioSource(root);
    if(n.type==='palette')renderPalettePresets(root,n);
    if(DATA_INPUTS.has(n.type))renderDataInput(root,n);
    if(n.type==='aiRender'||n.type==='aiModel')renderAiStatus(root,n);
    if(['image','video','camera'].includes(n.type))renderMediaPicker(root,n);
    if(SIM_PROPS(n.type)&&t.category!=='3d')renderSimNote(root,g,n);
    renderProps(root,n,n.type==='palette'?paletteKeys(n.props):simKeys(g,n));
    const wired=Object.keys(t.props).filter(k=>t.props[k].kind==='number'&&!t.props[k].noPort);
    if(wired.length&&t.category!=='controls'&&n.type!=='audioIn')section(root).append(el('p','insp-note','Any knob can be driven: drag a wire from a Control or Audio node onto this node and pick the knob. 0 keeps the knob value, 1 pushes it to the maximum.'));
    if(t.category==='controls'||t.category==='audio'&&n.type!=='spectrum'||n.type==='audioIn'||DATA_INPUTS.has(n.type)){const v=el('p','insp-note live-value');v.dataset.node=n.id;section(root).append(v);}
  }
  const actions=section(root).appendChild(el('div','insp-actions'));
  const dup=el('button','btn','Duplicate');dup.id='duplicateNode';dup.onclick=duplicateSelected;
  const del=el('button','btn danger','Delete');del.id='deleteNode';del.onclick=removeSelected;actions.append(dup,del);
  updateHint();
  syncFolds();tipify();
}
// True when node `to` sits downstream of `from` along shape wires.
function chainFrom(g,from,to){const seen=new Set();let cur=g.nodes.find(m=>m.id===to);while(cur&&!seen.has(cur.id)){if(cur.id===from)return true;seen.add(cur.id);const e=g.edges.find(e=>e.to===cur.id&&e.input==='shape');cur=e&&g.nodes.find(m=>m.id===e.from);}return false;}
function renderSimNote(root,g,n){
  const mode=upstreamSim(g,n),t=TYPES[n.type],sims=[...new Set(Object.values(t.props).flatMap(s=>s.sims||[]))];
  const names=sims.map(m=>emitterNames[m]).join(', ');
  const msg=!mode?`Wire this after a WebGPU simulation. Works on: ${names}.`:sims.includes(mode)?`Acting on ${emitterNames[mode]}. Also works on: ${sims.filter(m=>m!==mode).map(m=>emitterNames[m]).join(', ')||'—'}.`:`${emitterNames[mode]||'This renderer'} has no ${t.label.toLowerCase()} control. Works on: ${names}.`;
  section(root).append(el('p','insp-note',msg));
}
// Palette: an editable ramp (click to add a colour, click a stop to pick, drag it off to remove, dot = Auto hue drift) plus presets.
const gradientCss=stops=>stops.length>1?`linear-gradient(to right,${stops.join(',')})`:stops[0];
const livePalette=n=>paletteAuto(n.props,n.id,autoClock);
function paletteCss(p){return p.mode==='solid'?p.solid:gradientCss(p.mode==='simpleramp'?paletteStops(p).simple:paletteStops(p).tone);}
function updatePalettePreview(){
  const pv=document.querySelector('.pal-preview');if(!pv)return;const n=findNode(pv.dataset.node);if(!n)return;const p=livePalette(n);pv.style.background=paletteCss(p);
  if(p.stops)pv.querySelectorAll('.pal-stop').forEach((m,i)=>{if(p.stops[i])m.style.background=p.stops[i].c;});
}
function paletteKeys(p){
  if(p.mode==='solid')return ['mode','solid','blend','mix'];
  return ['mode',...(p.mode==='toneramp'?['fade']:[]),'blend','mix'];
}
const hexRgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)),rgbHex=c=>'#'+c.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
function paletteRamp(s,n){
  const pv=el('div','pal-preview pal-ramp');pv.dataset.node=n.id;pv.dataset.property='stops';pv.style.background=paletteCss(livePalette(n));s.append(pv);
  if(n.props.mode==='solid')return;
  const stops=n.props.stops,last=stops.length-1,at=i=>`${i/last*100}%`;
  const setStops=(fn,label)=>edit((p,g)=>{const x=g.nodes.find(x=>x.id===n.id).props;x.stops=fn(x.stops.map(st=>({...st})));},label);
  pv.title='Click to add a colour';
  pv.onclick=e=>{
    if(e.target!==pv||stops.length>=MAX_STOPS)return;const r=pv.getBoundingClientRect(),f=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),k=Math.min(last,Math.max(1,Math.ceil(f*last)));
    const t=f*last-(k-1),a=hexRgb(stops[k-1].c),b=hexRgb(stops[k].c);
    setStops(st=>{st.splice(k,0,{c:rgbHex(a.map((v,j)=>v+(b[j]-v)*Math.max(0,Math.min(1,t)))),auto:false});return st;},'Palette: add colour');
  };
  const autos=el('div','pal-autos');
  stops.forEach((st,i)=>{
    const m=el('div','pal-stop');m.style.left=at(i);m.style.background=st.c;m.dataset.index=i;m.title='Click to pick · drag off to remove';
    const pick=el('input');pick.type='color';pick.value=st.c;pick.tabIndex=-1;pick.setAttribute('aria-label',`Colour ${i+1}`);m.append(pick);
    pick.oninput=()=>live(()=>{findNode(n.id).props.stops[i].c=pick.value;});
    pick.onchange=()=>{liveCommit('Palette: colour');renderProperties();};
    m.onpointerdown=e=>{
      if(e.button!==0)return;e.preventDefault();const y0=e.clientY,x0=e.clientX;let off=false,moved=false;m.setPointerCapture(e.pointerId);
      m.onpointermove=ev=>{moved||=Math.hypot(ev.clientX-x0,ev.clientY-y0)>4;off=stops.length>2&&Math.abs(ev.clientY-y0)>28;m.classList.toggle('removing',off);m.style.transform=moved?`translate(-50%,${(ev.clientY-y0)/uiZ()}px)`:'';};
      m.onpointerup=()=>{m.onpointermove=m.onpointerup=null;m.style.transform='';
        if(off)setStops(st=>{st.splice(i,1);return st;},'Palette: remove colour');else if(!moved)pick.click();};
    };
    m.oncontextmenu=e=>{e.preventDefault();if(stops.length>2)setStops(st=>{st.splice(i,1);return st;},'Palette: remove colour');};
    pv.append(m);
    const a=el('button','knob-auto pal-auto'+(st.auto?' on':''));a.type='button';a.style.left=at(i);a.dataset.index=i;a.title='Auto: slowly wander the hue';a.setAttribute('aria-pressed',String(!!st.auto));
    a.onclick=()=>setStops(x=>{x[i].auto=!x[i].auto;return x;},`Palette: auto colour ${i+1} ${st.auto?'off':'on'}`);autos.append(a);
  });
  s.append(autos);
}
function renderPalettePresets(root,n){
  const s=section(root,'Palette');paletteRamp(s,n);
  const box=el('div','pal-presets');box.dataset.property=n.props.mode==='solid'?'solidPreset':'palettePreset';
  if(n.props.mode==='solid')for(const c of SOLID_PRESETS){
    const b=el('button','pal-swatch solid');b.type='button';b.title=c;b.dataset.value=c;b.style.background=c;b.classList.toggle('on',n.props.solid.toLowerCase()===c);
    b.onclick=()=>edit((p,g)=>{g.nodes.find(x=>x.id===n.id).props.solid=c;},'Palette: '+c);box.append(b);
  }
  else for(const [name,st] of Object.entries(PALETTES)){
    const want=n.props.mode==='simpleramp'?st.slice(1):st,cur=n.props.stops.map(x=>x.c).join();
    const b=el('button','pal-swatch');b.type='button';b.title=name;b.dataset.value=name;b.setAttribute('aria-label','Palette '+name);
    b.style.background=gradientCss(n.props.mode==='simpleramp'?want:[st[0]+'00',...st.slice(1)]);b.classList.toggle('on',cur===want.join().toLowerCase());
    b.onclick=()=>edit((p,g)=>{const x=g.nodes.find(x=>x.id===n.id).props;x.stops=want.map((c,i)=>({c:c.toLowerCase(),auto:!!x.stops[i]?.auto}));x.fade=0;},'Palette: '+name);
    box.append(b);
  }
  s.append(box);
}
// A new emitter type starts from its defaults; wires into the old type's option knobs are dropped.
function setMode(g,n,mode,key='mode'){if(n.props[key]===mode)return;n.props[key]=mode;n.props.opts={};n.props.chips={};g.edges=g.edges.filter(e=>!(e.to===n.id&&OPT_PORT.test(e.input)));}
const AI_SETUP='mkdir -p ~/audiograph-ai && cd ~/audiograph-ai && for f in bridge.py requirements.txt start.command; do curl -fsSLO https://vladimirpetkovic.github.io/audiograph/ai/$f; done && chmod +x start.command && ./start.command';
// AI bridge connection: live status line plus how to start the bridge.
function aiTarget(n){
  if(n.type==='aiModel')return {url:n.props.server,model:n.props.model};
  const st=nodeState.get(n.id);return {url:st?.url||AI_DEFAULT_URL,model:st?.model||'sd-turbo'};
}
function renderAiStatus(root,n){
  const s=section(root,'AI bridge'),line=el('p','insp-note ai-status');line.dataset.node=n.id;s.append(line);
  const tick=()=>{if(!line.isConnected)return;const t=aiTarget(findNode(n.id)||n);aiClient(t.url).use();line.textContent=aiStatus(t.url,t.model);setTimeout(tick,500);};tick();
  s.append(el('p','insp-note','The AI runs on your computer, not in the browser. Paste this into Terminal once (the first run installs Python packages and downloads the model), then leave the window open. Next time just run ~/audiograph-ai/start.command. Chrome or Edge recommended.'));
  s.append(el('code','cmd',AI_SETUP));
  const a=el('a','btn','AI bridge guide');a.href='https://github.com/vladimirpetkovic/audiograph/tree/main/ai';a.target='_blank';a.rel='noopener';s.append(a);
}
// Data inputs: live meters (filled by the readout timer), plus source status and helper / MIDI actions.
function renderDataInput(root,n){
  const s=section(root,'Live');s.append(el('p','insp-note data-status'));
  if(n.type==='computer'){
    s.append(el('p','insp-note','Browsers cannot see the real CPU or GPU use. For true values pick “Local helper” and run this once in Terminal (needs Node.js):'));
    const code=el('code','cmd',`node computer-feed.mjs ${n.props.port}`);s.append(code);
    const a=el('a','btn','Download computer-feed.mjs');a.href='tools/computer-feed.mjs';a.download='computer-feed.mjs';s.append(a);
    s.append(el('p','insp-note','It only listens on this computer (127.0.0.1) and reports numbers. Works in Chrome and Edge; Safari blocks local connections.'));
  }
  if(n.type==='midi'){
    const row=el('div','audio-src'),con=el('button','btn','Connect MIDI'),learn=el('button','btn','Learn CC');con.type=learn.type='button';
    con.onclick=()=>sensors.connectMidi().then(()=>message('MIDI connected')).catch(e=>message(e.message,true));
    learn.title='Move a knob or fader on your controller';
    learn.onclick=async()=>{try{await sensors.connectMidi();learn.textContent='Move a control…';const r=await sensors.midiLearn();edit((p,g)=>{const x=g.nodes.find(x=>x.id===n.id);x.props.cc=r.cc;x.props.channel=r.channel;},`MIDI: learned CC ${r.cc}`);}catch(e){message(e.message,true);}};
    row.append(con,learn);s.append(row);
  }
  if(n.type==='pointer')s.append(el('p','insp-note','Reads the mouse and keyboard anywhere in this window (key names are never recorded, only how often you type).'));
}
// The Audio node's inspector holds the project's sound source (shared by every Audio node).
function renderAudioSource(root){
  const s=section(root,'Source'),row=el('div','audio-src');
  const load=el('label','btn teal','Load file'),f=el('input');f.type='file';f.id='audioFile';f.accept='audio/*';f.hidden=true;load.title='Play an audio file';load.append(f);
  load.addEventListener('click',unlockAudio);f.onchange=()=>{const file=f.files[0];if(file)loadAudioFile(file);};
  const mic=el('button','btn','Mic');mic.id='mic';mic.type='button';mic.title='Use the microphone';mic.onclick=()=>toggleMic().catch(e=>audioError('Mic',e));
  const sys=el('button','btn','System');sys.id='system';sys.type='button';sys.title='React to whatever your computer plays (desktop Chrome / Edge: share the screen or a tab with audio)';sys.onclick=()=>toggleSystem().catch(e=>audioError('System audio',e));
  row.append(load,mic,sys);s.append(row,el('p','insp-note audio-source'),el('p','insp-note','Every Audio node hears this one source. Wire “audio” into visual inputs, waveforms, emitters or an Audio EQ; bass, mids, high, level and beat are numbers for any knob.'));
  updateAudioUI();
}
async function loadAudioFile(file){
  try{
    if(file.size>200*1024*1024)throw Error('Audio limit is 200 MB');
    stopAudio();stopLive();audio.buffer=await audioContext().decodeAudioData(await file.arrayBuffer());audio.name=file.name;
    updateAudioUI();setPaused(false);await play();
  }catch(error){message('Audio: '+error.message,true);}
}
// After a splat file loads, pick the "Loaded file" cloud and apply the parser's orientation hint.
function useSplatFile(n,e,res){
  const job=jobOf(n),cloud=(e.controls(job)||[]).find(c=>c.type==='chips'&&c.options.some(o=>o.label==='Loaded file'));
  edit((p,g)=>{const x=g.nodes.find(x=>x.id===n.id);if(cloud)x.props.chips={...x.props.chips,[cloud.key]:'Loaded file'};if(res?.flip)x.props.opts={...x.props.opts,pGsRX:180};},'Gaussian Splat: loaded file');
}
// Image / Video: one Choose button, then a thumbnail with × to remove. Camera: its live preview.
function renderMediaPicker(root,n){
  const s=section(root),box=el('div','media-pick');s.append(box);
  if(n.type==='camera'){
    const item=el('div','media-item cam-thumb'),v=el('video');v.muted=true;v.playsInline=true;v.autoplay=true;v.dataset.property='cameraPreview';item.append(v);
    camProvider().then(st=>{if(item.isConnected){v.srcObject=st;v.play().catch(()=>{});}}).catch(()=>{item.replaceChildren(el('span','media-name','Camera blocked'));});
    box.append(item);return;
  }
  const m=mediaOf(n),f=el('input');f.type='file';f.id='emitterMedia';f.hidden=true;
  f.accept=n.type==='image'?'image/png,image/jpeg,image/webp,image/gif,image/avif':'video/*';
  f.onchange=async()=>{try{if(!f.files[0])return;await m.load(f.files[0]);message('Loaded '+m.name);renderProperties();updateSummaries();if(paused)draw(elapsed);}catch(e){message(e.message,true);}};
  if(m.name){
    const item=el('div','media-item');item.title=m.name+' · not saved in projects';
    if(m.thumb){const img=el('img');img.src=m.thumb;img.alt=m.name;item.append(img);}else item.append(el('span','media-name',m.name));
    const x=el('button','media-x','×');x.type='button';x.title='Remove';x.setAttribute('aria-label','Remove '+m.name);x.dataset.property='mediaRemove';
    x.onclick=()=>{const name=m.name;m.clear();message('Removed '+name);renderProperties();updateSummaries();if(paused)draw(elapsed);};
    item.append(x);box.append(item);
  }else{const b=el('button','mbtn media-choose',`Choose ${n.type}`);b.type='button';b.onclick=()=>f.click();box.append(b);}
  box.append(f);
}
function renderEmitter(root,n){
  const T=TYPES[n.type],s=section(root,MODES[n.type]?T.label:'Source');
  if(MODES[n.type]){
    const sel=el('select');sel.dataset.property='mode';sel.setAttribute('aria-label',T.props.mode.label);
    for(const [id,label] of MODES[n.type]){const o=el('option','',label);o.value=id;sel.append(o);}
    sel.value=n.props.mode;sel.onchange=()=>edit((p,g)=>{const x=g.nodes.find(x=>x.id===n.id);setMode(g,x,sel.value);},`${T.label}: ${emitterNames[sel.value]}`);
    s.append(ui.field(T.props.mode.label,sel));
  }
  if(T.props.render)s.append(ui.chips({options:T.props.render.labels.filter(l=>!(n.type==='waveform3d'&&l[0]==='points'&&n.props.mode!=='model')),value:n.props.render,property:'render',onChange:v=>edit((p,g)=>{setMode(g,g.nodes.find(x=>x.id===n.id),v,'render');},`${T.label}: ${v}`)}));
  if(n.type==='text')s.append(propControl(n,'text',T.props.text));
  // Objects come from wired 3D Object nodes; Variety only shows on projects that already changed or wired it.
  if(n.type==='cloner')renderProps(root,n,CLONER_KEYS.filter(k=>k!=='variety'||n.props.variety!==TYPES.cloner.props.variety.value||graph().edges.some(e=>e.to===n.id&&e.input===k)));
  if(n.type==='gpuParticles'&&graph().edges.some(e=>e.to===n.id&&e.input==='emit'))renderProps(root,n,['emitColors']);
  if(n.type==='waveform3d'&&n.props.render==='normal'&&n.props.mode!=='model')renderProps(root,n,Object.keys(PRIM_DEFAULT).filter(k=>k!=='shape'&&k!=='prim'));
  const kind=mediaKind(n);
  if(kind){
    const f=el('input');f.type='file';f.id='emitterMedia';f.accept=kind==='image'?'image/png,image/jpeg,image/webp,image/gif,image/avif':kind==='video'?'video/*':kind==='splat'?'.ply,.splat':'.obj,.glb,.gltf';
    f.onchange=async()=>{try{if(!f.files[0])return;const e=engineFor(n.id),res=await e.media(f.files[0],kind);if(kind==='splat')useSplatFile(n,e,res);const nc=kind==='object'?e.anim?.clips?.length||0:-1;message('Loaded '+f.files[0].name+(nc>0?` · playing ${nc>1?nc+' animation clips (pick one with Clip)':'its animation'}`:nc===0?' · no animation in this file (export a GLB with its animation baked in)':''));renderProperties();if(paused)draw(elapsed);}catch(e){message(e.message,true);}};
    // One button; once loaded, a thumbnail (or the file name) with × to remove it.
    const eng=engines.get(n.id),name=eng?.mediaName,box=el('div','media-pick');f.hidden=true;
    if(name){
      const item=el('div','media-item');item.title=name+' · not saved in projects';
      if(eng.mediaThumb){const img=el('img');img.src=eng.mediaThumb;img.alt=name;item.append(img);}else item.append(el('span','media-name',name));
      const x=el('button','media-x','×');x.type='button';x.title='Remove';x.setAttribute('aria-label','Remove '+name);x.dataset.property='mediaRemove';
      x.onclick=()=>{eng.clearMedia();if(kind==='splat')edit((p,g)=>{const y=g.nodes.find(y=>y.id===n.id);for(const [k,v] of Object.entries(y.props.chips||{}))if(v==='Loaded file')delete y.props.chips[k];},'Gaussian Splat: removed file');message('Removed '+name);renderUI();if(paused)draw(elapsed);};
      item.append(x);box.append(item);
    }else{
      const b=el('button','mbtn media-choose',`Choose ${kind==='object'?'model':kind==='splat'?'splat':kind}`);b.type='button';b.onclick=()=>f.click();box.append(b);
    }
    box.append(f);s.append(box);
  }
  // Animated model: speed (wireable, so the sound can drive it) and, with several clips, which one plays.
  const clips=n.type==='waveform3d'&&n.props.mode==='model'&&engines.get(n.id)?.anim?.clips;
  if(clips?.length){renderProps(root,n,clips.length>1?['animSpeed','clip']:['animSpeed']);if(clips.length>1)section(root).append(el('p','insp-note','Clips: '+clips.map((c,i)=>`${i+1} ${c.name}`).join(' · ')));}
  const wiredOf=k=>graph().edges.some(e=>e.to===n.id&&e.input===k);
  const top=el('div','insp-options');s.append(top);
  const opts=el('div','insp-options');opts.dataset.emitterOptions='';root.append(opts);
  // One Sound section per node. Simulations hear through their own sound knobs, so the generic ones only show when already changed;
  // waveforms use line Sensitivity as their gain. 3D tilt / rotate only exist where a classic 3D mode can use them.
  const sim=SIM_NODES.includes(n.type)||n.type==='waveform3d'&&n.props.render==='normal',classic3d=n.type==='waveform3d'||n.type==='waveform2d'&&n.props.mode==='fractal';
  const used=k=>wiredOf(k)||n.auto?.includes(k)||n.props[k]!==undefined&&n.props[k]!==T.props[k].value;
  const geo={};let lineSens=false;
  for(const k of [...Object.keys(GEO_PROPS),...Object.keys(STYLE_PROPS)])if(T.props[k]){
    const gr=T.props[k].group;if(gr==='Lines'&&sim||n.type==='waveform3d'&&n.props.render!=='waveform'&&['Lines','Line style','Outline'].includes(gr))continue;
    if((k==='tilt'||k==='turn')&&!classic3d&&!used(k))continue;
    if(k==='sensitivity'){lineSens=true;continue;}
    if(k==='contrast'||k==='fade')continue;
    (geo[gr]||=[]).push(k);
  }
  const sndWrap=el('div');root.append(sndWrap);
  for(const [gr,ks] of Object.entries(geo))renderProps(fold(root,gr),n,ks,true);
  const d=fold(sndWrap,'Sound');
  const wiredDrive=graph().edges.some(e=>e.to===n.id&&e.input==='drive');
  const sndKeys=sim?['intensity','punch','release','dynamics'].filter(used):[...(lineSens?['sensitivity','contrast','fade']:['intensity']),...(lineSens&&used('intensity')?['intensity']:[]),'punch','release','dynamics'].filter(k=>T.props[k]);
  if(sndKeys.length){const rg=el('div','knob-grid');for(const k of sndKeys)rg.append(propControl(n,k,T.props[k],wiredOf(k)));d.append(rg);}
  const wiredAudio=graph().edges.find(e=>e.to===n.id&&e.input==='audio'),from=wiredAudio&&findNode(wiredAudio.from);
  d.append(el('p','insp-note',wiredDrive?'Driven by the connected number (it replaces the music).':from?`Hears ${TYPES[from.type].label} (${sourceName()}).`:T.category==='inputs'?'Still until you wire audio into it.':`Hears the project sound (${sourceName()}).`));
  const e=engineFor(n.id);
  const fill=()=>{
    if(selected!==n.id||!opts.isConnected)return;
    let controls;try{controls=e.controls(jobOf(n));}catch(err){opts.append(el('p','insp-note insp-err',err.message));return;}
    if(!controls)return;
    opts.replaceChildren();top.replaceChildren();
    // Choice chips (Type, Direction…) sit at the top; line-look chips join Look. Few knobs share one section named after the node.
    // A 3D Object drawn Normal runs on the cloner (a Cloner of one), so it gets the same lean inspector.
    const clonerLike=n.type==='cloner'||n.type==='waveform3d'&&n.props.render==='normal';
    const moved=n.type==='gpuParticles'&&FORCE_KNOBS[n.props.mode]||clonerLike&&FORCE_KNOBS.simcloner||{};
    controls=controls.filter(c=>c.type!=='range'||!moved[c.id]);
    // The cloner's shapes, layout, presets and every pG3 knob are Pro nodes and properties now.
    if(clonerLike)controls=controls.filter(c=>c.type==='range'?!c.id.startsWith('pG3')&&(optGroup(c.label)!=='Look'||n.props.opts?.[c.id]!==undefined&&n.props.opts[c.id]!==c.def):!/\('g3|simApplyPreset/.test(c.onclick));
    // Leftover knobs share one "Form" section; sound, look and quality always keep their own.
    const ranges=controls.filter(c=>c.type==='range'),few=ranges.length<=9,main='Form',KEEP=['Sound','Look','Quality'];
    const lineChip=c=>/line|stroke|style/i.test(c.label),first=controls.find(c=>c.type!=='range'&&!c.action&&!lineChip(c));
    const groupOf=c=>{const g=optGroup(c.label);if(c.type!=='range')return c===first||g==='Setup'?null:lineChip(c)||/blend/i.test(c.label)?'Look':['Quality','Camera','Look'].includes(g)?g:main;return few?(KEEP.includes(g)?g:main):g;};
    const order=[...new Set([main,...OPT_GROUPS.map(([g])=>g)])],bins=new Map(order.map(g=>[g,[]]));
    for(const c of controls){const gr=groupOf(c);if(gr)bins.get(gr).push(c);}
    for(const [gr,list] of bins)if(gr!==main&&gr!=='Sound'&&list.length&&list.length<(KEEP.includes(gr)?2:3)){bins.get(main).push(...list);list.length=0;}
    const chip=c=>{
      const wrap=el('div','opt-chips');if(c.label)wrap.append(el('div','insp-sublabel',c.label));
      const current=c.options.find(o=>o.on)?.label;
      wrap.append(ui.chips({options:c.options.map(o=>[o.label,o.label]),value:c.action?null:current,property:'chip:'+c.key,onChange:label=>{
        attempt(()=>{
          const job=jobOf(n),res=e.click(job,c.key,label);
          if(c.action){message(label);if(Object.keys(res.ranges).length)edit((p,g)=>{const x=g.nodes.find(x=>x.id===n.id);x.props.opts={...x.props.opts,...res.ranges};},'Emitter: '+label);return;}
          edit((p,g)=>{const x=g.nodes.find(x=>x.id===n.id);x.props.chips={...x.props.chips,[c.key]:label};x.props.opts={...x.props.opts,...res.ranges};},'Emitter: '+label);
        });
      }}));
      return wrap;
    };
    for(const c of controls)if(!groupOf(c))top.append(chip(c));
    const boxes=new Map();
    for(const [gr,list] of bins){
      if(!list.length)continue;
      // The node's Sound section (with its note) moves into place and takes the simulation's sound knobs.
      const box=gr==='Sound'?(opts.append(d.parentElement),d):fold(opts,gr);boxes.set(gr,box);let grid=null;
      for(const c of [...list.filter(c=>c.type!=='range'),...list.filter(c=>c.type==='range')]){
        if(c.type!=='range'){box.append(chip(c));continue;}
        if(!grid){grid=el('div','knob-grid');box.append(grid);}
        const cur=n.props.opts[c.id]??c.value;
        grid.append(ui.knob({label:OPT_SHORT[c.label]||c.label,min:c.min,max:c.max,step:c.step,value:cur,def:c.def,property:'opt:'+c.id,modulated:graph().edges.some(e=>e.to===n.id&&e.input==='opt_'+c.id),...autoOpts(n,'opt:'+c.id),
          onInput:v=>live(()=>{const x=findNode(n.id);if(x)x.props.opts={...x.props.opts,[c.id]:v};}),onChange:()=>liveCommit('Emitter: '+c.label)}));
      }
    }
    if(!controls.length)opts.append(el('p','insp-note','This renderer has no extra options. Add Deformer or Color nodes after it.'));
    const forces=[...new Set(Object.values(moved).map(([t])=>t))];
    // Shortcuts to the Forces nodes that own a simulation's physics (the cloner's 3D nodes are already in its chain).
    if(forces.length&&!clonerLike){
      const fg='Forces',box=boxes.get(fg)||fold(opts,fg),chips=el('div','chips');chips.dataset.property='forces';
      for(const t of forces){
        const b=el('button','mbtn library-node',TYPES[t].label);b.type='button';b.dataset.type=t;b.title=TYPES[t].description;b.style.setProperty('--cat',catOf(t).color);
        b.onclick=()=>{const g=graph(),have=g.nodes.find(m=>m.type===t&&upstreamSim(g,m)&&chainFrom(g,n.id,m.id));if(have){selected=have.id;renderUI();}else addNode(t);};
        chips.append(b);
      }
      box.append(chips);
    }
    syncFolds();tipify();
  };
  if(e.status==='ready')fill();else{e.ready.then(()=>{if(opts.isConnected){opts.replaceChildren();fill();}});}
}
function renderLayerInspector(root,g){
  const head=el('div','insp-head'),h=el('h3');h.append(document.createTextNode(g.name));head.append(h,el('div','insp-desc','Layer settings. Select a node in the graph to edit it.'));root.append(head);
  const s=section(root,null),name=el('input');name.type='text';name.maxLength=80;name.value=g.name;name.dataset.property='layerName';
  name.onchange=()=>edit((p,l)=>{l.name=name.value.trim()||l.name;},'Renamed layer');s.append(ui.field('Name',name));
  s.append(ui.field('Visible',ui.toggle({value:g.visible,property:'layerVisible',onChange:v=>edit((p,l)=>{l.visible=v;},'Layer visibility')})));
  const grid=el('div','knob-grid');grid.append(ui.knob({label:'Opacity',min:0,max:100,step:1,value:Math.round(g.opacity*100),def:100,unit:'%',property:'layerOpacity',
    onInput:v=>live(()=>{graph().opacity=v/100;}),onChange:()=>liveCommit('Layer opacity')}));s.append(grid);
  const b=section(root,'Blend with layers below');b.append(ui.chips({options:LAYER_BLENDS.map(m=>[m,{'source-over':'Normal',screen:'Screen',lighter:'Add',multiply:'Multiply',difference:'Difference',overlay:'Overlay'}[m]]),value:g.blend,property:'layerBlend',onChange:v=>edit((p,l)=>{l.blend=v;},'Layer blend')}));
  section(root).append(el('p','insp-note','Tip: select a node, then click a Deformer, Color or Post FX node in the library to insert it right after.'));
  updateHint();
}
function updateHint(){const n=graph().nodes.find(n=>n.id===selected);$('selectionHint').textContent=n?`${TYPES[n.type].label} selected`:multi.size?`${multi.size} nodes selected`:`${graph().name}`;}
function renderLayers(){
  $('layers').replaceChildren();
  for(const g of state.layers){
    const tab=el('div','layer-tab'+(g.id===active?' active':''));tab.setAttribute('role','tab');tab.dataset.id=g.id;
    const vis=el('input','layer-vis');vis.type='checkbox';vis.checked=g.visible;vis.title='Show layer';vis.setAttribute('aria-label',`Show ${g.name}`);
    vis.onclick=e=>e.stopPropagation();vis.onchange=()=>edit(p=>{p.layers.find(l=>l.id===g.id).visible=vis.checked;},'Layer visibility');
    const name=el('span','layer-name',g.name),x=el('button','layer-x','×');x.type='button';x.title='Delete layer';x.hidden=state.layers.length===1;
    x.onclick=e=>{e.stopPropagation();edit(p=>{p.layers=p.layers.filter(l=>l.id!==g.id);},'Deleted layer');};
    tab.append(vis,name,x);tab.onclick=()=>{if(active!==g.id){active=g.id;selected=null;multi.clear();pending=null;renderUI();fit();}};
    $('layers').append(tab);
  }
  $('addLayer').disabled=state.layers.length>=LIMITS.layers||state.layers.flatMap(g=>g.nodes).filter(n=>isEngine(n.type)).length>=LIMITS.emitters;
}
function renderUI(){renderGraph();renderProperties();renderLayers();if(mapMode)renderMapPanel();renderOverlay();$('undo').disabled=!history.length;$('redo').disabled=!future.length;}

// ---------- templates ----------
function chain(name,specs,extra){
  const g={id:crypto.randomUUID(),name,visible:true,opacity:1,blend:'screen',nodes:[],edges:[]};let prev=null,x=40;
  for(const [type,props] of specs){
    const n=node(type,x,80,props);g.nodes.push(n);x+=210;
    if(prev){const out=Object.keys(TYPES[prev.type].outputs)[0],inp=Object.keys(TYPES[type].inputs)[0];g.edges.push({from:prev.id,out,to:n.id,input:inp});}
    prev=n;
  }
  extra?.(g);return g;
}
// Renderers without a Palette node downstream draw in grayscale.
const GRAY={_colorMode:'toneramp',_toneStops:['#00000000','#555555','#aaaaaa','#ffffff'],_simpleStops:['#555555','#aaaaaa','#ffffff']};
const TEMPLATES={};
for(const [name,layers] of SCENES)TEMPLATES[name]=()=>clone(layers);
// The original Audiograph's built-in presets: one renderer per original layer (carrying that layer's look),
// stacked by Merge nodes over the preset background, then the preset's Post FX as a chain of FX nodes.
const SOLID_MODELS=['knot','cube','torus'];
const FX_NODES=[['trails',['pfxTrails','pfxFeedback']],['kaleido',['pfxKaleido','pfxReflect']],['blur',['pfxBlurX','pfxBlurY','pfxBlurRadial','pfxFocal']],
  ['bloom',['pfxBloom','pfxEdgeGlow']],['grade',['pfxBrightness','pfxContrast','pfxSaturation','pfxHue','pfxInvert']],['lens',['pfxChroma','pfxVignette','pfxSharpen','pfxGrain','pfxScanlines']]];
const clampProp=(type,key,v)=>{const s=TYPES[type].props[key];return Math.max(s.min,Math.min(s.max,v));};
function presetGraph(P){
  const g={id:crypto.randomUUID(),name:P.name,visible:true,opacity:1,blend:'source-over',nodes:[],edges:[]};
  const add=(type,x,y,props={})=>{const n=node(type,x,y,props);g.nodes.push(n);return n;},wire=(a,out,b,input)=>g.edges.push({from:a.id,out,to:b.id,input});
  const sound=add('audioIn',40,80);let src=sound,x=260;
  if(P.eq){const eq={};for(const k of EQ_KEYS)if(P.eq[k]!==undefined)eq[k]=clampProp('spectrum',k,P.eq[k]);src=add('spectrum',x,80,eq);wire(sound,'audio',src,'audio');x+=220;}
  const bg=add('background',x,80,{fill:'flat',c1:/^#[0-9a-f]{6}$/i.test(P.bg)?P.bg.toLowerCase():'#0f0f12'});
  const response={};if(P.bass){response.punch=clampProp('waveform2d','punch',P.bass.punch??60);response.release=clampProp('waveform2d','release',P.bass.release??220);}
  if(P.dynamics!=null)response.dynamics=clampProp('waveform2d','dynamics',P.dynamics);
  const renderers=P.layers.map((l,i)=>{
    const look={...l.look};let type,mode=l.layout;
    if(mode==='object'){type='waveform3d';mode=SOLID_MODELS.includes(look._objModel)?look._objModel:'knot';}
    else type=Object.keys(MODES).find(t=>MODES[t].some(m=>m[0]===mode));
    if(!type)throw Error(`${P.name}: unsupported layout ${mode}`);
    const n=add(type,x,260+i*170,{mode,look,...geoFromLook(look),...response});wire(src,'audio',n,'audio');
    // The look's spin and symmetry become Spin / Symmetry / Mirror nodes after the renderer.
    let last=n;motionFromLook(look).forEach(([t,props],k)=>{const m=add(t,x+220*(k+1),260+i*170,props);wire(last,'shape',m,'shape');last=m;});
    return {n:last,steps:(last===n?0:g.nodes.indexOf(last)-g.nodes.indexOf(n)),opacity:(l.opacity??100)/100};
  });
  x+=230+220*Math.max(0,...renderers.map(r=>r.steps));
  // Merge chains: A carries what is below, B–D take the next renderers.
  let below=bg,y=80;
  for(let i=0;i<renderers.length;i+=3){
    const m=add('merge',x,y,{mode:'source-over'});wire(below,'image',m,'a');
    renderers.slice(i,i+3).forEach((r,k)=>{const port='bcd'[k];m.props[port]=r.opacity;wire(r.n,'shape',m,port);});
    below=m;x+=220;y+=60;
  }
  const fx=P.postFx||{};
  for(const [type,keys] of FX_NODES){
    if(!keys.some(k=>fx[k]))continue;
    const props={};for(const [k,s] of Object.entries(TYPES[type].props))if(s.key)props[k]=clampProp(type,k,fx[s.key]??0);
    const f=add(type,x,80,props);wire(below,'image',f,'image');below=f;x+=220;
  }
  const out=add('output',x,80);wire(below,'image',out,'image');
  return [g];
}
for(const P of ORIGINAL_PRESETS)TEMPLATES[P.name]=()=>presetGraph(P);
const ORIGINAL_NAMES=[...SCENES.map(([name])=>name),...ORIGINAL_PRESETS.map(P=>P.name)];
function loadTemplate(name){
  if(!Object.hasOwn(TEMPLATES,name))throw Error('Unknown template '+name);
  const layers=TEMPLATES[name]();layers.forEach((g,i)=>{if(i===0)g.blend='source-over';});
  importProject({format:'audiograph-pro',version:VERSION,layers,...(state.mapping?{mapping:state.mapping}:{})},`Template: ${name}`);
}

// ---------- record / fullscreen ----------
let recorder=null,chunks=[],recordStarting=false;
function changeResolution(height){
  if(recorder)throw Error('Stop recording before changing resolution');
  setRenderResolution(height);
  const temp=document.createElement('canvas'),ctx=temp.getContext('2d');
  const canvases=new Set([preview,program,fadeCv,...surfaces.values(),...mapped.values(),...layerImages.values()]);
  for(const s of nodeState.values())if(s.c instanceof HTMLCanvasElement)canvases.add(s.c);
  for(const c of canvases){
    temp.width=c.width;temp.height=c.height;ctx.drawImage(c,0,0);
    c.width=WIDTH;c.height=HEIGHT;c.getContext('2d').drawImage(temp,0,0,WIDTH,HEIGHT);
  }
  temp.width=temp.height=1;
  for(const e of engines.values())e.resize();
  $('engines').style.width=WIDTH+'px';$('engines').style.height=HEIGHT+'px';
  $('resolution').value=String(HEIGHT);overlayBox();renderOverlay();
  try{localStorage.setItem('agpro.resolution',String(HEIGHT));}catch(error){message('Resolution changed, but could not be saved: '+error.message,true);return;}
  message(`Output: ${WIDTH} × ${HEIGHT}`);
}
$('resolution').onchange=()=>{if(!attempt(()=>changeResolution(+$('resolution').value)))$('resolution').value=String(HEIGHT);};
async function toggleRecord(){
  if(recorder){recorder.stop();return;}
  if(recordStarting)return;
  recordStarting=true;
  try{if(audio.context?.state==='suspended')await audio.context.resume();}finally{recordStarting=false;}
  const stream=preview.captureStream(30);
  // An idle audio destination produces no samples, which can stall Chromium's entire video encoder.
  if(audio.dest&&(audio.source||audio.live))for(const t of audio.dest.stream.getAudioTracks())stream.addTrack(t);
  const type=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4'].find(t=>MediaRecorder.isTypeSupported(t));
  recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:12e6});chunks=[];
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  recorder.onstop=()=>{const blob=new Blob(chunks,{type:recorder.mimeType}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=`audiograph-pro-${Date.now()}.${type.includes('mp4')?'mp4':'webm'}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);recorder=null;$('resolution').disabled=false;clearInterval(recClock);$('record').classList.remove('on');$('record').setAttribute('aria-label','Record');message('Recording saved');};
  recorder.start(500);$('resolution').disabled=true;$('record').classList.add('on');$('record').setAttribute('aria-label','Stop recording');{const t0=performance.now(),tm=$('record').querySelector('.rec-time'),tick=()=>{const s=Math.floor((performance.now()-t0)/1000);tm.textContent=`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;};tick();clearInterval(recClock);recClock=setInterval(tick,500);}message('Recording… press Rec again to save');
}
function toggleFullscreen(){if(document.fullscreenElement)document.exitFullscreen();else $('previewWrap').requestFullscreen?.().catch(e=>message(e.message,true));}

// ---------- wiring ----------
// The source label opens the active layer's Audio node (adding one, wired to its emitters, if needed).
$('audioName').onclick=()=>{
  const a=graph().nodes.find(n=>n.type==='audioIn');if(a){selected=a.id;renderUI();return;}
  let id=null;edit((p,g)=>{const e=g.nodes.filter(n=>isEngine(n.type)),x=Math.min(...g.nodes.map(n=>n.x),40)-210,n=node('audioIn',x,e[0]?.y??70);g.nodes.push(n);id=n.id;
    for(const m of e)if(!g.edges.some(w=>w.to===m.id&&w.input==='audio'))g.edges.push({from:n.id,out:'audio',to:m.id,input:'audio'});},'Added Audio');
  if(id){selected=id;renderUI();}
};
$('play').onclick=()=>{
  if(!audio.buffer){setPaused(!paused);message(paused?'Paused':'Playing');return;}
  if(audio.source){stopAudio(true);setPaused(true);message('Paused');return;}
  setPaused(false);play().catch(e=>message(e.message,true));
};
syncPlay();
$('stop').onclick=()=>{stopAudio();stopLive();setPaused(true);updateAudioUI();message('Stopped');};
let recClock=0;
$('record').onclick=()=>toggleRecord().catch(e=>message('Recording: '+e.message,true));
// With a Corner pin selected, its corners can be dragged directly on the preview.
const PIN_KEYS=[['tlx','tly',0,0],['trx','try',100,0],['brx','bry',100,100],['blx','bly',0,100]];
function pinNode(){const n=graph().nodes.find(n=>n.id===selected);return n?.type==='cornerPin'?n:null;}
function previewPoint(ev){const r=preview.getBoundingClientRect();return [(ev.clientX-r.left)/r.width*100,(ev.clientY-r.top)/r.height*100];}
let pinDrag=null;
preview.addEventListener('pointerdown',ev=>{
  const n=pinNode();if(!n)return;const [x,y]=previewPoint(ev),r=preview.getBoundingClientRect();
  let best=-1,dist=Infinity;PIN_KEYS.forEach(([kx,ky,bx,by],i)=>{const d=Math.hypot((bx+n.props[kx]-x)*r.width/100,(by+n.props[ky]-y)*r.height/100);if(d<dist){dist=d;best=i;}});
  if(dist>40)return;pinDrag={id:n.id,i:best};preview.setPointerCapture(ev.pointerId);ev.preventDefault();
});
preview.addEventListener('pointermove',ev=>{
  const n=pinNode();preview.style.cursor=n?'crosshair':'';if(!pinDrag)return;
  const [x,y]=previewPoint(ev),[kx,ky,bx,by]=PIN_KEYS[pinDrag.i],c=v=>Math.round(Math.max(-50,Math.min(50,v))*2)/2;
  live(st=>{const m=st.layers.flatMap(g=>g.nodes).find(m=>m.id===pinDrag.id);if(m){m.props[kx]=c(x-bx);m.props[ky]=c(y-by);}});
});
const endPin=()=>{if(pinDrag){pinDrag=null;liveCommit('Moved corner');}};
preview.addEventListener('pointerup',endPin);preview.addEventListener('pointercancel',endPin);
// Viewport camera for the active layer. 3D: drag orbits, right / Shift-drag pans. 2D: drag pans. Wheel zooms, double-click resets.
const VIEW0={yaw:0,pit:0,px:0,py:0,zm:1};
const viewOff=()=>!!pinNode()||!!pinDrag||mapActive();
let viewDrag=null,wheelTimer=0;
function setView(fn){live(st=>{const g=st.layers.find(l=>l.id===graph().id);if(!g)return;const v={...VIEW0,...g.view};fn(v);const c=cleanView(v);if(c)g.view=c;else delete g.view;});}
preview.addEventListener('pointerdown',ev=>{
  if(viewOff()||ev.defaultPrevented)return;
  const g=graph(),three=layerView.has(g.id);
  viewDrag={x:ev.clientX,y:ev.clientY,v:{...VIEW0,...g.view},pan:!three||ev.button!==0||ev.shiftKey,moved:false};
  preview.setPointerCapture(ev.pointerId);$('previewWrap').classList.add(viewDrag.pan?'view-pan':'view-orbit');ev.preventDefault();
});
preview.addEventListener('pointermove',ev=>{
  const d=viewDrag;if(!d)return;const r=preview.getBoundingClientRect(),dx=ev.clientX-d.x,dy=ev.clientY-d.y;
  if(!d.moved&&Math.hypot(dx,dy)<2)return;d.moved=true;
  setView(v=>{if(d.pan){v.px=d.v.px+dx/r.width*2;v.py=d.v.py-dy/r.height*2;}else{v.yaw=d.v.yaw-dx*.4;v.pit=Math.max(-85,Math.min(85,d.v.pit+dy*.4));}});
});
const endView=()=>{const d=viewDrag;if(!d)return;viewDrag=null;$('previewWrap').classList.remove('view-pan','view-orbit');if(d.moved)liveCommit(d.pan?'Moved view':'Orbited view');};
preview.addEventListener('pointerup',endView);preview.addEventListener('pointercancel',endView);
preview.addEventListener('contextmenu',ev=>{if(!viewOff())ev.preventDefault();});
preview.addEventListener('wheel',ev=>{
  if(viewOff())return;ev.preventDefault();
  const r=preview.getBoundingClientRect(),u=(ev.clientX-r.left)/r.width*2-1,w=(ev.clientY-r.top)/r.height*2-1,flat=layerView.get(graph().id)!=='sim';
  setView(v=>{const z=Math.max(.2,Math.min(6,v.zm*Math.exp(-ev.deltaY*(ev.deltaMode?.05:.0015))));
    // 2D zooms toward the pointer; 3D dollies the camera.
    if(flat){v.px=u-z*(u-v.px)/v.zm;v.py=z*(w+v.py)/v.zm-w;}v.zm=z;});
  clearTimeout(wheelTimer);wheelTimer=setTimeout(()=>liveCommit('Zoomed view'),350);
},{passive:false});
preview.addEventListener('dblclick',()=>{if(viewOff()||!graph().view)return;setView(v=>Object.assign(v,VIEW0));liveCommit('Reset view');});

// Output window for a projector / second display: mirrors the preview as a live stream.
let outWin=null;
$('output').onclick=()=>{
  if(outWin&&!outWin.closed){outWin.focus();return;}
  outWin=window.open('','audiograph-pro-output','popup,width=960,height=540');
  if(!outWin)return message('Allow pop-ups to open the output window',true);
  const d=outWin.document;d.title='Audiograph Pro · Output';
  d.body.style.cssText='margin:0;background:#000;overflow:hidden;cursor:none';d.body.replaceChildren();
  const v=d.createElement('video');v.muted=true;v.autoplay=true;v.playsInline=true;v.style.cssText='width:100vw;height:100vh;object-fit:contain;display:block';
  v.srcObject=preview.captureStream(60);d.body.append(v);v.play().catch(()=>{});
  v.ondblclick=()=>d.fullscreenElement?d.exitFullscreen():d.documentElement.requestFullscreen().catch(()=>{});
  $('output').classList.add('on');
  outWin.addEventListener('pagehide',()=>{v.srcObject?.getTracks().forEach(t=>t.stop());outWin=null;$('output').classList.remove('on');});
  message('Output window open · move it to the projector and double-click for fullscreen');
};
addEventListener('pagehide',()=>{if(outWin&&!outWin.closed)outWin.close();});
$('snap').onclick=()=>preview.toBlob(blob=>{if(!blob)return message('Snapshot failed',true);const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=`audiograph-pro-${Date.now()}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);message('Snapshot saved');},'image/png');
$('fullscreen').onclick=toggleFullscreen;
$('undo').onclick=undo;$('redo').onclick=redo;$('addLayer').onclick=addLayer;
// User templates live in this browser; Save → Save as template adds one.
const USER_KEY='audiograph-pro-user-templates';
const userTemplates=()=>{try{return JSON.parse(localStorage.getItem(USER_KEY))||{};}catch{return {};}};
function fillTemplates(){
  const sel=$('templates');sel.replaceChildren(Object.assign(el('option','','Templates…'),{value:''}));
  for(const [label,names,pre] of [['User templates',Object.keys(userTemplates()),'user:'],['Audiograph presets',ORIGINAL_NAMES,'']]){
    if(!names.length)continue;
    const grp=el('optgroup');grp.label=label;for(const name of names){const o=el('option','',name);o.value=pre+name;grp.append(o);}sel.append(grp);}
}
fillTemplates();
$('templates').onchange=()=>{const v=$('templates').value;$('templates').value='';if(!v)return;
  if(v.startsWith('user:')){const name=v.slice(5),p=userTemplates()[name];attempt(()=>{if(!p)throw Error('Template '+name+' is gone');importProject(clone(p),'Loaded '+name);});}
  else attempt(()=>loadTemplate(v));};
function saveTemplate(){
  const all=userTemplates(),name=prompt('Template name',state.layers[0]?.name||'My template')?.trim();if(!name)return;
  if(all[name]&&!confirm(`Replace the template “${name}”?`))return;
  try{all[name]=validate(clone(state));localStorage.setItem(USER_KEY,JSON.stringify(all));}catch(error){return message('Template: '+error.message,true);}
  fillTemplates();message(`Saved template ${name}`);
}
function removeTemplate(){
  const all=userTemplates(),names=Object.keys(all);if(!names.length)return message('No user templates yet');
  const name=prompt('Remove which template?\n'+names.join('\n'),names[names.length-1])?.trim();if(!name)return;
  if(!all[name])return message('No template called '+name,true);
  delete all[name];localStorage.setItem(USER_KEY,JSON.stringify(all));fillTemplates();message(`Removed template ${name}`);
}
$('restore').onclick=()=>attempt(()=>{const raw=localStorage.getItem('audiograph-pro-v2')||localStorage.getItem('audiograph-pro-v1');if(!raw)throw Error('Nothing saved in this browser yet');importProject(JSON.parse(raw),'Restored saved project');});
// Scenes save as .ag files (the project JSON); every save asks where.
async function saveScene(){
  try{const text=JSON.stringify(validate(state),null,2),name=(state.layers[0]?.name||'scene').replace(/[^\w -]+/g,'').trim()||'scene';
    try{localStorage.setItem('audiograph-pro-v2',text);}catch{}message('Saved in this browser');
    if(window.showSaveFilePicker){
      const h=await showSaveFilePicker({suggestedName:name+'.ag',startIn:'desktop',types:[{description:'Audiograph scene',accept:{'application/json':['.ag']}}]});
      const w=await h.createWritable();await w.write(text);await w.close();message(`Saved ${h.name}`);return;}
    const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=el('a');a.href=url;a.download=name+'.ag';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message(`Saved ${name}.ag`);
  }catch(error){if(error.name!=='AbortError')message('Save: '+error.message,true);}
}
async function openScene(file){
  try{if(!file)return;if(file.size>1024*1024)throw Error('Scene file limit is 1 MB');importProject(JSON.parse(await file.text()),`Opened ${file.name}`);}
  catch(error){message('Open: '+(error instanceof SyntaxError?'not an Audiograph scene':error.message),true);}
}
$('save').onchange=()=>{const v=$('save').value;$('save').value='';({scene:saveScene,template:saveTemplate,remove:removeTemplate})[v]?.();};
$('import').onchange=async()=>{await openScene($('import').files[0]);$('import').value='';};
addEventListener('dragover',e=>{if([...e.dataTransfer.items].some(i=>i.kind==='file'))e.preventDefault();});
addEventListener('drop',e=>{const f=[...e.dataTransfer.files].find(f=>/\.(ag|json)$/i.test(f.name));if(f){e.preventDefault();openScene(f);}});
$('helpBody').innerHTML=`
<p class="help-credit">Made by Vladimir Petković<br><a href="https://www.vladimirpetkovic.com" target="_blank" rel="noopener">www.vladimirpetkovic.com</a></p>
<p>Audiograph Pro turns sound into moving images you build from nodes. Each node does one thing: bring something in, draw it, bend it, colour it, polish it. Wire them into a chain, end the chain in <b>Output</b>, and everything reacts to the music as it plays.</p>
<nav class="help-toc" aria-label="Guide contents"><a href="#h-start">Quick start</a><a href="#h-screen">The screen</a><a href="#h-graph">Nodes &amp; wires</a><a href="#h-library">The library</a><a href="#h-audio">Audio</a><a href="#h-drive">Driving knobs</a><a href="#h-layers">Layers</a><a href="#h-mapping">Mapping</a><a href="#h-auto">Autopilot</a><a href="#h-files">Saving &amp; output</a><a href="#h-keys">Keys</a></nav>
<h3 id="h-start">Quick start</h3>
<p>New here? Press <b>Tutorial</b> (top right) for the First Mile: it builds a scene with you node by node, then shows Mapping, Autopilot, recording and saving.</p>
<ol><li>Pick a look from <b>Templates</b> (top right): your own <b>User templates</b> or the <b>Audiograph presets</b>.</li>
<li>Click the source name in the transport bar (under the preview) to load a song, or use the Mic or System audio. A demo beat plays until you do.</li>
<li>Click any node in the graph and turn its knobs in the inspector on the right.</li>
<li>Select a node, then click something in the library on the left: it is inserted right after the selection.</li></ol>
<h3 id="h-screen">The screen</h3>
<p><b>Studio</b>, <b>Mapping</b> and <b>Autopilot</b> are the tabs at the top left; each has its own settings below it. The <b>preview</b> sits in the middle with the transport bar under it: play / pause (Space; it pauses the visuals too), stop, record to video, snapshot, the audio source, the live spectrum, fullscreen (F) and <b>Detach</b>. The <b>graph</b> is below the preview, the <b>inspector</b> on the right. Drag the gutters between panels to resize them; double-click a gutter to hide or show that panel.</p>
<p><b>Move the view</b> with the mouse over the preview; it moves the active layer. On a 3D layer (Cloner, 3D Object, splats) drag orbits the camera, right-drag or Shift-drag pans. On a 2D layer drag moves the picture. The wheel zooms (2D zooms toward the pointer), double-click resets. Every move is undoable and saved with the project.</p>
<h3 id="h-graph">Nodes &amp; wires</h3>
<p>Wires carry typed values, colour-coded on their ports: <span style="color:${PORT_COLORS.audio}">audio</span> (the sound), <span style="color:${PORT_COLORS.shape}">shape</span> (something that can still be bent and recoloured), <span style="color:${PORT_COLORS.image}">image</span> (finished pixels), <span style="color:${PORT_COLORS.number}">number</span> (a value that drives knobs), <span style="color:${PORT_COLORS.colors}">colors</span> (a palette) and <span style="color:${PORT_COLORS.object3d}">3D object</span>. A shape wired into an image input is rendered at that point; after that it is pixels. A typical chain is Audio → Waveform or Emitter → Deformers → Palette → Post FX → Output.</p>
<ul><li>Drag from an output port to an input port to connect. Click a wire to remove it.</li>
<li><b>Tab</b> over the graph searches every node and drops it at the cursor; over a wire it is inserted into the wire.</li>
<li>Drag empty space to pan, wheel or pinch to zoom, <b>Fit</b> frames everything.</li>
<li><b>Delete</b> removes the selected node and heals the chain. Press and hold a node's title (or Alt-drag) to pull it out of its chain.</li>
<li><b>Bypass</b> (⏻ on a node, or <b>B</b>) switches it off: its input passes straight through. <b>Preview</b> (◉, or <b>V</b>) shows just that node's picture in the viewport; V, Esc or Show output returns.</li>
<li>Each node shows a live thumbnail of what it outputs. Changes always fade in and out, never cut.</li></ul>
<h3 id="h-library">The library</h3>
<ul><li><b>Inputs</b>: Audio; media (Image, Video, Camera, Text, Gaussian Splat); data (Computer load, Clock, Mouse &amp; keys, Live data from the ISS, space weather, the ocean, weather, earthquakes or Wikipedia, MIDI). Live data also makes a palette: wire it into a Palette’s colors.</li>
<li><b>Waveforms</b>: audio-reactive 2D line patterns (Linear, Circle, Spiral, Phyllotaxis, Fractal, Harmonic, Math…).</li>
<li><b>Emitters</b>: classic Particles and native WebGPU simulations (Particles, Fluid, Smoke, Granular sand).</li>
<li><b>3D</b>: <b>3D Object</b> — every shape (Sphere, Cube, Cylinder… DNA, Terrain, and 3D model for your OBJ, GLB or glTF), drawn <b>Normal</b> (solid) or as a <b>Waveform</b> (lines); any of them plugs into the Cloner, the <b>Cloner</b> (repeats up to three objects in a grid, ring, spiral…), Effectors (Sound, Field, Random, Links) and Look (Material, Light, 3D camera). Chain effectors and look nodes after the Cloner.</li>
<li><b>Forces</b> push WebGPU simulations: Spin, Gravity, Drag, Swirl, Attract, Wind, Vorticity. Each shows only the knobs that matter for the simulation before it.</li>
<li><b>Deformers</b> bend shapes: Symmetry, Mirror, Twist, Bulge, Wave, Shear, Depth, Ripple, Webcam, plus Noise (Jitter, Disorder, Randomize, Turbulence, Flow field).</li>
<li><b>Color</b>: Palette (without one, shapes draw in grayscale; click its ramp to add a colour, click a stop to pick, drag it off to remove, the dot below turns on slow hue Auto), Hue shift, Color correct.</li>
<li><b>Post FX</b> work on images: Bloom, Blur, Lens, Kaleido, Trails, Fracture, Corner pin, Quick filter.</li>
<li><b>Controls</b> make numbers: Value, LFO, Map range, Smooth, Math, Amplify, Random. <b>Audio analysis</b>: Audio band, Beat, Audio EQ.</li>
<li><b>Composite</b>: Background, Blend, Merge, Mask, Feedback, Image transform, Layer and <b>Output</b>.</li></ul>
<h3 id="h-audio">Audio</h3>
<p>One sound source feeds the whole project: a file, the microphone or system audio (pick it in the Audio node or from the transport). Every Audio node hears it and gives an <span style="color:${PORT_COLORS.audio}">audio</span> wire plus numbers: level, bass, mids, high and beat. Put an <b>Audio EQ</b> in a wire to change what one emitter hears. Visual nodes have their own audio response (intensity, bass punch, release, dynamics); <b>Amplify</b> makes anything react harder.</p>
<h3 id="h-drive">Driving knobs</h3>
<p>Drag a <span style="color:${PORT_COLORS.number}">number</span> output (bass, beat, an LFO, the clock, your mouse, MIDI, computer load…) onto a node and pick the knob it should move: 0 keeps the knob's setting, 1 pushes it to the maximum. Wiring a number into an emitter's <b>drive</b> replaces the music for that emitter.</p>
<p>Knobs: drag around the knob (Shift for fine), double-click to type a value. The small dot in the centre switches a knob to <b>Auto</b>: it drifts by itself around its value.</p>
<h3 id="h-layers">Layers</h3>
<p>Each graph is one layer. <b>+ Layer</b> adds another; layers stack in the preview using each layer's opacity and blend mode (select empty graph space to see the layer settings). Use the tabs above the graph to switch layers and the checkbox to show or hide one. A <b>Layer</b> node brings another layer into this graph.</p>
<h3 id="h-mapping">Mapping</h3>
<p>Projection mapping onto walls and objects. Turn Mapping on, start from a layout (cube, triptych, corridor, curved wall…) or add surfaces, then drag their corners on the preview to fit what the projector hits. Each surface can show a crop of the picture or its own layer, with feathered edges. The test card helps line things up. <b>Detach</b> opens the mapped output in its own window for the projector; double-click it there for fullscreen. The mapping is saved with the project.</p><p><b>+ 3D object</b> uses a Cube, Sphere, Cylinder or Two walls, or loads OBJ / GLB / self-contained glTF. Choose UV, Front projection or Box content. Orbit, Tilt, Distance, Roll, lens-shift Pan and full-frame Focal length align the virtual projector (36 mm sensor width). Drag to orbit, Shift/right-drag to pan; wheel changes focal length, Shift-wheel distance. Wireframe and test card help alignment. Models stay in memory: reload the named file after reopening; a cube is shown until then. Models use metres (OBJ has no unit metadata); Object scale converts other units; Object up aligns native Z-up OBJ files.</p><p><b>Import camera…</b> accepts binary/ASCII FBX, text USDA and glTF/GLB perspective cameras, including parent transforms. Export binary USD as USDA. The first camera/clip is sampled at up to 30 fps (2000 samples maximum), saved with the project, and can Play/Hold, scrub, change Speed or sync to transport. FBX centimetres and USD stage units/up-axis convert to metres/Y-up; export model and camera in the same scene coordinates. Bake constraints, pivots and inverse USD operations before export.</p>
<h3 id="h-auto">Autopilot</h3>
<p>Turn Autopilot on and it follows the music like the original's Automation: at each section (breakdown, groove, build-up, drop), or every few seconds, it slowly crossfades to a new variation. <b>Changes</b>: Colours or Mood restyle your own layers; Everything runs its own stack of 1–3 layers that share a palette. Describing a look (“slow dreamy blue and gold spirals”) is optional and steers it; <b>Prompt match</b> sets how closely. Turn <b>Write</b> on and it writes its own descriptions. Next changes now; Hold keeps the current look.</p>
<h3 id="h-files">Saving &amp; output</h3>
<ul><li><b>Save → Save scene</b> (⌘S) writes an <b>.ag</b> file wherever you choose and keeps a copy in this browser. <b>Save as template</b> (⇧⌘S) adds the scene to <b>Templates → User templates</b> (kept in this browser). <b>Open</b> (⌘O) or drop an .ag file to load it. <b>Restore</b> brings back the browser copy. Media files are not stored: reload them in their input nodes.</li>
<li>Record (●) captures the preview with its audio to video; the camera button saves a PNG.</li>
<li>Older projects open automatically and are updated to the current nodes.</li></ul>
<h3 id="h-keys">Keys</h3>
<ul><li><kbd>Space</kbd> pause visuals · <kbd>F</kbd> fullscreen · <kbd>Tab</kbd> add node · <kbd>Delete</kbd> remove node</li>
<li><kbd>⌘Z</kbd> undo · <kbd>⇧⌘Z</kbd> redo</li>
<li>Drag on empty graph space to select several nodes (<kbd>Shift</kbd> adds, <kbd>⌘A</kbd> selects all) · <kbd>⌘C</kbd> / <kbd>⌘X</kbd> / <kbd>⌘V</kbd> copy, cut, paste · Alt-drag, middle-drag or two fingers pan</li>
<li>With several nodes selected, <b>Save as custom node</b> keeps the group in the <b>Custom</b> library (at the bottom); click it to add the whole group again.</li></ul>`;
$('helpButton').onclick=()=>$('help').showModal();
$('graphTips').onclick=()=>{const on=$('graphHint').classList.toggle('show');$('graphTips').setAttribute('aria-pressed',String(on));};$('closeHelp').onclick=()=>$('help').close();
const viewport=$('graphViewport');
viewport.ondragover=e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';};
viewport.addEventListener('pointermove',e=>{pointer.x=e.clientX;pointer.y=e.clientY;pointer.inGraph=true;});
viewport.addEventListener('pointerleave',()=>{pointer.inGraph=false;});
viewport.ondrop=e=>{e.preventDefault();let d;try{d=JSON.parse(e.dataTransfer.getData('application/audiograph-node'));}catch{return;}if(!Object.hasOwn(TYPES,d?.type))return;const r=viewport.getBoundingClientRect(),z=uiZ(),gx=((e.clientX-r.left)/z-view.x)/view.zoom,gy=((e.clientY-r.top)/z-view.y)/view.zoom;
  const w=wireAt(e.clientX,e.clientY);if(w){placeNode({type:d.type,label:TYPES[d.type].label,props:d.props||{}},gx,gy,{...w.dataset});return;}
  addNode(d.type,gx-84,gy-20,d.props||{});};
// Drag on empty graph space draws a selection box (Shift adds to the selection); middle-drag or Alt-drag pans.
viewport.onpointerdown=event=>{
  if(event.target.closest('.node')||event.target.closest('.wire')||event.button>1)return;
  viewport.focus();if(pending){pending=null;renderGraph();}
  if(event.button===0&&!event.altKey){event.preventDefault();window.getSelection()?.removeAllRanges();marquee(event);return;}
  event.preventDefault();
  const start={x:event.clientX,y:event.clientY,vx:view.x,vy:view.y};viewport.setPointerCapture(event.pointerId);viewport.classList.add('panning');
  const z=uiZ(),move=e=>{view.x=start.vx+(e.clientX-start.x)/z;view.y=start.vy+(e.clientY-start.y)/z;applyView();};
  const end=()=>{viewport.classList.remove('panning');viewport.removeEventListener('pointermove',move);viewport.removeEventListener('pointerup',end);viewport.removeEventListener('pointercancel',end);};
  viewport.addEventListener('pointermove',move);viewport.addEventListener('pointerup',end);viewport.addEventListener('pointercancel',end);
};
function marquee(event){
  const r=viewport.getBoundingClientRect(),z=uiZ(),loc=e=>[(e.clientX-r.left)/z,(e.clientY-r.top)/z],[x0,y0]=loc(event),keep=event.shiftKey?selIds():[];
  const box=el('div','marquee');viewport.append(box);viewport.setPointerCapture(event.pointerId);let moved=false;
  const hits=(x1,y1)=>{const a=(Math.min(x0,x1)-view.x)/view.zoom,b=(Math.min(y0,y1)-view.y)/view.zoom,c=(Math.max(x0,x1)-view.x)/view.zoom,d=(Math.max(y0,y1)-view.y)/view.zoom;
    return [...$('nodes').querySelectorAll('.node')].filter(nb=>{const x=nb.offsetLeft,y=nb.offsetTop;return x<c&&x+nb.offsetWidth>a&&y<d&&y+nb.offsetHeight>b;}).map(nb=>nb.dataset.id);};
  const move=e=>{const [x1,y1]=loc(e);if(!moved&&Math.hypot(x1-x0,y1-y0)<4)return;moved=true;
    Object.assign(box.style,{left:Math.min(x0,x1)+'px',top:Math.min(y0,y1)+'px',width:Math.abs(x1-x0)+'px',height:Math.abs(y1-y0)+'px'});
    const ids=new Set([...keep,...hits(x1,y1)]);document.querySelectorAll('#nodes .node').forEach(x=>x.classList.toggle('selected',ids.has(x.dataset.id)));};
  const end=e=>{box.remove();viewport.removeEventListener('pointermove',move);viewport.removeEventListener('pointerup',end);viewport.removeEventListener('pointercancel',end);
    const [x1,y1]=loc(e);setSelection(moved?[...keep,...hits(x1,y1)]:keep);};
  viewport.addEventListener('pointermove',move);viewport.addEventListener('pointerup',end);viewport.addEventListener('pointercancel',end);
}
function zoom(factor,cx=viewport.clientWidth/2,cy=viewport.clientHeight/2){const next=Math.max(.3,Math.min(1.8,view.zoom*factor)),ratio=next/view.zoom;view.x=cx-(cx-view.x)*ratio;view.y=cy-(cy-view.y)*ratio;view.zoom=next;applyView();}
// Trackpads (pixel deltas, no 120-step notches) pan with two fingers in any direction; pinch or ⌘-scroll zooms.
// A notched mouse wheel zooms, Shift + wheel pans sideways.
const isTrackpad=e=>e.deltaMode===0&&(e.deltaX!==0||!(e.wheelDeltaY&&e.wheelDeltaY%120===0));
viewport.addEventListener('wheel',e=>{e.preventDefault();const r=viewport.getBoundingClientRect();if(e.ctrlKey||e.metaKey||!isTrackpad(e)&&!e.shiftKey)zoom(e.ctrlKey?Math.exp(-e.deltaY*.01):e.deltaY<0?1.08:1/1.08,(e.clientX-r.left)/uiZ(),(e.clientY-r.top)/uiZ());else{view.x-=e.deltaX/uiZ();view.y-=e.deltaY/uiZ();applyView();}},{passive:false});
$('zoomIn').onclick=()=>zoom(1.15);$('zoomOut').onclick=()=>zoom(1/1.15);$('fit').onclick=fit;
$('previewExit').onclick=()=>{if(previewId)setPreview(previewId);};
document.addEventListener('keydown',e=>{
  if((e.metaKey||e.ctrlKey)&&!e.altKey&&/^[so]$/i.test(e.key)){e.preventDefault();if(e.key.toLowerCase()==='s')(e.shiftKey?saveTemplate:saveScene)();else $('import').click();return;}
  if(e.target.closest('input,textarea,select,[contenteditable]')||$('help').open)return;
  const k=e.key.toLowerCase();
  if(mapKey(e))return;
  if(e.key==='Tab'&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&(pointer.inGraph||e.target.closest?.('#graphViewport'))){e.preventDefault();openSearch();}
  else if((e.metaKey||e.ctrlKey)&&k==='z'){e.preventDefault();e.shiftKey?redo():undo();}
  else if((e.metaKey||e.ctrlKey)&&k==='y'){e.preventDefault();redo();}
  else if((e.metaKey||e.ctrlKey)&&k==='d'){e.preventDefault();duplicateSelected();}
  else if((e.metaKey||e.ctrlKey)&&(k==='c'||k==='x')&&!window.getSelection()?.toString()){if(copySel()){e.preventDefault();if(k==='x')removeSelected();}}
  else if((e.metaKey||e.ctrlKey)&&k==='v'&&clip){e.preventDefault();if(pointer.inGraph){const r=viewport.getBoundingClientRect(),z=uiZ();pasteNodes(clip,((pointer.x-r.left)/z-view.x)/view.zoom,((pointer.y-r.top)/z-view.y)/view.zoom);}else pasteNodes(clip);}
  else if((e.metaKey||e.ctrlKey)&&k==='a'&&(pointer.inGraph||e.target.closest?.('#graphViewport'))){e.preventDefault();setSelection(graph().nodes.map(n=>n.id));}
  else if(e.key==='Delete'||e.key==='Backspace'){if(selected||multi.size){e.preventDefault();removeSelected();}}
  else if(e.key==='Escape'){closeMenu();if(pending){pending=null;renderGraph();message('Connection cancelled');}else if(previewId)setPreview(previewId);}
  else if(k==='b'&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&selIds().length){e.preventDefault();toggleBypass(selIds());}
  else if(k==='v'&&!e.metaKey&&!e.ctrlKey&&!e.altKey){const n=graph().nodes.find(m=>m.id===selected);if(previewId&&(!n||n.id===previewId))setPreview(previewId);else if(canPreview(n))setPreview(n.id);}
  else if(e.key===' '&&!e.target.closest('button')){e.preventDefault();$('play').click();}
  else if(k==='f'&&!e.metaKey&&!e.ctrlKey){toggleFullscreen();}
});
window.addEventListener('resize',()=>requestAnimationFrame(renderWires));
window.addEventListener('pagehide',event=>{
  pageHidden=true;for(const engine of engines.values())engine.dispose();engines.clear();stopAudio();stopLive();
  if(audio.context){const c=audio.context;if(event.persisted)c.suspend().catch(()=>{});else{audio.context=null;c.close().catch(()=>{});}}
});
window.addEventListener('pageshow',()=>{pageHidden=false;lastTime=0;renderUI();if(paused)draw(elapsed);});
setInterval(()=>{
  // Live readout for the selected control node.
  const v=document.querySelector('.live-value');if(!v)return;const n=findNode(v.dataset.node);if(!n)return;
  if(DATA_INPUTS.has(n.type)){
    const o=lastOuts.get(n.id);v.replaceChildren();
    if(!o){v.textContent='Not running yet';return;}
    for(const k of Object.keys(TYPES[n.type].outputs)){
      if(Array.isArray(o[k])){const row=el('div','meter swatches');row.append(el('span','',k));for(const c of o[k]){const sw=el('i');sw.style.background=c;row.append(sw);}v.append(row);continue;}
      const row=el('div','meter'),bar=el('i');bar.style.width=(Math.max(0,Math.min(1,o[k]??0))*100).toFixed(1)+'%';row.append(el('span','',k),el('b'),el('em','',(o[k]??0).toFixed(2)));row.children[1].append(bar);v.append(row);}
    const st=document.querySelector('#properties .data-status');if(st&&n.type==='computer')st.textContent=sensors.computerStatus(n.props);
    if(st&&n.type==='liveData')st.textContent=liveStatus(n.props);
    if(st&&n.type==='midi'){const m=sensors.midiInfo();st.textContent=m.error||(m.connected?(m.devices.length?'Connected: '+m.devices.join(', '):'Connected, but no MIDI devices are plugged in.'):'Not connected.');}
    return;
  }
  const out=lastValues.get(n.id);v.textContent=out!==undefined?`Now: ${out.toFixed(3)}`:'Not connected to an Output yet';
},200);
// ---------- resizable panels ----------
// Drag a border to resize the library, properties or the preview / graph split; drag it nearly shut (or
// double-click it) to hide that panel, and double-click the slim bar to bring it back. Sizes persist.
const LAYOUT_KEY='agpro.layout',studio=document.querySelector('.studio'),stage=document.querySelector('.stage');
const PANES={library:{min:150,max:520,def:236},inspector:{min:220,max:640,def:300}};
let layout={library:236,inspector:300,preview:55,hidden:{}};
try{layout={...layout,...JSON.parse(localStorage.getItem(LAYOUT_KEY)||'{}')};layout.hidden={...(layout.hidden||{})};}catch{}
function applyLayout(save=true){
  for(const [k,c] of Object.entries(PANES)){layout[k]=Math.max(c.min,Math.min(c.max,+layout[k]||c.def));studio.style.setProperty(k==='library'?'--lib-w':'--insp-w',layout.hidden[k]?'0px':layout[k]+'px');studio.classList.toggle('no-'+k,!!layout.hidden[k]);}
  layout.preview=Math.max(12,Math.min(88,+layout.preview||55));stage.style.setProperty('--prev-flex',layout.preview);stage.classList.toggle('no-preview',!!layout.hidden.preview);
  if(save)try{localStorage.setItem(LAYOUT_KEY,JSON.stringify(layout));}catch{}
  requestAnimationFrame(renderWires);
}
function togglePane(k){layout.hidden[k]=!layout.hidden[k];applyLayout();}
for(const g of document.querySelectorAll('.gutter')){
  const k=g.dataset.resize;
  g.ondblclick=()=>togglePane(k);
  g.onpointerdown=e=>{
    if(e.button!==0)return;e.preventDefault();g.setPointerCapture(e.pointerId);g.classList.add('active');document.body.classList.add('resizing');
    const sr=studio.getBoundingClientRect(),st=stage.getBoundingClientRect();
    const move=ev=>{
      if(k==='preview'){
        const y=ev.clientY-st.top,pct=y/st.height*100;
        if(pct<8){layout.hidden.preview=true;}else{layout.hidden.preview=false;layout.preview=pct;}
      }else{
        const w=(k==='library'?ev.clientX-sr.left:sr.right-ev.clientX)/uiZ();
        if(w<PANES[k].min*.5)layout.hidden[k]=true;else{layout.hidden[k]=false;layout[k]=w;}
      }
      applyLayout(false);
    };
    const end=()=>{g.classList.remove('active');document.body.classList.remove('resizing');g.removeEventListener('pointermove',move);g.removeEventListener('pointerup',end);g.removeEventListener('pointercancel',end);applyLayout();};
    g.addEventListener('pointermove',move);g.addEventListener('pointerup',end);g.addEventListener('pointercancel',end);
  };
}
applyLayout(false);
new ResizeObserver(()=>renderWires()).observe($('graphViewport'));
// ---------- projection mapping ----------
// Map mode swaps the library for the mapping panel and shows draggable surfaces over the preview. The handles are
// DOM (not drawn into the picture), so the Detach window only ever gets the clean mapped output.
let mapTime=0,mapMode=false,mapSel=null,mapPt=-1,mapDrag=null,mapSnap=localStorage.getItem('agpro.mapSnap')!=='0',mapSnapAt=null;
// Snap: a dragged point (or a moved surface's nearest point) sticks to points of other surfaces and to the frame corners within 12 px. Hold Alt to drag freely.
function snapTargets(m,skip){const t=[[0,0],[1,0],[1,1],[0,1]];for(const s of m.surfaces)if(s.kind!=='3d'&&s.id!==skip)t.push(...s.pts);return t;}
function snapPoint(p,targets,r){let best=12,hit=null;for(const q of targets){const d=Math.hypot((q[0]-p[0])*r.width,(q[1]-p[1])*r.height);if(d<best){best=d;hit=q;}}return hit;}
const overlay=$('mapOverlay'),SVGNS='http://www.w3.org/2000/svg';
const curMap=()=>state.mapping||{on:false,test:false,surfaces:[]};
const selSurface=()=>curMap().surfaces.find(s=>s.id===mapSel)||null;
function mapEdit(fn,label){return edit(p=>{p.mapping=p.mapping?clone(p.mapping):{on:true,test:false,surfaces:[]};fn(p.mapping);},label);}
// Workspaces: Studio (library, graph, properties), Mapping and Autopilot (their panel and the picture only).
let workspace='studio';
function setWorkspace(w){
  workspace=w;mapMode=w==='map';const auto=w==='auto';
  studio.classList.toggle('map-mode',mapMode);studio.classList.toggle('auto-mode',auto);$('mapPanel').hidden=!mapMode;$('autoPanel').hidden=!auto;overlay.toggleAttribute('hidden',!mapMode);
  for(const [id,on] of [['modeStudio',w==='studio'],['modeMap',mapMode],['modeAuto',auto]]){$(id).classList.toggle('on',on);$(id).setAttribute('aria-selected',String(on));}
  if((mapMode||auto)&&layout.hidden.library){layout.hidden.library=false;applyLayout();}
  if(mapMode){if(!mapSel)mapSel=curMap().surfaces[0]?.id||null;renderMapPanel();}
  if(auto)renderAutoPanel();
  for(const k of ['studio','map','auto'])document.body.classList.toggle('ws-'+k,w===k);
  if(w==='studio')applyLayout(false);
  renderOverlay();message(mapMode?'Mapping':auto?'Autopilot':'Studio');
}
document.body.classList.add('ws-studio');
function setMapMode(on){setWorkspace(on?'map':'studio');}
$('modeStudio').onclick=()=>setWorkspace('studio');$('modeMap').onclick=()=>setWorkspace('map');$('modeAuto').onclick=()=>setWorkspace('auto');
function newSurfaceId(m){let i=m.surfaces.length+1;while(m.surfaces.some(s=>s.id==='s'+i))i++;return 's'+i;}
// Mapping panel: collapsible categories like the Studio library — Scene, Surface, Projection, Camera.
const MAP_CATS={scene:['Scene','#71f4d3'],surface:['Surface','#7199f4'],projection:['Projection','#c471f4'],camera:['Camera','#f4717f']};
function mapCat(root,id,title){const [label,color]=MAP_CATS[id],{root:pr,body}=ui.panel({id:'map.'+id,title:title||label,color});pr.dataset.mapCat=id;root.append(pr);return body;}
function sub(body,label){const x=el('div','map-sub');if(label)x.append(el('div','insp-sublabel',label));body.append(x);return x;}
function renderMapPanel(){
  const root=$('mapPanel');if(!root||!mapMode)return;root.replaceChildren();
  const m=curMap(),s=selSurface();
  // Scene: mapping switches, the layers it draws from, and the surfaces.
  const scene=mapCat(root,'scene'),out=sub(scene,'Output');
  out.append(ui.field('Mapping',ui.toggle({value:m.on,labels:['On','Off'],property:'mapOn',onChange:v=>mapEdit(x=>{x.on=v;if(v&&!x.surfaces.length){x.surfaces=mapping.PRESETS['Single screen']();mapSel=x.surfaces[0].id;}},v?'Mapping on':'Mapping off')})));
  out.append(ui.field('Test card',ui.toggle({value:m.test,labels:['Show','Hide'],property:'mapTest',onChange:v=>mapEdit(x=>{x.test=v;if(v&&!x.surfaces.length){x.surfaces=mapping.PRESETS['Single screen']();mapSel=x.surfaces[0].id;}},v?'Test card on':'Test card off')})));
  const pre=el('select');pre.dataset.property='mapPreset';pre.append(new Option('Start from a layout…',''));for(const k of Object.keys(mapping.PRESETS))pre.append(new Option(k,k));
  pre.onchange=()=>{const k=pre.value;if(!k)return;mapEdit(x=>{x.surfaces=mapping.PRESETS[k]();x.on=true;mapSel=x.surfaces[0].id;mapPt=-1;},'Mapping layout: '+k);};
  out.append(ui.field('Layout',pre));
  out.append(ui.field('Snap',ui.toggle({value:mapSnap,labels:['On','Off'],property:'mapSnap',onChange:v=>{mapSnap=v;localStorage.setItem('agpro.mapSnap',v?'1':'0');message(v?'Snap on: points stick to other surfaces (hold Alt to drag freely)':'Snap off');}})));
  const lay=sub(scene,`Layers (${state.layers.filter(g=>g.visible).length}/${state.layers.length} on)`),ll=el('div','surf-list');lay.append(ll);
  state.layers.forEach((g,i)=>{
    const row=el('label','surf-row layer-row'+(g.visible?'':' off'));row.dataset.layer=g.id;
    const vis=el('input');vis.type='checkbox';vis.checked=g.visible;vis.dataset.property='mapLayerVisible';vis.setAttribute('aria-label',`Show ${g.name}`);
    vis.onchange=()=>edit(p=>{p.layers.find(l=>l.id===g.id).visible=vis.checked;},'Layer visibility');
    const used=m.surfaces.filter(x=>x.source==='all'||x.source===i+1).length;
    row.append(vis,el('span','n',`${i+1}. ${g.name}`),el('span','src',used?`${used} surface${used>1?'s':''}`:'unmapped'));ll.append(row);
  });
  const ls=sub(scene,`Surfaces (${m.surfaces.length}/${mapping.MAX_SURFACES})`),list=el('div','surf-list');
  m.surfaces.forEach((x,i)=>{
    const row=el('div','surf-row'+(x.id===mapSel?' sel':''));row.dataset.surface=x.id;
    const del=el('button','','×');del.type='button';del.title='Delete surface';del.onclick=e=>{e.stopPropagation();mapEdit(mm=>{mm.surfaces=mm.surfaces.filter(y=>y.id!==x.id);},'Deleted surface');};
    row.append(el('span','n',`${i+1}. ${x.name}`),el('span','src',(x.kind==='3d'?'3D · ':'')+(x.source==='all'?'All':'Layer '+x.source)),del);
    row.onclick=()=>{mapSel=x.id;mapPt=-1;renderMapPanel();renderOverlay();};list.append(row);
  });
  ls.append(list);
  const acts=el('div','map-actions');ls.append(acts);
  const btn=(label,title,fn,dis=false)=>{const b=el('button','mbtn',label);b.type='button';b.title=title;b.disabled=dis;b.onclick=fn;acts.append(b);return b;};
  btn('+ Surface','Add a surface',()=>mapEdit(x=>{const id=newSurfaceId(x),k=x.surfaces.length*.04;x.surfaces.push(mapping.surface(id,'Surface '+(x.surfaces.length+1),[[.2+k,.2+k],[.8+k,.2+k],[.8+k,.8+k],[.2+k,.8+k]]));x.on=true;mapSel=id;mapPt=-1;},'Added surface'),m.surfaces.length>=mapping.MAX_SURFACES).dataset.property='mapAdd';
  btn('+ 3D object','Add a 3D projection surface',()=>mapEdit(x=>{const id=newSurfaceId(x);x.surfaces.push(map3d.surface3d(id));x.on=true;mapSel=id;mapPt=-1;},'Added 3D surface'),m.surfaces.length>=mapping.MAX_SURFACES).dataset.property='mapAdd3d';
  if(s)btn('Duplicate','Copy the selected surface',()=>mapEdit(x=>{const id=newSurfaceId(x),c=clone(s);c.id=id;c.name=s.name+' copy';if(c.kind!=='3d')c.pts=c.pts.map(([a,b])=>[a+.03,b+.03]);x.surfaces.push(c);mapSel=id;},'Duplicated surface'),m.surfaces.length>=mapping.MAX_SURFACES);
  if(!s)return;
  // Surface: what the selected surface is and what it shows.
  const upd=(fn,label)=>mapEdit(x=>{const t=x.surfaces.find(y=>y.id===s.id);if(t)fn(t);},label);
  const liveSurf=fn=>{live(st=>{const t=st.mapping?.surfaces.find(y=>y.id===s.id);if(t)fn(t);});renderOverlay();};
  const ss=mapCat(root,'surface','Surface · '+s.name),info=sub(ss);
  const name=el('input');name.type='text';name.maxLength=40;name.value=s.name;name.dataset.property='surfName';name.onchange=()=>upd(t=>{t.name=name.value.trim()||t.name;},'Renamed surface');info.append(ui.field('Name',name));
  const src=el('select');src.dataset.property='surfSource';src.append(new Option('All layers','all'));state.layers.forEach((g,i)=>src.append(new Option(`Layer ${i+1} · ${g.name}`,String(i+1))));src.value=String(s.source);
  src.onchange=()=>upd(t=>{t.source=src.value==='all'?'all':+src.value;},'Surface source');info.append(ui.field('Shows',src));
  if(s.kind==='3d'){renderMap3d(root,ss,info,s,upd,liveSurf);return;}
  const grid=el('select');grid.dataset.property='surfGrid';for(const [c,r,l] of [[1,1,'Flat · 4 corners'],[2,1,'Bend sideways · 2×1'],[2,2,'Curved · 3×3 points'],[3,2,'Curved · 4×3 points'],[3,3,'Curved · 4×4 points'],[4,4,'Fine · 5×5 points']])grid.append(new Option(l,c+'x'+r));
  grid.append(new Option('Cube cap · wrap sides','cap'));
  grid.value=s.wrap==='cap'?'cap':s.cols+'x'+s.rows;if(!grid.value){grid.append(new Option(`${s.cols}×${s.rows}`,s.cols+'x'+s.rows));grid.value=s.cols+'x'+s.rows;}
  grid.onchange=()=>{const cap=grid.value==='cap',[c,r]=cap?[1,1]:grid.value.split('x').map(Number);mapPt=-1;upd(t=>{Object.assign(t,mapping.regrid(t,c,r));if(cap)t.wrap='cap';},'Surface grid');};
  const shape=sub(ss,'Shape');shape.append(ui.field('Warp',grid));
  shape.append(ui.field('Mask',ui.chips({options:[['rect','Rectangle'],['ellipse','Ellipse']],value:s.mask,property:'surfMask',onChange:v=>upd(t=>{t.mask=v;},'Surface mask')})));
  const kn=el('div','knob-grid');
  kn.append(ui.knob({label:'Opacity',min:0,max:100,step:1,value:Math.round(s.opacity*100),def:100,unit:'%',property:'surfOpacity',onInput:v=>liveSurf(t=>{t.opacity=v/100;}),onChange:()=>liveCommit('Surface opacity')}));
  kn.append(ui.knob({label:'Feather',min:0,max:50,step:1,value:Math.round(s.feather*100),def:0,unit:'%',property:'surfFeather',onInput:v=>liveSurf(t=>{t.feather=v/100;}),onChange:()=>liveCommit('Surface feather')}));
  shape.append(kn);
  const sa=el('div','map-actions');shape.append(sa);
  const sb=(label,title,fn,parent=sa)=>{const b=el('button','mbtn',label);b.type='button';b.title=title;b.onclick=fn;parent.append(b);};
  sb('Full frame','Stretch the surface over the whole output',()=>upd(t=>{t.wrap='flat';t.pts=mapping.gridPoints(t.cols,t.rows);},'Surface full frame'));
  sb('Flatten','Remove the curve, keep the four corners',()=>upd(t=>{t.pts=mapping.gridPoints(t.cols,t.rows,mapping.corners(t));},'Surface flattened'));
  sb('Flip ↔','Mirror the surface left to right',()=>upd(t=>{const w=t.cols+1;t.pts=t.pts.map((_,k)=>t.pts[Math.floor(k/w)*w+(t.cols-k%w)]);},'Surface flipped'));
  // Projection: which part of the picture lands on the quad.
  const pj=mapCat(root,'projection'),cs=sub(pj,'Crop'),ck=el('div','knob-grid');
  ['Left','Top','Right','Bottom'].forEach((l,i)=>ck.append(ui.knob({label:l,min:0,max:100,step:1,value:Math.round(s.crop[i]*100),def:i<2?0:100,unit:'%',property:'surfCrop'+l,
    onInput:v=>liveSurf(t=>{const c=[...t.crop];c[i]=v/100;if(i<2)c[i]=Math.min(c[i],c[i+2]-.02);else c[i]=Math.max(c[i],c[i-2]+.02);t.crop=c;}),onChange:()=>liveCommit('Surface crop')})));
  cs.append(ck);const ca=el('div','map-actions');cs.append(ca);
  sb('Match crop','Place the surface exactly where its crop sits in the picture (no warp)',()=>upd(t=>{const [l,tp,r,b]=t.crop;t.wrap='flat';t.pts=mapping.gridPoints(t.cols,t.rows,[[l,tp],[r,tp],[r,b],[l,b]]);},'Surface matches crop'),ca);
}
function renderMap3d(root,ss,info,s,upd,liveSurf){
  const select=(parent,label,key,options)=>{const e=el('select');e.dataset.property='surf3d'+key;for(const [v,l] of options)e.append(new Option(l,v));e.value=s[key];e.onchange=()=>upd(t=>{if(key==='upAxis'&&t.upAxis!==e.value){const [x,y,z]=t.camera.target;t.camera.target=e.value==='Z'?[x,z,-y]:[x,-z,y];}t[key]=e.value;if(key==='primitive'){t.model='';t.modelKey='';t.camera.target=[0,0,0];t.camera.distance=6;t.scale=1;t.upAxis='Y';t.trackOn=false;}},label);parent.append(ui.field(label,e));};
  const file=(label,accept,property,load,parent)=>{const b=el('button','mbtn',label);b.dataset.property=property;b.onclick=()=>{const f=el('input');f.type='file';f.accept=accept;f.onchange=async()=>{if(!f.files[0])return;try{await load(f.files[0]);}catch(e){message(e.message,true);}};f.click();};parent.append(b);};
  const knob=(parent,label,key,min,max,step,def,unit,get,set,commit)=>parent.append(ui.knob({label,min,max,step,def,unit,value:get(),property:'surf3d'+key,onInput:v=>liveSurf(t=>set(t,v)),onChange:()=>liveCommit(commit||label)}));
  const obj=sub(ss,'Object');
  select(obj,'Object','primitive',map3d.PRIMITIVES.map(v=>[v,v]));select(obj,'Object up','upAxis',[['Y','Y-up'],['Z','Z-up (OBJ)']]);
  file(s.model?(map3d.hasModel(s)?s.model:'Load model… · '+s.model):'Load model…','.obj,.glb,.gltf','mapLoadModel',async f=>{const m=await map3d.loadModel(f);upd(t=>{t.model=m.model;t.modelKey=m.modelKey;t.scale=1;t.upAxis='Y';t.camera.target=m.target;t.camera.distance=m.distance;},'Loaded mapping model');},obj);
  obj.append(ui.field('Wireframe',ui.toggle({value:s.wire,labels:['On','Off'],property:'surf3dWire',onChange:v=>upd(t=>{t.wire=v;},'Mapping wireframe')})));
  const ok=el('div','knob-grid');obj.append(ok);
  ok.append(ui.knob({label:'Opacity',min:0,max:100,step:1,def:100,value:s.opacity*100,unit:'%',property:'surfOpacity',onInput:v=>liveSurf(t=>{t.opacity=v/100;}),onChange:()=>liveCommit('Surface opacity')}));
  knob(ok,'Model units','scale',.001,Math.max(10,s.scale*2),.001,1,'',()=>s.scale,(t,v)=>{t.scale=v;},'Model units');
  // Animation: animated glTF characters play their clip, synced to the transport.
  const clips=map3d.modelClips(s);
  if(clips.length){const an=sub(ss,'Animation');
    an.append(ui.field('Playback',ui.toggle({value:s.anim.on,labels:['Play','Rest pose'],property:'surf3dAnim',onChange:v=>upd(t=>{t.anim.on=v;},v?'Animation on':'Rest pose')})));
    if(clips.length>1){const c=el('select');c.dataset.property='surf3dClip';clips.forEach((x,i)=>c.append(new Option(`${i+1}. ${x.name} · ${x.duration.toFixed(1)} s`,String(i))));c.value=String(Math.min(s.anim.clip,clips.length-1));c.onchange=()=>upd(t=>{t.anim.clip=+c.value;},'Animation clip');an.append(ui.field('Clip',c));}
    const ak=el('div','knob-grid');an.append(ak);knob(ak,'Speed','AnimSpeed',.05,4,.05,1,'×',()=>s.anim.speed,(t,v)=>{t.anim.speed=v;},'Animation speed');}
  // Transform: line the virtual object up with the real one.
  const tr=sub(ss,'Transform'),tm=el('div','knob-grid'),trk=el('div','knob-grid'),tsk=el('div','knob-grid');tr.append(el('div','insp-sublabel minor','Move'),tm,el('div','insp-sublabel minor','Rotate'),trk,tsk);
  for(const a of ['x','y','z'])knob(tm,a.toUpperCase(),'Move'+a.toUpperCase(),-2,2,.001,0,'',()=>s.xf[a],(t,v)=>{t.xf[a]=v;},'Object move');
  for(const a of ['x','y','z'])knob(trk,a.toUpperCase(),'Rot'+a.toUpperCase(),-180,180,.1,0,'°',()=>s.xf['r'+a],(t,v)=>{t.xf['r'+a]=v;},'Object rotate');
  knob(tsk,'Scale','Scale3',.01,10,.001,1,'×',()=>s.xf.scale,(t,v)=>{t.xf.scale=v;},'Object scale');
  const ta=el('div','map-actions');tr.append(ta);const tb=el('button','mbtn','Reset transform');tb.type='button';tb.dataset.property='surf3dXfReset';tb.onclick=()=>upd(t=>{t.xf={x:0,y:0,z:0,rx:0,ry:0,rz:0,scale:1};},'Reset object transform');ta.append(tb);
  // Lattice: bend the model to match the real object; drag its points in the view.
  const lt=sub(ss,'Lattice');
  lt.append(ui.field('Points',ui.chips({options:map3d.LATTICE_RES.map(n=>[String(n),n?`${n}³`:'Off']),value:String(s.lattice.res),property:'surf3dLattice',onChange:v=>upd(t=>{t.lattice=map3d.cleanLattice({res:+v});},+v?`Lattice ${v}×${v}×${v}`:'Lattice off')})));
  if(s.lattice.res){lt.append(el('p','insp-note','Drag the yellow points in the view. Drag empty space to orbit the projector as usual.'));const la=el('div','map-actions');lt.append(la);
    const lb=el('button','mbtn','Reset lattice');lb.type='button';lb.dataset.property='surf3dLatticeReset';lb.disabled=s.lattice.d.every(v=>!v);lb.onclick=()=>upd(t=>{t.lattice=map3d.cleanLattice({res:t.lattice.res});},'Reset lattice');la.append(lb);}
  // Projection: how the picture wraps the object, and where the projection box sits.
  const pj=mapCat(root,'projection'),how=sub(pj);
  select(how,'Content','projection',[['uv','UV (fallback planar)'],['front','Front projection'],['box','Box']]);
  const hk=el('div','knob-grid');how.append(hk);
  knob(hk,'Tiling','Tile',.1,20,.01,1,'×',()=>s.tile,(t,v)=>{t.tile=v;},'Mapping tiling');
  if(s.projection==='box'){
    knob(hk,'Box fade','Fade',0,100,1,50,'%',()=>s.fade*100,(t,v)=>{t.fade=v/100;},'Box projection fade');
    const bx=sub(pj,'Box transform'),mk=el('div','knob-grid'),rk=el('div','knob-grid'),sk=el('div','knob-grid');bx.append(el('div','insp-sublabel minor','Move'),mk,el('div','insp-sublabel minor','Rotate'),rk,sk);
    for(const a of ['x','y','z'])knob(mk,a.toUpperCase(),'BoxMove'+a.toUpperCase(),-2,2,.001,0,'',()=>s.box[a],(t,v)=>{t.box[a]=v;},'Box move');
    for(const a of ['x','y','z'])knob(rk,a.toUpperCase(),'BoxRot'+a.toUpperCase(),-180,180,.1,0,'°',()=>s.box['r'+a],(t,v)=>{t.box['r'+a]=v;},'Box rotate');
    knob(sk,'Scale','BoxScale',.05,20,.01,1,'×',()=>s.box.scale,(t,v)=>{t.box.scale=v;},'Box scale');
    const ra=el('div','map-actions');bx.append(ra);const rb=el('button','mbtn','Reset box');rb.type='button';rb.dataset.property='surf3dBoxReset';rb.onclick=()=>upd(t=>{t.box={x:0,y:0,z:0,rx:0,ry:0,rz:0,scale:1};},'Reset box projection');ra.append(rb);
  }
  // Camera: the projector's viewpoint, manual or imported.
  const cam=mapCat(root,'camera'),pose=sub(cam),kn=el('div','knob-grid');pose.append(kn);
  for(const [key,label,min,max,step,def,unit] of [['yaw','Orbit',-180,180,.1,30,'°'],['pitch','Tilt',-89,89,.1,20,'°'],['distance','Distance',.01,Math.max(30,s.camera.distance*2),.01,6,''],['roll','Roll',-180,180,.1,0,'°'],['panX','Pan X',-2,2,.001,0,''],['panY','Pan Y',-2,2,.001,0,''],['focal','Focal length',10,200,.1,35,'mm']])
    knob(kn,label,key,min,max,step,def,unit,()=>s.camera[key],(t,v)=>{t.camera[key]=v;if(!['panX','panY'].includes(key))t.trackOn=false;},'Projector '+label);
  const ia=el('div','map-actions');pose.append(ia);
  file('Import camera…','.fbx,.usda,.usd,.usdc,.usdz,.glb,.gltf','mapImportCamera',async f=>{const track=await parseCamera(await f.arrayBuffer(),f.name);upd(t=>{t.track=track;t.trackOn=true;t.playing=true;t.hold=0;t.offset=0;},'Imported camera');},ia);
  if(s.track){const clip=sub(cam,s.track.name);clip.append(ui.field('Camera',ui.toggle({value:s.trackOn,labels:['Imported','Manual'],property:'mapTrackOn',onChange:v=>upd(t=>{t.trackOn=v;},'Camera mode')})),ui.field('Playback',ui.toggle({value:s.playing,labels:['Play','Hold'],property:'mapTrackPlay',onChange:v=>upd(t=>{const clock=s.sync?elapsed:performance.now()/1000;if(!v)t.hold=((clock*s.speed+s.offset)%(s.track.duration||1)+(s.track.duration||1))%(s.track.duration||1);else t.offset=t.hold-clock*s.speed;t.playing=v;},'Camera playback')})),ui.field('Sync transport',ui.toggle({value:s.sync,labels:['On','Off'],property:'mapTrackSync',onChange:v=>upd(t=>{const now=performance.now()/1000,oldClock=s.sync?elapsed:now,newClock=v?elapsed:now;t.offset+=(oldClock-newClock)*s.speed;t.sync=v;},'Camera clock')})));
    clip.append(ui.knob({label:'Speed',min:.05,max:4,step:.05,def:1,value:s.speed,property:'mapTrackSpeed',onInput:v=>liveSurf(t=>{const clock=t.sync?elapsed:performance.now()/1000;t.offset+=clock*(t.speed-v);t.speed=v;}),onChange:()=>liveCommit('Camera speed')}),ui.knob({label:'Time',min:0,max:Math.max(.01,s.track.duration),step:.01,def:0,value:s.hold,unit:'s',property:'mapTrackTime',onInput:v=>liveSurf(t=>{t.hold=v;t.playing=false;}),onChange:()=>liveCommit('Camera time')}));}
}
function overlayBox(){
  const r=preview.getBoundingClientRect(),w=$('previewWrap').getBoundingClientRect();
  const z=uiZ();overlay.style.left=(r.left-w.left)/z+'px';overlay.style.top=(r.top-w.top)/z+'px';overlay.style.width=r.width/z+'px';overlay.style.height=r.height/z+'px';
  overlay.setAttribute('viewBox',`0 0 ${WIDTH} ${HEIGHT}`);overlay.setAttribute('preserveAspectRatio','none');return r;
}
function svg(tag,attrs){const n=document.createElementNS(SVGNS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;}
function renderOverlay(){
  if(!overlay||overlay.hasAttribute('hidden'))return;overlay.replaceChildren();const r=overlayBox(),k=WIDTH/(r.width||WIDTH),m=curMap();
  const P=p=>`${(p[0]*WIDTH).toFixed(1)},${(p[1]*HEIGHT).toFixed(1)}`;
  for(const s of m.surfaces){
    if(s.kind==='3d')continue;
    const sel=s.id===mapSel,poly=svg('polygon',{class:'surf'+(sel?' sel':''),points:mapping.outline(s,s.cols*s.rows>1?16:1).map(P).join(' ')});poly.dataset.surface=s.id;overlay.append(poly);
    const c=mapping.pointAt(s,.5,.5),t=svg('text',{x:c[0]*WIDTH,y:c[1]*HEIGHT,'text-anchor':'middle','font-size':13*k});t.textContent=s.name;overlay.append(t);
  }
  const s=selSurface();if(!s)return;
  if(s.kind==='3d'){const hit=svg('rect',{x:0,y:0,width:WIDTH,height:HEIGHT,fill:'transparent','pointer-events':'all'});overlay.append(hit);
    const hs=map3d.latticeHandles(s,WIDTH,HEIGHT,mapTime),n=s.lattice.res;if(!hs.length)return;let d='';
    for(const h of hs)for(let a=0;a<3;a++){if(h.ijk[a]+1>=n)continue;const ijk=[...h.ijk];ijk[a]++;const o=hs[(ijk[0]*n+ijk[1])*n+ijk[2]];if(h.front&&o.front)d+=`M${h.x.toFixed(1)},${h.y.toFixed(1)}L${o.x.toFixed(1)},${o.y.toFixed(1)}`;}
    overlay.append(svg('path',{class:'lat',d}));
    for(const h of hs)if(h.front){const c=svg('circle',{class:'lpt'+(mapDrag?.kind==='lat'&&mapDrag.h===h.id?' on':''),cx:h.x,cy:h.y,r:6*k});c.dataset.lattice=h.id;overlay.append(c);}
    return;}
  if(s.cols>1||s.rows>1){let d='';for(let j=0;j<=s.rows;j++){d+='M';for(let i=0;i<=16;i++)d+=P(mapping.pointAt(s,i/16,j/s.rows))+' ';}for(let i=0;i<=s.cols;i++){d+='M';for(let j=0;j<=16;j++)d+=P(mapping.pointAt(s,i/s.cols,j/16))+' ';}overlay.append(svg('path',{class:'mesh',d}));}
  const w=s.cols+1,cornerIdx=new Set([0,s.cols,s.rows*w,s.rows*w+s.cols]);
  s.pts.forEach((p,i)=>{const c=svg('circle',{class:'pt'+(cornerIdx.has(i)?' corner':'')+(i===mapPt?' on':''),cx:p[0]*WIDTH,cy:p[1]*HEIGHT,r:(cornerIdx.has(i)?7:5.5)*k});c.dataset.point=i;overlay.append(c);});
  if(mapSnapAt)overlay.append(svg('circle',{class:'snap',cx:mapSnapAt[0]*WIDTH,cy:mapSnapAt[1]*HEIGHT,r:12*k}));
}
new ResizeObserver(()=>renderOverlay()).observe(preview);
const normPoint=ev=>{const r=preview.getBoundingClientRect();return [(ev.clientX-r.left)/r.width,(ev.clientY-r.top)/r.height];};
const round4=v=>Math.round(v*10000)/10000;
overlay.addEventListener('pointerdown',ev=>{
  if(![0,2].includes(ev.button))return;ev.preventDefault();const [x,y]=normPoint(ev),r=preview.getBoundingClientRect(),m=curMap();
  const s=selSurface();if(s?.kind==='3d'){
    let lh=null,best=14;for(const h of map3d.latticeHandles(s,WIDTH,HEIGHT,mapTime)){const d=Math.hypot((h.x/WIDTH-x)*r.width,(h.y/HEIGHT-y)*r.height);if(h.front&&d<best){best=d;lh=h;}}
    if(lh){mapDrag={kind:'lat',id:s.id,h:lh.id,depth:lh.depth,x,y,d0:[...s.lattice.d]};overlay.setPointerCapture(ev.pointerId);renderOverlay();return;}
    mapDrag={kind:'camera',id:s.id,x,y,camera:clone(s.camera),pan:ev.shiftKey||ev.button===2};overlay.setPointerCapture(ev.pointerId);return;}let hit=-1;
  if(s){let best=16;s.pts.forEach((p,i)=>{const d=Math.hypot((p[0]-x)*r.width,(p[1]-y)*r.height);if(d<best){best=d;hit=i;}});}
  if(hit>=0){mapPt=hit;mapDrag={kind:'pt',id:s.id,i:hit};}
  else{
    const under=[...m.surfaces].reverse().find(t=>t.kind!=='3d'&&mapping.inside(t,x,y));
    if(!under){mapSel=null;mapPt=-1;renderMapPanel();renderOverlay();return;}
    mapSel=under.id;mapPt=-1;mapDrag={kind:'move',id:under.id,x,y,pts:clone(under.pts)};renderMapPanel();
  }
  overlay.setPointerCapture(ev.pointerId);renderOverlay();
});
overlay.addEventListener('pointermove',ev=>{
  if(!mapDrag)return;const [x,y]=normPoint(ev);
  const snapOn=mapSnap&&!ev.altKey,box=preview.getBoundingClientRect();mapSnapAt=null;
  live(st=>{const t=st.mapping?.surfaces.find(s=>s.id===mapDrag.id);if(!t)return;
    if(mapDrag.kind==='lat'){t.lattice.d=map3d.latticeDrag(t,mapDrag.d0,mapDrag.h,mapDrag.depth,(x-mapDrag.x)*WIDTH,(y-mapDrag.y)*HEIGHT,WIDTH,HEIGHT,mapTime);return;}
    if(mapDrag.kind==='camera'){const c=mapDrag.camera,dx=x-mapDrag.x,dy=y-mapDrag.y;t.trackOn=false;if(mapDrag.pan){t.camera.panX=Math.max(-2,Math.min(2,c.panX+dx));t.camera.panY=Math.max(-2,Math.min(2,c.panY-dy));}else{t.camera.yaw=c.yaw-dx*180;t.camera.pitch=Math.max(-89,Math.min(89,c.pitch+dy*180));}return;}
    const targets=snapOn?snapTargets(st.mapping,t.id):[];
    if(mapDrag.kind==='pt'){let p=[x,y];const q=snapOn&&snapPoint(p,targets,box);if(q){p=q;mapSnapAt=q;}t.pts[mapDrag.i]=[round4(Math.max(-1,Math.min(2,p[0]))),round4(Math.max(-1,Math.min(2,p[1])))];}
    else{let dx=x-mapDrag.x,dy=y-mapDrag.y;
      if(snapOn){let best=null;for(const [a,b] of mapDrag.pts){const p=[a+dx,b+dy],q=snapPoint(p,targets,box);if(q){const d=Math.hypot((q[0]-p[0])*box.width,(q[1]-p[1])*box.height);if(!best||d<best.d)best={d,q,ox:q[0]-p[0],oy:q[1]-p[1]};}}
        if(best){dx+=best.ox;dy+=best.oy;mapSnapAt=best.q;}}
      t.pts=mapDrag.pts.map(([a,b])=>[round4(a+dx),round4(b+dy)]);}});
  renderOverlay();
});
overlay.addEventListener('contextmenu',e=>e.preventDefault());
let mapWheel;overlay.addEventListener('wheel',e=>{const s=selSurface();if(s?.kind!=='3d')return;e.preventDefault();live(st=>{const t=st.mapping.surfaces.find(v=>v.id===s.id);t.trackOn=false;if(e.shiftKey)t.camera.distance=Math.max(.001,Math.min(100000,t.camera.distance*Math.exp(e.deltaY*.001)));else t.camera.focal=Math.max(10,Math.min(200,t.camera.focal*Math.exp(-e.deltaY*.001)));});clearTimeout(mapWheel);mapWheel=setTimeout(()=>liveCommit('Projector zoom'),200);},{passive:false});
const endMapDrag=()=>{if(mapDrag){const k=mapDrag.kind;mapDrag=null;mapSnapAt=null;renderOverlay();if(liveBefore)liveCommit(k==='pt'?'Moved mapping point':k==='lat'?'Moved lattice point':k==='camera'?'Moved projector':'Moved surface');}};
overlay.addEventListener('pointerup',endMapDrag);overlay.addEventListener('pointercancel',endMapDrag);
function mapKey(e){
  if(!mapMode||!mapSel)return false;const s=selSurface();if(!s)return false;
  const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
  if(d&&s.kind!=='3d'){e.preventDefault();const st=(e.shiftKey?10:1);mapEdit(x=>{const t=x.surfaces.find(y=>y.id===s.id);const idx=mapPt>=0?[mapPt]:t.pts.map((_,i)=>i);for(const i of idx)t.pts[i]=[round4(t.pts[i][0]+d[0]*st/WIDTH),round4(t.pts[i][1]+d[1]*st/HEIGHT)];},'Nudged mapping');return true;}
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();mapEdit(x=>{x.surfaces=x.surfaces.filter(y=>y.id!==s.id);},'Deleted surface');return true;}
  if(e.key==='Escape'){mapPt=-1;renderOverlay();return true;}
  return false;
}

// ---------- autopilot ----------
// Ported from the original Audiograph: it listens for the song's sections (breakdown, groove, build-up, drop) and at
// each one slowly crossfades to a fitting variation. Colours / Mood restyle your own layers. Everything runs its own
// stack of 1–3 layers in four fixed layers: a new look warms up out of sight and then fades in while the old one fades
// out, so a change never rebuilds the graph or starts new engines. Full rebuilds (drops) dissolve from the last frame.
const AP_KEY='agpro.autopilot';
const ap={prompt:'',changes:'everything',layers:'auto',every:24,match:85,live:false,hold:false,write:false,last:''};
const tm=new TemplateMorph();
try{tm.configure(JSON.parse(localStorage.getItem('agpro.templateMorph')||'{}'));}catch(error){message('Preset Morph settings: '+error.message,true);}
let tmNode=null,tmStatusT=0;
function tmSave(){try{localStorage.setItem('agpro.templateMorph',JSON.stringify(tm.settings()));}catch(error){message('Preset Morph settings: '+error.message,true);}}
function tmEnsure(){
  apStop();apTrans=null;apWant=null;apTweens.clear();clearTimeout(apTyping);
  let n=tmNode&&findNode(tmNode);if(n?.type==='templateMorph')return n;
  const pair=tm.pair(),g=chain('Template Morph',[['audioIn',{}],['templateMorph',{from:pair.from,to:pair.to,mix:pair.mix*100}],['output',{}]]);
  nextFade=2.5;
  importProject({...clone(state),layers:[g]},'Preset Morph (Undo restores your scene)');
  n=g.nodes.find(n=>n.type==='templateMorph');tmNode=n.id;return findNode(tmNode);
}
function tmSetPair(){
  const n=tmEnsure(),p=tm.pair();Object.assign(n.props,{from:p.from,to:p.to,mix:p.mix*100});
  if(paused)draw(elapsed);tmStatus();return p;
}
function tmStart(){tmEnsure();apStop();clearTimeout(apTyping);tm.start(A.beat);tmStatus();}
function tmApply(){
  const n=tmNode&&findNode(tmNode);if(!n)throw Error('Start or scrub Preset Morph first');
  const e=engines.get(n.id);if(!e||e.status!=='ready')throw Error('Wait for the template renderer to start');
  const blend=e.templateBlend(n.props.from,n.props.to,n.props.mix/100),kept=blend.layers.filter(l=>l.opacity>.01);
  tm.playing=false;
  if(kept.length>LIMITS.emitters){message('Applied as an editable Preset Morph node (this blend has more than 8 renderers)');tmStatus();return true;}
  const P={name:'Morphed templates',bg:'#000000',layers:kept.map(l=>({layout:l.layout,opacity:l.opacity,
    look:{...lookDiff(e.w,l.params),...(l.layout==='custom'?{customFnX:l.params.customFnX,customFnY:l.params.customFnY}:{})}})),postFx:blend.postFx};
  const next=validate({...clone(state),layers:presetGraph(P)});nextFade=1;importProject(next,'Applied Preset Morph to editable nodes');tmNode=null;tmStatus();
  return true;
}
function tmStatus(){
  const label=document.querySelector('[data-property=tmStatus]'),p=tm.pair();
  if(label)label.textContent=`${p.from} → ${p.to} · ${Math.round(p.mix*100)}%${tm.playing?' · playing':''}`;
  const knob=document.querySelector('[data-property=tmMix]');knob?.show?.(tm.progress());
  document.querySelector('[data-property=tmPlay]')?.setValue?.(tm.playing);
}
function tmStep(dt){
  if(!tm.playing)return;
  const n=tmNode&&findNode(tmNode);if(!n||n.type!=='templateMorph'){tm.playing=false;return;}
  const p=tm.step(dt,A.beat);Object.assign(n.props,{from:p.from,to:p.to,mix:p.mix*100});
  if((tmStatusT+=dt)>.15){tmStatusT=0;tmStatus();}
}
try{const s=JSON.parse(localStorage.getItem(AP_KEY)||'{}');if(s.v!==2){delete s.changes;delete s.match;delete s.every;delete s.fade;}Object.assign(ap,s,{live:false,hold:false});}catch{}
if(!['colors','mood','everything'].includes(ap.changes))ap.changes='everything';
if(!['auto','1','2','3'].includes(String(ap.layers)))ap.layers='auto';
ap.every=Math.max(8,Math.min(60,+ap.every||24));
const pilot=new Pilot(),gen=new Generator(),apTweens=new Map(),apSlots=[0,1,2,3].map(()=>({role:-1,layer:null,f0:0}));
let apTrans=null,apPending=null,apWant=null,apVibeFor=null,apTyping=0;
function apSave(){try{localStorage.setItem(AP_KEY,JSON.stringify({v:2,prompt:ap.prompt,changes:ap.changes,layers:ap.layers,every:ap.every,match:ap.match,write:ap.write}));}catch{}}
const AP_SECTION={waiting:'Waiting for music…',calm:'Breakdown',groove:'Groove',build:'Build-up',drop:'Drop',phrase:'New phrase'};
const AP_PARTS=['a','r','p','y','s','o'],apIds=k=>({g:'ap-L'+k,a:'ap-a'+k,r:'ap-r'+k,p:'ap-p'+k,y:'ap-y'+k,s:'ap-s'+k,o:'ap-o'+k});
const apLayer=k=>state.layers.find(g=>g.id==='ap-L'+k);
const apNode=(k,key)=>apLayer(k)?.nodes.find(n=>n.id===apIds(k)[key]);
const apIsSlots=()=>state.layers.length===4&&[0,1,2,3].every(k=>AP_PARTS.every(x=>apNode(k,x)));
const apBusy=()=>!!(apWant||apTrans?.warm.length);
// The original's look generator runs inside any ready engine frame.
function apWin(){for(const e of engines.values())if(e.status==='ready'&&e.w?.agAI)return e.w;return null;}
function apSlotLayer(k){
  const id=apIds(k),y=60+k*30,mk=(type,nid,x,props)=>({...node(type,40+x,y,props),id:nid});
  return {id:id.g,name:'Autopilot '+(k+1),visible:true,opacity:0,blend:k?'screen':'source-over',
    nodes:[mk('audioIn',id.a,0,{}),mk('waveform2d',id.r,220,{mode:'circle'}),mk('palette',id.p,440,{}),mk('symmetry',id.y,660,{mode:'none'}),mk('spin',id.s,880,{spin:0}),mk('output',id.o,1100,{})],
    edges:[{from:id.a,out:'audio',to:id.r,input:'audio'},{from:id.r,out:'shape',to:id.p,input:'shape'},{from:id.p,out:'shape',to:id.y,input:'shape'},{from:id.y,out:'shape',to:id.s,input:'shape'},{from:id.s,out:'shape',to:id.o,input:'image'}]};
}
// Everything needs its four layers: the first time they replace the project (one undo step).
function apEnsure(){
  if(apIsSlots()){
    // A saved Autopilot project: its visible layers become the stack again.
    if(!apSlots.some(s=>s.role>=0)){let role=0;for(let k=0;k<4;k++){const g=apLayer(k),r=apNode(k,'r'),s=apNode(k,'s');
      if(g.visible&&g.opacity>.01&&role<3)apSlots[k]={role:role++,layer:{layout:r.props.mode,params:{...r.props.look},opacity:g.opacity*100,spin:s.props.spin*(s.props.dir==='left'?-1:1),speed:s.props.speed},f0:0};}}
    return true;
  }
  apTrans=null;apTweens.clear();for(const s of apSlots)Object.assign(s,{role:-1,layer:null,f0:0});
  nextFade=2.5;
  if(!attempt(()=>importProject({...clone(state),layers:[0,1,2,3].map(apSlotLayer)},'Autopilot: its own four layers')))return false;
  // The first layer starts its engine at once (invisibly) so the first look can be generated.
  apLayer(0).opacity=.001;
  return true;
}
// Original layer parameters → a look the project can store (only what differs from the defaults).
const LOOK_TOKEN=/^[A-Za-z0-9#_.-]{0,24}$/,LOOK_KEY=/^[a-zA-Z0-9_]{1,40}$/;
function lookValue(x,inner){
  if(typeof x==='number')return Number.isFinite(x)&&Math.abs(x)<=1e6;if(typeof x==='boolean')return true;if(typeof x==='string')return LOOK_TOKEN.test(x);
  if(Array.isArray(x))return !inner&&x.length<=16&&x.every(y=>(typeof y==='number'&&Number.isFinite(y))||(typeof y==='string'&&LOOK_TOKEN.test(y)));
  return false;
}
function lookDiff(w,p){
  const d=w.getDefaultLayerParams(),out={};
  for(const [k,v] of Object.entries(p)){
    if(Object.keys(out).length>=190)break;
    if(!LOOK_KEY.test(k)||k==='customFnX'||k==='customFnY'||JSON.stringify(v)===JSON.stringify(d[k]))continue;
    if((k==='_postFx'||k==='_sim')&&v&&typeof v==='object'&&!Array.isArray(v)){const o={};for(const [a,b] of Object.entries(v))if(LOOK_KEY.test(a)&&lookValue(b,true))o[a]=b;out[k]=o;}
    else if(lookValue(v))out[k]=v;
  }
  return out;
}
const apColorsOf=p=>(p._colorMode==='solid'?[p._solidColor]:p._toneStops||[]).filter(c=>/^#[0-9a-f]{6}/i.test(c||''));
// Palette props for a colour list (the original fades quiet tones through the first stop's alpha).
function apPalette(colors){
  const cs=colors.slice(0,MAX_STOPS),a=cs[0].length>7?parseInt(cs[0].slice(7,9),16)/255:1,hex=c=>c.slice(0,7).toLowerCase();
  return {mode:cs.length>1?'toneramp':'solid',stops:cs.map(c=>({c:hex(c),auto:false})),fade:Math.round(a*20)/20,solid:hex(cs[Math.min(2,cs.length-1)])};
}
const apSpin=v=>Math.max(-5,Math.min(5,Math.round((+v||0)*10)/10));
// A new look in slot k: the renderer switches mode in place (same engine); the layer stays invisible until it is warm.
function apAssign(w,k,l,role,opacity=.001){
  const g=apLayer(k),r=apNode(k,'r'),type=Object.keys(MODES).find(t=>MODES[t].some(m=>m[0]===l.layout))||'waveform2d';
  r.type=type;r.props={...defaults(type),mode:l.layout,look:lookDiff(w,l.params),...geoFromLook(l.params)};
  const cs=apColorsOf(l.params);if(cs.length)Object.assign(apNode(k,'p').props,apPalette(cs));
  const sym=l.params._symmetryMode;apNode(k,'y').props.mode=['x','y','xy','r3','r4','r6','r8'].includes(sym)?sym:'none';
  Object.assign(apNode(k,'s').props,{...spinProps(apSpin(l.spin)),speed:Math.max(.1,Math.min(5,+l.speed||1))});
  for(const key of apTweens.keys())if(key.startsWith(g.id+'|'))apTweens.delete(key);
  g.visible=true;g.opacity=opacity;g.blend=role?'screen':'source-over';
  apSlots[k]={role,layer:l,f0:engines.get(r.id)?.frames||0};
}
// Warm when its engine has drawn a few frames of the new look (simulations get a moment to fill the frame).
function apReady(k){
  const r=apNode(k,'r'),e=r&&engines.get(r.id),sim=isSim(r?.props.mode);
  if(!e||e.status!=='ready')return false;
  if(sim&&e.w?.agSim?.status?.()!=='ready')return false;
  return e.frames-(apSlots[k].f0||0)>=(sim?45:8);
}
// Tween a property without touching the undo history (the change is the music's, not the user's).
function apTween(g,n,key,to,dur){
  const from=n.props[key];if(from===undefined||JSON.stringify(from)===JSON.stringify(to))return;
  apTweens.set(g.id+'|'+n.id+'|'+key,{n:n.id,key,from:clone(from),to,t:0,dur:Math.max(.05,dur),stops:Array.isArray(to),color:typeof to==='string'&&/^#[0-9a-f]{6}$/i.test(to)});
}
function apRecolor(g,colors,dur){
  if(!colors?.length)return;const to=apPalette(colors);
  for(const n of g.nodes)if(n.type==='palette'&&!g.edges.some(e=>e.to===n.id&&e.input!=='shape'&&e.input!=='image'&&e.input!=='visual')){
    if(n.props.mode==='solid')apTween(g,n,'solid',to.solid,dur);
    else{apTween(g,n,'stops',to.stops,dur);if(g.id.startsWith('ap-L'))apTween(g,n,'fade',to.fade,dur);}
  }
}
// Mood on your layers: shape knobs glide to the new look's values; spin keeps its direction unless the breakdown flips it.
const MOOD_GEO=new Set(['_amplify','_height','_twist','_wave','_bulge']);
function apMood(g,p,spinAmt,speed,dur,flip){
  const geo=geoFromLook(p);
  for(const n of g.nodes){
    const wired=k=>g.edges.some(e=>e.to===n.id&&e.input===k);
    if(TYPES[n.type].engine&&!isSim(n.props.mode))for(const [k,v] of Object.entries(geo)){const s=TYPES[n.type].props[k];if(s?.kind==='number'&&MOOD_GEO.has(s.key)&&!wired(k))apTween(g,n,k,v,dur);}
    if(n.type==='spin'&&!wired('spin')){const amt=apSpin(spinAmt*(flip||1));if(amt<0)n.props.dir=n.props.dir==='left'?'right':'left';apTween(g,n,'spin',Math.abs(amt),dur);if(!wired('speed'))apTween(g,n,'speed',speed,dur);}
  }
}
const apActive=()=>[0,1,2,3].filter(k=>apSlots[k].role>=0&&apLayer(k)).sort((a,b)=>apSlots[a].role-apSlots[b].role);
// Freeze the last frame on top; it fades out once the new looks are warm (see dissolveDraw).
function apSnapshot(dur){
  if(!dissolveOn||!frame)return;
  fadeCtx.globalAlpha=1;fadeCtx.globalCompositeOperation='copy';fadeCtx.drawImage(preview,0,0,WIDTH,HEIGHT);fadeCtx.globalCompositeOperation='source-over';
  fade={t:0,hold:0,dur};
}
function apChange(kind,dur=durFor(kind,ap.every),changes=ap.changes,force=false,rebuild=false){
  if(liveBefore)return;
  if(changes==='everything'&&!apEnsure())return;
  const w=apWin();
  if(!w){apWant={kind,dur,changes,force,rebuild};return;}
  if(apTrans&&kind!=='drop'&&!force&&!apWant){apPending=kind;return;}
  apWant=null;apPending=null;
  pilot.since=0;gen.section=pilot.section==='waiting'?'groove':pilot.section;gen.match=ap.match;gen.layers=String(ap.layers);
  if(ap.write){let t='';for(let i=0;i<6;i++){t=autopilot.write({energy:gen.energy(kind),seed:(Math.random()*1e9)|0,prev:ap.prompt,keep:ap.match/200});if(t!==ap.prompt)break;}
    ap.prompt=t;apSave();apShowPrompt();}
  if(apVibeFor!==ap.prompt){gen.setVibe(w,ap.prompt);apVibeFor=ap.prompt;}
  let summary;
  if(changes==='everything'){
    // Whatever was still fading lands where it was heading, under a short dissolve so nothing pops.
    if(apTrans){apSnapshot(Math.max(1,Math.min(dur,2.5)));for(const f of apTrans.fades){const g=apLayer(f.k);if(g)g.opacity=f.to>0?f.to:0;}apTrans=null;}
    for(let k=0;k<4;k++)if(apSlots[k].role<0&&apLayer(k))apLayer(k).opacity=0;
    const cur=apActive(),st=gen.stack(w,kind,rebuild?[]:cur.map(k=>apSlots[k].layer)),fresh=st.roles.filter(r=>r.fresh).length;
    const free=[0,1,2,3].filter(k=>!cur.includes(k)),fades=[],warm=[];
    if(fresh>free.length){
      // Full rebuild: everything changes under a frozen frame that dissolves once the new looks are drawing.
      apSnapshot(dur);const slots=[...cur,...free];
      for(const k of slots){apSlots[k].role=-1;apLayer(k).opacity=0;}
      st.roles.forEach((r,i)=>{const k=slots[i];apAssign(w,k,r.layer,i,r.layer.opacity/100);warm.push(k);});
    }else{
      st.roles.forEach((r,i)=>{
        const old=cur[i];
        if(r.fresh){const k=free.shift();apAssign(w,k,r.layer,i);warm.push(k);fades.push({k,from:0,to:r.layer.opacity/100,st:st.stagger[i]||0});
          if(old!==undefined){apSlots[old].role=-1;fades.push({k:old,from:apLayer(old).opacity,to:0,st:st.stagger[i]||0});}}
        else{const g=apLayer(old),l=r.layer;l.params={...l.params,...recolorLook(l.params,r.colors)};l.opacity=ROLE_OP[i]||50;apSlots[old].role=i;
          apRecolor(g,r.colors,dur);fades.push({k:old,from:g.opacity,to:l.opacity/100,st:0});g.blend=i?'screen':'source-over';}
      });
      // Layers the stack no longer needs (it got smaller) fade out.
      for(const k of cur.slice(st.roles.length)){apSlots[k].role=-1;fades.push({k,from:apLayer(k).opacity,to:0,st:.15});}
    }
    apTrans={t:0,dur:Math.max(.3,dur),fades,warm,wt:0,kind};
    summary=st.roles.map(r=>nameOf(r.layer.layout)).join(' + ');
    renderUI();
  }else{
    // Colours / Mood: your layers glide to the new palette (and, for Mood, to the new motion and shape).
    const st=gen.restyle(w,kind,state.layers.length),flip=kind==='calm'&&Math.random()<.3?-1:1;
    state.layers.forEach((g,i)=>{apRecolor(g,st.colors[i],dur);if(changes==='mood')apMood(g,st.params,st.spinAmt*(i?.7:1),st.speed,dur*1.2,flip);});
    for(const k of apActive()){const l=apSlots[k].layer;l.params={...l.params,...recolorLook(l.params,st.colors[state.layers.indexOf(apLayer(k))]||st.colors[0])};}
    summary=changes==='mood'?'colours + mood':'colours';
  }
  ap.last=(AP_SECTION[kind]||kind)+' → '+summary;apStatus(true);
}
function apTick(dt){
  const T=apTrans;if(!T)return;
  if(T.warm.length){T.wt+=dt;if(!T.warm.every(apReady)&&T.wt<(T.kind==='drop'?3:8))return;T.warm=[];}
  T.t=Math.min(1,T.t+dt/T.dur);const mo=Math.max(0,...T.fades.map(f=>f.st));
  for(const f of T.fades){const g=apLayer(f.k);if(!g)continue;const e=smoother(Math.max(0,Math.min(1,(T.t-f.st)/Math.max(.05,1-mo))));
    g.opacity=f.from+(f.to-f.from)*e;if(f.to>0)g.opacity=Math.max(g.opacity,.001);}
  if(T.t<1)return;
  for(const f of T.fades){const g=apLayer(f.k);if(g)g.opacity=Math.round(f.to*100)/100;}
  apTrans=null;renderLayers();
}
// Exposure: a quiet passage on fine, faded looks can sit near black, so Autopilot gently opens its layers up
// (louder response, quiet tones shown) and eases a blinding stack back. New looks start from their own values.
let apExpT=0,apDim=0;
function apExposure(dt){
  if(!ap.live||ap.hold||ap.changes!=='everything'||!apIsSlots()){apExpT=0;apDim=0;return;}
  if((apExpT+=dt)<1)return;apExpT=0;
  const ks=apActive();if(apTrans||apWant||!ks.length||!frame){apDim=0;return;}
  const d=previewCtx.getImageData(0,0,WIDTH,HEIGHT).data;let s=0;for(let i=0;i<d.length;i+=64)s+=d[i]+d[i+1]+d[i+2];
  const lv=s/(d.length/64)/3;apDim=lv<1.5?Math.max(0,apDim)+1:lv>45?Math.min(0,apDim)-1:0;
  if(Math.abs(apDim)<2)return;const up=apDim>0;apDim=0;
  for(const k of ks){const g=apLayer(k),r=apNode(k,'r'),pl=apNode(k,'p');if(!r||isSim(r.props.mode))continue;
    if('sensitivity' in TYPES[r.type].props){const v=+r.props.sensitivity||100,to=Math.max(up?v:Math.min(v,80),Math.min(200,v+(up?25:-20)));if(to!==v)apTween(g,r,'sensitivity',to,1.5);}
    if(up&&pl&&pl.props.fade<1)apTween(g,pl,'fade',Math.min(1,Math.round((pl.props.fade+.25)*20)/20),1.5);}
}
// A written prompt types itself into the box.
function apShowPrompt(){const ta=document.querySelector('[data-property=apPrompt]');if(!ta||workspace!=='auto')return;const t=ap.prompt;let k=0;clearInterval(ta._type);
  ta._type=setInterval(()=>{k=Math.min(t.length,k+2);ta.value=t.slice(0,k);if(k>=t.length){clearInterval(ta._type);ta._showRead?.();}},18);}
const apKind=()=>({waiting:'groove',drop:'phrase'})[pilot.section]||pilot.section;
// Describe → a new Everything stack now (whether Autopilot runs or not).
function apCreate(prompt=ap.prompt){
  tm.playing=false;
  ap.prompt=String(prompt||'');apVibeFor=null;
  if(ap.changes!=='everything'&&!apIsSlots())ap.changes='everything';
  apSave();apChange(apKind(),3,'everything',true,true);
  if(workspace==='auto')renderAutoPanel();
  return true;
}
let apStatusT=0;
function autopilotStep(dt){
  if(liveBefore)return;
  tmStep(dt);
  if(apWant&&apWin())apChange(apWant.kind,apWant.dur,apWant.changes,apWant.force,apWant.rebuild);
  // A section change that arrived mid-fade follows once the fade is done and the minimum gap has passed.
  if(apPending&&!apTrans&&ap.live&&!ap.hold&&pilot.since>=MIN_GAP){const k=apPending;apPending=null;apChange(k,k==='calm'?9:7);}
  const c=ap.live?pilot.step(dt,features(A.freq),ap.hold?1e9:ap.every,!!apTrans||ap.hold):null;
  if(c&&!ap.hold)apChange(c.kind,c.dur);
  apTick(dt);apExposure(dt);
  if(apTweens.size){
    const nodes=new Map();for(const g of state.layers)for(const n of g.nodes)nodes.set(n.id,n);let ended=false;
    for(const [key,tw] of apTweens){const n=nodes.get(tw.n);if(!n){apTweens.delete(key);continue;}
      tw.t=Math.min(1,tw.t+dt/tw.dur);const e=smoother(tw.t);
      n.props[tw.key]=tw.stops?tw.to.map((s,i)=>({...s,c:autopilot.mixHex((tw.from[Math.min(i,tw.from.length-1)]||s).c,s.c,e)})):tw.color?autopilot.mixHex(tw.from,tw.to,e):
        (()=>{const v=tw.from+(tw.to-tw.from)*e,st=TYPES[n.type].props[tw.key]?.step||.01;return Math.round(v/st)*st;})();
      if(tw.t>=1){n.props[tw.key]=tw.to;apTweens.delete(key);ended=true;}}
    if(frame%6===0||ended)updateSummaries();
    if(ended&&!apTweens.size&&selected&&!document.activeElement?.closest?.('#properties'))renderProperties();
  }
  if((apStatusT+=dt)>.25){apStatusT=0;apStatus();}
}
function apStatus(full=false){
  $('modeAuto').classList.toggle('live',ap.live);
  const box=$('apStatus');if(!box||workspace!=='auto')return;
  const on=ap.live&&pilot.section!=='waiting';
  box.querySelector('b').textContent=ap.live?(ap.hold?'Hold':AP_SECTION[pilot.section]):'Off';
  box.querySelector('.ap-bar i').style.width=(on?Math.round(pilot.level*100):0)+'%';
  box.querySelector('span').textContent=on&&!ap.hold?`next change ≤ ${Math.ceil(Math.max(0,ap.every-pilot.since))}s`:'';
  if(full){const l=$('apLast');if(l)l.textContent=ap.last?'Last change: '+ap.last:'';}
}
function apStart(){
  tm.playing=false;
  if(!ap.live)pilot.reset();ap.live=true;ap.hold=false;
  if(ap.changes==='everything'&&!apActive().length)apCreate(ap.prompt);
}
function apStop(){ap.live=false;ap.hold=false;apPending=null;}
function randomGraph(){
  return attempt(()=>{
    const seed=(Math.random()*1e9)|0,energy=35+Math.random()*50;
    const text=autopilot.write({seed,energy});
    const next=validate({...clone(state),layers:autopilot.build(autopilot.parse(text),{seed,energy,match:50})});
    apStop();apWant=null;apTrans=null;apTweens.clear();
    for(const s of apSlots)Object.assign(s,{role:-1,layer:null,f0:0});
    nextFade=2.5;importProject(next,'Random graph: '+text);apStatus(true);
    return true;
  });
}
$('randomGraph').onclick=randomGraph;
function renderAutoPanel(){
  const root=$('autoPanel');if(!root||workspace!=='auto')return;root.replaceChildren();
  // Two separate blocks: generative Autopilot, then Preset Morph.
  const apb=el('div','ws-block');root.append(apb);apb.append(el('div','ws-title','Autopilot'));
  const top=el('div','ws-top');apb.append(top);
  top.append(ui.field('On',ui.toggle({value:ap.live,labels:['On','Off'],property:'apLive',onChange:v=>{if(v)apStart();else apStop();message(v?'Autopilot is following the music':'Autopilot off');renderAutoPanel();}})));
  top.append(ui.field('Write',ui.toggle({value:ap.write,labels:['On','Off'],property:'apWrite',onChange:v=>{ap.write=v;apSave();if(v){if(!ap.live)apStart();apChange('phrase',4,ap.changes,true);}renderAutoPanel();}})));
  const d=section(apb,'Describe');
  const ta=el('textarea','ap-prompt');ta.dataset.property='apPrompt';ta.placeholder='Optional: a mood, colours, shapes or motion, e.g. slow dreamy blue and gold spirals';ta.value=ap.prompt;ta.spellcheck=false;
  const read=el('div','ap-read');read.dataset.property='apRead';
  const showRead=()=>{const w=apWin();read.textContent=!ta.value.trim()?'Empty: Autopilot roams freely.':w?vibeText(readVibe(w,ta.value)):'';};
  // Typing steers the next looks; after a pause (or Enter) the current look changes to match. Typing takes over from Write.
  const build=()=>{clearTimeout(apTyping);apTyping=0;apCreate(ta.value);};
  ta.oninput=()=>{ap.prompt=ta.value;apVibeFor=null;if(ap.write){ap.write=false;root.querySelector('[data-property=apWrite]')?.setValue(false);}
    apSave();showRead();clearTimeout(apTyping);apTyping=setTimeout(build,1200);};
  ta.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();build();}};
  ta._showRead=showRead;showRead();d.append(ta,read);
  const mk=el('div','knob-grid');
  mk.append(ui.knob({label:'Prompt match',min:0,max:100,step:1,value:ap.match,def:85,unit:'%',property:'apMatch',onInput:v=>{ap.match=v;},onChange:v=>{ap.match=v;apSave();}}));
  d.append(mk);
  const live=section(apb,'Follow the music');
  const st=el('div','ap-status');st.id='apStatus';st.append(el('b'),Object.assign(el('div','ap-bar'),{innerHTML:'<i></i>'}),el('span'));live.append(st);
  live.append(ui.field('Changes',ui.chips({options:[['colors','Colours'],['mood','Mood'],['everything','Everything']],value:ap.changes,property:'apChanges',onChange:v=>{ap.changes=v;apSave();renderAutoPanel();}})));
  if(ap.changes==='everything')live.append(ui.field('Layers',ui.chips({options:[['auto','Auto'],['1','1'],['2','2'],['3','3']],value:String(ap.layers),property:'apLayers',onChange:v=>{ap.layers=v;apSave();}})));
  const knobs=el('div','knob-grid');
  knobs.append(ui.knob({label:'Every',min:8,max:60,step:1,value:ap.every,def:24,unit:'s',property:'apEvery',onInput:v=>{ap.every=v;},onChange:v=>{ap.every=v;apSave();}}));
  live.append(knobs);
  const r2=el('div','map-actions');
  const nb=el('button','mbtn','Next');nb.title='Change now';nb.dataset.property='apNext';nb.onclick=()=>apChange(apKind(),pilot.section==='drop'?2.5:7,ap.changes,true);
  const hb=el('button','mbtn',ap.hold?'Release':'Hold');hb.title='Keep the current look';hb.dataset.property='apHold';hb.disabled=!ap.live;hb.onclick=()=>{ap.hold=!ap.hold;hb.textContent=ap.hold?'Release':'Hold';apStatus();};
  r2.append(nb,hb);live.append(r2);
  const last=el('div','ap-last');last.id='apLast';live.append(last);
  renderTemplateMorph(root);apStatus(true);
}
function renderTemplateMorph(root){
  const blk=el('div','ws-block');root.append(blk);blk.append(el('div','ws-title','Preset Morph'));
  const s=section(blk,''),row=el('div','map-actions'),add=el('select');add.dataset.property='tmAdd';
  add.append(new Option('+ Add preset…',''));for(const name of TEMPLATE_NAMES)add.append(new Option(name,name));
  add.onchange=()=>{if(add.value)attempt(()=>{tm.configure({list:[...tm.list,add.value]});tmSave();renderAutoPanel();});};s.append(ui.field('Playlist',add));
  const button=(label,key,fn)=>{const b=el('button','mbtn',label);b.dataset.property=key;b.onclick=()=>attempt(fn);row.append(b);};
  button('All','tmAll',()=>{tm.configure({list:TEMPLATE_NAMES});tmSave();renderAutoPanel();});
  button('Clear','tmClear',()=>{tm.playing=false;tm.configure({list:[]});tmSave();renderAutoPanel();});
  button('Apply','tmApply',tmApply);s.append(row);
  const list=el('div','chips tm-list');list.dataset.property='tmList';
  tm.list.forEach((name,i)=>{const b=el('button','mbtn',`${i+1}. ${name} ×`);b.title='Remove '+name;b.onclick=()=>attempt(()=>{tm.configure({list:tm.list.filter((_,k)=>k!==i)});tmSave();renderAutoPanel();});list.append(b);});s.append(list);
  const knobs=el('div','knob-grid');
  knobs.append(ui.knob({label:'Morph',min:0,max:100,step:1,value:tm.progress(),def:0,unit:'%',property:'tmMix',
    onInput:v=>{tm.playing=false;tm.scrub(v);attempt(tmSetPair);},onChange:()=>tmStatus()}));
  knobs.append(ui.knob({label:'Duration',min:10,max:60,step:1,value:tm.duration,def:20,unit:'s',property:'tmDuration',
    onInput:v=>{tm.duration=v;},onChange:tmSave}));s.append(knobs);
  s.append(ui.field('Playback',ui.toggle({value:tm.playing,labels:['Play','Pause'],property:'tmPlay',onChange:v=>{attempt(()=>{if(v)tmStart();else tm.playing=false;});tmStatus();}})));
  const options=el('div','chips');options.dataset.property='tmOptions';
  // Independent switches keep the original morph transport's combination of modes.
  for(const [key,label] of [['random','Random'],['beat','On Beat'],['ping','Ping-pong']]){
    const b=el('button','mbtn'+(tm[key]?' on':''),label);b.dataset.value=key;b.setAttribute('aria-pressed',String(tm[key]));
    b.onclick=()=>attempt(()=>{const was=tm.playing;tm.configure({[key]:!tm[key]});if(key==='random'){tm.position=0;tm.from=tm.to=null;}tmSave();if(was||tm[key]&&key==='random')tmStart();renderAutoPanel();});options.append(b);
  }
  s.append(options);
  const beat=el('select');beat.dataset.property='tmBeatMode';
  for(const [v,label] of [['glide4','Glide ¼ / beat'],['glide1','Glide 1 / beat'],['snap','Snap']])beat.append(new Option(label,v));
  beat.value=tm.beatMode;beat.onchange=()=>attempt(()=>{tm.configure({beatMode:beat.value});tmSave();});s.append(ui.field('Beat style',beat));
  const status=el('div','ap-read');status.dataset.property='tmStatus';s.append(status);tmStatus();
}
// First Mile tutorial: the first step is one undo step; later steps rebuild the same scene in place.
const tour=createTour({
  setScene:(layers,first)=>{const raw={format:'audiograph-pro',version:VERSION,layers,...(state.mapping?{mapping:state.mapping}:{})};
    if(first){importProject(raw,'Tutorial');return;}
    state=validate(raw);pending=null;reconcile();active=state.layers[0].id;renderUI();requestAnimationFrame(fit);if(paused)draw(elapsed);},
  select:id=>{selected=id;multi.clear();renderUI();},
  workspace:w=>{if(workspace!==w)setWorkspace(w);},
  play:()=>{if(paused)setPaused(false);},
  stopAutomation:()=>{apStop();tm.playing=false;if(workspace==='auto')renderAutoPanel();},
  zoom:uiZ
});
$('tourButton').onclick=()=>tour.start();
window.pro={
  randomGraph,
  tour:{start:()=>tour.start(),stop:()=>tour.stop(),go:i=>tour.go(i),next:()=>tour.next(),invite:()=>tour.invite(),steps:tour.steps.map(s=>s.t),status:()=>({index:tour.index,live:tour.live,ids:tour.ids})},
  morph:{settings:o=>{if(o){tm.configure(o);tmSave();if(workspace==='auto')renderAutoPanel();}return tm.settings();},
    start:tmStart,stop:()=>{tm.playing=false;tmStatus();},scrub:v=>{tm.playing=false;tm.scrub(v);return tmSetPair();},apply:()=>attempt(tmApply),
    status:()=>({...tm.pair(),playing:tm.playing,position:tm.position,node:tmNode})},
  pause:v=>setPaused(v===undefined?!paused:!!v),
  getProject:()=>clone(state),layout:()=>({...layout,hidden:{...layout.hidden}}),validate,importProject,addNode,addLayer,connect:connection,undo,redo,loadTemplate,templates:Object.keys(TEMPLATES),
  select:id=>{selected=id;multi.clear();renderUI();},selectNodes:ids=>setSelection(ids),selection:()=>selIds(),copy:()=>copySel(),paste:(x,y)=>pasteNodes(clip,x,y),saveCustom:n=>saveCustom(n),customNodes:()=>customNodes(),removeCustom:n=>removeCustom(n),selectLayer:id=>{if(!state.layers.some(g=>g.id===id))throw Error('Missing layer');active=id;selected=null;renderUI();},
  setProperty:(id,key,value)=>edit((p,g)=>{const n=g.nodes.find(n=>n.id===id);if(!n)throw Error('Missing node');if(isEngine(n.type)&&(key==='mode'||key==='render'))setMode(g,n,value,key);else n.props[key]=value;},'Updated node property'),
  stats:()=>({frame,paused,active,selected,errors:[...renderErrors],bands:{...A.bands},beat:A.beat,live:A.live,audio:{state:audio.context?.state||null,monitor:audio.monitor?.gain.value??null,input:audio.source?"file":audio.live?.kind||null},engines:Object.fromEntries([...engines].map(([id,e])=>[id,e.stats()]))}),
  mapMode:on=>{setMapMode(on);return mapMode;},workspace:w=>{if(w)setWorkspace(w);return workspace;},
  dissolve:on=>{dissolveOn=!!on;if(!on)fade=null;return dissolveOn;},autopilot:{examples:autopilot.EXAMPLES,write:o=>autopilot.write(o),parse:t=>autopilot.parse(t),read:t=>{const w=apWin();return w?vibeText(readVibe(w,t)):null;},create:t=>apCreate(t),
    change:(k,dur)=>apChange(k||'phrase',dur,ap.changes,true),start:()=>apStart(),stop:()=>apStop(),
    settings:o=>{const {live,...rest}=o||{};Object.assign(ap,rest);if(live===true&&!ap.live)apStart();else if(live===false)apStop();apSave();if(workspace==='auto')renderAutoPanel();return {prompt:ap.prompt,changes:ap.changes,layers:ap.layers,every:ap.every,match:ap.match,live:ap.live,hold:ap.hold,write:ap.write};},
    status:()=>({section:pilot.section,level:pilot.level,since:pilot.since,tweens:apTweens.size,last:ap.last,live:ap.live,fading:!!apTrans,warming:apBusy(),slots:apSlots.map((s,k)=>({role:s.role,layout:s.layer?.layout||null,opacity:apLayer(k)?.opacity??null}))})},cameraImport:parseCamera,mapping3d:map3d,mapping:()=>clone(curMap()),selectSurface:id=>{mapSel=id;mapPt=-1;renderMapPanel();renderOverlay();},
  draw:()=>draw(elapsed),engine:id=>engines.get(id),value:id=>lastValues.get(id),outputs:id=>lastOuts.get(id),emitPoints:id=>nodeState.get(id+':emit')?.asset?.points,view:()=>({...view}),pixels:()=>{const d=previewCtx.getImageData(0,0,WIDTH,HEIGHT).data;let s=0;for(let i=0;i<d.length;i+=16)s+=d[i]+d[i+1]+d[i+2];return s/(d.length/16)/3;}
};
attempt(()=>{const h=localStorage.getItem('agpro.resolution');if(h!==null)changeResolution(+h);});
sensors.autoMidi();reconcile();renderLibrary();renderUI();requestAnimationFrame(()=>{fit();if(graph().nodes[0]){selected=graph().nodes.find(n=>isEngine(n.type))?.id||null;renderUI();}});
requestAnimationFrame(loop);
tour.maybeInvite();
