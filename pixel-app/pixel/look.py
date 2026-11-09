"""His look (« Son look »): the shape and colour of his eyes, his cheeks, what he wears (a top hat, a cap, a bow tie, a
moustache, headphones…), the outfits of the seasons that come by themselves (a bonnet and a scarf in winter, sunglasses in
summer, Halloween, Christmas, New Year, his birthday), and his pyjama and nightcap at night.

Snapshot "look" (web/look.js draws it in the 6 themes, on the pack's face and the living face, on every screen):
    {"yeux": "rond", "couleur_yeux": "theme", "couleur_joues": "theme", "mono": False,
     "accessoires": {"tete": None, "yeux": None, "visage": None, "cou": None, "oreilles": None},   # what you chose, slot by slot
     "sans": {"tete": "2026-11-09"},          # a slot you emptied today (« enlève ton bonnet »): no season in it until tomorrow
     "saisons": True, "nuit": True,           # the outfits of the seasons; the pyjama at night
     "porte": {"tete", "yeux", "visage", "cou", "oreilles": what he wears now, "nuit": bool, "saison": str|None},
     "change": {"t0", "quoi", ...} or None,   # the last change: each screen plays his reaction once (web/scenes/look.js)
     "avant": 0}                              # how many changes « Remettre comme avant » can undo
The rules (the same in web/look.js; tests/test_look.py compares the two):
- What you choose comes first. The seasons only dress the slots you left empty, and not one you emptied today.
- The seasons: his birthday or the day you met (souvenirs.fete) or New Year (31 Dec - 1 Jan) a party hat; Christmas (20-26
  Dec) the Santa hat; Halloween (24-31 Oct) the pumpkin and the witch's hat, a day each; winter (Dec-Feb) the bonnet and a
  scarf; in the day (9 h - 20 h), in July and August or on a hot sunny day (25 °C or more), sunglasses (not over his own
  glasses). Off with "saisons": false.
- The night: while he sleeps (habitudes.dort, when his habits are there; else his quiet hours, caractère calme, 23 h - 6 h
  by default) and "nuit" is on, his nightcap and pyjama take the head and the neck, his sunglasses and headphones come off.
- Colours: in Rétro a colour phosphor, in LCD the palette of a colour pocket console; "mono": true keeps both screens green.
Actions: look.set {yeux?, couleur_yeux?, couleur_joues?, mono?, saisons?, nuit?, porte?, enleve?, tenue?, normal?} (all
validated, one undo step), look.porte {item}, look.enleve {item? or slot?} (nothing: everything), look.tenue {tenue},
look.reset (« look normal »), look.avant (« Remettre comme avant »). Saved in data_dir/look.json (a broken file, or values out
of place, give the default look). Typed commands (exact phrases) and Claude's set_look tool are below.
"""
import datetime as dt
import json
import logging
import math
import os
import re
import time
import unicodedata
from pathlib import Path

log = logging.getLogger("pixel.look")

# ---- the catalogue (the same ids, names and order in web/look.js) ----
SHAPES = {"rond": "Ronds", "carre": "Carrés", "amande": "En amande", "etoile": "Étoiles", "coeur": "Cœurs", "chat": "Yeux de chat",
          "lunettes": "Lunettes"}
COLORS = {"theme": ("Comme le thème", None), "bleu": ("Bleu", "#4f8cff"), "turquoise": ("Turquoise", "#2ee6d6"), "vert": ("Vert", "#49e06a"),
          "jaune": ("Jaune", "#ffd84a"), "orange": ("Orange", "#ff9a3c"), "rouge": ("Rouge", "#ff5252"), "rose": ("Rose", "#ff7fc8"),
          "violet": ("Violet", "#b07cff"), "marron": ("Marron", "#b97a45")}
EYE_COLORS = [*COLORS, "arc"]                    # « arc » : arc-en-ciel, a rainbow that moves gently (his eyes only)
CHEEK_COLORS = list(COLORS)
SLOTS = {"tete": "Sur la tête", "yeux": "Sur les yeux", "visage": "Sur le visage", "cou": "Au cou", "oreilles": "Sur les oreilles"}
ITEMS = {"chapeau": ("Chapeau haut-de-forme", "tete"), "casquette": ("Casquette", "tete"), "couronne": ("Couronne", "tete"),
         "antenne": ("Antennes", "tete"), "bonnet": ("Bonnet", "tete"), "fete": ("Chapeau de fête", "tete"),
         "sorciere": ("Chapeau de sorcière", "tete"), "citrouille": ("Citrouille", "tete"), "pere-noel": ("Bonnet de Père Noël", "tete"),
         "bonnet-nuit": ("Bonnet de nuit", "tete"), "lunettes-soleil": ("Lunettes de soleil", "yeux"), "moustache": ("Moustache", "visage"),
         "noeud": ("Nœud papillon", "cou"), "echarpe": ("Écharpe", "cou"), "pyjama": ("Pyjama", "cou"), "casque": ("Casque audio", "oreilles")}
