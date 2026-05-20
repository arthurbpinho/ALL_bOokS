"""Catálogo de vozes Edge TTS — TODAS validadas (produzem áudio de fato).

pt-BR tem só 1 voz masculina nativa (Antonio), então usamos vozes multilíngues
(Andrew/Brian/Ava) que leem português com qualidade pra dar variedade de timbres.
"""

VOICES = [
    # ---------- Português (Brasil) ----------
    {"id": "pt-BR-AntonioNeural",            "gender": "masculina", "lang": "pt", "backend": "edge",
     "note": "masculina · nativa BR, firme"},
    {"id": "en-US-AndrewMultilingualNeural", "gender": "masculina", "lang": "pt", "backend": "edge",
     "note": "masculina · multilíngue, natural"},
    {"id": "en-US-BrianMultilingualNeural",  "gender": "masculina", "lang": "pt", "backend": "edge",
     "note": "masculina · multilíngue, grave"},
    {"id": "pt-BR-FranciscaNeural",          "gender": "feminina",  "lang": "pt", "backend": "edge",
     "note": "feminina · nativa BR, clara"},
    {"id": "pt-BR-ThalitaMultilingualNeural","gender": "feminina",  "lang": "pt", "backend": "edge",
     "note": "feminina · BR, jovem"},
    {"id": "en-US-AvaMultilingualNeural",    "gender": "feminina",  "lang": "pt", "backend": "edge",
     "note": "feminina · multilíngue, suave"},

    # ---------- Inglês (EUA) ----------
    {"id": "en-US-GuyNeural",         "gender": "masculina", "lang": "en", "backend": "edge", "note": "male · natural, US"},
    {"id": "en-US-ChristopherNeural", "gender": "masculina", "lang": "en", "backend": "edge", "note": "male · deep, US"},
    {"id": "en-US-EricNeural",        "gender": "masculina", "lang": "en", "backend": "edge", "note": "male · calm, US"},
    {"id": "en-US-AndrewNeural",      "gender": "masculina", "lang": "en", "backend": "edge", "note": "male · warm, US"},
    {"id": "en-US-BrianNeural",       "gender": "masculina", "lang": "en", "backend": "edge", "note": "male · casual, US"},
    {"id": "en-US-RogerNeural",       "gender": "masculina", "lang": "en", "backend": "edge", "note": "male · clear, US"},
    {"id": "en-US-AriaNeural",        "gender": "feminina",  "lang": "en", "backend": "edge", "note": "female · clear, US"},
    {"id": "en-US-JennyNeural",       "gender": "feminina",  "lang": "en", "backend": "edge", "note": "female · friendly, US"},
    {"id": "en-US-EmmaNeural",        "gender": "feminina",  "lang": "en", "backend": "edge", "note": "female · gentle, US"},
    {"id": "en-US-AvaNeural",         "gender": "feminina",  "lang": "en", "backend": "edge", "note": "female · natural, US"},
    {"id": "en-US-MichelleNeural",    "gender": "feminina",  "lang": "en", "backend": "edge", "note": "female · warm, US"},

    # ---------- Inglês (Reino Unido) ----------
    {"id": "en-GB-RyanNeural",   "gender": "masculina", "lang": "en", "backend": "edge", "note": "male · British"},
    {"id": "en-GB-ThomasNeural", "gender": "masculina", "lang": "en", "backend": "edge", "note": "male · British"},
    {"id": "en-GB-SoniaNeural",  "gender": "feminina",  "lang": "en", "backend": "edge", "note": "female · British"},
    {"id": "en-GB-LibbyNeural",  "gender": "feminina",  "lang": "en", "backend": "edge", "note": "female · British"},
]

BY_ID = {v["id"]: v for v in VOICES}


def voices_by_gender(gender: str, lang: str | None = None) -> list[dict]:
    out = [v for v in VOICES if v["gender"] == gender]
    if lang:
        out = [v for v in out if v["lang"] == lang]
    return out


def pick_for_gender(gender: str, used: set[str], lang: str = "pt") -> str:
    """Escolhe voz do gênero e idioma pedidos, ainda não usada (ou repete se acabarem)."""
    candidates = voices_by_gender(gender, lang) or voices_by_gender(gender) or VOICES
    for v in candidates:
        if v["id"] not in used:
            return v["id"]
    return candidates[0]["id"]


def backend_of(voice_id: str) -> str:
    v = BY_ID.get(voice_id)
    return v["backend"] if v else "edge"
