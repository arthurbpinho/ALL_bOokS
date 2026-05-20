"""Tradução de segmentos preservando o falante.

Abordagem robusta: cada lote de segmentos vai como array JSON e volta como array
JSON na mesma ordem (response_format=json_object). Isso lida com texto multi-linha,
aspas e pontuação sem o frágil parsing por regex. Se o modelo devolver contagem
errada, cai pra tradução segmento-a-segmento.
"""

from __future__ import annotations

import json
import os
import re
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

from openai import OpenAI

from . import cache
from .parse import Segment


BATCH_WORDS = 3500
DEFAULT_MODEL = "gpt-5.4-mini-2026-03-17"


def _split_for_translation(text: str, max_words: int = BATCH_WORDS) -> list[str]:
    """Quebra um segmento grande em pedaços traduzíveis.

    Sem isso, um segmento enorme (ex.: livro inteiro no modo voz única, ou um
    bloco longo de narração) vira UM request único que estoura o limite de
    tokens por minuto da OpenAI (429 'Request too large'). Divide em fronteiras
    de frase; os pedaços são remontados depois da tradução.
    """
    text = text.strip()
    if not text:
        return []
    if len(text.split()) <= max_words:
        return [text]
    sentences = re.split(r"(?<=[.!?…])\s+", text)
    pieces: list[str] = []
    cur: list[str] = []
    cur_w = 0
    for s in sentences:
        if not s:
            continue
        sw = len(s.split())
        if sw > max_words:
            # Frase única gigante (PDF mal extraído): corta por palavras.
            if cur:
                pieces.append(" ".join(cur)); cur = []; cur_w = 0
            words = s.split()
            for j in range(0, len(words), max_words):
                pieces.append(" ".join(words[j:j + max_words]))
            continue
        if cur and cur_w + sw > max_words:
            pieces.append(" ".join(cur)); cur = []; cur_w = 0
        cur.append(s); cur_w += sw
    if cur:
        pieces.append(" ".join(cur))
    return pieces


def _group_text_batches(
    texts: list[str],
    indices: list[int],
    max_words: int = BATCH_WORDS,
) -> list[list[int]]:
    batches: list[list[int]] = []
    current: list[int] = []
    current_words = 0
    for i in indices:
        words = len(texts[i].split())
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


class _Errors:
    """Guarda o último erro real da API pra surfar na mensagem final."""
    def __init__(self):
        self.last: str | None = None
        self._lock = threading.Lock()

    def add(self, e: Exception):
        with self._lock:
            self.last = f"{type(e).__name__}: {e}"


def _reasoning() -> str:
    return os.getenv("TRANSLATE_REASONING", "none")


def _translate_texts(client, model, system, texts: list[str], usage: "_Usage",
                     errors: "_Errors") -> list[str | None]:
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
        errors.add(e)
        print(f"[translate] batch JSON falhou ({e}), indo 1 a 1")

    # Fallback: traduz cada um isoladamente
    return [_translate_one(client, model, system, t, usage, errors) for t in texts]


def _translate_one(client, model, system, text: str, usage: "_Usage",
                   errors: "_Errors") -> str | None:
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
        errors.add(e)
        print(f"[translate] segmento falhou: {e}")
        return None


def translate_segments(
    segments: list[Segment],
    tone: str = "",
    context: str = "",
    model: str | None = None,
    concurrency: int = 3,
    progress: TranslationProgress | None = None,
) -> list[Segment]:
    if not segments:
        return []

    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError(
            "OPENAI_API_KEY não configurada. No Railway, defina essa variável em "
            "Settings → Variables (o arquivo .env local não vai pro deploy)."
        )

    client = OpenAI(timeout=180.0, max_retries=6)
    model = model or os.getenv("TRANSLATE_MODEL") or os.getenv("AI_DETECT_MODEL", DEFAULT_MODEL)
    system = _build_system(tone, context)

    # Expande segmentos em pedaços traduzíveis. Segmentos grandes (livro inteiro no
    # modo voz única, blocos longos de narração) viram vários pedaços pra não estourar
    # o limite de tokens por minuto da OpenAI. Cada pedaço é remontado no fim.
    pieces: list[str] = []
    owner: list[int] = []  # índice do segmento dono de cada pedaço
    for i, seg in enumerate(segments):
        for p in _split_for_translation(seg.text):
            pieces.append(p)
            owner.append(i)
    if progress:
        progress.total = len(pieces)

    translated_pieces: list[str | None] = [None] * len(pieces)

    # ---- 1. Cache (por pedaço; pedaço == texto original quando o segmento não é dividido) ----
    meta = f"{model}\x00{tone}\x00{context}"
    missing: list[int] = []
    hits = 0
    for k, p in enumerate(pieces):
        cached = cache.load(meta, p)
        if cached is not None:
            translated_pieces[k] = cached
            hits += 1
        else:
            missing.append(k)
    if hits and progress:
        progress.tick(ok=True, count=hits)
    if hits:
        print(f"[translate] cache: {hits} reusados, {len(missing)} a traduzir")

    # ---- 2. Traduz o que falta ----
    batches = _group_text_batches(pieces, missing)
    usage = _Usage()
    errors = _Errors()

    def _do_batch(idxs: list[int]):
        texts = [pieces[k] for k in idxs]
        return idxs, _translate_texts(client, model, system, texts, usage, errors)

    fail_count = 0
    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        future_to_batch = {pool.submit(_do_batch, b): b for b in batches}
        for fut in as_completed(future_to_batch):
            batch = future_to_batch[fut]
            try:
                idxs, outs = fut.result()
                ok_n = 0
                for j, k in enumerate(idxs):
                    tr = outs[j] if j < len(outs) else None
                    if tr:
                        translated_pieces[k] = tr
                        cache.store(meta, pieces[k], tr)
                        ok_n += 1
                    # senão: deixa None → remontagem usa o pedaço original
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
          f"= {total} ({len(missing)} pedaços novos, {hits} do cache, {fail_count} falhas)")

    # Se NADA novo foi traduzido (e havia o que traduzir), é falha real (chave inválida,
    # cota, modelo sem acesso, request grande demais…). Não devolve tudo em inglês.
    if missing and fail_count == len(missing):
        detail = f" Erro da API: {errors.last}" if errors.last else ""
        raise RuntimeError(
            "Nenhum segmento foi traduzido — verifique OPENAI_API_KEY, cota da conta "
            f"e acesso ao modelo ({model}) no Railway.{detail}"
        )

    # ---- 3. Remonta os pedaços traduzidos de cada segmento ----
    seg_pieces: list[list[int]] = [[] for _ in segments]
    for k, i in enumerate(owner):
        seg_pieces[i].append(k)
    result: list[Segment] = []
    for i, seg in enumerate(segments):
        ks = seg_pieces[i]
        if not ks:
            result.append(Segment(seg.speaker, seg.text))
            continue
        parts = [translated_pieces[k] if translated_pieces[k] is not None else pieces[k]
                 for k in ks]
        result.append(Segment(seg.speaker, " ".join(parts).strip()))
    return result
