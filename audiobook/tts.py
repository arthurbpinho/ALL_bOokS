"""Motor TTS via Edge TTS. Quebra segmentos em chunks ≤4000 chars e gera MP3s em paralelo."""

from __future__ import annotations

import re
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path

from . import edge_backend
from .parse import Segment


MAX_CHARS = 4000


def _safe_speaker(speaker: str) -> str:
    """Sanitiza o nome do falante para uso em nome de arquivo.

    Segurança: o `speaker` pode vir do cliente (edição de segmentos) sem validação.
    Sem isso, um nome como '../../x' escreveria o MP3 fora da pasta do job (path
    traversal) e uma aspa quebraria o list-file do ffmpeg na concatenação.
    """
    s = re.sub(r"[^0-9A-Za-z_-]", "_", speaker or "")
    return s[:40] or "X"


def chunk_filename(index: int, speaker: str) -> str:
    return f"chunk_{index:05d}_{_safe_speaker(speaker)}.mp3"


@dataclass
class Chunk:
    index: int
    speaker: str
    voice: str
    text: str
    path: Path | None = None


def split_text(text: str, max_chars: int = MAX_CHARS) -> list[str]:
    text = text.strip()
    if len(text) <= max_chars:
        return [text]
    sentences = re.split(r"(?<=[.!?…])\s+", text)
    chunks: list[str] = []
    current = ""
    for sent in sentences:
        if not sent:
            continue
        if len(sent) > max_chars:
            for piece in _hard_split(sent, max_chars):
                if current:
                    chunks.append(current); current = ""
                chunks.append(piece)
            continue
        cand = (current + " " + sent).strip() if current else sent
        if len(cand) > max_chars:
            chunks.append(current); current = sent
        else:
            current = cand
    if current:
        chunks.append(current)
    return chunks


def _hard_split(text: str, max_chars: int) -> list[str]:
    parts = re.split(r"(?<=,)\s+", text)
    out: list[str] = []
    cur = ""
    for p in parts:
        if len(p) > max_chars:
            while len(p) > max_chars:
                out.append(p[:max_chars]); p = p[max_chars:]
        cand = (cur + " " + p).strip() if cur else p
        if len(cand) > max_chars:
            if cur:
                out.append(cur)
            cur = p
        else:
            cur = cand
    if cur:
        out.append(cur)
    return out


def build_chunks(segments: list[Segment], voice_map: dict[str, str]) -> list[Chunk]:
    chunks: list[Chunk] = []
    default_voice = voice_map.get("NARRADOR") or next(iter(voice_map.values()))
    for seg in segments:
        voice = voice_map.get(seg.speaker, default_voice)
        for piece in split_text(seg.text):
            chunks.append(Chunk(
                index=len(chunks),
                speaker=seg.speaker,
                voice=voice,
                text=piece,
            ))
    return chunks


class Progress:
    def __init__(self, total: int):
        self.total = total
        self.done = 0
        self.failed = 0
        self.status = "running"
        self.error: str | None = None
        self.cancelled = False
        self._lock = threading.Lock()

    def tick(self, ok: bool = True):
        with self._lock:
            if ok: self.done += 1
            else: self.failed += 1

    def cancel(self):
        with self._lock:
            self.cancelled = True
            self.status = "cancelled"

    def finish(self, error: str | None = None):
        with self._lock:
            self.status = "error" if error else "done"
            self.error = error

    def snapshot(self) -> dict:
        with self._lock:
            return {
                "total": self.total, "done": self.done, "failed": self.failed,
                "status": self.status, "error": self.error,
                "cancelled": self.cancelled,
            }


def synthesize(
    chunks: list[Chunk],
    output_dir: Path,
    progress: Progress,
    concurrency: int = 5,
):
    output_dir.mkdir(parents=True, exist_ok=True)

    def _one(chunk: Chunk):
        if progress.cancelled:
            return
        out = output_dir / chunk_filename(chunk.index, chunk.speaker)
        if out.exists() and out.stat().st_size > 0:
            chunk.path = out
            return
        edge_backend.synthesize_chunk(chunk.text, chunk.voice, out)
        # Só registra o caminho se gerou áudio de verdade (chunks sem fala falável
        # não criam arquivo e ficam de fora da playlist sem virar "buraco").
        if out.exists() and out.stat().st_size > 0:
            chunk.path = out

    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = {pool.submit(_one, c): c for c in chunks}
        for fut in as_completed(futures):
            if progress.cancelled:
                # Cancela o que ainda não começou; o que está em voo termina rápido.
                pool.shutdown(wait=False, cancel_futures=True)
                break
            try:
                fut.result()
                progress.tick(ok=True)
            except Exception as e:
                c = futures[fut]
                print(f"[tts] falha no chunk {c.index} ({c.speaker}): {e}")
                progress.tick(ok=False)
