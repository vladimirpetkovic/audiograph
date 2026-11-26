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
        page.evaluate("""() => {
            pro.dissolve(false);
            const n=(id,type,props={})=>({id,type,x:0,y:0,props});
            pro.importProject({format:'audiograph-pro',version:21,
                settings:{camera:{zoom:14,turn:-25,tilt:18},ground:{visible:true,height:-1.5}},
                layers:[
                    {id:'mesh',name:'Mesh',visible:true,opacity:1,blend:'source-over',
                     nodes:[n('cube','waveform3d',{mode:'cube',render:'normal'}),
                            n('cloner','cloner',{countX:3,countY:2,countZ:2,spacingX:160,spacingY:160,spacingZ:160}),n('out','output')],
                     edges:[{from:'cube',out:'object',to:'cloner',input:'object'},{from:'cloner',out:'shape',to:'out',input:'image'}]},
                    {id:'overlay',name:'Flat overlay',visible:true,opacity:1,blend:'source-over',
                     nodes:[n('text','plainText',{text:'FLAT',color:'#ff00ff',bounce:0}),n('flatOut','output')],
                     edges:[{from:'text',out:'image',to:'flatOut',input:'image'}]}
                ]});
        }""")
        page.wait_for_function("() => pro.engine('cloner')?.w?.__agScene?.valid")
        page.wait_for_timeout(700)
        page.evaluate("() => pro.pause(true)")
        assert page.evaluate("() => pro.getProject().settings.camera.dof") == 0
        magenta = """() => {
            const d=document.querySelector('#preview').getContext('2d').getImageData(0,0,1280,720).data;
            let n=0;for(let i=0;i<d.length;i+=4)if(d[i]===255&&d[i+1]===0&&d[i+2]===255)n++;return n;
        }"""
        flat_pixels = page.evaluate(magenta)
        assert flat_pixels > 100
        page.get_by_role("button", name="Scene settings", exact=True).click()
        lighting = page.locator('.scene-inspector fieldset').filter(has=page.get_by_label("Ambient occlusion", exact=True))
        assert lighting.locator("legend").inner_text() == "Global lighting"
        assert lighting.get_by_label("Shadows", exact=True).count() == 1
        assert lighting.get_by_label("Import HDR or EXR environment", exact=True).count() == 1
        assert lighting.get_by_label("Ambient occlusion", exact=True).get_by_role("button", name="Off", exact=True).get_attribute("aria-pressed") == "true"
        assert lighting.get_by_label("Depth haze", exact=True).get_by_role("button", name="Off", exact=True).get_attribute("aria-pressed") == "true"
        lighting.get_by_label("Ambient occlusion", exact=True).get_by_role("button", name="On", exact=True).click()
        page.wait_for_timeout(700)
        lighting.get_by_label("Depth haze", exact=True).get_by_role("button", name="On", exact=True).click()
        lighting.get_by_label("Haze colour", exact=True).evaluate(
            "e=>{e.value='#00ffff';e.dispatchEvent(new Event('change',{bubbles:true}));}"
        )
        for label, value in [("Haze strength (%)", "100"), ("Haze start", "0"), ("Haze end", "1")]:
            lighting.get_by_label(label, exact=True).evaluate("(e,value)=>{e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));}", value)
            lighting.get_by_label(label, exact=True).dispatch_event("change")
        page.wait_for_timeout(300)
        page.screenshot(path="/tmp/audiograph-global-lighting.png")
        assert page.evaluate(magenta) == flat_pixels, (flat_pixels, page.evaluate(magenta), page.evaluate("() => pro.stats().errors"))
        assert page.evaluate("() => pro.stats().errors") == []
        fixture = page.evaluate("""async () => {
            const {shadeScene}=await import('./scene-lighting.js');
            const {setScene}=await import('./scene3d.js');
            const image=document.createElement('canvas'),depth=document.createElement('canvas');
            image.width=depth.width=128;image.height=depth.height=128;
            const ctx=image.getContext('2d');ctx.fillStyle='#808080';ctx.fillRect(0,0,128,128);
            const d=depth.getContext('2d').createImageData(128,128);
            for(let y=0;y<128;y++)for(let x=0;x<128;x++){
                if(x<8&&y<8)continue;
                const z=x>=48&&x<80&&y>=40&&y<88?-.6:0;
                const n=Math.round((z/512+.5)*16777215),o=(y*128+x)*4;
                d.data.set([n>>>16,(n>>>8)&255,n&255,255],o);
            }
            depth.getContext('2d').putImageData(d,0,0);
            setScene(image,{camera:JSON.stringify([0,0,100,28,0,0,{px:0,py:0}]),depth,roots:[]});
            const settings={...pro.getProject().settings.lighting,aoStrength:100,aoRadius:1,depthHaze:false};
            const read=c=>{const s=document.createElement('canvas');s.width=c.width;s.height=c.height;
                s.getContext('2d').drawImage(c,0,0);return s.getContext('2d').getImageData(0,0,c.width,c.height).data;};
            const ao=read(shadeScene('__stage:test-light',image,settings));
            let darker=0;for(let i=0;i<ao.length;i+=4)if(ao[i]<126)darker++;
            setScene(image,{camera:JSON.stringify([0,0,100,28,0,0,{px:.6,py:-.3}]),depth,roots:[]});
            const panned=read(shadeScene('__stage:test-light',image,settings));
            const haze=read(shadeScene('__stage:test-light',image,{...settings,ambientOcclusion:false,depthHaze:true}));
            const centre=(64*128+64)*4;
            const flat=document.createElement('canvas');flat.width=flat.height=16;
            return {darker,empty:Array.from(haze.slice(0,4)),fog:Array.from(haze.slice(centre,centre+4)),
                flatUnchanged:shadeScene('__stage:test-flat',flat,settings)===flat,
                panStable:ao.every((v,i)=>v===panned[i])};
        }""")
        assert fixture["darker"] > 100, fixture
        assert fixture["empty"] == [128, 128, 128, 255], fixture
        assert fixture["fog"] == [0, 255, 255, 255], fixture
        assert fixture["flatUnchanged"], fixture
        assert fixture["panStable"], fixture
        partial = page.evaluate("""() => {
            const p=pro.getProject(),mesh=p.layers[0];
            p.settings.ground={...p.settings.ground,enabled:false,visible:false};
            p.settings.lighting.ambientOcclusion=false;
            mesh.nodes.push({id:'partialMerge',type:'merge',x:0,y:0,props:{a:.5}});
            mesh.edges.find(e=>e.from==='cloner'&&e.to==='out').to='partialMerge';
            mesh.edges.find(e=>e.to==='partialMerge').input='a';
            mesh.edges.push({from:'partialMerge',out:'image',to:'out',input:'image'});
            p.layers.unshift({id:'back',name:'Flat background',visible:true,opacity:1,blend:'source-over',
                nodes:[{id:'red',type:'background',x:0,y:0,props:{fill:'flat',c1:'#ff0000'}},
                       {id:'redOut',type:'output',x:0,y:0,props:{}}],
                edges:[{from:'red',out:'image',to:'redOut',input:'image'}]});
            pro.importProject(p);pro.draw();return p;
        }""")
        page.wait_for_timeout(300)
        counts = page.evaluate("""() => {
            const c=document.querySelector('#preview'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
            let fog=0,red=0;for(let i=0;i<d.length;i+=4){
                if(d[i]>120&&d[i]<136&&d[i+1]>120&&d[i+1]<136&&d[i+2]>120&&d[i+2]<136)fog++;
                if(d[i]===255&&d[i+1]===0&&d[i+2]===0)red++;
            }return {fog,red};
        }""")
        assert counts["fog"] > 100 and counts["red"] > 100, counts
        assert page.evaluate(magenta) == flat_pixels
        page.evaluate("""p => {
            const mesh=p.layers[1],text=p.layers[2].nodes.find(n=>n.type==='plainText');
            mesh.nodes.push(text);
            mesh.nodes.find(n=>n.id==='partialMerge').props.mode='screen';
            mesh.edges.push({from:text.id,out:'image',to:'partialMerge',input:'b'});
            p.layers=p.layers.slice(0,2);pro.importProject(p);pro.draw();
        }""", partial)
        page.wait_for_timeout(300)
        assert page.evaluate("""() => {
            const c=document.querySelector('#preview'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
            let n=0;for(let i=0;i<d.length;i+=4)if(d[i]>245&&d[i+1]>100&&d[i+2]>245)n++;return n;
        }""") > 100, "A Screen-blended flat overlay must be composited after geometry haze"
        await_mapping = page.evaluate("""async p => {
            const {surface}=await import('./mapping.js');
            p.mapping={on:true,test:false,surfaces:[surface('lit-layer','Lit layer',[[0,0],[1,0],[1,1],[0,1]],{source:2})]};
            pro.importProject(p);pro.draw();return true;
        }""", partial)
        assert await_mapping
        page.wait_for_timeout(300)
        assert page.evaluate("""() => {
            const c=document.querySelector('#preview'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
            let n=0;for(let i=0;i<d.length;i+=4)if(d[i]<5&&d[i+1]>80&&d[i+2]>80)n++;return n;
        }""") > 100, "Layer-specific mapping must receive shaded geometry"
        project = page.evaluate("() => pro.getProject()")
        assert project["settings"]["lighting"]["ambientOcclusion"] is False
        assert project["settings"]["lighting"]["depthHaze"]
        assert page.evaluate("p => pro.validate(JSON.parse(JSON.stringify(p))).settings.lighting", project) == project["settings"]["lighting"]
        for patch in [{"aoRadius": -1}, {"hazeStart": 100, "hazeEnd": 10}, {"ambientOcclusion": "yes"}]:
            result = page.evaluate("""patch => {
                const p=pro.getProject();Object.assign(p.settings.lighting,patch);
                try{pro.validate(p);return false;}catch(e){return true;}
            }""", patch)
            assert result, patch
        page.screenshot(path="/tmp/audiograph-global-lighting.png")
        assert errors == [], errors
        print("ok - Global AO contacts, depth haze, translucent Merge, flat overlays, pan, mapped layers and persistence")
    finally:
        browser.close()
