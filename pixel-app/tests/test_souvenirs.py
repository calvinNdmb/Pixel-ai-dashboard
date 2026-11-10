"""Ses souvenirs, l'album et le carnet d'humeur, the server's side (pixel/souvenirs.py, pixel/album.py).

    python3 tests/test_souvenirs.py        # pure logic on a fake clock, then a demo server on port 8442 (SOUVENIRS_PY_PORT=…)

- the dates, on a fixed clock: your birthday (a 29 February one too, in leap and other years), the next one across the
  year's turn, the monthly and yearly days you met (31 January, 29 February, December to January), 100 days;
- what is kept: souvenirs.json and humeur.json across a restart, the day you met from the oldest file, broken or hand-edited
  files (the server always starts; one that cannot be read is put aside, never written over, and the other one keeps all
  its memories; values of the wrong type dropped one by one; 0600), the timeline capped (pinned memories stay),
  souvenirs.ajoute checked, rate-limited, and a long text cut before any work on it;
- his records from the other features' state (a first look takes them as they are), coalesced, his first meal and trophy;
- the mood journal: when he may ask (his time, never at night, his quiet hours, asleep, twice a day, an hour apart), the
  question's time, the answers, yesterday, private by default (Claude neither sees it nor writes it until allowed);
- the typed commands (and what still goes to Claude), Claude's tool;
- the album: the bytes checked (JPEG, still WebP; PNG, an animation, a giant, a lie about the type refused), the size and
  count caps (favourites kept), the access rules (the Pi's own page, the access code; another device, another site's page,
  a sandboxed frame, a proxy: refused), no path out of the album, files kept across a restart, a broken album.json rebuilt.
In Paris time.
"""
import asyncio
import datetime as dt
import io
import json
import os
import re
import socket
import struct
import subprocess
import sys
import tempfile
import time
from pathlib import Path

os.environ["TZ"] = "Europe/Paris"
time.tzset()

import aiohttp  # noqa: E402

APP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP))
import server  # noqa: E402
from pixel import album, caractere, commands, exos, nourrir, scenes, souvenirs  # noqa: E402
from pixel.claude import TOOLS, Claude, check as claude_check, system_for, system_text  # noqa: E402
from pixel.state import Hub  # noqa: E402

PORT = int(os.environ.get("SOUVENIRS_PY_PORT") or 8442)   # SOUVENIRS_PY_PORT=… (test_souvenirs.js has SOUVENIRS_PORT)
fails = []
D = dt.date


def check(name, cond, info=""):
    print(("OK   " if cond else "FAIL ") + name + (f"  [{info}]" if info and not cond else ""))
    if not cond:
        fails.append(name)


class Clock:
    def __init__(self, t):
        self.t = t

    def __call__(self):
        return self.t


def at(y, mo, d, h=12, mi=0):
    return dt.datetime(y, mo, d, h, mi).timestamp()


def make(tmp=None, t=None, hub=None):
    hub = hub or Hub({}, demo=True)
    c = Clock(t or at(2026, 11, 9, 15))
    S = souvenirs.Souvenirs(hub, tmp, c)
    return hub, S, c


# ---------- the files that must agree ----------
def static_checks():
    js = (APP / "web" / "souvenirs.js").read_text(encoding="utf-8")
    jm = re.findall(r"\['([a-z]+)', '[^']+', '[^']+'\]", js.split("const MOOD =")[0].split("const MOODS =")[1])
    check("the 5 moods: the same in web/souvenirs.js and pixel/souvenirs.py", jm == [m for m, _, _ in souvenirs.MOODS], str(jm))
    jc = re.findall(r"\['([a-z]+)', '[^']+'\]", js.split("const CHIP =")[0].split("const CHIPS =")[1])
    check("the chips: the same in both", jc == [c for c, _ in souvenirs.CHIPS], str(jc))
    for k in ("TIMELINE_MAX", "PINNED_MAX", "JOURS_MAX", "JOURS_SNAP", "ASKS_MAX", "CHIPS_MAX"):
        m = re.search(rf"\b{k} = (\d+)", js)
        check(f"{k}: the same in both", m and int(m.group(1)) == getattr(souvenirs, k), m.group(0) if m else "missing")
    pack = (APP / "web" / "scenes" / "souvenirs.js").read_text(encoding="utf-8")
    ids = re.findall(r"^S\('([a-z0-9-]+)'", pack, re.M)
    check(f"the scene pack's {len(ids)} scenes are known to pixel/scenes.py", len(ids) >= 12 and all(i in scenes.BY_ID for i in ids), str(ids))
    ev = set(re.findall(r"on: \['([a-z-]+)'\]", pack))
    persona = (APP / "web" / "persona.js").read_text(encoding="utf-8").split("const EVENTS = {")[1].split("};")[0]
    check("its events are listed in persona.js EVENTS", all(f"'{e}':" in persona for e in ev), str(ev))
    check("no label takes another pack's word (« Joyeux anniversaire » is notifs.js's)", scenes.find("joyeux anniversaire") == "notif-anniv"
          and scenes.find("la fete d'anniversaire") == "souvenir-anniversaire")
    page, lab = (APP / "web" / "index.html").read_text(), (APP / "web" / "lab" / "index.html").read_text()
    check("the phone page loads the stylesheet, the scene pack, album.js and souvenirs.js (before app.js)",
          all(x in page for x in ('href="app/souvenirs.css"', 'src="app/scenes/souvenirs.js"', 'src="app/album.js"', 'src="app/souvenirs.js"'))
          and page.index('app/souvenirs.js') < page.index('app/app.js') and page.index('app/album.js') < page.index('app/souvenirs.js'))
    check("Pixel Lab loads them before its fake server (demo-hub.js runs their rules), and its panel",
          lab.index("../souvenirs.js") < lab.index("demo-hub.js") and "souvenirs-lab.js" in lab and "../scenes/souvenirs.js" in lab)
    app = (APP / "web" / "app.js").read_text()
    check("the phone does not keep the mood journal in its copy of the Pi's state (app.js keep)", "humeur: undefined" in app.split("function keep(")[1].split("function kept(")[0])


