"""His habits, the server's side (pixel/habitudes.py), with fixed clocks and no server:

    python3 tests/test_habitudes.py

- his schedule: the states (eveille, reveil, sieste, coucher, nuit) at fixed times, a bedtime after midnight, the weekend
  (a later wake-up on Saturday and Sunday, a later bedtime on Friday and Saturday nights), a nap and a nap skipped, the
  impossible schedules refused with a reason, a DST night (Europe/Paris, both changes) and the awake hours his belly counts;
- his routine, tick by tick: the bedtime announce, his teeth, his night-light, goodnight, the wake-up; nothing after a
  clock jump; dort and nuit; the demo's paused clock;
- the file: kept (0600), a broken or absurd habitudes.json never stops him (one that is not an object is put aside, never
  written over), caractère's old quiet hours migrated once (and the
  defaults when they were the old defaults, switched off for « pas d'heures calmes »);
- the games, each one end to end (cache-cache, pierre-feuille-ciseaux, attrape-étoiles, Simon): moves judged, stale or
  made-up moves ignored, timeouts, results, records, paused under a cast or an exercise, refused at night, his nap, bedtime
  and over an open exercise; his laughs; his fears (the storm from the weather, never at night, comforting him: courage
  over the days); his phrases (cleaned, capped, five a moment, never a link);
- the typed commands (exact phrases only: the rest goes to Claude, another feature's words stay theirs), Claude's tool (never
  « apprendre »: his phrases are the family's to teach); a long time of day or phrase from a page answered at once;
- the others follow his night: nourrir's belly sleeps from his bedtime to his wake-up;
- the same rules in web/habitudes.js (Pixel Lab, Pixel sans Pi): run in node, compared.
"""
import asyncio
import datetime as dt
import json
import os
import random
import subprocess
import sys
import tempfile
import time
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP))
import server  # noqa: E402
from pixel import caractere, commands, exos, habitudes as HB, nourrir, poche  # noqa: E402
from pixel.claude import TOOLS, Claude, check as claude_check, tools_for  # noqa: E402
from pixel.state import Hub  # noqa: E402

fails = []


def check(name, cond, info=""):
    print(("OK   " if cond else "FAIL ") + name + (f"  [{info}]" if info and not cond else ""))
    if not cond:
        fails.append(name)


def at(s):
    return dt.datetime.strptime(s, "%Y-%m-%d %H:%M")


class Clock:
    def __init__(self, s):
        self.t = at(s).timestamp()

    def __call__(self):
        return self.t

    def set(self, s):
        self.t = at(s).timestamp()


def schedule():
    D = HB.clean_horaires({})
    e = lambda h, s: HB.etat_at(h, at(s))[0]           # noqa: E731
    check("the defaults: a child's home, up at 7 h 30, in bed at 21 h, no nap", D == {"actif": True, "reveil": 450, "coucher": 1260, "sieste": None, "weekend": None}, D)
    want = [("2026-11-09 07:00", "nuit"), ("2026-11-09 07:30", "reveil"), ("2026-11-09 07:44", "reveil"), ("2026-11-09 07:45", "eveille"),
            ("2026-11-09 20:44", "eveille"), ("2026-11-09 20:45", "coucher"), ("2026-11-09 20:59", "coucher"), ("2026-11-09 21:00", "nuit"),
            ("2026-11-10 00:30", "nuit"), ("2026-11-10 07:29", "nuit")]
    got = [(s, e(D, s)) for s, _ in want]
    check("his states at fixed times: the night, waking up, awake, getting ready for bed, the night again", got == want, got)
    late = HB.clean_horaires({"reveil": "8:00", "coucher": "0:30"})
    got = [e(late, s) for s in ("2026-11-09 23:50", "2026-11-10 00:20", "2026-11-10 00:31", "2026-11-10 07:59", "2026-11-10 08:05")]
    check("a bedtime after midnight: awake at 23:50, bedtime at 0:20, asleep at 0:31 until 8 h", got == ["eveille", "coucher", "nuit", "nuit", "reveil"], got)
    _, since, until, nxt = HB.etat_at(late, at("2026-11-10 03:00"))
    check("…the night across midnight, from 0:30 to 8:00, then he wakes up", since == at("2026-11-10 00:30") and until == at("2026-11-10 08:00") and nxt == "reveil", (since, until, nxt))
    we = HB.clean_horaires({"weekend": {"reveil": "9:30", "coucher": "22:00"}})
    got = {s: e(we, s) for s in ("2026-11-13 21:30", "2026-11-14 08:00", "2026-11-14 09:35", "2026-11-14 21:50", "2026-11-15 21:30", "2026-11-16 07:31")}
    check("the weekend: up later on Saturday and Sunday, in bed later on Friday and Saturday nights, a school night on Sunday",
          got == {"2026-11-13 21:30": "eveille", "2026-11-14 08:00": "nuit", "2026-11-14 09:35": "reveil", "2026-11-14 21:50": "coucher",
                  "2026-11-15 21:30": "nuit", "2026-11-16 07:31": "reveil"}, got)
    nap = HB.clean_horaires({"sieste": {"de": "13:30", "duree": 60}})
    got = [e(nap, s) for s in ("2026-11-09 13:29", "2026-11-09 13:30", "2026-11-09 14:29", "2026-11-09 14:30")]
    check("his nap: from 13 h 30, an hour", got == ["eveille", "sieste", "sieste", "eveille"], got)
    check("…skipped today (« Réveille-le »): awake", HB.etat_at(nap, at("2026-11-09 13:45"), "2026-11-09")[0] == "eveille"
          and HB.etat_at(nap, at("2026-11-10 13:45"), "2026-11-09")[0] == "sieste")
    for h, why in (({"reveil": 450, "coucher": 600}, "6 heures"), ({"reveil": 450, "coucher": 300}, "4 heures"), ({"reveil": 300, "coucher": 120}, "4 heures"),
                   ({"reveil": 600, "coucher": 1290, "sieste": {"de": 610, "duree": 30}}, "sieste"), ({"reveil": 450, "coucher": 1260, "sieste": {"de": 1250, "duree": 30}}, "sieste")):
        p = HB.problem({**HB.DEFAULT_H, **h})
        check(f"an impossible schedule is refused with a reason ({why})", bool(p) and why in p, p)
    check("a bedtime after midnight is fine; a night of 16 h at most", HB.problem({**HB.DEFAULT_H, "reveil": 480, "coucher": 30}) is None
          and "16" in (HB.problem({**HB.DEFAULT_H, "reveil": 720, "coucher": 1140}) or ""))
    bad = [None, "x", {"reveil": "25:00", "coucher": [], "sieste": "oui", "weekend": 3}, {"reveil": 1e400, "coucher": -5}, {"actif": "non"},
           {"reveil": "7:30", "coucher": "21:00", "sieste": {"de": "13:30", "duree": 9999}}, {"reveil": 450, "coucher": 500}]
    check("cleaned: a garbage schedule gives the defaults, bit by bit", all(HB.clean_horaires(b) == D for b in bad), [HB.clean_horaires(b) for b in bad])
    keep = HB.clean_horaires({"reveil": "8:15", "coucher": "21:30", "sieste": {"de": "8:30", "duree": 60}})
    check("…an impossible nap goes, the good times stay", keep == {**D, "reveil": 495, "coucher": 1290}, keep)
    check("times typed every way: 7:30, 7h30, 7 h, 19 h 05; never 24:00", [HB.to_min(x) for x in ("7:30", "7h30", "7 h", "19 h 05", "24:00", 450.0, True, "x")]
          == [450, 450, 420, 1145, None, 450, None, None])
    t0 = at("2026-11-09 12:00").timestamp()
    check("awake hours: 13 h 30 a day (7 h 30 to 21 h), and the cap", abs(HB.awake_hours(D, t0, t0 + 86400) - 13.5) < 1e-6 and HB.awake_hours(D, t0, t0 + 30 * 86400, 6) == 6)
    t1 = at("2026-11-09 21:00").timestamp()
    check("…none at night (21 h to 7 h 30)", HB.awake_hours(D, t1, t1 + 10.5 * 3600) == 0)


