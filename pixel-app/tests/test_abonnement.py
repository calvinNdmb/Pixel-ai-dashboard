"""Pixel's Claude through the Claude subscription (pixel/abonnement.py), against a fake Claude Agent SDK.

    python3 tests/test_abonnement.py

The fake SDK records the options Pixel gives it, plays a script for each question, and calls Pixel's tools the way
Claude Code does (through the in-process MCP server). No network, no token.
"""
import asyncio
import datetime as dt
import importlib.machinery
import os
import sys
import tempfile
import time
import types
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP))
import server  # noqa: E402
from pixel import abonnement  # noqa: E402
from pixel.claude import SYSTEM, Claude  # noqa: E402
from pixel.hue import Hue  # noqa: E402
from pixel.state import Hub  # noqa: E402

fails = []


def ok(name, cond, info=""):
    print(("OK   " if cond else "FAIL ") + name + (f"  [{info}]" if info and not cond else ""))
    if not cond:
        fails.append(name)


# ---------- the fake claude_agent_sdk ----------
class Msg:
    def __init__(self, **kw):
        self.__dict__.update(kw)


def kind(name):
    return type(name, (Msg,), {})


StreamEvent, AssistantMessage, RateLimitEvent, ResultMessage, TextBlock = (
    kind(n) for n in ("StreamEvent", "AssistantMessage", "RateLimitEvent", "ResultMessage", "TextBlock"))


class Tool:
    def __init__(self, name, description, input_schema, handler):
        self.name, self.description, self.input_schema, self.handler = name, description, input_schema, handler


def tool(name, description, input_schema):
    return lambda handler: Tool(name, description, input_schema, handler)


def create_sdk_mcp_server(name, version="1.0.0", tools=None):
    return {"type": "sdk", "name": name, "tools": {t.name: t for t in tools or []}}


class ClaudeAgentOptions:
    def __init__(self, **kw):
        self.__dict__.update(kw)


SCRIPT, CLIENTS = [], []          # SCRIPT: one async generator function per question, (client, prompt) -> messages


class ClaudeSDKClient:
    def __init__(self, options):
        self.options, self.prompts, self.closed = options, [], False
        CLIENTS.append(self)

    async def connect(self):
        pass

    async def disconnect(self):
        self.closed = True

    async def query(self, prompt):
        self.prompts.append(prompt)

    async def receive_response(self):
        async for m in SCRIPT.pop(0)(self, self.prompts[-1]):
            yield m


sdk = types.ModuleType("claude_agent_sdk")
sdk.__spec__ = importlib.machinery.ModuleSpec("claude_agent_sdk", None)
for obj in (tool, create_sdk_mcp_server, ClaudeAgentOptions, ClaudeSDKClient):
    setattr(sdk, obj.__name__, obj)
sys.modules["claude_agent_sdk"] = sdk


# ---------- what Claude Code sends ----------
def said(msg_id, *parts):
    """A streamed message: message_start, the text in pieces, then the whole message (as Claude Code sends them)."""
    return ([StreamEvent(event={"type": "message_start", "message": {"id": msg_id}})]
            + [StreamEvent(event={"type": "content_block_delta", "delta": {"type": "text_delta", "text": p}}) for p in parts]
            + [AssistantMessage(content=[TextBlock(text="".join(parts))], error=None, message_id=msg_id)])


def limit(status, used, resets_at):
    return RateLimitEvent(rate_limit_info=Msg(status=status, resets_at=resets_at, rate_limit_type="five_hour", utilization=None,
                                              raw={"unifiedWindows": {"five_hour": {"utilization": used}}}))


def done(error=False, result=""):
    return ResultMessage(is_error=error, result=result, subtype="success")


TOOL_OUT = []


async def lamp_then_answer(client, prompt):
    yield limit("allowed", 0.1, time.time() + 3600)
    for m in said("m1", "Je ", "baisse."):
        yield m
    tools = client.options.mcp_servers["pixel"]["tools"]
    TOOL_OUT.append(await tools["set_lights"].handler({"room": "Salon", "brightness": 40}))
    TOOL_OUT.append(await tools["set_lights"].handler({"room": 3}))            # a wrong input: refused, nothing changes
    for m in said("m2", "C'est fait : salon à 40 %."):
        yield m
    yield done()


async def remembers(client, prompt):
    for m in said("m3", "Tu m'as demandé de baisser le salon."):
        yield m
    yield done()


async def warning(client, prompt):
    yield limit("allowed_warning", 0.85, time.time() + 3600)
    for m in said("m4", "Oui !"):
        yield m
    yield done()


TOMORROW_9 = dt.datetime.combine(dt.date.today() + dt.timedelta(days=1), dt.time(9, 0)).timestamp()


async def used_up(client, prompt):
    yield limit("rejected", 1.0, TOMORROW_9)
    yield AssistantMessage(content=[TextBlock(text="You've hit your session limit")], error="rate_limit", message_id="m5")
    yield done(True, "You've hit your session limit · resets 9am")


async def not_logged_in(client, prompt):
    yield done(True, "Not logged in · Please run /login")


async def crashes(client, prompt):
    raise RuntimeError("Claude Code stopped")
    yield                                                                        # an async generator all the same


