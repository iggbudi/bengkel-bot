export function validateLlmConfig(): string | null {
  const provider = process.env.LLM_PROVIDER ?? 'openai'

  if (provider === 'openai' && (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes('your_'))) {
    return 'OPENAI_API_KEY belum diset di .env'
  }

  if (provider === 'sumopod' && (!process.env.SUMOPOD_API_KEY || process.env.SUMOPOD_API_KEY.includes('your_'))) {
    return 'SUMOPOD_API_KEY belum diset di .env'
  }

  return null
}