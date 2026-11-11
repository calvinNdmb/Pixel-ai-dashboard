"""Pixel's Wi-Fi: the network he is on, the ones around him, and joining one from his own screen (web/wifi.js).

NetworkManager does the work, through nmcli (Raspberry Pi OS Bookworm and later). The Pixel service is not the desktop's
session, so polkit would ask it for a password: deploy/50-pixel-wifi.rules (put in place by deploy/install.sh) lets its
user scan, join and save networks, as the desktop's own Wi-Fi menu lets the person at the screen. Reading what is there
(the device, the last scan) needs no right at all: Système and the reminder « Pas de Wi-Fi » work without the rule.

The snapshot's "wifi":
  ok          nmcli answers here (False: no NetworkManager, the view says so); perm: Pixel may scan and join (False: the
              polkit rule is missing, the view says to run install.sh again; None: not asked yet)
  online      a network is up, Wi-Fi or a cable (eth: a cable); offline_at: since when none is (server ms, 0 while online)
  ssid        the Wi-Fi network he is on ("" when none); signal: its strength in % (0 to 100)
  nets        the networks around him, the one he is on first, then the strongest, 30 at most: {ssid, signal, lock, known,
              on}; lock: "" (open), "wpa", "wpa3", "wep" (too old: not joined), "entreprise" (a login: not joined here)
  scan_at     when they were last read (server ms); scanning: a scan runs now
  job         the last join asked: {id, ssid, state: "connecting" | "ok" | "fail", code, msg, t0}; code says why it failed:
              "password", "absent", "timeout", "perm", "dhcp", "lock", "busy", "other"
The password goes to NetworkManager only, which keeps it in the network's profile (root's, like the desktop menu's): never
in the snapshot, the log, a toast, nor a file of Pixel's. nmcli gets it as an argument, for the second it runs, as when
nmcli is typed by hand on the Pi.

How a join goes:
  - the network he is on: nothing to do;
  - a network he knows (a profile for its name), no password given: that profile is brought up;
  - a network he does not know: a new profile (its name; WPA2 or WPA3 by what the scan saw), brought up; if that fails the
    profile is deleted, so no wrong password waits for the next boot;
  - a network he knows, with a password (« Retaper » after a refusal): a new profile beside the old ones; if it works the
    old ones go and the new one takes the network's name, if not the new one goes and the old ones stay as they were.
--demo: a pretend NetworkManager (DemoNM): a few networks, each with its own password; any other password is refused.
"""
import asyncio
import contextlib
import logging
import os
import re
import time
import uuid as uuidlib

log = logging.getLogger("pixel")

WAIT = 40                  # seconds nmcli waits for a network to take Pixel in
SCAN_GAP = 4               # seconds between two scans asked from a screen
KNOWN_EVERY = 60           # seconds between two readings of the saved networks
MAX_NETS = 30
NEED = ("org.freedesktop.NetworkManager.network-control", "org.freedesktop.NetworkManager.settings.modify.system",
        "org.freedesktop.NetworkManager.wifi.scan")
WIFI_TYPES = ("802-11-wireless", "wifi")
UUID_RE = re.compile(r"\(([0-9a-fA-F-]{36})\)")


def ms():
    return time.time() * 1000


def fields(line):
    """One line of nmcli -t (terse): its fields, split at the ':' that are not escaped (a value says '\\:' and '\\\\')."""
    out, cur, esc = [], [], False
    for ch in line:
        if esc:
            cur.append(ch)
            esc = False
        elif ch == "\\":
            esc = True
        elif ch == ":":
            out.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
    out.append("".join(cur))
    return out


def unescape(value):
    """One value of nmcli -g, as it is (its '\\:' and '\\\\' undone)."""
    return re.sub(r"\\(.)", r"\1", value.rstrip("\r\n"))


def lock_of(security):
    """nmcli's SECURITY ("WPA2", "WPA1 WPA2", "WPA2 WPA3", "WPA3", "WEP", "WPA2 802.1X", "" or "--") -> the lock."""
    s = (security or "").upper().replace("--", "").strip()
    if not s:
        return ""
    if "802.1X" in s or "EAP" in s:
        return "entreprise"
    if "WPA" in s:
        return "wpa3" if "WPA3" in s and "WPA1" not in s and "WPA2" not in s else "wpa"
    if "WEP" in s:
        return "wep"
    return "wpa"