# whole outfits (« habille-toi pour l'hiver »): what they put on, slot by slot (None: that slot is emptied)
TENUES = {"hiver": ("Pour l’hiver", {"tete": "bonnet", "cou": "echarpe"}), "ete": ("Pour l’été", {"tete": "casquette", "yeux": "lunettes-soleil"}),
          "halloween": ("Pour Halloween", {"tete": "sorciere"}), "noel": ("Pour Noël", {"tete": "pere-noel", "cou": "echarpe"}),
          "fete": ("Pour la fête", {"tete": "fete", "cou": "noeud"}), "chic": ("Très chic", {"tete": "chapeau", "cou": "noeud", "visage": "moustache"}),
          "roi": ("Le roi", {"tete": "couronne"}), "musique": ("Musique !", {"oreilles": "casque"}),
          "nuit": ("Pour dormir", {"tete": "bonnet-nuit", "cou": "pyjama", "yeux": None, "oreilles": None})}
SAISONS = {"anniversaire": "ton anniversaire", "rencontre": "le jour de votre rencontre", "nouvel-an": "le Nouvel An", "noel": "Noël",
           "halloween": "Halloween", "hiver": "l’hiver", "ete": "l’été"}
DEFAULT = {"yeux": "rond", "couleur_yeux": "theme", "couleur_joues": "theme", "mono": False,
           "accessoires": {s: None for s in SLOTS}, "sans": {}, "saisons": True, "nuit": True}
SAVED = tuple(DEFAULT)                          # what look.json keeps (with the undo list); "porte", "change", "avant": the screens'
HISTORY = 8                                     # « Remettre comme avant »: that many changes back
NIGHT = (23, 6)                                 # his quiet hours without a character (caractère calme)
HOT = 25                                        # °C: a sunny day that warm brings out the sunglasses
DAY_SUN = (9, 20)                               # the hours of the sunglasses


def now_ms():
    return time.time() * 1000


def _ymd(d):
    return f"{d.year:04d}-{d.month:02d}-{d.day:02d}"


def clean(d):
    """A complete, valid look from anything (the saved file, a request): every bad field gets its default."""
    d = d if isinstance(d, dict) else {}
    out = json.loads(json.dumps(DEFAULT))
    if d.get("yeux") in SHAPES:
        out["yeux"] = d["yeux"]
    if d.get("couleur_yeux") in EYE_COLORS:
        out["couleur_yeux"] = d["couleur_yeux"]
    if d.get("couleur_joues") in CHEEK_COLORS:
        out["couleur_joues"] = d["couleur_joues"]
    for k in ("mono", "saisons", "nuit"):
        if isinstance(d.get(k), bool):
            out[k] = d[k]
    ac = d.get("accessoires") if isinstance(d.get("accessoires"), dict) else {}
    for s in SLOTS:
        it = ac.get(s)
        if isinstance(it, str) and it in ITEMS and ITEMS[it][1] == s:
            out["accessoires"][s] = it
    sans = d.get("sans") if isinstance(d.get("sans"), dict) else {}
    for s in SLOTS:
        v = sans.get(s)
        if isinstance(v, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
            out["sans"][s] = v
    return out


def is_default(look):
    return all(look.get(k) == DEFAULT[k] for k in ("yeux", "couleur_yeux", "couleur_joues", "accessoires"))


# ---- what he wears now: your choices, then the season, then the night ----
def is_night(d, dort=None, calme=None):
    """Asleep: his habits say so (habitudes.dort), else his quiet hours (caractère calme {de, a}, 23 h - 6 h by default)."""
    if isinstance(dort, bool):
        return dort
    de, a = NIGHT
    if isinstance(calme, dict):
        de = calme.get("de", de) if isinstance(calme.get("de"), int) and not isinstance(calme.get("de"), bool) else de
        a = calme.get("a", a) if isinstance(calme.get("a"), int) and not isinstance(calme.get("a"), bool) else a
    if de == a:
        return False
    h = d.hour
    return (h >= de or h < a) if de > a else (de <= h < a)


def hot_sun(meteo):
    """A sunny day, warm enough for sunglasses (the weather's "now", or today's high)."""
    if not isinstance(meteo, dict):
        return False
    now = meteo.get("now") if isinstance(meteo.get("now"), dict) else {}
    days = meteo.get("days") if isinstance(meteo.get("days"), list) else []
    today = days[0] if days and isinstance(days[0], dict) else {}
    num = lambda v: isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)  # noqa: E731
    warm = (num(now.get("t")) and now["t"] >= HOT) or (num(today.get("tmax")) and today["tmax"] >= HOT)
    return now.get("kind") == "soleil" and bool(warm)


