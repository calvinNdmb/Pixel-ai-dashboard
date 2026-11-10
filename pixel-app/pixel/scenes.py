"""Pixel's personality scenes (web/persona.js): the ones a command ("fais le poisson", "joue la toupie") or Claude can ask for.

The scenes themselves (motion, props, lines) live in web/persona.js; each screen plays them on its own. The server only
says "play this one now" (action scene.play, snapshot "scene"). Same ids and labels as persona.js:
tests/test_persona.js checks that the two lists match.
"""
import re
from pathlib import Path

from . import anims

# id, French label, group (tap, fache, calin, retour, vie, evt): read from web/persona.js and the scene packs web/scenes/*.js,
# where every scene starts with S('id', 'Label', 'group', ...). tests/test_persona.js checks this against the running list.
WEB = Path(__file__).resolve().parent.parent / "web"
_S = re.compile(r"""\bS\(\s*'([a-z0-9-]+)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*,\s*'([a-z]+)'""")


def _read():
    out, seen = [], set()
    for f in [WEB / "persona.js", *sorted((WEB / "scenes").glob("*.js"))]:
        text = re.sub(r"/\*.*?\*/", "", f.read_text(encoding="utf-8"), flags=re.S)       # not the examples in the comments
        text = re.sub(r"(?m)^\s*//.*$", "", text)
        for i, label, group in _S.findall(text):
            if i not in seen:
                seen.add(i)
                out.append((i, label.replace("\\'", "'"), group))
    return out


SCENES = _read()
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
    if _i.startswith("ami-"):                   # a friend's visit (pixel/amis.py): they need the friend, no words of their own
        continue
    for _w in (_i, _i.replace("-", " "), _label):
        _k = anims.key(_w)
        WORDS.setdefault(_k, _i)
        WORDS.setdefault(_bare(_k), _i)
for _w, _i in {"poissons": "poisson", "promenade": "balade", "cache cache": "cache", "dvd": "dvd", "economiseur": "dvd",
               "mouche": "mouche", "eternuer": "atchoum", "eternuement": "atchoum", "siffler": "sifflote", "danse secrete": "danse",
               "dodo": "sieste", "meditation": "zen", "etirement": "etirement", "boude": "boude", "bouder": "boude",
               "colere": "colere", "pirouette": "pirouette", "toupie": "toupie", "hoquet": "hoquet", "gym": "gym",
               "sport": "gym", "reve": "reverie", "coucou cache": "cache"}.items():
    WORDS[_w] = _i                              # chosen words win over a scene pack's label (« dodo », « cache cache »)


def find(text):
    """The scene a few words name, or None."""
    k = anims.key(text)
    return WORDS.get(k) or WORDS.get(_bare(k))
