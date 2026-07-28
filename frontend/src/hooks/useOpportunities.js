/**
 * useOpportunities — custom hook
 * Fetches enriched opportunities from the BuilderRadar API.
 * Handles loading, error, and empty states.
 * Re-fetches when the category filter changes.
 */
import { useState, useEffect, useCallback } from 'react'
import { ENDPOINTS } from '../config.js'

export function useOpportunities(category) {
  const [opportunities, setOpportunities] = useState([])
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState(null)
  const [lastUpdated, setLastUpdated]     = useState(null)

  const fetchOpportunities = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const url = new URL(ENDPOINTS.opportunities, window.location.origin)
      if (category && category !== 'all') {
        url.searchParams.set('category', category)
      }

      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }

      const data = await res.json()
      setOpportunities(data.opportunities || [])
      setLastUpdated(new Date())
    } catch (err) {
      setError(err.message || 'Failed to load opportunities')
    } finally {
      setLoading(false)
    }
  }, [category])

  useEffect(() => {
    fetchOpportunities()
  }, [fetchOpportunities])

  return { opportunities, loading, error, lastUpdated, refetch: fetchOpportunities }
}
