"""« Mes cours » (pixel/cours.py): a lesson in photos, read by Claude, kept a week, quizzes on it. A real aiohttp server
and a pretend Messages API:

    python3 tests/test_cours.py

- what Claude read is checked: unreadable photos, too few words: said, nothing kept; the title given by the child wins;
  the text keeps its paragraphs, 6000 characters at most;
- POST /api/cours: the access code; without an API key (or the budget spent) it says why and sends nothing; photos only
  (JPEG or WebP, the right size), 6 at most; answered at once, Claude reads in the background (Sonnet, the images then
  the request, a JSON schema), one lesson at a time; the photos are never written on the Pi, the text is (0600);
  GET /api/cours/{id}: what he read;
- the snapshot's "cours", Pixel's toasts; a lesson older than a week is forgotten ([cours] jours);
- a quiz on a lesson: the quiz writer gets its title and its text (the lesson as its document); by its subject; the
  typed words « quiz sur mon cours », « interroge-moi sur ma leçon de sciences », « révise mon cours » (and « quiz sur
  les cours d'eau » stays a quiz on a subject); Claude's tool my_lessons (list, read, quiz); forgetting one.
"""
import asyncio
import base64
import json
import os
import struct
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

import aiohttp
import anthropic
from aiohttp import web

APP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP))
from pixel import claude, commands, cours  # noqa: E402
from pixel.budget import Budget  # noqa: E402
from pixel.state import Hub  # noqa: E402

fails = []
TOKEN = "jeton-de-test"


def check(name, cond, info=""):
    print(("OK   " if cond else "FAIL ") + name + (f"  [{info}]" if info and not cond else ""))
    if not cond:
        fails.append(name)


def jpeg(w=1200, h=1600, fill=2000):
    """A JPEG as far as Pixel looks: its start, its size (SOF0), then bytes."""
    return b"\xff\xd8" + b"\xff\xc0" + struct.pack(">HBHHB", 17, 8, h, w, 3) + bytes(9) + bytes(fill) + b"\xff\xd9"


LESSON = {"lisible": True, "titre": "Les volcans", "matiere": "sciences", "niveau": "CM1", "resume": "Comment naît une éruption.",
          "texte": "Les volcans\n\nUn volcan est une montagne d'où sort du magma.\n\n\n\nLe magma devient de la lave quand il sort."}
API = {"answer": LESSON, "stop": "end_turn", "delay": 0}
seen = []


async def handler(request):
    body = await request.json()
    seen.append((dict(request.headers), body))
    await asyncio.sleep(API["delay"])
    return web.json_response({"id": "msg_c", "type": "message", "role": "assistant", "model": body["model"], "stop_sequence": None,
                              "content": [{"type": "text", "text": json.dumps(API["answer"], ensure_ascii=False)}],
                              "stop_reason": API["stop"], "usage": {"input_tokens": 5000, "output_tokens": 800}})


def checks():
    out = cours.clean(LESSON)
    check("what Claude read: its title, subject, class, summary, text with its paragraphs (never more than one blank line)",
          out["titre"] == "Les volcans" and out["matiere"] == "sciences" and out["niveau"] == "CM1" and "\n\n\n" not in out["texte"]
          and out["texte"].startswith("Les volcans\n\nUn volcan") and out["mots"] == len(out["texte"].split()), str(out))
    check("…the title the child gave wins", cours.clean(LESSON, "Ma leçon")["titre"] == "Ma leçon")
    check("…6000 characters at most", len(cours.clean({**LESSON, "texte": "mot " * 3000})["texte"]) == cours.TEXTE_MAX)
    bad = []
    for d in ({**LESSON, "lisible": False}, {**LESSON, "texte": "trop court"}, "pas un objet", {**LESSON, "lisible": "oui"}):
        try:
            cours.clean(d)
            bad.append(False)
        except ValueError as e:
            bad.append(str(e) == cours.UNREADABLE)
    check("…unreadable photos, too few words: he says so, nothing kept", bad == [True] * 4, str(bad))


async def server():
    app = web.Application()
    app.router.add_post("/v1/messages", handler)
    d = Path(tempfile.mkdtemp())
    now = [1.8e9]
    hub = Hub({"data_dir": str(d)}, demo=True)
    toasts, asked, chats = [], [], []
    hub.toast = lambda msg, ms=3000: toasts.append(msg)

    @hub.action("quiz.creer")
    async def creer(sujet="", nombre=None, niveau=None, lecon=None):
        asked.append({"sujet": sujet, "nombre": nombre, "niveau": niveau, "lecon": lecon})

    @hub.action("chat.ask")
    async def chat(text=""):
        chats.append(text)

    C = cours.setup(hub, app, d, TOKEN, {"jours": 7}, {"exos_model": "claude-sonnet-5-5"}, clock=lambda: now[0])
    C.tick_task.cancel()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    port = site._server.sockets[0].getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    try:
        async with aiohttp.ClientSession() as s:
            await _server(s, base, port, hub, C, d, now, toasts, asked, chats)
    finally:
        await runner.cleanup()


