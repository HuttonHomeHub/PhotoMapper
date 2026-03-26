import { useState, useEffect, useCallback } from 'react'

export function usePhotos() {
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
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

  useEffect(() => {
    refresh()
  }, [refresh])

  return { photos, loading, error, refresh }
}