# ---------- the dates ----------
def date_checks():
    F = souvenirs.fete
    mar12 = {"jour": 12, "mois": 3}
    check("your birthday: that day only", F(D(2027, 3, 12), mar12)["fete"] == "anniversaire" and F(D(2027, 3, 11), mar12)["fete"] is None
          and F(D(2027, 3, 13), mar12)["fete"] is None)
    f29 = {"jour": 29, "mois": 2}
    check("born a 29 February: the party on 29 February in a leap year", F(D(2028, 2, 29), f29)["fete"] == "anniversaire" and F(D(2028, 2, 28), f29)["fete"] is None)
    check("…on 28 February in the other years, never twice, never on 1 March", F(D(2027, 2, 28), f29)["fete"] == "anniversaire" and F(D(2027, 3, 1), f29)["fete"] is None
          and F(D(2100, 2, 28), f29)["fete"] == "anniversaire")
    nb = souvenirs.next_birthday
    check("the next birthday across the year's turn: 31 December -> 1 January is 1 day", (nb(D(2026, 12, 31), 1, 1) - D(2026, 12, 31)).days == 1
          and nb(D(2027, 1, 1), 1, 1) == D(2027, 1, 1))
    check("…a 29 February one from 1 January 2027: 28 February 2027; from 1 March 2027: 29 February 2028",
          nb(D(2027, 1, 1), 29, 2) == D(2027, 2, 28) and nb(D(2027, 3, 1), 29, 2) == D(2028, 2, 29))
    check("…on the day itself: 0 days", nb(D(2027, 3, 12), 12, 3) == D(2027, 3, 12))
    r = D(2026, 1, 31)
    got = [(d.isoformat(), F(d, None, r)["mois"]) for d in (D(2026, 2, 28), D(2026, 3, 30), D(2026, 3, 31), D(2026, 4, 30), D(2026, 5, 1))]
    check("met on 31 January: the months on 28 February, 31 March, 30 April (the month's last day), not the day before or after",
          got == [("2026-02-28", 1), ("2026-03-30", 0), ("2026-03-31", 2), ("2026-04-30", 3), ("2026-05-01", 0)], str(got))
    check("…in a leap year, 29 February", F(D(2028, 2, 29), None, D(2028, 1, 31))["mois"] == 1 and F(D(2028, 2, 28), None, D(2028, 1, 31))["mois"] == 0)
    r = D(2026, 12, 15)
    check("met on 15 December: 1 month on 15 January (the year's turn), a year on 15 December",
          F(D(2027, 1, 15), None, r)["mois"] == 1 and F(D(2027, 12, 15), None, r) == {"fete": "rencontre", "mois": 0, "ans": 1, "jours": 0}
          and F(D(2027, 1, 14), None, r)["mois"] == 0)
    r = D(2024, 2, 29)
    check("met on 29 February 2024: a year on 28 February 2025, four on 29 February 2028",
          F(D(2025, 2, 28), None, r)["ans"] == 1 and F(D(2025, 3, 1), None, r)["ans"] == 0 and F(D(2028, 2, 29), None, r)["ans"] == 4 and F(D(2028, 2, 28), None, r)["ans"] == 0)
    check("100 days together", F(D(2026, 1, 1) + dt.timedelta(days=100), None, D(2026, 1, 1))["jours"] == 100
          and F(D(2026, 1, 1) + dt.timedelta(days=99), None, D(2026, 1, 1))["jours"] == 0)
    both = F(D(2027, 3, 12), mar12, D(2026, 3, 12))
    check("your birthday and a year since you met on the same day: the birthday's party, and the year counted", both["fete"] == "anniversaire" and both["ans"] == 1)
    check("the very first day: nothing to celebrate yet", F(D(2026, 3, 12), None, D(2026, 3, 12)) == {"fete": None, "mois": 0, "ans": 0, "jours": 0})
    check("valid days: 29 February yes, 30 February and 31 April no, nor strings or booleans",
          souvenirs.valid_day(29, 2) and not souvenirs.valid_day(30, 2) and not souvenirs.valid_day(31, 4) and not souvenirs.valid_day("12", 3)
          and not souvenirs.valid_day(True, 3) and not souvenirs.valid_day(12, 13) and not souvenirs.valid_day(12.5, 3) and souvenirs.valid_day(12.0, 3))

    # the clock turns: the snapshot's "fete" changes at midnight, the timeline remembers each party once
    with tempfile.TemporaryDirectory() as tmp:
        hub, S, c = make(tmp, at(2027, 3, 11, 23, 59))
        S.set_anniv(12, 3)
        S.publish()                                   # (the action souvenirs.anniversaire publishes; here, the method alone)
        check("the day before: no party, his countdown says 1 day", hub.s["souvenirs"]["fete"] is None and hub.s["souvenirs"]["anniv_dans"] == 1)
        c.t = at(2027, 3, 12, 0, 1)
        S.tick()
        s = hub.s["souvenirs"]
        check("…past midnight: souvenirs.fete = 'anniversaire' (the other features' party hat), 0 days", s["fete"] == "anniversaire" and s["anniv_dans"] == 0)
        n = sum(e["type"] == "anniversaire" for e in s["timeline"])
        S2 = souvenirs.Souvenirs(Hub({}, demo=True), tmp, c)
        S2.tick()
        check("…the timeline remembers it once, even after a restart that day", n == 1 and sum(e["type"] == "anniversaire" for e in S2.d["timeline"]) == 1)
        c.t = at(2027, 12, 31, 23, 59)
        S2.tick()
        c.t = at(2028, 1, 1, 0, 1)
        S2.tick()
        check("the year's turn: 31 December to 1 January, his countdown starts again", S2.hub.s["souvenirs"]["anniv_dans"] == (D(2028, 3, 12) - D(2028, 1, 1)).days)


