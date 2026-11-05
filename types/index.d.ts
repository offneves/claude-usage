export type Totals = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  turns: number
}

export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type Measure = {
  contextTokens?: number
  contextWindow: number
  contextPercent?: number
  costUsd?: number
  rateLimits: Limit[]
}

declare module 'claude-code' {
  interface PluginState {
    'token-usage': {
      totals: Shaped<Totals>
      measure: Shaped<Measure | null>
      isHidden: boolean
    }
  }
}
