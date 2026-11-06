"""Runs Pixel's Claude tool loop against a local fake Messages API (SSE), to check the request shape and the loop.

    python3 tests/test_claude_loop.py
"""
import asyncio
import json
import sys
import tempfile
from pathlib import Path

import anthropic
from aiohttp import web

APP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP))
import server  # noqa: E402
from pixel.claude import Claude  # noqa: E402
from pixel.hue import Hue  # noqa: E402
from pixel.state import Hub  # noqa: E402

seen, fails = [], []


def ok(name, cond, info=""):
    print(("OK   " if cond else "FAIL ") + name + (f"  [{info}]" if info and not cond else ""))
    if not cond:
        fails.append(name)


def sse(events):
    return "".join(f"event: {e['type']}\ndata: {json.dumps(e)}\n\n" for e in events)


def message(blocks, stop):
    ev = [{"type": "message_start", "message": {"id": "msg_x", "type": "message", "role": "assistant", "model": "claude-opus-5-5",
                                                "content": [], "stop_reason": None, "stop_sequence": None, "usage": {"input_tokens": 5, "output_tokens": 1}}}]
    for i, (start, delta) in enumerate(blocks):
        ev += [{"type": "content_block_start", "index": i, "content_block": start},
               {"type": "content_block_delta", "index": i, "delta": delta},
               {"type": "content_block_stop", "index": i}]
    ev += [{"type": "message_delta", "delta": {"stop_reason": stop, "stop_sequence": None}, "usage": {"output_tokens": 9}},
           {"type": "message_stop"}]
    return sse(ev)


def use(i, name, args):
    return ({"type": "tool_use", "id": f"toolu_{i}", "name": name, "input": {}}, {"type": "input_json_delta", "partial_json": json.dumps(args)})


def say(text):
    return ({"type": "text", "text": ""}, {"type": "text_delta", "text": text})


SCRIPT = [                     # what the fake API answers, request after request
    ([use(1, "set_lights", {"room": "Salon", "brightness": 40})], "tool_use"),
    ([say("C'est fait : le salon est à 40 %.")], "end_turn"),
    ([use(2, "set_theme", {"theme": "neon"}), use(3, "set_mood", {"mood": "excite"})], "tool_use"),
    ([say("Voilà, des néons !")], "end_turn"),
    ([use(4, "set_theme", {"theme": "pirate"})], "tool_use"),
    ([say("Ce thème n'existe pas.")], "end_turn"),
]


async def handler(request):
    body = await request.json()
    seen.append((dict(request.headers), body))
    blocks, stop = SCRIPT[min(len(seen), len(SCRIPT)) - 1]
    return web.Response(text=message(blocks, stop), content_type="text/event-stream")


async def main():
    app = web.Application()
    app.router.add_post("/v1/messages", handler)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)                 # any free port
    await site.start()
    port = site._server.sockets[0].getsockname()[1]

    datadir = Path(tempfile.mkdtemp())
    hub = Hub({}, demo=True)                 # demo lamps, real Claude loop below
    server.core_actions(hub, datadir)        # theme.set and friends, saved in datadir
    Hue(hub, {}, datadir)
    c = Claude(hub, {})
    c.anthropic = anthropic
    c.client = anthropic.AsyncAnthropic(api_key="test", base_url=f"http://127.0.0.1:{port}", max_retries=0)
    await c.send("baisse le salon à 40")

    h1, b1 = seen[0]
    ok("two requests (tool call, then answer)", len(seen) == 2, str(len(seen)))
    ok("model and effort", b1["model"] == "claude-opus-5-5" and b1["output_config"] == {"effort": "low"})
    ok("server-side fallback opted in", b1.get("fallbacks") == "default" and "server-side-fallback-2026-07-01" in h1.get("anthropic-beta", ""), h1.get("anthropic-beta"))
    ok("automatic prompt caching", b1.get("cache_control") == {"type": "ephemeral"})
    ok("tools stream their input", all(t.get("eager_input_streaming") for t in b1["tools"]))
    ok("no thinking parameter sent (adaptive by default)", "thinking" not in b1)
    b2 = seen[1][1]
    roles = [m["role"] for m in b2["messages"]]
    ok("history: user, assistant tool_use, user tool_result", roles == ["user", "assistant", "user"] and b2["messages"][2]["content"][0]["type"] == "tool_result", str(roles))
    ok("the tool really changed the lamp", hub.s["lights"]["rooms"][0]["bri"] == 40 and hub.s["lights"]["rooms"][0]["on"])
    ok("answer streamed to the screen", hub.s["chat"]["messages"][-1]["text"].strip() == "C'est fait : le salon est à 40 %.", hub.s["chat"]["messages"][-1]["text"])
    ok("history kept for the next question", len(c.history) == 4)
    ok("he looks happy after answering", hub.s["mood"]["name"] == "content", hub.s["mood"]["name"])

    await c.send("mets le thème néon et fais les yeux en étoiles")
    ok("Claude can switch to a new theme", hub.s["view"]["theme"] == "neon", hub.s["view"]["theme"])
    ok("the theme Claude picked is saved", json.loads((datadir / "ui.json").read_text())["theme"] == "neon")
    ok("the mood Claude picked stays after the answer", hub.s["mood"]["name"] == "excite", hub.s["mood"]["name"])
    tools = {t["name"]: t for t in b1["tools"]}
    ok("set_theme offers every theme", tools["set_theme"]["input_schema"]["properties"]["theme"]["enum"] == list(server.THEMES))

    await c.send("mets le thème pirate")
    res = seen[5][1]["messages"][-1]["content"][0]
    ok("an unknown theme is refused with an error result", res["type"] == "tool_result" and res.get("is_error") and hub.s["view"]["theme"] == "neon", str(res))
    await runner.cleanup()
    print("\n%d failure(s)" % len(fails))
    sys.exit(1 if fails else 0)


asyncio.run(main())