# ---------- the files ----------
def file_checks():
    with tempfile.TemporaryDirectory() as tmp:
        old = Path(tmp) / "token"
        old.write_text("x")
        os.utime(old, (at(2025, 8, 14), at(2025, 8, 14)))
        (Path(tmp) / "nourrir.json").write_text("{}")
        hub, S, c = make(tmp, at(2026, 11, 9, 15))
        s = hub.s["souvenirs"]
        check("the day you met: Pixel's first start, the oldest file of his data folder (his token)", s["rencontre"] == "2025-08-14" and s["rencontre_auto"] is True, s["rencontre"])
        check("…and the first memory, pinned", s["timeline"][-1]["type"] == "rencontre" and s["timeline"][-1]["epingle"] is True
              and dt.date.fromtimestamp(s["timeline"][-1]["t"] / 1000) == D(2025, 8, 14))
        S.set_anniv(29, 2)
        S.set_rencontre("2025-09-01")
        S.ajoute("perso", "On a fait un gâteau ensemble")
        c.t += 5
        S.note("bien", ["ecole", "copains"])
        S.reglages(heure=18 * 60, claude=True)
        hub2, S2, _ = make(tmp, c.t)
        s2, h2 = hub2.s["souvenirs"], hub2.s["humeur"]
        check("after a restart: your birthday, the day you met (edited), the memories", s2["anniv"] == {"jour": 29, "mois": 2} and s2["rencontre"] == "2025-09-01"
              and s2["rencontre_auto"] is False and any(e["texte"] == "On a fait un gâteau ensemble" for e in s2["timeline"]))
        check("…the day you met moved its memory, not a new one", sum(e["type"] == "rencontre" for e in s2["timeline"]) == 1
              and dt.date.fromtimestamp(next(e for e in s2["timeline"] if e["type"] == "rencontre")["t"] / 1000) == D(2025, 9, 1))
        check("…today's mood and the settings of the journal", h2["aujourdhui"]["m"] == "bien" and h2["aujourdhui"]["chips"] == ["ecole", "copains"]
              and h2["heure"] == 18 * 60 and h2["claude"] is True)
        check("the mood journal in a file of its own, private (humeur.json), not in souvenirs.json", "jours" in json.loads((Path(tmp) / "humeur.json").read_text())
              and "bien" not in (Path(tmp) / "souvenirs.json").read_text())
        check("the day you met: never in the future, nor before 2020", not S2.set_rencontre("2030-01-01") and not S2.set_rencontre("2019-12-31") and not S2.set_rencontre("../x"))

    for name, junk in (("not JSON", "{ pas du json"), ("a list", "[1, 2]"), ("absurd values", json.dumps({
            "anniv": {"jour": 31, "mois": 2}, "rencontre": "2026-13-45", "demande": "hier", "debut": 1e400,
            "records": {"serie_max": -4, "record_chrono": 1e400, "trophees": ["<script>", 3], "premier_repas": "pizza"},
            "timeline": [{"id": 1, "t": 1, "type": "x", "texte": "trop vieux"}, {"id": "2"}, None, {"id": 3, "t": 1.79e12, "type": "ami", "texte": "a\u0000b" * 80}],
            "fetes": {"anniversaire": ["2027"]}}).replace("1e+400", "1e400"))):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "souvenirs.json").write_text(junk)
            (Path(tmp) / "humeur.json").write_text(junk.replace("anniv", "on").replace("timeline", "jours"))
            try:
                hub, S, c = make(tmp)
                s, h = hub.s["souvenirs"], hub.s["humeur"]
                ok = s["anniv"] is None and s["rencontre"] and h["on"] is True and h["claude"] is False and isinstance(s["timeline"], list)
                long = next((e for e in s["timeline"] if e["type"] == "ami"), None)
                ok = ok and (long is None or (len(long["texte"]) <= souvenirs.TEXT_MAX and "\u0000" not in long["texte"]))
                ok = ok and not any(e["texte"] == "trop vieux" for e in s["timeline"])
            except Exception as e:                    # noqa: BLE001
                ok = False
                print("   ", repr(e))
            check(f"a broken souvenirs.json and humeur.json ({name}): he starts, with what is valid", ok)

    # the timeline: capped, pinned memories stay; souvenirs.ajoute checked
    hub, S, c = make(None, at(2026, 11, 9, 15))
    for i in range(3):
        S.ajoute("perso", f"épinglé {i}", t=at(2020, 1, 1 + i) * 1000, epingle=True)
        c.t += 3
    for i in range(260):
        S.d["timeline"].append({"id": 1000 + i, "t": at(2021, 1, 1) * 1000 + i * 60000, "type": "perso", "texte": f"n° {i}", "epingle": False, "photo": None})
    souvenirs.trim(S.d["timeline"])
    tl = S.d["timeline"]
    check(f"the timeline: {souvenirs.TIMELINE_MAX} memories at most, the oldest go, never a pinned one", len(tl) == souvenirs.TIMELINE_MAX
          and sum(e["epingle"] for e in tl) >= 3 and any(e["texte"] == "épinglé 0" for e in tl) and not any(e["texte"] == "n° 0" for e in tl)
          and any(e["texte"] == "n° 259" for e in tl))
    hub, S, c = make(None, at(2026, 11, 9, 15))
    bad = [S.ajoute(*a) for a in (("Ami", "x"), ("ami", ""), ("ami", "   "), ("ami", 42), (None, "x"), ("a" * 30, "x"), ("rencontre", "un autre jour"), ("ami;", "x"))]
    check("souvenirs.ajoute: a type of [a-z0-9-] and a text, nothing else (and never a second « rencontre »)", all(b is None for b in bad))
    e = S.ajoute("ami", "Bip est venu me voir !\n<b>coucou</b>\u0007" + "!" * 300, t=at(2026, 11, 9, 14) * 1000)
    check("…one line of plain text, 100 characters at most, its time kept", e and len(e["texte"]) <= 100 and "\n" not in e["texte"] and "\u0007" not in e["texte"]
          and e["t"] == at(2026, 11, 9, 14) * 1000, e and e["texte"])
    c.t += 0.5
    check("…not twice in 2 s (another feature in a loop)", S.ajoute("ami", "encore") is None)
    c.t += 3
    check("…the same memory again within a minute: once", S.ajoute("ami", e["texte"]) is None)
    e2 = S.ajoute("ami", "une autre", t=at(2040, 1, 1) * 1000)
    check("…a time in the future: now instead", e2 and abs(e2["t"] - c.t * 1000) < 1)
    check("…what others see: ev 'ajoute'", S.ev["kind"] == "ajoute" and S.ev["texte"] == "une autre")
    check("…a friend's first visit (type « ami »): a record of its own, kept once", S.d["records"]["premier_ami"]["label"].startswith("Bip est venu")
          and S.public()["records"]["premier_ami"]["t"] == at(2026, 11, 9, 14) * 1000)
    for i in range(40):
        c.t += 3
        S.ajoute("ami", f"visite {i}")
    check(f"…{souvenirs.ADD_PER_HOUR} in an hour at most", sum(e["type"] == "ami" for e in S.d["timeline"]) <= souvenirs.ADD_PER_HOUR + 2)
    check("pinning, unpinning, erasing; the day you met cannot be erased", S.epingle(e2["id"]) and S.d["timeline"][0]["epingle"] in (True, False)
          and S.efface(e2["id"]) and not any(x["id"] == e2["id"] for x in S.d["timeline"])
          and not S.efface(next(x["id"] for x in S.d["timeline"] if x["type"] == "rencontre")))


