import { NextResponse } from 'next/server'
import { EMA, RSI, ATR } from 'technicalindicators'
import { calcWaveTrend, calcFisher } from '@/lib/strategy'
import type { Candle } from '@/lib/strategy'

const LIMIT = 1500

async function fetchCandles(symbol: string, interval: string): Promise<Candle[]> {
  const res = await fetch(
    `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${LIMIT}`
  )
  const data = await res.json()
  return (data as unknown[][]).map(k => ({
    time: k[0] as number,
    open: parseFloat(k[1] as string),
    high: parseFloat(k[2] as string),
    low: parseFloat(k[3] as string),
    close: parseFloat(k[4] as string),
    volume: parseFloat(k[5] as string),
  }))
}

function calcFVG(candles: Candle[], i: number): { bullFVG: boolean; bearFVG: boolean } {
  if (i < 2) return { bullFVG: false, bearFVG: false }
  return {
    bullFVG: candles[i - 2].high < candles[i].low,
    bearFVG: candles[i - 2].low > candles[i].high,
  }
}

function calcBoS(candles: Candle[], i: number, lookback = 10): { bullBoS: boolean; bearBoS: boolean } {
  if (i < lookback) return { bullBoS: false, bearBoS: false }
  const slice = candles.slice(i - lookback, i)
  const swingHigh = Math.max(...slice.map(c => c.high))
  const swingLow = Math.min(...slice.map(c => c.low))
  return {
    bullBoS: candles[i].close > swingHigh,
    bearBoS: candles[i].close < swingLow,
  }
}

function calcCHoCH(candles: Candle[], i: number, lookback = 20): { bullCHoCH: boolean; bearCHoCH: boolean } {
  if (i < lookback + 5) return { bullCHoCH: false, bearCHoCH: false }
  const prev = calcBoS(candles, i - 5, lookback)
  const curr = calcBoS(candles, i, lookback)
  return {
    bullCHoCH: prev.bearBoS && curr.bullBoS,
    bearCHoCH: prev.bullBoS && curr.bearBoS,
  }
}

function calcOrderBlock(candles: Candle[], i: number, lookback = 5): { bullOB: boolean; bearOB: boolean } {
  if (i < lookback + 2) return { bullOB: false, bearOB: false }
  const slice = candles.slice(i - lookback, i)
  const lastClose = candles[i].close
  let bullOB = false
  let bearOB = false
  for (let k = 0; k < slice.length - 1; k++) {
    const isBearCandle = slice[k].close < slice[k].open
    const nextIsBull = slice[k + 1].close > slice[k + 1].open &&
      (slice[k + 1].close - slice[k + 1].open) > (slice[k].open - slice[k].close) * 1.5
    if (isBearCandle && nextIsBull && lastClose >= slice[k].low && lastClose <= slice[k].high) bullOB = true

    const isBullCandle = slice[k].close > slice[k].open
    const nextIsBear = slice[k + 1].close < slice[k + 1].open &&
      (slice[k + 1].open - slice[k + 1].close) > (slice[k].close - slice[k].open) * 1.5
    if (isBullCandle && nextIsBear && lastClose >= slice[k].low && lastClose <= slice[k].high) bearOB = true
  }
  return { bullOB, bearOB }
}

type CondKey = 'WT' | 'Fisher' | 'RSI' | 'EMA11' | 'FVG' | 'BoS' | 'CHoCH' | 'OB'

const STARTING_EQUITY = 10000
const RISK_PER_TRADE = 0.015
const COMMISSION = 0.001

