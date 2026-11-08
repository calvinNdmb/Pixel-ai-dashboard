"""Claude through the owner's Claude subscription instead of an API key.

Claude Code's long-lived token (made with « claude setup-token », written in /etc/pixel.env as CLAUDE_CODE_OAUTH_TOKEN)
lets the Claude Agent SDK talk to Claude on the subscription's usage limits, the same limits as claude.ai and Claude Code.
The SDK runs Claude Code in the background:
- one client kept open (Claude Code, about 200 MB): it starts with the first message (8.5 s on the Pi 4 with a tool
  call), then about 3 s per answer, and the conversation is remembered until « chat.clear »;
- Pixel's own short system prompt and none of Claude Code's tools (no shell, no files, no web): only Pixel's tools,
  served in-process, with the same checks as with an API key (claude.py);
- the quota comes with every answer: a warning when it runs low; once it is used up, Pixel says when he is back and does
  not ask again until then.
The SDK is imported on the first message, so it costs nothing at startup.
"""
import asyncio
import datetime as dt
import importlib.util
import logging
import os

from .keys import THEMES

log = logging.getLogger("pixel.claude")
DAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
AUTH = ("Ton abonnement Claude refuse le jeton. Refais « claude setup-token » et remplace la ligne "
        "CLAUDE_CODE_OAUTH_TOKEN dans /etc/pixel.env.")
ERRORS = {"authentication_failed": AUTH,
          "billing_error": "Ton abonnement Claude a un souci de paiement : regarde sur claude.ai.",
          "server_error": "Claude est indisponible pour le moment. Réessaie plus tard.",
          "invalid_request": "Claude n'a pas compris la demande. Réessaie autrement."}


def wanted(cfg):
    """[claude] backend = "abonnement" or "api". By default: the subscription when there is a Claude Code token and no API key."""
    b = cfg.get("backend", "auto")
    if b in ("api", "abonnement"):
        return b == "abonnement"
    return bool(os.environ.get("CLAUDE_CODE_OAUTH_TOKEN")) and not os.environ.get("ANTHROPIC_API_KEY")


def back_at(ts, now=None):
    """When the quota comes back, said the way Pixel says it: « à 16 h 00 », « demain à 9 h 00 », « jeudi à 16 h 00 »."""
    t, now = dt.datetime.fromtimestamp(ts), now or dt.datetime.now()
    hm = f"{t.hour} h {t.minute:02d}"
    days = (t.date() - now.date()).days
    return f"à {hm}" if days <= 0 else f"demain à {hm}" if days == 1 else f"{DAYS[t.weekday()]} à {hm}"


