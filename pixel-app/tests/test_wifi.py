"""His Wi-Fi, the server's side (pixel/wifi.py), with the pretend NetworkManager (DemoNM) and no server:

    python3 tests/test_wifi.py

- nmcli's terse lines: escaped ':' and '\\' in a network's name, the locks (open, WPA2, WPA3, the transition, WEP, 802.1X),
  one entry per name (its strongest access point), hidden networks left out, the one in use first;
- what he reads every 10 s: nmcli, the right to use it (polkit), a network up or not and since when, which one, the saved ones;
- the joins, end to end: an open network, a new one with its password, a wrong password (refused, nothing left behind), a
  known one, a known one with a new password (wrong: the old profile stays as it was; right: it replaces the old one),
  enterprise and WEP refused, a password too short refused before nmcli, a network out of reach, one join at a time;
- no right (no polkit rule), no nmcli at all, a timeout: said, never stuck;
- the password never in the snapshot, the log, a toast, nor nmcli's calls except the one that saves it;
- the pieces around: the polkit rule and install.sh, server.py, the page (web/wifi.js before app.js, first of screens.js's ORDER).
"""
import asyncio
import json
import logging
import sys
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP))
from pixel import wifi  # noqa: E402
from pixel.state import Hub  # noqa: E402

fails = []
SECRET = "pixel1234"


def check(name, cond, info=""):
    print(("OK   " if cond else "FAIL ") + name + (f"  [{info}]" if info and not cond else ""))
    if not cond:
        fails.append(name)


class Logs(logging.Handler):
    def __init__(self):
        super().__init__()
        self.lines = []

    def emit(self, record):
        self.lines.append(record.getMessage())


def parsing():
    check("terse fields: an escaped ':' and '\\' stay in the value", wifi.fields("a\\:b:c\\\\:d") == ["a:b", "c\\", "d"], wifi.fields("a\\:b:c\\\\:d"))
    check("nmcli -g values unescaped", wifi.unescape("Les voisins\\:5G\n") == "Les voisins:5G")
    locks = {"": "", "--": "", "WPA2": "wpa", "WPA1 WPA2": "wpa", "WPA3": "wpa3", "WPA2 WPA3": "wpa", "WPA2 802.1X": "entreprise",
             "WPA3 802.1X": "entreprise", "WEP": "wep"}
    got = {k: wifi.lock_of(k) for k in locks}
    check("the locks: open, WPA2, WPA3 alone (SAE), the WPA2/WPA3 transition as WPA2, 802.1X, WEP", got == locks, json.dumps(got))
    out = ("  :Maison:40:WPA2\n *:Maison:82:WPA2\n  ::77:WPA2\n  :--:70:WPA2\n  :Les voisins\\:5G:61:WPA2 WPA3\n  :Café:90:\n"
           "  :Bureau:35:WPA2 802.1X\n  :Bad:x:WPA2\n")
    nets = wifi.parse_nets(out)
    check("one entry per name, the one in use first, then the strongest; hidden names out",
          [n["ssid"] for n in nets] == ["Maison", "Café", "Les voisins:5G", "Bureau", "Bad"], [n["ssid"] for n in nets])
    m = nets[0]
    check("…its strongest access point, and in use", m["signal"] == 82 and m["on"] and m["lock"] == "wpa", m)
    check("…an open one, an unreadable signal as 0", nets[1]["lock"] == "" and nets[-1]["signal"] == 0, nets)
    check("30 networks at most", len(wifi.parse_nets("".join(f"  :n{i}:{i}:WPA2\n" for i in range(50)))) == 30)
    cases = {"password": (4, "Error: Connection activation failed: Secrets were required, but not provided."),
             "absent": (4, "Error: Connection activation failed: The Wi-Fi network could not be found."),
             "perm": (4, "Error: Insufficient privileges."),
             "dhcp": (4, "Error: Connection activation failed: IP configuration could not be reserved (no available address, timeout, etc.)."),
             "timeout": (3, "Error: Timeout expired (40 seconds)."),
             "other": (1, "Error: something else entirely.")}
    got = {k: wifi.explain(rc, t, "Maison")[0] for k, (rc, t) in cases.items()}
    check("nmcli's errors read: password, absent, rights, DHCP, timeout, other", got == {k: k for k in cases}, json.dumps(got))
    check("…said in French, with the network's name", "« Maison »" in wifi.explain(*cases["password"], "Maison")[1])
    check("…another error keeps nmcli's own words, without « Error: »", wifi.explain(1, "Error: odd thing.", "x")[1].endswith("odd thing."))
    pp = wifi.password_problem
    check("WPA2 passwords: 8 to 63 characters, or 64 hex digits", pp("wpa", "1234567") and not pp("wpa", "12345678") and pp("wpa", "x" * 64)
          and not pp("wpa", "a" * 63) and not pp("wpa", "0123456789abcdef" * 4))
    check("WPA3: short ones are NetworkManager's business; an invisible character never", not pp("wpa3", "abc") and pp("wpa", "abcdefgh\n"))