def season(d, meteo=None, fete=None):
    """The season's outfit at that moment: ({slot: item}, its name or None)."""
    m, j, h = d.month, d.day, d.hour
    out, name = {}, None
    if fete in ("anniversaire", "rencontre"):
        out["tete"], name = "fete", fete
    elif (m == 12 and j == 31) or (m == 1 and j == 1):
        out["tete"], name = "fete", "nouvel-an"
    elif m == 12 and 20 <= j <= 26:
        out["tete"], name = "pere-noel", "noel"
    elif m == 10 and 24 <= j <= 31:
        out["tete"], name = ("citrouille" if j % 2 else "sorciere"), "halloween"
    if m in (12, 1, 2):
        out.setdefault("tete", "bonnet")
        out["cou"] = "echarpe"
        name = name or "hiver"
    if DAY_SUN[0] <= h < DAY_SUN[1] and (m in (7, 8) or hot_sun(meteo)):
        out["yeux"] = "lunettes-soleil"
        name = name or "ete"
    return out, name


def resolve(look, ctx):
    """What he wears now: {slot: item or None, "nuit": bool, "saison": name or None}. ctx: date (a local datetime), meteo (the
    snapshot's weather), fete (souvenirs.fete), dort (habitudes.dort), calme (caractère calme)."""
    d = ctx.get("date") or dt.datetime.now()
    today = _ymd(d)
    ac = look.get("accessoires") or {}
    wear = {s: ac.get(s) for s in SLOTS}
    bare = {s for s, v in (look.get("sans") or {}).items() if v == today}
    saison = None
    if look.get("saisons", True):
        items, name = season(d, ctx.get("meteo"), ctx.get("fete"))
        if look.get("yeux") == "lunettes":
            items.pop("yeux", None)                  # not over his own glasses
        for s, it in items.items():
            if not wear.get(s) and s not in bare:
                wear[s] = it
                saison = name
    nuit = bool(look.get("nuit", True)) and is_night(d, ctx.get("dort"), ctx.get("calme"))
    if nuit:
        wear.update(tete="bonnet-nuit", cou="pyjama", yeux=None, oreilles=None)
    return {**wear, "nuit": nuit, "saison": saison if not nuit else None}


def context(hub, d=None):
    """resolve()'s ctx from the hub's state (the other features are read defensively: they may not be there)."""
    s = hub.s
    hab, sou, car = s.get("habitudes"), s.get("souvenirs"), s.get("caractere")
    return {"date": d or dt.datetime.now(), "meteo": s.get("weather"),
            "fete": sou.get("fete") if isinstance(sou, dict) else None,
            "dort": hab.get("dort") if isinstance(hab, dict) and isinstance(hab.get("dort"), bool) else None,
            "calme": car.get("calme") if isinstance(car, dict) else None}


# ---- changes ----
def _items(v):
    """One item id or a list of them, as a list of valid ids (anything else dropped)."""
    v = v if isinstance(v, list) else [v]
    return [x for x in v[:8] if isinstance(x, str) and x in ITEMS]


