const assert=require('node:assert/strict');
(async()=>{
  const {validate,VERSION,applyShapeNode,defaults}=await import('../pro/graph.js');
  const old={format:'audiograph-pro',version:17,layers:[{id:'l',name:'Legacy sound',visible:true,opacity:1,blend:'source-over',
    nodes:[{id:'v',type:'value',x:0,y:0,props:{value:.5}},{id:'c',type:'cloner',x:200,y:0,props:{rigidBody:true,bodyGravity:9.81,opts:{pSimSens:150},intensity:80}},
      {id:'out',type:'output',x:800,y:0,props:{}}],
    edges:[{from:'c',out:'shape',to:'out',input:'image'},{from:'v',out:'value',to:'c',input:'opt:pSimSens'}]}]};
  const p=validate(old),g=p.layers[0],fx=g.nodes.find(n=>n.type==='soundEffector'),gravity=g.nodes.find(n=>n.type==='gravity');
  assert.ok(fx&&gravity,'Version-17 scenes migrate both implicit gravity and implicit audio');
  assert.equal(fx.props.sensitivity,150);assert.equal(fx.props.intensity,80);
  assert.equal(g.nodes.find(n=>n.id==='c').props.opts.pSimSens,undefined);
  assert.ok(g.edges.some(e=>e.from==='v'&&e.to===fx.id&&e.input==='sensitivity'),'Driven sound knobs follow their migrated owner');
  assert.deepEqual(validate(p),p,'Migration is idempotent');
  const legacyFX=structuredClone(old);legacyFX.layers[0].nodes[1]={id:'fx',type:'soundEffector',x:200,y:0,props:{rotate:90}};
  legacyFX.layers[0].nodes.unshift({id:'c',type:'cloner',x:100,y:0,props:{}});
  legacyFX.layers[0].edges=[{from:'c',out:'shape',to:'fx',input:'shape'},{from:'fx',out:'shape',to:'out',input:'image'}];
  const rotated=validate(legacyFX).layers[0].nodes.find(n=>n.id==='fx').props;
  assert.deepEqual([rotated.rotateX,rotated.rotateY,rotated.rotateZ],[45,90,0],'Legacy tumble preserves its original XYZ angles');
  const mods=applyShapeNode('soundEffector',{...defaults('soundEffector'),rotateX:30,rotateY:60,rotateZ:90,uniformScale:50},{});
  assert.equal(mods._soundEffector,true);assert.equal(mods.pG3EfRX,30);assert.equal(mods.pG3EfRY,60);assert.equal(mods.pG3EfRZ,90);assert.equal(mods.pG3EfScale,50);
  const calibrated=structuredClone(p),savedFx=calibrated.layers[0].nodes.find(n=>n.type==='soundEffector');
  Object.assign(savedFx.props,{sensitivity:125,energy:140,punch:75,responseRelease:410});
  const loadedFx=validate(calibrated).layers[0].nodes.find(n=>n.type==='soundEffector'),
    retained=applyShapeNode('soundEffector',loadedFx.props,{});
  assert.equal(retained.pSimSens,125);assert.equal(retained.pSimEnergy,140);
  assert.equal(retained._soundPunch,75);assert.equal(retained._soundRelease,410,'Removing duplicate UI knobs preserves saved response calibration');
  assert.equal(p.version,VERSION);
  console.log('ok - Explicit sound gating, XYZ/uniform transforms and legacy sound/gravity migration');
})().catch(e=>{console.error(e);process.exitCode=1;});
