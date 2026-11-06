"""Calendar from one or more iCal (.ics) addresses: today and tomorrow."""
import datetime as dt
import logging

import aiohttp

log = logging.getLogger("pixel.agenda")


def demo():
    ev = [(0, 10, 10.5, "Stand-up"), (0, 14, 15, "Réunion d'équipe"), (0, 17.5, 18.25, "Dentiste"),
          (1, 9.5, 11, "Atelier impression 3D"), (1, 12.5, 13.5, "Déjeuner avec Léa"), (1, 16, 17, "Relire la PR de Codex")]
    return {"status": "démo", "events": [{"day": d, "start": s, "end": e, "title": t, "allday": False} for d, s, e, t in ev]}


def hours(t):
    return t.hour + t.minute / 60


class Agenda:
    def __init__(self, hub, cfg):
        self.hub = hub
        urls = cfg.get("ics", [])
        self.urls = [urls] if isinstance(urls, str) else list(urls)
        hub.s["agenda"] = demo() if hub.demo else {"status": "" if self.urls else "Ajoute l'adresse iCal de ton agenda dans config.toml", "events": []}

        @hub.action("agenda.refresh")
        async def _refresh():
            await self.refresh()
            hub.toast("AGENDA À JOUR")

    async def refresh(self):
        if self.hub.demo or not self.urls:
            return
        try:
            import icalendar
            import recurring_ical_events
        except ImportError:
            self.hub.s["agenda"] = {"status": "Installe icalendar et recurring-ical-events", "events": []}
            return
        today = dt.date.today()
        start = dt.datetime.combine(today, dt.time()).astimezone()
        end = start + dt.timedelta(days=2)
        events = []
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15)) as http:
            for url in self.urls:
                async with http.get(url.replace("webcal://", "https://")) as r:
                    cal = icalendar.Calendar.from_ical(await r.read())
                for e in recurring_ical_events.of(cal).between(start, end):
                    s, f = e.get("DTSTART").dt, (e.get("DTEND") or e.get("DTSTART")).dt
                    allday = not isinstance(s, dt.datetime)
                    if allday:
                        day = (s - today).days
                        events.append({"day": day, "start": 0, "end": 0, "title": str(e.get("SUMMARY", "")), "allday": True})
                        continue
                    s, f = s.astimezone(), f.astimezone()
                    day = (s.date() - today).days
                    if 0 <= day <= 1:
                        events.append({"day": day, "start": hours(s), "end": hours(f) if f.date() == s.date() else 24,
                                       "title": str(e.get("SUMMARY", "")), "allday": False})
        events.sort(key=lambda e: (e["day"], not e["allday"], e["start"]))
        self.hub.s["agenda"] = {"status": "ok", "events": [e for e in events if 0 <= e["day"] <= 1]}
        self.hub.mark()
