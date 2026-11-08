"""Pixel's personality scenes (web/persona.js): the ones a command ("fais le poisson", "joue la toupie") or Claude can ask for.

The scenes themselves (motion, props, lines) live in web/persona.js; each screen plays them on its own. The server only
says "play this one now" (action scene.play, snapshot "scene"). Same ids and labels as persona.js:
tests/test_persona.js checks that the two lists match.
"""
from . import anims

# id, French label, group: tap (a touch), fache (pestered), calin (petting), retour (you come back), vie (alone), evt (lights, hours)
SCENES = [
    ("coucou", "Coucou", "tap"),
    ("content", "Content", "tap"),
    ("chatouilles", "Chatouilles", "tap"),
    ("oeil", "Le doigt dans l’œil", "tap"),
    ("bonk", "Bonk sur la tête", "tap"),
    ("pousse", "Poussé", "tap"),
    ("ou", "Où ça ?", "tap"),
    ("saut", "Youpi", "tap"),
    ("pirouette", "Pirouette", "tap"),
    ("timide", "Timide", "tap"),
    ("bisou", "Bisou", "tap"),
    ("idee", "Une idée… non", "tap"),
    ("amour", "Je t’aime bien", "tap"),
    ("nuit-tap", "Il est tard", "tap"),
    ("he", "Hé !", "fache"),
    ("impatient", "Pfff", "fache"),
    ("esquive", "Esquive", "fache"),
    ("colere", "En colère", "fache"),
    ("panique", "Au secours", "fache"),
    ("boude", "Il boude", "fache"),
    ("pardon", "Il pardonne", "fache"),
    ("caresse", "Câlin", "calin"),
    ("ronron", "Il s’endort sous les câlins", "calin"),
    ("calme", "Ça va mieux", "calin"),
    ("retour", "Te revoilà", "retour"),
    ("manque", "Tu m’as manqué", "retour"),
    ("bonjour", "Bonjour", "retour"),
    ("bonsoir", "Bonsoir", "retour"),
    ("reveille", "Je dormais pas", "retour"),
    ("joyeux-noel", "Joyeux Noël", "retour"),
    ("bonne-annee", "Bonne année", "retour"),
    ("poisson", "Le poisson", "vie"),
    ("balade", "La balade", "vie"),
    ("cache", "Coucou caché", "vie"),
    ("dvd", "L’économiseur d’écran", "vie"),
    ("toupie", "La toupie", "vie"),
    ("mouche", "La mouche", "vie"),
    ("hoquet", "Le hoquet", "vie"),
    ("atchoum", "L’éternuement", "vie"),
    ("sifflote", "Il sifflote", "vie"),
    ("danse", "La danse en cachette", "vie"),
    ("vitre", "Toc toc", "vie"),
    ("ennui", "L’ennui", "vie"),
    ("sieste", "La sieste", "vie"),
    ("etirement", "Le grand étirement", "vie"),
    ("reverie", "La rêverie", "vie"),
    ("zen", "La méditation", "vie"),
    ("joie", "La joie", "vie"),
    ("gym", "La gym", "vie"),
    ("psst", "Psst", "vie"),
    ("pluie", "Sous la pluie", "vie"),
    ("soleil", "Bronzette", "vie"),
    ("faim", "La faim", "vie"),
    ("nuit", "Bâillements de nuit", "vie"),
    ("neige", "La neige", "vie"),
    ("noir", "Dans le noir", "evt"),
    ("lumiere", "La lumière revient", "evt"),
    ("heure", "Le coucou de l’heure", "evt"),
    ("rdv", "Le rendez-vous", "evt"),
    ("rdv-fin", "Ça s’est bien passé ?", "evt"),
    ("chaud", "Il a chaud", "evt"),
    ("wifi", "Plus de Wi-Fi", "evt"),
    ("wifi-ok", "Le Wi-Fi revient", "evt"),
]
BY_ID = {i: (label, group) for i, label, group in SCENES}
IDS = [i for i, _, _ in SCENES]
LIFE = [i for i, _, g in SCENES if g == "vie"]


def _bare(k):
    """Without the article: "le poisson" -> "poisson", "l'ennui" -> "ennui"."""
    for a in ("le ", "la ", "les ", "l'", "un ", "une ", "des ", "du ", "ton ", "ta ", "il "):
        if k.startswith(a):
            return k[len(a):].strip()
    return k


# what people may type after "fais" or "joue": the id, the label, the label without its article
WORDS = {}
for _i, _label, _g in SCENES:
    for _w in (_i, _i.replace("-", " "), _label):
        _k = anims.key(_w)
        WORDS.setdefault(_k, _i)
        WORDS.setdefault(_bare(_k), _i)
for _w, _i in {"poissons": "poisson", "promenade": "balade", "cache cache": "cache", "dvd": "dvd", "economiseur": "dvd",
               "mouche": "mouche", "eternuer": "atchoum", "eternuement": "atchoum", "siffler": "sifflote", "danse secrete": "danse",
               "dodo": "sieste", "meditation": "zen", "etirement": "etirement", "boude": "boude", "bouder": "boude",
               "colere": "colere", "pirouette": "pirouette", "toupie": "toupie", "hoquet": "hoquet", "gym": "gym",
               "sport": "gym", "reve": "reverie", "coucou cache": "cache"}.items():
    WORDS.setdefault(_w, _i)


def find(text):
    """The scene a few words name, or None."""
    k = anims.key(text)
    return WORDS.get(k) or WORDS.get(_bare(k))
