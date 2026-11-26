import os
import math
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
        cloner = page.evaluate("""()=>{
          pro.dissolve(false);
          return pro.addNode('cloner');
        }""")
        page.wait_for_function(
            "id=>pro.engine(id)?.w?.__agScene.valid && pro.engine(id).w.__agScene.boundsRadius>0",
            arg=cloner,
        )
        page.evaluate("()=>pro.pause(true)")
        before = page.evaluate("""id=>{
          const a=pro.engine(id).w.__agScene;
          return {distance:a.camera.distance,radius:a.boundsRadius,zoom:pro.getProject().settings.camera.zoom};
        }""", cloner)
        assert before["distance"] * .389 > before["radius"], before
        preview = page.locator("#preview")
        preview.hover()
        page.mouse.wheel(0, 1600)
        page.wait_for_timeout(500)
        zoomed = page.evaluate("id=>pro.engine(id).w.__agScene.camera.distance", cloner)
        assert zoomed > before["distance"] * 2, "Wheel can pull back beyond the old zoom limit"
        native = page.evaluate("id=>pro.engine(id).w.__agScene.distance", cloner)
        assert abs(native - zoomed) < 1e-5, "The native camera really moves, not just its UI value"
        page.evaluate("""id=>{
          pro.setProperty(id,'countX',13);pro.setProperty(id,'spacingX',500);
          pro.setSceneCamera({zoom:200,px:3,py:2});
          pro.draw();
        }""", cloner)
        page.keyboard.press("f")
        page.wait_for_function("()=>pro.getProject().settings.camera.px===0")
        framed = page.evaluate("""id=>{
          const a=pro.engine(id).w.__agScene;
          return {distance:a.camera.distance,radius:a.boundsRadius,zoom:pro.getProject().settings.camera.zoom,
            fullscreen:!!document.fullscreenElement};
        }""", cloner)
        assert framed["distance"] * math.sin(.4 * .9) >= framed["radius"] * (1 - 1e-8), framed
        assert framed["zoom"] < before["zoom"] and not framed["fullscreen"], framed
        page.evaluate("()=>pro.undo()")
        assert page.evaluate("()=>pro.getProject().settings.camera.zoom") == 200
        assert page.evaluate("()=>pro.frameScene()")
        page.keyboard.press("Tab")
        page.wait_for_function("()=>document.fullscreenElement?.id==='previewWrap'")
        page.keyboard.press("Tab")
        page.wait_for_function("()=>!document.fullscreenElement")
        page.locator("#graphViewport").hover()
        page.keyboard.press("Shift+a")
        page.wait_for_selector(".node-search")
        page.keyboard.press("Escape")
        page.get_by_role("button", name="Scene settings", exact=True).click()
        page.get_by_role("button", name="Frame scene", exact=True).click()
        assert page.evaluate("()=>pro.stats().errors") == []
        assert errors == [], errors
        print("ok - Default cloner framing, unrestricted zoom-out, F frame/undo, Tab fullscreen and Shift+A search")
    finally:
        browser.close()
