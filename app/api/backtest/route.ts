import { NextResponse } from 'next/server'
import { EMA, RSI, ATR } from 'technicalindicators'
import { calcWaveTrend, calcFisher } from '@/lib/strategy'
import type { Candle } from '@/lib/strategy'

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'SUIUSDT', 'HBARUSDT']
// 6 ay = ~1080 adet 4h mum
const LIMIT = 1000

const SL_MULTS = [1.5, 2.0, 2.5, 3.0]
const TP_RATIOS = [1.5, 2.0, 2.5, 3.0]

async function fetchCandles(symbol: string): Promise<Candle[]> {
  const res = await fetch(
    `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=4h&limit=${LIMIT}`
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

function backtest(candles: Candle[], slMult: number, tpRatio: number, volumeFilter = false): {
  trades: number; wins: number; winRate: number; profitFactor: number; totalPL: number
} {
  const closes = candles.map(c => c.close)
  const highs = candles.map(c => c.high)
  const lows = candles.map(c => c.low)

  const results: TradeResult[] = []
  let triggerDir: 'LONG' | 'SHORT' | null = null
  let triggerBarIdx: number | null = null
  const LOOKBACK = 3

  for (let i = 50; i < candles.length - 1; i++) {
    const slice = candles.slice(0, i + 1)
    const sliceCloses = closes.slice(0, i + 1)
    const sliceHighs = highs.slice(0, i + 1)
    const sliceLows = lows.slice(0, i + 1)

    const ema11arr = EMA.calculate({ period: 11, values: sliceCloses })
    const atr14arr = ATR.calculate({ period: 14, high: sliceHighs, low: sliceLows, close: sliceCloses })
    const { wt1, wt2, prevWt1, prevWt2 } = calcWaveTrend(slice)

    const lastClose = sliceCloses[sliceCloses.length - 1]
    const prevClose = sliceCloses[sliceCloses.length - 2]
    const lastEma11 = ema11arr[ema11arr.length - 1]
    const prevEma11 = ema11arr[ema11arr.length - 2]
    const lastAtr = atr14arr[atr14arr.length - 1]

    const wtCrossUp = prevWt1 < prevWt2 && wt1 > wt2
    const wtCrossDown = prevWt1 > prevWt2 && wt1 < wt2
    const ema11CrossUp = prevClose < prevEma11 && lastClose > lastEma11
    const ema11CrossDown = prevClose > prevEma11 && lastClose < lastEma11

    if (wtCrossUp) { triggerDir = 'LONG'; triggerBarIdx = i }
    else if (wtCrossDown) { triggerDir = 'SHORT'; triggerBarIdx = i }

    const barsSince = triggerBarIdx !== null ? i - triggerBarIdx : Infinity
    if (barsSince > LOOKBACK) { triggerDir = null; triggerBarIdx = null }

    const isLong = triggerDir === 'LONG' && ema11CrossUp
    const isShort = triggerDir === 'SHORT' && ema11CrossDown

    // Hacim filtresi
    if (volumeFilter) {
      const vols = candles.slice(Math.max(0, i - 20), i).map(c => c.volume)
      const avgVol = vols.reduce((a, b) => a + b, 0) / vols.length
      if (candles[i].volume < avgVol) continue
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
    for (let j = i + 1; j < candles.length; j++) {
      const c = candles[j]
      const futureCloses = closes.slice(0, j + 1)
      const futureEma11 = EMA.calculate({ period: 11, values: futureCloses })
      const futureLastEma11 = futureEma11[futureEma11.length - 1]

      // Fisher çıkış
      const futureSlice = candles.slice(0, j + 1)
      const { fisher, trigger: fishTrig, prevFisher, prevTrigger } = calcFisher(futureSlice)
      const fisherExit = isLong
        ? prevFisher > prevTrigger && fisher < fishTrig
        : prevFisher < prevTrigger && fisher > fishTrig

      // EMA11 çıkış (sadece LONG)
      const ema11Exit = isLong && c.close < futureLastEma11

      if (isLong) {
        if (c.low <= stop) { exitResult = { pl: stop - entry, exit: 'SL' }; break }
        if (c.high >= target) { exitResult = { pl: target - entry, exit: 'TP' }; break }
        if (fisherExit) { exitResult = { pl: c.close - entry, exit: 'FISHER' }; break }
        if (ema11Exit) { exitResult = { pl: c.close - entry, exit: 'EMA11' }; break }
      } else {
        if (c.high >= stop) { exitResult = { pl: entry - stop, exit: 'SL' }; break }
        if (c.low <= target) { exitResult = { pl: entry - target, exit: 'TP' }; break }
        if (fisherExit) { exitResult = { pl: entry - c.close, exit: 'FISHER' }; break }
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

  if (!SYMBOLS.includes(symbol)) {
    return NextResponse.json({ error: 'Geçersiz sembol' }, { status: 400 })
  }

  const candles = await fetchCandles(symbol)

  const results: Record<string, ReturnType<typeof backtest> & { slMult: number; tpRatio: number }> = {}
  const resultsVol: Record<string, ReturnType<typeof backtest> & { slMult: number; tpRatio: number }> = {}
  let best = { key: '', profitFactor: 0 }
  let bestVol = { key: '', profitFactor: 0 }

  for (const sl of SL_MULTS) {
    for (const tp of TP_RATIOS) {
      const key = `SL${sl}xATR_TP${tp}xRR`
      const r = backtest(candles, sl, tp, false)
      const rv = backtest(candles, sl, tp, true)
      results[key] = { ...r, slMult: sl, tpRatio: tp }
      resultsVol[key] = { ...rv, slMult: sl, tpRatio: tp }
      if (r.profitFactor > best.profitFactor && r.trades >= 5) best = { key, profitFactor: r.profitFactor }
      if (rv.profitFactor > bestVol.profitFactor && rv.trades >= 5) bestVol = { key, profitFactor: rv.profitFactor }
    }
  }

  return NextResponse.json({
    symbol,
    candles: candles.length,
    best: best.key,
    bestConfig: results[best.key],
    bestWithVolumeFilter: bestVol.key,
    bestVolumeConfig: resultsVol[bestVol.key],
    current: results[`SL2.5xATR_TP2.5xRR`],
    currentWithVolume: resultsVol[`SL2.5xATR_TP2.5xRR`],
  })
}
