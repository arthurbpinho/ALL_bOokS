import { useEffect, useState } from 'react'
import { api } from './api'
import UploadScreen from './components/UploadScreen'
import TranslateScreen from './components/TranslateScreen'
import ConfigureScreen from './components/ConfigureScreen'
import ProgressScreen from './components/ProgressScreen'
import DoneScreen from './components/DoneScreen'
import LoginScreen from './components/LoginScreen'
import AdminUsers from './components/AdminUsers'

export default function App() {
  const [user, setUser] = useState(undefined)  // undefined=verificando, null=deslogado
  const [job, setJob] = useState(null)
  const [voices, setVoices] = useState([])
  const [showIntro, setShowIntro] = useState(true)
  const [showAdmin, setShowAdmin] = useState(false)

  // Checa a sessão no carregamento
  useEffect(() => {
    api.me().then(setUser).catch(() => setUser(null))
  }, [])

  // Metadados só depois de logado (a API exige sessão)
  useEffect(() => {
    if (!user) return
    api.voices().then(setVoices).catch(console.error)
  }, [user])

  useEffect(() => {
    const t = setTimeout(() => setShowIntro(false), 2700)
    return () => clearTimeout(t)
  }, [])

  const reset = () => setJob(null)

  async function logout() {
    try { await api.logout() } catch { /* ignore */ }
    setJob(null)
    setUser(null)
  }

  if (user === undefined) {
    return <div className="min-h-screen flex items-center justify-center text-ink-muted">Carregando…</div>
  }
  if (!user) {
    return <LoginScreen onLogin={setUser} />
  }

  let screen
  if (!job) {
    screen = <UploadScreen onUploaded={setJob} />
  } else if (job.stage === 'translating') {
    screen = <TranslateScreen job={job} onUpdate={setJob} onCancel={reset} />
  } else if (job.stage === 'ready' || job.stage === 'configuring') {
    screen = <ConfigureScreen job={job} voices={voices} onUpdate={setJob} onCancel={reset} />
  } else if (job.stage === 'generating') {
    screen = <ProgressScreen job={job} onUpdate={setJob} />
  } else if (job.stage === 'done') {
    screen = <DoneScreen job={job} onReset={reset} />
  } else if (job.stage === 'error') {
    screen = <ErrorView job={job} onReset={reset} />
  }

  return (
    <div className="min-h-screen flex flex-col">
      {showIntro && <Intro onSkip={() => setShowIntro(false)} />}
      <header className="border-b border-sand bg-cream/85 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <button onClick={reset} className="flex items-center gap-3 group">
            <img src="/icon.svg" alt="ALLbOokS"
              className="w-10 h-10 rounded-lg transition-transform group-hover:-rotate-3 group-hover:scale-105" />
            <div className="text-left leading-none">
              <h1 className="text-2xl tracking-tight">
                <span className="text-marrs">ALL</span><span className="text-terra">b</span><span className="text-marrs">O</span><span className="text-terra">ok</span><span className="text-marrs">S</span>
              </h1>
              <span className="text-[11px] uppercase tracking-[0.2em] text-ink-muted">
                Tradução &amp; Audiobooks
              </span>
            </div>
          </button>
          <div className="flex items-center gap-3">
            {job && <span className="chip hidden sm:inline-flex">job: {job.id}</span>}
            {job && <button onClick={reset} className="btn btn-ghost text-sm">Novo livro</button>}
            {user.is_admin && (
              <button onClick={() => setShowAdmin(true)} className="btn btn-ghost text-sm">👤 Usuários</button>
            )}
            <span className="text-xs text-ink-muted hidden sm:inline">{user.username}</span>
            <button onClick={logout} className="btn btn-ghost text-sm">Sair</button>
          </div>
        </div>
      </header>
      {showAdmin && <AdminUsers onClose={() => setShowAdmin(false)} />}
      <main className="max-w-5xl mx-auto w-full px-6 py-10 flex-1">
        {screen}
      </main>
      <footer className="border-t border-sand mt-8">
        <div className="max-w-5xl mx-auto px-6 py-6 text-center">
          <div className="ornament"><span className="font-serif text-marrs/70">❦</span></div>
          <p className="text-xs text-ink-muted mt-2">
            <span className="text-marrs">ALL</span><span className="text-terra">b</span><span className="text-marrs">O</span><span className="text-terra">ok</span><span className="text-marrs">S</span>
            {" "}· transforme livros em tradução e voz
          </p>
        </div>
      </footer>
    </div>
  )
}

function Brand({ className = '' }) {
  return (
    <span className={className}>
      <span className="text-marrs">ALL</span><span className="text-terra">b</span><span className="text-marrs">O</span><span className="text-terra">ok</span><span className="text-marrs">S</span>
    </span>
  )
}

function Intro({ onSkip }) {
  return (
    <div className="intro-overlay" onClick={onSkip} role="presentation">
      <div className="text-center px-6">
        <img src="/icon.svg" alt="" className="intro-logo w-20 h-20 mx-auto mb-7 rounded-2xl" />
        <h1 className="font-serif leading-[1.1] text-5xl md:text-7xl">
          <span className="intro-line block">Transforme livros em</span>
          <span className="intro-line intro-line-2 block"><em className="text-marrs not-italic">tradução e voz</em></span>
        </h1>
        <p className="intro-line intro-line-3 mt-6 text-sm md:text-base uppercase tracking-[0.22em] text-ink-soft">
          com o <Brand className="font-semibold" />
        </p>
      </div>
    </div>
  )
}

function ErrorView({ job, onReset }) {
  const err = job?.progress?.error || job?.trans_progress?.error || 'erro desconhecido'
  return (
    <div className="card border-danger/40">
      <h2 className="text-xl text-danger mb-2">Erro</h2>
      <pre className="text-sm text-ink-soft whitespace-pre-wrap">{err}</pre>
      <button className="btn btn-ghost mt-4" onClick={onReset}>Voltar</button>
    </div>
  )
}
