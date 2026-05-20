"""Recupera o áudio de um job: regenera chunks faltantes (mantém os bons) e remonta.

Uso: python recover_job.py <job_id> [voz_para_VENTURA]
"""

import json
import sys
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

from audiobook import concat as concat_mod
from audiobook import tts
from audiobook.parse import Segment

job_id = sys.argv[1] if len(sys.argv) > 1 else "7b32803f7d79"
ventura_voice = sys.argv[2] if len(sys.argv) > 2 else "en-US-AndrewMultilingualNeural"

job_dir = Path("outputs") / job_id
state = json.loads((job_dir / "state.json").read_text(encoding="utf-8"))

segments = [Segment(s["speaker"], s["text"]) for s in state["segments"]]
voice_map = dict(state["voice_map"])
# Troca a voz quebrada do VENTURA por uma que funciona
if "VENTURA" in voice_map:
    print(f"VENTURA: {voice_map['VENTURA']} -> {ventura_voice}")
    voice_map["VENTURA"] = ventura_voice

chunks = tts.build_chunks(segments, voice_map)
print(f"Total de chunks: {len(chunks)}")

chunks_dir = job_dir / "chunks"
existing = sum(1 for c in chunks
               if (chunks_dir / f"chunk_{c.index:05d}_{c.speaker}.mp3").exists())
print(f"Já em disco (serão reusados): {existing} · faltando: {len(chunks)-existing}")

progress = tts.Progress(total=len(chunks))
tts.synthesize(chunks=chunks, output_dir=chunks_dir, progress=progress, concurrency=4)
snap = progress.snapshot()
print(f"Síntese: {snap['done']} ok, {snap['failed']} falhas")

paths = sorted([c.path for c in chunks if c.path], key=lambda p: p.name)
concat_mod.write_playlist(paths, job_dir / "playlist.m3u")
print(f"Playlist com {len(paths)} trechos")

full = job_dir / "audiobook_full.mp3"
concat_mod.concat_to_single(paths, full)
print(f"MP3 final: {full} ({full.stat().st_size/1024/1024:.1f} MB)")
