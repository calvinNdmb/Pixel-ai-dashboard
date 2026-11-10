"""Son look, ses habitudes, ses souvenirs et ses amis ensemble, the server's side: one hub set up as server.py does, on fixed
clocks, with no server and nothing sent (no event loop for the friends: their messages are never posted; where one runs,
the relay is a closed local address).

    python3 tests/test_ensemble.py

- a game and a friend's visit exclude each other: no game while a friend is here, knocking or while he is away (« Pas
  maintenant : Bip est là ! »); no visit comes (« occupe ») and he does not set off while a game is on;
- souvenirs wait for a game and a visit, and come back after: today's mood question (due, pose), the album (album.montre);
- his night is one rule (pixel/habitudes.py endormi(), sommeil()): by his schedule, from his bedtime routine to his
  wake-up and his nap; with it off or paused (the demo), his old quiet hours. The same for the friends (_dort, _refus,
  visiter), souvenirs (asleep, due: his schedule, not caractère's frozen quiet hours), the album (photos refused) and his
  pyjama (look: his night and bedtime, not his nap); « tard » (a nap side by side) follows his bedtime;
- falling asleep during a visit ends it: a friend here says goodbye, a friend knocking hears « il dort », he comes home;
- the host's visit photo goes with that visit's memory, never with an older visit's; the visitor's too;
- web/habitudes.js, web/look.js and web/souvenirs.js say the same night (and the same « busy »), run in node.
The screens (who comes first over his face, a peek during a game, the mood question under a game and a visit, a joke and a
photo during a visit, the food tray at night, the visitor's look, Pixel Lab's mirror) are tested in Chromium by
tests/test_ensemble.js.
"""
import asyncio
import datetime as dt
import json
import random
import secrets
import subprocess
import sys
import tempfile
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP))
import server  # noqa: E402
from pixel import album, amis, caractere, exos, look, nourrir, poche, relais, souvenirs  # noqa: E402
from pixel import habitudes as HB  # noqa: E402
from pixel.state import Hub  # noqa: E402

RELAY = "http://127.0.0.1:8429"                 # nothing listens there (this suite's ports are 8400-8439): nothing leaves
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


def make(tmp, s="2026-11-09 15:00", demo=False):
    """The hub as server.py serve() builds it, every feature on the same fake clock."""
    tmp.mkdir(parents=True, exist_ok=True)
    hub = Hub({"data_dir": str(tmp)}, demo=demo)
    server.core_actions(hub, tmp)
    poche.setup(hub)
    caractere.setup(hub, tmp)
    clock = Clock(s)
    H = HB.setup(hub, tmp, now=clock, rng=random.Random(1), run=False)
    HB.now_ms = lambda: clock.t * 1000              # the games and the events on the same fake clock
    nourrir.setup(hub, tmp)
    exos.setup(hub, tmp)
    S = souvenirs.setup(hub, tmp, clock=clock)
    A = amis.setup(hub, tmp, {"relay": RELAY})
    A.now = clock
    L = look.setup(hub, tmp, now=lambda: dt.datetime.fromtimestamp(clock.t))
    AL = album.setup(hub, None, tmp, "code", clock=clock)
    return hub, H, S, A, L, AL, clock


def friend(A, nom="Bip"):
    """A friend as amis.json keeps him (his card and the friendship's key): no pairing needed for these rules."""
    rec = A._rec({"id": secrets.token_hex(8), "nom": nom, "caractere": "farceur", "theme": "neon", "look": {"yeux": "chat"},
                  "cle": relais.b64u(secrets.token_bytes(32)), "depuis": int(A.now() * 1000)})
    A.amis[rec["id"]] = rec
    A._topics()
    return rec


def at_time(H, clock, s):
    clock.set(s)
    H.publish()


def host(A, f):
    """A friend's visit here (pixel/amis.py _accueillir: his « oui »)."""
    A._accueillir(f, secrets.token_hex(6))
    A.publish()
    return A.visite


def away(A, f, chez=True):
    """He goes to his friend's (visiter), and his friend says yes (visite-ok)."""
    A.cooldown, A.last_out = 0, {}
    A.visiter(f["id"])
    v = A.visite
    if v and chez:
        A._in_visite_ok(f, {"vid": v["vid"], "dur": 180})
    A.publish()
    return A.visite


