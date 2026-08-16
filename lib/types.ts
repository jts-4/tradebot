export type Candle = {
  open: number
  high: number
  low: number
  close: number
  volume: number
  time: number // unix ms UTC
}

export type Trade = {
  id: string
  symbol: string
  side: 'BUY' | 'SELL'
  entry_price: number
  quantity: number
  notional: number
  stop_price: number
  target_price: number
  exit_price: number | null
  profit_loss: number | null
  exit_reason: 'TARGET' | 'STOP' | 'REGIME_CHANGE' | null
  strategy_version: string
  created_at: string
  closed_at: string | null
}

export type MissedOpportunity = {
  id: string
  symbol: string
  side: 'BUY' | 'SELL'
  signal_price: number
  required_notional: number
  available_capital: number
  stop_price: number
  target_price: number
  reason: string
  created_at: string
}

export type Decision = {
  id: string
  symbol: string
  candle_open: string
  candle_close: string
  verdict: 'PASS' | 'SKIP'
  conditions: { label: string; passed: boolean; value: string; required: string }[]
  indicators: { label: string; value: string }[]
  missing: { label: string; current: string; target: string; gap: string }[]
  strategy_version: string
  created_at: string
}

export type BotStatus = {
  id: number
  last_run: string
  next_run: string
  halted: boolean
  halt_reason: string | null
  use_ema_filter: boolean
  consecutive_losses: number
  daily_loss: number
  daily_loss_date: string
  peak_equity: number
}

export type AccountSnapshot = {
  id: string
  equity: number
  total_return: number
  allocated: number
  available: number
  created_at: string
}

export type InstrumentState = {
  symbol: string
  trigger_type: 'WT' | 'FISHER' | null
  trigger_bar_time: number | null
  trigger_direction: 'LONG' | 'SHORT' | null
}
