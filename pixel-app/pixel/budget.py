"""What Claude costs this month, with an API key: a counter and a ceiling ([claude] budget_eur in config.toml).

Every answer of the API says how many tokens it used (usage); add() turns them into dollars with the public prices of the
model that really answered (PRICES, per million tokens: input, output; a cache read costs 0.1 × the input price, a cache
write 1.25 ×), then into euros ([claude] usd_eur, 0.92 by default). The month's total is kept in data_dir/budget.json and
starts again at zero on the 1st. Once the ceiling is reached, ok() is False: Pixel stops calling Claude until next month
and says so (pixel/claude.py, pixel/quiz.py). No ceiling (0, or no budget_eur line): it only counts.

It is an estimate, made on the Pi: prices change, and other programs may use the same key. The real ceiling is the
spending limit set in the Claude Console for the key's workspace.
"""
import datetime as dt
import json
import logging
import os
from pathlib import Path

log = logging.getLogger("pixel.budget")
# $ per million tokens (input, output), by the start of the model's name; Haiku 5.5 costs 5 × more on a prompt over 100K tokens
PRICES = {"claude-haiku-5-5": (0.10, 0.50), "claude-haiku": (1.0, 5.0), "claude-sonnet-5": (2.0, 10.0), "claude-sonnet": (3.0, 15.0),
          "claude-opus-5-5": (4.0, 20.0), "claude-opus": (5.0, 25.0), "claude-fable-5-2": (8.0, 40.0)}
UNKNOWN = (10.0, 50.0)             # a model not listed: counted at the dearest price, never too little
HAIKU_LONG = 100_000
WARN = 0.8                         # a word once 80 % of the month's budget is used


def price(model):
    m = str(model or "")
    for k in sorted(PRICES, key=len, reverse=True):
        if m.startswith(k):
            return PRICES[k]
    return UNKNOWN


def cost_usd(model, usage):
    """The price of one answer. usage: the API's usage object (or a dict with the same names)."""
    get = (lambda k: usage.get(k)) if isinstance(usage, dict) else (lambda k: getattr(usage, k, None))
    n = {k: max(0, int(get(k) or 0)) for k in ("input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens")}
    pin, pout = price(model)
    if str(model or "").startswith("claude-haiku-5-5") and n["input_tokens"] + n["cache_read_input_tokens"] + n["cache_creation_input_tokens"] > HAIKU_LONG:
        pin, pout = pin * 5, pout * 5
    return (n["input_tokens"] * pin + n["cache_read_input_tokens"] * pin * 0.1 + n["cache_creation_input_tokens"] * pin * 1.25
            + n["output_tokens"] * pout) / 1e6


def euros(v):
    return f"{v:.2f}".replace(".", ",") + " €"


class Budget:
    def __init__(self, path=None, cfg=None, today=dt.date.today):
        cfg = cfg or {}
        self.path, self.today = (Path(path) if path else None), today
        self.limit = _num(cfg.get("budget_eur"), 0, 10000, 0)        # 0: no ceiling
        self.rate = _num(cfg.get("usd_eur"), 0.1, 10, 0.92)
        self.month, self.usd, self.par_modele, self.warned = self._key(), 0.0, {}, False
        self.on_warn = None                                         # hub.toast
        self._load()

    def _key(self):
        return self.today().strftime("%Y-%m")

    def _load(self):
        try:
            d = json.loads(self.path.read_text()) if self.path and self.path.exists() else {}
        except (OSError, ValueError):
            d = {}
        if isinstance(d, dict) and d.get("mois") == self.month:
            self.usd = _num(d.get("usd"), 0, 1e6, 0)
            pm = d.get("par_modele")
            self.par_modele = {str(k)[:60]: _num(v, 0, 1e6, 0) for k, v in pm.items()} if isinstance(pm, dict) else {}
            self.warned = d.get("prevenu") is True

    def _save(self):
        if not self.path:
            return
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps({"mois": self.month, "usd": round(self.usd, 6), "par_modele": {k: round(v, 6) for k, v in self.par_modele.items()},
                                       "prevenu": self.warned}, ensure_ascii=False, indent=1))
            os.replace(tmp, self.path)
        except OSError as e:
            log.warning("budget.json not saved: %s", e)

    def _roll(self):
        if self._key() != self.month:
            self.month, self.usd, self.par_modele, self.warned = self._key(), 0.0, {}, False

    def add(self, model, usage):
        """Count one answer of the API. Never raises: a counter must not cost an answer."""
        try:
            self._roll()
            c = cost_usd(model, usage)
            self.usd += c
            self.par_modele[str(model)[:60]] = self.par_modele.get(str(model)[:60], 0.0) + c
            if self.limit and not self.warned and self.spent() >= WARN * self.limit:
                self.warned = True
                if self.on_warn:
                    self.on_warn(f"Budget Claude : {euros(self.spent())} sur {euros(self.limit)} ce mois-ci.")
            self._save()
        except Exception:
            log.exception("budget")

    def spent(self):
        self._roll()
        return self.usd * self.rate

    def ok(self):
        return not self.limit or self.spent() < self.limit

    def status(self):
        s = f"{euros(self.spent())} dépensés ce mois-ci"
        return s + (f" sur {euros(self.limit)}" if self.limit else " (pas de plafond)") + " (estimation)"

    STOP = "J'ai dépensé tout mon budget Claude du mois. Je pourrai te répondre à nouveau le 1er !"


def _num(v, lo, hi, default):
    if isinstance(v, bool) or not isinstance(v, (int, float)) or v != v or not lo <= v <= hi:
        return default
    return float(v)