def toast(hub):
    return (hub.s.get("toast") or {}).get("msg", "")


# ---------- a game and a visit ----------
def game_and_visit(tmp):
    hub, H, S, A, L, AL, clock = make(tmp / "jeu")
    f = friend(A)
    check("the friend is there, his Pixel awake at 15:00 by his schedule (not asleep, nothing on)", A._refus(f) is None and not A._dort())
    check("a game starts", H.start("cache", "test") == "" and H.partie is not None)
    H.publish()
    check("…a friend's visit request is refused while it is on (« occupe »: « Bip est occupé. On ira plus tard ! »)", A._refus(f) == "occupe")
    r = A.visiter(f["id"])
    check("…and he does not set off to his friend's (« On finit la partie, et j'irai voir Bip ! »)", isinstance(r, str) and "partie" in r and A.visite is None
          and "partie" in toast(hub), str(r))
    H.stop_game()
    H.publish()
    check("the game over: his friend may come again", A._refus(f) is None)
    host(A, f)
    why = H.start("pfc", "test")
    check("a friend here: no game, in his own voice (« Pas maintenant : Bip est là ! »)", why == "Pas maintenant : Bip est là !" and H.partie is None, why)
    asyncio.run(hub.dispatch("habitudes.jouer", {"jeu": "simon", "par": "telephone"}))
    check("…the same through habitudes.jouer (the phone, a command, Claude): a toast says why", "Bip est là" in toast(hub) and H.partie is None, toast(hub))
    A.visite = None
    A.demander = True
    A._in_visite_demande(f, {"vid": secrets.token_hex(6)})
    A.publish()
    check("…a friend knocking (« Me demander avant »): no game either", A.visite and A.visite["etat"] == "question" and "Bip est là" in H.start("cache") and H.partie is None)
    A.visite, A.demander = None, False
    away(A, f)
    why = H.start("etoiles")
    check("he is away at his friend's: no game here (« Je suis chez Bip : on jouera à mon retour ! »)", why == "Je suis chez Bip : on jouera à mon retour !" and H.partie is None, why)
    A.visite = None
    A.publish()
    check("…home again: a game", H.start("cache") == "" and H.partie is not None)


# ---------- souvenirs wait for a game and a visit ----------
def souvenirs_wait(tmp):
    hub, H, S, A, L, AL, clock = make(tmp / "souv", "2026-11-09 10:00")
    f = friend(A)
    at_time(H, clock, "2026-11-10 17:30")                # the day after you met, from his time (17:00)
    check("today's mood question is due (his time, the day after you met, he is awake, nothing on)", S.due(), json.dumps(S.h["asks"]))
    H.start("etoiles")
    H.publish()
    check("a game on: his question waits (due false, humeur.pose refused)", not S.due() and not S.pose() and S.question is None)
    H.stop_game()
    H.publish()
    check("…the game over: it comes back", S.due())
    host(A, f)
    check("a friend here: it waits too", not S.due() and not S.pose())
    A.visite = None
    away(A, f)
    check("…and while he is away at his friend's", not S.due())
    A.visite = None
    A.publish()
    check("…the visit over: due again, and he asks", S.due() and S.pose() and S.question is not None)
    S.plustard()
    AL.photos.append({"id": "Ph0toAbc", "f": "A" * 16 + ".jpg", "t": clock.t * 1000, "raison": "photo", "fav": False, "w": 800, "h": 480, "size": 1000})
    H.start("cache")
    H.publish()
    check("« montre l'album » during a game: it waits, he says why (« Finis d'abord ta partie… »)", not AL.montre() and "partie" in toast(hub), toast(hub))
    H.stop_game()
    H.publish()
    host(A, f)
    check("…during a friend's visit (« Pas maintenant : Bip est là ! Je te montre mon album après. »)", not AL.montre() and "Bip est là" in toast(hub), toast(hub))
    A.visite = None
    away(A, f)
    check("…while he is away (« Je suis chez Bip… »)", not AL.montre() and "chez Bip" in toast(hub), toast(hub))
    A.visite = None
    A.publish()
    ev0 = AL.ev
    check("…all over: his album shows", AL.montre() and AL.ev is not ev0 and AL.ev["kind"] == "montre")
    host(A, f)
    check("« prends une photo » during a friend's visit: yes, both of them pose (demande)", AL.photo() and AL.demande is not None)
    AL.demande = None
    A.visite = None
    away(A, f)
    check("…while he is away: no (« je suis chez Bip : on la prendra à mon retour ! »)", not AL.photo() and AL.demande is None and "chez Bip" in toast(hub), toast(hub))


