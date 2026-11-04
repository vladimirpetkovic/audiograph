// First Mile: the interactive tutorial. Like the original Audiograph's tutorial it builds one look step by step,
// but here every step is a real node graph, so the finished scene stays editable when the tour ends.
import {node} from './graph.js';

const SEEN='agpro.tourSeen';
// Chain order of the tutorial graph; each step shows the nodes it has reached so far.
const CHAIN=['A','W','PT','T','P','B','TR','O'];
const SPEC={
  A:['audioIn',{}],W:['waveform2d',{mode:'linear',lineShape:'pins',thick:2,outline:true}],PT:['particles',{density:30,energy:1.6,trail:35,size:5}],T:['twist',{amount:30}],
  P:['palette',{c1:'#0a1028',c2:'#3b5bdb',c3:'#c2255c',c4:'#ffe066'}],B:['bloom',{bloom:35}],TR:['trails',{trails:79,feedback:19,smooth:100}],O:['output',{}],
  L:['oscillator',{rate:.12,depth:.8,offset:.1}],
  A2:['audioIn',{}],C:['gpuParticles',{mode:'simfluid'}],P2:['palette',{c1:'#0a1028',c2:'#3b5bdb',c3:'#c2255c',c4:'#ffe066'}],O2:['output',{}]
};
const IN={W:'audio',PT:'shape',T:'shape',P:'shape',B:'image',TR:'image',O:'image'};
const OUT={A:'audio',W:'shape',PT:'shape',T:'shape',P:'shape',B:'image',TR:'image'};

export const STEPS=[
  {t:'Choose your Audio source',sel:['#audioName','#spectrum'],keys:['A','W','O'],ban:'Pick your <b>Audio source</b>',
    txt:'Everything starts with sound. Click the source name to load a song, or use the Mic or System audio. Until then the default track plays (it starts on your first click).'},
  {t:'Nodes and wires',sel:'#graphViewport',keys:['A','W','O'],ban:'Sound flows through <b>Nodes</b>',
    txt:'Each box is a node that does one thing. Sound flows along the wires from Audio into a Waveform that draws it, then into Output: what you see.'},
  {t:'Tune it in the Inspector',sel:'.inspector',keys:['A','W','O'],spiral:true,select:'W',ban:'Tune it in the <b>Inspector</b>',
    txt:'Click any node and its knobs appear here. We switched the Waveform to Spiral. Drag a knob to change it, or double-click to type a value.'},
  {t:'Add from the Library',sel:'.library',keys:['A','W','T','O'],spiral:true,select:'T',ban:'Add nodes from the <b>Library</b>',
    txt:'Every node lives in the library. Select a node, then click a library item and it is inserted right after it. We added Twist to bend the spiral.'},
  {t:'Choose your Colors',node:'P',keys:['A','W','T','P','O'],spiral:true,select:'P',ban:'Choose your <b>Colors</b>',
    txt:'Without a Palette, shapes draw in grayscale. Click its ramp to add a colour, click a stop to change it.'},
  {t:'Add Particles',node:'PT',keys:['A','W','PT','T','P','O'],spiral:true,select:'PT',ban:'Add <b>Particles</b>',
    txt:'Particles are thrown off the shape by the music. Density, life and size shape the sparkle.'},
  {t:'Finish with Post FX',node:['B','TR'],keys:['A','W','PT','T','P','B','TR','O'],spiral:true,select:'B',ban:'Finish with <b>Post FX</b>',
    txt:'Post FX polish the finished image: Bloom adds glow, Trails leave a soft echo of motion.'},
  {t:'Let something drive a knob',node:'L',keys:CHAIN,spiral:true,lfo:true,select:'L',ban:'Drive a knob with an <b>LFO</b>',
    txt:'Drag any number output (bass, beat, an LFO, your mouse, MIDI) onto a node and pick the knob it moves. Here an LFO slowly turns the Twist.'},
  {t:'Stack Layers',sel:'.graph-head',keys:CHAIN,spiral:true,lfo:true,layer2:true,ban:'Stack <b>Layers</b>',
    txt:'Each graph is one layer. + Layer adds another and they stack in the preview. We added a Fluid layer (a WebGPU simulation, screened over the first): switch layers with these tabs.'},
  {t:'Start from a Template',sel:['#templates','#randomGraph'],ban:'Start from a <b>Template</b>',
    txt:'Templates load ready-made looks, including every original Audiograph preset. Random builds a surprise graph. Undo always brings your scene back.'},
  {t:'Projection Mapping',sel:'#modeMap',ban:'Projection <b>Mapping</b>',
    txt:'Mapping fits the output onto walls, objects and screens: start from a layout such as a cube or triptych, then drag the corners onto what the projector hits.'},
  {t:'Autopilot',sel:'#modeAuto',ban:'Let <b>Autopilot</b> play',
    txt:'Autopilot follows the music and makes new looks at each section. Describe a vibe to steer it, or use Preset Morph to glide between the original presets.'},
  {t:'Record and Perform',sel:['#record','#snap','.transport-side.end'],ban:'Record and <b>Perform</b>',
    txt:'Record captures video with its audio and the camera saves a PNG. Pick the resolution, go fullscreen (F), or Detach the output into a window for a projector.'},
  {t:'Save your Scene',sel:['label:has(#import)','#save','#restore'],last:true,ban:'Save your <b>Scene</b>',
    txt:'Save → Save scene writes an .ag file wherever you choose (⌘S); Save as template adds it to Templates → User templates. Open loads a scene back. The ? button opens the full Guide. Your tutorial scene stays: keep playing!'}
];
STEPS.forEach((s,i)=>{if(!s.keys){const prev=STEPS.slice(0,i).reverse().find(p=>p.keys);Object.assign(s,{keys:prev.keys,spiral:prev.spiral,lfo:prev.lfo,layer2:prev.layer2,scene:'keep'});}});

