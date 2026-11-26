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
        cloner = page.evaluate("""() => {
          pro.dissolve(false);
          pro.importProject({format:'audiograph-pro',version:pro.getProject().version,
            settings:{camera:{zoom:12,tilt:32,dof:0},ground:{height:1.2}},
            layers:[{id:'l',name:'Ground',visible:true,opacity:1,blend:'source-over',
              nodes:[{id:'out',type:'output',x:600,y:0,props:{}}],edges:[]}]});
          const id=pro.addNode('cloner');pro.setProperty(id,'collide',true);return id;
        }""")
        page.wait_for_function("id => pro.engine(id)?.w?.__agScene.nativeCollider?.verts.length>0", arg=cloner, timeout=45000)
        bottom = page.evaluate("id => Math.min(...pro.engine(id).w.__agScene.nativeCollider.verts.map(v=>v[1]))", cloner)
        assert bottom > 1.2, bottom
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
            page.get_by_label("Shadows", exact=True).select_option(enabled)
            page.wait_for_timeout(800)
            shadow_pixels[enabled] = page.evaluate("""id => {
              const c=pro.engine(id).canvas,d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
              let count=0;for(let i=0;i<d.length;i+=4)if(d[i+3]>5&&d[i+3]<200&&d[i]+d[i+1]+d[i+2]<10)count++;
              return count;
            }""", cloner)
        print("shadow pixels", shadow_pixels)
        assert shadow_pixels["true"] > shadow_pixels["false"]+100, shadow_pixels
        assert page.evaluate("() => pro.getProject().settings.lighting.shadows") is False
        assert not errors, errors
        assert page.evaluate("() => pro.stats().errors") == []
        print("ok - New Cloners above ground, saved poses preserved, ground colour pixels and scene shadow toggle")
    finally:
        browser.close()
