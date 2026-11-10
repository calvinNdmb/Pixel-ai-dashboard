"""Quizzes made to measure, the month's budget, Haiku for the chat, and the Stream Deck's keys during an exercise:

    python3 tests/test_quiz.py

- the budget (pixel/budget.py): the price of an answer per model, the ceiling, the warning at 80 %, a new month, its file;
- a written quiz (exos.clean_quiz, Exos.quiz): what is refused, the game (the answer never out before it is given, the hint
  and the second try, the summary, « encore »), the stats;
- the Stream Deck's keys during an exercise (keys.exo_keys, pixel/deck.py), with a fake deck: the digits and OK for a table,
  the 4 answers for a quiz, Suivant, Encore, Fini, and the usual keys back after;
- against a local fake Messages API: the writer's request (its model, the JSON schema), the chat on Haiku (no server-side
  fallback), Claude's tool create_quiz, the typed command, a quiz refused, the budget counted and its ceiling (no request).
"""
import asyncio
import datetime as dt
import json
import random
import sys
import tempfile
from pathlib import Path

import anthropic
from aiohttp import web

APP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP))
import server  # noqa: E402
from pixel import commands, exos, quiz  # noqa: E402
from pixel.budget import Budget, cost_usd  # noqa: E402
from pixel.claude import Claude, TOOLS, check as claude_check  # noqa: E402
from pixel.deck import Deck  # noqa: E402
from pixel.keys import NAV, exo_keys, exo_pad, wrap  # noqa: E402
from pixel.state import Hub  # noqa: E402

fails, seen = [], []


def ok(name, cond, info=""):
    print(("OK   " if cond else "FAIL ") + name + (f"  [{info}]" if info and not cond else ""))
    if not cond:
        fails.append(name)


Q = [{"question": f"Question {i} ?", "bonne_reponse": f"bon{i}", "mauvaises_reponses": [f"faux{i}a", f"faux{i}b", f"faux{i}c"],
      "indice": f"indice {i}", "explication": f"parce que {i}"} for i in range(1, 6)]


class Clock:
    def __init__(self):
        self.t = 1_800_000_000.0

    def __call__(self):
        return self.t


class FakeDeck:
    def __init__(self):
        self.images, self.brightness = {}, None

    def key_image_format(self):
        return {"size": (72, 72), "format": "JPEG", "flip": (True, True), "rotation": 0}

    def set_key_image(self, k, img):
        self.images[k] = img

    def set_brightness(self, b):
        self.brightness = b

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


