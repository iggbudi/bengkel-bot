const STARTED_AT = Date.now()

export function getUptimeSeconds(): number {
  return Math.floor((Date.now() - STARTED_AT) / 1000)
}

export function getStartedAtIso(): string {
  return new Date(STARTED_AT).toISOString()
}