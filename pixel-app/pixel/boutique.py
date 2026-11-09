"""La boutique: Pixel's shop and wardrobe ("des trucs à acheter pour le customiser"). You win coins ("pièces") with him,
and spend them on accessories that he wears on his face: hats, glasses, a bow tie, a moustache...

- The catalogue (24 accessories, drawn for every theme) lives in web/scenes/boutique.js; this module reads its id, label,
  name, slot and price from there (B('id', 'Label', 'nom', 'slot', prix, ...), one per line), like nourrir.py reads the menu.
  A slot is where it goes: tete, yeux, cou, plus. He wears at most one accessory per slot.
- The coins: he starts with START. You win some by doing things with him, never by waiting: a right answer to an exercise
  (2, or 1 on the second try), the exercises' daily goal (10), a meal he eats (1, his favourite 2), a finished work timer
  (1 for every 5 minutes, 10 at most) and the gift of the day (GIFT, once a day: boutique.cadeau). Nothing is ever taken
  back, nothing costs real money, and there is no way to lose an accessory: it is a wardrobe, not a casino.
- boutique.acheter {objet}: bought if you have the coins, and he puts it on at once. boutique.porter {objet}: he wears
  something he owns (it takes the place of what was in its slot). boutique.retirer {objet | slot | nothing: everything}.
  The screens play his reaction (web/scenes/boutique.js, events boutique-achat, -porte, -retire, -cadeau) when "dernier"
  changes, and show the coins won when "gain" changes (web/boutique.js).

Snapshot "boutique": {pieces, possede: [ids], porte: {slot: id}, cadeau (True: today's gift is still to open), gain:
{id, n, raison, t (ms)} or None, dernier: {id, quoi (achat, porte, retire, cadeau), objet, n, t (ms)} or None, journal (the
last 10 gains, newest first: n, raison, t), total (coins won since the start)}. Saved in data_dir/boutique.json; a
hand-edited file is cleaned when read (any value out of place falls back to its default, never a crash).
web/lab/demo-hub.js mirrors it for Pixel Lab and for the phone's own Pixel.
"""
import asyncio
import datetime as dt
import json
import logging
import math
import os
import re
import time
import unicodedata
from pathlib import Path

log = logging.getLogger("pixel.boutique")
PACK = Path(__file__).resolve().parent.parent / "web" / "scenes" / "boutique.js"
_B = re.compile(r"""\bB\(\s*'([a-z0-9-]+)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([a-z]+)'\s*,\s*(\d+)""")
SLOTS = {"tete": "Sur la tête", "yeux": "Lunettes", "cou": "Autour du cou", "plus": "Petits plus"}
START, GIFT = 20, 5             # the coins he starts with; the gift of the day
MAX = 99999                     # his purse never holds more
JOURNAL = 10
T_MIN = 946684800               # 2000-01-01: a saved time before it is not a time
RAISONS = {"exo": "un exo réussi", "objectif": "l’objectif du jour", "repas": "un repas", "minuteur": "le minuteur",
           "cadeau": "le cadeau du jour", "labo": "le labo"}
QUOI = ("achat", "porte", "retire", "cadeau")


def _read():
    text = re.sub(r"/\*.*?\*/", "", PACK.read_text(encoding="utf-8"), flags=re.S)
    text = re.sub(r"(?m)^\s*//.*$", "", text)
    return [{"id": i, "label": label, "nom": nom, "slot": slot, "prix": int(p)} for i, label, nom, slot, p in _B.findall(text)]


ITEMS = _read()
BY_ID = {i["id"]: i for i in ITEMS}
IDS = [i["id"] for i in ITEMS]


# ---- words: what people type after « achète », « mets », « enlève » ----
def norm(s):
    s = unicodedata.normalize("NFD", str(s).lower().strip())
    return "".join(c for c in s if unicodedata.category(c) != "Mn").replace("’", "'").replace("œ", "oe")


def key(s):
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9' -]+", " ", norm(s))).strip()


ARTICLES = ("un ", "une ", "des ", "du ", "de la ", "de l'", "le ", "la ", "les ", "l'", "ce ", "cette ", "ces ", "ton ", "ta ",
            "tes ", "mon ", "ma ", "mes ", "son ", "sa ", "ses ")


