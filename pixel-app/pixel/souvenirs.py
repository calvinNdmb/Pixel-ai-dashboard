"""Ses souvenirs et le carnet d'humeur: Pixel remembers you, and asks how you are.

Souvenirs (snapshot "souvenirs", file data_dir/souvenirs.json):
- your birthday (day and month: never the year), set in the phone's « Souvenirs » panel, by a typed command (« mon
  anniversaire c'est le 12 mars »), by Claude, or when he asks once, gently (« C'est quand ton anniversaire ? »: the
  screens ask, souvenirs.demande marks it asked for good). A 29 February birthday is kept on 28 February in the other years;
- « le jour de notre rencontre »: Pixel's first start (the oldest file of data_dir, or now), editable;
- the celebrations of today, "fete": 'anniversaire' (your birthday) | 'rencontre' (a yearly day you met) | None, read by the
  other features (a party hat...); aujourdhui {mois: a monthly day you met, ans, jours: 100, 200... days together};
- his records, read from the other features' snapshots, defensively ("exos": the best streak, the 60 s challenge, the
  trophies; "nourrir": his very first meal): a new one becomes a memory (and the screens take a photo of it, web/album.js);
- a timeline of memories, newest first, TIMELINE_MAX at most (the oldest go first, never a pinned one). Other features add
  theirs with souvenirs.ajoute {type, texte, t} (a friend's visit...), checked and capped.
Le carnet d'humeur (snapshot "humeur", file data_dir/humeur.json, private: never in Claude's prompt; get_status and his tool
see it only when « Claude peut savoir comment je vais » is on, off by default; the phone does not keep it, web/app.js):
- once a day, from "heure" (17:00 by default), from the day after you met (the first day, he gets to know you), never at
  night (21 h - 7 h) nor while he sleeps (his schedule: his bedtime routine, his night, his nap; with it off or paused, his
  quiet hours, caractère "calme": asleep()), nor during a game or a friend's visit (occupe(): it waits for their end, as
  for an exercise), he asks « Comment tu vas aujourd'hui ? »: Pixel's own screen
  asks when someone is there (humeur.pose), at most ASKS_MAX times a day, ASK_GAP apart, QUESTION_S each; an answer from
  any screen, the panel or a typed command (« je suis triste ») is the day's mood: one of MOODS, and a few CHIPS;
- he reacts (web/scenes/souvenirs.js), and remembers: "hier" (the last day before today, within 2 days) for « Hier… ça va
  mieux ? ». JOURS_MAX days are kept, the last JOURS_SNAP go to the screens (the panel's week and month).
Actions: souvenirs.anniversaire {jour, mois} (null: forget), souvenirs.rencontre {date}, souvenirs.demande, souvenirs.ajoute
{type, texte, t, epingle}, souvenirs.epingle {id, on}, souvenirs.efface {id}, souvenirs.raconte, souvenirs.fete;
humeur.note {m, chips}, humeur.pose, humeur.plustard, humeur.reglages {on, heure, claude}, humeur.efface.
Both files are readable by their owner only (0600); one that cannot be read (not JSON, values of the wrong type) is put
aside (souvenirs.json.illisible, humeur.json.illisible) and never written over, and the other one is kept as it is.
The album (photos) is pixel/album.py. The same rules for Pixel Lab and Pixel sans Pi: web/souvenirs.js (PixelSouvenirs.rules).
"""
import asyncio
import calendar
import datetime as dt
import json
import logging
import math
import os
import re
import time
import unicodedata
from pathlib import Path

log = logging.getLogger("pixel.souvenirs")

TIMELINE_MAX, PINNED_MAX, TEXT_MAX = 200, 40, 100
TEXT_IN = 1000                            # characters of a memory's text looked at (souvenirs.ajoute): the rest is cut first
TYPE = re.compile(r"^[a-z][a-z0-9-]{0,23}$")
T_MIN = 946684800000                      # 2000-01-01 (ms): a time before it is not a time
RENCONTRE_MIN = dt.date(2020, 1, 1)
MILESTONES = (100, 200, 300, 500, 1000, 1500, 2000, 3000)
ADD_GAP_S, ADD_PER_HOUR = 2.0, 30         # souvenirs.ajoute: other features, not too often
PHOTO_WAIT_S = 15 * 60                    # a visit's photo waits that long for the visit's memory (a visit: 10 min at most)
MOODS = (("super", "Super", "😄"), ("bien", "Bien", "🙂"), ("bof", "Bof", "😐"), ("triste", "Triste", "😢"), ("colere", "En colère", "😠"))
MOOD = {m: label for m, label, _ in MOODS}
CHIPS = (("ecole", "École"), ("copains", "Copains"), ("famille", "Famille"), ("fatigue", "Fatigue"), ("sport", "Sport"),
         ("jeux", "Jeux"), ("dehors", "Dehors"), ("animaux", "Animaux"))
CHIP = dict(CHIPS)
CHIPS_MAX = 4
HEURE, HEURE_MIN, HEURE_MAX = 17 * 60, 7 * 60, 20 * 60 + 30     # minutes after midnight, by quarters of an hour
NIGHT = (21, 7)                           # he never asks how you are then, whatever his quiet hours
ASKS_MAX, ASK_GAP_S, QUESTION_S = 2, 3600, 150
JOURS_MAX, JOURS_SNAP = 400, 42
ANNIV_AFTER_S = 2 * 3600                  # he asks your birthday once, not in his very first hours
MOIS = ("janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre")


def _ms(clock):
    return clock() * 1000


def _int(v, lo, hi):
    """An integer in [lo, hi] (an integral float too), or None: not a bool, not NaN or infinity (json reads 1e400 as inf)."""
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    if isinstance(v, float) and (not math.isfinite(v) or v != int(v)):
        return None
    v = int(v)
    return v if lo <= v <= hi else None


def _num(v, default):
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return default
    try:
        v = float(v)
    except OverflowError:
        return default
    return v if math.isfinite(v) else default


def clean_text(v, n=TEXT_MAX):
    """One line of plain text, n characters at most (cut with …); '' for anything that is not text."""
    if not isinstance(v, str):
        return ""
    s = re.sub(r"\s+", " ", "".join(c if c.isprintable() else " " for c in unicodedata.normalize("NFC", v))).strip()
    return s if len(s) <= n else s[:n - 1].rstrip() + "…"


def norm(s):
    s = unicodedata.normalize("NFD", str(s).lower().strip())
    return "".join(c for c in s if unicodedata.category(c) != "Mn").replace("’", "'").replace("œ", "oe")


