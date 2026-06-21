/**
 * Generate bcrypt hash for ADMIN_PASSWORD_HASH in .env
 * Usage: npm run admin:hash-password
 */

import { config as loadEnv } from 'dotenv'
import { hashAdminPassword } from './password.js'

loadEnv({ override: true })

const plain = process.env.ADMIN_PASSWORD
if (!plain) {
  console.error('ADMIN_PASSWORD belum diset di .env')
  process.exit(1)
}

const hash = await hashAdminPassword(plain)
console.log('Tambahkan ke .env:')
console.log(`ADMIN_PASSWORD_HASH=${hash}`)
console.log('')
console.log('Setelah itu, hapus atau kosongkan ADMIN_PASSWORD dari .env untuk keamanan.')