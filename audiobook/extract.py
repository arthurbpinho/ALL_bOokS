"""Extração de texto de PDF, EPUB ou TXT.

Formatação preservada com marcadores invisíveis (Private Use Area):
  IT_START..IT_END  → itálico
  BD_START..BD_END  → negrito
  FN_START..FN_END  → nota de rodapé (detectada por tamanho de fonte menor no PDF)
O parser usa esses marcadores pra opcionalmente rotear trechos pro NARRADOR.
"""

from __future__ import annotations

import re
from collections import Counter
from pathlib import Path

IT_START, IT_END = chr(0xE000), chr(0xE001)
BD_START, BD_END = chr(0xE002), chr(0xE003)
FN_START, FN_END = chr(0xE004), chr(0xE005)


def extract(path: str | Path) -> str:
    path = Path(path)
    ext = path.suffix.lower()
    if ext == ".txt":
        text = path.read_text(encoding="utf-8", errors="replace")
    elif ext == ".pdf":
        text = _extract_pdf(path)
    elif ext == ".epub":
        text = _extract_epub(path)
    else:
        raise ValueError(f"Formato não suportado: {ext}")
    return _cleanup(text)


def _span_style(span: dict, fn_threshold: float) -> str:
    """Retorna 'f' (nota de rodapé), 'i' (itálico), 'b' (negrito) ou ''."""
    flags = span.get("flags", 0)
    font = span.get("font", "").lower()
    size = span.get("size", 99.0)
    superscript = bool(flags & 1)
    italic = bool(flags & 2) or "italic" in font or "oblique" in font
    bold = bool(flags & 16) or "bold" in font or "black" in font or "heavy" in font
    if fn_threshold and size <= fn_threshold and not superscript:
        return "f"
    if italic:
        return "i"
    if bold:
        return "b"
    return ""


def _wrap(style: str, text: str) -> str:
    if style == "i":
        return IT_START + text + IT_END
    if style == "b":
        return BD_START + text + BD_END
    if style == "f":
        return FN_START + text + FN_END
    return text


def _emit_line(spans: list[dict], fn_threshold: float) -> str:
    runs: list[list[str]] = []
    for span in spans:
        txt = span.get("text", "")
        flags = span.get("flags", 0)
        # Descarta números soltos em superscript (marcadores de nota no corpo)
        if (flags & 1) and txt.strip().isdigit():
            continue
        style = _span_style(span, fn_threshold)
        # Descarta números de página soltos detectados como nota
        if style == "f" and txt.strip().isdigit() and len(txt.strip()) <= 4:
            continue
        if runs and runs[-1][0] == style:
            runs[-1][1] += txt
        else:
            runs.append([style, txt])
    return "".join(_wrap(style, txt) for style, txt in runs)


def _body_font_size(doc) -> float:
    """Tamanho de fonte predominante (ponderado por nº de caracteres)."""
    sizes: Counter = Counter()
    for page in doc:
        for block in page.get_text("dict").get("blocks", []):
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    sizes[round(span.get("size", 0))] += len(span.get("text", ""))
    if not sizes:
        return 0.0
    return float(max(sizes, key=sizes.get))


def _extract_pdf(path: Path) -> str:
    import fitz  # pymupdf

    out: list[str] = []
    with fitz.open(path) as doc:
        body = _body_font_size(doc)
        fn_threshold = body * 0.86 if body else 0.0  # < ~86% do corpo = nota de rodapé
        for page in doc:
            for block in page.get_text("dict").get("blocks", []):
                lines = block.get("lines")
                if not lines:
                    continue
                for line in lines:
                    out.append(_emit_line(line.get("spans", []), fn_threshold))
                out.append("")  # separa blocos/parágrafos
    return "\n".join(out)


def _epub_style(el) -> str:
    """Detecta estilo de um elemento EPUB por tag, classe CSS ou style inline."""
    name = el.name or ""
    cls = " ".join(el.get("class") or []).lower()
    style = (el.get("style") or "").lower()
    if name == "sup" or "footnote" in cls or "note" in cls or "fn" in cls:
        return "f"
    if (name in ("i", "em") or "ital" in cls or "italic" in style
            or "oblique" in style):
        return "i"
    if (name in ("b", "strong") or "bold" in cls or "font-weight:bold" in style
            or "font-weight:700" in style or "font-weight: 700" in style):
        return "b"
    return ""


def _wrap_marker(soup, predicate, start, end):
    for el in soup.find_all(predicate):
        el.insert_before(start)
        el.insert_after(end)
        el.unwrap()


def _extract_epub(path: Path) -> str:
    from ebooklib import epub, ITEM_DOCUMENT
    from bs4 import BeautifulSoup

    book = epub.read_epub(str(path))
    parts: list[str] = []
    for item in book.get_items_of_type(ITEM_DOCUMENT):
        soup = BeautifulSoup(item.get_content(), "html.parser")
        # Ordem: nota de rodapé, depois itálico, depois negrito
        _wrap_marker(soup, lambda e: e.name and _epub_style(e) == "f", FN_START, FN_END)
        _wrap_marker(soup, lambda e: e.name and _epub_style(e) == "i", IT_START, IT_END)
        _wrap_marker(soup, lambda e: e.name and _epub_style(e) == "b", BD_START, BD_END)
        parts.append(soup.get_text("\n"))
    return "\n".join(parts)


def _cleanup(text: str) -> str:
    text = re.sub(r"-\n(\w)", r"\1", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = "\n".join(line.strip() for line in text.splitlines())
    return text.strip()
