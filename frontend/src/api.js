const BASE = ''  // Vite proxy em dev, mesmo host em prod

async function jsonOrThrow(resp) {
  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`
    try { msg = (await resp.json()).error || msg } catch {}
    throw new Error(msg)
  }
  return resp.json()
}

export const api = {
  // ---- Auth ----
  me: () => fetch(`${BASE}/api/auth/me`).then(r => (r.ok ? r.json() : null)),
  login: (username, password) =>
    fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }).then(jsonOrThrow),
  logout: () => fetch(`${BASE}/api/auth/logout`, { method: 'POST' }).then(jsonOrThrow),
  listUsers: () => fetch(`${BASE}/api/auth/users`).then(jsonOrThrow),
  createUser: (username, password, is_admin = false) =>
    fetch(`${BASE}/api/auth/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, is_admin }),
    }).then(jsonOrThrow),
  deleteUser: (username) =>
    fetch(`${BASE}/api/auth/users/${encodeURIComponent(username)}`, {
      method: 'DELETE',
    }).then(jsonOrThrow),

  voices: () => fetch(`${BASE}/api/voices`).then(jsonOrThrow),

  upload: (formData) =>
    fetch(`${BASE}/api/upload`, { method: 'POST', body: formData }).then(jsonOrThrow),

  getJob: (id) => fetch(`${BASE}/api/job/${id}`).then(jsonOrThrow),

  // Payload mínimo só pro polling da barra de progresso (vs. baixar o job inteiro).
  getProgress: (id) => fetch(`${BASE}/api/job/${id}/progress`).then(jsonOrThrow),

  updateSegments: (id, segments) =>
    fetch(`${BASE}/api/job/${id}/segments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ segments }),
    }).then(jsonOrThrow),

  reparse: (id, payload) =>
    fetch(`${BASE}/api/job/${id}/reparse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(jsonOrThrow),

  generate: (id, payload) =>
    fetch(`${BASE}/api/job/${id}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(jsonOrThrow),

  cancel: (id) =>
    fetch(`${BASE}/api/job/${id}/cancel`, { method: 'POST' }).then(jsonOrThrow),

  concat: (id) =>
    fetch(`${BASE}/api/job/${id}/concat`, { method: 'POST' }).then(jsonOrThrow),

  previewVoiceUrl: () => `${BASE}/api/preview-voice`,

  fileUrl: (id, name) => `${BASE}/api/job/${id}/files/${encodeURIComponent(name)}`,

  exportUrl: (id, fmt) => `${BASE}/api/job/${id}/export/${fmt}`,
}
