"""Les amis de Pixel, the server's side (pixel/amis.py, pixel/relais.py), with a fake ntfy relay (tests/fake_ntfy.py): never
the real ntfy.sh.

    python3 tests/test_amis.py                     # the fake relay on port 8460 (AMIS_PY_PORT=… for another)

- the codes: three words of a list of 512 and a number (40 bits), however they are typed; a typo gets a suggestion;
- the box: AES-GCM, a message opens only with its key and on its topic; tampered, truncated or foreign: refused; X25519;
- nothing goes out while there is no friend and no code; a relay that does not answer, cuts or refuses is survived;
- two hubs become friends with a code (scrypt, X25519), exchange their identity cards, and the relay sees no plain text;
- a code works once and for 24 h; a third Pixel cannot use it again; a full Pixel (20 friends) says so;
- tampering, replays (also after a restart), old and future messages, a message reflected back, another recipient: refused;
- rate limits: incoming (before opening), outgoing (gaps, an hour, a day);
- visits both ways (the programme, what they did, the memories), refusals (asleep: habitudes.dort and the quiet hours,
  casting, an exercise), « me demander avant » (yes, no, no answer), calling him back, a friend's Pi that does not answer;
- coucous and stickers, removing a friend (both sides forget), the parent switch, the file (0600, a broken one put aside),
  the typed commands and Claude's tool.
The screens (the visitor on the host's kiosk, the panel, the lab's demo friend) are tested in a browser by tests/test_amis.js.
"""
import asyncio
import base64
import json
import math
import os
import random
import secrets
import stat
import sys
import tempfile
import time
from pathlib import Path

import aiohttp

APP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP))
sys.path.insert(0, str(APP / "tests"))
import server  # noqa: E402
from pixel import amis, caractere, commands, exos, nourrir, poche, relais  # noqa: E402
from pixel.claude import TOOLS, check as claude_check  # noqa: E402
from pixel.state import Hub  # noqa: E402
from fake_ntfy import FakeNtfy  # noqa: E402

PORT = int(os.environ.get("AMIS_PY_PORT") or 8460)
RELAY = f"http://127.0.0.1:{PORT}"
fails = []


def check(name, cond, info=""):
    print(("OK   " if cond else "FAIL ") + name + (f"  [{info}]" if info and not cond else ""))
    if not cond:
        fails.append(name)


async def until(fn, s=6.0, step=0.05):
    end = time.time() + s
    v = fn()
    while not v and time.time() < end:
        await asyncio.sleep(step)
        v = fn()
    return v


