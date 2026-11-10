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
- **3D Object → Choose model** loads OBJ, FBX, USD (.usda, .usdc, .usdz), GLB or glTF.
    Polygons of any size are triangulated (concave ones too). USD reads the root layer's
    meshes, xform stacks, UVs, stage units and up axis; flatten files that reference
    others. Still models keep up to 500,000
    triangles (Normal and Point cloud draw them on the GPU); animated models are thinned
    to 40,000 faces because they are re-posed every frame. Animated FBX (e.g. Mixamo
    "With Skin") and GLB/glTF models (node, skinned and morph animation) play automatically, with **Animation speed** and
    a **Clip** picker; Cloners and particle emission follow the moving mesh. Export
    glTF as a single .glb (or with embedded buffers).
- **3D camera → Depth of field / Focus** works on every 3D Object render, the
  Waveform (line) render included. Focus 0 is the near side, 100 the far side.
- **3D camera → Lens → Focal length** (14–200 mm, full-frame; 28 mm is the classic
  view). The subject stays framed, so short lenses exaggerate depth and long lenses
  flatten it. In the Cloner it sets the real field of view; classic 3D modes scale
  their Perspective by the same ratio.
  - **Text**: plain letters (font, weight, colour; **Bounce** scales them with wired audio). It
    outputs an `image`, so it can feed effects, masks or **WebGPU particles → emit**.
  - **Gaussian Splat** (.ply / .splat, demo cloud by default).
- **Masking**: every generator (waveforms, emitters, 3D Object, Cloner, Splat, Text, Image,
  Video, Camera, the EQ nodes) has a **mask** input that takes anything visual, and any
  generator can be the mask. **Mask by** Brightness (default; works on black backgrounds) or
  Alpha; **Invert mask** keeps the rest; **Mask feather** softens the edge. A masked waveform
  keeps its mask through deformers. The settings appear once a mask is wired.
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
- **Waveforms**: **Text EQ**, **Image EQ** and **Video EQ** draw your words, a picture or a video as
  audio-reactive lines (the original layouts; load the picture or video in the node). **2D** (Linear, Circle, Spiral, Sacred, Water, Math…). **Water** drops a stone
  on every beat (anywhere, or always in the centre) and the high frequencies add rain; see the
  rings as audio lines riding the crests (**Rings**), a grid of lines pushed by the water
  (**Field**) or a rippling side-on mesh (**Surface**). Wavelength, Speed, Fade, Rings and Rain
  shape the water. Water starts with short ticks (Height 10); Line style › Angle turns them and
  Outline echoes each ring (or each Surface row).
