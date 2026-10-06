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

To use an installed Chromium/Chrome instead, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable path. The checks use generated audio and fake microphone input; they cover frame equality, post-FX, morphing, resizing, fullscreen, recording, and window lifecycle. Mapping checks run against the v23 preview, exercising projective geometry, pixel-accurate texture/crop sampling, real handle dragging, profile persistence, and GPU-loss recovery. Set `AUDIOGRAPH_BUILD=versions/audiograph_23.html` to run both suites against the preview.

## Keyboard

⌘/Ctrl + Z — Undo · ⌘/Ctrl + F — Fullscreen · Space — Play/Pause · Esc — Exit fullscreen / close help

## Author

**Vladimir Petković** — [vladimirpetkovic.com](https://www.vladimirpetkovic.com)

## License

MIT
