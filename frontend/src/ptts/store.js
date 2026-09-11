// Guarda os trechos já narrados no IndexedDB do visitante.
//
// Um livro leva horas pra narrar no navegador. Sem isso, fechar a aba sem querer
// jogaria tudo fora — e nada disso passa pelo servidor, que é justamente a graça.

const DB_NAME = 'allbooks-ptts'
const DB_VERSION = 1
const STORE = 'parts'

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE)
}

function done(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// A chave é ordenável: o índice vai com zeros à esquerda pra o cursor devolver
// os trechos na ordem certa do livro.
const key = (plan, index) => `${plan}|${String(index).padStart(6, '0')}`
const range = (plan) => IDBKeyRange.bound(`${plan}|`, `${plan}|￿`)

export async function savePart(plan, index, bytes) {
  const db = await open()
  try { await done(tx(db, 'readwrite').put(bytes, key(plan, index))) } finally { db.close() }
}

/** Quantos trechos seguidos, a partir do começo, já estão prontos. */
export async function resumeIndex(plan) {
  const db = await open()
  try {
    const keys = await done(tx(db, 'readonly').getAllKeys(range(plan)))
    let n = 0
    for (const k of keys) {
      if (k !== key(plan, n)) break
      n++
    }
    return n
  } finally { db.close() }
}

export async function readAll(plan) {
  const db = await open()
  try { return await done(tx(db, 'readonly').getAll(range(plan))) } finally { db.close() }
}

export async function clearPlan(plan) {
  const db = await open()
  try { await done(tx(db, 'readwrite').delete(range(plan))) } finally { db.close() }
}

/** Limpa planos antigos: só o plano atual interessa, o resto é lixo de MBs. */
export async function clearOthers(plan) {
  const db = await open()
  try {
    const keys = await done(tx(db, 'readonly').getAllKeys())
    const stale = keys.filter(k => typeof k === 'string' && !k.startsWith(`${plan}|`))
    if (!stale.length) return
    const store = tx(db, 'readwrite')
    await Promise.all(stale.map(k => done(store.delete(k))))
  } finally { db.close() }
}