def apply(look, args, today=None):
    """A new look from look.set's arguments: (new, change) with change None when nothing moved. today: "YYYY-MM-DD"."""
    today = today or _ymd(dt.datetime.now())
    new, quoi, extra = json.loads(json.dumps(look)), [], {}
    new["sans"] = {s: v for s, v in (new.get("sans") or {}).items() if v == today}      # yesterday's bare slots: the season may come back
    ac, sans = new["accessoires"], new["sans"]
    if args.get("normal") is True:                   # « look normal »: his eyes, colours and clothes of every day (the switches stay)
        base = json.loads(json.dumps(DEFAULT))
        for k in ("yeux", "couleur_yeux", "couleur_joues", "accessoires", "sans"):
            new[k] = base[k]
        ac, sans = new["accessoires"], new["sans"]
        quoi.append("normal")
    t = args.get("tenue")
    if isinstance(t, str) and t in TENUES:
        for s, it in TENUES[t][1].items():
            ac[s] = it
            if it is None:
                sans[s] = today
            else:
                sans.pop(s, None)
        quoi.append("tenue")
        extra["tenue"] = t
    off = args.get("enleve")
    if off is not None:
        offs = (off if isinstance(off, list) else [off])[:8]
        if "tout" in offs:
            for s in SLOTS:
                ac[s] = None
                sans[s] = today
            if new["yeux"] == "lunettes":
                new["yeux"] = "rond"
            quoi.append("enleve")
            extra["item"] = "tout"
        else:
            for x in offs:
                if not isinstance(x, str):
                    continue
                if x == "lunettes" and new["yeux"] == "lunettes":       # « enlève tes lunettes »: his own glasses
                    new["yeux"] = "rond"
                    quoi.append("enleve")
                    extra["item"] = "lunettes"
                    continue
                s = ITEMS[x][1] if x in ITEMS else x if x in SLOTS else None
                if s:
                    ac[s] = None
                    sans[s] = today
                    quoi.append("enleve")
                    extra["item"], extra["slot"] = (x if x in ITEMS else None), s
    for it in _items(args.get("porte")):
        s = ITEMS[it][1]
        ac[s] = it
        sans.pop(s, None)
        if it == "lunettes-soleil" and new["yeux"] == "lunettes":
            new["yeux"] = "rond"                     # sunglasses instead of his own glasses
        quoi.append("porte")
        extra["item"], extra["slot"] = it, s
    if isinstance(args.get("yeux"), str) and args["yeux"] in SHAPES:
        if args["yeux"] == "lunettes" and ac.get("yeux") == "lunettes-soleil":
            ac["yeux"] = None                        # his own glasses instead of the sunglasses
        new["yeux"] = args["yeux"]
        quoi.append("yeux")
        extra["yeux"] = new["yeux"]
    for k, allowed in (("couleur_yeux", EYE_COLORS), ("couleur_joues", CHEEK_COLORS)):
        if isinstance(args.get(k), str) and args[k] in allowed:
            new[k] = args[k]
            quoi.append("couleur")
            extra["couleur"], extra["ou"] = args[k], ("yeux" if k == "couleur_yeux" else "joues")
    for k in ("mono", "saisons", "nuit"):
        if isinstance(args.get(k), bool) and args[k] != new[k]:
            new[k] = args[k]
            quoi.append("reglage")
            extra["what"], extra["value"] = k, args[k]
    new = clean(new)
    if not quoi or {k: new[k] for k in SAVED} == {k: look.get(k) for k in SAVED}:
        return new, None
    first = next(q for q in ("normal", "tenue", "porte", "enleve", "yeux", "couleur", "reglage") if q in quoi)
    keep = {"normal": (), "tenue": ("tenue",), "porte": ("item", "slot"), "enleve": ("item", "slot"), "yeux": ("yeux",),
            "couleur": ("couleur", "ou"), "reglage": ("what", "value")}[first]
    return new, {"quoi": first, **{k: extra[k] for k in keep if k in extra}}


# ---- words (for Claude, the toasts, the commands) ----
def item_name(item):
    return ITEMS[item][0] if item in ITEMS else ""


def _article(item):
    n = item_name(item).lower()
    fem = item in ("casquette", "couronne", "citrouille", "moustache", "echarpe")
    plural = item in ("antenne", "lunettes-soleil")
    return ("des " if plural else "une " if fem else "un ") + n


# colour words agreeing with « des yeux » (masculine plural) and « les joues » (feminine plural)
EYES_ADJ = {"bleu": "bleus", "turquoise": "turquoise", "vert": "verts", "jaune": "jaunes", "orange": "orange", "rouge": "rouges",
            "rose": "roses", "violet": "violets", "marron": "marron", "arc": "arc-en-ciel"}
CHEEKS_ADJ = {"bleu": "bleues", "turquoise": "turquoise", "vert": "vertes", "jaune": "jaunes", "orange": "orange", "rouge": "rouges",
              "rose": "roses", "violet": "violettes", "marron": "marron"}
SHAPE_WORDS_OUT = {"rond": "ronds", "carre": "carrés", "amande": "en amande", "etoile": "en étoile", "coeur": "en cœur", "chat": "de chat",
                   "lunettes": "ronds, avec des lunettes"}