async def joins():
    hub = Hub({}, demo=True)
    w = wifi.setup(hub)
    nm = w.run
    check("--demo: the pretend NetworkManager", isinstance(nm, wifi.DemoNM))
    await w.poll()
    s = hub.s["wifi"]
    check("nmcli answers and Pixel may use it", s["ok"] is True and s["perm"] is True, s)
    check("on « Maison », online, no cable", s["ssid"] == "Maison" and s["online"] and not s["eth"] and s["offline_at"] == 0, s)
    check("the networks around him, known ones marked", [n["ssid"] for n in s["nets"]][0] == "Maison" and s["nets"][0]["known"]
          and not any(n["known"] for n in s["nets"][1:]) and len(s["nets"]) == 5, s["nets"])

    async def join(ssid, password=None):
        t = w.join(ssid, password)
        if t:
            await t
        return s["job"]

    profiles = lambda ssid: [p for p in nm.profiles.values() if p["ssid"] == ssid]   # noqa: E731
    j = await join("Maison")
    check("the network he is on: nothing to do", j["state"] == "ok" and "déjà" in j["msg"] and len(nm.profiles) == 1, j)

    j = await join("Café du coin")
    check("an open network he does not know: joined, saved", j["state"] == "ok" and len(profiles("Café du coin")) == 1
          and nm.profiles[nm.active]["ssid"] == "Café du coin" and s["ssid"] == "Café du coin", j)

    j = await join("Les voisins:5G", "pas-le-bon")
    check("a wrong password: refused, said so", j["state"] == "fail" and j["code"] == "password", j)
    check("…and no profile left with it (nothing wrong for the next boot)", profiles("Les voisins:5G") == [], nm.profiles)

    j = await join("Les voisins:5G")
    check("a network with a password he does not know, without one: asked for", j["state"] == "fail" and j["code"] == "password", j)

    j = await join("Les voisins:5G", "voisins123")
    check("the right password: joined, one profile (a ':' in its name)", j["state"] == "ok" and len(profiles("Les voisins:5G")) == 1
          and nm.profiles[nm.active]["ssid"] == "Les voisins:5G", j)

    j = await join("Maison")
    check("a network he knows: its profile brought up, no new one", j["state"] == "ok" and len(profiles("Maison")) == 1
          and nm.profiles[nm.active]["ssid"] == "Maison", j)

    nm.nets["Maison"]["pw"] = "nouveau-mdp"            # the box got a new password
    old = next(u for u, p in nm.profiles.items() if p["ssid"] == "Maison")
    nm.active = None
    await w.poll()
    j = await join("Maison")
    check("a known network whose password changed: refused, « Retaper » offered (code password)", j["state"] == "fail" and j["code"] == "password", j)
    j = await join("Maison", "toujours-faux")
    check("…a wrong new one: refused, the old profile stays as it was", j["state"] == "fail" and [old] == [u for u, p in nm.profiles.items() if p["ssid"] == "Maison"]
          and nm.profiles[old]["psk"] == SECRET and nm.profiles[old]["name"] == "Maison", nm.profiles)
    j = await join("Maison", "nouveau-mdp")
    ps = profiles("Maison")
    check("…the right new one: joined, it replaces the old profile and takes its name", j["state"] == "ok" and len(ps) == 1 and old not in nm.profiles
          and ps[0]["name"] == "Maison" and ps[0]["psk"] == "nouveau-mdp", nm.profiles)

    n_calls = len(nm.calls)
    j = await join("Maison", "court")
    check("a WPA2 password too short: refused before nmcli saves anything", j["code"] == "password" and "8 à 63" in j["msg"]
          and not any(c[:2] == ["connection", "add"] for c in nm.calls[n_calls:]), j)
    j = await join("Bureau", "x" * 10)
    check("an enterprise network: refused, said why", j["code"] == "lock" and "identifiant" in j["msg"], j)
    j = await join("Vieux routeur", "x" * 10)
    check("a WEP network: refused, said why", j["code"] == "lock" and "WEP" in j["msg"], j)
    j = await join("Nulle part", "x" * 10)
    check("a network out of reach: said so", j["code"] == "absent", j)
    j = await join("", "x")
    check("no name: refused", j["state"] == "fail", j)

    nm.nets["Café du coin"]["pw"] = None
    toasts = []
    hub_toast = hub.toast
    hub.toast = lambda msg, ms=3000: (toasts.append(msg), hub_toast(msg, ms))
    t1 = w.join("Café du coin")
    t2 = w.join("Maison")
    await t1
    check("one join at a time: the second one is refused, said so", t2 is None and any("UN RÉSEAU À LA FOIS" in m for m in toasts), toasts)
    check("a join ends with a toast naming the network", any(m == "WI-FI : CAFÉ DU COIN" for m in toasts), toasts)

    t = w.scan()
    check("a scan from a screen: runs, and not twice in a row", t is not None and w.scan() is None)
    await t
    check("…a new scan asked of NetworkManager (it needs the right)", any("--rescan" in c and c[c.index("--rescan") + 1] == "yes" for c in nm.calls))

    nm.active, nm.eth = None, False
    await w.poll()
    check("no network up: offline, and since when", not s["online"] and s["offline_at"] > 0 and s["ssid"] == "", s)
    since = s["offline_at"]
    await w.poll()
    check("…since the first time it was seen", s["offline_at"] == since)
    nm.eth = True
    await w.poll()
    check("a cable: online again, no Wi-Fi", s["online"] and s["eth"] and s["offline_at"] == 0 and s["ssid"] == "", s)

    snap = json.dumps(hub.s, ensure_ascii=False)
    check("no password anywhere in the snapshot", not any(p in snap for p in (SECRET, "voisins123", "nouveau-mdp", "pas-le-bon", "toujours-faux")))
    check("no password in a toast", not any(p in m for m in toasts for p in (SECRET, "nouveau-mdp")))
    saved = [c for c in nm.calls if any(p in c for p in ("voisins123", "nouveau-mdp", "pas-le-bon", "toujours-faux"))]
    check("a password goes to nmcli only in the call that saves it (connection add)", saved and all(c[:2] == ["connection", "add"] for c in saved), saved)


