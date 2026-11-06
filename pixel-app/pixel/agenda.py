"""Calendar for the Agenda screen: today and tomorrow, from several calendars.

Sources, in any mix:
- Google Calendar's "secret address in iCal format", or any other .ics / webcal:// address
  (iCloud, Outlook, Proton, Nextcloud...), put in config.toml or added from the phone page
  /app/reglages.html;
- .ics (or .vcs) files imported from the phone, e.g. events shared or exported from Samsung
  Calendar. An import is a copy: importing a file with the same name again replaces it.

Samsung Calendar also shows the calendars of the phone's Google account, so events created in one
of them reach Pixel through the Google address, with nothing to import.
Calendar addresses are secrets: they are saved on the Pi only (agenda.json, mode 600) and never
sent to the screens, which only get a name, a host and a count.
"""
import asyncio
import datetime as dt
import hashlib
import json
import logging
import os
import time
from pathlib import Path
from urllib.parse import urlparse

import aiohttp

log = logging.getLogger("pixel.agenda")
COLORS = ["#4285f4", "#e8384f", "#21a366", "#f5a623", "#9b59b6", "#16a085", "#ff7aa8"]
MAX_ICS = 5 * 1024 * 1024
DAYS = 2                                          # today and tomorrow
EMPTY = "Ajoute ton agenda depuis l'appli sur ton téléphone : Réglages > Agendas."


class CalError(Exception):
    """A calendar problem worth showing to the user, in French."""


def demo():
    ev = [(0, 10, 10.5, "Stand-up", "demo1"), (0, 14, 15, "Réunion d'équipe", "demo1"), (0, 17.5, 18.25, "Dentiste", "demo2"),
          (1, 9.5, 11, "Atelier impression 3D", "demo1"), (1, 12.5, 13.5, "Déjeuner avec Léa", "demo2"), (1, 16, 17, "Relire la PR de Codex", "demo1")]
    color = {"demo1": COLORS[0], "demo2": COLORS[1]}
    return {"status": "démo",
            "events": [{"day": d, "start": s, "end": e, "title": t, "allday": False, "cal": c, "color": color[c]} for d, s, e, t, c in ev],
            "calendars": [{"id": "demo1", "name": "Perso (Google)", "kind": "url", "source": "calendar.google.com", "count": 4, "ok": True,
                           "error": "", "color": COLORS[0], "removable": False},
                          {"id": "demo2", "name": "Samsung (importé)", "kind": "file", "source": "fichier importé", "count": 2, "ok": True,
                           "error": "", "color": COLORS[1], "removable": False}]}


def hours(t):
    return t.hour + t.minute / 60 + t.second / 3600


def normalize_url(url):
    u = url.strip()
    if u.lower().startswith("webcal://"):
        u = "https://" + u[9:]
    p = urlparse(u)
    if p.scheme not in ("http", "https") or not p.netloc:
        raise CalError("ce n'est pas une adresse web (https://… ou webcal://…)")
    return u


def parse(data):
    import icalendar
    head = data[:4096].lstrip(b"\xef\xbb\xbf \r\n\t").upper()
    if not head.startswith(b"BEGIN:VCALENDAR"):
        raise CalError("ce n'est pas un agenda (.ics)")
    try:
        return icalendar.Calendar.from_ical(data)
    except Exception as e:                        # icalendar raises many types on broken files
        raise CalError("fichier d'agenda illisible") from e


async def fetch(http, url):
    async with http.get(url, headers={"User-Agent": "Pixel/1.0 (calendar reader)"}) as r:
        if r.status == 404:
            raise CalError("adresse introuvable (erreur 404)")
        if r.status in (401, 403):
            raise CalError("accès refusé : copie l'adresse secrète, pas l'adresse publique")
        if r.status >= 400:
            raise CalError(f"le serveur répond une erreur {r.status}")
        data = await r.content.read(MAX_ICS + 1)
        if len(data) > MAX_ICS:
            raise CalError("agenda trop gros (plus de 5 Mo)")
        return data


def why(exc):
    if isinstance(exc, CalError):
        return str(exc)
    if isinstance(exc, (aiohttp.ClientError, asyncio.TimeoutError, OSError)) and not isinstance(exc, FileNotFoundError):
        return "injoignable (pas d'internet ou mauvaise adresse)"
    if isinstance(exc, FileNotFoundError):
        return "fichier importé introuvable"
    return "illisible"


def to_local(t):
    if isinstance(t, dt.datetime):
        return t.astimezone()                     # a naive time is read as local time
    return dt.datetime.combine(t, dt.time()).astimezone()