def walk(H, clock, to, step=30):
    """Ticks every `step` s up to `to` (as the server does every second): the kinds of his routine events on the way."""
    end, n, kinds = at(to).timestamp(), (H.ev or {}).get("id", 0), []
    while clock.t < end:
        clock.t = min(end, clock.t + step)
        H.tick()
        if H.ev and H.ev["id"] > n:
            n = H.ev["id"]
            kinds.append(H.ev["kind"])
    return kinds


def dst():
    """Europe/Paris: on 25 October 2026 3 h becomes 2 h, on 29 March 2026 2 h becomes 3 h. Both in his night."""
    old = os.environ.get("TZ")
    os.environ["TZ"] = "Europe/Paris"
    time.tzset()
    try:
        D = HB.clean_horaires({})
        for night, hours in (("2026-10-24", 11.5), ("2026-03-28", 9.5)):
            t0 = at(f"{night} 20:00").timestamp()
            spans = HB.night_spans(D, t0, t0 + 16 * 3600)
            got = sum(b - a for a, b in spans) / 3600
            check(f"DST ({night}): his night lasts {hours} real hours (21 h to 7 h 30 on the clock)", len(spans) == 1 and abs(got - hours) < 1e-6, (spans, got))
            t1 = at(f"{night} 12:00").timestamp()
            got = HB.awake_hours(D, t1, (dt.datetime.fromtimestamp(t1) + dt.timedelta(days=3)).timestamp())
            check("…his awake hours over these 3 days: 13 h 30 a day all the same", abs(got - 40.5) < 1e-6, got)
            day = dt.date.fromisoformat(night) + dt.timedelta(days=1)
            got = [HB.etat_at(D, dt.datetime.combine(day, dt.time(h, m)))[0] for h, m in ((2, 30), (7, 29), (7, 31))]
            check(f"…2 h 30 that night (twice, or never on the clock): asleep; awake at 7 h 30", got == ["nuit", "nuit", "reveil"], got)
            hub = Hub({}, demo=False)
            clock = Clock(f"{night} 20:40")
            H = HB.Habitudes(hub, None, clock, random.Random(1))
            HB.now_ms = lambda: clock.t * 1000
            kinds = walk(H, clock, f"{day.isoformat()} 07:40", 60)
            check(f"…his routine through that night, a tick a minute: bedtime, teeth, night-light, goodnight, then the morning, nothing more",
                  kinds == ["annonce", "dents", "veilleuse", "dodo", "reveil"], kinds)
        H = HB.clean_horaires({"reveil": "2:30", "coucher": "19:00"})
        check("…a wake-up at 2 h 30 the night it does not exist: no crash", HB.etat_at(H, dt.datetime(2026, 3, 29, 2, 45))[0] in HB.ETATS)
    finally:
        if old is None:
            os.environ.pop("TZ", None)
        else:
            os.environ["TZ"] = old
        time.tzset()


def make(tmp, s="2026-11-09 15:00", demo=False, car=None, rng=1):
    tmp.mkdir(parents=True, exist_ok=True)
    hub = Hub({"data_dir": str(tmp)}, demo=demo)
    server.core_actions(hub, tmp)
    poche.setup(hub)
    if car is not None:
        (tmp / "caractere.json").write_text(json.dumps(car))
    caractere.setup(hub, tmp)
    clock = Clock(s)
    H = HB.setup(hub, tmp, now=clock, rng=random.Random(rng), run=False)
    nourrir.setup(hub, tmp)
    exos.setup(hub, tmp)
    seen = []
    d0 = hub.dispatch

    async def dispatch(name, args=None):
        seen.append((name, args or {}))
        if name == "chat.ask":
            return None
        return await d0(name, args)
    hub.dispatch = dispatch
    HB.now_ms = lambda: clock.t * 1000            # the games and the events on the same fake clock
    return hub, H, clock, seen


def routine(tmp):
    hub, H, clock, _ = make(tmp, "2026-11-09 20:40")
    S = hub.s["habitudes"]
    check("the snapshot: his schedule, his state, dort and nuit, his games, laughs, fears and phrases",
          {"horaires", "etat", "dort", "nuit", "prochain", "ev", "jeux", "partie", "rires", "peurs", "expressions", "horloge"} <= set(S) and S["etat"] == "eveille"
          and not S["dort"] and S["horloge"] == {"decalage": 0, "pause": False}, list(S))
    H.tick()
    kinds = walk(H, clock, "2026-11-09 21:01")
    check("bedtime, tick by tick: the announce at 20 h 45, his teeth at 20 h 52, his night-light at 20 h 58, goodnight at 21 h",
          kinds == ["annonce", "dents", "veilleuse", "dodo"], kinds)
    S = hub.s["habitudes"]
    check("…then he sleeps: etat nuit, dort, nuit, until 7 h 30", S["etat"] == "nuit" and S["dort"] and S["nuit"] and S["ev"]["kind"] == "dodo"
          and S["prochain"]["etat"] == "reveil" and abs(S["prochain"]["t"] - at("2026-11-10 07:30").timestamp() * 1000) < 1, S["prochain"])
    kinds = walk(H, clock, "2026-11-10 07:31", 60)
    check("the morning: he wakes up (reveil), no longer dort", kinds == ["reveil"] and hub.s["habitudes"]["ev"]["kind"] == "reveil"
          and not hub.s["habitudes"]["dort"] and hub.s["habitudes"]["etat"] == "reveil", kinds)
    walk(H, clock, "2026-11-10 07:50")
    check("…15 minutes later: awake (eveille)", hub.s["habitudes"]["etat"] == "eveille")
    n = hub.s["habitudes"]["ev"]["id"]
    clock.set("2026-11-10 21:30")                  # the Pi was off all evening: a jump
    H.tick()
    check("a clock jump (the Pi was off): no routine scene for what it missed, the right state", hub.s["habitudes"]["ev"]["id"] == n and hub.s["habitudes"]["etat"] == "nuit")
    H.S["peurs"]["noir"]["on"] = False
    clock.set("2026-11-11 20:40")
    H.tick()
    kinds = walk(H, clock, "2026-11-11 21:01")
    check("…no night-light when he is not afraid of the dark", kinds == ["annonce", "dents", "dodo"], kinds)
    H.S["peurs"]["noir"].update(on=True, courage=100)
    clock.set("2026-11-12 20:40")
    H.tick()
    kinds = walk(H, clock, "2026-11-12 21:01")
    check("…nor once he is brave (courage 100)", kinds == ["annonce", "dents", "dodo"], kinds)
    clock.set("2026-11-13 20:50")                  # the Pi starts at 20 h 50: no announce, but his teeth all the same
    H.tick()
    kinds = walk(H, clock, "2026-11-13 21:01")
    check("…the Pi starts during his bedtime: no announce, his teeth, goodnight", kinds == ["dents", "dodo"], kinds)
    # the demo: paused (awake whatever the hour), then simulated
    hub2, H2, clock2, _ = make(tmp / "demo", "2026-11-09 23:30", demo=True)
    check("the demo (--demo, Pixel Lab): his clock paused, awake at 23 h 30, no night for the others",
          hub2.s["habitudes"]["etat"] == "eveille" and hub2.s["habitudes"]["horloge"]["pause"] and H2.is_night(clock2.t) is None and H2.awake_hours(0, 3600) is None)


