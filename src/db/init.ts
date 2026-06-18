/**
 * DB Init Script
 * Run with: npm run db:init
 */

import { getDb } from './schema.js'
import { v4 as uuidv4 } from 'uuid'

const db = getDb()

// Seed demo workshop
db.prepare(`
  INSERT OR IGNORE INTO workshops (id, name, address, phone, hours, days, specialization)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(
  'default',
  process.env.WORKSHOP_NAME ?? 'Bengkel Demo Semarang',
  process.env.WORKSHOP_ADDRESS ?? 'Jl. Tembalang No.1, Semarang',
  process.env.WORKSHOP_PHONE ?? '081234567890',
  process.env.WORKSHOP_HOURS ?? '08.00-17.00',
  process.env.WORKSHOP_DAYS ?? 'Senin-Sabtu',
  process.env.WORKSHOP_SPECIALIZATION ?? 'Mobil umum (Honda, Toyota, Suzuki, Daihatsu)'
)

// Seed demo bookings
const demoBookings = [
  { plate: 'B 1234 CD', car: 'Honda Civic 2018', service: 'Service Completo', status: 'in_progress' as const },
  { plate: 'KT 5678 E', car: 'Toyota Avanza 2020', service: 'Ganti Rem Depan', status: 'pending' as const },
  { plate: 'H 9012 IJ', car: 'Suzuki Ertiga 2022', service: 'Tune Up', status: 'done' as const },
]

for (const b of demoBookings) {
  const existing = db.prepare('SELECT id FROM bookings WHERE plate_number = ?').get(b.plate)
  if (!existing) {
    db.prepare(`
      INSERT INTO bookings (id, workshop_id, service_type, plate_number, car_model, status)
      VALUES (?, 'default', ?, ?, ?, ?)
    `).run(uuidv4(), b.service, b.plate, b.car, b.status)
  }
}

console.log('✅ Database initialized with schema + seed data')
console.log('   Tables: workshops, customers, bookings, conversations')
console.log(`   Demo bookings: ${demoBookings.length} records`)
