import type { HealthData, ServerMessage } from '../types'

export async function fetchHealth(): Promise<HealthData> {
  const res = await fetch('/api/health')
  if (!res.ok) throw new Error('Health check failed')
  return res.json()
}

export async function fetchChatToken(chatId: string): Promise<string> {
  const res = await fetch(`/api/chat/token?chatId=${encodeURIComponent(chatId)}`)
  if (!res.ok) throw new Error('Gagal mendapatkan chat token')
  const data = await res.json()
  if (!data.chatToken) throw new Error('Token tidak tersedia')
  return data.chatToken as string
}

export async function fetchHistory(
  chatId: string,
  chatToken: string,
): Promise<ServerMessage[]> {
  const params = new URLSearchParams({ chatId, chatToken })
  const res = await fetch(`/api/chat/history?${params}`)
  if (!res.ok) return []
  const data = await res.json()
  return data.messages || []
}

export interface StreamCallbacks {
  onStart: () => void
  onDelta: (text: string) => void
  onDone: (text: string) => void
  onError: (error: string) => void
}

export function streamChat(
  chatId: string,
  chatToken: string,
  customerName: string,
  message: string,
  callbacks: StreamCallbacks,
): () => void {
  const params = new URLSearchParams({ chatId, chatToken, customerName, message })
  const es = new EventSource(`/api/chat?${params}`)

  es.addEventListener('start', () => {
    callbacks.onStart()
  })

  es.addEventListener('delta', (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data)
      if (data.text) callbacks.onDelta(data.text)
    } catch {
      /* ignore parse errors */
    }
  })

  es.addEventListener('done', (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data)
      callbacks.onDone(data.text || '')
    } catch {
      callbacks.onDone('')
    }
    es.close()
  })

  es.addEventListener('error', (e: MessageEvent) => {
    if (es.readyState === EventSource.CLOSED) {
      callbacks.onError('Koneksi terputus')
      es.close()
      return
    }
    try {
      const data = JSON.parse(e.data)
      callbacks.onError(data.error || 'Error tidak diketahui')
    } catch {
      callbacks.onError('Koneksi terputus')
    }
    es.close()
  })

  return () => es.close()
}
