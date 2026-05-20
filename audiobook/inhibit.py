"""Impede o computador de suspender/dormir durante a geração de áudio.

No Linux usa `systemd-inhibit`. Em outras plataformas vira no-op.
"""

from __future__ import annotations

import shutil
import subprocess
import sys


class InhibitSuspend:
    """Context manager que segura um lock anti-suspensão enquanto está ativo."""

    def __init__(self, why: str = "Generating audiobook", enabled: bool = True):
        self.why = why
        self.enabled = enabled
        self._proc: subprocess.Popen | None = None
        self.method: str = "none"

    def __enter__(self):
        if not self.enabled:
            self.method = "disabled"
            return self
        if sys.platform.startswith("linux") and shutil.which("systemd-inhibit"):
            # Segura sleep + idle até o processo morrer. Usamos `cat` como
            # processo guardião porque ele bloqueia em stdin até fecharmos.
            self._proc = subprocess.Popen(
                [
                    "systemd-inhibit",
                    "--what=sleep:idle",
                    "--who=audiobook-generator",
                    f"--why={self.why}",
                    "--mode=block",
                    "cat",
                ],
                stdin=subprocess.PIPE,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            self.method = "systemd-inhibit"
        else:
            self.method = "unavailable"
        return self

    def __exit__(self, exc_type, exc, tb):
        if self._proc and self._proc.poll() is None:
            try:
                if self._proc.stdin:
                    self._proc.stdin.close()
                self._proc.terminate()
                self._proc.wait(timeout=5)
            except Exception:
                try:
                    self._proc.kill()
                except Exception:
                    pass
        self._proc = None
