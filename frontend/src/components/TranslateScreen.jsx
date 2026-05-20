import { useEffect, useRef } from 'react'
import { api } from '../api'

export default function TranslateScreen({ job, onUpdate, onCancel }) {
  const intervalRef = useRef(null)

  useEffect(() => {
    intervalRef.current = setInterval(async () => {
      try {
        const fresh = await api.getJob(job.id)
        onUpdate(fresh)
        if (fresh.stage !== 'translating') clearInterval(intervalRef.current)
      } catch (e) { /* ignore */ }
    }, 1500)
    return () => clearInterval(intervalRef.current)
  }, [job.id, onUpdate])

  const tp = job.trans_progress || { total: 0, done: 0, failed: 0 }
  const pct = tp.total ? Math.round(100 * tp.done / tp.total) : 0

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-2xl mb-2">🌎 Traduzindo pra português…</h2>
        <p className="text-ink-soft text-sm">
          {job.segment_count} segmentos · {job.tone && `tom: "${job.tone}" · `}
          {job.book_context && 'contexto fornecido'}
        </p>

        <div className="mt-6">
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium text-ink">{tp.done} / {tp.total} segmentos</span>
            <span className="text-marrs font-bold">{pct}%</span>
          </div>
          <div className="h-3 bg-sand rounded-full overflow-hidden">
            <div className="h-full progress-bar-anim transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          {tp.failed > 0 && (
            <p className="text-xs text-terra mt-2">
              {tp.failed} trecho(s) falharam — serão mantidos no original
            </p>
          )}
        </div>
      </div>

      <button onClick={onCancel} className="btn btn-ghost text-sm">Cancelar</button>
    </div>
  )
}
