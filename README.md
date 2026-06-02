# Audiograph

**Sound becomes shape.** A browser-based audio visualization instrument where line spacing encodes loudness — dense when loud, sparse when quiet.

Single HTML file. No dependencies. No build step. Open it in a browser and go.

![version](https://img.shields.io/badge/version-6.0-blue) ![license](https://img.shields.io/badge/license-MIT-green)

---

## How It Works

Audiograph maps audio energy to visual density. Each "line" in the visualization has a height driven by the loudness at that frequency band. The result is an organic, breathing form that responds to music in real time.

**Three audio sources:**
- **Load Audio** — drop in any audio file (mp3, wav, flac, ogg)
- **Microphone** — live input from your mic
- **System Audio** — capture whatever your computer is playing

## Features

### Layouts

14 spatial arrangements for where lines are placed:

| Layout | Description |
|--------|-------------|
| Linear | Horizontal bar — the default |
| Circle | Lines radiate from a ring |
| Kaleidoscope | Segmented circular symmetry |
| Spiral | Archimedean spiral |
| Phyllotaxis | Golden-angle botanical pattern |
| Sine | Lines placed along a sine wave |
| Concentric | Nested rings |
| Scatter | Random positions with cluster control |
| Image | Lines conform to a loaded image's brightness |
| Video | Live video/camera feed as brightness map |
| Text | Type anything — lines fill the letter shapes |
| Terrain | 3D wireframe landscape driven by audio + Perlin noise |
| Sphere | Wireframe globe with audio-reactive surface bumps |
| Custom | Write your own X/Y formulas in JavaScript |

### Line Styles

15 ways to render each line:

Straight, Rounded, Dotted, Dashed, Pins, Tapered, Caps, Cross, Numbers, Symbols, Words, Cascade, Feather, Circles, Braille

### Color System

- **Solid** — single color
- **Tone Ramp** — map loudness to a color gradient (quiet→loud)
- **Simple Ramp** — map position to a color gradient (left→right)
- Per-stop **opacity control** for transparency effects
- 14 tone ramp presets + 14 simple ramp presets

### Effects

- **Spin** — rotate the visualization over time
- **Twist** — angular distortion from center
- **Bulge** — radial push/pull
- **Wave** — sinusoidal displacement
- **Shear** — directional skew
- **Depth** — fade lines by distance
- **Drift** — animated random line movement
- **Amplify** — boost audio reactivity

### Post-Processing (GPU)

8 real-time WebGL shader effects, saved with presets:

Bloom · Chromatic Aberration · Vignette · Grain · Scanlines · Pixelate · Sharpen · Invert

### Reactive Rules

Map audio features to visual parameters automatically:
- **5 sources**: Bass, Mid, Treble, Energy, Beat detection
- **15 targets**: Spin, Height, Thickness, Zoom, Twist, Bulge, Wave, and more
- Create multiple rules for complex audio-reactive behavior

### Layers

Stack multiple visualizations with independent settings:

- Each layer has its own layout, style, colors, effects, particles
- Per-layer opacity control
- Add/remove layers freely
- Presets can save all layers or load into active layer only

### Symmetry

- Mirror X, Y, or XY
- Radial symmetry: 3, 4, 6, or 8-fold
- Flip H/V per layer

### Particles

Toggle a particle overlay on any layer:

- Particles spawn from actual layout positions (including terrain vertices and sphere surface)
- Audio-reactive: energy drives count, velocity, size, lifetime
- 11 shapes: Circle, Square, Star, Diamond, Ring, Triangle, Spark, Line, Numbers, Symbols, Words
- 4 noise types: Perlin, Curl, Brownian, Vortex — combinable at any ratio
- Full physics: gravity, damping, spread, trail rendering

### Terrain Layout

A 3D wireframe landscape:
- Multi-octave Perlin noise creates organic rolling hills
- Audio modulates noise amplitude — loud parts make hills taller
- **Bend** curves the terrain into a cylinder arc
- **Twist** progressively rotates rows by depth
- Camera angle from 0° (horizon) to 90° (top-down)
- Perspective projection with adjustable focal length
- All 15 line styles work on the wireframe

### Sphere Layout

A wireframe globe:
- Audio and Perlin noise drive surface radius displacement
- Auto-rotation with adjustable speed
- Tilt control (-90° to 90°) for any viewing angle
- Normal-based backface culling for proper solid appearance
- Perspective projection with adjustable depth

### Other

- **Outline mode** with 4 styles (Solid, Dotted, Dashed, Connected)
- **Connected** outline draws network-graph lines between points
- **Playback modes**: Continuous (full waveform) or Equalizer (live frequency bars)
- **3D mode** with 5 shapes (Cylinder, Box, Cone, Diamond, Flat) and 6 materials
- **Video layout** with camera support and Edge style (contour lines)
- **Webcam** input for color sampling and displacement
- **Fullscreen** mode (⌘F)
- **Export**: Download PNG, SVG, record MP4/WebM video (captures post-FX)
- **Presets**: 6 built-in + save/load your own (includes post-FX state)
- **Random** button for instant inspiration
- **30-state undo** (⌘Z)

## Quick Start

1. Open `index.html` in a modern browser (Chrome/Edge recommended)
2. Click **Load Audio** and pick a song, or click **Mic** / **System**
3. Hit play — the visualization responds to the music
4. Explore layouts, styles, and effects in the sidebar
5. Press **Random** for surprise combinations
6. Go fullscreen with the ⌘F shortcut or the button in the corner

## Presets

Built-in presets to get started:

| Preset | Description |
|--------|-------------|
| **vibes** | Spiral with symbols, particles, twist + depth effects |
| **biohazard** | 3-layer kaleidoscope + spiral + phyllotaxis |
| **no good** | Text "UP TO NO GOOD" with number particles |
| **rainbow spiral** | 3-layer spiral/circle equalizer |
| **YES** | Spiral + text + phyllotaxis with word particles |
| **Electronic** | 4-layer terrain + scatter + phyllotaxis with particles |

## Tech

- Single HTML file (~600KB)
- Zero external dependencies — vanilla JS, Canvas 2D, Web Audio API
- Three.js r128 (CDN) for 3D mode
- WebGL shader pipeline for post-processing
- Real 2D Perlin noise implementation
- MP4/WebM recording via MediaRecorder API
- Works offline after first load

## Author

**Vladimir Petković**  
[vladimirpetkovic.com](https://www.vladimirpetkovic.com)

## License

MIT
