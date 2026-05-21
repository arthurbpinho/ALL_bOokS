import { useState } from 'react'
import { api } from '../api'

export default function UploadScreen({ onUploaded }) {
  const [file, setFile] = useState(null)
  const [bookMode, setBookMode] = useState('single') // 'single' (livro padrão, 1 voz) | 'dialogue' (vozes por personagem)
  const [speakersManual, setSpeakersManual] = useState('')
  const [aiDetectNames, setAiDetectNames] = useState(false)
  const [useAi, setUseAi] = useState(false)
  const [narratorItalic, setNarratorItalic] = useState(false)
  const [narratorBold, setNarratorBold] = useState(false)
  const [narratorFootnote, setNarratorFootnote] = useState(false)
  const [outputLang, setOutputLang] = useState('pt')
  const [translate, setTranslate] = useState(false)
  const [tone, setTone] = useState('')
  const [context, setContext] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    if (!file) return
    setLoading(true); setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const single = bookMode === 'single'
      fd.append('single_voice', single ? 'true' : 'false')
      // Em livro padrão (1 voz) os campos de personagem/formatação são ignorados pelo backend.
      if (!single) {
        fd.append('speakers_manual', speakersManual)
        fd.append('ai_detect_names', aiDetectNames ? 'true' : 'false')
        fd.append('use_ai', useAi ? 'true' : 'false')
        fd.append('narrator_italic', narratorItalic ? 'true' : 'false')
        fd.append('narrator_bold', narratorBold ? 'true' : 'false')
        fd.append('narrator_footnote', narratorFootnote ? 'true' : 'false')
      }
      fd.append('output_lang', outputLang)
      fd.append('translate', (outputLang === 'pt' && translate) ? 'true' : 'false')
      fd.append('tone', tone)
      fd.append('context', context)
      const job = await api.upload(fd)
      onUploaded(job)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="text-center pb-2">
        <span className="eyebrow">Ferramenta de tradução &amp; audiobooks</span>
        <h2 className="font-serif text-4xl md:text-5xl leading-tight mb-3">
          Transforme livros em<br /><em className="text-marrs not-italic font-serif">tradução e voz</em>
        </h2>
        <p className="prose-serif text-xl text-ink-soft max-w-xl mx-auto">
          Envie um PDF, EPUB ou TXT. Traduza para português com IA e gere um audiobook
          completo com vozes distintas para cada personagem.
        </p>
        <div className="ornament mt-5"><span className="font-serif text-marrs/60">❦</span></div>
      </div>

      <div className="card">
        <div className="section-head">
          <span className="step-num">1</span>
          <div>
            <span className="eyebrow mb-0">Tipo de leitura</span>
            <h3 className="text-2xl leading-none">Como narrar o livro</h3>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button type="button" onClick={() => setBookMode('single')}
            className={`p-4 rounded-lg border text-left transition-colors
              ${bookMode === 'single' ? 'border-marrs bg-marrs-50' : 'border-line hover:border-marrs/50'}`}>
            <div className="font-semibold text-ink flex items-center gap-2">📖 Livro padrão <span className="badge bg-marrs-50 text-marrs-dark">recomendado</span></div>
            <div className="text-sm text-ink-soft mt-1.5">
              Uma só voz de leitura, sem diálogos entre personagens. Ideal para
              romances de um narrador e textos científicos ou filosóficos mais densos.
            </div>
          </button>
          <button type="button" onClick={() => setBookMode('dialogue')}
            className={`p-4 rounded-lg border text-left transition-colors
              ${bookMode === 'dialogue' ? 'border-marrs bg-marrs-50' : 'border-line hover:border-marrs/50'}`}>
            <div className="font-semibold text-ink">🎭 Diálogos com vozes</div>
            <div className="text-sm text-ink-soft mt-1.5">
              Vozes distintas por personagem. Para peças, entrevistas e ficção com
              muitas falas marcadas (ex.: <code className="chip">NOME:</code>).
            </div>
          </button>
        </div>
      </div>

      <div className="card">
        <div className="section-head">
          <span className="step-num">2</span>
          <div>
            <span className="eyebrow mb-0">Começo</span>
            <h3 className="text-2xl leading-none">Enviar livro</h3>
          </div>
        </div>
        <p className="text-ink-soft text-sm mb-5">PDF, EPUB ou TXT — até 200 MB.</p>

        <label className="label">Arquivo</label>
        <input
          type="file"
          accept=".pdf,.epub,.txt"
          onChange={(e) => setFile(e.target.files[0])}
          className="block w-full text-sm text-ink-soft
                     file:mr-4 file:py-2.5 file:px-5 file:rounded-full
                     file:border-0 file:bg-marrs file:text-cream file:font-medium
                     hover:file:bg-marrs-dark file:cursor-pointer"
          required
        />
        {file && (
          <p className="text-xs text-ink-muted mt-2">
            {file.name} · {(file.size / 1024).toFixed(0)} KB
          </p>
        )}
      </div>

      {bookMode === 'dialogue' && (<>
      <div className="card">
        <div className="section-head">
          <span className="step-num">3</span>
          <div>
            <span className="eyebrow mb-0">Personagens</span>
            <h3 className="text-2xl leading-none">Como identificar as falas</h3>
          </div>
        </div>
        <div>
          <label className="flex items-start gap-3 cursor-pointer mb-4 p-3 rounded border border-sand bg-cream2">
            <input type="checkbox" className="checkbox mt-0.5"
              checked={aiDetectNames} onChange={(e) => setAiDetectNames(e.target.checked)} />
            <span className="text-sm text-ink-soft">
              <strong className="text-ink">🤖 Deixar a IA identificar os personagens</strong>
              <br />A IA lê o livro e descobre os nomes sozinha. Útil se você não sabe quem são.
              <span className="text-ink-muted"> (custa ~$0.01–0.02 a mais)</span>
            </span>
          </label>
          <label className="label">
            {aiDetectNames ? 'Nomes (opcional — a IA vai decidir)' : 'Nomes dos personagens (separados por vírgula)'}
          </label>
          <input type="text" value={speakersManual}
            onChange={(e) => setSpeakersManual(e.target.value)}
            disabled={aiDetectNames}
            placeholder="ex: HILLMAN, VENTURA"
            className="input font-mono disabled:opacity-50" />
          <p className="text-xs text-ink-muted mt-2">
            O parser caça essas palavras seguidas de <code className="chip">:</code> em qualquer
            lugar do texto. Funciona mesmo se o PDF extraiu tudo numa linha só.
          </p>
        </div>

        <label className="flex items-center gap-3 mt-4 cursor-pointer">
          <input type="checkbox" className="checkbox"
            checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
          <span className="text-sm text-ink-soft">
            Usar IA pra sugerir gênero de cada personagem
            <span className="text-ink-muted ml-1">(custa ~$0.01)</span>
          </span>
        </label>
      </div>

      <div className="card">
        <div className="section-head">
          <span className="step-num">4</span>
          <div>
            <span className="eyebrow mb-0">Refinamento</span>
            <h3 className="text-2xl leading-none">Narração por formatação</h3>
          </div>
        </div>
        <p className="text-ink-soft text-sm mb-4">
          Roteia trechos formatados pra voz do narrador. Útil pra rubricas/descrições.
          <span className="text-ink-muted"> Funciona com PDF e EPUB.</span>
        </p>
        <label className="flex items-center gap-3 cursor-pointer mb-2">
          <input type="checkbox" className="checkbox"
            checked={narratorItalic} onChange={(e) => setNarratorItalic(e.target.checked)} />
          <span className="text-sm text-ink-soft"><em>Texto em itálico</em> → voz do narrador</span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer mb-2">
          <input type="checkbox" className="checkbox"
            checked={narratorBold} onChange={(e) => setNarratorBold(e.target.checked)} />
          <span className="text-sm text-ink-soft"><strong>Texto em negrito</strong> → voz do narrador</span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" className="checkbox"
            checked={narratorFootnote} onChange={(e) => setNarratorFootnote(e.target.checked)} />
          <span className="text-sm text-ink-soft">
            Notas de rodapé → narrador (anuncia <em>"Nota de rodapé:"</em> antes)
          </span>
        </label>
      </div>
      </>)}

      <div className="card">
        <div className="section-head">
          <span className="step-num">{bookMode === 'dialogue' ? '5' : '3'}</span>
          <div>
            <span className="eyebrow mb-0">Saída</span>
            <h3 className="text-2xl leading-none">Idioma do audiobook</h3>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setOutputLang('pt')}
            className={`p-4 rounded border text-left transition-colors
              ${outputLang === 'pt' ? 'border-marrs bg-marrs-50 text-marrs-dark' :
                'border-line hover:border-marrs/50 text-ink-soft'}`}>
            <div className="font-semibold">🇧🇷 Português (BR)</div>
            <div className="text-xs text-ink-muted mt-1">Vozes brasileiras</div>
          </button>
          <button type="button" onClick={() => setOutputLang('en')}
            className={`p-4 rounded border text-left transition-colors
              ${outputLang === 'en' ? 'border-marrs bg-marrs-50 text-marrs-dark' :
                'border-line hover:border-marrs/50 text-ink-soft'}`}>
            <div className="font-semibold">🇺🇸 English</div>
            <div className="text-xs text-ink-muted mt-1">English / British voices</div>
          </button>
        </div>

        {outputLang === 'pt' ? (
          <div className="mt-5">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" className="checkbox"
                checked={translate} onChange={(e) => setTranslate(e.target.checked)} />
              <span className="font-semibold text-ink">
                Traduzir o livro para português brasileiro
              </span>
            </label>
            <p className="text-ink-soft text-sm mt-2 ml-8">
              Marque se o livro está em outro idioma. Usa <code className="chip">gpt-5.4-mini</code> · ~$0,20–0,40 por livro.
            </p>

            {translate && (
              <div className="mt-5 ml-8 space-y-4 border-l-2 border-terra/40 pl-5">
                <div>
                  <label className="label">🎭 Tom da tradução <span className="text-ink-muted font-normal">(opcional)</span></label>
                  <input type="text" value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    placeholder="ex: literário e fluido / casual e moderno / acadêmico"
                    className="input" />
                </div>
                <div>
                  <label className="label">📚 Contexto do livro <span className="text-ink-muted font-normal">(opcional)</span></label>
                  <textarea value={context}
                    onChange={(e) => setContext(e.target.value)}
                    placeholder="ex: Diálogos entre James Hillman e Michael Ventura sobre psicoterapia e política. Tom intelectual, termos junguianos..."
                    rows={3} className="textarea" />
                  <p className="text-xs text-ink-muted mt-1.5">
                    Ajuda a IA a manter terminologia consistente e capturar nuances.
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-ink-soft text-sm mt-4">
            O áudio será gerado no texto original em inglês, com vozes em inglês. Sem tradução.
          </p>
        )}
      </div>

      {error && (
        <div className="card border-danger/40 text-danger">
          <strong>Erro:</strong> {error}
        </div>
      )}

      <div className="flex justify-end">
        <button type="submit" disabled={!file || loading}
          className="btn btn-primary text-base px-6 py-3">
          {loading ? 'Processando…' : 'Continuar →'}
        </button>
      </div>
    </form>
  )
}