def describe(look, porte=None, il=False):
    """A few French words about his look: for Claude (« Tu as… »), or about him (il: « Il a… », the toast of « look ? »)."""
    look = clean(look)
    a, p, n = ("Il a", "Il porte", "Il ne porte") if il else ("Tu as", "Tu portes", "Tu ne portes")
    shape, ce = look["yeux"], look["couleur_yeux"]
    eyes = "des yeux " + SHAPE_WORDS_OUT[shape] + ("" if ce == "theme" else (", " if shape == "lunettes" else " ") + EYES_ADJ[ce])
    parts = [eyes] + ([f"les joues {CHEEKS_ADJ[look['couleur_joues']]}"] if look["couleur_joues"] != "theme" else [])
    porte = porte if isinstance(porte, dict) else resolve(look, {"date": dt.datetime.now()})
    worn = [it for s in SLOTS if isinstance(it := porte.get(s), str) and it in ITEMS]
    mine = [it for it in worn if look["accessoires"].get(ITEMS[it][1]) == it]
    out = f"{a} " + " et ".join(parts) + "."
    if worn:
        why = " pour dormir" if porte.get("nuit") else (f" ({SAISONS.get(porte.get('saison'), 'la saison')})" if porte.get("saison") and len(mine) < len(worn) else "")
        out += f" {p} " + ", ".join(_article(it) for it in worn) + why + "."
    else:
        out += f" {n} rien de spécial."
    return out


# ---- typed commands (pixel/commands.py hands them over before Claude): exact phrases only ----
def norm(s):
    s = unicodedata.normalize("NFD", str(s).lower().strip())
    return "".join(c for c in s if unicodedata.category(c) != "Mn").replace("’", "'").replace("œ", "oe")


ITEM_WORDS = {"chapeau": "chapeau", "chapeau haut de forme": "chapeau", "haut de forme": "chapeau", "haut-de-forme": "chapeau",
              "chapeau haut-de-forme": "chapeau", "casquette": "casquette", "couronne": "couronne", "couronne de roi": "couronne",
              "antenne": "antenne", "antennes": "antenne", "bonnet": "bonnet", "bonnet d'hiver": "bonnet", "bonnet de laine": "bonnet",
              "chapeau de fete": "fete", "chapeau pointu": "fete", "chapeau d'anniversaire": "fete", "chapeau de sorciere": "sorciere",
              "chapeau de sorcier": "sorciere", "citrouille": "citrouille", "bonnet de pere noel": "pere-noel", "bonnet de noel": "pere-noel",
              "chapeau de pere noel": "pere-noel", "chapeau de noel": "pere-noel", "bonnet du pere noel": "pere-noel",
              "bonnet de nuit": "bonnet-nuit", "lunettes de soleil": "lunettes-soleil", "lunettes noires": "lunettes-soleil",
              "moustache": "moustache", "moustaches": "moustache", "fausse moustache": "moustache", "noeud papillon": "noeud",
              "noeud pap": "noeud", "noeud": "noeud", "papillon": "noeud", "echarpe": "echarpe", "pyjama": "pyjama", "casque": "casque",
              "casque audio": "casque", "casque de musique": "casque"}
SHAPE_WORDS = {"ronds": "rond", "rond": "rond", "normaux": "rond", "carres": "carre", "carre": "carre", "en amande": "amande",
               "en amandes": "amande", "d'amande": "amande", "en etoile": "etoile", "en etoiles": "etoile", "etoiles": "etoile",
               "etoile": "etoile", "en coeur": "coeur", "en coeurs": "coeur", "coeur": "coeur", "de chat": "chat", "de chats": "chat"}
COLOR_WORDS = {"bleu": "bleu", "bleus": "bleu", "bleue": "bleu", "bleues": "bleu", "turquoise": "turquoise", "turquoises": "turquoise",
               "vert": "vert", "verts": "vert", "verte": "vert", "vertes": "vert", "jaune": "jaune", "jaunes": "jaune", "orange": "orange",
               "oranges": "orange", "rouge": "rouge", "rouges": "rouge", "rose": "rose", "roses": "rose", "violet": "violet",
               "violets": "violet", "violette": "violet", "violettes": "violet", "marron": "marron", "marrons": "marron",
               "arc-en-ciel": "arc", "arc en ciel": "arc", "normaux": "theme", "normales": "theme", "comme d'habitude": "theme",
               "comme avant": "theme"}
