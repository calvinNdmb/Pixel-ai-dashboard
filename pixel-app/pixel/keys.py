"""Stream Deck layout: rows 1-2 open a screen, row 3 acts on the open screen."""
from .anims import SHOW

# id -> French name, in the order of the "Thème −" / "Thème +" keys (same ids as web/themes.js)
THEMES = {"retro": "Rétro", "moderne": "Moderne", "manga": "Manga", "neon": "Néon", "croquis": "Croquis", "lcd": "LCD"}
# the face: the user's animation pack (52 animations), or the living face
FACES = {"pack": "Pack 52", "vivant": "Vivant"}
# every face mood, in the order of the "Humeur +" key (same ids as window.PixelMoods in web/themes.js)
MOODS = ["neutre", "content", "surpris", "amoureux", "clin", "endormi", "reflechit", "ecoute",
         "triste", "fache", "confus", "excite", "fier", "malade", "baille"]
NAV = ["visage", "lumieres", "claude", "codex", "meteo", "minuteur", "agenda", "systeme", "reglages", "veille"]
NAMES = {"visage": "Visage", "lumieres": "Lumières", "claude": "Claude", "codex": "Codex", "meteo": "Météo",
         "minuteur": "Minuteur", "agenda": "Agenda", "systeme": "Système", "reglages": "Réglages", "veille": "Veille"}


def K(label, action, **args):
    return {"label": label, "action": action, "args": args}


def row3(screen, s):
    t = s["timer"]
    if screen == "visage":
        cur = s["mood"]["name"]          # the last mood shown, even if it is over: the key walks through every mood
        nxt = MOODS[(MOODS.index(cur) + 1) % len(MOODS)] if cur in MOODS else "content"
        last = (s.get("anim") or {}).get("id")      # the last animation played: the key walks through the 34 that are not idles
        anim = SHOW[(SHOW.index(last) + 1) % len(SHOW)] if last in SHOW else SHOW[0]
        return [K("Content", "mood.set", name="content", ms=2500), K("Surpris", "mood.set", name="surpris", ms=1800),
                K("Amoureux", "mood.set", name="amoureux", ms=3000), K("Anim +", "anim.play", id=anim),
                K("Humeur +", "mood.set", name=nxt, ms=0 if nxt == "endormi" else 4000)]
    if screen == "lumieres":
        scenes = [K(n[:9], "lights.scene", name=n) for n in s["lights"]["scenes"][:3]]
        return [K("Tout\nallumer", "lights.set", room="*", on=True), K("Tout\néteindre", "lights.set", room="*", on=False)] + scenes + [None] * (3 - len(scenes))
    if screen == "claude":
        return [K("Clavier", "view.toggle", key="osk"), K("Météo ?", "chat.send", text="Quel temps fait-il aujourd'hui ?"),
                K("Agenda ?", "chat.send", text="Qu'est-ce que j'ai aujourd'hui ?"), K("Blague", "chat.send", text="Raconte-moi une blague courte."),
                K("Effacer", "chat.clear")]
    if screen == "codex":
        return [K("Clavier", "view.toggle", key="osk"), K("Relancer", "codex.run"), K("Stop", "codex.stop"), K("Effacer", "codex.clear"), None]
    if screen == "meteo":
        return [K("Aujour-\nd'hui", "view.set", key="meteo_day", value=0), K("Jour −", "view.step", key="meteo_day", d=-1, hi=4),
                K("Jour +", "view.step", key="meteo_day", d=1, hi=4), K("°C / °F", "view.toggle", key="units_f"), K("Annoncer", "weather.say")]
    if screen == "minuteur":
        return [K("Pause" if t["running"] else "Démarrer", "timer.toggle"), K("+5 min", "timer.add", minutes=5),
                K("Remettre\nà zéro", "timer.reset"), K("Pause\ncafé", "timer.start", minutes=5, mode="PAUSE CAFÉ"), K("25 min", "timer.start", minutes=25)]
    if screen == "agenda":
        return [K("Aujour-\nd'hui", "view.set", key="agenda_day", value=0), K("Demain", "view.set", key="agenda_day", value=1),
                K("Actua-\nliser", "agenda.refresh"), None, K("Demander\nà Claude", "chat.ask", text="Qu'est-ce que j'ai aujourd'hui et demain ?")]
    if screen == "systeme":
        return [K("Lumi. −", "sys.bright", d=-0.1), K("Lumi. +", "sys.bright", d=0.1), K("Effet\nCRT", "view.toggle", key="crt_off"),
                K("Démar-\nrage", "sys.boot"), K("Veille", "screen.show", screen="veille")]
    if screen == "reglages":
        if len(s.get("settings", {}).get("themes") or THEMES) < 2:       # one theme only: the face and the CRT effect instead
            return [K("Associer\nHue", "lights.pair"), K("Clavier", "view.toggle", key="osk"), K("Effet\nCRT", "view.toggle", key="crt_off"),
                    K("Visage\nPack 52", "face.set", name="pack"), K("Visage\nVivant", "face.set", name="vivant")]
        name = THEMES.get(s["view"].get("theme"), "Rétro")
        return [K("Associer\nHue", "lights.pair"), K("Clavier", "view.toggle", key="osk"), K("Thème −", "theme.step", d=-1),
                K("Thème\n" + name, "theme.step", d=1), K("Thème +", "theme.step", d=1)]
    if screen == "veille":
        return [K("Réveiller", "screen.show", screen="visage"), None, None, None, None]
    return [None] * 5