async def troubles():
    hub = Hub({})
    w = wifi.Wifi(hub, {}, wifi.DemoNM(perm=False))
    await w.poll()
    s = hub.s["wifi"]
    check("no polkit rule: nmcli answers, Pixel may not join (perm false), what is there still read", s["ok"] and s["perm"] is False and s["ssid"] == "Maison", s)
    t = w.join("Les voisins:5G", "voisins123")
    await t
    check("…a join says to run install.sh again", s["job"]["code"] == "perm" and "install.sh" in s["job"]["msg"], s["job"])
    t = w.scan()
    await t
    check("…a scan falls back on NetworkManager's last one", not any("--rescan" in c and c[c.index("--rescan") + 1] == "yes" for c in w.run.calls) and s["nets"])

    async def missing(args):
        raise FileNotFoundError("nmcli")
    hub2 = Hub({})
    w2 = wifi.Wifi(hub2, {}, missing)
    await w2.poll()
    s2 = hub2.s["wifi"]
    check("no nmcli at all: ok false, still online for the screens (no false « Pas de Wi-Fi »)", s2["ok"] is False and s2["online"] is True, s2)
    t = w2.join("Maison", "x" * 10)
    await t
    check("…a join says NetworkManager is missing", s2["job"]["state"] == "fail" and "NetworkManager" in s2["job"]["msg"], s2["job"])
    check("…and no scan", w2.scan() is None)

    async def slow(args):
        await asyncio.sleep(5)
        return 0, "", ""
    w3 = wifi.Wifi(Hub({}), {}, slow)
    rc, _, err = await w3.nm("device", timeout=0.05)
    check("nmcli that does not answer: a timeout, never stuck", rc == 3 and "Timeout" in err, (rc, err))

    async def broken(args):
        if args[:2] == ["connection", "add"]:
            raise RuntimeError("boom")
        return await wifi.DemoNM()(args)
    hub4 = Hub({})
    w4 = wifi.Wifi(hub4, {}, broken)
    await w4.poll()
    logs = Logs()
    logging.getLogger("pixel").addHandler(logs)
    await w4.join("Les voisins:5G", "voisins123")
    logging.getLogger("pixel").removeHandler(logs)
    check("a bug while joining: the job ends (fail), the screens are told", hub4.s["wifi"]["job"]["state"] == "fail", hub4.s["wifi"]["job"])
    check("…and the password is not in the log", logs.lines and not any("voisins123" in x for x in logs.lines), logs.lines)