# ---------- his night: one rule ----------
def night(tmp):
    hub, H, S, A, L, AL, clock = make(tmp / "nuit")
    f = friend(A)

    def state(s, calme=None):
        hub.s["caractere"]["calme"] = calme or {"de": 23, "a": 6}
        at_time(H, clock, s)
        L.refresh()
        return {"etat": hub.s["habitudes"]["etat"], "amis": A._dort(), "refus": A._refus(f), "souv": souvenirs.asleep(hub, dt.datetime.fromtimestamp(clock.t).hour),
                "photo": AL.refus(), "pyjama": hub.s["look"]["porte"]["nuit"]}
    x = state("2026-11-09 20:50")
    check("his bedtime routine (coucher, 20 h 45 - 21 h): asleep for every feature: no visit (« dort »), no photo; his pyjama on",
          x["etat"] == "coucher" and x["amis"] and x["refus"] == "dort" and x["souv"] and "je dors" in x["photo"] and x["pyjama"], json.dumps(x))
    x = state("2026-11-10 02:00")
    check("…his night: the same", x["etat"] == "nuit" and x["amis"] and x["refus"] == "dort" and x["souv"] and x["photo"] and x["pyjama"], json.dumps(x))
    r = A.visiter(f["id"])
    check("…and he does not go out at night (« Chut, Pixel dort… »)", isinstance(r, str) and "dort" in r and A.visite is None, str(r))
    H.set_horaires({"sieste": {"de": "13:30", "duree": 60}})
    x = state("2026-11-10 13:45")
    check("his nap: asleep for his friends, souvenirs and the album, but no pyjama (he naps in his clothes)",
          x["etat"] == "sieste" and x["amis"] and x["refus"] == "dort" and x["souv"] and x["photo"] and not x["pyjama"], json.dumps(x))
    H.set_horaires({"sieste": None})
    x = state("2026-11-10 15:00", {"de": 14, "a": 16})
    check("his schedule on: awake at 15:00, whatever caractère's old quiet hours say (14 h - 16 h, frozen since his habits took them)",
          x["etat"] == "eveille" and not x["amis"] and x["refus"] is None and not x["souv"] and x["photo"] == "" and not x["pyjama"], json.dumps(x))
    at_time(H, clock, "2026-11-10 17:30")
    hub.s["caractere"]["calme"] = {"de": 17, "a": 8}
    check("…souvenirs follow his schedule too: his question at 17:30 (caractère's quiet hours 17 h - 8 h would have said no)", S.due())
    H.set_horaires({"actif": False})
    H.publish()
    check("…his schedule switched off: the old quiet hours again (17 h - 8 h: no question)", not S.due())
    x = state("2026-11-11 03:00")
    check("his schedule off: his quiet hours (23 h - 6 h) are his night: no visit at 3 am, his pyjama on, no photo",
          x["amis"] and x["refus"] == "dort" and x["souv"] and x["photo"] and x["pyjama"], json.dumps(x))
    x = state("2026-11-11 15:00")
    check("…in the day: awake", not x["amis"] and x["refus"] is None and not x["pyjama"] and x["photo"] == "", json.dumps(x))
    H.set_horaires({"actif": True})
    # the demo's paused clock: his schedule says nothing, the quiet hours speak (they were « never asleep » before)
    hub2, H2, S2, A2, L2, AL2, clock2 = make(tmp / "demo", "2026-11-11 03:00", demo=True)
    f2 = friend(A2)
    H2.publish()
    L2.refresh()
    check("the demo (his clock paused): at 3 am his quiet hours: no visit (« dort »), his pyjama on", H2.paused() and A2._refus(f2) == "dort" and A2._dort()
          and hub2.s["look"]["porte"]["nuit"] is True, json.dumps(hub2.s["habitudes"]["horloge"]))
    clock2.set("2026-11-11 15:00")
    H2.publish()
    L2.refresh()
    check("…at 15:00: awake, his pyjama off", A2._refus(f2) is None and not A2._dort() and hub2.s["look"]["porte"]["nuit"] is False)
    # late: a nap side by side, when his bedtime is near
    at_time(H, clock, "2026-11-12 20:10")
    t1 = A._tard()
    at_time(H, clock, "2026-11-12 15:00")
    t2 = A._tard()
    H.set_horaires({"coucher": "23:00"})
    at_time(H, clock, "2026-11-12 20:30")
    t3 = A._tard()
    H.set_horaires({"actif": False})
    H.publish()
    t4 = A._tard()
    clock.set("2026-11-12 15:00")
    t5 = A._tard()
    H.set_horaires({"actif": True, "coucher": "21:00"})
    check("« tard » (a nap side by side at the end of a visit): his bedtime routine within the hour, by his schedule; 20 h - 5 h without it",
          t1 and not t2 and not t3 and t4 and not t5, str([t1, t2, t3, t4, t5]))


