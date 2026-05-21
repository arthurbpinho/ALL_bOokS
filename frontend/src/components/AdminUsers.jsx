import { useEffect, useState } from 'react'
import { api } from '../api'

export default function AdminUsers({ onClose }) {
  const [users, setUsers] = useState([])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = () => api.listUsers().then(setUsers).catch(e => setError(e.message))
  useEffect(() => { load() }, [])

  async function create(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError(null)
    try {
      await api.createUser(username.trim(), password, isAdmin)
      setUsername(''); setPassword(''); setIsAdmin(false)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(name) {
    if (!confirm(`Apagar o usuário "${name}"?`)) return
    setError(null)
    try {
      await api.deleteUser(name)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="fixed inset-0 z-30 bg-ink/40 backdrop-blur-sm flex items-center justify-center px-6"
      onClick={onClose} role="presentation">
      <div className="card w-full max-w-lg space-y-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-xl">👤 Usuários</h2>
          <button onClick={onClose} className="btn btn-ghost text-sm">Fechar</button>
        </div>

        <form onSubmit={create} className="space-y-3 border-b border-sand pb-5">
          <p className="text-sm text-ink-soft">Criar nova conta</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input className="input flex-1" placeholder="usuário" value={username}
              onChange={e => setUsername(e.target.value)} />
            <input className="input flex-1" type="password" placeholder="senha (mín. 6)"
              value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" checked={isAdmin} onChange={e => setIsAdmin(e.target.checked)} />
            é admin (pode gerenciar usuários)
          </label>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button type="submit" disabled={busy} className="btn btn-primary">
            {busy ? 'Criando…' : '+ Criar usuário'}
          </button>
        </form>

        <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {users.map(u => (
            <li key={u.username}
              className="flex items-center justify-between p-2 rounded bg-cream border border-sand">
              <span className="text-sm text-ink">
                {u.username} {u.is_admin && <span className="chip ml-1">admin</span>}
              </span>
              {!u.is_admin && (
                <button onClick={() => remove(u.username)}
                  className="text-xs text-danger hover:underline">apagar</button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
