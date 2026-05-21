import { useEffect, useRef, useState } from 'react'
import { api } from '../api'

export default function ProgressScreen({ job, onUpdate }) {
  const intervalRef = useRef(null)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    intervalRef.current = setInterval(async () => {
      try {
        // Payload mínimo durante a geração; só baixa o job inteiro ao terminar.
        const fresh = await api.getProgress(job.id)
        if (fresh.stage === 'generating') {
          onUpdate(prev => ({ ...prev, stage: fresh.stage, progress: fresh.progress }))
        } else {
          clearInterval(intervalRef.current)
          const full = await api.getJob(job.id)
          onUpdate(full)
        }
      } catch {}
    }, 2000)
    return () => clearInterval(intervalRef.current)
  }, [job.id, onUpdate])

  async function handleCancel() {
    if (cancelling) return
    if (!confirm('Cancelar a geração do audiobook? Os trechos já prontos são mantidos.')) return
    setCancelling(true)
    try {
      await api.cancel(job.id)
    } catch (e) {
      setCancelling(false)
    }
    // O polling detecta a mudança de stage e troca de tela sozinho.
  }

  const p = job.progress || { total: 0, done: 0, failed: 0 }
  const pct = p.total ? Math.round(100 * p.done / p.total) : 0

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-2xl mb-1">🎙 Gerando áudios…</h2>
        <p className="text-ink-soft text-sm">
          Edge TTS · <span className="text-marrs">gratuito</span>
          {job.inhibit_method === 'systemd-inhibit' && (
            <> · 🛡️ suspensão bloqueada</>
          )}
        </p>

        <div className="mt-8">
          <div className="flex justify-between mb-2">
            <span className="text-sm font-medium text-ink">
              {p.done.toLocaleString()} / {p.total.toLocaleString()} trechos
            </span>
            <span className="text-3xl font-serif text-marrs">{pct}%</span>
          </div>
          <div className="h-4 bg-sand rounded-full overflow-hidden">
            <div className="h-full progress-bar-anim shadow-marrs transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          {p.failed > 0 && (
            <p className="text-xs text-terra mt-2">
              ⚠ {p.failed} trecho(s) falharam — você pode re-rodar pra completar
            </p>
          )}
        </div>

        <p className="text-xs text-ink-muted mt-6">
          Pode fechar a aba — a geração continua no servidor. Reabra <code>{location.origin}</code> pra acompanhar.
        </p>
      </div>

      <button onClick={handleCancel} disabled={cancelling} className="btn btn-ghost text-sm">
        {cancelling ? 'Cancelando…' : 'Cancelar geração'}
      </button>
    </div>
  )
}
