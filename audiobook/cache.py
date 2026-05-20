"""Cache de tradução em disco (1 arquivo por segmento, chave = hash do conteúdo).

A chave inclui modelo + tom + contexto + texto original, então mudar qualquer
parâmetro invalida naturalmente (gera nova chave) sem colidir com traduções antigas.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

CACHE_DIR = Path(__file__).parent.parent / "cache" / "translations"


def _key(meta: str, text: str) -> str:
    h = hashlib.sha256()
    h.update(meta.encode("utf-8"))
    h.update(b"\x00")
    h.update(text.encode("utf-8"))
    return h.hexdigest()


def load(meta: str, text: str) -> str | None:
    p = CACHE_DIR / f"{_key(meta, text)}.txt"
    if p.exists():
        try:
            return p.read_text(encoding="utf-8")
        except Exception:
            return None
    return None


def store(meta: str, text: str, translation: str) -> None:
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        (CACHE_DIR / f"{_key(meta, text)}.txt").write_text(translation, encoding="utf-8")
    except Exception:
        pass
