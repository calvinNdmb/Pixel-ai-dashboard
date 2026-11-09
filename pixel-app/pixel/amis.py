"""Les amis de Pixel: your Pixel visits the Pixel of a friend, from house to house, like the Pixel de poche goes into your
pocket. No server of ours, no port to open: everything goes through an ntfy-compatible relay (pixel/relais.py; ntfy.sh by
default, [amis] relay in config.toml for your own), sealed end to end, and nothing at all goes out until the first friend.

Becoming friends. One Pixel shows a friendship code, three simple words and a number (« lapin · soleil · tarte · 4271 »: 512
words, 1000..9999, 40 bits), valid 24 h and once. The friend types it on his own Pixel. The code never travels: both sides
stretch it (scrypt) into a meeting topic and its key. On it, the one who typed it says « bonjour » with an X25519 public key
and his identity card; the code's owner answers « bienvenue » with his own; each computes the same friendship key from that
exchange and the code. The newcomer then says « merci » on the friendship's own channel: both screens show the new friend.
An identity card is all a friend knows of the other: a random id, his Pixel's name (pixel/caractere.py, cleaned, 16
characters at most), his character's preset, his theme and his look (the snapshot "look", an opaque object, 1 KB at most).
Each friendship has two topics (one per direction) and two keys; every message is sealed, carries its sender, its recipient,
its time and a random id, and is refused when it is old, from the future, already seen, or more than the rate allows.

Visits. « Va voir Bip »: his Pixel walks off this screen (web/scenes/amis.js ami-part) and asks. The host's Pixel says yes
when he is awake (habitudes.dort, else his character's quiet hours), not casting, not in an exercise, not already busy with
a visit, and accepts visits (« Me demander avant »: his family answers on his screen or phone first). The host then plays a
programme of two-Pixel scenes for about 3 minutes (programme()), then says what they did; the visitor's Pixel comes home
and tells it (« J'ai joué avec Bip ! On a dansé ! »). No answer within DEMANDE_WAIT s: he comes back (« Bip n'a pas répondu,
il doit dormir »). Also a « coucou » (he waves on the friend's screen) and stickers from a fixed list: no free text at all.

Snapshot "amis": {dispo, pourquoi, on, visites, demander, relais (host), lien (off, connexion, ok, coupe), max, moi (my card),
code: {code, mots, nombre, expire, qr} | None, montre (ms: the code shown on the Pi's screen until then), ajout: {etat (calcul,
attente, ok, erreur), pourquoi, nom, t} | None, amis: [{id, nom, caractere, theme, look, depuis, vu, visite, n, coucou}],
arrivent: [noms], visite: {vid, sens (sortie: his Pixel is away; accueil: a friend is here), ami, nom, etat (demande,
attente, chez; question for a host asked first), t0, jusqua, fin, programme, look, seed} | None, evs: [{id, kind, t0, ami,
nom, ...}] (the last news, for the screens' scenes), journal: [{t, quoi, ami, nom, fait?, refus?, s?}]}.
Actions amis.*: code, code_annule, montre {on}, ajoute {code}, ajout_ok, visite {ami}, rappel, raccompagne, reponse {vid,
oui}, coucou {ami}, sticker {ami, s}, retire {ami}, reglages {on, visites, demander}. Saved in data_dir/amis.json (0600: it
holds the keys); a broken file is put aside and Pixel starts with no friend. Typed commands: command(); Claude: TOOL.
See docs/AMIS.md. The lab's mirror: web/lab/amis-lab.js.
"""
import asyncio
import datetime as dt
import hashlib
import json
import logging
import math
import os
import random
import re
import secrets
import time
import unicodedata
from pathlib import Path

from . import caractere, relais
from .keys import THEMES

log = logging.getLogger("pixel.amis")
WEB = Path(__file__).resolve().parent.parent / "web"

MAX_AMIS = 20
CODE_TTL = 24 * 3600            # s: a friendship code works that long, and once
MONTRE_MS = 90000               # the code on the Pi's screen
PAIR_WAIT = 90                  # s the one who typed a code waits for the answer
PAIR_AGE = 120                  # s: a « bonjour » older than that is ignored (its sender gave up)
CONFIRM_WAIT = 600              # s the code's owner waits for the « merci » that proves both have the same key
TRIES = (6, 600)                # at most 6 codes typed in 10 min (each one costs half a second of scrypt on a Pi)
DEMANDE_WAIT = 25               # s for an answer to a visit request
QUESTION_WAIT = 45              # s the host's family has to answer « Bip veut venir jouer ! »
RETOUR_GRACE = 30               # s after a visit should have ended: he comes home by himself
VISITE_S = 180                  # s, about (config [amis] visite_secondes, 20..600)
PAUSE = 2500                    # ms between two scenes of a visit
COOLDOWN = 20                   # s after a visit before the next one
SKEW = 600                      # s a friend's clock may be ahead
MAX_AGE = 24 * 3600             # s: an older message is no news (ntfy.sh keeps 12 h)
AGES = {"visite-demande": 90, "visite-attente": 180, "visite-ok": 180, "visite-non": 600, "visite-fin": 1200, "merci": CONFIRM_WAIT}
FRESH = 120                     # s: an older coucou or sticker goes to the journal only (no scene)
GAP = {"coucou": 20, "sticker": 8, "visite-demande": 30}       # s between two of them to the same friend
PER_HOUR = {"coucou": 30, "sticker": 40, "visite-demande": 20}
DAY_MAX = 150                   # messages a day, all friends together (ntfy.sh lets an address send 250)
IN_RATE = (30, 60)              # at most 30 messages a minute on one topic (a visit is 3 or 4): more are dropped before opening
SHOW_GAP = 6                    # s between two scenes for one friend's coucous (or stickers): more go to the journal only
CARD_GAP = 15 * 60              # s between two sendings of my card to my friends (a new name, a new look)
JOURNAL = 30
EVS = 6
LOOK_MAX = 1024
ID = re.compile(r"^[0-9a-f]{16}$")
VID = re.compile(r"^[0-9a-f]{12}$")
REFUS = ("pas-de-reponse", "dort", "occupe", "exo", "absent", "visite", "ferme", "non", "pas-repondu", "croise", "reseau")
OFF_MSG = "Les amis de Pixel sont éteints. Rallume-les dans « Ses amis », sur ton téléphone."
WHY = {"cryptography": "Il manque le paquet « cryptography » : relance deploy/install.sh.",
       "config": "Les amis de Pixel sont désactivés dans config.toml ([amis] enabled = false)."}


# ---------- what web/amis.js and web/scenes/amis.js define, read from there (one source for both) ----------
def _strip(text):
    return re.sub(r"(?m)^\s*//.*$", "", re.sub(r"/\*.*?\*/", "", text, flags=re.S))


def _read():
    js = (WEB / "amis.js").read_text(encoding="utf-8")
    m = re.search(r"const MOTS = `([^`]+)`", js)
    mots = m.group(1).split() if m else []
    pack = _strip((WEB / "scenes" / "amis.js").read_text(encoding="utf-8"))
    stickers = dict(re.findall(r"""\bK\(\s*'([a-z]+)'\s*,\s*'([^']*)'""", pack))
    fait = {i: (nous, eux) for i, nous, eux in re.findall(r"""\bA\(\s*'(ami-[a-z]+)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*\)""", pack)}
    durs = {i: int(d) for i, d in re.findall(r"""\bS\(\s*'(ami-[a-z]+)'\s*,\s*'[^']*'\s*,\s*'[a-z]+'\s*,\s*\{\s*dur:\s*(\d+)""", pack)}
    return mots, stickers, fait, durs


def norm(s):
    s = unicodedata.normalize("NFD", str(s).lower().strip())
    return "".join(c for c in s if unicodedata.category(c) != "Mn").replace("œ", "oe").replace("æ", "ae").replace("’", "'")


MOTS, STICKERS, FAIT, DUREES = _read()
MOT = {norm(w): w for w in MOTS}                 # « elephant » -> « éléphant »
ACTIVITES = ("ami-danse", "ami-tape", "ami-course", "ami-gouter", "ami-cache", "ami-blague", "ami-bavarde")


# ---------- the friendship codes ----------
STOP = {"pixel", "ami", "amis", "code", "codes", "d", "l", "de", "du", "le", "la", "mon", "ton", "son", "est", "c", "voici", "voila",
        "nouvel", "nouveau", "un", "une", "s", "il", "qu", "y", "a"}


