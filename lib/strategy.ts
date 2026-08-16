import { EMA, RSI, ATR } from 'technicalindicators'

export type Candle = {
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// WaveTrend (LazyBear) hesaplama
export function calcWaveTrend(candles: Candle[], n1 = 10, n2 = 21) {
  const hlc3 = candles.map(c => (c.high + c.low + c.close) / 3)

  const esa = EMA.calculate({ period: n1, values: hlc3 })
  const offset = hlc3.length - esa.length

  const d = hlc3.slice(offset).map((v, i) => Math.abs(v - esa[i]))
  const de = EMA.calculate({ period: n1, values: d })
  const offset2 = esa.length - de.length

  const ci = esa.slice(offset2).map((v, i) => (hlc3.slice(offset + offset2)[i] - v) / (0.015 * de[i]))
  const wt1 = EMA.calculate({ period: n2, values: ci })
  const wt2 = wt1.slice(wt1.length - 4).reduce((a, b) => a + b, 0) / 4 // 4 periyot SMA

  return { wt1: wt1[wt1.length - 1], wt2, prevWt1: wt1[wt1.length - 2] }
}

export type StrategyConfig = {
  useEmaRegimeFilter: boolean  // EMA21/50/200 toggle
}

export type SignalResult = {
  signal: 'LONG' | 'SHORT' | 'NONE'
  indicators: { label: string; value: string }[]
  conditions: { label: string; passed: boolean; value: string; required: string }[]
  missing: { label: string; current: string; target: string; gap: string }[]
  qty: number
  stopPrice: number
  targetPrice: number
}

export function evaluate(candles: Candle[], equity: number, config: StrategyConfig): SignalResult {
  const closes = candles.map(c => c.close)
  const highs = candles.map(c => c.high)
  const lows = candles.map(c => c.low)

  const ema10 = EMA.calculate({ period: 10, values: closes })
  const rsi14 = RSI.calculate({ period: 14, values: closes })
  const atr14 = ATR.calculate({ period: 14, high: highs, low: lows, close: closes })

  const lastClose = closes[closes.length - 1]
  const prevClose = closes[closes.length - 2]
  const lastEma10 = ema10[ema10.length - 1]
  const prevEma10 = ema10[ema10.length - 2]
  const lastRsi = rsi14[rsi14.length - 1]
  const lastAtr = atr14[atr14.length - 1]

  const { wt1, wt2, prevWt1 } = calcWaveTrend(candles)

  // Kesişim tespiti
  const ema10CrossUp = prevClose < prevEma10 && lastClose > lastEma10
  const ema10CrossDown = prevClose > prevEma10 && lastClose < lastEma10
  const wtCrossUp = prevWt1 < wt2 && wt1 > wt2  // WT1 WT2'yi yukarı kesti (önceki wt2 yaklaşık)
  const wtCrossDown = prevWt1 > wt2 && wt1 < wt2

  const rsiLong = lastRsi > 52
  const rsiShort = lastRsi < 48

  // EMA rejim filtresi (opsiyonel)
  let regimeLong = true
  let regimeShort = true
  let ema21: number | null = null
  let ema50: number | null = null
  let ema200: number | null = null

  if (config.useEmaRegimeFilter) {
    const e21 = EMA.calculate({ period: 21, values: closes })
    const e50 = EMA.calculate({ period: 50, values: closes })
    const e200 = EMA.calculate({ period: 200, values: closes })
    ema21 = e21[e21.length - 1]
    ema50 = e50[e50.length - 1]
    ema200 = e200[e200.length - 1]
    regimeLong = ema50 > ema200
    regimeShort = ema50 < ema200
  }

  // Risk hesabı
  const stopDist = 3.5 * lastAtr
  const qty = (equity * 0.015) / stopDist

  const indicators = [
    { label: 'Fiyat', value: lastClose.toFixed(2) },
    { label: 'EMA10', value: lastEma10.toFixed(2) },
    { label: 'RSI14', value: lastRsi.toFixed(1) },
    { label: 'ATR14', value: lastAtr.toFixed(2) },
    { label: 'WT1', value: wt1.toFixed(2) },
    { label: 'WT2', value: wt2.toFixed(2) },
    ...(config.useEmaRegimeFilter ? [
      { label: 'EMA21', value: ema21!.toFixed(2) },
      { label: 'EMA50', value: ema50!.toFixed(2) },
      { label: 'EMA200', value: ema200!.toFixed(2) },
    ] : []),
  ]

  // LONG değerlendirme
  const longConditions = [
    { label: 'EMA10 yukarı kesişim', passed: ema10CrossUp, value: lastClose.toFixed(2), required: `> ${lastEma10.toFixed(2)}` },
    { label: 'RSI > 52', passed: rsiLong, value: lastRsi.toFixed(1), required: '> 52' },
    { label: 'WT1 WT2\'yi yukarı kesti', passed: wtCrossUp, value: wt1.toFixed(2), required: `> ${wt2.toFixed(2)}` },
    ...(config.useEmaRegimeFilter ? [
      { label: 'Boğa rejimi (EMA50 > EMA200)', passed: regimeLong, value: ema50?.toFixed(2) ?? '-', required: `> ${ema200?.toFixed(2) ?? '-'}` }
    ] : []),
  ]

  const shortConditions = [
    { label: 'EMA10 aşağı kesişim', passed: ema10CrossDown, value: lastClose.toFixed(2), required: `< ${lastEma10.toFixed(2)}` },
    { label: 'RSI < 48', passed: rsiShort, value: lastRsi.toFixed(1), required: '< 48' },
    { label: 'WT1 WT2\'yi aşağı kesti', passed: wtCrossDown, value: wt1.toFixed(2), required: `< ${wt2.toFixed(2)}` },
    ...(config.useEmaRegimeFilter ? [
      { label: 'Ayı rejimi (EMA50 < EMA200)', passed: regimeShort, value: ema50?.toFixed(2) ?? '-', required: `< ${ema200?.toFixed(2) ?? '-'}` }
    ] : []),
  ]

  const isLong = longConditions.every(c => c.passed)
  const isShort = shortConditions.every(c => c.passed)

  const signal = isLong ? 'LONG' : isShort ? 'SHORT' : 'NONE'
  const conditions = isLong || (!isShort) ? longConditions : shortConditions

  // Ne değişmeli
  const missing = conditions
    .filter(c => !c.passed)
    .map(c => {
      const cur = parseFloat(c.value)
      const req = parseFloat(c.required.replace(/[^0-9.]/g, ''))
      const gap = Math.abs(cur - req).toFixed(2)
      return { label: c.label, current: c.value, target: c.required, gap }
    })

  const stopPrice = signal === 'LONG'
    ? lastClose - stopDist
    : lastClose + stopDist

  const targetPrice = signal === 'LONG'
    ? lastClose + stopDist * 3
    : lastClose - stopDist * 3

  return { signal, indicators, conditions, missing, qty, stopPrice, targetPrice }
}