async def main():
    # which way Pixel talks to Claude
    env = {k: os.environ.pop(k, None) for k in ("CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY")}
    os.environ["CLAUDE_CODE_OAUTH_TOKEN"] = "x"
    ok("token and no API key: the subscription", abonnement.wanted({}))
    os.environ["ANTHROPIC_API_KEY"] = "y"
    ok("token and API key: the API key wins", not abonnement.wanted({}))
    ok("backend = \"abonnement\" forces the subscription", abonnement.wanted({"backend": "abonnement"}))
    del os.environ["ANTHROPIC_API_KEY"]
    ok("backend = \"api\" forces the API key", not abonnement.wanted({"backend": "api"}))
    c0 = Claude(Hub({}, demo=False), {})
    ok("status shown in Réglages", c0.C["status"] == "prêt (abonnement Claude)", c0.C["status"])
    ok("nothing started before the first message", c0.sub and not CLIENTS)
    for k, v in env.items():
        os.environ.pop(k, None)
        if v is not None:
            os.environ[k] = v

    now = dt.datetime(2026, 11, 9, 14, 0)
    ok("back today", abonnement.back_at(dt.datetime(2026, 11, 9, 16, 0).timestamp(), now) == "à 16 h 00")
    ok("back tomorrow", abonnement.back_at(dt.datetime(2026, 11, 10, 9, 5).timestamp(), now) == "demain à 9 h 05")
    ok("back later in the week", abonnement.back_at(dt.datetime(2026, 11, 12, 16, 0).timestamp(), now) == "jeudi à 16 h 00")

    # a conversation, with Pixel's tools
    datadir = Path(tempfile.mkdtemp())
    hub = Hub({}, demo=True)                     # demo lamps, Rétro only (no [ui] themes)
    server.core_actions(hub, datadir)
    Hue(hub, {}, datadir)
    c = Claude(hub, {})
    c.sub = abonnement.Abonnement(c, {})
    SCRIPT.extend([lamp_then_answer, remembers])
    await c.send("baisse le salon à 40")
    o = CLIENTS[-1].options
    ok("Pixel's own system prompt", o.system_prompt == SYSTEM)
    ok("none of Claude Code's tools", o.tools == [])
    ok("Pixel's tools allowed, nothing else asked", o.permission_mode == "dontAsk" and "mcp__pixel__set_lights" in o.allowed_tools)
    ok("no theme tool with Rétro only", "mcp__pixel__set_theme" not in o.allowed_tools)
    ok("lighter model by default, low effort", o.model == "claude-sonnet-5-5" and o.effort == "low", f"{o.model} {o.effort}")
    ok("the answer appears while it is written", o.include_partial_messages is True)
    ok("no settings or CLAUDE.md from the disk", o.setting_sources == [])
    ok("the tool really changed the lamp", hub.s["lights"]["rooms"][0]["bri"] == 40 and hub.s["lights"]["rooms"][0]["on"])
    ok("a wrong tool input is refused", TOOL_OUT[1].get("is_error") and "invalide" in TOOL_OUT[1]["content"][0]["text"], str(TOOL_OUT[1]))
    ok("each message shown once, a space between them", hub.s["chat"]["messages"][-1]["text"] == "Je baisse. C'est fait : salon à 40 %.",
       hub.s["chat"]["messages"][-1]["text"])
    ok("quota kept (from the raw event)", hub.s["chat"]["quota"]["used"] == 0.1 and hub.s["chat"]["quota"]["status"] == "allowed")
    ok("he looks happy after answering", hub.s["mood"]["name"] == "content", hub.s["mood"]["name"])

    await c.send("qu'est-ce que je t'ai demandé ?")
    ok("same client for the next question (Claude remembers)", len(CLIENTS) == 1 and len(CLIENTS[0].prompts) == 2)

    await hub.dispatch("chat.clear")
    ok("« chat.clear » closes the conversation", CLIENTS[0].closed)
    SCRIPT.append(warning)
    await c.send("tu es là ?")
    ok("a new conversation after « chat.clear »", len(CLIENTS) == 2)
    ok("warning when the quota runs low", (hub.s["toast"] or {}).get("msg") == "Quota Claude presque épuisé (85 %)", str(hub.s["toast"]))

    SCRIPT.append(used_up)
    await c.send("raconte une blague")
    msg = hub.s["chat"]["messages"][-1]["text"]
    ok("quota used up: he says when he is back", msg == "Je n'ai plus de forces Claude pour le moment : je reviens demain à 9 h 00 !", msg)
    ok("and he yawns", hub.s["mood"]["name"] == "baille", hub.s["mood"]["name"])
    asked = len(CLIENTS[-1].prompts)
    await c.send("et maintenant ?")
    ok("no new question to Claude before the quota comes back", len(CLIENTS[-1].prompts) == asked and not SCRIPT)
    ok("the same answer, at once", hub.s["chat"]["messages"][-1]["text"] == msg)

    c.sub = abonnement.Abonnement(c, {})         # fresh quota
    SCRIPT.append(not_logged_in)
    await c.send("coucou")
    ok("refused token: how to fix it", hub.s["chat"]["messages"][-1]["text"] == abonnement.AUTH, hub.s["chat"]["messages"][-1]["text"])

    n = len(CLIENTS)
    SCRIPT.extend([crashes, remembers])
    await c.send("coucou")
    ok("Claude Code stops: a message, not a crash", "joindre Claude" in hub.s["chat"]["messages"][-1]["text"], hub.s["chat"]["messages"][-1]["text"])
    ok("and the client is dropped", CLIENTS[-1].closed and c.sub.client is None)
    await c.send("coucou")
    ok("a new client the next time", len(CLIENTS) == n + 1 and "salon" in hub.s["chat"]["messages"][-1]["text"])

    print("\n%d failure(s)" % len(fails))
    sys.exit(1 if fails else 0)


asyncio.run(main())
