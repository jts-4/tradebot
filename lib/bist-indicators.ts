import { EMA, RSI } from 'technicalindicators'
import type { Candle } from './types'

function calcSMA(values: number[], period: number): number[] {
  const result: number[] = []
  for (let i = period - 1; i < values.length; i++) {
    const sum = values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0)
    result.push(sum / period)
  }
  return result
}

function calcMACD(closes: number[]) {
  const fast = EMA.calculate({ period: 12, values: closes })
  const slow = EMA.calculate({ period: 26, values: closes })
  const len = Math.min(fast.length, slow.length)
  const macdLine = fast.slice(fast.length - len).map((v, i) => v - slow[slow.length - len + i])
  const signal = EMA.calculate({ period: 9, values: macdLine })
  const hist = macdLine.slice(macdLine.length - signal.length).map((v, i) => v - signal[i])
  return { macdLine: macdLine.slice(macdLine.length - signal.length), hist }
}

function calcCCI(candles: Candle[], period = 10) {
  const tp = candles.map(c => (c.high + c.low + c.close) / 3)
  const result: number[] = []
  for (let i = period - 1; i < tp.length; i++) {
    const slice = tp.slice(i - period + 1, i + 1)
    const mean = slice.reduce((a, b) => a + b, 0) / period
    const md = slice.reduce((a, b) => a + Math.abs(b - mean), 0) / period
    result.push(md === 0 ? 0 : (tp[i] - mean) / (0.015 * md))
  }
  return result
}

function calcMomentum(closes: number[], period = 10) {
  return closes.slice(period).map((v, i) => v - closes[i])
}

function calcOBV(candles: Candle[]) {
  const obv: number[] = [0]
  for (let i = 1; i < candles.length; i++) {
    const prev = obv[obv.length - 1]
    if (candles[i].close > candles[i - 1].close) obv.push(prev + candles[i].volume)
    else if (candles[i].close < candles[i - 1].close) obv.push(prev - candles[i].volume)
    else obv.push(prev)
  }
  return obv
}

function calcCMF(candles: Candle[], period = 21) {
  const result: number[] = []
  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1)
    let cmfv = 0, vol = 0
    for (const c of slice) {
      const range = c.high - c.low
      const mfm = range > 0 ? ((c.close - c.low) - (c.high - c.close)) / range : 0
      cmfv += mfm * c.volume
      vol += c.volume
    }
    result.push(vol > 0 ? cmfv / vol : 0)
  }
  return result
}

function calcMFI(candles: Candle[], period = 14) {
  const tp = candles.map(c => (c.high + c.low + c.close) / 3)
  const result: number[] = []
  for (let i = period; i < candles.length; i++) {
    let posFlow = 0, negFlow = 0
    for (let j = i - period + 1; j <= i; j++) {
      const mf = tp[j] * candles[j].volume
      if (tp[j] > tp[j - 1]) posFlow += mf
      else negFlow += mf
    }
    result.push(negFlow === 0 ? 100 : 100 - 100 / (1 + posFlow / negFlow))
  }
  return result
}

function calcStochastic(candles: Candle[], period = 14, smooth = 3) {
  const kRaw: number[] = []
  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1)
    const highest = Math.max(...slice.map(c => c.high))
    const lowest = Math.min(...slice.map(c => c.low))
    const range = highest - lowest
    kRaw.push(range > 0 ? ((candles[i].close - lowest) / range) * 100 : 50)
  }
  return calcSMA(kRaw, smooth)
}

function calcT3(closes: number[], period = 7, b = 0.7): number[] {
  const c1 = -b * b * b
  const c2 = 3 * b * b + 3 * b * b * b
  const c3 = -6 * b * b - 3 * b - 3 * b * b * b
  const c4 = 1 + 3 * b + b * b * b + 3 * b * b

  const e1 = EMA.calculate({ period, values: closes })
  const e2 = EMA.calculate({ period, values: e1 })
  const e3 = EMA.calculate({ period, values: e2 })
  const e4 = EMA.calculate({ period, values: e3 })
  const e5 = EMA.calculate({ period, values: e4 })
  const e6 = EMA.calculate({ period, values: e5 })

  const n = e6.length
  function tail(arr: number[]): number[] {
    return arr.length >= n ? arr.slice(arr.length - n) : [...Array(n - arr.length).fill(NaN), ...arr]
  }

  const a3 = tail(e3), a4 = tail(e4), a5 = tail(e5)
  return e6.map((v6, i) => c1 * v6 + c2 * a5[i] + c3 * a4[i] + c4 * a3[i])
}

