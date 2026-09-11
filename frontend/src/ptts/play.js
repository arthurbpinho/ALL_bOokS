// Toca PCM cru (o que o Pocket-TTS devolve) sem passar por arquivo.

let ctx = null

export function playPcm(float32, sampleRate) {
  ctx = ctx || new (window.AudioContext || window.webkitAudioContext)()
  const buffer = ctx.createBuffer(1, float32.length, sampleRate)
  buffer.copyToChannel(float32, 0)
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(ctx.destination)
  source.start()
  return new Promise(resolve => { source.onended = resolve })
}
