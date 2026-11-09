"""Pixel and your phone (pixel-mobile, the Android app): its notifications, so that Pixel reacts to them.

    POST /api/notif   {"app": "WhatsApp", "title": "Maman", "category": "msg"}     (title and category optional)

The app's notification listener sends a word for each new notification of the apps the user picked: off by default, the
app's name only, the title (often the sender) only if he allows it, never the text. Pixel shows a toast (« 📱 WhatsApp :
Maman », « 📱 Nouveau message WhatsApp »), and his screens play their 'notif' scenes for it (web/screens.js).
Same access rule as the WebSocket: the Pi itself (from Pixel's own page, not a page of another site on its screen), or the
access code (the X-Pixel-Token header, or ?t=), on the home network only (server.home_only). Not too often: GAP_S per app,
PER_MIN in all. Answers JSON: {"ok": true} or {"ok": false, "error": "..."} (in French, for the phone).
The snapshot carries "telephone": {"last": {"app", "category", "t"} or None}; never the title.
"""
import re
import secrets
import time

from aiohttp import web
from .cast import local_page                # the Pi itself, from Pixel's own page (hardened in the cast reviews)

GAP_S = 8                   # the same app: one toast every 8 s at most (a burst of messages is one reaction)
PER_MIN = 12                # all apps together, in a minute
MAX_BODY = 2048
CATEGORY = re.compile(r"^[a-z_]{1,24}$")          # Android's Notification.category: msg, email, call, event, social...
# without the title, a word for what it is (the scenes of web/scenes/notifs.js read the banner's words)
KIND = {"msg": "Nouveau message {}", "email": "Nouvel e-mail {}", "call": "Appel {}", "missed_call": "Appel manqué {}",
        "event": "Rappel {}", "reminder": "Rappel {}", "alarm": "Alarme {}"}


def now_s():
    return time.time()


def clean(v, n):
    """One line of plain text, n characters at most (cut with …); '' for anything that is not text."""
    if not isinstance(v, str):
        return ""
    s = re.sub(r"\s+", " ", "".join(c if c.isprintable() else " " for c in v)).strip()
    return s if len(s) <= n else s[:n - 1].rstrip() + "…"


def has_access(request, token):
    """The Pi itself, from Pixel's own page (the same check as the WebSocket and the cast: cast.local_page, so no frame with
    Origin null, no DNS rebinding, no proxy), or the access code."""
    if local_page(request):
        return True
    given = (request.headers.get("X-Pixel-Token"), request.query.get("t"))
    return any(g and secrets.compare_digest(g.encode(), token.encode()) for g in given)


def toast_text(app, title, category):
    if title:
        return f"📱 {app} : {title}"
    return "📱 " + KIND.get(category or "", "{}").format(app)


def setup(hub, app, token):
    T = hub.s.setdefault("telephone", {"last": None})
    sent = {"apps": {}, "all": []}          # when each app last spoke, and the last minute's toasts

    def fail(status, msg):
        return web.json_response({"ok": False, "error": msg}, status=status)

    async def notif(request):
        if not has_access(request, token):
            return fail(403, "Code d'accès manquant : scanne à nouveau le QR code de Pixel.")
        if request.content_type != "application/json":
            return fail(415, "Envoie du JSON.")
        if request.content_length is None or request.content_length > MAX_BODY:
            return fail(413, "Requête trop longue.")
        try:
            d = await request.json()
        except Exception:
            return fail(400, "Requête illisible.")
        if not isinstance(d, dict):
            return fail(400, "Requête illisible.")
        name = clean(d.get("app"), 40)
        if not name:
            return fail(400, "Il manque le nom de l'appli.")
        title = clean(d.get("title"), 60)
        cat = d.get("category") if isinstance(d.get("category"), str) and CATEGORY.match(d.get("category")) else None
        t, key = now_s(), name.casefold()
        sent["all"] = [x for x in sent["all"] if t - x < 60]
        if t - sent["apps"].get(key, -1e9) < GAP_S or len(sent["all"]) >= PER_MIN:
            return fail(429, "Trop de notifications d'un coup : Pixel en laisse passer quelques-unes.")
        sent["apps"][key] = t
        sent["all"].append(t)
        if len(sent["apps"]) > 200:                                        # forget the apps that have been quiet
            sent["apps"] = {k: v for k, v in sent["apps"].items() if t - v < GAP_S}
        T["last"] = {"app": name, "category": cat, "t": t * 1000}
        hub.toast(toast_text(name, title, cat), 4000)
        return web.json_response({"ok": True})

    app.router.add_post("/api/notif", notif)