TENUE_WORDS = {"l'hiver": "hiver", "hiver": "hiver", "le froid": "hiver", "l'ete": "ete", "ete": "ete", "la plage": "ete",
               "halloween": "halloween", "noel": "noel", "la fete": "fete", "une fete": "fete", "ton anniversaire": "fete",
               "un anniversaire": "fete", "la nuit": "nuit", "dormir": "nuit", "aller dormir": "nuit", "aller au lit": "nuit"}
_DET = r"(?:ton |ta |tes |un |une |le |la |les |des |son |sa |ses |l')?"
_PUT = re.compile(r"^(?:pixel[, ]+)?(?:mets|met|mettre|enfile|porte|remets)(?:[- ]toi)?\s+" + _DET + r"(.+?)$")
_OFF = re.compile(r"^(?:pixel[, ]+)?(?:enleve|enlever|retire|retirer|ote|oter)\s+" + _DET + r"(.+?)$")
_ALL = re.compile(r"^(?:pixel[, ]+)?(?:enleve|retire|ote) (?:tout|tous tes accessoires|tes accessoires|tes habits|ton deguisement)$|^deshabille[- ]toi$")
_EYES = re.compile(r"^(?:(?:mets|prends|fais)(?:[- ]toi)? )?(?:des |tes )?yeux (.+?)$")
_CHEEKS = re.compile(r"^(?:(?:mets|prends|fais)(?:[- ]toi)? )?(?:des |tes )?joues (.+?)$")
_DRESS = re.compile(r"^(?:habille[- ]toi|mets ta tenue|deguise[- ]toi) (?:pour |d'|de |en )?(.+?)$")
NORMAL = ("look normal", "ton look normal", "look de tous les jours", "look par defaut", "remets ton look normal", "reprends ton look normal",
          "look normal stp", "redeviens normal")
AVANT = ("remets comme avant", "remets-toi comme avant", "remets ton look comme avant", "comme avant", "annule ton look", "reviens comme avant")
ASK = ("look", "ton look", "look ?", "ton look ?", "c'est quoi ton look", "c'est quoi ton look ?")


def command(hub, t, raw=""):
    """« mets ton chapeau », « enlève ton chapeau », « enlève tout », « yeux de chat », « yeux bleus », « joues roses »,
    « arc-en-ciel », « look normal », « habille-toi pour l'hiver »… → (action, args) for look.set, or ("toast", text), or None
    (anything else, or a phrase that would change nothing: Claude answers, as before)."""
    t = re.sub(r"\s+(?:s'il te plait|s il te plait|stp|svp)$", "", re.sub(r"[\s!.…]+$", "", norm(t))).strip()
    look = clean(hub.s.get("look") if isinstance(hub.s.get("look"), dict) else {})
    args = None
    if t in ASK:
        return ("toast", describe(look, (hub.s.get("look") or {}).get("porte"), il=True) + " Tape « mets ton chapeau », « yeux de chat », « joues roses », « look normal »…")
    if t in NORMAL:
        args = {"normal": True}
    elif t in AVANT:
        return ("avant", {}) if (hub.s.get("look") or {}).get("avant") else None
    elif t in ("arc-en-ciel", "arc en ciel", "yeux arc-en-ciel", "des yeux arc-en-ciel"):
        args = {"couleur_yeux": "arc"}
    elif _ALL.match(t):
        args = {"enleve": "tout"}
    elif (m := _DRESS.match(t)) and m.group(1) in TENUE_WORDS:
        args = {"tenue": TENUE_WORDS[m.group(1)]}
    elif (m := _EYES.match(t)) and (m.group(1) in SHAPE_WORDS or m.group(1) in COLOR_WORDS):
        w = m.group(1)
        args = {"yeux": SHAPE_WORDS[w]} if w in SHAPE_WORDS and w != "normaux" else {"couleur_yeux": COLOR_WORDS[w]}
        if w == "normaux":
            args = {"yeux": "rond", "couleur_yeux": "theme"}
    elif (m := _CHEEKS.match(t)) and m.group(1) in COLOR_WORDS and COLOR_WORDS[m.group(1)] != "arc":
        args = {"couleur_joues": COLOR_WORDS[m.group(1)]}
    elif (m := _PUT.match(t)) and (m.group(1) in ITEM_WORDS or m.group(1) == "lunettes"):
        args = {"yeux": "lunettes"} if m.group(1) == "lunettes" else {"porte": ITEM_WORDS[m.group(1)]}
    elif (m := _OFF.match(t)) and (m.group(1) in ITEM_WORDS or m.group(1) == "lunettes"):
        w = m.group(1)
        if w == "lunettes":                          # his own glasses, or else his sunglasses
            args = {"enleve": "lunettes"} if look["yeux"] == "lunettes" else {"enleve": "lunettes-soleil"}
        else:
            it = ITEM_WORDS[w]
            porte = (hub.s.get("look") or {}).get("porte") or {}
            if porte.get(ITEMS[it][1]) == it or look["accessoires"].get(ITEMS[it][1]) == it:
                args = {"enleve": it}
            elif w in ("chapeau", "bonnet") and porte.get("tete"):
                args = {"enleve": "tete"}           # « enlève ton chapeau » while he wears another hat: off it comes
    if not args:
        return None
    _, change = apply(look, args)
    return ("set", args) if change else None


