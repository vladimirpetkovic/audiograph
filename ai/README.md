# Audiograph AI bridge

A small local server that lets **Audiograph Pro** restyle its live output with a fast
diffusion model in real time. The browser streams frames over a WebSocket; the bridge
runs image-to-image (optionally guided by a Canny or depth ControlNet) and sends each
frame back.

## Start it

macOS: double-click `start.command` or run it from a terminal:

```bash
./start.command                 # real models (first run installs PyTorch etc.)
./start.command --mock          # no AI: fake effect to test the connection
./start.command --preload sd-turbo
```

The first run creates a Python 3.12 environment in `~/.audiograph-ai/venv` (outside the
repo). It uses `uv` if available, otherwise `python3 -m venv`. Requirements are
reinstalled only when `requirements.txt` changes.
When the banner appears, paste the URL (default `ws://127.0.0.1:7861`) into the AI node
in Audiograph Pro.

Manual install: `pip install -r requirements.txt && python bridge.py`.

## Models

All models download from Hugging Face on first use (status messages show progress in
Audiograph). They are cached in `~/.cache/huggingface`.

| id | base | ControlNets (canny / depth) | notes |
|---|---|---|---|
| `sd-turbo` | stabilityai/sd-turbo | thibaud/controlnet-sd21-{canny,depth}-diffusers | fastest, 512px native |
| `sdxl-turbo` | stabilityai/sdxl-turbo | diffusers/controlnet-{canny,depth}-sdxl-1.0-small | sharper, slower |
| `lcm` | Lykon/dreamshaper-8 + LCM-LoRA | lllyasviel/control_v11p_sd15_canny, control_v11f1p_sd15_depth | try 4 steps, guidance 1–2 |

Depth uses `depth-anything/Depth-Anything-V2-Small-hf`. The bridge uses the TAESD
tiny VAE for speed (`--full-vae` turns it off). It keeps 2 models loaded and evicts the
least recently used one.
fp16 is used on MPS and CUDA. CPU uses fp32 and is very slow.

Notes: the bridge needs at least one denoising step, so it raises the step count when
`steps × strength < 1`. Negative prompts only apply when guidance > 1 (turbo models
default to 0). Prompt mixing blends the cached text embeddings of `prompt` and `prompt2`.

## Flags

| flag | default | |
|---|---|---|
| `--host` | 127.0.0.1 | bind address; `0.0.0.0` lets other machines connect |
| `--port` | 7861 | |
| `--mock` | off | no torch; returns a posterized, hue-shifted frame (needs only websockets + pillow) |
| `--preload MODEL…` | none | load models at startup instead of on the first frame |
| `--full-vae` | off | full VAE instead of TAESD |
| `--device` | auto | `auto`, `mps`, `cuda` or `cpu` |

## Remote GPU box

On a Linux or Windows machine with an NVIDIA GPU, run:
`pip install -r requirements.txt && python bridge.py --host 0.0.0.0`
(install the CUDA build of torch first if needed). Then enter `ws://<gpu-box-ip>:7861`
in Audiograph. Pages served over https (GitHub Pages) can still reach
`ws://127.0.0.1`. For a **remote** plain-`ws://` host, browsers may block mixed content.
Use an SSH tunnel to work around this:
`ssh -L 7861:127.0.0.1:7861 gpu-box` and keep using `ws://127.0.0.1:7861`.
You can also put the bridge behind a TLS proxy (`wss://`).

## Protocol test

`python test_bridge.py` starts the bridge in `--mock` mode on a random port and checks
hello, frame, error handling and stale-frame dropping.

## Troubleshooting

- **Can't connect**: check that the terminal shows the banner and the port matches. Another
  process may already use 7861; try `--port 7862`.
- **First frame takes long**: the model is downloading (SD-Turbo is about 2.5 GB, SDXL-Turbo
  about 7 GB) or warming up. Later frames are fast.
- **Black or NaN images on SDXL with `--full-vae`**: the fp16-fix VAE is already used. Try
  `--device cpu` to confirm the problem is fp16-related.
- **Out of memory**: use a smaller size, or keep one model in use (2 stay cached).
- **Reinstall**: delete `~/.audiograph-ai` and run `start.command` again.
