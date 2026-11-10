"""« Ses habitudes »: his day (wake-up, nap, bedtime), his favourite games, what makes him laugh, his fears, his own phrases.

- His schedule (horaires): réveil and coucher in minutes after midnight, the Pi's local time (a bedtime earlier than the
  wake-up is after midnight), an optional nap (sieste: start, length) and optional weekend times (a later wake-up on
  Saturday and Sunday, a later bedtime on Friday and Saturday nights). His state (etat): eveille; reveil (the first
  REVEIL_MIN after he wakes up: he stretches, « Bonjour ! »); sieste; coucher (the last COUCHER_MIN before bedtime: he
  yawns, brushes his teeth, says goodnight); nuit. dort: nuit or sieste (Pixel's look dresses him for the night, friends do
  not visit). nuit, from bedtime to wake-up, is his night for the other features: his belly sleeps (pixel/nourrir.py),
  quiet hours, no hunger hint nor offered question, notifications do not wake him (web/habitudes.js, web/persona.js hooks).
  Wall-clock times (naive local datetimes): a schedule across midnight and the DST changes (at night) need nothing more.
  Switched off (actif False) he never goes to bed by himself and the others keep their old night (23 h - 6 h).
  In demo mode (--demo, and Pixel Lab) his clock is paused: he is awake whatever the hour, as before this feature, until
  habitudes.demo {heure} simulates a time of day (the lab's buttons, the tests).
- His games (jeux): cache (cache-cache), pfc (pierre-feuille-ciseaux), etoiles (attrape-étoiles), simon. The server keeps
  the game in play (partie) and judges each move (habitudes.coup, which names the game: a double tap or a late screen
  never plays the next one), so every screen shows the same game and any of them can play it; a cast or an exercise opened
  since pauses it (it comes back as it was), the quick menu does not; none starts at night, during his nap, at bedtime or
  over an open exercise. He has 2 favourites (drawn at random at first); he is extra happy when you pick one.
- What makes him laugh (rires.aime): les chatouilles (fast taps or rubbing: web/habitudes.js), les blagues (BLAGUES, read
  from web/scenes/habitudes.js), les grimaces, les bruits rigolos, gagner à un jeu. habitudes.rire plays one on every screen.
- His fears (peurs): l'orage (the weather says orage: a thunder clap now and then), le noir (all lights off while he is
  awake: web/habitudes.js sees it), les araignées (a little one crosses his screen), le vide (the Pixel de poche tilted
  steeply). Each can be switched off; comforting him (habitudes.rassure: petting him while he is scared) builds his courage
  (COURAGE_STEP, at most COURAGE_DAY a day: over the days), and the fear shrinks.
- His phrases (expressions): taught for a moment (MOMENTS), PHRASES_MAX each, PHRASE_MAX characters, cleaned; he says one
  now and then instead of his own line (web/persona.js line hook, web/habitudes.js). They never reach Claude.

Snapshot "habitudes": {horaires: {actif, reveil, coucher, sieste: {de, duree} | None, weekend: {reveil, coucher} | None},
etat, dort, nuit, depuis (ms), prochain: {etat, t} | None, sautee (the day his nap was skipped), horloge: {decalage (ms),
pause}, ev: {id, kind, t0} | None (his routine: reveil, annonce, dents, veilleuse, dodo, sieste, fin-sieste; pas-maintenant
{etat, quoi}: asleep, he says no to a game, a joke, a wake-up),
jeux: {favoris: [2 ids], propose, records: {jeu: n}, parties}, partie: the game in play | None, rires: {aime: [...]},
rire: {id, kind, n, t0} | None, peurs: {id: {on, courage}}, peur: {id, kind, t0, courage} | None,
expressions: {moment: [phrases]}, phrase: {id, kind (appris, dit), moment, texte, t0} | None}.
Saved in data_dir/habitudes.json, readable by its owner only (0600: the family's phrases); missing or broken: the defaults (a
file that cannot be read is put aside as habitudes.json.illisible, never written over); caractère's old quiet hours are
migrated once.
web/habitudes.js has the same rules (Pixel Lab, Pixel sans Pi); tests/test_habitudes.py compares them.
"""
import asyncio
import datetime as dt
import json
import logging
import math
import os
import random
import re
import time
import unicodedata
from pathlib import Path

log = logging.getLogger("pixel.habitudes")
PACK = Path(__file__).resolve().parent.parent / "web" / "scenes" / "habitudes.js"

JEUX = {"cache": "Cache-cache", "pfc": "Pierre-feuille-ciseaux", "etoiles": "Attrape-étoiles", "simon": "Simon"}
RIRES = {"chatouilles": "Les chatouilles", "blagues": "Les blagues", "grimaces": "Les grimaces", "bruits": "Les bruits rigolos",
         "gagner": "Gagner à un jeu"}
PEURS = {"orage": "L’orage", "noir": "Le noir", "araignees": "Les araignées", "vide": "Le vide"}
MOMENTS = {"bonjour": "Pour dire bonjour", "bonne-nuit": "Pour dire bonne nuit", "content": "Quand il est content",
           "merci": "Pour dire merci", "au-revoir": "Pour dire au revoir", "bravo": "Pour dire bravo", "faim": "Quand il a faim"}
BRUITS = 8                         # funny noises in web/scenes/habitudes.js (rire-bruit picks n % BRUITS)
ETATS = ("eveille", "reveil", "sieste", "coucher", "nuit")
REVEIL_MIN, COUCHER_MIN, DENTS_MIN, VEILLEUSE_MIN = 15, 15, 8, 2   # his routine (minutes after waking, before bed)
DEFAULT_H = {"actif": True, "reveil": 7 * 60 + 30, "coucher": 21 * 60, "sieste": None, "weekend": None}
AWAKE_MIN, NIGHT_MIN, NIGHT_MAX = 6 * 60, 4 * 60, 16 * 60
NAP_MIN, NAP_MAX = 10, 180
PHRASE_MAX, PHRASES_MAX = 60, 5
PHRASE_IN = 400                    # characters of a phrase looked at (habitudes.apprendre): the rest is cut before cleaning
TIME_MAX = 16                      # characters of a typed time of day (« 19 heures 05 »), spaces around it trimmed
COURAGE_STEP, COURAGE_DAY = 10, 30
STORM_GAP = (12 * 60, 25 * 60)     # s between two thunder claps while it storms
EV_FRESH = 120                     # s: a change of state seen later than that (the Pi was off, the clock jumped) plays nothing
END_MS, AGAIN_MS = 8000, 120000    # a game's result stays on screen; « on rejoue » shortly after it


def now_ms():
    return time.time() * 1000


def _int(v, lo, hi):
    """An int in [lo, hi], or None (not a bool, NaN, infinity: json reads 1e400 as inf)."""
    if isinstance(v, bool) or not isinstance(v, (int, float)) or (isinstance(v, float) and not math.isfinite(v)):
        return None
    try:
        v = int(round(v))
    except OverflowError:
        return None
    return v if lo <= v <= hi else None


def to_min(v):
    """Minutes after midnight from 450, 450.0, "7:30", "7h30", "7 h", "19 h 05"; None when it is not a time of day.
    A text is trimmed first and TIME_MAX characters at most: a long one is no time (and no work for the server)."""
    if isinstance(v, str):
        v = v.strip()
        m = re.fullmatch(r"(\d{1,2})\s*(?:(?::|h|H|heures?)\s*(\d{2})?)?", v) if len(v) <= TIME_MAX else None
        if not m:
            return None
        h, mn = int(m.group(1)), int(m.group(2) or 0)
        return h * 60 + mn if h < 24 and mn < 60 else None
    return _int(v, 0, 1439)


def hm(m):
    """7 h 30, 21 h, 0 h 15: a time of day the French way."""
    m = int(m) % 1440
    return f"{m // 60} h {m % 60:02d}" if m % 60 else f"{m // 60} h"


