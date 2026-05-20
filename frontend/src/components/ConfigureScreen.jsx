import { useMemo, useState } from 'react'
import { api } from '../api'

const GENDER_LABEL = {
  feminina: '♀ Feminina',
  masculina: '♂ Masculina',
  neutra: '⚪ Neutra',
}

export default function ConfigureScreen({ job, voices, onUpdate, onCancel }) {
  const [inhibitSleep, setInhibitSleep] = useState(true)
  const [voiceMap, setVoiceMap] = useState(job.voice_map)
  const [previewing, setPreviewing] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)
  const [showText, setShowText] = useState(false)
  const [editedText, setEditedText] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showReparse, setShowReparse] = useState(false)
  const [reparseInput, setReparseInput] = useState(job.speakers_manual || '')
  const [reparseItalic, setReparseItalic] = useState(!!job.narrator_italic)
  const [reparseBold, setReparseBold] = useState(!!job.narrator_bold)
  const [reparseFootnote, setReparseFootnote] = useState(!!job.narrator_footnote)
  const [reparseLoading, setReparseLoading] = useState(false)

  const counts = useMemo(() => {
    const out = {}
    for (const s of job.segments) out[s.speaker] = (out[s.speaker] || 0) + 1
    return out
  }, [job.segments])

  const voicesByGender = useMemo(() => {
    const lang = job.output_lang || 'pt'
    const out = { feminina: [], masculina: [], neutra: [] }
    for (const v of voices) {
      if (v.lang === lang) out[v.gender]?.push(v)
    }
    return out
  }, [voices, job.output_lang])

  const previewVoice = async (speaker) => {
    const voice = voiceMap[speaker]
    setPreviewing(speaker)
    try {
      const sample = job.segments.find(s => s.speaker === speaker)?.text || ''
      const r = await fetch(api.previewVoiceUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice, text: sample.slice(0, 200) }),
      })
      const blob = await r.blob()
      const audio = new Audio(URL.createObjectURL(blob))
      audio.onended = () => setPreviewing(null)
      audio.play()
    } catch (e) {
      setPreviewing(null)
    }
  }

  const openTextEditor = () => {
    const txt = job.segments.map(s => `${s.speaker}: ${s.text}`).join('\n\n')
    setEditedText(txt)
    setShowText(true)
  }

  const saveTextEdits = async () => {
    const known = new Set(job.speakers.map(s => s.toUpperCase()))
    const blocks = editedText.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean)
    const parsed = []
    for (const b of blocks) {
      const m = b.match(/^([^:\n]{1,40}):\s*([\s\S]+)$/)
      if (m && known.has(m[1].trim().toUpperCase())) {
        parsed.push({ speaker: m[1].trim().toUpperCase(), text: m[2].trim() })
      } else if (parsed.length) {
        parsed[parsed.length - 1].text += ' ' + b
      } else {
        parsed.push({ speaker: 'NARRADOR', text: b })
      }
    }
    try {
      const updated = await api.updateSegments(job.id, parsed)
      onUpdate(updated)
      setVoiceMap(updated.voice_map)
      setShowText(false)
    } catch (e) { setError(e.message) }
  }

  const doReparse = async () => {
    setReparseLoading(true); setError(null)
    try {
      const updated = await api.reparse(job.id, {
        speakers_manual: reparseInput,
        narrator_italic: reparseItalic,
        narrator_bold: reparseBold,
        narrator_footnote: reparseFootnote,
      })
      onUpdate(updated)
      setVoiceMap(updated.voice_map)
      setShowReparse(false)
    } catch (e) {
      setError(e.message)
    } finally {
      setReparseLoading(false)
    }
  }

  const saveAdvanced = async (newSegments) => {
    try {
      const updated = await api.updateSegments(job.id, newSegments)
      onUpdate(updated)
      setVoiceMap(updated.voice_map)
      setShowAdvanced(false)
    } catch (e) { setError(e.message) }
  }

  const submit = async () => {
    setGenerating(true); setError(null)
    try {
      const updated = await api.generate(job.id, {
        inhibit_sleep: inhibitSleep, voice_map: voiceMap,
      })
      onUpdate(updated)
    } catch (e) {
      setError(e.message); setGenerating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-2xl mb-1">Configurar vozes</h2>
            <p className="text-ink-soft text-sm">{job.filename}</p>
          </div>
          {job.translated && (
            <span className="badge bg-marrs-50 text-marrs-dark border border-marrs/30">
              ✓ Traduzido
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4 text-sm">
          <Stat label="Segmentos" value={job.segment_count.toLocaleString()} />
          <Stat label="Caracteres" value={job.char_count.toLocaleString()} />
          <Stat label="Personagens" value={job.speakers.length} highlight />
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <button onClick={() => setShowReparse(true)} className="btn btn-ghost text-sm">
            🎯 Re-detectar personagens
          </button>
          <button onClick={openTextEditor} className="btn btn-ghost text-sm">
            📝 Editar texto {job.translated ? '(simples)' : ''}
          </button>
          {job.translated && job.segments_original?.length > 0 && (
            <button onClick={() => setShowAdvanced(true)} className="btn btn-secondary text-sm">
              🔍 Comparar e editar (avançado)
            </button>
          )}
        </div>

        {job.translated && (
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-sand">
            <span className="text-xs text-ink-muted">Baixar tradução:</span>
            <a className="btn btn-ghost text-sm py-1.5" href={api.exportUrl(job.id, 'epub')}>📖 EPUB</a>
            <a className="btn btn-ghost text-sm py-1.5" href={api.exportUrl(job.id, 'txt')}>📄 TXT</a>
          </div>
        )}
      </div>

      {job.ai_warning && (
        <div className="card border-terra/40 bg-terra/5">
          <h3 className="text-base text-terra mb-1">⚠ Detecção por IA falhou</h3>
          <p className="text-sm text-ink-soft">{job.ai_warning}</p>
          <p className="text-xs text-ink-muted mt-1">
            O texto foi mantido como um único bloco (NARRADOR). Use “Re-detectar personagens”
            pra informar os nomes manualmente.
          </p>
        </div>
      )}

      {job.ai_info?.length > 0 && (
        <div className="card border-marrs/30 bg-marrs-50/40">
          <h3 className="text-base text-marrs-dark mb-2">🤖 Detecção da IA</h3>
          <ul className="space-y-1 text-sm">
            {job.ai_info.map(c => (
              <li key={c.name}>
                <span className="font-mono text-marrs-dark">{c.name}</span>
                <span className="text-ink-muted"> · {c.gender}</span>
                <span className="text-ink-soft"> — {c.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h3 className="text-xl mb-3">Vozes ({job.speakers.length} personagens)</h3>
        <p className="text-xs text-ink-muted mb-4">
          🆓 Vozes Microsoft Edge Neural · {job.output_lang === 'en' ? 'inglês' : 'pt-BR'} · gratuitas
        </p>
        <div className="space-y-2">
          {job.speakers.map(sp => (
            <div key={sp}
              className="flex items-center gap-3 p-3 rounded bg-cream border border-sand">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-marrs-dark">{sp}</span>
                  <span className="text-xs text-ink-muted">
                    {counts[sp]} fala{counts[sp] !== 1 ? 's' : ''}
                  </span>
                  <span className="text-xs text-ink-muted">
                    · {GENDER_LABEL[job.gender_map[sp]] || job.gender_map[sp]}
                  </span>
                </div>
              </div>
              <select value={voiceMap[sp] || ''}
                onChange={(e) => setVoiceMap({ ...voiceMap, [sp]: e.target.value })}
                className="select max-w-sm">
                <optgroup label="Femininas">
                  {voicesByGender.feminina.map(v =>
                    <option key={v.id} value={v.id}>{v.id} — {v.note}</option>
                  )}
                </optgroup>
                <optgroup label="Masculinas">
                  {voicesByGender.masculina.map(v =>
                    <option key={v.id} value={v.id}>{v.id} — {v.note}</option>
                  )}
                </optgroup>
              </select>
              <button type="button" onClick={() => previewVoice(sp)}
                disabled={previewing === sp}
                className="btn btn-ghost text-sm whitespace-nowrap">
                {previewing === sp ? '⏳' : '▶'} Preview
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" className="checkbox mt-1"
            checked={inhibitSleep} onChange={(e) => setInhibitSleep(e.target.checked)} />
          <div>
            <div className="font-medium text-ink">🛡️ Impedir suspensão do computador</div>
            <p className="text-sm text-ink-muted mt-0.5">
              Usa <code className="chip">systemd-inhibit</code> · recomendado pra livros longos.
            </p>
          </div>
        </label>
      </div>

      {error && (
        <div className="card border-danger/40 text-danger">
          <strong>Erro:</strong> {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button onClick={onCancel} className="btn btn-ghost">← Voltar</button>
        <button onClick={submit} disabled={generating}
          className="btn btn-primary text-base px-6 py-3">
          {generating ? 'Iniciando…' : '🎙 Gerar audiobook (grátis)'}
        </button>
      </div>

      {showReparse && (
        <Modal title="🎯 Re-detectar personagens" onClose={() => setShowReparse(false)}>
          <p className="text-sm text-ink-soft mb-4">
            Digite os nomes dos personagens como aparecem no texto, separados por vírgula.
            O parser caça cada um seguido de <code className="chip">:</code> em qualquer posição.
          </p>
          <label className="label">Personagens</label>
          <input type="text" value={reparseInput}
            onChange={(e) => setReparseInput(e.target.value)}
            placeholder="ex: HILLMAN, VENTURA"
            className="input font-mono mb-4" autoFocus />
          <label className="flex items-center gap-3 cursor-pointer mb-2">
            <input type="checkbox" className="checkbox"
              checked={reparseItalic} onChange={(e) => setReparseItalic(e.target.checked)} />
            <span className="text-sm text-ink-soft"><em>Itálico</em> → narrador</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer mb-2">
            <input type="checkbox" className="checkbox"
              checked={reparseBold} onChange={(e) => setReparseBold(e.target.checked)} />
            <span className="text-sm text-ink-soft"><strong>Negrito</strong> → narrador</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer mb-4">
            <input type="checkbox" className="checkbox"
              checked={reparseFootnote} onChange={(e) => setReparseFootnote(e.target.checked)} />
            <span className="text-sm text-ink-soft">Notas de rodapé → narrador</span>
          </label>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowReparse(false)} className="btn btn-ghost">Cancelar</button>
            <button onClick={doReparse} disabled={reparseLoading || !reparseInput.trim()}
              className="btn btn-primary">
              {reparseLoading ? '⏳' : '🎯'} Re-parse
            </button>
          </div>
        </Modal>
      )}

      {showAdvanced && (
        <AdvancedEditor job={job} onSave={saveAdvanced} onClose={() => setShowAdvanced(false)} />
      )}

      {showText && (
        <Modal title="📝 Editar texto antes de narrar" onClose={() => setShowText(false)}>
          <p className="text-xs text-ink-muted mb-3">
            Formato: <code>SPEAKER: texto</code> · separe segmentos com linha em branco
          </p>
          <textarea value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            className="textarea font-mono text-sm flex-1 min-h-[400px]" />
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowText(false)} className="btn btn-ghost">Cancelar</button>
            <button onClick={saveTextEdits} className="btn btn-primary">Salvar</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Stat({ label, value, highlight }) {
  return (
    <div className={`rounded p-3 border ${highlight ? 'bg-marrs-50 border-marrs/30' : 'bg-cream border-sand'}`}>
      <div className="text-xs uppercase text-ink-muted tracking-wide">{label}</div>
      <div className={`text-lg font-semibold mt-1 ${highlight ? 'text-marrs-dark' : 'text-ink'}`}>{value}</div>
    </div>
  )
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 bg-ink/40 backdrop-blur z-50 flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="card max-w-2xl w-full max-h-[90vh] flex flex-col overflow-y-auto shadow-lg"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg">{title}</h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

const PAGE_SIZE = 40

function AdvancedEditor({ job, onSave, onClose }) {
  const orig = job.segments_original || []
  const [texts, setTexts] = useState(() => job.segments.map(s => s.text))
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(0)
  const [dirty, setDirty] = useState(false)

  const rows = useMemo(() => {
    const f = filter.trim().toLowerCase()
    return job.segments
      .map((s, i) => ({ i, speaker: s.speaker, orig: orig[i]?.text || '', trans: texts[i] ?? '' }))
      .filter(r => !f || r.orig.toLowerCase().includes(f) || r.trans.toLowerCase().includes(f))
  }, [job.segments, orig, texts, filter])

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const cur = Math.min(page, pages - 1)
  const pageRows = rows.slice(cur * PAGE_SIZE, cur * PAGE_SIZE + PAGE_SIZE)

  const setText = (i, v) => {
    setTexts(t => { const n = [...t]; n[i] = v; return n })
    setDirty(true)
  }

  const save = () => {
    const segs = job.segments.map((s, i) => ({ speaker: s.speaker, text: texts[i] ?? s.text }))
    onSave(segs)
  }

  return (
    <div className="fixed inset-0 bg-ink/50 backdrop-blur z-50 flex flex-col"
      style={{ animation: 'fadeIn .2s ease' }}>
      {/* Cabeçalho */}
      <div className="bg-cream border-b border-sand px-6 py-3 flex items-center gap-4 flex-wrap">
        <h3 className="text-xl">🔍 Comparação · original ⇄ tradução</h3>
        <input
          type="text" value={filter}
          onChange={(e) => { setFilter(e.target.value); setPage(0) }}
          placeholder="🔎 buscar no texto…"
          className="input max-w-xs py-1.5 text-sm"
        />
        <span className="text-xs text-ink-muted">{rows.length} segmentos</span>
        <div className="ml-auto flex items-center gap-2">
          {dirty && <span className="text-xs text-terra">• alterações não salvas</span>}
          <button onClick={onClose} className="btn btn-ghost text-sm py-1.5">Fechar</button>
          <button onClick={save} className="btn btn-primary text-sm py-1.5">💾 Salvar</button>
        </div>
      </div>

      {/* Lista de comparação */}
      <div className="flex-1 overflow-y-auto px-6 py-4 bg-cream2">
        <div className="max-w-6xl mx-auto space-y-3">
          {pageRows.map(r => (
            <div key={r.i} className="bg-cream border border-sand rounded p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="chip">{String(r.i).padStart(4, '0')}</span>
                <span className="font-mono text-xs font-semibold text-marrs-dark">{r.speaker}</span>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-ink-muted mb-1">Original</div>
                  <div className="text-sm text-ink-soft bg-sand2 border border-sand rounded p-2.5 leading-relaxed whitespace-pre-wrap">
                    {r.orig || <span className="text-ink-muted italic">—</span>}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-marrs-dark mb-1">Tradução (editável)</div>
                  <textarea
                    value={r.trans}
                    onChange={(e) => setText(r.i, e.target.value)}
                    className="textarea text-sm leading-relaxed min-h-[80px]"
                    rows={Math.max(2, Math.ceil((r.trans?.length || 0) / 60))}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Paginação */}
      {pages > 1 && (
        <div className="bg-cream border-t border-sand px-6 py-3 flex items-center justify-center gap-3">
          <button onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={cur === 0} className="btn btn-ghost text-sm py-1.5">← Anterior</button>
          <span className="text-sm text-ink-soft">Página {cur + 1} de {pages}</span>
          <button onClick={() => setPage(p => Math.min(pages - 1, p + 1))}
            disabled={cur >= pages - 1} className="btn btn-ghost text-sm py-1.5">Próxima →</button>
        </div>
      )}
    </div>
  )
}
