import { useState, useEffect, useCallback } from 'react'

export function usePhotos() {
  const [photos, setPhotos] = useState([])
  const [collections, setCollections] = useState([])
  const [projects, setProjects] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/photos')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setPhotos(data)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchCollections = useCallback(async () => {
    const res = await fetch('/api/collections')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    setCollections(data)
  }, [])

  const fetchProjects = useCallback(async () => {
    const res = await fetch('/api/projects')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    setProjects(data)
  }, [])

  const fetchClients = useCallback(async () => {
    const res = await fetch('/api/clients')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    setClients(data)
  }, [])

  useEffect(() => {
    refresh()
    fetchCollections().catch(() => {})
    fetchProjects().catch(() => {})
    fetchClients().catch(() => {})
  }, [refresh, fetchCollections, fetchProjects, fetchClients])

  const deletePhoto = useCallback(async (id) => {
    const res = await fetch(`/api/photos/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `HTTP ${res.status}`)
    }
    setPhotos(prev => prev.filter(p => p.id !== id))
  }, [])

  const updatePhoto = useCallback(async (id, fields) => {
    const res = await fetch(`/api/photos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields)
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `HTTP ${res.status}`)
    }
    const updated = await res.json()
    setPhotos(prev => prev.map(p => p.id === id ? updated : p))
    return updated
  }, [])

  const exportPhotos = useCallback((format = 'geojson') => {
    const a = document.createElement('a')
    a.href = `/api/photos/export?format=${format}`
    a.download = `photos.${format}`
    a.click()
  }, [])

  async function createCollection({ name, description, color }) {
    const res = await fetch('/api/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, color })
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `HTTP ${res.status}`)
    }
    const collection = await res.json()
    setCollections(prev => [...prev, collection])
    return collection
  }

  async function updateCollection(id, changes) {
    const res = await fetch(`/api/collections/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes)
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `HTTP ${res.status}`)
    }
    const updated = await res.json()
    setCollections(prev => prev.map(c => c.id === id ? updated : c))
  }

  async function deleteCollection(id) {
    await fetch(`/api/collections/${id}`, { method: 'DELETE' })
    setCollections(prev => prev.filter(c => c.id !== id))
  }

  async function addPhotosToCollection(collectionId, photoIds) {
    const res = await fetch(`/api/collections/${collectionId}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoIds })
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `HTTP ${res.status}`)
    }
    await refresh()
    await fetchCollections()
  }

  async function removePhotoFromCollection(collectionId, photoId) {
    const res = await fetch(`/api/collections/${collectionId}/photos/${photoId}`, { method: 'DELETE' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `HTTP ${res.status}`)
    }
    await refresh()
    await fetchCollections()
  }

  async function batchUpdate(ids, { tags, description, mergeTags }) {
    const res = await fetch('/api/photos/batch', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, tags, description, mergeTags })
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `HTTP ${res.status}`)
    }
    await refresh()
  }

  async function batchDelete(ids) {
    await Promise.all(ids.map(id => fetch(`/api/photos/${id}`, { method: 'DELETE' })))
    await refresh()
  }

  async function createClient(data) {
    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `HTTP ${res.status}`)
    }
    const client = await res.json()
    setClients(prev => [...prev, client])
    return client
  }

  async function updateClient(id, changes) {
    const res = await fetch(`/api/clients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes)
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `HTTP ${res.status}`)
    }
    const updated = await res.json()
    setClients(prev => prev.map(c => c.id === id ? updated : c))
  }

  async function deleteClient(id) {
    await fetch(`/api/clients/${id}`, { method: 'DELETE' })
    setClients(prev => prev.filter(c => c.id !== id))
  }

  async function createProject(data) {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `HTTP ${res.status}`)
    }
    const project = await res.json()
    setProjects(prev => [project, ...prev])
    return project
  }

  async function updateProject(id, changes) {
    const res = await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes)
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `HTTP ${res.status}`)
    }
    const updated = await res.json()
    setProjects(prev => prev.map(p => p.id === id ? updated : p))
  }

  async function deleteProject(id) {
    await fetch(`/api/projects/${id}`, { method: 'DELETE' })
    setProjects(prev => prev.filter(p => p.id !== id))
    await refresh()
  }

  async function assignToProject(projectId, photoIds) {
    const res = await fetch(`/api/projects/${projectId}/photos`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoIds })
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `HTTP ${res.status}`)
    }
    await refresh()
    await fetchProjects()
  }

  return {
    photos, loading, error, refresh, deletePhoto, updatePhoto, exportPhotos,
    clients, createClient, updateClient, deleteClient,
    collections, createCollection, updateCollection, deleteCollection,
    addPhotosToCollection, removePhotoFromCollection,
    batchUpdate, batchDelete,
    projects, createProject, updateProject, deleteProject, assignToProject
  }
}