# ---- an exercise open on his face (pixel/exos.py): the 15 keys answer it (pixel/deck.py) ----
DIGITS = "1234567890"
TYPED_MAX = 7


def wrap(label, width=9, lines=3):
    """A label cut in short lines for a key: « On ne sait pas » -> 3 lines."""
    out = []
    for w in str(label).replace("\u00a0", " ").split():
        if out and len(out[-1]) + 1 + len(w) <= width:
            out[-1] += " " + w
        else:
            out.append(w)
    return "\n".join(out[:lines])


def exo_pad(cur):
    """True when the answer can be typed on the keys: a whole number, not negative (the 4 answers are)."""
    ch = (cur or {}).get("choices") or []
    return bool(ch) and all(isinstance(c, str) and c.replace("\u00a0", "").isdigit() for c in ch)


def exo_keys(cur, typed=""):
    """The 15 keys while the exercise `cur` (the public one: never its answer before it is given) is open, or None.
    A key: None (empty) or {label, action, args, style}; style: num, choix, act, vu (what you typed), ok, ko.
    The actions deck.chiffre, deck.efface and deck.ok are the Stream Deck's own (the number being typed lives there).
    - a question whose answers are whole numbers: the digits on rows 1-2; row 3: what you typed, Effacer, OK, Indice, Fini;
    - any other question: the 4 answers and Indice on row 1; row 3: Passer, Fini;
    - its result: Juste ! or Raté, the right answer; row 3: Suivant (in a series) or Encore, Fini;
    - the summary of a series: the score; row 3: Encore, Fini."""
    if not isinstance(cur, dict) or not cur.get("id"):
        return None
    k, cid, etat = [None] * 15, cur["id"], cur.get("etat")
    key = lambda label, action, style="act", **args: {"label": label, "action": action, "args": args, "style": style}  # noqa: E731
    fini = key("Fini", "exos.stop")
    if etat == "question":
        hint = key("Indice", "exos.indice") if not cur.get("hint") and cur.get("mode") != "chrono" else None
        if exo_pad(cur):
            for i, d in enumerate(DIGITS):
                k[i] = key(d, "deck.chiffre", "num", d=d)
            k[10:15] = [key(typed or "?", None, "vu"), key("Effacer", "deck.efface"), key("OK", "deck.ok", "ok"), hint, fini]
        else:
            for i, c in enumerate((cur.get("choices") or [])[:4]):
                k[i] = key(wrap(c), "exos.repondre", "choix", value=c, id=cid)
            k[4] = hint
            k[13:15] = [key("Passer", "exos.passer", id=cid, etat=etat), fini]
    elif etat == "resultat":
        k[0] = key("Juste !", None, "ok") if cur.get("ok") else key("Raté…", None, "ko")
        k[1] = key(wrap(cur.get("answer", "")), None, "vu")
        more = cur.get("mode") in ("serie", "table") and cur.get("i", 0) < cur.get("n", 0)
        k[10] = key("Suivant", "exos.passer", "ok", id=cid, etat=etat) if more else key("Encore", "exos.encore", "ok")
        k[14] = fini
    elif etat == "bilan":
        k[0] = key(f"{cur.get('bons', 0)} / {cur.get('total', 0)}", None, "vu")
        k[10], k[14] = key("Encore", "exos.encore", "ok"), fini
    else:
        return None
    return k


def all_keys(s):
    return {"nav": [{"id": i, "label": NAMES[i]} for i in NAV], "row3": {scr: row3(scr, s) for scr in NAV}}