async def broken_checks():
    """A file that cannot be read never costs the other one, nor itself: put aside (NAME.illisible), never written over."""
    sv = {"v": 1, "anniv": {"jour": 12, "mois": 3}, "demande": 1, "rencontre": "2024-05-01", "rencontre_auto": False, "debut": 1.7e12,
          "timeline": [{"id": i, "t": 1.72e12 + i * 1e8, "type": "photo", "texte": f"souvenir {i}", "epingle": i < 3, "photo": None} for i in range(1, 41)]}
    hu = {"v": 1, "on": True, "claude": False, "jours": {"2026-11-01": {"m": "bien", "chips": [["ecole"], "jeux", {"x": 1}], "t": 1},
                                                         "2026-11-02": {"m": ["triste"], "chips": [], "t": 1}, "2026-11-03": {"m": "super", "chips": "x", "t": 1}}}
    with tempfile.TemporaryDirectory() as tmp:
        d = Path(tmp)
        (d / "souvenirs.json").write_text(json.dumps(sv))
        (d / "humeur.json").write_text(json.dumps(hu))
        hub = Hub({}, demo=True)
        c = Clock(at(2026, 11, 9, 18))
        S = souvenirs.setup(hub, d, clock=c)
        check("humeur.json with values of the wrong type (a list in chips, a list for the mood): the right ones kept, the others dropped",
              sorted(S.h["jours"]) == ["2026-11-01", "2026-11-03"] and S.h["jours"]["2026-11-01"]["chips"] == ["jeux"] and S.h["jours"]["2026-11-03"]["chips"] == []
              and not (d / "humeur.json.illisible").exists(), json.dumps(S.h["jours"]))
        await hub.dispatch("souvenirs.demande")
        await hub.dispatch("humeur.note", {"m": "super"})
        kept = json.loads((d / "souvenirs.json").read_text())
        check("…and souvenirs.json keeps its 40 memories, your birthday and the day you met, after the next saves", len(kept["timeline"]) == 40
              and kept["anniv"] == {"jour": 12, "mois": 3} and kept["rencontre"] == "2024-05-01", len(kept["timeline"]))
        modes = {f: os.stat(d / f).st_mode & 0o777 for f in ("souvenirs.json", "humeur.json")}
        check("souvenirs.json and humeur.json are readable by their owner only (0600)", set(modes.values()) == {0o600}, {k: oct(v) for k, v in modes.items()})
    with tempfile.TemporaryDirectory() as tmp:
        d = Path(tmp)
        (d / "souvenirs.json").write_text(json.dumps(sv))
        (d / "humeur.json").write_text("{ pas du json")
        hub = Hub({}, demo=True)
        S = souvenirs.setup(hub, d, clock=Clock(at(2026, 11, 9, 18)))
        check("a humeur.json that is not JSON: put aside as it was (humeur.json.illisible), a new one", (d / "humeur.json.illisible").read_text() == "{ pas du json"
              and json.loads((d / "humeur.json").read_text())["jours"] == {})
        check("…souvenirs.json keeps its 40 memories", len(json.loads((d / "souvenirs.json").read_text())["timeline"]) == 40 and len(S.d["timeline"]) == 40)
    with tempfile.TemporaryDirectory() as tmp:
        d = Path(tmp)
        (d / "souvenirs.json").write_text(json.dumps(sv))
        (d / "humeur.json").write_text(json.dumps({"v": 1, "jours": {"2026-11-01": {"m": "bien", "chips": [], "t": 1}}}))
        before = {f: (d / f).read_bytes() for f in ("souvenirs.json", "humeur.json")}
        real = souvenirs.Souvenirs.observe

        def broken(self):                                # a bug somewhere (not in the files): his files are never written over
            if self.file:
                raise RuntimeError("bug")
            return real(self)
        souvenirs.Souvenirs.observe = broken
        try:
            hub = Hub({}, demo=True)
            souvenirs.setup(hub, d, clock=Clock(at(2026, 11, 9, 18)))
            await hub.dispatch("souvenirs.ajoute", {"type": "perso", "texte": "un gâteau"})
            await hub.dispatch("humeur.note", {"m": "bof"})
        finally:
            souvenirs.Souvenirs.observe = real
        check("Souvenirs failing to start (a bug): Pixel starts, and both files are left exactly as they were",
              all((d / f).read_bytes() == b for f, b in before.items()) and hub.s.get("souvenirs") is not None)
    hub, S, c = make(None, at(2026, 11, 9, 15))
    t0 = time.perf_counter()
    e = S.ajoute("perso", "Un très long souvenir " + "é a\u0007" * (1024 * 1024))
    took = time.perf_counter() - t0
    check(f"souvenirs.ajoute with 4 MB of text: cut before it is cleaned ({took * 1000:.0f} ms), 100 characters", e and len(e["texte"]) <= souvenirs.TEXT_MAX
          and e["texte"].startswith("Un très long souvenir") and took < 0.2, took)


# ---------- his records, from the other features' state ----------
def record_checks():
    hub = Hub({}, demo=True)
    hub.s["exos"] = {"stats": {"serie_max": 12, "record_chrono": 7, "trophees": ["premier", "serie5", "serie10"]},
                     "trophees": [{"id": "premier", "label": "Premier exo"}, {"id": "serie5", "label": "5 d'affilée"}, {"id": "serie20", "label": "20 d'affilée"}]}
    hub.s["nourrir"] = {"journal": [{"plat": "frites", "t": 3}, {"plat": "pomme", "t": 2}]}
    hub, S, c = make(None, at(2026, 11, 9, 15), hub)
    R = S.d["records"]
    check("the first look takes his records as they are: no memory, no photo", R["serie_max"] == 12 and R["record_chrono"] == 7 and len(R["trophees"]) == 3
          and not any(e["type"] in ("record", "chrono", "trophee") for e in S.d["timeline"]) and S.ev is None)
    check("…and his oldest meal he still knows is his first one (no memory for it)", R["premier_repas"]["id"] == "pomme" and not any(e["type"] == "repas" for e in S.d["timeline"]))
    hub.s["exos"]["stats"].update(serie_max=13)
    S.tick()
    check("a new best streak: a memory « Ta série record : 13 … », and the screens take a photo (ev 'record')",
          S.d["timeline"][0]["type"] == "record" and "13" in S.d["timeline"][0]["texte"] and S.ev["kind"] == "record" and S.ev["n"] == 13)
    hub.s["exos"]["stats"].update(serie_max=15)
    S.tick()
    check("…beaten again the same day: the same memory, updated", sum(e["type"] == "record" for e in S.d["timeline"]) == 1 and "15" in S.d["timeline"][0]["texte"])
    hub.s["exos"]["stats"]["trophees"].append("serie20")
    S.tick()
    check("a new trophy: its memory, with its name", S.d["timeline"][0]["type"] == "trophee" and "20 d'affilée" in S.d["timeline"][0]["texte"] and S.ev["kind"] == "trophee")
    hub.s["exos"]["stats"].update(serie_max=2)
    S.tick()
    check("his stats started afresh (exos.json gone): taken as they are, no memory", R["serie_max"] == 2 and S.d["timeline"][0]["type"] == "trophee")
    hub2 = Hub({}, demo=True)
    hub2.s["nourrir"] = {"journal": []}
    hub2.s["exos"] = {"stats": "cassé", "trophees": None}
    hub2, S2, c2 = make(None, at(2026, 11, 9, 15), hub2)
    hub2.s["nourrir"] = {"journal": [{"plat": "pizza", "t": c2.t * 1000}]}
    S2.tick()
    check("his very first meal: « Mon tout premier repas avec toi : une pizza ! »", S2.d["timeline"][0]["type"] == "repas" and "une pizza" in S2.d["timeline"][0]["texte"])
    hub3 = Hub({}, demo=True)
    hub3.s["exos"] = {"stats": {"serie_max": True, "record_chrono": float("inf"), "trophees": [None, "<x>"]}, "trophees": [1]}
    try:
        make(None, None, hub3)
        ok = True
    except Exception:                                 # noqa: BLE001
        ok = False
    check("odd shapes in the other features' state never stop him", ok)