async def actions(tmp):
    hub, H, clock, seen = make(tmp, "2026-11-09 10:00")
    await hub.dispatch("habitudes.horaires", {"reveil": "7:00", "coucher": "20:30"})
    check("habitudes.horaires: his times change", H.S["horaires"]["reveil"] == 420 and H.S["horaires"]["coucher"] == 1230)
    t0 = (hub.s.get("toast") or {}).get("id")
    await hub.dispatch("habitudes.horaires", {"coucher": "9:00"})
    check("…an impossible one is refused, a toast says why, nothing moves", H.S["horaires"]["coucher"] == 1230 and (hub.s["toast"] or {}).get("id") != t0
          and "heures" in hub.s["toast"]["msg"], hub.s.get("toast"))
    await hub.dispatch("habitudes.horaires", {"sieste": {"de": "13:30", "duree": 45}})
    await hub.dispatch("habitudes.horaires", {"weekend": {}})
    check("…a nap, and the weekend (a later wake-up and bedtime by default)", H.S["horaires"]["sieste"] == {"de": 810, "duree": 45}
          and H.S["horaires"]["weekend"] == {"reveil": 510, "coucher": 1260}, H.S["horaires"])
    clock.set("2026-11-09 13:40")
    H.tick()
    H.tick()
    check("the nap: dort", hub.s["habitudes"]["etat"] == "sieste" and hub.s["habitudes"]["dort"] and not hub.s["habitudes"]["nuit"])
    await hub.dispatch("habitudes.jouer", {"jeu": "simon"})
    check("…no game during his nap: « Chut… », and he says it on his screen", H.partie is None and "sieste" in hub.s["toast"]["msg"]
          and hub.s["habitudes"]["ev"]["kind"] == "pas-maintenant", hub.s["toast"])
    await hub.dispatch("habitudes.reveiller")
    H.tick()
    check("« Réveille-le »: the nap ends for today, he wakes up (fin-sieste)", hub.s["habitudes"]["etat"] == "eveille" and hub.s["habitudes"]["ev"]["kind"] == "fin-sieste"
          and H.S["sautee"] == "2026-11-09")
    await hub.dispatch("habitudes.horaires", {"sieste": None, "weekend": None})
    check("…and the nap and the weekend switched off", H.S["horaires"]["sieste"] is None and H.S["horaires"]["weekend"] is None)
    await hub.dispatch("habitudes.favori", {"jeu": "etoiles"})
    check("his favourites: two, the newest replaces the older", len(H.S["jeux"]["favoris"]) == 2 and H.S["jeux"]["favoris"][-1] == "etoiles", H.S["jeux"]["favoris"])
    await hub.dispatch("habitudes.rires", {"aime": ["blagues", "x", "gagner"]})
    check("what makes him laugh: only known kinds", H.S["rires"]["aime"] == ["blagues", "gagner"])
    await hub.dispatch("habitudes.rires", {"kind": "chatouilles", "on": True})
    await hub.dispatch("habitudes.peurs", {"peur": "araignees", "on": False})
    check("…one more; a fear switched off", "chatouilles" in H.S["rires"]["aime"] and H.S["peurs"]["araignees"]["on"] is False)
    await hub.dispatch("habitudes.rire", {"kind": "blague"})
    r = hub.s["habitudes"]["rire"]
    check("a joke: one of his (from web/scenes/habitudes.js), he likes jokes", len(HB.BLAGUES) >= 30 and r["kind"] == "blague" and 0 <= r["n"] < len(HB.BLAGUES) and r["aime"] is True, r)
    await hub.dispatch("habitudes.rire", {"kind": "grimace"})
    check("…a grimace he does not find that funny (not in his list)", hub.s["habitudes"]["rire"]["kind"] == "grimace" and hub.s["habitudes"]["rire"]["aime"] is False)
    # his phrases
    ok, c = H.teach("bonjour", "  « Salut les loulous ! »  ")
    check("a phrase taught: cleaned (quotes and spaces), he repeats it on his screen", ok and c == "Salut les loulous !" and H.phrase["kind"] == "appris"
          and H.S["expressions"]["bonjour"] == ["Salut les loulous !"], (c, H.S["expressions"]["bonjour"]))
    for s in ("https://exemple.fr", "\u0000​  ", "", "???", 42, None):
        check(f"…a phrase that is not one is refused ({s!r})", not H.teach("merci", s)[0])
    H.teach("bonjour", "a" * 90)
    check("…60 characters at most", H.S["expressions"]["bonjour"][0] == "a" * 60)
    for i in range(7):
        H.teach("bonjour", f"Coucou numéro {i}")
    H.teach("bonjour", "coucou NUMÉRO 6")
    lst = H.S["expressions"]["bonjour"]
    check("…5 a moment, the newest first, no twice the same", len(lst) == 5 and lst[0] == "coucou NUMÉRO 6" and sum(x.lower() == "coucou numéro 6" for x in lst) == 1, lst)
    await hub.dispatch("habitudes.oublier", {"moment": "bonjour", "phrase": lst[1]})
    check("…one forgotten", len(H.S["expressions"]["bonjour"]) == 4 and lst[1] not in H.S["expressions"]["bonjour"])
    await hub.dispatch("habitudes.dire", {"moment": "bonjour", "phrase": H.S["expressions"]["bonjour"][0]})
    check("…and said again on demand", hub.s["habitudes"]["phrase"]["kind"] == "dit")
    out = await Claude(hub, {}).run_tool("get_status", {})
    check("Claude's get_status: his day and games, never the phrases taught", "habitudes" in json.loads(out) and "oucou" not in out and "loulous" not in out, out[-300:])
    # his fears: the storm, from the weather
    hub.s["weather"] = {"now": {"kind": "orage"}, "days": []}
    clock.set("2026-11-09 16:00")
    H.tick()
    p1 = hub.s["habitudes"]["peur"]
    clock.t += 60
    H.tick()
    check("the storm: a thunder clap when it starts, not again a minute later", p1 and p1["kind"] == "orage" and hub.s["habitudes"]["peur"]["id"] == p1["id"], p1)
    clock.t += HB.STORM_GAP[1] + 10
    H.tick()
    check("…again after a while (12 to 25 min)", hub.s["habitudes"]["peur"]["id"] == p1["id"] + 1)
    H.S["peurs"]["orage"]["on"] = False
    clock.t += HB.STORM_GAP[1] + 10
    H.tick()
    check("…never when his fear of the storm is off", hub.s["habitudes"]["peur"]["id"] == p1["id"] + 1)
    H.S["peurs"]["orage"]["on"] = True
    clock.set("2026-11-09 23:00")
    H.tick()
    clock.t += HB.STORM_GAP[1] + 10
    H.tick()
    check("…never at night (he sleeps)", hub.s["habitudes"]["peur"]["id"] == p1["id"] + 1)
    hub.s["weather"] = None
    gained = []
    for i in range(5):
        await hub.dispatch("habitudes.rassure", {"peur": "orage"})
        gained.append(H.S["peurs"]["orage"]["courage"])
    check("comforting him: +10 courage each time, 30 a day at most", gained == [10, 20, 30, 30, 30], gained)
    for day in ("2026-11-10", "2026-11-11", "2026-11-12"):
        clock.set(day + " 10:00")
        for i in range(4):
            await hub.dispatch("habitudes.rassure", {"peur": "orage"})
    check("…over the days, up to 100: he is not afraid any more", H.S["peurs"]["orage"]["courage"] == 100 and H.S["peurs"]["orage"]["vaincue"])
    await hub.dispatch("habitudes.peur", {"kind": "orage"})
    check("habitudes.peur (a fear now) is for the demo and the lab only", hub.s["habitudes"]["peur"]["id"] == p1["id"] + 1)
    # saved
    hub2, H2, _, _ = make(tmp, "2026-11-12 10:00")
    check("everything kept in habitudes.json: times, favourites, laughs, fears, courage, phrases", H2.S["horaires"] == H.S["horaires"] and H2.S["jeux"]["favoris"] == H.S["jeux"]["favoris"]
          and H2.S["rires"] == H.S["rires"] and H2.S["peurs"]["orage"]["courage"] == 100 and H2.S["expressions"] == H.S["expressions"])


