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
  - **Image**, **Video**, **Camera**: picture sources, not renderers. Each outputs an
    `image`, a `palette` (its four main colours), **brightness** and (Video, Camera)
    **motion**. Wire audio into one to warp it (Wave, Slices or Pulse). Wire its image
    into **WebGPU particles → emit** to spawn particles from its bright parts
    (coloured by the picture or the palette), into a Palette's colors, or into any
    image input. Projects from v10 and earlier convert automatically.
- **WebGPU particles → emit** takes anything visual: a picture, a waveform or
    emitter shape, or a **3D Object** (it emits from the object's live render, so a
    turning object's particles follow it). The sound still sets how many spawn.
  - **Text**, **Gaussian Splat** (.ply / .splat, demo cloud by default).
  - **Data** inputs give 0–1 numbers for any knob, with live meters in the inspector:
    - **Computer**: cpu, core (busiest core), gpu, memory, fps, network, battery and
      activity (spikes whenever a reading changes). **Range: Auto** (default) stretches each
      value to its own recent low–high over the *Range window*, so small swings still sweep
      0–1; **Absolute** gives plain percentages. Without help the browser
      can only estimate (Compute Pressure / main-thread lag, render load, JS memory).
      For real values run the local helper `node pro/tools/computer-feed.mjs [port]`
      (no dependencies; macOS, Linux, Windows; listens on 127.0.0.1 only) and pick
      **Local helper**. Chrome / Edge only (allow local network access when Chrome asks); Safari blocks local connections.
    - **Clock**: second, minute, hour, day (phase of each), beat and pulse at a tempo.
    - **Mouse & keys**: x, y, speed, click, held, keys (typing rate), scroll.
    - **Live data**: the ISS orbit, space weather (NOAA), ocean swell and weather (Open-Meteo, for a city or your location), earthquakes (USGS) or Wikipedia edits. Every source gives the same smooth level, change, pulse (events: a quake, a wave crest, the ISS entering sunlight) and phase, plus a palette made from the data; wire it into a Palette's **colors** to let the data pick the colours. Glide smooths slow feeds; Auto range stretches small swings. Offline it keeps moving on a simulated stream.
    - **MIDI**: cc (with **Learn CC**), note, gate, pitch, bend (Chrome / Edge).
- **Waveforms**: **2D** (Linear, Circle, Spiral, Harmonic, Math…).
- **3D**: **3D Object** — one node for every shape: Sphere, Cube, Torus, Cylinder,
  Cone, Icosphere, Pyramid, Frame, Knot, Tetrahedron, DNA, Terrain and **Model** (your
  imported OBJ, the built-in knot until you load one). **Render** is **Normal** (a
  solid, lit object with size, detail and stretch), **Waveform** (audio-reactive
  lines) or, for a Model, **Points**. Every 3D Object has an `object` output:
  **Cloner** (layout, counts, spacing, steps, rotation, variety) takes up to three and
  clones whatever is wired, imported Models included. **Effectors** (Sound, Field, Random, Links with width, glow and sound pulse) and **Look** (Material,
  Light, Camera). **Light** adds soft cast shadows, a light size for softer penumbras and highlights,
  coloured bounce light and an optional floor that catches the shadows. Chain effectors and look nodes after the Cloner. The original's
  cloner presets are templates under **3D cloner**. Older Primitive, 3D Object and Waveform 3D nodes open as 3D Objects. Older cloner projects split
  into these nodes automatically.
- **Viewport camera**: drag in the preview to orbit a 3D layer (right- or Shift-drag pans), or to move a 2D
  layer; the wheel zooms and a double-click resets. It applies to the active layer and is saved with it.
  Nothing rotates by default: Cloner Spin and 3D camera Orbit / Orbit with sound start at 0 (presets set their own).
- **Emitters** (particles): **Particles** (classic) and **WebGPU
  particles** (Particles, Fluid, Smoke, Granular sand). WebGPU simulations react harder to sound than in the original
  (snappier attack, shorter release, bigger beat bursts; tuned per simulation),
  and their knobs and presets still override that.
  Visual inputs, waveforms and WebGPU emitters show the original's own options in the inspector
  (knobs and choice chips, including presets) plus its audio response
  (Intensity, Bass punch, Bass release, Dynamics). They take `audio` and `drive`
  inputs and give a `shape` output.
  Every renderer also carries its geometry in grouped, collapsible inspector
  sections: Lines, Transform (scale, rotation, offset, 3D tilt and rotate, zoom on
  loud). Spin lives in a Spin node (Forces) and symmetry in Symmetry and Mirror
  nodes (Deformers). Option knobs are grouped (Setup, Sound, Emission, Forces, Look,
  Quality, Form). Projects with the old Geometry nodes fold them into the renderer.
  A simulation's physics knobs are not on the simulation: they live in Forces
  nodes, offered as one-click shortcuts in its inspector.
- **Spin** (Forces) keeps any shape turning (negative = the other way) and sets
  its animation speed. **Symmetry** (Deformers) mirrors across X / Y or repeats
  3/4/6/8-fold with a gap; **Mirror** flips H / V and adds a reflection. Wire them
  after a renderer. Older projects move these renderer settings into the nodes.
- **Forces** (WebGPU simulations): Gravity (gravity, sand gravity, smoke
  buoyancy), Drag (drag, viscosity, friction), Swirl (swirl and emitter
  spin), Attract (centre pull), Wind and Vorticity. Wire one after a simulation; it shows only the knobs for that
  simulation and lists the others it works on. Defaults match the simulation, so
  adding one changes nothing until you turn it. Older projects move their physics
  knobs into Forces nodes automatically.
  Without a Palette node a renderer draws in grayscale.
- **Knobs** turn like the original's: drag around the knob (270° = full range,
  Shift for fine). The dot in the middle switches the knob to **Auto**: it drifts
  by itself around its value (saved with the project).
