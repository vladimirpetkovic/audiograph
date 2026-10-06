# Audiograph

**Sound becomes shape.** A browser-based audio-visualization instrument where line density and form encode the music — dense and tall when loud, sparse and calm when quiet.

Single HTML file. No dependencies. No build step. Open it in a browser and go.

![version](https://img.shields.io/badge/version-22-blue) ![license](https://img.shields.io/badge/license-MIT-green)

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

### Layout — 19, grouped

**General** — Linear · Sine · Circle · Concentric · Spiral · Phyllotaxis · Kaleidoscope · Fractal · Ridge · Scatter
**3D** — Terrain · Sphere · Tetrahedron · DNA
**Input** — Image · Video · Text · Math · 3D Object

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

- **12 built-in presets**: cell · echo · firepit · glass · globe · helix · organica · rorschach · sacred_circle · spiral_planes · waves · zodiac
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

The live entry point is `index.html` (**v22**). Each release is also preserved as `versions/audiograph_N.html`; [v21](versions/audiograph_21.html) and [v22](versions/audiograph_22.html) remain independently runnable. Git release tags provide a second rollback path. Before updating the live entry point, archive its exact contents under the previous version number; never overwrite an existing archive. New features are published at separate numbered preview links for hands-on testing before promotion to the main app.

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

## Quick Start

1. Open the [live app](https://vladimirpetkovic.github.io/audiograph/) (Chrome/Edge recommended) or `index.html` locally.
2. Click **Load Audio** and pick a song, or use **Mic** / **System**.
3. Hit play — the visualization responds to the music.
4. Explore Layouts, Styles, and the Preset Morph in the sidebar.
5. Hit **✨ Surprise Me** for instant inspiration, or **🔗 Copy Link** to share a look.
6. Go fullscreen with ⌘F.

## Performance

Rendering is CPU-side Canvas 2D with a WebGL post-FX pass. It caps the device-pixel-ratio, pools offscreen canvases, and caches hot paths to stay smooth; heavy multi-layer presets with maxed post-FX are the most demanding.

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

To exercise all current behavior in v27 while retaining v25's archived content-mode regression:

```sh
AUDIOGRAPH_BUILD=versions/audiograph_27.html \
AUDIOGRAPH_RESOLUTION_BUILD=versions/audiograph_27.html \
AUDIOGRAPH_FULLSCREEN_BUILD=versions/audiograph_27.html \
AUDIOGRAPH_SPAN_BUILD=versions/audiograph_27.html \
npm test
```

## Keyboard

⌘/Ctrl + Z — Undo · ⌘/Ctrl + F — Fullscreen · Space — Play/Pause · Esc — Exit fullscreen / close help

## Author

**Vladimir Petković** — [vladimirpetkovic.com](https://www.vladimirpetkovic.com)

## License

MIT