def day_slices(ev, today):
    """(day, start_h, end_h, allday) for each part of the event that falls on today or tomorrow."""
    s = ev.get("DTSTART").dt
    end = ev.get("DTEND")
    if end is not None:
        f = end.dt
    elif ev.get("DURATION") is not None:
        f = s + ev.get("DURATION").dt
    else:
        f = s if isinstance(s, dt.datetime) else s + dt.timedelta(days=1)
    if not isinstance(s, dt.datetime):            # all-day: dates, the end is exclusive
        f = f.date() if isinstance(f, dt.datetime) else f
        if f <= s:
            f = s + dt.timedelta(days=1)
        for d in range(DAYS):
            if s <= today + dt.timedelta(days=d) < f:
                yield d, 0.0, 24.0, True
        return
    s, f = to_local(s), to_local(f)
    for d in range(DAYS):
        d0 = to_local(today + dt.timedelta(days=d))
        d1 = to_local(today + dt.timedelta(days=d + 1))
        if (s < d1 and f > d0) or (s == f and d0 <= s < d1):
            a, b = max(s, d0), min(f, d1)
            yield d, hours(a) if a > d0 else 0.0, 24.0 if b >= d1 else hours(b), False


def events_from(cal, today, cal_id, color):
    import recurring_ical_events
    start = to_local(today)
    out = []
    for e in recurring_ical_events.of(cal).between(start, start + dt.timedelta(days=DAYS)):
        if str(e.get("STATUS", "")).upper() == "CANCELLED":
            continue
        title = str(e.get("SUMMARY", "") or "").strip() or "(sans titre)"
        uid = str(e.get("UID", "") or "")
        for day, a, b, allday in day_slices(e, today):
            out.append({"day": day, "start": round(a, 4), "end": round(b, 4), "title": title, "allday": allday,
                        "cal": cal_id, "color": color, "_key": (uid or title, day, round(a, 2))})
    return out


