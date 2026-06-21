import { useState, useEffect } from 'react'
import type { HealthData } from '../types'
import { fetchHealth } from '../lib/api'

interface HealthState {
  data: HealthData | null
  isOnline: boolean
  statusText: string
}

export function useHealth() {
  const [state, setState] = useState<HealthState>({
    data: null,
    isOnline: false,
    statusText: 'Menghubungkan...',
  })

  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        const data = await fetchHealth()
        if (cancelled) return
        const name = data.workshop?.trim() || data.bot?.trim() || 'CMaestro'
        document.title = `Chat — ${name}`
        setState({
          data,
          isOnline: data.ok,
          statusText: data.ok
            ? data.tagline || 'Asisten pintar bengkel mobil Anda'
            : `Konfigurasi belum lengkap: ${data.configError}`,
        })
      } catch {
        if (cancelled) return
        setState({
          data: null,
          isOnline: false,
          statusText: 'Server tidak tersambung',
        })
      }
    }

    check()
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