export type DivergenceResult = {
  bullish: number
  bearish: number
  bullishIndicators: string[]
  bearishIndicators: string[]
}

export function calcDivergence(candles: Candle[]): DivergenceResult {
  const closes = candles.map(c => c.close)
  const n = candles.length
  const lookback = 50

  const rsiArr = RSI.calculate({ period: 14, values: closes })
  const { macdLine, hist } = calcMACD(closes)
  const stochArr = calcStochastic(candles)
  const cciArr = calcCCI(candles)
  const momArr = calcMomentum(closes)
  const obvArr = calcOBV(candles)
  const cmfArr = calcCMF(candles)
  const mfiArr = calcMFI(candles)

  function align(arr: number[]): number[] {
    if (arr.length >= n) return arr.slice(arr.length - n)
    return [...Array(n - arr.length).fill(NaN), ...arr]
  }

  const indicators: { name: string; values: number[] }[] = [
    { name: 'RSI',   values: align(rsiArr) },
    { name: 'MACD',  values: align(macdLine) },
    { name: 'Hist',  values: align(hist) },
    { name: 'Stoch', values: align(stochArr) },
    { name: 'CCI',   values: align(cciArr) },
    { name: 'MOM',   values: align(momArr) },
    { name: 'OBV',   values: align(obvArr) },
    { name: 'CMF',   values: align(cmfArr) },
    { name: 'MFI',   values: align(mfiArr) },
  ]

  const bullishIndicators: string[] = []
  const bearishIndicators: string[] = []

  const recentCloses = closes.slice(n - 3)
  const currentLow  = Math.min(...recentCloses)
  const currentHigh = Math.max(...recentCloses)
  const pastCloses  = closes.slice(n - 3 - lookback, n - 3)
  const pastLow     = Math.min(...pastCloses)
  const pastHigh    = Math.max(...pastCloses)
  const pastLowIdx  = pastCloses.lastIndexOf(pastLow)
  const pastHighIdx = pastCloses.lastIndexOf(pastHigh)

  for (const ind of indicators) {
    const vals = ind.values
    const recentVals = vals.slice(n - 3)
    const pastVals   = vals.slice(n - 3 - lookback, n - 3)
    if (recentVals.some(v => isNaN(v)) || pastVals.length === 0) continue

    const currentIndLow  = Math.min(...recentVals)
    const currentIndHigh = Math.max(...recentVals)
    const pastIndLow     = pastVals[pastLowIdx]  ?? Math.min(...pastVals.filter(v => !isNaN(v)))
    const pastIndHigh    = pastVals[pastHighIdx] ?? Math.max(...pastVals.filter(v => !isNaN(v)))

    if (currentLow < pastLow && currentIndLow > pastIndLow)   bullishIndicators.push(ind.name)
    if (currentHigh > pastHigh && currentIndHigh < pastIndHigh) bearishIndicators.push(ind.name)
  }

  return { bullish: bullishIndicators.length, bearish: bearishIndicators.length, bullishIndicators, bearishIndicators }
}

export type IndicatorResult = {
  stochRsiSignal: boolean
  stochRsiK: number
  stochRsiD: number
  stochRsiPrevK: number
  stochRsiPrevD: number
  ema10Signal: boolean
  ema10: number
  wtSignal: boolean
  wt1: number
  wt2: number
  fisherSignal: boolean
  fisher: number
  fisherTrigger: number
  ma7: number
  ma14: number
  ma21: number
  goldenCross: boolean
  halfGoldenCross: boolean
  maBelowWarning: boolean
  maBelowWhich: string
  rsi: number
  rsiSignal: boolean
  t3: number
  t3Bullish: boolean
  strategyActive: boolean
  ema10CrossBarsAgo: number
  distFromLastDip: number
  lastDipPrice: number
  volume: number
  avgVolume: number
  volumeAboveAvg: boolean
  divergence: DivergenceResult
}