- **Deformers**: **Symmetry** and **Mirror** (above), **Bend** (Twist, Bulge, Wave, Shear, Depth, Ripple, Webcam:
  camera brightness displaces the shape and can color it) and **Noise** (Jitter,
  Disorder, Randomize, Flow field for classic Particles, Turbulence for WebGPU
  Particles and Smoke).
- **Color**: Palette (tone ramp, simple ramp or solid, with the original's 14
  presets). Its colours live on the ramp itself: click the ramp to add a colour
  (2–8), click a stop to pick its colour, drag a stop off the ramp (or right-click)
  to remove it. The dot under each stop is **Auto**: that colour's hue slowly
  wanders on its own path. Hue shift (static or cycling) and
  Color correct (brightness, contrast, saturation, hue, invert). Palette and Hue
  shift take a shape *or* any image (a Merge, Post FX…), so
  they fit anywhere in a chain. Palette **Blend** Normal replaces the colors that
  came before; Multiply, Screen, Overlay, Soft/Hard light, Color, Hue,
  Saturation, Luminosity, Dodge, Burn, Add, Difference and Exclusion mix the
  palette's gradient map with them (**Mix** sets how much).
- **Line style & Outline** are groups on every waveform node (13 line styles; outline off by default).
- **Post FX**: Bloom, Blur, Lens, Kaleido, Trails, Fracture. These
  run the original GPU per-layer shaders. Quick filter is a Canvas 2D filter.
  **Smooth** on Trails (with Feedback) and on the Feedback node fills the gaps
  between zoomed echoes so they read as one continuous smear instead of rings
  (default 100; lower it for a stepped, echo look).
  **Corner pin** does projection mapping: with it selected, drag the four
  corners on the preview (or drive them with any number).
- **Controls**: Value, LFO (sine, triangle, saw, square, random), Map range,
  Smooth (attack and release), Math, Random (per beat, at a rate, or when its
  `trigger` input rises above 0.5), and **Amplify**: a pass-through for any
  wire that multiplies a number, makes audio louder, boosts the sound driving a
  shape, or brightens an image.
- **Audio analysis**: Audio band (bass, mids, high, full) and Beat read an
  `audio` wire (or the project sound if unwired). **Audio EQ** (10 bands) sits
  in an audio wire and reshapes what follows it.
- **Composite**: Background (flat, vertical, radial), Blend, Output.