# ---------- falling asleep during a visit ----------
def bedtime(tmp):
    hub, H, S, A, L, AL, clock = make(tmp / "dodo", "2026-11-09 20:44")
    f = friend(A)
    H.publish()
    v = host(A, f)
    check("20:44: a friend comes (he is awake; his bedtime routine starts at 20:45)", v and v["etat"] == "chez" and not A._dort())
    clock.t += 70
    H.tick()
    A.tick()
    v = A.visite or {}
    e = clock.t * 1000 - v.get("t0", 0)
    last = (v.get("programme") or [{}])[-1]
    check("20:45, his bedtime routine: his friend says goodbye (ami-aurevoir now, after his own « Bientôt l'heure du dodo », the visit ends then)",
          last.get("id") == "ami-aurevoir" and 6000 <= last.get("at", 0) - e <= 7000 and v.get("fin", 0) - clock.t * 1000 < amis.DUREES["ami-aurevoir"] + 8000
          and v.get("par") == "fin", json.dumps(v.get("programme"))[-200:])
    n = len(v.get("programme") or [])
    A.tick()
    check("…once (the next ticks change nothing)", len((A.visite or {}).get("programme") or []) == n)
    clock.t += 20
    A.tick()
    check("…then the visit is over, in his journal", A.visite is None and A.journal[0]["quoi"] == "accueil")
    clock.set("2026-11-10 20:44")
    H.publish()
    A.demander = True
    A._in_visite_demande(f, {"vid": secrets.token_hex(6)})
    check("20:44: a friend knocks (« Me demander avant »)", (A.visite or {}).get("etat") == "question")
    clock.t += 70
    H.tick()
    A.tick()
    check("…his bedtime routine starts: « il dort », the question goes", A.visite is None and A.journal[0]["quoi"] == "refuse"
          and A.journal[0]["refus"] == "dort")
    A.demander = False
    clock.set("2026-11-11 20:44")
    H.publish()
    v = away(A, f)
    check("20:44: he goes to his friend's", v and v["sens"] == "sortie" and v["etat"] == "chez")
    clock.t += 70
    H.tick()
    A.tick()
    back = [x for x in A.evs if x["kind"] == "retour"]
    check("…his bedtime: he comes home (retour, par dodo: « Me revoilà ! C'est l'heure du dodo. »)", A.visite is None and back and back[-1].get("par") == "dodo",
          json.dumps(back[-1:]))