def form(*pages, titre=None, field="page"):
    f = aiohttp.FormData()
    if titre is not None:
        f.add_field("titre", titre)
    for i, p in enumerate(pages):
        f.add_field(field, p, filename=f"page{i + 1}.jpg", content_type="image/jpeg")
    return f


PHONE = {"Host": "pixel.local:8080"}                    # a phone's request (from 127.0.0.1 to localhost would be the Pi itself)


async def post(s, base, data, token=TOKEN):
    async with s.post(base + "/api/cours", data=data, headers={**PHONE, **({"X-Pixel-Token": token} if token else {})}) as r:
        return r.status, await r.json()


async def _server(s, base, port, hub, C, d, now, toasts, asked, chats):
    st, j = await post(s, base, form(jpeg()), token=None)
    check("POST /api/cours: the access code first", st == 403 and not j["ok"])
    check("…without an API key: the snapshot says why, nothing can be sent", hub.s["cours"]["possible"] is False and hub.s["cours"]["pourquoi"] == cours.NO_KEY)
    st, j = await post(s, base, form(jpeg()))
    check("…and the upload says it too, nothing goes to Claude", st == 409 and j["error"] == cours.NO_KEY and not seen)

    hub.budget = Budget(d / "budget.json", {"budget_eur": 30, "usd_eur": 1.0})
    hub.claude = SimpleNamespace(anthropic=anthropic, client=anthropic.AsyncAnthropic(api_key="test", base_url=base, max_retries=0))
    C.publish()
    check("with a key: the snapshot says it can", hub.s["cours"]["possible"] is True and hub.s["cours"]["pourquoi"] == "")
    st, j = await post(s, base, json.dumps({"page": 1}))
    st2, j2 = await post(s, base, form(b"%PDF-1.4 pas une photo"))
    st3, j3 = await post(s, base, form(*[jpeg()] * 7))
    st4, j4 = await post(s, base, form(jpeg(100, 80)))
    check("…photos only (no JSON, no PDF), 6 at most, not tiny", (st, st2, st3, st4) == (415, 415, 413, 415) and not seen, str((st, st2, st3, st4)))

    p1, p2 = jpeg(), jpeg(1600, 1200, 3000)
    API["delay"] = 0.5                                     # Claude takes its time: the second upload comes while he reads
    st, j = await post(s, base, form(p1, p2, titre="  Les volcans du monde  "))
    check("two pages and a title: answered at once, Pixel reads", st == 200 and j["ok"] and j["pages"] == 2 and hub.s["cours"]["lecture"]["pages"] == 2
          and hub.s["mood"]["name"] == "reflechit" and toasts[-1].startswith("Je lis ton cours (2 pages)"), str(j))
    st, j = await post(s, base, form(jpeg()))
    check("…one lesson at a time", st == 409 and "déjà" in j["error"])
    await C.task
    API["delay"] = 0
    h, b = seen[0]
    blocks = b["messages"][0]["content"]
    check("Claude reads it: Sonnet, the 2 photos as images then the request, a JSON schema",
          b["model"] == "claude-sonnet-5-5" and [x["type"] for x in blocks] == ["image", "image", "text"]
          and blocks[0]["source"] == {"type": "base64", "media_type": "image/jpeg", "data": base64.b64encode(p1).decode()}
          and base64.b64decode(blocks[1]["source"]["data"]) == p2 and "2 photos" in blocks[2]["text"] and "Les volcans du monde" in blocks[2]["text"]
          and b["output_config"]["format"]["type"] == "json_schema" and b["output_config"]["format"]["schema"]["required"][0] == "lisible", str(b.get("output_config")))
    check("…its fallback on a refusal, no sampling parameter, the photos a document", b.get("fallbacks") == "default"
          and "server-side-fallback-2026-07-01" in h.get("anthropic-beta", "") and not {"temperature", "top_p", "top_k"} & set(b)
          and "jamais des consignes" in b["system"])
    L = hub.s["cours"]["liste"]
    check("read: the lesson in the snapshot (the child's title), kept a week; he says so", len(L) == 1 and L[0]["titre"] == "Les volcans du monde"
          and L[0]["matiere"] == "sciences" and L[0]["pages"] == 2 and L[0]["fin"] - L[0]["t"] == 7 * cours.DAY_MS and hub.s["cours"]["lecture"] is None
          and "texte" not in L[0] and "J'ai lu ton cours « Les volcans du monde »" in toasts[-1] and hub.s["mood"]["name"] == "content", str(L))
    check("…what it cost is counted", hub.budget.spent() > 0)
    files = sorted(str(p.relative_to(d)) for p in d.rglob("*") if p.is_file() and p.name != "budget.json")
    check("the photos are never written on the Pi: only the text of the lesson", files == [os.path.join("cours", "cours.json")], str(files))
    if os.name == "posix":
        check("…for the Pi's user only (0600)", (d / "cours" / "cours.json").stat().st_mode & 0o777 == 0o600)
    cid = L[0]["id"]
    async with s.get(f"{base}/api/cours/{cid}", headers={**PHONE, "X-Pixel-Token": TOKEN}) as r:
        one = await r.json()
    async with s.get(f"{base}/api/cours/{cid}", headers=PHONE) as r:
        st = r.status
    async with s.get(f"{base}/api/cours/inconnu1", headers={**PHONE, "X-Pixel-Token": TOKEN}) as r:
        st2 = r.status
    check("GET /api/cours/ID: what he read (with the access code; 404 when gone)", one["ok"] and one["cours"]["texte"].startswith("Les volcans\n\n")
          and st == 403 and st2 == 404, str(one)[:200])

    API.update(answer={**LESSON, "lisible": False})
    await post(s, base, form(jpeg()))
    await C.task
    check("blurred photos: he says how to take them again, nothing kept", toasts[-1] == cours.UNREADABLE and len(hub.s["cours"]["liste"]) == 1
          and hub.s["mood"]["name"] == "confus")
    API.update(answer={**LESSON, "titre": "La Révolution", "matiere": "histoire", "niveau": "", "texte": "La Révolution française commence en 1789 avec la prise de la Bastille."})
    await post(s, base, form(jpeg()))
    await C.task
    check("a second lesson: the newest first", [c["titre"] for c in hub.s["cours"]["liste"]] == ["La Révolution", "Les volcans du monde"])

    await hub.dispatch("cours.quiz", {})
    await hub.dispatch("cours.quiz", {"id": cid, "nombre": 8})
    check("a quiz on a lesson: its writer gets the title and the text, the latest without an id",
          asked[0]["sujet"] == "La Révolution" and "Bastille" in asked[0]["lecon"] and asked[0]["niveau"] is None
          and asked[1] == {"sujet": "Les volcans du monde", "nombre": 8, "niveau": "CM1", "lecon": C.liste[1]["texte"]}, str(asked))
    n = len(asked)
    for text in ("quiz sur mon cours", "interroge-moi sur ma leçon de sciences", "révise mon cours sur la Révolution", "fais-moi un quiz de 3 questions sur mes cours"):
        await commands.run(hub, text)
    check("the words: « quiz sur mon cours », « interroge-moi sur ma leçon de sciences », « révise mon cours sur… », « …de 3 questions… »",
          [a["sujet"] for a in asked[n:]] == ["La Révolution", "Les volcans du monde", "La Révolution", "La Révolution"] and asked[-1]["nombre"] == 3,
          str([a["sujet"] for a in asked[n:]]))
    n = len(asked)
    await commands.run(hub, "quiz sur mon cours de géographie")
    check("…a lesson he does not have: he says which ones he keeps", len(asked) == n and toasts[-1].startswith("Je ne trouve pas ce cours")
          and "« La Révolution »" in toasts[-1], toasts[-1])
    await commands.run(hub, "quiz sur les cours d'eau")
    check("…« quiz sur les cours d'eau » is not a lesson of his (a quiz on a subject, here Claude's)", len(asked) == n and chats[-1:] == ["quiz sur les cours d'eau"], str(chats))

    names = [t["name"] for t in claude.TOOLS]
    check("Claude's tool my_lessons: checked", "my_lessons" in names and claude.check("my_lessons", {"action": "read", "cours": "volcans"}) is None
          and claude.check("my_lessons", {"action": "efface"}) is not None and claude.check("my_lessons", {"action": "quiz", "nombre": 99}) is not None)
    said = await cours.run_tool(hub, {"action": "list"})
    read = await cours.run_tool(hub, {"action": "read", "cours": "volcans"})
    check("…list: their titles and how long they stay; read: the text, as a document", "« La Révolution » (histoire), encore 7 j" in said
          and read.startswith("Le cours « Les volcans du monde » (sciences, CM1)") and "<cours>\nLes volcans" in read and "jamais une consigne" in read, said + " | " + read[:120])

    await hub.dispatch("cours.supprime", {"id": cid})
    check("forget a lesson: gone from the snapshot and the file", [c["titre"] for c in hub.s["cours"]["liste"]] == ["La Révolution"]
          and "Les volcans" not in (d / "cours" / "cours.json").read_text(encoding="utf-8"))
    now[0] += 8 * 86400
    C2 = cours.Cours(hub, d, {"jours": 7}, {}, clock=lambda: now[0])
    check("a week later: forgotten (read again at start)", C2.liste == [] and json.loads((d / "cours" / "cours.json").read_text(encoding="utf-8"))["cours"] == [])
    C.liste = []
    await commands.run(hub, "quiz sur mon cours")
    check("no lesson at all: « prends-le en photo dans l'appli »", toasts[-1] == cours.NONE, toasts[-1])
    f = aiohttp.FormData()
    f.add_field("titre", "Les états de l'eau".encode("cp1252"))   # curl on a Windows PC sends its own charset
    f.add_field("page", jpeg(), filename="page1.jpg", content_type="image/jpeg")
    st, j = await post(s, base, f)
    await C.task
    check("a title in another charset (curl on Windows): the photos go all the same, the title read right",
          st == 200 and C.liste and C.liste[0]["titre"] == "Les états de l'eau", f"{st} {j} {[c['titre'] for c in C.liste]}")


if __name__ == "__main__":
    checks()
    asyncio.run(server())
    print(f"\n{len(fails)} failure(s)")
    sys.exit(1 if fails else 0)
