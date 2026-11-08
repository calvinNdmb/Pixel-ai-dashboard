"""Chat with Claude (typed on any keyboard). Claude can drive Pixel through tools."""
import asyncio
import datetime as dt
import json
import logging
import re

from .commands import norm
from . import anims, scenes
from .keys import MOODS, NAV, THEMES

log = logging.getLogger("pixel.claude")
SYSTEM = (
    "Tu es Pixel, un petit ordinateur de bureau rétro : un Raspberry Pi 4 dans un boîtier beige façon années 90, "
    "avec un écran tactile de 7 pouces et un Stream Deck en guise de clavier. Tu vis sur le bureau de la personne "
    "qui te parle. Réponds en français, en la tutoyant, en une à trois phrases courtes et sans Markdown : "
    "tes réponses s'affichent sur un petit écran.\n"
    "Tes outils agissent pour de vrai sur la maison et sur ton écran. Avant de parler des lampes, de la météo, "
    "de l'agenda ou du minuteur, lis-les avec get_status. Quand tu agis, dis simplement ce que tu as fait. "
    "Ne lance Codex que si on te le demande."
)


def tool(name, description, props=None, required=()):
    return {"name": name, "description": description, "eager_input_streaming": True,
            "input_schema": {"type": "object", "properties": props or {}, "required": list(required), "additionalProperties": False}}


TOOLS = [
    tool("get_status", "Lit l'état actuel : date et heure, lampes Hue par pièce, scènes, météo sur 5 jours, "
                       "agenda d'aujourd'hui et de demain, minuteur, tâche Codex."),
    tool("set_lights", "Allume, éteint ou règle une pièce Hue. room : nom de la pièce, ou \"*\" pour toutes. "
                       "brightness : 0 à 100 (0 éteint).",
         {"room": {"type": "string"}, "on": {"type": "boolean"}, "brightness": {"type": "integer", "minimum": 0, "maximum": 100}}, ["room"]),
    tool("recall_scene", "Active une scène Hue par son nom.", {"scene": {"type": "string"}}, ["scene"]),
    tool("start_timer", "Lance le minuteur pour un nombre de minutes.", {"minutes": {"type": "number", "minimum": 1, "maximum": 180}}, ["minutes"]),
    tool("show_screen", "Affiche un écran de Pixel.", {"screen": {"type": "string", "enum": NAV}}, ["screen"]),
    tool("set_mood", "Change l'expression du visage de Pixel pendant quelques secondes : content, surpris, amoureux, clin (clin d'œil), "
                     "endormi, triste, fache (fâché), confus, excite (des étoiles dans les yeux), fier (lunettes de soleil), malade, "
                     "baille (il bâille), reflechit, ecoute, neutre.", {"mood": {"type": "string", "enum": MOODS}}, ["mood"]),
    tool("set_theme", "Change le style de l'écran de Pixel : retro (écran vert des années 90), moderne (yeux lumineux qui rebondissent), "
                      "manga (grands yeux brillants), neon (nuit synthwave, néons roses et bleus), croquis (dessin au crayon sur un cahier) "
                      "ou lcd (console de poche, quatre tons de vert).",
         {"theme": {"type": "string", "enum": list(THEMES)}}, ["theme"]),
    tool("play_animation", "Joue une animation du visage de Pixel, une ou deux fois, puis il revient à son humeur. Les animations : "
                           + " ; ".join(f"{a['id']} ({a['label']})" for a in anims.ANIMS) + ".",
         {"animation": {"type": "string", "enum": anims.IDS}}, ["animation"]),
    tool("play_scene", "Fait vivre à Pixel un de ses petits moments de personnalité sur son visage : il nage comme un poisson, "
                       "fait la sieste, la toupie, boude… Les scènes : " + " ; ".join(f"{i} ({label})" for i, label, g in scenes.SCENES if g in ("vie", "tap", "fache", "calin")) + ".",
         {"scene": {"type": "string", "enum": [i for i, _, g in scenes.SCENES if g in ("vie", "tap", "fache", "calin")]}}, ["scene"]),
    tool("run_codex", "Lance une tâche de programmation avec Codex dans le dossier de projet configuré.", {"task": {"type": "string"}}, ["task"]),
]


def check(name, a):
    """Validate a (possibly truncated) streamed tool input. Returns an error string or None."""
    if not isinstance(a, dict):
        return "entrée invalide"
    ok = {
        "get_status": True,
        "set_lights": isinstance(a.get("room"), str) and isinstance(a.get("on", True), bool)
                      and (a.get("brightness") is None or (isinstance(a["brightness"], int) and 0 <= a["brightness"] <= 100)),
        "recall_scene": isinstance(a.get("scene"), str) and a["scene"],
        "start_timer": isinstance(a.get("minutes"), (int, float)) and 1 <= a["minutes"] <= 180,
        "show_screen": a.get("screen") in NAV,
        "set_mood": a.get("mood") in MOODS,
        "set_theme": a.get("theme") in THEMES,
        "play_animation": a.get("animation") in anims.BY_ID,
        "play_scene": a.get("scene") in scenes.BY_ID,
        "run_codex": isinstance(a.get("task"), str) and a["task"].strip(),
    }.get(name)
    return None if ok else f"entrée invalide pour {name} : {json.dumps(a, ensure_ascii=False)}"


