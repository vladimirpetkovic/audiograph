import os
from playwright.sync_api import sync_playwright


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
        created = page.evaluate("""() => {
          pro.dissolve(false);
          pro.pause(true);
          pro.importProject({format:'audiograph-pro',version:pro.getProject().version,
            settings:{camera:{zoom:12,tilt:32,dof:0},ground:{height:1.2}},
            layers:[{id:'l',name:'Ground',visible:true,opacity:1,blend:'source-over',
              nodes:[{id:'probe',type:'gpuParticles',x:0,y:200,props:{mode:'simparticles',intensity:0}},
                {id:'zero',type:'value',x:0,y:400,props:{value:0}},
                {id:'out',type:'output',x:600,y:0,props:{}}],
              edges:[{from:'zero',out:'value',to:'probe',input:'drive'},
                {from:'probe',out:'shape',to:'out',input:'image'}]}]});
          const id=pro.addNode('cloner');return {id,y:pro.getProject().layers[0].nodes.find(n=>n.id===id).props.moveY};
        }""")
        cloner = created["id"]
        page.wait_for_function("""({id,y})=>{
          const n=pro.getProject().layers[0].nodes.find(n=>n.id===id),s=pro.engine(id)?.w?.__agScene;
          return n.props.moveY!==y&&s&&s.nativeCollider===null;
        }""", arg=created, timeout=45000)
        assert page.evaluate("() => pro.stats().rigid.bodies") == 0, "Placement must not enable physics or colliders"
        pose = page.evaluate("id=>pro.getProject().layers[0].nodes.find(n=>n.id===id).props.moveY", cloner)
        page.evaluate("() => pro.undo()")
        assert page.evaluate("id=>pro.getProject().layers[0].nodes.every(n=>n.id!==id)", cloner), "Automatic placement must not create a separate undo step"
        page.evaluate("() => pro.redo()")
        assert page.evaluate("id=>pro.getProject().layers[0].nodes.find(n=>n.id===id).props.moveY", cloner) == pose
        page.wait_for_function("() => pro.pixels()>1", timeout=45000)
        page.evaluate("id=>pro.setProperty(id,'collide',true)", cloner)
        page.wait_for_function("id => pro.engine(id)?.w?.__agScene.nativeCollider?.verts.length>0", arg=cloner, timeout=45000)
        page.wait_for_function("""id => {
          const verts=pro.engine(id)?.w?.__agScene.nativeCollider?.verts;
          if(!verts?.length)return false;const bottom=Math.min(...verts.map(v=>v[1]));
          return bottom>1.2&&bottom<1.22;
        }""", arg=cloner, timeout=45000)
        bottom = page.evaluate("id => Math.min(...pro.engine(id).w.__agScene.nativeCollider.verts.map(v=>v[1]))", cloner)
        assert 1.2 < bottom < 1.22, bottom
        created = page.evaluate("""() => {
          const id=pro.addNode('cloner',100,100,{countX:3,countY:2,countZ:1,
            scale:150,scaleX:200,scaleY:70,scaleZ:120,rotX:25,rotZ:30,moveX:10});
          return {id,y:pro.getProject().layers[0].nodes.find(n=>n.id===id).props.moveY};
        }""")
        rotated = created["id"]
        page.wait_for_function("""({id,y})=>{
          const n=pro.getProject().layers[0].nodes.find(n=>n.id===id),s=pro.engine(id)?.w?.__agScene;
          return n.props.moveY!==y&&s&&s.nativeCollider===null;
        }""", arg=created, timeout=45000)
        assert page.evaluate("id=>pro.stats().rigid.groups.every(g=>g.id!==id)", rotated)
        page.evaluate("id=>pro.setProperty(id,'collide',true)", rotated)
        page.wait_for_function("id => pro.engine(id)?.w?.__agScene.nativeCollider?.verts.length>0", arg=rotated, timeout=45000)
        page.wait_for_function("""id => {
          const verts=pro.engine(id)?.w?.__agScene.nativeCollider?.verts;
          if(!verts?.length)return false;const bottom=Math.min(...verts.map(v=>v[1]));
          return bottom>1.2&&bottom<1.22;
        }""", arg=rotated, timeout=45000)
        bottom = page.evaluate("id => Math.min(...pro.engine(id).w.__agScene.nativeCollider.verts.map(v=>v[1]))", rotated)
        assert 1.2 < bottom < 1.22, bottom
        explicit = page.evaluate("() => pro.addNode('cloner',100,300,{countX:1,countY:1,countZ:1,moveX:-10,moveY:0})")
        page.wait_for_function("id=>pro.engine(id)?.w?.agSim.status()==='ready'", arg=explicit, timeout=45000)
        assert page.evaluate("id=>pro.getProject().layers[0].nodes.find(n=>n.id===id).props.moveY", explicit) == 0
        saved = page.evaluate("() => pro.getProject()")
        page.evaluate("project => pro.importProject(project)", saved)
        assert page.evaluate("() => pro.getProject()") == saved, "Loading a scene must not reposition existing Cloners"
        page.get_by_role("button", name="Scene settings", exact=True).click()
        colours = {}
        for colour in ["#ff0000", "#00ff00", "#000000"]:
            page.get_by_label("Ground colour", exact=True).evaluate("""(input,colour) => {
              input.value=colour;input.dispatchEvent(new Event('change',{bubbles:true}));
            }""", colour)
            page.wait_for_timeout(800)
            colours[colour] = page.evaluate("""() => {
              const c=pro.engine('__ground').canvas,d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
              let count=0,sum=[0,0,0];
              for(let i=0;i<d.length;i+=4)if(d[i+3]>10){count++;for(let j=0;j<3;j++)sum[j]+=d[i+j];}
              return {count,rgb:sum.map(v=>v/Math.max(1,count))};
            }""")
        print("ground colours", colours)
        red, green, black = [colours[colour] for colour in ["#ff0000", "#00ff00", "#000000"]]
        assert red["count"] > 1000 and green["count"] > 1000
        assert red["rgb"][0] > red["rgb"][1]*2
        assert green["rgb"][1] > green["rgb"][0]*2
        assert sum(black["rgb"]) < min(sum(red["rgb"]), sum(green["rgb"]))*.3
        page.get_by_label("Ground colour", exact=True).evaluate("e=>{e.value='#aaaaaa';e.dispatchEvent(new Event('change',{bubbles:true}));}")
        shadow_pixels = {}
        for enabled in ["true", "false"]:
            page.get_by_label("Shadows", exact=True).locator(f'button[data-value="{enabled}"]').click()
            page.wait_for_timeout(800)
            shadow_pixels[enabled] = page.evaluate("""id => {
              const c=pro.engine(id).canvas,d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
              let count=0;for(let i=0;i<d.length;i+=4)if(d[i+3]>5&&d[i+3]<200&&d[i]+d[i+1]+d[i+2]<10)count++;
              return count;
            }""", cloner)
        print("shadow pixels", shadow_pixels)
        assert shadow_pixels["true"] > shadow_pixels["false"]+100, shadow_pixels
        assert page.evaluate("() => pro.getProject().settings.lighting.shadows") is False
        page.get_by_label("Shadows", exact=True).get_by_role("button", name="On", exact=True).click()
        rotated_shadows = {}
        for angle in [0, -90, 90]:
            page.evaluate("([id,angle])=>pro.setProperty(id,'rotX',angle)", [cloner, angle])
            page.wait_for_timeout(800)
            rotated_shadows[angle] = page.evaluate("""id => {
              const c=pro.engine(id).canvas,d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
              let count=0;for(let i=0;i<d.length;i+=4)if(d[i+3]>5&&d[i+3]<200&&d[i]+d[i+1]+d[i+2]<10)count++;
              return count;
            }""", cloner)
        print("rotated shadow pixels", rotated_shadows)
        assert min(rotated_shadows.values()) > 100, rotated_shadows
        coplanar = page.evaluate("""async () => {
          const {setScene,composeScene}=await import('./scene3d.js');
          const make=(rgba)=>{
            const c=document.createElement('canvas');c.width=c.height=4;
            const d=c.getContext('2d').createImageData(4,4);
            for(let i=0;i<d.data.length;i+=4)d.data.set(rgba,i);
            c.getContext('2d').putImageData(d,0,0);return c;
          };
          const ground=make([200,200,200,128]),shadow=make([0,0,0,128]),out=make([0,0,0,0]);
          const depth=step=>{const z=8388608+step;return make([(z>>16)&255,(z>>8)&255,z&255,255]);};
          setScene(ground,{camera:'shadow-regression',depth:depth(0),roots:[]});
          const pixels=[];
          for(const step of [-1,0,1]){
            setScene(shadow,{camera:'shadow-regression',depth:depth(step),roots:[]});
            composeScene('__shadowRegression',ground,shadow,out);
            pixels.push(Array.from(out.getContext('2d').getImageData(1,1,1,1).data));
          }
          return pixels;
        }""")
        assert coplanar[0] == coplanar[1] == coplanar[2], coplanar
        assert 0 < coplanar[0][0] < 150 and coplanar[0][3] > 128, coplanar
        page.evaluate("()=>{const p=pro.getProject();p.settings.camera.tilt=-32;pro.importProject(p);}")
        page.wait_for_timeout(800)
        assert page.evaluate("""()=>{
          const c=pro.engine('__ground').canvas,d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
          return !d.some((v,i)=>i%4===3&&v>10);
        }"""), "Ground remains hidden when the camera is below its world plane"
        assert not errors, errors
        assert page.evaluate("() => pro.stats().errors") == []
        print("ok - New Cloners above ground, saved poses preserved, ground colour pixels and scene shadow toggle")
    finally:
        browser.close()