def bare(k):
    for a in ARTICLES:
        if k.startswith(a):
            return k[len(a):].strip()
    return k


WORDS = {}
for _i in ITEMS:
    for _w in (_i["id"], _i["id"].replace("-", " "), _i["label"], _i["nom"]):
        _k = bare(key(_w))
        for _v in (_k, key(_w)):
            WORDS.setdefault(_v, _i["id"])
for _w, _id in {"chapeau": "haut-de-forme", "chapeau haut de forme": "haut-de-forme", "haut de forme": "haut-de-forme",
                "chapeau pointu": "chapeau-fete", "chapeau d'anniversaire": "chapeau-fete", "casquette": "casquette",
                "oreilles": "oreilles-chat", "chapeau de magicien": "sorcier",
                "chapeau de sorciere": "sorcier", "sorcier": "sorcier", "antenne": "antenne-coeur",
                "lunettes": "lunettes", "lunettes noires": "soleil", "lunettes de star": "soleil", "lunettes coeurs": "lunettes-coeur",
                "lunettes en coeur": "lunettes-coeur", "masque": "masque", "masque de super-heros": "masque",
                "masque de super heros": "masque", "lunettes 3 d": "lunettes-3d", "noeud papillon": "noeud-pap", "noeud pap": "noeud-pap",
                "noeud": "noeud-pap", "foulard": "echarpe", "etoile": "etoile", "sparadrap": "pansement"}.items():
    if _id in BY_ID:
        WORDS.setdefault(_w, _id)


def find(text):
    """The accessory a few words name (« le bonnet », « ses lunettes de soleil »), or None."""
    k = re.sub(r"\s+(?:a|pour|de|sur)\s+(?:pixel|toi|lui)$", "", key(text))
    k = bare(k)
    return WORDS.get(k) or WORDS.get(k[:-1] if k.endswith(("s", "x")) else k)


def day(t):
    return dt.datetime.fromtimestamp(t).strftime("%Y-%m-%d")


def coins(n):
    return f"{n} pièce{'s' if n > 1 else ''}"