Audio → Input, Waveform or Emitter → shape nodes → Post FX → Output. Audio wires are lime.
Shape nodes (amber wires) change *how it draws*. Post FX nodes (blue wires)
process the finished image.

## Using it

- **Guide** (?): starts with the credit (Made by Vladimir Petković,
  www.vladimirpetkovic.com) and explains the screen, nodes and wires, every library
  category, audio, driving knobs, layers, Mapping, Autopilot, saving and keys.
- **Transport** (under the preview): play, stop, record, snapshot and the audio
  source on the left, the live spectrum in the centre, **Detach** on the right.
- Buttons and selected states are grayscale; colour is kept for node categories
  (the inspector title takes its category colour) and wire types.
- **Quick build**: select a node, then click a library node. It is inserted right
  after the selection. Deleting a node heals the chain.
- **Tab search**: press Tab with the mouse over the graph, type (e.g. "fluid",
  "bloom"), and press Enter. The node drops at the cursor; over a wire, it is
  inserted into that wire.
- **Detach**: press and hold a node's title (or Alt-drag it) and pull it out. Its
  wires are removed and the chain heals.
- **Wedge**: drag an unconnected node (or a library item) onto a wire; the wire
  lights up, and on release the node is inserted between the two nodes.
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
- **Templates**: saved **Scenes** (exported .ag projects in `scenes.js`, e.g. **Cloned**), the original Audiograph presets and the 3D cloner set.
- **Tips stay hidden**: node descriptions and help notes sit behind the **?** in
  the inspector header (and the graph toolbar); click it to show them. The choice is
  remembered.
- **Multi-select**: drag on empty graph space to box-select (Shift adds, ⌘A selects
  all, Shift/⌘-click toggles a node). Drag any selected node to move the group;
  ⌘C / ⌘X / ⌘V copy, cut and paste (at the pointer), Delete removes, ⌘D duplicates.
  Pan with Alt-drag, middle-drag or two fingers. **Save as custom node** keeps the
  selected group in a **Custom** library category at the bottom (stored in this
  browser); click it, or find it with Tab, to add the whole group.
- The **Camera** node shows a live thumbnail of your webcam in its inspector.
- **Media inputs** (Image, Video, OBJ, splat) have a single Choose button; a loaded
  file shows as a thumbnail (or its name) with × to remove it. Image, Video and Camera
  stay still until audio is wired into them.
- **Transport**: Play / pause (Space) also pauses the visuals; Stop stops the audio and
  freezes the picture. Fullscreen (F) sits next to Detach.
- **Port colours**: every port label and wire is tinted by its type (audio, shape,
  image, number, colors, 3D object).
- **Deformers on every shape**: renderers that ignore the classic deformers (WebGPU
  simulations, the Cloner, Growth, Fractal…) get Twist, Bulge, Wave, Shear, Depth,
  Ripple and Jitter as a GPU image warp, and Symmetry on the rendered picture.
- **Inspector sections** work like an accordion: the basics sit at the top, and
  opening a section (Lines, Outline, Sound…) closes the others. The open
  section is remembered per node type. Choice chips such as Growth's Type sit at the
  top; Growth starts as Coral.
- **Open/Save .ag scene files** (⌘O, ⌘S, ⇧⌘S Save As; drop an .ag on the window
  to open it). Save also keeps a copy in this browser for **Restore**. On screens
  1440px and wider the whole UI is drawn 20% larger. **Templates**, and
  The transport has icon buttons: **Play/Pause**, **Stop**, **Rec** (records the
  preview with audio to WebM and shows elapsed time), and **Snap** (saves a PNG).
  **Detach**, in the middle of the transport, opens the live picture in its own
  window for a projector or second display (double-click it for fullscreen).