# ---------- the budget ----------
def test_budget():
    u = {"input_tokens": 1_000_000, "output_tokens": 1_000_000}
    ok("Haiku 5.5: $0.10 in, $0.50 out per million", abs(cost_usd("claude-haiku-5-5", {"input_tokens": 50_000, "output_tokens": 1_000_000}) - 0.505) < 1e-9)
    ok("Haiku 5.5: 5 times dearer on a prompt over 100K tokens", abs(cost_usd("claude-haiku-5-5", u) - 3.0) < 1e-9, str(cost_usd("claude-haiku-5-5", u)))
    ok("Sonnet 5.5: $2 in, $10 out", abs(cost_usd("claude-sonnet-5-5", u) - 12.0) < 1e-9)
    ok("Opus 5.5: $4 in, $20 out", abs(cost_usd("claude-opus-5-5", u) - 24.0) < 1e-9)
    ok("an unknown model is counted at the dearest price", cost_usd("claude-xyz", u) == 60.0)
    ok("a cache read costs a tenth, a cache write 1.25 times", abs(cost_usd("claude-sonnet-5-5", {"cache_read_input_tokens": 1_000_000, "cache_creation_input_tokens": 1_000_000}) - 2.7) < 1e-9)

    class U:
        input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens = 1000, 500, None, 0
    ok("the SDK's usage object is read too", abs(cost_usd("claude-sonnet-5-5", U()) - 0.007) < 1e-9)

    d = Path(tempfile.mkdtemp())
    day = [dt.date(2026, 11, 10)]
    b = Budget(d / "budget.json", {"budget_eur": 30, "usd_eur": 1.0}, today=lambda: day[0])
    said = []
    b.on_warn = said.append
    ok("a new month: nothing spent, calls allowed", b.ok() and b.spent() == 0)
    b.add("claude-sonnet-5-5", {"output_tokens": 2_000_000})                 # 20
    ok("20 of 30: still allowed, no warning yet", b.ok() and not said and abs(b.spent() - 20) < 1e-9)
    b.add("claude-sonnet-5-5", {"output_tokens": 500_000})                   # 25: over 80 %
    b.add("claude-haiku-5-5", {"output_tokens": 1_000_000})                  # 25.5: no second warning
    ok("a single warning once 80 % is spent", len(said) == 1 and "25,00 €" in said[0] and "30,00 €" in said[0], str(said))
    b.add("claude-sonnet-5-5", {"output_tokens": 500_000})                   # 30.5
    ok("the ceiling reached: no more calls", not b.ok())
    b2 = Budget(d / "budget.json", {"budget_eur": 30, "usd_eur": 1.0}, today=lambda: day[0])
    ok("the month's total is kept in budget.json", abs(b2.spent() - 30.5) < 1e-6 and not b2.ok() and b2.warned, str(b2.spent()))
    ok("the status says both figures", "30,50 €" in b2.status() and "30,00 €" in b2.status(), b2.status())
    day[0] = dt.date(2026, 12, 1)
    ok("on the 1st, the counter starts again", b2.ok() and b2.spent() == 0)
    ok("no ceiling: it only counts", Budget(None, {}).ok() and Budget(None, {"budget_eur": 0}).limit == 0)
    ok("the dollar's rate turns dollars into euros", abs(Budget(None, {"usd_eur": 0.5}).rate - 0.5) < 1e-9 and Budget(None, {"usd_eur": "x"}).rate == 0.92)
    (d / "b.json").write_text("[1, 2")
    ok("a broken budget.json never stops Pixel", Budget(d / "b.json", {"budget_eur": 5}).ok())


