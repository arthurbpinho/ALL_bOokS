"""API Flask: upload → (opcional traduzir) → configurar vozes → gerar audiobook.

TTS via Edge (gratuito). OpenAI usado apenas pra tradução e detecção via IA.
"""

from __future__ import annotations

import io
import json
import os
import re
import shutil
import tempfile
import threading
import time
import uuid
from dataclasses import asdict
from pathlib import Path

from dotenv import load_dotenv
from flask import (
    Flask, abort, jsonify, request, send_file, send_from_directory,
)
from flask_cors import CORS

from audiobook import concat as concat_mod
from audiobook import edge_backend, export, extract, parse, translate, tts
from audiobook.inhibit import InhibitSuspend
from audiobook.voices import VOICES, pick_for_gender


load_dotenv()

BASE_DIR = Path(__file__).parent
UPLOADS = BASE_DIR / "uploads"
OUTPUTS = Path(os.getenv("OUTPUT_DIR", BASE_DIR / "outputs"))
FRONTEND_DIST = BASE_DIR / "frontend" / "dist"
UPLOADS.mkdir(exist_ok=True)
OUTPUTS.mkdir(exist_ok=True)

app = Flask(__name__, static_folder=None)
CORS(app, resources={r"/api/*": {"origins": "*"}})
app.config["MAX_CONTENT_LENGTH"] = 200 * 1024 * 1024

JOBS: dict[str, dict] = {}

# Jobs mais antigos que isso são apagados do disco (controla o volume no Railway).
# 0 desativa. Padrão: 48h — gera e baixa logo depois, não precisa guardar muito.
CLEANUP_TTL_HOURS = float(os.getenv("CLEANUP_TTL_HOURS", "48"))


# ============== Limpeza de disco ==============

def _cleanup_old_jobs():
    """Remove pastas de jobs antigas. Não toca em jobs ainda rodando."""
    if CLEANUP_TTL_HOURS <= 0 or not OUTPUTS.exists():
        return
    cutoff = time.time() - CLEANUP_TTL_HOURS * 3600
    removed = 0
    for d in OUTPUTS.iterdir():
        if not d.is_dir():
            continue
        job = JOBS.get(d.name)
        if job and job.get("stage") in {"generating", "translating"}:
            continue
        try:
            if d.stat().st_mtime < cutoff:
                shutil.rmtree(d, ignore_errors=True)
                JOBS.pop(d.name, None)
                removed += 1
        except OSError:
            pass
    if removed:
        print(f"[cleanup] {removed} pasta(s) de job com +{CLEANUP_TTL_HOURS}h removida(s)")


def _start_cleanup_loop():
    _cleanup_old_jobs()  # roda já no boot (quando o container acorda)

    def _loop():
        while True:
            time.sleep(6 * 3600)
            _cleanup_old_jobs()

    threading.Thread(target=_loop, daemon=True).start()


# ============== Helpers ==============

def _job_dir(job_id: str) -> Path:
    return OUTPUTS / job_id


def _serialize_job(job: dict) -> dict:
    skip = {"progress_obj", "trans_progress_obj", "thread"}
    out: dict = {}
    for k, v in job.items():
        if k in skip:
            continue
        if k == "chunks":
            out[k] = [
                {**{kk: vv for kk, vv in asdict(c).items() if kk != "path"},
                 "path": str(c.path) if c.path else None,
                 "filename": c.path.name if c.path else None}
                for c in v
            ]
        else:
            out[k] = v
    if "progress_obj" in job:
        out["progress"] = job["progress_obj"].snapshot()
    if "trans_progress_obj" in job:
        out["trans_progress"] = job["trans_progress_obj"].snapshot()
    return out


