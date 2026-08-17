import { EMA, RSI, ATR } from 'technicalindicators'
import { CONFIG } from './config'
import type { InstrumentState } from './types'

export type Candle = {
  open: number
  high: number
  low: number
  close: number
  volume: number
  time: number
}

export function calcWaveTrend(candles: Candle[], n1 = 10, n2 = 21) {
  const hlc3 = candles.map(c => (c.high + c.low + c.close) / 3)
  const esa = EMA.calculate({ period: n1, values: hlc3 })
  const offset = hlc3.length - esa.length
  const d = hlc3.slice(offset).map((v, i) => Math.abs(v - esa[i]))
  const de = EMA.calculate({ period: n1, values: d })
  const offset2 = esa.length - de.length
  const ci = esa.slice(offset2).map((v, i) =>
    (hlc3.slice(offset + offset2)[i] - v) / (0.015 * de[i])
  )
  const wt1arr = EMA.calculate({ period: n2, values: ci })
  const wt1 = wt1arr[wt1arr.length - 1]
  const prevWt1 = wt1arr[wt1arr.length - 2]
  const wt2 = wt1arr.slice(-4).reduce((a, b) => a + b, 0) / 4
  const prevWt2 = wt1arr.slice(-5, -1).reduce((a, b) => a + b, 0) / 4
  return { wt1, wt2, prevWt1, prevWt2 }
}

export function calcFisher(candles: Candle[], period = 9) {
  const highs = candles.map(c => c.high)
  const lows = candles.map(c => c.low)
  const fishArr: number[] = []
  const trigArr: number[] = []
  let prevFish = 0
  let prevValue = 0

  for (let i = period - 1; i < candles.length; i++) {
    const sliceH = highs.slice(i - period + 1, i + 1)
    const sliceL = lows.slice(i - period + 1, i + 1)
    const highest = Math.max(...sliceH)
    const lowest = Math.min(...sliceL)
    const range = highest - lowest
    const hl2 = (candles[i].high + candles[i].low) / 2
    let value = range > 0 ? 2 * ((hl2 - lowest) / range) - 1 : 0
    value = Math.max(-0.999, Math.min(0.999, 0.66 * value + 0.67 * prevValue))
    const fish = 0.5 * Math.log((1 + value) / (1 - value)) + 0.5 * prevFish
    fishArr.push(fish)
    trigArr.push(prevFish)
    prevFish = fish
    prevValue = value
  }

  return {
    fisher: fishArr[fishArr.length - 1],
    trigger: trigArr[trigArr.length - 1],
    prevFisher: fishArr[fishArr.length - 2] ?? 0,
    prevTrigger: trigArr[trigArr.length - 2] ?? 0,
  }
}

export type SignalResult = {
  signal: 'LONG' | 'SHORT' | 'NONE'
  triggerFired: boolean
  triggerDirection: 'LONG' | 'SHORT' | null
  fisherActive: boolean
  notional: number
  indicators: { label: string; value: string }[]
  conditions: { label: string; passed: boolean; value: string; required: string }[]
  missing: { label: string; current: string; target: string; gap: string }[]
  qty: number
  entryPrice: number
  stopPrice: number
  targetPrice: number
}

