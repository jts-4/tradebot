const SYMBOL = 'BTCUSDT'
const STARTING_EQUITY = 10000
const RISK = 0.03
const COMMISSION = 0.001
const SL_MULTS = [1.5, 2, 2.5, 3]
const TP_RATIOS = [1.5, 2, 2.5, 3, 4]

async function fetchCandles(symbol, interval, limit = 1000) {
  const res = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`)
  const data = await res.json()
  return data.map(k => ({ time: Number(k[0]), open: parseFloat(k[1]), high: parseFloat(k[2]), low: parseFloat(k[3]), close: parseFloat(k[4]) }))
}

function emaCalc(values, period) {
  const k = 2 / (period + 1)
  let prev = values[0]
  const r = [prev]
  for (let i = 1; i < values.length; i++) { prev = values[i] * k + prev * (1 - k); r.push(prev) }
  return r
}

function rsiCalc(closes, period = 14) {
  const r = new Array(period).fill(null)
  let ag = 0, al = 0
  for (let i = 1; i <= period; i++) { const d = closes[i] - closes[i-1]; d > 0 ? ag += d : al += Math.abs(d) }
  ag /= period; al /= period
  r.push(al === 0 ? 100 : 100 - 100 / (1 + ag / al))
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i-1]
    ag = (ag * (period-1) + (d > 0 ? d : 0)) / period
    al = (al * (period-1) + (d < 0 ? Math.abs(d) : 0)) / period
    r.push(al === 0 ? 100 : 100 - 100 / (1 + ag / al))
  }
  return r
}

function atrCalc(candles, period = 14) {
  const trs = [candles[0].high - candles[0].low]
  for (let i = 1; i < candles.length; i++)
    trs.push(Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - candles[i-1].close), Math.abs(candles[i].low - candles[i-1].close)))
  const r = new Array(period - 1).fill(null)
  let prev = trs.slice(0, period).reduce((a, b) => a + b, 0) / period
  r.push(prev)
  for (let i = period; i < trs.length; i++) { prev = (prev * (period-1) + trs[i]) / period; r.push(prev) }
  return r
}

function wtSignals(candles, n1 = 10, n2 = 21) {
  const hlc3 = candles.map(c => (c.high + c.low + c.close) / 3)
  const esa = emaCalc(hlc3, n1)
  const d = esa.map((v, i) => Math.abs(hlc3[i] - v))
  const de = emaCalc(d, n1)
  const ci = esa.map((v, i) => (hlc3[i] - v) / (0.015 * (de[i] || 0.0001)))
  const wt1 = emaCalc(ci, n2)
  const wt2 = wt1.map((_, i) => i < 3 ? wt1[i] : (wt1[i] + wt1[i-1] + wt1[i-2] + wt1[i-3]) / 4)
  const crossUps = []
  for (let i = 1; i < candles.length; i++)
    if (wt1[i-1] < wt2[i-1] && wt1[i] > wt2[i]) crossUps.push(candles[i].time)
  return crossUps
}

function backtest(candles1h, wtCrossUps, tpRatio, exitMode, slMult) {
  const closes = candles1h.map(c => c.close)
  const ema11 = emaCalc(closes, 11)
  const rsi = rsiCalc(closes)
  const atr = atrCalc(candles1h)
  const barMs = 60 * 60 * 1000

  const results = []
  let equity = STARTING_EQUITY

  for (let i = 20; i < candles1h.length - 1; i++) {
    if (!rsi[i] || !atr[i]) continue

    const ema11CrossUp = closes[i-1] < ema11[i-1] && closes[i] > ema11[i]
    const rsiWasBelow38 = rsi[i-1] < 38 || rsi[i-2] < 38 || rsi[i-3] < 38
    const rsiTurningUp = rsi[i] > rsi[i-1]
    if (!ema11CrossUp || !rsiWasBelow38 || !rsiTurningUp) continue

    // Son 5 mum içinde alt TF WT sinyali var mı?
    const candleStart = candles1h[Math.max(0, i-4)].time
    const candleEnd = candles1h[i].time + barMs
    const wtInBar = wtCrossUps.some(t => t >= candleStart && t < candleEnd)
    if (!wtInBar) continue

    const entry = closes[i]
    const stopDist = slMult * atr[i]
    const stop = entry - stopDist
    const target = entry + stopDist * tpRatio
    const qty = (equity * RISK) / stopDist
    const comm = qty * entry * COMMISSION * 2

    let exitPL = null, exitBars = 0, exitReason = null

    for (let j = i + 1; j < candles1h.length; j++) {
      const c = candles1h[j]
      const futureEma11 = emaCalc(closes.slice(0, j + 1), 11)
      const lastEma11 = futureEma11[futureEma11.length - 1]

      if (c.low <= stop) { exitPL = (stop - entry) * qty - comm; exitReason = 'SL'; exitBars = j - i; break }
      if (exitMode === 'rr' && c.high >= target) { exitPL = (target - entry) * qty - comm; exitReason = 'TP'; exitBars = j - i; break }
      if (exitMode === 'ema11' && c.close < lastEma11) { exitPL = (c.close - entry) * qty - comm; exitReason = 'EMA11'; exitBars = j - i; break }
    }

    if (exitPL !== null) {
      equity += exitPL
      results.push({ pl: exitPL, bars: exitBars, reason: exitReason })
      i += exitBars
    }
  }

  const wins = results.filter(r => r.pl > 0).length
  const gw = results.filter(r => r.pl > 0).reduce((s, r) => s + r.pl, 0)
  const gl = Math.abs(results.filter(r => r.pl <= 0).reduce((s, r) => s + r.pl, 0))
  return {
    trades: results.length,
    wins,
    winRate: results.length > 0 ? Math.round(wins / results.length * 100) : 0,
    pf: gl > 0 ? parseFloat((gw / gl).toFixed(2)) : gw > 0 ? 999 : 0,
    realPL: parseFloat((equity - STARTING_EQUITY).toFixed(2)),
  }
}

async function main() {
  console.log('Veri çekiliyor...')
  const [candles1h, candles30m, candles15m] = await Promise.all([
    fetchCandles(SYMBOL, '1h', 1000),
    fetchCandles(SYMBOL, '30m', 2000),
    fetchCandles(SYMBOL, '15m', 3000),
  ])

  const wt30m = wtSignals(candles30m)
  const wt15m = wtSignals(candles15m)
  const wtBoth = wt30m.filter(t => wt15m.some(t2 => Math.abs(t2 - t) <= 30 * 60 * 1000))

  console.log(`30m WT sinyali: ${wt30m.length} | 15m WT sinyali: ${wt15m.length} | İkisi birden: ${wtBoth.length}\n`)

  const scenarios = [
    { name: '30m WT', crossUps: wt30m },
    { name: '15m WT', crossUps: wt15m },
    { name: '30m + 15m ikisi', crossUps: wtBoth },
  ]

  for (const s of scenarios) {
    console.log(`=== ${s.name} ===`)
    let best = { label: '-', pf: 0, realPL: 0, winRate: 0, trades: 0 }

    for (const sl of SL_MULTS) {
      const r1 = backtest(candles1h, s.crossUps, 0, 'ema11', sl)
      const l1 = `SL${sl}x EMA11`
      console.log(`  ${l1}: ${r1.trades} işlem %${r1.winRate} win PF:${r1.pf} P&L:$${r1.realPL}`)
      if (r1.pf > best.pf && r1.trades >= 3) best = { label: l1, ...r1 }

      for (const tp of TP_RATIOS) {
        const r = backtest(candles1h, s.crossUps, tp, 'rr', sl)
        const l = `SL${sl}x TP${tp}xRR`
        console.log(`  ${l}: ${r.trades} işlem %${r.winRate} win PF:${r.pf} P&L:$${r.realPL}`)
        if (r.pf > best.pf && r.trades >= 3) best = { label: l, ...r }
      }
    }
    console.log(`  → EN İYİ: ${best.label} | PF:${best.pf} P&L:$${best.realPL} %${best.winRate} win\n`)
  }
}

main()