class Claude:
    def __init__(self, hub, cfg):
        self.hub, self.C = hub, hub.s["chat"]
        self.model = cfg.get("model", "claude-opus-5-5")
        self.effort = cfg.get("effort", "low")
        self.history, self.busy, self.client, self.end_mood = [], False, None, "content"
        if not hub.demo:
            try:
                import anthropic
                self.anthropic = anthropic
                self.client = anthropic.AsyncAnthropic()
            except Exception as e:          # no credentials, or the package is missing
                log.warning("Claude unavailable: %s", e)
        self.C["status"] = "prêt" if self.client else "démo (pas de clé API)"

        @hub.action("chat.send")
        async def send(text):
            asyncio.ensure_future(self.send(str(text)[:2000]))

        @hub.action("chat.ask")
        async def ask(text):
            hub.s["screen"] = "claude"
            asyncio.ensure_future(self.send(str(text)[:2000]))

        @hub.action("chat.clear")
        async def clear():
            if not self.busy:
                self.history, self.C["messages"] = [], []

    # ---- tools ----
    def status(self):
        s = self.hub.s
        now = dt.datetime.now()
        return {"maintenant": now.strftime("%A %d %B %Y, %H:%M"), "lampes": s["lights"]["rooms"], "scenes": s["lights"]["scenes"],
                "meteo": s["weather"], "agenda": s["agenda"]["events"],
                "minuteur": {k: s["timer"][k] for k in ("mode", "running", "total")} | {"reste_s": round(self._timer_left())},
                "codex": {k: s["codex"][k] for k in ("task", "running", "status")}}

    def _timer_left(self):
        t = self.hub.s["timer"]
        return max(0, (t["ends_at"] / 1000 - dt.datetime.now().timestamp())) if t["running"] else t["left"]

    async def run_tool(self, name, a):
        h = self.hub
        if name == "get_status":
            return json.dumps(self.status(), ensure_ascii=False, default=str)
        if name == "set_lights":
            await h.dispatch("lights.set", {"room": a["room"], "on": a.get("on"), "bri": a.get("brightness")})
            return json.dumps(h.s["lights"]["rooms"], ensure_ascii=False)
        if name == "recall_scene":
            await h.dispatch("lights.scene", {"name": a["scene"]})
            return "ok"
        if name == "start_timer":
            await h.dispatch("timer.start", {"minutes": a["minutes"]})
            return "minuteur lancé"
        if name == "show_screen":
            h.s["screen"] = a["screen"]
            return "ok"
        if name == "set_mood":
            h.mood(a["mood"], 0 if a["mood"] == "endormi" else 3000)
            self.end_mood = a["mood"]                  # keep it once the answer is done
            return "ok"
        if name == "set_theme":
            await h.dispatch("theme.set", {"name": a["theme"]})
            return "ok"
        if name == "play_animation":
            await h.dispatch("anim.play", {"id": a["animation"]})
            return "ok"
        if name == "play_scene":
            await h.dispatch("scene.play", {"id": a["scene"]})
            return "ok"
        if name == "run_codex":
            await h.dispatch("codex.run", {"task": a["task"]})
            return "tâche lancée : " + h.s["codex"]["status"]
        return "outil inconnu"

    # ---- conversation ----
    def _say(self, text):
        self.C["messages"][-1]["text"] += text
        self.C["phase"] = "answer"
        self.hub.mark()

    async def send(self, text):
        if self.busy:
            return self.hub.toast("CLAUDE RÉPOND DÉJÀ")
        self.busy = True
        self.C["messages"] = (self.C["messages"] + [{"role": "user", "text": text}, {"role": "assistant", "text": ""}])[-30:]
        self.C["phase"] = "think"
        self.end_mood = "content"
        self.hub.mood("reflechit", 60000)
        try:
            await (self._real(text) if self.client else self._demo(text))
        finally:
            self.busy = False
            self.C["phase"] = "idle"
            if not self.C["messages"][-1]["text"]:
                self.C["messages"][-1]["text"] = "…"
            self.hub.mood(self.end_mood, 2000 if self.end_mood == "content" else 4000)

    async def _real(self, text):
        A = self.anthropic
        if len(self.history) > 60:                      # start a fresh conversation rather than editing the old one
            self.history = []
        start = len(self.history)
        self.history.append({"role": "user", "content": text})
        bad_json = 0
        try:
            for _ in range(10):
                try:
                    async with self.client.beta.messages.stream(
                        model=self.model, max_tokens=16000, system=SYSTEM, tools=TOOLS, messages=self.history,
                        output_config={"effort": self.effort}, cache_control={"type": "ephemeral"},
                        betas=["server-side-fallback-2026-07-01"], fallbacks="default",
                    ) as stream:
                        async for event in stream:
                            if event.type == "text":
                                self._say(event.text)
                        resp = await stream.get_final_message()
                    bad_json = 0
                except ValueError:                      # tool input JSON the SDK could not parse: re-issue the turn
                    bad_json += 1
                    if bad_json > 2:
                        raise
                    continue
                self.history.append({"role": "assistant", "content": resp.content})
                if resp.stop_reason == "pause_turn":
                    continue
                uses = [b for b in resp.content if b.type == "tool_use"]
                if resp.stop_reason == "refusal":
                    self.end_mood = "confus"
                    self._say(" (Je ne peux pas répondre à ça.)")
                    return
                if not uses:
                    return
                results = []
                for b in uses:
                    err = "réponse coupée, réessaie" if resp.stop_reason == "max_tokens" else check(b.name, b.input)
                    if err:
                        results.append({"type": "tool_result", "tool_use_id": b.id, "is_error": True, "content": err})
                        continue
                    try:
                        out = await self.run_tool(b.name, b.input)
                        results.append({"type": "tool_result", "tool_use_id": b.id, "content": out})
                    except Exception as e:
                        results.append({"type": "tool_result", "tool_use_id": b.id, "is_error": True, "content": str(e)})
                self.history.append({"role": "user", "content": results})
                if self.C["messages"][-1]["text"] and not self.C["messages"][-1]["text"].endswith((" ", "\n")):
                    self._say(" ")
        except A.AuthenticationError:
            self._fail(start, "Clé API refusée. Vérifie ANTHROPIC_API_KEY dans /etc/pixel.env.")
        except A.PermissionDeniedError:
            self._fail(start, "Cette clé API n'a pas accès à ce modèle.")
        except A.RateLimitError:
            self._fail(start, "Trop de demandes d'un coup : réessaie dans une minute.")
        except A.APIStatusError as e:
            self._fail(start, f"Erreur de l'API ({e.status_code}). Réessaie plus tard.")
        except A.APIConnectionError:
            self._fail(start, "Pas d'internet : je n'arrive pas à joindre Claude.")
        except ValueError:
            self._fail(start, "Réponse illisible, réessaie.")
        except TypeError as e:                         # the SDK found no API key or `ant auth login` profile
            if "authentication" not in str(e):
                raise
            del self.history[start:]
            self.client = None
            self.C["status"] = self.hub.s["settings"]["claude"] = "démo (pas de clé API)"
            await self._demo(text)

    def _fail(self, start, msg):
        del self.history[start:]                       # roll back to the last complete exchange
        self.end_mood = "triste"
        self.C["messages"][-1]["text"] = msg
        self.hub.mark()

    async def _demo(self, text):
        t, h = norm(text), self.hub
        await asyncio.sleep(1.0)
        m = re.search(r"(salon|bureau|chambre|cuisine)\D*(\d{1,3})", t)
        if "blague" in t:
            reply = "Tu sais pourquoi je ne bouge jamais la tête ? Pas de servos, pas de soucis."
            self.end_mood = "clin"
        elif "merci" in t:
            reply = "Avec plaisir, c'est toujours un bonheur de t'aider."
            self.end_mood = "amoureux"
        elif "bravo" in t:
            reply = "Merci ! Je suis assez fier de moi, je dois dire."
            self.end_mood = "fier"
        elif m:
            await h.dispatch("lights.set", {"room": m.group(1), "bri": int(m.group(2))})
            reply = f"C'est fait : {m.group(1)} à {m.group(2)} %."
        elif any(w in t for w in ("meteo", "temps", "pluie")) and h.s["weather"]:
            d = h.s["weather"]["days"][0]
            reply = f"Aujourd'hui : {d['label'].lower()}, entre {d['tmin']} et {d['tmax']} °C."
        elif any(w in t for w in ("agenda", "aujourd", "rendez", "demain")):
            ev = [e for e in h.s["agenda"]["events"] if e["day"] == 0]
            reply = "Aujourd'hui : " + ", ".join(f"{e['title']} à {int(e['start'])} h {round(e['start'] % 1 * 60):02d}" for e in ev) + "." if ev else "Rien de prévu aujourd'hui."
        else:
            reply = ("Je suis en mode démo. Ajoute une clé API Anthropic pour que Claude réponde vraiment. "
                     "En attendant, essaie « blague », « météo » ou « salon 40 ».")
        for ch in reply:
            self._say(ch)
            await asyncio.sleep(0.025)
