"""Wrapper síncrono pro edge-tts (async), com retry e proteção contra arquivo vazio."""

from __future__ import annotations

import asyncio
import re
import time
from pathlib import Path

import edge_tts

RETRIES = 3
_SPEAKABLE = re.compile(r"[0-9A-Za-zÀ-ÿ]")


def _has_speakable(text: str) -> bool:
    return bool(_SPEAKABLE.search(text or ""))


async def _async_save(text: str, voice: str, out_path: Path):
    await edge_tts.Communicate(text=text, voice=voice).save(str(out_path))


def synthesize_chunk(text: str, voice: str, out_path: Path) -> None:
    """Gera 1 MP3. Não cria arquivo se não houver conteúdo falável.
    Escreve em arquivo temporário e só renomeia se o áudio tiver bytes,
    evitando deixar MP3 de 0 bytes. Faz retry em falhas transitórias."""
    if not _has_speakable(text):
        return  # nada pra narrar (ex.: só pontuação após edição)

    tmp = out_path.with_name(out_path.stem + ".tmp.mp3")
    last_err = None
    for attempt in range(RETRIES):
        try:
            tmp.unlink(missing_ok=True)
            asyncio.run(_async_save(text, voice, tmp))
            if tmp.exists() and tmp.stat().st_size > 0:
                tmp.replace(out_path)
                return
            last_err = "áudio vazio"
        except Exception as e:
            last_err = e
        time.sleep(1.5 * (attempt + 1))  # backoff
    tmp.unlink(missing_ok=True)
    raise RuntimeError(f"Edge TTS falhou após {RETRIES} tentativas (voz={voice}): {last_err}")
