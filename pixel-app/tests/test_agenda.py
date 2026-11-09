"""Checks pixel/agenda.py: Google-style iCal feeds, imports (Samsung .vcs), errors, dedupe, privacy, persistence.

    python3 tests/test_agenda.py          # serves its test calendars on port 8111 (AGENDA_PORT=… for another); runs in Paris time
"""
import asyncio
import datetime as dt
import json
import os
import stat
import sys
import tempfile
import time
from pathlib import Path

os.environ["TZ"] = "Europe/Paris"                 # the expected times below are Paris times
time.tzset()

from aiohttp import web  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pixel import agenda as A  # noqa: E402
from pixel.state import Hub  # noqa: E402

PORT = int(os.environ.get("AGENDA_PORT") or 8111)   # AGENDA_PORT=… for another
fails = []


def check(name, cond, info=""):
    print(("OK   " if cond else "FAIL ") + name + (f"  [{info}]" if info and not cond else ""))
    if not cond:
        fails.append(name)


today = dt.date.today()
D = lambda n: (today + dt.timedelta(days=n)).strftime("%Y%m%d")
GOOGLE = f"""BEGIN:VCALENDAR
PRODID:-//Google Inc//Google Calendar 70.9054//EN
VERSION:2.0
X-WR-CALNAME:Perso
X-WR-TIMEZONE:Europe/Paris
BEGIN:VTIMEZONE
TZID:Europe/Paris
BEGIN:STANDARD
DTSTART:19701025T030000
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:19700329T020000
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
UID:meeting@google
DTSTART;TZID=Europe/Paris:{D(0)}T150000
DTEND;TZID=Europe/Paris:{D(0)}T160000
SUMMARY:Réunion d'équipe
END:VEVENT
BEGIN:VEVENT
UID:standup@google
DTSTART;TZID=Europe/Paris:{D(-14)}T090000
DTEND;TZID=Europe/Paris:{D(-14)}T091500
RRULE:FREQ=DAILY
SUMMARY:Stand-up
END:VEVENT
BEGIN:VEVENT
UID:holiday@google
DTSTART;VALUE=DATE:{D(-1)}
DTEND;VALUE=DATE:{D(3)}
SUMMARY:Vacances
END:VEVENT
BEGIN:VEVENT
UID:late@google
DTSTART;TZID=Europe/Paris:{D(0)}T230000
DTEND;TZID=Europe/Paris:{D(1)}T010000
SUMMARY:Soirée
END:VEVENT
BEGIN:VEVENT
UID:cancel@google
DTSTART;TZID=Europe/Paris:{D(0)}T120000
DTEND;TZID=Europe/Paris:{D(0)}T130000
STATUS:CANCELLED
SUMMARY:Annulé
END:VEVENT
BEGIN:VEVENT
UID:old@google
DTSTART;TZID=Europe/Paris:{D(-3)}T100000
DTEND;TZID=Europe/Paris:{D(-3)}T110000
SUMMARY:Passé
END:VEVENT
END:VCALENDAR
""".replace("\n", "\r\n")
DUP = f"""BEGIN:VCALENDAR
VERSION:2.0
X-WR-CALNAME:Travail
BEGIN:VEVENT
UID:meeting@google
DTSTART;TZID=Europe/Paris:{D(0)}T150000
DTEND;TZID=Europe/Paris:{D(0)}T160000
SUMMARY:Réunion d'équipe
END:VEVENT
BEGIN:VEVENT
UID:lunch@work
DTSTART:{D(1)}T113000Z
DTEND:{D(1)}T123000Z
SUMMARY:Déjeuner
END:VEVENT
END:VCALENDAR
""".replace("\n", "\r\n")
VCS = f"""BEGIN:VCALENDAR
VERSION:1.0
BEGIN:VEVENT
SUMMARY:Rendez-vous Samsung
DTSTART:{D(0)}T100000
DTEND:{D(0)}T110000
END:VEVENT
END:VCALENDAR
"""