async def games(tmp):
    hub, H, clock, seen = make(tmp, "2026-11-09 10:00")
    R = random.Random(4)
    t = 1_000_000.0
    # cache-cache
    p = HB.new_game("cache", t, R, 7)
    check("cache-cache: he hides first (1.6 s), then you look", p["phase"] == "cache" and HB.game_move(p, {"id": 7, "cote": p["cachette"]}, t + 500, R) == "" and HB.game_tick(p, t + 1700, R) == "cherche")
    wrong = [s for s in HB.SPOTS if s != p["cachette"]]
    check("…a wrong edge: « Pas là ! », the same one twice counts once, a stale round or another game's move is ignored",
          HB.game_move(p, {"id": 7, "manche": 1, "cote": wrong[0]}, t + 2000, R) == "rate" and HB.game_move(p, {"id": 7, "cote": wrong[0]}, t + 2100, R) == ""
          and HB.game_move(p, {"id": 7, "manche": 2, "cote": p["cachette"]}, t + 2200, R) == "" and HB.game_move(p, {"id": 8, "cote": p["cachette"]}, t + 2200, R) == "")
    check("…two wrong edges: he comes out by himself", HB.game_move(p, {"id": 7, "cote": wrong[1]}, t + 2300, R) == "sorti" and p["trouves"] == 0)
    tt = t + 2300
    for m in (2, 3):
        tt += HB.CACHE["show"] + 1
        check(f"…round {m}: he hides somewhere else", HB.game_tick(p, tt, R) == "manche" and p["manche"] == m)
        tt += HB.CACHE["hide"] + 1
        HB.game_tick(p, tt, R)
        tt += 400
        check(f"…found in round {m}", HB.game_move(p, {"id": 7, "manche": m, "cote": p["cachette"]}, tt, R) == "trouve")
    tt += HB.CACHE["show"] + 1
    check("…3 rounds: found twice, you win", HB.game_tick(p, tt, R) == "fin" and p["fin"]["resultat"] == "gagne" and p["fin"]["score"] == 2)
    check("…the result stays a few seconds, then the game closes", HB.game_tick(p, tt + 1000, R) == "" and HB.game_tick(p, tt + HB.END_MS + 1, R) == "ferme")
    q = HB.new_game("cache", t, R, 9)
    HB.game_tick(q, t + 1700, R)
    check("…left alone 15 s, he comes out", HB.game_tick(q, t + 1700 + HB.CACHE["look"] + 1, R) == "sorti")
    # pierre-feuille-ciseaux
    p = HB.new_game("pfc", t, R, 11)
    res = HB.game_move(p, {"id": 11, "manche": 1, "choix": "pierre"}, t + 1000, R)
    check("pierre-feuille-ciseaux: a hand, his hand, who wins (pierre beats ciseaux…)", res in ("toi", "lui", "egal") and p["phase"] == "montre"
          and (res == "egal") == (p["lui"] == "pierre") and (res == "toi") == (p["lui"] == "ciseaux"), (res, p["lui"]))
    check("…no second hand while they show", HB.game_move(p, {"id": 11, "choix": "feuille"}, t + 1100, R) == "")
    tt, n = t + 1000, 0
    while p["etat"] == "joue" and n < 20:
        tt += HB.PFC["show"] + 1
        HB.game_tick(p, tt, R)
        if p["etat"] == "joue":
            HB.game_move(p, {"id": 11, "manche": p["manche"], "choix": "feuille"}, tt + 10, R)
        n += 1
    a, b = p["score"]
    check("…first to 2 (or 5 rounds): the result matches the score", p["etat"] == "fin" and p["fin"]["resultat"] == ("gagne" if a > b else "perdu" if b > a else "egal")
          and (max(a, b) == 2 or p["manche"] == 5), (p["score"], p["fin"]))
    q = HB.new_game("pfc", t, R, 12)
    check("…no hand for 25 s: the game ends gently", HB.game_tick(q, t + HB.PFC["wait"] + 1, R) == "fin" and q["fin"]["resultat"] == "fini")
    # attrape-étoiles
    p = HB.new_game("etoiles", t, R, 13)
    s0 = p["etoiles"][0]
    check("attrape-étoiles: 34 stars falling over 30 s, some golden", len(p["etoiles"]) == 34 and any(s["d"] for s in p["etoiles"]) and max(s["t"] for s in p["etoiles"]) < 30000)
    check("…a star caught while it falls; not twice; not one still to come or long gone; not another game's",
          HB.game_move(p, {"id": 13, "etoile": 0}, t + s0["t"] + 800, R) == "etoile" and HB.game_move(p, {"id": 13, "etoile": 0}, t + s0["t"] + 900, R) == ""
          and HB.game_move(p, {"id": 13, "etoile": 33}, t + 1000, R) == "" and HB.game_move(p, {"id": 13, "etoile": 1}, t + p["etoiles"][1]["t"] + 9000, R) == ""
          and HB.game_move(p, {"id": 14, "etoile": 2}, t + p["etoiles"][2]["t"] + 500, R) == "" and HB.game_move(p, {"id": 13, "etoile": 999}, t + 5000, R) == "")
    gold = next(i for i, s in enumerate(p["etoiles"]) if s["d"])
    HB.game_move(p, {"id": 13, "etoile": gold}, t + p["etoiles"][gold]["t"] + 500, R)
    check("…a golden star is worth 3", p["score"] == 4, p["score"])
    for i, s in enumerate(p["etoiles"]):
        HB.game_move(p, {"id": 13, "etoile": i}, t + s["t"] + 600, R)
    check("…30 s: the end, 12 or more: you win", HB.game_tick(p, t + 30001, R) == "fin" and p["fin"]["resultat"] == "gagne" and p["fin"]["score"] >= 12)
    # Simon
    p = HB.new_game("simon", t, R, 15)
    seq = p["seq"]
    check("Simon: 8 pads at most, never three times the same in a row, he shows 3 first", len(seq) == 8 and not any(seq[i] == seq[i + 1] == seq[i + 2] for i in range(6))
          and p["long"] == 3 and p["phase"] == "montre")
    check("…no press while he shows them", HB.game_move(p, {"id": 15, "i": 0, "pad": seq[0]}, t + 100, R) == "")
    tt = t + 3 * HB.SIMON["step"] + 301
    HB.game_tick(p, tt, R)
    outs = [HB.game_move(p, {"id": 15, "manche": 1, "i": i, "pad": seq[i]}, tt + 100 * i, R) for i in range(3)]
    check("…your turn: the three right pads, then one more", outs == ["ok", "ok", "suite"] and p["phase"] == "bravo" and p["meilleur"] == 3, outs)
    check("…a double tap (the same press again) is ignored", HB.game_move(p, {"id": 15, "manche": 1, "i": 2, "pad": seq[2]}, tt + 400, R) == "")
    tt += 200 + HB.SIMON["gap"] + 1
    check("…a short « Bravo ! », then he shows them again, one more", HB.game_tick(p, tt, R) == "manche" and p["phase"] == "montre")
    tt += 4 * HB.SIMON["step"] + 301
    HB.game_tick(p, tt, R)
    check("…round 2: four pads", p["long"] == 4 and p["phase"] == "joue")
    HB.game_move(p, {"id": 15, "manche": 2, "i": 0, "pad": seq[0]}, tt + 10, R)
    check("…a wrong pad: the end, he says how many you remembered", HB.game_move(p, {"id": 15, "manche": 2, "i": 1, "pad": (seq[1] + 1) % 4}, tt + 20, R) == "faux"
          and p["etat"] == "fin" and p["fin"]["resultat"] == "fini" and p["fin"]["score"] == 3)
    # through the hub: refused at night, at bedtime, over an exercise; a cast pauses it; records; « rejoue »
    clock.set("2026-11-09 22:00")
    await hub.dispatch("habitudes.jouer", {"jeu": "cache"})
    check("no game at night: « Chut… il dort », he mumbles it", H.partie is None and "dort" in hub.s["toast"]["msg"])
    clock.set("2026-11-09 20:50")
    await hub.dispatch("habitudes.jouer", {"jeu": "cache"})
    check("…nor at bedtime", H.partie is None and "dodo" in hub.s["toast"]["msg"])
    clock.set("2026-11-09 10:00")
    await hub.dispatch("exos.nouveau", {"mode": "exo", "kind": "addition"})
    await hub.dispatch("habitudes.jouer", {"jeu": "cache"})
    check("…nor over an open exercise: « Termine ton exo d'abord ! »", H.partie is None and "exo" in hub.s["toast"]["msg"])
    await hub.dispatch("exos.stop")
    await hub.dispatch("habitudes.jouer", {"jeu": "pfc", "par": "telephone"})
    g = hub.s["habitudes"]["partie"]
    check("a game starts on his face screen, his favourite or not", g and g["jeu"] == "pfc" and hub.s["screen"] == "visage" and g["favori"] == ("pfc" in H.S["jeux"]["favoris"]))
    hub.s["cast"] = {"id": "x", "kind": "text", "t0": clock.t * 1000, "until": 0}
    clock.t += 1
    H.tick()
    paused = hub.s["habitudes"]["partie"]["pause"]
    clock.t += 30
    H.tick()
    check("…a cast covers his screen: the game waits under it (its clock stops)", paused and H.partie["phase"] == "choix" and H.partie["etat"] == "joue")
    hub.s["cast"] = None
    clock.t += 1
    H.tick()
    check("…and goes on where it was", not H.partie["pause"] and H.partie["phase"] == "choix" and clock.t * 1000 - H.partie["phase_t"] < 2000)
    await hub.dispatch("exos.nouveau", {"mode": "exo", "kind": "addition"})
    clock.t += 1
    H.tick()
    clock.t += 40
    H.tick()
    check("…an exercise opened since: the game waits under it too", H.partie["pause"] and H.partie["etat"] == "joue")
    await hub.dispatch("exos.stop")
    clock.t += 1
    H.tick()
    H.S["rires"]["aime"] = ["gagner"]
    n0 = H.S["jeux"]["parties"]
    for _ in range(8):
        if H.partie["etat"] != "joue":
            break
        await hub.dispatch("habitudes.coup", {"id": H.partie["id"], "manche": H.partie["manche"], "choix": "pierre"})
        clock.t += 3
        H.tick()
    f = H.partie["fin"]
    check("…the end: counted, his laugh when he wins and winning makes him laugh", f and H.S["jeux"]["parties"] == n0 + 1 and f["rit"] == (f["resultat"] == "perdu"), f)
    clock.t += HB.END_MS / 1000 + 1
    H.tick()
    check("…then it closes: back to his face", H.partie is None and hub.s["habitudes"]["partie"] is None)
    seen.clear()
    await commands.run(hub, "on rejoue")
    check("« on rejoue »: the same game again, shortly after", H.partie and H.partie["jeu"] == "pfc", seen)
    await commands.run(hub, "stop")
    check("« stop »: the game stops", H.partie is None, seen[-3:])
    hub.s["habitudes"]["partie"] = None
    await hub.dispatch("habitudes.jouer", {"jeu": "etoiles"})
    gid = H.partie["id"]
    for i, s in enumerate(H.partie["etoiles"]):
        clock.t = H.partie["t0"] / 1000 + (s["t"] + 500) / 1000
        await hub.dispatch("habitudes.coup", {"id": gid, "etoile": i})
    clock.t = H.partie["t0"] / 1000 + 31
    H.tick()
    check("attrape-étoiles through the hub: a record kept", H.S["jeux"]["records"].get("etoiles", 0) >= 34 and H.partie["fin"].get("record"), H.S["jeux"]["records"])


