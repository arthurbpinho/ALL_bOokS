// Fatia os segmentos do livro em trechos pequenos pra narrar no navegador.
//
// Por que fatiar aqui e não deixar o worker fatiar: o worker até quebra textos
// longos sozinho, mas a gente precisa de granularidade pra barra de progresso e
// pra poder RETOMAR de onde parou se a aba fechar. No modo "voz única" o livro
// inteiro vem como um único segmento — sem isso seria um bloco só.

const SPEAKABLE = /[0-9A-Za-zÀ-ÿ]/

/** ~900 caracteres ≈ 1 minuto de áudio: progresso fino sem overhead por trecho. */
export const MAX_CHARS = 900

function splitText(text, maxChars) {
  const out = []
  // Parágrafo é a melhor costura: a pausa cai onde o autor já pôs uma.
  for (const para of text.split(/\n\s*\n/)) {
    const clean = para.trim()
    if (!clean) continue
    if (clean.length <= maxChars) { out.push(clean); continue }

    let cur = ''
    for (const sent of clean.split(/(?<=[.!?…])\s+/)) {
      if (!sent) continue
      if (sent.length > maxChars) {
        if (cur) { out.push(cur); cur = '' }
        // Frase gigante (lista sem ponto final, etc.): corta na vírgula.
        let rest = sent
        while (rest.length > maxChars) {
          const win = rest.slice(0, maxChars)
          const cut = Math.max(win.lastIndexOf(', '), win.lastIndexOf('; '))
          const at = cut > maxChars * 0.4 ? cut + 1 : maxChars
          out.push(rest.slice(0, at).trim())
          rest = rest.slice(at)
        }
        if (rest.trim()) cur = rest.trim()
        continue
      }
      const cand = cur ? `${cur} ${sent}` : sent
      if (cand.length > maxChars) { out.push(cur); cur = sent } else { cur = cand }
    }
    if (cur) out.push(cur)
  }
  return out
}

export function buildChunks(segments, voiceMap, maxChars = MAX_CHARS) {
  const fallback = voiceMap.NARRADOR || Object.values(voiceMap)[0]
  const chunks = []
  for (const seg of segments) {
    const voice = voiceMap[seg.speaker] || fallback
    for (const piece of splitText(seg.text || '', maxChars)) {
      // Trecho sem nada falável (só pontuação) viraria um MP3 vazio.
      if (!SPEAKABLE.test(piece)) continue
      chunks.push({ index: chunks.length, speaker: seg.speaker, voice, text: piece })
    }
  }
  return chunks
}

/**
 * Identidade do plano de geração. Se o texto ou as vozes mudarem, o id muda e o
 * áudio meio-pronto guardado no navegador é descartado em vez de virar salada.
 */
export function planId(jobId, chunks) {
  let h = 5381
  const sig = chunks.map(c => `${c.voice}:${c.text.length}`).join('|')
  for (let i = 0; i < sig.length; i++) h = ((h * 33) ^ sig.charCodeAt(i)) >>> 0
  return `${jobId}-${chunks.length}-${h.toString(36)}`
}