def _save_state(job_id: str):
    job = JOBS[job_id]
    (_job_dir(job_id) / "state.json").write_text(
        json.dumps(_serialize_job(job), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _segments_to_dicts(segs: list[parse.Segment]) -> list[dict]:
    return [s.to_dict() for s in segs]


def _dicts_to_segments(ds: list[dict]) -> list[parse.Segment]:
    return [parse.Segment(d["speaker"], d["text"]) for d in ds]


def _recompute_voice_map(job: dict):
    lang = job.get("output_lang", "pt")
    ai_by_name = {a["name"].strip().upper(): a for a in job.get("ai_info", [])}
    used: set[str] = set()
    voice_map: dict[str, str] = {}
    gender_map: dict[str, str] = {}
    for sp in job["speakers"]:
        ai = ai_by_name.get(sp.upper())
        if ai:
            gender = ai.get("gender", "feminina")
        else:
            gender = "feminina" if sp == parse.NARRATOR else "masculina"
        gender_map[sp] = gender
        voice = pick_for_gender(gender, used, lang=lang)
        voice_map[sp] = voice
        used.add(voice)
    job["voice_map"] = voice_map
    job["gender_map"] = gender_map


# ============== Metadata ==============

@app.get("/api/voices")
def api_voices():
    return jsonify(VOICES)


@app.get("/api/patterns")
def api_patterns():
    return jsonify(parse.PATTERNS)


# ============== Lifecycle ==============

@app.post("/api/upload")
def api_upload():
    f = request.files.get("file")
    if not f or not f.filename:
        return jsonify({"error": "Nenhum arquivo enviado"}), 400
    ext = Path(f.filename).suffix.lower()
    if ext not in {".pdf", ".txt", ".epub"}:
        return jsonify({"error": f"Extensão não suportada: {ext}"}), 400

    job_id = uuid.uuid4().hex[:12]
    job_path = _job_dir(job_id)
    job_path.mkdir(parents=True, exist_ok=True)
    src = job_path / f"source{ext}"
    f.save(src)

    text = extract.extract(src)
    (job_path / "text.txt").write_text(text, encoding="utf-8")

    pattern_key = request.form.get("pattern", "uppercase_colon")
    single_voice = request.form.get("single_voice") == "true"
    use_ai = request.form.get("use_ai") == "true"
    ai_detect_names = request.form.get("ai_detect_names") == "true"
    custom_regex = request.form.get("custom_regex", "").strip()
    speakers_manual = request.form.get("speakers_manual", "").strip()
    narrator_italic = request.form.get("narrator_italic") == "true"
    narrator_bold = request.form.get("narrator_bold") == "true"
    narrator_footnote = request.form.get("narrator_footnote") == "true"
    output_lang = request.form.get("output_lang", "pt")
    # Tradução só faz sentido se a saída for português
    translate_to_pt = request.form.get("translate") == "true" and output_lang == "pt"
    tone = request.form.get("tone", "").strip()
    book_context = request.form.get("context", "").strip()

    ai_info: list[dict] = []
    ai_warning: str | None = None
    segments = None

    # Modo livro padrão: uma só voz de leitura, sem diálogos entre personagens.
    # Todo o texto vira NARRADOR (parse_with_speakers com lista vazia).
    if single_voice:
        segments = parse.parse_with_speakers(text, [])

    # A própria IA identifica os nomes dos personagens
    if segments is None and ai_detect_names:
        try:
            ai_info = parse.ai_detect_speakers(text)
        except Exception as e:
            ai_warning = f"Detecção de personagens por IA falhou: {e}"
            print(f"[ai] detect falhou: {e}")
        names = [a["name"] for a in ai_info
                 if a.get("name", "").strip() and a["name"].strip().upper() != parse.NARRATOR]
        if names:
            segments = parse.parse_with_speakers(text, names)

    if segments is None:
        if speakers_manual:
            names = [n.strip() for n in re.split(r"[,;\n]+", speakers_manual) if n.strip()]
            segments = parse.parse_with_speakers(text, names)
        else:
            regex = custom_regex or parse.PATTERNS[pattern_key]["regex"]
            segments = parse.parse_with_regex(text, regex)

    segments = parse.apply_narration_formatting(
        segments, narrator_italic, narrator_bold, narrator_footnote)
    segments = parse.merge_consecutive(segments)
    speakers = parse.list_speakers(segments)

    if use_ai and not ai_info:
        try:
            ai_info = parse.ai_detect_speakers(text)
        except Exception as e:
            ai_warning = f"Detecção de personagens por IA falhou: {e}"
            print(f"[ai] detect falhou: {e}")

    job = {
        "id": job_id,
        "filename": f.filename,
        "single_voice": single_voice,
        "pattern": pattern_key,
        "custom_regex": custom_regex,
        "speakers_manual": speakers_manual,
        "narrator_italic": narrator_italic,
        "narrator_bold": narrator_bold,
        "narrator_footnote": narrator_footnote,
        "use_ai": use_ai,
        "ai_info": ai_info,
        "ai_warning": ai_warning,
        "speakers": speakers,
        "segments": _segments_to_dicts(segments),
        "segment_count": len(segments),
        "char_count": sum(len(s.text) for s in segments),
        "output_lang": output_lang,
        "translate": translate_to_pt,
        "tone": tone,
        "book_context": book_context,
        "translated": False,
        "stage": "translating" if translate_to_pt else "ready",
    }
    _recompute_voice_map(job)
    JOBS[job_id] = job

    if translate_to_pt:
        _start_translation(job_id)

    _save_state(job_id)
    return jsonify(_serialize_job(job))


@app.post("/api/job/<job_id>/reparse")
def api_reparse(job_id):
    """Re-parse o text.txt salvo com nova lista de personagens ou novo regex."""
    job = JOBS.get(job_id)
    if not job:
        return jsonify({"error": "Job não encontrado"}), 404
    text_path = _job_dir(job_id) / "text.txt"
    if not text_path.exists():
        return jsonify({"error": "Texto original não encontrado"}), 404
    text = text_path.read_text(encoding="utf-8")

    data = request.json or {}
    speakers_manual = (data.get("speakers_manual") or "").strip()
    pattern_key = data.get("pattern") or "uppercase_colon"
    custom_regex = (data.get("custom_regex") or "").strip()
    narrator_italic = bool(data.get("narrator_italic", job.get("narrator_italic", False)))
    narrator_bold = bool(data.get("narrator_bold", job.get("narrator_bold", False)))
    narrator_footnote = bool(data.get("narrator_footnote", job.get("narrator_footnote", False)))

    if speakers_manual:
        names = [n.strip() for n in re.split(r"[,;\n]+", speakers_manual) if n.strip()]
        segments = parse.parse_with_speakers(text, names)
    else:
        regex = custom_regex or parse.PATTERNS[pattern_key]["regex"]
        segments = parse.parse_with_regex(text, regex)

    segments = parse.apply_narration_formatting(
        segments, narrator_italic, narrator_bold, narrator_footnote)
    segments = parse.merge_consecutive(segments)

    job["speakers_manual"] = speakers_manual
    job["pattern"] = pattern_key
    job["custom_regex"] = custom_regex
    job["narrator_italic"] = narrator_italic
    job["narrator_bold"] = narrator_bold
    job["narrator_footnote"] = narrator_footnote
    job["segments"] = _segments_to_dicts(segments)
    job["segment_count"] = len(segments)
    job["char_count"] = sum(len(s.text) for s in segments)
    job["speakers"] = parse.list_speakers(segments)
    _recompute_voice_map(job)
    _save_state(job_id)
    return jsonify(_serialize_job(job))


def _start_translation(job_id: str):
    job = JOBS[job_id]
    segments = _dicts_to_segments(job["segments"])
    # Preserva o texto original (será sobrescrito pela tradução) pra comparação no modo avançado
    job["segments_original"] = [dict(s) for s in job["segments"]]
    prog = translate.TranslationProgress(total=len(segments))
    job["trans_progress_obj"] = prog

    def _run():
        try:
            translated = translate.translate_segments(
                segments=segments,
                tone=job["tone"],
                context=job["book_context"],
                progress=prog,
            )
            job["segments"] = _segments_to_dicts(translated)
            job["char_count"] = sum(len(s.text) for s in translated)
            job["translated"] = True
            job["stage"] = "ready"
            prog.finish()
        except Exception as e:
            prog.finish(error=str(e))
            job["stage"] = "error"
        finally:
            _save_state(job_id)

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    job["thread"] = t


@app.get("/api/job/<job_id>")
def api_job(job_id):
    job = JOBS.get(job_id)
    if not job:
        return jsonify({"error": "Job não encontrado"}), 404
    return jsonify(_serialize_job(job))


@app.post("/api/job/<job_id>/segments")
def api_update_segments(job_id):
    job = JOBS.get(job_id)
    if not job:
        return jsonify({"error": "Job não encontrado"}), 404
    data = request.json or {}
    new_segments = data.get("segments")
    if not isinstance(new_segments, list):
        return jsonify({"error": "segments inválido"}), 400
    cleaned = [
        {"speaker": s.get("speaker", "NARRADOR"), "text": s.get("text", "").strip()}
        for s in new_segments if s.get("text", "").strip()
    ]
    job["segments"] = cleaned
    job["segment_count"] = len(cleaned)
    job["char_count"] = sum(len(s["text"]) for s in cleaned)
    job["speakers"] = []
    for s in cleaned:
        if s["speaker"] not in job["speakers"]:
            job["speakers"].append(s["speaker"])
    _recompute_voice_map(job)
    _save_state(job_id)
    return jsonify(_serialize_job(job))


@app.post("/api/preview-voice")
def api_preview_voice():
    data = request.json or {}
    voice = data.get("voice", "pt-BR-FranciscaNeural")
    text = (data.get("text") or "Olá, esta é uma amostra da minha voz.")[:300]
    buf = io.BytesIO()
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
        tmp_path = Path(tmp.name)
    try:
        edge_backend.synthesize_chunk(text, voice, tmp_path)
        buf.write(tmp_path.read_bytes())
    finally:
        tmp_path.unlink(missing_ok=True)
    buf.seek(0)
    return send_file(buf, mimetype="audio/mpeg", download_name=f"preview_{voice}.mp3")


@app.post("/api/job/<job_id>/generate")
def api_generate(job_id):
    job = JOBS.get(job_id)
    if not job:
        return jsonify({"error": "Job não encontrado"}), 404
    data = request.json or {}
    inhibit_sleep = bool(data.get("inhibit_sleep", True))
    voice_map_override = data.get("voice_map") or {}
    for sp, v in voice_map_override.items():
        if sp in job["voice_map"]:
            job["voice_map"][sp] = v

    segments = _dicts_to_segments(job["segments"])
    chunks = tts.build_chunks(segments, job["voice_map"])
    job["chunks"] = chunks
    job["inhibit_sleep"] = inhibit_sleep
    job["stage"] = "generating"

    progress = tts.Progress(total=len(chunks))
    job["progress_obj"] = progress
    chunks_dir = _job_dir(job_id) / "chunks"

    def _run():
        try:
            with InhibitSuspend(
                why=f"Gerando audiobook: {job['filename']}",
                enabled=inhibit_sleep,
            ) as guard:
                job["inhibit_method"] = guard.method
                tts.synthesize(
                    chunks=chunks, output_dir=chunks_dir, progress=progress,
                    concurrency=int(os.getenv("TTS_CONCURRENCY", "5")),
                )
                if progress.cancelled:
                    # Cancelado pelo usuário: volta pra configuração (chunks já gerados
                    # ficam em disco e são reaproveitados se gerar de novo).
                    job["stage"] = "ready"
                else:
                    paths = [c.path for c in chunks if c.path]
                    concat_mod.write_playlist(paths, _job_dir(job_id) / "playlist.m3u")
                    progress.finish()
                    job["stage"] = "done"
        except Exception as e:
            progress.finish(error=str(e))
            job["stage"] = "error"
        finally:
            _save_state(job_id)

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    job["thread"] = t
    _save_state(job_id)
    return jsonify(_serialize_job(job))


@app.post("/api/job/<job_id>/cancel")
def api_cancel(job_id):
    """Cancela a geração do audiobook em andamento. O job volta pra configuração."""
    job = JOBS.get(job_id)
    if not job:
        return jsonify({"error": "Job não encontrado"}), 404
    prog = job.get("progress_obj")
    if job.get("stage") == "generating" and prog:
        prog.cancel()
    return jsonify(_serialize_job(job))


@app.post("/api/job/<job_id>/concat")
def api_concat(job_id):
    job = JOBS.get(job_id)
    if not job or "chunks" not in job:
        return jsonify({"error": "Job sem áudios"}), 404
    paths = sorted([c.path for c in job["chunks"] if c.path], key=lambda p: p.name)
    out = _job_dir(job_id) / "audiobook_full.mp3"
    try:
        concat_mod.concat_to_single(paths, out)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify({"ok": True, "filename": out.name})


@app.get("/api/job/<job_id>/export/<fmt>")
def api_export(job_id, fmt):
    """Exporta o texto (traduzido ou não) como EPUB ou TXT. Lê do state.json em disco."""
    state_path = _job_dir(job_id) / "state.json"
    if not state_path.exists():
        return jsonify({"error": "Job não encontrado"}), 404
    state = json.loads(state_path.read_text(encoding="utf-8"))
    segments = state.get("segments", [])
    lang = state.get("output_lang", "pt")
    stem = Path(state.get("filename", "livro")).stem
    suffix = " (PT-BR)" if state.get("translated") else ""
    title = f"{stem}{suffix}"

    if fmt == "epub":
        out = _job_dir(job_id) / "texto.epub"
        export.build_epub(segments, title, lang, out)
        return send_file(out, mimetype="application/epub+zip",
                         as_attachment=True, download_name=f"{stem}{suffix}.epub")
    if fmt == "txt":
        out = _job_dir(job_id) / "texto.txt"
        export.build_txt(segments, title, out)
        return send_file(out, mimetype="text/plain",
                         as_attachment=True, download_name=f"{stem}{suffix}.txt")
    return jsonify({"error": "formato inválido (use epub ou txt)"}), 400


@app.get("/api/job/<job_id>/files/<path:name>")
def api_download(job_id, name):
    job_path = _job_dir(job_id)
    if (job_path / name).exists():
        return send_from_directory(job_path, name)
    if (job_path / "chunks" / name).exists():
        return send_from_directory(job_path / "chunks", name)
    abort(404)


# ============== Frontend ==============

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    if not FRONTEND_DIST.exists():
        return (
            "<h1>Front-end não foi buildado.</h1>"
            "<p>Em dev: <code>cd frontend && npm run dev</code> (http://localhost:5173)</p>",
            200,
        )
    target = FRONTEND_DIST / path
    if path and target.exists() and target.is_file():
        return send_from_directory(FRONTEND_DIST, path)
    return send_from_directory(FRONTEND_DIST, "index.html")


_start_cleanup_loop()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
