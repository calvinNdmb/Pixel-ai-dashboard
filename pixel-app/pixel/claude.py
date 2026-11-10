"""Chat with Claude (typed on any keyboard). Claude can drive Pixel through tools."""
import asyncio
import datetime as dt
import json
import logging
import re

from .commands import norm
from . import anims, caractere, nourrir, scenes
from .abonnement import Abonnement, wanted
from .keys import MOODS, NAV, THEMES
from . import exos                    # start_exercise: a little math exercise on Pixel's screen
from . import souvenirs               # souvenirs: your birthday, a photo for his album, your mood (only if you allow it)
from . import amis                    # pixel_friends: his friends' Pixels (the list, a visit, a coucou)
from . import look                    # set_look: his eyes, colours and what he wears (pixel/look.py)
from . import habitudes               # habits: his schedule, a phrase to say, a game, a joke (pixel/habitudes.py)

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
                       "agenda d'aujourd'hui et de demain, minuteur, tâche Codex, ton ventre, les exos de maths du jour, tes souvenirs, "
                       "et tes habitudes (réveillé ou endormi, ton emploi du temps, tes jeux)."),
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
TOOLS.append(nourrir.TOOL)               # Nourrir: he eats a food of his menu (pixel/nourrir.py)
TOOLS.append(exos.TOOL)                     # pixel/exos.py: start_exercise
TOOLS.append(souvenirs.TOOL)                # pixel/souvenirs.py: souvenirs (birthday, photo, mood: the mood only if allowed)
TOOLS.append(amis.TOOL)                     # pixel/amis.py: pixel_friends (no free text, no new friend: the list, a visit, a coucou)
TOOLS.append(look.TOOL)                     # pixel/look.py: set_look
TOOLS.append(habitudes.TOOL)                # pixel/habitudes.py: habits

# ---- his character (pixel/caractere.py): Claude can change it when asked, and knows it (system_for below) ----
TOOLS.append(tool(
    "set_character", "Change ton propre caractère (celui de Pixel) quand la personne le demande : un caractère tout fait (preset), "
    "ou des traits de 0 à 100 (50 = ton caractère habituel), ton nom (nom), ou le surnom que tu lui donnes (surnom, vide : aucun). "
    "Les caractères : " + " ; ".join(f"{i} ({n} : {d})" for i, (n, d, _) in caractere.PRESETS.items()) + ". Les traits : "
    + ", ".join(f"{t} ({a} à {b})" for t, (a, b) in caractere.ENDS.items()) + ".",
    {"preset": {"type": "string", "enum": list(caractere.PRESETS)},
     "traits": {"type": "object", "properties": {t: {"type": "integer", "minimum": 0, "maximum": 100} for t in caractere.TRAITS}, "additionalProperties": False},
     "nom": {"type": "string", "maxLength": caractere.NOM_MAX}, "surnom": {"type": "string", "maxLength": caractere.SURNOM_MAX}}))


def system_for(hub):
    """The system prompt: Pixel's own (the cached prefix, unchanged), then his character of the moment in a block of its own."""
    note = caractere.describe(hub.s.get("caractere"))
    return [{"type": "text", "text": SYSTEM}, {"type": "text", "text": note}] if note else SYSTEM


def system_text(hub):
    """The same, as one string (the Claude Agent SDK, abonnement.py)."""
    note = caractere.describe(hub.s.get("caractere"))
    return SYSTEM + "\n" + note if note else SYSTEM


THEME_DESC = {"retro": "retro (écran vert des années 90)", "moderne": "moderne (yeux lumineux qui rebondissent)",
              "manga": "manga (grands yeux brillants)", "neon": "neon (nuit synthwave, néons roses et bleus)",
              "croquis": "croquis (dessin au crayon sur un cahier)", "lcd": "lcd (console de poche, quatre tons de vert)"}


def tools_for(themes):
    """The tools Claude gets: set_theme only offers the themes that are on, and is left out when there is only one."""
    out = []
    for t in TOOLS:
        if t["name"] == "set_theme":
            if len(themes) < 2:
                continue
            t = {**t, "description": "Change le style de l'écran de Pixel : " + ", ".join(THEME_DESC.get(i, i) for i in themes) + ".",
                 "input_schema": {**t["input_schema"], "properties": {"theme": {"type": "string", "enum": list(themes)}}}}
        out.append(t)
    return out


def check(name, a):
    """Validate a (possibly truncated) streamed tool input. Returns an error string or None."""
    if not isinstance(a, dict):
        return "entrée invalide"
    if name == nourrir.TOOL["name"]:
        return nourrir.check_tool(a)
    if name == souvenirs.TOOL["name"]:
        return souvenirs.check_tool(a)
    if name == amis.TOOL["name"]:
        return amis.check_tool(a)
    if name == look.TOOL["name"]:
        return look.check_tool(a)
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
        "set_character": caractere.tool_ok(a),
        "start_exercise": exos.check_tool(a),
        "habits": habitudes.check_tool(a),
    }.get(name)
    return None if ok else f"entrée invalide pour {name} : {json.dumps(a, ensure_ascii=False)}"


