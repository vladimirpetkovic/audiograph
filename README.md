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
