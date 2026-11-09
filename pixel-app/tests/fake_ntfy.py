"""A fake ntfy relay for the tests of the friends (pixel/amis.py, pixel/relais.py): never the real ntfy.sh.

    python3 tests/fake_ntfy.py --port 8461          # for tests/test_amis.js (Ctrl+C or SIGTERM stops it)

The part of ntfy's HTTP API that Pixel uses: POST or PUT /{topic} publishes (the body, text, 4096 bytes at most: ntfy.sh turns
more into an attachment); GET /{t1},{t2}/json?since={unix s | all} streams one JSON object per line: "open", the cached
messages since then, every new one, and a "keepalive" now and then (poll=1: the cached ones, then the end). Messages are kept
`keep` seconds (ntfy.sh: 12 h). What it saw is kept for the tests: every published body (the relay must never see plain
text), every subscription. And faults on demand: cut every stream (cut()), refuse everything (offline), answer 429 (busy).
"""
import argparse
import asyncio
import json
import secrets
import signal
import time

from aiohttp import web


class FakeNtfy:
    def __init__(self, port, keepalive=20.0, keep=12 * 3600):
        self.port, self.keepalive, self.keep = port, keepalive, keep
        self.messages = []            # {"id", "time", "event", "topic", "message"}
        self.published = []           # (topic, body) as they came
        self.subscriptions = []       # (topics, since) of every GET
        self.streams = set()          # (queue, topics) of the open ones
        self.offline = False          # every request answered 503 (a relay that is down)
        self.busy = False             # publishing answered 429 (its rate limit)
        self.runner = None

    # ---------- the API ----------
    async def publish(self, request):
        if self.offline:
            raise web.HTTPServiceUnavailable()
        if self.busy:
            return web.json_response({"code": 42901, "http": 429, "error": "limit reached"}, status=429)
        topic = request.match_info["topic"]
        body = await request.read()
        if len(body) > 4096:
            return web.json_response({"error": "too large"}, status=413)
        text = body.decode("utf-8", "replace")
        m = {"id": secrets.token_hex(6), "time": int(time.time()), "event": "message", "topic": topic, "message": text}
        self.published.append((topic, text))
        self.messages.append(m)
        cutoff = time.time() - self.keep
        self.messages = [x for x in self.messages if x["time"] >= cutoff]
        for q, topics in list(self.streams):
            if topic in topics:
                q.put_nowait(m)
        return web.json_response(m)

    async def subscribe(self, request):
        if self.offline:
            raise web.HTTPServiceUnavailable()
        topics = set(request.match_info["topics"].split(","))
        since = request.query.get("since", "")
        self.subscriptions.append((sorted(topics), since))
        old = [m for m in self.messages if m["topic"] in topics and (since == "all" or (since.isdigit() and m["time"] >= int(since)))]
        resp = web.StreamResponse(headers={"Content-Type": "application/x-ndjson; charset=utf-8"})
        await resp.prepare(request)
        line = lambda m: (json.dumps(m) + "\n").encode()          # noqa: E731
        await resp.write(line({"id": secrets.token_hex(6), "time": int(time.time()), "event": "open", "topic": ",".join(sorted(topics))}))
        for m in old:
            await resp.write(line(m))
        if request.query.get("poll") == "1":
            return resp
        q = asyncio.Queue()
        entry = (q, frozenset(topics))
        self.streams.add(entry)
        try:
            while True:
                try:
                    m = await asyncio.wait_for(q.get(), self.keepalive)
                except asyncio.TimeoutError:
                    m = {"id": secrets.token_hex(6), "time": int(time.time()), "event": "keepalive", "topic": ",".join(sorted(topics))}
                if m is None:                         # cut()
                    break
                await resp.write(line(m))
        except (ConnectionResetError, asyncio.CancelledError):
            pass
        finally:
            self.streams.discard(entry)
        return resp

    # ---------- faults, for the tests ----------
    def cut(self):
        """Every open stream ends now (the client must reconnect, and miss nothing the relay keeps)."""
        for q, _ in list(self.streams):
            q.put_nowait(None)

    def bodies(self):
        return [b for _, b in self.published]

    # ---------- running ----------
    def app(self):
        app = web.Application()
        app.router.add_get(r"/{topics:[A-Za-z0-9_,-]+}/json", self.subscribe)
        app.router.add_post(r"/{topic:[A-Za-z0-9_-]{1,64}}", self.publish)
        app.router.add_put(r"/{topic:[A-Za-z0-9_-]{1,64}}", self.publish)
        return app

    async def start(self):
        self.runner = web.AppRunner(self.app(), handle_signals=False)
        await self.runner.setup()
        await web.TCPSite(self.runner, "127.0.0.1", self.port).start()
        return self

    async def stop(self):
        self.cut()
        if self.runner:
            await self.runner.cleanup()


async def main(port, keepalive):
    relay = await FakeNtfy(port, keepalive).start()
    print(f"fake ntfy on http://127.0.0.1:{port}", flush=True)
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for s in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(s, stop.set)
    await stop.wait()
    await relay.stop()


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Un faux relais ntfy, pour les tests des amis de Pixel")
    ap.add_argument("--port", type=int, default=8461)
    ap.add_argument("--keepalive", type=float, default=20.0)
    a = ap.parse_args()
    asyncio.run(main(a.port, a.keepalive))
