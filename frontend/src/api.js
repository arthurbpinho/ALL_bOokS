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
  voices: () => fetch(`${BASE}/api/voices`).then(jsonOrThrow),
  patterns: () => fetch(`${BASE}/api/patterns`).then(jsonOrThrow),

  upload: (formData) =>
    fetch(`${BASE}/api/upload`, { method: 'POST', body: formData }).then(jsonOrThrow),

  getJob: (id) => fetch(`${BASE}/api/job/${id}`).then(jsonOrThrow),

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

  concat: (id) =>
    fetch(`${BASE}/api/job/${id}/concat`, { method: 'POST' }).then(jsonOrThrow),

  previewVoiceUrl: () => `${BASE}/api/preview-voice`,

  fileUrl: (id, name) => `${BASE}/api/job/${id}/files/${encodeURIComponent(name)}`,

  exportUrl: (id, fmt) => `${BASE}/api/job/${id}/export/${fmt}`,
}
