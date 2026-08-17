import { NextResponse } from 'next/server'
import { EMA, RSI, ATR } from 'technicalindicators'
import { calcWaveTrend, calcFisher } from '@/lib/strategy'
import type { Candle } from '@/lib/strategy'

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'SUIUSDT', 'HBARUSDT']
const LIMIT = 1000

const SL_MULTS = [1.5, 2.0, 2.5, 3.0]
const TP_RATIOS = [1.5, 2.0, 2.5, 3.0]

async function fetchCandles(symbol: string, interval: string): Promise<Candle[]> {
  const res = await fetch(
    `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${LIMIT}`
  )
  const data = await res.json()
  return data.map((k: unknown[]) => ({
    time: k[0] as number,
    open: parseFloat(k[1] as string),
    high: parseFloat(k[2] as string),
    low: parseFloat(k[3] as string),
    close: parseFloat(k[4] as string),
    volume: parseFloat(k[5] as string),
  }))
}

type TradeResult = { pl: number; exit: 'TP' | 'SL' | 'FISHER' | 'EMA11' }

// Zaman damgasına göre en yakın alt timeframe mumu bul
function findWtAtTime(wtCandles: Candle[], time: number): { wt1: number; wt2: number; prevWt1: number; prevWt2: number } | null {
  const idx = wtCandles.findIndex(c => c.time > time)
  const useIdx = idx === -1 ? wtCandles.length : idx
  if (useIdx < 2) return null
  return calcWaveTrend(wtCandles.slice(0, useIdx))
}