class Boutique:
    def __init__(self, hub, datadir=None, now=time.time):
        self.hub, self.now = hub, now
        self.file = Path(datadir) / "boutique.json" if datadir else None
        try:
            self._restore(self._load())
        except Exception as e:                     # whatever the file holds, Pixel starts: a new purse
            log.warning("boutique.json: %r, a new purse", e)
            self._restore({})
        self.jour = day(self.now())
        self.publish()
        self.save()

    # ---- his state, every value checked ----
    @staticmethod
    def _int(v, default, lo=0, hi=MAX):
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            return default
        try:
            if not math.isfinite(v):
                return default
            return max(lo, min(hi, int(v)))
        except (OverflowError, ValueError):
            return default

    @staticmethod
    def _time(t):
        return float(t) if isinstance(t, (int, float)) and not isinstance(t, bool) and math.isfinite(t) and t >= 0 else None

    def _restore(self, d):
        self.pieces = self._int(d.get("pieces"), START)
        self.total = self._int(d.get("total"), 0, 0, 10 ** 9)
        own = d.get("possede") if isinstance(d.get("possede"), list) else []
        self.possede = [i for i in IDS if i in {x for x in own if isinstance(x, str)}]        # in the catalogue's order, once each
        worn = d.get("porte") if isinstance(d.get("porte"), dict) else {}
        self.porte = {s: worn[s] for s in SLOTS if isinstance(worn.get(s), str) and worn[s] in self.possede and BY_ID[worn[s]]["slot"] == s}
        self.cadeau = d.get("cadeau") if isinstance(d.get("cadeau"), str) and re.fullmatch(r"\d{4}-\d\d-\d\d", d.get("cadeau")) else ""
        self.journal = [g for g in map(self._gain, d.get("journal") if isinstance(d.get("journal"), list) else []) if g][:JOURNAL]
        g = self._gain(d.get("gain"))
        self.gain = {"id": self._int(d["gain"].get("id"), 0, 0, 10 ** 9), **g} if g else None
        self.dernier = self._last(d.get("dernier"))

    def _gain(self, g):
        if not isinstance(g, dict) or g.get("raison") not in RAISONS:
            return None
        n, t = self._int(g.get("n"), 0, 0, 1000), self._time(g.get("t"))
        return {"n": n, "raison": g["raison"], "t": t} if n > 0 and t is not None else None

    def _last(self, m):
        if not isinstance(m, dict) or m.get("quoi") not in QUOI:
            return None
        t, objet = self._time(m.get("t")), m.get("objet")
        if t is None or (m["quoi"] != "cadeau" and objet not in BY_ID and objet != ""):
            return None
        return {"id": self._int(m.get("id"), 0, 0, 10 ** 9), "quoi": m["quoi"], "objet": objet if objet in BY_ID else "",
                "n": self._int(m.get("n"), 0, 0, 1000), "t": t}

    # ---- files ----
    def _load(self):
        if not self.file or not self.file.exists():
            return {}
        try:
            d = json.loads(self.file.read_text())
            return d if isinstance(d, dict) else {}
        except (OSError, ValueError):
            log.warning("boutique.json unreadable: a new purse")
            return {}

    def save(self):
        if not self.file:
            return
        d = {"pieces": self.pieces, "total": self.total, "possede": self.possede, "porte": self.porte, "cadeau": self.cadeau,
             "journal": self.journal, "gain": self.gain, "dernier": self.dernier}
        try:
            tmp = self.file.with_suffix(".tmp")
            tmp.write_text(json.dumps(d, ensure_ascii=False, indent=1))
            os.replace(tmp, self.file)
        except OSError:
            log.exception("boutique.json not saved")

    def publish(self):
        self.hub.s["boutique"] = {
            "pieces": self.pieces, "possede": list(self.possede), "porte": dict(self.porte), "cadeau": self.cadeau != day(self.now()),
            "gain": dict(self.gain) if self.gain else None, "dernier": dict(self.dernier) if self.dernier else None,
            "journal": [dict(j) for j in self.journal], "total": self.total}
        self.hub.mark()

    def tick(self):
        """A new day: today's gift is there again."""
        d = day(self.now())
        if d != self.jour:
            self.jour = d
            self.publish()

    async def atick(self):
        self.tick()

    # ---- the coins ----
    def gagner(self, n, raison):
        """n coins won for a reason of RAISONS; returns what was really added (his purse holds MAX at most)."""
        n = self._int(n, 0, 0, 1000)
        if n <= 0 or raison not in RAISONS:
            return 0
        n = min(n, MAX - self.pieces)
        if n <= 0:
            return 0
        t = self.now() * 1000
        self.pieces += n
        self.total += n
        self.gain = {"id": ((self.gain or {}).get("id") or 0) + 1, "n": n, "raison": raison, "t": t}
        self.journal = ([{"n": n, "raison": raison, "t": t}] + self.journal)[:JOURNAL]
        self.publish()
        self.save()
        return n

    def _did(self, quoi, objet="", n=0):
        self.dernier = {"id": ((self.dernier or {}).get("id") or 0) + 1, "quoi": quoi, "objet": objet, "n": n, "t": self.now() * 1000}

    def offrir(self):
        """The gift of the day: GIFT coins, once a day. False when it was already opened today."""
        d = day(self.now())
        if self.cadeau == d:
            self.hub.toast("Tu as déjà ouvert le cadeau d’aujourd’hui. Reviens demain !", 4000)
            return False
        self.cadeau = self.jour = d
        n = self.gagner(GIFT, "cadeau")
        self._did("cadeau", n=n)
        self._show()
        return True

    # ---- his wardrobe ----
    def _show(self):
        self.hub.s["anim"] = None
        self.hub.s["screen"] = "visage"            # he shows it on his face screen
        self.publish()
        self.save()

    def acheter(self, objet):
        """Buys an accessory: "ok" (he puts it on at once), "deja" (he has it: he puts it on), "pauvre" (not enough coins), None."""
        it = BY_ID.get(str(objet))
        if not it:
            return None
        if it["id"] in self.possede:
            self.porter(it["id"])
            return "deja"
        if self.pieces < it["prix"]:
            m = it["prix"] - self.pieces
            self.hub.toast(f"Il te manque {coins(m)} pour {self._le(it)} ({coins(it['prix'])}).", 5000)
            return "pauvre"
        self.pieces -= it["prix"]
        self.possede = [i for i in IDS if i in self.possede or i == it["id"]]
        self.porte[it["slot"]] = it["id"]
        self._did("achat", it["id"])
        self._show()
        return "ok"

    @staticmethod
    def _le(it):
        """« sa casquette » -> « la casquette »: the accessory, not his yet."""
        n = it["nom"]
        for a, b in (("son ", "le "), ("sa ", "la "), ("ses ", "les ")):
            if n.startswith(a):
                rest = n[len(a):]
                return ("l’" + rest) if b != "les " and norm(rest)[:1] in "aeiouy" else b + rest
        return n

    def porter(self, objet):
        """He wears something he owns. True when he now wears it."""
        it = BY_ID.get(str(objet))
        if not it:
            return False
        if it["id"] not in self.possede:
            self.hub.toast(f"Pixel n’a pas encore {self._le(it)} : {coins(it['prix'])} à la boutique (tu en as {self.pieces}).", 5000)
            return False
        if self.porte.get(it["slot"]) != it["id"]:
            self.porte[it["slot"]] = it["id"]
            self._did("porte", it["id"])
        self._show()
        return True

    def retirer(self, objet=None, slot=None):
        """He takes off one accessory (by its id or its slot), or everything. True when something came off."""
        if objet is not None:
            it = BY_ID.get(str(objet))
            slots = [it["slot"]] if it and self.porte.get(it["slot"]) == it["id"] else []
        elif slot is not None:
            slots = [slot] if slot in self.porte else []
        else:
            slots = list(self.porte)
        if not slots:
            return False
        last = self.porte[slots[-1]]
        for s in slots:
            del self.porte[s]
        self._did("retire", last)
        self._show()
        return True

    def tenue(self):
        """What he wears, in a few words."""
        w = [BY_ID[self.porte[s]]["nom"] for s in SLOTS if s in self.porte]
        return "rien de spécial" if not w else w[0] if len(w) == 1 else ", ".join(w[:-1]) + " et " + w[-1]

    def status(self):
        """A few words for Claude and the commands."""
        return f"{coins(self.pieces)} ; tu portes {self.tenue()} ; dans ta garde-robe : " + (", ".join(BY_ID[i]["label"] for i in self.possede) or "rien encore")