# ---------- the visit's photo and its memory ----------
def photos(tmp):
    hub, H, S, A, L, AL, clock = make(tmp / "photo", "2026-11-09 15:00")
    f = friend(A)
    H.publish()
    old = S.ajoute(type="ami", texte="Zia est venu jouer chez Pixel.")
    clock.t += 300
    host(A, f)
    S.lier_photo("ami", "Phot0ami")                    # « ami-photo »: his screen's photo, during the visit
    check("a friend here: the photo of « ami-photo » does not land on an older visit's memory", old and old["photo"] is None)
    clock.t += 200

    async def end():
        A._fin_accueil()                                 # the visit ends: its memory (souvenirs.ajoute, in the background)
        await asyncio.sleep(0.3)
        await A.relais.close()
    asyncio.run(end())
    new = S.d["timeline"][0]
    check("…the visit over, its memory has that photo (« Bip est venu jouer chez Pixel… »)", new["type"] == "ami" and new["photo"] == "Phot0ami"
          and "Bip est venu jouer" in new["texte"] and old["photo"] is None, json.dumps(new, ensure_ascii=False))
    clock.t += 60
    A.cooldown = 0

    def visit(g):
        v = away(A, g)

        async def home():
            A._in_visite_fin(g, {"vid": v["vid"], "fait": ["ami-danse"], "par": "fin"})
            await asyncio.sleep(0.3)
            await A.relais.close()
        asyncio.run(home())
    n = len(S.d["timeline"])
    visit(f)                                           # to Bip's, the same day: one visit memory a day with each friend (amis.py une_fois)
    check("the same day, the same friend: his visit goes to the journal, not again to his memories", len(S.d["timeline"]) == n,
          json.dumps(S.d["timeline"][0], ensure_ascii=False))
    clock.t += 60
    lou = friend(A, "Lou")
    visit(lou)
    mine = S.d["timeline"][0]
    S.lier_photo("ami", "Phot1ami")                    # his return: the photo as he tells it (web/amis.js), after his memory
    check("the visitor's side: his memory first, then his photo (« Pixel est allé jouer chez Lou : ils ont dansé. »)", mine["type"] == "ami" and mine["photo"] == "Phot1ami"
          and "chez Lou" in mine["texte"] and "ils ont dansé" in mine["texte"], json.dumps(mine, ensure_ascii=False))


# ---------- the same night in JavaScript ----------
def parity():
    ON = {"horaires": {"actif": True}, "horloge": {"pause": False, "decalage": 0}}
    cases = [{"habitudes": {**ON, "etat": e}} for e in ("eveille", "reveil", "sieste", "coucher", "nuit")]
    cases += [{"habitudes": {"horaires": {"actif": False}, "horloge": {"pause": False}, "etat": "nuit"}},
              {"habitudes": {"horaires": {"actif": True}, "horloge": {"pause": True}, "etat": "eveille", "dort": False, "nuit": False}},
              {"habitudes": {"dort": True}}, {"habitudes": {"dort": False, "etat": "coucher"}}, {"habitudes": {"etat": "sieste"}}, {"habitudes": {"nuit": True}},
              {"habitudes": {"dort": "oui"}}, {"habitudes": "x"}, {"habitudes": None}, {}, {"caractere": {"calme": {"de": 14, "a": 16}}},
              {"caractere": {"calme": {"de": 5, "a": 5}}}, {"habitudes": {**ON, "etat": "eveille"}, "caractere": {"calme": {"de": 0, "a": 23}}},
              {"habitudes": {"horaires": "x", "etat": "nuit"}}]
    busy = [{}, {"habitudes": {"partie": {"id": 1}}}, {"amis": {"visite": {"sens": "accueil", "nom": "Bip"}}}, {"amis": {"visite": {"sens": "sortie", "nom": "Bip"}}},
            {"amis": {"visite": {"sens": "accueil", "etat": "question"}}}, {"amis": {"visite": None}}, {"amis": "x"}, {"habitudes": {"partie": None}}]
    hours = [3, 15, 22]

    class FakeHub:
        def __init__(self, s):
            self.s = s
    py = {"endormi": [[HB.endormi(s, h) for h in hours] for s in cases], "sommeil": [HB.sommeil(s.get("habitudes")) for s in cases],
          "pyjama": [HB.sommeil(s.get("habitudes"), sieste=False) for s in cases], "look": [look.asleep(s.get("habitudes")) for s in cases],
          "souvenirs": [[souvenirs.asleep(FakeHub(s), h) for h in hours] for s in cases],
          "occupe": [list(souvenirs.occupe(FakeHub(s))) if souvenirs.occupe(FakeHub(s)) else None for s in busy]}
    js = r"""
const fs = require('fs'), vm = require('vm');
const sb = { console, Date, Math, JSON, Object, Array, String, Number, Set, Map, RegExp, isNaN, isFinite, parseInt, parseFloat, URLSearchParams,
  setInterval: () => 0, setTimeout: () => 0, clearTimeout: () => {}, queueMicrotask: () => {} };
sb.window = sb; vm.createContext(sb);
for (const f of process.argv.slice(1, 4)) vm.runInContext(fs.readFileSync(f, 'utf8'), sb, { filename: f });
const H = sb.PixelHabitudes, K = sb.PixelLook, R = sb.PixelSouvenirs.rules, inp = JSON.parse(process.argv[4]);
console.log(JSON.stringify({ endormi: inp.cases.map(s => inp.hours.map(h => H.endormi(s, h))), sommeil: inp.cases.map(s => H.sommeil(s.habitudes)),
  pyjama: inp.cases.map(s => H.sommeil(s.habitudes, false)), look: inp.cases.map(s => K.context(s, new Date(2026, 10, 9, 14)).dort),
  souvenirs: inp.cases.map(s => inp.hours.map(h => R.asleep(s, h))), occupe: inp.busy.map(s => R.occupe(s)) }));
"""
    files = [str(APP / "web" / f) for f in ("habitudes.js", "look.js", "souvenirs.js")]
    out = subprocess.run(["node", "-e", js, *files, json.dumps({"cases": cases, "busy": busy, "hours": hours})], capture_output=True, text=True, timeout=60)
    try:
        got = json.loads(out.stdout)
    except ValueError:
        check("web/habitudes.js, web/look.js and web/souvenirs.js run in node", False, out.stderr[-600:])
        return
    for k, label in (("endormi", "his night (endormi: his schedule, else his quiet hours)"), ("sommeil", "his schedule's word (sommeil)"),
                     ("pyjama", "the pyjama's (sommeil, not his nap)"), ("look", "look's night (web/look.js asleep)"),
                     ("souvenirs", "souvenirs' (web/souvenirs.js asleep)"), ("occupe", "a game or a visit holding his screen (occupe)")):
        check(f"the same in JavaScript as in Python: {label}", got.get(k) == py[k], f"{got.get(k)} != {py[k]}")
    check("…and they say it right: asleep at bedtime, in his night and his nap; his pyjama not for a nap; the demo's paused clock says nothing",
          py["sommeil"][:5] == [False, False, True, True, True] and py["pyjama"][:5] == [False, False, False, True, True] and py["sommeil"][5] is None
          and py["sommeil"][6] is None and py["endormi"][6] == [True, False, False] and py["endormi"][16] == [False, False, False], json.dumps(py["sommeil"]))