- **3D**: **3D Object** — one node for every shape: Sphere, Cube, Torus, Cylinder,
  Cone, Icosphere, Pyramid, Frame, Knot, Tetrahedron, DNA, Terrain, **3D text** (your words
  extruded from the letters' outlines, smooth curves and crisp corners, with Font and Depth) and **3D model** (your
  imported OBJ, the built-in knot until you load one). **Render** is **Normal** (a
  solid, lit object with size, detail and stretch), **Waveform** (audio-reactive
  lines), **Polygons** (filled faces in palette colours: each face hears its own
  band, brightens and moves out along its normal; Elevation, Noise, Gap and Edges
  shape it; animated models play) or, for a Model, **Point cloud** (framed like the other renders). A **3D Model** always comes with a
  **3D camera** wired after it: the camera holds the view (**Rotate**, Orbit, Orbit with sound, Tilt, Zoom, Focal length),
  so the model's own Perspective / Tilt / Rotate (and point-cloud Orbit / Tilt / Zoom) step aside; dragging the preview
  rotates and tilts the camera, the wheel zooms it, double-click resets it. A model's colours come from the Palette:
  loud lines / faces take the top of the ramp (Sound › Sensitivity, Contrast); a point cloud uses Look › Colour. Every 3D Object has an `object` output:
  **Cloner** (layout, counts, spacing, steps, **Scale** (uniform and X / Y / Z, on top of the object's own size and stretch), rotation, variety) takes up to three and
  clones whatever is wired, imported Models included. **Effectors** (Sound, Field, Random, Links with width, glow and sound pulse) and **Look** (Material,
  Light, Camera). **Light** adds soft cast shadows, a light size for softer penumbras and highlights,
  coloured bounce light and an optional floor that catches the shadows. Chain effectors and look nodes after the Cloner. Older Primitive, 3D Object and Waveform 3D nodes open as 3D Objects. Older cloner projects split
  into these nodes automatically.
- **Viewport camera**: drag in the preview to orbit a 3D layer (right- or Shift-drag pans), or to move a 2D
  layer; the wheel, a trackpad pinch (Chrome, Edge, Safari) or a two-finger touch pinch zooms, and a double-click resets.
  Classic 3D renders (Waveform, Polygons) zoom natively, so lines stay sharp. It applies to the active layer and is saved with it.
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
- **Deformers**: **Symmetry** and **Mirror** (above), **Bend** (Twist, Bulge, Wave, Shear, Depth, Ripple, **Water ripples**:
  beats drop stones onto the shape and the travelling rings push it around, Webcam:
  camera brightness displaces the shape and can color it) and **Noise** (Jitter,
  Disorder, Randomize, Flow field for classic Particles, Turbulence for WebGPU
  Particles and Smoke).
- **Color**: Palette (tone ramp, simple ramp or solid, with the original's 14
  presets). Its colours live on the ramp itself: click the ramp to add a colour
  (2–8), click a stop to pick its colour, drag a stop off the ramp (or right-click)
  to remove it. The dot under each stop is **Auto**: that colour's hue slowly
  wanders on its own path. The box under it is that colour's **opacity** (type a %
  or drag it up/down), like the original's stops. **Opacity** makes the recoloured result see-through
  (Mix still blends it with the original colours). Hue shift (static or cycling) and
  Color correct (brightness, contrast, saturation, hue, invert). Palette and Hue
  shift take a shape *or* any image (a Merge, Post FX…), so
  they fit anywhere in a chain. Palette **Blend** Normal replaces the colors that
  came before; Multiply, Screen, Overlay, Soft/Hard light, Color, Hue,
  Saturation, Luminosity, Dodge, Burn, Add, Difference and Exclusion mix the
  palette's gradient map with them (**Mix** sets how much).
- **Line style & Outline** are groups on every waveform node (13 line styles; outline off by default). Line style is the first
  section, right under the mode menu, and also holds the line knobs (Line count, Height, Thickness, Vary height / thickness).
- **Reset node** (next to Duplicate and Delete in the inspector) returns a node's settings to their defaults; it keeps
  its mode, wires and loaded media (Undo brings the settings back).
- **Post FX**: Bloom, Blur, Lens, Kaleido, Trails, Fracture. These
  run the original GPU per-layer shaders.
  **Liquid glass** (WebGL2, `glass.js`) floats merging metaballs of glass over the
  picture: each refracts and flips what is behind it, with chromatic fringes, a
  bright rim and highlight. Its knobs are split into Blobs, Glass, Tint (tint, amount,
  dim outside) and Sound (bass swell, beat pulse, wobble).
  **Glitch** breaks the picture up with slice shifts, RGB split, displaced blocks and stutter
  (repeating the last frame), driven by the sound: **Hits on** Beats / Bass / Highs / Loudness / Always,
  with Threshold, Decay and Speed; the **Look** fold mixes the four effects. Quiet passages stay clean.
  **Strobe** flashes on Beats (every 1, 2, 4 or 8), when Bass / Highs / Loudness cross the Threshold, or
  at a Steady rate; Style is Flash (any colour), Blackout or Invert, and Decay sets the fade.
  **Safe** (on by default) keeps it to 3 flashes a second, the photosensitivity guideline.
  **Melt** drips the bright parts down like hot wax (each column at its own pace) while the
  sound is up (React: Beats / Bass / Loudness / Always; Sound sets how much it depends on it) and
  heals when it calms; Threshold picks what melts, Length how long drips last.
  **Tunnel** zooms endlessly into recursive copies of the picture (Scale = size of each copy),
  pushed by Speed and Bass and kicked by beats, with Twist per copy; Key lets dark areas show the
  copies behind.
  **Shader** runs custom GLSL in Shadertoy style: `void mainImage(out vec4 fragColor, in vec2 fragCoord)`.
  `iChannel0` is the input picture (optional: without one it is a generator), `iChannel1` the
  sound (512×2: row y=0.25 spectrum, y=0.75 waveform), `iChannel2` the node's previous output
  (feedback; enabled when the code uses it). Also `iTime`, `iTimeDelta`, `iFrame`, `iResolution`,
  and `uBass`, `uMids`, `uHigh`, `uLevel`, `uBeat` (0–1). Up to four `uniform float name; // @knob min..max =default`
  lines become knobs (wireable). Examples: Sound rings, Wobble, Kaleidoscope, Plasma, Edge glow.
  Apply with ⌘/Ctrl+Enter; compile errors show under the code (with line numbers) and the picture
  passes through untouched.
  All of these take an optional audio input (otherwise the project's audio). Older projects' Glitch
  deformers open as the Post FX.
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
- **AI** (needs the local AI bridge, see [`ai/README.md`](../ai/README.md)): **AI Model**
  (SD-Turbo, SDXL-Turbo, SD 1.5 + LCM; bridge address), **AI Prompt** (prompt, negative,
  a second prompt and an audio-drivable Mix between them, plus a Style preset such as Oil
  painting or Cyberpunk), **Prompt list** (one prompt per line, advancing every N beats or
  seconds in Loop / Ping-pong / Random order with a Morph crossfade; Index output),
  **ControlNet** (canny or depth) and **AI Render**, which restyles any picture live
  (Strength, Steps, Guidance, Seed, New seed per beat/bar, Size, Smooth, Mix, and Dream
  feedback with Zoom and Spin). One frame is in flight at a time; with no bridge running the
  picture passes through and the inspector shows the one-line setup command. On an
  M2 Max SD-Turbo at 512 px runs at about 7–9 fps (canny 5–6 fps).

Audio → Input, Waveform or Emitter → shape nodes → Post FX → Output. Audio wires are lime.
Shape nodes (amber wires) change *how it draws*. Post FX nodes (blue wires)
process the finished image.

## Using it

- **Guide** (?): starts with the credit (Made by Vladimir Petković,
  www.vladimirpetkovic.com) and explains the screen, nodes and wires, every library
  category, audio, driving knobs, layers, Mapping, Autopilot, saving and keys.
- **Transport** (under the preview): play/pause, record, export, snapshot and the audio
  source on the left, the live spectrum in the centre, **Detach** on the right.
- Buttons and selected states are grayscale; colour is kept for node categories
  (the inspector title takes its category colour) and wire types.
- **Quick build**: select a node, then click a library node. It is inserted right
  after the selection. Deleting a node heals the chain.
- **Tab search**: press Tab with the mouse over the graph, type (e.g. "fluid",
  "bloom"), and press Enter. The node drops at the cursor; over a wire, it is
  inserted into that wire.
- **Bypass** (⏻ on the node, or **B** for the selection): the node is switched off
  and its input passes straight through, like a pedal. A bypassed emitter draws
  nothing. Saved with the scene and undoable.
- **Preview** (◉ on the node, or **V**): the viewport shows just that node's
  picture, wherever it sits in the chain (even in a hidden layer). V again, Esc
  or "Show output" returns to the full composition.
- **Detach**: press and hold a node's title (or Alt-drag it) and pull it out. Its
  wires are removed and the chain heals.
- **Wedge**: drag an unconnected node (or a library item) onto a wire; the wire
  lights up, and on release the node is inserted between the two nodes. No need to
  aim: any wire passing under the dragged node's body (or within ~20 px of a library
  item or the Tab-search cursor) counts, and only wires whose ports fit light up.
- **Drive any knob**: drag a number output (teal) onto a node and pick the knob.
  On an Emitter, the menu also lists that emitter's own options (e.g. Fluid
  viscosity), so audio or an LFO can drive them.
  An input of 0 keeps the knob value and 1 pushes it to the maximum. A node with a
  single knob connects directly.
