"""Geração de playlist M3U e concatenação dos MP3s via ffmpeg."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path


def write_playlist(chunk_paths: list[Path], playlist_path: Path) -> Path:
    lines = ["#EXTM3U"]
    for p in chunk_paths:
        # Caminho relativo ao playlist
        try:
            rel = p.relative_to(playlist_path.parent)
        except ValueError:
            rel = p
        lines.append(str(rel))
    playlist_path.write_text("\n".join(lines), encoding="utf-8")
    return playlist_path


def concat_to_single(chunk_paths: list[Path], output_path: Path) -> Path:
    """Junta todos os MP3s num único arquivo. Requer ffmpeg no PATH."""
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg não encontrado no PATH. Instale com: sudo apt install ffmpeg")

    list_file = output_path.parent / f"{output_path.stem}_list.txt"
    list_file.write_text(
        "\n".join(f"file '{p.resolve()}'" for p in chunk_paths),
        encoding="utf-8",
    )

    cmd = [
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0",
        "-i", str(list_file),
        "-c", "copy",
        str(output_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    list_file.unlink(missing_ok=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg falhou: {result.stderr[-500:]}")
    return output_path