async def typed(tmp):
    hub, H, clock, seen = make(tmp, "2026-11-09 10:00")

    async def run(text):
        seen.clear()
        await commands.run(hub, text)
        return seen[0] if seen else ("toast", None)
    cases = [("on joue ?", "habitudes.jouer", "au-choix"), ("On joue !", "habitudes.jouer", "au-choix"), ("joue avec moi", "habitudes.jouer", "au-choix"),
             ("cache-cache", "habitudes.jouer", "cache"), ("on joue à cache-cache ?", "habitudes.jouer", "cache"), ("joue à cache-cache", "habitudes.jouer", "cache"),
             ("pierre feuille ciseaux", "habitudes.jouer", "pfc"), ("chifoumi", "habitudes.jouer", "pfc"), ("attrape les étoiles", "habitudes.jouer", "etoiles"),
             ("on joue à attrape-étoiles", "habitudes.jouer", "etoiles"), ("simon", "habitudes.jouer", "simon"), ("raconte une blague", "habitudes.rire", "blague"),
             ("Raconte une blague !", "habitudes.rire", "blague"), ("encore une blague", "habitudes.rire", "blague"), ("fais une grimace", "habitudes.rire", "grimace"),
             ("fais un bruit rigolo", "habitudes.rire", "bruit")]
    bad = []
    for text, action, arg in cases:
        if H.partie:
            H.stop_game()
        name, args = await run(text)
        if name != action or arg not in (args or {}).values():
            bad.append(f"{text}: {name} {args}")
    check(f"the typed commands: {len(cases)} phrases to play, to laugh", not bad, bad)
    H.stop_game()
    name, args = await run("Dis bonjour comme ça : Salut les loulous !")
    check("« dis bonjour comme ça : Salut les loulous ! »: taught, with its capitals", name == "habitudes.apprendre" and args == {"moment": "bonjour", "phrase": "Salut les loulous !"}, args)
    for text, moment, phrase in (("quand tu es content dis : Youpi tralala !", "content", "Youpi tralala !"), ("pour dire bonne nuit dis : Fais de beaux rêves", "bonne-nuit", "Fais de beaux rêves"),
                                 ("Quand tu as faim, dis : J’ai un creux de baleine !", "faim", "J’ai un creux de baleine !"), ("pour dire merci, dis : Merci mille fois", "merci", "Merci mille fois"),
                                 ("dis au revoir comme ça : À plus dans le bus", "au-revoir", "À plus dans le bus"), ("pour dire bravo dis : Champion du monde", "bravo", "Champion du monde")):
        name, args = await run(text)
        check(f"…« {text} »", name == "habitudes.apprendre" and args == {"moment": moment, "phrase": phrase}, (name, args))
    ex = H.S["expressions"]
    check("…all kept", ex["bonjour"] == ["Salut les loulous !"] and ex["content"] == ["Youpi tralala !"] and ex["faim"] == ["J’ai un creux de baleine !"], ex)
    for text in ("raconte-moi une blague", "raconte une blague sur les chats", "on joue au foot", "dis bonjour à mamie", "joue", "une partie de foot", "tu dors ?", "simon dit lève les bras",
                 "quand tu es content tu chantes ?", "blague", "pourquoi tu as peur de l'orage ?", "dis bonjour comme ça :", "réveille-toi"):
        name, _ = await run(text)
        check(f"…« {text} » goes to Claude", name == "chat.ask", name)
    name, args = await run("joue cache-cache")
    check("« joue cache-cache » is still his moment of life « Coucou caché » (another feature's words stay theirs)", name == "scene.play" and args == {"id": "cache"}, (name, args))
    name, _ = await run("fais coucou caché")
    check("…and « fais coucou caché » too", name == "scene.play")
    name, args = await run("couche-toi à 20 h 30")
    check("« couche-toi à 20 h 30 »: his bedtime", name == "habitudes.horaires" and H.S["horaires"]["coucher"] == 1230, args)
    name, args = await run("réveil à 7 h")
    check("« réveil à 7 h »: his wake-up", H.S["horaires"]["reveil"] == 420, args)
    await run("à quelle heure tu te couches ?")
    check("« à quelle heure tu te couches ? »: a toast says it", "20 h 30" in hub.s["toast"]["msg"] and "7 h" in hub.s["toast"]["msg"], hub.s["toast"])
    await run("tes phrases")
    check("« tes phrases »: how many he knows, where to find them", "phrases" in hub.s["toast"]["msg"] and "Ses habitudes" in hub.s["toast"]["msg"])
    name, _ = await run("oublie ta phrase de bonjour")
    check("« oublie ta phrase de bonjour »", ex["bonjour"] == [] or H.S["expressions"]["bonjour"] == [])
    name, _ = await run("oublie ta phrase de bonjour")
    check("…again: nothing to forget, Claude answers", name == "chat.ask", name)
    await hub.dispatch("habitudes.jouer", {"jeu": "simon"})
    name, _ = await run("stop")
    check("« stop » during a game stops it", name == "habitudes.stop" and H.partie is None, name)
    clock.set("2026-11-09 22:00")
    H.tick()
    name, _ = await run("on joue ?")
    check("at night « on joue ? » is his (he mumbles: no game)", name == "habitudes.jouer" and H.partie is None)
    name, _ = await run("réveille-toi")
    check("…« réveille-toi » at night: he mumbles and sleeps on", name == "habitudes.reveiller" and hub.s["habitudes"]["etat"] == "nuit")
    clock.set("2026-11-09 10:00")
    H.tick()
    # the other features keep their words
    for text, want in (("mange une pomme", None), ("sois farceur", "caractere.set"), ("exo", "exos.nouveau"), ("fais le poisson", "scene.play")):
        name, _ = await run(text)
        check(f"…« {text} » is still the other feature's", want is None or name == want, name)
    check("« aide » names « on joue ? » and « raconte une blague »", "on joue ?" in commands.HELP and "raconte une blague" in commands.HELP)


