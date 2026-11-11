"""Word problems written ahead of time by Claude (Haiku), kept in reserve: « un problème » is no longer one of the same few
templates going round (pixel/exos.py g_probleme), but a new one each time.

- A reserve per level (1 to 5) in data_dir/problemes.json: the problems not shown yet. A problem shown leaves it.
- When the reserve of a level runs low (fewer than LOW), one request to Claude writes a batch (BATCH) for that level, in
  the background: the exercise never waits for it. A minute after Pixel starts, the level in use is topped up.
- Each problem is checked here before it goes in: its calculation (numbers, + - * / and brackets) is computed again and
  must give its answer, a whole number; three different wrong answers; lengths that fit his screen. One that fails is
  dropped, and so is one already shown lately.
- [claude] problemes_model in config.toml (claude-haiku-5-5 by default; problemes = false: the templates only). With an
  API key only, within the month's budget (pixel/budget.py): a batch costs 0.1 to 0.2 cent. Without a key (demo,
  a subscription), or while a level's reserve is empty: the templates, as before.
"""
import ast
import asyncio
import json
import logging
import os
import re
from fractions import Fraction
from pathlib import Path

from . import exos

log = logging.getLogger("pixel.problemes")
MODEL = "claude-haiku-5-5"
LEVELS = (1, 2, 3, 4, 5)
LOW, BATCH, KEEP, RECENT = 4, 12, 40, 30      # top up under 4; 12 a request; 40 at most per level; the last 30 shown remembered
START_AFTER = 60                              # s after Pixel starts: the first top-up
TIMEOUT_S = 60
LEN = {"q": 140, "hint": 140, "explication": 220, "calc": 80}
MAX_ANSWER = 100000
NIVEAUX = {1: "CP-CE1 : additions et soustractions jusqu'à 20, une seule étape",
           2: "CE1-CE2 : additions et soustractions jusqu'à 100, petites multiplications (par 2, 5 ou 10)",
           3: "CE2-CM1 : multiplications et divisions simples, problèmes en deux étapes",
           4: "CM1-CM2 : deux ou trois étapes, la monnaie en euros entiers, les durées en minutes",
           5: "6e : proportionnalité, fraction simple d'une quantité, pourcentage simple ; le résultat reste un nombre entier"}
SYSTEM = (
    "Tu écris de petits problèmes de maths pour un enfant. Ils sont joués sur le petit écran de Pixel, un robot de bureau : "
    "l'énoncé, puis quatre réponses à toucher, une seule est juste.\n"
    "Règles :\n"
    "- en français, adapté au niveau indiqué ; des situations variées de la vie d'un enfant (l'école, le sport, la cuisine, "
    "les animaux, les jeux, les courses, les voyages…), parfois avec Pixel ;\n"
    "- la réponse est un nombre entier positif ; l'unité (€, minutes, billes…) est dans l'énoncé, jamais dans la réponse ;\n"
    "- calcul : l'expression qui donne la réponse, avec seulement des nombres, + - * / et des parenthèses, par exemple "
    "« (12 + 8) * 3 » ;\n"
    "- trois mauvaises réponses plausibles (les erreurs qu'un enfant ferait vraiment : la mauvaise opération, une étape "
    "oubliée…), toutes différentes et différentes de la bonne ;\n"
    "- énoncé : 140 caractères au plus ; indice : une phrase courte qui aide sans donner la réponse ; explication : une ou "
    "deux phrases courtes avec le calcul ;\n"
    "- chaque problème différent des autres et de ceux déjà posés ;\n"
    "- pas de Markdown.")
SCHEMA = {"type": "object", "additionalProperties": False, "required": ["problemes"], "properties": {
    "problemes": {"type": "array", "items": {
        "type": "object", "additionalProperties": False,
        "required": ["enonce", "reponse", "mauvaises_reponses", "calcul", "indice", "explication"],
        "properties": {"enonce": {"type": "string"}, "reponse": {"type": "integer"},
                       "mauvaises_reponses": {"type": "array", "items": {"type": "integer"}},
                       "calcul": {"type": "string"}, "indice": {"type": "string"}, "explication": {"type": "string"}}}}}}
OPS = {ast.Add: lambda a, b: a + b, ast.Sub: lambda a, b: a - b, ast.Mult: lambda a, b: a * b, ast.Div: lambda a, b: a / b}


