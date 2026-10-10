# Audiograph

**Sound becomes shape.** A browser-based audio-visualization instrument where line density and form encode the music — dense and tall when loud, sparse and calm when quiet.

Single HTML file. No dependencies. No build step. Open it in a browser and go.

![version](https://img.shields.io/badge/version-64-blue) ![license](https://img.shields.io/badge/license-MIT-green)

**▶ Live: [vladimirpetkovic.github.io/audiograph](https://vladimirpetkovic.github.io/audiograph/)**

---

## How It Works

Audiograph maps audio energy to visual form. Every frame it samples the audio, and each element's height/shape/position is driven by loudness. The result is an organic, breathing composition that reacts to music in real time.

**Three audio sources:**
- **Load Audio** — drop in any audio file (mp3, wav, flac, ogg)
- **Mic** — live input from your microphone
- **System** — capture whatever your computer is playing (share a tab with audio)

## Composition model: Layers

Everything is built from **layers** — stack as many as you like, each with its own layout, style, colors, outline, deformers, particles, symmetry, and playback mode. Layers have independent opacity and composite together, so a single scene can combine, say, a 3D sphere behind a spiral of glowing rings.

## Appearance

The **Appearance** panel holds the three choices that define a look:

### Layout — 20, grouped

**General** — Linear · Sine · Circle · Concentric · Spiral · Phyllotaxis · Kaleidoscope · Fractal · Ridge · Scatter
**3D** — Terrain · Sphere · Tetrahedron · DNA
**Input** — Image · Video · Pixel Warp · Text · Math · 3D Object

Highlights:
- **Ridge** — a Joy Division–style stacked ridge plot; each row is a frequency band (bass at bottom, treble at top).
- **Fractal** — a recursive, audio-driven branching tree (bass widens branches, treble adds asymmetry).
- **Terrain / Sphere / Tetrahedron / DNA** — real 3D wireframes with audio-driven surface displacement; drag to orbit.
- **3D Object** — load your own `.obj` model and drive it with audio.
- **Image / Video / Text** — lines conform to a brightness map (picture, live camera, or typed words).
- **Math** — write your own `x`/`y` formulas in JavaScript.

### Style — 20 (incl. Off)

Off · Straight · Rounded · Dotted · Dashed · Pins · Tapered · Caps · Cross · Numbers · Symbols · Words · Cascade · Feather · Circles · Braille · Arrows · Slash · Needles · Diamonds

Each style exposes contextual controls (**Size / Density / Angle**). **Off** draws no base shape — pair it with an Outline to render the outline alone.

### Outline — 5 styles

Solid · Dotted · Dashed · Connected · Fill. *Connected* draws a network graph between points; *Fill* fills the area/ring the lines span with a gradient (works on both linear and radial layouts).

## Color

- **Solid**, **Tone Ramp** (loudness → gradient), **Simple Ramp** (position → gradient)
- Per-stop opacity for transparency
- Dozens of built-in ramp presets

## Geometry & Motion

Density, Contrast, Sensitivity, Height, Thickness, Scale, Offset, Rotation, Fade Edges, Vary Height/Thick, Flip, Mirror, Symmetry (X / Y / XY / 3–8-fold radial), Spin, and Speed.

## Deformers

Audio-reactive spatial distortions: **Twist · Bulge · Wave · Shear · Depth · Ripple** (concentric waves) **· Jitter** (animated noise).

## Reactive Rules

Map audio features to visual parameters for automatic, musical behavior:
- **Sources**: Bass · Mid · Treble · Energy · Beat
- **Targets**: Height · Thickness · Zoom · Contrast · Twist · Bulge · Wave · Ripple · Shear · Depth · Fade Edges · Outline Glow · Hue Shift — chosen to *breathe* with the music while keeping the composition harmonious.
- Stack multiple rules; strength slider per rule.

## Particles

Optional per-layer particle overlay that spawns from the actual layout positions and reacts to audio energy. 11 shapes, four combinable noise fields (Perlin / Curl / Brownian / Vortex), and full physics (gravity, damping, spread, trails).

## Post-FX (GPU)

Real-time WebGL shader stack: Bloom · Chromatic Aberration · Vignette · Scanlines · Sharpen · Invert · Reflect · Contrast · Blur (X / Y / Radial) · Focal · Trails · Feedback · Edge Glow · Kaleido.

## Preset Morph ★

A signature feature — smoothly blend through a **playlist** of presets:
- **+ Add preset** to build a sequence (or **All** for everything); each shows as a removable chip.
- **Play** cycles them in order over a chosen Duration, looping seamlessly.
- **Random** jumps between random presets (your list, or all of them).
- **On Beat** advances on detected beats instead of a timer.
- **Ping-pong** bounces back and forth; drag **Morph** to scrub by hand.
- Blends *every layer* of both presets — matching layers interpolate parameters and colors for a true geometric morph; mismatched layers/types crossfade, so a 2-layer preset morphs cleanly into a 5-layer one.
- **Apply** bakes the current blend into editable layers.

## Presets & Sharing

- **15 built-in presets**: cell · echo · firepit · flares · glass · globe · magnet · organica · sacred_circle · sacred_geometry · spiral_planes · tree · universe · waves · zodiac
- **Save / Save All / Export / Import** your own.
- **✨ Surprise Me** — composes a fresh, coherent random scene (tasteful layout + harmonious palette + matching style).
- **🔗 Copy Link** — encodes the entire current look into a URL. Open the link anywhere to reproduce the composition exactly (just load your own audio).

## Export

- **PNG** (with or without background)
- **SVG** vector export
- **Record** MP4/WebM video with audio (captures post-FX, at full resolution)

## Live Projection (v22)

Click **Project visuals** beside the transport to open a visuals-only window. Move it to a projector or second monitor, then click **Fullscreen**, press **F**, or double-click the visuals. Escape exits fullscreen. The output's controls and cursor hide after two seconds in fullscreen; move the mouse to reveal them.

Keep the original window visible on your laptop to control the music and visuals. The output shares the finished frames, including layers, particles, morphing, trails, and GPU post-FX, rather than running a second visualization or duplicating audio. Rendering uses the output screen's aspect ratio and device-pixel-ratio (subject to the existing performance cap); the controller preview is letterboxed to match without distortion.

**Focus output** reuses the open window. **Close output**, or closing the output itself, leaves playback running; you can reopen it at any time. Closing/reloading the controller closes its output too. Allow pop-ups for Audiograph if prompted. Use an extended desktop, not display mirroring, to keep controls off the projector.

Keep the controller tab in the foreground and the laptop awake during a show: browsers can throttle hidden or minimized windows. Larger output resolutions and heavy presets cost more GPU/CPU time. Recording keeps its starting resolution even if the output is resized; the output letterboxes until recording stops.

## Versions and Rollback

The live entry point is `index.html` (**v64**, released from the v44–v64 previews below). Each release is also preserved as `versions/audiograph_N.html`; [v21](versions/audiograph_21.html), [v22](versions/audiograph_22.html), [v34](versions/audiograph_34.html), [v42](versions/audiograph_42.html), [v43](versions/audiograph_43.html), [v61](versions/audiograph_61.html), [v62](versions/audiograph_62.html), [v63](versions/audiograph_63.html) (the previous main app) and every preview remain independently runnable. Git release tags provide a second rollback path. Before updating the live entry point, archive its exact contents under the previous version number; never overwrite an existing archive. New features are published at separate numbered preview links for hands-on testing before promotion to the main app.

## Projection Mapping Preview (v23)

**[Try v23 with detached output and projection mapping](versions/audiograph_23.html)**. This preview does not replace the v22 main app.

1. Click **Setup mapping**, then **3-face cube** for a starting layout like a box with three visible faces. Alternatively enable **Mapping on** and **+ Plane** for each physical face.
2. Click **Project visuals**, move the output to your projector, and enter fullscreen there.
3. With **Test grid** on, drag the large corner handles in the laptop editor to align each plane with the real object. Small grid handles provide fine warping. Shift-drag moves a plane; arrow keys nudge a selected handle by one output pixel (Shift: ten).
4. Toggle **Test grid** off and play audio. Mapping receives the finished artwork, including post-FX. Areas outside the planes are black; editor guides never appear in the output.
5. **Save mapping** restores alignment in this browser. **Export mapping** creates a separate JSON backup for another computer; **Import mapping** validates and loads it.

Each plane can use the whole visual or a percentage **Source crop**. **Show plane** controls visibility, and later planes cover earlier ones when they overlap. Choose 1-12 cells per side and click **Rebuild grid** to keep the corners but reset fine warps. Corner moves preserve existing fine-warp offsets where valid. Folded or crossed grid cells are rejected. **Undo mapping** is independent of artistic Undo, presets, and morphing.

This is projector-space corner pinning and mesh warping, not a 3D scene reconstruction: map each physical plane from the projector's fixed viewpoint. Moving the object or projector requires recalibration. WebGL/hardware acceleration is required; GPU context loss blacks out the mapped output instead of spilling unwarped artwork, and browser context restoration recovers it. Mapping affects the separate output and its editor; PNG/SVG and video recording retain the original, unwarped artwork. Saved profiles use normalized coordinates but should be checked again if output resolution/aspect ratio changes.

## Output Resolution Preview (v24)

**[Try v24: output resolution + mapping + detached visuals](versions/audiograph_24.html)**. The main app remains v22, and the v23 mapping preview is unchanged.

Choose **Output resolution** beside the transport, then **Project visuals**. **Auto** retains window-sized rendering with the existing device-pixel-ratio cap. **720p (1280 x 720)**, **1080p (1920 x 1080)**, **1440p (2560 x 1440)**, and **4K (3840 x 2160)** render exactly those pixel dimensions, regardless of Retina/high-DPI scaling or fullscreen/window size. Both displays fit the same 16:9 composition without stretching; other display aspect ratios get black bars.

Start with **720p** for demanding installations or **1080p** for a quality/performance balance. 4K has four times the pixels of 1080p. A stronger GPU helps WebGL effects/mapping and raster workload, but complex geometry and particles also depend on the CPU. Keep hardware acceleration enabled; a fixed resolution controls pixel workload, not frame rate.

The setting applies only while the output window is open and lasts for this session, independently of presets and mapping profiles. Closing output restores normal controller-preview sizing; reopening reuses your choice. Selection is locked during recording, and fixed-mode recordings use exactly the selected resolution. Check physical mapping alignment after changing the composition's aspect ratio.

## Mapping Content Modes Preview (v25)

**[Try v25: duplicate or span visuals across mapped planes](versions/audiograph_25.html)**. Includes detached output, mapping, and the resolution selector; earlier builds and the v22 main app stay unchanged.

In **Setup mapping**, use **Visuals**:

- **Duplicate on each plane** repeats the complete visual on each physical face, with perspective and fine-mesh warping.
- **Span / overflow across planes** shows one continuous image in the projector's view, fitted to the combined plane bounds. Adjacent faces sample the same image at shared edges rather than restarting. Gaps and areas outside the planes are black.
- **Custom per-plane crops** preserves the existing crop workflow for manually arranging parts of the source over faces.

Switching modes preserves alignment and saved crops; **Undo mapping**, Save, Export, and Import include the mode. Old profiles without a mode load as Custom to retain their exact appearance. Crop inputs are editable only in Custom. The calibration grid follows the chosen mode.

Span uses one bounding rectangle including hidden planes, so hiding a face does not move the image on other faces. Adding/deleting/moving planes may change those bounds. Interior grid edits alter the span mask, not the shared image. This is continuous projector-space coverage, not automatic 3D surface unwrapping; use Custom crops for a deliberately arranged wrap. No extra audio analysis or animation runs per plane.

## Fullscreen Animation Fix Preview (v26)

**[Try v26: fullscreen animation + deformed Span fixes](versions/audiograph_26.html)**. Includes prior installation features; earlier archives and the v22 main app remain unchanged.

Earlier detached-output builds scheduled animation frames on the controller window. A browser can pause that window's animation clock when the projection window enters fullscreen or covers the controller, leaving the output frozen while audio continues.

v26 schedules playback, live input, morphing, webcam sampling, and the recording timer using the visible output window's animation clock. Pending callbacks migrate on opening/closing output and visibility changes, with a shared time origin and cancellation handling; closing output returns scheduling to the controller. Disabling laptop realtime preview no longer stops an open projection output.

Keep the computer awake and at least one Audiograph window visible: this prevents dependence on the controller's animation frames, but cannot override browser tab suspension, system sleep, or a stalled GPU.

### Span now deforms with the planes

v25's Span mode used shared projector-space UVs, so it masked an image instead of warping it. v26 replaces that behavior: each plane receives a region of one shared source, then applies its projective corners and fine-mesh deformation to that region.

Choose **Visuals → Span / overflow across planes**, then **Horizontal**, **Vertical**, or **Cube net**. Horizontal/Vertical divide the source equally in plane-list order. Cube net expects three planes ordered Top, Front, Right; it rotates the Top region to join the Front, and joins Front to Right. Top/Right is the cut edge of the unfolded net, not a seamless join.

Edit **Span source region (%)** and **Source rotation** for each plane to arrange your own source layout. Destination corner/grid moves warp the assigned region; they do not change source coordinates. Hidden faces keep their region, and gaps remain black. Adding/removing planes changes implicit horizontal allocations; reapply a layout after editing the plane list. Applied layouts keep explicit source regions until changed.

Span regions are saved independently of Custom crops. Switching modes, artistic presets, or fullscreen does not erase either. Save/export/import and mapping Undo preserve Span regions/rotations. Profiles with no mode still load as Custom; old v25 Span profiles now default to horizontal allocation, intentionally replacing the non-deforming behavior. This is a user-aligned source net, not an automatic reconstruction of a 3D object.

## System Audio Preview (v27)

**[Try v27: simpler system-audio connection](versions/audiograph_27.html)**. Includes the v26 fullscreen and deformed Span fixes. Main v22 and all older builds remain unchanged.

Click **System**. Supported desktop Chrome/Edge browsers are asked to open the chooser on **Entire Screen** with system audio offered. Choose a screen, enable **Share with system audio**, and click **Share with Audio**. If that option is unavailable on your browser/OS, use **Chrome Tab** with **Share tab audio** instead.

This is a picker preference, not an automatic permission grant: the site cannot choose a specific screen, force the audio toggle on, remember screen-capture permission, or bypass the dialog. Video tracks are stopped immediately after selection; only audio feeds the visualizer. Inline status provides connection/cancellation/error guidance without extra alert dialogs. The System button is disabled while the chooser is pending, releases unused streams on failure, and can be clicked again to stop. The separate Stop button also disconnects capture.

The picker options follow Chrome's [screen-sharing controls documentation](https://developer.chrome.com/docs/web-platform/screen-sharing-controls); browsers may ignore unsupported hints.

## Direct Plane Controls Preview (v28)

**[Try v28: direct face selection + draggable Span artwork](versions/audiograph_28.html)**. Includes v27's system-audio setup and v26's fullscreen/Span fixes. Main v22 and every earlier preview remain unchanged.

Double-click a visible face in **Setup mapping** to select it directly; names, source controls and handles update together. Selection follows the actual fine mesh, not just its four corners. Overlapping faces select the topmost visible one; use the dropdown for hidden faces.

In **Visuals → Span**, choose **Move visuals** and drag inside any face. This moves the whole shared image across its source net, keeping seams, crops, source regions and physical plane alignment intact. The grabbed artwork follows the face's perspective, fine mesh and quarter-turn source rotation. Geometry handles are locked, including Shift-drag. Switch to **Adjust planes** to edit calibration.

**Image X/Y** controls the shared offset precisely, within +/-100% of the source. Source image edges reveal black rather than smearing edge pixels. Arrow keys nudge the image from the selected face (Shift: ten output pixels). **Reset position** resets only the image offset. Each drag is one mapping Undo step; Save/Export/Import preserve position. Other visuals modes keep but ignore the Span offset. Test grid ignores it and selects Adjust planes; Move visuals turns Test grid off.

## Span Text Cleanup Preview (v29)

**[Try v29](versions/audiograph_29.html)**. Removes the explanatory paragraph beneath the Span selector without leaving empty space. All v28 functionality is retained; previous previews and main v22 are unchanged.

## GPU Renderer Preview (v30)

**[Try v30](versions/audiograph_30.html)**. Adds a WebGL2 geometry renderer for layer drawing. Layout formulas remain compatible. Dense dots go directly to GPU analytic circle quads instead of generating circle triangles in JavaScript; round stroke caps use the same shader path. Numbers/symbols/words use a cached glyph atlas. Other compatible paths can be recorded/tessellated into one WebGL2 batch per layer.

**Renderer** beside Output resolution defaults to **Auto (selective GPU)**: dense dotted/glyph layers (at least 128 lines) use WebGL2; other geometry keeps the original Canvas path to avoid JavaScript tessellation regressions. This is a conservative workload policy, not a per-device adaptive benchmark. **GPU (WebGL2)** forces compatible geometry for comparison; **Canvas 2D (original)** is the compatibility/rollback option. The choice is remembered, and `?renderer=auto|canvas|gpu` overrides it. Status reports which layers ran on GPU and why other layers used Canvas.

The following automatically fall back to the original Canvas 2D code for that layer:

- Gradients or patterns, including the outline "fill" style
- Image, video and text layouts
- Kaleidoscope, which copies pixels
- Clipping and shadows
- Unusual blend modes
- Very large layers

If the browser drops the GPU context, drawing continues with Canvas 2D until restoration; status reports the fallback. Particles, symmetry/flip/mirror, layer compositing and PNG/SVG export remain on the original Canvas/vector paths. Post-FX and mapping remain WebGL. This is the first acceleration stage, not a fully GPU-resident renderer or GPU particle simulation.

Performance is workload-dependent. On Apple M2 Max / headless Chrome 154 / ANGLE Metal at 1146x778, 15 warm-up frames and 40 measured frames gave these completed-frame medians (including a readback flush):

| Scene | Canvas 2D | Forced GPU | Auto |
| --- | ---: | ---: | ---: |
| 800 dotted circles, 3 layers | 65.4 ms | 11.4 ms | 11.5 ms |
| 800 numbers, 3 spiral layers | 12.2 ms | 7.8 ms | 7.9 ms |
| cell preset | 13.9 ms | 16.5 ms | 14.4 ms |
| sacred_circle preset | 10.9 ms | 12.8 ms | 8.9 ms |
| zodiac preset | 8.8 ms | 10.5 ms | 9.7 ms |
| organica preset | 9.0 ms | 12.1 ms | 9.5 ms |

Dense dots improved about 5.7x and numbers about 1.5x in this run. Builtin results are mixed: forced generic tessellation can be slower, and Auto is not guaranteed to improve every preset. Normal cell/zodiac playback remained display-limited around 60 Hz on both forced backends; that is not a promise of 60 FPS at 4K or on another machine.

Run `tests/gpu-benchmark.cjs` on the installation machine for completed-frame median/p90 and playback cadence comparisons; output includes Auto and forced GPU, not just submission time. `--assert-speedup` checks dots >=1.5x and numbers >=1.1x for both GPU and Auto on the measured environment. v30 also caches audio-range analysis for both backends. Main v22 and earlier previews are unchanged.

### Seamless Span correction

**Seamless cube** stretches one continuous source chart across Top, Front and Right, sharing all three common edges with no cut. It is now the 3-face starter's default. **Fit surface** anchors a continuous source mesh to the current mapped bounds for other arrangements. Later corner/grid moves deform that anchored image; shared straight edges stay source-linear even with unequal face perspective.

Seamless charts intentionally distort the flat artwork instead of unfolding physical faces into rectangular crops. Legacy **Cube net** still has an intentional Top/Right cut; Horizontal/Vertical and rectangular source-region editing remain available. Mesh layouts lock per-face rectangle/rotation edits to protect joins; **Move visuals** still moves the whole shared image. Save/export/import, Undo and grid rebuilding preserve the source mesh. Physical edge alignment remains necessary: this is not automatic edge blending or calibration.

## Built-in Tree and Sacred Geometry Presets (v63)

**[Try v63](versions/audiograph_63.html)**. Two of the author's saved compositions are now built into the Presets list, so they are available in every browser without importing:

- **tree**: three layers (Growth, Phyllotaxis and 3D Object).
- **sacred_geometry**: three Sacred layers.

Covered by `tests/builtin-presets.cjs`.

## Universe Preset and Preset Cleanup (v64)

**[Open the official v64 app](index.html)**. Adds the saved **Universe** composition as a built-in preset (Object, Sacred, Graph and Circle layers) and removes the built-in **Rorschach** preset. Tree and Sacred Geometry remain built in.

Covered by `tests/builtin-presets.cjs`.

## Expressive Line Styles Preview (v65)

**[Try v65](versions/audiograph_65.html)**. Adds three render styles that can be applied to existing layouts: **Guilloché** (interlaced engraved curves), **Stained Glass** (faceted colored panes with dark leading), and **Ink in Water** (soft spreading blooms with fine tendrils). They share the existing Style Size, Density and Angle controls and render through Canvas 2D for consistent output across layouts and 3D markers.

Covered by `cd tests && npm run test:styles`.

## Autopilot Prompt Match Preview (v66)

**[Try v66](versions/audiograph_66.html)**. Adds a **Prompt match** control to Autopilot: at 100%, generated looks use only the requested layouts and styles, cycle through named choices in order, and remove random jitter from prompt-driven numeric settings. Lower values let Autopilot explore beyond the prompt more often. Prompt parsing also recognizes the new Guilloché, Stained Glass and Ink in Water styles; “ink in water” no longer accidentally selects Linear.

## Tutorial Save Steps Preview (v75)

**[Try v75](versions/audiograph_75.html)**. The tutorial now also explains saving a Preset (explanation only, nothing is saved) and recording a Video, then ends with a short send-off.

## Tutorial Polish Preview (v74)

**[Try v74](versions/audiograph_74.html)**. The tutorial no longer darkens the screen (only a glowing ring marks the active panel) and the step text no longer repeats the layout/style name.

## Interactive Tutorial Preview (v73)

**[Try v73](versions/audiograph_73.html)**. The top bar now has **Tutorial** and **Guide** buttons; Undo, Reset and Play/Stop moved to the bottom-right of the visuals window. The tutorial scrolls and highlights each right-panel section, with an on-canvas banner such as "Pick your Layout". It builds the saved **Tutorial** preset (read from `builtinPresets` or the browser's saved presets; falls back to the stand-in Spiral) and skips groups the preset leaves at defaults. In the Guide, Automation moved near the bottom.

## Guided Tour Preview (v72)

**[Try v72](versions/audiograph_72.html)**. A **Tour** button (and a first-visit invitation) walks through audio source, layout, style, geometry, color, particles, deformers and Post FX, building a look live and playing a generated demo beat if no audio is loaded. The look comes from `agTour.recipe` in the page, currently a stand-in Spiral; swap in a saved preset's layer to change it.

## UI & Autopilot Polish Preview (v71)

**[Try v71](versions/audiograph_71.html)**. Audio source panel centred over the controls column and pulsing until a source is chosen; Guide shortened to a prominent ? icon; phone (iPhone) layout with full-width source buttons and touch-sized controls; Autopilot varies layouts more evenly (DNA no longer dominates, new curve layouts included) and fades the quiet colour stop more often.

## 3D Camera Fix Preview (v70)

**[Try v70](versions/audiograph_70.html)**. 3D objects no longer swing into the camera with exaggerated perspective: the camera distance is clamped in Terrain, Sphere, Tetrahedron/Octahedron, DNA and Object layouts, and Autopilot keeps height and deformers moderate on 3D layouts.

## Curve Layouts Preview (v69)

**[Try v69](versions/audiograph_69.html)**. Three new parametric-curve layouts where audio lines stand along a closed curve: **Harmonic** (Lissajous), **Rose** (rhodonea petals) and **Spiro** (spirograph), each with its own sliders and Autopilot keywords. Removes the Guilloché and Stained Glass styles (Ink in Water stays).

## Growth Resize Fix Preview (v68)

**[Try v68](versions/audiograph_68.html)**. Fixes stretched gray Growth trails after entering or leaving fullscreen (seen on iPad with the Tree preset). When the canvas aspect ratio changes, Growth now starts its drawing fresh instead of stretching the old bitmap.

## iPad Touch UI Preview (v67)

**[Try v67](versions/audiograph_67.html)**. Improves the tablet experience with larger toolbar and panel tap targets, more legible controls and sliders, a wrapping top bar for portrait, and a shorter, scroll-friendly preview on touch tablets. Desktop sizing remains unchanged.

The match setting is saved between visits. Tests: `tests/autopilot.cjs` verifies exact-vs-exploratory selection, style recognition and existing section detection/fades.

## Post FX Performance Preview (v62)

**[Try v62](versions/audiograph_62.html)**. Fixes a slowdown and jitter when layer or composition **Post FX** (especially Bloom) were combined with **Scale loud**. The layer canvas used to change size on every frame, so the WebGL FX pipeline reallocated its textures each frame and layer Trails/Feedback kept resetting. The layer is now padded onto a fixed-size canvas before the FX run, so frame rate holds at 60 fps and Trails persist. Covered by `tests/pfx-loud.cjs`.

Also fixes particles with playback **Off** (particles only): since v58 particles emit from the shape drawn this frame, but Off skipped drawing, so particles kept spawning along a stale shape (e.g. the previous layout's band after switching to DNA). The layout is now traced on a hidden canvas so particles follow the current layout. A sweep of every layout (2D, Sacred, Graph, Growth, Fractal, all 3D in Shape and Surface modes, Knot/Cube/Torus, Image raster/vector, Text, Pixel Warp, Custom, Post FX + Scale loud) confirms particles spawn on the drawn shape; `tests/particles-emit.cjs` covers the Off case.

## 3D Style Parity Preview (v61)

**[Try v61](versions/audiograph_61.html)**. Every 3D layout (Terrain, Sphere, Tetrahedron, DNA, Knot, Cube, Torus, 3D Object) now has the same features in both Signal modes. In **Shape** mode, marker styles such as Pins, Numbers, Tapered and Caps used to remove the wire and point straight up on Sphere, Tetrahedron and DNA. Now they keep a faint wire underneath and stand out of the surface along its normal, as they already did on Knot, Cube and Torus.

In **Surface** mode, Tetrahedron is the geodesic sphere again (the look it has in Shape mode, with **Detail** setting the density), and Sphere uses the same geodesic mesh (its **Grid** sets the density) instead of a latitude/longitude grid.

**Outline fixes:** Phyllotaxis showed the Outline control but never drew anything, because its lines sit a golden angle apart and the ring outline skipped every gap. It now traces the sunflower spiral arms in every outline style (Solid, Dotted, Dashed, Connected, Fill, with Count and Gap). Fractal's **Connected** outline, which used to draw nothing, now links nearby branch tips. A new `tests/outline.cjs` checks that every layout showing the Outline control actually draws it.

## Surface Signal for All 3D Layouts Preview (v60)

**[Try v60](versions/audiograph_60.html)**. The Signal switch from v59 now works on every 3D layout: **Terrain**, **Sphere**, **Tetrahedron**, **DNA**, Knot, Cube, Torus and 3D Object.
- In **Surface** mode the shape stays fixed and the audio lines travel over it, with the same Flow, Lines, Travel, Count, Wire and Back controls and every Style.
- Terrain becomes a still landscape (Elevation and Noise shape it). Sphere is a fixed globe, Tetrahedron has crisp flat faces, and DNA is a clean double helix with the signal running along its strands and rungs.
- The Signal setting is shared across the 3D layouts on a layer. **Shape** mode is unchanged.

## Object Surface Signal & Colour Presets Preview (v59)

**[Try v59](versions/audiograph_59.html)**. Knot, Cube, Torus and 3D Object have a new **Signal** switch. **Shape** is the original behaviour: the audio pushes the mesh. **Surface** keeps the geometry fixed and moves the audio across its skin instead.
- **Flow** sets the pattern: Rings, Sweep, Spiral or Scatter.
- **Lines** sets the direction: Across (standing off the surface) or Along it.
- **Travel**, **Count**, **Wire** and **Back** tune the motion, the line density, the ghost wireframe and the back faces.
- Every Style works on the surface, and Shape-mode markers now turn to follow the surface.

The colour presets were redone as gradients that blend several colours, in the spirit of the default. Black &amp; white is kept.

## Particle Emission Sweep Preview (v58)

**[Try v58](versions/audiograph_58.html)**. Particles now start from what each layout actually draws. Before this, Sacred, Graph, Growth, Fractal, DNA, Pixel Warp and vector Image emitted from a flat horizontal band, and Terrain spawned many particles off-screen. Now 3D shapes emit from their projected lines, Growth from its growing tips, Pixel Warp from the picture, and media layouts from their bright pixels. A layout that draws nothing no longer reuses the previous layout's shape. The **Stars** layout was removed; old saves using it open as Sacred.

## Graph Layout Preview (v57)

**[Try v57](versions/audiograph_57.html)**. New **Graph** layout: an Obsidian-style network of hubs, clusters and loose notes in a live force layout. Audio lines run along the links (spreading out from the biggest hub), nodes are sized by link count and swell with their band, and bass kicks push the graph apart so it breathes with the beat. Controls: **Shuffle**, Map, Lines, Nodes, Hubs, Links, Loose, Pulse, Drift, Size, Twinkle, Outline and Bloom. Autopilot can pick it.

## Coral Noise Preview (v56)

**[Try v56](versions/audiograph_56.html)**. Growth **Noise** no longer moves the coral; it reshapes the linework instead. Branches meander, swell and pinch, and pick up small knobs, while every coral still grows from the centre.

## Vector & Raster Image Preview (v55)

**[Try v55](versions/audiograph_55.html)**. The **Image** layout now has a **Source** switch:

- **Import vector** (SVG): the drawing's paths are traced by audio lines exactly like Sacred, with Map (Along/Shapes), Lines (Along/Across), Outline, Breathe and Bloom. SVGs are parsed inertly; scripts, event handlers and external links are stripped.
- **Import raster** (PNG/JPG): new default **LED** style turns the picture into an equalizer (like Text LED, with Seg gap and Floor); Grid and Edge remain.
- Test: `tests/image-vector.cjs`.

## Stars Preview (v54)

**[Try v54](versions/audiograph_54.html)**. New **Stars** layout: real constellations (Orion, Big Dipper, Cassiopeia, Cygnus, Scorpius, Leo, Lyra, Southern Cross, Gemini, Taurus, Winter Sky, Summer Sky) traced by audio lines, with stars that flare with their band (**Stars**, **Twinkle**), a twinkling background **Field**, and Map/Lines/Outline/Bloom like Sacred. Sacred's Figure buttons now wrap onto several rows.

## Sacred Geometry Preview (v53)

**[Try v53](versions/audiograph_53.html)**. New **Sacred** layout (General row) that draws the audio lines along classic sacred-geometry figures: Seed, Flower, Egg and Fruit of Life, Metatron's Cube, Vesica Piscis, Germ of Life, Tree of Life, Merkaba, 64 Tetrahedron, Vector Equilibrium and Torus.

- **Map**: *Along path* spreads the spectrum over the whole figure; *Per shape* gives each circle/edge its own band.
- **Lines**: *Along* traces the figure (default); *Across* draws ticks perpendicular to it.
- **Outline** strokes the underlying figure, **Breathe** pulses each shape with its band, **Bloom** reveals the figure from the centre as energy rises.
- Autopilot and Surprise Me can pick Sacred with a random figure. Test: `tests/sacred.cjs`.

## Growth Noise Preview (v52)

**[Try v52](versions/audiograph_52.html)**.
- **Noise** knob in the Growth layout (0–100%, default 45%) randomizes how growth spreads, mainly for **Coral**:
  - uneven branch lengths and widths, lopsided forks, the occasional triple fork or single kink, and tips that wander;
  - scattered starting points instead of always sprouting from the same spot.
- Vine and Neuron get a gentle extra wobble. Set Noise to 0 for the old, perfectly regular coral. Older saves load with the default.

## Autopilot Without Scale Loud Preview (v51)

**[Try v51](versions/audiograph_51.html)**.
- **Scale loud is paused while Autopilot runs**, so the picture no longer pumps in and out with loudness. Generated layers save it as off, Mood leaves your own setting alone, and it comes back as soon as Autopilot stops.

## Multi-layer Autopilot Preview (v50)

**[Try v50](versions/audiograph_50.html)**.
- **Everything** mode now builds a stack of 1–3 layers instead of a single layer: a main layer plus lighter supporting layers.
  - Supporting layers sit at 70% and 55% opacity and share the main palette, rotated. They use thinner, sparser fine-line shapes, no particles, and a gentle counter-spin. Each layer gets a different layout.
- **Layers** setting (only shown for Everything): **Auto** uses 1–2 layers in breakdowns, 2 in grooves and up to 3 on build-ups and drops. You can also fix it at 1, 2 or 3; the choice is saved.
- **Changes ripple instead of jumping.** A groove or new-phrase change swaps one layer at a time (rotating through the stack) while the others glide to the new colors. Drops rebuild the whole stack, with each layer's fade starting slightly after the one below.

## Spin Left/Right, No Sine & Smoother Autopilot Preview (v49)

**[Try v49](versions/audiograph_49.html)**.
- **Spin left ↺ / Spin right ↻**: two knobs replace the old Spin amount and direction toggle. Turning one up clears the other, and the steps are now 0.1 for slow turns.
  - Saves, presets and the Mixer still use the same stored amount and direction, so nothing old breaks.
- **Sine layout removed.** Older saves, links, Preset Morph and the built-in *waves* preset load a Sine layer as Linear with the Wave deformer.
- **Autopilot**:
  - **Never generates Linear.**
  - **Spin is subtle**: 0–0.7 normally, up to 1.2 when you describe spin. It keeps one direction for the whole run and may reverse only in a breakdown.
  - **Background is always black.**
  - **Smoother**: smootherstep fades of about 2.5 s on drops, 7–10 s otherwise. Changes are at least 8 s apart, except drops. A change that arrives during a fade waits for the fade to finish, and a drop continues from what's on screen instead of jumping.
  - Spin keeps turning through crossfades. Before, every fade froze the rotation and snapped it back to 0°.
- Tests:
  - `autopilot.cjs`: spin, black background and the Spin left/right controls.
  - `layer-order.cjs`: uses Concentric and checks the Sine migration.
  - `layer-scope.cjs`: compares *waves* against v31 only while Sine exists.

## Automation Panel Preview (v48)

**[Try v48](versions/audiograph_48.html)**.
- **🎛 Automation** puts **Autopilot**, **Mixer** and **Reactive** into one panel with three tabs. A dot on a tab shows that mode is running, even when another tab is open.
- **Describe box** in Autopilot (it replaces AI Look and the Theme switch). Write the tempo, vibe, energy, colors, layouts and line styles, e.g. *slow dreamy 90 bpm, deep blue and gold, thin dotted lines, spirals and flowers*.
  - Tempo (words or a BPM) scales motion speed and spin.
  - Energy words tame or push drops.
  - Named colors or themes fix the palette, which gets rotated between changes.
  - Named layouts and line styles become the pool that Everything picks from.
  - The line under the box shows what it understood, and the text is remembered between visits.
- **Sine removed** from the Autopilot layouts. **Linear never spins**: Everything gives Linear zero spin, and Mood leaves spin unchanged on Linear layers.
- **AI Look panel hidden** for now; its code stays in the file.
- Tests: `autopilot.cjs` covers the tabs, the dots, the description reading, no Sine and no Linear spin. `guide.cjs`, `knobs.cjs` (opens the Reactive tab first) and `switches.cjs` are updated.

## Autopilot Preview (v47)

**[Try v47](versions/audiograph_47.html)**.
- **🎛 Autopilot** listens to the music and detects its sections: **Breakdown** (calm), **Groove**, **Build-up** (rising energy) and **Drop** (peak). Loudness is measured relative to the last 90 s of the track, so quiet and loud masters both work.
- At each section change the visuals cross-fade to a new look: a slow 5 s fade into a breakdown, a 0.5 s cut on a drop. If the section stays the same, a new phrase starts every **Every** seconds (8–60 s, default 24).
- **Changes**:
  - **Colors** recolors your own layers.
  - **Mood** also changes motion: speed, spin, pulse, warp, bloom and trails.
  - **Everything** creates a new layer each time, with its own layout, shape, symmetry and particles.
- **Theme** sets where the looks come from. **Free** walks the color wheel. **AI prompt** follows the colors, layout and shape words in the AI Look box.
- The panel shows the detected section, a live energy meter and when the next change comes. Turning it on saves an Undo step. Reset and Auto-morph turn it off.
- The AI Look example chips are hidden for now.
- Tests: `autopilot.cjs` checks section detection, both with synthetic energy curves and with real playback of a calm → loud WAV.

## AI Look Fixes Preview (v46)

**[Try v46](versions/audiograph_46.html)**.
- **Named colors win.** "slow red galaxy with green trails" is now red with green accents. Before, the word *galaxy* replaced both colors with the purple galaxy palette. The first color you name is the dominant one, and the model's palette is used only when you don't name a color.
- Keywords match whole words only, so *pink* no longer picks the brush (Tapered) style and *brain* doesn't mean rain.
- *Pulsating*, *beat* or *bounce* turn on zoom with loudness. *Galaxy*, *vortex* and *swirl* add a slow spin.
- Clearer **Ollama** messages: when it isn't installed, running or allowed to answer this site, the status gives the exact setup steps (`ollama pull qwen2.5:3b`, `launchctl setenv OLLAMA_ORIGINS "*"`, restart) or suggests **Local AI**. A missing model gets its own message.

## AI Look Preview (v45)

**[Try v45](versions/audiograph_45.html)**.
- New **✨ AI Look** panel: describe a look in plain words (e.g. *slow purple galaxy with glowing trails*) and press **Create look** or Enter. It rebuilds the active layer, or **+ As layer** adds it on top. Example chips give a one-click start. Undo reverts it.
- The AI sets layout, line style, colors, background, energy, density, thickness, spin and direction, warp, glow, trails, symmetry, particles and growth type. Everything stays editable in the normal panels afterwards.
- Three free engines, no API keys and no server:
  - **Quick**: instant keyword matching, works everywhere including iPad.
  - **Local AI**: the open **Qwen2.5 1.5B Instruct** model runs inside the browser through [WebLLM](https://github.com/mlc-ai/web-llm) and WebGPU (recent Chrome/Edge). It downloads about 1 GB once and is cached after that. Generating a look takes about 3 seconds, and prompts never leave the computer.
  - **Ollama**: uses a model served by [Ollama](https://ollama.com) on the same machine (default `qwen2.5:3b`; start it with `OLLAMA_ORIGINS=* ollama serve`).
- Model output is treated as untrusted. Values are checked against allowed lists and clamped. Words you type explicitly, such as *bars*, *thick* or *spin left*, override the model, and the model fills in mood and palette. If an engine is unavailable, Quick is used automatically.
- Tests: `tests/ai-look.cjs` covers keyword reading, UI create/undo, adding a layer, sanitising bad model output (via mocked Ollama), explicit-word priority, fallbacks, and keyboard isolation of the prompt field.

## Spin Direction, Audio Dynamics & Playback in Audio EQ Preview (v44)

**[Try v44](versions/audiograph_44.html)**.
- **Spin Left / Right**: Geometry & Motion has **↺ Left** and **Right ↻** buttons next to the Spin amount. The direction is saved per layer, in presets and in undo, and randomize picks one. Growth's rotating emitter follows it too.
- **Loaded audio no longer looks clipped.** Mastered tracks are loud almost all the time, so their line values sat near maximum and Bass Punch pushed them into the ceiling. The new **Dynamics** control (Audio EQ, default 50%) spreads line heights around the track's median, Bass Punch now leaves headroom, and loudness follows the track instead of saturating. On a loud test track the share of lines above 90% dropped from 77% to about 30%. **Dynamics 0%** gives the previous response.
- **Playback** (Off / Continuous / Equalizer) moved from Deformers to the top of **Audio EQ**, next to Dynamics.
- Tests: `tests/audio-dyn.cjs` covers Playback placement, Dynamics spread/state/reset, and Left/Right spin with undo.

## Onboarding Guide & Keyboard Shortcuts Preview (v43)

**[Try v43](versions/audiograph_43.html)**.
- The in-app **Guide** is rewritten for fast onboarding. It opens with a 5-step **Quick start**, then covers each area in order of importance: Audio, Layers, Layout, Style & Outline, Color, Geometry & Motion, Deformers, Particles, Post FX, Reactive & Mixer, Presets & Morph, Live output, Projection mapping, Resolution & renderer, Export, and Knobs/touch/keys. Each section is short, and a row of contents chips jumps straight to it.
- Keyboard shortcuts in the controller window now work as documented: **Space** play/pause, **⌘/Ctrl Z** undo, **F** fullscreen preview, **Esc** closes the Guide. They are ignored while typing in a field or using a focused knob or switch.
- Pausing right after pressing Play no longer logs an "interrupted play()" error.
- **Post FX Trails now fade fully to black.** 8-bit fades used to stall at low brightness, so a faint ghost of old trails never cleared (most visible on Growth). A small subtractive cleanup pass now runs after each fade, through an SVG filter where available and a CPU fallback on Safari/iPad. This applies to both per-layer and composition Trails.
- **Growth Spin rotates the emitter only.** Coral emits in a direction that sweeps around, and neurons stay in place while their sprouting direction turns. Branches already drawn stay where they are and fade.
- Performance: Symmetry, Flip, Mirror and Feedback reuse scratch canvases per layer instead of allocating new ones every frame. The previous audio file's blob URL is released when a new file loads. Download links are revoked after a delay so Safari doesn't cancel them.
- Tests: `tests/guide.cjs` checks section order, contents links, that every layout is documented, and the shortcuts. `tests/growth.cjs` now checks that Trails at 100% fade to zero.

## Growth Life, Line Types, Neurons & Spin Emitter Preview (v42)

- **Growth** options are tidied: **Type** (Vine / Neuron / Coral) and **Line** buttons each sit on one centred row; the Clear button is removed.
- New **Life** knob (1–60 s, default 3 s) sets how long each growing branch keeps growing, so growth can live much longer. **Trail** at 100% keeps trails permanently.
- **Line** types: **Solid**, **Dotted**, **Dashed**, **Beads** (bass-swollen dots). New **Thickness** knob (10–400%).
- **Neuron**: a **Neurons** knob (1–24) sets how many cells exist; each lives a while, fades out (its dendrites wither) and is reborn somewhere else. Cell bodies are much smaller.
- **Spin** no longer rotates the whole image for Growth: the emitter (vine base, coral seeds, neuron positions) turns while older trails stay where they were drawn and fade.
- **Vine** gets a **Direction** row: **Bottom** (default), **Top** (hangs down) or **Center** (radiates outward). Saved per layer and in presets.
- Every layout's options now sit in a framed box under the layout picker, like the Fracture group.
- **Smart cleanup**: controls that the selected layout's renderer never reads are hidden and come back when you switch layouts. For example, Growth and Pixel Warp hide Style, Outline, Contrast, Vary height/thick, Disorder and the shape deformers (Twist…Jitter). Fractal hides the deformers. 3D layouts hide Outline, Contrast, Vary height/thick and Disorder. Image, Video and Text hide Outline and Vary height. Audio controls (Sensitivity, Amplify, Bass, Drop), transform, symmetry, spin and speed always stay.
- Tests: `tests/growth.cjs` covers line types, neuron count/relocation, spin keeping trails in place, vine direction and the smart-cleanup map.

## Growth Simulations & Tidier Layout Panel Preview (v41)

- New **Growth** layout (General): Houdini-style growth sims driven by the music. **Type**: **Vine** (curling tendrils rising from the bottom, with leaves), **Neuron** (dendrites sprouting from somas that appear on beats) and **Coral** (radial bifurcating branches). Bass hits seed new growth and widen branching; overall energy drives speed and stroke weight; treble adds jitter/curl.
- Trails persist and fade slowly, coloured by the **Color** section. Knobs: **Speed**, **Branching**, **Curl**, **Trail** (how long growth lingers), **Tips** (max live branches). **Clear** wipes the trails. Type is saved per layer; each layer keeps its own trails.
- **Kaleidoscope** and **Ridge** are removed from the layout picker and randomisers (old presets using them still render).
- The **Layout** and **Style** headings now sit above their buttons, centred; all layout options are centred too.
- Tests: new `tests/growth.cjs` (`AUDIOGRAPH_GROWTH_BUILD`).

## 3D Solids, Text Colour & Faster Pixel Warp Preview (v40)

- **Knot**, **Cube** and **Torus** are now layout buttons in the **3D** group (next to Terrain, Sphere, Tetrahedron, DNA) instead of a Model row inside 3D Object.
- **3D Object** (Input) is for your own model: the **OBJ file** picker appears only there. Until a file is loaded it shows the Knot; loading an .OBJ switches to it automatically.
- Old presets/layers using the Model row still load and light the matching button.
- **Text colour** now follows the **Color** section like every other layout (the LED-only EQ/Palette switch is removed).
- **Pixel Warp performance**: still images are uploaded to the GPU once (downscaled to 2048px max) instead of every frame, and the grid geometry is cached; large photos went from ~85 ms to ~5 ms per frame. Video/camera still update every frame.
- Tests: `tests/text-led.cjs` checks the new buttons and their highlighting.

## Fracture Modes, Organic Cracks, Video Ping-Pong & Single Scroll Preview (v39)

- **Fracture Mode**: **Flow** (v37 continuous drifting, multi-scale shards) or **Shatter** (the v35/v36 static pattern with instant hits and reshuffle on onsets). Size var and Drift show only in Flow. Saved per layer/composition.
- **Noise** knob (default 35%) domain-warps the Voronoi lookup with layered value noise, so crack lines meander organically in both modes.
- **Single scrollbar** on desktop (>900px): the page no longer scrolls; the controls column is the only scroller, with a thicker 12px thumb. Narrow/iPad portrait layout is unchanged.
- **Video ping-pong**: uploaded videos play forward then backward instead of looping (no jump/flash at the loop point). The reverse leg is stepped by seeking, so it can look a little less smooth on long-GOP files. Pixel Warp holds the last video frame while seeking instead of flashing its placeholder.
- **Pixel Warp**: the **Cells** pattern button is removed (old presets using it still render).
- Tests: `tests/voronoi-fracture.cjs` adds Noise/Shatter checks; new `tests/single-scroll.cjs` (`AUDIOGRAPH_SCROLL_BUILD`), `tests/video-pingpong.cjs` (`AUDIOGRAPH_PINGPONG_BUILD`, needs ffmpeg).

## LED Text, Cube/Torus, Pixel Shapes & Layer Order Preview (v38)

- **Text** layout gets a **Style** switch: **LED** (default) renders the word as a slanted LED equalizer — square segments that light from the floor up with the audio, green at the bottom to orange at the top, peak-hold sparkle and dim ghost segments. Knobs: **Slant**, **Seg gap**, **Floor**; **Colour** EQ or Palette. **Lines** keeps the previous look.
- **3D Object** gets built-in **Knot**, **Cube** and **Torus** models (quad wireframes). **File** selects a loaded .OBJ. The model is saved per layer.
- **Pixel Warp** gets a pixel **Shape** row (Pixels mode): **Square** (default), **Round**, **Diamond**, **Hex** — anti-aliased masks in the fragment shader, saved per layer.
- **Layers**: ▲/▼ reorder layers; deleting the last (active) layer no longer overwrites the layer above it with the deleted layer's settings.
- Tests: `tests/text-led.cjs` (`AUDIOGRAPH_TEXTLED_BUILD`), `tests/layer-order.cjs` (`AUDIOGRAPH_LAYERORDER_BUILD`), `tests/pixel-shape.cjs` (`AUDIOGRAPH_PWSHAPE_BUILD`).

## Fracture Flow Preview (v37)

**[Try v37](versions/audiograph_37.html)**. Voronoi Fracture now moves with the music instead of reshuffling randomly: the crack network drifts and bends continuously (faster when the sound is louder), shards breathe in and out smoothly, and hits ramp in rather than snap. Cells are weighted so big plates sit next to small splinters. New knobs: **Size var** (how different shard sizes are) and **Drift** (how fast the cracks travel). In the Post FX panel the fracture controls sit in their own framed group and only appear when Fracture is switched on.

## Pixel Warp Patterns Preview (v36)

**[Try v36](versions/audiograph_36.html)**. Pixel Warp's centre-weighted directions (Radial, Up, Explode) are replaced by full-frame **Pattern** fields: **Noise** (default), **Diffuse**, **Curl** (swirling divergence-free flow), **Turb** (ridged turbulence streaks), **Waves** (travelling wave fronts) and **Cells** (tiles of the image shifting independently). Depth now enlarges pixels in place. Older presets that saved Radial/Up/Explode still load and render as before.

## Pixel Warp Preview (v35)

**[Try v35](versions/audiograph_35.html)**. Adds a new per-layer **Pixel Warp** input layout that renders the original image/video colours directly instead of converting the media into line sources. Choose Image, Video, or Camera, then switch between **Pixels** (source-coloured quads with visible gaps as audio displaces them) and **Mesh** (a continuous warped grid).

The WebGL2 path samples the media texture on the GPU every frame, so video and camera frames keep their full source colour while bass, mid and treble deform vertices. Controls include Resolution, Pixel size, Displace, Bass push, Mid swirl, Treble scatter, Luma weight, Flow/speed, Elasticity, Depth, Direction, Fit, Saturation, Brightness, Contrast and Beat flash. A generated colour test card appears when no media is loaded. Pixel Warp participates in layers, opacity/blend, per-layer Post-FX, projection output, PNG export, Reset, Undo, presets and reactive rules like other layouts.

Pixel Warp now defaults to **Contain** fit, and the Image and Video grid layouts keep the media's original aspect ratio (centred, letterboxed) instead of stretching it to the canvas. **3D Object** layers now always show a wireframe like the built-in solids (a trefoil knot appears until you load an OBJ), with dim back edges; the object stays still unless **Spin** is on, and the Rotate knob sets spin speed.

**Voronoi Fracture** is a per-layer Post FX mode for audio-driven shattering: turn on Post FX + Fracture and the layer is split into GPU Voronoi shards that open bright cracks, push outward, rotate slightly on bass/beat hits, then recover toward the intact image. Controls include Cells, Crack gap, Displace, Rotate, Bass response, Beat response, Recovery, Crack glow and Seed; Fracture is off by default so existing looks and presets render unchanged.

## Larger Knobs Preview (v34)

**[Try v34](versions/audiograph_34.html)**. Same as v33 with knobs another 30% larger (68 px; inline knobs 40 px), and knobs now turn like real dials: drag around the knob centre (clockwise raises, counter-clockwise lowers; 270° covers the full range; Shift = fine). Values stop at the ends instead of bouncing back.

## Compact Knob/Switch UI and Touch Gestures Preview (v33)

**[Try v33](versions/audiograph_33.html)**. This version contains all v32 features and adds the following.

- Knobs are 30% larger with more spacing; their arc colour runs from red (minimum) to green (maximum). Rows with fewer than three knobs are centred, and related knobs share a row (Thickness/Fade edges, Scale/Rotation, Offset X/Y, Jitter/Disorder, Morph slider + Duration).
- Binary Yes/No and On/Off options are pill **switches** (green ON, red OFF) grouped into shared rows (e.g. Vary height / Vary thick / Scale→loud; Flip H/V beside Mirror). The original buttons stay hidden as the source of truth, so presets, Reset and Undo keep working.
- Option chips (Layout, Style, …) restyled as calm dark chips with a category dot and a green active state; preset actions sit in one row; gaps tightened throughout (expanded sidebar ~7% shorter).
- **Touch**: on iPad/touchscreens, one finger moves the active layer (orbits 3D layouts), two fingers pinch to Scale and twist to Rotate; the page no longer scrolls while touching the canvas.

Tests: `switches.cjs` (`AUDIOGRAPH_SWITCH_BUILD`) and `touch-gestures.cjs` (`AUDIOGRAPH_TOUCH_BUILD`).

## Glyph Size, Flares, Per-layer Deformers and Post FX Preview (v32)

**[Try v32](versions/audiograph_32.html)**. This version contains all v31 features and adds the following.

- Numbers, Symbols and Words draw at their proper size in circle, spiral and other radial layouts and respond to **Size** and **Angle**. Previously a cached font went stale after each per-line `restore()` and every glyph fell back to 10 px.
- Built-in presets **flares** and **magnet**; **zodiac** replaced with the updated Zodiac 2 composition.
- **Ripple** and **Jitter** are per-layer like the other deformers. Older saves that applied one global value keep it on every layer, so they look unchanged.
- **Post FX** is per layer: the panel edits the active layer, and its effects (including Trails/Feedback history) are applied on the GPU to that layer before compositing. Projection, recording, fullscreen and PNG export show the per-layer result. Saves from before v32 (and the built-in presets) keep their global Post FX as a legacy **Whole composition** effect, so they look unchanged; the panel shows an **Applies to** switch to edit it or turn it off.
- Panel sliders are now **knobs**, three per row (label above, value below). Drag vertically or horizontally (Shift = fine), use the mouse wheel over a knob, arrow/PageUp/PageDown/Home/End keys when focused; double-click resets to the default and clicking the value still lets you type a number. The hidden range inputs remain the source of truth, so presets, Reset, Undo, morph, reactive rules and the mixer move the knobs too. Layer opacity, the Morph crossfader and global Intensity stay sliders.

Tests: `glyph-styles.cjs` (override the build with `AUDIOGRAPH_GLYPH_BUILD`), `layer-scope.cjs` (`AUDIOGRAPH_SCOPE_BUILD`) and `knobs.cjs` (`AUDIOGRAPH_KNOB_BUILD`; `knobs-bench.cjs` measures playback cost with the knobs visible).

## GPU Particles, Bass Punch and Beat Glide Preview (v31)

**[Try v31](versions/audiograph_31.html)**. This version contains all v30 features and adds the following.

**Particles** (beside Renderer) defaults to **GPU sim+draw**. Each layer keeps its particles in WebGL2 RGBA32F ping-pong textures (an 8192-slot ring per layer). One fragment-shader pass per layer per frame handles the following:

- Ageing and death
- Gravity, damping and energy boost
- Twist, bulge and wave
- Perlin, curl, Brownian and vortex noise

Instanced draws render trails and all 11 shapes: circle, square, star, diamond, ring, triangle, spark, line, and numbers, symbols and words from a glyph atlas. JavaScript still spawns particles (same layout and audio emission) and uploads only the new ones. It also applies the oldest-first 2000 cap by uploading kill markers. There is no per-particle CPU update and no per-frame readback.

The following fall back per layer to the original CPU code (one readback, then CPU), with the reason shown in the renderer status:

- Camera colours
- Color randomness
- Blend modes, filters and shadows
- Non-uniform transforms
- Oversized surfaces
- A lost context

**CPU (original)** is the comparison/rollback option. The choice is remembered, and `?particles=gpu|cpu` overrides it.

Known GPU differences:

- Brownian noise uses a GPU hash rather than `Math.random`.
- A glyph is fixed per particle.
- Trail joins are round.
- Changing trail length restarts trails.
- The cap does not see particles that already left the screen.

PNG, SVG and recording use the same composited frames as before.

On Apple M2 Max with Chrome 154 (ANGLE Metal), at 746x578, with 60 warm-up and 40 measured frames, `tests/particles-benchmark.cjs` gave these median results (alive counts matched):

| Scene (alive) | CPU frame | GPU frame | Speedup |
| --- | ---: | ---: | ---: |
| 4 layers circles (8000) | 14.7 ms | 6.0 ms | 2.4x |
| 4 layers stars + trails 20 (8000) | 33.5 ms | 8.5 ms | 3.9x |
| 4 layers noise + vortex (8000) | 16.0 ms | 6.1 ms | 2.6x |
| 1 layer numbers + trails 8 (2000) | 357 ms | 3.8 ms | 94x |

**Bass punch** (default 60%) and **Bass release** (default 220 ms) are in the Effects section next to Amplify. Weak bass in v30 had two causes:

- Continuous mode scaled the static waveform by a broadband level, `min(1, rms*3)`, which saturates on mastered music. A 50 Hz and a 2 kHz tone at equal amplitude gave identical values.
- Equalizer and live lines average linear FFT bins, so bass reaches only the first line or two.

v31 measures one bass feature per frame from a 140 Hz low-pass tap of the shared analyser. The tap ends in an analyser, so playback and recording audio are unchanged. The feature combines bass level, onset transient, instant attack and the chosen release. It drives a bounded gain plus a small bass-only lift with a soft knee. This applies in file, mic, system and equalizer paths, every layer, particle energy, zoom and beat morph onsets.

Punch 0 gives exactly the v30 values. The setting is saved in state as `bass`; older presets keep the current value.

Measured results from `tests/audio-bass.cjs`:

- **Equal tones:** 50 Hz vs 2 kHz is 1.00x at punch 0 and 1.58x at punch 60.
- **Kick peaks:** 0.43 at punch 0 vs 0.65 at punch 60.
- **Equalizer kick range:** 0.03 at punch 0 vs 0.19 at punch 60.
- **Silence:** never boosted.

**On Beat** has a style selector:

- **Glide ¼/beat** (default) and **Glide 1/beat**: each detected bass onset moves the target forward by one step, with a 180 ms debounce and hysteresis. A critically damped spring on the shared output scheduler eases the morph position toward the target, with continuous position and velocity and no overshoot. It settles in about 0.7 s, and rapid beats extend the target by at most 1.5 steps.
- **Snap (v30)** keeps the original detector and 0.45 s linear jump.

The v30 jitter came from several causes:

- The detector read 0–6 kHz, including hi-hats.
- Linear ramps started and stopped dead.
- Beats arriving during a ramp were dropped.
- The detector history went stale, so ramps chained back to back.

Play, Random, Ping-pong (timer mode), scrub, Apply and stop are unchanged.

**Stop/Play** (v31): the top `#stopAudioBtn` no longer disappears. It shows Stop while audio is actually active (file playing or Mic/System live; Stop behaves as before), and Play otherwise. Play acts on the last selected source: a paused, stopped or ended file resumes or restarts within the crop/selection range, and Mic/System reconnect through a fresh permission request (ended live tracks are never reused). Before any source it is disabled with guidance. A denied or cancelled request leaves Play, an inline status and no active state. Its label, title and aria-label stay in sync with the lower Play/Pause. Reset does not start or stop sources. Test: `audio-transport.cjs`.

**Reset** (v31) is a comprehensive artistic reset and one Undo step. It restores every visual, colour, particle, audio-reactive, EQ, Bass punch/release (60%/220 ms), post-FX (trails/feedback caches cleared), webcam slider and beat-style (Glide) control to its fresh-load default. It also clears reactive rules and their bases, turns off and clears the mixer, drop detector and loudness zoom, stops a running morph and frees GPU particles. Kept: mapping/calibration, saved presets and profiles, the morph playlist, output window and resolution, renderer/particle-backend choice, and the audio/camera sources. `reset-all.cjs` mutates every in-scope control, then checks that Reset matches a fresh load exactly while playing and that Undo restores everything.

Tests (each defaults to v31): `particles-gpu.cjs` checks state/image parity, GPU-only simulation counters, all shapes, cap, fallback, switching and context loss. `audio-bass.cjs` and `morph-beat.cjs` use generated WAVs. `npm run bench:particles` runs the benchmark, which needs at least 1.5x on the heavy scenes (`PARTICLE_MIN_SPEEDUP`). Override the build with `AUDIOGRAPH_PARTICLE_BUILD`.

## Quick Start

1. Open the [live app](https://vladimirpetkovic.github.io/audiograph/) (Chrome/Edge recommended) or `index.html` locally.
2. Click **Load Audio** and pick a song, or use **Mic** / **System**.
3. Hit play — the visualization responds to the music.
4. Explore Layouts, Styles, and the Preset Morph in the sidebar.
5. Hit **✨ Surprise Me** for instant inspiration, or **🔗 Copy Link** to share a look.
6. Go fullscreen with ⌘F.

## Performance

Rendering is Canvas 2D with a WebGL post-FX pass. The v30 preview can instead draw layer geometry with WebGL2, falling back per layer. It caps the device-pixel-ratio, pools offscreen canvases, and caches hot paths to stay smooth; heavy multi-layer presets with maxed post-FX are the most demanding.

## Tech

- Single HTML file, zero external runtime dependencies — vanilla JS, Canvas 2D, Web Audio API
- WebGL shader pipeline for post-processing
- Custom 2D Perlin noise
- MP4/WebM recording via MediaRecorder
- Works offline after first load

## Browser Regression Checks

The app still has no build step or runtime dependencies. Optional projection tests live in `tests/`:

```sh
cd tests
npm ci
npx playwright install chromium
npm test
```

To use an installed Chromium/Chrome instead, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable path. The checks use generated audio and fake microphone input; they cover frame equality, post-FX, morphing, resizing, fullscreen, recording, and window lifecycle. Mapping checks run against the v23 preview, exercising projective geometry, pixel-accurate texture/crop sampling, real handle dragging, profile persistence, and GPU-loss recovery. Resolution checks run against v24 at standard and Retina DPI, checking exact canvas and recorded-video dimensions. Content-mode checks retain v25's original projector-space behavior as an archived-version regression. v26 has dedicated Span checks for actual corner/grid deformation, shared source layouts, rotation and persistence. Its fullscreen suite intentionally suspends the controller animation clock and checks actual fullscreen pixels and callback migration/cancellation; the same regression fails on v25. Set `AUDIOGRAPH_BUILD=versions/audiograph_26.html AUDIOGRAPH_RESOLUTION_BUILD=versions/audiograph_26.html` to also exercise projection, mapping and resolution against v26.

v27's `system-audio.cjs` checks requested picker options, audio-only capture, cancellation/denial, missing audio, setup failure, retry, and stream cleanup using controlled display-capture streams. It does not automate Chrome's native share chooser or OS audio support. Use `AUDIOGRAPH_SYSTEM_URL` to run the same connection checks against a published URL.

v28's `plane-interaction.cjs` uses actual double-click/drag/key events and projected GPU pixels to check visible-plane selection, overlap/mesh hit testing, shared-image movement through perspective/fine warps/rotations, geometry locking, cancellation, undo, black overflow, and profile persistence. Use `AUDIOGRAPH_INTERACTION_URL` for the published preview.

To exercise all current behavior in v30 while retaining v25's archived content-mode regression:

```sh
AUDIOGRAPH_BUILD=versions/audiograph_30.html \
AUDIOGRAPH_RESOLUTION_BUILD=versions/audiograph_30.html \
AUDIOGRAPH_FULLSCREEN_BUILD=versions/audiograph_30.html \
AUDIOGRAPH_SPAN_BUILD=versions/audiograph_30.html \
AUDIOGRAPH_SYSTEM_BUILD=versions/audiograph_30.html \
AUDIOGRAPH_INTERACTION_BUILD=versions/audiograph_30.html \
npm test
```

v30's `gpu-renderer.cjs` checks the following on the default `versions/audiograph_30.html` (override with `AUDIOGRAPH_GPU_BUILD`):

- The active WebGL2 path, with real draw calls and vertices
- Pixel parity with Canvas 2D across presets: mean RGB difference ≤5 and ≤1% of pixels differing by more than 64
- Animation during playback
- Per-layer fallback reasons for a mixed stack
- Context loss and restore
- Projection and recording output
- Backend persistence

`gpu-benchmark.cjs [--quick] [--assert-speedup]` times identical scenes in Canvas, forced GPU and Auto. It reports `renderDensity` CPU time and completed-frame time (median/p90 after warm-up) and playback cadence; `AG_DETAIL=1` adds a record/render/blit breakdown. `AUDIOGRAPH_GPU_URL` can run renderer acceptance against a published preview.

`seamless-span.cjs` measures all three cube joins with GPU source-gradient pixels, including unequal perspective, fine warping, shared-image dragging, profile validation, undo and persistence. Override with `AUDIOGRAPH_SEAM_BUILD` or `AUDIOGRAPH_SEAM_URL`.

## Keyboard

⌘/Ctrl + Z — Undo · ⌘/Ctrl + F — Fullscreen · Space — Play/Pause · Esc — Exit fullscreen / close help

## Author

**Vladimir Petković** — [vladimirpetkovic.com](https://www.vladimirpetkovic.com)

## License

MIT
