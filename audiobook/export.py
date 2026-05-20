"""Exporta os segmentos (traduzidos ou não) como EPUB ou TXT pra download."""

from __future__ import annotations

import html
import uuid
from pathlib import Path

from .parse import NARRATOR

_EPUB_CSS = """
body { font-family: Georgia, 'Times New Roman', serif; line-height: 1.7; margin: 5%; }
h1 { font-size: 1.6em; text-align: center; margin-bottom: 1.5em; }
p { margin: 0 0 0.9em; text-align: justify; }
.speaker { font-weight: bold; }
.narr { color: #444; font-style: italic; }
"""


def _seg_pairs(segments):
    for s in segments:
        if isinstance(s, dict):
            yield s.get("speaker", NARRATOR), s.get("text", "")
        else:
            yield s.speaker, s.text


def build_txt(segments, title: str, path: Path) -> Path:
    parts = [title, ""] if title else []
    for speaker, text in _seg_pairs(segments):
        if speaker == NARRATOR:
            parts.append(text)
        else:
            parts.append(f"{speaker}: {text}")
    path.write_text("\n\n".join(parts), encoding="utf-8")
    return path


def build_epub(segments, title: str, lang: str, path: Path) -> Path:
    from ebooklib import epub

    book = epub.EpubBook()
    book.set_identifier(f"allbooks-{uuid.uuid4().hex[:12]}")
    book.set_title(title)
    book.set_language("pt" if lang == "pt" else "en")
    book.add_author("ALLbOoks")

    body = [f"<h1>{html.escape(title)}</h1>"]
    for speaker, text in _seg_pairs(segments):
        esc = html.escape(text)
        if speaker == NARRATOR:
            body.append(f'<p class="narr">{esc}</p>')
        else:
            body.append(f'<p><span class="speaker">{html.escape(speaker)}:</span> {esc}</p>')

    style = epub.EpubItem(uid="style", file_name="style/main.css",
                          media_type="text/css", content=_EPUB_CSS)
    book.add_item(style)

    chapter = epub.EpubHtml(title=title, file_name="content.xhtml",
                            lang=("pt" if lang == "pt" else "en"))
    chapter.content = "<html><head></head><body>" + "\n".join(body) + "</body></html>"
    chapter.add_item(style)
    book.add_item(chapter)

    book.toc = (chapter,)
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())
    book.spine = ["nav", chapter]

    epub.write_epub(str(path), book)
    return path
