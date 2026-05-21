# Audiograph

**Sound becomes shape.** A browser-based audio visualization instrument where line spacing encodes loudness — dense when loud, sparse when quiet.

Single HTML file. No dependencies. No build step. Open it in a browser and go.

![Audiograph](https://img.shields.io/badge/version-3.0-blue) ![License](https://img.shields.io/badge/license-MIT-green)

---

## How It Works

Audiograph maps audio energy to visual density. Each "line" in the visualization has a height driven by the loudness at that frequency band. The result is an organic, breathing form that responds to music in real time.

**Three audio sources:**
- **Load Audio** — drop in any audio file (mp3, wav, flac, ogg)
- **Microphone** — live input from your mic
- **System Audio** — capture whatever your computer is playing

## Features

### Layouts
11 spatial arrangements for where lines are placed:

| Layout | Description |
|---|---|
| Linear | Horizontal bar — the default |
| Circle | Lines radiate from a ring |
| Kaleidoscope | Segmented circular symmetry |
| Spiral | Archimedean spiral |
| Phyllotaxis | Golden-angle botanical pattern |
| Sine | Lines placed along a sine wave |
| Concentric | Nested rings |
| Scatter | Random positions with cluster control |
| Image | Lines conform to a loaded image's brightness |
| Text | Type anything — lines fill the letter shapes |
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

### Layers
Stack multiple visualizations with independent settings:
- Each layer has its own layout, style, colors, effects
- Per-layer opacity control
- **⚡ Multi-band** button auto-creates bass/mid/treble layers
- Drag layers on the canvas to reposition

### Symmetry
- Mirror X, Y, or XY
- Radial symmetry: 3, 4, 6, or 8-fold

### Particles
Toggle a particle overlay on any layer:
- Particles spawn from actual layout positions
- Audio-reactive: energy drives count, velocity, size, lifetime
- 7 shapes: Circle, Square, Star, Line, Numbers, Symbols, Words
- Full physics: gravity, damping, spread

### Other
- **Outline mode** with 4 styles (Solid, Dotted, Dashed, Connected)
- **Connected** outline draws network-graph lines between points
- **Playback modes**: Continuous (full waveform) or Equalizer (live frequency bars)
- **3D mode** with multiple shapes and materials
- **Webcam** input for image-reactive layouts
- **Fullscreen** mode (⌘F)
- **Export**: Download PNG, Record WebM video
- **Presets**: 13 built-in + save/load your own
- **Random** button for instant inspiration
- **Undo** support

## Quick Start

1. Open `index.html` in a modern browser (Chrome/Edge recommended)
2. Click **Load Audio** and pick a song, or click **Mic** / **System**
3. Hit play — the visualization responds to the music
4. Explore layouts, styles, and effects in the sidebar
5. Press **Random** for surprise combinations
6. Go fullscreen with the ⌘F shortcut or the button in the corner

## Presets

Built-in presets to get started:

- **Linear Pins** — clean minimal look
- **Sacred Spiral** — golden ratio botanical
- **Twisted Words** — text-based with distortion
- **Particle Wave** — custom sine with particles
- **Dialed Spikes** — circular with pins
- **Hyperdrive** — spiral tunnel effect
- **Eye** — kaleidoscope with depth
- **Heartbeat** — concentric rings pulsing
- **Bursts** — phyllotaxis explosion
- **Numbers Game** — kaleidoscope with number characters
- **Phoenix** — figure-8 lissajous with tapered lines
- **Classic Waves** — DNA helix pattern
- **Dissonance** — multi-layer chaos

## Tech

- Single HTML file (~800KB)
- Zero dependencies — vanilla JS, Canvas 2D API, Web Audio API
- WebM recording via MediaRecorder API
- Works offline after first load

## Author

**Vladimir Petković**

## License

MIT
