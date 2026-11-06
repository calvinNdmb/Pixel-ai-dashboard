"""Checks the non-demo code paths: real weather, an iCal feed, Claude without credentials, Stream Deck key drawing.

    python3 tests/test_real.py

The real weather needs internet (Open-Meteo); without it, or when the service says "too many requests",
that check is skipped (not a failure).
"""
import asyncio
import datetime as dt
import os
import sys
from pathlib import Path

import aiohttp
from aiohttp import web

APP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP))
from pixel.agenda import Agenda  # noqa: E402
from pixel.claude import Claude  # noqa: E402
from pixel.deck import STYLES, Deck  # noqa: E402
from pixel.keys import NAV, THEMES  # noqa: E402
from pixel.state import Hub  # noqa: E402
from pixel.weather import Weather  # noqa: E402

fails = []


def check(name, cond, info=""):
    print(("OK   " if cond else "FAIL ") + name + (f"  [{info}]" if info else ""))
    if not cond:
        fails.append(name)


def ics():
    today = dt.date.today().strftime("%Y%m%d")
    start = (dt.date.today() - dt.timedelta(days=14)).strftime("%Y%m%d")
    return f"""BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//pixel//FR
BEGIN:VEVENT
UID:a@test
DTSTART:{today}T150000
DTEND:{today}T160000
SUMMARY:Appel avec l'équipe
END:VEVENT
BEGIN:VEVENT
UID:b@test
DTSTART;VALUE=DATE:{today}
DTEND;VALUE=DATE:{(dt.date.today() + dt.timedelta(days=1)).strftime('%Y%m%d')}
SUMMARY:Anniversaire de Léa
END:VEVENT
BEGIN:VEVENT
UID:c@test
DTSTART:{start}T090000
DTEND:{start}T093000
RRULE:FREQ=DAILY
SUMMARY:Café
END:VEVENT
END:VCALENDAR
""".replace("\n", "\r\n")


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


async def open_meteo_ok():
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=8)) as http:
            async with http.get("https://api.open-meteo.com/v1/forecast", params={"latitude": 45.75, "longitude": 4.85, "current": "temperature_2m"}) as r:
                return r.status
    except (aiohttp.ClientError, asyncio.TimeoutError, OSError) as e:
        return repr(e)


async def main():
    hub = Hub({}, demo=False)

    status = await open_meteo_ok()
    if status == 200:
        w = Weather(hub, {"city": "Lyon"})
        try:
            await w.refresh()
            wd = hub.s["weather"]
            check("real weather from Open-Meteo", wd and len(wd["days"]) == 5 and wd["city"] == "Lyon", f"{wd['now']} {wd['days'][1]}" if wd else "")
        except Exception as e:
            check("real weather from Open-Meteo", False, repr(e))
    else:
        print(f"SKIP real weather from Open-Meteo: the service answers {status}")

    app = web.Application()
    app.router.add_get("/cal.ics", lambda r: web.Response(body=ics().encode(), content_type="text/calendar"))
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)                 # any free port
    await site.start()
    port = site._server.sockets[0].getsockname()[1]
    ag = Agenda(hub, {"ics": f"http://127.0.0.1:{port}/cal.ics"})
    await ag.refresh()
    ev = hub.s["agenda"]["events"]
    titles = [(e["day"], e["title"], e["allday"]) for e in ev]
    check("iCal: timed event today", (0, "Appel avec l'équipe", False) in titles, str(titles))
    check("iCal: all-day event today", (0, "Anniversaire de Léa", True) in titles)
    check("iCal: daily recurring event today and tomorrow", (0, "Café", False) in titles and (1, "Café", False) in titles)
    await runner.cleanup()

    os.environ.pop("ANTHROPIC_API_KEY", None)
    c = Claude(hub, {})
    check("Claude without credentials falls back to demo replies", c.C["status"] in ("prêt", "démo (pas de clé API)"), c.C["status"])
    await c.send("raconte une blague")
    check("chat still answers", "servos" in hub.s["chat"]["messages"][-1]["text"] or hub.s["chat"]["messages"][-1]["text"], hub.s["chat"]["messages"][-1]["text"][:80])

    d = Deck(hub, {})
    d.deck = FakeDeck()
    d.sync(hub.snapshot())
    await asyncio.sleep(0.5)
    check("Stream Deck: 15 keys drawn", len(d.deck.images) == 15, str(sorted(d.deck.images)))
    check("Stream Deck: brightness set", d.deck.brightness == 70)
    n = len(d.deck.images)
    hub.s["screen"] = "minuteur"
    d.deck.images.clear()
    d.sync(hub.snapshot())
    await asyncio.sleep(0.5)
    check("Stream Deck: only changed keys redrawn", 0 < len(d.deck.images) < n, str(sorted(d.deck.images)))
    hub.s["screen"] = "reglages"
    d.sync(hub.snapshot())
    await asyncio.sleep(0.4)
    for theme in list(THEMES)[1:] + list(THEMES)[:1]:          # every theme redraws every key in its own colours and font
        hub.s["view"]["theme"] = theme
        d.deck.images.clear()
        d.sync(hub.snapshot())
        await asyncio.sleep(0.4)
        check(f"Stream Deck: theme {theme} redraws the keys", len(d.deck.images) == 15, str(len(d.deck.images)))
        raw = d._image("Pause\ncafé", STYLES[theme]["act"], STYLES[theme]["bg"], tuple(STYLES[theme]["font"]))
        check(f"Stream Deck: theme {theme} key image is a JPEG", raw[:2] == b"\xff\xd8", str(type(raw)))
    check("Stream Deck: the Réglages row names the theme", d.cache[len(NAV) + 3][0] == "Thème\n" + THEMES[theme], str(d.cache[len(NAV) + 3][0]))
    print("\n%d failure(s)" % len(fails))
    sys.exit(1 if fails else 0)


asyncio.run(main())