class Agenda:
    def __init__(self, hub, cfg):
        self.hub = hub
        datadir = Path(os.path.expanduser(hub.cfg.get("data_dir", "~/.config/pixel")))
        self.file, self.dir = datadir / "agenda.json", datadir / "calendars"
        urls = cfg.get("ics", [])
        urls = [urls] if isinstance(urls, str) else list(urls)
        self.config_cals = []
        for i, u in enumerate(urls):
            try:
                self.config_cals.append({"id": f"config{i}", "kind": "url", "url": normalize_url(str(u)), "name": None})
            except CalError:
                log.warning("config.toml: calendar address ignored: %r", u)
        try:
            saved = json.loads(self.file.read_text())
        except (OSError, ValueError):
            saved = {}
        self.user_cals = [c for c in saved.get("calendars", []) if c.get("id") and c.get("kind") in ("url", "file")]
        self.info = {}                            # id -> {"name", "count", "ok", "error"}
        if hub.demo and not self.user_cals:
            hub.s["agenda"] = demo()
        else:
            hub.s["agenda"] = {"status": "" if self.cals() else EMPTY, "events": [], "calendars": self.public()}
        self._actions()

    # ---- the list of calendars ----
    def cals(self):
        return self.config_cals + self.user_cals

    def _fallback_name(self, c):
        return c.get("name") or (urlparse(c["url"]).netloc if c["kind"] == "url" else "Agenda importé")

    def public(self):
        out = []
        for i, c in enumerate(self.cals()):
            inf = self.info.get(c["id"], {})
            out.append({"id": c["id"], "name": inf.get("name") or self._fallback_name(c), "kind": c["kind"],
                        "source": urlparse(c["url"]).netloc if c["kind"] == "url" else "fichier importé",
                        "count": inf.get("count", 0), "ok": inf.get("ok", True), "error": inf.get("error", ""),
                        "color": COLORS[i % len(COLORS)], "removable": not c["id"].startswith("config")})
        return out

    def _save(self):
        self.file.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.file.with_suffix(".tmp")
        tmp.write_text(json.dumps({"calendars": self.user_cals}, ensure_ascii=False, indent=1))
        os.chmod(tmp, 0o600)
        tmp.replace(self.file)

    # ---- reading ----
    async def _load(self, http, c):
        if c["kind"] == "file":
            return parse((self.dir / c["file"]).read_bytes())
        return parse(await fetch(http, c["url"]))

    async def refresh(self):
        if self.hub.demo and not self.user_cals:
            return
        cals = self.cals()
        if not cals:
            self.hub.s["agenda"] = {"status": EMPTY, "events": [], "calendars": []}
            self.hub.mark()
            return
        try:
            import icalendar  # noqa: F401
            import recurring_ical_events  # noqa: F401
        except ImportError:
            self.hub.s["agenda"] = {"status": "Installe icalendar et recurring-ical-events", "events": [], "calendars": self.public()}
            self.hub.mark()
            return
        today = dt.date.today()
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=20)) as http:
            results = await asyncio.gather(*(self._load(http, c) for c in cals), return_exceptions=True)
        events, seen = [], set()
        for i, (c, res) in enumerate(zip(cals, results)):
            try:
                if isinstance(res, Exception):
                    raise res
                name = c.get("name") or str(res.get("X-WR-CALNAME") or "").strip() or self._fallback_name(c)
                new = []
                for e in events_from(res, today, c["id"], COLORS[i % len(COLORS)]):
                    key = e.pop("_key")
                    if key not in seen:               # the same event in two calendars (e.g. an import of Google events)
                        seen.add(key)
                        new.append(e)
                events += new
                self.info[c["id"]] = {"name": name[:40], "count": len(new), "ok": True, "error": ""}
            except Exception as e:
                log.warning("calendar %s: %r", c["id"], e)
                self.info[c["id"]] = {"name": self._fallback_name(c), "count": 0, "ok": False, "error": why(e)}
        events.sort(key=lambda e: (e["day"], not e["allday"], e["start"], e["title"]))
        bad = [self.info[c["id"]]["name"] for c in cals if not self.info[c["id"]]["ok"]]
        status = "ok" if not bad else f"Agenda en erreur : {bad[0]}" if len(bad) == 1 else f"{len(bad)} agendas en erreur"
        self.hub.s["agenda"] = {"status": status, "events": events, "calendars": self.public()}
        self.hub.mark()

    # ---- actions (from the phone page and the Stream Deck) ----
    def _actions(self):
        h = self.hub

        @h.action("agenda.refresh")
        async def _refresh():
            await self.refresh()
            h.toast("AGENDA À JOUR")

        @h.action("agenda.add")
        async def _add(url, name=None):
            try:
                u = normalize_url(str(url))
                if any(c.get("url") == u for c in self.cals()):
                    raise CalError("cet agenda est déjà ajouté")
                async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=20)) as http:
                    parse(await fetch(http, u))
            except Exception as e:
                return h.toast("ADRESSE REFUSÉE : " + why(e), 7000)
            cid = "u" + hashlib.sha1(u.encode()).hexdigest()[:10]
            self.user_cals.append({"id": cid, "kind": "url", "url": u, "name": (str(name).strip()[:40] or None) if name else None})
            self._save()
            await self.refresh()
            inf = self.info.get(cid, {})
            h.toast(f"AGENDA AJOUTÉ : {inf.get('name', '')} ({inf.get('count', 0)} rendez-vous aujourd'hui et demain)", 6000)

        @h.action("agenda.import")
        async def _import(text, name=None, fallback=None):
            data = str(text).encode("utf-8")
            try:
                if len(data) > MAX_ICS:
                    raise CalError("fichier trop gros (plus de 5 Mo)")
                cal = parse(data)
            except Exception as e:
                return h.toast("FICHIER REFUSÉ : " + why(e), 7000)
            nm = (str(name).strip() if name else "") or str(cal.get("X-WR-CALNAME") or "").strip() or \
                 (str(fallback).strip() if fallback else "") or "Agenda importé"
            nm = nm[:40]
            old = next((c for c in self.user_cals if c["kind"] == "file" and c.get("name") == nm), None)
            cid = old["id"] if old else "f" + hashlib.sha1(f"{nm}{time.time()}".encode()).hexdigest()[:10]
            self.dir.mkdir(parents=True, exist_ok=True)
            (self.dir / f"{cid}.ics").write_bytes(data)
            if not old:
                self.user_cals.append({"id": cid, "kind": "file", "file": f"{cid}.ics", "name": nm})
            self._save()
            await self.refresh()
            verb = "MIS À JOUR" if old else "IMPORTÉ"
            h.toast(f"AGENDA {verb} : {nm} ({self.info.get(cid, {}).get('count', 0)} rendez-vous aujourd'hui et demain)", 6000)

        @h.action("agenda.remove")
        async def _remove(id=None):
            c = next((c for c in self.user_cals if c["id"] == id), None)
            if not c:
                return h.toast("CET AGENDA VIENT DE config.toml : RETIRE-LE LÀ-BAS" if str(id).startswith("config") else "AGENDA INTROUVABLE")
            self.user_cals.remove(c)
            if c["kind"] == "file":
                (self.dir / c["file"]).unlink(missing_ok=True)
            self.info.pop(c["id"], None)
            self._save()
            if self.hub.demo and not self.user_cals:
                self.hub.s["agenda"] = demo()
            else:
                await self.refresh()
            h.toast("AGENDA RETIRÉ")
