/**
 * BengkelBot Database Schema
 * SQLite via Node.js built-in node:sqlite (no native compilation required)
 */

import { DatabaseSync } from 'node:sqlite'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync, existsSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = join(__dirname, '../../data/bengkelbot.db')

let _db: DatabaseSync | null = null

export function getDb(): DatabaseSync {
  if (!_db) {
    const dataDir = join(__dirname, '../../data')
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true })
    }

    _db = new DatabaseSync(DB_PATH)
    _db.exec('PRAGMA journal_mode = WAL')
    _db.exec('PRAGMA foreign_keys = ON')
    initSchema(_db)
  }
  return _db
}

function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workshops (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      hours TEXT,
      days TEXT,
      specialization TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      workshop_id TEXT NOT NULL,
      name TEXT,
      phone TEXT UNIQUE NOT NULL,
      car_model TEXT,
      plate_number TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workshop_id) REFERENCES workshops(id)
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      workshop_id TEXT NOT NULL,
      customer_id TEXT,
      service_type TEXT NOT NULL,
      description TEXT,
      plate_number TEXT,
      car_model TEXT,
      estimate_low INTEGER,
      estimate_high INTEGER,
      final_price INTEGER,
      status TEXT DEFAULT 'pending'
        CHECK(status IN ('pending','approved','in_progress','done','cancelled')),
      booked_at DATETIME,
      done_at DATETIME,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workshop_id) REFERENCES workshops(id),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      workshop_id TEXT NOT NULL,
      customer_id TEXT,
      channel TEXT NOT NULL CHECK(channel IN ('whatsapp','telegram','web')),
      chat_id TEXT NOT NULL,
      messages TEXT DEFAULT '[]',
      escalated BOOLEAN DEFAULT FALSE,
      last_message_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workshop_id) REFERENCES workshops(id),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
    CREATE INDEX IF NOT EXISTS idx_bookings_plate ON bookings(plate_number);
    CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
    CREATE INDEX IF NOT EXISTS idx_conversations_chat ON conversations(chat_id, channel);
  `)
}

// ── Repository helpers ──────────────────────────────────────────────────────

export interface DbWorkshop {
  id: string
  name: string
  address: string | null
  phone: string | null
  hours: string | null
  days: string | null
  specialization: string | null
}

export interface DbCustomer {
  id: string
  workshop_id: string
  name: string | null
  phone: string
  car_model: string | null
  plate_number: string | null
}

export interface DbBooking {
  id: string
  workshop_id: string
  customer_id: string | null
  service_type: string
  description: string | null
  plate_number: string | null
  car_model: string | null
  estimate_low: number | null
  estimate_high: number | null
  final_price: number | null
  status: 'pending' | 'approved' | 'in_progress' | 'done' | 'cancelled'
  booked_at: string | null
  done_at: string | null
  notes: string | null
}

export interface DbConversation {
  id: string
  workshop_id: string
  customer_id: string | null
  channel: 'whatsapp' | 'telegram' | 'web'
  chat_id: string
  messages: string // JSON array
  escalated: boolean
  last_message_at: string | null
  created_at: string
}

// Customers
export const CustomerRepo = {
  upsert(data: Omit<DbCustomer, 'id'> & { id?: string }): DbCustomer {
    const db = getDb()
    const existing = db.prepare('SELECT * FROM customers WHERE phone = ?').get(data.phone) as DbCustomer | undefined
    if (existing) {
      db.prepare(`
        UPDATE customers SET name = COALESCE(?, name), car_model = COALESCE(?, car_model),
        plate_number = COALESCE(?, plate_number), workshop_id = ?
        WHERE phone = ?
      `).run(data.name, data.car_model, data.plate_number, data.workshop_id, data.phone)
      return { ...existing, ...data }
    }
    const id = data.id ?? crypto.randomUUID()
    db.prepare(`
      INSERT INTO customers (id, workshop_id, name, phone, car_model, plate_number)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, data.workshop_id, data.name ?? null, data.phone, data.car_model ?? null, data.plate_number ?? null)
    return { id, ...data } as DbCustomer
  },

  findByPhone(phone: string): DbCustomer | undefined {
    return getDb().prepare('SELECT * FROM customers WHERE phone = ?').get(phone) as DbCustomer | undefined
  },
}

