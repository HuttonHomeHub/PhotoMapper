import { useState, useEffect, useCallback } from 'react'

async function postJson(url, method, data) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

// ARCH-06: client state + operations (split out of the old usePhotos).
export function useClients() {
  const [clients, setClients] = useState([])

  const refresh = useCallback(async () => {
    const res = await fetch('/api/clients')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    setClients(await res.json())
  }, [])

  useEffect(() => {
    refresh().catch(() => {})
  }, [refresh])

  const createClient = useCallback(async (data) => {
    const client = await postJson('/api/clients', 'POST', data)
    setClients((prev) => [...prev, client])
    return client
  }, [])

  const updateClient = useCallback(async (id, changes) => {
    const updated = await postJson(`/api/clients/${id}`, 'PATCH', changes)
    setClients((prev) => prev.map((c) => (c.id === id ? updated : c)))
  }, [])

  const deleteClient = useCallback(async (id) => {
    await fetch(`/api/clients/${id}`, { method: 'DELETE' })
    setClients((prev) => prev.filter((c) => c.id !== id))
  }, [])

  return { clients, refresh, createClient, updateClient, deleteClient }
}