# ---------- a written quiz, in the game ----------
def test_game():
    titre, items = exos.clean_quiz("  Les   volcans ", Q)
    ok("a quiz is cleaned: its title, its 5 questions", titre == "Les volcans" and len(items) == 5 and items[0]["wrong"] == ["faux1a", "faux1b", "faux1c"])
    bad = [{"question": "Deux fois la même ?", "bonne_reponse": "A", "mauvaises_reponses": ["a", "B", "C"], "indice": "", "explication": ""},
           {"question": "x" * 200, "bonne_reponse": "A", "mauvaises_reponses": ["B", "C", "D"], "indice": "", "explication": ""},
           {"question": "Deux réponses ?", "bonne_reponse": "A", "mauvaises_reponses": ["B", "C"], "indice": "", "explication": ""},
           {"question": "Une réponse trop longue ?", "bonne_reponse": "A" * 60, "mauvaises_reponses": ["B", "C", "D"], "indice": "", "explication": ""},
           "pas une question", {"question": 3}]
    try:
        exos.clean_quiz("t", bad)
        refused = False
    except ValueError:
        refused = True
    ok("the same answer twice, a text too long, 3 answers, not a question: all refused", refused)
    t2, i2 = exos.clean_quiz(None, bad + [{"question": "Et\x00 celle-ci\n?", "bonne_reponse": "oui", "mauvaises_reponses": ["non", "peut-être", "jamais"]}])
    ok("the good one is kept, with a hint and a correction of its own", t2 == "Quiz" and len(i2) == 1 and i2[0]["q"] == "Et celle-ci ?" and i2[0]["hint"] and "oui" in i2[0]["explication"], str(i2))
    ok("20 questions at most", len(exos.clean_quiz("t", Q * 10)[1]) == 20)

    clk = Clock()
    d = Path(tempfile.mkdtemp())
    ex = exos.Exos(d / "exos.json", clock=clk, rng=random.Random(3))
    ex.quiz(titre, items, source="claude")
    p = ex.public()["cur"]
    ok("the quiz opens on its first question, as a series", p["q"] == "Question 1 ?" and p["mode"] == "serie" and p["kind"] == "quiz" and (p["i"], p["n"]) == (1, 5), str(p))
    ok("its title is its type, 4 answers, the right one among them", p["type"] == "Les volcans" and sorted(p["choices"]) == ["bon1", "faux1a", "faux1b", "faux1c"])
    ok("the answer is not sent before it is given", "answer" not in p and "explication" not in p and "bon1" not in json.dumps({k: v for k, v in p.items() if k != "choices"}))
    ok("a wrong answer: the hint and a second try", ex.repondre("faux1a", p["id"]) == "indice" and ex.public()["cur"]["hint"] == "indice 1")
    ok("then the right one", ex.repondre("bon1", p["id"]) is True and ex.public()["cur"]["explication"] == "parce que 1")
    ok("no level goes up or down for a quiz", ex.stats["niveaux"] == {} and ex.stats["montee"] == {}, str(ex.stats["montee"]))
    for i in range(2, 6):
        ex.passer()
        c = ex.public()["cur"]
        ok(f"question {i} follows", c["q"] == f"Question {i} ?" and c["etat"] == "question", str(c.get("q")))
        ex.repondre(f"bon{i}", c["id"])
    clk.t += 20
    ex.tick()
    c = ex.public()["cur"]
    ok("the summary: 5 / 5, under the quiz's title", c["etat"] == "bilan" and (c["bons"], c["total"]) == (5, 5) and c["type"] == "Les volcans", str(c))
    ok("the questions count for the day and the trophies", ex.stats["aujourdhui"] == 5 and ex.stats["justes"] == 5 and "premier" in ex.stats["trophees"])
    ex.encore()
    ok("« encore » plays the same quiz again", ex.public()["cur"]["q"] == "Question 1 ?" and ex.run["total"] == 5)
    ex.stop(user=True)
    ex.nouveau(mode="table", table=7)
    ex.stop()
    ex.encore()
    ok("after a table, « encore » is a table again", ex.public()["cur"]["type"] == "Table de 7")
    ok("exos.json reads back (the quiz's stats are not a kind of their own)", "quiz" not in exos.Exos(d / "exos.json", clock=clk).stats["par_type"])
    n = exos.clean_quiz("Table de 7", [{"question": "7 × 8 ?", "bonne_reponse": "56", "mauvaises_reponses": ["54", "48", "63"]}])[1]
    ex.quiz("Table de 7", n)
    ok("a quiz whose answers are numbers can be typed", ex.public()["cur"]["num"] and ex.public()["cur"]["clavier"] == "num" and ex.repondre("56") is True)


