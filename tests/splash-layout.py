import os
from playwright.sync_api import sync_playwright


with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        headless=True,
    )
    try:
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(os.environ.get("AUDIOGRAPH_PRO_URL", "http://127.0.0.1:8766/pro/") + "?splash")
        page.wait_for_load_state("networkidle")
        page.wait_for_selector(".splash-item")
        assert page.locator(".splash-label").all_text_contents() == [
            "Visualize", "3D physics", "Particles", "Presets",
            "Auto-play", "Project", "Export", "Share",
        ]
        icons = page.evaluate("""() => Object.fromEntries(['visualize','cloner','waterfall','project'].map(id=>{
          const image=document.querySelector(`[data-splash="${id}"]`).style.getPropertyValue('--icon');
          return [id,decodeURIComponent(image.split('data:image/svg+xml,')[1].slice(0,-2))];
        }))""")
        assert icons["cloner"] != icons["project"] and '<path' in icons["cloner"]
        assert icons["waterfall"] != icons["visualize"] and icons["waterfall"].count("<circle") >= 6
        for width, height in [(2000, 1153), (1440, 900), (1200, 800), (800, 700), (701, 700), (390, 844)]:
            page.set_viewport_size({"width": width, "height": height})
            page.wait_for_timeout(100)
            layout = page.evaluate("""() => {
              const card=document.querySelector('.splash-card').getBoundingClientRect(),
                buttons=[...document.querySelectorAll('.splash-item')].map(b=>b.getBoundingClientRect());
              return {
                rows:new Set(buttons.map(b=>Math.round(b.top))).size,
                contained:buttons.every(b=>b.left>=card.left&&b.right<=card.right&&b.top>=card.top&&b.bottom<=card.bottom),
                overflow:document.documentElement.scrollWidth>innerWidth,
                labelsFit:[...document.querySelectorAll('.splash-label')].every(label=>{
                  const r=label.getBoundingClientRect(),b=label.parentElement.getBoundingClientRect();
                  return r.left>=b.left&&r.right<=b.right;
                })
              };
            }""")
            assert layout["rows"] == (1 if width > 700 else 3), (width, layout)
            assert layout["contained"] and layout["labelsFit"] and not layout["overflow"], (width, layout)
            if width == 1440 and os.environ.get("SPLASH_SHOT"):
                page.screenshot(path=os.environ["SPLASH_SHOT"])
        page.locator('[data-splash="cloner"]').click()
        assert page.locator("#splash").is_hidden()
        assert page.locator("#tourCard").is_visible()
        page.evaluate("() => {pro.tour.stop();__agSplash.open();}")
        page.locator("#splashStart").click()
        assert page.locator("#splash").is_hidden()
        assert not errors, errors
        print("ok - Eight desktop splash shortcuts on one row, mobile wrapping and splash actions")
    finally:
        browser.close()