async def run_command(hub, t, raw=""):
    """True when the text was one of his (and did something)."""
    if getattr(hub, "look", None) is None:
        return False
    r = command(hub, t, raw)
    if not r:
        return False
    kind, x = r
    if kind == "toast":
        hub.toast(x, 12000)
    elif kind == "avant":
        await hub.dispatch("look.avant")
    else:
        await hub.dispatch("look.set", x)
    return True


# ---- Claude (pixel/claude.py adds TOOL to its tools, asks check_tool() and run_tool(), and reads describe() in get_status) ----
TOOL = {"name": "set_look", "eager_input_streaming": True,
        "description": "Change ton look (celui de Pixel, sur ton écran) quand la personne le demande : la forme de tes yeux (yeux), leur "
                       "couleur (couleur_yeux, « arc » : arc-en-ciel), la couleur de tes joues (couleur_joues), des accessoires à mettre "
                       "(porte) ou à enlever (enleve, « tout » : tout enlever), une tenue complète (tenue), ou ton look de tous les jours "
                       "(normal : true). Ce que la personne choisit passe avant les tenues de saison. Formes : "
                       + ", ".join(f"{k} ({v})" for k, v in SHAPES.items()) + ". Couleurs : " + ", ".join(EYE_COLORS) + ". Accessoires : "
                       + ", ".join(f"{k} ({v[0]})" for k, v in ITEMS.items()) + ". Tenues : " + ", ".join(f"{k} ({v[0]})" for k, v in TENUES.items()) + ".",
        "input_schema": {"type": "object", "properties": {
            "yeux": {"type": "string", "enum": list(SHAPES)}, "couleur_yeux": {"type": "string", "enum": EYE_COLORS},
            "couleur_joues": {"type": "string", "enum": CHEEK_COLORS},
            "porte": {"type": "array", "items": {"type": "string", "enum": list(ITEMS)}, "maxItems": 5},
            "enleve": {"type": "array", "items": {"type": "string", "enum": [*ITEMS, "lunettes", "tout"]}, "maxItems": 6},
            "tenue": {"type": "string", "enum": list(TENUES)}, "normal": {"type": "boolean"}}, "additionalProperties": False}}


def check_tool(a):
    p = TOOL["input_schema"]["properties"]
    ok = (isinstance(a, dict) and a and not set(a) - set(p)
          and all(a[k] in p[k]["enum"] for k in ("yeux", "couleur_yeux", "couleur_joues", "tenue") if k in a)
          and all(isinstance(a[k], list) and 0 < len(a[k]) <= p[k]["maxItems"] and all(x in p[k]["items"]["enum"] for x in a[k])
                  for k in ("porte", "enleve") if k in a)
          and ("normal" not in a or a["normal"] is True))
    return None if ok else "entrée invalide pour set_look : " + json.dumps(a, ensure_ascii=False)


async def run_tool(hub, a):
    if getattr(hub, "look", None) is None:
        return "pas de look sur ce Pixel"
    args = dict(a)
    if "enleve" in args:
        args["enleve"] = "tout" if "tout" in args["enleve"] else args["enleve"]
    await hub.dispatch("look.set", args)
    L = hub.s["look"]
    return "ok. " + describe(L, L.get("porte"))