# ---------- the mood journal ----------
def humeur_checks():
    hub, S, c = make(None, at(2026, 11, 9, 17, 30))
    check("the day you met: he does not ask yet (he gets to know you first)", not S.due())
    S.set_rencontre("2026-10-01")
    check("…from the next day on, he may", S.due())
    c.t = at(2026, 11, 9, 16, 59)
    check("before his time (17:00 by default): he does not ask", not S.due())
    c.t = at(2026, 11, 9, 17, 0)
    check("from 17:00: he may ask", S.due())
    for h, why in ((21, "21 h"), (23, "23 h"), (3, "3 h")):
        c.t = at(2026, 11, 9, h, 30)
        check(f"…never at night ({why})", not S.due())
    c.t = at(2026, 11, 9, 17, 30)
    hub.s["caractere"] = {"calme": {"de": 17, "a": 8}}
    check("…nor in his quiet hours (caractère « calme »)", not S.due())
    hub.s["caractere"] = {"calme": {"de": 23, "a": 6}}
    hub.s["habitudes"] = {"dort": True}
    check("…nor while he sleeps (habitudes « dort »)", not S.due())
    hub.s["habitudes"] = {"etat": "coucher"}
    check("…nor at bedtime (habitudes 'coucher')", not S.due())
    hub.s["habitudes"] = {"etat": "jeu", "dort": "oui"}
    check("…an odd habitudes state: he may ask", S.due())
    del hub.s["habitudes"]
    check("Pixel's screen asks (humeur.pose): the question shows on every screen", S.pose() and S.question and hub.s["humeur"]["question"] is None and S.public() is not None)
    S.publish()
    check("…in the snapshot, once (not twice: one question at a time)", hub.s["humeur"]["question"] and not S.pose())
    c.t += souvenirs.QUESTION_S + 1
    S.tick()
    check(f"…left alone {souvenirs.QUESTION_S} s, it goes away", hub.s["humeur"]["question"] is None)
    check("…and he asks again only an hour later", not S.due())
    c.t += 3600
    check("…then once more", S.due() and S.pose())
    S.plustard()
    c.t += 3700
    check(f"…{souvenirs.ASKS_MAX} times a day at most: never nagging", not S.due())
    check("an unknown mood is not one", not S.note("<script>") and not S.note(None) and not S.note(3))
    check("your answer (from anywhere): today's mood, its words checked (4 at most, known ones)", S.note("triste", ["ecole", "x", "ecole", "fatigue", "jeux", "sport", "dehors"])
          and S.h["jours"]["2026-11-09"]["chips"] == ["ecole", "fatigue", "jeux", "sport"])
    check("…the screens react (ev 'note')", S.hev["kind"] == "note" and S.hev["m"] == "triste")
    check("…and he does not ask any more today", not S.due())
    c.t = at(2026, 11, 10, 17, 30)
    S.tick()
    h = hub.s["humeur"]
    check("the next day: « hier » for « Hier, tu étais triste… ça va mieux ? »", h["hier"] == {"jour": "2026-11-09", "m": "triste", "chips": ["ecole", "fatigue", "jeux", "sport"], "il_y_a": 1}
          and h["du"] is True and h["aujourdhui"] is None)
    c.t = at(2026, 11, 12, 10)
    check("…three days later, no more", S.hier() is None)
    check("the settings: his time by quarters from 7:00 to 20:30, nothing else", not S.reglages(heure=17 * 60 + 7) and not S.reglages(heure=6 * 60)
          and not S.reglages(heure=21 * 60) and not S.reglages(heure="17:00") and S.reglages(heure=8 * 60 + 15) and S.h["heure"] == 8 * 60 + 15)
    S.reglages(on=False)
    c.t = at(2026, 11, 12, 18)
    check("…off: he never asks", not S.due() and not S.pose())
    for i in range(500):
        S.h["jours"][(D(2024, 1, 1) + dt.timedelta(days=i)).isoformat()] = {"m": "bien", "chips": [], "t": 0}
    S.note("super")
    check(f"…{souvenirs.JOURS_MAX} days kept at most, {souvenirs.JOURS_SNAP} sent to the screens",
          len(S.h["jours"]) == souvenirs.JOURS_MAX and len(S.hpublic()["jours"]) == souvenirs.JOURS_SNAP and "2026-11-12" in S.h["jours"])
    S.efface_carnet()
    check("« Effacer le carnet »: every day of it", S.h["jours"] == {} and S.hev["kind"] == "efface")


async def privacy_checks():
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        hub = Hub({"data_dir": str(tmp)}, demo=True)
        server.core_actions(hub, tmp)
        caractere.setup(hub, tmp)
        nourrir.setup(hub, tmp)
        exos.setup(hub, tmp)
        souvenirs.setup(hub, tmp)
        album.setup(hub, None, tmp, "code")
        await hub.dispatch("humeur.note", {"m": "triste", "chips": ["famille"]})
        cl = Claude(hub, {})
        st = json.dumps(cl.status(), ensure_ascii=False)
        check("private by default: « Claude peut savoir comment je vais » is off", hub.s["humeur"]["claude"] is False)
        check("…get_status tells his memories (birthday, the day you met) but never the mood", "souvenirs" in st and "triste" not in st and "humeur" not in st.lower().replace("humeur du jour", ""), st[:300])
        check("…nor his system prompt", "triste" not in json.dumps(system_for(hub), ensure_ascii=False) and "triste" not in system_text(hub))
        out = await souvenirs.run_tool(hub, {"action": "humeur", "humeur": "super"})
        check("…his tool does not write it", "privé" in out and hub.s["humeur"]["aujourdhui"]["m"] == "triste", out)
        await hub.dispatch("humeur.reglages", {"claude": True})
        st = json.dumps(cl.status(), ensure_ascii=False)
        check("allowed: get_status tells today's mood", "triste" in st and "famille" in st, st[:300])
        out = await souvenirs.run_tool(hub, {"action": "humeur", "humeur": "bien", "sujets": ["sport"]})
        check("…and his tool notes it", hub.s["humeur"]["aujourdhui"]["m"] == "bien" and "noté" in out, out)
        check("…still never in his system prompt (only get_status, when Claude asks)", all(w not in system_text(hub) for w in ("carnet", "humeur", "triste", "famille")))


# ---------- the typed commands, Claude's tool ----------
PHRASES = [
    ("prends une photo", "album.photo"), ("Prends une photo !", "album.photo"), ("prends-moi en photo", "album.photo"), ("fais une photo", "album.photo"),
    ("photo", "album.photo"), ("montre l'album", "album.montre"), ("Montre-moi l’album", "album.montre"), ("montre tes photos", "album.montre"), ("album", "album.montre"),
    ("mon anniversaire c'est le 12 mars", "souvenirs.anniversaire"), ("Mon anniversaire, c’est le 1er mai.", "souvenirs.anniversaire"),
    ("mon anniversaire est le 29 février", "souvenirs.anniversaire"), ("je suis née le 3 décembre 2015", "souvenirs.anniversaire"), ("mon anniv c'est le 12/03", "souvenirs.anniversaire"),
    ("mon anniversaire c'est le 31 février", "toast"), ("c'est quand mon anniversaire ?", "toast"), ("tu te souviens ?", "souvenirs.raconte"),
    ("je suis content", "humeur.note"), ("Je suis contente !", "humeur.note"), ("je suis triste", "humeur.note"), ("je suis fatigué", "humeur.note"), ("je suis fatiguée", "humeur.note"),
    ("je suis en colère", "humeur.note"), ("je suis fâchée aujourd'hui", "humeur.note"), ("ça va pas", "humeur.note"), ("je suis heureuse", "humeur.note"), ("bof", "humeur.note"),
    ("mon anniversaire c'est bientôt", "chat.ask"), ("je suis né à Paris", "chat.ask"), ("je suis contente de te voir", "chat.ask"), ("album de famille", "chat.ask"),
    ("photo de chat ?", "chat.ask"), ("je suis un robot", "chat.ask"), ("tu te souviens de quoi ?", "chat.ask"), ("triste", "chat.ask"), ("fais le poisson", "scene.play"),
]


