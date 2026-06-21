/**
 * LLM request timeout helper.
 */

export class LlmTimeoutError extends Error {
  constructor(ms: number) {
    super(`LLM tidak merespons dalam ${Math.round(ms / 1000)} detik. Coba lagi ya.`)
    this.name = 'LlmTimeoutError'
  }
}

export function getLlmTimeoutMs(): number {
  const n = Number(process.env.LLM_TIMEOUT_MS ?? 60_000)
  return Number.isFinite(n) && n > 0 ? n : 60_000
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new LlmTimeoutError(ms)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

export function isLlmTimeoutError(err: unknown): boolean {
  return err instanceof LlmTimeoutError || (err instanceof Error && err.name === 'LlmTimeoutError')
}