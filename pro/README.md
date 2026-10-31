# Audiograph Pro

A node-based studio built on the original Audiograph. Open `pro/` through an HTTP
server or at `/audiograph/pro/`. The regular app at `../index.html` stays unchanged
and is the engine. There is no build step and nothing to install; it uses no CDN,
uploads or remote services.

## How it works

Every **layer** is a graph that ends in an **Output**. Layers stack in the preview,
each with its own opacity and blend mode (up to four).

- **Inputs** (what you bring in):
  - **Audio**: the project's sound. Its inspector has **Load file**, **Mic** and
    **System**; every Audio node hears that one source. Outputs: `audio` (the
    signal, for emitters and Audio EQ) and the numbers level, bass, mids, high
    and beat.
  - **Image**, **Video**: drawn as lines, or **Pixel warp**.
  - **Camera**: lines or Pixel warp from the camera. It also outputs the numbers
    **motion** and **brightness**.
  - **Text**, **3D Object** (built-in knot or your OBJ, as a mesh or a
    **point cloud**), **Gaussian Splat** (.ply / .splat, demo cloud by default).
  - **Data** inputs give 0–1 numbers for any knob, with live meters in the inspector:
    - **Computer**: cpu, gpu, memory, fps, network, battery. Without help the browser
      can only estimate (Compute Pressure / main-thread lag, render load, JS memory).
      For real values run the local helper `node pro/tools/computer-feed.mjs [port]`
      (no dependencies; macOS, Linux, Windows; listens on 127.0.0.1 only) and pick
      **Local helper**. Chrome / Edge only; Safari blocks local connections.
    - **Clock**: second, minute, hour, day (phase of each), beat and pulse at a tempo.
    - **Mouse & keys**: x, y, speed, click, held, keys (typing rate), scroll.
    - **MIDI**: cc (with **Learn CC**), note, gate, pitch, bend (Chrome / Edge).
- **Waveforms**: **2D** (Linear, Circle, Spiral, Harmonic, Math…) and **3D**
  (Terrain, Sphere, DNA, Knot…).
- **Emitters** (particles): **Particles** (Particles, Flow field) and **WebGPU
  particles** (Particles, Fluid, Smoke, Boids, Granular sand, Ferrofluid, 3D
  cloner).
  Visual inputs, waveforms and WebGPU emitters show the original's own options in the inspector
  (knobs and choice chips, including presets) plus its audio response
  (Intensity, Bass punch, Bass release, Dynamics). They take `audio` and `drive`
  inputs and give a `shape` output.
  Every renderer also carries its geometry in grouped, collapsible inspector
  sections: Lines, Transform (scale, rotation, offset, 3D tilt and rotate, zoom on
  loud), Motion (spin, speed) and Symmetry (mirror axes, 3/4/6/8-fold, flip,
  reflection). Option knobs are grouped (Setup, Sound, Emission, Forces, Look,
  Quality, Form). Projects with the old Geometry nodes fold them into the renderer.
  Without a Palette node a renderer draws in grayscale.
- **Knobs** turn like the original's: drag around the knob (270° = full range,
  Shift for fine). The dot in the middle switches the knob to **Auto**: it drifts
  by itself around its value (saved with the project).
- **Deformers**: Amplify, Twist, Bulge, Wave, Shear, Depth, Ripple, Jitter,
  Disorder, Randomize, Webcam (camera brightness displaces the shape and can
  color it).
- **Color**: Palette (tone ramp, simple ramp or solid, with the original's 14
  presets and a live gradient preview) and Hue shift
  (static or cycling).
- **Style**: Line style (13 styles) and Outline.
- **Post FX**: Bloom, Color correct, Blur, Lens, Kaleido, Trails, Fracture. These
  run the original GPU per-layer shaders. Quick filter is a Canvas 2D filter.
  **Corner pin** does projection mapping: with it selected, drag the four
  corners on the preview (or drive them with any number).