# ---- typed commands (pixel/commands.py calls command() just before handing the text to Claude) ----
_SHOP = re.compile(r"^(?:(?:la|ma|ta|sa) )?(?:boutique|garde-robe|garde robe|penderie)(?: de pixel)?$")
_PURSE = re.compile(r"^(?:(?:mes|tes|les|nos) (?:pieces|sous)|combien (?:de|j'ai de|on a de|ai-je de|tu as de) (?:pieces|sous)|j'ai combien de (?:pieces|sous))$")
_GIFT = re.compile(r"^(?:(?:le |mon |ton |un )?cadeau(?: du jour)?|ouvre (?:le|ton|mon) cadeau)$")
_BUY = re.compile(r"^(?:achete-lui|achete lui|achete-moi|achete|acheter|j'achete|je prends|je veux acheter)\s+(.+)$")
_WEAR = re.compile(r"^(?:pixel[, ]+)?(?:mets-lui|mets lui|mets-toi|mets toi|remets|mets|met|porte|enfile|essaie)\s+(.+)$")
_OFF = re.compile(r"^(?:pixel[, ]+)?(?:enleve-lui|enleve lui|enleve-toi|enleve|enlever|retire-lui|retire lui|retire|retirer|ote|range)\s+(.+)$")
_ALL = ("tout", "tous ses accessoires", "tes accessoires", "ses accessoires", "tous tes accessoires", "tes affaires", "ses affaires")


