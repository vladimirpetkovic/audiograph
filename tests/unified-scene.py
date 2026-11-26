import os
from playwright.sync_api import sync_playwright


def node(identifier, kind, **props):
    return {"id": identifier, "type": kind, "x": 0, "y": 0, "props": props}


def edge(source, output, target, port):
    return {"from": source, "out": output, "to": target, "input": port}


def scene(nodes, edges):
    return {
        "format": "audiograph-pro",
        "version": 17,
        "settings": {"camera": {"turn": 0, "tilt": 0, "zoom": 55, "dof": 0},
                     "ground": {"enabled": False}},
        "layers": [{"id": "Scene", "name": "Scene", "visible": True, "opacity": 1,
                    "blend": "source-over", "nodes": nodes, "edges": edges}],
    }


def run(page):
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(os.environ.get("AUDIOGRAPH_PRO_URL", "http://127.0.0.1:8766/pro/") + "?demo")
    page.wait_for_load_state("networkidle")
    page.wait_for_function("() => window.pro")
    page.evaluate("() => pro.dissolve(false)")
    assert page.locator('.library-node[data-type="camera3d"]').count() == 0
    initial = page.evaluate("() => pro.getProject()")
    graph = initial["layers"][0]
    merge = next(n["id"] for n in graph["nodes"] if n["type"] == "merge")
    output = next(n["id"] for n in graph["nodes"] if n["type"] == "output")
    assert any(e["from"] == merge and e["to"] == output for e in graph["edges"])
    added = page.evaluate("""() => {
      const cube=pro.addNode('waveform3d',20,250,{mode:'cube'});
      const wave=pro.addNode('waveform2d',20,400,{mode:'circle'});
      const cloner=pro.addNode('cloner',400,250,{countX:2,countY:1,countZ:1});
      pro.select(cloner);
      const source=pro.addNode('waveform3d',20,550,{mode:'sphere'});
      const value=pro.addNode('value',20,700);
      return {cube,wave,cloner,source,value};
    }""")
    graph = page.evaluate("() => pro.getProject().layers[0]")
    assert all(any(e["from"] == added[k] and e.get("auto") for e in graph["edges"])
               for k in ["cube", "wave"]), {"added": added, "nodes": [(n["id"], n["type"]) for n in graph["nodes"]], "edges": graph["edges"]}
    effector = next(e["to"] for e in graph["edges"]
                    if e["from"] == added["cloner"] and e["out"] == "shape")
    assert any(e["from"] == effector and e.get("auto") for e in graph["edges"])
    assert any(e["from"] == added["source"] and e["to"] == added["cloner"]
               and e["input"] == "object2" for e in graph["edges"])
    assert not any(e["from"] in [added["source"], added["value"]] and e.get("auto")
                   for e in graph["edges"]), "Sources and controls are not extra pictures"
    page.evaluate("""a => {
      pro.connect(a.cube,'object',a.cloner,'object3');
    }""", added)
    assert not page.evaluate(
        "id => pro.getProject().layers[0].edges.some(e=>e.from===id&&e.auto)", added["cube"]
    ), "Using a generator as a source removes only its automatic picture"
    page.evaluate("""({a,merge}) => {
      pro.connect(a.cube,'shape',merge,'b');
      pro.connect(a.cube,'object',a.cloner,'object3');
      pro.select(a.cube);
    }""", {"a": added, "merge": merge})
    assert page.evaluate(
        "({id,merge}) => pro.getProject().layers[0].edges.some(e=>e.from===id&&e.to===merge&&!e.auto)",
        {"id": added["cube"], "merge": merge},
    ), "Explicit manual routing remains authoritative"
    page.evaluate("""a=>{
      pro.select(a.cube);
      const picture=pro.addNode('waveform3d',undefined,undefined,{mode:'cube'});
      const palette=pro.addNode('palette');
      pro.connect(picture,'object',a.cloner,'object3');
      window.__routedPicture={picture,palette};
      pro.select(a.cube);
    }""", added)
    assert page.evaluate("""()=>{
      const {picture,palette}=window.__routedPicture,g=pro.getProject().layers[0];
      return g.edges.some(e=>e.from===picture&&e.to===palette)&&
        !g.edges.some(e=>e.from===palette&&e.auto);
    }"""), "Click-created generators stay independent; source reuse removes automatic modifier previews"
    page.get_by_role("button", name="Scene camera", exact=True).click()
    panel = page.locator(".scene-inspector")
    movement = panel.locator('.chips[data-property="sceneCamera:motion"]')
    assert movement.locator("button").all_text_contents() == [
        "Static", "Orbit", "Pendulum", "Dolly", "Spiral"
    ]
    movement.get_by_role("button", name="Spiral", exact=True).click()
    page.wait_for_function("() => pro.camera().phase>.1")
    page.evaluate("() => pro.pause(true)")
    before = page.evaluate("() => pro.camera()")
    page.evaluate("() => {pro.draw();pro.draw();}")
    assert page.evaluate("() => pro.camera()") == before, "Pause freezes shared movement"
    assert before["pose"]["zoom"] != page.evaluate("() => pro.getProject().settings.camera.zoom")
    assert before["pose"]["tilt"] != page.evaluate("() => pro.getProject().settings.camera.tilt")
    panel.get_by_role("button", name="Restart movement", exact=True).click()
    assert page.evaluate("() => pro.camera().phase") == 0
    shots = os.environ.get("AUDIOGRAPH_UI_SHOTS")
    if shots:
        os.makedirs(shots, exist_ok=True)
        panel.evaluate("el=>{el.closest('.inspector').scrollTop=0}")
        page.screenshot(path=os.path.join(shots, "unified-camera-desktop.png"))
    page.set_viewport_size({"width": 390, "height": 740})
    assert panel.evaluate("el=>el.scrollWidth<=el.clientWidth")
    if shots:
        panel.locator("fieldset").first.screenshot(path=os.path.join(shots, "unified-camera-mobile.png"))
    page.set_viewport_size({"width": 1440, "height": 900})

    physical = scene([
        node("physA", "waveform3d", mode="cube", rigidBody=True, bodyGravity=0, soundForce=0),
        node("wind", "wind", rigid=4),
        node("physB", "cloner", countX=2, countY=1, countZ=1, spacingX=60,
             rigidBody=True, bodyGravity=0, soundForce=0),
        node("physicalMerge", "merge"), node("physicalOut", "output"),
    ], [
        edge("physA", "shape", "wind", "shape"),
        edge("wind", "shape", "physicalMerge", "a"),
        edge("physB", "shape", "physicalMerge", "b"),
        edge("physicalMerge", "image", "physicalOut", "image"),
    ])
    page.evaluate("s=>{pro.importProject(s);pro.pause(false)}", physical)
    page.wait_for_function("""() => pro.stats().rigid.bodies===3 &&
      pro.stats().rigid.groups.some(g=>g.id==='physA'&&Math.abs(g.positions[0][0])>.15)""")
    page.evaluate("() => pro.pause(true)")
    positions = page.evaluate("() => Object.fromEntries(pro.stats().rigid.groups.map(g=>[g.id,g.positions]))")
    page.evaluate("""() => {
      pro.setSceneCamera({turn:80,tilt:45,zoom:70,px:.2,py:-.1});
      pro.draw();pro.draw();
    }""")
    page.wait_for_function("() => pro.stats().rigid.bodies===3")
    assert page.evaluate(
        "() => Object.fromEntries(pro.stats().rigid.groups.map(g=>[g.id,g.positions]))"
    ) == positions, "Camera edits never reset or move physical objects"
    cameras = page.evaluate("() => ['physA','physB'].map(id=>pro.engine(id).w.__agScene.camera)")
    assert cameras[0] == cameras[1], "Objects and clones use the same projection"
    assert page.evaluate("()=>pro.frameScene()")
    page.evaluate("()=>pro.draw()")
    assert page.evaluate(
        "() => Object.fromEntries(pro.stats().rigid.groups.map(g=>[g.id,g.positions]))"
    ) == positions, "Framing preserves physical poses"

    mixed = scene([
        node("a", "waveform3d", mode="cube", render="normal", size=60),
        node("source", "waveform3d", mode="cube", render="normal"),
        node("b", "cloner", countX=1, countY=1, countZ=1, scale=200),
        node("red", "palette", mode="solid", solid="#ff0000"),
        node("blue", "palette", mode="solid", solid="#0066ff"),
        node("hud", "plainText", text="HUD", color="#ffffff", bounce=0),
        node("m", "merge"), node("out", "output"),
    ], [
        edge("a", "shape", "red", "shape"), edge("source", "object", "b", "object"),
        edge("b", "shape", "blue", "shape"), edge("red", "shape", "m", "a"),
        edge("hud", "image", "m", "b"), edge("blue", "shape", "m", "c"),
        edge("m", "image", "out", "image"),
    ])
    reference = scene([mixed["layers"][0]["nodes"][5], node("referenceOut", "output")],
                      [edge("hud", "image", "referenceOut", "image")])
    page.evaluate("""s=>{
      pro.importProject(s);pro.draw();
      const c=document.getElementById('preview');
      window.__hudReference=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    }""", reference)
    page.evaluate("s=>{pro.importProject(s);pro.pause(false)}", mixed)
    page.wait_for_function("() => pro.engine('a')?.w?.__agScene.valid && pro.engine('b')?.w?.__agScene.valid")
    page.wait_for_timeout(500)
    page.evaluate("() => pro.pause(true)")

    def overlay_pixels():
        return page.evaluate("""() => {
          const a=window.__hudReference,preview=document.getElementById('preview');
          const b=preview.getContext('2d').getImageData(0,0,preview.width,preview.height).data;
          let count=0,visible=0;
          for(let i=0;i<a.length;i+=4)if(a[i]>250&&a[i+1]>250&&a[i+2]>250&&a[i+3]>250){
            count++;if(b[i]>250&&b[i+1]>250&&b[i+2]>250)visible++;
          }
          return {count,visible};
        }""")

    overlay = overlay_pixels()
    assert overlay["count"] > 1000 and overlay["visible"] > overlay["count"] * .98, overlay
    mixed["layers"][0]["nodes"].extend([
        node("near", "waveform3d", mode="cube", render="normal", size=120), node("outer", "merge")
    ])
    mixed["layers"][0]["edges"] = [
        e for e in mixed["layers"][0]["edges"] if e["to"] != "out"
    ] + [
        edge("m", "image", "outer", "a"), edge("near", "shape", "outer", "b"),
        edge("outer", "image", "out", "image"),
    ]
    page.evaluate("s=>{pro.importProject(s);pro.pause(false)}", mixed)
    page.wait_for_function("() => pro.engine('near')?.w?.__agScene.valid")
    page.wait_for_timeout(500)
    page.evaluate("() => pro.pause(true)")
    nested = overlay_pixels()
    assert nested["visible"] > nested["count"] * .98, "Nested Merges keep 2D overlays above all 3D"
    saved = page.evaluate("() => pro.getProject()")
    page.evaluate("s=>pro.importProject(s)", saved)
    assert page.evaluate("() => pro.getProject().settings.camera") == saved["settings"]["camera"]
    assert page.evaluate("() => pro.stats().errors") == []
    assert errors == [], errors
    page.evaluate("() => pro.tour.start()")
    for step, category in [(0, "audioIn"), (6, "twist"), (7, "palette"),
                           (8, "particles"), (9, "bloom"), (11, "gpuParticles")]:
        page.evaluate("i=>pro.tour.go(i)", step)
        tutorial = page.evaluate("() => pro.getProject()")
        for layer in tutorial["layers"]:
            root = next(n["id"] for n in layer["nodes"] if n["type"] == "output")
            merges = {n["id"] for n in layer["nodes"] if n["type"] == "merge"}
            assert any(e["from"] in merges and e["to"] == root for e in layer["edges"])
        assert page.locator(f'#library .library-node[data-type="{category}"]').first.evaluate(
            "el=>!el.closest('#library > .panel').classList.contains('collapsed')"
        )
    page.evaluate("() => pro.tour.stop()")
    assert errors == [], errors
    print("ok - Automatic routing, manual ownership, scene camera UI, pause, physical poses and nested 2D/3D composition")


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        executable_path=os.environ.get(
            "PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH",
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        ),
        headless=True,
        args=["--ignore-gpu-blocklist"],
    )
    try:
        run(browser.new_page(viewport={"width": 1440, "height": 900}))
    finally:
        browser.close()