class Abonnement:
    def __init__(self, owner, cfg):
        if importlib.util.find_spec("claude_agent_sdk") is None:
            raise ImportError("claude-agent-sdk n'est pas installé : relance sh deploy/install.sh")
        self.owner, self.hub = owner, owner.hub
        self.model = cfg.get("abonnement_model", "claude-sonnet-5-5")   # Pixel's answers are short: a lighter model makes the quota last
        self.effort = cfg.get("effort", "low")
        self.client, self.quota, self.warned = None, None, None

    async def _connect(self):
        import claude_agent_sdk as sdk
        from .claude import SYSTEM, check, tools_for
        run_tool = self.owner.run_tool

        def make(t):
            async def run(args):
                err = check(t["name"], args)
                if err:
                    return {"content": [{"type": "text", "text": err}], "is_error": True}
                try:
                    out = await run_tool(t["name"], args)
                except Exception as e:
                    return {"content": [{"type": "text", "text": str(e)}], "is_error": True}
                return {"content": [{"type": "text", "text": out}]}
            return sdk.tool(t["name"], t["description"], t["input_schema"])(run)

        tools = [make(t) for t in tools_for(self.hub.s["settings"].get("themes") or list(THEMES))]
        opts = sdk.ClaudeAgentOptions(
            system_prompt=SYSTEM, model=self.model, effort=self.effort, max_turns=8,
            tools=[],                                                   # none of Claude Code's own tools
            mcp_servers={"pixel": sdk.create_sdk_mcp_server("pixel", tools=tools)},
            allowed_tools=[f"mcp__pixel__{t.name}" for t in tools],
            permission_mode="dontAsk",                                  # anything not allowed above is refused, nobody is asked
            include_partial_messages=True,                              # the answer shows up while it is written
            setting_sources=[],                                         # no settings or CLAUDE.md read from the disk
        )
        client = sdk.ClaudeSDKClient(options=opts)
        await client.connect()
        self.client = client

    async def reset(self):
        """A new conversation next time: after « chat.clear », or after an error."""
        c, self.client = self.client, None
        if c:
            try:
                await asyncio.wait_for(c.disconnect(), 5)
            except Exception as e:
                log.debug("subscription disconnect: %s", e)

    async def ask(self, text):
        q = self.quota
        if q and q["status"] == "rejected" and (q["resets_at"] or 0) > dt.datetime.now().timestamp():
            return self._fail(self._tired(), "baille")                 # used up: Claude would refuse anyway
        try:
            await asyncio.wait_for(self._ask(text), 120)
        except asyncio.TimeoutError:
            await self.reset()
            self._fail("Claude met trop de temps à répondre. Réessaie.")
        except Exception as e:                                          # Claude Code stopped or the SDK failed: a new client next time
            log.warning("subscription: %r", e)
            await self.reset()
            self._fail("Je n'arrive pas à joindre Claude. Réessaie dans un moment.")

    async def _ask(self, text):
        if not self.client:
            await self._connect()
        await self.client.query(text)
        live, cur, error = set(), None, None    # live: the messages already shown piece by piece, not to show twice
        async for m in self.client.receive_response():
            kind = type(m).__name__
            if kind == "StreamEvent":
                ev = m.event or {}
                if ev.get("type") == "message_start":
                    cur = (ev.get("message") or {}).get("id")
                elif ev.get("type") == "content_block_delta" and (ev.get("delta") or {}).get("type") == "text_delta" and not error:
                    if cur not in live:
                        live.add(cur)
                        self._gap()
                    self.owner._say(ev["delta"]["text"])
            elif kind == "AssistantMessage":
                if m.error:
                    error = error or m.error
                elif m.message_id not in live:
                    said = "".join(getattr(b, "text", "") or "" for b in m.content)
                    if said.strip():
                        self._gap()
                        self.owner._say(said)
            elif kind == "RateLimitEvent":
                self._quota(m.rate_limit_info)
            elif kind == "ResultMessage" and m.is_error and not error:
                r = (m.result or "").lower()
                error = "rate_limit" if "limit" in r else "authentication_failed" if "login" in r or "auth" in r else "unknown"
                log.warning("subscription result: %s %s", m.subtype, m.result)
        if error:
            if error == "rate_limit":
                self._fail(self._tired(), "baille")
            else:
                self._fail(ERRORS.get(error, "Claude a eu un souci. Réessaie."))

    def _gap(self):
        """A space between two messages of one answer (before and after a tool), as with an API key."""
        last = self.owner.C["messages"][-1]["text"]
        if last and not last.endswith((" ", "\n")):
            self.owner._say(" ")

    def _quota(self, info):
        kind, raw = getattr(info, "rate_limit_type", None), getattr(info, "raw", None) or {}
        used = getattr(info, "utilization", None)
        if used is None:                                                # 0.2.x: only in the raw event
            used = ((raw.get("unifiedWindows") or {}).get(kind) or {}).get("utilization")
        q = {"status": getattr(info, "status", None), "type": kind, "resets_at": getattr(info, "resets_at", None), "used": used}
        if q != self.quota:
            log.info("Claude quota: %s", q)
        self.quota = self.owner.C["quota"] = q
        if q["status"] == "allowed_warning" and self.warned != (kind, q["resets_at"]):
            self.warned = (kind, q["resets_at"])
            self.hub.toast("Quota Claude presque épuisé" + (f" ({round(used * 100)} %)" if isinstance(used, (int, float)) else ""), 6000)

    def _tired(self):
        q = self.quota or {}
        if q.get("resets_at"):
            return f"Je n'ai plus de forces Claude pour le moment : je reviens {back_at(q['resets_at'])} !"
        return "Je n'ai plus de forces Claude pour le moment. Réessaie plus tard."

    def _fail(self, msg, mood="triste"):
        self.owner.end_mood = mood
        self.owner.C["messages"][-1]["text"] = msg
        self.hub.mark()