- **Controls**: Value, LFO (sine, triangle, saw, square, random), Map range,
  Smooth (attack and release), Math, Random (per beat, at a rate, or when its
  `trigger` input rises above 0.5).
- **Audio analysis**: Audio band (bass, mids, high, full) and Beat read an
  `audio` wire (or the project sound if unwired). **Audio EQ** (10 bands) sits
  in an audio wire and reshapes what follows it.
- **Composite**: Background (flat, vertical, radial), Blend, Output.

Audio → Input, Waveform or Emitter → shape nodes → Post FX → Output. Audio wires are lime.
Shape nodes (amber wires) change *how it draws*. Post FX nodes (blue wires)
process the finished image.

## Using it

- **Quick build**: select a node, then click a library node. It is inserted right
  after the selection. Deleting a node heals the chain.
- **Tab search**: press Tab with the mouse over the graph, type (e.g. "fluid",
  "bloom"), and press Enter. The node drops at the cursor; over a wire, it is
  inserted into that wire.
- **Detach**: press and hold a node's title (or Alt-drag it) and pull it out. Its
  wires are removed and the chain heals.
- **Drive any knob**: drag a number output (teal) onto a node and pick the knob.
  On an Emitter, the menu also lists that emitter's own options (e.g. Fluid
  viscosity), so audio or an LFO can drive them.
  An input of 0 keeps the knob value and 1 pushes it to the maximum. A node with a
  single knob connects directly.
- **Wires**: drag from an output dot to an input dot or to a node. Clicking an
  output and then an input also works. Click a wire to delete it.
- **Audio**: select an Audio node (or click the source name in the transport) to
  load a file, use the Mic, or **System** (desktop Chrome/Edge: share a screen or
  tab and enable "Share audio"). Files play through the speakers; mic and system
  input are analysed only. Without audio, a demo beat plays. Wiring a
  number into an emitter's Drive replaces the music for that emitter.
- **Keys**: ⌘Z / ⇧⌘Z undo and redo, ⌘D duplicates, Delete removes, Space pauses,
  F toggles fullscreen.
- **Templates, Save/Restore** (in this browser), **Export/Import** JSON, and
  **Rec** records the preview with audio to WebM, and **Snap** saves a PNG.
  **Output** opens the live picture in its own window for a projector or second
  display (double-click it for fullscreen).

## Engine

Each Input or Emitter node that draws loads the trusted same-origin regular app into an isolated frame.
Pro drives the app's own live render loop (`liveAnimLoop`) one frame at a time.
It replaces the app's analyser with a synthetic one that Pro fills from the real
audio, the demo beat or a Drive value. Everything the original applies when
compositing (symmetry, flip, mirror, spin, particles, per-layer Post FX) therefore
renders exactly as in Audiograph. Post FX nodes call the original's
`applyLayerFx` on any image. If there are no emitters, a helper engine runs them.

Projects are versioned and validated. Emitter options accept only numeric values
under safe IDs. Code and expressions are never imported. Version 1 and 2
projects are migrated automatically (old Emitter nodes become the matching Input
or Emitter node, and a camera-sourced Video becomes a Camera node). Media files (audio, image, video, OBJ, .ply/.splat) are
not saved in projects.

## Limits

- Output is fixed at 960×540, with Low simulation quality.
- Each project allows four drawing nodes (Inputs other than Audio, and
  Emitters), four layers and 60 nodes per layer.
- Not included: the original's multi-plane mapping editor, AI Look, autopilot and
  morphing. Corner pin + Output covers single-surface projection.
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
- Post FX without an emitter, and Corner pin warping
- the library layout (Inputs first), Audio node sources, Audio EQ in a wire,
  Camera input and its numbers
- v1/v2 migration and rejection of unsafe imports
- every template, layers, save/restore, and 390px overflow

**Graph navigation**: two-finger trackpad scroll pans in any direction, pinch (or
⌘-scroll) zooms; a mouse wheel zooms, Shift + wheel pans sideways.
