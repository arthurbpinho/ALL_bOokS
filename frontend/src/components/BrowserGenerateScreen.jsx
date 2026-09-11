import { useEffect, useMemo, useRef, useState } from 'react'
import { MP3_KBPS, PTTS_DOWNLOAD_MB, POCKET_BY_ID } from '../ptts/config'
import { getEngine, statusPt } from '../ptts/engine'
import { buildChunks, planId } from '../ptts/chunker'
import { encodeMp3 } from '../ptts/mp3'
import { savePart, resumeIndex, readAll, clearPlan, clearOthers } from '../ptts/store'

function fmtTime(sec) {
  if (!isFinite(sec) || sec <= 0) return '—'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  return h ? `${h}h${String(m).padStart(2, '0')}` : m ? `${m}min` : `${s}s`
}

export default function BrowserGenerateScreen({ job, voiceMap, onBack, onReset }) {
  const chunks = useMemo(() => buildChunks(job.segments, voiceMap), [job.segments, voiceMap])
  const plan = useMemo(() => planId(job.id, chunks), [job.id, chunks])

  const [phase, setPhase] = useState('idle')     // idle|loading|running|paused|done|error
  const [doneCount, setDoneCount] = useState(0)
  const [status, setStatus] = useState('')
  const [error, setError] = useState(null)
  const [audioSec, setAudioSec] = useState(0)
  const [genSec, setGenSec] = useState(0)
  const [blobUrl, setBlobUrl] = useState(null)
  const [preparing, setPreparing] = useState(false)

  const doneRef = useRef(0)
  const abortRef = useRef(false)
  const wakeRef = useRef(null)

  // Retoma de onde parou (os trechos prontos ficam no IndexedDB desta máquina).
  useEffect(() => {
    let alive = true
    resumeIndex(plan).then(n => {
      if (!alive) return
      doneRef.current = n
      setDoneCount(n)
      if (n >= chunks.length && chunks.length) setPhase('done')
    }).catch(() => {})
    clearOthers(plan).catch(() => {})
    return () => { alive = false }
  }, [plan, chunks.length])

  // Fechar a aba no meio perde só o trecho em voo, mas avisa mesmo assim.
  useEffect(() => {
    if (phase !== 'running' && phase !== 'loading') return
    const warn = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [phase])

  async function lockScreen(on) {
    try {
      if (on && navigator.wakeLock && !wakeRef.current) {
        wakeRef.current = await navigator.wakeLock.request('screen')
      } else if (!on && wakeRef.current) {
        await wakeRef.current.release()
        wakeRef.current = null
      }
    } catch { /* sem wake lock, paciência */ }
  }

  async function start() {
    setError(null)
    abortRef.current = false
    const engine = getEngine()
    engine.onStatus = (txt, estado) => setStatus(statusPt(txt, estado))

    try {
      setPhase('loading')
      await engine.load(job.output_lang || 'pt')
      await lockScreen(true)
      setPhase('running')

      for (let i = doneRef.current; i < chunks.length; i++) {
        if (abortRef.current) { setPhase('paused'); await lockScreen(false); return }
        const t0 = performance.now()
        const pcm = await engine.speak(chunks[i].text, chunks[i].voice)
        const bytes = await encodeMp3(pcm, engine.sampleRate, MP3_KBPS)
        await savePart(plan, i, bytes)

        doneRef.current = i + 1
        setDoneCount(i + 1)
        setAudioSec(s => s + pcm.length / engine.sampleRate)
        setGenSec(s => s + (performance.now() - t0) / 1000)
      }

      setPhase('done')
      setStatus('')
    } catch (e) {
      if (e?.cancelled) setPhase('paused')
      else { setError(e.message || String(e)); setPhase('error') }
    } finally {
      await lockScreen(false)
    }
  }

  function pause() {
    abortRef.current = true
    getEngine().stop()
  }

  async function download() {
    setPreparing(true)
    try {
      const parts = await readAll(plan)
      const blob = new Blob(parts, { type: 'audio/mpeg' })
      const url = URL.createObjectURL(blob)
      setBlobUrl(url)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(job.filename || 'audiobook').replace(/\.[^.]+$/, '')}.mp3`
      a.click()
    } catch (e) {
      setError(e.message)
    } finally {
      setPreparing(false)
    }
  }

  async function restart() {
    if (!confirm('Apagar os trechos já narrados neste navegador e começar do zero?')) return
    await clearPlan(plan)
    doneRef.current = 0
    setDoneCount(0)
    setAudioSec(0)
    setGenSec(0)
    setBlobUrl(null)
    setPhase('idle')
  }

  const pct = chunks.length ? Math.round(100 * doneCount / chunks.length) : 0
  const rtf = genSec > 0 ? audioSec / genSec : 0
  const secPerChunk = doneCount && genSec ? genSec / doneCount : 0
  const eta = secPerChunk * (chunks.length - doneCount)
  // O áudio total é estimado pelo ritmo medido até agora.
  const totalAudio = doneCount ? audioSec * chunks.length / doneCount : 0
  const sizeMb = totalAudio * MP3_KBPS / 8 / 1024
  const isolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated
  const voicesUsed = [...new Set(chunks.map(c => c.voice))]

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-2xl mb-1">
          {phase === 'done' ? '✅ Audiobook pronto!' : '🎙 Narrando no seu navegador'}
        </h2>
        <p className="text-ink-soft text-sm">
          Pocket-TTS · <span className="text-marrs">roda 100% aqui na sua máquina</span>
          {' · '}{job.filename}
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 text-sm">
          <Stat label="Trechos" value={`${doneCount.toLocaleString()} / ${chunks.length.toLocaleString()}`} />
          <Stat label="Áudio pronto" value={fmtTime(audioSec)} />
          <Stat label="Velocidade" value={rtf ? `${rtf.toFixed(1)}× tempo real` : '—'} />
          <Stat label={phase === 'done' ? 'Duração' : 'Falta'}
                value={phase === 'done' ? fmtTime(audioSec) : fmtTime(eta)} highlight />
        </div>

        <div className="mt-6">
          <div className="flex justify-between mb-2">
            <span className="text-sm font-medium text-ink">{status || ' '}</span>
            <span className="text-3xl font-serif text-marrs">{pct}%</span>
          </div>
          <div className="h-4 bg-sand rounded-full overflow-hidden">
            <div className={`h-full ${phase === 'running' ? 'progress-bar-anim' : 'bg-marrs'} shadow-marrs transition-all duration-500`}
                 style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mt-6">
          {(phase === 'idle' || phase === 'paused' || phase === 'error') && (
            <button onClick={start} className="btn btn-primary">
              {doneCount ? '▶ Continuar de onde parou' : '▶ Começar a narrar'}
            </button>
          )}
          {(phase === 'running' || phase === 'loading') && (
            <button onClick={pause} className="btn btn-ghost">⏸ Pausar</button>
          )}
          {doneCount > 0 && (
            <button onClick={download} disabled={preparing} className="btn btn-secondary">
              {preparing ? 'Montando…' : `📥 Baixar MP3${phase === 'done' ? '' : ' (parcial)'}`}
            </button>
          )}
          {doneCount > 0 && phase !== 'running' && phase !== 'loading' && (
            <button onClick={restart} className="btn btn-ghost text-sm">🗑 Recomeçar</button>
          )}
        </div>

        {blobUrl && (
          <audio controls src={blobUrl} className="w-full mt-4">
            Seu navegador não toca áudio.
          </audio>
        )}

        {phase !== 'done' && (
          <p className="text-xs text-ink-muted mt-5">
            ⚠ Diferente do Edge TTS, aqui a conta é sua: <strong>mantenha esta aba aberta</strong>.
            O que já ficou pronto é guardado neste navegador — se fechar, dá pra continuar depois
            do mesmo ponto, nesta mesma máquina.
            {totalAudio > 0 && <> Estimativa final: ~{fmtTime(totalAudio)} de áudio, ~{sizeMb.toFixed(0)}MB.</>}
          </p>
        )}
      </div>

      {!isolated && (
        <div className="card border-terra/40 bg-terra/5">
          <h3 className="text-base text-terra mb-1">🐢 Rodando em 1 núcleo</h3>
          <p className="text-sm text-ink-soft">
            O navegador não está em modo <code className="chip">crossOriginIsolated</code>, então o
            WebAssembly não pode usar várias threads — a narração fica algumas vezes mais lenta.
            Em produção isso depende dos cabeçalhos COOP/COEP (ver <code className="chip">CROSS_ORIGIN_ISOLATION</code>).
          </p>
        </div>
      )}

      {error && (
        <div className="card border-danger/40">
          <h3 className="text-base text-danger mb-1">Erro</h3>
          <pre className="text-sm text-ink-soft whitespace-pre-wrap">{error}</pre>
          <p className="text-xs text-ink-muted mt-2">
            Os trechos já prontos continuam salvos — é só continuar de onde parou.
          </p>
        </div>
      )}

      <div className="card">
        <h3 className="text-base mb-2">Como está narrando</h3>
        <ul className="text-sm text-ink-soft space-y-1">
          <li>🗣 Vozes: {voicesUsed.map(v => `${v} (${POCKET_BY_ID[v]?.gender || '?'})`).join(', ')}</li>
          <li>📦 Modelo: ~{PTTS_DOWNLOAD_MB}MB baixados do Hugging Face só na primeira vez (depois fica no cache)</li>
          <li>🎧 Saída: MP3 mono {MP3_KBPS}kbps, montado aqui no navegador — nada sobe pro servidor</li>
        </ul>
      </div>

      <div className="flex items-center justify-between">
        <button onClick={onBack} className="btn btn-ghost">← Voltar pras vozes</button>
        {phase === 'done' && <button onClick={onReset} className="btn btn-ghost">+ Novo audiobook</button>}
      </div>
    </div>
  )
}

function Stat({ label, value, highlight }) {
  return (
    <div className={`rounded p-3 border ${highlight ? 'bg-marrs-50 border-marrs/30' : 'bg-cream border-sand'}`}>
      <div className="text-xs uppercase text-ink-muted tracking-wide">{label}</div>
      <div className={`text-base font-semibold mt-1 ${highlight ? 'text-marrs-dark' : 'text-ink'}`}>{value}</div>
    </div>
  )
}