def parse_nets(out):
    """nmcli -t -f IN-USE,SSID,SIGNAL,SECURITY device wifi list: one entry per network name (its strongest access point),
    the one in use first, then the strongest; the hidden ones (no name) left out."""
    best = {}
    for line in out.splitlines():
        f = fields(line)
        if len(f) < 4 or not f[1] or f[1] == "--":
            continue
        try:
            signal = max(0, min(100, int(f[2])))
        except ValueError:
            signal = 0
        on = f[0].strip() == "*"
        n = best.get(f[1])
        if n is None:
            best[f[1]] = {"ssid": f[1], "signal": signal, "lock": lock_of(f[3]), "known": False, "on": on}
        else:
            n["on"] = n["on"] or on
            if signal > n["signal"]:
                n["signal"], n["lock"] = signal, lock_of(f[3])
    return sorted(best.values(), key=lambda n: (not n["on"], -n["signal"], n["ssid"].lower()))[:MAX_NETS]


def explain(rc, text, ssid):
    """What nmcli said (in English: it runs with LC_ALL=C.UTF-8) -> (code, a sentence for the person at the screen)."""
    t = (text or "").lower()
    if "not authorized" in t or "insufficient privileges" in t or "permission denied" in t:
        return "perm", "Pixel n'a pas le droit de changer le Wi-Fi : sur le Pi, relance sh deploy/install.sh."
    if "secrets were required" in t or "no-secrets" in t or "4-way handshake" in t or ("psk" in t and "invalid" in t):
        return "password", f"Mot de passe refusé par « {ssid} ». Attention aux majuscules : retape-le."
    if "could not be found" in t or "no network with ssid" in t or "ssid-not-found" in t or rc == 10:
        return "absent", f"Pixel ne trouve plus « {ssid} » : rapproche-le de la box, puis actualise."
    if "ip configuration" in t or "ip-config" in t or "dhcp" in t:
        return "dhcp", f"« {ssid} » a accepté Pixel, mais ne lui donne pas d'adresse. Redémarre la box ?"
    if rc == 3 or "timeout" in t or "timed out" in t:
        return "timeout", f"« {ssid} » ne répond pas. Réessaie dans un moment."
    if rc == 8 or "networkmanager is not running" in t:
        return "other", "NetworkManager ne tourne pas sur le Pi."
    first = next((x.strip() for x in (text or "").splitlines() if x.strip()), "") or f"code {rc}"
    first = re.sub(r"^error:\s*", "", first, flags=re.I)
    return "other", "Le Wi-Fi n'a pas marché : " + first[:140]


def password_problem(lock, password):
    """None when NetworkManager can take this password for that lock, else what is wrong with it."""
    if lock == "wpa" and not (8 <= len(password.encode()) <= 63 or re.fullmatch(r"[0-9a-fA-F]{64}", password)):
        return f"Un mot de passe Wi-Fi a de 8 à 63 caractères : celui-ci en a {len(password)}."
    if lock == "wpa3" and not 1 <= len(password.encode()) <= 128:
        return "Ce mot de passe est trop long."
    if any(ord(c) < 32 or ord(c) == 127 for c in password):
        return "Ce mot de passe a un caractère invisible."
    return None


