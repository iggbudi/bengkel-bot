/**
 * Bookings Admin API
 * ------------------
 * List and update bookings from SQLite.
 */

import { getDb, type DbBooking } from '../db/schema.js'

export interface BookingRow extends DbBooking {
  customer_name?: string | null
  customer_phone?: string | null
}

export function listBookings(status?: string): BookingRow[] {
  const db = getDb()
  const query = status
    ? `SELECT b.*, c.name as customer_name, c.phone as customer_phone
       FROM bookings b LEFT JOIN customers c ON b.customer_id = c.id
       WHERE b.status = ? ORDER BY b.created_at DESC`
    : `SELECT b.*, c.name as customer_name, c.phone as customer_phone
       FROM bookings b LEFT JOIN customers c ON b.customer_id = c.id
       ORDER BY b.created_at DESC`

  return (status ? db.prepare(query).all(status) : db.prepare(query).all()) as unknown as BookingRow[]
}

export function updateBookingStatus(
  id: string,
  status: DbBooking['status'],
  notes?: string,
): { ok: boolean; error?: string } {
  const validStatuses: DbBooking['status'][] = ['pending', 'approved', 'in_progress', 'done', 'cancelled']
  if (!validStatuses.includes(status)) {
    return { ok: false, error: `Status tidak valid: ${status}` }
  }

  const db = getDb()
  const existing = db.prepare('SELECT id FROM bookings WHERE id = ?').get(id) as { id: string } | undefined
  if (!existing) return { ok: false, error: `Booking ${id} tidak ditemukan` }

  const doneAt = status === 'done' ? new Date().toISOString() : null
  db.prepare(
    'UPDATE bookings SET status = ?, done_at = COALESCE(?, done_at), notes = COALESCE(?, notes) WHERE id = ?',
  ).run(status, doneAt, notes ?? null, id)

  return { ok: true }
}
