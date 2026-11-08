"""Raspberry Pi health: temperature, CPU, memory, Wi-Fi, uptime, screen brightness."""
import asyncio
import glob
import logging
import socket
import time
from pathlib import Path

import psutil

log = logging.getLogger("pixel")


def read(path, default=None):
    try:
        return Path(path).read_text().strip()
    except OSError:
        return default


def cpu_temp():
    t = read("/sys/class/thermal/thermal_zone0/temp")
    if t:
        return int(t) / 1000
    for entries in (psutil.sensors_temperatures() if hasattr(psutil, "sensors_temperatures") else {}).values():
        if entries:
            return entries[0].current
    return None


def wifi_dbm():
    for line in (read("/proc/net/wireless", "") or "").splitlines()[2:]:
        parts = line.split()
        if len(parts) > 3:
            return float(parts[3].rstrip("."))
    return None


def local_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("192.0.2.1", 80))       # no packet is sent: this only picks the outgoing interface
            return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"


class System:
    def __init__(self, hub):
        self.hub = hub
        self.backlight = next(iter(glob.glob("/sys/class/backlight/*")), None)
        hub.s["sys"] = {"temps": [], "cpus": [], "bright": 1.0, "hw_bright": False, "host": socket.gethostname()}
        psutil.cpu_percent(None)

        @hub.action("sys.bright")
        async def bright(d=0.1):
            s = hub.s["sys"]
            s["bright"] = round(min(1.0, max(0.3, s["bright"] + float(d))), 1)
            s["hw_bright"] = self._write_backlight(s["bright"])

        @hub.action("sys.boot")
        async def boot():
            hub.s["boot_at"] = time.time() * 1000

        @hub.action("sys.power")
        async def power(what="poweroff"):
            """Powers the Pi off or restarts it (quick menu). Needs the sudoers rule that install.sh adds; not in --demo."""
            if what not in ("poweroff", "reboot"):
                return
            hub.toast("EXTINCTION… À BIENTÔT" if what == "poweroff" else "REDÉMARRAGE…", 6000)
            if hub.demo:
                return
            hub.mark()
            await asyncio.sleep(1.5)                # the screens get the toast first
            proc = await asyncio.create_subprocess_exec("sudo", "-n", "/usr/bin/systemctl", what,
                                                        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE)
            _, err = await proc.communicate()
            if proc.returncode:
                log.warning("sys.power %s failed: %s", what, err.decode(errors="replace").strip())
                hub.toast("IMPOSSIBLE : " + ("ÉTEINDRE" if what == "poweroff" else "REDÉMARRER") + " (relance sh deploy/install.sh)", 8000)

    def _write_backlight(self, v):
        if not self.backlight:
            return False
        try:
            top = int(read(self.backlight + "/max_brightness", "255"))
            Path(self.backlight + "/brightness").write_text(str(max(1, round(top * v))))
            return True
        except OSError:
            return False                        # no permission: the screen dims in software instead

    async def sample(self):
        s = self.hub.s["sys"]
        vm = psutil.virtual_memory()
        s.update(temp=cpu_temp(), cpu=psutil.cpu_percent(None), ram_used=vm.used, ram_total=vm.total, wifi=wifi_dbm(),
                 uptime=time.time() - psutil.boot_time(), disk=psutil.disk_usage("/").percent, ip=local_ip())
        s["temps"] = (s["temps"] + [s["temp"] or 0])[-60:]
        s["cpus"] = (s["cpus"] + [s["cpu"]])[-60:]
        self.hub.mark()
