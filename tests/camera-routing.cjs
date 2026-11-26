const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
  const graph=await import(pathToFileURL(path.resolve(__dirname,'../pro/graph.js')));
  const {cameraPose,advanceCamera}=await import(pathToFileURL(path.resolve(__dirname,'../pro/camera.js')));
  const {node,project,validate,routeVisual,legacyCameraNotice,SCENE_CAMERA}=graph;
  const raw=project(),g=raw.layers[0],merge=g.nodes.find(n=>n.type==='merge'),output=g.nodes.find(n=>n.type==='output');
  assert.ok(g.edges.some(e=>e.from===merge.id&&e.to===output.id),'New scenes have Merge connected to Output');
  merge.props.a=.3;
  const voices=[];
  for(let i=0;i<7;i++){
    const voice=node('waveform2d');voices.push(voice);g.nodes.push(voice);routeVisual(g,voice,'shape');
  }
  const clean=validate(raw);
  assert.equal(clean.layers[0].nodes.find(n=>n.id===merge.id).props.a,.3,'Growing Merge preserves existing opacity settings');
  assert.equal(clean.layers[0].nodes.filter(n=>n.type==='merge').length,3,'Full Merge nodes grow without replacing existing inputs');
  assert.ok(voices.every(n=>clean.layers[0].edges.some(e=>e.from===n.id&&e.auto)),'Every added generator is routed');
  const count=g.edges.length;routeVisual(g,voices[0],'shape');
  assert.equal(g.edges.length,count,'Already-routed generators are not duplicated');
  const background=node('background');g.nodes.push(background);
  const previous=g.edges.find(e=>e.to===output.id).from;routeVisual(g,background,'image');
  const root=g.edges.find(e=>e.to===output.id).from;
  assert.ok(g.edges.some(e=>e.from===background.id&&e.to===root&&e.input==='a'));
  assert.ok(g.edges.some(e=>e.from===previous&&e.to===root&&e.input==='b'),'New backgrounds stay behind the existing scene');
  validate(raw);
  const legacy=project();legacy.version=16;
  const layer=legacy.layers[0],pal=layer.nodes.find(n=>n.type==='palette'),target=layer.nodes.find(n=>n.type==='merge');
  const cam=node('camera3d',0,0,{turn:42,orbit:-20,orbitSound:30}),unused=node('camera3d',0,0,{turn:-90});
  layer.nodes.push(unused,cam);legacy.settings.camera=null;
  layer.edges=layer.edges.filter(e=>e.from!==pal.id);
  layer.edges.push({from:pal.id,out:'shape',to:cam.id,input:'shape'},{from:cam.id,out:'shape',to:target.id,input:'a'});
  const migrated=validate(legacy);
  assert.equal(migrated.settings.camera.turn,42,'A disconnected camera cannot replace the active camera');
  assert.equal(migrated.settings.camera.motion,'orbit');
  assert.equal(migrated.settings.camera.speed,-20);
  assert.equal(migrated.settings.camera.audio,30);
  assert.equal(migrated.layers[0].nodes.some(n=>n.type==='camera3d'),false);
  assert.ok(migrated.layers[0].edges.some(e=>e.from===pal.id&&e.to===target.id),'Migration heals camera shape wires');
  assert.match(legacyCameraNotice(legacy),/Conflicting legacy cameras/);
  assert.deepEqual(validate(migrated),migrated,'Migration is idempotent');
  for(const motion of ['orbit','pendulum','dolly','spiral']){
    const c={...SCENE_CAMERA,motion};
    const phase=advanceCamera(0,c,.5,.8),pose=cameraPose(c,phase);
    assert.ok(phase>0);
    assert.ok(Object.values(pose).filter(v=>typeof v==='number').every(Number.isFinite));
    assert.ok(advanceCamera(0,{...c,audio:100},.5,1)>advanceCamera(0,c,.5,0),'Audio influences scene movement');
    const start=cameraPose(c,0),end=cameraPose(c,Math.PI*2);
    for(const k of ['zoom','tilt'])assert.ok(Math.abs(start[k]-end[k])<1e-8,'Camera paths loop without a jump');
  }
  assert.equal(advanceCamera(1,{...SCENE_CAMERA,motion:'static'},1,1),0,'Static camera does not animate');
  assert.equal(advanceCamera(1,{...SCENE_CAMERA,motion:'orbit'},0,1),1,'Paused movement preserves its phase');
  assert.ok(cameraPose({...SCENE_CAMERA,motion:'dolly'},Math.PI/2).zoom>SCENE_CAMERA.zoom);
  const spiral=cameraPose({...SCENE_CAMERA,motion:'spiral'},Math.PI/2);
  assert.ok(spiral.zoom!==SCENE_CAMERA.zoom&&spiral.tilt!==SCENE_CAMERA.tilt,'Spiral changes both radius and elevation');
  const bad=project();bad.settings.camera.motion='unknown';
  assert.throws(()=>validate(bad),/Movement/,'Unknown camera presets are rejected');
  console.log('ok - Universal camera migration, looping motion, audio influence, default Merge and automatic routing');
})().catch(error=>{console.error(error);process.exitCode=1;});