# ---------- the Stream Deck's keys ----------
def test_keys():
    ok("no exercise: the usual keys", exo_keys(None) is None and exo_keys({}) is None)
    table = {"id": 7, "etat": "question", "mode": "table", "choices": ["56", "54", "48", "63"], "i": 1, "n": 10}
    k = exo_keys(table, "5")
    ok("a table: the ten digits on rows 1 and 2", exo_pad(table) and [x["label"] for x in k[:10]] == list("1234567890") and all(x["action"] == "deck.chiffre" for x in k[:10]))
    ok("row 3: what is typed, Effacer, OK, Indice, Fini", [x["label"] for x in k[10:]] == ["5", "Effacer", "OK", "Indice", "Fini"] and k[10]["action"] is None)
    ok("nothing typed yet: a question mark", exo_keys(table)[10]["label"] == "?")
    ok("the hint already given: its key is empty", exo_keys({**table, "hint": "…"})[13] is None)
    ok("a negative or decimal answer: the 4 answers instead", not exo_pad({"choices": ["−3", "3", "4", "5"]}) and not exo_pad({"choices": ["1,5", "2", "3", "4"]}))
    qz = {"id": 9, "etat": "question", "mode": "serie", "choices": ["Rome", "On ne sait pas", "Madrid", "Athènes"], "i": 1, "n": 3}
    k = exo_keys(qz)
    ok("a quiz: the 4 answers on row 1, each sends itself", [x["args"]["value"] for x in k[:4]] == qz["choices"] and all(x["action"] == "exos.repondre" and x["args"]["id"] == 9 for x in k[:4]))
    ok("a long answer is cut in lines", k[1]["label"] == "On ne\nsait pas" and wrap("Un deux trois quatre cinq six sept huit") .count("\n") == 2, k[1]["label"])
    ok("Indice, Passer, Fini", k[4]["label"] == "Indice" and [x and x["label"] for x in k[5:]] == [None] * 8 + ["Passer", "Fini"])
    r = exo_keys({**qz, "etat": "resultat", "ok": True, "answer": "Rome"})
    ok("the result: Juste !, the answer, Suivant, Fini", (r[0]["label"], r[0]["style"], r[1]["label"], r[10]["label"], r[14]["label"]) == ("Juste !", "ok", "Rome", "Suivant", "Fini"))
    r = exo_keys({**qz, "etat": "resultat", "ok": False, "answer": "Rome", "i": 3})
    ok("the last one, wrong: Raté…, then Encore", (r[0]["label"], r[0]["style"], r[10]["action"]) == ("Raté…", "ko", "exos.encore"))
    b = exo_keys({"id": 10, "etat": "bilan", "bons": 4, "total": 5})
    ok("the summary: the score, Encore, Fini", (b[0]["label"], b[10]["label"], b[14]["action"]) == ("4 / 5", "Encore", "exos.stop"))


async def test_deck():
    hub = Hub({}, demo=True)
    d = Path(tempfile.mkdtemp())
    server.core_actions(hub, d)
    ex = exos.setup(hub, d)
    hub.exos_task.cancel()
    dk = Deck(hub, {})
    dk.deck = FakeDeck()
    dk.sync(hub.snapshot())
    ok("no exercise: the screens' names on the keys", dk.cache[0][0] == "Visage")
    await hub.dispatch("exos.nouveau", {"mode": "table", "table": 7})
    dk.sync(hub.snapshot())
    ok("a table opens: the digits on the keys", [dk.cache[i][0] for i in range(10)] == list("1234567890") and dk.cache[12][0] == "OK", str([dk.cache[i][0] for i in range(15)]))
    ans = ex.cur["answer"]
    for ch in ans:
        await dk.press("1234567890".index(ch))
    ok("the digits pressed show on the key", dk.cache[10][0] == ans, dk.cache[10][0])
    await dk.press(11)
    ok("Effacer takes the last one off", dk.cache[10][0] == (ans[:-1] or "?"))
    await dk.press("1234567890".index(ans[-1]))
    first = ex.cur["id"]
    await dk.press(12)
    ok("OK answers the exercise: right", ex.cur["etat"] == "resultat" and ex.cur["ok"] is True and ex.cur["id"] == first)
    ok("the result on the keys: Juste !, Suivant", dk.cache[0][0] == "Juste !" and dk.cache[10][0] == "Suivant", str(dk.cache[0]))
    await dk.press(3)
    ok("an empty key does nothing", ex.cur["id"] == first and ex.cur["etat"] == "resultat")
    await dk.press(10)
    ok("Suivant: the next question, nothing typed", ex.cur["id"] != first and ex.cur["etat"] == "question" and dk.cache[10][0] == "?")
    await dk.press(12)
    ok("OK with nothing typed answers nothing", ex.cur["etat"] == "question" and ex.cur["tries"] == 0)
    hub.s["screen"] = "meteo"
    dk.sync(hub.snapshot())
    ok("on another screen, the usual keys", dk.cache[0][0] == "Visage")
    hub.s["screen"] = "visage"
    await dk.press(14)
    ok("Fini puts the exercise away, the usual keys come back", ex.cur is None and dk.cache[0][0] == "Visage" and dk.cache[14][0] != "Fini", str(dk.cache[14]))
    await dk.press(NAV.index("meteo"))
    ok("and they work as before", hub.s["screen"] == "meteo")

    ex.quiz(*exos.clean_quiz("Capitales", Q))
    hub.s.update(screen="visage", exos=ex.public())
    dk.sync(hub.snapshot())
    labels = [dk.cache[i][0] for i in range(4)]
    ok("a quiz: its 4 answers on the keys", sorted(labels) == ["bon1", "faux1a", "faux1b", "faux1c"], str(labels))
    await dk.press(labels.index("faux1a"))
    ok("a wrong key: the hint, a second try", ex.cur["tries"] == 1 and ex.cur["hint_on"] and dk.cache[4][0] == "")
    await dk.press(labels.index("bon1"))
    ok("the right key answers it", ex.cur["etat"] == "resultat" and ex.cur["ok"] is True)
    await asyncio.sleep(0.3)
    ok("the keys were really drawn", len(dk.deck.images) == 15)


