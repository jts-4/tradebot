const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'SUIUSDT', 'HBARUSDT']
const INTERVAL = '4h'
const LIMIT = 1000
const STARTING_EQUITY = 10000
const RISK_PER_TRADE = 0.015
const SL_MULT = 3.5
const TP_RATIO = 4.0
const COMMISSION = 0.001

async function fetchCandles(symbol) {
  const res = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${INTERVAL}&limit=${LIMIT}`)
  const data = await res.json()
  return data.map(k => ({ time: k[0], open: parseFloat(k[1]), high: parseFloat(k[2]), low: parseFloat(k[3]), close: parseFloat(k[4]) }))
}

function ema(values, period) {
  const k = 2 / (period + 1)
  let prev = values[0]
  const result = [prev]
  for (let i = 1; i < values.length; i++) { prev = values[i] * k + prev * (1 - k); result.push(prev) }
  return result
}

function rsiWilder(closes, period = 14) {
  const result = new Array(period).fill(null)
  let avgGain = 0, avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1]
    if (d > 0) avgGain += d; else avgLoss += Math.abs(d)
  }
  avgGain /= period; avgLoss /= period
  result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss))
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? Math.abs(d) : 0)) / period
    result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss))
  }
  return result
}

function atrWilder(candles, period = 14) {
  const trs = [candles[0].high - candles[0].low]
  for (let i = 1; i < candles.length; i++) {
    trs.push(Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - candles[i-1].close), Math.abs(candles[i].low - candles[i-1].close)))
  }
  const result = new Array(period - 1).fill(null)
  let prev = trs.slice(0, period).reduce((a, b) => a + b, 0) / period
  result.push(prev)
  for (let i = period; i < trs.length; i++) { prev = (prev * (period - 1) + trs[i]) / period; result.push(prev) }
  return result
}

function backtestSymbol(candles, startEquity) {
  const closes = candles.map(c => c.close)
  const ema21 = ema(closes, 21)
  const ema50 = ema(closes, 50)
  const ema200 = ema(closes, 200)
  const rsi14 = rsiWilder(closes, 14)
  const atr14 = atrWilder(candles, 14)
  const trades = []
  let equity = startEquity

  for (let i = 201; i < candles.length - 1; i++) {
    if (!rsi14[i] || !atr14[i]) continue
    const bullRegime = ema50[i] > ema200[i]
    const bearRegime = ema50[i] < ema200[i]
    const crossUp = closes[i-1] < ema21[i-1] && closes[i] > ema21[i]
    const crossDown = closes[i-1] > ema21[i-1] && closes[i] < ema21[i]
    const isLong = crossUp && rsi14[i] > 52 && bullRegime
    const isShort = crossDown && rsi14[i] < 48 && bearRegime
    if (!isLong && !isShort) continue

    const entry = closes[i]
    const stopDist = SL_MULT * atr14[i]
    const stop = isLong ? entry - stopDist : entry + stopDist
    const target = isLong ? entry + stopDist * TP_RATIO : entry - stopDist * TP_RATIO
    const qty = (equity * RISK_PER_TRADE) / stopDist
    const comm = qty * entry * COMMISSION * 2

    let exitPL = null, exitReason = null, exitBars = 0
    for (let j = i + 1; j < candles.length; j++) {
      const c = candles[j]
      const regimeFlip = isLong ? ema50[j] < ema200[j] : ema50[j] > ema200[j]
      if (isLong) {
        if (c.low <= stop)    { exitPL = (stop - entry) * qty - comm;   exitReason = 'SL';     exitBars = j-i; break }
        if (c.high >= target) { exitPL = (target - entry) * qty - comm; exitReason = 'TP';     exitBars = j-i; break }
        if (regimeFlip)       { exitPL = (c.close - entry) * qty - comm; exitReason = 'REGIME'; exitBars = j-i; break }
      } else {
        if (c.high >= stop)   { exitPL = (entry - stop) * qty - comm;   exitReason = 'SL';     exitBars = j-i; break }
        if (c.low <= target)  { exitPL = (entry - target) * qty - comm; exitReason = 'TP';     exitBars = j-i; break }
        if (regimeFlip)       { exitPL = (entry - c.close) * qty - comm; exitReason = 'REGIME'; exitBars = j-i; break }
      }
    }
    if (exitPL !== null) {
      equity += exitPL
      trades.push({ side: isLong ? 'LONG' : 'SHORT', exitPL, exitReason, exitBars })
      i += exitBars
    }
  }
  return { trades, finalEquity: equity }
}

async function main() {
  console.log(`EMA21 kesişim + RSI52/48 + EMA50>200 rejim | SL ${SL_MULT}×ATR TP ${TP_RATIO}×RR Risk %${RISK_PER_TRADE*100}\n`)
  let totalTrades = 0, totalWins = 0, totalPL = 0, combinedFinal = 0

  for (const symbol of SYMBOLS) {
    const candles = await fetchCandles(symbol)
    const { trades, finalEquity } = backtestSymbol(candles, STARTING_EQUITY)
    const wins = trades.filter(t => t.exitPL > 0).length
    const pl = finalEquity - STARTING_EQUITY
    const pf = (() => {
      const gw = trades.filter(t => t.exitPL > 0).reduce((s,t) => s+t.exitPL, 0)
      const gl = Math.abs(trades.filter(t => t.exitPL <= 0).reduce((s,t) => s+t.exitPL, 0))
      return gl > 0 ? (gw/gl).toFixed(2) : gw > 0 ? '999' : '0'
    })()
    const tp = trades.filter(t => t.exitReason==='TP').length
    const sl = trades.filter(t => t.exitReason==='SL').length
    const rg = trades.filter(t => t.exitReason==='REGIME').length
    console.log(`${symbol}: ${trades.length} işlem %${trades.length?Math.round(wins/trades.length*100):0} win PF:${pf} P&L:$${pl.toFixed(2)} [TP:${tp} SL:${sl} REJ:${rg}]`)
    totalTrades += trades.length; totalWins += wins; totalPL += pl; combinedFinal += finalEquity
  }

  const weeks = (LIMIT * 4) / 168
  const totalCapital = STARTING_EQUITY * SYMBOLS.length
  const weeklyPct = (totalPL / totalCapital / weeks * 100).toFixed(2)
  const returnPct = (totalPL / totalCapital * 100).toFixed(1)
  console.log(`\n=== TOPLAM (${SYMBOLS.length} sembol × $${STARTING_EQUITY}) ===`)
  console.log(`İşlem: ${totalTrades} | Win Rate: %${totalTrades?Math.round(totalWins/totalTrades*100):0}`)
  console.log(`Toplam P&L: $${totalPL.toFixed(2)} | Getiri: %${returnPct}`)
  console.log(`Haftalık ort: %${weeklyPct}`)
  console.log(`$${totalCapital} → $${combinedFinal.toFixed(2)}`)
}

main()