class Claude:
    def __init__(self, hub, cfg):
        self.hub, self.C = hub, hub.s["chat"]
        self.model = cfg.get("model", "claude-opus-5-5")
        self.effort = cfg.get("effort", "low")
        self.history, self.busy, self.client, self.end_mood = [], False, None, "content"
        self.sub, demo_why = None, "démo (pas de clé API)"   # sub: Claude through the owner's Claude subscription (abonnement.py)
        if not hub.demo and wanted(cfg):
            try:
                self.sub = Abonnement(self, cfg)
            except ImportError as e:        # the Agent SDK is missing: install.sh adds it once the token is in /etc/pixel.env
                log.warning("Claude subscription unavailable: %s", e)
                demo_why = "démo (relance deploy/install.sh)"
        elif not hub.demo:
            try:
                import anthropic
                self.anthropic = anthropic
                self.client = anthropic.AsyncAnthropic()
            except Exception as e:          # no credentials, or the package is missing
                log.warning("Claude unavailable: %s", e)
        self.C["status"] = "prêt (abonnement Claude)" if self.sub else "prêt" if self.client else demo_why

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
                if self.sub:
                    await self.sub.reset()                 # Claude forgets too

    # ---- tools ----
    def status(self):
        s = self.hub.s
        now = dt.datetime.now()
        return {"maintenant": now.strftime("%A %d %B %Y, %H:%M"), "lampes": s["lights"]["rooms"], "scenes": s["lights"]["scenes"],
                "meteo": s["weather"], "agenda": s["agenda"]["events"],
                "minuteur": {k: s["timer"][k] for k in ("mode", "running", "total")} | {"reste_s": round(self._timer_left())},
                "codex": {k: s["codex"][k] for k in ("task", "running", "status")}} | self._perso()

    def _perso(self):
        """His belly (pixel/nourrir.py) and the exercises (pixel/exos.py), when there: never an open exercise's answer."""
        out, h = {}, self.hub
        if getattr(h, "nourrir", None) is not None:
            d = (h.s.get("nourrir") or {}).get("dernier") or {}
            out["ventre"] = h.nourrir.status() + (f", dernier repas : {nourrir.BY_ID[d['plat']]['nom']}" if d.get("plat") in nourrir.BY_ID else "")
        if getattr(h, "exos", None) is not None:
            c = h.exos.cur
            out["exos"] = h.exos.summary() + (f" Un exo est ouvert sur ton écran ({c.get('type')}) : « {c.get('q')} ». Ne donne pas la réponse ; "
                                               "un indice si on te le demande." if c and c.get("etat") == "question" else "")
        if getattr(h, "souvenirs", None) is not None:      # pixel/souvenirs.py: the mood journal only if the person allowed it
            out["souvenirs"] = h.souvenirs.status()
        if getattr(h, "look", None) is not None:   # his look (pixel/look.py): what he looks like and wears now
            out["look"] = h.look.status()
        if getattr(h, "habitudes", None) is not None:           # his day and his games (pixel/habitudes.py); never his taught phrases
            out["habitudes"] = h.habitudes.summary()
        return out

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
            if a["theme"] not in (h.s["settings"].get("themes") or THEMES):
                return "ce thème n'est pas activé sur Pixel"
            await h.dispatch("theme.set", {"name": a["theme"]})
            return "ok"
        if name == "play_animation":
            await h.dispatch("anim.play", {"id": a["animation"]})
            return "ok"
        if name == "play_scene":
            await h.dispatch("scene.play", {"id": a["scene"]})
            return "ok"
        if name == nourrir.TOOL["name"]:
            return await nourrir.run_tool(h, a)
        if name == "run_codex":
            await h.dispatch("codex.run", {"task": a["task"]})
            return "tâche lancée : " + h.s["codex"]["status"]
        if name == "set_character":
            if "caractere" not in h.s:
                return "le caractère n'est pas disponible"
            await h.dispatch("caractere.set", {k: a[k] for k in ("preset", "traits", "nom", "surnom") if k in a})
            c = h.s["caractere"]
            return (f"ok : {caractere.PRESETS.get(c['preset'], ('sur mesure',))[0]}, tu t'appelles {c['nom']}"
                    + (f", tu l'appelles {c['surnom']}" if c["surnom"] else ""))
        if name == "start_exercise":
            return await exos.run_tool(h, a)
        if name == souvenirs.TOOL["name"]:
            return await souvenirs.run_tool(h, a)
        if name == amis.TOOL["name"]:
            return await amis.run_tool(h, a)
        if name == look.TOOL["name"]:
            return await look.run_tool(h, a)
        if name == habitudes.TOOL["name"]:
            return await habitudes.run_tool(h, a)
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
            await (self.sub.ask(text) if self.sub else self._real(text) if self.client else self._demo(text))
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
                        model=self.model, max_tokens=16000, system=system_for(self.hub), tools=tools_for(self.hub.s["settings"].get("themes") or list(THEMES)), messages=self.history,
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