async def claude(tmp):
    hub, H, clock, seen = make(tmp, "2026-11-09 10:00")
    names = [t["name"] for t in TOOLS]
    check("Claude's tool « habits », offered beside the others, no name twice", "habits" in names and "habits" in [t["name"] for t in tools_for(["retro"])] and len(names) == len(set(names)))
    good = [{"action": "horaires", "coucher": "20:30"}, {"action": "horaires", "sieste": "", "weekend_reveil": "9:00", "weekend_coucher": "21:30"},
            {"action": "jouer", "jeu": "simon"}, {"action": "jouer"}, {"action": "blague"}]
    badl = [{}, {"action": "voler"}, {"action": "horaires"}, {"action": "horaires", "coucher": "25:00"}, {"action": "horaires", "reveil": ""},
            {"action": "apprendre", "moment": "bravo", "phrase": "Champion !"}, {"action": "apprendre", "moment": "x", "phrase": "y"},
            {"action": "jouer", "jeu": "echecs"}, {"action": "blague", "jeu": "simon"}, {"action": "horaires", "sieste_minutes": 999}, "x"]
    check("check(habits): good inputs pass", all(claude_check("habits", a) is None for a in good), [a for a in good if claude_check("habits", a)])
    check("…bad ones are refused, « apprendre » too: a phrase he says on his own is the family's to teach, never Claude's",
          all(claude_check("habits", a) for a in badl), [a for a in badl if not claude_check("habits", a)])
    tool = next(t for t in TOOLS if t["name"] == "habits")
    check("…its schema offers no « apprendre », no moment, no phrase", tool["input_schema"]["properties"]["action"]["enum"] == ["horaires", "jouer", "blague"]
          and not {"moment", "phrase"} & set(tool["input_schema"]["properties"]) and "apprendre de phrase" in tool["description"], tool["input_schema"]["properties"]["action"])
    cl = Claude(hub, {})
    out = await cl.run_tool("habits", {"action": "horaires", "coucher": "20:30", "sieste": "13:00", "sieste_minutes": 30})
    check("run: his schedule changes, Claude hears it", H.S["horaires"]["coucher"] == 1230 and H.S["horaires"]["sieste"] == {"de": 780, "duree": 30} and "20 h 30" in out, out)
    out = await cl.run_tool("habits", {"action": "horaires", "coucher": "9:00"})
    check("…an impossible one: refused, with the reason", out.startswith("refusé") and H.S["horaires"]["coucher"] == 1230, out)
    out = await HB.run_tool(hub, {"action": "apprendre", "moment": "bravo", "phrase": "Champion du monde !"})
    check("run: « apprendre » even past the check teaches nothing", H.S["expressions"]["bravo"] == [] and "inconnue" in out, out)
    out = await cl.run_tool("habits", {"action": "jouer", "jeu": "cache"})
    check("run: a game starts on his screen", H.partie and H.partie["jeu"] == "cache" and H.partie["par"] == "claude" and "Cache-cache" in out, out)
    H.stop_game()
    out = await cl.run_tool("habits", {"action": "blague"})
    check("run: a joke on his screen, Claude knows which", hub.s["habitudes"]["rire"]["kind"] == "blague" and HB.BLAGUES[hub.s["habitudes"]["rire"]["n"]][1] in out, out)
    clock.set("2026-11-09 23:00")
    out = await cl.run_tool("habits", {"action": "jouer", "jeu": "cache"})
    check("…at night: no game, Claude is told why", "pas de jeu" in out and not H.partie, out)