// Bookings
export const BookingRepo = {
  create(data: Omit<DbBooking, 'status' | 'created_at'> & { status?: DbBooking['status']; id?: string }): DbBooking {
    const db = getDb()
    const id = data.id ?? crypto.randomUUID()
    db.prepare(`
      INSERT INTO bookings (id, workshop_id, customer_id, service_type, description,
        plate_number, car_model, estimate_low, estimate_high, status, booked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.workshop_id, data.customer_id ?? null, data.service_type,
      data.description ?? null, data.plate_number ?? null, data.car_model ?? null,
      data.estimate_low ?? null, data.estimate_high ?? null,
      data.status ?? 'pending', data.booked_at ?? null
    )
    return { ...data, id, status: data.status ?? 'pending' } as DbBooking
  },

  findByPlate(plateNumber: string): DbBooking | undefined {
    return getDb().prepare(
      `SELECT * FROM bookings
       WHERE REPLACE(UPPER(plate_number), ' ', '') = REPLACE(UPPER(?), ' ', '')
       ORDER BY created_at DESC LIMIT 1`
    ).get(plateNumber) as DbBooking | undefined
  },

  updateStatus(id: string, status: DbBooking['status'], notes?: string): void {
    const doneAt = status === 'done' ? new Date().toISOString() : null
    getDb().prepare(
      'UPDATE bookings SET status = ?, done_at = COALESCE(?, done_at), notes = COALESCE(?, notes) WHERE id = ?'
    ).run(status, doneAt, notes ?? null, id)
  },
}

// Conversations
export const ConversationRepo = {
  upsert(data: Omit<DbConversation, 'messages' | 'created_at'> & { messages?: unknown[] }): DbConversation {
    const db = getDb()
    const existing = db.prepare(
      'SELECT * FROM conversations WHERE chat_id = ? AND channel = ?'
    ).get(data.chat_id, data.channel) as DbConversation | undefined

    const serializedMessages = JSON.stringify(data.messages ?? [])

    if (existing) {
      const messagesToStore = data.messages ? serializedMessages : existing.messages
      db.prepare(
        'UPDATE conversations SET messages = ?, last_message_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(messagesToStore, existing.id)
      return { ...existing, messages: messagesToStore }
    }

    const id = data.id ?? crypto.randomUUID()
    db.prepare(`
      INSERT INTO conversations (id, workshop_id, customer_id, channel, chat_id, messages)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, data.workshop_id, data.customer_id ?? null, data.channel, data.chat_id, serializedMessages)
    return { ...data, id, messages: serializedMessages, created_at: new Date().toISOString() }
  },

  getMessages(chatId: string, channel: string): unknown[] {
    const row = getDb().prepare('SELECT messages FROM conversations WHERE chat_id = ? AND channel = ?').get(chatId, channel) as { messages: string } | undefined
    return row ? JSON.parse(row.messages) : []
  },

  listAll(options?: { channel?: string; limit?: number; offset?: number }): Array<{
    id: string
    chat_id: string
    channel: string
    workshop_id: string
    customer_id: string | null
    escalated: boolean
    last_message_at: string | null
    created_at: string
    message_count: number
    last_message_preview: string | null
    customer_name: string | null
    customer_phone: string | null
  }> {
    const db = getDb()
    const limit = options?.limit ?? 50
    const offset = options?.offset ?? 0

    let query = `
      SELECT
        c.id, c.chat_id, c.channel, c.workshop_id, c.customer_id,
        c.escalated, c.last_message_at, c.created_at,
        cu.name as customer_name, cu.phone as customer_phone,
        json_array_length(c.messages) as message_count,
        (
          SELECT json_extract(value, '$.content')
          FROM json_each(c.messages)
          WHERE json_extract(value, '$.role') = 'user'
          ORDER BY key DESC LIMIT 1
        ) as last_message_preview
      FROM conversations c
      LEFT JOIN customers cu ON c.customer_id = cu.id`

    const params: unknown[] = []
    if (options?.channel) {
      query += ' WHERE c.channel = ?'
      params.push(options.channel)
    }

    query += ' ORDER BY c.last_message_at DESC, c.created_at DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)

    return (db as any).prepare(query).all(...params) as Array<{
      id: string
      chat_id: string
      channel: string
      workshop_id: string
      customer_id: string | null
      escalated: boolean
      last_message_at: string | null
      created_at: string
      message_count: number
      last_message_preview: string | null
      customer_name: string | null
      customer_phone: string | null
    }>
  },

  getById(id: string): (DbConversation & { customer_name?: string | null; customer_phone?: string | null }) | undefined {
    const db = getDb()
    const row = db.prepare(`
      SELECT c.*, cu.name as customer_name, cu.phone as customer_phone
      FROM conversations c
      LEFT JOIN customers cu ON c.customer_id = cu.id
      WHERE c.id = ?
    `).get(id) as (DbConversation & { customer_name?: string | null; customer_phone?: string | null }) | undefined
    return row
  },

  countByChannel(): Array<{ channel: string; count: number }> {
    return getDb().prepare(
      'SELECT channel, COUNT(*) as count FROM conversations GROUP BY channel'
    ).all() as Array<{ channel: string; count: number }>
  },

  countRecent(hours: number): number {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
    return (getDb().prepare(
      'SELECT COUNT(*) as count FROM conversations WHERE last_message_at >= ?'
    ).get(since) as { count: number }).count
  },
}