/**
 * Runtime loader for node:sqlite — avoids Vitest/Vite transform issues
 * with Node.js built-in module specifiers.
 */

import { createRequire } from 'node:module'
import type { DatabaseSync as DatabaseSyncInstance } from 'node:sqlite'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => DatabaseSyncInstance
}

export { DatabaseSync }
export type { DatabaseSyncInstance }