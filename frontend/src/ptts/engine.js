// Ponte com o worker do Pocket-TTS (public/ptts/inference-worker.js).
//
// O worker faz a inferência ONNX em WebAssembly. Aqui a gente só serializa as
// operações (uma por vez) e transforma o protocolo de mensagens em promises.

import { PTTS_BUNDLE_BASE, PTTS_WORKER_URL, PTTS_BUNDLES } from './config'

function concatFloat32(parts) {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Float32Array(total)
  let off = 0
  for (const p of parts) { out.set(p, off); off += p.length }
  return out
}

// O worker fala inglês técnico; a tela fala português. Status de repouso vira
// string vazia pra não deixar "Finished" pendurado na interface.
const STATUS_PT = [
  [/Worker Thread Started/i, 'Iniciando…'],
  [/Loading ONNX Runtime/i, 'Carregando o motor de voz…'],
  [/Loading .* bundle/i, 'Baixando o modelo (só na primeira vez)…'],
  [/Preparing (?:custom )?voice \(?([^)]*)\)?/i, (m) => `Preparando a voz ${m[1] || ''}…`.replace(' …', '…')],
  [/Preparing/i, 'Preparando…'],
  [/Generating/i, 'Narrando…'],
  [/Stopped|Finished|Ready|^$/i, ''],
]

export function statusPt(texto = '', estado) {
  if (estado === 'idle') return ''
  for (const [re, alvo] of STATUS_PT) {
    const m = texto.match(re)
    if (m) return typeof alvo === 'function' ? alvo(m) : alvo
  }
  return texto
}

export class PocketEngine {
  constructor() {
    this.worker = null
    this.language = null
    this.sampleRate = 24000
    this.onStatus = null          // (texto, estado) => void
    this._pending = null          // { type, resolve, reject }
    this._pcm = []
    this._chain = Promise.resolve()
  }

  get loaded() {
    return !!this.worker && !!this.language
  }

  /** Serializa: o worker só aguenta uma operação por vez. */
  _run(type, send) {
    const task = this._chain.then(() => new Promise((resolve, reject) => {
      this._pending = { type, resolve, reject }
      this._pcm = []
      try { send() } catch (e) { this._pending = null; reject(e) }
    }))
    // A fila não pode travar num erro: ela continua mesmo se a task rejeitar.
    this._chain = task.catch(() => {})
    return task
  }

  _settle(type, value) {
    if (this._pending?.type !== type) return
    const { resolve } = this._pending
    this._pending = null
    resolve(value)
  }

  _fail(err) {
    if (!this._pending) return
    const { reject } = this._pending
    this._pending = null
    reject(err)
  }

  _onMessage(msg) {
    switch (msg.type) {
      case 'status':
        this.onStatus?.(msg.status, msg.state)
        break
      case 'bundle_loaded':
        this.sampleRate = Number(msg.sampleRate) || 24000
        this._settle('load')
        break
      case 'audio_chunk':
        if (this._pending?.type === 'speak') this._pcm.push(new Float32Array(msg.data))
        break
      case 'stream_ended':
        this._settle('speak', concatFloat32(this._pcm))
        break
      case 'voice_set':
      case 'voice_encoded':
        this._settle('voice')
        break
      case 'error':
        this._fail(new Error(msg.error))
        break
      default:
        break
    }
  }

  /** Baixa/abre o bundle do idioma. Só o 1º acesso baixa de fato (cache do navegador). */
  load(outputLang = 'pt') {
    const language = PTTS_BUNDLES[outputLang] || PTTS_BUNDLES.pt
    if (this.language === language) return Promise.resolve()

    if (!this.worker) {
      this.worker = new Worker(PTTS_WORKER_URL, { type: 'module' })
      this.worker.onmessage = (e) => this._onMessage(e.data)
      this.worker.onerror = (e) => this._fail(new Error(e.message || 'falha no worker do Pocket-TTS'))
    }

    const first = !this.language
    const p = this._run('load', () => {
      this.worker.postMessage({
        type: first ? 'load' : 'set_language',
        data: { language, bundleBase: PTTS_BUNDLE_BASE },
      })
    })
    return p.then(() => { this.language = language })
  }

  /** Sintetiza um trecho e devolve PCM float32 mono na taxa do modelo (24kHz). */
  speak(text, voice) {
    return this._run('speak', () => {
      this.worker.postMessage({ type: 'generate', data: { text, voice } })
    })
  }

  /** Interrompe a síntese em andamento. A promise do speak() rejeita com .cancelled. */
  stop() {
    if (!this.worker) return
    this.worker.postMessage({ type: 'stop' })
    const err = new Error('geração cancelada')
    err.cancelled = true
    this._fail(err)
  }

  terminate() {
    this.stop()
    this.worker?.terminate()
    this.worker = null
    this.language = null
  }
}

// Uma instância só por aba: o modelo ocupa ~200MB de RAM e o preview da tela de
// configuração já deixa tudo quente pra geração do livro.
let singleton = null

export function getEngine() {
  if (!singleton) singleton = new PocketEngine()
  return singleton
}