// The scene each step shows; steps 1-2 start from a plain straight-line waveform.
function sceneOf(s,ids){
  const make=(k,props={})=>{const [type,p]=SPEC[k],n=node(type,0,80,{...p,...props});n.id=ids[k];return n;};
  const keys=CHAIN.filter(k=>s.keys.includes(k)),nodes=keys.map((k,i)=>{const n=make(k,k==='W'?(s.spiral?{mode:'spiral'}:{lineShape:'straight',outline:false}):{});n.x=40+i*210;return n;}),edges=[];
  for(let i=1;i<keys.length;i++)edges.push({from:ids[keys[i-1]],out:OUT[keys[i-1]],to:ids[keys[i]],input:IN[keys[i]]});
  if(s.lfo){const l=make('L'),t=nodes.find(n=>n.id===ids.T);l.x=t.x;l.y=300;nodes.push(l);edges.push({from:ids.L,out:'value',to:ids.T,input:'amount'});}
  const layers=[{id:ids.G1,name:'Tutorial',visible:true,opacity:1,blend:'source-over',nodes,edges}];
  if(s.layer2){const k2=['A2','C','P2','O2'],n2=k2.map((k,i)=>{const n=make(k);n.x=40+i*210;return n;});
    layers.push({id:ids.G2,name:'Fluid',visible:true,opacity:1,blend:'screen',nodes:n2,
      edges:[{from:ids.A2,out:'audio',to:ids.C,input:'audio'},{from:ids.C,out:'shape',to:ids.P2,input:'shape'},{from:ids.P2,out:'shape',to:ids.O2,input:'image'}]});}
  return layers;
}
const newIds=()=>Object.fromEntries([...Object.keys(SPEC),'G1','G2'].map(k=>[k,crypto.randomUUID()]));
// The scene the studio opens with (and Reset returns to): Audio → straight-line Linear waveform → Palette (Classic) → Output.
export function startScene(){
  const ids=newIds(),W=node('waveform2d',0,80,{mode:'linear',lineShape:'straight',outline:false}),A=node('audioIn',0,80,{}),P=node('palette',0,80,{}),O=node('output',0,80,{});
  const nodes=[A,W,P,O];nodes.forEach((n,i)=>{n.x=40+i*210;});
  return [{id:ids.G1,name:'Scene',visible:true,opacity:1,blend:'source-over',nodes,
    edges:[{from:A.id,out:'audio',to:W.id,input:'audio'},{from:W.id,out:'shape',to:P.id,input:'shape'},{from:P.id,out:'shape',to:O.id,input:'image'}]}];
}