def compute(expr):
    """The exact value of a calculation (numbers, + - * / × ÷ −, brackets), as a Fraction; None for anything else."""
    s = re.sub(r"[\s  ]", "", str(expr or "")).replace("×", "*").replace("÷", "/").replace("−", "-").replace(",", ".")
    if not s or len(s) > LEN["calc"] or not re.fullmatch(r"[\d.+\-*/()]+", s):
        return None

    def ev(n):
        if isinstance(n, ast.Expression):
            return ev(n.body)
        if isinstance(n, ast.Constant) and type(n.value) in (int, float):
            return Fraction(str(n.value))
        if isinstance(n, ast.UnaryOp) and isinstance(n.op, ast.USub):
            return -ev(n.operand)
        if isinstance(n, ast.BinOp) and type(n.op) in OPS:
            a, b = ev(n.left), ev(n.right)
            if isinstance(n.op, ast.Div) and b == 0:
                raise ZeroDivisionError
            return OPS[type(n.op)](a, b)
        raise ValueError("pas un calcul")
    try:
        return ev(ast.parse(s, mode="eval"))
    except (SyntaxError, ValueError, ZeroDivisionError, RecursionError):
        return None


def _int(v):
    return v if isinstance(v, int) and not isinstance(v, bool) and 0 <= v <= MAX_ANSWER else None


def check(p):
    """A problem as Claude wrote it, checked: (q, answer, wrong, hint, explication, calc) for the exercises, or None."""
    if not isinstance(p, dict):
        return None
    q, hint, ex = exos._line(p.get("enonce")), exos._line(p.get("indice")), exos._line(p.get("explication"))
    ans, calc = _int(p.get("reponse")), exos._line(p.get("calcul"))
    if ans is None or not q or not hint or not ex or len(q) > LEN["q"] or len(hint) > LEN["hint"] or len(ex) > LEN["explication"]:
        return None
    if compute(calc) != ans:                       # the calculation must give the answer: a wrong one never shows
        return None
    wrong = []
    for w in p.get("mauvaises_reponses") if isinstance(p.get("mauvaises_reponses"), list) else []:
        if _int(w) is not None and w != ans and w not in wrong:
            wrong.append(w)
    if len(wrong) < 3:
        return None
    return q, ans, wrong[:3], hint, ex, calc


