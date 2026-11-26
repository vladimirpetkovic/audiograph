import os
from playwright.sync_api import sync_playwright


BOX = """v -1 -1 -1
v 1 -1 -1
v 1 1 -1
v -1 1 -1
v -1 -1 1
v 1 -1 1
v 1 1 1
v -1 1 1
f 1 4 3 2
f 5 6 7 8
f 1 2 6 5
f 4 8 7 3
f 1 5 8 4
f 2 3 7 6
"""

with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        headless=True, args=["--ignore-gpu-blocklist"],
    )
    try:
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(os.environ.get("AUDIOGRAPH_PRO_URL", "http://127.0.0.1:8766/pro/") + "?demo")
        page.wait_for_load_state("networkidle")
        page.wait_for_function("() => window.pro")
        page.evaluate("""() => {
          pro.dissolve(false);
          pro.importProject({format:'audiograph-pro',version:pro.getProject().version,
            settings:{ground:{enabled:false},camera:{zoom:55,turn:25,tilt:18,dof:0}},
            layers:[{id:'objects',name:'Objects',visible:true,opacity:1,blend:'source-over',
              nodes:[{id:'object',type:'waveform3d',x:0,y:0,props:{mode:'model',render:'normal',modelMaterials:'palette'}},
                {id:'out',type:'output',x:400,y:0,props:{}}],
              edges:[{from:'object',out:'shape',to:'out',input:'image'}]}]});
        }""")
        page.wait_for_function("() => pro.engine('object')?.status === 'ready'")
        page.evaluate("async box => {await pro.engine('object').media(new File([box],'cube.obj'),'object');pro.draw();}", BOX)
        def render_bounds(mode):
            return page.evaluate("""mode => {
              const e=pro.engine('object'),c=e.canvas,ctx=c.getContext('2d'),d=ctx.getImageData(0,0,c.width,c.height).data;
              let x0=c.width,y0=c.height,x1=-1,y1=-1;
              for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const i=(y*c.width+x)*4;
                if(d[i+3]>(mode==='normal'?200:20)&&Math.max(d[i],d[i+1],d[i+2])>20){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}}
              return {width:x1-x0+1,height:y1-y0+1,box:[x0,y0,x1,y1]};
            }""", mode)
        poses = [
            {},
            {"moveX": .4, "moveY": .2, "moveZ": .15, "tilt": 23, "turn": -17,
             "rotation": 31, "stretchX": 145, "stretchY": 85, "stretchZ": 110, "scale": 120},
        ]
        for pose in poses:
            bounds = {}
            for mode in ["normal", "waveform", "polygons", "points"]:
                page.evaluate("""({mode,pose}) => {
                  const project=pro.getProject();Object.assign(project.layers[0].nodes.find(n=>n.id==='object').props,pose,{render:mode});
                  pro.importProject(project);
                }""", {"mode": mode, "pose": pose})
                page.wait_for_function("() => pro.stats().errors.length === 0")
                page.wait_for_function("() => pro.engine('object').w.agSim.stats().status === 'ready'", timeout=45000)
                page.wait_for_timeout(1800)
                bounds[mode] = render_bounds(mode)
            print("render bounds", bounds)
            assert not errors, errors
            assert all(b["width"] > 0 and b["height"] > 0 for b in bounds.values())
            for coordinate in range(4):
                assert max(b["box"][coordinate] for b in bounds.values())-min(b["box"][coordinate] for b in bounds.values()) < 5, bounds
        page.evaluate("""() => {
          const project=pro.getProject();project.layers[0].nodes[0].props.render='normal';pro.importProject(project);pro.select('object');
        }""")
        page.locator('.insp-fold[data-group="Transforms"] .insp-fold-head').click()
        for keys in [["moveX", "moveY", "moveZ"], ["tilt", "turn", "rotation"], ["stretchX", "stretchY", "stretchZ"]]:
            ys = [page.locator(f'[data-property="{key}"]').first.bounding_box()["y"] for key in keys]
            assert max(ys)-min(ys) < 1, (keys, ys)
        camera = page.evaluate("() => pro.getProject().settings.camera")
        for tool in ["move", "rotate", "scale"]:
            page.locator('[data-property="gizmo"]').get_by_role("button", name=tool.capitalize(), exact=True).click()
            page.wait_for_selector(f'#mapOverlay [data-gizmo="{tool}"]')
            before = page.evaluate("() => pro.getProject().layers[0].nodes[0].props")
            gesture = page.evaluate("""tool => {
              const r=document.getElementById('preview').getBoundingClientRect(),g=document.querySelector('#mapOverlay .gizmo'),c=g.querySelector('circle'),
                center=[+c.getAttribute('cx'),+c.getAttribute('cy')],convert=p=>[r.left+p[0]/960*r.width,r.top+p[1]/540*r.height];
              if(tool==='rotate'){
                const p=g.querySelectorAll('polyline')[2].getAttribute('points').split(' ')[7].split(',').map(Number),
                  a=.3,dx=p[0]-center[0],dy=p[1]-center[1];
                return [convert(p),convert([center[0]+dx*Math.cos(a)-dy*Math.sin(a),center[1]+dx*Math.sin(a)+dy*Math.cos(a)])];
              }
              const line=g.querySelector('line'),end=[+line.getAttribute('x2'),+line.getAttribute('y2')],
                start=tool==='move'?end.map((v,i)=>center[i]+(v-center[i])*.75):end,
                dx=end[0]-center[0],dy=end[1]-center[1],len=Math.hypot(dx,dy);
              return [convert(start),convert([start[0]+dx/len*45,start[1]+dy/len*45])];
            }""", tool)
            page.mouse.move(*gesture[0])
            page.mouse.down()
            page.mouse.move(*gesture[1], steps=6)
            page.mouse.up()
            after = page.evaluate("() => pro.getProject().layers[0].nodes[0].props")
            keys = {"move": ["moveX", "moveY", "moveZ"], "rotate": ["tilt", "turn", "rotation"], "scale": ["stretchX", "stretchY", "stretchZ"]}[tool]
            assert any(abs(after[key]-before[key]) > .01 for key in keys), (tool, before, after)
            assert page.evaluate("() => pro.getProject().settings.camera") == camera
            page.locator("#undo").click()
            assert page.evaluate("() => pro.getProject().layers[0].nodes[0].props") == before
        page.screenshot(path="/tmp/audiograph-object-gizmo.png")
        for mode in ["normal", "waveform", "polygons", "points"]:
            page.evaluate("""mode => {
              const project=pro.getProject(),g=project.layers[0],object=g.nodes.find(n=>n.id==='object');
              Object.assign(object.props,{render:mode,moveX:0,moveY:0,moveZ:0,tilt:0,turn:0,rotation:0,stretchX:100,stretchY:100,stretchZ:100,scale:100});
              g.nodes=g.nodes.filter(n=>!['fx','level'].includes(n.id));
              g.nodes.push({id:'level',type:'value',x:0,y:200,props:{value:.8}});
              g.edges=[{from:'object',out:'shape',to:'out',input:'image'},{from:'level',out:'value',to:'object',input:'drive'}];
              pro.importProject(project);
            }""", mode)
            page.wait_for_timeout(1000)
            neutral = render_bounds(mode)
            assert page.evaluate("() => pro.engine('object').w.__agObjectSound === null")
            page.evaluate("""() => {
              const project=pro.getProject(),g=project.layers[0];
              g.nodes.find(n=>n.id==='level').props.value=0;
              g.nodes.push({id:'fx',type:'soundEffector',x:200,y:0,props:{moveX:35,moveY:20,rotateY:35,uniformScale:50,scaleX:0,scaleY:0,scaleZ:0,grow:100,attack:5,release:50}});
              g.edges=[{from:'level',out:'value',to:'object',input:'drive'},{from:'object',out:'shape',to:'fx',input:'shape'},{from:'fx',out:'shape',to:'out',input:'image'}];
              pro.importProject(project);
            }""")
            page.wait_for_timeout(1000)
            quiet = render_bounds(mode)
            assert all(abs(a-b) < 5 for a, b in zip(neutral["box"], quiet["box"])), (mode, neutral, quiet)
            mesh_version = page.evaluate("() => pro.engine('object').w.AG_SPLAT.meshVer")
            page.evaluate("""() => {
              const project=pro.getProject();project.layers[0].nodes.find(n=>n.id==='level').props.value=.8;pro.importProject(project);
            }""")
            page.wait_for_timeout(1200)
            loud = render_bounds(mode)
            assert loud["width"] > quiet["width"]+10, (mode, quiet, loud)
            assert abs(sum(loud["box"][::2])-sum(quiet["box"][::2])) > 10, (mode, quiet, loud)
            if mode != "normal":
                sound = page.evaluate("() => pro.engine('object').w.__agObjectSound")
                assert sound["rotation"][1] > 1 and sound["scale"][0] > 1 and abs(sound["offset"][0]) > .01, sound
            if mode == "points":
                assert page.evaluate("() => pro.engine('object').w.AG_SPLAT.meshVer") == mesh_version, "Audio motion must not regenerate point data"
            page.evaluate("""() => {
              const project=pro.getProject(),g=project.layers[0];g.nodes=g.nodes.filter(n=>n.id!=='fx');
              g.edges=[{from:'level',out:'value',to:'object',input:'drive'},{from:'object',out:'shape',to:'out',input:'image'}];pro.importProject(project);
            }""")
            page.wait_for_timeout(1000)
            disconnected = render_bounds(mode)
            assert all(abs(a-b) < 5 for a, b in zip(neutral["box"], disconnected["box"])), (mode, neutral, disconnected)
        page.evaluate("""() => {
          pro.pause(true);
          pro.importProject({format:'audiograph-pro',version:pro.getProject().version,
            settings:{ground:{enabled:false},camera:{zoom:12,turn:25,tilt:18,dof:0}},
            layers:[{id:'clones',name:'Clones',visible:true,opacity:1,blend:'source-over',
              nodes:[{id:'cube',type:'waveform3d',x:0,y:0,props:{mode:'cube',render:'normal'}},
                {id:'cloner',type:'cloner',x:200,y:0,props:{countX:1,countY:1,countZ:1,moveY:0}},
                {id:'out',type:'output',x:400,y:0,props:{}}],
              edges:[{from:'cube',out:'object',to:'cloner',input:'object'},
                {from:'cloner',out:'shape',to:'out',input:'image'}]}]});
          pro.select('cloner');
        }""")
        page.wait_for_function("()=>pro.engine('cloner')?.w?.__agScene.boundsRadius>0", timeout=45000)
        transforms = page.locator('.insp-fold[data-group="Transforms"] .insp-fold-head')
        if transforms.get_attribute("aria-expanded") != "true":
            transforms.click()
        page.locator('[data-property="gizmo"]').get_by_role("button", name="Move", exact=True).click()
        def move_length():
            return page.evaluate("""() => {
              const l=document.querySelector('#mapOverlay .gizmo line');
              return Math.hypot(l.getAttribute('x2')-l.getAttribute('x1'),l.getAttribute('y2')-l.getAttribute('y1'));
            }""")
        single_length = move_length()
        page.evaluate("()=>{for(const [key,value] of [['countX',9],['countY',5],['countZ',7]])pro.setProperty('cloner',key,value);}")
        page.wait_for_function("""length=>{
          const l=document.querySelector('#mapOverlay .gizmo line');
          return Math.hypot(l.getAttribute('x2')-l.getAttribute('x1'),l.getAttribute('y2')-l.getAttribute('y1'))>length*3;
        }""", arg=single_length)
        large_length = move_length()
        radius = page.evaluate("()=>pro.engine('cloner').w.__agScene.boundsRadius")
        page.evaluate("()=>pro.setProperty('cloner','scale',150)")
        page.wait_for_function("radius=>pro.engine('cloner').w.__agScene.boundsRadius>radius*1.4", arg=radius)
        assert abs(move_length()-large_length) < 1, "Oversized Cloners keep their arrowheads on-screen"
        camera = page.evaluate("()=>pro.getProject().settings.camera")
        before = page.evaluate("()=>pro.getProject().layers[0].nodes.find(n=>n.id==='cloner').props")
        gesture = page.evaluate("""()=>{
          const r=document.getElementById('preview').getBoundingClientRect(),l=document.querySelector('#mapOverlay .gizmo line'),
            c=[+l.getAttribute('x1'),+l.getAttribute('y1')],v=[+l.getAttribute('x2')-c[0],+l.getAttribute('y2')-c[1]],
            length=Math.hypot(...v),start=c.map((x,i)=>x+v[i]*.75),
            convert=p=>[r.left+p[0]/960*r.width,r.top+p[1]/540*r.height];
          return [convert(start),convert(start.map((x,i)=>x+v[i]/length*35))];
        }""")
        page.mouse.move(*gesture[0])
        page.mouse.down()
        page.mouse.move(*gesture[1], steps=6)
        page.mouse.up()
        after = page.evaluate("()=>pro.getProject().layers[0].nodes.find(n=>n.id==='cloner').props")
        assert after["moveX"] > before["moveX"]+.01, (before, after)
        assert after["moveY"] == before["moveY"] and after["moveZ"] == before["moveZ"]
        assert page.evaluate("()=>pro.getProject().settings.camera") == camera
        page.locator("#undo").click()
        assert page.evaluate("()=>pro.getProject().layers[0].nodes.find(n=>n.id==='cloner').props") == before
        page.screenshot(path="/tmp/audiograph-cloner-gizmo.png")
        assert not errors, errors
        assert page.evaluate("() => pro.stats().errors") == []
        print("ok - Matched render poses, adaptive object/Cloner gizmos, undo and connected sound transforms")
    finally:
        browser.close()
