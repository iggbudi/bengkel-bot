/**
 * HMAC-based chat session tokens.
 * Clients must obtain a token before accessing chat history or sending messages.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

const DEFAULT_DEV_SECRET = 'dev-only-change-in-production'

export function getChatSecret(): string {
  return process.env.CHAT_SECRET?.trim() || DEFAULT_DEV_SECRET
}

export function isChatSecretConfigured(): boolean {
  const secret = process.env.CHAT_SECRET?.trim()
  return !!secret && secret !== DEFAULT_DEV_SECRET
}

export function warnIfInsecureChatSecret(): void {
  if (process.env.NODE_ENV === 'production' && !isChatSecretConfigured()) {
    console.warn(
      '[SECURITY] CHAT_SECRET belum diset di production — chat tokens tidak aman. ' +
        'Generate: openssl rand -hex 32',
    )
  }
}

export function createChatToken(chatId: string): string {
  return createHmac('sha256', getChatSecret()).update(chatId).digest('base64url')
}

export function verifyChatToken(chatId: string, token: string | null | undefined): boolean {
  if (!chatId || !token) return false
  try {
    const expected = createChatToken(chatId)
    const a = Buffer.from(expected)
    const b = Buffer.from(token)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}