import { useState, useEffect, useCallback } from 'react'

export function usePhotos() {
  const [photos, setPhotos] = useState([])
  const [collections, setCollections] = useState([])
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

  async function fetchPhotos() {
    const res = await fetch('/api/photos')
    const data = await res.json()
    setPhotos(data)
  }

  async function fetchCollections() {
    const res = await fetch('/api/collections')
    const data = await res.json()
    setCollections(data)
  }

  useEffect(() => {
    refresh()
    fetchCollections()
  }, [refresh])

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
    const updated = await res.json()
    setCollections(prev => prev.map(c => c.id === id ? updated : c))
  }

  async function deleteCollection(id) {
    await fetch(`/api/collections/${id}`, { method: 'DELETE' })
    setCollections(prev => prev.filter(c => c.id !== id))
  }

  async function addPhotosToCollection(collectionId, photoIds) {
    await fetch(`/api/collections/${collectionId}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoIds })
    })
    fetchPhotos()
    fetchCollections()
  }

  async function removePhotoFromCollection(collectionId, photoId) {
    await fetch(`/api/collections/${collectionId}/photos/${photoId}`, { method: 'DELETE' })
    fetchPhotos()
    fetchCollections()
  }

  async function batchUpdate(ids, { tags, description, mergeTags }) {
    await fetch('/api/photos/batch', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, tags, description, mergeTags })
    })
    fetchPhotos()
  }

  async function batchDelete(ids) {
    await Promise.all(ids.map(id => fetch(`/api/photos/${id}`, { method: 'DELETE' })))
    fetchPhotos()
  }

  return {
    photos, loading, error, refresh, deletePhoto, updatePhoto, exportPhotos,
    collections, createCollection, updateCollection, deleteCollection,
    addPhotosToCollection, removePhotoFromCollection,
    batchUpdate, batchDelete
  }
}