async def command_checks():
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        hub = Hub({"data_dir": str(tmp)}, demo=True)
        server.core_actions(hub, tmp)
        caractere.setup(hub, tmp)
        nourrir.setup(hub, tmp)
        exos.setup(hub, tmp)
        S = souvenirs.setup(hub, tmp)
        A = album.setup(hub, None, tmp, "code")
        hub.s["caractere"]["calme"] = {"de": 23, "a": 23}      # no quiet hours (no habits here: they are his night): the tests run at any time
        seen = []
        d0 = hub.dispatch

        async def dispatch(name, args=None):
            seen.append((name, args))
            if name == "chat.ask":
                return None
            return await d0(name, args)
        hub.dispatch = dispatch
        bad = []
        for text, want in PHRASES:
            seen.clear()
            t0 = (hub.s.get("toast") or {}).get("id")
            await commands.run(hub, text)
            got = seen[0][0] if seen else ("toast" if (hub.s.get("toast") or {}).get("id") != t0 else "rien")
            if got != want:
                bad.append(f"{text} -> {got}")
            A.demande = None
        check(f"the {len(PHRASES)} phrases: each goes where it should (souvenirs, the album, the journal, or Claude)", not bad, "; ".join(bad))
        S.h["jours"] = {}
        await commands.run(hub, "je suis fatiguée")
        check("« je suis fatiguée »: bof, and the word « fatigue »", S.h["jours"][S.jour()] == {**S.h["jours"][S.jour()], "m": "bof", "chips": ["fatigue"]})
        await commands.run(hub, "je suis super contente")
        await commands.run(hub, "je suis crevé")
        check("…tired after a super day: still super, tired too", S.h["jours"][S.jour()]["m"] == "super" and S.h["jours"][S.jour()]["chips"] == ["fatigue"])
        await commands.run(hub, "mon anniversaire c'est le 29 février")
        check("« mon anniversaire c'est le 29 février »: kept", hub.s["souvenirs"]["anniv"] == {"jour": 29, "mois": 2})
        await commands.run(hub, "c'est quand mon anniversaire ?")
        check("« c'est quand mon anniversaire ? »: he says the day", "29 février" in hub.s["toast"]["msg"], hub.s["toast"]["msg"])
        help_ = commands.HELP
        check("« aide » names « prends une photo » and « je suis content »", "prends une photo" in help_ and "je suis content" in help_)
        hub.s["cast"] = {"id": "x", "kind": "text", "t0": time.time() * 1000, "until": 0}
        seen.clear()
        await commands.run(hub, "prends une photo")
        check("« prends une photo » during a cast: no photo, he says why", A.demande is None and "cast" in hub.s["toast"]["msg"], hub.s["toast"]["msg"])
        hub.s["cast"] = None
        hub.s["habitudes"] = {"dort": True}
        await commands.run(hub, "prends une photo")
        check("« prends une photo » while he sleeps: no photo (his screen stays dark), he says why", A.demande is None and "je dors" in hub.s["toast"]["msg"], hub.s["toast"]["msg"])
        del hub.s["habitudes"]
        # Claude's tool
        names = [t["name"] for t in TOOLS]
        check("Claude's tool « souvenirs », beside the others, no name twice", "souvenirs" in names and len(names) == len(set(names)))
        for a, ok in (({"action": "anniversaire", "jour": 29, "mois": 2}, True), ({"action": "anniversaire", "jour": 30, "mois": 2}, False),
                      ({"action": "anniversaire", "jour": "12", "mois": 3}, False), ({"action": "photo"}, True), ({"action": "humeur", "humeur": "bien"}, True),
                      ({"action": "humeur", "humeur": "furieux"}, False), ({"action": "humeur", "humeur": "bien", "sujets": ["ecole", "x"]}, False),
                      ({"action": "photo", "url": "http://x"}, False), ({"action": "efface"}, False), ("photo", False)):
            check(f"…its input checked: {json.dumps(a, ensure_ascii=False)}", (claude_check("souvenirs", a) is None) == ok)
        out = await souvenirs.run_tool(hub, {"action": "anniversaire", "jour": 12, "mois": 3})
        check("…it remembers your birthday", hub.s["souvenirs"]["anniv"] == {"jour": 12, "mois": 3} and "12 mars" in out, out)
        out = await souvenirs.run_tool(hub, {"action": "photo"})
        check("…it takes a photo: his screen poses (album.demande)", A.demande is not None and hub.s["album"]["demande"] is not None and "pose" in out, out)
        await hub.dispatch("exos.nouveau", {"kind": "addition"})
        A.demande = None
        out = await souvenirs.run_tool(hub, {"action": "photo"})
        check("…not during an exercise: it says so", A.demande is None and "exo" in out, out)
        await hub.dispatch("exos.stop")


# ---------- the album ----------
def webp(w=800, h=480, size=3000, kind="VP8 ", anim=False):
    if kind == "VP8 ":
        payload = b"\x30\x01\x00\x9d\x01\x2a" + struct.pack("<HH", w, h) + b"\x11" * size
    elif kind == "VP8L":
        payload = b"\x2f" + ((w - 1) | ((h - 1) << 14)).to_bytes(4, "little") + b"\x11" * size
    else:
        payload = bytes([0x02 if anim else 0, 0, 0, 0]) + (w - 1).to_bytes(3, "little") + (h - 1).to_bytes(3, "little") + b"\x11" * size
    chunk = kind.encode() + struct.pack("<I", len(payload)) + payload
    return b"RIFF" + struct.pack("<I", 4 + len(chunk)) + b"WEBP" + chunk


def jpeg(w=800, h=480):
    from PIL import Image
    b = io.BytesIO()
    Image.new("RGB", (w, h), (10, 40, 20)).save(b, "JPEG", quality=80)
    return b.getvalue()


PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 200