# ---------- pure parts ----------
def codes():
    words = list(amis.MOT)
    check("512 words, unique once written without accents, 3 to 9 letters, plain a-z", len(amis.MOTS) == 512 and len(words) == 512
          and all(w.isascii() and w.isalpha() and 3 <= len(w) <= 9 for w in words), str(len(words)))
    check("no word of the list is a filler word the reader skips", not set(words) & amis.STOP)
    bits = math.log2(len(words) ** 3 * 9000)
    check(f"a code holds {bits:.2f} bits (40 or more)", bits >= 40)
    made = [amis.nouveau_code() for _ in range(300)]
    check("300 new codes: three words and a number from 1000 to 9999, each read back as itself", all(amis.lire_code(c) == (c, None) for c in made)
          and all(1000 <= int(c.split("-")[3]) <= 9999 for c in made) and len(set(made)) == 300)
    for typed in ("Lapin soleil TARTE 4271", "lapin-soleil-tarte-4271", "  lapin, soleil. tarte 42 71 ", "Code d'ami Pixel : lapin-soleil-tarte-4271",
                  "LAPIN · SOLEIL · TARTE · 4271"):
        check(f"« {typed} » reads as lapin-soleil-tarte-4271", amis.lire_code(typed) == ("lapin-soleil-tarte-4271", None), str(amis.lire_code(typed)))
    check("accents or not: « éléphant crêpe forêt 1234 » = « elephant crepe foret 1234 »",
          amis.lire_code("éléphant crêpe forêt 1234")[0] == amis.lire_code("elephant crepe foret 1234")[0] == "elephant-crepe-foret-1234")
    c, why = amis.lire_code("lapon soleil tarte 4271")
    check("a typo: not a code, and the closest word is suggested (« lapon » -> « lapin »)", c is None and why["idees"].get("lapon") == "lapin"
          and "lapin" in amis.pourquoi_code(why), str(why))
    for bad, key in (("lapin soleil 4271", "mots"), ("lapin soleil tarte pomme 4271", "mots"), ("lapin soleil tarte 427", "nombre"),
                     ("lapin soleil tarte 42711", "nombre"), ("lapin soleil tarte 0999", "nombre"), ("lapin soleil tarte", "nombre")):
        c, why = amis.lire_code(bad)
        check(f"« {bad} » is not a code ({key})", c is None and key in why, str(why))
    check("the words as written for the screens: « éléphant · crêpe · forêt · 1234 »", amis.code_texte("elephant-crepe-foret-1234") == "éléphant · crêpe · forêt · 1234")
    # identity cards
    car = amis.clean_card({"id": "0123456789abcdef", "nom": "Bip<script>!!" + "x" * 30, "caractere": "farceur", "theme": "neon", "look": {"yeux": "ronds", "couleur": "#ff00aa"}})
    check("a card: his name cleaned (letters only) and capped at 16, preset, theme, look kept", car and car["nom"] == "Bipscriptxxxxxxx" and len(car["nom"]) <= 16
          and car["caractere"] == "farceur" and car["theme"] == "neon" and car["look"] == {"yeux": "ronds", "couleur": "#ff00aa"}, json.dumps(car))
    bad = amis.clean_card({"id": "0123456789abcdef", "nom": "", "caractere": "pirate", "theme": "matrix", "look": {"x": "y" * 100}})
    check("…an unknown preset or theme becomes the default, an empty name « Pixel », a look with a long string goes", bad["nom"] == "Pixel"
          and bad["caractere"] == "pixel" and bad["theme"] == "retro" and bad["look"] is None, json.dumps(bad))
    deep = {"a": {"b": {"c": {"d": {"e": {"f": 1}}}}}}
    big = {f"k{i}": "x" * 60 for i in range(20)}
    check("…a look too deep, too big (more than 1 KB), with a non-finite number or a strange key: dropped",
          all(amis.clean_look(v) is None for v in (deep, big, {"n": float("inf")}, {"bad key!": 1}, "texte", 42)) and amis.clean_look({"chapeau": True, "ton": [1, 2]}) == {"chapeau": True, "ton": [1, 2]})
    check("…no id, or a bad one: no card", amis.clean_card({"nom": "Bip"}) is None and amis.clean_card({"id": "XYZ", "nom": "Bip"}) is None)
    # the programme of a visit
    for late in (False, True):
        prog, total = amis.programme(180000, late, random.Random(3))
        ids = [x["id"] for x in prog]
        at = [x["at"] for x in prog]
        check(f"a 3-minute visit{' (late)' if late else ''}: he arrives, plays, the photo, {'a nap side by side, ' if late else ''}goodbye; about 3 min",
              ids[0] == "ami-arrive" and ids[-1] == "ami-aurevoir" and "ami-photo" in ids and ("ami-dodo" in ids) == late and len(ids) == len(set(ids))
              and at == sorted(at) and 150000 <= total <= 180000 and len([i for i in ids if i in amis.ACTIVITES]) >= 4, f"{ids} {total}")
    prog, total = amis.programme(20000, False, random.Random(1))
    check("a short visit (tests): the same scenes, cut short to its length", total == 20000 and prog[0]["id"] == "ami-arrive" and prog[-1]["id"] == "ami-aurevoir"
          and prog[-1]["at"] < 20000, json.dumps(prog))
    check("what they did, told: « on a dansé, et on a fait la course », « ils ont … » for the memories",
          amis.histoire(["ami-tape", "ami-course", "ami-danse"], "Bip") == "on a dansé, et on a fait la course" and amis.histoire(["ami-dodo"], "Bip", True) == "ils se sont endormis côte à côte")
    check("the 12 stickers and the 9 activities come from web/scenes/amis.js, every visit scene has its duration",
          len(amis.STICKERS) == 12 and len(amis.FAIT) == 9 and all(i in amis.DUREES for i in list(amis.ACTIVITES) + ["ami-arrive", "ami-photo", "ami-dodo", "ami-aurevoir"]))


