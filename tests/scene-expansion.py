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
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(os.environ.get("AUDIOGRAPH_PRO_URL", "http://127.0.0.1:8766/pro/") + "?demo")
        page.wait_for_load_state("networkidle")
        page.wait_for_function("() => window.pro")
        page.evaluate("() => pro.dissolve(false)")
        guides = page.evaluate("() => pro.tour.guides()")
        for guide in ["cloner", "waterfall"]:
            page.evaluate("id => pro.tour.guide(id)", guide)
            for i in range(len(guides[guide])):
                page.evaluate("i => pro.tour.go(i)", i)
                try:
                    page.wait_for_function("() => pro.stats().errors.length === 0", timeout=45000)
                except Exception:
                    print(guide, i, errors, page.evaluate("() => pro.stats()"))
                    raise
                page.wait_for_timeout(300)
                assert page.locator("#tourTitle").inner_text() == guides[guide][i]
                assert page.locator("#tourCard").is_visible()
            page.wait_for_timeout(1500)
            assert page.evaluate("() => pro.pixels()") > 0
            page.screenshot(path=f"/tmp/audiograph-{guide}-tutorial.png")
            project = page.evaluate("() => pro.getProject()")
            if guide == "cloner":
                assert project["settings"]["ground"]["shape"] == "circle"
                assert any(n["type"] == "gravity" for n in project["layers"][0]["nodes"])
                assert page.evaluate("() => pro.stats().rigid.bodies") == 30
            else:
                assert len(project["layers"]) == 2
                assert project["settings"]["camera"]["zoom"] == 60
            assert page.locator(".scene-inspector .tips-btn").is_visible()
            assert not page.locator(".scene-inspector .tip").first.is_visible()
            page.locator(".scene-inspector .tips-btn").click()
            assert page.locator(".scene-inspector .tip").first.is_visible()
            page.locator(".scene-inspector .tips-btn").click()
            page.evaluate("() => pro.tour.stop()")

        page.get_by_label("Ground type", exact=True).select_option("square")
        page.get_by_label("Ground colour", exact=True).evaluate("e=>{e.value='#e05080';e.dispatchEvent(new Event('change',{bubbles:true}));}")
        assert page.evaluate("() => pro.getProject().settings.ground.shape") == "square"
        assert page.evaluate("() => pro.getProject().settings.ground.color") == "#e05080"
        assert page.locator('input[type="file"][accept=".hdr,.exr"]').count() == 1
        page.evaluate("() => pro.select(pro.getProject().layers[0].nodes.find(n=>n.type==='gpuParticles').id)")
        obj = page.evaluate("() => pro.addNode('waveform3d', 40, 40, {mode:'cube',render:'normal'})")
        page.evaluate("id => pro.select(id)", obj)
        group = page.locator('.insp-fold[data-group="Palette mapping"]')
        group.locator(".insp-fold-head").click()
        page.locator('[data-property="paletteMap"]').get_by_role("button", name="Front projection", exact=True).click()
        page.wait_for_function("id => pro.engine(id)?.w?.simOpt.g3CBy === 'mapped'", arg=obj)
        page.wait_for_function("() => pro.stats().errors.length === 0")
        assert page.locator('.insp-fold[data-group="Sound"]').count() == 0
        assert page.evaluate("id => pro.engine(id).w.document.getElementById('pSimSens').value", obj) == "0"
        assert page.locator('[data-property="paletteTiling"]').is_visible()
        assert page.evaluate("id => pro.engine(id).w.__agPaletteSettings.mode", obj) == "front"
        clone = page.evaluate("() => pro.addNode('cloner')")
        page.evaluate("id => pro.select(id)", clone)
        page.locator('.insp-fold[data-group="Palette mapping"] .insp-fold-head').click()
        page.locator('[data-property="paletteBy"]').get_by_role("button", name="Clone", exact=True).click()
        page.wait_for_function("id => pro.engine(id)?.w?.simOpt.g3CBy === 'clone'", arg=clone)
        page.wait_for_function("() => pro.stats().errors.length === 0")
        assert page.locator('.insp-fold[data-group="Sound"]').count() == 0
        fx = page.evaluate("id => pro.getProject().layers[0].edges.find(e=>e.from===id&&e.input==='shape').to", clone)
        page.evaluate("id => pro.select(id)", fx)
        page.locator('.insp-fold[data-group="Transforms"] .insp-fold-head').click()
        for keys in [["moveX", "moveY", "moveZ"], ["rotateX", "rotateY", "rotateZ"], ["scaleX", "scaleY", "scaleZ"]]:
            ys = [page.locator(f'[data-property="{key}"]').first.bounding_box()["y"] for key in keys]
            assert max(ys)-min(ys) < 1, (keys, ys)
        assert page.locator('[data-property="uniformScale"]').is_visible()
        page.locator('.insp-fold[data-group="Spectrum distribution"] .insp-fold-head').click()
        ys = [page.locator(f'[data-property="listen"] button[data-value="{axis}"]').bounding_box()["y"] for axis in ["x", "y", "z"]]
        assert max(ys)-min(ys) < 1
        assert not page.locator('[data-property="rotate"]').count()
        page.evaluate("() => pro.importProject({format:'audiograph-pro',version:19,settings:{ground:{enabled:false}},layers:[{id:'target-test',name:'Attraction',visible:true,opacity:1,blend:'source-over',nodes:[{id:'body',type:'waveform3d',x:0,y:0,props:{mode:'sphere',render:'normal',rigidBody:true}},{id:'target',type:'waveform3d',x:0,y:200,props:{mode:'cube',render:'normal',x:25}},{id:'pull',type:'attract',x:250,y:0,props:{rigid:4}},{id:'out',type:'output',x:500,y:0,props:{}}],edges:[{from:'body',out:'shape',to:'pull',input:'shape'},{from:'target',out:'object',to:'pull',input:'target'},{from:'pull',out:'shape',to:'out',input:'image'}]}]})")
        page.wait_for_function("() => pro.stats().rigid.bodies === 1 && pro.stats().errors.length === 0")
        page.wait_for_function("() => pro.stats().rigid.groups[0].positions[0][0] > .1")
        assert abs(page.evaluate("() => pro.stats().rigid.groups[0].positions[0][1]")) < .01
        assert not errors, errors
        assert page.evaluate("() => Object.values(pro.stats().engines).flatMap(e=>e.sim?.errors||[])") == []
        print("ok - Cloner and Waterfall guides, scene help, ground types, EXR picker and object palette mapping")
    finally:
        browser.close()