class Reserve:
    def __init__(self, hub, path, cfg=None):
        cfg = cfg or {}
        self.hub, self.path = hub, Path(path) if path else None
        self.model = str(cfg.get("problemes_model") or MODEL)
        self.stock = {lv: [] for lv in LEVELS}        # the problems not shown yet, as Claude wrote them (checked)
        self.recent = {lv: [] for lv in LEVELS}       # the questions shown lately: never again soon, and the writer knows them
        self.busy, self.tasks = set(), set()
        self._load()

    # ---- the file ----
    def _load(self):
        try:
            d = json.loads(self.path.read_text(encoding="utf-8")) if self.path and self.path.exists() else {}
        except (OSError, ValueError):
            d = {}
        d = d if isinstance(d, dict) else {}
        for lv in LEVELS:
            st = (d.get("niveaux") or {}).get(str(lv)) if isinstance(d.get("niveaux"), dict) else None
            self.stock[lv] = [p for p in (st if isinstance(st, list) else []) if check(p)][:KEEP]     # a file edited by hand never stops him
            rc = (d.get("deja") or {}).get(str(lv)) if isinstance(d.get("deja"), dict) else None
            self.recent[lv] = [q for q in (rc if isinstance(rc, list) else []) if isinstance(q, str)][-RECENT:]

    def _save(self):
        if not self.path:
            return
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps({"niveaux": {str(lv): self.stock[lv] for lv in LEVELS}, "deja": {str(lv): self.recent[lv] for lv in LEVELS}},
                                      ensure_ascii=False, indent=1), encoding="utf-8")
            os.replace(tmp, self.path)
        except OSError as e:
            log.warning("problemes.json non enregistré : %s", e)

    # ---- the exercises take one ----
    def take(self, lv):
        """A problem of this level out of the reserve (exos.g_probleme), as a template's tuple; None when there is none (the
        templates then). Low: the reserve is topped up in the background."""
        lv = min(5, max(1, int(lv or 1)))
        st, got = self.stock[lv], None
        while st and got is None:
            p = st.pop(0)
            got = check(p)
            if got and got[0] in self.recent[lv]:
                got = None
        if got:
            self.recent[lv] = (self.recent[lv] + [got[0]])[-RECENT:]
            self._save()
        if len(st) < LOW:
            self.want(lv)
        return (*got, None) if got else None                 # None: the steps of near values (exos._choices), the default ones

    # ---- Claude writes them ----
    def can(self):
        """Claude can write: an API key, and the month's budget not spent."""
        c, b = getattr(self.hub, "claude", None), getattr(self.hub, "budget", None)
        return getattr(c, "client", None) is not None and (b is None or b.ok())

    def want(self, lv):
        """Top up this level in the background (once at a time per level), when Claude can write."""
        if lv in self.busy or not self.can():
            return None
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:                                  # no event loop (a test of its own): later
            return None
        self.busy.add(lv)
        t = loop.create_task(self._fill(lv))
        self.tasks.add(t)
        t.add_done_callback(self.tasks.discard)
        return t

    async def _fill(self, lv):
        try:
            got = await self.write(lv, BATCH)
            known = {check(p)[0] for p in self.stock[lv]} | set(self.recent[lv])
            new = [p for p in got if check(p)[0] not in known]
            self.stock[lv] = (self.stock[lv] + new)[:KEEP]
            self._save()
            log.info("problèmes : %d de niveau %d écrits par %s (%d en réserve)", len(new), lv, self.model, len(self.stock[lv]))
        except Exception as e:                               # noqa: BLE001 - the templates are there meanwhile
            log.warning("problèmes de niveau %d non écrits : %s", lv, e)
        finally:
            self.busy.discard(lv)

    def ask(self, lv, n):
        """The request: the level and how many, then the questions shown lately (not to write them again)."""
        parts = [f"Niveau {lv} : {NIVEAUX[lv]}.", f"Écris {n} problèmes."]
        if self.recent[lv]:
            parts.append("Déjà posés, à ne pas refaire :\n" + "\n".join(f"- {q}" for q in self.recent[lv][-10:]))
        return "\n".join(parts)

    async def write(self, lv, n):
        """One request to Claude: the problems it wrote that pass the checks (as it wrote them)."""
        c = self.hub.claude
        A, budget = c.anthropic, getattr(self.hub, "budget", None)
        try:
            resp = await c.client.with_options(timeout=TIMEOUT_S).beta.messages.create(
                model=self.model, max_tokens=12000, system=SYSTEM, messages=[{"role": "user", "content": self.ask(lv, n)}],
                output_config={"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}})
        except A.APIStatusError as e:
            raise ValueError(f"erreur de l'API ({e.status_code})") from None
        except A.APIConnectionError:
            raise ValueError("pas d'internet") from None
        if budget is not None:
            budget.add(resp.model, resp.usage)
        if resp.stop_reason != "end_turn":
            raise ValueError(f"réponse arrêtée ({resp.stop_reason})")
        text = next((b.text for b in resp.content if b.type == "text"), "")
        try:
            items = json.loads(text).get("problemes")
        except (ValueError, AttributeError):
            raise ValueError("réponse illisible") from None
        items = items if isinstance(items, list) else []
        ok = [p for p in items if check(p)]
        if len(ok) < len(items):
            log.info("problèmes : %d écartés sur %d (calcul faux, réponses en double ou trop long)", len(items) - len(ok), len(items))
        return ok

    async def start(self, delay=START_AFTER):
        """A minute after Pixel starts: the level he plays at (and the next one) topped up."""
        await asyncio.sleep(delay)
        ex = getattr(self.hub, "exos", None)
        lv = min(5, max(1, int(ex.level("probleme")))) if ex else 2
        for level in sorted({lv, min(5, lv + 1)}):
            if len(self.stock[level]) < LOW:
                self.want(level)


def setup(hub, cfg=None, datadir=None):
    """hub.problemes, and the exercises take their word problems from it (exos.RESERVE). cfg: [claude] of config.toml."""
    cfg = cfg if cfg is not None else hub.cfg.get("claude", {})
    if cfg.get("problemes") is False:                         # [claude] problemes = false: the templates only
        exos.RESERVE = None
        return None
    datadir = Path(datadir) if datadir else Path(os.path.expanduser(hub.cfg.get("data_dir", "~/.config/pixel")))
    r = Reserve(hub, datadir / "problemes.json", cfg)
    hub.problemes = exos.RESERVE = r
    try:
        r.start_task = asyncio.get_running_loop().create_task(r.start())
    except RuntimeError:                                      # no event loop: nothing ahead of time
        r.start_task = None
    return r