- **Wires**: drag from an output dot to an input dot or to a node. Clicking an
  output and then an input also works. Click a wire to delete it. Wiring a node that
  feeds the Output into a fresh FX whose output is still unwired splices that FX in
  (A → Output becomes A → FX → Output); one undo puts it back.
- **Audio**: select an Audio node (or click the source name in the transport) to
  load a file, use the Mic, or **System** (desktop Chrome/Edge: share a screen or
  tab and enable "Share audio"). Files play through the speakers; mic and system
  input are analysed only. The **input menu** under the buttons picks (and remembers) the
  Mic's device. For one-click system audio install a loopback device (BlackHole or
  Loopback on Mac, VB-Cable or Stereo Mix on Windows): System then records it directly,
  with no screen-share picker. There is no default sound: until you pick one the
  visuals stay still and the Audio node glows with **Select your audio source**
  (the splash's **Start** selects it). `?demo` (used by the tests) feeds a silent
  synthetic beat instead. Wiring a
  number into an emitter's Drive replaces the music for that emitter.
- **Keys**: ⌘Z / ⇧⌘Z undo and redo, ⌘D duplicates, Delete removes, Space pauses,
  F toggles fullscreen.
- **Templates**: **User templates** (Save → Save as template, kept in the browser) and the **Audiograph presets** (the originals plus scenes in `scenes.js`, e.g. **Cloned**).
- **Save**: Save scene writes an .ag file wherever you choose (⌘S); Save as template (⇧⌘S) adds a User template.
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
  Ripple, Water ripples and Jitter as a GPU image warp, and Symmetry on the rendered picture.
- **Inspector sections** work like an accordion: the basics sit at the top, and
  opening a section (Lines, Outline, Sound…) closes the others. The open
  section is remembered per node type. Choice chips such as Growth's Type sit at the
  top; Growth starts as Coral.
- **Open/Save .ag scene files** (⌘O, ⌘S, ⇧⌘S Save As; drop an .ag on the window
  to open it). **Reset** starts over from the starting scene (Undo brings your scene back); the sound
  (file, mic or system audio) keeps playing and the Audio nodes keep their settings. On screens
  1440px and wider the whole UI is drawn 20% larger. **Templates**, **Random** and
  **Reset** sit on the graph bar; zoom (−, +, Fit) sits in the graph's bottom-right corner.
  **Fit** frames the graph; if nodes overlap or wires run backwards it first arranges it into
  left-to-right columns (one undo step).
  The transport has icon buttons: **Play/Pause** (Space; Home rewinds), **Rec** (records the
  preview live with audio and shows elapsed time), **Export** (renders a sound file
  frame by frame to MP4), and **Snap** (saves a PNG).
  **Detach**, in the middle of the transport, opens the live picture in its own
  window for a projector or second display (double-click it for fullscreen).
- **Mapping** (the Studio | Mapping switch at the top) is projection mapping. The library
  becomes the mapping panel and the surfaces appear over the preview. Its colour-coded
  categories fold like the library: **Scene** (Mapping, Test card, Layout, Snap, the
  scene's layers with show/hide and the surfaces), **Surface**, **Projection** and **Camera**.
  - Start from a layout (Single screen, Cube, Span 2, Triptych, Corridor, Curved
    wall, Circle) or add up to 8 surfaces.
  - Drag a point to move it, drag inside a surface to move the whole surface, and
    use the arrow keys to nudge (Shift ×10). Delete removes the selected surface.
    **Snap** (on by default) pulls a dragged point or surface onto the frame corners
    and the points of other surfaces; hold Alt to drag freely.
  - **Warp**: Flat (4 corners, true perspective) or a curved grid of up to 5×5
    points for curved or uneven surfaces.
  - **Crop** chooses which part of the picture a surface shows. **Shows** can
    give a surface one layer of its own; a hidden layer still renders there.
  - Opacity, edge **Feather** (for overlapping projectors), Rectangle / Ellipse
    mask, Match crop, Full frame, Flatten and Flip.
  - **+ 3D object**: Cube, Sphere, Cylinder or Two walls; load OBJ, FBX, USD, GLB or
    self-contained glTF with UVs at full detail (up to 1,000,000 triangles) (planar fallback), Front projection or Box content.
    Normals are smoothed, so faceted models blend cleanly. **Box** content has a Box
    fade (soft blend between the three planar projections), Tiling (mirrored repeat)
    and a Box transform (move, rotate, and scale X / Y / Z or uniform).
    **Transform** moves, rotates and scales the object about its centre (X / Y / Z
    or uniform). A **Gizmo** for either transform (Off / Move / Rotate / Scale;
    keys W, E, R, Q) draws coloured handles in the view: drag an arrow to move
    along an axis, a ring to turn about it, a square to stretch one axis, or the
    centre square to scale uniformly. The Box gizmo also outlines the box. Each
    drag is undoable and the knobs follow it. **Lattice**
    (2³, 3³ or 4³ points) bends it to match the real object — drag the yellow points
    in the view (each drag is undoable; Reset lattice straightens it).
    **Shading → Ambient occlusion** (Off by default) darkens creases, corners and
    the wall behind columns: a GPU position prepass, a 16-sample screen-space
    occlusion pass and a depth-aware 4×4 blur. Strength and Radius (% of the
    model size) shape it; it needs float render targets (EXT_color_buffer_float)
    and is skipped otherwise.
    Projection knobs (2D Crop; 3D Tiling, Box fade, Box move / rotate / scale)
    have **Auto**: the centre dot makes the knob drift around its value at draw
    time (the saved value stays put; the surface keeps an `auto` key list).
    Animated GLB/glTF models (skinned characters, node animation) play on the surface:
    **Animation** toggles Play / Rest pose, picks the clip and sets the speed.
    Flat/unlit WebGL2 rendering includes depth testing and double-sided faces.
    Orbit, Tilt, Distance, Roll, Pan X/Y (lens shift), Focal length (10–200 mm,
    36 mm sensor width), Model units and opacity align the projector. Drag orbits,
    Shift/right-drag pans; wheel zooms focal length, Shift-wheel changes distance.
    Wireframe is opt-in; the test card also draws mesh edges. Neither selection
    nor editing automatically adds lines to the clean projector output.
  - **Import camera…** reads binary FBX 7.x (including deflate arrays), ASCII FBX,
    USDA text and GLB/self-contained glTF perspective cameras. First camera/clip;
    parent transforms, animated translation/rotation/focal and aperture supported.
    Play/Hold, scrub Time, Speed and transport sync control the sampled track
    (up to 30 fps, capped at 2000 samples, stored in the project). Binary USDC/USDZ
    must be exported as USDA. Bake constraints, FBX pivots and inverse USD ops.
    FBX cm and USD stage units/up-axis convert to metres/Y-up; model and camera
    must use the same scene coordinates (OBJ assumes metres; use Model units
    for unit conversion and Object up for native Z-up OBJ files).
    Model geometry stays in memory, not JSON: reopen the named file when loading
    a project; until then the selected primitive is a placeholder. Primitives and
    camera tracks require no external files. glTF mapping uses the rest pose.
  - The **Test card** draws a numbered grid on every surface for alignment.
  - The handles are only drawn in the studio, so Detach sends the clean mapped
    picture to the projector. The mapping is saved with the project and kept when
    you switch templates.
- A **welcome screen** opens on startup. Its six sections jump straight in:
  Visualize (Studio), Presets (Templates), Auto-play (Autopilot), Project
  (Mapping), Export (video) and Share (link). Each section opens a short guide that
  highlights the real controls, coloured like that section; some end with an action
  (Choose a template, Export video, Create link). **Start** goes to the studio with the Audio node selected;
  **Tutorial** runs the full First Mile tutorial. Close it with × or Esc. Tick
  "Don't show at startup" to skip it; reopen it from the Guide (?) with
  **Welcome screen**, or add `?splash` to the URL. It is skipped for shared scene
  links. Behind the logo, full-HD muted clips (darkened towards the bottom by a gradient) recorded from templates (Cell, Doppler,
  Echo, Flares, Ripples, Sacred geometry, Tree, Universe; `splash/*.mp4`)
  crossfade in a fresh random order each time. Add or replace clips there and in
  `SPLASH_CLIPS`. It is skipped with reduced motion.
- **Tutorial** (top right) is the First Mile, like the original's interactive
  tutorial: it first highlights each audio source (Load file, Mic and System) and
  explains it, then builds a real scene step by step,
  starting from a straight Linear waveform (Audio → Waveform → Particles →
  Twist → Palette → Bloom → Trails → Output, an LFO driving a knob, a second
  layer), then highlights Templates, Mapping, Autopilot, recording and saving.
  It is offered once on the first visit (`?notour` skips that), Esc or Skip
  leaves it, the tutorial scene stays editable, and one Undo restores your
  previous scene. Its card always sits beside the highlighted control, never
  over it. The studio opens with a simple starting scene (Audio →
  Concentric waveform drawn as Pins → Palette in the Classic colours → Output),
  which Reset also returns to.
- **Random** (beside Templates) creates a new wired node graph with random
  emitters, colours, motion and effects. It stops Autopilot; Undo restores your scene.
- **Resolution** (beside fullscreen) sets the actual 16:9 output to 540p, 720p,
  1080p, 1440p or 4K, including snapshots, recordings and Detach. It is remembered
  in this browser and locked during recording. Higher resolutions use more GPU.
- **Export video** (the download arrow beside Rec) renders the song (or a stretch
  of it) frame by frame on a virtual clock and saves an MP4 (H.264 + AAC). Every
  frame makes it in at 720p, 1080p, 1440p or 4K and 30 or 60 fps, whatever the
  scene's weight; the sound analysis follows the song exactly. It needs WebCodecs
  (Chrome, Edge, Safari 17+) and a sound file; for mic or system audio use Rec.
- **MIDI** turns on MIDI learn: click a knob, switch or chip in the inspector (or
  a layer's Opacity / Visible, or Play, Rec or an action in the MIDI panel), then
  move a knob, fader or pad on your controller. Knobs follow CCs across their
  range; pads toggle switches, step through choices or fire actions (Play / pause,
  Blackout, Autopilot, Next scene, Random scene, Record). Alt-click or right-click
  unmaps; Esc or Done leaves learn mode. Knob mappings are saved in the scene;
  action mappings stay in this browser.
- **Share** makes a link that holds the whole scene (layers, nodes, settings,
  mapping, MIDI mappings), compressed into the address. Nothing is uploaded;
  media files and your sound are not included.
- The **Cube** mapping layout uses a folded cap so the image meets both side
  faces at their shared edges. Choose **Cube cap · wrap sides** under Warp to
  restore this on a surface, or **Flat · 4 corners** for ordinary corner pinning.
- **Preset Morph** (its own section of the Autopilot tab) blends the original Audiograph templates.
  Add a playlist, or leave it empty to use all templates; Play cycles it over
  Duration, Random chooses pairs, On Beat offers quarter-beat/full-beat glide
  or Snap, and Ping-pong reverses timer playback. Morph scrubs the sequence.
  Starting it stops generative Autopilot, and Undo restores your prior graph.
  Apply expands the current blend into editable nodes. Stacks exceeding the
  eight-renderer limit remain exactly editable through a Preset Morph node.
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
    new engines. When a whole stack changes (drops, Next) the new looks roll in
    one layer at a time while the old ones keep playing, base first; the
    picture never freezes. The base always draws beneath its accents.
  - Everything is art-directed by **scenes**: curated pairings of a base, a
    lighter accent, post FX (bloom, kaleido, reflect, chromatic, vignette,
    grain, trails, fracture), a colour harmony (analogous, complementary,
    triad, split, mono) and an energy range: Halo, Orbit, Mandala, Liquid,
    Smoke temple, Helix lab, Shatter, Tunnel, Constellation, Embers,
    Mirror garden and Prism (Orbit, Helix lab, Prism and Shatter use 3D). A scene holds through a section;
    its phrases swap the accent, then the base, so it evolves instead of
    jumping. Audio response, height and speed are capped (more on drops) to
    keep motion smooth. The scenes were tuned by rendering each one and
    scoring brightness, coverage, clipping, colour and flicker. The status
    line names the scene.
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
Pro drives the app's own live render loop (`liveAnimLoop`) one frame at a time;
with a loaded song it runs the app's file loop (`animLoop`) on the decoded song instead,
so each line is a slice of the whole song scaled by the current loudness, exactly as
in the regular app (also in video export).
It replaces the app's analyser with a synthetic one that Pro fills from the real
audio (or silence), the test demo beat or a Drive value. Everything the original applies when
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
- Share links grow with the scene; very long ones (lots of custom code) may not
  survive chat apps or email, so send an .ag file instead.
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