async def robust(tmp):
    """What a page may send never holds the server: a long time of day, a long phrase; his file is his family's only (0600)."""
    hub, H, clock, _ = make(tmp, "2026-11-09 10:00")
    long_t = "7" + " " * 80000 + "x"
    t0 = time.perf_counter()
    r = HB.to_min(long_t)
    dt1 = time.perf_counter() - t0
    check(f"a time of day with 80 000 spaces: no time, at once ({dt1 * 1000:.1f} ms; it took seconds)", r is None and dt1 < 0.05, dt1)
    check("…the usual ones still: « 7:30 », «  19 heures 05  », « 7 h »", [HB.to_min(x) for x in ("7:30", "  19 heures 05  ", "7 h", "7h30 ")] == [450, 1145, 420, 450])
    before = dict(H.S["horaires"])
    t0 = time.perf_counter()
    await hub.dispatch("habitudes.horaires", {"reveil": long_t, "coucher": "7" + "\t" * 200000})
    dt2 = time.perf_counter() - t0
    check(f"habitudes.horaires with them (a WebSocket message): answered at once ({dt2 * 1000:.0f} ms), refused, nothing moves",
          dt2 < 0.3 and H.S["horaires"] == before and "pas compris" in (hub.s.get("toast") or {}).get("msg", ""), dt2)
    t0 = time.perf_counter()
    await hub.dispatch("habitudes.apprendre", {"moment": "bonjour", "phrase": "Salut toi !" + " é a" * (1024 * 1024)})
    dt3 = time.perf_counter() - t0
    check(f"habitudes.apprendre with 4 MB: cut before it is cleaned ({dt3 * 1000:.0f} ms), the phrase at its start kept (60 at most)",
          dt3 < 0.3 and H.S["expressions"]["bonjour"] and H.S["expressions"]["bonjour"][0].startswith("Salut toi !") and len(H.S["expressions"]["bonjour"][0]) <= 60, dt3)
    mode = os.stat(tmp / "habitudes.json").st_mode & 0o777
    check("habitudes.json is readable by its owner only (0600: the family's phrases)", mode == 0o600, oct(mode))


async def others(tmp):
    """Nourrir: his belly sleeps through his night (21 h - 7 h 30), not the old one (23 h - 6 h)."""
    hub, H, clock, _ = make(tmp, "2026-11-09 20:30")
    N = nourrir.Nourrir(hub, None, clock, random.Random(2))
    N.ventre, N.t = 80.0, clock.t
    clock.set("2026-11-09 21:00")
    N.tick()
    v1 = N.ventre
    clock.set("2026-11-09 23:00")
    N.tick()
    v2 = N.ventre
    clock.set("2026-11-10 07:30")
    N.tick()
    v3 = N.ventre
    clock.set("2026-11-10 08:30")
    N.tick()
    check("nourrir: his belly empties until his bedtime (21 h), sleeps all night (to 7 h 30), then empties again",
          v1 < 80 and v2 == v1 and v3 == v1 and abs((v1 - N.ventre) - N.rate()) < 1e-6, (v1, v2, v3, N.ventre))
    hub.habitudes.S["horaires"]["actif"] = False
    N.ventre, N.t = 80.0, at("2026-11-09 21:00").timestamp()
    clock.set("2026-11-09 23:00")
    N.tick()
    check("…his schedule off: the old night (23 h - 6 h) again", abs(80 - N.ventre - 2 * N.rate()) < 1e-6, N.ventre)
    hub2, H2, clock2, _ = make(tmp / "demo", "2026-11-09 21:00", demo=True)
    N2 = nourrir.Nourrir(hub2, None, clock2, random.Random(2))
    N2.ventre, N2.t = 80.0, clock2.t
    clock2.set("2026-11-09 22:00")
    N2.tick()
    check("…the demo's paused clock: the old night too", abs(80 - N2.ventre - N2.rate()) < 1e-6, N2.ventre)