function backtestCombo(
  candles: Candle[],
  combo: CondKey[],
  slMult: number,
  tpRatio: number,
): { trades: number; wins: number; winRate: number; profitFactor: number; totalPL: number; realPL: number; finalEquity: number; returnPct: number; weeklyReturnPct: number; avgBars: number } {
  const closes = candles.map(c => c.close)
  const highs = candles.map(c => c.high)
  const lows = candles.map(c => c.low)

  const ema11All = EMA.calculate({ period: 11, values: closes })
  const rsi14All = RSI.calculate({ period: 14, values: closes })
  const atr14All = ATR.calculate({ period: 14, high: highs, low: lows, close: closes })

  const ema11Offset = closes.length - ema11All.length
  const rsiOffset = closes.length - rsi14All.length
  const atrOffset = closes.length - atr14All.length

  const results: { pl: number; realPL: number; bars: number }[] = []
  let equity = STARTING_EQUITY

  for (let i = 50; i < candles.length - 1; i++) {
    const slice = candles.slice(0, i + 1)

    const ema11Idx = i - ema11Offset
    const rsiIdx = i - rsiOffset
    const atrIdx = i - atrOffset
    if (ema11Idx < 1 || rsiIdx < 1 || atrIdx < 0) continue

    const lastClose = closes[i]
    const prevClose = closes[i - 1]
    const lastEma11 = ema11All[ema11Idx]
    const prevEma11 = ema11All[ema11Idx - 1]
    const lastRsi = rsi14All[rsiIdx]
    const prevRsi = rsi14All[rsiIdx - 1]
    const lastAtr = atr14All[atrIdx]

    const { wt1, wt2, prevWt1, prevWt2 } = calcWaveTrend(slice)
    const { fisher, trigger: fishTrig, prevFisher, prevTrigger } = calcFisher(slice)
    const { bullFVG, bearFVG } = calcFVG(candles, i)
    const { bullBoS, bearBoS } = calcBoS(candles, i)
    const { bullCHoCH, bearCHoCH } = calcCHoCH(candles, i)
    const { bullOB, bearOB } = calcOrderBlock(candles, i)

    const longSignals: Record<CondKey, boolean> = {
      WT: prevWt1 < prevWt2 && wt1 > wt2,
      Fisher: prevFisher < prevTrigger && fisher > fishTrig,
      RSI: prevRsi < 50 && lastRsi >= 50,
      EMA11: prevClose < prevEma11 && lastClose > lastEma11,
      FVG: bullFVG,
      BoS: bullBoS,
      CHoCH: bullCHoCH,
      OB: bullOB,
    }
    const shortSignals: Record<CondKey, boolean> = {
      WT: prevWt1 > prevWt2 && wt1 < wt2,
      Fisher: prevFisher > prevTrigger && fisher < fishTrig,
      RSI: prevRsi > 50 && lastRsi <= 50,
      EMA11: prevClose > prevEma11 && lastClose < lastEma11,
      FVG: bearFVG,
      BoS: bearBoS,
      CHoCH: bearCHoCH,
      OB: bearOB,
    }

    const isLong = combo.every(k => longSignals[k])
    const isShort = combo.every(k => shortSignals[k])
    if (!isLong && !isShort) continue
    if (isLong && isShort) continue

    const entry = lastClose
    const stopDist = slMult * lastAtr
    const stop = isLong ? entry - stopDist : entry + stopDist
    const target = isLong ? entry + stopDist * tpRatio : entry - stopDist * tpRatio

    let exitResult: { pl: number; realPL: number; bars: number } | null = null
    for (let j = i + 1; j < candles.length; j++) {
      const c = candles[j]
      const futureCloses = closes.slice(0, j + 1)
      const futureEma11 = EMA.calculate({ period: 11, values: futureCloses })
      const futureLastEma11 = futureEma11[futureEma11.length - 1]
      const futureSlice = candles.slice(0, j + 1)
      const { fisher: ff, trigger: ft, prevFisher: pf, prevTrigger: pt } = calcFisher(futureSlice)
      const fisherExit = isLong ? pf > pt && ff < ft : pf < pt && ff > ft
      const ema11Exit = isLong && c.close < futureLastEma11

      const stopDist2 = slMult * ATR.calculate({ period: 14, high: highs.slice(0, j + 1), low: lows.slice(0, j + 1), close: closes.slice(0, j + 1) }).slice(-1)[0]
      const riskAmt = equity * RISK_PER_TRADE
      const qty = riskAmt / (slMult * lastAtr)
      const notional = qty * entry
      const comm = notional * COMMISSION * 2

      const calcRealPL = (pricePL: number) => qty * pricePL - comm

      if (isLong) {
        if (c.low <= stop) { exitResult = { pl: stop - entry, realPL: calcRealPL(stop - entry), bars: j - i }; break }
        if (c.high >= target) { exitResult = { pl: target - entry, realPL: calcRealPL(target - entry), bars: j - i }; break }
        if (fisherExit || ema11Exit) { exitResult = { pl: c.close - entry, realPL: calcRealPL(c.close - entry), bars: j - i }; break }
      } else {
        if (c.high >= stop) { exitResult = { pl: entry - stop, realPL: calcRealPL(entry - stop), bars: j - i }; break }
        if (c.low <= target) { exitResult = { pl: entry - target, realPL: calcRealPL(entry - target), bars: j - i }; break }
        if (fisherExit) { exitResult = { pl: entry - c.close, realPL: calcRealPL(entry - c.close), bars: j - i }; break }
      }
    }
    if (exitResult) {
      equity += exitResult.realPL
      results.push(exitResult)
    }
  }

  const wins = results.filter(r => r.pl > 0).length
  const grossWin = results.filter(r => r.pl > 0).reduce((s, r) => s + r.pl, 0)
  const grossLoss = Math.abs(results.filter(r => r.pl <= 0).reduce((s, r) => s + r.pl, 0))
  const avgBars = results.length > 0 ? Math.round(results.reduce((s, r) => s + r.bars, 0) / results.length) : 0
  const realPL = parseFloat((equity - STARTING_EQUITY).toFixed(2))
  const returnPct = parseFloat(((realPL / STARTING_EQUITY) * 100).toFixed(1))
  // Kaç hafta: candle sayısı × interval saati / 168
  const totalBars = results.length > 0 ? results[results.length - 1].bars : 0
  const weeklyReturnPct = returnPct > 0 && candles.length > 0
    ? parseFloat((returnPct / (candles.length / (168 / 4))).toFixed(2))
    : 0

  return {
    trades: results.length,
    wins,
    winRate: results.length > 0 ? Math.round((wins / results.length) * 100) : 0,
    profitFactor: grossLoss > 0 ? parseFloat((grossWin / grossLoss).toFixed(2)) : grossWin > 0 ? 999 : 0,
    totalPL: parseFloat(results.reduce((s, r) => s + r.pl, 0).toFixed(2)),
    realPL,
    finalEquity: parseFloat(equity.toFixed(2)),
    returnPct,
    weeklyReturnPct,
    avgBars,
  }
}

