// Codifica PCM em MP3 dentro do navegador (lamejs).
//
// Um encoder POR TRECHO, fechado com flush(): cada trecho vira um MP3 completo e
// independente, que depois é só concatenar — mesma coisa que o ffmpeg faz com os
// chunks do Edge TTS no servidor. Isso é o que permite retomar a geração depois
// de fechar a aba sem estourar o áudio.

const BLOCK = 1152  // quadro do MP3

// O lamejs (~250KB) só é baixado por quem narra no navegador — quem usa o Edge
// TTS não paga esse peso no bundle.
let Mp3Encoder = null

async function lame() {
  if (!Mp3Encoder) ({ Mp3Encoder } = await import('@breezystack/lamejs'))
  return Mp3Encoder
}

export async function encodeMp3(float32, sampleRate, kbps) {
  const Encoder = await lame()
  const pcm = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]))
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }

  const encoder = new Encoder(1, sampleRate, kbps)
  const parts = []
  let bytes = 0
  for (let i = 0; i < pcm.length; i += BLOCK) {
    const buf = encoder.encodeBuffer(pcm.subarray(i, i + BLOCK))
    if (buf.length) { parts.push(buf); bytes += buf.length }
  }
  const tail = encoder.flush()
  if (tail.length) { parts.push(tail); bytes += tail.length }

  const out = new Uint8Array(bytes)
  let off = 0
  for (const p of parts) { out.set(p, off); off += p.length }
  return out
}
