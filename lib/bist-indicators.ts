import { EMA, RSI } from 'technicalindicators'
import type { Candle } from './types'

export type IndicatorResult = {
  // StochRSI
  stochRsiSignal: boolean       // K < 25 iken K, D'yi yukarı kesiyor
  stochRsiK: number
  stochRsiD: number
  stochRsiPrevK: number
  stochRsiPrevD: number

  // EMA10
  ema10Signal: boolean          // mum kapanışı EMA10 üzerinde
  ema10: number

  // WT
  wtSignal: boolean             // sarı al sinyali (oversold'dan yukarı kesişim)
  wt1: number
  wt2: number

  // Fisher9
  fisherSignal: boolean         // mavi, turuncu'yu 0 altında yukarı kesiyor
  fisher: number
  fisherTrigger: number

  // MA7, MA14, MA21
  ma7: number
  ma14: number
  ma21: number
  goldenCross: boolean          // MA7 × MA21 yukarı
  halfGoldenCross: boolean      // MA7 × MA14 yukarı
  maBelowWarning: boolean       // fiyat MA7 veya MA14 altında
  maBelowWhich: string          // "MA7" | "MA14" | "MA7 ve MA14" | ""

  // RSI14
  rsi: number
  rsiSignal: boolean            // 40 altında yukarı yönlü hareket

  // Hacim
  volume: number
  avgVolume: number
  volumeAboveAvg: boolean
}

function calcSMA(values: number[], period: number): number[] {
  const result: number[] = []
  for (let i = period - 1; i < values.length; i++) {
    const sum = values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0)
    result.push(sum / period)
  }
  return result
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
  const wt1arr = EMA.calculate({ period: n2, values: ci })
  return wt1arr
}

function calcFisher9(candles: Candle[], period = 9) {
  const fishArr: number[] = []
  let prevFish = 0
  let prevValue = 0
  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1)
    const highest = Math.max(...slice.map(c => c.high))
    const lowest = Math.min(...slice.map(c => c.low))
    const range = highest - lowest
    const hl2 = (candles[i].high + candles[i].low) / 2
    let value = range > 0 ? 2 * ((hl2 - lowest) / range) - 1 : 0
    value = Math.max(-0.999, Math.min(0.999, 0.66 * value + 0.67 * prevValue))
    const fish = 0.5 * Math.log((1 + value) / (1 - value)) + 0.5 * prevFish
    fishArr.push(fish)
    prevFish = fish
    prevValue = value
  }
  // trigger = önceki fisher değeri
  const trigArr = [0, ...fishArr.slice(0, -1)]
  return { fishArr, trigArr }
}

export function calcIndicators(candles: Candle[], stochSettings: { k: number; d: number }): IndicatorResult {
  const closes = candles.map(c => c.close)
  const volumes = candles.map(c => c.volume)

  // MA
  const ma7arr  = calcSMA(closes, 7)
  const ma14arr = calcSMA(closes, 14)
  const ma21arr = calcSMA(closes, 21)
  const ma7  = ma7arr[ma7arr.length - 1]
  const ma14 = ma14arr[ma14arr.length - 1]
  const ma21 = ma21arr[ma21arr.length - 1]
  const prevMa7  = ma7arr[ma7arr.length - 2]
  const prevMa14 = ma14arr[ma14arr.length - 2]
  const prevMa21 = ma21arr[ma21arr.length - 2]

  // EMA10
  const ema10arr = EMA.calculate({ period: 10, values: closes })
  const ema10 = ema10arr[ema10arr.length - 1]
  const lastClose = closes[closes.length - 1]

  // RSI14
  const rsiArr = RSI.calculate({ period: 14, values: closes })
  const rsi = rsiArr[rsiArr.length - 1]
  const prevRsi = rsiArr[rsiArr.length - 2]

  // StochRSI (14,14,k,d)
  const { kArr, dArr } = calcStochRSI(closes, 14, 14, stochSettings.k, stochSettings.d)
  const stochK = kArr[kArr.length - 1]
  const stochD = dArr[dArr.length - 1]
  const prevK  = kArr[kArr.length - 2]
  const prevD  = dArr[dArr.length - 2]

  // WT
  const wt1arr = calcWT(candles)
  const wt1 = wt1arr[wt1arr.length - 1]
  const prevWt1 = wt1arr[wt1arr.length - 2]
  const wt2 = wt1arr.slice(-4).reduce((a, b) => a + b, 0) / 4
  const prevWt2 = wt1arr.slice(-5, -1).reduce((a, b) => a + b, 0) / 4

  // Fisher9
  const { fishArr, trigArr } = calcFisher9(candles)
  const fisher = fishArr[fishArr.length - 1]
  const fisherTrigger = trigArr[trigArr.length - 1]
  const prevFisher = fishArr[fishArr.length - 2]
  const prevFisherTrig = trigArr[trigArr.length - 2]

  // Hacim (20 mum ortalaması)
  const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
  const volume = volumes[volumes.length - 1]

  // Sinyal koşulları
  const stochRsiSignal = prevK < 25 && prevK < prevD && stochK > stochD
  const ema10Signal    = lastClose > ema10
  const wtSignal       = prevWt1 < prevWt2 && wt1 > wt2 && prevWt1 < -60
  const fisherSignal   = prevFisher < prevFisherTrig && fisher > fisherTrigger && prevFisher < 0

  const goldenCross     = prevMa7 < prevMa21 && ma7 > ma21
  const halfGoldenCross = prevMa7 < prevMa14 && ma7 > ma14

  const belowMa7  = lastClose < ma7
  const belowMa14 = lastClose < ma14
  const maBelowWarning = belowMa7 || belowMa14
  const maBelowWhich = belowMa7 && belowMa14 ? 'MA7 ve MA14' : belowMa7 ? 'MA7' : belowMa14 ? 'MA14' : ''

  const rsiSignal = prevRsi < 40 && rsi > prevRsi

  return {
    stochRsiSignal, stochRsiK: stochK, stochRsiD: stochD, stochRsiPrevK: prevK, stochRsiPrevD: prevD,
    ema10Signal, ema10,
    wtSignal, wt1, wt2,
    fisherSignal, fisher, fisherTrigger,
    ma7, ma14, ma21,
    goldenCross, halfGoldenCross, maBelowWarning, maBelowWhich,
    rsi, rsiSignal,
    volume, avgVolume, volumeAboveAvg: volume > avgVolume,
  }
}
