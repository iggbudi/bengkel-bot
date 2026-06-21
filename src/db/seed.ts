/**
 * Database seed helpers — workshop data synced from environment.
 */

import type { DatabaseSyncInstance } from './sqlite.js'

export interface WorkshopSeedInput {
  id?: string
  name: string
  address: string
  phone: string
  hours: string
  days: string
  specialization: string
}

export function workshopSeedFromEnv(): WorkshopSeedInput {
  return {
    id: 'default',
    name: process.env.WORKSHOP_NAME ?? 'Bengkel Demo Semarang',
    address: process.env.WORKSHOP_ADDRESS ?? 'Jl. Tembalang No.1, Semarang',
    phone: process.env.WORKSHOP_PHONE ?? '081234567890',
    hours: process.env.WORKSHOP_HOURS ?? '08.00-17.00',
    days: process.env.WORKSHOP_DAYS ?? 'Senin-Sabtu',
    specialization:
      process.env.WORKSHOP_SPECIALIZATION ??
      'Mobil umum (Honda, Toyota, Suzuki, Daihatsu)',
  }
}

export function seedWorkshop(
  db: DatabaseSyncInstance,
  input: WorkshopSeedInput = workshopSeedFromEnv(),
): void {
  db.prepare(`
    INSERT INTO workshops (id, name, address, phone, hours, days, specialization)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      address = excluded.address,
      phone = excluded.phone,
      hours = excluded.hours,
      days = excluded.days,
      specialization = excluded.specialization
  `).run(
    input.id ?? 'default',
    input.name,
    input.address,
    input.phone,
    input.hours,
    input.days,
    input.specialization,
  )
}