# ---------- dates (the same in web/souvenirs.js; tests/test_souvenirs.js compares them) ----------
def dim(y, m):
    return calendar.monthrange(y, m)[1]


def valid_day(jour, mois):
    """A birthday: a day that exists in some year (29 February too)."""
    return _int(mois, 1, 12) is not None and _int(jour, 1, dim(2024, int(mois))) is not None


def birthday_in(year, jour, mois):
    """The day of a birthday in a year: a 29 February one is kept on 28 February in the other years."""
    return dt.date(year, mois, min(jour, dim(year, mois)))


def next_birthday(today, jour, mois):
    d = birthday_in(today.year, jour, mois)
    return d if d >= today else birthday_in(today.year + 1, jour, mois)


def months_since(d0, today):
    """Whole months from d0 to today: the monthly day is d0's day, or the month's last day when it is shorter."""
    n = (today.year - d0.year) * 12 + today.month - d0.month
    return n - 1 if today.day < min(d0.day, dim(today.year, today.month)) else n


def month_day(d0, n):
    y, m = divmod(d0.month - 1 + n, 12)
    y += d0.year
    return dt.date(y, m + 1, min(d0.day, dim(y, m + 1)))


def fete(today, anniv=None, rencontre=None):
    """Today's celebrations: {fete: 'anniversaire' | 'rencontre' | None, mois, ans, jours} (0: none of them)."""
    out = {"fete": None, "mois": 0, "ans": 0, "jours": 0}
    if anniv and today == birthday_in(today.year, anniv["jour"], anniv["mois"]):
        out["fete"] = "anniversaire"
    if rencontre and today > rencontre:
        n = months_since(rencontre, today)
        if n >= 1 and month_day(rencontre, n) == today:
            if n % 12 == 0:
                out["ans"] = n // 12
                out["fete"] = out["fete"] or "rencontre"
            else:
                out["mois"] = n
        days = (today - rencontre).days
        if days in MILESTONES:
            out["jours"] = days
    return out


def date_text(jour, mois, year=None):
    return f"le {'1er' if jour == 1 else jour} {MOIS[mois - 1]}" + (f" {year}" if year else "")


def in_quiet(h, calme):
    """His quiet hours (caractère "calme" {de, a}: 23 h to 6 h by default; de == a: none)."""
    c = calme if isinstance(calme, dict) else {}
    de, a = _int(c.get("de"), 0, 23), _int(c.get("a"), 0, 23)
    de, a = (23 if de is None else de), (6 if a is None else a)
    if de == a:
        return False
    return (h >= de or h < a) if de > a else de <= h < a


def asleep(hub, heure=None):
    """He sleeps: by his schedule, from his bedtime routine to his wake-up and during his nap; with it off or paused (the
    demo), his quiet hours (caractère "calme"). One rule for every feature: pixel/habitudes.py endormi()."""
    from .habitudes import endormi
    return endormi(hub.s, dt.datetime.now().hour if heure is None else heure)


def occupe(hub):
    """A game (pixel/habitudes.py) or a friend's visit (pixel/amis.py: here, knocking, or he is away) holds his screen:
    (kind, name) with kind 'jeu', 'visite' or 'sortie', else None. His question, his party, his memories and the album wait
    for its end, as for an exercise (read defensively)."""
    h, a = hub.s.get("habitudes"), hub.s.get("amis")
    if isinstance(h, dict) and isinstance(h.get("partie"), dict):
        return ("jeu", "")
    v = a.get("visite") if isinstance(a, dict) else None
    if isinstance(v, dict):
        nom = v["nom"] if isinstance(v.get("nom"), str) and v["nom"] else "mon ami"
        return ("sortie" if v.get("sens") == "sortie" else "visite", nom)
    return None


# ---------- the files, cleaned when read: a broken or hand-edited file never stops Pixel ----------
def clean_entry(e):
    if not isinstance(e, dict):
        return None
    i, t, typ, texte = _int(e.get("id"), 0, 10**12), _num(e.get("t"), None), e.get("type"), clean_text(e.get("texte"))
    if i is None or t is None or not (T_MIN <= t <= 4102444800000) or not isinstance(typ, str) or not TYPE.match(typ) or not texte:
        return None
    photo = e.get("photo") if isinstance(e.get("photo"), str) and re.fullmatch(r"[A-Za-z0-9_-]{4,16}", e.get("photo")) else None
    return {"id": i, "t": t, "type": typ, "texte": texte, "epingle": e.get("epingle") is True, "photo": photo}


def clean_souvenirs(d):
    d = d if isinstance(d, dict) else {}
    out = {"v": 1, "anniv": None, "demande": 0, "rencontre": None, "rencontre_auto": True, "debut": 0,
           "records": {"serie_max": 0, "record_chrono": 0, "trophees": [], "premier_repas": None, "premier_trophee": None, "premier_ami": None, "vu": {}},
           "timeline": [], "fetes": {}}
    a = d.get("anniv")
    if isinstance(a, dict) and valid_day(a.get("jour"), a.get("mois")):
        out["anniv"] = {"jour": int(a["jour"]), "mois": int(a["mois"])}
    out["demande"] = max(0.0, _num(d.get("demande"), 0))
    out["debut"] = max(0.0, _num(d.get("debut"), 0))
    try:
        r = dt.date.fromisoformat(d["rencontre"]) if isinstance(d.get("rencontre"), str) and len(d["rencontre"]) == 10 else None
    except ValueError:
        r = None
    if r and RENCONTRE_MIN <= r <= dt.date.today() + dt.timedelta(days=1):
        out["rencontre"] = r.isoformat()
        out["rencontre_auto"] = d.get("rencontre_auto") is not False
    rec = d.get("records") if isinstance(d.get("records"), dict) else {}
    R = out["records"]
    for k in ("serie_max", "record_chrono"):
        v = _int(rec.get(k), 0, 10**6)
        if v is not None:
            R[k] = v
    if isinstance(rec.get("trophees"), list):
        R["trophees"] = [x for x in rec["trophees"] if isinstance(x, str) and TYPE.match(x)][:50]
    for k in ("premier_repas", "premier_trophee", "premier_ami"):
        v = rec.get(k)
        if isinstance(v, dict) and isinstance(v.get("id"), str) and TYPE.match(v["id"]):
            R[k] = {"id": v["id"], "label": clean_text(v.get("label"), 40), "t": _num(v.get("t"), 0)}
    if isinstance(rec.get("vu"), dict):
        R["vu"] = {k: True for k in ("exos", "nourrir") if rec["vu"].get(k) is True}
    seen, tl = set(), []
    for e in d.get("timeline") if isinstance(d.get("timeline"), list) else []:
        e = clean_entry(e)
        if e and e["id"] not in seen:
            seen.add(e["id"])
            tl.append(e)
    out["timeline"] = sorted(tl, key=lambda e: (-e["t"], -e["id"]))
    if isinstance(d.get("fetes"), dict):
        out["fetes"] = {k: v for k, v in d["fetes"].items() if isinstance(k, str) and TYPE.match(k) and isinstance(v, str) and len(v) <= 16}
    trim(out["timeline"])
    return out


