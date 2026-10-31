# Audiograph Pro

A node-based studio built on the original Audiograph. Open `pro/` through an HTTP
server or at `/audiograph/pro/`. The regular app at `../index.html` stays unchanged
and is the engine. There is no build step and nothing to install; it uses no CDN,
uploads or remote services.

## How it works

Every **layer** is a graph that ends in an **Output**. Layers stack in the preview,
each with its own opacity and blend mode (up to four).

- **Emitters**: all 32 Audiograph renderers (General, Simulations, 3D, Input).
  The inspector shows each emitter's own options from the original (knobs and
  choice chips, including presets), plus the original audio response: Intensity,
  Bass punch, Bass release and Dynamics.
- **Geometry & Motion**: Lines, Transform (scale, rotation, offset, 3D tilt and
  rotate, zoom on loud), Motion (spin, speed), Symmetry (mirror axes, 3/4/6/8-fold,
  flip, reflection).
- **Deformers**: Amplify, Twist, Bulge, Wave, Shear, Depth, Ripple, Jitter,
  Disorder, Randomize, Webcam (camera brightness displaces the shape and can
  color it; the Video emitter can also use the camera as its source).
- **Color**: Palette (tone ramp, simple ramp or solid, with presets) and Hue shift
  (static or cycling).
- **Style**: Line style (13 styles) and Outline.
- **Particles**: Particles (11 shapes) and Flow field (Perlin, curl, Brownian,
  vortex).
- **Post FX**: Bloom, Color correct, Blur, Lens, Kaleido, Trails, Fracture. These
  run the original GPU per-layer shaders. Quick filter is a Canvas 2D filter.
- **Controls**: Value, LFO (sine, triangle, saw, square, random), Map range,
  Smooth (attack and release), Math, Random (per beat or rate).
- **Audio**: Audio band (bass, mids, high, full), Beat, Audio EQ (10 bands, feeds
  one emitter's spectrum input).
- **Composite**: Background (flat, vertical, radial), Blend, Output.

Emitter → shape nodes → Post FX → Output. Shape nodes (amber wires) change *how
the emitter draws*. Post FX nodes (blue wires) process the finished image.

## Using it

- **Quick build**: select a node, then click a library node. It is inserted right
  after the selection. Deleting a node heals the chain.
- **Drive any knob**: drag a number output (teal) onto a node and pick the knob.
  On an Emitter, the menu also lists that emitter's own options (e.g. Fluid
  viscosity), so audio or an LFO can drive them.
  An input of 0 keeps the knob value and 1 pushes it to the maximum. A node with a
  single knob connects directly.
- **Wires**: drag from an output dot to an input dot or to a node. Clicking an
  output and then an input also works. Click a wire to delete it.
- **Audio**: load a file or use the Mic. Without audio, a demo beat plays. Wiring a
  number into an emitter's Drive replaces the music for that emitter.
- **Keys**: ⌘Z / ⇧⌘Z undo and redo, ⌘D duplicates, Delete removes, Space pauses,
  F toggles fullscreen.
- **Templates, Save/Restore** (in this browser), **Export/Import** JSON, and
  **Rec** records the preview with audio to WebM, and **Snap** saves a PNG.

## Engine

Each Emitter loads the trusted same-origin regular app into an isolated frame.
Pro drives the app's own live render loop (`liveAnimLoop`) one frame at a time.
It replaces the app's analyser with a synthetic one that Pro fills from the real
audio, the demo beat or a Drive value. Everything the original applies when
compositing (symmetry, flip, mirror, spin, particles, per-layer Post FX) therefore
renders exactly as in Audiograph. Post FX nodes call the original's
`applyLayerFx` on any image. If there are no emitters, a helper engine runs them.

Projects are versioned and validated. Emitter options accept only numeric values
under safe IDs. Code and expressions are never imported. Version 1 (stage 1)
projects are migrated automatically. Media files (audio, image, video, OBJ) are
not saved in projects.

## Limits

- Output is fixed at 960×540, with Low simulation quality.
- Each project allows four Emitters, four layers and 60 nodes per layer.
- Not included: projection mapping, AI Look, autopilot and morphing.
  Use the original Audiograph for these.

## Tests

```sh
node tests/pro.cjs
```

This uses `tests/node_modules/playwright` and the installed Google Chrome. It
covers:
- native WebGPU output and the emitter option knobs and presets
- click-to-insert and chain healing
- wire dragging and the port menu
- deformers changing pixels
- Post FX without an emitter
- v1 migration and rejection of unsafe imports
- every template, layers, save/restore, and 390px overflow