def distance(a, b):
    """Levenshtein, for « lapon » -> « lapin »."""
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def proche(w):
    """The word of the list closest to a mistyped one (2 letters at most), or None when it is not clear."""
    if len(w) > 16:
        return None
    best = sorted((distance(w, k), k) for k in MOT if abs(len(k) - len(w)) <= 2)
    if best and best[0][0] <= 2 and (len(best) == 1 or best[1][0] > best[0][0]):
        return MOT[best[0][1]]
    return None


def lire_code(text):
    """A typed code, any way it is typed (« Lapin soleil tarte 42 71 », with or without accents, dashes, « Code d'ami : … »):
    (canonical « lapin-soleil-tarte-4271 », None), or (None, why): {"inconnus": [...], "idees": {...}} | {"mots": n} | {"nombre": s}."""
    t = norm(str(text or "")[:300])
    tokens = re.findall(r"[a-z]+|\d+", t)
    words = [w for w in tokens if not w.isdigit() and w not in STOP]
    digits = "".join(w for w in tokens if w.isdigit())
    unknown = [w for w in words if w not in MOT][:3]
    if unknown:
        return None, {"inconnus": unknown, "idees": {w: p for w in unknown if (p := proche(w))}}
    if len(words) != 3:
        return None, {"mots": len(words)}
    if len(digits) != 4 or not 1000 <= int(digits) <= 9999:
        return None, {"nombre": digits[:8]}
    return "-".join(words) + "-" + digits, None


def nouveau_code():
    keys = sorted(MOT)
    return "-".join(secrets.choice(keys) for _ in range(3)) + "-" + str(1000 + secrets.randbelow(9000))


def ecrit(code):
    """« lapin-soleil-tarte-4271 » as shown: the words as written, the number."""
    parts = code.split("-")
    return {"mots": [MOT.get(w, w) for w in parts[:3]], "nombre": parts[3] if len(parts) > 3 else ""}


def code_texte(code):
    e = ecrit(code)
    return " · ".join(e["mots"] + [e["nombre"]])


def pourquoi_code(why):
    """The panel's and the command's words for a code that is not one."""
    if not why:
        return ""
    if why.get("inconnus"):
        w = why["inconnus"][0]
        idee = (why.get("idees") or {}).get(w)
        return f"« {w} » n'est pas un mot des codes d'ami." + (f" Tu voulais dire « {idee} » ?" if idee else " Vérifie le code.")
    if "mots" in why:
        return "Un code d'ami, c'est trois mots et un nombre, comme « lapin soleil tarte 4271 »."
    return "Il manque le nombre du code : quatre chiffres, comme 4271."