def files(tmp):
    hub, H, clock, _ = make(tmp / "a", car={"calme": {"de": 22, "a": 7}})
    check("caractère's quiet hours (22 h - 7 h) become his first schedule: in bed at 22 h, up at 7 h", H.S["horaires"]["coucher"] == 1320 and H.S["horaires"]["reveil"] == 420
          and H.S["horaires"]["actif"], H.S["horaires"])
    hub, H, clock, _ = make(tmp / "a", car={"calme": {"de": 20, "a": 9}})
    check("…once: habitudes.json is his now (a later change of the old setting does not move it)", H.S["horaires"]["coucher"] == 1320)
    hub, H, clock, _ = make(tmp / "b", car={"calme": {"de": 23, "a": 6}})
    check("…the old defaults (23 h - 6 h): a child's home (21 h - 7 h 30)", H.S["horaires"] == HB.DEFAULT_H)
    hub, H, clock, _ = make(tmp / "c", car={"calme": {"de": 21, "a": 21}})
    check("…« pas d'heures calmes »: his schedule starts switched off (he never goes to bed by himself)", H.S["horaires"]["actif"] is False and hub.s["habitudes"]["etat"] == "eveille")
    hub, H, clock, _ = make(tmp / "d", car={"calme": {"de": 5, "a": 7}})
    check("…impossible ones (a 2-hour night): the defaults", H.S["horaires"] == HB.DEFAULT_H)
    for i, junk in enumerate(("{not json", "[1, 2]", "null", json.dumps({"horaires": {"reveil": 1e400, "coucher": "x"}, "jeux": {"favoris": ["x", 3, "simon", "simon"], "records": {"simon": -4, "cache": 1e9}},
                                                                         "rires": {"aime": "tout"}, "peurs": {"orage": {"on": "oui", "courage": 1e999, "gain": 5}, "noir": [1]},
                                                                         "expressions": {"bonjour": ["  ok  ", 7, "", "a" * 500, "OK"], "merci": "x"}, "sautee": "hier"}))):
        d = tmp / f"junk{i}"
        d.mkdir()
        (d / "habitudes.json").write_text(junk)
        try:
            hub, H, clock, _ = make(d)
            S = H.S
            good = (S["horaires"] == HB.DEFAULT_H and len(S["jeux"]["favoris"]) == 2 and all(f in HB.JEUX for f in S["jeux"]["favoris"])
                    and all(v["courage"] in range(0, 101) for v in S["peurs"].values()) and all(isinstance(x, str) and 0 < len(x) <= 60 for v in S["expressions"].values() for x in v))
            if i == 3:
                good = good and S["jeux"]["favoris"][0] == "simon" and S["expressions"]["bonjour"] == ["ok", "a" * 60] and S["peurs"]["orage"]["on"] is True and S["sautee"] == ""
                good = good and not (d / "habitudes.json.illisible").exists()          # values out of place: cleaned, the file is his
            else:                                                                        # not an object: put aside, never written over
                aside = d / "habitudes.json.illisible"
                good = good and aside.exists() and aside.read_text() == junk and json.loads((d / "habitudes.json").read_text())["v"] == 1
            check(f"a broken habitudes.json ({junk[:24]!r}…) never stops him: everything cleaned"
                  + ("" if i == 3 else ", the file put aside as it was (habitudes.json.illisible)"), good, S)
        except Exception as e:  # noqa: BLE001
            check(f"a broken habitudes.json ({junk[:24]!r}…) never stops him", False, repr(e))
    d = tmp / "ro"
    d.mkdir()
    hub, H, clock, _ = make(d)
    os.chmod(d, 0o500)
    try:
        H.teach("bonjour", "Coucou")
        check("…nor a folder he cannot write to (the phrase is learnt, not saved)", H.S["expressions"]["bonjour"] == ["Coucou"])
    finally:
        os.chmod(d, 0o700)


def parity():
    """The same rules in web/habitudes.js: run in node with the same inputs, compared."""
    times = ["2026-11-09 06:59", "2026-11-09 07:30", "2026-11-09 07:50", "2026-11-09 13:40", "2026-11-09 20:50", "2026-11-09 23:59", "2026-11-13 21:45",
             "2026-11-14 08:00", "2026-11-14 09:40", "2026-11-14 22:10", "2026-11-15 21:40", "2026-11-16 00:20"]
    scheds = [{}, {"reveil": "8:00", "coucher": "0:30"}, {"sieste": {"de": "13:30", "duree": 60}, "weekend": {"reveil": "9:30", "coucher": "22:00"}},
              {"reveil": 450, "coucher": 300}, {"actif": False}, {"reveil": "x", "coucher": [], "sieste": {"de": "13:00", "duree": 1000}}, None]
    phrases = ["  « Salut les loulous ! »  ", "https://x.fr", "a" * 80, "\u0000​ok là", "???", "", 7, "J’ai un creux de baleine !", "Ça roule\tma poule"]
    teach = ["Dis bonjour comme ça : Salut les loulous !", "quand tu es content dis : Youpi tralala !", "pour dire bonne nuit dis : Fais de beaux rêves",
             "Quand tu as faim, dis : J’ai faim !", "dis bonjour à mamie", "pour dire merci dis :", "quand tu pars dis : Bye bye", "quand je gagne, dis : Bravo champion"]
    cars = [{"calme": {"de": 22, "a": 7}}, {"calme": {"de": 23, "a": 6}}, {"calme": {"de": 20, "a": 20}}, {"calme": {"de": 5, "a": 7}}, {}, None, {"calme": {"de": "x"}}]
    py = {"etat": [[HB.etat_at(HB.clean_horaires(s), at(t))[0] for t in times] for s in scheds],
          "clean": [HB.clean_horaires(s) for s in scheds], "problem": [bool(HB.problem(HB.clean_horaires(s) if s else HB.DEFAULT_H)) for s in scheds],
          "phrase": [HB.clean_phrase(p) for p in phrases], "teach": [list(HB.teach_parse(t)) if HB.teach_parse(t) else None for t in teach],
          "migrate": [HB.migrate(c) for c in cars], "hm": [HB.hm(m) for m in (0, 450, 1260, 1145, 1439)]}
    js = r"""
const fs = require('fs'), vm = require('vm');
const sb = { window: {}, console, Date, Math, JSON, Object, Array, String, Number, Set, Map, RegExp };
sb.window = sb; vm.createContext(sb);
vm.runInContext(fs.readFileSync(process.argv[1], 'utf8'), sb);
const H = sb.PixelHabitudes, inp = JSON.parse(process.argv[2]);
const at = s => { const [d, t] = s.split(' '), [y, m, dd] = d.split('-').map(Number), [h, mn] = t.split(':').map(Number); return new Date(y, m - 1, dd, h, mn); };
console.log(JSON.stringify({ etat: inp.scheds.map(s => inp.times.map(t => H.etatAt(H.cleanHoraires(s), at(t))[0])), clean: inp.scheds.map(s => H.cleanHoraires(s)),
  problem: inp.scheds.map(s => !!H.problem(s ? H.cleanHoraires(s) : H.DEFAULT_H)), phrase: inp.phrases.map(p => H.cleanPhrase(p)),
  teach: inp.teach.map(t => H.teachParse(t)), migrate: inp.cars.map(c => H.migrate(c)), hm: [0, 450, 1260, 1145, 1439].map(H.hm) }));
"""
    out = subprocess.run(["node", "-e", js, str(APP / "web" / "habitudes.js"), json.dumps({"times": times, "scheds": scheds, "phrases": phrases, "teach": teach, "cars": cars})],
                         capture_output=True, text=True, timeout=60)
    try:
        got = json.loads(out.stdout)
    except ValueError:
        check("web/habitudes.js runs in node", False, out.stderr[-400:])
        return
    for k in py:
        check(f"web/habitudes.js: the same {k} as pixel/habitudes.py", got.get(k) == py[k], f"{got.get(k)} != {py[k]}")


def main():
    schedule()
    dst()
    with tempfile.TemporaryDirectory() as a:
        tmp = Path(a)
        for name, fn in (("routine", routine), ("actions", actions), ("games", games), ("typed", typed), ("claude", claude), ("robust", robust), ("others", others),
                         ("files", files)):
            d = tmp / name
            d.mkdir()
            r = fn(d)
            if asyncio.iscoroutine(r):
                asyncio.run(r)
    parity()
    print(f"\n{len(fails)} failure(s)")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