def box():
    k, k2, t, t2 = os.urandom(32), os.urandom(32), relais.topic(b"x" * 32, "a"), relais.topic(b"x" * 32, "b")
    check("topics: 26 characters a-z 2-7, different for each label, the same for the same key", relais.TOPIC.match(t) and t != t2 and t == relais.topic(b"x" * 32, "a"))
    body = relais.seal(k, t, {"k": "coucou", "nom": "Bip"})
    check("sealed: « PXA1. » and base64url, no plain text", body.startswith("PXA1.") and "Bip" not in body and "coucou" not in body)
    check("…opens with its key on its topic", relais.open_(k, t, body) == {"k": "coucou", "nom": "Bip"})
    check("…not with another key, nor on another topic (the topic is part of what is authenticated)", relais.open_(k2, t, body) is None and relais.open_(k, t2, body) is None)
    raw = bytearray(relais.unb64u(body[5:]))
    for i in (0, 12, len(raw) // 2, len(raw) - 1):                      # the nonce, the ciphertext, the tag
        r = bytearray(raw)
        r[i] ^= 1
        if relais.open_(k, t, "PXA1." + relais.b64u(bytes(r))) is not None:
            check(f"a flipped bit at byte {i} is refused", False)
            break
    else:
        check("one flipped bit anywhere (nonce, ciphertext, tag): refused", True)
    check("truncated, not ours, not base64, too long: refused", all(relais.open_(k, t, b) is None for b in (body[:-6], "hello", "PXA1.$$$", "PXA1." + "A" * 5000)))
    try:
        relais.seal(k, t, {"x": "y" * 3000})
        check("a message too long cannot be sealed", False)
    except ValueError:
        check("a message too long cannot be sealed", True)
    a, b = relais.Ephemeral(), relais.Ephemeral()
    check("X25519: both sides get the same secret; a bad public key gives none", a.shared(b.pub) == b.shared(a.pub) and a.shared("AAAA") is None
          and a.shared(relais.b64u(bytes(32))) is None)
    check("the relay's address: http(s) only, no password, no query", relais.clean_url("https://ntfy.sh/") == "https://ntfy.sh" and relais.clean_url("ftp://x") is None
          and relais.clean_url("https://u:p@x.org") is None and relais.clean_url("https://x.org/?a=1") is None)


# ---------- two hubs and a relay ----------
def make(tmp, nom, **cfg):
    hub = Hub({"data_dir": str(tmp)}, demo=True)
    server.core_actions(hub, tmp)
    poche.setup(hub)
    caractere.setup(hub, tmp)
    nourrir.setup(hub, tmp)
    exos.setup(hub, tmp)
    hub.s["caractere"]["nom"] = nom
    hub.s["caractere"]["calme"] = {"de": 23, "a": 23}                  # no quiet hours: the tests run at any time
    A = amis.setup(hub, tmp, {"relay": RELAY, "silence": 5, **cfg})
    seen = []
    d0 = hub.dispatch

    async def dispatch(name, args=None):
        seen.append(name)
        if name == "chat.ask":
            return None
        return await d0(name, args)
    hub.dispatch = dispatch
    hub.seen = seen
    return hub, A


async def close(hub):
    A = hub.amis
    await A.relais.close()
    for t in list(A.tasks) + [getattr(hub.nourrir, "task", None), getattr(hub, "exos_task", None)]:
        if t:
            t.cancel()
    await asyncio.sleep(0.05)


def ev(A, kind):
    return [e for e in A.evs if e["kind"] == kind]


async def post(topic, body):
    async with aiohttp.ClientSession() as s:
        async with s.post(f"{RELAY}/{topic}", data=body.encode()) as r:
            return r.status


def craft(B, friend_of_b, kind, **data):
    """A message as friend_of_b would seal it for B (his key to B, B's inbox for him)."""
    f = B.amis[friend_of_b]
    m = {"v": 1, "k": kind, "de": f["id"], "a": B.moi, "t": int(time.time() * 1000), "id": secrets.token_hex(8), **data}
    return f["_t_in"], relais.seal(f["_k_in"], f["_t_in"], m), m


async def befriend(A, B):
    await A.hub.dispatch("amis.code")
    code = A.code["code"]
    w = code.split("-")
    await B.hub.dispatch("amis.ajoute", {"code": f"  {w[0].upper()} {amis.ecrit(code)['mots'][1]}, {w[2]} {w[3][:2]} {w[3][2:]} "})
    ok = await until(lambda: B.moi in A.amis and A.moi in B.amis, 8)
    return ok, code


async def scenario(tmp):
    relay = await FakeNtfy(PORT, keepalive=2).start()
    try:
        await flows(tmp, relay)
    finally:
        await relay.stop()


async def flows(tmp, relay):
    (tmp / "a").mkdir()
    (tmp / "b").mkdir()
    (tmp / "c").mkdir()
    ha, A = make(tmp / "a", "Pixou")
    hb, B = make(tmp / "b", "Bip")
    hb.s["caractere"]["preset"] = "farceur"
    hb.s["view"]["theme"] = "neon"
    hb.s["look"] = {"yeux": "etoiles", "chapeau": "casquette"}
    await asyncio.sleep(1.2)
    check("no friend, no code: not a single request to the relay, the link is off", relay.subscriptions == [] and relay.published == []
          and A.lien == "off" and ha.s["amis"]["lien"] == "off", f"{relay.subscriptions} {A.lien}")
    check("the snapshot: available, on, no friend, my card (his name, preset, theme)", ha.s["amis"]["dispo"] and ha.s["amis"]["on"] and ha.s["amis"]["amis"] == []
          and hb.s["amis"]["moi"]["nom"] == "Bip" and hb.s["amis"]["moi"]["theme"] == "neon", json.dumps(hb.s["amis"]["moi"]))

    # ---- becoming friends ----
    await ha.dispatch("amis.code")
    code_pub = ha.s["amis"]["code"]
    check("« Mon code d'ami »: three words, a number, valid 24 h, a QR code", code_pub and len(code_pub["mots"]) == 3 and len(code_pub["nombre"]) == 4
          and abs(code_pub["expire"] - time.time() * 1000 - 24 * 3600e3) < 5000 and len(code_pub["qr"]) > 20, json.dumps({k: code_pub[k] for k in ("mots", "nombre")}))
    await until(lambda: A.lien == "ok", 4)
    check("…and only then the relay: one subscription, to the code's meeting topic", len(relay.subscriptions) >= 1 and A.lien == "ok", str(relay.subscriptions))
    ok, code = await befriend(A, B)
    check("two Pixels become friends with the code, typed any old way (case, accents, commas, the number in two)", ok, f"{list(A.amis)} {list(B.amis)}")
    fa, fb = A.amis.get(B.moi, {}), B.amis.get(A.moi, {})
    check("…each has the other's card: name, preset, theme, look", fa.get("nom") == "Bip" and fa.get("caractere") == "farceur" and fa.get("theme") == "neon"
          and fa.get("look") == {"yeux": "etoiles", "chapeau": "casquette"} and fb.get("nom") == "Pixou", json.dumps({k: fa.get(k) for k in ("nom", "caractere", "theme", "look")}))
    check("…the same friendship key on both sides (each one's topics and keys match the other's)", fa and fb and fa["cle"] == fb["cle"] and fa["_t_out"] == fb["_t_in"]
          and fa["_t_in"] == fb["_t_out"] and fa["_k_out"] == fb["_k_in"] and fa["_k_out"] != fa["_k_in"])
    check("…both screens hear the news (nouvel-ami) and both journals keep it", ev(A, "nouvel-ami") and ev(B, "nouvel-ami") and A.journal[0]["quoi"] == "nouvel-ami"
          and B.journal[0]["quoi"] == "nouvel-ami" and ha.s["amis"]["amis"][0]["nom"] == "Bip")
    check("…the code is used up: gone from the snapshot", A.code is None and ha.s["amis"]["code"] is None)
    secret_words = [w for w in code.split("-")[:3]] + ["Pixou", "Bip", "casquette", "etoiles", "bonjour", "bienvenue", "farceur", "neon", code.split("-")[3]]
    bodies = relay.bodies()
    plain = [b for b in bodies if not b.startswith("PXA1.") or any(w in b for w in secret_words) or "{" in b]
    decoded = b"".join(relais.unb64u(b[5:]) for b in bodies if b.startswith("PXA1."))
    check(f"the relay saw {len(bodies)} messages and not one word in clear (names, code, look, kinds)", bodies and not plain
          and not any(w.encode() in decoded for w in secret_words), str(plain[:1]))
    # the code once only
    hc, C = make(tmp / "c", "Zia")
    amis.PAIR_WAIT = 3
    await hc.dispatch("amis.ajoute", {"code": code})
    await until(lambda: C.ajout and C.ajout["etat"] == "erreur", 7)
    check("the same code a second time (another Pixel): no answer, no friend, a kind word", not C.amis and C.ajout and C.ajout["etat"] == "erreur"
          and "ne répond pas" in C.ajout["pourquoi"] and len(A.amis) == 1, json.dumps(C.ajout))
    await hc.dispatch("amis.ajoute", {"code": "lapon soleil tarte 4271"})
    check("a typo: said at once, with the closest word", C.ajout["etat"] == "erreur" and "lapin" in C.ajout["pourquoi"], C.ajout["pourquoi"])
    await hc.dispatch("amis.code")
    await hc.dispatch("amis.ajoute", {"code": C.code["code"]})
    check("his own code: « c'est le code de ton Pixel »", "ton Pixel" in C.ajout["pourquoi"], C.ajout["pourquoi"])
    await close(hc)

    # ---- coucous and stickers ----
    n0 = len(relay.published)
    await ha.dispatch("amis.coucou", {"ami": B.moi})
    await until(lambda: ev(B, "coucou"), 4)
    check("a coucou: on the friend's screen (ev coucou, his name) and in both journals", ev(B, "coucou") and ev(B, "coucou")[-1]["nom"] == "Pixou"
          and B.journal[0]["quoi"] == "coucou-recu" and A.journal[0]["quoi"] == "coucou-envoye" and ev(A, "envoi"))
    await ha.dispatch("amis.coucou", {"ami": "Bip"})
    check("…by his name too; but not twice within 20 s (« Doucement »), nothing more goes out", "Doucement" in ha.s["toast"]["msg"] and len(relay.published) == n0 + 1, ha.s["toast"]["msg"])
    await ha.dispatch("amis.sticker", {"ami": B.moi, "s": "coeur"})
    await until(lambda: ev(B, "sticker"), 4)
    check("a sticker: its id and its name on the friend's screen", ev(B, "sticker") and ev(B, "sticker")[-1]["s"] == "coeur" and ev(B, "sticker")[-1]["sn"] == "un cœur")
    n1 = len(relay.published)
    await ha.dispatch("amis.sticker", {"ami": B.moi, "s": "<b>bonjour</b>"})
    await ha.dispatch("amis.coucou", {"ami": "Personne"})
    check("a sticker that is not in the list, a friend who does not exist: nothing goes out", len(relay.published) == n1)

    # ---- tampering, replays, old and foreign messages ----
    tb = fb["_t_in"]
    captured = [b for t, b in relay.published if t == tb]
    r0, c0 = B.rejets, len(ev(B, "coucou")) + len(ev(B, "sticker"))
    await post(tb, captured[0])
    await until(lambda: B.rejets > r0, 3)
    check("a message replayed as it was: refused (seen), no scene", B.rejets == r0 + 1 and len(ev(B, "coucou")) + len(ev(B, "sticker")) == c0, f"{B.rejets - r0}")
    raw = bytearray(relais.unb64u(captured[0][5:]))
    raw[20] ^= 4
    await post(tb, "PXA1." + relais.b64u(bytes(raw)))
    await until(lambda: B.rejets > r0 + 1, 3)
    check("a message tampered with (one bit): refused", B.rejets == r0 + 2)
    topic, body, _ = craft(B, A.moi, "coucou")
    m = relais.open_(fb["_k_in"], topic, body)
    m.update(t=int(time.time() * 1000) - 2 * 86400000, id=secrets.token_hex(8))
    await post(topic, relais.seal(fb["_k_in"], topic, m))
    m.update(t=int(time.time() * 1000) + 3600000, id=secrets.token_hex(8))
    await post(topic, relais.seal(fb["_k_in"], topic, m))
    m.update(t=int(time.time() * 1000), id=secrets.token_hex(8), a="0000000000000000")
    await post(topic, relais.seal(fb["_k_in"], topic, m))
    await post(topic, relais.seal(os.urandom(32), topic, {**m, "a": B.moi}))
    await until(lambda: B.rejets >= r0 + 6, 3)
    check("two days old, an hour ahead, for another Pixel, sealed with another key: all refused", B.rejets == r0 + 6 and len(ev(B, "coucou")) + len(ev(B, "sticker")) == c0, str(B.rejets - r0))
    out_ab = [b for t, b in relay.published if t == fa["_t_out"]][0]
    ra = A.rejets
    await post(fa["_t_in"], out_ab)                                        # A's own message to B, sent back to A
    await until(lambda: A.rejets > ra, 3)
    check("a message reflected back to its sender (his own coucou on his inbox): refused (one key each way)", A.rejets == ra + 1)

    # ---- rate limits ----
    B.rate_in.clear()
    B.shown.clear()
    rb, sb, e0 = B.rejets, len(B.seen), B.ev_id
    for _ in range(40):
        topic, body, _ = craft(B, A.moi, "coucou")
        await post(topic, body)
    await until(lambda: B.rejets >= rb + 10, 4)
    shown = [e for e in ev(B, "coucou") if e["id"] > e0]
    check(f"a flood of 40 valid coucous in a minute: {amis.IN_RATE[0]} heard, the rest dropped before opening, one scene", B.rejets - rb == 40 - amis.IN_RATE[0]
          and len(B.seen) - sb == amis.IN_RATE[0] and len(shown) == 1, f"{B.rejets - rb} {len(B.seen) - sb} {len(shown)}")
    B.rate_in.clear()
    A.compte = {"jour": time.strftime("%Y-%m-%d"), "n": amis.DAY_MAX}
    A.last_out.clear()
    n2 = len(relay.published)
    await ha.dispatch("amis.coucou", {"ami": B.moi})
    check(f"{amis.DAY_MAX} messages today: no more (« on fait une pause »)", len(relay.published) == n2 and "pause" in ha.s["toast"]["msg"], ha.s["toast"]["msg"])
    A.compte["n"] = 0

    # ---- visits ----
    B.visite_ms = A.visite_ms = 3000
    await ha.dispatch("amis.visite", {"ami": "Bip"})
    check("« Va le voir »: he sets off at once (sortie, demande) on his face screen", A.visite and A.visite["sens"] == "sortie" and A.visite["etat"] == "demande"
          and ha.s["screen"] == "visage")
    await until(lambda: A.visite and A.visite["etat"] == "chez", 4)
    vb = B.visite or {}
    check("…the friend's Pixel says yes: he is « chez Bip », and Bip's screens get the visit and its programme", A.visite and A.visite["etat"] == "chez"
          and vb.get("sens") == "accueil" and vb.get("etat") == "chez" and vb["programme"][0]["id"] == "ami-arrive" and hb.s["screen"] == "visage"
          and hb.s["amis"]["visite"]["nom"] == "Pixou", json.dumps(vb)[:200])
    await until(lambda: not A.visite and not B.visite, 7)
    back = ev(A, "retour")[-1] if ev(A, "retour") else {}
    check("…at the end he comes home and tells what they did (retour, fait), both journals keep the visit", not A.visite and not B.visite and back.get("fait")
          and set(back["fait"]) <= set(amis.FAIT) and A.journal[0]["quoi"] == "visite" and B.journal[0]["quoi"] == "accueil"
          and A.amis[B.moi]["n"] == 1 and B.amis[A.moi]["n"] == 1, json.dumps(back))
    got = []

    async def souvenir(type="", texte="", t=0):
        got.append((type, texte))
    ha.actions["souvenirs.ajoute"] = souvenir
    hb.actions["souvenirs.ajoute"] = souvenir
    A.cooldown = B.cooldown = 0
    await hb.dispatch("amis.visite", {"ami": "Pixou"})
    await until(lambda: B.visite and B.visite["etat"] == "chez", 4)
    check("the other way: Bip visits Pixou", B.visite and B.visite["etat"] == "chez" and A.visite and A.visite["sens"] == "accueil")
    await until(lambda: not A.visite and not B.visite and len(got) >= 2, 7)
    check("…and both albums get a memory (souvenirs.ajoute: type ami-visite, a French sentence)", len(got) == 2 and all(t == "ami-visite" for t, _ in got)
          and any("Bip est allé jouer chez Pixou" in x for _, x in got) and any("Bip est venu jouer chez Pixou" in x for _, x in got), json.dumps(got, ensure_ascii=False))

    async def visit_refused(why_set, want):
        A.cooldown, A.last_out = 0, {}
        await ha.dispatch("amis.visite", {"ami": B.moi})
        await until(lambda: not A.visite, 4)
        back = ev(A, "retour")[-1] if ev(A, "retour") else {}
        return back.get("refus") == want and A.journal[0]["quoi"] == "refus", back
    hb.s["habitudes"] = {"dort": True}
    ok, back = await visit_refused(None, "dort")
    check("Bip asleep (habitudes.dort): « Chut… Bip fait dodo », his journal says why", ok and B.journal[0]["refus"] == "dort", json.dumps(back))
    del hb.s["habitudes"]
    h = time.localtime().tm_hour
    hb.s["caractere"]["calme"] = {"de": h, "a": (h + 1) % 24}
    ok, back = await visit_refused(None, "dort")
    check("…no habitudes: his character's quiet hours say he sleeps", ok, json.dumps(back))
    hb.s["caractere"]["calme"] = {"de": 23, "a": 23}
    hb.s["cast"] = {"id": "x", "kind": "text", "text": "Coucou", "t0": time.time() * 1000, "until": 0}
    ok, back = await visit_refused(None, "occupe")
    check("…something cast on his screen: « occupé »", ok, json.dumps(back))
    hb.s["cast"] = None
    await hb.dispatch("exos.nouveau", {"mode": "exo", "kind": "addition"})
    ok, back = await visit_refused(None, "exo")
    check("…an exercise open: « Bip fait des maths ! »", ok, json.dumps(back))
    await hb.dispatch("exos.stop")
    await hb.dispatch("amis.reglages", {"visites": False})
    ok, back = await visit_refused(None, "ferme")
    check("…« Accepter les visites » off: « ne reçoit pas de visite »", ok, json.dumps(back))
    await hb.dispatch("amis.reglages", {"visites": True, "demander": True})
    A.cooldown, A.last_out = 0, {}
    await ha.dispatch("amis.visite", {"ami": B.moi})
    await until(lambda: B.visite and B.visite["etat"] == "question", 4)
    await until(lambda: A.visite and A.visite["etat"] == "attente", 3)
    check("« Me demander avant »: Bip's family is asked (question, a scene), Pixou waits (attente)", B.visite and B.visite["etat"] == "question"
          and ev(B, "question") and A.visite and A.visite["etat"] == "attente")
    await hb.dispatch("amis.reponse", {"vid": B.visite["vid"], "oui": True})
    await until(lambda: A.visite and A.visite["etat"] == "chez", 4)
    check("…« Oui ! »: the visit starts", B.visite and B.visite["etat"] == "chez" and A.visite and A.visite["etat"] == "chez")
    await until(lambda: not A.visite and not B.visite, 7)
    A.cooldown, A.last_out = 0, {}
    await ha.dispatch("amis.visite", {"ami": B.moi})
    await until(lambda: B.visite and B.visite["etat"] == "question", 4)
    await hb.dispatch("amis.reponse", {"vid": B.visite["vid"], "oui": False})
    await until(lambda: not A.visite, 4)
    check("…« Non merci »: he comes home (refus non)", ev(A, "retour")[-1].get("refus") == "non")
    amis.QUESTION_WAIT = 1.5
    A.cooldown, A.last_out = 0, {}
    await ha.dispatch("amis.visite", {"ami": B.moi})
    await until(lambda: not A.visite, 6)
    check("…nobody answers: « Personne n'a ouvert » (refus pas-repondu)", ev(A, "retour")[-1].get("refus") == "pas-repondu" and not B.visite)
    await hb.dispatch("amis.reglages", {"demander": False})
    # calling him back
    B.visite_ms = 30000
    A.cooldown, A.last_out = 0, {}
    await ha.dispatch("amis.visite", {"ami": B.moi})
    await until(lambda: A.visite and A.visite["etat"] == "chez", 4)
    await asyncio.sleep(0.6)
    await ha.dispatch("amis.rappel")
    check("« Rappelle-le »: he is home at once (retour, par rappel)", not A.visite and ev(A, "retour")[-1].get("par") == "rappel")
    await until(lambda: B.visite and B.visite["programme"][-1]["id"] == "ami-aurevoir" and B.visite.get("par") == "rappel", 4)
    v = B.visite or {}
    check("…on Bip's screen he says goodbye now (the programme ends with ami-aurevoir, a few seconds from now)", v and v["programme"][-1]["id"] == "ami-aurevoir"
          and v["fin"] - time.time() * 1000 < amis.DUREES["ami-aurevoir"] + 1500, json.dumps(v.get("programme")))
    if B.visite:
        B.visite["fin"] = 0
    await until(lambda: not B.visite, 3)
    # the same moment, both ways
    A.cooldown = B.cooldown = 0
    A.last_out, B.last_out = {}, {}
    await asyncio.gather(ha.dispatch("amis.visite", {"ami": B.moi}), hb.dispatch("amis.visite", {"ami": A.moi}))
    await until(lambda: not A.visite and not B.visite, 5)
    check("both set off at the same time: both come home (« on s'est croisés ! »)", ev(A, "retour")[-1].get("refus") == "croise"
          and ev(B, "retour")[-1].get("refus") == "croise", f"{ev(A, 'retour')[-1]} {ev(B, 'retour')[-1]}")

    # ---- the relay cuts, a friend's Pi off ----
    A.rate_in.clear()                              # a dozen visits in a minute (never at home: a visit lasts 3 min) is a flood too
    B.rate_in.clear()
    c0 = B.relais.stats["connexions"]
    relay.cut()
    await until(lambda: B.relais.stats["connexions"] > c0 and B.lien == "ok", 6)
    check("the relay cuts the stream: he reconnects by himself", B.relais.stats["connexions"] > c0 and B.lien == "ok", str(B.relais.stats))
    A.last_out = {}
    await ha.dispatch("amis.coucou", {"ami": B.moi})
    await until(lambda: B.journal[0]["quoi"] == "coucou-recu" and time.time() * 1000 - B.journal[0]["t"] < 3000, 4)
    check("…and hears what comes next", B.journal[0]["quoi"] == "coucou-recu")
    relay.offline = True
    await asyncio.sleep(0.3)
    relay.cut()
    await until(lambda: B.lien == "coupe", 4)
    check("a relay that does not answer: « coupé », he waits and tries again (no loop)", B.lien == "coupe" and B.relais.backoff > 1, B.lien)
    relay.offline = False
    await until(lambda: B.lien == "ok", 8)
    check("…it answers again: back on", B.lien == "ok", B.lien)
    relay.busy = True
    A.last_out = {}
    await ha.dispatch("amis.coucou", {"ami": B.moi})
    await until(lambda: "pas parti" in (ha.s["toast"] or {}).get("msg", ""), 3)
    check("the relay refuses (429): the coucou did not go, he says so", "pas parti" in ha.s["toast"]["msg"], ha.s["toast"]["msg"])
    relay.busy = False
    await close(hb)
    amis.DEMANDE_WAIT = 2
    A.cooldown, A.last_out = 0, {}
    await ha.dispatch("amis.visite", {"ami": "Bip"})
    await until(lambda: not A.visite, 5)
    back = ev(A, "retour")[-1]
    check("Bip's Pi switched off: no answer, he comes home (« Bip n'a pas répondu… il doit dormir »)", back.get("refus") == "pas-de-reponse"
          and A.journal[0]["quoi"] == "refus", json.dumps(back))

    # ---- a restart: the friends, the keys and what was seen stay ----
    mode = stat.S_IMODE(os.stat(tmp / "b" / "amis.json").st_mode)
    check("amis.json is readable by its owner only (0600: it holds the keys)", mode == 0o600, oct(mode))
    hb, B = make(tmp / "b", "Bip")
    await until(lambda: B.lien == "ok", 4)
    rb = B.rejets
    await post(tb, captured[0])
    await until(lambda: B.rejets > rb, 3)
    check("after a restart: still friends, same key, and an old message replayed is still refused", A.moi in B.amis and B.amis[A.moi]["cle"] == fb["cle"]
          and B.rejets == rb + 1, str(B.rejets - rb))
    A.last_out = {}
    await ha.dispatch("amis.coucou", {"ami": B.moi})
    await until(lambda: B.journal and B.journal[0]["quoi"] == "coucou-recu" and time.time() * 1000 - B.journal[0]["t"] < 3000, 4)
    check("…and a new coucou comes through (it waited on the relay while Bip was off: since=)", B.journal[0]["quoi"] == "coucou-recu")
    await until(lambda: A.amis[B.moi]["caractere"] == "pixel", 4)
    check("his card changed meanwhile (character, theme, look): his friend gets the new one", A.amis[B.moi]["caractere"] == "pixel"
          and A.amis[B.moi]["theme"] == "retro" and A.amis[B.moi]["look"] is None, json.dumps({k: A.amis[B.moi][k] for k in ("caractere", "theme", "look")}))

    # ---- the parent switch ----
    await hb.dispatch("amis.reglages", {"on": False})
    await until(lambda: B.lien == "off", 3)
    check("« Amis » off: no more listening, the snapshot says off", B.lien == "off" and hb.s["amis"]["on"] is False and hb.s["amis"]["lien"] == "off")
    await hb.dispatch("amis.coucou", {"ami": A.moi})
    check("…and nothing goes out: a kind word instead", "éteints" in hb.s["toast"]["msg"], hb.s["toast"]["msg"])
    await hb.dispatch("amis.reglages", {"on": True})
    await until(lambda: B.lien == "ok", 4)

    # ---- typed commands ----
    async def cmd(text):
        ha.seen.clear()
        await commands.run(ha, text)
        return list(ha.seen)
    A.cooldown, A.last_out = 0, {}
    B.visite_ms = 3000
    s = await cmd("va voir Bip")
    check("« va voir Bip »: he goes", s == [] and A.visite and A.visite["sens"] == "sortie", str(s))
    await until(lambda: not A.visite, 8)
    A.last_out = {}
    await cmd("dis coucou à bip")
    check("« dis coucou à bip » (any case)", A.journal[0]["quoi"] == "coucou-envoye")
    await cmd("envoie une étoile à Bip")
    check("« envoie une étoile à Bip »: a sticker", A.journal[0]["quoi"] == "sticker-envoye" and A.journal[0]["s"] == "etoile")
    await cmd("mes amis")
    check("« mes amis »: their names", "Bip" in ha.s["toast"]["msg"], ha.s["toast"]["msg"])
    await cmd("mon code d'ami")
    check("« mon code d'ami »: a code, shown on Pixel's screen", A.code and ha.s["amis"]["montre"] > time.time() * 1000)
    await cmd("ajoute l'ami lapon soleil tarte 4271")
    check("« ajoute l'ami lapon … »: what is wrong, and the right word", "lapin" in ha.s["toast"]["msg"], ha.s["toast"]["msg"])
    for text in ("va voir la météo", "va voir Personne", "dis coucou à Zorro", "envoie un camion à Bip", "reviens", "coucou"):
        s = await cmd(text)
        check(f"« {text} »: not a friends' command ({s[:1]})", "amis.visite" not in s and A.visite is None and (s[:1] in (["chat.ask"], ["anim.play"], ["screen.show"])), str(s))

    # ---- Claude ----
    check("Claude's tools: pixel_friends, once", [t["name"] for t in TOOLS].count("pixel_friends") == 1)
    check("…its input is checked: an action of the list, a friend's name (24 at most), nothing else",
          claude_check("pixel_friends", {"action": "liste"}) is None and claude_check("pixel_friends", {"action": "visite", "ami": "Bip"}) is None
          and claude_check("pixel_friends", {"action": "visite"}) and claude_check("pixel_friends", {"action": "ajoute", "ami": "Bip"})
          and claude_check("pixel_friends", {"action": "liste", "texte": "salut"}) and claude_check("pixel_friends", {"action": "coucou", "ami": "x" * 30}))
    out = await amis.run_tool(ha, {"action": "liste"})
    check("…liste: his friends, their character", "Bip (caractère pixel" in out, out)
    A.last_out = {}
    out = await amis.run_tool(ha, {"action": "coucou", "ami": "Bip"})
    check("…coucou", out == "coucou envoyé", out)
    out = await amis.run_tool(ha, {"action": "visite", "ami": "Zorro"})
    check("…a friend he does not have: said, with the list", "Zorro" in out and "Bip" in out, out)
    A.cooldown, A.last_out = 0, {}
    out = await amis.run_tool(ha, {"action": "visite", "ami": "bip"})
    check("…visite: he goes", "tu pars chez Bip" in out and A.visite, out)
    await until(lambda: not A.visite, 8)

    # ---- removing a friend: both forget ----
    await ha.dispatch("amis.code_annule")
    key = A.amis[B.moi]["cle"]
    await ha.dispatch("amis.retire", {"ami": B.moi})
    await until(lambda: A.moi not in B.amis and A.lien == "off" and B.lien == "off", 4)
    check("« Retirer »: both Pixels forget the friendship (the key with it), and stop listening", B.moi not in A.amis and A.moi not in B.amis
          and A.journal[0]["quoi"] == "retire" and B.journal[0]["quoi"] == "plus-ami" and B.lien == "off" and A.lien == "off", f"{A.lien} {B.lien}")
    text_a, text_b = (tmp / "a" / "amis.json").read_text(), (tmp / "b" / "amis.json").read_text()
    check("…neither file holds the key or the other's id any more (the journal keeps his name only)", key not in text_a and key not in text_b
          and B.moi not in text_a and A.moi not in text_b and '"nom": "Bip"' in text_a)

    # ---- 20 friends at most ----
    for i in range(amis.MAX_AMIS):
        r = {"id": f"{i:016x}", "nom": f"Ami{i}", "cle": relais.b64u(os.urandom(32)), "depuis": i}
        A.amis[r["id"]] = A._rec(r)
    await ha.dispatch("amis.code")
    check(f"{amis.MAX_AMIS} friends: no new code (« c'est le maximum »)", A.code is None or ha.s["amis"]["code"] is None or "maximum" in ha.s["toast"]["msg"], ha.s["toast"]["msg"])
    await close(ha)
    await close(hb)

    # ---- the file ----
    (tmp / "d").mkdir()
    (tmp / "d" / "amis.json").write_text("{ pas du json")
    hd, D = make(tmp / "d", "Dédé")
    check("a broken amis.json: Pixel starts with no friend, the file is put aside", D.amis == {} and (tmp / "d" / "amis.json.illisible").exists())
    await close(hd)
    (tmp / "e").mkdir()
    he, E = make(tmp / "e", "Eve", enabled=False)
    await he.dispatch("amis.code")
    check("[amis] enabled = false: not available, a word says why, no code", not he.s["amis"]["dispo"] and "config.toml" in he.s["amis"]["pourquoi"]
          and E.code is None and "désactivés" in he.s["toast"]["msg"])
    await close(he)


async def main():
    codes()
    box()
    amis.PAIR_WAIT, amis.QUESTION_WAIT, amis.DEMANDE_WAIT = 90, 45, 25
    with tempfile.TemporaryDirectory() as d:
        await scenario(Path(d))


if __name__ == "__main__":
    asyncio.run(main())
    print(f"\n{len(fails)} failure(s)")
    sys.exit(1 if fails else 0)
