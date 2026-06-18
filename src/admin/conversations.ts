/**
 * Conversations Admin API
 * -----------------------
 * List and view chat sessions from SQLite.
 */

import { ConversationRepo, getDb } from '../db/schema.js'

export interface ConversationSummary {
  id: string
  chat_id: string
  channel: string
  escalated: boolean
  last_message_at: string | null
  created_at: string
  message_count: number
  last_message_preview: string | null
  customer_name: string | null
  customer_phone: string | null
}

export interface ConversationDetail extends ConversationSummary {
  messages: Array<{ role: string; content: string }>
}

export function listConversations(options?: {
  channel?: string
  limit?: number
  offset?: number
}): { conversations: ConversationSummary[]; total: number } {
  const conversations = ConversationRepo.listAll(options)

  const db = getDb()
  let countQuery = 'SELECT COUNT(*) as total FROM conversations'
  const params: unknown[] = []
  if (options?.channel) {
    countQuery += ' WHERE channel = ?'
    params.push(options.channel)
  }
  const { total } = (db as any).prepare(countQuery).get(...params) as { total: number }

  return { conversations, total }
}

export function getConversation(id: string): ConversationDetail | null {
  const row = ConversationRepo.getById(id)
  if (!row) return null

  const messages = JSON.parse(row.messages) as Array<{ role: string; content: string }>

  return {
    id: row.id,
    chat_id: row.chat_id,
    channel: row.channel,
    escalated: row.escalated,
    last_message_at: row.last_message_at,
    created_at: row.created_at,
    message_count: messages.length,
    last_message_preview: null,
    customer_name: row.customer_name ?? null,
    customer_phone: row.customer_phone ?? null,
    messages,
  }
}

export function getSessionStats(): {
  byChannel: Array<{ channel: string; count: number }>
  recentHour: number
  recentDay: number
  total: number
} {
  const byChannel = ConversationRepo.countByChannel()
  const recentHour = ConversationRepo.countRecent(1)
  const recentDay = ConversationRepo.countRecent(24)
  const total = byChannel.reduce((sum, c) => sum + c.count, 0)

  return { byChannel, recentHour, recentDay, total }
}
