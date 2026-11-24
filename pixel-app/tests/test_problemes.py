"""Word problems written ahead of time by Claude (pixel/problemes.py), with a pretend Messages API:

    python3 tests/test_problemes.py

- the calculation is computed again, exactly: numbers, + - * / and brackets only (no power, no name, no call);
- a problem goes in only if its calculation gives its answer (a whole number), with 3 different wrong answers and lengths
  that fit his screen; the others are dropped;
- a level running low is topped up in the background by one request to Haiku (low effort, a JSON schema, no fallback
  nor sampling parameter), once at a time per level; it says the level and the questions shown lately; it is counted in
  the month's budget;
- the exercises take theirs first (a word problem of the reserve, its 4 answers), and a problem shown leaves the reserve
  and does not come back; the reserve is kept in problemes.json (an entry edited by hand that no longer checks is dropped);
- without an API key, with the budget spent, an empty reserve, an error of the API or a refusal: the templates, as
  before; [claude] problemes = false: no reserve at all.
"""
import asyncio
import json
import sys
import tempfile
from fractions import Fraction
from pathlib import Path
from types import SimpleNamespace

import anthropic
from aiohttp import web

APP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP))
from pixel import exos, problemes  # noqa: E402
from pixel.budget import Budget  # noqa: E402
from pixel.state import Hub  # noqa: E402

fails = []


def check(name, cond, info=""):
    print(("OK   " if cond else "FAIL ") + name + (f"  [{info}]" if info and not cond else ""))
    if not cond:
        fails.append(name)


def p(enonce, reponse, fausses, calcul, indice="Une étape, puis l'autre.", explication="Le calcul, puis le résultat."):
    return {"enonce": enonce, "reponse": reponse, "mauvaises_reponses": fausses, "calcul": calcul, "indice": indice, "explication": explication}


GOOD = [p("Léa a 12 billes. Elle en gagne 8. Combien en a-t-elle maintenant ?", 20, [4, 21, 19], "12 + 8"),
        p("Un paquet contient 6 gâteaux. Combien de gâteaux dans 4 paquets ?", 24, [10, 18, 30], "6 * 4"),
        p("Tom range 30 livres sur 5 étagères, autant sur chacune. Combien par étagère ?", 6, [25, 35, 150], "30 / 5"),
        p("Un ticket coûte 3 €. Sam en achète 4 et paie avec 20 €. Combien lui rend-on ?", 8, [12, 17, 7], "20 - 4 × 3"),
        p("Il y a 25 élèves, 3 sont malades. Combien sont en classe ?", 22, [28, 23, 21], "25 − 3"),
        p("Mia lit 15 pages par jour pendant 4 jours, puis 10 pages. Combien de pages en tout ?", 70, [60, 29, 65], "(15 * 4) + 10")]
BAD = [p("Un calcul faux : 12 + 8 ?", 21, [20, 19, 4], "12 + 8"),
       p("Des réponses en double ?", 20, [4, 4, 20], "12 + 8"),
       p("x" * 200, 20, [4, 21, 19], "12 + 8"),
       p("Pas un calcul ?", 0, [1, 2, 3], "__import__('os').getpid() * 0"),
       p("Une puissance ?", 1024, [20, 100, 512], "2 ** 10"),
       p("Une réponse à virgule ?", 2.5, [2, 3, 5], "5 / 2"),
       p("Négatif ?", -3, [3, 1, 2], "2 - 5")]
API = {"status": 200, "stop": "end_turn", "items": GOOD + BAD, "fresh": False}   # fresh: new statements at each request
seen = []


async def handler(request):
    body = await request.json()
    seen.append((dict(request.headers), body))
    if API["status"] != 200:
        return web.json_response({"type": "error", "error": {"type": "api_error", "message": "boom"}}, status=API["status"])
    items = [{**x, "enonce": x["enonce"][:-1] + f"(série {len(seen)}) ?"} if API["fresh"] and x in GOOD else x for x in API["items"]]
    return web.json_response({"id": "msg_p", "type": "message", "role": "assistant", "model": body["model"], "stop_sequence": None,
                              "content": [{"type": "thinking", "thinking": "", "signature": "s"},
                                          {"type": "text", "text": json.dumps({"problemes": items}, ensure_ascii=False)}],
                              "stop_reason": API["stop"], "usage": {"input_tokens": 900, "output_tokens": 2500}})


def calculations():
    c = problemes.compute
    check("the calculation computed again, exactly: priorities, brackets, ×, ÷, −, a decimal comma",
          c("12 + 8 * 3") == 36 and c("(12 + 8) * 3") == 60 and c("7 ÷ 2") == Fraction(7, 2) and c("12 × 3 − 4") == 32 and c("1,5 * 2") == 3
          and c(" 1 000 + 5 ") == 1005)
    check("…and nothing else: no power, no name, no call, no division by zero, nothing empty",
          all(c(s) is None for s in ("2 ** 10", "__import__('os')", "1/0", "", "abs(-3)", "1e9", "[1]", None, "2;3")))
    got = [problemes.check(x) for x in GOOD]
    check("a problem whose calculation gives its answer, with 3 different wrong answers, goes in", all(got) and got[3][1] == 8 and got[3][2] == [12, 17, 7], str(got[3]))
    check("…a wrong calculation, answers in double, too long, not a calculation, a power, a decimal or negative answer: dropped",
          [problemes.check(x) for x in BAD] == [None] * len(BAD))


async def api():
    app = web.Application()
    app.router.add_post("/v1/messages", handler)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    port = site._server.sockets[0].getsockname()[1]
    d = Path(tempfile.mkdtemp())
    cfg = {"budget_eur": 30, "usd_eur": 1.0}
    try:
        await _api(port, d, cfg)
    finally:
        exos.RESERVE = None
        await runner.cleanup()