async def run_nmcli(args):
    """nmcli with these arguments, its messages in English (they are read here): (exit code, stdout, stderr)."""
    env = {**os.environ, "LC_ALL": "C.UTF-8", "LANG": "C.UTF-8"}
    proc = await asyncio.create_subprocess_exec("nmcli", *args, stdin=asyncio.subprocess.DEVNULL, env=env,
                                                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    try:
        out, err = await proc.communicate()
    except asyncio.CancelledError:
        with contextlib.suppress(ProcessLookupError):
            proc.kill()
        raise
    return proc.returncode, out.decode(errors="replace"), err.decode(errors="replace")


class Wifi:
    def __init__(self, hub, cfg=None, nm=None):
        self.hub = hub
        self.run = nm or run_nmcli                       # async (args) -> (rc, stdout, stderr)
        self.ifname = str((cfg or {}).get("interface") or "")   # [wifi] interface: "" lets NetworkManager pick the Wi-Fi device
        self.s = hub.s["wifi"] = {"ok": False, "perm": None, "online": True, "eth": False, "offline_at": 0, "ssid": "",
                                  "signal": 0, "nets": [], "scan_at": 0, "scanning": False, "job": None}
        self.known = {}                                  # network name -> the uuids of its saved profiles
        self.known_at = 0.0
        self.checked_at = 0.0
        self.scan_t = 0.0
        self.jobs = 0
        self.tasks = set()

        @hub.action("wifi.scan")
        async def scan():
            """Reads the networks around him again (a screen opened the Wi-Fi view, or « Actualiser »)."""
            self.scan()

        @hub.action("wifi.connect")
        async def connect(ssid, password=None):
            """Joins a network (in the background: the screens follow "job"). password: None for a known or open one."""
            self.join(ssid, password)

    # ---- nmcli ----
    async def nm(self, *args, timeout=20):
        try:
            return await asyncio.wait_for(self.run([str(a) for a in args]), timeout)
        except asyncio.TimeoutError:
            return 3, "", "Error: Timeout expired."
        except (FileNotFoundError, PermissionError) as e:
            return 127, "", f"nmcli: {e}"

    def spawn(self, coro):
        t = asyncio.ensure_future(coro)
        self.tasks.add(t)
        t.add_done_callback(self.tasks.discard)
        return t

    # ---- what is there ----
    async def check(self):
        """nmcli answers, and Pixel may scan and join (the polkit rule): once at start, then every minute until it may."""
        self.checked_at = time.time()
        rc, out, _ = await self.nm("-t", "-f", "PERMISSION,VALUE", "general", "permissions")
        vals = {f[0]: f[1] for f in map(fields, out.splitlines()) if len(f) >= 2} if rc == 0 else {}
        ok, perm = rc == 0, rc == 0 and all(vals.get(p) == "yes" for p in NEED)
        if (ok, perm) != (self.s["ok"], self.s["perm"]):
            if not ok:
                log.warning("wifi: nmcli does not answer (code %s): no Wi-Fi view", rc)
            elif not perm:
                log.warning("wifi: Pixel may not scan nor join networks (polkit): run sh deploy/install.sh again")
            self.s["ok"], self.s["perm"] = ok, perm
            self.hub.mark()

    async def read_devices(self):
        rc, out, _ = await self.nm("-t", "-f", "TYPE,STATE", "device")
        if rc:
            return
        eth = wifi = False
        for f in map(fields, out.splitlines()):
            if len(f) >= 2 and f[1].startswith("connected"):
                eth = eth or f[0] == "ethernet"
                wifi = wifi or f[0] == "wifi"
        online = eth or wifi
        self.s["offline_at"] = 0 if online else (self.s["offline_at"] or ms())
        self.s.update(online=online, eth=eth)
        if not wifi:
            self.s.update(ssid="", signal=0)

    async def read_nets(self, rescan="no"):
        """The networks around him: NetworkManager's last scan ("no"), or a new one it waits for ("yes")."""
        rc, out, _ = await self.nm("-t", "-f", "IN-USE,SSID,SIGNAL,SECURITY", "device", "wifi", "list", "--rescan", rescan,
                                   timeout=35)
        if rc:
            return False
        nets = parse_nets(out)
        for n in nets:
            n["known"] = n["ssid"] in self.known
        self.s.update(nets=nets, scan_at=ms())
        cur = next((n for n in nets if n["on"]), None)
        if cur:
            self.s.update(ssid=cur["ssid"], signal=cur["signal"])
        elif self.s["online"] and not self.s["eth"]:     # on a Wi-Fi the scan does not show: its profile's name says which
            rc, out, _ = await self.nm("-t", "-f", "NAME,TYPE", "connection", "show", "--active")
            name = next((f[0] for f in map(fields, out.splitlines()) if len(f) >= 2 and f[1] in WIFI_TYPES), "") if rc == 0 else ""
            self.s.update(ssid=name, signal=0)
        return True

    async def read_known(self):
        """The networks he has a profile for (in infrastructure mode: not a hotspot of his own): name -> uuids."""
        rc, out, _ = await self.nm("-t", "-f", "UUID,TYPE", "connection", "show")
        if rc:
            return
        known = {}
        for f in map(fields, out.splitlines()):
            if len(f) < 2 or f[1] not in WIFI_TYPES:
                continue
            rc1, ssid, _ = await self.nm("-g", "802-11-wireless.ssid", "connection", "show", "uuid", f[0])
            rc2, mode, _ = await self.nm("-g", "802-11-wireless.mode", "connection", "show", "uuid", f[0])
            ssid, mode = unescape(ssid), unescape(mode).strip()
            if rc1 == 0 and ssid and mode in ("", "infrastructure"):
                known.setdefault(ssid, []).append(f[0])
        self.known, self.known_at = known, time.time()
        for n in self.s["nets"]:
            n["known"] = n["ssid"] in known

    async def poll(self):
        """Every 10 s (server.py): is a network up, which Wi-Fi and how strong, the networks around (the last scan)."""
        before = repr({k: self.s[k] for k in ("ok", "perm", "online", "eth", "ssid", "signal", "nets")})
        if not self.s["perm"] and (not self.checked_at or time.time() - self.checked_at >= 60):
            await self.check()
        if not self.s["ok"]:
            return
        await self.read_devices()
        if time.time() - self.known_at >= KNOWN_EVERY:
            await self.read_known()
        if not self.s["scanning"]:
            await self.read_nets("no")
        if repr({k: self.s[k] for k in ("ok", "perm", "online", "eth", "ssid", "signal", "nets")}) != before:
            self.hub.mark()

    # ---- a scan ----
    def scan(self):
        if not self.s["ok"] or self.s["scanning"] or time.time() - self.scan_t < SCAN_GAP:
            return None
        self.scan_t = time.time()
        return self.spawn(self._scan())

    async def _scan(self):
        self.s["scanning"] = True
        self.hub.mark()
        try:
            await self.read_known()
            if not (self.s["perm"] and await self.read_nets("yes")):   # a new scan needs the right; else the last one
                await self.read_nets("no")
        finally:
            self.s["scanning"] = False
            self.hub.mark()

    # ---- a join ----
    def join(self, ssid, password=None):
        ssid = str(ssid if ssid is not None else "")
        password = None if password is None else str(password)
        job = self.s["job"]
        if job and job["state"] == "connecting":
            self.hub.toast("WI-FI : UN RÉSEAU À LA FOIS", 4000)
            return None
        self.jobs += 1
        self.s["job"] = {"id": self.jobs, "ssid": ssid, "state": "connecting", "code": "", "msg": "", "t0": ms()}
        self.hub.mark()
        return self.spawn(self._join(self.s["job"], ssid, password))

    async def _join(self, job, ssid, password):
        try:
            code, msg = await self._steps(ssid, password)
        except Exception:                                # noqa: BLE001 - the screen must hear how it ended
            log.exception("wifi: joining failed")
            code, msg = "other", "Le Wi-Fi n'a pas marché (voir le journal de Pixel)."
        job.update(state="ok" if code == "ok" else "fail", code="" if code == "ok" else code, msg=msg)
        if code == "ok":
            log.info("wifi: on %s", ssid)
            self.hub.toast("WI-FI : " + ssid.upper(), 4000)
        else:
            log.warning("wifi: %s not joined (%s)", ssid, code)
        with contextlib.suppress(Exception):
            await self.read_devices()
            await self.read_known()
            await self.read_nets("no")
        self.hub.mark()

    async def _steps(self, ssid, password):
        if not 0 < len(ssid.encode()) <= 32:
            return "absent", "Ce nom de réseau n'est pas valable."
        if not self.s["ok"]:
            return "other", "Pixel ne trouve pas NetworkManager (nmcli) sur ce Pi."
        net = next((n for n in self.s["nets"] if n["ssid"] == ssid), None)
        if net and net["on"] and password is None:
            return "ok", f"Pixel est déjà sur « {ssid} »."
        if net and net["lock"] == "entreprise":
            return "lock", f"« {ssid} » demande un identifiant : Pixel ne sait pas s'y connecter d'ici."
        if net and net["lock"] == "wep":
            return "lock", f"« {ssid} » utilise WEP, trop ancien : Pixel ne s'y connecte pas."
        await self.read_known()
        olds = list(self.known.get(ssid, []))
        if olds and password is None:                    # a network he knows: its profile
            rc, out, err = await self.up(olds[0])
            return ("ok", f"Pixel est sur « {ssid} ».") if rc == 0 else explain(rc, err or out, ssid)
        if net is None:                                  # not in the last scan: one more look
            await self.read_nets("yes" if self.s["perm"] else "no")
            net = next((n for n in self.s["nets"] if n["ssid"] == ssid), None)
            if net is None:
                return "absent", f"Pixel ne trouve pas « {ssid} » : rapproche-le de la box, puis actualise."
            if net["lock"] in ("entreprise", "wep"):
                return await self._steps(ssid, password)
        lock = net["lock"]
        if lock and not password:
            return "password", f"« {ssid} » a un mot de passe : tape-le."
        if lock:
            bad = password_problem(lock, password)
            if bad:
                return "password", bad
        args = ["connection", "add", "type", "wifi", "con-name", f"{ssid} (nouveau)" if olds else ssid, "ssid", ssid,
                "connection.autoconnect", "yes"]
        if self.ifname:
            args += ["ifname", self.ifname]
        if lock:
            args += ["wifi-sec.key-mgmt", "sae" if lock == "wpa3" else "wpa-psk", "wifi-sec.psk", password]
        rc, out, err = await self.nm(*args)
        m = UUID_RE.search(out or "")
        if rc or not m:
            return explain(rc or 1, err or out, ssid)
        new = m.group(1)
        rc, out, err = await self.up(new)
        if rc:
            await self.nm("connection", "delete", "uuid", new)          # no wrong password left for the next boot
            return explain(rc, err or out, ssid)
        if olds:                                         # the new password works: the old profiles go, the new takes the name
            for old in olds:
                await self.nm("connection", "delete", "uuid", old)
            await self.nm("connection", "modify", "uuid", new, "connection.id", ssid)
        return "ok", f"Pixel est sur « {ssid} »."

    async def up(self, uuid):
        rc, out, _ = await self.nm("radio", "wifi")
        if rc == 0 and out.strip() == "disabled":
            await self.nm("radio", "wifi", "on")
        args = ["--wait", str(WAIT), "connection", "up", "uuid", uuid] + (["ifname", self.ifname] if self.ifname else [])
        return await self.nm(*args, timeout=WAIT + 20)


class DemoNM:
    """A pretend NetworkManager for --demo and the tests: the same nmcli lines as the real one, for the commands Wifi uses."""
    NETS = [("Maison", 82, "WPA2", "pixel1234"), ("Les voisins:5G", 61, "WPA2 WPA3", "voisins123"),
            ("Café du coin", 44, "", ""), ("Bureau", 35, "WPA2 802.1X", None), ("Vieux routeur", 20, "WEP", None)]

    def __init__(self, perm=True):
        self.nets = {n[0]: {"signal": n[1], "sec": n[2], "pw": n[3]} for n in self.NETS}
        self.profiles = {}                               # uuid -> {name, ssid, psk, mode}
        self.perm, self.radio, self.eth, self.calls = perm, True, False, []
        self.active = self.add("Maison", "Maison", "pixel1234")

    def add(self, name, ssid, psk=None, mode="infrastructure"):
        u = str(uuidlib.uuid4())
        self.profiles[u] = {"name": name, "ssid": ssid, "psk": psk, "mode": mode}
        return u

    async def __call__(self, args):
        self.calls.append(list(args))
        await asyncio.sleep(0)
        return self.answer(list(args))

    def answer(self, a):
        esc = lambda s: s.replace("\\", "\\\\").replace(":", "\\:")   # noqa: E731
        act = self.profiles.get(self.active) if self.active else None
        while a[:1] == ["--wait"]:
            a = a[2:]
        if a[-2:] == ["general", "permissions"]:
            v = "yes" if self.perm else "auth"
            return 0, "".join(f"{p}:{v}\n" for p in NEED + ("org.freedesktop.NetworkManager.enable-disable-wifi",)), ""
        if a[-1:] == ["device"] and "TYPE,STATE" in a:
            return 0, (f"wifi:{'connected' if act else 'disconnected'}\nethernet:{'connected' if self.eth else 'unavailable'}\n"
                       "loopback:connected (externally)\n"), ""
        if a[-5:-2] == ["device", "wifi", "list"]:
            return 0, "".join(f"{'*' if act and act['ssid'] == s else ' '}:{esc(s)}:{n['signal']}:{n['sec']}\n"
                              for s, n in self.nets.items()), ""
        if a[-3:] == ["connection", "show", "--active"]:
            return 0, (f"{esc(act['name'])}:802-11-wireless\n" if act else ""), ""
        if a[-2:] == ["connection", "show"]:
            return 0, "".join(f"{u}:802-11-wireless\n" for u in self.profiles), ""
        if a[:1] == ["-g"] and a[2:5] == ["connection", "show", "uuid"]:
            p = self.profiles.get(a[5])
            if not p:
                return 10, "", f"Error: {a[5]} - no such connection profile.\n"
            return 0, esc(p["ssid"] if a[1].endswith(".ssid") else p["mode"]) + "\n", ""
        if a == ["radio", "wifi"]:
            return 0, ("enabled" if self.radio else "disabled") + "\n", ""
        if a == ["radio", "wifi", "on"]:
            self.radio = True
            return 0, "", ""
        if not self.perm and a[:1] in (["connection"], ["device"]):
            return 4, "", "Error: Insufficient privileges.\n"
        if a[:2] == ["connection", "add"]:
            o = dict(zip(a[2::2], a[3::2]))
            if o.get("wifi-sec.key-mgmt") == "wpa-psk" and not 8 <= len(o.get("wifi-sec.psk", "")) <= 63:
                return 2, "", "Error: 802-11-wireless-security.psk: property is invalid.\n"
            u = self.add(o["con-name"], o["ssid"], o.get("wifi-sec.psk"))
            return 0, f"Connection '{o['con-name']}' ({u}) successfully added.\n", ""
        if a[:3] == ["connection", "up", "uuid"]:
            p = self.profiles.get(a[3])
            if not p:
                return 10, "", f"Error: unknown connection '{a[3]}'.\n"
            n = self.nets.get(p["ssid"])
            if not n:
                return 4, "", "Error: Connection activation failed: The Wi-Fi network could not be found.\n"
            if n["pw"] and p["psk"] != n["pw"]:
                return 4, "", "Error: Connection activation failed: Secrets were required, but not provided.\n"
            self.active = a[3]
            return 0, "Connection successfully activated (D-Bus active path: /org/freedesktop/NetworkManager/ActiveConnection/7)\n", ""
        if a[:3] == ["connection", "delete", "uuid"]:
            p = self.profiles.pop(a[3], None)
            if self.active == a[3]:
                self.active = None
            return (0, f"Connection '{p['name']}' ({a[3]}) successfully deleted.\n", "") if p else (10, "", "Error: no such connection.\n")
        if a[:3] == ["connection", "modify", "uuid"] and a[4:5] == ["connection.id"]:
            if a[3] in self.profiles:
                self.profiles[a[3]]["name"] = a[5]
                return 0, "", ""
            return 10, "", "Error: no such connection.\n"
        return 2, "", f"Error: not understood by the demo: {' '.join(a[:4])}\n"


def setup(hub, cfg=None):
    """His Wi-Fi: hub.s["wifi"] and the wifi.* actions; server.py calls .poll every 10 s."""
    return Wifi(hub, cfg or {}, DemoNM() if hub.demo else None)
