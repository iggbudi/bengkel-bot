export type MessageRole = 'user' | 'bot' | 'error'

export type MessageStatus = 'sending' | 'delivered' | 'read'

export interface Message {
  id: string
  role: MessageRole
  text: string
  at: number | null
  status?: MessageStatus
}

export interface HealthData {
  ok: boolean
  configError: string | null
  bot: string
  workshop: string
  tagline: string
  workshopAddress: string
  workshopPhone: string
  workshopHours: string
  workshopDays: string
  workshopSpec: string
  llm: string
}

export interface ServerMessage {
  role: string
  content: string
  at?: number
}

export interface ChatPhase {
  phase: 'syncing' | 'idle' | 'streaming'
}

export const QUICK_PROMPTS = [
  'Service completo berapa harganya?',
  'Mau booking besok jam 9 pagi',
  'Rem depan bunyi aneh, kenapa ya?',
  'Jam buka dan alamat bengkel?',
]