async def _api(port, d, cfg):
    titles = {x["enonce"] for x in GOOD}
    hub = Hub({"data_dir": str(d)}, demo=True)
    ex = exos.Exos(None, rng=__import__("random").Random(3))
    hub.exos = ex
    r = problemes.setup(hub, cfg, d)
    r.start_task.cancel()
    check("without an API key: no request, the templates as before", r.want(2) is None and r.take(2) is None and not seen
          and ex.nouveau(kind="probleme", niveau=2)["q"] not in titles)

    hub.budget = Budget(d / "budget.json", cfg)
    hub.claude = SimpleNamespace(anthropic=anthropic, client=anthropic.AsyncAnthropic(api_key="test", base_url=f"http://127.0.0.1:{port}", max_retries=0))
    t = r.want(2)
    check("…one at a time per level", r.want(2) is None and t is not None)
    await t
    h, b = seen[0]
    check("a level topped up by one request to Haiku: low effort, a JSON schema", len(seen) == 1 and b["model"] == "claude-haiku-5-5"
          and b["output_config"]["effort"] == "low" and b["output_config"]["format"]["type"] == "json_schema"
          and b["output_config"]["format"]["schema"]["required"] == ["problemes"], str(b.get("output_config")))
    check("…no fallback nor sampling or thinking parameter (Haiku has no fallback)", not {"fallbacks", "thinking", "temperature", "top_p", "top_k"} & set(b)
          and "server-side-fallback" not in h.get("anthropic-beta", ""), str(sorted(b)))
    check("…it asks for 12 problems of that level", "Niveau 2" in b["messages"][0]["content"] and "12 problèmes" in b["messages"][0]["content"]
          and "Déjà posés" not in b["messages"][0]["content"], b["messages"][0]["content"])
    check("…the good ones are in reserve, the others dropped", [x["enonce"] for x in r.stock[2]] == [x["enonce"] for x in GOOD], str(len(r.stock[2])))
    check("…what it cost is counted in the month's budget", hub.budget.spent() > 0, hub.budget.status())

    exos.RESERVE = r
    c = ex.nouveau(kind="probleme", niveau=2)
    first = next(x for x in GOOD if x["enonce"] == c["q"])
    check("the exercises take theirs first: a word problem of the reserve, its answer and its 3 wrong ones as the 4 choices",
          c["answer"] == exos.fmt(first["reponse"]) and sorted(c["choices"]) == sorted(exos.fmt(v) for v in [first["reponse"], *first["mauvaises_reponses"]])
          and c["hint"] == first["indice"] and c["num"], str(c))
    check("…shown, it leaves the reserve and is remembered", len(r.stock[2]) == len(GOOD) - 1 and r.recent[2] == [c["q"]])
    for _ in range(len(GOOD) - problemes.LOW):
        ex.nouveau(kind="probleme", niveau=2)
    await asyncio.sleep(0)
    await asyncio.gather(*list(r.tasks))
    h, b = seen[-1]
    ask = b["messages"][0]["content"]
    check("running low (fewer than 4): a new request, with the questions shown lately (not to write them again)",
          len(seen) == 2 and "Déjà posés" in ask and all(q in ask for q in r.recent[2]), ask)
    check("…what was shown lately, or is in reserve already, never comes in twice", not {x["enonce"] for x in r.stock[2]} & set(r.recent[2])
          and len(r.stock[2]) == len(GOOD) - len(r.recent[2]), str(len(r.stock[2])))

    saved = json.loads((d / "problemes.json").read_text(encoding="utf-8"))
    check("the reserve is kept in problemes.json", [x["enonce"] for x in saved["niveaux"]["2"]] == [x["enonce"] for x in r.stock[2]]
          and saved["deja"]["2"] == r.recent[2])
    saved["niveaux"]["2"][0]["reponse"] += 1                  # edited by hand: its calculation no longer gives it
    (d / "problemes.json").write_text(json.dumps(saved, ensure_ascii=False), encoding="utf-8")
    r2 = problemes.Reserve(hub, d / "problemes.json", cfg)
    check("…read again at start; an entry that no longer checks is dropped", len(r2.stock[2]) == len(r.stock[2]) - 1 and r2.recent[2] == r.recent[2])

    n = len(seen)
    API.update(status=500)
    await r.want(4)
    API.update(status=200, stop="refusal")
    await r.want(5)
    API.update(stop="end_turn")
    check("an error of the API, a refusal: nothing in reserve, the templates meanwhile", len(seen) == n + 2 and r.stock[4] == [] and r.stock[5] == []
          and not r.busy and r.take(4) is None)
    await asyncio.gather(*list(r.tasks))                      # take(4) asked again: the API answers this time
    check("…and it tries again the next time a problem of that level is wanted", len(seen) == n + 3 and len(r.stock[4]) == len(GOOD))

    hub.budget.limit, hub.budget.usd = 1.0, 5.0              # the month's budget spent
    check("the month's budget spent: no request", r.want(1) is None and len(seen) == n + 3)
    hub.budget.limit = 0
    API["fresh"] = True
    await r.start(0)
    await asyncio.gather(*list(r.tasks))
    lv = ex.level("probleme")
    check("at start: the level he plays at and the next one topped up when low", len(seen) > n + 3
          and all(len(r.stock[x]) >= problemes.LOW for x in {lv, min(5, lv + 1)}), str({k: len(v) for k, v in r.stock.items()}))
    check("[claude] problemes = false: no reserve, the templates only", problemes.setup(hub, {"problemes": False}, d) is None and exos.RESERVE is None)


if __name__ == "__main__":
    calculations()
    asyncio.run(api())
    print(f"\n{len(fails)} failure(s)")
    sys.exit(1 if fails else 0)
