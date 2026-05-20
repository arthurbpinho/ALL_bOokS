"""Parser de falantes.

Estratégia:
- Regex padrão NÃO ancora em ^ — busca marcadores em qualquer posição do texto.
  Isso resolve o caso comum onde PDFs extraem parágrafos como uma linha só.
- Conteúdo entre marcadores é atribuído ao último falante encontrado.
- Texto antes do primeiro marcador vira NARRADOR.
- Opção alternativa: parse_with_speakers usa lista literal de nomes (mais robusto).
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass

from .extract import (
    BD_END, BD_START, FN_END, FN_START, IT_END, IT_START,
)


NARRATOR = "NARRADOR"
FOOTNOTE_PREFIX = "Nota de rodapé: "

# Regex de spans formatados (itálico, negrito ou nota de rodapé)
_SPAN_RE = re.compile(
    f"{IT_START}(?P<it>.*?){IT_END}"
    f"|{BD_START}(?P<bd>.*?){BD_END}"
    f"|{FN_START}(?P<fn>.*?){FN_END}",
    re.DOTALL,
)


def strip_markers(text: str) -> str:
    for m in (IT_START, IT_END, BD_START, BD_END, FN_START, FN_END):
        text = text.replace(m, "")
    return text


@dataclass
class Segment:
    speaker: str
    text: str

    def to_dict(self) -> dict:
        return {"speaker": self.speaker, "text": self.text}


# Padrões prontos pra UI. NÃO usam ^ — finditer caça em todo o texto.
PATTERNS = {
    "uppercase_colon": {
        "label": "NOME: texto (nome em maiúsculas + dois pontos)",
        "regex": r"\b(?P<speaker>[A-ZÀ-Ý][A-ZÀ-Ý\.\-']{1,30}):\s*",
        "example": "VENTURA: And that has to be respected.",
    },
    "name_colon": {
        "label": "Nome: texto (qualquer nome + dois pontos)",
        "regex": r"(?:^|(?<=[\.\!\?\n]\s))(?P<speaker>[A-ZÀ-Ý][\wÀ-ÿ\.\-']{1,30}):\s*",
        "example": "Ventura: And that has to be respected.",
    },
    "dash_name_colon": {
        "label": "— Nome: texto (travessão + nome + dois pontos)",
        "regex": r"[—–-]\s*(?P<speaker>[A-ZÀ-Ý][\wÀ-ÿ\.\-']{1,30}):\s*",
        "example": "— Ventura: And that has to be respected.",
    },
}


def parse_with_regex(text: str, pattern: str) -> list[Segment]:
    """Encontra todos os marcadores no texto e atribui o conteúdo entre eles ao falante."""
    rx = re.compile(pattern, re.MULTILINE)
    matches = list(rx.finditer(text))

    if not matches:
        cleaned = _normalize(text)
        return [Segment(NARRATOR, cleaned)] if cleaned else []

    segments: list[Segment] = []

    # Texto antes do primeiro marcador → NARRADOR
    pre = _normalize(text[:matches[0].start()])
    if pre:
        segments.append(Segment(NARRATOR, pre))

    for i, m in enumerate(matches):
        speaker = m.group("speaker").strip().upper()
        content_start = m.end()
        content_end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        content = _normalize(text[content_start:content_end])
        if content:
            segments.append(Segment(speaker, content))

    return segments


def parse_with_speakers(text: str, speakers: list[str]) -> list[Segment]:
    """Parse literal: você passa a lista de nomes ['HILLMAN', 'VENTURA'] e
    cada ocorrência de `NOME:` no texto vira um marcador.
    Esse é o jeito mais robusto se você sabe quem são os personagens.
    """
    if not speakers:
        return [Segment(NARRATOR, _normalize(text))] if text.strip() else []
    names = sorted({s.strip() for s in speakers if s.strip()}, key=len, reverse=True)
    escaped = [re.escape(n) for n in names]
    # Case-insensitive: matches Hillman, HILLMAN, hillman etc. — sempre normaliza pra upper.
    pattern = r"\b(?P<speaker>" + "|".join(escaped) + r")\s*:\s*"
    rx = re.compile(pattern, re.IGNORECASE)
    matches = list(rx.finditer(text))

    if not matches:
        cleaned = _normalize(text)
        return [Segment(NARRATOR, cleaned)] if cleaned else []

    segments: list[Segment] = []
    pre = _normalize(text[:matches[0].start()])
    if pre:
        segments.append(Segment(NARRATOR, pre))
    for i, m in enumerate(matches):
        speaker = m.group("speaker").strip().upper()
        s = m.end()
        e = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        content = _normalize(text[s:e])
        if content:
            segments.append(Segment(speaker, content))
    return segments


def _normalize(text: str) -> str:
    """Compacta whitespace excessivo mas preserva quebras de parágrafo."""
    text = text.strip()
    # Junta linhas dentro de um parágrafo (quebras simples) com espaço
    text = re.sub(r"(?<!\n)\n(?!\n)", " ", text)
    # Compacta espaços múltiplos
    text = re.sub(r"[ \t]+", " ", text)
    # Compacta linhas em branco múltiplas
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def apply_narration_formatting(
    segments: list[Segment],
    narrator_italic: bool = False,
    narrator_bold: bool = False,
    narrator_footnote: bool = False,
) -> list[Segment]:
    """Roteia trechos em itálico/negrito/nota-de-rodapé pro NARRADOR (conforme flags).
    Notas de rodapé ganham o prefixo 'Nota de rodapé: '. Sempre remove os marcadores."""
    if not (narrator_italic or narrator_bold or narrator_footnote):
        return [Segment(s.speaker, strip_markers(s.text).strip())
                for s in segments if strip_markers(s.text).strip()]

    out: list[Segment] = []
    for seg in segments:
        base = NARRATOR if seg.speaker == NARRATOR else seg.speaker
        for is_routed, piece, prefix in _split_by_format(
            seg.text, narrator_italic, narrator_bold, narrator_footnote
        ):
            txt = _clean_piece(piece)
            if not txt:
                continue
            if is_routed:
                out.append(Segment(NARRATOR, prefix + txt))
            else:
                out.append(Segment(base, txt))
    return out


def _clean_piece(piece: str) -> str:
    """Remove marcadores e pontuação órfã no início (sobra de spans removidos)."""
    txt = strip_markers(piece).strip()
    txt = re.sub(r"^[\s.,;:!?—–-]+", "", txt)
    return txt.strip()


def _is_narration_like(text: str) -> bool:
    """Distingue narração/cartas (frase ou bloco) de ênfase inline (1-2 palavras).
    Evita que palavras em itálico no meio de uma fala virem segmentos do narrador."""
    t = strip_markers(text).strip()
    if len(t.split()) >= 5:
        return True
    if re.search(r"[.!?;:]", t):
        return True
    return False


def _split_by_format(text: str, do_italic: bool, do_bold: bool, do_footnote: bool):
    """Gera (is_narrador, trecho, prefixo) separando spans roteados pro narrador.
    Itálico/negrito só roteiam se forem 'narração de verdade'; nota sempre roteia."""
    # Se o segmento INTEIRO é um único span formatado, roteia ele todo
    whole = _SPAN_RE.fullmatch(text.strip())

    pos = 0
    emitted = False
    for m in _SPAN_RE.finditer(text):
        if m.group("it") is not None:
            inner, want, prefix, is_fn = m.group("it"), do_italic, "", False
        elif m.group("bd") is not None:
            inner, want, prefix, is_fn = m.group("bd"), do_bold, "", False
        else:
            inner, want, prefix, is_fn = m.group("fn"), do_footnote, FOOTNOTE_PREFIX, True

        route = want and (is_fn or bool(whole) or _is_narration_like(inner))
        if not route:
            continue  # mantém inline; marcadores removidos depois
        before = text[pos:m.start()]
        if before.strip():
            yield (False, before, "")
        yield (True, inner, prefix)
        pos = m.end()
        emitted = True
    rest = text[pos:]
    if rest.strip() or not emitted:
        yield (False, rest, "")


def merge_consecutive(segments: list[Segment]) -> list[Segment]:
    """Junta segmentos seguidos do mesmo falante (limpa fragmentação)."""
    out: list[Segment] = []
    for seg in segments:
        if out and out[-1].speaker == seg.speaker:
            out[-1] = Segment(seg.speaker, (out[-1].text + " " + seg.text).strip())
        else:
            out.append(Segment(seg.speaker, seg.text))
    return out


def list_speakers(segments: list[Segment]) -> list[str]:
    seen: list[str] = []
    for s in segments:
        if s.speaker not in seen:
            seen.append(s.speaker)
    return seen


def ai_detect_speakers(text: str, model: str | None = None) -> list[dict]:
    from openai import OpenAI

    client = OpenAI()
    model = model or os.getenv("AI_DETECT_MODEL", "gpt-5.4-mini-2026-03-17")
    sample = text[:8000]
    system = (
        "Você analisa textos de livros e identifica personagens com falas. "
        "Para cada personagem retorne nome (como aparece no texto, em maiúsculas), "
        "gênero percebido (masculina, feminina ou neutra) e descrição curta."
    )
    user = (
        "Liste todos os personagens que têm falas neste trecho. "
        "Inclua 'NARRADOR' apenas se houver narração entre as falas.\n\n"
        f"Trecho:\n---\n{sample}\n---\n\n"
        'Responda APENAS com JSON no formato:\n'
        '{"characters": [{"name": "...", "gender": "masculina|feminina|neutra", '
        '"description": "..."}]}'
    )
    resp = client.chat.completions.create(
        model=model,
        messages=[{"role": "system", "content": system},
                  {"role": "user", "content": user}],
        response_format={"type": "json_object"},
        reasoning_effort=os.getenv("TRANSLATE_REASONING", "none"),
    )
    data = json.loads(resp.choices[0].message.content)
    return data.get("characters", [])