- **Mapping** (the Studio | Mapping switch at the top) is projection mapping. The library
  becomes the mapping panel and the surfaces appear over the preview:
  - Start from a layout (Single screen, Cube, Span 2, Triptych, Corridor, Curved
    wall, Circle) or add up to 8 surfaces.
  - Drag a point to move it, drag inside a surface to move the whole surface, and
    use the arrow keys to nudge (Shift ×10). Delete removes the selected surface.
  - **Warp**: Flat (4 corners, true perspective) or a curved grid of up to 5×5
    points for curved or uneven surfaces.
  - **Crop** chooses which part of the picture a surface shows. **Shows** can
    give a surface one layer of its own; a hidden layer still renders there.
  - Opacity, edge **Feather** (for overlapping projectors), Rectangle / Ellipse
    mask, Match crop, Full frame, Flatten and Flip.
  - The **Test card** draws a numbered grid on every surface for alignment.
  - The handles are only drawn in the studio, so Detach sends the clean mapped
    picture to the projector. The mapping is saved with the project and kept when
    you switch templates.
- **Tutorial** (top right) is the First Mile, like the original's interactive
  tutorial: it builds a real scene step by step (Audio → Waveform → Particles →
  Twist → Palette → Bloom → Trails → Output, an LFO driving a knob, a second
  layer), then highlights Templates, Mapping, Autopilot, recording and saving.
  It is offered once on the first visit (`?notour` skips that), Esc or Skip
  leaves it, the tutorial scene stays editable, and one Undo restores your
  previous scene.
- **Random** (beside Templates) creates a new wired node graph with random
  emitters, colours, motion and effects. It stops Autopilot; Undo restores your scene.
- **Resolution** (beside fullscreen) sets the actual 16:9 output to 540p, 720p,
  1080p, 1440p or 4K, including snapshots, recordings and Detach. It is remembered
  in this browser and locked during recording. Higher resolutions use more GPU.
- The **Cube** mapping layout uses a folded cap so the image meets both side
  faces at their shared edges. Choose **Cube cap · wrap sides** under Warp to
  restore this on a surface, or **Flat · 4 corners** for ordinary corner pinning.
- **Template Morph** in Autopilot blends the original Audiograph templates.
  Add a playlist, or leave it empty to use all templates; Play cycles it over
  Duration, Random chooses pairs, On Beat offers quarter-beat/full-beat glide
  or Snap, and Ping-pong reverses timer playback. Morph scrubs the sequence.
  Starting it stops generative Autopilot, and Undo restores your prior graph.
  Apply expands the current blend into editable nodes. Stacks exceeding the
  eight-renderer limit remain exactly editable through a Template Morph node.
  Playlist and playback options are remembered, but playback never starts on reload.
- **Autopilot** (third switch at the top) is the original Audiograph's Automation:
  - Turn it **On** and it listens for the song's sections (breakdown, groove,
    build-up, drop) and at each one slowly crossfades to a fitting variation,
    and otherwise every **Every** seconds (8–60, default 24). Changes take
    7–10 s, 2.5 s on a drop, and are at least 8 s apart. The status line shows
    the section, the level and the time to the next change.
  - **Changes**: *Colours* (your layers' palettes glide along a hue walk),
    *Mood* (also shape, spin and speed) or *Everything* (default). Everything
    runs its own stack of 1–3 layers (**Layers**: Auto/1/2/3): a main look
    plus lighter companions that share its palette, are finer and spin the
    other way. It replaces the project once (one undo step) with four
    *Autopilot* layers; each change warms the new look up out of sight in a
    free layer and crossfades to it, so it never rebuilds the graph or starts
    new engines. Drops rebuild the stack under a dissolve of the last frame.
  - **Describe** is optional: mood, colours, emitters, line style and motion
    (*"slow dreamy blue and gold spirals"*, *"ocean smoke"*, *"neon particles,
    fast"*). The line under it shows what it read. Typing builds after a
    pause (Enter at once). Empty, it roams freely through the 2D and 3D
    emitters, solids and simulations. **Prompt match** (default 85%) sets how
    closely it sticks to your words.
  - **Write** lets Autopilot write its own descriptions at each change;
    typing takes over again. **Next** changes now; **Hold** keeps the look.
  - Every change to what is drawn (Autopilot, templates, adding or deleting
    nodes, wires or layers) dissolves from the last frame; new engines start
    behind it, so there is no flash.
- **Panels**: drag the borders between the library, preview, graph and
  properties to resize them. Drag a border nearly closed or double-click it to
  hide that panel, and double-click again to bring it back. The layout is saved in this browser.

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
- Not included: morphing between presets (use the original Audiograph).

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
