// Configuração do Pocket-TTS rodando no navegador do visitante.
//
// Por que existe: o Edge TTS é gratuito mas roda no servidor; o Pocket-TTS roda
// 100% no navegador de quem está usando o app. O Railway não gasta CPU nem banda
// — os pesos vêm direto do CDN do Hugging Face (CORS liberado, checado).
//
// Os pesos são o export ONNX int8 feito por KevinAHM a partir do modelo da
// Kyutai (kyutai/pocket-tts). Revisão FIXA: se o autor publicar algo novo, nada
// muda aqui sem a gente querer.

export const PTTS_SPACE = 'KevinAHM/pocket-tts-web'
export const PTTS_REV = 'd0c0c79b7712256a32d691c67f20b8ae2e020d00'
export const PTTS_BUNDLE_BASE =
  `https://huggingface.co/spaces/${PTTS_SPACE}/resolve/${PTTS_REV}/onnx`

// Worker + tokenizer ficam em public/ptts/ (servidos pelo próprio app).
export const PTTS_WORKER_URL = '/ptts/inference-worker.js'

// Idioma do livro -> bundle do Pocket-TTS. Só existem esses no export web.
export const PTTS_BUNDLES = {
  pt: 'portuguese',
  en: 'english_2026-04',
}

// Quanto o visitante baixa na primeira vez (fica no cache do navegador depois):
// flow_lm_main 76 + mimi_decoder 23 + text_conditioner 16 + flow_lm_flow 10 +
// voices.bin 52 ≈ 178 MB. O mimi_encoder (21MB) só baixa se clonar voz.
export const PTTS_DOWNLOAD_MB = 178

// Taxa do MP3 gerado no navegador. 64kbps mono @24kHz ≈ 29MB por hora de áudio.
export const MP3_KBPS = 64

// As 8 vozes que já vêm no bundle (voices.bin), as mesmas do repositório público
// kyutai/tts-voices. Não inventamos descrição de timbre: ouça o preview.
export const POCKET_VOICES = [
  { id: 'alba', gender: 'feminina' },
  { id: 'azelma', gender: 'feminina' },
  { id: 'cosette', gender: 'feminina' },
  { id: 'eponine', gender: 'feminina' },
  { id: 'fantine', gender: 'feminina' },
  { id: 'javert', gender: 'masculina' },
  { id: 'jean', gender: 'masculina' },
  { id: 'marius', gender: 'masculina' },
]

export const POCKET_BY_ID = Object.fromEntries(POCKET_VOICES.map(v => [v.id, v]))

/** Distribui as vozes do Pocket entre os personagens, respeitando o gênero. */
export function buildPocketVoiceMap(speakers, genderMap) {
  const pools = {
    feminina: POCKET_VOICES.filter(v => v.gender === 'feminina').map(v => v.id),
    masculina: POCKET_VOICES.filter(v => v.gender === 'masculina').map(v => v.id),
  }
  const used = new Set()
  const map = {}
  for (const sp of speakers) {
    const pool = pools[genderMap?.[sp]] || pools.feminina
    map[sp] = pool.find(id => !used.has(id)) || pool[0]
    used.add(map[sp])
  }
  return map
}