def trim(tl):
    """TIMELINE_MAX memories at most: the oldest go, never a pinned one (PINNED_MAX of them at most)."""
    pinned = [e for e in tl if e["epingle"]]
    for e in sorted(pinned, key=lambda e: e["t"])[:max(0, len(pinned) - PINNED_MAX)]:
        e["epingle"] = False
    while len(tl) > TIMELINE_MAX:
        old = min((e for e in tl if not e["epingle"]), key=lambda e: (e["t"], e["id"]), default=None)
        if old is None:
            break
        tl.remove(old)


def clean_chips(v):
    """A few of CHIPS, once each: anything else in the list (a list, an object: not even hashable) is dropped."""
    return [c for c in dict.fromkeys(x for x in (v if isinstance(v, list) else []) if isinstance(x, str)) if c in CHIP][:CHIPS_MAX]


def clean_humeur(d):
    d = d if isinstance(d, dict) else {}
    out = {"v": 1, "on": d.get("on") is not False, "heure": HEURE, "claude": d.get("claude") is True, "jours": {}, "asks": {"jour": "", "n": 0, "t": 0}}
    h = _int(d.get("heure"), HEURE_MIN, HEURE_MAX)
    if h is not None and h % 15 == 0:
        out["heure"] = h
    jours = d.get("jours") if isinstance(d.get("jours"), dict) else {}
    ok = {}
    for k, v in jours.items():
        if not (isinstance(k, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", k) and isinstance(v, dict) and isinstance(v.get("m"), str) and v["m"] in MOOD):
            continue
        try:
            dt.date.fromisoformat(k)
        except ValueError:
            continue
        ok[k] = {"m": v["m"], "chips": clean_chips(v.get("chips")), "t": _num(v.get("t"), 0)}
    for k in sorted(ok, reverse=True)[:JOURS_MAX]:
        out["jours"][k] = ok[k]
    a = d.get("asks") if isinstance(d.get("asks"), dict) else {}
    if isinstance(a.get("jour"), str) and len(a["jour"]) == 10:
        out["asks"] = {"jour": a["jour"], "n": _int(a.get("n"), 0, 99) or 0, "t": _num(a.get("t"), 0)}
    return out


def _load(path, clean):
    """(clean(what the file holds), ok). Missing: the defaults. Unreadable (not JSON, not an object, a value of a type the
    cleaning trips on…): put aside as NAME.illisible (like amis.json), the defaults, and a new file from then on; ok is
    False only when it could not even be put aside: the caller then never writes that file, it stays as it is."""
    try:
        d = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(d, dict):
            raise ValueError("not an object")
        return clean(d), True
    except FileNotFoundError:
        return clean({}), True
    except Exception as e:                           # noqa: BLE001 - unreadable, not JSON, absurd values: never stop the server
        aside = path.with_name(path.name + ".illisible")
        try:
            path.replace(aside)
        except OSError as e2:
            log.warning("%s unreadable (%s), and not put aside (%s): kept as it is, not saved", path.name, e, e2)
            return clean({}), False
        log.warning("%s unreadable (%s): put aside as %s, starting afresh", path.name, e, aside.name)
        return clean({}), True


def _save(path, data):
    """Written whole (a temporary file, then renamed), readable by its owner only (0600): his memories, your moods."""
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(json.dumps(data, ensure_ascii=False, indent=1))
        os.chmod(tmp, 0o600)
        os.replace(tmp, path)
        return True
    except OSError as e:
        log.warning("%s not saved: %s", path.name, e)
        return False


def first_start(datadir, now):
    """Pixel's first start: the oldest file of his data folder (its token is written once, at the very first start), or now."""
    t = now
    try:
        for f in Path(datadir).iterdir():
            if f.is_file() and f.name not in ("souvenirs.json", "humeur.json", "souvenirs.tmp", "humeur.tmp"):
                t = min(t, f.stat().st_mtime)
    except OSError:
        pass
    d = dt.date.fromtimestamp(t)
    return d if d >= RENCONTRE_MIN else dt.date.fromtimestamp(now)


class Souvenirs:
    """His memories and your mood journal. clock() in seconds, injectable for the tests."""

    def __init__(self, hub, datadir=None, clock=time.time):
        self.hub, self.clock = hub, clock
        self.dir = Path(datadir) if datadir else None
        self.file = self.dir / "souvenirs.json" if self.dir else None
        self.hfile = self.dir / "humeur.json" if self.dir else None
        now = clock()
        self.d, ok = _load(self.file, clean_souvenirs) if self.file else (clean_souvenirs({}), True)
        if not ok:
            self.file = None                             # unreadable and not put aside: never written over
        self.h, ok = _load(self.hfile, clean_humeur) if self.hfile else (clean_humeur({}), True)
        if not ok:
            self.hfile = None
        if not self.d["debut"]:
            self.d["debut"] = now * 1000
        if not self.d["rencontre"]:
            r = first_start(self.dir, now) if self.dir else dt.date.fromtimestamp(now)
            self.d["rencontre"], self.d["rencontre_auto"] = r.isoformat(), True
            self._add("rencontre", "Le jour de notre rencontre !", t=self._noon(r), epingle=True)
        self._evid = int(now) % 100000 * 100
        self.ev, self.hev, self.question = None, None, None
        self.added = []                              # souvenirs.ajoute: when the last ones came
        self.day = None
        self.tick(publish=False)
        self.publish()
        self.save()
        self.hsave()

    # ---- files ----
    def save(self):
        if self.file:
            _save(self.file, self.d)

    def hsave(self):
        if self.hfile:
            _save(self.hfile, self.h)

    # ---- helpers ----
    def today(self):
        return dt.date.fromtimestamp(self.clock())

    def rencontre(self):
        return dt.date.fromisoformat(self.d["rencontre"])

    @staticmethod
    def _noon(d):
        return dt.datetime.combine(d, dt.time(12)).timestamp() * 1000

    def _event(self, kind, **data):
        self._evid += 1
        self.ev = {"id": self._evid, "kind": kind, "t0": _ms(self.clock), **data}

    def _hevent(self, kind, **data):
        self._evid += 1
        self.hev = {"id": self._evid, "kind": kind, "t0": _ms(self.clock), **data}

    def _add(self, typ, texte, t=None, epingle=False, coalesce=False):
        """A memory, newest first. coalesce: today's memory of the same type is updated instead (a record beaten twice)."""
        tl, now = self.d["timeline"], _ms(self.clock)
        t = now if t is None else t
        if coalesce:
            for e in tl:
                if e["type"] == typ and dt.date.fromtimestamp(e["t"] / 1000) == self.today():
                    e.update(texte=texte, t=t)
                    tl.sort(key=lambda e: (-e["t"], -e["id"]))
                    return e
        e = {"id": max((x["id"] for x in tl), default=0) + 1, "t": t, "type": typ, "texte": clean_text(texte), "epingle": bool(epingle), "photo": None}
        tl.append(e)
        tl.sort(key=lambda e: (-e["t"], -e["id"]))
        trim(tl)
        return e

    # ---- the clock: the day turns, his records, the question's time ----
    def tick(self, publish=True):
        changed = False
        today = self.today()
        if today != self.day:
            self.day = today
            changed = self._celebrations(today) or True
        changed = self.observe() or changed
        if self.question and _ms(self.clock) - self.question["t0"] > QUESTION_S * 1000:
            self.question, changed = None, True
        if publish and (changed or self._due_changed()):
            self.publish()
        return changed

    def _due_changed(self):
        due = self.due()
        if due != getattr(self, "_due", None):
            self._due = due
            return True
        return False

    def _celebrations(self, today):
        """The timeline remembers each celebration once: your birthday, a year (or 100 days) since you met."""
        f, F, wrote = fete(today, self.d["anniv"], self.rencontre()), self.d["fetes"], False
        y = str(today.year)
        if f["fete"] == "anniversaire" and F.get("anniversaire") != y:
            F["anniversaire"] = y
            self._add("anniversaire", "Ton anniversaire : joyeux anniversaire !")
            wrote = True
        if f["ans"] and F.get("rencontre") != y:
            F["rencontre"] = y
            self._add("rencontre-an", f"Ça fait {f['ans']} an{'s' if f['ans'] > 1 else ''} qu’on se connaît !")
            wrote = True
        if f["jours"] and F.get("jours") != str(f["jours"]):
            F["jours"] = str(f["jours"])
            self._add("jours", f"{f['jours']} jours ensemble !")
            wrote = True
        if wrote:
            self.save()
        return wrote

    def observe(self):
        """His records, from the other features' snapshots (read defensively). The first look only takes them as they are."""
        R, changed, s = self.d["records"], False, self.hub.s
        ex = s.get("exos")
        st = ex.get("stats") if isinstance(ex, dict) else None
        if isinstance(st, dict):
            sm, rc = _int(st.get("serie_max"), 0, 10**6), _int(st.get("record_chrono"), 0, 10**6)
            tr = [x for x in st.get("trophees") if isinstance(x, str) and TYPE.match(x)][:50] if isinstance(st.get("trophees"), list) else []
            labels = {x.get("id"): clean_text(x.get("label"), 40) for x in (ex.get("trophees") or []) if isinstance(x, dict)}
            if not R["vu"].get("exos"):
                R.update(serie_max=sm or 0, record_chrono=rc or 0, trophees=tr)
                R["vu"]["exos"] = changed = True
            else:
                if sm is not None and sm != R["serie_max"]:
                    if sm > R["serie_max"] and sm >= 5:
                        self._add("record", f"Ta série record : {sm} bonnes réponses d’affilée !", coalesce=True)
                        self._event("record", quoi="serie", n=sm)
                    R["serie_max"], changed = sm, True
                if rc is not None and rc != R["record_chrono"]:
                    if rc > R["record_chrono"] and rc >= 5:
                        self._add("chrono", f"Ton record du défi chrono : {rc} en une minute !", coalesce=True)
                        self._event("record", quoi="chrono", n=rc)
                    R["record_chrono"], changed = rc, True
                new = [x for x in tr if x not in R["trophees"]]
                for x in new:
                    label = labels.get(x) or x
                    self._add("trophee", f"Trophée gagné : {label} !")
                    if not R["premier_trophee"]:
                        R["premier_trophee"] = {"id": x, "label": label, "t": _ms(self.clock)}
                if new:
                    R["trophees"] = (R["trophees"] + new)[-50:]
                    self._event("trophee", ids=new[:5])
                    changed = True
        n = s.get("nourrir")
        if isinstance(n, dict):
            j = [m for m in (n.get("journal") or []) if isinstance(m, dict) and isinstance(m.get("plat"), str) and TYPE.match(m["plat"])]
            if not R["vu"].get("nourrir"):
                R["vu"]["nourrir"] = changed = True
                if j:                                  # he already ate before his memories: the oldest meal he still knows
                    m = j[-1]
                    R["premier_repas"] = {"id": m["plat"], "label": self._food(m["plat"])[0], "t": _num(m.get("t"), 0)}
            elif not R["premier_repas"] and j:
                m = j[0]
                label, nom = self._food(m["plat"])
                R["premier_repas"] = {"id": m["plat"], "label": label, "t": _num(m.get("t"), _ms(self.clock))}
                self._add("repas", f"Mon tout premier repas avec toi : {nom} !")
                changed = True
        if changed:
            self.save()
        return changed

    @staticmethod
    def _food(plat):
        try:
            from . import nourrir                    # his menu (pixel/nourrir.py), when there
            f = nourrir.BY_ID.get(plat)
            if f:
                return f["label"], f["nom"]
        except Exception:                            # noqa: BLE001 - his memories never depend on it
            pass
        return plat, plat

    # ---- souvenirs: the actions ----
    def set_anniv(self, jour, mois):
        """Your birthday (None: forget it). True when it changed."""
        if jour is None and mois is None:
            if self.d["anniv"] is None:
                return False
            self.d["anniv"] = None
        else:
            if not valid_day(jour, mois):
                return False
            a = {"jour": int(jour), "mois": int(mois)}
            if a == self.d["anniv"]:
                return False
            self.d["anniv"] = a
            self.d["demande"] = self.d["demande"] or _ms(self.clock)    # known: he will not ask any more
            self._event("anniv", jour=a["jour"], mois=a["mois"], dans=self.anniv_dans())
        self.day = None                                # today's celebration may change
        self.tick(publish=False)
        self.save()
        return True

    def anniv_dans(self):
        a = self.d["anniv"]
        if not a:
            return None
        t = self.today()
        return (next_birthday(t, a["jour"], a["mois"]) - t).days

    def set_rencontre(self, date):
        try:
            d = dt.date.fromisoformat(date) if isinstance(date, str) and len(date) == 10 else None
        except ValueError:
            d = None
        if not d or not (RENCONTRE_MIN <= d <= self.today()):
            return False
        if d.isoformat() == self.d["rencontre"] and not self.d["rencontre_auto"]:
            return False
        self.d["rencontre"], self.d["rencontre_auto"] = d.isoformat(), False
        e = next((e for e in self.d["timeline"] if e["type"] == "rencontre"), None)
        if e:
            e["t"] = self._noon(d)
            self.d["timeline"].sort(key=lambda e: (-e["t"], -e["id"]))
        else:
            self._add("rencontre", "Le jour de notre rencontre !", t=self._noon(d), epingle=True)
        self.d["fetes"].pop("rencontre", None)
        self.d["fetes"].pop("jours", None)
        self.day = None
        self.tick(publish=False)
        self.save()
        return True

    def ajoute(self, type=None, texte=None, t=None, epingle=False):
        """A memory from another feature (a friend's visit...) or the panel: checked, capped, not too often. The entry or None."""
        typ = type if isinstance(type, str) and TYPE.match(type) and type not in ("rencontre",) else None
        txt = clean_text(texte[:TEXT_IN] if isinstance(texte, str) else texte)     # a long text is cut before any work on it
        if not typ or not txt:
            return None
        now = self.clock()
        self.added = [x for x in self.added if 0 <= now - x[0] < 3600]
        if (self.added and now - self.added[-1][0] < ADD_GAP_S) or len(self.added) >= ADD_PER_HOUR:
            return None
        if any(now - x[0] < 60 and x[1:] == (typ, txt) for x in self.added):
            return None                                # the same memory twice in a minute: once
        tt = _num(t, None)
        tt = tt if tt is not None and T_MIN <= tt <= _ms(self.clock) + 86400000 else None
        self.added.append((now, typ, txt))
        pins = sum(1 for e in self.d["timeline"] if e["epingle"])
        e = self._add(typ, txt, t=tt, epingle=epingle is True and pins < PINNED_MAX)
        w = getattr(self, "attend", None)                # its photo, taken before it (lier_photo: a friend's visit here)
        if w and w["type"] == typ and not e["photo"] and 0 <= now * 1000 - w["t"] < PHOTO_WAIT_S * 1000:
            e["photo"], self.attend = w["photo"], None
        self._event("ajoute", type=typ, texte=e["texte"], souvenir=e["id"])
        if typ == "ami" and not self.d["records"]["premier_ami"]:      # a friend's first visit (the « amis » feature): a record of its own
            self.d["records"]["premier_ami"] = {"id": "ami", "label": clean_text(txt, 40), "t": e["t"]}
        self.save()
        return e

    def epingle(self, id, on=None):
        e = next((e for e in self.d["timeline"] if e["id"] == _int(id, 0, 10**12)), None)
        if not e:
            return False
        v = (not e["epingle"]) if on is None else on is True
        if v and not e["epingle"] and sum(1 for x in self.d["timeline"] if x["epingle"]) >= PINNED_MAX:
            self.hub.toast(f"{PINNED_MAX} souvenirs épinglés au plus.", 4000)
            return False
        e["epingle"] = v
        self.save()
        return True

    def efface(self, id):
        e = next((e for e in self.d["timeline"] if e["id"] == _int(id, 0, 10**12)), None)
        if not e or e["type"] == "rencontre":          # the day you met stays (change its date instead)
            return False
        self.d["timeline"].remove(e)
        self.save()
        return True

    def lier_photo(self, raison, photo):
        """A photo of a special moment (pixel/album.py): the memory of that moment shows it. A friend's visit here comes first:
        its memory is written when it ends (pixel/amis.py), after its photo, which waits for it (ajoute() links it), never
        landing on an older visit's memory."""
        types = {"anniversaire": ("anniversaire",), "rencontre": ("rencontre-an", "jours"), "record": ("record", "chrono"),
                 "trophee": ("trophee",)}.get(raison, (raison,))
        now = _ms(self.clock)
        if raison == "ami" and (occupe(self.hub) or ("",))[0] == "visite":
            self.attend = {"type": "ami", "photo": photo, "t": now}
            return False
        for e in self.d["timeline"]:
            if e["type"] in types and not e["photo"] and 0 <= now - e["t"] < 6 * 3600e3:
                e["photo"] = photo
                self.save()
                self.publish()
                return True
        return False

    def oublie_photo(self, photo):
        if (getattr(self, "attend", None) or {}).get("photo") == photo:
            self.attend = None
        hit = False
        for e in self.d["timeline"]:
            if e["photo"] == photo:
                e["photo"], hit = None, True
        if hit:
            self.save()
            self.publish()

    # ---- le carnet d'humeur ----
    def jour(self, d=None):
        return (d or self.today()).isoformat()

    def due(self, now=None):
        """Today's question is due: on, not answered, from his time, not at night, not while he sleeps (his schedule, else his
        quiet hours), nor during a game or a friend's visit, ASKS_MAX times a day at most, ASK_GAP_S apart."""
        H = self.h
        if not H["on"] or self.question:
            return False
        now = self.clock() if now is None else now
        d = dt.datetime.fromtimestamp(now)
        if d.date().isoformat() in H["jours"] or d.hour * 60 + d.minute < H["heure"] or d.date() <= self.rencontre():
            return False                               # (the day you met: he gets to know you first)
        if d.hour >= NIGHT[0] or d.hour < NIGHT[1]:
            return False
        if asleep(self.hub, d.hour) or occupe(self.hub):   # his night (his schedule, else his quiet hours); a game, a friend's visit
            return False
        a = H["asks"]
        if a["jour"] == d.date().isoformat() and (a["n"] >= ASKS_MAX or now * 1000 - a["t"] < ASK_GAP_S * 1000):
            return False
        return True

    def pose(self):
        """Pixel's own screen asks now (someone is there): the question shows on every screen."""
        if not self.due():
            return False
        now, j = _ms(self.clock), self.jour()
        a = self.h["asks"]
        self.h["asks"] = {"jour": j, "n": (a["n"] if a["jour"] == j else 0) + 1, "t": now}
        self._evid += 1
        self.question = {"id": self._evid, "t0": now}
        self._hevent("question")
        self.hsave()
        return True

    def plustard(self):
        if not self.question:
            return False
        self.question = None
        return True

    def note(self, m, chips=None):
        """Today's mood (the last word counts). True when it was one."""
        if not isinstance(m, str) or m not in MOOD:
            return False
        j, now = self.jour(), _ms(self.clock)
        ch = clean_chips(chips)
        before = self.h["jours"].get(j)
        self.h["jours"][j] = {"m": m, "chips": ch, "t": now}
        for k in sorted(self.h["jours"], reverse=True)[JOURS_MAX:]:
            del self.h["jours"][k]
        self.question = None
        self._hevent("note", m=m, chips=ch, again=bool(before))
        self.hsave()
        return True

    def reglages(self, on=None, heure=None, claude=None):
        H, changed = self.h, False
        if isinstance(on, bool) and on != H["on"]:
            H["on"], changed = on, True
            if not on:
                self.question = None
        h = _int(heure, HEURE_MIN, HEURE_MAX)
        if h is not None and h % 15 == 0 and h != H["heure"]:
            H["heure"], changed = h, True
        if isinstance(claude, bool) and claude != H["claude"]:
            H["claude"], changed = claude, True
        if changed:
            self.hsave()
        return changed

    def efface_carnet(self):
        self.h["jours"], self.question = {}, None
        self._hevent("efface")
        self.hsave()

    def hier(self):
        """The last mood before today, within 2 days: {jour, m, chips, il_y_a} or None."""
        t = self.today()
        for n in (1, 2):
            j = (t - dt.timedelta(days=n)).isoformat()
            v = self.h["jours"].get(j)
            if v:
                return {"jour": j, "m": v["m"], "chips": list(v["chips"]), "il_y_a": n}
        return None

    # ---- what the screens get ----
    def public(self):
        D, today, r = self.d, self.today(), self.rencontre()
        f, a = fete(today, D["anniv"], r), D["anniv"]
        R = D["records"]
        return {
            "fete": f["fete"], "aujourdhui": {"mois": f["mois"], "ans": f["ans"], "jours": f["jours"]},
            "anniv": dict(a) if a else None, "anniv_dans": self.anniv_dans(), "anniv_texte": date_text(a["jour"], a["mois"]) if a else "",
            "rencontre": D["rencontre"], "rencontre_auto": D["rencontre_auto"], "depuis": max(0, (today - r).days),
            "demander_anniv": not a and not D["demande"] and _ms(self.clock) - D["debut"] >= ANNIV_AFTER_S * 1000,
            "records": {"serie_max": R["serie_max"], "record_chrono": R["record_chrono"], "trophees": len(R["trophees"]),
                        "premier_repas": dict(R["premier_repas"]) if R["premier_repas"] else None,
                        "premier_trophee": dict(R["premier_trophee"]) if R["premier_trophee"] else None,
                        "premier_ami": dict(R["premier_ami"]) if R["premier_ami"] else None},
            "timeline": [dict(e) for e in D["timeline"]], "ev": self.ev}

    def hpublic(self):
        H, j = self.h, self.jour()
        v = H["jours"].get(j)
        return {"on": H["on"], "heure": H["heure"], "claude": H["claude"],
                "aujourdhui": {"m": v["m"], "chips": list(v["chips"]), "t": v["t"]} if v else None, "hier": self.hier(),
                "du": self.due(), "question": dict(self.question) if self.question else None,
                "jours": [{"jour": k, "m": H["jours"][k]["m"], "chips": list(H["jours"][k]["chips"])} for k in sorted(H["jours"], reverse=True)[:JOURS_SNAP]],
                "ev": self.hev}

    def publish(self):
        self._due = self.due()
        self.hub.s["souvenirs"] = self.public()
        self.hub.s["humeur"] = self.hpublic()
        self.hub.mark()

    def status(self):
        """A few words for Claude (get_status): never the mood journal, unless the person allowed it."""
        a, t, r = self.d["anniv"], self.today(), self.rencontre()
        out = []
        if a:
            n = self.anniv_dans()
            out.append(f"Son anniversaire : {date_text(a['jour'], a['mois'])}" + (" : c'est aujourd'hui !" if n == 0 else f" (dans {n} jour{'s' if n > 1 else ''})."))
        else:
            out.append("Tu ne connais pas encore la date de son anniversaire.")
        days = max(0, (t - r).days)
        out.append(f"Vous vous connaissez depuis {date_text(r.day, r.month, r.year)} ({days} jour{'s' if days > 1 else ''}).")
        f = fete(t, a, r)
        if f["ans"]:
            out.append(f"Aujourd'hui, ça fait {f['ans']} an{'s' if f['ans'] > 1 else ''} que vous vous connaissez.")
        R = self.d["records"]
        if R["serie_max"]:
            out.append(f"Sa meilleure série aux exos : {R['serie_max']}.")
        alb = self.hub.s.get("album")
        if isinstance(alb, dict) and isinstance(alb.get("photos"), list):
            out.append(f"Photos dans ton album : {len(alb['photos'])}.")
        if self.h["claude"]:
            v = self.h["jours"].get(self.jour())
            out.append(f"Son humeur aujourd'hui (son carnet, elle te permet de le savoir) : {MOOD[v['m']].lower()}"
                       + (f" ({', '.join(CHIP[c].lower() for c in v['chips'])})" if v and v["chips"] else "") + "." if v
                       else "Elle ne t'a pas encore dit comment elle va aujourd'hui.")
        return " ".join(out)


# ---------- typed commands (pixel/commands.py hands them over just before Claude): exact phrases only ----------
MONTHS = {"janvier": 1, "janv": 1, "fevrier": 2, "fevr": 2, "fev": 2, "mars": 3, "avril": 4, "avr": 4, "mai": 5, "juin": 6, "juillet": 7,
          "juil": 7, "aout": 8, "septembre": 9, "sept": 9, "octobre": 10, "oct": 10, "novembre": 11, "nov": 11, "decembre": 12, "dec": 12}
_PHOTO = re.compile(r"^(?:prends?|fais|fait)(?:[- ]moi)? (?:une |un )?(?:photo|selfie)(?: de toi)?(?: pixel)?$|^(?:prends?[- ]moi en photo|une photo|photo|clic clac)$")
_ALBUM = re.compile(r"^(?:montre|montre[- ]moi|ouvre|affiche|fais[- ]moi voir) (?:l'album(?: photo)?|ton album(?: photo)?|tes photos|les photos|ses photos)$"
                    r"|^(?:l'album|album|album photo|ton album|tes photos)$")
_ANNIV = re.compile(r"^(?:mon anniv(?:ersaire)?|ma date d'anniversaire|la date de mon anniversaire)(?:,? c'est|,? c est|,? est|,| :)? (?:le )?(.+)$|^je suis nee? (?:le )?(.+)$")
_QUAND = re.compile(r"^(?:c'est )?quand (?:est |c'est )?mon anniv(?:ersaire)?$|^(?:tu (?:connais|sais) )?(?:la date de )?mon anniversaire$|^tu te souviens de mon anniversaire$")
_RACONTE = re.compile(r"^(?:tu te souviens|raconte(?:[- ]moi)? un souvenir|un souvenir|mes souvenirs|nos souvenirs)$")
_DATE = re.compile(r"^(1er|premier|\d{1,2})(?: (?:de )?([a-z]+)\.?| ?[/.-] ?(\d{1,2}))(?: ?[/.-]? ?(\d{2}|\d{4}))?$")
MOOD_WORDS = {
    "super": ("je suis super content", "je suis super contente", "je suis trop content", "je suis trop contente", "je suis tres content",
              "je suis tres contente", "je suis heureux", "je suis heureuse", "je suis super heureux", "je suis super heureuse",
              "je suis ravi", "je suis ravie", "je vais super bien", "ca va super bien", "super journee", "j'ai passe une super journee"),
    "bien": ("je suis content", "je suis contente", "je vais bien", "ca va bien", "je suis bien", "bonne journee aujourd'hui", "j'ai passe une bonne journee"),
    "bof": ("je suis bof", "ca va bof", "bof", "bof bof", "je vais bof", "moyen", "ca va moyen", "je suis fatigue", "je suis fatiguee",
            "je suis creve", "je suis crevee", "je suis epuise", "je suis epuisee"),
    "triste": ("je suis triste", "je suis tres triste", "je suis malheureux", "je suis malheureuse", "ca va pas", "ca ne va pas", "je vais pas bien",
               "je ne vais pas bien", "j'ai du chagrin", "j'ai de la peine"),
    "colere": ("je suis en colere", "je suis fache", "je suis fachee", "je suis enerve", "je suis enervee", "je suis furieux", "je suis furieuse",
               "je suis vener", "ca m'enerve"),
}
MOOD_OF = {p: m for m, ps in MOOD_WORDS.items() for p in ps}
TIRED = ("fatigue", "creve", "epuise")


def parse_date(s):
    """« 12 mars », « 1er mai », « 12/03 », « 12 mars 2015 » (the year is not kept): (jour, mois), or None; ('?', None)
    when it looks like a date that does not exist."""
    m = _DATE.match(s.strip())
    if not m:
        return None
    j = 1 if m.group(1) in ("1er", "premier") else int(m.group(1))
    if m.group(2):
        mo = MONTHS.get(m.group(2))
        if not mo:
            return None
    else:
        mo = int(m.group(3))
    if not (1 <= mo <= 12) or not valid_day(j, mo):
        return ("?", None)
    return (j, mo)


def mood_of(t):
    """The mood a phrase says (« je suis triste »), and its chips: (m, chips) or None."""
    t = re.sub(r"^(?:pixel[, ]+)", "", t)
    t = re.sub(r"[\s!.…]+$", "", t)
    t = re.sub(r",? (?:aujourd'hui|ce soir|ce matin|pixel)$", "", t).strip()
    m = MOOD_OF.get(t)
    if not m:
        return None
    return m, (["fatigue"] if any(w in t for w in TIRED) else [])


async def command(hub, t, raw):
    """« prends une photo », « montre l'album », « mon anniversaire c'est le 12 mars », « je suis triste »… True when it was one."""
    S = getattr(hub, "souvenirs", None)
    t = norm(raw)
    t = re.sub(r"\s+", " ", t).strip()
    bare = re.sub(r"\s*[!.…]+$", "", t)
    q = re.sub(r"\s*\?$", "", bare)
    if _PHOTO.match(q) and getattr(hub, "album", None) is not None:
        await hub.dispatch("album.photo")
        return True
    if _ALBUM.match(q) and getattr(hub, "album", None) is not None:
        await hub.dispatch("album.montre")
        return True
    if S is None:
        return False
    if _QUAND.match(q) and (bare.endswith("?") or "quand" in q or "souviens" in q):
        a = S.d["anniv"]
        if a:
            n = S.anniv_dans()
            hub.toast(f"Ton anniversaire : {date_text(a['jour'], a['mois'])}" + (" : c'est aujourd'hui ! Joyeux anniversaire !" if n == 0
                      else f", dans {n} jour{'s' if n > 1 else ''} !"), 6000)
        else:
            hub.toast("Je ne le connais pas encore ! Dis-moi « mon anniversaire c'est le 12 mars », par exemple.", 7000)
        return True
    m = _ANNIV.match(bare)
    if m:
        d = parse_date((m.group(1) or m.group(2) or "").strip(" .!"))
        if d is None:
            return False                               # « mon anniversaire c'est bientôt » : Claude
        if d[0] == "?":
            hub.mood("confus", 2500)
            hub.toast("Cette date n'existe pas ! Dis-moi par exemple « mon anniversaire c'est le 12 mars ».", 6000)
            return True
        await hub.dispatch("souvenirs.anniversaire", {"jour": d[0], "mois": d[1]})
        return True
    if _RACONTE.match(q):
        await hub.dispatch("souvenirs.raconte")
        return True
    mo = mood_of(bare)
    if mo:
        m, chips = mo
        cur = S.h["jours"].get(S.jour())
        if chips and cur:                              # « je suis fatigué » after another word today: the tiredness joins it
            m, chips = cur["m"], clean_chips(cur["chips"] + chips)
        await hub.dispatch("humeur.note", {"m": m, "chips": chips})
        return True
    return False


# ---------- Claude (pixel/claude.py adds TOOL, and asks check_tool() and run_tool()) ----------
TOOL = {"name": "souvenirs", "eager_input_streaming": True,
        "description": "Tes souvenirs avec la personne, pour de vrai. action « anniversaire » : retiens la date de son anniversaire (jour, "
                       "mois) quand elle te la dit. « photo » : tu prends une photo de toi pour ton album (tu prends la pose sur ton écran). "
                       "« humeur » : note dans son carnet d'humeur comment elle va aujourd'hui (humeur, et sujets : ce qui compte), "
                       "seulement si elle te le dit ; son carnet est privé, tu n'y as accès que si elle l'a permis. Humeurs : "
                       + ", ".join(f"{m} ({label.lower()})" for m, label, _ in MOODS) + ". Sujets : " + ", ".join(c for c, _ in CHIPS) + ".",
        "input_schema": {"type": "object", "additionalProperties": False, "required": ["action"], "properties": {
            "action": {"type": "string", "enum": ["anniversaire", "photo", "humeur"]},
            "jour": {"type": "integer", "minimum": 1, "maximum": 31}, "mois": {"type": "integer", "minimum": 1, "maximum": 12},
            "humeur": {"type": "string", "enum": [m for m, _, _ in MOODS]},
            "sujets": {"type": "array", "items": {"type": "string", "enum": [c for c, _ in CHIPS]}, "maxItems": CHIPS_MAX}}}}


def check_tool(a):
    bad = "entrée invalide pour souvenirs : " + json.dumps(a, ensure_ascii=False)
    if not isinstance(a, dict) or a.get("action") not in ("anniversaire", "photo", "humeur") or set(a) - {"action", "jour", "mois", "humeur", "sujets"}:
        return bad
    if a["action"] == "anniversaire" and not valid_day(a.get("jour"), a.get("mois")):
        return bad
    if a["action"] == "humeur" and (a.get("humeur") not in MOOD or ("sujets" in a and (not isinstance(a["sujets"], list) or len(a["sujets"]) > CHIPS_MAX
                                                                                       or any(c not in CHIP for c in a["sujets"])))):
        return bad
    return None


async def run_tool(hub, a):
    S = getattr(hub, "souvenirs", None)
    if a["action"] == "photo":
        A = getattr(hub, "album", None)
        if A is None:
            return "pas d'album sur ce Pixel"
        why = A.refus()
        if why:
            return "pas de photo pour le moment : " + why
        await hub.dispatch("album.photo")
        return "tu prends la pose sur ton écran : la photo arrive dans ton album."
    if S is None:
        return "pas de souvenirs sur ce Pixel"
    if a["action"] == "anniversaire":
        await hub.dispatch("souvenirs.anniversaire", {"jour": a["jour"], "mois": a["mois"]})
        n = S.anniv_dans()
        return f"c'est noté : son anniversaire est {date_text(a['jour'], a['mois'])}" + (", c'est aujourd'hui !" if n == 0 else f", dans {n} jour{'s' if n > 1 else ''}.")
    if not S.h["claude"]:
        return "son carnet d'humeur est privé : elle ne t'a pas permis d'y écrire. N'en parle pas, sauf si elle t'en parle."
    await hub.dispatch("humeur.note", {"m": a["humeur"], "chips": a.get("sujets") or []})
    return f"noté dans son carnet : {MOOD[a['humeur']].lower()}."


def setup(hub, datadir=None, clock=time.time):
    """His memories and the mood journal: the actions souvenirs.* and humeur.*, the snapshot keys "souvenirs" and "humeur",
    a tick every 20 s (the day turns, his records, the question's time). hub.souvenirs: for commands.py, claude.py, album.py."""
    datadir = Path(datadir) if datadir else Path(os.path.expanduser(hub.cfg.get("data_dir", "~/.config/pixel")))
    try:
        S = Souvenirs(hub, datadir, clock)
    except Exception:                                  # a bug (an unreadable file is put aside by _load): Pixel starts, and
        log.exception("souvenirs: started without his files (left as they are, nothing saved until the next start)")
        S = Souvenirs(hub, None, clock)                # never writes over files it could not read
    hub.souvenirs = S

    def done(changed=True):
        if changed:
            S.publish()

    @hub.action("souvenirs.anniversaire")
    async def anniversaire(jour=None, mois=None):
        """Your birthday: jour 1..31, mois 1..12 (a day that exists, 29 February too); both null: he forgets it."""
        done(S.set_anniv(jour, mois))

    @hub.action("souvenirs.rencontre")
    async def rencontre(date=None):
        """The day you met: "YYYY-MM-DD", from 2020 to today."""
        done(S.set_rencontre(date))

    @hub.action("souvenirs.demande")
    async def demande():
        """Pixel's screen asked « C'est quand ton anniversaire ? »: he never asks again."""
        if not S.d["demande"]:
            S.d["demande"] = _ms(S.clock)
            S.save()
            done()

    @hub.action("souvenirs.ajoute")
    async def ajoute(type=None, texte=None, t=None, epingle=False):
        """A memory: type [a-z0-9-] (24 at most), texte (100 characters at most), t (ms, optional)."""
        done(S.ajoute(type, texte, t, epingle) is not None)

    @hub.action("souvenirs.epingle")
    async def epingle(id=None, on=None):
        done(S.epingle(id, on if isinstance(on, bool) else None))

    @hub.action("souvenirs.efface")
    async def efface(id=None):
        done(S.efface(id))

    @hub.action("souvenirs.raconte")
    async def raconte():
        """Pixel tells one of his memories, now (his face screen)."""
        S._event("raconte")
        hub.s["anim"] = None
        hub.s["screen"] = "visage"
        done()

    @hub.action("souvenirs.fete")
    async def fete_again():
        """Today's party again (« Refaire la fête »), on every screen."""
        f = fete(S.today(), S.d["anniv"], S.rencontre())
        if not f["fete"]:
            return hub.toast("Pas de fête aujourd'hui… mais je suis content de te voir !", 4000)
        S._event("fete", fete=f["fete"], ans=f["ans"])
        hub.s["anim"] = None
        hub.s["screen"] = "visage"
        done()

    @hub.action("humeur.note")
    async def note(m=None, chips=None):
        """Today's mood: m one of MOODS, chips a few of CHIPS."""
        done(S.note(m, chips))

    @hub.action("humeur.pose")
    async def pose():
        """Pixel's own screen asks « Comment tu vas aujourd'hui ? » (someone is there)."""
        done(S.pose())

    @hub.action("humeur.plustard")
    async def plustard():
        done(S.plustard())

    @hub.action("humeur.reglages")
    async def reglages(on=None, heure=None, claude=None):
        """on: he asks every day; heure: from when (minutes after midnight, 7:00 to 20:30, by quarters); claude: Claude may know."""
        done(S.reglages(on, heure, claude))

    @hub.action("humeur.efface")
    async def efface_carnet():
        """« Effacer le carnet »: every day of it."""
        S.efface_carnet()
        done()

    async def tick():
        S.tick()

    S.atick = tick
    try:
        S.task = asyncio.get_running_loop().create_task(hub.every(20, tick, 20))
    except RuntimeError:                               # no loop (tests): they call tick() themselves
        S.task = None
    return S
