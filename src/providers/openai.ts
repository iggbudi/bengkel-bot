/**
 * OpenAI Provider — GPT-5.4 Mini
 * Model definition for pi SDK ModelRegistry / createAgentSession.
 *
 * gpt-5.4-mini is not yet in @earendil-works/pi-ai built-in models,
 * so we register it manually using OpenAI Responses API metadata.
 *
 * @see https://developers.openai.com/api/docs/models/gpt-5.4-mini
 */

import type { Model } from '@earendil-works/pi-ai'

export const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1'
export const OPENAI_GPT_5_4_MINI_ID = 'gpt-5.4-mini'

export const OPENAI_GPT_5_4_MINI: Model<'openai-responses'> = {
  id: OPENAI_GPT_5_4_MINI_ID,
  name: 'GPT-5.4 Mini',
  api: 'openai-responses',
  provider: 'openai',
  baseUrl: OPENAI_DEFAULT_BASE_URL,
  reasoning: true,
  input: ['text', 'image'],
  cost: {
    input: 0.75,
    output: 4.5,
    cacheRead: 0.075,
    cacheWrite: 0,
  },
  contextWindow: 400_000,
  maxTokens: 128_000,
}