function calcStochRSI(closes: number[], rsiPeriod: number, stochPeriod: number, kSmooth: number, dSmooth: number) {
  const rsiArr = RSI.calculate({ period: rsiPeriod, values: closes })
  const kRaw: number[] = []
  for (let i = stochPeriod - 1; i < rsiArr.length; i++) {
    const slice = rsiArr.slice(i - stochPeriod + 1, i + 1)
    const highest = Math.max(...slice)
    const lowest = Math.min(...slice)
    const range = highest - lowest
    kRaw.push(range > 0 ? ((rsiArr[i] - lowest) / range) * 100 : 50)
  }
  const kArr = calcSMA(kRaw, kSmooth)
  const dArr = calcSMA(kArr, dSmooth)
  return { kArr, dArr }
}

function calcWT(candles: Candle[], n1 = 10, n2 = 21) {
  const hlc3 = candles.map(c => (c.high + c.low + c.close) / 3)
  const esa = EMA.calculate({ period: n1, values: hlc3 })
  const offset = hlc3.length - esa.length
  const d = hlc3.slice(offset).map((v, i) => Math.abs(v - esa[i]))
  const de = EMA.calculate({ period: n1, values: d })
  const offset2 = esa.length - de.length
  const ci = esa.slice(offset2).map((v, i) =>
    (hlc3.slice(offset + offset2)[i] - v) / (0.015 * de[i])
  )
  return EMA.calculate({ period: n2, values: ci })
}

function calcFisher9(candles: Candle[], period = 9) {
  const fishArr: number[] = []
  let prevFish = 0, prevValue = 0
  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1)
    const highest = Math.max(...slice.map(c => c.high))
    const lowest  = Math.min(...slice.map(c => c.low))
    const range = highest - lowest
    const hl2 = (candles[i].high + candles[i].low) / 2
    let value = range > 0 ? 2 * ((hl2 - lowest) / range) - 1 : 0
    value = Math.max(-0.999, Math.min(0.999, 0.66 * value + 0.67 * prevValue))
    const fish = 0.5 * Math.log((1 + value) / (1 - value)) + 0.5 * prevFish
    fishArr.push(fish)
    prevFish = fish
    prevValue = value
  }
  return { fishArr, trigArr: [0, ...fishArr.slice(0, -1)] }
}

