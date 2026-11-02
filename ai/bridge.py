#!/usr/bin/env python3
"""Audiograph AI bridge — real-time img2img over WebSocket for Audiograph Pro.

The browser streams JPEG frames; this server restyles each one with a fast
diffusion model (SD-Turbo, SDXL-Turbo or SD1.5+LCM, optional ControlNet) and
sends the result back. See README.md for the protocol and usage.

`--mock` mode imports neither torch nor diffusers and only needs
`websockets` + `pillow`.
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import hashlib
import io
import json
import math
import os
import random
import socket
import sys
import time
import traceback
from collections import OrderedDict

from PIL import Image, ImageDraw, ImageFont, ImageOps

try:
    from websockets.asyncio.server import serve
except ImportError:  # pragma: no cover
    sys.exit("websockets>=13 is required:  pip install -U websockets")

PROTOCOL_VERSION = 1
MODELS = [
    {"id": "sd-turbo", "label": "SD-Turbo"},
    {"id": "sdxl-turbo", "label": "SDXL-Turbo"},
    {"id": "lcm", "label": "SD 1.5 + LCM"},
]
MODEL_LABELS = {m["id"]: m["label"] for m in MODELS}
CONTROLS = ["none", "canny", "depth"]
SIZES = (256, 384, 512, 768, 1024)

MODEL_SPECS = {
    "sd-turbo": {
        "repo": "stabilityai/sd-turbo",
        "family": "sd",
        "taesd": "madebyollin/taesd",
        "controlnet": {
            "canny": "thibaud/controlnet-sd21-canny-diffusers",
            "depth": "thibaud/controlnet-sd21-depth-diffusers",
        },
    },
    "sdxl-turbo": {
        "repo": "stabilityai/sdxl-turbo",
        "family": "sdxl",
        "taesd": "madebyollin/taesdxl",
        "fp16_vae": "madebyollin/sdxl-vae-fp16-fix",
        "controlnet": {
            "canny": "diffusers/controlnet-canny-sdxl-1.0-small",
            "depth": "diffusers/controlnet-depth-sdxl-1.0-small",
        },
    },
    "lcm": {
        "repo": "Lykon/dreamshaper-8",
        "family": "sd",
        "lora": "latent-consistency/lcm-lora-sdv1-5",
        "taesd": "madebyollin/taesd",
        "controlnet": {
            "canny": "lllyasviel/control_v11p_sd15_canny",
            "depth": "lllyasviel/control_v11f1p_sd15_depth",
        },
    },
}
DEPTH_REPO = "depth-anything/Depth-Anything-V2-Small-hf"


# ----------------------------------------------------------------------------
# Request parsing / image helpers (shared by mock and real engines)
# ----------------------------------------------------------------------------

class BadRequest(Exception):
    pass


def _num(v, default, lo, hi, cast=float):
    try:
        x = cast(v)
        if isinstance(x, float) and not math.isfinite(x):
            raise ValueError
    except (TypeError, ValueError, OverflowError):
        x = default
    return max(lo, min(hi, x))


def parse_frame(msg: dict) -> dict:
    model = msg.get("model") or "sd-turbo"
    if model not in MODEL_SPECS:
        raise BadRequest(f"unknown model '{model}' (expected one of {', '.join(MODEL_SPECS)})")
    ctrl = msg.get("control") or {}
    if not isinstance(ctrl, dict):
        ctrl = {}
    kind = ctrl.get("kind") or "none"
    if kind not in CONTROLS:
        raise BadRequest(f"unknown control kind '{kind}' (expected none|canny|depth)")
    size = _num(msg.get("size"), 512, 64, 1024, int)
    size = min(SIZES, key=lambda s: abs(s - size))
    image = msg.get("image")
    if not isinstance(image, str) or not image:
        raise BadRequest("frame has no image")
    try:
        seed = int(msg.get("seed", -1))
    except (TypeError, ValueError, OverflowError):
        seed = -1
    return {
        "model": model,
        "prompt": str(msg.get("prompt") or ""),
        "negative": str(msg.get("negative") or ""),
        "prompt2": str(msg.get("prompt2") or ""),
        "mix": _num(msg.get("mix"), 0.0, 0.0, 1.0),
        "strength": _num(msg.get("strength"), 0.5, 0.0, 1.0),
        "steps": _num(msg.get("steps"), 2, 1, 8, int),
        "seed": seed % 2**32 if seed >= 0 else -1,
        "guidance": _num(msg.get("guidance"), 0.0, 0.0, 10.0),
        "size": size,
        "control": {
            "kind": kind,
            "strength": _num(ctrl.get("strength"), 0.8, 0.0, 2.0),
            "low": _num(ctrl.get("low"), 100, 0, 255, int),
            "high": _num(ctrl.get("high"), 200, 0, 255, int),
        },
        "image": image,
    }


def decode_data_url(data: str) -> Image.Image:
    try:
        if data.startswith("data:"):
            data = data.split(",", 1)[1]
        raw = base64.b64decode(data, validate=False)
        img = Image.open(io.BytesIO(raw))
        img.load()
        return img.convert("RGB")
    except Exception as e:
        raise BadRequest(f"could not decode image: {e}") from None


def encode_data_url(img: Image.Image, quality: int = 85) -> str:
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=quality)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def fit_size(img: Image.Image, size: int, multiple: int = 8) -> Image.Image:
    """Scale so the longer side == size; both dims rounded to `multiple`."""
    w, h = img.size
    s = size / max(w, h)
    nw = max(multiple, int(round(w * s / multiple)) * multiple)
    nh = max(multiple, int(round(h * s / multiple)) * multiple)
    if (nw, nh) == (w, h):
        return img
    return img.resize((nw, nh), Image.LANCZOS)


def canny_image(img: Image.Image, low: int, high: int) -> Image.Image:
    try:
        import cv2
        import numpy as np

        edges = cv2.Canny(np.array(img.convert("L")), low, high)
        return Image.fromarray(edges).convert("RGB")
    except ImportError:
        from PIL import ImageFilter

        e = img.convert("L").filter(ImageFilter.FIND_EDGES)
        return e.point(lambda v: 255 if v >= low else 0).convert("RGB")


# ----------------------------------------------------------------------------
# Mock engine (no torch)
# ----------------------------------------------------------------------------

class MockEngine:
    device = "mock-cpu"
    mock = True

    def loaded(self, model_id: str) -> bool:
        return True

    async def prepare(self, req, notify):
        return None

    def infer(self, req: dict) -> Image.Image:
        time.sleep(0.03)
        img = fit_size(decode_data_url(req["image"]), req["size"])
        if req["control"]["kind"] == "canny":
            img = canny_image(img, req["control"]["low"], req["control"]["high"])
        img = ImageOps.posterize(img, 3)
        key = f'{req["model"]}|{req["prompt"]}|{req["prompt2"]}|{req["mix"]:.2f}'
        shift = (int(hashlib.md5(key.encode()).hexdigest()[:2], 16) + int(req["strength"] * 128)) % 256
        h, s, v = img.convert("HSV").split()
        h = h.point(lambda x: (x + shift) % 256)
        s = s.point(lambda x: min(255, int(x * 1.3) + 40))
        img = Image.merge("HSV", (h, s, v)).convert("RGB")
        d = ImageDraw.Draw(img)
        d.rectangle((0, 0, img.width, 14), fill=(0, 0, 0))
        text = f'MOCK {req["model"]} | {req["prompt"][:60]}'
        try:
            d.text((4, 2), text, fill=(255, 255, 255), font=ImageFont.load_default())
        except UnicodeEncodeError:
            d.text((4, 2), text.encode("ascii", "replace").decode(), fill=(255, 255, 255))
        return img


# ----------------------------------------------------------------------------
# Real engine (torch + diffusers, imported lazily)
# ----------------------------------------------------------------------------

class RealEngine:
    mock = False

    def __init__(self, device: str = "auto", full_vae: bool = False, max_pipes: int = 2):
        os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
        os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
        import torch

        self.torch = torch
        if device == "auto":
            if torch.cuda.is_available():
                device = "cuda"
            elif torch.backends.mps.is_available():
                device = "mps"
            else:
                device = "cpu"
        self.device = device
        self.dtype = torch.float16 if device in ("cuda", "mps") else torch.float32
        self.full_vae = full_vae
        self.max_pipes = max_pipes
        # model_id -> {"base": pipe, "cn": {kind: pipe}}; LRU order
        self.pipes: OrderedDict[str, dict] = OrderedDict()
        self.embeds: OrderedDict[tuple, tuple] = OrderedDict()
        self.depth = None

    # ---- loading -----------------------------------------------------------
    def loaded(self, model_id: str) -> bool:
        return model_id in self.pipes

    @staticmethod
    def _cached(repo: str) -> bool:
        try:
            from huggingface_hub.constants import HF_HUB_CACHE

            snaps = os.path.join(HF_HUB_CACHE, "models--" + repo.replace("/", "--"), "snapshots")
            return any(os.scandir(snaps))
        except Exception:
            return False

    def _verb(self, *repos) -> str:
        return "Loading" if all(self._cached(r) for r in repos) else "Downloading"

    async def prepare(self, req, notify):
        """Make sure the pipelines for `req` are loaded; emits status messages."""
        mid, kind = req["model"], req["control"]["kind"]
        label = MODEL_LABELS[mid]
        spec = MODEL_SPECS[mid]
        if mid not in self.pipes:
            verb = await asyncio.to_thread(self._verb, spec["repo"])
            await notify({"type": "status", "state": "loading", "model": mid, "message": f"{verb} {label}…"})
            await asyncio.to_thread(self._load_base, mid)
            await notify({"type": "status", "state": "ready", "model": mid})
        else:
            self.pipes.move_to_end(mid)
        if kind != "none" and kind not in self.pipes[mid]["cn"]:
            repos = [spec["controlnet"][kind]] + ([DEPTH_REPO] if kind == "depth" and self.depth is None else [])
            verb = await asyncio.to_thread(self._verb, *repos)
            await notify({"type": "status", "state": "loading", "model": mid,
                          "message": f"{verb} {kind} ControlNet for {label}…"})
            await asyncio.to_thread(self._load_control, mid, kind)
            await notify({"type": "status", "state": "ready", "model": mid})

    def _from_pretrained(self, cls, repo, **kw):
        if self.dtype == self.torch.float16:
            try:
                return cls.from_pretrained(repo, torch_dtype=self.dtype, variant="fp16", **kw)
            except (OSError, ValueError):
                pass
        return cls.from_pretrained(repo, torch_dtype=self.dtype, **kw)

    def _load_base(self, mid: str):
        import diffusers as D

        spec = MODEL_SPECS[mid]
        kw = {}
        if not self.full_vae:
            kw["vae"] = D.AutoencoderTiny.from_pretrained(spec["taesd"], torch_dtype=self.dtype)
        elif spec["family"] == "sdxl" and self.dtype == self.torch.float16:
            kw["vae"] = D.AutoencoderKL.from_pretrained(spec["fp16_vae"], torch_dtype=self.dtype)
        if spec["family"] == "sdxl":
            cls = D.StableDiffusionXLImg2ImgPipeline
        else:
            cls = D.StableDiffusionImg2ImgPipeline
            kw.update(safety_checker=None, requires_safety_checker=False)
        pipe = self._from_pretrained(cls, spec["repo"], **kw)
        if spec.get("lora"):
            pipe.scheduler = D.LCMScheduler.from_config(pipe.scheduler.config)
            pipe.load_lora_weights(spec["lora"])
            pipe.fuse_lora()
        pipe = pipe.to(self.device)
        pipe.set_progress_bar_config(disable=True)
        # LRU eviction of whole model families (base + its ControlNet pipes)
        while len(self.pipes) >= self.max_pipes:
            old, _ = self.pipes.popitem(last=False)
            self.embeds = OrderedDict((k, v) for k, v in self.embeds.items() if k[0] != old)
            self._free()
        self.pipes[mid] = {"base": pipe, "cn": {}}

    def _load_control(self, mid: str, kind: str):
        import diffusers as D

        spec = MODEL_SPECS[mid]
        cn = self._from_pretrained(D.ControlNetModel, spec["controlnet"][kind]).to(self.device)
        cls = (D.StableDiffusionXLControlNetImg2ImgPipeline if spec["family"] == "sdxl"
               else D.StableDiffusionControlNetImg2ImgPipeline)
        # from_pipe shares unet/text encoders/vae with the plain pipeline (no extra memory)
        base = self.pipes[mid]["base"]
        # vae passed explicitly: from_pipe drops an AutoencoderTiny it can't type-match
        pipe = cls.from_pipe(base, controlnet=cn, vae=base.vae)
        pipe.set_progress_bar_config(disable=True)
        if kind == "depth" and self.depth is None:
            from transformers import pipeline as hf_pipeline

            self.depth = hf_pipeline("depth-estimation", model=DEPTH_REPO, device=self.device)
        self.pipes[mid]["cn"][kind] = pipe

    def _free(self):
        import gc

        gc.collect()
        if self.device == "cuda":
            self.torch.cuda.empty_cache()
        elif self.device == "mps":
            self.torch.mps.empty_cache()

    # ---- text embeddings ---------------------------------------------------
    def _encode(self, mid: str, text: str):
        key = (mid, text)
        if key in self.embeds:
            self.embeds.move_to_end(key)
            return self.embeds[key]
        pipe = self.pipes[mid]["base"]
        with self.torch.inference_mode():
            if MODEL_SPECS[mid]["family"] == "sdxl":
                pe, _, pooled, _ = pipe.encode_prompt(text or " ", device=self.device, num_images_per_prompt=1,
                                                      do_classifier_free_guidance=False)
                if text == "":  # SDXL convention: zero embeddings for empty prompts
                    pe, pooled = self.torch.zeros_like(pe), self.torch.zeros_like(pooled)
                out = (pe, pooled)
            else:
                pe, _ = pipe.encode_prompt(text, self.device, 1, False)
                out = (pe, None)
        self.embeds[key] = out
        while len(self.embeds) > 64:
            self.embeds.popitem(last=False)
        return out

    def _prompt_kwargs(self, req: dict) -> dict:
        mid = req["model"]
        pe, pooled = self._encode(mid, req["prompt"])
        if req["prompt2"] and req["mix"] > 0:
            pe2, pooled2 = self._encode(mid, req["prompt2"])
            pe = self.torch.lerp(pe, pe2, req["mix"])
            if pooled is not None:
                pooled = self.torch.lerp(pooled, pooled2, req["mix"])
        kw = {"prompt_embeds": pe}
        if pooled is not None:
            kw["pooled_prompt_embeds"] = pooled
        if req["guidance"] > 1.0:  # CFG active → negative prompt matters
            ne, npooled = self._encode(mid, req["negative"])
            kw["negative_prompt_embeds"] = ne
            if npooled is not None:
                kw["negative_pooled_prompt_embeds"] = npooled
        return kw

    # ---- inference ---------------------------------------------------------
    def infer(self, req: dict) -> Image.Image:
        torch = self.torch
        mid, ctrl = req["model"], req["control"]
        family = MODEL_SPECS[mid]["family"]
        img = fit_size(decode_data_url(req["image"]), req["size"], 64 if family == "sdxl" else 8)

        strength = max(0.05, req["strength"])
        steps_eff = max(req["steps"], math.ceil(1.0 / strength))
        while int(steps_eff * strength) < 1:  # img2img needs >= 1 denoising step
            steps_eff += 1

        seed = req["seed"] if req["seed"] >= 0 else random.randrange(2**31)
        kw = dict(image=img, strength=strength, num_inference_steps=steps_eff,
                  guidance_scale=req["guidance"], generator=torch.Generator("cpu").manual_seed(seed),
                  output_type="pil")
        kw.update(self._prompt_kwargs(req))

        if ctrl["kind"] == "none":
            pipe = self.pipes[mid]["base"]
        else:
            pipe = self.pipes[mid]["cn"][ctrl["kind"]]
            if ctrl["kind"] == "canny":
                cond = canny_image(img, ctrl["low"], ctrl["high"])
            else:
                cond = self.depth(img)["depth"].convert("RGB").resize(img.size, Image.BILINEAR)
            kw.update(control_image=cond, controlnet_conditioning_scale=ctrl["strength"])

        with torch.inference_mode():
            return pipe(**kw).images[0]


# ----------------------------------------------------------------------------
# WebSocket server
# ----------------------------------------------------------------------------

class Bridge:
    def __init__(self, engine):
        self.engine = engine
        self.lock = asyncio.Lock()  # one inference / model load at a time
        self.clients: set = set()

    def info(self) -> dict:
        return {
            "type": "info",
            "version": PROTOCOL_VERSION,
            "device": self.engine.device,
            "mock": self.engine.mock,
            "models": [dict(m, loaded=self.engine.loaded(m["id"])) for m in MODELS],
            "controls": CONTROLS,
        }

    @staticmethod
    async def send(ws, msg: dict):
        try:
            await ws.send(json.dumps(msg))
        except Exception:
            pass

    async def broadcast(self, msg: dict):
        await asyncio.gather(*(self.send(c, msg) for c in list(self.clients)))

    async def handler(self, ws):
        self.clients.add(ws)
        slot = {"frame": None}
        wake = asyncio.Event()
        worker = asyncio.create_task(self.worker(ws, slot, wake))
        try:
            async for raw in ws:
                try:
                    msg = json.loads(raw)
                    if not isinstance(msg, dict):
                        raise ValueError("message must be a JSON object")
                except Exception as e:
                    await self.send(ws, {"type": "error", "id": None, "message": f"bad JSON: {e}"})
                    continue
                t = msg.get("type")
                if t == "hello":
                    await self.send(ws, self.info())
                elif t == "frame":
                    slot["frame"] = msg  # newest wins; stale queued frames are dropped
                    wake.set()
                else:
                    await self.send(ws, {"type": "error", "id": msg.get("id"),
                                         "message": f"unknown message type '{t}'"})
        except Exception:
            pass
        finally:
            self.clients.discard(ws)
            worker.cancel()

    async def worker(self, ws, slot, wake):
        while True:
            await wake.wait()
            wake.clear()
            msg, slot["frame"] = slot["frame"], None
            if msg is None:
                continue
            fid = msg.get("id")
            try:
                req = parse_frame(msg)
                async with self.lock:
                    await self.engine.prepare(req, self.broadcast)
                    t0 = time.perf_counter()
                    img = await asyncio.to_thread(self.engine.infer, req)
                    ms = (time.perf_counter() - t0) * 1000
                data = await asyncio.to_thread(encode_data_url, img)
                await self.send(ws, {"type": "result", "id": fid, "image": data, "ms": round(ms, 1)})
            except asyncio.CancelledError:
                raise
            except BadRequest as e:
                await self.send(ws, {"type": "error", "id": fid, "message": str(e)})
            except Exception as e:
                traceback.print_exc()
                await self.send(ws, {"type": "error", "id": fid, "message": f"{type(e).__name__}: {e}"})


def lan_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "<this-machine-ip>"


async def amain(args):
    if args.mock:
        engine = MockEngine()
    else:
        print("Loading torch…", flush=True)
        engine = RealEngine(device=args.device, full_vae=args.full_vae)
    bridge = Bridge(engine)

    for mid in args.preload if not args.mock else []:
        if mid not in MODEL_SPECS:
            sys.exit(f"--preload: unknown model '{mid}' (expected {', '.join(MODEL_SPECS)})")

        async def say(m):
            if m.get("message"):
                print("  " + m["message"], flush=True)

        await engine.prepare({"model": mid, "control": {"kind": "none"}}, say)

    async with serve(bridge.handler, args.host, args.port, max_size=64 * 2**20,
                     ping_interval=20, ping_timeout=120) as server:
        port = server.sockets[0].getsockname()[1] if server.sockets else args.port
        host = "127.0.0.1" if args.host in ("0.0.0.0", "::", "localhost", "") else args.host
        print("\n" + "=" * 60)
        print(f" Audiograph AI bridge  |  device: {engine.device}" + ("  |  MOCK" if args.mock else ""))
        print(f" Paste this into Audiograph Pro's AI node:\n\n     ws://{host}:{port}\n")
        if args.host in ("0.0.0.0", "::"):
            print(f" From other machines on your network: ws://{lan_ip()}:{port}")
        print(" Models load on first use (the first frame can take a while).")
        print(" Ctrl+C to stop.")
        print("=" * 60 + "\n", flush=True)
        await asyncio.Future()


def main():
    p = argparse.ArgumentParser(description="Audiograph AI bridge (real-time img2img over WebSocket)")
    p.add_argument("--host", default="127.0.0.1", help="bind address (0.0.0.0 = allow other machines)")
    p.add_argument("--port", type=int, default=7861, help="port (0 = pick a free one)")
    p.add_argument("--mock", action="store_true", help="no AI: fake transform (needs only websockets+pillow)")
    p.add_argument("--preload", nargs="*", default=[], metavar="MODEL",
                   help="load models at startup: sd-turbo, sdxl-turbo, lcm")
    p.add_argument("--full-vae", action="store_true", help="full VAE instead of TAESD (slower, sharper)")
    p.add_argument("--device", default="auto", choices=["auto", "mps", "cuda", "cpu"])
    args = p.parse_args()
    try:
        asyncio.run(amain(args))
    except KeyboardInterrupt:
        print("\nBye.")
    except OSError as e:
        sys.exit(f"Could not start server on {args.host}:{args.port}: {e}")


if __name__ == "__main__":
    main()
