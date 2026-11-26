import os
from playwright.sync_api import sync_playwright


def scene(mode, force, props, space="2d", emitter_props=None):
    return {
        "format": "audiograph-pro", "version": 21,
        "settings": {"ground": {"enabled": False, "visible": False}},
        "layers": [{
            "id": "layer", "name": "Forces", "visible": True,
            "opacity": 1, "blend": "source-over",
            "nodes": [
                {"id": "drive", "type": "value", "x": 0, "y": 0, "props": {"value": 1}},
                {"id": "emitter", "type": "gpuParticles", "x": 200, "y": 0,
                 "props": {"mode": mode, "space": space, **(emitter_props or {})}},
                {"id": "force", "type": force, "x": 400, "y": 0, "props": props},
                {"id": "output", "type": "output", "x": 600, "y": 0, "props": {}},
            ],
            "edges": [
                {"from": "drive", "out": "value", "to": "emitter", "input": "drive"},
                {"from": "emitter", "out": "shape", "to": "force", "input": "shape"},
                {"from": "force", "out": "shape", "to": "output", "input": "image"},
            ],
        }],
    }


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
        page.evaluate("() => pro.dissolve(false)")

        cases = [
            ("spin", "simparticles", "spin", "_spin", "pSpin", 25),
            ("gravity", "simparticles", "gravity", "pSpGravity", "pSpGravity", 500),
            ("drag", "simparticles", "drag", "pSpDrag", "pSpDrag", 500),
            ("swirl", "simparticles", "swirl", "pSpSwirl", "pSpSwirl", 500),
            ("attract", "simparticles", "pull", "pSpAttract", "pSpAttract", 500),
            ("turbulence", "simparticles", "amount", "pSpTurb", "pSpTurb", 500),
            ("wind", "simsmoke", "smoke", "pSmWind", "pSmWind", 500),
            ("vorticity", "simfluid", "fluid", "pSfVort", "pSfVort", 500),
        ]
        for force, mode, prop, parameter, input_id, value in cases:
            page.evaluate("""project => {
              pro.pause(false);pro.importProject(project);pro.select('force');
            }""", scene(mode, force, {prop: value, "intensity": 200}))
            page.wait_for_function("""({mode,key,value}) => {
              const e=pro.engine('emitter');
              return e?.mode===mode&&e.frames>3&&e.w.stackLayouts[0].params[key]===value;
            }""", arg={"mode": mode, "key": parameter, "value": value * 2}, timeout=45000)
            slider = page.locator('#properties input[type="range"][data-property="intensity"]')
            assert slider.count() == 1, f"{force}: missing Intensity slider"
            assert slider.get_attribute("max") == "1000"
            actual = page.evaluate("""id => +pro.engine('emitter').w.document.getElementById(id).value""", input_id)
            assert actual == value * 2, f"{force}: amplified value was clamped by the native renderer ({actual})"
            page.wait_for_timeout(250)
            assert page.evaluate("() => pro.stats().errors") == [], force
            assert page.evaluate("() => pro.engine('emitter').w.agSim.stats().errors") == [], force
            if mode == "simparticles":
                assert page.evaluate("""async () => (await pro.engine('emitter').w.agSim.particleState()).every(Number.isFinite)""")
            slider.evaluate("""input => {
              input.value=0;input.dispatchEvent(new Event('input',{bubbles:true}));
              input.dispatchEvent(new Event('change',{bubbles:true}));
            }""")
            assert page.evaluate("() => pro.getProject().layers[0].nodes.find(n=>n.id==='force').props.intensity") == 0
            page.evaluate("() => pro.undo()")
            assert page.evaluate("() => pro.getProject().layers[0].nodes.find(n=>n.id==='force').props.intensity") == 200

        emitter = {
            "moveX": 4, "look": {"_sim": {"pEmit": "ring"}},
            "opts": {"pSpSpeed": 0, "pSpTurb": 0, "pSpDrag": 0, "pSpSwirl": 0, "pSimReact": 0},
        }
        page.evaluate("project => pro.importProject(project)", scene("simparticles", "attract", {"pull": 50, "intensity": 0}, "3d", emitter))
        page.wait_for_function("""() => Object.values(pro.engine('emitter')?.w?.agSim.stats().layers||{})
          .some(s=>s.dimensions===3&&s.emitted>300)""", timeout=45000)
        centroid = """async () => {
          const pts=await pro.engine('emitter').w.agSim.particleState();
          let sum=0,n=0;for(let i=0;i<pts.length;i+=16)if(pts[i+8]>0){sum+=pts[i];n++;}
          return sum/n;
        }"""
        before = page.evaluate(centroid)
        page.evaluate("() => pro.setProperty('force','intensity',500)")
        page.wait_for_timeout(1000)
        after = page.evaluate(centroid)
        assert after < before - 0.1, f"3D attraction must pull toward the unwired origin ({before}, {after})"
        assert page.evaluate("() => pro.engine('emitter').w.__agParticles3d.attract") == [0, 0, 0, 2.5]

        page.evaluate("""() => {pro.loadTemplate('Ink');pro.select(pro.getProject().layers[0].nodes.find(n=>n.type==='gpuParticles').id);}""")
        page.wait_for_timeout(1000)
        if os.environ.get("AUDIOGRAPH_REVIEW_DIR"):
            page.screenshot(path=os.path.join(os.environ["AUDIOGRAPH_REVIEW_DIR"], "ink-2d-review.png"))
        assert errors == [], errors
        assert page.evaluate("() => pro.stats().errors") == []
        print("ok - All eight Force intensity controls, expanded native ranges, finite GPU state, undo, and world-origin attraction")
    finally:
        browser.close()