def static():
    """Pixel sans Pi's help (web/local.js) names the new commands; the screens' order is written once (web/screens.js ORDER)."""
    src = (APP / "web" / "local.js").read_text(encoding="utf-8")
    line = next((x for x in src.splitlines() if x.startswith("const HELP")), "")
    check("Pixel sans Pi's « aide » names his habits, his look and his souvenirs (« on joue ? », « mets ton chapeau », « prends une photo »…)",
          all(w in line for w in ("on joue ?", "raconte une blague", "mets ton chapeau", "prends une photo", "montre l'album", "je suis content")), line[:200])
    sc = (APP / "web" / "screens.js").read_text(encoding="utf-8")
    i = sc.find("const ORDER = [")
    order = [x.split("'")[1] for x in sc[i:sc.find("];", i)].splitlines()[1:] if "'" in x]
    check("web/screens.js: one order over his face, highest first: exercise, game, friends, souvenirs, his offers and his night, the exercise's offer",
          order == ["exo", "jeu", "amis", "souvenirs", "habitudes", "exo-offre"], str(order))
    names = {f: [x.split("'")[0] for x in (APP / "web" / f).read_text(encoding="utf-8").split("name: '")[1:]] for f in ("exos.js", "habitudes.js", "amis.js", "souvenirs.js")}
    check("…each add-on says its name (web/exos.js, habitudes.js, amis.js, souvenirs.js)", sorted(sum(names.values(), [])) == sorted(order), json.dumps(names))


def main():
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        game_and_visit(tmp)
        souvenirs_wait(tmp)
        night(tmp)
        bedtime(tmp)
        photos(tmp)
    parity()
    static()


if __name__ == "__main__":
    main()
    print("\n%d failure(s)" % len(fails))
    sys.exit(1 if fails else 0)
