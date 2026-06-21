const CHAT_ID_KEY = 'bengkelbot.chatId'
const CUSTOMER_NAME_KEY = 'bengkelbot.customerName'

function generateId(): string {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function getChatId(): string {
  const existing = localStorage.getItem(CHAT_ID_KEY)
  if (existing) return existing
  const id = generateId()
  localStorage.setItem(CHAT_ID_KEY, id)
  return id
}

export function setChatId(id: string): void {
  localStorage.setItem(CHAT_ID_KEY, id)
}

export function getCustomerName(): string {
  return localStorage.getItem(CUSTOMER_NAME_KEY)?.trim() || ''
}

export function setCustomerName(name: string): void {
  const trimmed = name.trim()
  if (trimmed) localStorage.setItem(CUSTOMER_NAME_KEY, trimmed)
  else localStorage.removeItem(CUSTOMER_NAME_KEY)
}

export function hasCustomerName(): boolean {
  return !!getCustomerName()
}
