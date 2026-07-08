# Audiograph

**Sound becomes shape.** A browser-based audio-visualization instrument where line density and form encode the music — dense and tall when loud, sparse and calm when quiet.

Single HTML file. No dependencies. No build step. Open it in a browser and go.

![version](https://img.shields.io/badge/version-21-blue) ![license](https://img.shields.io/badge/license-MIT-green)

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

## Keyboard

⌘/Ctrl + Z — Undo · ⌘/Ctrl + F — Fullscreen · Space — Play/Pause · Esc — Exit fullscreen / close help

## Author

**Vladimir Petković** — [vladimirpetkovic.com](https://www.vladimirpetkovic.com)

## License

MIT
