"""A stand-in for the YouTube sidecar (sidecar/ytcast/index.js), for the tests: no Node, no Internet, no YouTube.

Started by Pixel's server like the real one ([ytcast] command = ["python3", "tests/fake_ytcast.py"]), with the same
environment (PIXEL_YTCAST_URL, PIXEL_YTCAST_TOKEN, PIXEL_YTCAST_DATA...), it speaks the same protocol on the server's
/ytcast WebSocket (pixel/ytcast.py). The test drives it through two files in PIXEL_YTCAST_DATA:
    ctl.jsonl   the test appends messages: each one is sent to the server as it is ({"type": "play", ...}), except
                {"do": "exit", "code": N}: it stops at once, as a crash
    got.jsonl   every message the server sent, one per line; pids.txt: its pid, one line each start
Like the real one, it ends when its stdin closes (the server is gone).
"""
import asyncio
import json
import os
import sys
from pathlib import Path

import aiohttp

DATA = Path(os.environ["PIXEL_YTCAST_DATA"])
URL, TOKEN = os.environ["PIXEL_YTCAST_URL"], os.environ.get("PIXEL_YTCAST_TOKEN", "")


def log(m):
    with open(DATA / "got.jsonl", "a") as f:
        f.write(json.dumps(m) + "\n")


async def stdin_closed():
    loop = asyncio.get_running_loop()
    r = asyncio.StreamReader()
    await loop.connect_read_pipe(lambda: asyncio.StreamReaderProtocol(r), sys.stdin)
    while await r.read(1024):
        pass
    os._exit(0)                                     # the server is gone: so are we


async def session(http, ctl_pos):
    async with http.ws_connect(URL) as ws:
        await ws.send_json({"type": "hello", "token": TOKEN, "v": 1})
        await ws.send_json({"type": "status", "status": "running"})
        await ws.send_json({"type": "pairing", "code": "123456789012"})

        async def reader():
            async for m in ws:
                if m.type == aiohttp.WSMsgType.TEXT:
                    log(json.loads(m.data))
            log({"closed": ws.close_code})
        task = asyncio.create_task(reader())
        ctl = DATA / "ctl.jsonl"
        try:
            while not task.done():
                await asyncio.sleep(0.1)
                lines = ctl.read_text().splitlines() if ctl.exists() else []
                for line in lines[ctl_pos[0]:]:
                    ctl_pos[0] += 1
                    m = json.loads(line)
                    if m.get("do") == "exit":
                        os._exit(int(m.get("code", 1)))
                    await ws.send_json(m)
        finally:
            task.cancel()


async def main():
    DATA.mkdir(parents=True, exist_ok=True)
    with open(DATA / "pids.txt", "a") as f:
        f.write(f"{os.getpid()}\n")
    gone = asyncio.create_task(stdin_closed())
    ctl_pos = [len((DATA / "ctl.jsonl").read_text().splitlines()) if (DATA / "ctl.jsonl").exists() else 0]   # only what comes after
    async with aiohttp.ClientSession() as http:
        while not gone.done():
            try:
                await session(http, ctl_pos)
            except (aiohttp.ClientError, OSError):
                await asyncio.sleep(0.5)
            await asyncio.sleep(0.2)


asyncio.run(main())