function backtest(candles4h: Candle[], wtCandles: Candle[], slMult: number, tpRatio: number, emaFilter = false, emaPeriod = 11): {
  trades: number; wins: number; winRate: number; profitFactor: number; totalPL: number
} {
  const closes = candles4h.map(c => c.close)
  const highs = candles4h.map(c => c.high)
  const lows = candles4h.map(c => c.low)
  const multiTF = wtCandles !== candles4h

  const results: TradeResult[] = []
  let triggerDir: 'LONG' | 'SHORT' | null = null
  let triggerBarIdx: number | null = null
  const LOOKBACK = 3

  // Önceden WT sinyallerini hesapla (alt TF)
  const wtSignals: { time: number; dir: 'LONG' | 'SHORT' }[] = []
  if (multiTF) {
    for (let i = 50; i < wtCandles.length; i++) {
      const slice = wtCandles.slice(0, i + 1)
      const { wt1, wt2, prevWt1, prevWt2 } = calcWaveTrend(slice)
      if (prevWt1 < prevWt2 && wt1 > wt2) wtSignals.push({ time: wtCandles[i].time, dir: 'LONG' })
      else if (prevWt1 > prevWt2 && wt1 < wt2) wtSignals.push({ time: wtCandles[i].time, dir: 'SHORT' })
    }
  }

  for (let i = 50; i < candles4h.length - 1; i++) {
    const slice = candles4h.slice(0, i + 1)
    const sliceCloses = closes.slice(0, i + 1)
    const sliceHighs = highs.slice(0, i + 1)
    const sliceLows = lows.slice(0, i + 1)
    const currentTime = candles4h[i].time

    const ema11arr = EMA.calculate({ period: emaPeriod, values: sliceCloses })
    const atr14arr = ATR.calculate({ period: 14, high: sliceHighs, low: sliceLows, close: sliceCloses })

    const lastClose = sliceCloses[sliceCloses.length - 1]
    const prevClose = sliceCloses[sliceCloses.length - 2]
    const lastEma11 = ema11arr[ema11arr.length - 1]
    const prevEma11 = ema11arr[ema11arr.length - 2]
    const lastAtr = atr14arr[atr14arr.length - 1]
    const ema11CrossUp = prevClose < prevEma11 && lastClose > lastEma11
    const ema11CrossDown = prevClose > prevEma11 && lastClose < lastEma11

    if (multiTF) {
      // Alt TF'de bu 4h mum içinde WT sinyali var mı?
      const barMs = candles4h[1].time - candles4h[0].time
      const recentWT = wtSignals.find(s => s.time >= currentTime - barMs * LOOKBACK && s.time <= currentTime)
      if (recentWT && triggerDir !== recentWT.dir) { triggerDir = recentWT.dir; triggerBarIdx = i }
    } else {
      const { wt1, wt2, prevWt1, prevWt2 } = calcWaveTrend(slice)
      const wtCrossUp = prevWt1 < prevWt2 && wt1 > wt2
      const wtCrossDown = prevWt1 > prevWt2 && wt1 < wt2
      if (wtCrossUp) { triggerDir = 'LONG'; triggerBarIdx = i }
      else if (wtCrossDown) { triggerDir = 'SHORT'; triggerBarIdx = i }
    }

    const barsSince = triggerBarIdx !== null ? i - triggerBarIdx : Infinity
    if (barsSince > LOOKBACK) { triggerDir = null; triggerBarIdx = null }

    const isLong = triggerDir === 'LONG' && ema11CrossUp
    const isShort = triggerDir === 'SHORT' && ema11CrossDown

    if (emaFilter) {
      const ema50arr = EMA.calculate({ period: 50, values: sliceCloses })
      const ema200arr = EMA.calculate({ period: 200, values: sliceCloses })
      const ema50 = ema50arr[ema50arr.length - 1]
      const ema200 = ema200arr[ema200arr.length - 1]
      if (isLong && (lastClose < ema50 || lastClose < ema200)) continue
      if (isShort && (lastClose > ema50 || lastClose > ema200)) continue
    }

    if (!isLong && !isShort) continue

    const entry = lastClose
    const stopDist = slMult * lastAtr
    const stop = isLong ? entry - stopDist : entry + stopDist
    const target = isLong ? entry + stopDist * tpRatio : entry - stopDist * tpRatio

    triggerDir = null
    triggerBarIdx = null

    // Sonraki mumlarda çıkış ara
    let exitResult: TradeResult | null = null
    for (let j = i + 1; j < candles4h.length; j++) {
      const c = candles4h[j]
      const futureCloses = closes.slice(0, j + 1)
      const futureEma11 = EMA.calculate({ period: emaPeriod, values: futureCloses })
      const futureLastEma11 = futureEma11[futureEma11.length - 1]
      const futureSlice = candles4h.slice(0, j + 1)
      const { fisher, trigger: fishTrig, prevFisher, prevTrigger } = calcFisher(futureSlice)
      const fisherExit = isLong ? prevFisher > prevTrigger && fisher < fishTrig : prevFisher < prevTrigger && fisher > fishTrig
      const ema11Exit = isLong && c.close < futureLastEma11

      // Alt TF WT ters kesişim çıkışı
      let wtExit = false
      if (multiTF) {
        const barMs = candles4h[1].time - candles4h[0].time
        const wtInBar = wtSignals.filter(s => s.time > candles4h[i].time && s.time <= c.time)
        if (isLong && wtInBar.some(s => s.dir === 'SHORT')) wtExit = true
        if (!isLong && wtInBar.some(s => s.dir === 'LONG')) wtExit = true
      }

      if (isLong) {
        if (c.low <= stop) { exitResult = { pl: stop - entry, exit: 'SL' }; break }
        if (c.high >= target) { exitResult = { pl: target - entry, exit: 'TP' }; break }
        if (wtExit || fisherExit) { exitResult = { pl: c.close - entry, exit: 'FISHER' }; break }
        if (ema11Exit) { exitResult = { pl: c.close - entry, exit: 'EMA11' }; break }
      } else {
        if (c.high >= stop) { exitResult = { pl: entry - stop, exit: 'SL' }; break }
        if (c.low <= target) { exitResult = { pl: entry - target, exit: 'TP' }; break }
        if (wtExit || fisherExit) { exitResult = { pl: entry - c.close, exit: 'FISHER' }; break }
      }
    }

    if (exitResult) results.push(exitResult)
  }

  const wins = results.filter(r => r.pl > 0).length
  const grossWin = results.filter(r => r.pl > 0).reduce((s, r) => s + r.pl, 0)
  const grossLoss = Math.abs(results.filter(r => r.pl <= 0).reduce((s, r) => s + r.pl, 0))

  return {
    trades: results.length,
    wins,
    winRate: results.length > 0 ? Math.round((wins / results.length) * 100) : 0,
    profitFactor: grossLoss > 0 ? parseFloat((grossWin / grossLoss).toFixed(2)) : grossWin > 0 ? 999 : 0,
    totalPL: parseFloat(results.reduce((s, r) => s + r.pl, 0).toFixed(2)),
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get('symbol') ?? 'BTCUSDT'
  const wtInterval = searchParams.get('wtInterval') ?? '4h'
  const emaPeriod = parseInt(searchParams.get('emaPeriod') ?? '11')

  if (!SYMBOLS.includes(symbol)) {
    return NextResponse.json({ error: 'Geçersiz sembol' }, { status: 400 })
  }

  const [candles4h, wtCandles] = await Promise.all([
    fetchCandles(symbol, '4h'),
    wtInterval === '4h' ? Promise.resolve(null) : fetchCandles(symbol, wtInterval),
  ])
  const wtCandlesFinal = wtCandles ?? candles4h

  const results: Record<string, ReturnType<typeof backtest> & { slMult: number; tpRatio: number }> = {}
  const resultsEma: Record<string, ReturnType<typeof backtest> & { slMult: number; tpRatio: number }> = {}
  let best = { key: '', profitFactor: 0 }
  let bestEma = { key: '', profitFactor: 0 }

  for (const sl of SL_MULTS) {
    for (const tp of TP_RATIOS) {
      const key = `SL${sl}xATR_TP${tp}xRR`
      const r = backtest(candles4h, wtCandlesFinal, sl, tp, false, emaPeriod)
      const re = backtest(candles4h, wtCandlesFinal, sl, tp, true, emaPeriod)
      results[key] = { ...r, slMult: sl, tpRatio: tp }
      resultsEma[key] = { ...re, slMult: sl, tpRatio: tp }
      if (r.profitFactor > best.profitFactor && r.trades >= 5) best = { key, profitFactor: r.profitFactor }
      if (re.profitFactor > bestEma.profitFactor && re.trades >= 5) bestEma = { key, profitFactor: re.profitFactor }
    }
  }

  return NextResponse.json({
    symbol,
    wtInterval,
    emaPeriod,
    candles4h: candles4h.length,
    wtCandles: wtCandlesFinal.length,
    best: best.key,
    bestConfig: results[best.key],
    bestWithEmaFilter: bestEma.key,
    bestEmaConfig: resultsEma[bestEma.key],
    current: results['SL2xATR_TP2.5xRR'],
    currentWithEma: resultsEma['SL2xATR_TP2.5xRR'],
  })
}