def pieces():
    rule = (APP / "deploy" / "50-pixel-wifi.rules").read_text(encoding="utf-8")
    need = list(wifi.NEED) + ["org.freedesktop.NetworkManager.enable-disable-wifi"]
    check("the polkit rule: its user only, the actions Pixel needs", '"@USER@"' in rule and all(f'"{a}"' in rule for a in need)
          and "polkit.Result.YES" in rule and "=>" not in rule, "")
    inst = (APP / "deploy" / "install.sh").read_text(encoding="utf-8")
    check("install.sh puts it in /etc/polkit-1/rules.d with the user's name", "deploy/50-pixel-wifi.rules" in inst
          and "/etc/polkit-1/rules.d/50-pixel-wifi.rules" in inst and 's/@USER@/$USER/' in inst)
    srv = (APP / "server.py").read_text(encoding="utf-8")
    check("server.py: the feature started, polled every 10 s", "wifi.setup" in srv and "hub.every(10, wf.poll)" in srv)
    page = (APP / "web" / "index.html").read_text(encoding="utf-8")
    check("index.html loads wifi.js before app.js", 0 < page.find("app/wifi.js") < page.find("app/app.js"))
    sc = (APP / "web" / "screens.js").read_text(encoding="utf-8")
    i = sc.find("const ORDER = [")
    order = [x.split("'")[1] for x in sc[i:sc.find("];", i)].splitlines()[1:] if "'" in x]
    check("screens.js: the Wi-Fi view first of the add-ons' ORDER", order[:1] == ["wifi"], order)
    js = (APP / "web" / "wifi.js").read_text(encoding="utf-8")
    check("web/wifi.js: one add-on, named wifi; nothing an inline script would choke on", js.count("name: '") == 1 and "name: 'wifi'" in js
          and "<script" not in js.lower() and "<!--" not in js)


def main():
    parsing()
    asyncio.run(joins())
    asyncio.run(troubles())
    pieces()
    print(f"\n{len(fails)} failure(s)")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