# ---------- identity cards ----------
def _plain(v, depth=0):
    if depth > 4:
        return False
    if v is None or isinstance(v, bool):
        return True
    if isinstance(v, (int, float)):
        return math.isfinite(v)
    if isinstance(v, str):
        return len(v) <= 64 and v.isprintable()
    if isinstance(v, list):
        return len(v) <= 16 and all(_plain(x, depth + 1) for x in v)
    if isinstance(v, dict):
        return len(v) <= 24 and all(isinstance(k, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,24}", k) and _plain(x, depth + 1) for k, x in v.items())
    return False


def clean_look(v):
    """His look (the snapshot "look", web/look.js's business): passed on as it is, if it is small plain data. None otherwise."""
    if v is None or not isinstance(v, (dict, list)) or not _plain(v):
        return None
    try:
        s = json.dumps(v, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    except (TypeError, ValueError):
        return None
    return json.loads(s) if len(s.encode()) <= LOOK_MAX else None


def clean_card(c):
    """An identity card from anywhere (a friend, the file): its id, his Pixel's name, his preset, his theme, his look."""
    if not isinstance(c, dict) or not isinstance(c.get("id"), str) or not ID.match(c["id"]):
        return None
    p = c.get("caractere")
    return {"v": 1, "id": c["id"], "nom": caractere.clean_name(c.get("nom"), caractere.NOM_MAX) or caractere.NOM,
            "caractere": p if isinstance(p, str) and (p in caractere.PRESETS or p == "perso") else "pixel",
            "theme": c.get("theme") if isinstance(c.get("theme"), str) and c.get("theme") in THEMES else "retro",
            "look": clean_look(c.get("look"))}


def _int(v, lo, hi, default=0):
    if isinstance(v, bool) or not isinstance(v, (int, float)) or (isinstance(v, float) and not math.isfinite(v)):
        return default
    return max(lo, min(hi, int(v)))


def _num(v, default, lo, hi):
    if isinstance(v, bool) or not isinstance(v, (int, float)) or (isinstance(v, float) and not math.isfinite(v)):
        return default
    return max(lo, min(hi, v))


# ---------- a visit's programme (the host's server sets it, every screen of his plays it) ----------
def programme(total, tard=False, rng=random):
    """[{id, at (ms)}] and its length: he arrives, activities in a random order while they fit, the souvenir photo, a nap side
    by side when it is late, goodbye. A visit shorter than that (tests) plays the same scenes, cut short."""
    d = DUREES
    acts = list(ACTIVITES)
    rng.shuffle(acts)
    fin = ["ami-photo"] + (["ami-dodo"] if tard else []) + ["ami-aurevoir"]
    budget = total - (d["ami-arrive"] + PAUSE + sum(d[x] + PAUSE for x in fin) - PAUSE)
    chosen = []
    for a in acts:
        if not chosen or d[a] + PAUSE <= budget:
            chosen.append(a)
            budget -= d[a] + PAUSE
    if budget < 0 and len(fin) > 1:
        fin.remove("ami-photo")
    items, t = [], 0
    for x in ["ami-arrive"] + chosen + fin:
        items.append({"id": x, "at": t})
        t += d[x] + PAUSE
    t -= PAUSE
    if t > total:
        k = total / t
        for it in items:
            it["at"] = int(it["at"] * k)
        t = total
    return items, int(t)


def histoire(fait, nom, eux=False):
    """« on a dansé, et on a fait la course » (eux: « ils ont … »), two at most."""
    got = [FAIT[i][1 if eux else 0] for i in ("ami-danse", "ami-course", "ami-cache", "ami-tape", "ami-gouter", "ami-blague", "ami-photo", "ami-dodo", "ami-bavarde")
           if i in (fait or []) and i in FAIT][:2]
    return ", et ".join(got)


class Amis:
    def __init__(self, hub, datadir=None, cfg=None, now=time.time):
        self.hub, self.now = hub, now
        cfg = cfg if isinstance(cfg, dict) else {}
        self.file = Path(datadir) / "amis.json" if datadir else None
        self.enabled = cfg.get("enabled", True) is not False
        self.dispo = relais.CRYPTO and self.enabled
        self.pourquoi = "" if self.dispo else ("config" if not self.enabled else "cryptography")
        self.visite_ms = int(_num(cfg.get("visite_secondes"), VISITE_S, 20, 600) * 1000)
        url = relais.clean_url(cfg.get("relay")) if "relay" in cfg else relais.DEFAULT
        if not url:
            log.warning("[amis] relay is not a web address: ntfy.sh instead")
            url = relais.DEFAULT
        self.relais = relais.Relais(url, self.on_message, token=cfg.get("token"), on_status=self._lien,
                                    silence=_num(cfg.get("silence"), relais.SILENCE, 3, 600))
        self.moi = secrets.token_hex(8)
        self.on, self.accepte, self.demander = True, True, False
        self.amis, self.attente = {}, {}         # friends; the code's owner: newcomers waiting for their « merci »
        self.code = None                         # my friendship code: {code, t, expire}
        self.journal, self.seen, self.compte = [], {}, {"jour": "", "n": 0}
        self.inv = None                          # my code's meeting topic and key, once stretched
        self.ajout = None                        # a code I typed: {etat, pourquoi, nom, t, jusqua, ...}
        self.visite = None
        self.evs, self.ev_id, self.montre, self.lien = [], 0, 0, "off"
        self.last_out, self.hour_out, self.rate_in, self.shown, self.tries = {}, {}, {}, {}, []
        self.rejets = 0                          # messages refused (tests, the lab): not ours, tampered with, replayed, too many
        self.card_key, self.card_last, self.merci = "", 0.0, []
        self.cooldown, self.tasks, self.qr, self._by_topic = 0.0, set(), None, {}
        self._load()
        self._topics()

    # ---------- time ----------
    def _ms(self):
        return int(self.now() * 1000)

    def _hour(self):
        return dt.datetime.fromtimestamp(self.now()).hour

    # ---------- the file ----------
    def _load(self):
        d = {}
        if self.file:
            try:
                d = json.loads(self.file.read_text(encoding="utf-8"))
                if not isinstance(d, dict):
                    raise ValueError("not an object")
            except FileNotFoundError:
                d = {}
            except Exception as e:                   # noqa: BLE001 - whatever is in it, Pixel starts
                log.warning("amis.json unreadable (%s): put aside, no friends", e)
                try:
                    self.file.replace(self.file.with_name("amis.json.illisible"))
                except OSError:
                    pass
                d = {}
        if isinstance(d.get("moi"), str) and ID.match(d["moi"]):
            self.moi = d["moi"]
        self.on, self.accepte, self.demander = d.get("on") is not False, d.get("visites") is not False, d.get("demander") is True
        now = self._ms()
        for r in d.get("amis") if isinstance(d.get("amis"), list) else []:
            rec = self._rec(r)
            if rec and len(self.amis) < MAX_AMIS:
                self.amis[rec["id"]] = rec
        for r in d.get("attente") if isinstance(d.get("attente"), list) else []:
            rec = self._rec(r)
            if rec and rec["id"] not in self.amis and now < _int(r.get("jusqua"), 0, 1 << 53):
                rec["jusqua"] = _int(r.get("jusqua"), 0, 1 << 53)
                self.attente[rec["id"]] = rec
        c = d.get("code")
        if isinstance(c, dict) and isinstance(c.get("code"), str) and lire_code(c["code"])[0] == c["code"]:
            exp = _int(c.get("expire"), 0, 1 << 53)
            if now < exp <= now + CODE_TTL * 1000 + 60000:
                self.code = {"code": c["code"], "t": _int(c.get("t"), 0, 1 << 53), "expire": exp}
        self.journal = [j for j in map(self._journal_item, d.get("journal") if isinstance(d.get("journal"), list) else []) if j][:JOURNAL]
        s = d.get("seen") if isinstance(d.get("seen"), dict) else {}
        horizon = now - (MAX_AGE + SKEW) * 1000
        self.seen = {k: v for k, v in s.items() if isinstance(k, str) and ID.match(k) and isinstance(v, int) and v > horizon}
        self.relais.since = _int(d.get("since"), 0, 1 << 40)
        if isinstance(d.get("compte"), dict) and isinstance(d["compte"].get("jour"), str):
            self.compte = {"jour": d["compte"]["jour"][:10], "n": _int(d["compte"].get("n"), 0, 10 ** 6)}
        self.card_key = d.get("carte") if isinstance(d.get("carte"), str) else ""

    def _rec(self, r):
        """A friend as kept in amis.json, every field checked; None when it is not one."""
        card = clean_card(r)
        if not card or card["id"] == self.moi:
            return None
        try:
            key = relais.unb64u(r.get("cle", ""))
        except (ValueError, TypeError):
            return None
        if len(key) != 32:
            return None
        rec = {**card, "cle": relais.b64u(key)}
        for k in ("depuis", "vu", "visite", "coucou"):
            rec[k] = _int(r.get(k), 0, 1 << 53)
        rec["n"] = _int(r.get("n"), 0, 10 ** 6)
        self._derive(rec)
        return rec

    def _derive(self, rec):
        """A friendship's two topics and two keys, one per direction: mine to him, his to me."""
        k = relais.unb64u(rec["cle"])
        rec["_t_in"], rec["_t_out"] = relais.topic(k, "boite " + self.moi), relais.topic(k, "boite " + rec["id"])
        rec["_k_in"], rec["_k_out"] = relais.subkey(k, f"{rec['id']}>{self.moi}"), relais.subkey(k, f"{self.moi}>{rec['id']}")

    @staticmethod
    def _stored(rec):
        return {k: v for k, v in rec.items() if not k.startswith("_")}

    def _journal_item(self, j):
        if not isinstance(j, dict) or not isinstance(j.get("quoi"), str) or not re.fullmatch(r"[a-z-]{2,20}", j["quoi"]):
            return None
        out = {"t": _int(j.get("t"), 0, 1 << 53), "quoi": j["quoi"], "ami": j.get("ami") if isinstance(j.get("ami"), str) and ID.match(j["ami"]) else "",
               "nom": caractere.clean_name(j.get("nom"), caractere.NOM_MAX) or caractere.NOM}
        if isinstance(j.get("fait"), list):
            out["fait"] = [x for x in j["fait"] if x in FAIT][:10]
        if j.get("refus") in REFUS:
            out["refus"] = j["refus"]
        if j.get("s") in STICKERS:
            out["s"] = j["s"]
        return out

    def save(self):
        if not self.file:
            return
        d = {"v": 1, "moi": self.moi, "on": self.on, "visites": self.accepte, "demander": self.demander,
             "amis": [self._stored(r) for r in self.amis.values()], "attente": [self._stored(r) for r in self.attente.values()],
             "code": self.code, "journal": self.journal, "seen": self.seen, "since": int(self.relais.since), "compte": self.compte, "carte": self.card_key}
        try:
            self.file.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.file.with_suffix(".tmp")
            fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(d, f, ensure_ascii=False)
            os.chmod(tmp, 0o600)
            os.replace(tmp, self.file)
        except OSError as e:
            log.warning("amis.json not saved: %s", e)

    # ---------- the snapshot ----------
    def _lien(self, s):
        self.lien = s
        self.publish()

    def _noms(self):
        """Friends' names as shown: two friends called « Pixel » become « Pixel » and « Pixel 2 » (by friendship date)."""
        out, seen = {}, {norm(self.ma_carte()["nom"]): 1}
        for r in sorted(self.amis.values(), key=lambda r: (r["depuis"], r["id"])):
            k = norm(r["nom"])
            seen[k] = seen.get(k, 0) + 1
            out[r["id"]] = r["nom"] if seen[k] == 1 else f"{r['nom']} {seen[k]}"
        return out

    def ma_carte(self):
        car = self.hub.s.get("caractere") if isinstance(self.hub.s.get("caractere"), dict) else {}
        theme = (self.hub.s.get("view") or {}).get("theme")
        return clean_card({"id": self.moi, "nom": car.get("nom"), "caractere": car.get("preset"), "theme": theme, "look": self.hub.s.get("look")})

    def _qr(self):
        if not self.code:
            return []
        if self.qr and self.qr[0] == self.code["code"]:
            return self.qr[1]
        try:
            import segno
            rows = ["".join("1" if c else "0" for c in row) for row in segno.make("Code d'ami Pixel : " + self.code["code"], error="m").matrix]
        except Exception:                            # noqa: BLE001 - no QR code, the words are there
            rows = []
        self.qr = (self.code["code"], rows)
        return rows

    def public(self):
        now, names = self._ms(), self._noms()
        v = self.visite
        vis = None
        if v:
            vis = {k: v[k] for k in ("vid", "sens", "ami", "etat", "t0", "jusqua", "fin", "programme", "seed", "par") if k in v}
            f = self.amis.get(v["ami"])
            vis["nom"] = names.get(v["ami"], v.get("nom", ""))
            if f:
                vis.update(look=f["look"], caractere=f["caractere"], theme=f["theme"])
        return {"dispo": self.dispo, "pourquoi": WHY.get(self.pourquoi, ""), "on": self.on, "visites": self.accepte, "demander": self.demander,
                "relais": self.relais.host, "lien": self.lien if self.on and self.dispo else "off", "max": MAX_AMIS, "moi": self.ma_carte(),
                "code": {"code": self.code["code"], **ecrit(self.code["code"]), "expire": self.code["expire"], "qr": self._qr()} if self.code else None,
                "montre": self.montre if self.montre > now and self.code else 0,
                "ajout": {k: self.ajout[k] for k in ("etat", "pourquoi", "nom", "t") if k in self.ajout} if self.ajout else None,
                "amis": [{"id": r["id"], "nom": names[r["id"]], "caractere": r["caractere"], "theme": r["theme"], "look": r["look"],
                          "depuis": r["depuis"], "vu": r["vu"], "visite": r["visite"], "n": r["n"], "coucou": r["coucou"]}
                         for r in sorted(self.amis.values(), key=lambda r: (r["depuis"], r["id"]))],
                "arrivent": [r["nom"] for r in self.attente.values()],
                "visite": vis, "evs": list(self.evs), "journal": list(self.journal)}

    def publish(self):
        self.hub.s["amis"] = self.public()
        self.hub.mark()

    def _ev(self, kind, f=None, **data):
        self.ev_id += 1
        names = self._noms()
        ev = {"id": self.ev_id, "kind": kind, "t0": self._ms(), **data}
        if f:
            ev.update(ami=f["id"], nom=names.get(f["id"], f["nom"]), look=f["look"])
        self.evs = (self.evs + [ev])[-EVS:]

    def _log(self, quoi, f=None, nom=None, **data):
        j = {"t": self._ms(), "quoi": quoi, "ami": f["id"] if f else "", "nom": nom or (self._noms().get(f["id"], f["nom"]) if f else ""), **data}
        self.journal = ([j] + self.journal)[:JOURNAL]

    # ---------- the relay: what to listen to ----------
    def _topics(self):
        by = {}
        if self.dispo and self.on:
            for r in list(self.amis.values()) + list(self.attente.values()):
                by[r["_t_in"]] = r
        self._by_topic = by
        t = set(by)
        if self.dispo and self.on:
            if self.inv and self.code and self.inv["code"] == self.code["code"]:
                t.add(self.inv["topic"])
            if self.ajout and self.ajout.get("topic") and self.ajout["etat"] in ("calcul", "attente"):
                t.add(self.ajout["topic"])
        self.relais.want(t)

    def _spawn(self, coro):
        try:
            task = asyncio.get_running_loop().create_task(coro)
        except RuntimeError:                         # no loop (a test without one): nothing goes out
            coro.close()
            return None
        self.tasks.add(task)
        task.add_done_callback(self._done)
        return task

    def _done(self, task):
        self.tasks.discard(task)
        if not task.cancelled() and task.exception():
            log.error("amis: %r", task.exception())

    def start(self):
        """The relay (it connects only when there is something to listen to), the clock, my code's keys."""
        self._spawn(self.relais.run())
        self._spawn(self.hub.every(1, self.atick, 1))
        if self.code:
            self._spawn(self._prepare_code())

    async def _prepare_code(self):
        code = self.code["code"] if self.code else None
        if not code or not self.dispo:
            return
        s = await asyncio.to_thread(relais.stretch, code)
        if self.code and self.code["code"] == code:
            self.inv = {"code": code, "S": s, "topic": relais.topic(s, "rendez-vous"), "key": relais.subkey(s, "rendez-vous")}
            self._topics()

    # ---------- sending ----------
    def _day(self):
        today = dt.date.fromtimestamp(self.now()).isoformat()
        if self.compte.get("jour") != today:
            self.compte = {"jour": today, "n": 0}
        return self.compte

    def _quota(self, kind, f):
        """May I send this now? (kind, friend): the gaps, the hourly and daily caps."""
        t = self.now()
        if kind in GAP and t - self.last_out.get((kind, f["id"]), -1e12) < GAP[kind]:
            return "trop-vite"
        if kind in PER_HOUR:
            h = self.hour_out[kind] = [x for x in self.hour_out.get(kind, []) if t - x < 3600]
            if len(h) >= PER_HOUR[kind]:
                return "limite"
        if self._day()["n"] >= DAY_MAX:
            return "limite"
        return None

    def _send(self, f, kind, cb=None, **data):
        """Seal a message to friend f and post it in the background; cb(status) once it went ("ok", "reseau", "relais")."""
        if not self.dispo or not self.on:
            return False
        t = self.now()
        self.last_out[(kind, f["id"])] = t
        if kind in PER_HOUR:
            self.hour_out.setdefault(kind, []).append(t)
        self._day()["n"] += 1
        m = {"v": 1, "k": kind, "de": self.moi, "a": f["id"], "t": self._ms(), "id": secrets.token_hex(8), **data}
        body, topic = relais.seal(f["_k_out"], f["_t_out"], m), f["_t_out"]

        async def go():
            st, _ = await self.relais.publish(topic, body)
            if cb:
                cb(st)
        self._spawn(go())
        return True

    # ---------- receiving ----------
    def on_message(self, topic, text, relay_time=None):
        """Every message the relay brings, on every topic we listen to: opened, checked, then handled."""
        if not self.dispo or not self.on or not isinstance(text, str):
            return
        t = self.now()
        q = self.rate_in[topic] = [x for x in self.rate_in.get(topic, []) if t - x < IN_RATE[1]]
        if len(q) >= IN_RATE[0]:
            self.rejets += 1
            return
        q.append(t)
        if self.inv and topic == self.inv["topic"]:
            return self._pair_in(text)
        if self.ajout and topic == self.ajout.get("topic"):
            return self._pair_answer(text)
        f = self._by_topic.get(topic)
        if not f:
            return
        m = relais.open_(f["_k_in"], topic, text)
        if not m or not self._valid(m, f):
            self.rejets += 1
            return
        self.seen[m["id"]] = m["t"]
        pending = f["id"] in self.attente
        if pending:                                  # any word from a newcomer proves he has the same key
            self._promote(f)
            if m["k"] == "merci":
                self.save()
                self.publish()
                return
        f["vu"] = self._ms()
        handler = getattr(self, "_in_" + m["k"].replace("-", "_"), None)
        if handler:
            handler(f, m)
        self.save()
        self.publish()

    def _valid(self, m, f, kinds=None):
        k, t = m.get("k"), m.get("t")
        if m.get("v") != 1 or m.get("de") != f["id"] or m.get("a") != self.moi or not isinstance(k, str) or not isinstance(t, int) or isinstance(t, bool):
            return False
        if not isinstance(m.get("id"), str) or not ID.match(m["id"]) or m["id"] in self.seen:
            return False
        now = self._ms()
        if t > now + SKEW * 1000 or t < now - AGES.get(k, MAX_AGE) * 1000:
            return False
        return k in (kinds or KINDS)

    # ---------- becoming friends ----------
    def creer_code(self):
        if not self._actif():
            return None
        now = self._ms()
        if not self.code or now >= self.code["expire"]:
            if len(self.amis) >= MAX_AMIS:
                self.hub.toast(f"Pixel a déjà {MAX_AMIS} amis : c'est le maximum.", 5000)
                return None
            self.code = {"code": nouveau_code(), "t": now, "expire": now + CODE_TTL * 1000}
            self.inv = None
            self._spawn(self._prepare_code())
            self.save()
        return self.code

    def annuler_code(self):
        self.code, self.inv, self.montre = None, None, 0
        self._topics()
        self.save()

    def _pair_in(self, text):
        """On my code's meeting topic: a newcomer's « bonjour » (sealed with the code's key)."""
        inv = self.inv
        m = relais.open_(inv["key"], inv["topic"], text)
        if not m or m.get("k") != "bonjour":                # our own « bienvenue » comes back here too: not news
            if not m:
                self.rejets += 1
            return
        card, now = clean_card(m.get("carte")), self._ms()
        mid, t = m.get("id"), m.get("t")
        if (not card or card["id"] == self.moi or m.get("de") != card["id"] or not isinstance(mid, str) or not ID.match(mid) or mid in self.seen
                or not isinstance(t, int) or t < now - PAIR_AGE * 1000 or t > now + SKEW * 1000 or not isinstance(m.get("eph"), str)):
            self.rejets += 1
            return
        self.seen[mid] = t
        if not self.code or self.code["code"] != inv["code"]:
            return
        if len(self.amis) >= MAX_AMIS and card["id"] not in self.amis:
            reply = {"v": 1, "k": "complet", "de": self.moi, "re": mid, "t": now, "id": secrets.token_hex(8)}
            self._spawn(self.relais.publish(inv["topic"], relais.seal(inv["key"], inv["topic"], reply)))
            return
        eph = relais.Ephemeral()
        shared = eph.shared(m["eph"])
        if not shared:
            self.rejets += 1
            return
        key = self._friend_key(shared, inv["S"], m["eph"], eph.pub, inv["topic"])
        rec = {**card, "cle": relais.b64u(key), "depuis": now, "vu": now, "visite": 0, "n": 0, "coucou": 0, "jusqua": now + CONFIRM_WAIT * 1000}
        old = self.amis.get(card["id"])
        if old:                                      # an old friend again (he had forgotten me): his history stays
            rec.update(depuis=old["depuis"], visite=old["visite"], n=old["n"])
        self._derive(rec)
        self.attente[card["id"]] = rec
        self.code, self.montre = None, 0             # once
        reply = {"v": 1, "k": "bienvenue", "de": self.moi, "re": mid, "t": now, "id": secrets.token_hex(8), "eph": eph.pub, "carte": self.ma_carte()}
        body = relais.seal(inv["key"], inv["topic"], reply)
        self.inv = None
        self._topics()                               # listen to his channel before he can answer on it
        self._spawn(self.relais.publish(inv["topic"], body))
        self.save()
        self.publish()

    @staticmethod
    def _friend_key(shared, stretched, eph_joiner, eph_owner, topic):
        transcript = hashlib.sha256(f"{eph_joiner}|{eph_owner}|{topic}".encode()).digest()
        return relais.hkdf(shared, b"pxa1 ami " + transcript, salt=stretched)

    def _promote(self, rec):
        rec = self.attente.pop(rec["id"], rec)
        rec.pop("jusqua", None)
        self.amis[rec["id"]] = rec
        self._topics()
        self._ev("nouvel-ami", rec)
        self._log("nouvel-ami", rec)

    def ajouter(self, text):
        """A friend's code, typed here: the meeting, in the background."""
        if not self._actif():
            return
        code, why = lire_code(text)
        now = self._ms()
        if not code:
            self.ajout = {"etat": "erreur", "pourquoi": pourquoi_code(why), "t": now}
            return self.publish()
        if self.code and self.code["code"] == code:
            self.ajout = {"etat": "erreur", "pourquoi": "C'est le code de ton Pixel ! Donne-le à ton copain : c'est lui qui le tape.", "t": now}
            return self.publish()
        if len(self.amis) >= MAX_AMIS:
            self.ajout = {"etat": "erreur", "pourquoi": f"Pixel a déjà {MAX_AMIS} amis : c'est le maximum.", "t": now}
            return self.publish()
        if self.ajout and self.ajout["etat"] in ("calcul", "attente"):
            return
        t = self.now()
        self.tries = [x for x in self.tries if t - x < TRIES[1]]
        if len(self.tries) >= TRIES[0]:
            self.ajout = {"etat": "erreur", "pourquoi": "Trop de codes essayés : attends quelques minutes.", "t": now}
            return self.publish()
        self.tries.append(t)
        self.ajout = {"etat": "calcul", "t": now, "jusqua": now + PAIR_WAIT * 1000, "code": code}
        self.publish()
        self._spawn(self._rencontre(code))

    async def _rencontre(self, code):
        a = self.ajout
        s = await asyncio.to_thread(relais.stretch, code)
        if self.ajout is not a or not self.on:
            return
        topic, key, eph, mid = relais.topic(s, "rendez-vous"), relais.subkey(s, "rendez-vous"), relais.Ephemeral(), secrets.token_hex(8)
        a.update(etat="attente", topic=topic, key=key, S=s, eph=eph, mid=mid, jusqua=self._ms() + PAIR_WAIT * 1000)
        self._topics()                               # listen first: the answer may come within a second
        hello = {"v": 1, "k": "bonjour", "de": self.moi, "t": self._ms(), "id": mid, "eph": eph.pub, "carte": self.ma_carte()}
        st, _ = await self.relais.publish(topic, relais.seal(key, topic, hello))
        if st != "ok" and self.ajout is a and a["etat"] == "attente":
            a.update(etat="erreur", pourquoi="Pixel n'arrive pas à joindre Internet. Réessaie dans un moment." if st == "reseau"
                     else "Le relais refuse pour l'instant. Réessaie dans un moment.")
            self._topics()
            self.publish()
        self.publish()

    def _pair_answer(self, text):
        """On a friend's meeting topic: his « bienvenue » (or « complet »)."""
        a = self.ajout
        if a.get("etat") != "attente":
            return
        m = relais.open_(a["key"], a["topic"], text)
        if not m:
            self.rejets += 1
            return
        if m.get("k") not in ("bienvenue", "complet") or m.get("re") != a["mid"]:
            return                                   # our own « bonjour », or someone else's meeting with the same code
        now = self._ms()
        if not isinstance(m.get("t"), int) or m["t"] < now - PAIR_AGE * 1000 or m["t"] > now + SKEW * 1000:
            self.rejets += 1
            return
        if m["k"] == "complet":
            a.update(etat="erreur", pourquoi=f"Le Pixel de ton copain a déjà {MAX_AMIS} amis.")
            self._topics()
            return self.publish()
        card = clean_card(m.get("carte"))
        shared = a["eph"].shared(m.get("eph")) if isinstance(m.get("eph"), str) else None
        if not card or card["id"] == self.moi or m.get("de") != card["id"] or not shared:
            self.rejets += 1
            return
        key = self._friend_key(shared, a["S"], a["eph"].pub, m["eph"], a["topic"])
        old = self.amis.get(card["id"])
        rec = {**card, "cle": relais.b64u(key), "depuis": old["depuis"] if old else now, "vu": now, "visite": old["visite"] if old else 0,
               "n": old["n"] if old else 0, "coucou": 0}
        self._derive(rec)
        self.amis[rec["id"]] = rec
        self.ajout = {"etat": "ok", "nom": rec["nom"], "t": now}
        self._topics()
        self._ev("nouvel-ami", rec)
        self._log("nouvel-ami", rec)
        self._send(rec, "merci")
        self.merci.append((rec["id"], self.now() + 15))     # once more in a moment: a lost « merci » would leave him half a friend
        self.save()
        self.publish()

    # ---------- what a friend says ----------
    def _in_merci(self, f, m):
        pass                                         # (a newcomer's: handled in on_message)

    def _in_carte(self, f, m):
        c = clean_card(m.get("carte"))
        if c and c["id"] == f["id"]:
            f.update(nom=c["nom"], caractere=c["caractere"], theme=c["theme"], look=c["look"])

    def _in_au_revoir(self, f, m):
        nom = self._noms().get(f["id"], f["nom"])
        self._forget(f)
        self._log("plus-ami", nom=nom)
        self._topics()

    def _show(self, f, kind, m):
        """A coucou or a sticker plays its scene when it is fresh, and not again within SHOW_GAP s for the same friend."""
        if self._ms() - m["t"] >= FRESH * 1000 or self.now() - self.shown.get((f["id"], kind), -1e12) <= SHOW_GAP:
            return False
        self.shown[(f["id"], kind)] = self.now()
        return True

    def _in_coucou(self, f, m):
        f["coucou"] = self._ms()
        self._log("coucou-recu", f)
        if self._show(f, "coucou", m):
            self._ev("coucou", f)

    def _in_sticker(self, f, m):
        s = m.get("s")
        if s not in STICKERS:
            self.rejets += 1
            return
        self._log("sticker-recu", f, s=s)
        if self._show(f, "sticker", m):
            self._ev("sticker", f, s=s, sn=STICKERS[s])

    # ---------- visits: mine ----------
    def visiter(self, ami):
        """His Pixel sets off to a friend's: True, or the reason he cannot (also said in a toast)."""
        f = self._ami(ami)
        if not self._actif():
            return WHY.get(self.pourquoi, OFF_MSG) if not self.dispo else OFF_MSG
        moi = self.ma_carte()["nom"]
        if not f:
            why = f"{moi} ne connaît pas cet ami."
            self.hub.toast(why, 4000)
            return why
        nom, v, why = self._noms().get(f["id"], f["nom"]), self.visite, None
        if v and v["sens"] == "sortie":
            why = f"{moi} est déjà parti chez {self._noms().get(v['ami'], '')} !"
        elif v:
            why = f"{moi} a de la visite : il ne peut pas sortir maintenant."
        elif self._dort():
            why = f"Chut, {moi} dort. Il ira voir {nom} quand il sera réveillé !"
        elif self._exo():
            why = "Finis ton exo d'abord !"
        elif self._poche():
            why = f"{moi} est dans ta poche : rappelle-le d'abord !"
        elif self.now() < self.cooldown:
            why = f"{moi} reprend son souffle : encore quelques secondes."
        elif self._quota("visite-demande", f):
            why = f"{moi} vient d'aller frapper chez {nom} : attends un peu."
        if why:
            self.hub.toast(why, 5000)
            return why
        now, vid = self._ms(), secrets.token_hex(6)
        self.visite = {"vid": vid, "sens": "sortie", "ami": f["id"], "nom": nom, "etat": "demande", "t0": now, "jusqua": now + DEMANDE_WAIT * 1000}
        self.hub.s["anim"] = None
        self.hub.s["screen"] = "visage"              # he walks off on his face screen

        def sent(st):
            v2 = self.visite
            if st != "ok" and v2 and v2.get("vid") == vid and v2["etat"] == "demande":
                self._fin_sortie(refus="reseau")
                self.save()
                self.publish()
        self._send(f, "visite-demande", sent, vid=vid)
        self.publish()
        return True

    def rappeler(self):
        """« Reviens ! »: he comes home now (his friend's Pixel says goodbye on its screen)."""
        v = self.visite
        if not v or v["sens"] != "sortie":
            return False
        f = self.amis.get(v["ami"])
        if f:
            self._send(f, "visite-fin", vid=v["vid"], par="rappel")
        self._fin_sortie(par="rappel")
        self.save()
        self.publish()
        return True

    def _in_visite_attente(self, f, m):
        v = self.visite
        if v and v["sens"] == "sortie" and v["ami"] == f["id"] and v["vid"] == m.get("vid") and v["etat"] == "demande":
            v.update(etat="attente", jusqua=self._ms() + (QUESTION_WAIT + 15) * 1000)

    def _in_visite_ok(self, f, m):
        v = self.visite
        if v and v["sens"] == "sortie" and v["ami"] == f["id"] and v["vid"] == m.get("vid") and v["etat"] in ("demande", "attente"):
            dur = _int(m.get("dur"), 10, 900, VISITE_S)
            now = self._ms()
            v.update(etat="chez", chez=now, fin=now + dur * 1000, jusqua=now + (dur + RETOUR_GRACE) * 1000)

    def _in_visite_non(self, f, m):
        v = self.visite
        if v and v["sens"] == "sortie" and v["ami"] == f["id"] and v["vid"] == m.get("vid"):
            self._fin_sortie(refus=m.get("pourquoi") if m.get("pourquoi") in REFUS else "non")

    def _in_visite_fin(self, f, m):
        v = self.visite
        if not v or v["ami"] != f["id"] or v["vid"] != m.get("vid"):
            return
        if v["sens"] == "sortie":
            fait = [x for x in m.get("fait") if x in FAIT][:12] if isinstance(m.get("fait"), list) else []
            self._fin_sortie(fait=fait, par=m.get("par") if m.get("par") in ("fin", "hote") else "fin")
        elif v["etat"] == "question":
            self.visite = None
        elif v["etat"] == "chez":
            self._au_revoir_maintenant("rappel")      # his family called him back

    def _fin_sortie(self, fait=None, refus=None, par=None):
        v, self.visite = self.visite, None
        if not v:
            return
        f = self.amis.get(v["ami"])
        nom = self._noms().get(v["ami"], v.get("nom", ""))
        self.cooldown = self.now() + COOLDOWN
        self.hub.s["anim"] = None
        self.hub.s["screen"] = "visage"              # he comes home on his face screen
        who = {} if f else {"nom": nom}                 # a friend forgotten meanwhile: still his name on the way home
        if refus:
            self._ev("retour", f, refus=refus, **who)
            self._log("refus", f, nom=nom, refus=refus)
            return
        went = v["etat"] == "chez"
        self._ev("retour", f, fait=fait or [], par=par or "fin", **who)
        if f and went:
            f["visite"], f["n"] = self._ms(), f["n"] + 1
        if went or fait:
            self._log("visite", f, nom=nom, fait=fait or [])
            h = histoire(fait, nom, eux=True)
            self._souvenir(f"{self.ma_carte()['nom']} est allé jouer chez {nom}" + (f" : {h}." if h else "."))

    # ---------- visits: a friend's ----------
    def _refus(self, f):
        """Why a friend's Pixel cannot come now (REFUS), or None."""
        if not self.accepte:
            return "ferme"
        if self._dort():
            return "dort"
        v = self.visite
        if v and v["sens"] == "sortie":
            return "croise" if v["ami"] == f["id"] and v["etat"] in ("demande", "attente") else "absent"
        if v:
            return "visite"
        if self._poche():
            return "absent"
        if self._cast():
            return "occupe"
        if self._exo():
            return "exo"
        return None

    def _in_visite_demande(self, f, m):
        vid = m.get("vid")
        if not isinstance(vid, str) or not VID.match(vid):
            self.rejets += 1
            return
        why = self._refus(f)
        if why == "croise":                          # we both set off at the same time: both come home (« on s'est croisés ! »)
            self._fin_sortie(refus="croise")
        if why:
            self._send(f, "visite-non", vid=vid, pourquoi=why)
            self._log("refuse", f, refus=why)
            return
        if self.demander:
            self.visite = {"vid": vid, "sens": "accueil", "ami": f["id"], "nom": f["nom"], "etat": "question", "t0": self._ms(),
                           "jusqua": self._ms() + QUESTION_WAIT * 1000}
            self._send(f, "visite-attente", vid=vid)
            self._ev("question", f)
            self.hub.s["screen"] = "visage"
            return
        self._accueillir(f, vid)

    def _accueillir(self, f, vid):
        prog, total = programme(self.visite_ms, self._tard())
        t0 = self._ms() + 400
        self.visite = {"vid": vid, "sens": "accueil", "ami": f["id"], "nom": f["nom"], "etat": "chez", "t0": t0, "fin": t0 + total,
                       "programme": prog, "seed": secrets.randbelow(1 << 30)}
        self._send(f, "visite-ok", vid=vid, dur=math.ceil(total / 1000) + 1)
        self.hub.s["anim"] = None
        self.hub.s["screen"] = "visage"              # his friend comes in on his face screen

    def repondre(self, vid, oui):
        """« Bip veut venir jouer ! »: yes or no, from the Pi's screen or the phone."""
        v = self.visite
        if not v or v["sens"] != "accueil" or v["etat"] != "question" or v["vid"] != vid:
            return False
        f = self.amis.get(v["ami"])
        if not f:
            self.visite = None
            return False
        if oui:
            self._accueillir(f, vid)
        else:
            self.visite = None
            self._send(f, "visite-non", vid=vid, pourquoi="non")
            self._log("refuse", f, refus="non")
        self.save()
        self.publish()
        return True

    def raccompagner(self):
        """The host's family says goodbye early: the visitor waves and walks home."""
        v = self.visite
        if not v or v["sens"] != "accueil":
            return False
        if v["etat"] == "question":
            return self.repondre(v["vid"], False)
        self._au_revoir_maintenant("hote")
        self.publish()
        return True

    def _au_revoir_maintenant(self, par):
        v = self.visite
        now = self._ms()
        e = now - v["t0"]
        if any(it["id"] == "ami-aurevoir" and it["at"] <= e + 1000 for it in v["programme"]):
            return                                   # already saying goodbye
        v["programme"] = [it for it in v["programme"] if it["at"] <= e] + [{"id": "ami-aurevoir", "at": max(0, e) + 300}]
        v["fin"] = v["t0"] + max(0, e) + 300 + DUREES["ami-aurevoir"]
        v["par"] = par

    def _fin_accueil(self):
        v, self.visite = self.visite, None
        f = self.amis.get(v["ami"])
        e = self._ms() - v["t0"]
        fait = [it["id"] for it in v["programme"] if it["at"] <= e and it["id"] in FAIT]
        if f:
            if v.get("par") != "rappel":
                self._send(f, "visite-fin", vid=v["vid"], fait=fait, par=v.get("par") or "fin")
            f["visite"], f["n"] = self._ms(), f["n"] + 1
        nom = self._noms().get(v["ami"], v.get("nom", ""))
        self._log("accueil", f, nom=nom, fait=fait)
        h = histoire(fait, nom, eux=True)
        self._souvenir(f"{nom} est venu jouer chez {self.ma_carte()['nom']}" + (f" : {h}." if h else "."))

    # ---------- coucous, stickers, goodbye ----------
    def coucou(self, ami):
        f = self._ami(ami)
        if not f or not self._actif():
            return False
        nom = self._noms().get(f["id"], f["nom"])
        q = self._quota("coucou", f)
        if q:
            self.hub.toast("Doucement : ton coucou est déjà parti !" if q == "trop-vite" else "Beaucoup de coucous aujourd'hui : on fait une pause.", 4000)
            return False
        self._send(f, "coucou", lambda st: st == "ok" or self.hub.toast(f"Le coucou pour {nom} n'est pas parti : pas d'Internet ?", 5000))
        self._ev("envoi", f)
        self._log("coucou-envoye", f)
        self.save()
        self.publish()
        return True

    def sticker(self, ami, s):
        f = self._ami(ami)
        if not f or s not in STICKERS or not self._actif():
            return False
        nom = self._noms().get(f["id"], f["nom"])
        q = self._quota("sticker", f)
        if q:
            self.hub.toast("Doucement : ton autocollant est déjà parti !" if q == "trop-vite" else "Beaucoup d'autocollants aujourd'hui : on fait une pause.", 4000)
            return False
        self._send(f, "sticker", lambda st: st == "ok" or self.hub.toast(f"L'autocollant pour {nom} n'est pas parti : pas d'Internet ?", 5000), s=s)
        self._ev("envoi", f, s=s, sn=STICKERS[s])
        self._log("sticker-envoye", f, s=s)
        self.save()
        self.publish()
        return True

    def retirer(self, ami):
        f = self._ami(ami)
        if not f:
            return False
        nom = self._noms().get(f["id"], f["nom"])
        if self.dispo and self.on:
            self._send(f, "au-revoir")               # his Pixel forgets the key too (if it hears it: messages expire after 12 h)
        self._forget(f)
        self._log("retire", nom=nom)
        self._topics()
        self.save()
        self.publish()
        self.hub.toast(f"{nom} n'est plus dans ses amis.", 4000)
        return True

    def _forget(self, f):
        v = self.visite
        if v and v["ami"] == f["id"]:
            if v["sens"] == "sortie":
                self._fin_sortie(fait=[], par="fin")
            else:
                self.visite = None
        self.amis.pop(f["id"], None)
        self.attente.pop(f["id"], None)
        for j in self.journal:                       # his name stays in the journal (the child's history), his id goes
            if j.get("ami") == f["id"]:
                j["ami"] = ""
        self.evs = [e for e in self.evs if e.get("ami") != f["id"]]

    def reglages(self, on=None, visites=None, demander=None):
        if isinstance(visites, bool):
            self.accepte = visites
        if isinstance(demander, bool):
            self.demander = demander
        if isinstance(on, bool) and on != self.on:
            self.on = on
            if not on:                                # everything stops: he comes home, nobody comes in, nothing is heard
                v = self.visite
                if v and v["sens"] == "sortie":
                    self._fin_sortie(fait=[], par="fin")
                self.visite, self.ajout, self.montre = None, None, 0
        self._topics()
        self.save()
        self.publish()

    def montrer(self, on=True):
        if not on:
            self.montre = 0
        elif self.creer_code():
            self.montre = self._ms() + MONTRE_MS
            self.hub.s["anim"] = None
            self.hub.s["screen"] = "visage"
        self.publish()

    # ---------- the clock ----------
    def tick(self):
        now, t = self._ms(), self.now()
        if self.code and now >= self.code["expire"]:
            self.code, self.inv = None, None
            self._topics()
        if self.montre and now >= self.montre:
            self.montre = 0
        a = self.ajout
        if a and a["etat"] in ("calcul", "attente") and now > a["jusqua"]:
            self.ajout = {"etat": "erreur", "t": now, "pourquoi": "Le Pixel de ton copain ne répond pas. Il doit être allumé, et son code valable (24 h, une seule fois)."}
            self._topics()
        elif a and a["etat"] in ("ok", "erreur") and now > a["t"] + 120000:
            self.ajout = None
        for i, p in list(self.attente.items()):
            if now > p.get("jusqua", 0):
                del self.attente[i]
                self._topics()
        for i, at in list(self.merci):
            if t >= at:
                self.merci.remove((i, at))
                if i in self.amis:
                    self._send(self.amis[i], "merci")
        v = self.visite
        if v and v["sens"] == "sortie":
            if v["etat"] in ("demande", "attente") and now > v["jusqua"]:
                self._fin_sortie(refus="pas-de-reponse")
            elif v["etat"] == "chez" and now > v["jusqua"]:
                self._fin_sortie(fait=[], par="temps")
        elif v and v["etat"] == "question" and now > v["jusqua"]:
            f = self.amis.get(v["ami"])
            self.visite = None
            if f:
                self._send(f, "visite-non", vid=v["vid"], pourquoi="pas-repondu")
                self._log("refuse", f, refus="pas-repondu")
        elif v and v["etat"] == "chez" and now >= v["fin"]:
            self._fin_accueil()
        self._card_check()
        if self.seen and now % 60000 < 1000:
            horizon = now - (MAX_AGE + SKEW) * 1000
            self.seen = {k: x for k, x in self.seen.items() if x > horizon}
        state = json.dumps([self.code, self.montre, self.ajout and self.ajout.get("etat"), sorted(self.attente), self.visite and [self.visite.get("etat"), self.visite.get("vid")], len(self.amis)], default=str)
        if state != getattr(self, "_tick_state", None):
            self._tick_state = state
            self.save()
            self.publish()

    async def atick(self):
        self.tick()

    def _card_check(self):
        """A new name, preset, theme or look: my friends get my new card (not more than every CARD_GAP s)."""
        if not self.amis or not self.dispo or not self.on:
            return
        card = json.dumps(self.ma_carte(), sort_keys=True)
        if card == self.card_key or self.now() - self.card_last < CARD_GAP or self._day()["n"] > DAY_MAX - 2 * len(self.amis):
            return
        self.card_key, self.card_last = card, self.now()
        for f in list(self.amis.values()):
            self._send(f, "carte", carte=json.loads(card))

    # ---------- the world around him (other features, read defensively) ----------
    def _dort(self):
        h = self.hub.s.get("habitudes")
        if isinstance(h, dict):
            if isinstance(h.get("dort"), bool):
                return h["dort"]
            if isinstance(h.get("etat"), str):
                return h["etat"] in ("dort", "sieste", "nuit", "dodo")
        car = self.hub.s.get("caractere") if isinstance(self.hub.s.get("caractere"), dict) else {}
        q = car.get("calme") if isinstance(car.get("calme"), dict) else {}
        de, a, hr = _int(q.get("de"), 0, 23, 23), _int(q.get("a"), 0, 23, 6), self._hour()
        if de == a:
            return False
        return hr >= de or hr < a if de > a else de <= hr < a

    def _tard(self):
        hr = self._hour()
        return 20 <= hr or hr < 5

    def _cast(self):
        c = self.hub.s.get("cast")
        return bool(isinstance(c, dict) and c.get("id") and (not c.get("until") or c["until"] > self._ms()))

    def _exo(self):
        ex = getattr(self.hub, "exos", None)
        c = getattr(ex, "cur", None) if ex is not None else None
        return bool(isinstance(c, dict) and c.get("etat") == "question")

    def _poche(self):
        p = self.hub.s.get("poche")
        v = p.get("voyage") if isinstance(p, dict) else None
        return bool(isinstance(v, dict) and v.get("to") == "poche" and v.get("until", 0) > self._ms())

    def _souvenir(self, texte):
        """A memory for his album (souvenirs.ajoute, when that feature is there), never in the way."""
        fn = self.hub.actions.get("souvenirs.ajoute")
        if not fn:
            return

        async def go():
            try:
                await fn(type="ami", texte=texte[:200], t=self._ms())      # « ami »: souvenirs.py's own type (its first-visit record, its icon)
            except Exception:                        # noqa: BLE001 - another feature's business
                log.info("souvenirs.ajoute refused the memory")
        self._spawn(go())

    # ---------- helpers ----------
    def _actif(self):
        if not self.dispo:
            self.hub.toast(WHY.get(self.pourquoi, "Les amis de Pixel ne sont pas disponibles."), 6000)
            return False
        if not self.on:
            self.hub.toast(OFF_MSG, 6000)
            return False
        return True

    def _ami(self, ami):
        """A friend by his id, or by his name as shown (« Bip », « Pixel 2 »), any case or accent."""
        if not isinstance(ami, str) or not ami.strip():
            return None
        if ami in self.amis:
            return self.amis[ami]
        k = norm(ami)
        for i, n in self._noms().items():
            if norm(n) == k:
                return self.amis[i]
        return None

    def liste(self):
        names = self._noms()
        if not self.amis:
            return ""
        return ", ".join(names[r["id"]] for r in sorted(self.amis.values(), key=lambda r: r["depuis"]))


KINDS = ("merci", "carte", "au-revoir", "coucou", "sticker", "visite-demande", "visite-attente", "visite-ok", "visite-non", "visite-fin")


# ---------- typed commands (pixel/commands.py asks them last, just before Claude) ----------
_VOIR = re.compile(r"^(?:va|vas|aller|pars|file|cours)\s+(?:voir|chez|jouer avec|jouer chez|rendre visite a)\s+(.+)$|^(?:rends|rend)\s+visite\s+a\s+(.+)$")
_COUCOU = re.compile(r"^(?:dis|fais|fait|envoie|envoies)(?: un)?\s+(?:petit\s+)?coucou\s+a\s+(.+)$")
_STICKER = re.compile(r"^(?:envoie|envoies)\s+(?:un |une |des )?(.+?)\s+a\s+(.+)$")
_AJOUTE = re.compile(r"^(?:ajoute|ajouter|nouvel|nouveau)(?:\s+(?:l'|un |le |mon ))?\s*ami\s*:?\s*(.*)$")
STICKER_WORDS = {}
for _i, _n in STICKERS.items():
    for _w in (_i, norm(_n), re.sub(r"^(?:un|une|des) ", "", norm(_n))):
        STICKER_WORDS.setdefault(_w, _i)
for _w, _i in {"coeurs": "coeur", "etoiles": "etoile", "pouce": "pouce", "fleurs": "fleur", "gateaux": "gateau", "note": "musique", "rire": "rire",
               "arc en ciel": "arc", "arc-en-ciel": "arc", "bisous": "bisou", "cadeaux": "cadeau", "fusees": "fusee"}.items():
    if _i in STICKERS:
        STICKER_WORDS.setdefault(_w, _i)


async def command(hub, raw, t):
    """« va voir Bip », « dis coucou à Bip », « envoie un cœur à Bip », « mes amis », « mon code d'ami », « ajoute l'ami
    lapin soleil tarte 4271 », « reviens ». Conservative: a name must be one of his friends', else it is for Claude."""
    A = getattr(hub, "amis", None)
    if A is None:
        return False
    t = re.sub(r"\s+", " ", t.replace("’", "'")).strip(" !?.")
    if t in ("mes amis", "tes amis", "ses amis", "les amis", "liste des amis", "liste de mes amis", "amis", "tes amis pixel", "mes amis pixel"):
        if not A.dispo:
            hub.toast(WHY.get(A.pourquoi, ""), 6000)
        elif not A.amis:
            hub.toast("Pas encore d'ami Pixel. Sur ton téléphone, « Ses amis » : donne ton code d'ami à un copain, ou tape le sien.", 9000)
        else:
            first = A.liste().split(", ")[0]
            hub.toast(f"Ses amis : {A.liste()}. Tape « va voir {first} », « dis coucou à {first} ».", 9000)
        return True
    if re.fullmatch(r"(?:mon |ton |son |le )?code(?: d'| d | de l')?ami", t):
        A.montrer(True)
        return True
    m = _AJOUTE.match(t)
    if m:
        if not m.group(1).strip():
            hub.toast("Tape le code de ton copain après « ajoute l'ami », par exemple « ajoute l'ami lapin soleil tarte 4271 ».", 7000)
            return True
        A.ajouter(m.group(1))
        if A.ajout and A.ajout.get("etat") == "erreur":
            hub.toast(A.ajout["pourquoi"], 7000)
        return True
    if t in ("reviens", "rentre", "rentre a la maison", "reviens a la maison", "reviens vite", "rentre vite") and A.visite and A.visite["sens"] == "sortie":
        A.rappeler()
        return True
    m = _VOIR.match(t)
    if m:
        f = A._ami(m.group(1) or m.group(2))
        if not f:
            return False
        A.visiter(f["id"])
        return True
    m = _COUCOU.match(t)
    if m:
        f = A._ami(m.group(1))
        if not f:
            return False
        A.coucou(f["id"])
        return True
    m = _STICKER.match(t)
    if m and m.group(1) in STICKER_WORDS:
        f = A._ami(m.group(2))
        if not f:
            return False
        A.sticker(f["id"], STICKER_WORDS[m.group(1)])
        return True
    return False


# ---------- Claude (pixel/claude.py adds TOOL, and asks check_tool() and run_tool()) ----------
TOOL = {"name": "pixel_friends", "eager_input_streaming": True,
        "description": "Tes amis Pixel : les Pixels des copains, chacun chez lui. « liste » les donne ; « visite » t'envoie jouer quelques "
                       "minutes chez l'un d'eux (son Pixel dit oui ou non, et tu rentres raconter) ; « coucou » lui fait coucou sur son écran. "
                       "ami : son nom, tel que la liste le donne. Tu ne peux ni ajouter ni retirer un ami, ni lui écrire.",
        "input_schema": {"type": "object", "additionalProperties": False, "required": ["action"], "properties": {
            "action": {"type": "string", "enum": ["liste", "visite", "coucou"]}, "ami": {"type": "string", "maxLength": 24}}}}


def check_tool(a):
    if not isinstance(a, dict) or a.get("action") not in ("liste", "visite", "coucou") or set(a) - {"action", "ami"}:
        return "entrée invalide pour pixel_friends : " + json.dumps(a, ensure_ascii=False)
    if a["action"] != "liste" and not (isinstance(a.get("ami"), str) and 0 < len(a["ami"]) <= 24):
        return "pixel_friends : il faut le nom de l'ami (ami)"
    return None


async def run_tool(hub, a):
    A = getattr(hub, "amis", None)
    if A is None or not A.dispo:
        return "les amis Pixel ne sont pas disponibles sur ce Pixel"
    if not A.on:
        return "les amis Pixel sont éteints (réglage des parents, dans « Ses amis »)"
    if a["action"] == "liste":
        if not A.amis:
            return "tu n'as pas encore d'ami Pixel : sur le téléphone, « Ses amis », un code d'ami se partage avec un copain"
        names = A._noms()
        parts = []
        for r in sorted(A.amis.values(), key=lambda r: r["depuis"]):
            when = f", dernière visite le {dt.datetime.fromtimestamp(r['visite'] / 1000):%d/%m}" if r["visite"] else ""
            parts.append(f"{names[r['id']]} (caractère {caractere.PRESETS.get(r['caractere'], ('sur mesure',))[0].lower()}{when})")
        return "tes amis : " + " ; ".join(parts)
    f = A._ami(a["ami"])
    if not f:
        return f"tu n'as pas d'ami qui s'appelle {caractere.clean_name(a['ami'], 24)} ; tes amis : {A.liste() or 'aucun'}"
    if a["action"] == "coucou":
        return "coucou envoyé" if A.coucou(f["id"]) is True else "le coucou n'est pas parti (trop de coucous d'un coup ?)"
    r = A.visiter(f["id"])
    if r is True:
        return f"tu pars chez {A._noms()[f['id']]} : son Pixel va répondre, puis tu rentreras raconter"
    return f"tu ne peux pas y aller maintenant : {r}"


def setup(hub, datadir=None, cfg=None):
    """The friends: amis.json, the actions amis.*, the relay and the clock (when there is a running loop)."""
    datadir = Path(datadir) if datadir else Path(os.path.expanduser(hub.cfg.get("data_dir", "~/.config/pixel")))
    A = Amis(hub, datadir, hub.cfg.get("amis", {}) if cfg is None else cfg)
    hub.amis = A

    @hub.action("amis.code")
    async def code():
        """My friendship code (a new one if there is none): three words and a number, 24 h, once."""
        A.creer_code()
        A.publish()

    @hub.action("amis.code_annule")
    async def code_annule():
        A.annuler_code()
        A.publish()

    @hub.action("amis.montre")
    async def montre(on=True):
        """The code, big, on the Pi's screen (on=False: put away)."""
        A.montrer(on is not False)

    @hub.action("amis.ajoute")
    async def ajoute(code=""):
        """A friend's code, typed here."""
        A.ajouter(str(code)[:300])

    @hub.action("amis.ajout_ok")
    async def ajout_ok():
        A.ajout = None
        A.publish()

    @hub.action("amis.visite")
    async def visite(ami=""):
        A.visiter(str(ami)[:40])

    @hub.action("amis.rappel")
    async def rappel():
        A.rappeler()

    @hub.action("amis.raccompagne")
    async def raccompagne():
        A.raccompagner()

    @hub.action("amis.reponse")
    async def reponse(vid="", oui=False):
        A.repondre(str(vid)[:20], oui is True)

    @hub.action("amis.coucou")
    async def coucou(ami=""):
        A.coucou(str(ami)[:40])

    @hub.action("amis.sticker")
    async def sticker(ami="", s=""):
        A.sticker(str(ami)[:40], str(s)[:20])

    @hub.action("amis.retire")
    async def retire(ami=""):
        A.retirer(str(ami)[:40])

    @hub.action("amis.reglages")
    async def reglages(on=None, visites=None, demander=None):
        A.reglages(on if isinstance(on, bool) else None, visites if isinstance(visites, bool) else None, demander if isinstance(demander, bool) else None)

    A.publish()
    try:
        asyncio.get_running_loop()
        A.start()
    except RuntimeError:                             # no loop (a test): the caller ticks, nothing goes out
        pass
    return A
