/**
 * Admin password hashing and verification (bcrypt).
 */

import bcrypt from 'bcryptjs'

const DEFAULT_ADMIN_PASSWORD = 'Unisbank1920'
const BCRYPT_ROUNDS = 12

export function getAdminUsername(): string {
  return process.env.ADMIN_USERNAME ?? 'admin'
}

export function isDefaultAdminPassword(): boolean {
  if (process.env.ADMIN_PASSWORD_HASH?.trim()) return false
  const password = process.env.ADMIN_PASSWORD ?? DEFAULT_ADMIN_PASSWORD
  return password === DEFAULT_ADMIN_PASSWORD
}

export function warnIfInsecureAdminCredentials(): void {
  if (process.env.NODE_ENV !== 'production') return

  if (isDefaultAdminPassword()) {
    console.warn(
      '[SECURITY] ADMIN_PASSWORD masih default — segera set password kuat di .env',
    )
  }
  if (!process.env.ADMIN_PASSWORD_HASH?.trim()) {
    console.warn(
      '[SECURITY] ADMIN_PASSWORD_HASH belum diset — gunakan: npm run admin:hash-password',
    )
  }
}

export async function hashAdminPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS)
}

export async function verifyAdminPassword(input: string): Promise<boolean> {
  const hash = process.env.ADMIN_PASSWORD_HASH?.trim()
  if (hash) {
    return bcrypt.compare(input, hash)
  }

  const plain = process.env.ADMIN_PASSWORD ?? DEFAULT_ADMIN_PASSWORD
  return input === plain
}

export async function verifyAdminLogin(username: string, password: string): Promise<boolean> {
  if (username !== getAdminUsername()) return false
  return verifyAdminPassword(password)
}