import { useState } from 'react'
import { api } from '../api'

export default function DoneScreen({ job, onReset }) {
  const [concatLoading, setConcatLoading] = useState(false)
  const [fullFile, setFullFile] = useState(null)
  const [error, setError] = useState(null)
  const [showChunks, setShowChunks] = useState(false)

  const doConcat = async () => {
    setConcatLoading(true); setError(null)
    try {
      const r = await api.concat(job.id)
      setFullFile(r.filename)
    } catch (e) {
      setError(e.message)
    } finally {
      setConcatLoading(false)
    }
  }

  const validChunks = (job.chunks || []).filter(c => c.path)

  return (
    <div className="space-y-6">
      <div className="card border-marrs/30 shadow-marrs">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-3xl">✅</span>
          <h2 className="text-2xl">Audiobook pronto!</h2>
        </div>
        <p className="text-ink-soft text-sm">
          {validChunks.length.toLocaleString()} trechos gerados · Edge TTS (grátis)
        </p>
      </div>

      <div className="card space-y-4">
        <div>
          <h3 className="text-xl mb-1">🎧 Áudio</h3>
          <div className="flex flex-wrap gap-3 mt-2">
            <a className="btn btn-ghost" href={api.fileUrl(job.id, 'playlist.m3u')} download>
              📥 Playlist M3U
            </a>
            {!fullFile ? (
              <button onClick={doConcat} disabled={concatLoading} className="btn btn-primary">
                {concatLoading ? 'Juntando…' : '🔗 Juntar tudo em 1 MP3'}
              </button>
            ) : (
              <a className="btn btn-primary" href={api.fileUrl(job.id, fullFile)} download>
                📥 audiobook_full.mp3
              </a>
            )}
          </div>
        </div>

        <div className="border-t border-sand pt-4">
          <h3 className="text-xl mb-1">
            📚 Texto {job.translated ? 'traduzido' : ''}
          </h3>
          <p className="text-xs text-ink-muted mb-2">
            {job.translated ? 'Tradução completa pra ler ou revisar.' : 'Texto extraído do livro.'}
          </p>
          <div className="flex flex-wrap gap-3">
            <a className="btn btn-secondary" href={api.exportUrl(job.id, 'epub')}>
              📖 Baixar EPUB
            </a>
            <a className="btn btn-ghost" href={api.exportUrl(job.id, 'txt')}>
              📄 Baixar TXT
            </a>
          </div>
        </div>

        {error && <p className="text-sm text-danger">Erro: {error}</p>}
      </div>

      <div className="card">
        <button onClick={() => setShowChunks(!showChunks)}
          className="text-sm text-ink-soft hover:text-marrs">
          {showChunks ? '▼' : '▶'} Listar trechos individuais ({validChunks.length})
        </button>
        {showChunks && (
          <ul className="mt-4 space-y-2 max-h-[500px] overflow-y-auto pr-2">
            {validChunks.map(c => (
              <li key={c.index}
                className="flex items-start gap-3 p-2 rounded bg-cream border border-sand">
                <span className="chip">{String(c.index).padStart(5, '0')}</span>
                <span className="font-mono text-xs text-marrs-dark w-24 shrink-0">{c.speaker}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate text-ink">{c.text}</p>
                  <a className="text-xs text-ink-muted hover:text-marrs"
                     href={api.fileUrl(job.id, c.filename)} download>
                    {c.filename}
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex justify-center">
        <button onClick={onReset} className="btn btn-ghost">+ Novo audiobook</button>
      </div>
    </div>
  )
}
