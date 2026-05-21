import { useState } from 'react'
import { api } from '../api'

export default function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (loading) return
    setLoading(true); setError(null)
    try {
      const user = await api.login(username.trim(), password)
      onLogin(user)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="card w-full max-w-sm space-y-5">
        <div className="text-center">
          <img src="/icon.svg" alt="" className="w-14 h-14 mx-auto mb-3 rounded-xl" />
          <h1 className="text-2xl">
            <span className="text-marrs">ALL</span><span className="text-terra">b</span><span className="text-marrs">O</span><span className="text-terra">ok</span><span className="text-marrs">S</span>
          </h1>
          <p className="text-xs text-ink-muted mt-1">Entre para continuar</p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-sm text-ink-soft mb-1">Usuário</label>
            <input className="input w-full" value={username} autoFocus
              onChange={e => setUsername(e.target.value)} autoComplete="username" />
          </div>
          <div>
            <label className="block text-sm text-ink-soft mb-1">Senha</label>
            <input className="input w-full" type="password" value={password}
              onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button type="submit" disabled={loading} className="btn btn-primary w-full">
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