# ---------- the fake Messages API ----------
def sse(events):
    return "".join(f"event: {e['type']}\ndata: {json.dumps(e)}\n\n" for e in events)


def stream(blocks, stop, model):
    ev = [{"type": "message_start", "message": {"id": "msg_x", "type": "message", "role": "assistant", "model": model, "content": [],
                                                "stop_reason": None, "stop_sequence": None, "usage": {"input_tokens": 1000, "output_tokens": 1}}}]
    for i, (start, delta) in enumerate(blocks):
        ev += [{"type": "content_block_start", "index": i, "content_block": start}, {"type": "content_block_delta", "index": i, "delta": delta},
               {"type": "content_block_stop", "index": i}]
    ev += [{"type": "message_delta", "delta": {"stop_reason": stop, "stop_sequence": None}, "usage": {"output_tokens": 200}}, {"type": "message_stop"}]
    return sse(ev)


WRITER = {"text": json.dumps({"titre": "Les volcans", "questions": Q}), "stop": "end_turn"}
CHAT = []            # what the chat model answers, request after request


async def handler(request):
    body = await request.json()
    seen.append((dict(request.headers), body))
    if not body.get("stream"):                                   # the writer of the quizzes: one JSON answer
        return web.json_response({"id": "msg_q", "type": "message", "role": "assistant", "model": body["model"], "stop_sequence": None,
                                  "content": [{"type": "thinking", "thinking": "", "signature": "s"}, {"type": "text", "text": WRITER["text"]}],
                                  "stop_reason": WRITER["stop"], "usage": {"input_tokens": 2000, "output_tokens": 3000}})
    blocks, stop = CHAT.pop(0)
    return web.Response(text=stream(blocks, stop, body["model"]), content_type="text/event-stream")