export function evaluate(
  candles: Candle[],
  equity: number,
  available: number,
  instrState: InstrumentState,
  triggerLookback: number,
  useRsiFilter = false,
): SignalResult {
  const closes = candles.map(c => c.close)
  const highs = candles.map(c => c.high)
  const lows = candles.map(c => c.low)
  const currentBarTime = candles[candles.length - 1].time

  const ema10arr = EMA.calculate({ period: 11, values: closes })
  const ema50arr = EMA.calculate({ period: 50, values: closes })
  const ema200arr = EMA.calculate({ period: 200, values: closes })
  const rsi14arr = RSI.calculate({ period: 14, values: closes })
  const atr14arr = ATR.calculate({ period: 14, high: highs, low: lows, close: closes })

  const lastClose = closes[closes.length - 1]
  const prevClose = closes[closes.length - 2]
  const lastEma10 = ema10arr[ema10arr.length - 1]
  const prevEma10 = ema10arr[ema10arr.length - 2]
  const lastEma50 = ema50arr[ema50arr.length - 1]
  const lastEma200 = ema200arr[ema200arr.length - 1]
  const lastRsi = rsi14arr[rsi14arr.length - 1]
  const lastAtr = atr14arr[atr14arr.length - 1]

  const { wt1, wt2, prevWt1, prevWt2 } = calcWaveTrend(candles)
  const { fisher, trigger: fishTrig, prevFisher, prevTrigger } = calcFisher(candles)

  const ema10CrossUp = prevClose < prevEma10 && lastClose > lastEma10
  const ema10CrossDown = prevClose > prevEma10 && lastClose < lastEma10
  const wtCrossUp = prevWt1 < prevWt2 && wt1 > wt2
  const wtCrossDown = prevWt1 > prevWt2 && wt1 < wt2
  const fisherCrossUp = prevFisher < prevTrigger && fisher > fishTrig
  const fisherCrossDown = prevFisher > prevTrigger && fisher < fishTrig

  const rsiLong = lastRsi > 52
  const rsiShort = lastRsi < 48

  // Bu mumda yeni WT tetikleyici ateşlendi mi?
  const triggerFired = wtCrossUp || wtCrossDown
  const triggerDirection: 'LONG' | 'SHORT' | null = wtCrossUp ? 'LONG' : wtCrossDown ? 'SHORT' : null

  // Aktif tetikleyici
  const barMs = 4 * 60 * 60 * 1000
  const barsSinceTrigger = instrState.trigger_bar_time
    ? Math.round((currentBarTime - instrState.trigger_bar_time) / barMs)
    : Infinity

  let activeTriggerDirection: 'LONG' | 'SHORT' | null = null
  if (triggerFired) {
    activeTriggerDirection = triggerDirection
  } else if (instrState.trigger_direction && barsSinceTrigger <= triggerLookback) {
    activeTriggerDirection = instrState.trigger_direction
  }

  // Fisher bu mumda uygun mu? (kayıt amaçlı)
  const fisherActive = activeTriggerDirection === 'LONG'
    ? fisherCrossUp
    : activeTriggerDirection === 'SHORT'
      ? fisherCrossDown
      : false

  const stopDist = CONFIG.account.stopAtrMult * lastAtr
  const slip = CONFIG.account.slippage
  const entryPrice = activeTriggerDirection === 'SHORT'
    ? lastClose * (1 - slip)
    : lastClose * (1 + slip)
  const rawQty = (equity * CONFIG.account.riskPerTrade) / stopDist
  // ATR büyükse %20, küçükse %30 — normalize ile interpolate
  const atrPct = lastAtr / entryPrice
  const notionalPct = Math.max(CONFIG.account.minNotionalPct, Math.min(CONFIG.account.maxNotionalPct, CONFIG.account.maxNotionalPct - (atrPct / 0.02) * 0.1))
  const maxNotional = available * notionalPct
  const qty = Math.min(rawQty, maxNotional / entryPrice)
  const notional = qty * entryPrice
  const stopPrice = activeTriggerDirection === 'LONG' ? entryPrice - stopDist : entryPrice + stopDist
  const targetPrice = activeTriggerDirection === 'LONG'
    ? entryPrice + stopDist * CONFIG.account.rewardRiskRatio
    : entryPrice - stopDist * CONFIG.account.rewardRiskRatio

  const indicators = [
    { label: 'Fiyat', value: lastClose.toFixed(2) },
    { label: 'EMA11', value: lastEma10.toFixed(2) },
    { label: 'EMA50', value: lastEma50.toFixed(2) },
    { label: 'EMA200', value: lastEma200.toFixed(2) },
    { label: 'RSI14', value: lastRsi.toFixed(1) },
    { label: 'ATR14', value: lastAtr.toFixed(4) },
    { label: 'WT1', value: wt1.toFixed(2) },
    { label: 'WT2', value: wt2.toFixed(2) },
    { label: 'Fisher', value: fisher.toFixed(2) },
    { label: 'Fisher Trig', value: fishTrig.toFixed(2) },
  ]

  const longConditions = [
    { label: 'WT yukarı kesişim (tetikleyici)', passed: activeTriggerDirection === 'LONG', value: wt1.toFixed(2), required: `> ${wt2.toFixed(2)}` },
    { label: 'EMA11 yukarı kesişim', passed: ema10CrossUp, value: lastClose.toFixed(2), required: `> ${lastEma10.toFixed(2)}` },
    { label: 'Fiyat EMA50 üzerinde', passed: lastClose > lastEma50, value: lastClose.toFixed(2), required: `> ${lastEma50.toFixed(2)}` },
    { label: 'Fiyat EMA200 üzerinde', passed: lastClose > lastEma200, value: lastClose.toFixed(2), required: `> ${lastEma200.toFixed(2)}` },
    ...(useRsiFilter ? [{ label: 'RSI > 52', passed: rsiLong, value: lastRsi.toFixed(1), required: '> 52' }] : []),
  ]

  const shortConditions = [
    { label: 'WT aşağı kesişim (tetikleyici)', passed: activeTriggerDirection === 'SHORT', value: wt1.toFixed(2), required: `< ${wt2.toFixed(2)}` },
    { label: 'EMA11 aşağı kesişim', passed: ema10CrossDown, value: lastClose.toFixed(2), required: `< ${lastEma10.toFixed(2)}` },
    { label: 'Fiyat EMA50 altında', passed: lastClose < lastEma50, value: lastClose.toFixed(2), required: `< ${lastEma50.toFixed(2)}` },
    { label: 'Fiyat EMA200 altında', passed: lastClose < lastEma200, value: lastClose.toFixed(2), required: `< ${lastEma200.toFixed(2)}` },
    ...(useRsiFilter ? [{ label: 'RSI < 48', passed: rsiShort, value: lastRsi.toFixed(1), required: '< 48' }] : []),
  ]

  const isLong = longConditions.every(c => c.passed)
  const isShort = shortConditions.every(c => c.passed)
  const signal = isLong ? 'LONG' : isShort ? 'SHORT' : 'NONE'
  const conditions = activeTriggerDirection === 'SHORT' ? shortConditions : longConditions

  const missing = conditions
    .filter(c => !c.passed)
    .map(c => {
      const cur = parseFloat(c.value)
      const req = parseFloat(c.required.replace(/[^0-9.]/g, ''))
      const gap = isNaN(cur) || isNaN(req) ? '-' : Math.abs(cur - req).toFixed(2)
      return { label: c.label, current: c.value, target: c.required, gap }
    })

  // Minimum notional kontrolü
  if (signal !== 'NONE' && notional < CONFIG.account.minNotional) {
    return { signal: 'NONE', triggerFired, triggerDirection, fisherActive, notional, indicators, conditions, missing, qty, entryPrice, stopPrice, targetPrice }
  }

  return { signal, triggerFired, triggerDirection, fisherActive, notional, indicators, conditions, missing, qty, entryPrice, stopPrice, targetPrice }
}

export function calcAdaptiveLookback(trades: { trigger_lookback: number; profit_loss: number }[]): number {
  if (trades.length < 30) return CONFIG.triggerLookback

  const byLookback: Record<number, number[]> = {}
  for (const t of trades) {
    if (!byLookback[t.trigger_lookback]) byLookback[t.trigger_lookback] = []
    byLookback[t.trigger_lookback].push(t.profit_loss)
  }

  let bestLookback = CONFIG.triggerLookback
  let bestPF = 0

  for (const [lb, pls] of Object.entries(byLookback)) {
    const wins = pls.filter(p => p > 0).reduce((a, b) => a + b, 0)
    const losses = Math.abs(pls.filter(p => p <= 0).reduce((a, b) => a + b, 0))
    const pf = losses > 0 ? wins / losses : wins > 0 ? 999 : 0
    if (pf > bestPF) { bestPF = pf; bestLookback = parseInt(lb) }
  }

  return bestLookback
}