# ---- the module ----
class Look:
    def __init__(self, hub, datadir=None, now=None):
        self.hub, self.now = hub, now or dt.datetime.now
        self.file = Path(datadir) / "look.json" if datadir else None
        self.history = []
        saved = {}
        if self.file:
            try:
                saved = json.loads(self.file.read_text(encoding="utf-8"))
            except FileNotFoundError:
                saved = {}
            except Exception as e:                   # unreadable, not JSON, absurd values...: never stop the server
                log.warning("look.json unreadable (%r): the look of every day", e)
                saved = {}
        try:
            look = clean(saved)
            hist = saved.get("historique") if isinstance(saved, dict) else None
            self.history = [clean(h) for h in hist[-HISTORY:] if isinstance(h, dict)] if isinstance(hist, list) else []
        except Exception as e:                       # noqa: BLE001 - whatever the file holds, Pixel starts
            log.warning("look.json: %r, the look of every day", e)
            look, self.history = clean({}), []
        self.L = hub.s["look"] = {**look, "porte": {}, "change": None, "avant": len(self.history)}
        self.refresh()

    def save(self):
        if not self.file:
            return
        try:
            self.file.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.file.with_suffix(".tmp")
            tmp.write_text(json.dumps({**{k: self.L[k] for k in SAVED}, "historique": self.history}, ensure_ascii=False, indent=1), encoding="utf-8")
            tmp.replace(self.file)
        except OSError as e:
            log.warning("look.json not saved: %s", e)

    def refresh(self):
        """What he wears now (the clock, the weather, his sleep): True when it changed."""
        porte = resolve(self.L, context(self.hub, self.now()))
        if porte != self.L.get("porte"):
            self.L["porte"] = porte
            return True
        return False

    def commit(self, new, change, undo=True):
        if change is None:
            return False
        if undo:
            self.history = (self.history + [{k: json.loads(json.dumps(self.L[k])) for k in SAVED}])[-HISTORY:]
        self.L.update({k: new[k] for k in SAVED})
        self.L["change"] = {"t0": now_ms(), **change}
        self.L["avant"] = len(self.history)
        self.refresh()
        self.hub.s["anim"] = None
        self.hub.s["screen"] = "visage"             # he shows his new look on his face
        self.save()
        return True

    def set(self, args):
        return self.commit(*apply(self.L, args, _ymd(self.now())))

    def undo(self):
        if not self.history:
            return False
        prev = self.history.pop()
        return self.commit(clean(prev), {"quoi": "avant"}, undo=False)

    def status(self):
        return describe(self.L, self.L.get("porte"))

    async def tick(self):
        if self.refresh():
            self.hub.mark()

    def heard(self, snap):
        """After each broadcast (hub.listeners): his sleep, the weather or his birthday may have changed what he wears."""
        if self.refresh():
            self.hub.mark()


def setup(hub, datadir=None, now=None):
    """The look: loaded from data_dir/look.json, its actions, what he wears refreshed with the clock and the other features."""
    if datadir is None:
        datadir = Path(os.path.expanduser(hub.cfg.get("data_dir", "~/.config/pixel")))
    K = Look(hub, datadir, now)
    hub.look = K

    def clip(d):
        """Only what look.set reads, with short strings and short lists (the rest is dropped)."""
        out = {}
        for k in ("yeux", "couleur_yeux", "couleur_joues", "tenue"):
            if isinstance(d.get(k), str) and len(d[k]) <= 32:
                out[k] = d[k]
        for k in ("mono", "saisons", "nuit", "normal"):
            if isinstance(d.get(k), bool):
                out[k] = d[k]
        for k in ("porte", "enleve"):
            v = d.get(k)
            if isinstance(v, str) and len(v) <= 32:
                out[k] = v
            elif isinstance(v, list):
                out[k] = [x for x in v[:8] if isinstance(x, str) and len(x) <= 32]
        return out

    @hub.action("look.set")
    async def set_(**a):
        """Change his look: eyes, colours, the switches, items to put on or take off, an outfit, or the look of every day."""
        K.set(clip(a))

    @hub.action("look.porte")
    async def porte(item=None):
        """Put on an item (it takes its slot)."""
        K.set(clip({"porte": item}))

    @hub.action("look.enleve")
    async def enleve(item=None, slot=None):
        """Take off an item, or what is in a slot; nothing: everything."""
        K.set(clip({"enleve": item if item is not None else slot if slot is not None else "tout"}))

    @hub.action("look.tenue")
    async def tenue(tenue=None):
        """A whole outfit: hiver, ete, halloween, noel, fete, chic, roi, musique, nuit."""
        K.set(clip({"tenue": tenue}))

    @hub.action("look.reset")
    async def reset():
        """« Look normal »: his eyes, colours and clothes of every day."""
        K.set({"normal": True})

    @hub.action("look.avant")
    async def avant():
        """« Remettre comme avant »: back to the look before the last change."""
        K.undo()

    hub.listeners.append(K.heard)
    try:
        import asyncio
        K.task = asyncio.get_running_loop().create_task(hub.every(20, K.tick, 20))
    except RuntimeError:                         # no loop (tests): they call refresh() themselves
        K.task = None
    return K