# ---------- his schedule ----------
def _pairs(h):
    """(wake, bed) of each kind of day, and (bed, next wake) of each kind of night (minutes): weekdays, Friday (a weekend
    bedtime), Saturday (both), Sunday (a weekend wake-up); weeknights and weekend nights."""
    w, b, we = h["reveil"], h["coucher"], h.get("weekend")
    ww, wb = (we["reveil"], we["coucher"]) if we else (w, b)
    return [(w, b), (w, wb), (ww, wb), (ww, b)], [(b, w), (wb, ww)]


def problem(h):
    """Why a schedule cannot be (a French sentence), or None. Awake 6 h at least, nights of 4 to 16 h, the nap in the day."""
    days, nights = _pairs(h)
    for w, b in days:
        span = (b - w) % 1440
        if span < AWAKE_MIN:
            return "Il doit rester réveillé au moins 6 heures dans la journée."
    for b, w in nights:
        span = (w - b) % 1440
        if span < NIGHT_MIN:
            return "Il doit dormir au moins 4 heures la nuit."
        if span > NIGHT_MAX:
            return "Il ne peut pas dormir plus de 16 heures."
    s = h.get("sieste")
    if s:
        for w, b in days:
            off, span = (s["de"] - w) % 1440, (b - w) % 1440
            if off < REVEIL_MIN + 15 or off + s["duree"] > span - COUCHER_MIN - 15:
                return "La sieste doit être dans sa journée, loin de son réveil et de son coucher."
    return None


def clean_sieste(s):
    if not isinstance(s, dict):
        return None
    de, d = to_min(s.get("de")), _int(s.get("duree"), NAP_MIN, NAP_MAX)
    return {"de": de, "duree": d} if de is not None and d is not None else None


def clean_weekend(w):
    if not isinstance(w, dict):
        return None
    r, c = to_min(w.get("reveil")), to_min(w.get("coucher"))
    return {"reveil": r, "coucher": c} if r is not None and c is not None else None


def clean_horaires(x):
    """A complete, valid schedule from anything: bad parts fall back (the nap, the weekend, then the times)."""
    out = dict(DEFAULT_H)
    if not isinstance(x, dict):
        return out
    if isinstance(x.get("actif"), bool):
        out["actif"] = x["actif"]
    for k in ("reveil", "coucher"):
        v = to_min(x.get(k))
        if v is not None:
            out[k] = v
    out["sieste"], out["weekend"] = clean_sieste(x.get("sieste")), clean_weekend(x.get("weekend"))
    for drop in ("sieste", "weekend"):
        if problem(out):
            out[drop] = None
    if problem(out):
        out["reveil"], out["coucher"] = DEFAULT_H["reveil"], DEFAULT_H["coucher"]
    return out