export function calcIndicators(candles: Candle[], stochSettings: { k: number; d: number }): IndicatorResult {
  const closes  = candles.map(c => c.close)
  const volumes = candles.map(c => c.volume)

  const ma7arr  = calcSMA(closes, 7)
  const ma14arr = calcSMA(closes, 14)
  const ma21arr = calcSMA(closes, 21)
  const ma7  = ma7arr[ma7arr.length - 1]
  const ma14 = ma14arr[ma14arr.length - 1]
  const ma21 = ma21arr[ma21arr.length - 1]
  const prevMa7  = ma7arr[ma7arr.length - 2]
  const prevMa14 = ma14arr[ma14arr.length - 2]
  const prevMa21 = ma21arr[ma21arr.length - 2]

  const ema10arr = EMA.calculate({ period: 10, values: closes })
  const ema10    = ema10arr[ema10arr.length - 1]
  const lastClose = closes[closes.length - 1]

  const rsiArr = RSI.calculate({ period: 14, values: closes })
  const rsi     = rsiArr[rsiArr.length - 1]
  const prevRsi = rsiArr[rsiArr.length - 2]

  const { kArr, dArr } = calcStochRSI(closes, 14, 14, stochSettings.k, stochSettings.d)
  const stochK = kArr[kArr.length - 1]
  const stochD = dArr[dArr.length - 1]
  const prevK  = kArr[kArr.length - 2]
  const prevD  = dArr[dArr.length - 2]

  const wt1arr  = calcWT(candles)
  const wt1     = wt1arr[wt1arr.length - 1]
  const prevWt1 = wt1arr[wt1arr.length - 2]
  const wt2     = wt1arr.slice(-4).reduce((a, b) => a + b, 0) / 4
  const prevWt2 = wt1arr.slice(-5, -1).reduce((a, b) => a + b, 0) / 4

  const { fishArr, trigArr } = calcFisher9(candles)
  const fisher        = fishArr[fishArr.length - 1]
  const fisherTrigger = trigArr[trigArr.length - 1]
  const prevFisher    = fishArr[fishArr.length - 2]
  const prevFisherTrig = trigArr[trigArr.length - 2]

  const t3arr   = calcT3(closes)
  const t3      = t3arr[t3arr.length - 1]
  const prevT3  = t3arr[t3arr.length - 2]
  const t3Bullish = t3 > prevT3

  const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
  const volume    = volumes[volumes.length - 1]

  const stochRsiSignal = prevK < 25 && prevK < prevD && stochK > stochD
  const ema10Signal    = lastClose > ema10
  const wtSignal       = prevWt1 < prevWt2 && wt1 > wt2 && prevWt1 < -60
  const fisherSignal   = prevFisher < prevFisherTrig && fisher > fisherTrigger && prevFisher < 0
  const goldenCross     = prevMa7 < prevMa21 && ma7 > ma21
  const halfGoldenCross = prevMa7 < prevMa14 && ma7 > ma14
  const belowMa7  = lastClose < ma7
  const belowMa14 = lastClose < ma14
  const maBelowWarning = belowMa7 || belowMa14
  const maBelowWhich   = belowMa7 && belowMa14 ? 'MA7 ve MA14' : belowMa7 ? 'MA7' : belowMa14 ? 'MA14' : ''
  const rsiSignal = prevRsi < 40 && rsi > prevRsi

  // Strateji: En son StochRSI tetiklenmesinden sonraki 16 mum içinde EMA10 üstünde kapanış var mı?
  const { kArr: kArrFull, dArr: dArrFull } = calcStochRSI(closes, 14, 14, stochSettings.k, stochSettings.d)
  const ema10Full = EMA.calculate({ period: 10, values: closes })
  const ema10Offset = closes.length - ema10Full.length
  const kOffset = closes.length - kArrFull.length
  let strategyActive = false
  let ema10CrossBarsAgo = -1

  // En son StochRSI tetiklenme indeksini bul
  let lastTriggerIdx = -1
  for (let i = kArrFull.length - 1; i >= 1; i--) {
    if (kArrFull[i-1] < 25 && kArrFull[i-1] < dArrFull[i-1] && kArrFull[i] > dArrFull[i]) {
      lastTriggerIdx = i + kOffset // closes dizisindeki index
      break
    }
  }

  // Tetiklenme bulunduysa, sonraki 16 mum içinde EMA10 üstünde kapanış ara
  if (lastTriggerIdx >= 0) {
    const searchEnd = Math.min(lastTriggerIdx + 16, closes.length - 1)
    let crossIdx = -1
    for (let j = lastTriggerIdx; j <= searchEnd; j++) {
      const e = ema10Full[j - ema10Offset]
      if (e != null && closes[j] > e) {
        crossIdx = j
        strategyActive = true
        ema10CrossBarsAgo = closes.length - 1 - j
        break
      }
    }
    // EMA10 üstünde kapanış olduysa, sonrasında aşağı yönlü kapanış oldu mu?
    if (crossIdx >= 0) {
      for (let j = crossIdx + 1; j < closes.length; j++) {
        const e = ema10Full[j - ema10Offset]
        if (e != null && closes[j] < e) {
          strategyActive = false
          ema10CrossBarsAgo = -1
          break
        }
      }
    }
  }
  const divergence = calcDivergence(candles)

  // Son swing low: son 30 mum içinde her iki yanda 3 mum daha yüksek olan nokta
  const lookbackDip = Math.min(30, candles.length - 4)
  let lastDipPrice = candles[candles.length - 1 - lookbackDip].low
  for (let i = candles.length - 4; i >= candles.length - 1 - lookbackDip; i--) {
    const left  = candles.slice(Math.max(0, i - 3), i)
    const right = candles.slice(i + 1, i + 4)
    if (left.every(c => c.low >= candles[i].low) && right.every(c => c.low >= candles[i].low)) {
      lastDipPrice = candles[i].low
      break
    }
  }
  const distFromLastDip = lastDipPrice > 0 ? ((lastClose - lastDipPrice) / lastDipPrice) * 100 : 0

  return {
    stochRsiSignal, stochRsiK: stochK, stochRsiD: stochD, stochRsiPrevK: prevK, stochRsiPrevD: prevD,
    ema10Signal, ema10,
    wtSignal, wt1, wt2,
    fisherSignal, fisher, fisherTrigger,
    ma7, ma14, ma21,
    goldenCross, halfGoldenCross, maBelowWarning, maBelowWhich,
    rsi, rsiSignal,
    t3, t3Bullish,
    strategyActive,
    ema10CrossBarsAgo,
    distFromLastDip, lastDipPrice,
    volume, avgVolume, volumeAboveAvg: volume > avgVolume,
    divergence,
  }
}
