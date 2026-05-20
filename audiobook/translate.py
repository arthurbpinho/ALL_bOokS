"""Tradução de segmentos preservando o falante.

Abordagem robusta: cada lote de segmentos vai como array JSON e volta como array
JSON na mesma ordem (response_format=json_object). Isso lida com texto multi-linha,
aspas e pontuação sem o frágil parsing por regex. Se o modelo devolver contagem
errada, cai pra tradução segmento-a-segmento.
"""

from __future__ import annotations

import json
import os
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

from openai import OpenAI

from . import cache
from .parse import Segment


BATCH_WORDS = 3500
DEFAULT_MODEL = "gpt-5.4-mini-2026-03-17"


def _group_batches(
    segments: list[Segment],
    max_words: int = BATCH_WORDS,
    indices: list[int] | None = None,
) -> list[list[int]]:
    if indices is None:
        indices = list(range(len(segments)))
    batches: list[list[int]] = []
    current: list[int] = []
    current_words = 0
    for i in indices:
        words = len(segments[i].text.split())
        if current and current_words + words > max_words:
            batches.append(current)
            current = []
            current_words = 0
        current.append(i)
        current_words += words
    if current:
        batches.append(current)
    return batches


def _build_system(tone: str, context: str) -> str:
    parts = [
        "Você é um tradutor literário profissional do INGLÊS para o PORTUGUÊS BRASILEIRO (pt-BR).",
        "Traduza com naturalidade e fluência (não literal), preservando o sentido, o ritmo e o registro.",
        "Use português brasileiro contemporâneo, tratamento 'você'.",
        "Preserve nomes próprios, exceto quando houver tradução consagrada.",
        "Se um texto já estiver em português (ex.: prefixo 'Nota de rodapé:'), mantenha-o.",
        "NUNCA deixe trechos em inglês: traduza tudo.",
    ]
    if tone.strip():
        parts.append(f"TOM DESEJADO: {tone.strip()}")
    if context.strip():
        parts.append(f"CONTEXTO DO LIVRO: {context.strip()}")
    return "\n".join(parts)


class TranslationProgress:
    def __init__(self, total: int):
        self.total = total
        self.done = 0
        self.failed = 0
        self.status = "running"
        self.error: str | None = None
        self._lock = threading.Lock()

    def tick(self, ok: bool = True, count: int = 1):
        with self._lock:
            if ok:
                self.done += count
            else:
                self.failed += count

    def finish(self, error: str | None = None):
        with self._lock:
            self.status = "error" if error else "done"
            self.error = error

    def snapshot(self) -> dict:
        with self._lock:
            return {
                "total": self.total, "done": self.done, "failed": self.failed,
                "status": self.status, "error": self.error,
            }


class _Usage:
    """Acumula tokens pra estimar custo no fim."""
    def __init__(self):
        self.prompt = 0
        self.completion = 0
        self._lock = threading.Lock()

    def add(self, usage):
        if not usage:
            return
        with self._lock:
            self.prompt += getattr(usage, "prompt_tokens", 0) or 0
            self.completion += getattr(usage, "completion_tokens", 0) or 0


def _reasoning() -> str:
    return os.getenv("TRANSLATE_REASONING", "none")


def _translate_texts(client, model, system, texts: list[str], usage: "_Usage") -> list[str | None]:
    """Traduz uma lista de strings. Retorna lista do mesmo tamanho (None onde falhar)."""
    payload = json.dumps({"items": texts}, ensure_ascii=False)
    user = (
        "Traduza para PORTUGUÊS BRASILEIRO cada string do array 'items'. "
        'Responda APENAS JSON no formato {"items": ["...", "..."]} com EXATAMENTE '
        "a mesma quantidade de strings, na mesma ordem. Não una, divida, adicione "
        "nem remova itens.\n\n" + payload
    )
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": system},
                      {"role": "user", "content": user}],
            response_format={"type": "json_object"},
            reasoning_effort=_reasoning(),
        )
        usage.add(resp.usage)
        data = json.loads(resp.choices[0].message.content or "{}")
        out = data.get("items", [])
        if isinstance(out, list) and len(out) == len(texts) and all(isinstance(x, str) for x in out):
            return out
        print(f"[translate] contagem divergente ({len(out)} vs {len(texts)}), indo 1 a 1")
    except Exception as e:
        print(f"[translate] batch JSON falhou ({e}), indo 1 a 1")

    # Fallback: traduz cada um isoladamente
    return [_translate_one(client, model, system, t, usage) for t in texts]