async def main():
    app = web.Application()
    app.router.add_get("/google.ics", lambda r: web.Response(text=GOOGLE, content_type="text/calendar"))
    app.router.add_get("/dup.ics", lambda r: web.Response(text=DUP, content_type="text/calendar"))
    app.router.add_get("/html", lambda r: web.Response(text="<html><body>Connexion</body></html>", content_type="text/html"))
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", PORT)
    await site.start()
    base = f"http://127.0.0.1:{PORT}"

    tmp = tempfile.mkdtemp()
    hub = Hub({"data_dir": tmp}, demo=False)
    ag = A.Agenda(hub, {})
    check("no calendar yet: helpful status", A.EMPTY == hub.s["agenda"]["status"])
    check("webcal:// becomes https://", A.normalize_url("webcal://calendar.google.com/x/basic.ics") == "https://calendar.google.com/x/basic.ics")
    try:
        A.normalize_url("calendar.google.com/x")
        check("an address without https is refused", False)
    except A.CalError:
        check("an address without https is refused", True)

    await hub.dispatch("agenda.add", {"url": f"{base}/google.ics"})
    s = hub.s["agenda"]
    check("Google calendar added, named from X-WR-CALNAME", "AGENDA AJOUTÉ : Perso" in hub.s["toast"]["msg"], hub.s["toast"]["msg"])
    ev = {(e["day"], e["title"], e["allday"], round(e["start"], 2), round(e["end"], 2)) for e in s["events"]}
    check("timed event today in Paris time (15:00-16:00)", (0, "Réunion d'équipe", False, 15.0, 16.0) in ev, ev)
    check("daily recurring event today and tomorrow", (0, "Stand-up", False, 9.0, 9.25) in ev and (1, "Stand-up", False, 9.0, 9.25) in ev)
    check("multi-day holiday shows on both days", (0, "Vacances", True, 0.0, 24.0) in ev and (1, "Vacances", True, 0.0, 24.0) in ev)
    check("event across midnight is split", (0, "Soirée", False, 23.0, 24.0) in ev and (1, "Soirée", False, 0.0, 1.0) in ev)
    check("cancelled and past events are hidden", not any(t in ("Annulé", "Passé") for _, t, *_ in ev))
    check("events carry their calendar colour", all(e["color"] == A.COLORS[0] for e in s["events"]))
    snap = json.dumps(hub.snapshot(), ensure_ascii=False)
    check("the secret address never reaches the screens", "google.ics" not in snap)
    check("calendar list for the phone", s["calendars"][0]["name"] == "Perso" and s["calendars"][0]["removable"] and s["calendars"][0]["count"] >= 6)

    await hub.dispatch("agenda.add", {"url": f"{base}/google.ics"})
    check("the same address twice is refused", "déjà ajouté" in hub.s["toast"]["msg"])
    await hub.dispatch("agenda.add", {"url": f"{base}/missing.ics"})
    check("404 explained", "404" in hub.s["toast"]["msg"], hub.s["toast"]["msg"])
    await hub.dispatch("agenda.add", {"url": f"{base}/html"})
    check("a web page (not a calendar) is refused", "pas un agenda" in hub.s["toast"]["msg"], hub.s["toast"]["msg"])
    await hub.dispatch("agenda.add", {"url": f"{base}/dup.ics", "name": "Boulot"})
    s = hub.s["agenda"]
    titles = [e["title"] for e in s["events"]]
    check("an event in two calendars is shown once", titles.count("Réunion d'équipe") == 1, titles)
    check("custom name kept", any(c["name"] == "Boulot" for c in s["calendars"]))
    check("UTC event converted", any(e["title"] == "Déjeuner" and e["day"] == 1 for e in s["events"]))

    await hub.dispatch("agenda.import", {"text": VCS, "fallback": "Calendar"})
    check("Samsung .vcs imported", "IMPORTÉ : Calendar" in hub.s["toast"]["msg"], hub.s["toast"]["msg"])
    check("imported event shown at 10:00", any(e["title"] == "Rendez-vous Samsung" and e["start"] == 10.0 for e in hub.s["agenda"]["events"]))
    await hub.dispatch("agenda.import", {"text": VCS.replace("Rendez-vous Samsung", "Dentiste"), "fallback": "Calendar"})
    names = [c["name"] for c in hub.s["agenda"]["calendars"]]
    check("re-import with the same name updates it", "MIS À JOUR" in hub.s["toast"]["msg"] and names.count("Calendar") == 1
          and any(e["title"] == "Dentiste" for e in hub.s["agenda"]["events"]), names)
    await hub.dispatch("agenda.import", {"text": "hello", "fallback": "x"})
    check("a non-calendar file is refused", "FICHIER REFUSÉ" in hub.s["toast"]["msg"])

    f = os.path.join(tmp, "agenda.json")
    check("saved with private permissions (600)", stat.S_IMODE(os.stat(f).st_mode) == 0o600)
    again = A.Agenda(Hub({"data_dir": tmp}, demo=False), {})
    check("calendars come back after a restart", len(again.user_cals) == 3)

    imp = next(c for c in hub.s["agenda"]["calendars"] if c["kind"] == "file")
    await hub.dispatch("agenda.remove", {"id": imp["id"]})
    check("remove an imported calendar", "RETIRÉ" in hub.s["toast"]["msg"] and len(hub.s["agenda"]["calendars"]) == 2
          and not os.listdir(os.path.join(tmp, "calendars")))

    await runner.cleanup()                                      # the internet "goes down"
    await ag.refresh()
    s = hub.s["agenda"]
    check("unreachable calendars are reported, not fatal", s["status"] == "2 agendas en erreur" and not s["calendars"][0]["ok"], s["status"])

    cfg_hub = Hub({"data_dir": tempfile.mkdtemp()}, demo=False)
    A.Agenda(cfg_hub, {"ics": ["webcal://example.com/a.ics", "not a url"]})
    check("config.toml addresses listed, bad ones ignored", [c["source"] for c in cfg_hub.s["agenda"]["calendars"]] == ["example.com"])
    await cfg_hub.dispatch("agenda.remove", {"id": "config0"})
    check("config.toml calendars can't be removed from the phone", "config.toml" in cfg_hub.s["toast"]["msg"])

    dh = Hub({"data_dir": tempfile.mkdtemp()}, demo=True)
    dag = A.Agenda(dh, {})
    check("demo mode shows demo calendars", len(dh.s["agenda"]["calendars"]) == 2 and dh.s["agenda"]["status"] == "démo")
    await dh.dispatch("agenda.import", {"text": VCS, "fallback": "Samsung"})
    check("demo mode: an import replaces the demo data", [c["name"] for c in dh.s["agenda"]["calendars"]] == ["Samsung"])
    await dh.dispatch("agenda.remove", {"id": dh.s["agenda"]["calendars"][0]["id"]})
    check("demo mode: removing it brings the demo back", dh.s["agenda"]["status"] == "démo")
    print(f"\n{len(fails)} failure(s)")


asyncio.run(main())
sys.exit(1 if fails else 0)
