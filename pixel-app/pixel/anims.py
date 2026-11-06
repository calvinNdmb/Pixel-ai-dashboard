"""The 52 animations of the user's pack (web/pack52/animations.json), loaded once."""
import json
import unicodedata
from pathlib import Path

MANIFEST = Path(__file__).resolve().parent.parent / "web" / "pack52" / "animations.json"
ANIMS = json.loads(MANIFEST.read_text(encoding="utf-8"))["animations"]
BY_ID = {a["id"]: a for a in ANIMS}
IDS = [a["id"] for a in ANIMS]
SHOW = [a["id"] for a in ANIMS if a["group"] != "Idle"]       # the 34 expressions, activities and states ("Anim +")
GROUPS = ["Humeurs", "Émotions", "Activités", "Système", "Repos", "Idle"]


def key(s):
    """Lower case, no accents, no punctuation: "Clin d’œil" -> "clin d'oeil", "Eurêka !" -> "eureka"."""
    s = unicodedata.normalize("NFD", str(s).lower().strip().replace("œ", "oe").replace("æ", "ae").replace("’", "'"))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return " ".join("".join(c if c.isalnum() or c in "' " else " " for c in s).split())


# what people may type after "anim": the id ("clin-oeil", or "clin oeil") or the French label ("clin d'oeil", "bravo")
WORDS = {}
for a in ANIMS:
    for w in (a["id"], a["id"].replace("-", " "), a["label"]):
        WORDS.setdefault(key(w), a["id"])


def loops(anim_id):
    """How many times an animation plays when asked for: short ones twice."""
    return 2 if BY_ID[anim_id]["duration"] <= 4 else 1
