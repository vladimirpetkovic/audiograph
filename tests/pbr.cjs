const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),fixture=require('./pbr-fixture.cjs');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+url.pathname+(url.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(file));
});
const scene={format:'audiograph-pro',version:10,layers:[{id:'L',name:'Imported PBR',visible:true,opacity:1,blend:'source-over',
  nodes:[{id:'o',type:'waveform3d',x:0,y:0,props:{mode:'model',render:'normal'}},
    {id:'d',type:'value',x:0,y:180,props:{value:0}},
    {id:'c',type:'camera3d',x:240,y:0,props:{orbit:0,tilt:0,dof:0}},
    {id:'out',type:'output',x:480,y:0,props:{}}],
  edges:[{from:'d',out:'value',to:'o',input:'drive'},{from:'o',out:'shape',to:'c',input:'shape'},{from:'c',out:'shape',to:'out',input:'image'}]}]};
(async()=>{
  const {parseGLTF,pose}=await import('../pro/gltf.js'),{parseUSDModel}=await import('../pro/usd-model.js');
  const buf=file=>file.buffer.buffer.slice(file.buffer.byteOffset,file.buffer.byteOffset+file.buffer.byteLength);
  const metadata=parseGLTF(buf(fixture.glb({uv1:true})),'textured.glb'),mesh=pose(metadata,-1,0);
  assert.equal(mesh.materials.length,2);assert.deepEqual(mesh.faceMaterials,[0,0,1,1]);assert.ok(mesh.uvs1);
  assert.equal(mesh.materials[0].maps[0].texCoord,1);
  const authored=pose(parseGLTF(buf(fixture.glb({authored:true})),'authored.glb'),-1,0);
  assert.ok(Math.abs(authored.pbrNormals[0][0]-Math.SQRT1_2)<1e-5,'Authored glTF normals survive fitting/reflection');
  const usd=await parseUSDModel(buf(fixture.usdz()),'textured.usdz'),usdMesh=pose(usd,-1,0);
  assert.deepEqual(usdMesh.faceMaterials,[1,1,0,0],'USD inherited binding and face subset');
  assert.equal(usdMesh.materials.length,2);
  const strong=fixture.usd().replace('rel material:binding = </Asset/Looks/Color>','rel material:binding = </Asset/Looks/Color> (bindMaterialAs = "strongerThanDescendants")');
  const strongPack=fixture.zip([['root.usda',Buffer.from(strong)],['textures/color.png',fixture.png([255,0,0,255])]]);
  assert.deepEqual(pose(await parseUSDModel(buf({buffer:strongPack}),'strong-binding.usdz'),-1,0).faceMaterials,[0,0,0,0],'Strong ancestor bindings override descendant subsets');
  const factors=fixture.usd().replace('color3f inputs:diffuseColor.connect = </Asset/Looks/Color/Texture.outputs:rgb>','color3f inputs:diffuseColor = (0.5,0.2,0.1)');
  assert.equal((await parseUSDModel(buf({buffer:Buffer.from(factors)}),'factors.usda')).materials.length,2,'Loose USD material factors do not require unused texture assets');
  await assert.rejects(parseUSDModel(buf({buffer:Buffer.from(fixture.usd())}),'loose.usda'),/Missing USD texture.*USDZ/);
  const missing=JSON.parse(fixture.gltf().buffer);delete missing.meshes[0].primitives[0].attributes.TEXCOORD_0;
  assert.throws(()=>parseGLTF(buf({buffer:Buffer.from(JSON.stringify(missing))})),/missing UV set 0/);
  const external=JSON.parse(fixture.gltf().buffer);external.images[0].uri='https://invalid.example/texture.png';
  assert.throws(()=>parseGLTF(buf({buffer:Buffer.from(JSON.stringify(external))})),/External model textures/);
  const {loadModel}=await import('../pro/map3d.js');
  const externalBytes=buf({buffer:Buffer.from(JSON.stringify(external))});
  assert.equal((await loadModel({name:'mapping.gltf',size:externalBytes.byteLength,arrayBuffer:async()=>externalBytes})).model,'mapping.gltf','Mapping reads geometry without requiring source PBR textures');
  const looseUSD=Buffer.from(fixture.usd()),looseBytes=buf({buffer:looseUSD});
  assert.equal((await loadModel({name:'mapping.usda',size:looseBytes.byteLength,arrayBuffer:async()=>looseBytes})).model,'mapping.usda','Mapping still accepts loose USD target geometry');
  const binary=fs.readFileSync(path.join(__dirname,'pbr-fixture.usdc'));
  const binaryModel=await parseUSDModel(buf(fixture.usdz(binary)),'binary-materials.usdz');
  assert.equal(binaryModel.materials.length,2,'Real USDC material relationships and assets');
  assert.deepEqual(pose(binaryModel,-1,0).faceMaterials,[1,1,0,0]);
  let browser;
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args:['--ignore-gpu-blocklist','--enable-gpu-rasterization']});
    const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto((process.env.AUDIOGRAPH_PRO_URL||`http://127.0.0.1:${server.address().port}/pro/`)+'?demo');
    try{await page.waitForFunction(()=>window.pro);}catch(error){console.error('Studio startup errors',errors);throw error;}await page.evaluate(()=>pro.dissolve(false));
    await page.evaluate(scene=>pro.importProject(scene),scene);await page.evaluate(()=>pro.select('o'));
    const load=async(file,name=file.name)=>{
      await page.locator('#emitterMedia').setInputFiles({...file,name});
      await page.waitForFunction(name=>pro.engine('o')?.mediaName===name,name,{timeout:20000});
      try{await page.waitForFunction(()=>{const e=pro.engine('o');return e&&(e.frames===0||e.w?.agSim.status()==='ready');},null,{timeout:45000});}
      catch(error){console.error('GPU startup',await page.evaluate(()=>pro.engine('o')?.w.agSim.stats()),errors);throw error;}
      await page.waitForTimeout(750);
      assert.deepEqual(await page.evaluate(()=>pro.stats().errors),[]);
      assert.deepEqual(await page.evaluate(()=>pro.engine('o').w.agSim.stats().errors),[]);
    };
    const image=()=>page.evaluate(()=>{
      const c=pro.engine('o').canvas,data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      let red=0,green=0,blue=0,filled=0,energy=0,edge=0;const signature=[],bounds=[c.width,c.height,0,0];
      for(let i=0;i<data.length;i+=4){const [r,g,b,a]=data.subarray(i,i+4);if(a>20&&Math.max(r,g,b)>20){filled++;const x=i/4%c.width,y=Math.floor(i/4/c.width);bounds[0]=Math.min(bounds[0],x);bounds[1]=Math.min(bounds[1],y);bounds[2]=Math.max(bounds[2],x);bounds[3]=Math.max(bounds[3],y);}
        if(r>g*1.3&&r>b*1.3&&r>30)red++;if(g>r*1.3&&g>b*1.3&&g>30)green++;if(b>r*1.3&&b>g*1.3&&b>30)blue++;energy+=(r+g+b)*a/255;
        if(i%128===0)signature.push(r,g,b,a);
        if(i>=4&&i%(c.width*4)!==0)edge+=(a-data[i-1])**2;
      }
      return {red,green,blue,filled,energy,edge,signature,bounds};
    });
    const changed=(a,b)=>a.signature.filter((v,i)=>Math.abs(v-b.signature[i])>8).length;
    await load(fixture.glb());
    const original=await image();console.log('PBR color receipt',JSON.stringify({...original,signature:undefined}));
    assert.ok(original.red>300&&original.green>300&&original.blue>300,'Original textured and constant materials are visible: '+JSON.stringify(await page.evaluate(()=>pro.stats())));
    assert.ok((await page.locator('#properties').textContent()).includes('Imported PBR'));
    assert.ok((await page.locator('#properties').textContent()).includes('Rendering'));
    if(process.env.AUDIOGRAPH_PBR_SCREENSHOT)await page.locator('#preview').screenshot({path:process.env.AUDIOGRAPH_PBR_SCREENSHOT});
    await page.evaluate(()=>{pro.setProperty('o','render','polygons');pro.setProperty('o','opts',{pObjGap:0,pObjNoise:0});});
    await page.waitForTimeout(450);const planar=await image();
    assert.ok(planar.bounds.every((v,i)=>Math.abs(v-original.bounds[i])<=6),'Normal and zero-gap Polygons share a camera and model bounds: '+JSON.stringify([original.bounds,planar.bounds]));
    await page.evaluate(()=>pro.setProperty('o','render','points'));
    await page.waitForFunction(()=>pro.engine('o')?.w.agSim.status()==='ready');await page.waitForTimeout(450);
    const cloud=await image();assert.ok(cloud.filled>100&&cloud.bounds.every((v,i)=>Math.abs(v-original.bounds[i])<20),'Model point cloud shares its camera framing: '+JSON.stringify([original.bounds,cloud.bounds]));
    await page.evaluate(()=>{pro.setProperty('c','dof',100);pro.setProperty('c','focus',0);});
    await page.waitForTimeout(450);assert.ok(changed(cloud,await image())>100,'Model point clouds use the shared depth of field focus plane');
    await page.evaluate(()=>pro.setProperty('c','dof',0));
    await page.evaluate(()=>{pro.setProperty('o','render','polygons');pro.setProperty('c','turn',25);pro.setProperty('c','tilt',30);});
    await page.waitForTimeout(450);const polySharp=await image();
    await page.evaluate(()=>{pro.setProperty('c','dof',100);pro.setProperty('c','focus',0);});
    await page.waitForTimeout(450);const polyBlur=await image();
    assert.ok(changed(polySharp,polyBlur)>100&&polyBlur.edge<polySharp.edge*.85,'Polygon depth of field covers face interiors and blurs silhouette edges');
    await page.evaluate(()=>{pro.setProperty('o','render','normal');pro.setProperty('c','turn',0);pro.setProperty('c','tilt',0);pro.setProperty('c','dof',0);});
    await page.waitForTimeout(450);
    const bad=JSON.parse(fixture.gltf().buffer);bad.meshes[0].primitives[0].attributes.POSITION=999;
    const rollback=await page.evaluate(async text=>{
      const e=pro.engine('o'),old=e.anim,name=e.mediaName,kind=e.mediaKind;let error='';
      try{await e.media(new File([text],'bad-geometry.gltf'),'object');}catch(e){error=e.message;}
      return {error,kept:e.anim===old&&e.mediaName===name&&e.mediaKind===kind,bitmapOpen:old.materials[0].maps[0].image.bitmap.width>0};
    },JSON.stringify(bad));
    assert.ok(rollback.error&&rollback.kept&&rollback.bitmapOpen,'Invalid geometry retains the previously loaded model and its images');
    await page.evaluate(()=>pro.setProperty('o','modelMaterials','palette'));await page.waitForTimeout(600);
    const palette=await image();assert.ok(changed(original,palette)>500,'Palette opt-out changes the model');
    await page.evaluate(()=>pro.setProperty('o','modelMaterials','imported'));await page.waitForTimeout(600);
    const restored=await image();
    assert.ok(changed(original,restored)<100,'Imported materials return without reloading: '+JSON.stringify({changed:changed(original,restored),restored:{...restored,signature:undefined},stats:await page.evaluate(()=>pro.stats())}));
    await load(fixture.glb({transform:true}),'uv-transform.glb');
    assert.ok(changed(original,await image())>300,'Texture transform changes the image');
    for(const [name,options] of Object.entries({normal:{normal:true},authored:{authored:true},vertexColors:{vertexColors:true},packed:{packed:true},metallic:{metallic:1,roughness:.1},ao:{ao:true},emissive:{emissive:true}})){
      await load(fixture.glb(options),name+'.glb');assert.ok(changed(original,await image())>100,name+' affects PBR rendering');
    }
    await load(fixture.glb({mask:true}),'cutout.glb');const masked=await image();
    assert.ok(masked.filled<original.filled*.9,'MASK alpha cuts geometry out rather than painting black');
    await load(fixture.glb({blend:true}),'transparent.glb');
    assert.ok((await image()).energy<original.energy*.95,'BLEND alpha is respected');
    await load(fixture.glb({uv1:true}),'second-uv.glb');
    assert.ok(changed(original,await image())<100,'Second UV set samples the same texture correctly');
    await load(fixture.glb({singleSided:true}),'single-sided.glb');
    assert.ok((await image()).filled>1000,'Single-sided materials have correctly oriented normals/winding');
    await page.evaluate(()=>pro.setProperty('c','turn',180));await page.waitForTimeout(400);
    assert.ok((await image()).filled<100,'Single-sided backfaces are culled');
    await page.evaluate(()=>pro.setProperty('c','turn',0));await page.waitForTimeout(300);
    for(const file of [fixture.usdz(),fixture.usdz(binary)]){
      await load(file);const rendered=await image();
      assert.ok(rendered.red>300&&rendered.green>300&&rendered.blue>300,file.name+' renders packaged USD Preview Surface textures');
    }
    const usdOriginal=await image();
    await load(fixture.usdz(null,{maps:true}),'usd-pbr-maps.usdz');
    assert.ok(changed(usdOriginal,await image())>100,'USD linear data channels, signed normals and emissive connections render');
    await load(fixture.usdz(null,{mask:true}),'usd-cutout.usdz');
    assert.ok((await image()).filled<usdOriginal.filled*.9,'USD opacity threshold cuts the surface out');
    await load(fixture.glb({animated:true}),'animated-materials.glb');
    const first=await image();await page.waitForTimeout(300);
    assert.ok(changed(first,await image())>100,'Animation updates geometry without losing textures');
    assert.deepEqual(await page.evaluate(()=>pro.engine('o').w.__agPbr.stats()),{materials:2,images:1},'Texture/material resources are reused across poses and pruned on replacement');
    await load(fixture.glb({animated:true,skinned:true,authored:true}),'skinned-materials.glb');
    const skinned=await image();await page.waitForTimeout(300);
    assert.ok(changed(skinned,await image())>100,'Skinned models retain textured PBR and posed authored normals');
    await page.evaluate(()=>pro.setProperty('o','modelMaterials','palette'));await page.waitForTimeout(300);
    assert.deepEqual(await page.evaluate(()=>pro.engine('o').w.__agPbr.stats()),{materials:0,images:0},'Palette mode releases imported GPU texture resources');
    assert.deepEqual(await page.evaluate(()=>pro.stats().errors),[]);
    assert.deepEqual(await page.evaluate(()=>pro.engine('o').w.agSim.stats().errors),[]);
    const cancelled=await page.evaluate(async bytes=>{
      const e=pro.engine('o');let finish;
      const waiting=e.media({name:'pending.glb',size:bytes.length,arrayBuffer:()=>new Promise(resolve=>{finish=resolve;})},'object');
      await Promise.resolve();e.clearMedia();finish(new Uint8Array(bytes).buffer);
      let error='';try{await waiting;}catch(e){error=e.message;}
      return {error,cleared:e.mediaKind===''&&e.anim===null};
    },Array.from(fixture.glb().buffer));
    assert.match(cancelled.error,/cancelled/);assert.ok(cancelled.cleared,'Removing a model cancels pending texture decoding');
    const cloned=JSON.parse(JSON.stringify(scene));
    cloned.layers[0].nodes.push({id:'cube',type:'waveform3d',x:0,y:300,props:{mode:'cube'}},
      {id:'cl',type:'cloner',x:120,y:0,props:{countX:4,countY:1,countZ:1}},
      {id:'li',type:'light',x:240,y:180,props:{shadow:80,floor:90}});
    cloned.layers[0].edges=cloned.layers[0].edges.filter(e=>e.to!=='c');
    cloned.layers[0].edges.push({from:'o',out:'object',to:'cl',input:'object'},{from:'cube',out:'object',to:'cl',input:'object2'},
      {from:'d',out:'value',to:'cl',input:'drive'},{from:'cl',out:'shape',to:'li',input:'shape'},{from:'li',out:'shape',to:'c',input:'shape'});
    await page.evaluate(scene=>pro.importProject(scene),cloned);await page.evaluate(()=>pro.select('o'));
    await load(fixture.glb());
    await page.waitForFunction(()=>pro.engine('cl')?.w?.agSim.status()==='ready');
    assert.deepEqual(await page.evaluate(()=>pro.stats().errors),[]);
    assert.deepEqual(await page.evaluate(()=>pro.engine('cl').w.agSim.stats().errors),[]);
    assert.deepEqual(await page.evaluate(()=>pro.engine('cl').w.__agPbr.stats()),{materials:2,images:1},'Cloner mixes PBR model groups with legacy primitives');
    assert.ok(await page.evaluate(()=>pro.pixels())>.01,'Mixed-material Cloner renders');
    await load(fixture.glb({mask:true}),'masked-shadow.glb');await page.waitForTimeout(500);
    assert.deepEqual(await page.evaluate(()=>pro.engine('cl').w.agSim.stats().errors),[],'Alpha-aware PBR shadows render without GPU errors');
    await page.evaluate(p=>{pro.engine('o').clearMedia();pro.importProject(p);pro.setProperty('c','tilt',0);pro.setProperty('c','dof',30);pro.setProperty('d','value',.85);},scene);
    const drivenBounds=async rendering=>{
      await page.evaluate(rendering=>pro.setProperty('o','render',rendering),rendering);
      if(rendering==='points')await page.waitForFunction(()=>pro.engine('o')?.w?.agSim.status()==='ready');
      await page.waitForTimeout(900);return page.evaluate(()=>{
        const c=document.getElementById('preview'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let y0=c.height,y1=0;
        for(let y=0;y<c.height;y+=2)for(let x=0;x<c.width;x+=2){const i=(y*c.width+x)*4;if(d[i]+d[i+1]+d[i+2]>120){y0=Math.min(y0,y);y1=Math.max(y1,y);}}
        return (y1-y0)/c.height;
      });
    };
    const ph=await drivenBounds('polygons'),ch=await drivenBounds('points');
    assert.ok(ph>.25&&ch>ph*.7&&ch<ph*1.4,'Audio-driven model point clouds stay framed like Polygons: '+[ph,ch]);
    await page.evaluate(()=>{pro.select('o');pro.setProperty('o','render','normal');});
    const texture=JSON.parse(fixture.gltf().buffer);texture.images[0].uri='data:image/png;base64,'+Buffer.from('not a PNG').toString('base64');
    const specular=JSON.parse(fixture.gltf().buffer);
    specular.materials[0].extensions={KHR_materials_pbrSpecularGlossiness:{}};
    for(const [name,buffer,reason] of [
      ['bad-texture.gltf',Buffer.from(JSON.stringify(texture)),/Model texture:/],
      ['specular.gltf',Buffer.from(JSON.stringify(specular)),/specular\/glossiness/],
      ['loose.usda',Buffer.from(fixture.usd()),/Missing USD texture/],
    ]){
      await load({name,buffer,mimeType:'application/octet-stream'});
      assert.equal(await page.evaluate(()=>pro.engine('o').anim.materials.length),0);
      assert.match(await page.locator('.insp-note').filter({hasText:'Geometry loaded with Palette shading'}).innerText(),reason);
      assert.ok((await image()).filled>100,'Geometry renders after material fallback: '+name);
    }
    assert.deepEqual(errors,[]);
    console.log('Imported GLB/USD PBR acceptance passed');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
