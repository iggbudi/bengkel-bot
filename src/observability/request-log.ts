/**
 * Structured JSON logging for chat/LLM requests.
 */

export type ChatRequestStatus = 'ok' | 'error' | 'timeout' | 'aborted'

export interface ChatRequestLogEntry {
  type: 'chat_request'
  chatId: string
  channel: string
  durationMs: number
  status: ChatRequestStatus
  error?: string
  tokens?: number | null
}

export function logChatRequest(entry: ChatRequestLogEntry): void {
  const line = JSON.stringify({
    ...entry,
    ts: new Date().toISOString(),
  })
  console.log(line)
}