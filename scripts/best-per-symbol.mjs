// Tüm stratejiler × tüm semboller karşılaştırma
// Her sembol için en iyi stratejiyi bul

const SYMBOLS = ['ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'SUIUSDT', 'HBARUSDT']
const INTERVAL = '4h'
const LIMIT = 1000
const STARTING_EQUITY = 10000
const RISK = 0.03
const COMMISSION = 0.001

async function fetchCandles(symbol) {
  const res = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${INTERVAL}&limit=${LIMIT}`)
  const data = await res.json()
  return data.map(k => ({ time: k[0], open: parseFloat(k[1]), high: parseFloat(k[2]), low: parseFloat(k[3]), close: parseFloat(k[4]) }))
}

// --- İndikatörler ---
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

function wtCalc(candles, n1 = 10, n2 = 21) {
  const hlc3 = candles.map(c => (c.high + c.low + c.close) / 3)
  // EMA hesabı candle sayısı kadar değer döndürür (padding yok)
  const esa = emaCalc(hlc3, n1)
  const d = esa.map((v, i) => Math.abs(hlc3[i] - v))
  const de = emaCalc(d, n1)
  const ci = esa.map((v, i) => (hlc3[i] - v) / (0.015 * (de[i] || 0.0001)))
  const wt1 = emaCalc(ci, n2)
  // wt2 = 4-period SMA of wt1, aynı uzunlukta
  const wt2 = wt1.map((_, i) => i < 3 ? wt1[i] : (wt1[i] + wt1[i-1] + wt1[i-2] + wt1[i-3]) / 4)
  // Her ikisi de candles.length uzunluğunda
  return { wt1, wt2 }
}

function fisherCalc(candles, period = 9) {
  const fish = [], trig = []
  let pf = 0, pv = 0
  for (let i = period - 1; i < candles.length; i++) {
    const sl = candles.slice(i - period + 1, i + 1)
    const hi = Math.max(...sl.map(c => c.high)), lo = Math.min(...sl.map(c => c.low))
    const hl2 = (candles[i].high + candles[i].low) / 2
    let v = (hi - lo) > 0 ? 2 * ((hl2 - lo) / (hi - lo)) - 1 : 0
    v = Math.max(-0.999, Math.min(0.999, 0.66 * v + 0.67 * pv))
    const f = 0.5 * Math.log((1 + v) / (1 - v)) + 0.5 * pf
    fish.push(f); trig.push(pf); pf = f; pv = v
  }
  return { fish, trig }
}

// --- Çıkış fonksiyonu ---
function findExit(candles, closes, i, isLong, stop, target, slMult, atr14, equity) {
  const qty = (equity * RISK) / (slMult * atr14[i])
  const comm = qty * closes[i] * COMMISSION * 2
  const ema11all = emaCalc(closes, 11)
  const { fish, trig } = fisherCalc(candles)
  const fishOffset = candles.length - fish.length

  for (let j = i + 1; j < candles.length; j++) {
    const c = candles[j]
    const fi = j - fishOffset
    const fisherExit = fi > 0 && (isLong ? fish[fi-1] > trig[fi-1] && fish[fi] < trig[fi] : fish[fi-1] < trig[fi-1] && fish[fi] > trig[fi])
    const ema11Exit = isLong && c.close < ema11all[j]

    if (isLong) {
      if (c.low <= stop)    return { pl: (stop - closes[i]) * qty - comm, bars: j - i, reason: 'SL' }
      if (c.high >= target) return { pl: (target - closes[i]) * qty - comm, bars: j - i, reason: 'TP' }
      if (fisherExit || ema11Exit) return { pl: (c.close - closes[i]) * qty - comm, bars: j - i, reason: 'EXIT' }
    } else {
      if (c.high >= stop)   return { pl: (closes[i] - stop) * qty - comm, bars: j - i, reason: 'SL' }
      if (c.low <= target)  return { pl: (closes[i] - target) * qty - comm, bars: j - i, reason: 'TP' }
      if (fisherExit)       return { pl: (closes[i] - c.close) * qty - comm, bars: j - i, reason: 'EXIT' }
    }
  }
  return null
}

function stats(trades) {
  if (trades.length === 0) return { trades: 0, wins: 0, winRate: 0, pf: 0, realPL: 0, avgBars: 0 }
  const wins = trades.filter(t => t.pl > 0).length
  const gw = trades.filter(t => t.pl > 0).reduce((s, t) => s + t.pl, 0)
  const gl = Math.abs(trades.filter(t => t.pl <= 0).reduce((s, t) => s + t.pl, 0))
  return {
    trades: trades.length,
    wins,
    winRate: Math.round(wins / trades.length * 100),
    pf: gl > 0 ? parseFloat((gw / gl).toFixed(2)) : gw > 0 ? 999 : 0,
    realPL: parseFloat(trades.reduce((s, t) => s + t.pl, 0).toFixed(2)),
    avgBars: Math.round(trades.reduce((s, t) => s + t.bars, 0) / trades.length),
  }
}

// === STRATEJİLER ===

// S1: WT + RSI + EMA11 + EMA50/200 filtre (mevcut v3)
function s1_WT_RSI_EMA11_EMAFilter(candles, slMult = 2, tpRatio = 2) {
  const closes = candles.map(c => c.close)
  const ema11 = emaCalc(closes, 11)
  const ema50 = emaCalc(closes, 50)
  const ema200 = emaCalc(closes, 200)
  const rsi = rsiCalc(closes)
  const atr = atrCalc(candles)
  const wt = wtCalc(candles)
  const trades = []
  let equity = STARTING_EQUITY

  for (let i = 210; i < candles.length - 1; i++) {
    if (!rsi[i] || !atr[i]) continue
    const crossUp = closes[i-1] < ema11[i-1] && closes[i] > ema11[i]
    const crossDown = closes[i-1] > ema11[i-1] && closes[i] < ema11[i]
    const rsiUp = rsi[i-1] < 50 && rsi[i] >= 50
    const rsiDown = rsi[i-1] > 50 && rsi[i] <= 50
    const wtUp = wt.wt1[i-1] < wt.wt2[i-1] && wt.wt1[i] > wt.wt2[i]
    const wtDown = wt.wt1[i-1] > wt.wt2[i-1] && wt.wt1[i] < wt.wt2[i]
    const bull = closes[i] > ema50[i] && closes[i] > ema200[i]
    const bear = closes[i] < ema50[i] && closes[i] < ema200[i]
    const isLong = wtUp && rsiUp && crossUp && bull
    const isShort = wtDown && rsiDown && crossDown && bear
    if (!isLong && !isShort) continue
    const stopDist = slMult * atr[i]
    const stop = isLong ? closes[i] - stopDist : closes[i] + stopDist
    const target = isLong ? closes[i] + stopDist * tpRatio : closes[i] - stopDist * tpRatio
    const exit = findExit(candles, closes, i, isLong, stop, target, slMult, atr, equity)
    if (exit) { equity += exit.pl; trades.push(exit); i += exit.bars }
  }
  return stats(trades)
}

// S2: WT + RSI + EMA11 (filtre yok)
function s2_WT_RSI_EMA11(candles, slMult = 2, tpRatio = 2) {
  const closes = candles.map(c => c.close)
  const ema11 = emaCalc(closes, 11)
  const rsi = rsiCalc(closes)
  const atr = atrCalc(candles)
  const wt = wtCalc(candles)
  const trades = []
  let equity = STARTING_EQUITY

  for (let i = 50; i < candles.length - 1; i++) {
    if (!rsi[i] || !atr[i]) continue
    const crossUp = closes[i-1] < ema11[i-1] && closes[i] > ema11[i]
    const crossDown = closes[i-1] > ema11[i-1] && closes[i] < ema11[i]
    const rsiUp = rsi[i-1] < 50 && rsi[i] >= 50
    const rsiDown = rsi[i-1] > 50 && rsi[i] <= 50
    const wtUp = wt.wt1[i-1] < wt.wt2[i-1] && wt.wt1[i] > wt.wt2[i]
    const wtDown = wt.wt1[i-1] > wt.wt2[i-1] && wt.wt1[i] < wt.wt2[i]
    const isLong = wtUp && rsiUp && crossUp
    const isShort = wtDown && rsiDown && crossDown
    if (!isLong && !isShort) continue
    const stopDist = slMult * atr[i]
    const stop = isLong ? closes[i] - stopDist : closes[i] + stopDist
    const target = isLong ? closes[i] + stopDist * tpRatio : closes[i] - stopDist * tpRatio
    const exit = findExit(candles, closes, i, isLong, stop, target, slMult, atr, equity)
    if (exit) { equity += exit.pl; trades.push(exit); i += exit.bars }
  }
  return stats(trades)
}

// S3: WT + Fisher + EMA11 + EMA50/200 filtre
function s3_WT_Fisher_EMA11_EMAFilter(candles, slMult = 2, tpRatio = 2) {
  const closes = candles.map(c => c.close)
  const ema11 = emaCalc(closes, 11)
  const ema50 = emaCalc(closes, 50)
  const ema200 = emaCalc(closes, 200)
  const atr = atrCalc(candles)
  const wt = wtCalc(candles)
  const { fish, trig } = fisherCalc(candles)
  const fishOffset = candles.length - fish.length
  const trades = []
  let equity = STARTING_EQUITY

  for (let i = 210; i < candles.length - 1; i++) {
    if (!atr[i]) continue
    const fi = i - fishOffset
    if (fi < 1) continue
    const crossUp = closes[i-1] < ema11[i-1] && closes[i] > ema11[i]
    const crossDown = closes[i-1] > ema11[i-1] && closes[i] < ema11[i]
    const wtUp = wt.wt1[i-1] < wt.wt2[i-1] && wt.wt1[i] > wt.wt2[i]
    const wtDown = wt.wt1[i-1] > wt.wt2[i-1] && wt.wt1[i] < wt.wt2[i]
    const fishUp = fish[fi-1] < trig[fi-1] && fish[fi] > trig[fi]
    const fishDown = fish[fi-1] > trig[fi-1] && fish[fi] < trig[fi]
    const bull = closes[i] > ema50[i] && closes[i] > ema200[i]
    const bear = closes[i] < ema50[i] && closes[i] < ema200[i]
    const isLong = wtUp && fishUp && crossUp && bull
    const isShort = wtDown && fishDown && crossDown && bear
    if (!isLong && !isShort) continue
    const stopDist = slMult * atr[i]
    const stop = isLong ? closes[i] - stopDist : closes[i] + stopDist
    const target = isLong ? closes[i] + stopDist * tpRatio : closes[i] - stopDist * tpRatio
    const exit = findExit(candles, closes, i, isLong, stop, target, slMult, atr, equity)
    if (exit) { equity += exit.pl; trades.push(exit); i += exit.bars }
  }
  return stats(trades)
}

// S4: WT + Fisher + RSI + EMA11 (4/4 hepsi)
function s4_WT_Fisher_RSI_EMA11(candles, slMult = 2, tpRatio = 2) {
  const closes = candles.map(c => c.close)
  const ema11 = emaCalc(closes, 11)
  const rsi = rsiCalc(closes)
  const atr = atrCalc(candles)
  const wt = wtCalc(candles)
  const { fish, trig } = fisherCalc(candles)
  const fishOffset = candles.length - fish.length
  const trades = []
  let equity = STARTING_EQUITY

  for (let i = 50; i < candles.length - 1; i++) {
    if (!rsi[i] || !atr[i]) continue
    const fi = i - fishOffset
    if (fi < 1) continue
    const crossUp = closes[i-1] < ema11[i-1] && closes[i] > ema11[i]
    const crossDown = closes[i-1] > ema11[i-1] && closes[i] < ema11[i]
    const rsiUp = rsi[i-1] < 50 && rsi[i] >= 50
    const rsiDown = rsi[i-1] > 50 && rsi[i] <= 50
    const wtUp = wt.wt1[i-1] < wt.wt2[i-1] && wt.wt1[i] > wt.wt2[i]
    const wtDown = wt.wt1[i-1] > wt.wt2[i-1] && wt.wt1[i] < wt.wt2[i]
    const fishUp = fish[fi-1] < trig[fi-1] && fish[fi] > trig[fi]
    const fishDown = fish[fi-1] > trig[fi-1] && fish[fi] < trig[fi]
    const isLong = wtUp && fishUp && rsiUp && crossUp
    const isShort = wtDown && fishDown && rsiDown && crossDown
    if (!isLong && !isShort) continue
    const stopDist = slMult * atr[i]
    const stop = isLong ? closes[i] - stopDist : closes[i] + stopDist
    const target = isLong ? closes[i] + stopDist * tpRatio : closes[i] - stopDist * tpRatio
    const exit = findExit(candles, closes, i, isLong, stop, target, slMult, atr, equity)
    if (exit) { equity += exit.pl; trades.push(exit); i += exit.bars }
  }
  return stats(trades)
}

// S5: Fisher + RSI + EMA11 (WT yok)
function s5_Fisher_RSI_EMA11(candles, slMult = 2, tpRatio = 2) {
  const closes = candles.map(c => c.close)
  const ema11 = emaCalc(closes, 11)
  const rsi = rsiCalc(closes)
  const atr = atrCalc(candles)
  const { fish, trig } = fisherCalc(candles)
  const fishOffset = candles.length - fish.length
  const trades = []
  let equity = STARTING_EQUITY

  for (let i = 50; i < candles.length - 1; i++) {
    if (!rsi[i] || !atr[i]) continue
    const fi = i - fishOffset
    if (fi < 1) continue
    const crossUp = closes[i-1] < ema11[i-1] && closes[i] > ema11[i]
    const crossDown = closes[i-1] > ema11[i-1] && closes[i] < ema11[i]
    const rsiUp = rsi[i-1] < 50 && rsi[i] >= 50
    const rsiDown = rsi[i-1] > 50 && rsi[i] <= 50
    const fishUp = fish[fi-1] < trig[fi-1] && fish[fi] > trig[fi]
    const fishDown = fish[fi-1] > trig[fi-1] && fish[fi] < trig[fi]
    const isLong = fishUp && rsiUp && crossUp
    const isShort = fishDown && rsiDown && crossDown
    if (!isLong && !isShort) continue
    const stopDist = slMult * atr[i]
    const stop = isLong ? closes[i] - stopDist : closes[i] + stopDist
    const target = isLong ? closes[i] + stopDist * tpRatio : closes[i] - stopDist * tpRatio
    const exit = findExit(candles, closes, i, isLong, stop, target, slMult, atr, equity)
    if (exit) { equity += exit.pl; trades.push(exit); i += exit.bars }
  }
  return stats(trades)
}

async function main() {
  const strategies = [
    { name: 'S1: WT+RSI+EMA11+EMAFilter', fn: s1_WT_RSI_EMA11_EMAFilter },
    { name: 'S2: WT+RSI+EMA11', fn: s2_WT_RSI_EMA11 },
    { name: 'S3: WT+Fisher+EMA11+EMAFilter', fn: s3_WT_Fisher_EMA11_EMAFilter },
    { name: 'S4: WT+Fisher+RSI+EMA11', fn: s4_WT_Fisher_RSI_EMA11 },
    { name: 'S5: Fisher+RSI+EMA11', fn: s5_Fisher_RSI_EMA11 },
  ]

  const bestPerSymbol = {}

  for (const symbol of SYMBOLS) {
    console.log(`\n=== ${symbol} ===`)
    const candles = await fetchCandles(symbol)
    let best = { name: '', pf: 0, realPL: 0 }

    for (const s of strategies) {
      const r = s.fn(candles)
      const marker = r.pf > best.pf && r.trades >= 3 ? ' ◄' : ''
      if (r.pf > best.pf && r.trades >= 3) best = { name: s.name, pf: r.pf, realPL: r.realPL }
      console.log(`  ${s.name}: ${r.trades} işlem %${r.winRate} win PF:${r.pf} P&L:$${r.realPL}${marker}`)
    }
    bestPerSymbol[symbol] = best
  }

  console.log('\n=== HER SEMBOLİN EN İYİ STRATEJİSİ ===')
  let totalPL = 0
  for (const [sym, b] of Object.entries(bestPerSymbol)) {
    console.log(`${sym}: ${b.name} → PF:${b.pf} P&L:$${b.realPL}`)
    totalPL += b.realPL
  }
  console.log(`\nBTC (S1 sabit): PF:4.59 P&L:$1990.31`)
  console.log(`TOPLAM (BTC dahil): $${(totalPL + 1990.31).toFixed(2)}`)
}

main()