def album_checks():
    d = album.dimensions
    check("the bytes tell what it is: a JPEG (its size), a WebP (VP8, VP8L, VP8X)", d(jpeg(800, 480)) == ("jpg", 800, 480) and d(webp()) == ("webp", 800, 480)
          and d(webp(640, 384, kind="VP8L")) == ("webp", 640, 384) and d(webp(800, 480, kind="VP8X")) == ("webp", 800, 480))
    check("…an animated WebP, a PNG, HTML, nothing: not a photo of his", d(webp(kind="VP8X", anim=True)) is None and d(PNG) is None
          and d(b"<html><script>") is None and d(b"") is None and d(b"\xff\xd8\xff" + b"\x00" * 20) is None)
    with tempfile.TemporaryDirectory() as tmp:
        hub = Hub({}, demo=True)
        c = Clock(at(2026, 11, 9, 15))
        A = album.Album(hub, tmp, c)
        files = []

        def add(fav=False, size=2000):
            c.t += 1
            name = f"{len(files):016d}.webp".replace("0", "A")[-21:]
            name = ("A" * 16 + str(len(files)))[-16:] + ".webp"
            (A.dir / name).write_bytes(webp(size=size))
            e = {"id": f"id{len(files):06d}", "f": name, "t": c.t * 1000, "raison": "photo", "fav": fav, "w": 800, "h": 480, "size": size + 40}
            files.append(e)
            A.photos.insert(0, e)
            A.prune()
            return e
        first = [add(fav=i < 3) for i in range(5)]
        for _ in range(album.MAX_PHOTOS):
            add()
        ids = {e["id"] for e in A.photos}
        check(f"{album.MAX_PHOTOS} photos at most: the oldest go, never a favourite", len(A.photos) == album.MAX_PHOTOS and all(e["id"] in ids for e in first[:3])
              and first[3]["id"] not in ids and not (A.dir / first[3]["f"]).exists())
        for e in A.photos[:album.FAV_MAX]:
            e["fav"] = False
        n = sum(1 for e in A.photos if e["fav"])
        for e in A.photos:
            if n >= album.FAV_MAX:
                break
            if not e["fav"]:
                n += A.fav(e["id"], True)
        check(f"…{album.FAV_MAX} favourites at most: a toast for the next one", not A.fav(next(e["id"] for e in A.photos if not e["fav"]), True) and "préférées" in hub.s["toast"]["msg"])
        for e in A.photos:
            e["fav"] = False
        big = [add(size=album.MAX_BYTES - 100) for _ in range(50)]
        check(f"the total size: {album.MAX_TOTAL // 1048576} Mo at most", sum(e["size"] for e in A.photos) <= album.MAX_TOTAL and big[-1] in A.photos)
        (A.dir / "album.json").write_text("{cassé")
        (A.dir / "notes.txt").write_text("x")
        (A.dir / ("B" * 16 + ".jpg")).write_bytes(b"<html>")
        A.save = lambda: None
        A2 = album.Album(Hub({}, demo=True), tmp, c)
        check("a broken album.json: rebuilt from the photos (a file that is not one goes)", len(A2.photos) == len(A.photos) and not (A.dir / ("B" * 16 + ".jpg")).exists()
              and (A.dir / "notes.txt").exists())
        A2.demande = {"id": "x", "t0": c.t * 1000}
        c.t += album.DEMANDE_S + 1
        A2.tick()
        check("a photo asked and not taken (no screen): forgotten after a while, he says so", A2.demande is None and "photo" in A2.hub.s["toast"]["msg"])