function getCombinations(arr: CondKey[], size: number): CondKey[][] {
  if (size === 1) return arr.map(x => [x])
  const result: CondKey[][] = []
  for (let i = 0; i <= arr.length - size; i++) {
    const rest = getCombinations(arr.slice(i + 1), size - 1)
    for (const r of rest) result.push([arr[i], ...r])
  }
  return result
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get('symbol') ?? 'BTCUSDT'
  const interval = searchParams.get('interval') ?? '4h'
  const slMult = parseFloat(searchParams.get('sl') ?? '2')
  const tpRatio = parseFloat(searchParams.get('tp') ?? '2')
  const topN = parseInt(searchParams.get('top') ?? '10')

  const candles = await fetchCandles(symbol, interval)

  const ALL_CONDS: CondKey[] = ['WT', 'Fisher', 'RSI', 'EMA11', 'FVG', 'BoS', 'CHoCH', 'OB']
  const allCombos = [
    ...getCombinations(ALL_CONDS, 3),
    ...getCombinations(ALL_CONDS, 4),
  ]

  const results: {
    combo: string
    size: number
    trades: number
    wins: number
    winRate: number
    profitFactor: number
    totalPL: number
    realPL: number
    finalEquity: number
    returnPct: number
    weeklyReturnPct: number
    avgBars: number
  }[] = []

  for (const combo of allCombos) {
    const r = backtestCombo(candles, combo, slMult, tpRatio)
    if (r.trades < 5) continue
    results.push({ combo: combo.join('+'), size: combo.length, ...r })
  }

  results.sort((a, b) => b.profitFactor - a.profitFactor)

  return NextResponse.json({
    symbol,
    interval,
    slMult,
    tpRatio,
    candles: candles.length,
    totalCombos: allCombos.length,
    testedCombos: results.length,
    top: results.slice(0, topN),
  })
}
