"""Stream Deck layout: rows 1-2 open a screen, row 3 acts on the open screen."""
NAV = ["visage", "lumieres", "claude", "codex", "meteo", "minuteur", "agenda", "systeme", "reglages", "veille"]
NAMES = {"visage": "Visage", "lumieres": "Lumières", "claude": "Claude", "codex": "Codex", "meteo": "Météo",
         "minuteur": "Minuteur", "agenda": "Agenda", "systeme": "Système", "reglages": "Réglages", "veille": "Veille"}


def K(label, action, **args):
    return {"label": label, "action": action, "args": args}


def row3(screen, s):
    t = s["timer"]
    if screen == "visage":
        return [K("Content", "mood.set", name="content", ms=2500), K("Surpris", "mood.set", name="surpris", ms=1800),
                K("Amoureux", "mood.set", name="amoureux", ms=3000), K("Clin\nd'œil", "mood.set", name="clin", ms=1600),
                K("Endormi", "mood.set", name="endormi")]
    if screen == "lumieres":
        scenes = [K(n[:9], "lights.scene", name=n) for n in s["lights"]["scenes"][:3]]
        return [K("Tout\nallumer", "lights.set", room="*", on=True), K("Tout\néteindre", "lights.set", room="*", on=False)] + scenes + [None] * (3 - len(scenes))
    if screen == "claude":
        return [K("Clavier", "view.toggle", key="osk"), K("Météo ?", "chat.send", text="Quel temps fait-il aujourd'hui ?"),
                K("Agenda ?", "chat.send", text="Qu'est-ce que j'ai aujourd'hui ?"), K("Blague", "chat.send", text="Raconte-moi une blague courte."),
                K("Effacer", "chat.clear")]
    if screen == "codex":
        return [K("Clavier", "view.toggle", key="osk"), K("Relancer", "codex.run"), K("Stop", "codex.stop"), K("Effacer", "codex.clear"), None]
    if screen == "meteo":
        return [K("Aujour-\nd'hui", "view.set", key="meteo_day", value=0), K("Jour −", "view.step", key="meteo_day", d=-1, hi=4),
                K("Jour +", "view.step", key="meteo_day", d=1, hi=4), K("°C / °F", "view.toggle", key="units_f"), K("Annoncer", "weather.say")]
    if screen == "minuteur":
        return [K("Pause" if t["running"] else "Démarrer", "timer.toggle"), K("+5 min", "timer.add", minutes=5),
                K("Remettre\nà zéro", "timer.reset"), K("Pause\ncafé", "timer.start", minutes=5, mode="PAUSE CAFÉ"), K("25 min", "timer.start", minutes=25)]
    if screen == "agenda":
        return [K("Aujour-\nd'hui", "view.set", key="agenda_day", value=0), K("Demain", "view.set", key="agenda_day", value=1),
                K("Actua-\nliser", "agenda.refresh"), None, K("Demander\nà Claude", "chat.ask", text="Qu'est-ce que j'ai aujourd'hui et demain ?")]
    if screen == "systeme":
        return [K("Lumi. −", "sys.bright", d=-0.1), K("Lumi. +", "sys.bright", d=0.1), K("Effet\nCRT", "view.toggle", key="crt_off"),
                K("Démar-\nrage", "sys.boot"), K("Veille", "screen.show", screen="veille")]
    if screen == "reglages":
        return [K("Associer\nHue", "lights.pair"), K("Clavier", "view.toggle", key="osk"), None, None, None]
    if screen == "veille":
        return [K("Réveiller", "screen.show", screen="visage"), None, None, None, None]
    return [None] * 5


def all_keys(s):
    return {"nav": [{"id": i, "label": NAMES[i]} for i in NAV], "row3": {scr: row3(scr, s) for scr in NAV}}
