import os
from playwright.sync_api import sync_playwright


def open_fold(page, name):
    fold = page.locator(f'.insp-fold[data-group="{name}"]').first
    if fold.count() and "closed" in fold.get_attribute("class"):
        fold.locator(".insp-fold-head").click()


with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path=os.environ.get(
            "PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH",
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        ),
        headless=True,
    )
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(os.environ.get("AUDIOGRAPH_PRO_URL", "http://127.0.0.1:8766/pro/") + "?demo")
    page.wait_for_load_state("networkidle")
    page.wait_for_function("() => window.pro")
    page.evaluate("""() => {
      pro.dissolve(false);
      const p=pro.getProject();
      const wave=p.layers[0].nodes.find(n=>n.type==='waveform2d');
      pro.select(wave.id);
    }""")
    open_fold(page, "Line style")
    style = page.locator('.chips[data-property="lineShape"]')
    style.wait_for(state="visible")
    layout = style.evaluate("""el => {
      const buttons=[...el.querySelectorAll('.mbtn')];
      const widths=buttons.map(b=>b.getBoundingClientRect().width);
      const heights=buttons.map(b=>b.getBoundingClientRect().height);
      const next=el.parentElement.nextElementSibling?.querySelector('.knob-dial');
      return {display:getComputedStyle(el).display, columns:getComputedStyle(el).gridTemplateColumns.split(' ').length,
        widthSpread:Math.max(...widths)-Math.min(...widths), heightSpread:Math.max(...heights)-Math.min(...heights),
        gap:next?next.getBoundingClientRect().top-el.getBoundingClientRect().bottom:null};
    }""")
    assert layout["display"] == "grid" and layout["columns"] == 4, layout
    assert layout["widthSpread"] < 1 and layout["heightSpread"] < 1, layout
    assert layout["gap"] is not None and layout["gap"] >= 16, layout
    shots = os.environ.get("AUDIOGRAPH_UI_SHOTS")
    if shots:
        os.makedirs(shots, exist_ok=True)
        style.locator("..").locator("..").screenshot(path=os.path.join(shots, "options-desktop.png"))
    style.get_by_role("button", name="Pins", exact=True).click()
    assert style.get_by_role("button", name="Pins", exact=True).get_attribute("aria-pressed") == "true"

    page.evaluate("""() => {
      const p=pro.getProject(), palette=p.layers[0].nodes.find(n=>n.type==='palette');
      pro.select(palette.id);
    }""")
    mode = page.locator('.chips[data-property="mode"]').first
    assert mode.evaluate("el => getComputedStyle(el).display") == "grid", "Palette options use the same grid"
    mode.get_by_role("button", name="Solid", exact=True).click()
    assert page.evaluate("() => pro.getProject().layers[0].nodes.find(n=>n.type==='palette').props.mode") == "solid"

    page.evaluate("""() => {
      pro.select(pro.addNode('cloner'));
    }""")
    open_fold(page, "Layout")
    choices = page.locator('.chips[data-property="layout"]')
    choices.wait_for(state="visible")
    assert choices.evaluate("el => getComputedStyle(el).display") == "grid", "Cloner layouts use the same grid"
    open_fold(page, "Rigid body")
    toggle = page.locator('.chips[data-property="rigidBody"]')
    assert toggle.evaluate("el => getComputedStyle(el).display") == "flex", "Binary On/Off controls remain compact"
    toggle.get_by_role("button", name="On", exact=True).click()
    assert page.evaluate("() => pro.getProject().layers[0].nodes.find(n=>n.type==='cloner').props.rigidBody")
    page.set_viewport_size({"width": 390, "height": 740})
    assert page.locator("#properties").evaluate("el => el.scrollWidth <= el.clientWidth"), "No mobile horizontal overflow"
    if shots:
        page.locator("#properties").screenshot(path=os.path.join(shots, "options-mobile.png"))
    assert errors == [], errors
    browser.close()
    print("ok - Shared option grids, equal cards, knob spacing, selection, compact toggles and mobile")