def _translate_one(client, model, system, text: str, usage: "_Usage") -> str | None:
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": system},
                      {"role": "user", "content":
                       "Traduza para português brasileiro. Responda só com a tradução:\n\n" + text}],
            reasoning_effort=_reasoning(),
        )
        usage.add(resp.usage)
        return (resp.choices[0].message.content or "").strip() or None
    except Exception as e:
        print(f"[translate] segmento falhou: {e}")
        return None


def translate_segments(
    segments: list[Segment],
    tone: str = "",
    context: str = "",
    model: str | None = None,
    concurrency: int = 4,
    progress: TranslationProgress | None = None,
) -> list[Segment]:
    if not segments:
        return []

    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError(
            "OPENAI_API_KEY não configurada. No Railway, defina essa variável em "
            "Settings → Variables (o arquivo .env local não vai pro deploy)."
        )

    client = OpenAI(timeout=180.0, max_retries=4)
    model = model or os.getenv("TRANSLATE_MODEL") or os.getenv("AI_DETECT_MODEL", DEFAULT_MODEL)
    system = _build_system(tone, context)

    translated: list[Segment | None] = [None] * len(segments)

    # ---- 1. Cache ----
    meta = f"{model}\x00{tone}\x00{context}"
    missing: list[int] = []
    hits = 0
    for i, seg in enumerate(segments):
        cached = cache.load(meta, seg.text)
        if cached is not None:
            translated[i] = Segment(seg.speaker, cached)
            hits += 1
        else:
            missing.append(i)
    if hits and progress:
        progress.tick(ok=True, count=hits)
    if hits:
        print(f"[translate] cache: {hits} reusados, {len(missing)} a traduzir")

    # ---- 2. Traduz o que falta ----
    batches = _group_batches(segments, indices=missing)
    usage = _Usage()

    def _do_batch(idxs: list[int]):
        texts = [segments[i].text for i in idxs]
        return idxs, _translate_texts(client, model, system, texts, usage)

    fail_count = 0
    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        future_to_batch = {pool.submit(_do_batch, b): b for b in batches}
        for fut in as_completed(future_to_batch):
            batch = future_to_batch[fut]
            try:
                idxs, outs = fut.result()
                ok_n = 0
                for j, i in enumerate(idxs):
                    seg = segments[i]
                    tr = outs[j] if j < len(outs) else None
                    if tr:
                        translated[i] = Segment(seg.speaker, tr)
                        cache.store(meta, seg.text, tr)
                        ok_n += 1
                    else:
                        translated[i] = Segment(seg.speaker, seg.text)  # mantém original
                fail_n = len(batch) - ok_n
                fail_count += fail_n
                if progress and ok_n:
                    progress.tick(ok=True, count=ok_n)
                if progress and fail_n:
                    progress.tick(ok=False, count=fail_n)
            except Exception as e:
                print(f"[translate] batch falhou (mantendo original): {e}")
                fail_count += len(batch)
                if progress:
                    progress.tick(ok=False, count=len(batch))

    total = usage.prompt + usage.completion
    print(f"[translate] tokens: {usage.prompt} entrada + {usage.completion} saída "
          f"= {total} ({len(missing)} segmentos novos, {hits} do cache, {fail_count} falhas)")

    # Se NADA novo foi traduzido (e havia o que traduzir), é falha real (chave inválida,
    # cota, modelo sem acesso…). Não devolve tudo em inglês fingindo sucesso.
    if missing and fail_count == len(missing):
        raise RuntimeError(
            "Nenhum segmento foi traduzido — verifique OPENAI_API_KEY, cota da conta "
            f"e acesso ao modelo ({model}) no Railway."
        )
    return [t or s for t, s in zip(translated, segments)]