// api: setScene(layers,first), select(id), workspace(w), play(), stopAutomation(), zoom()
export function createTour(api){
  let idx=-1,live=false,timer=0,ids=null,els=null,inviting=false;
  const $=id=>document.getElementById(id);
  const scene=s=>sceneOf(s,ids);
  function build(){
    if(els)return;
    const ring=document.createElement('div'),card=document.createElement('div'),ban=document.createElement('div');
    ring.id='tourRing';card.id='tourCard';ban.id='tourBanner';card.setAttribute('role','dialog');card.setAttribute('aria-live','polite');
    card.innerHTML='<div class="tour-step" id="tourStep"></div><div class="tour-title" id="tourTitle"></div><div class="tour-txt" id="tourTxt"></div><div class="tour-dots" id="tourDots"></div><div class="tour-btns"><button class="btn" id="tourSkip">Skip</button><span style="flex:1"></span><button class="btn" id="tourBack">Back</button><button class="btn teal" id="tourNext">Next</button></div>';
    document.body.append(ring,card);($('previewWrap')||document.body).append(ban);els={ring,card,ban};
    $('tourSkip').onclick=stop;$('tourBack').onclick=()=>go(idx-1);$('tourNext').onclick=next;
    document.addEventListener('keydown',e=>{if(!live||e.target.closest?.('input,select,textarea,[contenteditable]'))return;if(e.key==='Escape')stop();else if(e.key==='ArrowRight')next();else if(e.key==='ArrowLeft'&&idx>0)go(idx-1);else return;e.preventDefault();e.stopPropagation();},true);
  }
  const show=(el,on)=>{el.classList.toggle('show',on);};
  function targets(s){
    const sels=s.node?[].concat(s.node).map(k=>`#nodes .node[data-id="${ids[k]}"]`):[].concat(s.sel);
    return sels.map(q=>document.querySelector(q)).filter(e=>e&&e.getClientRects().length);
  }
  function place(){
    if(!live&&!inviting)return;
    const z=api.zoom(),vw=innerWidth/z,vh=innerHeight/z,narrow=innerWidth<=900,cs=els.card.style;
    const s=STEPS[idx],ts=live&&s?targets(s):[];
    if(ts.length){
      const rs=ts.map(t=>t.getBoundingClientRect()),l=Math.min(...rs.map(r=>r.left))/z,t=Math.min(...rs.map(r=>r.top))/z,r=Math.max(...rs.map(r=>r.right))/z,b=Math.max(...rs.map(r=>r.bottom))/z;
      const top=Math.max(2,t-5),bot=Math.min(vh-2,b+5),rg=els.ring.style;
      rg.left=Math.max(2,l-5)+'px';rg.top=top+'px';rg.width=Math.max(10,Math.min(vw-4,r+5)-Math.max(2,l-5))+'px';rg.height=Math.max(10,bot-top)+'px';show(els.ring,true);
      // Keep the card on the side of the screen away from the highlight.
      const low=(top+bot)/2>vh*.5,right=(l+r)/2<vw*.5;
      if(narrow){cs.left='8px';cs.right='8px';cs.width='auto';cs.top=low?'54px':'auto';cs.bottom=low?'auto':'34px';}
      else{cs.width='340px';cs.left=right?'auto':'24px';cs.right=right?'24px':'auto';cs.top=low?'58px':'auto';cs.bottom=low?'auto':'38px';}
    }else{show(els.ring,false);if(narrow){cs.left='8px';cs.right='8px';cs.width='auto';}else{cs.width='340px';cs.left='24px';cs.right='auto';}cs.top='auto';cs.bottom='38px';}
  }
  function loop(){place();timer=requestAnimationFrame(loop);}
  function go(i){
    build();idx=Math.max(0,Math.min(STEPS.length-1,i));const s=STEPS[idx];
    if(s.scene!=='keep'){api.setScene(scene(s));api.select(s.select?ids[s.select]:null);}
    api.workspace('studio');
    const ts=targets(s);ts[0]?.scrollIntoView?.({block:'nearest',inline:'nearest'});
    $('tourStep').textContent=`Step ${idx+1} of ${STEPS.length}`;$('tourTitle').textContent=s.t;$('tourTxt').textContent=s.txt;
    els.ban.innerHTML=s.ban;show(els.ban,true);
    $('tourDots').innerHTML=STEPS.map((_,n)=>`<i${n===idx?' class="on"':''}></i>`).join('');
    $('tourBack').style.visibility=idx?'visible':'hidden';$('tourNext').textContent=s.last?'Finish':'Next';
    show(els.card,true);document.body.classList.add('touring');
    if(!live){live=true;inviting=false;loop();}
  }
  function next(){if(idx>=STEPS.length-1){stop();return;}if(idx===0)api.play();go(idx+1);}
  function seen(){try{localStorage.setItem(SEEN,'1');}catch{}}
  function start(){
    build();seen();api.stopAutomation();
    ids=newIds();
    api.setScene(scene(STEPS[0]),true);idx=-1;go(0);
  }
  function stop(){
    live=false;inviting=false;cancelAnimationFrame(timer);seen();
    if(els){show(els.card,false);show(els.ring,false);show(els.ban,false);}document.body.classList.remove('touring');
    if(els){$('tourSkip').onclick=stop;$('tourNext').onclick=next;}
  }
  function invite(){
    build();inviting=true;
    $('tourStep').textContent='Welcome';$('tourTitle').textContent='New to Audiograph Pro?';
    $('tourTxt').textContent='Take the First Mile: we build a scene together, node by node, from the audio source to Post FX, then tour Mapping, Autopilot and output.';
    $('tourDots').innerHTML='';$('tourBack').style.visibility='hidden';$('tourNext').textContent='Start tutorial';
    $('tourSkip').onclick=()=>stop();$('tourNext').onclick=()=>{$('tourNext').onclick=next;$('tourSkip').onclick=stop;start();};
    place();show(els.card,true);
  }
  function maybeInvite(){
    let was=false;try{was=!!localStorage.getItem(SEEN);}catch{}
    if(!was&&!navigator.webdriver&&!/[?&]notour/.test(location.search))setTimeout(()=>{if(!live)invite();},1500);
  }
  return {start,stop,go,next,invite,maybeInvite,steps:STEPS,get index(){return idx;},get live(){return live;},get ids(){return ids&&{...ids};}};
}
