# Audiograph Pro prototype

A separate, static node-based vertical slice. Open `pro/` through an HTTP server
or at `/audiograph/pro/`; the regular app at `../index.html` stays unchanged.
No build step, package installation, CDN, uploads or remote services are needed.

## Publishing

Publish these files together, preserving their relative paths:

- `index.html` (the existing regular Audiograph engine, one level above `pro/`)
- `pro/index.html`
- `pro/studio.css`
- `pro/graph.js`
- `pro/engine.js`
- `pro/studio.js`

Serve `.js` files as JavaScript and use HTTPS (or localhost) for WebGPU.
Do not point an SPA fallback at Pro: its modules and the parent engine must be
served as actual files.

## Working slice

The library supports drag/drop and click-to-add. Drag headers to move nodes,
drag empty space to pan, and use the wheel or zoom buttons. Connect an output
port to a matching input by clicking each. Click a wire to remove it. Select a
node to edit its properties; Delete/Backspace or the inspector deletes it.
Undo/redo supports nodes, wires, properties, moves and layer changes.

- **Controls:** Value, Oscillator, Audio band (bass/mids/high/full), Map range.
- **Images:** Emitter, Image effect, Blend, Output.
- **Effects:** hue, brightness, saturation, blur, invert.
- **Blends:** normal, screen, multiply, difference, additive, with mix.
- **Layers:** up to four independent graphs, each with visibility and opacity.
- **Projects:** versioned, bounded and validated JSON import/export; explicit
  browser save/restore uses the separate `audiograph-pro-v1` storage key.

All 32 currently visible Audiograph emitters are selectable: 11 General,
7 Simulations, 7 3D and 7 Input choices. Each uses its real existing renderer;
this is not the regular app's unrelated Graph visualisation editor.
Image and Pixel Warp accept raster files, Video accepts browser-decodable files,
Text accepts text, and 3D Object accepts OBJ. Gaussian Splat uses its built-in
demo. Math uses only the built-in trusted expression, never project-supplied
code. The small property subset is intentional.

The working default is Oscillator → Fluid Emitter → Image effect → Output.
Add an Audio band node and connect it to the Emitter's drive socket for
audio-reactive output. Load an audio file and explicitly press Play.
One shared Web Audio analyser supplies every Audio band node; no microphone
or camera permissions are requested.

## Rendering and lifecycle

Each Emitter loads the trusted same-origin regular app into an isolated engine
frame. External font imports are removed and the engine has an offline-oriented
content policy. Rendering globals, solver IDs, canvases and devices are isolated
between Emitters. Native WebGPU runs the original simulation compute solvers;
other emitters use the original WebGL / Canvas renderer and its compatibility
fallbacks. Effects and final preview compositing use Canvas 2D.

The graph evaluator validates typed ports and cycles, sorts nodes topologically,
then evaluates only ancestors of Output. Adding an unused node therefore does
not interrupt the live branch. Solvers keep state across frames and ordinary
property edits. Changing the Emitter algorithm resets only that engine's solver.
Deleting an Emitter or layer disposes its simulation resources and frame.
Back/forward-cache transitions dispose and clear engines; returning recreates
them. Cached navigation stops audio and suspends its retained context, so Play
or loading another file works after returning without retaining GPU resources.
The four-Emitter project limit bounds the cost of this isolation approach.

## Boundaries

This is not a zero-copy GPU graph. Resolution is fixed at 960×540 and simulation
quality at Low. Numeric drive is a scalar spectrum amplitude, not a 64-bin
spectrum socket. There is no feedback, solver-internal graph, full parameter
parity, device input, MIDI/OSC, morphing, Autopilot, projection mapping or export
parity. Pause freezes the visuals; audio has its own Stop control.

Audio, raster images, video and OBJ source files are not serialized or uploaded.
Reload them after reopening/importing a project or undoing Emitter deletion.
Normal-app saved projects are a different format and are deliberately rejected.

## Acceptance

From the repository root:

```sh
node tests/pro.cjs
```

Uses the existing `tests/node_modules/playwright` and native installed Google
Chrome on macOS. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select another browser;
`AUDIOGRAPH_PRO_URL` can target an existing deployment. Tests start a bounded
static server with correct Pro subpaths and parent engine routing, then close
the browser and server in `finally`.

Acceptance verifies native GPU output and state persistence, all built-in
Emitter choices, raster/OBJ/video imports, shared audio, typed/cyclic connection
rejection, independent Fluid and Boids GPU engines, branching/blending, layer
visibility, actual pixel changes, properties, dragging, library drag/drop,
delete/undo/redo and JSON/browser save roundtrips. A screenshot is written outside
the repository at `../pro-prototype.png`.
