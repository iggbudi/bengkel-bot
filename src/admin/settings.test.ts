import { describe, expect, it } from 'vitest'
import { maskSecret } from './settings.js'

describe('settings secrets masking', () => {
  it('masks long API keys', () => {
    expect(maskSecret('sk-abcdefghijklmnop')).toBe('sk-***...***mnop')
  })

  it('returns placeholder for empty or template values', () => {
    expect(maskSecret('')).toBe('(belum diset)')
    expect(maskSecret('your_api_key_here')).toBe('(belum diset)')
  })

  it('masks short values', () => {
    expect(maskSecret('abc')).toBe('***')
  })
})