/**
 * Input validation for public chat API endpoints.
 */

const CHAT_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/
const MAX_MESSAGE_LEN = 2000
const MAX_NAME_LEN = 100

export interface ChatInput {
  chatId: string
  customerName: string
  message: string
}

export interface ValidationResult {
  ok: true
  data: ChatInput
}

export interface ValidationError {
  ok: false
  error: string
}

export type ParseResult = ValidationResult | ValidationError

function stripControlChars(value: string): string {
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
}

export function validateChatId(chatId: string | null | undefined): string | null {
  if (!chatId) return null
  const trimmed = stripControlChars(chatId.trim())
  if (!trimmed || !CHAT_ID_RE.test(trimmed)) return null
  return trimmed
}

export function validateCustomerName(name: string | null | undefined): string {
  const trimmed = stripControlChars((name ?? '').trim()).slice(0, MAX_NAME_LEN)
  return trimmed || 'Pelanggan'
}

export function validateMessage(message: string | null | undefined): string | null {
  if (!message) return null
  const trimmed = stripControlChars(message.trim())
  if (!trimmed) return null
  if (trimmed.length > MAX_MESSAGE_LEN) return null
  return trimmed
}

export function parseChatInput(
  chatId: string | null | undefined,
  customerName: string | null | undefined,
  message: string | null | undefined,
): ParseResult {
  const validChatId = validateChatId(chatId)
  if (!validChatId) {
    return { ok: false, error: 'chatId tidak valid (8–64 karakter alfanumerik)' }
  }

  const validMessage = validateMessage(message)
  if (!validMessage) {
    return {
      ok: false,
      error: `message wajib diisi (maks. ${MAX_MESSAGE_LEN} karakter)`,
    }
  }

  return {
    ok: true,
    data: {
      chatId: validChatId,
      customerName: validateCustomerName(customerName),
      message: validMessage,
    },
  }
}