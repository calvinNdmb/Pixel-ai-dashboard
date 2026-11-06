"""Run a Codex task (or any coding agent CLI) in a project folder and stream its log."""
import asyncio
import logging
import os
import re
import time

log = logging.getLogger("pixel.codex")
ANSI = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]")
DEMO = [("Lecture du projet (12 fichiers)", 0.8), ("Tests : 41 OK, 1 échec", 1.1), ("Échec : test_minuteur, la pause ne s'arrête pas à 0", 1.0),
        ("Correction de minuteur.py, ligne 48", 1.3), ("Relance des tests", 1.6), ("42/42 OK", 0.7), ("Branche prête : fix-minuteur", 0.5)]


class Codex:
    def __init__(self, hub, cfg):
        self.hub, self.X = hub, hub.s["codex"]
        self.command = cfg.get("command", ["codex", "exec", "--full-auto"])
        self.workdir = os.path.expanduser(cfg.get("workdir", "~"))
        self.proc, self.task = None, None
        self.X["status"] = "Tape : codex <ta tâche>"

        @hub.action("codex.run")
        async def run(task=None):
            task = (task or self.X["task"] or "").strip()
            if not task:
                return hub.toast("TAPE : codex <ta tâche>")
            if self.X["running"]:
                return hub.toast("CODEX TRAVAILLE DÉJÀ")
            self.task = asyncio.ensure_future(self._run(task))

        @hub.action("codex.stop")
        async def stop():
            if self.proc and self.proc.returncode is None:
                self.proc.terminate()
            elif self.task and not self.task.done():
                self.task.cancel()

        @hub.action("codex.clear")
        async def clear():
            if not self.X["running"]:
                self.X.update(task="", lines=[], status="Tape : codex <ta tâche>")

    def _line(self, text):
        for part in ANSI.sub("", text).replace("\r", "\n").splitlines():
            if part.strip():
                self.X["lines"] = (self.X["lines"] + [part[:300]])[-300:]
        self.hub.mark()

    async def _run(self, task):
        self.X.update(task=task, running=True, lines=[], status="en cours", started=time.time())
        self.hub.mark()
        rc = None
        try:
            if self.hub.demo:
                for line, wait in DEMO:
                    await asyncio.sleep(wait)
                    self._line(line)
                rc = 0
            else:
                self.proc = await asyncio.create_subprocess_exec(*self.command, task, cwd=self.workdir,
                                                                 stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
                async for raw in self.proc.stdout:
                    self._line(raw.decode("utf-8", "replace"))
                rc = await self.proc.wait()
        except FileNotFoundError:
            self._line(f"Commande introuvable : {self.command[0]}. Installe Codex (npm i -g @openai/codex) ou change [codex] command.")
        except asyncio.CancelledError:
            rc = -1
        finally:
            secs = round(time.time() - self.X["started"])
            ok = rc == 0
            self.X.update(running=False, status=f"terminé en {secs} s" if ok else "arrêté" if rc in (-1, -15) else f"erreur ({rc})")
            self.hub.toast("CODEX : TERMINÉ" if ok else "CODEX : " + self.X["status"].upper(), 4000)
            self.hub.mood("content" if ok else "surpris", 2500)