async def command(hub, t):
    """True when the (normalized) text was about his shop. Conservative: an accessory must be named, or the words are exact."""
    S = getattr(hub, "boutique", None)
    if not S:
        return False
    t = re.sub(r"\s+(?:s'il te plait|s il te plait|stp|svp)$", "", re.sub(r"[\s!?.…]+$", "", norm(t))).strip()
    if _SHOP.match(t):
        hub.toast(f"La boutique : tu as {coins(S.pieces)}. Pixel porte {S.tenue()}. Ouvre « Boutique » sur ton téléphone, ou tape "
                  "« achète le bonnet », « mets les lunettes », « enlève tout », « cadeau ».", 12000)
        return True
    if _PURSE.match(t):
        hub.toast(f"Tu as {coins(S.pieces)}. Tu en gagnes avec les exos, ses repas, le minuteur et le cadeau du jour.", 7000)
        return True
    if _GIFT.match(t):
        S.offrir()
        return True
    m = _OFF.match(t)
    if m and (m.group(1) in _ALL or find(m.group(1))):
        if not (S.retirer() if m.group(1) in _ALL else S.retirer(find(m.group(1)))):
            hub.toast("Il ne le porte pas.", 3000)
        return True
    m = _BUY.match(t)
    if m and find(m.group(1)):
        S.acheter(find(m.group(1)))
        return True
    m = _WEAR.match(t)
    if m and find(m.group(1)):
        S.porter(find(m.group(1)))
        return True
    return False


# ---- Claude (pixel/claude.py adds TOOL to its tools, and asks check_tool() and run_tool()) ----
TOOL = {"name": "wear_accessory", "eager_input_streaming": True,
        "description": "Tu mets ou tu enlèves un accessoire de ta garde-robe, pour de vrai, sur ton visage : quand on te le demande, ou "
                       "quand ça te fait plaisir. Tu ne peux mettre que ce que tu possèdes déjà (on te l'achète à la boutique, avec les "
                       "pièces gagnées ensemble : tu n'achètes rien toi-même). « rien » : tu enlèves tout. Le résultat dit ce que tu "
                       "portes maintenant. Les accessoires : " + " ; ".join(f"{i['id']} ({i['label']})" for i in ITEMS) + ".",
        "input_schema": {"type": "object", "properties": {"objet": {"type": "string", "enum": IDS + ["rien"]},
                                                          "enlever": {"type": "boolean"}}, "required": ["objet"],
                         "additionalProperties": False}}


def check_tool(a):
    ok = isinstance(a, dict) and (a.get("objet") in BY_ID or a.get("objet") == "rien") and isinstance(a.get("enlever", False), bool)
    return None if ok else "entrée invalide pour wear_accessory : " + json.dumps(a, ensure_ascii=False)


async def run_tool(hub, a):
    S = getattr(hub, "boutique", None)
    if not S:
        return "pas de boutique sur ce Pixel"
    if a["objet"] == "rien":
        S.retirer()
    elif a.get("enlever"):
        S.retirer(a["objet"])
    elif a["objet"] not in S.possede:
        it = BY_ID[a["objet"]]
        return f"tu n'as pas encore {S._le(it)} : {coins(it['prix'])} à la boutique, et vous avez {coins(S.pieces)}. Tu portes {S.tenue()}."
    else:
        S.porter(a["objet"])
    return f"Tu portes maintenant {S.tenue()}."


def setup(hub, datadir=None, now=time.time):
    """His purse, his wardrobe and their actions. datadir: [data_dir] of config.toml by default."""
    if datadir is None:
        datadir = Path(os.path.expanduser(hub.cfg.get("data_dir", "~/.config/pixel")))
    S = Boutique(hub, datadir, now)
    hub.boutique = S

    @hub.action("boutique.acheter")
    async def acheter(objet):
        """Buys an accessory of the catalogue (web/scenes/boutique.js) with his coins; he puts it on at once."""
        S.acheter(objet)

    @hub.action("boutique.porter")
    async def porter(objet):
        """He wears an accessory he owns, in place of what was in its slot."""
        S.porter(objet)

    @hub.action("boutique.retirer")
    async def retirer(objet=None, slot=None):
        """He takes off an accessory (objet or slot), or everything."""
        S.retirer(objet, slot)

    @hub.action("boutique.cadeau")
    async def cadeau():
        """The gift of the day: a few coins, once a day."""
        S.offrir()

    try:
        S.task = asyncio.get_running_loop().create_task(hub.every(60, S.atick, 60))
    except RuntimeError:                         # no loop (tests): they call tick() themselves
        S.task = None
    return S
