#!/usr/bin/env python3
"""Smoke test: starts bridge.py --mock on a random port and exercises the protocol.

    python test_bridge.py        # exit code 0 = pass
Needs only `websockets` and `pillow`.
"""
import asyncio
import base64
import io
import json
import os
import socket
import subprocess
import sys
import time

from PIL import Image
from websockets.asyncio.client import connect

HERE = os.path.dirname(os.path.abspath(__file__))


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def jpeg_data_url(w=320, h=200) -> str:
    img = Image.new("RGB", (w, h))
    for x in range(w):
        for y in range(0, h, 4):
            img.putpixel((x, y), (x % 256, (y * 2) % 256, 128))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def decode(url: str) -> Image.Image:
    assert url.startswith("data:image/jpeg;base64,"), url[:40]
    return Image.open(io.BytesIO(base64.b64decode(url.split(",", 1)[1])))


def frame(fid, **over):
    msg = {"type": "frame", "id": fid, "model": "sd-turbo", "prompt": "neon city", "negative": "",
           "prompt2": "watercolor", "mix": 0.3, "strength": 0.5, "steps": 2, "seed": 42, "guidance": 0,
           "size": 256, "control": {"kind": "none", "strength": 0.8, "low": 100, "high": 200},
           "image": jpeg_data_url()}
    msg.update(over)
    return msg


async def recv(ws, timeout=10):
    return json.loads(await asyncio.wait_for(ws.recv(), timeout))


async def run(url):
    async with connect(url, max_size=64 * 2**20) as ws:
        await ws.send(json.dumps({"type": "hello"}))
        info = await recv(ws)
        assert info["type"] == "info" and info["version"] == 1, info
        assert info["mock"] is True and info["device"] == "mock-cpu", info
        assert [m["id"] for m in info["models"]] == ["sd-turbo", "sdxl-turbo", "lcm"], info
        assert all({"id", "label", "loaded"} <= set(m) for m in info["models"]), info
        assert info["controls"] == ["none", "canny", "depth"], info
        print("ok  hello -> info")

        await ws.send(json.dumps(frame(1)))
        r = await recv(ws)
        assert r["type"] == "result" and r["id"] == 1 and isinstance(r["ms"], (int, float)), r
        img = decode(r["image"])
        assert img.size == (256, 160), img.size  # longer side = size, dims multiple of 8
        print(f"ok  frame -> result {img.size} in {r['ms']} ms")

        await ws.send(json.dumps(frame(2, size=512, control={"kind": "canny", "strength": 1, "low": 50, "high": 150})))
        r = await recv(ws)
        assert r["type"] == "result" and r["id"] == 2 and decode(r["image"]).size == (512, 320), r.get("message")
        print("ok  canny frame at 512")

        await ws.send(json.dumps(frame(3, image="data:image/jpeg;base64,not-an-image")))
        r = await recv(ws)
        assert r["type"] == "error" and r["id"] == 3, r
        print("ok  bad image -> error:", r["message"])

        await ws.send(json.dumps(frame(4, model="nope")))
        r = await recv(ws)
        assert r["type"] == "error" and r["id"] == 4, r
        print("ok  unknown model -> error")

        await ws.send("{not json")
        r = await recv(ws)
        assert r["type"] == "error" and r["id"] is None, r
        print("ok  bad JSON -> error id null")

        # Burst: stale frames may be dropped, but the newest must always be answered.
        for i in range(10, 15):
            await ws.send(json.dumps(frame(i)))
        ids = []
        while not ids or ids[-1] != 14:
            r = await recv(ws)
            assert r["type"] == "result", r
            ids.append(r["id"])
        assert len(ids) < 5, ids
        print(f"ok  burst of 5 -> answered {ids} (stale dropped)")

        await ws.send(json.dumps({"type": "hello"}))
        assert (await recv(ws))["type"] == "info"
        print("ok  socket still alive after errors")

    # second concurrent-capable connection
    async with connect(url) as a, connect(url) as b:
        await a.send(json.dumps(frame(100)))
        await b.send(json.dumps(frame(200)))
        ra, rb = await recv(a), await recv(b)
        assert ra["id"] == 100 and rb["id"] == 200, (ra, rb)
        print("ok  two connections")


def main():
    port = free_port()
    proc = subprocess.Popen([sys.executable, os.path.join(HERE, "bridge.py"), "--mock", "--port", str(port)],
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    try:
        deadline = time.time() + 15
        while True:
            try:
                socket.create_connection(("127.0.0.1", port), timeout=0.5).close()
                break
            except OSError:
                if proc.poll() is not None or time.time() > deadline:
                    print(proc.stdout.read() if proc.poll() is not None else "", file=sys.stderr)
                    print("FAIL: bridge did not start", file=sys.stderr)
                    return 1
                time.sleep(0.1)
        asyncio.run(run(f"ws://127.0.0.1:{port}"))
        print("PASS")
        return 0
    except Exception as e:
        import traceback

        traceback.print_exc()
        print(f"FAIL: {e!r}", file=sys.stderr)
        return 1
    finally:
        proc.terminate()
        try:
            proc.wait(5)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == "__main__":
    sys.exit(main())