def start_server(port, datadir):
    try:
        socket.create_connection(("127.0.0.1", port), 0.2).close()
        raise SystemExit(f"le port {port} est déjà pris (SOUVENIRS_PY_PORT=… pour un autre)")
    except OSError:
        pass
    cfg = Path(datadir) / "config.toml"
    cfg.write_text(f'data_dir = "{datadir}"\n')
    p = subprocess.Popen([sys.executable, str(APP / "server.py"), "--demo", "--port", str(port), "--config", str(cfg)], cwd=APP,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(100):
        try:
            socket.create_connection(("127.0.0.1", port), 0.2).close()
            return p
        except OSError:
            time.sleep(0.1)
    p.kill()
    raise SystemExit(f"le serveur de démo ne démarre pas sur le port {port}")


async def server_checks(tmp, first):
    token = (Path(tmp) / "token").read_text().strip()
    base = f"http://127.0.0.1:{PORT}"
    async with aiohttp.ClientSession() as http:
        async with http.ws_connect(f"{base}/ws") as ws:
            state = {}

            async def pump(seconds):
                end = asyncio.get_event_loop().time() + seconds
                while (left := end - asyncio.get_event_loop().time()) > 0:
                    try:
                        m = await ws.receive(timeout=left)
                    except asyncio.TimeoutError:
                        break
                    if m.type == aiohttp.WSMsgType.TEXT:
                        state.update(json.loads(m.data)["data"])

            async def act(action, wait=0.3, **a):
                await ws.send_str(json.dumps({"action": action, "args": a}))
                await pump(wait)

            async def up(data, ctype="image/webp", headers=None, query="?raison=photo"):
                async with http.post(base + "/api/album" + query, data=data, headers={"Content-Type": ctype, **(headers or {})}) as r:
                    try:
                        j = await r.json(content_type=None)
                    except Exception:                # noqa: BLE001
                        j = {}
                    return r.status, j

            async def get(path, headers=None):
                async with http.get(base + path, headers=headers or {}) as r:
                    return r.status, await r.read(), r.headers

            await pump(0.5)
            if not first:
                return state
            check("the snapshot has souvenirs (fete for the other features), humeur (private by default) and album",
                  "fete" in state["souvenirs"] and state["humeur"]["claude"] is False and state["album"]["photos"] == [] and state["album"]["max"] == album.MAX_PHOTOS)
            st, j = await up(webp())
            check("the Pi's own screen sends a WebP: kept", st == 200 and j.get("ok") and j["photo"]["src"].startswith("/album/"), f"{st} {j}")
            st2, j2 = await up(jpeg(), "image/jpeg", query="?raison=anniversaire")
            check("…a JPEG, a reason of its own", st2 == 200 and j2["photo"]["raison"] == "anniversaire", f"{st2} {j2}")
            await pump(0.3)
            ph = state["album"]["photos"]
            check("…both in the album, the newest first", [p["id"] for p in ph] == [j2["photo"]["id"], j["photo"]["id"]] and ph[0]["raison"] == "anniversaire")
            src = j["photo"]["src"]
            s, body, h = await get(src)
            check("GET /album/NAME: the photo, its real type, nosniff, a sandbox", s == 200 and body.startswith(b"RIFF") and h["Content-Type"] == "image/webp"
                  and h["X-Content-Type-Options"] == "nosniff" and "sandbox" in h["Content-Security-Policy"])
            s, _, h = await get(src + "?dl=1")
            check("…?dl=1: to save it (« Enregistrer »), a dated name", s == 200 and re.match(r'attachment; filename="pixel-\d{4}-\d\d-\d\d-\d\dh\d\d\.webp"', h.get("Content-Disposition", "")),
                  h.get("Content-Disposition"))
            other = {"Host": f"pixel.local:{PORT}"}
            for path, hd, want, why in ((src, other, 403, "another device, no code"), (src + "?t=" + token, other, 200, "another device, ?t="),
                                        (src, {**other, "X-Pixel-Token": token}, 200, "another device, its header"), (src, {**other, "Cookie": f"pixel_t={token}"}, 200, "the app's cookie"),
                                        (src, {**other, "X-Pixel-Token": "faux"}, 403, "a wrong code"), (src, {"Origin": "https://evil.example"}, 403, "another site's page on the Pi"),
                                        (src, {"Origin": "null"}, 403, "a sandboxed frame on the Pi"),
                                        (src, {"Host": "pixel.tail1.ts.net", "X-Forwarded-For": "100.1.2.3"}, 403, "a proxy on the Pi")):
                s, _, _ = await get(path, hd)
                check(f"a photo, from {why}: {want}", s == want, str(s))
            for hd, want, why in ((other, 403, "another device without the code"), ({**other, "X-Pixel-Token": token}, 200, "another device with the code"),
                                  ({"Origin": "https://evil.example"}, 403, "another site's page on the Pi"), ({"Origin": "null"}, 403, "a sandboxed frame"),
                                  ({"Origin": f"http://evil.example:{PORT}", "Host": f"evil.example:{PORT}"}, 403, "a DNS rebinding page")):
                s, j3 = await up(webp(size=100), headers=hd)
                check(f"an upload from {why}: {want}", s == want, f"{s} {j3}")
            await pump(0.3)
            n0 = len(state["album"]["photos"])
            for data, ct, want, why in ((PNG, "image/png", 415, "a PNG"), (PNG, "image/webp", 415, "a PNG that says it is a WebP"), (jpeg(), "image/webp", 415, "a JPEG that says it is a WebP"),
                                        (b"<svg onload=alert(1)>", "image/webp", 415, "some SVG"), (webp(kind="VP8X", anim=True), "image/webp", 415, "an animated WebP"),
                                        (webp(5000, 5000, kind="VP8X"), "image/webp", 415, "a giant picture"), (webp(4, 4), "image/webp", 415, "a tiny one"),
                                        (webp(size=album.MAX_BYTES), "image/webp", 413, "too heavy"), (b"", "image/webp", 415, "nothing"),
                                        (b"x", "text/plain", 415, "text")):
                s, j3 = await up(data, ct)
                check(f"refused: {why} ({want})", s == want and not j3.get("ok"), f"{s} {j3}")

            async def chunks():
                for _ in range(10):
                    yield b"RIFF" + b"\x00" * 20000
            async with http.post(base + "/api/album", data=chunks(), headers={"Content-Type": "image/webp"}) as r:
                check("…too heavy with no size announced (sent in pieces): 413", r.status == 413, str(r.status))
            await pump(0.3)
            files = sorted(f.name for f in (Path(tmp) / "album").iterdir())
            check("…nothing of them kept", len(state["album"]["photos"]) == n0 and not [f for f in files if f.startswith(".up-")]
                  and len([f for f in files if f.endswith((".webp", ".jpg"))]) == n0, f"{n0} {len(state['album']['photos'])} {files}")
            for path in ("/album/../token", "/album/..%2Ftoken", "/album/%2e%2e%2ftoken", "/album/token", "/album/album.json", "/album/" + "A" * 16 + ".webp",
                         "/album/" + src.split("/")[-1].replace(".webp", ".jpg"), "/album/.." + "%2F" * 3 + "server.py"):
                s, body, _ = await get(path)
                check(f"no way out of the album: {path} -> {s}", s in (403, 404) and token.encode() not in body and b"import" not in body, str(s))
            name = j["photo"]["src"]
            await act("album.fav", id=j["photo"]["id"], on=True)
            check("album.fav: ★", next(p for p in state["album"]["photos"] if p["id"] == j["photo"]["id"])["fav"] is True)
            await act("album.supprime", id=j2["photo"]["id"])
            check("album.supprime: the photo and its file go", len(state["album"]["photos"]) == n0 - 1 and not list((Path(tmp) / "album").glob("*.jpg")))
            await act("album.fav", id="../../token")
            await act("album.supprime", id={"x": 1})
            check("…an unknown id, or not a string: nothing", len(state["album"]["photos"]) == n0 - 1)
            await act("caractere.set", calme={"de": 23, "a": 23})     # the demo's paused clock: his quiet hours are his night; none, at any time of the test
            await act("screen.show", screen="meteo")
            await act("album.photo")
            check("album.photo: his screen is asked to pose (demande), on his face screen", state["album"]["demande"] and state["screen"] == "visage")
            got = []
            for _ in range(album.PER_MIN + 2):
                s, _ = await up(webp(size=50))
                got.append(s)
            check(f"{album.PER_MIN} photos a minute at most (3 already sent): then 429", got.count(200) == album.PER_MIN - 3 and got[-1] == 429, str(got))
            await pump(0.3)
            check("…the photo asked came: no more demande", state["album"]["demande"] is None)
            await act("souvenirs.anniversaire", jour=12, mois=3)
            await act("souvenirs.ajoute", type="ami", texte="Bip est venu ! " + "x" * 200)
            await act("souvenirs.ajoute", type="<b>", texte="non")
            await act("humeur.note", m="super", chips=["jeux"])
            await act("humeur.reglages", heure=19 * 60)
            s = state["souvenirs"]
            check("over the WebSocket: your birthday, a memory (checked), the mood, its settings", s["anniv"] == {"jour": 12, "mois": 3}
                  and any(e["type"] == "ami" and len(e["texte"]) <= 100 for e in s["timeline"]) and not any(e["type"] == "<b>" for e in s["timeline"])
                  and state["humeur"]["aujourdhui"]["m"] == "super" and state["humeur"]["heure"] == 19 * 60)
            return state


async def main():
    static_checks()
    date_checks()
    file_checks()
    await broken_checks()
    record_checks()
    humeur_checks()
    await privacy_checks()
    await command_checks()
    album_checks()
    with tempfile.TemporaryDirectory() as tmp:
        srv = start_server(PORT, tmp)
        try:
            before = await server_checks(tmp, True)
        finally:
            srv.terminate()
            srv.wait()
        srv = start_server(PORT, tmp)
        try:
            after = await server_checks(tmp, False)
            check("after a restart: the photos (★ too), your birthday, the memories, today's mood",
                  [(p["id"], p["fav"]) for p in after["album"]["photos"]] == [(p["id"], p["fav"]) for p in before["album"]["photos"]]
                  and after["souvenirs"]["anniv"] == {"jour": 12, "mois": 3} and after["humeur"]["aujourdhui"]["m"] == "super"
                  and len(after["souvenirs"]["timeline"]) == len(before["souvenirs"]["timeline"]))
        finally:
            srv.terminate()
            srv.wait()


if __name__ == "__main__":
    asyncio.run(main())
    print("\n%d failure(s)" % len(fails))
    sys.exit(1 if fails else 0)
