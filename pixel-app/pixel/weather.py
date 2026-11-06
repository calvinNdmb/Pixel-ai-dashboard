"""Weather from Open-Meteo (free, no key needed)."""
import datetime as dt
import logging

import aiohttp

log = logging.getLogger("pixel.weather")
DAYS = ["LUN.", "MAR.", "MER.", "JEU.", "VEN.", "SAM.", "DIM."]
FULL = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]


def kind(code):
    """WMO weather code -> (icon, French label)."""
    if code in (0, 1):
        return "soleil", "Ensoleillé" if code == 0 else "Plutôt ensoleillé"
    if code in (2, 3):
        return "nuage", "Éclaircies" if code == 2 else "Couvert"
    if code in (45, 48):
        return "nuage", "Brouillard"
    if 51 <= code <= 57:
        return "pluie", "Bruine"
    if 61 <= code <= 67 or 80 <= code <= 82:
        return "pluie", "Pluie" if code < 80 else "Averses"
    if 71 <= code <= 77 or code in (85, 86):
        return "neige", "Neige"
    if code >= 95:
        return "orage", "Orage"
    return "nuage", "Nuageux"


def demo():
    rows = [(12, 6, 0, 9, 54), (9, 4, 3, 18, 66), (8, 5, 63, 26, 88), (10, 3, 2, 14, 70), (13, 5, 1, 8, 52)]
    today = dt.date.today()
    days = []
    for i, (hi, lo, code, wind, hum) in enumerate(rows):
        d = today + dt.timedelta(days=i)
        k, label = kind(code)
        days.append({"name": "AUJ." if i == 0 else DAYS[d.weekday()], "full": "Aujourd'hui" if i == 0 else FULL[d.weekday()],
                     "tmax": hi, "tmin": lo, "kind": k, "label": label, "wind": wind, "hum": hum})
    return {"city": "Paris (démo)", "now": {"t": 11, **{k: days[0][k] for k in ("kind", "label", "wind", "hum")}}, "days": days}


class Weather:
    def __init__(self, hub, cfg):
        self.hub, self.cfg = hub, cfg
        self.city = cfg.get("city", "Paris")
        self.lat, self.lon = cfg.get("latitude"), cfg.get("longitude")
        if hub.demo:
            hub.s["weather"] = demo()

        @hub.action("weather.say")
        async def say():
            w = hub.s["weather"]
            if not w:
                return hub.toast("MÉTÉO PAS ENCORE CHARGÉE")
            d = w["days"][hub.s["view"]["meteo_day"]]
            tip = {"pluie": "Prends ton parapluie !", "orage": "Reste au chaud.", "neige": "Couvre-toi bien."}.get(d["kind"], "Pas besoin de parapluie.")
            hub.toast(f"{d['full']} : {d['label'].lower()}, {d['tmin']} à {d['tmax']} °C. {tip}", 7000)

    async def refresh(self):
        if self.hub.demo:
            return
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as http:
            if self.lat is None:
                async with http.get("https://geocoding-api.open-meteo.com/v1/search",
                                    params={"name": self.city, "count": 1, "language": "fr"}) as r:
                    res = (await r.json()).get("results") or []
                if not res:
                    self.hub.s["weather"] = {"error": f"Ville introuvable : {self.city}"}
                    return
                self.lat, self.lon, self.city = res[0]["latitude"], res[0]["longitude"], res[0]["name"]
            params = {"latitude": self.lat, "longitude": self.lon, "timezone": "auto", "forecast_days": 5,
                      "current": "temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m",
                      "daily": "weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,relative_humidity_2m_mean"}
            async with http.get("https://api.open-meteo.com/v1/forecast", params=params) as r:
                j = await r.json()
        c, d = j["current"], j["daily"]
        days = []
        for i, day in enumerate(d["time"]):
            wd = dt.date.fromisoformat(day).weekday()
            k, label = kind(d["weather_code"][i])
            days.append({"name": "AUJ." if i == 0 else DAYS[wd], "full": "Aujourd'hui" if i == 0 else FULL[wd],
                         "tmax": round(d["temperature_2m_max"][i]), "tmin": round(d["temperature_2m_min"][i]), "kind": k, "label": label,
                         "wind": round(d["wind_speed_10m_max"][i]), "hum": round((d.get("relative_humidity_2m_mean") or [0] * 5)[i] or 0)})
        k, label = kind(c["weather_code"])
        self.hub.s["weather"] = {"city": self.city, "days": days,
                                 "now": {"t": round(c["temperature_2m"]), "kind": k, "label": label,
                                         "wind": round(c["wind_speed_10m"]), "hum": round(c["relative_humidity_2m"])}}
        self.hub.mark()