def segments(h, day, skip=None):
    """His day `day` (a date) as [(start, end, etat)], naive local datetimes, from his wake-up to the next one."""
    def at(d, m):
        return dt.datetime.combine(d, dt.time(m // 60, m % 60))
    we = h.get("weekend")
    wd = day.weekday()
    w = we["reveil"] if we and wd >= 5 else h["reveil"]
    b = we["coucher"] if we and wd in (4, 5) else h["coucher"]
    nxt = day + dt.timedelta(days=1)
    w2 = we["reveil"] if we and nxt.weekday() >= 5 else h["reveil"]
    t_w = at(day, w)
    t_b = t_w + dt.timedelta(minutes=(b - w) % 1440 or 1440)
    t_w2 = at(nxt, w2)
    out, t = [], t_w
    cuts = [(t_w + dt.timedelta(minutes=REVEIL_MIN), "reveil")]
    s = h.get("sieste")
    if s and skip != day.isoformat():
        ns = t_w + dt.timedelta(minutes=(s["de"] - w) % 1440)
        cuts += [(ns, "eveille"), (ns + dt.timedelta(minutes=s["duree"]), "sieste")]
    cuts += [(t_b - dt.timedelta(minutes=COUCHER_MIN), "eveille"), (t_b, "coucher"), (t_w2, "nuit")]
    for end, etat in cuts:
        if end > t:
            out.append((t, end, etat))
            t = end
    return out


def etat_at(h, now, skip=None):
    """(etat, since, until, next etat) at `now` (a naive local datetime). Off: always awake (since/until None)."""
    if not h.get("actif"):
        return "eveille", None, None, None
    for k in (-1, 0, -2):
        seg = segments(h, now.date() + dt.timedelta(days=k), skip)
        for i, (a, b, e) in enumerate(seg):
            if a <= now < b:
                nxt = seg[i + 1][2] if i + 1 < len(seg) else "reveil"
                return e, a, b, nxt
    return "eveille", None, None, None          # cannot happen with a valid schedule


def night_spans(h, t0, t1):
    """His nights (bedtime to wake-up) meeting [t0, t1) (s), as (start, end) timestamps."""
    out = []
    d = dt.datetime.fromtimestamp(t0).date() - dt.timedelta(days=2)
    last = dt.datetime.fromtimestamp(t1).date() + dt.timedelta(days=1)
    while d <= last:
        for a, b, e in segments(h, d):
            if e == "nuit":
                sa, sb = a.timestamp(), b.timestamp()
                if sb > t0 and sa < t1:
                    out.append((max(sa, t0), min(sb, t1)))
        d += dt.timedelta(days=1)
    return out


def awake_hours(h, t0, t1, cap=None):
    """Hours between t0 and t1 (s) outside his nights, at most cap: what nourrir.py counts for his belly. A long gap is
    walked a week at a time, and stops at cap."""
    total, t = 0.0, float(t0)
    while t < t1:
        end = min(t1, t + 7 * 86400)
        night = sum(b - a for a, b in night_spans(h, t, end))
        total += max(0.0, (end - t) - night) / 3600
        if cap is not None and total >= cap:
            return cap
        t = end
    return total


# ---------- his games ----------
SPOTS = ("gauche", "droite", "haut", "bas")
HANDS = ("pierre", "feuille", "ciseaux")
BEATS = {"pierre": "ciseaux", "feuille": "pierre", "ciseaux": "feuille"}
CACHE = {"manches": 3, "hide": 1600, "look": 15000, "show": 2400, "rates": 2}
PFC = {"points": 2, "manches": 5, "wait": 25000, "show": 2600}
ETOILES = {"ms": 30000, "n": 34, "but": 12}
SIMON = {"start": 3, "max": 8, "step": 650, "lit": 420, "gap": 900, "wait": 20000}


def new_game(jeu, t, rng, gid, favori=False, par=""):
    """A game of `jeu` starting at t (ms): its public state, every rule's data in it (nothing is hidden: it is a game)."""
    p = {"id": gid, "jeu": jeu, "t0": t, "etat": "joue", "favori": bool(favori), "par": par, "phase": "", "phase_t": t,
         "fin": None, "pause": 0, "manche": 1}
    if jeu == "cache":
        p.update(manches=CACHE["manches"], trouves=0, cachette=rng.choice(SPOTS), rates=[], phase="cache")
    elif jeu == "pfc":
        p.update(score=[0, 0], toi="", lui="", gagnant="", phase="choix")
    elif jeu == "etoiles":
        stars, n = [], ETOILES["n"]
        for i in range(n):
            doree = i % 9 == 7
            stars.append({"x": rng.randint(70, 730), "t": int(i * (ETOILES["ms"] - 3500) / n + rng.randint(0, 500)),
                          "v": rng.randint(120, 185) if not doree else 205, "r": 34 if not doree else 40, "d": doree})
        p.update(etoiles=stars, prises=[], score=0, but=ETOILES["but"], phase="joue")
    elif jeu == "simon":
        seq = []
        while len(seq) < SIMON["max"]:
            x = rng.randrange(4)
            if len(seq) >= 2 and seq[-1] == x and seq[-2] == x:
                continue
            seq.append(x)
        p.update(seq=seq, long=SIMON["start"], fait=0, phase="montre", meilleur=0)
    return p


def _end(p, t, resultat, score=None):
    p.update(etat="fin", phase="fin", phase_t=t, fin={"resultat": resultat, "t": t, "score": score})


def game_move(p, a, t, rng):
    """A move on the game p (a: the coup's arguments), at t. Returns what it did, for his reactions: '' when it is not one."""
    if not p or p["etat"] != "joue" or p.get("pause") or a.get("id") != p["id"]:
        return ""
    j = p["jeu"]
    if j == "cache":
        if p["phase"] != "cherche" or a.get("manche") not in (None, p["manche"]) or a.get("cote") not in SPOTS:
            return ""
        if a["cote"] == p["cachette"]:
            p.update(trouves=p["trouves"] + 1, phase="trouve", phase_t=t)
            return "trouve"
        if a["cote"] in p["rates"]:
            return ""
        p["rates"].append(a["cote"])
        if len(p["rates"]) >= CACHE["rates"]:
            p.update(phase="sorti", phase_t=t)
            return "sorti"
        return "rate"
    if j == "pfc":
        if p["phase"] != "choix" or a.get("manche") not in (None, p["manche"]) or a.get("choix") not in HANDS:
            return ""
        lui = rng.choice(HANDS)
        toi = a["choix"]
        g = "egal" if toi == lui else "toi" if BEATS[toi] == lui else "lui"
        if g == "toi":
            p["score"][0] += 1
        elif g == "lui":
            p["score"][1] += 1
        p.update(toi=toi, lui=lui, gagnant=g, phase="montre", phase_t=t)
        return g
    if j == "etoiles":
        i = _int(a.get("etoile"), 0, len(p["etoiles"]) - 1)
        if i is None or i in p["prises"]:
            return ""
        s, e = p["etoiles"][i], t - p["t0"]
        if not (s["t"] - 300 <= e <= s["t"] + 560 / s["v"] * 1000 + 900):
            return ""                                            # not on the screen now: a stale or made-up catch
        p["prises"].append(i)
        p["score"] += 3 if s["d"] else 1
        return "etoile"
    if j == "simon":
        i, pad = _int(a.get("i"), 0, SIMON["max"]), _int(a.get("pad"), 0, 3)
        if p["phase"] != "joue" or pad is None or i != p["fait"] or a.get("manche") not in (None, p["manche"]):
            return ""
        if p["seq"][i] != pad:
            _end(p, t, "perdu" if p["meilleur"] < SIMON["start"] else "fini", p["meilleur"])
            return "faux"
        p["fait"] += 1
        p["phase_t"] = t
        if p["fait"] < p["long"]:
            return "ok"
        p["meilleur"] = p["long"]
        if p["long"] >= SIMON["max"]:
            _end(p, t, "gagne", p["meilleur"])
            return "gagne"
        p.update(phase="bravo", phase_t=t)
        return "suite"
    return ""


def game_tick(p, t, rng):
    """The game's clock: phases that end by themselves. Returns what happened ('' if nothing)."""
    if not p or p.get("pause"):
        return ""
    e = t - p["phase_t"]
    j, ph = p["jeu"], p["phase"]
    if p["etat"] == "fin":
        return "ferme" if e >= END_MS else ""
    if j == "cache":
        if ph == "cache" and e >= CACHE["hide"]:
            p.update(phase="cherche", phase_t=t)
            return "cherche"
        if ph == "cherche" and e >= CACHE["look"]:
            p.update(phase="sorti", phase_t=t)
            return "sorti"
        if ph in ("trouve", "sorti") and e >= CACHE["show"]:
            if p["manche"] >= p["manches"]:
                n = p["trouves"]
                _end(p, t, "gagne" if n >= 2 else "perdu", n)
                return "fin"
            old = p["cachette"]
            p.update(manche=p["manche"] + 1, cachette=rng.choice([s for s in SPOTS if s != old]), rates=[], phase="cache", phase_t=t)
            return "manche"
    elif j == "pfc":
        if ph == "choix" and e >= PFC["wait"]:
            _end(p, t, "fini", p["score"][0])
            return "fin"
        if ph == "montre" and e >= PFC["show"]:
            a, b = p["score"]
            if a >= PFC["points"] or b >= PFC["points"] or p["manche"] >= PFC["manches"]:
                _end(p, t, "gagne" if a > b else "perdu" if b > a else "egal", a)
                return "fin"
            p.update(manche=p["manche"] + 1, toi="", lui="", gagnant="", phase="choix", phase_t=t)
            return "manche"
    elif j == "etoiles":
        if t - p["t0"] >= ETOILES["ms"]:
            _end(p, t, "gagne" if p["score"] >= p["but"] else "fini", p["score"])
            return "fin"
    elif j == "simon":
        show = p["long"] * SIMON["step"] + 300
        if ph == "montre" and e >= show:
            p.update(phase="joue", phase_t=t)
            return "joue"
        if ph == "joue" and e >= SIMON["wait"]:
            _end(p, t, "fini" if p["meilleur"] else "perdu", p["meilleur"])
            return "fin"
        if ph == "bravo" and e >= SIMON["gap"]:
            p.update(manche=p["manche"] + 1, long=p["long"] + 1, fait=0, phase="montre", phase_t=t)
            return "manche"
    return ""


# ---------- his phrases ----------
def clean_phrase(s):
    """A phrase he may say: no control or invisible characters, one line, no link, quotes and spaces trimmed, PHRASE_MAX
    characters at most, a letter or a digit at least. None when there is nothing left. The same as web/habitudes.js."""
    if not isinstance(s, str):
        return None
    s = unicodedata.normalize("NFC", s)
    s = "".join(" " if unicodedata.category(c) in ("Zl", "Zp") or c in "\t\n\r" else c for c in s)
    s = "".join(c for c in s if unicodedata.category(c)[0] != "C")
    s = re.sub(r"\s+", " ", s).strip().strip("\"'«»“”‘’ ").strip()
    if re.search(r"://|www\.", s, re.I):
        return None
    s = s[:PHRASE_MAX].strip()
    return s if any(unicodedata.category(c)[0] in "LN" for c in s) else None


def default_state(rng):
    favs = rng.sample(list(JEUX), 2)
    aime = rng.sample(list(RIRES), 4)
    return {"horaires": dict(DEFAULT_H), "sautee": "", "jeux": {"favoris": favs, "propose": True, "records": {}, "parties": 0},
            "rires": {"aime": [r for r in RIRES if r in aime]},
            "peurs": {p: {"on": True, "courage": 0, "jour": "", "gain": 0, "vaincue": False} for p in PEURS},
            "expressions": {m: [] for m in MOMENTS}}


def clean(d, rng=None):
    """A complete, valid state from anything (the saved file): every bad part takes its default."""
    rng = rng or random.Random()
    out = default_state(rng)
    if not isinstance(d, dict):
        return out
    out["horaires"] = clean_horaires(d.get("horaires"))
    if isinstance(d.get("sautee"), str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", d["sautee"]):
        out["sautee"] = d["sautee"]
    j = d.get("jeux") if isinstance(d.get("jeux"), dict) else {}
    favs = [x for x in j.get("favoris", []) if isinstance(x, str) and x in JEUX] if isinstance(j.get("favoris"), list) else []
    favs = list(dict.fromkeys(favs))[:2]
    while len(favs) < 2:
        favs.append(next(x for x in out["jeux"]["favoris"] + list(JEUX) if x not in favs))
    out["jeux"]["favoris"] = favs
    if isinstance(j.get("propose"), bool):
        out["jeux"]["propose"] = j["propose"]
    rec = j.get("records") if isinstance(j.get("records"), dict) else {}
    out["jeux"]["records"] = {k: v for k, v in ((k, _int(rec.get(k), 0, 10 ** 6)) for k in JEUX) if v}
    out["jeux"]["parties"] = _int(j.get("parties"), 0, 10 ** 9) or 0
    r = d.get("rires") if isinstance(d.get("rires"), dict) else {}
    if isinstance(r.get("aime"), list):
        out["rires"]["aime"] = [k for k in RIRES if k in r["aime"]]
    p = d.get("peurs") if isinstance(d.get("peurs"), dict) else {}
    for k in PEURS:
        x = p.get(k) if isinstance(p.get(k), dict) else {}
        o = out["peurs"][k]
        if isinstance(x.get("on"), bool):
            o["on"] = x["on"]
        o["courage"] = _int(x.get("courage"), 0, 100) or 0
        if isinstance(x.get("jour"), str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", x["jour"]):
            o["jour"] = x["jour"]
            o["gain"] = _int(x.get("gain"), 0, COURAGE_DAY) or 0
        o["vaincue"] = x.get("vaincue") is True and o["courage"] >= 100
    e = d.get("expressions") if isinstance(d.get("expressions"), dict) else {}
    for m in MOMENTS:
        seen, keep = set(), []
        for s in e.get(m) if isinstance(e.get(m), list) else []:
            c = clean_phrase(s)
            if c and c.lower() not in seen:
                seen.add(c.lower())
                keep.append(c)
        out["expressions"][m] = keep[:PHRASES_MAX]
    return out


def migrate(car):
    """His first schedule from caractère's old quiet hours (calme {de, a}), when someone had changed them: from bedtime to
    wake-up, whole hours. « Pas d'heures calmes » (de == a): he did not want any night, the schedule starts switched off.
    None when there is nothing to migrate (the defaults then: a child's home)."""
    q = car.get("calme") if isinstance(car, dict) else None
    if not isinstance(q, dict):
        return None
    de, a = _int(q.get("de"), 0, 23), _int(q.get("a"), 0, 23)
    if de is None or a is None or (de, a) == (23, 6):
        return None
    if de == a:
        return dict(DEFAULT_H, actif=False)
    h = dict(DEFAULT_H, coucher=de * 60, reveil=a * 60)
    return h if not problem(h) else None


# ---------- the feature on the hub ----------
class Habitudes:
    def __init__(self, hub, datadir=None, now=time.time, rng=None):
        self.hub, self.clock, self.rng = hub, now, rng or random.Random()
        self.file = Path(datadir) / "habitudes.json" if datadir else None
        self.demo = bool(getattr(hub, "demo", False))
        self.decalage = None if self.demo else 0.0             # s added to the clock for his schedule; None: paused (demo)
        self.partie, self.last_game, self.ev, self.rire, self.peur, self.phrase = None, None, None, None, None, None
        self._id = int(self.clock() * 1000) % 1000000 * 10
        self.n_ev = 0                                          # the routine's events, numbered for good (a reset ev keeps counting)
        self.last_tick, self.last_etat, self.pub_etat = None, None, None   # the last tick (s) and what it saw; the etat published
        self.bed_key, self.bed_done = None, set()              # this bedtime (its start) and the steps already played (dents, veilleuse)
        self.storm, self.storm_next = False, 0.0
        data = self._load()
        if data is None:
            self.S = clean({}, self.rng)
            moved = migrate(hub.s.get("caractere"))
            if moved:
                self.S["horaires"] = moved
                log.info("habitudes: his first schedule comes from caractère's quiet hours")
        else:
            self.S = clean(data, self.rng)
        self.save()
        self.publish()

    # ---- files ----
    def _load(self):
        if not self.file or not self.file.exists():
            return None
        try:
            d = json.loads(self.file.read_text(encoding="utf-8"))
            if not isinstance(d, dict):
                raise ValueError("not an object")
            return d
        except Exception as e:                          # noqa: BLE001 - put aside, never written over (his taught phrases may be in it)
            log.warning("habitudes.json unreadable (%s): put aside as habitudes.json.illisible, his usual habits", e)
            try:
                self.file.replace(self.file.with_name("habitudes.json.illisible"))
            except OSError:
                self.file = None                         # (and if it cannot even be put aside, nothing is saved this time)
            return {}

    def save(self):
        if not self.file:
            return
        try:
            self.file.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.file.with_suffix(".tmp")
            fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)     # his taught phrases: the family's own words
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(json.dumps({"v": 1, **self.S}, ensure_ascii=False, indent=1))
            os.chmod(tmp, 0o600)
            os.replace(tmp, self.file)
        except OSError as e:
            log.warning("habitudes.json not saved: %s", e)

    # ---- his clock ----
    def paused(self):
        return self.decalage is None

    def t(self):
        """Now, for his schedule (s): the Pi's clock, or the lab's simulated time of day."""
        return self.clock() + (self.decalage or 0.0)

    def local(self, t=None):
        return dt.datetime.fromtimestamp(self.t() if t is None else t)

    def etat(self, t=None):
        if self.paused():
            return "eveille", None, None, None
        return etat_at(self.S["horaires"], self.local(t), self.S["sautee"])

    def is_night(self, t):
        """Is t (s, the real clock) in his night? None when paused or off: the caller keeps its old night."""
        h = self.S["horaires"]
        if self.paused() or not h["actif"]:
            return None
        return etat_at(h, dt.datetime.fromtimestamp(t + self.decalage))[0] == "nuit"

    def awake_hours(self, t0, t1, cap=None):
        """Awake hours between t0 and t1 (real clock, s) for his belly; None when paused or off (the old night counts)."""
        h = self.S["horaires"]
        if self.paused() or not h["actif"]:
            return None
        return awake_hours(h, t0 + self.decalage, t1 + self.decalage, cap)

    def awake(self):
        return self.etat()[0] in ("eveille", "reveil")

    def summary(self):
        """A few words for Claude (get_status): his state, his schedule, his games."""
        e, _, until, _ = self.etat()
        h = self.S["horaires"]
        words = {"eveille": "Tu es réveillé", "reveil": "Tu viens de te réveiller", "sieste": "Tu fais la sieste",
                 "coucher": "Tu vas bientôt te coucher", "nuit": "Tu dors : c'est la nuit"}[e]
        if not h["actif"]:
            sched = "Ton emploi du temps est désactivé : tu ne te couches pas tout seul."
        else:
            sched = f"Tu te réveilles à {hm(h['reveil'])} et tu te couches à {hm(h['coucher'])}"
            if h["sieste"]:
                sched += f", sieste à {hm(h['sieste']['de'])} ({h['sieste']['duree']} min)"
            if h["weekend"]:
                sched += f" ; le week-end : réveil à {hm(h['weekend']['reveil'])}, coucher à {hm(h['weekend']['coucher'])}"
            sched += "."
        favs = " et ".join(JEUX[j] for j in self.S["jeux"]["favoris"])
        out = f"{words}. {sched} Tes jeux préférés : {favs}."
        if self.partie and self.partie["etat"] == "joue":
            out += f" Une partie de {JEUX[self.partie['jeu']]} est en cours sur ton écran."
        if self.paused():
            out += " (Mode démo : ton horloge est en pause.)"
        return out

    def horaires_text(self):
        """His schedule in a sentence (a toast): « Il se réveille à 7 h 30 et se couche à 21 h. »"""
        h = self.S["horaires"]
        if not h["actif"]:
            return "Il n'a pas d'emploi du temps : il ne se couche pas tout seul. Règle-le dans « Ses habitudes »."
        out = f"Il se réveille à {hm(h['reveil'])} et se couche à {hm(h['coucher'])}"
        if h["sieste"]:
            out += f", avec une sieste à {hm(h['sieste']['de'])}"
        if h["weekend"]:
            out += f". Le week-end : debout à {hm(h['weekend']['reveil'])}, au lit à {hm(h['weekend']['coucher'])}"
        return out + ". Change-les dans « Ses habitudes »."

    # ---- the snapshot ----
    def publish(self):
        e, since, until, nxt = self.etat()
        S = self.S
        self.hub.s["habitudes"] = {
            "horaires": json.loads(json.dumps(S["horaires"])), "etat": e, "dort": e in ("nuit", "sieste"), "nuit": e == "nuit",
            "depuis": since.timestamp() * 1000 - (self.decalage or 0) * 1000 if since else 0,
            "prochain": {"etat": nxt, "t": until.timestamp() * 1000 - (self.decalage or 0) * 1000} if until else None,
            "sautee": S["sautee"], "horloge": {"decalage": round((self.decalage or 0) * 1000), "pause": self.paused()},
            "ev": self.ev, "jeux": json.loads(json.dumps(S["jeux"])), "partie": json.loads(json.dumps(self.partie)) if self.partie else None,
            "rires": {"aime": list(S["rires"]["aime"])}, "rire": self.rire,
            "peurs": {k: {"on": v["on"], "courage": v["courage"]} for k, v in S["peurs"].items()}, "peur": self.peur,
            "expressions": {m: list(v) for m, v in S["expressions"].items()}, "phrase": self.phrase}
        self.pub_etat = e
        self.hub.mark()

    def _ev(self, kind, **extra):
        self.n_ev += 1
        self.ev = {"id": self.n_ev, "kind": kind, "t0": now_ms(), **extra}

    def _next_id(self):
        self._id += 1
        return self._id

    # ---- the clock ticks (every second) ----
    def tick(self):
        e, since, until, _ = self.etat()
        now = self.clock()
        live = self.last_tick is not None and 0 <= now - self.last_tick < EV_FRESH   # ticks every second: a gap is a jump
        before, self.last_tick, self.last_etat = self.last_etat, now, e
        n = self.n_ev
        if before is not None and e != before and live:
            if e == "reveil":
                self._ev("reveil")
            elif e == "sieste":
                self._ev("sieste")
            elif before == "sieste" and e == "eveille":
                self._ev("fin-sieste")
            elif e == "coucher":
                self._ev("annonce")
            elif e == "nuit":
                self._ev("dodo")
        if e == "coucher" and live and until is not None:          # each step once a bedtime, even after a « pas maintenant »
            if self.bed_key != since:
                self.bed_key, self.bed_done = since, set()
            left, noir = (until - self.local()).total_seconds() / 60, self.S["peurs"]["noir"]
            if "dents" not in self.bed_done and VEILLEUSE_MIN < left <= DENTS_MIN:
                self.bed_done.add("dents")
                self._ev("dents")
            elif "veilleuse" not in self.bed_done and left <= VEILLEUSE_MIN and noir["on"] and noir["courage"] < 100:
                self.bed_done.add("veilleuse")
                self._ev("veilleuse")
        t = now_ms()
        moved = self._game_tick(t) if self.partie else False
        moved = self._storm() or moved
        if e != self.pub_etat or self.n_ev != n or moved:     # a new state, a step of his routine (even right after an action), the game
            self.publish()

    async def atick(self):
        self.tick()

    def cast_on(self):
        c = self.hub.s.get("cast")
        return bool(c and c.get("id") and (not c.get("until") or c["until"] > now_ms()))

    def covered(self):
        """Something comes before the game on his screen: a cast (pixel/cast.py) or an exercise opened since (pixel/exos.py)."""
        ex = getattr(self.hub, "exos", None)
        return self.cast_on() or bool(ex is not None and ex.cur)

    def _game_tick(self, t):
        p = self.partie
        if self.covered():                                      # a cast or an exercise covers his screen: the game waits under it
            if not p["pause"]:
                p["pause"] = t
                return True
            return False
        if p["pause"]:                                          # the cast is over: the game goes on where it was
            d = t - p["pause"]
            p["pause"] = 0
            for k in ("t0", "phase_t"):
                p[k] += d
            if p["fin"]:
                p["fin"]["t"] += d
            return True
        what = game_tick(p, t, self.rng)
        self._game_ev(what)
        if what == "ferme":
            self.last_game = {"jeu": p["jeu"], "t": t}
            self.partie = None
            return True
        if what == "fin":
            self._game_over()
        return bool(what)

    def _game_over(self):
        p, S = self.partie, self.S
        res = p["fin"]["resultat"]
        score = p["fin"]["score"]
        rec = S["jeux"]["records"]
        if p["jeu"] in ("etoiles", "simon", "cache") and isinstance(score, int) and score > rec.get(p["jeu"], 0):
            rec[p["jeu"]] = score
            p["fin"]["record"] = True
        if p["jeu"] == "pfc" and res == "gagne":
            rec["pfc"] = rec.get("pfc", 0) + 1
        S["jeux"]["parties"] += 1
        p["fin"]["rit"] = res == "perdu" and "gagner" in S["rires"]["aime"]     # he won, and winning makes him laugh
        self.save()

    def _storm(self):
        """The weather says a storm: a thunder clap now, then now and then while it lasts (only while he is awake)."""
        w = self.hub.s.get("weather")
        kind = ((w or {}).get("now") or {}).get("kind") if isinstance(w, dict) else None
        if kind != "orage":
            self.storm = False
            return False
        t = self.clock()
        if not self.storm:
            self.storm, self.storm_next = True, t
        if t < self.storm_next or not self.awake() or not self.S["peurs"]["orage"]["on"] or self.partie:
            return False
        self.storm_next = t + self.rng.uniform(*STORM_GAP)
        return self.fear("orage")

    def fear(self, kind):
        if kind not in PEURS or not self.S["peurs"][kind]["on"]:
            return False
        self.peur = {"id": (self.peur or {}).get("id", 0) + 1, "kind": kind, "t0": now_ms(), "courage": self.S["peurs"][kind]["courage"]}
        return True

    # ---- the actions ----
    def set_horaires(self, args):
        """Change his schedule: only the parts given; refused (a toast says why) when it would not be a day."""
        h = json.loads(json.dumps(self.S["horaires"]))
        if isinstance(args.get("actif"), bool):
            h["actif"] = args["actif"]
        for k in ("reveil", "coucher"):
            if k in args and args[k] is not None:
                v = to_min(args[k])
                if v is None:
                    return "Je n'ai pas compris cette heure."
                h[k] = v
        if "sieste" in args:
            s = args["sieste"]
            if s in (None, False, "", "non"):
                h["sieste"] = None
            else:
                base = h["sieste"] or {"de": 13 * 60 + 30, "duree": 60}
                s = s if isinstance(s, dict) else {"de": s}
                de = to_min(s.get("de")) if "de" in s else base["de"]
                d = _int(s.get("duree"), NAP_MIN, NAP_MAX) if "duree" in s else base["duree"]
                if de is None or d is None:
                    return "Je n'ai pas compris cette sieste."
                h["sieste"] = {"de": de, "duree": d}
        if "weekend" in args:
            w = args["weekend"]
            if w in (None, False, "", "non"):
                h["weekend"] = None
            else:
                base = h["weekend"] or {"reveil": (h["reveil"] + 90) % 1440, "coucher": (h["coucher"] + 30) % 1440}
                w = w if isinstance(w, dict) else {}
                r = to_min(w.get("reveil")) if "reveil" in w else base["reveil"]
                c = to_min(w.get("coucher")) if "coucher" in w else base["coucher"]
                if r is None or c is None:
                    return "Je n'ai pas compris ces horaires du week-end."
                h["weekend"] = {"reveil": r, "coucher": c}
        why = problem(h)
        if why:
            return why
        if h != self.S["horaires"]:
            self.S["horaires"] = h
            self.save()
        return ""

    def start(self, jeu, par=""):
        """A game, if he can play now. Returns '' or why not (French)."""
        if jeu == "au-choix" or jeu not in JEUX:
            jeu = self.rng.choice(self.S["jeux"]["favoris"])
        e = self.etat()[0]
        if e in ("nuit", "sieste", "coucher"):
            self._pas_maintenant(e)
            return {"nuit": "Chut… il dort. On jouera demain !", "sieste": "Chut… il fait la sieste. On jouera après !",
                    "coucher": "C'est bientôt l'heure du dodo : on jouera demain !"}[e]
        ex = getattr(self.hub, "exos", None)
        if ex is not None and ex.cur:
            return "Termine ton exo d'abord !"
        if self.cast_on():
            return "Attends la fin de ce qui s'affiche sur son écran."
        if self.partie and self.partie["etat"] == "joue":       # one at a time: « Rejouer » comes once it is over
            return "Une partie est déjà en cours : touche × pour l'arrêter."
        self.partie = new_game(jeu, now_ms(), self.rng, self._next_id(), jeu in self.S["jeux"]["favoris"], par)
        self.hub.s["anim"] = None
        self.hub.s["screen"] = "visage"
        return ""

    def _pas_maintenant(self, e, quoi="jeu"):
        """He sleeps (or goes to bed): he says so on his screen. quoi: what was asked (jeu, blague, reveil: he mumbles)."""
        self._ev("pas-maintenant", etat=e, quoi=quoi)

    def _game_ev(self, what):
        p = self.partie
        if p and what:
            p["ev"] = {"n": (p.get("ev") or {}).get("n", 0) + 1, "kind": what}

    def move(self, a):
        if not self.partie:
            return ""
        what = game_move(self.partie, a, now_ms(), self.rng)
        if self.partie["etat"] == "fin" and what in ("faux", "gagne"):
            self._game_over()
        self._game_ev(what)
        return what

    def stop_game(self):
        if self.partie:
            if self.partie["etat"] == "joue":
                _end(self.partie, now_ms(), "stop", None)
            self.last_game = {"jeu": self.partie["jeu"], "t": now_ms()}
            self.partie = None

    def laugh(self, kind):
        """A joke, a grimace or a funny noise on every screen (rire-* scenes): n picks which."""
        if kind not in ("blague", "grimace", "bruit"):
            return "?"
        e = self.etat()[0]
        if e in ("nuit", "sieste"):
            self._pas_maintenant(e, "blague")
            return "Chut… il dort."
        n = self.rng.randrange(len(BLAGUES) if kind == "blague" and BLAGUES else BRUITS if kind == "bruit" else 6)
        if kind == "blague" and self.rire and self.rire.get("kind") == "blague" and len(BLAGUES) > 1:
            while n == self.rire.get("n"):
                n = self.rng.randrange(len(BLAGUES))
        aime = {"blague": "blagues", "grimace": "grimaces", "bruit": "bruits"}[kind] in self.S["rires"]["aime"]
        self.rire = {"id": (self.rire or {}).get("id", 0) + 1, "kind": kind, "n": n, "aime": aime, "t0": now_ms()}
        self.hub.s["anim"] = None
        self.hub.s["screen"] = "visage"
        return ""

    def comfort(self, kind):
        """Petting him while he is scared: courage, COURAGE_STEP a time, COURAGE_DAY a day at most. True when it grew."""
        if kind not in PEURS:
            return False
        p, day = self.S["peurs"][kind], self.local().date().isoformat()
        if p["jour"] != day:
            p["jour"], p["gain"] = day, 0
        step = min(COURAGE_STEP, COURAGE_DAY - p["gain"], 100 - p["courage"])
        if step <= 0:
            return False
        p["courage"] += step
        p["gain"] += step
        if p["courage"] >= 100:
            p["vaincue"] = True
        self.save()
        return True

    def teach(self, moment, phrase):
        """A phrase for a moment: (ok, cleaned phrase or why not)."""
        if moment not in MOMENTS:
            return False, "Je ne connais pas ce moment."
        c = clean_phrase(phrase)
        if not c:
            return False, "Je n'ai pas compris la phrase."
        lst = [x for x in self.S["expressions"][moment] if x.lower() != c.lower()]
        self.S["expressions"][moment] = ([c] + lst)[:PHRASES_MAX]
        self.save()
        self.phrase = {"id": (self.phrase or {}).get("id", 0) + 1, "kind": "appris", "moment": moment, "texte": c, "t0": now_ms()}
        self.hub.s["anim"] = None
        self.hub.s["screen"] = "visage"
        return True, c

    def forget(self, moment, phrase=None):
        if moment not in MOMENTS:
            return False
        lst = self.S["expressions"][moment]
        keep = [x for x in lst if phrase is not None and x != phrase] if phrase is not None else []
        if keep == lst:
            return False
        self.S["expressions"][moment] = keep
        self.save()
        return True

    def say(self, moment, phrase):
        lst = self.S["expressions"].get(moment) or []
        if phrase not in lst:
            return False
        self.phrase = {"id": (self.phrase or {}).get("id", 0) + 1, "kind": "dit", "moment": moment, "texte": phrase, "t0": now_ms()}
        self.hub.s["anim"] = None
        self.hub.s["screen"] = "visage"
        return True


# ---------- his jokes: read from the scene pack (B('question', 'réponse') lines) ----------
_B = re.compile(r"""\bB\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*\)""")


def _jokes():
    try:
        text = re.sub(r"/\*.*?\*/", "", PACK.read_text(encoding="utf-8"), flags=re.S)
    except OSError:
        return []
    return [(q.replace("\\'", "'"), r.replace("\\'", "'")) for q, r in _B.findall(text)]


BLAGUES = _jokes()


# ---------- typed commands (pixel/commands.py: exact phrases only, the rest goes to Claude) ----------
def _norm(s):
    s = unicodedata.normalize("NFD", str(s).lower().strip())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").replace("’", "'")
    return re.sub(r"\s+", " ", s)


SEP = r"\s*(?:[:,–—-]\s*)?"
_M = r"(bonjour|bonne\s+nuit|merci|au\s+revoir|bravo|salut|j['’]ai\s+faim)"
_TEACH = [
    (re.compile(r"^dis\s+" + _M + r"\s+comme\s+(?:ça|ca)" + SEP + r"(.+)$", re.I), None),
    (re.compile(r"^(?:pour\s+dire|quand\s+tu\s+(?:dis|veux\s+dire))\s+" + _M + r"\s*,?\s*dis" + SEP + r"(.+)$", re.I), None),
    (re.compile(r"^quand\s+tu\s+es\s+(?:content|contente|heureux|heureuse)\s*,?\s*dis" + SEP + r"(.+)$", re.I), "content"),
    (re.compile(r"^quand\s+tu\s+as\s+faim\s*,?\s*dis" + SEP + r"(.+)$", re.I), "faim"),
    (re.compile(r"^(?:quand\s+tu\s+salues|pour\s+saluer|quand\s+tu\s+te\s+r[ée]veilles)\s*,?\s*dis" + SEP + r"(.+)$", re.I), "bonjour"),
    (re.compile(r"^(?:quand\s+tu\s+(?:vas\s+te\s+coucher|te\s+couches|vas\s+dormir))\s*,?\s*dis" + SEP + r"(.+)$", re.I), "bonne-nuit"),
    (re.compile(r"^(?:quand\s+tu\s+(?:pars|t['’]en\s+vas))\s*,?\s*dis" + SEP + r"(.+)$", re.I), "au-revoir"),
    (re.compile(r"^(?:quand\s+(?:je|on)\s+gagne)\s*,?\s*dis" + SEP + r"(.+)$", re.I), "bravo"),
]
WORD_MOMENT = {"bonjour": "bonjour", "salut": "bonjour", "bonne nuit": "bonne-nuit", "merci": "merci", "au revoir": "au-revoir",
               "bravo": "bravo", "j'ai faim": "faim"}
GAME_WORDS = {"cache-cache": "cache", "cache cache": "cache", "pierre feuille ciseaux": "pfc", "pierre-feuille-ciseaux": "pfc",
              "pierre, feuille, ciseaux": "pfc", "chifoumi": "pfc", "shifumi": "pfc", "attrape les etoiles": "etoiles",
              "attrape-etoiles": "etoiles", "attrape etoiles": "etoiles", "attrape-etoile": "etoiles", "simon": "simon",
              "jeu de simon": "simon", "le jeu de simon": "simon"}
_PLAY = re.compile(r"^(?:on joue|tu veux jouer|joue avec moi|jouons|on fait un jeu|un jeu|on fait une partie|on va jouer|viens jouer)(?: avec moi)?$")
_PLAY_X = re.compile(r"^(?:on joue|jouons|joue|on fait un|on fait une partie de|une partie de|on va jouer|tu veux jouer) (?:a |au |aux )?(.+)$")
_JOKE = re.compile(r"^(?:(?:raconte|dis|fais) une (?:autre |petite )?blague|une blague|encore une blague|une autre blague)$")   # « raconte-moi une blague »: Claude's, as before
_GRIMACE = re.compile(r"^(?:fais|fait)(?:-moi| moi)? (?:une|la|des) grimaces?$|^une grimace$")
_BRUIT = re.compile(r"^(?:fais|fait)(?:-moi| moi)? (?:un|des) bruits? (?:rigolos?|droles?|marrants?)$|^un bruit (?:rigolo|drole|marrant)$")
_STOP = re.compile(r"^(?:stop|arrete|arreter|fini|stop le jeu|arrete le jeu|arrete de jouer|on arrete de jouer|j'arrete de jouer|fin du jeu)$")
_AGAIN = re.compile(r"^(?:on rejoue|rejoue|rejouons|encore une partie|une autre partie|on refait une partie)$")
_HORAIRES = re.compile(r"^(?:ton emploi du temps|tes horaires|a quelle heure tu te couches|a quelle heure tu te reveilles|tu te couches a quelle heure|tu te reveilles a quelle heure)$")
_LIST = re.compile(r"^(?:tes expressions|tes phrases|quelles sont tes phrases|quelles sont tes expressions)$")
_FORGET_ALL = re.compile(r"^oublie (?:tes phrases|tes expressions|toutes tes phrases)$")
_FORGET = re.compile(r"^oublie (?:ta|tes) phrases? (?:de |pour (?:dire )?)(bonjour|bonne nuit|merci|au revoir|bravo|quand tu es content|quand tu as faim)$")
_TIME = r"(\d{1,2})\s*(?:h|heures?|:)\s*(\d{2})?"
_SET = re.compile(r"^(?:couche-toi|tu te coucheras|tu te couches|coucher|au lit) a " + _TIME + r"$|^(reveille-toi|tu te reveilleras|tu te reveilles|reveil|debout) a " + _TIME + r"$")
_NAP = re.compile(r"^(?:fais (?:la|ta) sieste|sieste) a " + _TIME + r"$")
_NO_NAP = re.compile(r"^(?:pas de sieste|plus de sieste|arrete la sieste)$")
_WAKE = re.compile(r"^(?:reveille-toi|reveille toi|debout|reveille-toi pixel|debout pixel)$")


def teach_parse(raw):
    """(moment, phrase) when raw teaches him a phrase, else None. On the text as typed: the phrase keeps its case and accents."""
    raw = raw.strip()
    for rx, moment in _TEACH:
        m = rx.match(raw)
        if m:
            if moment is None:
                moment = WORD_MOMENT.get(re.sub(r"\s+", " ", _norm(m.group(1))))
                phrase = m.group(2)
            else:
                phrase = m.group(1)
            if moment and clean_phrase(phrase):
                return moment, phrase
            return None
    return None


async def command(hub, t, raw):
    """« on joue ? », « cache-cache », « raconte une blague », « dis bonjour comme ça : Salut ! »… True when it was one."""
    H = getattr(hub, "habitudes", None)
    if H is None:
        return False
    t = re.sub(r"\s*[!.?…]+$", "", _norm(t)).strip()
    t = re.sub(r"\s+(?:pixel|s'il te plait|stp|svp)$", "", t)
    taught = teach_parse(raw)
    if taught:
        await hub.dispatch("habitudes.apprendre", {"moment": taught[0], "phrase": taught[1]})
        return True
    p = H.partie
    if p and _STOP.match(t):
        await hub.dispatch("habitudes.stop")
        return True
    if _PLAY.match(t):
        await hub.dispatch("habitudes.jouer", {"jeu": "au-choix", "par": "commande"})
        return True
    m = _PLAY_X.match(t)
    jeu = GAME_WORDS.get(t) or (GAME_WORDS.get(m.group(1).strip()) if m else None)
    if jeu:
        await hub.dispatch("habitudes.jouer", {"jeu": jeu, "par": "commande"})
        return True
    if _AGAIN.match(t) and H.last_game and now_ms() - H.last_game["t"] < AGAIN_MS:
        await hub.dispatch("habitudes.jouer", {"jeu": H.last_game["jeu"], "par": "commande"})
        return True
    if _JOKE.match(t):
        await hub.dispatch("habitudes.rire", {"kind": "blague"})
        return True
    if _GRIMACE.match(t):
        await hub.dispatch("habitudes.rire", {"kind": "grimace"})
        return True
    if _BRUIT.match(t):
        await hub.dispatch("habitudes.rire", {"kind": "bruit"})
        return True
    if _HORAIRES.match(t):
        hub.toast(H.horaires_text(), 8000)
        return True
    if _LIST.match(t):
        ex = H.S["expressions"]
        n = sum(len(v) for v in ex.values())
        hub.toast("Il ne connaît pas encore de phrase à toi. Tape « dis bonjour comme ça : Salut ! »." if not n else
                  f"Il connaît {n} phrase{'s' if n > 1 else ''} à toi : " + " · ".join(f"{MOMENTS[k].lower()} ({len(v)})" for k, v in ex.items() if v)
                  + ". Elles sont dans « Ses habitudes », sur ton téléphone.", 9000)
        return True
    if _FORGET_ALL.match(t):
        if not any(H.S["expressions"].values()):
            return False
        for k in MOMENTS:
            H.S["expressions"][k] = []
        H.save()
        H.publish()
        hub.toast("C'est oublié : il reprend ses phrases à lui.", 5000)
        return True
    m = _FORGET.match(t)
    if m:
        w = m.group(1)
        moment = {"quand tu es content": "content", "quand tu as faim": "faim"}.get(w) or WORD_MOMENT.get(w)
        if not H.forget(moment):
            return False
        H.publish()
        hub.toast(f"C'est oublié : {MOMENTS[moment].lower()}, il reprend ses phrases à lui.", 5000)
        return True
    m = _SET.match(t)
    if m:
        bed = m.group(1) is not None
        hh, mm = (m.group(1), m.group(2)) if bed else (m.group(4), m.group(5))
        await hub.dispatch("habitudes.horaires", {"coucher" if bed else "reveil": f"{int(hh)}:{mm or '00'}"})
        return True
    m = _NAP.match(t)
    if m:
        await hub.dispatch("habitudes.horaires", {"sieste": {"de": f"{int(m.group(1))}:{m.group(2) or '00'}"}})
        return True
    if _NO_NAP.match(t):
        if not H.S["horaires"]["sieste"]:
            return False
        await hub.dispatch("habitudes.horaires", {"sieste": None})
        return True
    if _WAKE.match(t) and H.etat()[0] in ("sieste", "nuit"):
        await hub.dispatch("habitudes.reveiller")
        return True
    return False


# ---------- Claude (pixel/claude.py adds TOOL, asks check_tool() and run_tool()) ----------
# No « apprendre »: a phrase he says on his own later is taught by the child or a parent (typed, or the panel), never by
# Claude, whose context holds text from outside (the calendar's invitations...).
TOOL = {"name": "habits", "eager_input_streaming": True,
        "description": "Tes habitudes à toi, Pixel. action : « horaires » change ton emploi du temps (reveil, coucher, sieste en "
                       "HH:MM, sieste vide : pas de sieste, sieste_minutes ; weekend_reveil et weekend_coucher, vides : pas d'horaires "
                       "du week-end) ; « jouer » lance un de tes mini-jeux sur ton écran (jeu : "
                       + ", ".join(f"{k} ({v})" for k, v in JEUX.items()) + ", ou au-choix) ; « blague » : tu racontes une de tes "
                       "blagues sur ton écran. La nuit et pendant ta sieste, tu dors : pas de jeu ni de blague. Tu ne peux pas "
                       "apprendre de phrase : la personne te les apprend elle-même (« dis bonjour comme ça : … »).",
        "input_schema": {"type": "object", "additionalProperties": False, "required": ["action"], "properties": {
            "action": {"type": "string", "enum": ["horaires", "jouer", "blague"]},
            "reveil": {"type": "string"}, "coucher": {"type": "string"}, "sieste": {"type": "string"},
            "sieste_minutes": {"type": "integer", "minimum": NAP_MIN, "maximum": NAP_MAX},
            "weekend_reveil": {"type": "string"}, "weekend_coucher": {"type": "string"},
            "jeu": {"type": "string", "enum": list(JEUX) + ["au-choix"]}}}}
_TOOL_KEYS = {"horaires": {"reveil", "coucher", "sieste", "sieste_minutes", "weekend_reveil", "weekend_coucher"},
              "jouer": {"jeu"}, "blague": set()}


def check_tool(a):
    if not isinstance(a, dict) or a.get("action") not in _TOOL_KEYS or set(a) - {"action"} - _TOOL_KEYS[a["action"]]:
        return False
    if a["action"] == "horaires":
        if len(a) < 2:
            return False
        for k in ("reveil", "coucher", "weekend_reveil", "weekend_coucher", "sieste"):
            if k in a and not (isinstance(a[k], str) and (a[k] == "" and k != "reveil" and k != "coucher" or to_min(a[k]) is not None)):
                return False
        return "sieste_minutes" not in a or _int(a["sieste_minutes"], NAP_MIN, NAP_MAX) == a["sieste_minutes"]
    if a["action"] == "jouer":
        return a.get("jeu", "au-choix") in list(JEUX) + ["au-choix"]
    return True


async def run_tool(hub, a):
    H = getattr(hub, "habitudes", None)
    if H is None:
        return "tes habitudes ne sont pas disponibles"
    act = a.get("action")
    if act not in _TOOL_KEYS:                     # « apprendre » included: phrases are the family's to teach
        return "action inconnue : horaires, jouer ou blague"
    if act == "horaires":
        args = {k: a[k] for k in ("reveil", "coucher") if k in a}
        if "sieste" in a or "sieste_minutes" in a:
            if a.get("sieste") == "":
                args["sieste"] = None
            else:
                args["sieste"] = {**({"de": a["sieste"]} if a.get("sieste") else {}), **({"duree": a["sieste_minutes"]} if "sieste_minutes" in a else {})}
        if "weekend_reveil" in a or "weekend_coucher" in a:
            if a.get("weekend_reveil") == "" and a.get("weekend_coucher", "") == "":
                args["weekend"] = None
            else:
                args["weekend"] = {k: a["weekend_" + k] for k in ("reveil", "coucher") if a.get("weekend_" + k)}
        why = H.set_horaires(args)
        H.publish()
        return ("refusé : " + why) if why else "c'est fait. " + H.summary()
    if act == "jouer":
        why = H.start(a.get("jeu", "au-choix"), "claude")
        H.publish()
        if why:
            return "pas de jeu maintenant : " + why
        return f"partie de {JEUX[H.partie['jeu']]} lancée sur ton écran : la personne joue en touchant l'écran."
    why = H.laugh("blague")
    H.publish()
    if why:
        return "pas de blague maintenant : tu dors"
    q, r = BLAGUES[H.rire["n"]] if BLAGUES else ("", "")
    return f"tu racontes sur ton écran : « {q} … {r} ». Ne la répète pas, ris avec la personne."


def setup(hub, datadir=None, now=time.time, rng=None, run=True):
    """His habits: loaded from data_dir/habitudes.json (after caractère: its old quiet hours may be migrated), the actions
    habitudes.*, a tick every second (his routine, the game, the storm; run=False: the caller ticks, tests).
    hub.habitudes: for commands.py, claude.py, nourrir.py."""
    if datadir is None:
        datadir = Path(os.path.expanduser(hub.cfg.get("data_dir", "~/.config/pixel")))
    H = Habitudes(hub, datadir, now, rng)
    hub.habitudes = H

    def done(why=""):
        if why:
            hub.toast(why, 5000)
        H.publish()

    @hub.action("habitudes.horaires")
    async def horaires(**args):
        """His schedule: actif, reveil, coucher ("7:30" or minutes), sieste ({de, duree} or None), weekend ({reveil, coucher} or None)."""
        done(H.set_horaires({k: v for k, v in args.items() if k in ("actif", "reveil", "coucher", "sieste", "weekend")}))

    @hub.action("habitudes.reveiller")
    async def reveiller():
        """Ends his nap for today; at night he only mumbles and sleeps on."""
        e = H.etat()[0]
        if e == "sieste":
            H.S["sautee"] = H.local().date().isoformat()
            H.save()
        elif e == "nuit":
            H._pas_maintenant("nuit", "reveil")
        done()

    @hub.action("habitudes.jouer")
    async def jouer(jeu="au-choix", par=""):
        why = H.start(str(jeu), str(par)[:20])
        done(why)

    @hub.action("habitudes.coup")
    async def coup(**a):
        if H.move(a):
            done()

    @hub.action("habitudes.stop")
    async def stop():
        H.stop_game()
        done()

    @hub.action("habitudes.favori")
    async def favori(jeu=""):
        """Makes `jeu` one of his 2 favourites (the older one leaves)."""
        f = H.S["jeux"]["favoris"]
        if jeu in JEUX and jeu not in f:
            H.S["jeux"]["favoris"] = [f[1], jeu]
            H.save()
        done()

    @hub.action("habitudes.propose")
    async def propose(on=True):
        H.S["jeux"]["propose"] = bool(on)
        H.save()
        done()

    @hub.action("habitudes.rire")
    async def rire(kind="blague"):
        done(H.laugh(str(kind)) if str(kind) in ("blague", "grimace", "bruit") else "")

    @hub.action("habitudes.rires")
    async def rires(aime=None, kind=None, on=None):
        """What makes him laugh: the whole list (aime), or one kind switched on or off."""
        cur = H.S["rires"]["aime"]
        if isinstance(aime, list):
            cur = [k for k in RIRES if k in aime]
        elif kind in RIRES and isinstance(on, bool):
            cur = [k for k in RIRES if (k in cur and k != kind) or (k == kind and on)]
        H.S["rires"]["aime"] = cur
        H.save()
        done()

    @hub.action("habitudes.peurs")
    async def peurs(peur="", on=None):
        if peur in PEURS and isinstance(on, bool):
            H.S["peurs"][peur]["on"] = on
            H.save()
        done()

    @hub.action("habitudes.rassure")
    async def rassure(peur=""):
        """Petted while scared: his courage grows (the screens play his comfort scene themselves)."""
        if H.comfort(str(peur)):
            done()

    @hub.action("habitudes.peur")
    async def peur(kind=""):
        """A fear now (Pixel Lab, the demo, the tests): the storm on every screen; the others are played by each screen."""
        if (hub.demo or getattr(hub, "lab", False)) and kind in PEURS and H.fear(kind):
            done()

    @hub.action("habitudes.apprendre")
    async def apprendre(moment="", phrase=""):
        """A phrase taught by the family (typed, or the panel): never by Claude (TOOL has no such action)."""
        ok, what = H.teach(str(moment)[:20], phrase[:PHRASE_IN] if isinstance(phrase, str) else "")
        done("" if ok else what)

    @hub.action("habitudes.oublier")
    async def oublier(moment="", phrase=None):
        if H.forget(str(moment), phrase if isinstance(phrase, str) else None):
            done()

    @hub.action("habitudes.dire")
    async def dire(moment="", phrase=""):
        if H.say(str(moment), phrase):
            done()

    @hub.action("habitudes.demo")
    async def demo(heure=None, avant=0):
        """Demo only (--demo, Pixel Lab): a simulated time of day for his schedule ("22:30", `avant` seconds before it), or None:
        paused again."""
        if not hub.demo:
            return
        m = to_min(heure) if heure is not None else None
        if heure is None or m is None:
            H.decalage = None
        else:
            now = dt.datetime.now()
            want = dt.datetime.combine(now.date(), dt.time(m // 60, m % 60))
            H.decalage = want.timestamp() - (_int(avant, 0, 3600) or 0) - time.time()
        H.last_tick = H.last_etat = None           # a jump: no routine scene for it
        H.ev = None
        done()

    try:
        H.task = asyncio.get_running_loop().create_task(hub.every(1, H.atick, 1)) if run else None
    except RuntimeError:                           # no event loop (tests): they tick themselves
        H.task = None
    return H
