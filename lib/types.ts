export type Trade = {
  id: string
  symbol: string
  side: 'BUY' | 'SELL'
  price: number
  quantity: number
  total: number
  profit_loss: number | null
  created_at: string
}

export type MissedTrade = {
  id: string
  symbol: string
  side: 'BUY' | 'SELL'
  signal_price: number
  current_price: number | null
  reason: string | null
  created_at: string
}

export type Decision = {
  id: string
  symbol: string
  candle_open: string   // UTC
  candle_close: string  // UTC
  verdict: 'PASS' | 'SKIP'
  conditions: { label: string; passed: boolean; value: string; required: string }[]
  indicators: { label: string; value: string }[]
  missing: { label: string; current: string; target: string; gap: string }[]
  candle_highlighted: boolean
  created_at: string
}

export type BotStatus = {
  id: string
  last_run: string       // UTC
  next_run: string       // UTC
  halted: boolean
  halt_reason: string | null
}

export type AccountSnapshot = {
  id: string
  equity: number
  total_return: number
  allocated: number
  available: number
  created_at: string
}
