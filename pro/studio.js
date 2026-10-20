import {TYPES,EMITTERS,emitterNames,clone,node,layer,project,validate,order,connect,filterFor} from './graph.js';
import {EmitterEngine} from './engine.js';

const $=id=>document.getElementById(id), el=(tag,className,text)=>{const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;};
let state=project(),active=state.layers[0].id,selected=null,pending=null,paused=false;
const history=[],future=[],engines=new Map(),surfaces=new Map(),view={x:15,y:20,zoom:.85};
let plans=new Map(),frame=0,lastTime=0,renderErrors=[],latestBands={bass:0,mids:0,high:0,full:0};
let statusSource='action';
const preview=$('preview'),previewCtx=preview.getContext('2d',{willReadFrequently:true});
const graph=()=>state.layers.find(g=>g.id===active)||state.layers[0];
function message(text,error=false,source='action'){statusSource=source;$('status').textContent=text;$('status').classList.toggle('error',error);}
function attempt(fn){try{return fn();}catch(error){message(error.message,true);return false;}}
function reconcile(){
  const emitterIDs=new Set(state.layers.flatMap(g=>g.nodes.filter(n=>n.type==='emitter').map(n=>n.id)));
  for(const [id,engine] of engines)if(!emitterIDs.has(id)){engine.dispose();engines.delete(id);}
  const nodeIDs=new Set(state.layers.flatMap(g=>g.nodes.map(n=>n.id)));
  for(const [id,cv] of surfaces)if(!nodeIDs.has(id)){cv.width=cv.height=1;surfaces.delete(id);}
  plans=new Map(state.layers.map(g=>{
    const needed=new Set(g.nodes.filter(n=>n.type==='output').map(n=>n.id)),queue=[...needed];
    for(let i=0;i<queue.length;i++)for(const edge of g.edges)if(edge.to===queue[i]&&!needed.has(edge.from)){needed.add(edge.from);queue.push(edge.from);}
    return [g.id,order(g).filter(n=>needed.has(n.id))];
  }));
  if(!state.layers.some(g=>g.id===active))active=state.layers[0].id;
  if(!graph().nodes.some(n=>n.id===selected))selected=null;
}
function commit(next,label='Updated graph',before=state){
  const clean=validate(next);
  if(JSON.stringify(clean)===JSON.stringify(before))return;
  history.push(clone(before));if(history.length>80)history.shift();future.length=0;state=clean;
  pending=null;reconcile();renderUI();message(label);if(paused)draw(elapsed);
}
function edit(fn,label){return attempt(()=>{const next=clone(state);fn(next,next.layers.find(g=>g.id===active));commit(next,label);return true;});}
function restoreSnapshot(snapshot){state=validate(snapshot);pending=null;reconcile();renderUI();if(paused)draw(elapsed);}
function undo(){if(history.length){future.push(clone(state));restoreSnapshot(history.pop());message('Undone');}}
function redo(){if(future.length){history.push(clone(state));restoreSnapshot(future.pop());message('Redone');}}
function importProject(raw){const clean=validate(raw);commit(clean);message('Imported project. Reload external media in Emitter properties.');return clone(state);}
function addNode(type,x=70,y=80){
  const n=node(type,x,y);
  if(edit((p,g)=>g.nodes.push(n),`Added ${TYPES[type].label}`)){selected=n.id;renderUI();return n.id;}
}
function addLayer(){
  const next=clone(state),g=layer(next.layers.length+1);next.layers.push(g);
  return attempt(()=>{commit(next,'Added independent layer graph');active=g.id;selected=g.nodes.find(n=>n.type==='emitter').id;renderUI();return g.id;});
}
function removeSelected(){
  if(!selected)return;
  edit((p,g)=>{g.nodes=g.nodes.filter(n=>n.id!==selected);g.edges=g.edges.filter(e=>e.from!==selected&&e.to!==selected);},'Deleted node');
}
function connection(from,out,to,input) {
  return edit((p,g)=>connect(g,from,out,to,input),'Connected nodes');
}
function surface(id){
  if(!surfaces.has(id)){const cv=document.createElement('canvas');cv.width=preview.width;cv.height=preview.height;surfaces.set(id,cv);}
  const canvas=surfaces.get(id),ctx=canvas.getContext('2d');ctx.resetTransform();ctx.clearRect(0,0,canvas.width,canvas.height);ctx.filter='none';ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  return {canvas,ctx};
}
function readBands(){
  if(!audio.analyser||!audio.source)return {bass:0,mids:0,high:0,full:0};
  const analyser=audio.analyser,data=audio.data;analyser.getByteFrequencyData(data);
  const hz=audio.context.sampleRate/analyser.fftSize;
  const band=(a,b)=>{let sum=0,count=0;for(let i=Math.max(1,Math.floor(a/hz));i<Math.min(data.length,Math.ceil(b/hz));i++){sum+=data[i]/255;count++;}return count?sum/count:0;};
  return {bass:band(30,250),mids:band(250,2500),high:band(2500,14000),full:band(30,14000)};
}
function execute(g,time){
  const outputs=new Map(),byInput=new Map(g.edges.map(e=>[e.to+':'+e.input,e])),images=[];
  const input=(n,key)=>{const e=byInput.get(n.id+':'+key);return e?outputs.get(e.from)?.[e.out]:undefined;};
  for(const n of plans.get(g.id)||[]) {
    const p=n.props;let result={};
    if(n.type==='value')result.value=p.value;
    if(n.type==='oscillator')result.value=p.offset+p.depth*(.5+.5*Math.sin(time*p.rate*2*Math.PI));
    if(n.type==='audio')result.value=latestBands[p.band]*p.gain;
    if(n.type==='map')result.value=(input(n,'value')??0)*p.scale+p.offset;
    if(n.type==='emitter'){
      if(!engines.has(n.id))engines.set(n.id,new EmitterEngine(n.id,m=>message(m,true)));
      result.image=engines.get(n.id).draw(p,input(n,'drive')??p.drive,time);
    }
    if(n.type==='effect'){
      const source=input(n,'image');
      if(!source)throw Error(`${g.name}: connect an image to Image effect`);
      const {canvas,ctx}=surface(n.id);ctx.filter=filterFor(p.kind,input(n,'amount')??p.amount);ctx.drawImage(source,0,0);ctx.filter='none';result.image=canvas;
    }
    if(n.type==='blend'){
      const a=input(n,'a'),b=input(n,'b');
      if(!a||!b)throw Error(`${g.name}: Blend needs two images`);
      const {canvas,ctx}=surface(n.id);ctx.drawImage(a,0,0);ctx.globalAlpha=p.mix;ctx.globalCompositeOperation=p.mode;ctx.drawImage(b,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';result.image=canvas;
    }
    if(n.type==='output'){
      const image=input(n,'image');if(!image)throw Error(`${g.name}: connect an image to Output`);images.push(image);
    }
    outputs.set(n.id,result);
  }
  if(!g.nodes.some(n=>n.type==='output'))throw Error(`${g.name}: add an Output node`);
  return images[0];
}
function draw(time){
  latestBands=readBands();$('audioMeter').value=latestBands.full;renderErrors=[];
  previewCtx.globalAlpha=1;previewCtx.filter='none';previewCtx.globalCompositeOperation='source-over';previewCtx.fillStyle='#000';previewCtx.fillRect(0,0,preview.width,preview.height);
  for(const g of state.layers)if(g.visible&&g.opacity>0){
    try{const image=execute(g,time);if(image){previewCtx.globalAlpha=g.opacity;previewCtx.drawImage(image,0,0);}}catch(error){renderErrors.push(error.message);}
  }
  previewCtx.globalAlpha=1;frame++;
  const running=[...engines.values()],starting=running.some(e=>e.status==='starting');
  $('backend').textContent=starting?'Starting isolated engines…':running.map(e=>e.backend||e.status).filter((v,i,a)=>a.indexOf(v)===i).join(' / ')||'No active Emitters';
  if(renderErrors.length&&!starting)message(renderErrors.join(' · '),true,'render');
  else if(statusSource==='render'&&renderErrors.length===0)message('Rendering layer graphs');
}
let elapsed=0;
function loop(now){if(!paused&&now-lastTime>1000/30){elapsed+=lastTime?Math.min(.1,(now-lastTime)/1000):1/30;lastTime=now;draw(elapsed);}requestAnimationFrame(loop);}

function renderLibrary(){
  const groups={Control:['value','oscillator','audio','map'],Image:['emitter','effect','blend','output']};
  for(const [name,types] of Object.entries(groups)){
    $('library').append(el('div','library-group',name));
    for(const type of types){
      const b=el('button','library-node',TYPES[type].label);b.draggable=true;b.dataset.type=type;b.append(el('span','',TYPES[type].description));
      b.addEventListener('dragstart',e=>e.dataTransfer.setData('application/audiograph-node',type));b.onclick=()=>addNode(type,(40-view.x)/view.zoom,(40-view.y)/view.zoom);$('library').append(b);
    }
  }
}
function selectNode(id){selected=id;renderGraph();renderProperties();}
function renderGraph(){
  const g=graph();$('graphName').textContent=g.name;$('nodes').replaceChildren();$('wires').replaceChildren();
  for(const n of g.nodes){
    const box=el('article','node'+(n.id===selected?' selected':''));box.dataset.id=n.id;box.style.left=n.x+'px';box.style.top=n.y+'px';
    const head=el('div','node-head',TYPES[n.type].label),summary=n.type==='emitter'?emitterNames[n.props.mode]:n.type==='effect'?n.props.kind:n.type==='audio'?n.props.band:n.type==='value'?String(n.props.value):n.type==='oscillator'?n.props.rate+' Hz':null;
    if(summary)head.append(el('div','node-summary',summary));box.append(head);
    const ports=el('div','ports');
    for(const [direction,definitions] of [['in',TYPES[n.type].inputs],['out',TYPES[n.type].outputs]])for(const [key,type] of Object.entries(definitions)){
      const connected=g.edges.some(e=>direction==='in'?e.to===n.id&&e.input===key:e.from===n.id&&e.out===key);
      const port=el('button',`port ${direction} ${type}${connected?' connected':''}`,key);
      port.dataset.node=n.id;port.dataset.port=key;port.dataset.direction=direction;port.title=`${direction==='in'?'Input':'Output'}: ${key} (${type})`;
      if(pending?.id===n.id&&pending?.port===key&&direction==='out')port.classList.add('pending');
      port.onclick=e=>{
        e.stopPropagation();
        if(direction==='out'){pending={id:n.id,port:key};message(`Connect ${key} (${type}) to a matching input. Escape cancels.`);renderGraph();}
        else if(pending){connection(pending.id,pending.port,n.id,key);pending=null;renderGraph();}
        else message('Click an output port first, then this input.',true);
      };
      ports.append(port);
    }
    box.append(ports);box.addEventListener('pointerdown',e=>{if(!e.target.closest('.port')){selected=n.id;renderProperties();document.querySelectorAll('.node').forEach(e=>e.classList.toggle('selected',e.dataset.id===n.id));}});
    head.addEventListener('pointerdown',event=>startMove(event,n,box));
    $('nodes').append(box);
  }
  applyView();requestAnimationFrame(renderWires);
}
function renderWires(){
  $('wires').replaceChildren();
  const find=(id,port,dir)=>[...$('nodes').querySelectorAll('.port')].find(e=>e.dataset.node===id&&e.dataset.port===port&&e.dataset.direction===dir);
  const bounds=$('graphViewport').getBoundingClientRect();
  for(const edge of graph().edges){
    const a=find(edge.from,edge.out,'out'),b=find(edge.to,edge.input,'in');if(!a||!b)continue;
    const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();
    const x1=(ar.right-bounds.left-view.x)/view.zoom,y1=(ar.top+ar.height/2-bounds.top-view.y)/view.zoom;
    const x2=(br.left-bounds.left-view.x)/view.zoom,y2=(br.top+br.height/2-bounds.top-view.y)/view.zoom;
    const bend=Math.max(50,Math.abs(x2-x1)*.45),wire=document.createElementNS('http://www.w3.org/2000/svg','path');
    wire.setAttribute('d',`M ${x1} ${y1} C ${x1+bend} ${y1},${x2-bend} ${y2},${x2} ${y2}`);
    wire.setAttribute('class','wire'+(TYPES[graph().nodes.find(n=>n.id===edge.from).type].outputs[edge.out]==='image'?' image':''));
    wire.setAttribute('tabindex','0');wire.setAttribute('role','button');wire.setAttribute('aria-label',`Remove connection ${edge.out} to ${edge.input}`);
    const remove=()=>edit((p,g)=>{g.edges=g.edges.filter(e=>!(e.from===edge.from&&e.out===edge.out&&e.to===edge.to&&e.input===edge.input));},'Removed connection');
    wire.onclick=remove;wire.onkeydown=e=>{if(e.key==='Enter'||e.key==='Delete')remove();};$('wires').append(wire);
  }
}
function applyView(){$('graphWorld').style.transform=`translate(${view.x}px,${view.y}px) scale(${view.zoom})`;}
function startMove(event,n,box){
  if(event.button!==0)return;event.preventDefault();const before=clone(state),start={x:event.clientX,y:event.clientY,nx:n.x,ny:n.y};box.setPointerCapture(event.pointerId);
  const move=e=>{n.x=Math.max(-10000,Math.min(10000,start.nx+(e.clientX-start.x)/view.zoom));n.y=Math.max(-10000,Math.min(10000,start.ny+(e.clientY-start.y)/view.zoom));box.style.left=n.x+'px';box.style.top=n.y+'px';renderWires();};
  const end=()=>{box.removeEventListener('pointermove',move);box.removeEventListener('pointerup',end);box.removeEventListener('pointercancel',end);attempt(()=>commit(state,'Moved node',before));};
  box.addEventListener('pointermove',move);box.addEventListener('pointerup',end);box.addEventListener('pointercancel',end);
}
function property(label,input){const wrapper=el('label','property',label);wrapper.append(input);$('properties').append(wrapper);}
function renderProperties(){
  const node=graph().nodes.find(n=>n.id===selected),root=$('properties');root.replaceChildren();
  if(!node){root.append(el('p','','Select a node to edit its properties.'));return;}
  root.append(el('h3','',TYPES[node.type].label),el('div','node-type',TYPES[node.type].description));
  for(const [key,schema] of Object.entries(TYPES[node.type].props)){
    if(node.type==='emitter'&&key==='text'&&node.props.mode!=='text')continue;
    let input;
    if(schema.kind==='select'){
      input=el('select');input.setAttribute('aria-label',schema.label);
      if(node.type==='emitter'&&key==='mode'){
        for(const [category,entries] of Object.entries(EMITTERS)){const group=el('optgroup');group.label=category;for(const [id,label] of entries){const o=el('option','',label);o.value=id;group.append(o);}input.append(group);}
      }else for(const option of schema.choices){const o=el('option','',option);o.value=option;input.append(o);}
    }else{
      input=el('input');input.type=schema.kind==='text'?'text':'number';
      if(schema.kind==='number'){input.min=schema.min;input.max=schema.max;input.step=schema.step;}else input.maxLength=schema.max;
    }
    input.value=node.props[key];input.dataset.property=key;
    input.onchange=()=>edit((p,g)=>{g.nodes.find(n=>n.id===node.id).props[key]=schema.kind==='number'?Number(input.value):input.value;},`Updated ${schema.label}`);
    property(schema.label,input);
  }
  if(node.type==='emitter'){
    root.append(el('p','','Control “drive” is a scalar spectrum amplitude. Audio bands are shared; the oscillator demo works without media.'));
    const kind=['image','pixelwarp'].includes(node.props.mode)?'image':node.props.mode==='video'?'video':node.props.mode==='object'?'object':null;
    if(kind){
      const file=el('input');file.type='file';file.accept=kind==='image'?'image/png,image/jpeg,image/webp,image/gif,image/avif':kind==='video'?'video/*':'.obj';
      file.onchange=async()=>{try{if(!file.files[0])return;if(!engines.has(node.id))engines.set(node.id,new EmitterEngine(node.id,m=>message(m,true)));await engines.get(node.id).media(file.files[0],kind);message('Loaded '+file.files[0].name);renderProperties();if(paused)draw(elapsed);}catch(e){message(e.message,true);}};
      file.id='emitterMedia';property(`Load ${kind==='object'?'OBJ':kind} (not saved)`,file);
      root.append(el('p','',engines.get(node.id)?.mediaName||'No external media loaded'));
    }
    if(node.props.mode==='simsplat')root.append(el('p','','Uses Audiograph’s built-in Gaussian splat demo; importing splat files is deferred.'));
    if(node.props.mode==='custom')root.append(el('p','','Built-in Math expression only. Custom code / expressions are not imported or evaluated from projects.'));
  }
  const button=el('button','','Delete node');button.id='deleteNode';button.onclick=removeSelected;root.append(button);
}
function renderLayers(){
  $('layers').replaceChildren();
  for(const g of state.layers){
    const row=el('div','layer-row'+(g.id===active?' active':'')),top=el('div','layer-top'),visible=el('input');visible.type='checkbox';visible.checked=g.visible;visible.setAttribute('aria-label',`Show ${g.name}`);
    visible.onchange=()=>edit(p=>{p.layers.find(l=>l.id===g.id).visible=visible.checked;},'Changed layer visibility');
    const select=el('button','layer-select',g.name);select.onclick=()=>{active=g.id;selected=null;pending=null;renderUI();};
    const remove=el('button','remove-layer','×');remove.title='Delete layer';remove.disabled=state.layers.length===1;remove.onclick=()=>edit(p=>{p.layers=p.layers.filter(l=>l.id!==g.id);},'Deleted layer graph');
    top.append(visible,select,remove);row.append(top);
    const opacity=el('input');opacity.type='range';opacity.min=0;opacity.max=1;opacity.step=.01;opacity.value=g.opacity;opacity.setAttribute('aria-label',`${g.name} opacity`);
    opacity.oninput=()=>{caption.textContent=Math.round(Number(opacity.value)*100)+'%';};opacity.onchange=()=>edit(p=>{p.layers.find(l=>l.id===g.id).opacity=Number(opacity.value);},'Changed layer opacity');
    const caption=el('span','',Math.round(g.opacity*100)+'%'),bottom=el('div','layer-opacity');bottom.append(opacity,caption);row.append(bottom);$('layers').append(row);
  }
  $('addLayer').disabled=state.layers.length>=4||state.layers.flatMap(g=>g.nodes).filter(n=>n.type==='emitter').length>=4;
}
function renderUI(){renderGraph();renderProperties();renderLayers();$('undo').disabled=!history.length;$('redo').disabled=!future.length;}

const audio={context:null,buffer:null,source:null,analyser:null,data:null};
function stopAudio(){if(audio.source){audio.source.onended=null;audio.source.stop();audio.source.disconnect();audio.source=null;}$('play').textContent='Play';}
$('audioFile').onchange=async()=>{
  try{
    const file=$('audioFile').files[0];if(!file)return;if(file.size>120*1024*1024)throw Error('Audio limit is 120 MB');
    stopAudio();audio.buffer=null;audio.context??=new AudioContext();audio.buffer=await audio.context.decodeAudioData(await file.arrayBuffer());$('audioName').textContent=file.name+' · press Play';message('Audio loaded. Connect an Audio band node to drive an Emitter.');
  }catch(error){message('Audio: '+error.message,true);}
};
$('play').onclick=async()=>{
  try{
    if(!audio.buffer)throw Error('Load an audio file before pressing Play');
    if(audio.source){stopAudio();return;}
    await audio.context.resume();audio.analyser??=audio.context.createAnalyser();audio.analyser.fftSize=2048;audio.analyser.smoothingTimeConstant=.75;
    audio.data=new Uint8Array(audio.analyser.frequencyBinCount);audio.analyser.disconnect();audio.analyser.connect(audio.context.destination);
    const source=audio.context.createBufferSource();source.buffer=audio.buffer;source.connect(audio.analyser);audio.source=source;source.onended=()=>{if(audio.source===source){audio.source=null;$('play').textContent='Play';}};source.start();$('play').textContent='Stop';message('Playing shared audio');
  }catch(error){message(error.message,true);}
};
$('stop').onclick=()=>{stopAudio();message('Audio stopped');};
$('pause').onclick=()=>{paused=!paused;lastTime=0;$('pause').textContent=paused?'Resume':'Pause';message(paused?'Visuals paused. Audio transport remains independent.':'Visuals resumed');};
$('undo').onclick=undo;$('redo').onclick=redo;$('addLayer').onclick=addLayer;
$('save').onclick=()=>attempt(()=>{localStorage.setItem('audiograph-pro-v1',JSON.stringify(validate(state)));message('Saved in this browser. External media is not stored.');});
$('restore').onclick=()=>attempt(()=>{const raw=localStorage.getItem('audiograph-pro-v1');if(!raw)throw Error('No Audiograph Pro project saved in this browser');importProject(JSON.parse(raw));});
$('export').onclick=()=>attempt(()=>{const blob=new Blob([JSON.stringify(validate(state),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='audiograph-pro.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message('Exported JSON. Reload external media after import.');});
$('import').onchange=async()=>{try{const file=$('import').files[0];if(!file)return;if(file.size>1024*1024)throw Error('Project JSON limit is 1 MB');importProject(JSON.parse(await file.text()));}catch(error){message('Import: '+error.message,true);}finally{$('import').value='';}};
$('helpButton').onclick=()=>$('help').showModal();$('closeHelp').onclick=()=>$('help').close();
const viewport=$('graphViewport');
viewport.ondragover=e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';};
viewport.ondrop=e=>{e.preventDefault();const type=e.dataTransfer.getData('application/audiograph-node');if(!Object.hasOwn(TYPES,type))return;const r=viewport.getBoundingClientRect();addNode(type,(e.clientX-r.left-view.x)/view.zoom,(e.clientY-r.top-view.y)/view.zoom);};
viewport.onpointerdown=event=>{
  if(event.target.closest('.node')||event.target.closest('.wire')||event.button!==0)return;
  viewport.focus();selected=null;pending=null;renderProperties();const start={x:event.clientX,y:event.clientY,vx:view.x,vy:view.y};viewport.setPointerCapture(event.pointerId);
  const move=e=>{view.x=start.vx+e.clientX-start.x;view.y=start.vy+e.clientY-start.y;applyView();};
  const end=()=>{viewport.removeEventListener('pointermove',move);viewport.removeEventListener('pointerup',end);viewport.removeEventListener('pointercancel',end);renderGraph();};
  viewport.addEventListener('pointermove',move);viewport.addEventListener('pointerup',end);viewport.addEventListener('pointercancel',end);
};
function zoom(factor,cx=viewport.clientWidth/2,cy=viewport.clientHeight/2){const next=Math.max(.3,Math.min(1.8,view.zoom*factor)),ratio=next/view.zoom;view.x=cx-(cx-view.x)*ratio;view.y=cy-(cy-view.y)*ratio;view.zoom=next;applyView();}
viewport.addEventListener('wheel',e=>{e.preventDefault();const r=viewport.getBoundingClientRect();zoom(e.deltaY<0?1.08:1/1.08,e.clientX-r.left,e.clientY-r.top);},{passive:false});
$('zoomIn').onclick=()=>zoom(1.15);$('zoomOut').onclick=()=>zoom(1/1.15);$('fit').onclick=()=>{view.x=15;view.y=20;view.zoom=Math.min(.85,(viewport.clientWidth-35)/800);applyView();};
document.addEventListener('keydown',e=>{
  if(e.target.closest('input,textarea,select')||$('help').open)return;
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();}
  else if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();}
  else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();removeSelected();}
  else if(e.key==='Escape'){pending=null;renderGraph();message('Connection cancelled');}
});
window.addEventListener('resize',()=>requestAnimationFrame(renderWires));
window.addEventListener('pagehide',()=>{for(const engine of engines.values())engine.dispose();stopAudio();audio.context?.close();});
window.pro={
  getProject:()=>clone(state),validate,importProject,addNode,addLayer,connect:connection,undo,redo,
  select:id=>selectNode(id),selectLayer:id=>{if(!state.layers.some(g=>g.id===id))throw Error('Missing layer');active=id;selected=null;renderUI();},
  setProperty:(id,key,value)=>edit((p,g)=>{const n=g.nodes.find(n=>n.id===id);if(!n)throw Error('Missing node');n.props[key]=value;},'Updated node property'),
  stats:()=>({frame,paused,active,errors:[...renderErrors],bands:{...latestBands},engines:Object.fromEntries([...engines].map(([id,e])=>[id,e.stats()]))}),
  draw:()=>draw(elapsed),engine:id=>engines.get(id)
};
reconcile();renderLibrary();renderUI();$('fit').click();requestAnimationFrame(loop);