async def test_api():
    app = web.Application()
    app.router.add_post("/v1/messages", handler)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    port = site._server.sockets[0].getsockname()[1]

    d = Path(tempfile.mkdtemp())
    cfg = {"model": "claude-haiku-5-5", "exos_model": "claude-sonnet-5-5", "budget_eur": 30, "usd_eur": 1.0}
    hub = Hub({"claude": cfg}, demo=True)
    server.core_actions(hub, d)
    ex = exos.setup(hub, d)
    hub.exos_task.cancel()
    hub.budget = Budget(d / "budget.json", cfg)
    c = Claude(hub, cfg)
    qz = quiz.setup(hub, cfg)

    said = await qz.creer("les volcans", 3)
    ok("without an API key: a ready-made quiz, and he says why", said.startswith("Sans clé API") and ex.cur["titre"] == "Quiz de démo" and ex.run["total"] == 3 and not seen, said)
    ex.stop(user=True)

    c.anthropic = anthropic
    c.client = anthropic.AsyncAnthropic(api_key="test", base_url=f"http://127.0.0.1:{port}", max_retries=0)

    # the chat model asks for a quiz with its tool; the writer writes it
    CHAT[:] = [([({"type": "tool_use", "id": "toolu_1", "name": "create_quiz", "input": {}},
                  {"type": "input_json_delta", "partial_json": json.dumps({"sujet": "les volcans", "nombre": 4, "niveau": "CM1"})})], "tool_use"),
               ([({"type": "text", "text": ""}, {"type": "text_delta", "text": "Ton quiz est prêt !"})], "end_turn")]
    await c.send("fais-moi un quiz de 4 questions sur les volcans, je suis en CM1")
    ok("three requests: the chat, the writer, the chat", [bool(b.get("stream")) for _, b in seen] == [True, False, True], str(len(seen)))
    h1, b1 = seen[0]
    ok("the chat runs on Haiku", b1["model"] == "claude-haiku-5-5" and b1["output_config"] == {"effort": "low"})
    ok("no server-side fallback asked of Haiku", "fallbacks" not in b1 and "server-side-fallback" not in h1.get("anthropic-beta", ""), h1.get("anthropic-beta", ""))
    ok("the chat knows the tool create_quiz", "create_quiz" in [t["name"] for t in b1["tools"]] and "create_quiz" in [t["name"] for t in TOOLS])
    h2, b2 = seen[1]
    ok("the quiz is written by Sonnet", b2["model"] == "claude-sonnet-5-5" and b2["output_config"]["effort"] == "medium")
    ok("its answer is held to a JSON schema", b2["output_config"]["format"]["type"] == "json_schema" and b2["output_config"]["format"]["schema"]["required"] == ["titre", "questions"])
    ok("the writer has its fallback on a refusal", b2.get("fallbacks") == "default" and "server-side-fallback-2026-07-01" in h2.get("anthropic-beta", ""))
    ok("no thinking nor sampling parameter sent", not {"thinking", "temperature", "top_p", "top_k"} & set(b2))
    ask = b2["messages"][0]["content"]
    ok("the subject, the number and the class reach the writer", "les volcans" in ask and "4" in ask and "CM1" in ask and len(b2["messages"]) == 1, ask)
    ok("the quiz is on his screen: 4 questions", ex.cur and ex.cur["titre"] == "Les volcans" and ex.run["total"] == 4 and hub.s["screen"] == "visage" and hub.s["exos"]["cur"]["q"] == "Question 1 ?")
    res = seen[2][1]["messages"][-1]["content"][0]
    ok("the chat model is told it is shown, never the answers", res["type"] == "tool_result" and "Les volcans" in res["content"] and "bon1" not in res["content"], str(res))
    ok("he says so", hub.s["chat"]["messages"][-1]["text"].strip() == "Ton quiz est prêt !")
    # Haiku: (1000 × 0.10 + 200 × 0.50) / 1e6 twice; Sonnet: (2000 × 2 + 3000 × 10) / 1e6
    want = 2 * (1000 * 0.10 + 200 * 0.50) / 1e6 + (2000 * 2 + 3000 * 10) / 1e6
    ok("the three answers are counted in the month's budget", abs(hub.budget.usd - want) < 1e-9 and set(hub.budget.par_modele) == {"claude-haiku-5-5", "claude-sonnet-5-5"}, f"{hub.budget.usd} {want}")
    ok("Claude can say what is left", "budget_claude" in c.status() and "30,00 €" in c.status()["budget_claude"])

    # a lesson given word for word
    ex.stop(user=True)
    await quiz.run_tool(hub, {"sujet": "ma leçon", "lecon": "Le magma monte par la cheminée."})
    ask = seen[-1][1]["messages"][0]["content"]
    ok("a lesson goes to the writer as a document, 5 questions by default", "<lecon>\nLe magma monte par la cheminée.\n</lecon>" in ask and "Nombre de questions : 5" in ask and ex.run["total"] == 5, ask)

    # the typed command goes straight to the writer
    ex.stop(user=True)
    n = len(seen)
    await commands.run(hub, "Quiz de 2 questions sur les Châteaux forts !")
    await qz.task
    ok("« quiz de 2 questions sur … » asks the writer, not the chat", len(seen) == n + 1 and not seen[-1][1].get("stream") and ex.run and ex.run["total"] == 2)
    ok("the subject as typed, with its accents", "Sujet : les Châteaux forts" in seen[-1][1]["messages"][0]["content"], seen[-1][1]["messages"][0]["content"][:60])
    ex.stop(user=True)
    await commands.run(hub, "interroge-moi sur les capitales")
    await qz.task
    ok("« interroge-moi sur … » too", len(seen) == n + 2 and "Sujet : les capitales" in seen[-1][1]["messages"][0]["content"] and ex.cur is not None)
    for words in ("le quiz", "c'est quoi un quiz ?"):
        ok(f"« {words} » is not a quiz to write", not await quiz.command(hub, words, commands.norm(words)))

    # what the writer may answer
    ex.stop(user=True)
    WRITER.update(text=json.dumps({"titre": "x", "questions": []}))
    said = await qz.creer("un sujet pas pour un enfant")
    ok("no question written: no quiz, a word instead", ex.cur is None and "pas réussi" in said, said)
    WRITER.update(text="{", stop="max_tokens")
    ok("an answer cut short: no quiz", "trop long" in await qz.creer("x") and ex.cur is None)
    WRITER.update(text="", stop="refusal")
    ok("a refusal: no quiz", "autre sujet" in await qz.creer("x") and ex.cur is None)
    WRITER.update(text=json.dumps({"titre": "Les volcans", "questions": Q}), stop="end_turn")
    ok("the tool's input is checked", claude_check("create_quiz", {"sujet": "x"}) is None and claude_check("create_quiz", {"sujet": ""}) and claude_check("create_quiz", {"sujet": "x", "nombre": 50})
       and claude_check("create_quiz", {"nombre": 3}) and claude_check("create_quiz", {"sujet": "x", "lecon": "y" * 7000}))
    qz.busy = True
    ok("one quiz at a time", "déjà" in await qz.creer("x"))
    qz.busy = False

    # the ceiling
    hub.budget.usd = 31.0
    n = len(seen)
    await c.send("bonjour")
    ok("the month's budget spent: the chat says so, without a request", len(seen) == n and "budget" in hub.s["chat"]["messages"][-1]["text"], hub.s["chat"]["messages"][-1]["text"])
    said = await qz.creer("les volcans")
    ok("and no quiz is written", len(seen) == n and "budget" in said and ex.cur is None, said)

    # a stronger chat model keeps its server-side fallback
    hub.budget.usd = 0.0
    c.model = "claude-sonnet-5-5"
    CHAT[:] = [([({"type": "text", "text": ""}, {"type": "text_delta", "text": "Salut !"})], "end_turn")]
    await c.send("bonjour")
    h, b = seen[-1]
    ok("another chat model keeps its fallback", b.get("fallbacks") == "default" and "server-side-fallback-2026-07-01" in h.get("anthropic-beta", ""))
    await runner.cleanup()


async def main():
    test_budget()
    test_game()
    test_keys()
    await test_deck()
    await test_api()
    print("\n%d failure(s)" % len(fails))
    sys.exit(1 if fails else 0)


asyncio.run(main())
