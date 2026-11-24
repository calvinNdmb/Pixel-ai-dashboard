"""Focus timer (25 min work, 5 min break). A finished work timer wins coins for his shop (pixel/boutique.py)."""
import time


def setup(hub):
    t = hub.s["timer"]

    def now_ms():
        return time.time() * 1000

    def left():
        return max(0.0, (t["ends_at"] - now_ms()) / 1000) if t["running"] else t["left"]

    @hub.action("timer.start")
    async def start(minutes=25, mode="TRAVAIL"):
        m = max(1, min(180, float(minutes)))
        t.update(mode=mode, total=m * 60, left=m * 60, running=True, ends_at=now_ms() + m * 60000)

    @hub.action("timer.toggle")
    async def toggle():
        if t["running"]:
            t.update(left=left(), running=False)
        else:
            if t["left"] <= 0:
                t["left"] = t["total"]
            t.update(running=True, ends_at=now_ms() + t["left"] * 1000)

    @hub.action("timer.add")
    async def add(minutes=5):
        s = float(minutes) * 60
        t["total"] = min(10800, t["total"] + s)
        if t["running"]:
            t["ends_at"] += s * 1000
        else:
            t["left"] = min(t["total"], t["left"] + s)

    @hub.action("timer.reset")
    async def reset():
        t.update(mode="TRAVAIL", total=1500, left=1500, running=False, ends_at=0)

    async def tick():
        if t["running"] and left() <= 0:
            t.update(left=0, running=False)
            if t["mode"] == "TRAVAIL":
                t["done"] += 1
                shop = getattr(hub, "boutique", None)        # 1 coin for every 5 minutes of the timer, 10 at most
                if shop:
                    shop.gagner(min(10, int(t["total"] // 300)), "minuteur")
            hub.toast("MINUTEUR : TERMINÉ !", 5000)
            hub.mood("surpris", 2500)
            hub.mark()

    return tick
