// StochRSI Satış Sinyali Backtest
// Sinyal: K>75, K önceki D üstünde, şimdi D altına geçti
// Filtreler: EMA10 altı kapanış, T3 aşağı, Bearish Divergence
import YahooFinance from 'yahoo-finance2'
const yf = new YahooFinance()

const SYMBOLS = [
  'THYAO', 'GARAN', 'AKBNK', 'ISCTR', 'TUPRS',
  'YKBNK', 'KCHOL', 'EREGL', 'SAHOL', 'BIMAS',
  'TCELL', 'ASELS', 'SASA', 'ENKAI', 'OYAKC',
  'MGROS', 'ASTOR',
]

function calcSMA(values, period) {
  const result = []
  for (let i = period - 1; i < values.length; i++) {
    const sum = values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0)
    result.push(sum / period)
  }
  return result
}

function calcEMA(values, period) {
  const k = 2 / (period + 1)
  let e = values[0]
  const r = [e]
  for (let i = 1; i < values.length; i++) { e = values[i] * k + e * (1 - k); r.push(e) }
  return r
}

function calcRSI(closes, period = 14) {
  const gains = [], losses = []
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    gains.push(d > 0 ? d : 0); losses.push(d < 0 ? -d : 0)
  }
  const rsi = []
  let ag = gains.slice(0, period).reduce((a, b) => a + b) / period
  let al = losses.slice(0, period).reduce((a, b) => a + b) / period
  rsi.push(al === 0 ? 100 : 100 - 100 / (1 + ag / al))
  for (let i = period; i < gains.length; i++) {
    ag = (ag * (period - 1) + gains[i]) / period
    al = (al * (period - 1) + losses[i]) / period
    rsi.push(al === 0 ? 100 : 100 - 100 / (1 + ag / al))
  }
  return rsi
}

function calcStochRSI(closes, rsiPeriod = 14, stochPeriod = 14, kSmooth = 2, dSmooth = 2) {
  const rsi = calcRSI(closes, rsiPeriod)
  const kRaw = []
  for (let i = stochPeriod - 1; i < rsi.length; i++) {
    const slice = rsi.slice(i - stochPeriod + 1, i + 1)
    const hi = Math.max(...slice), lo = Math.min(...slice)
    kRaw.push(hi === lo ? 50 : ((rsi[i] - lo) / (hi - lo)) * 100)
  }
  const kArr = calcSMA(kRaw, kSmooth)
  const dArr = calcSMA(kArr, dSmooth)
  return { kArr, dArr }
}

function calcT3(closes, period = 7, b = 0.7) {
  const c1 = -(b * b * b)
  const c2 = 3 * b * b + 3 * b * b * b
  const c3 = -6 * b * b - 3 * b - 3 * b * b * b
  const c4 = 1 + 3 * b + b * b * b + 3 * b * b
  const e1 = calcEMA(closes, period)
  const e2 = calcEMA(e1, period)
  const e3 = calcEMA(e2, period)
  const e4 = calcEMA(e3, period)
  const e5 = calcEMA(e4, period)
  const e6 = calcEMA(e5, period)
  const n = e6.length
  const tail = arr => arr.length >= n ? arr.slice(arr.length - n) : [...Array(n - arr.length).fill(NaN), ...arr]
  const a3 = tail(e3), a4 = tail(e4), a5 = tail(e5)
  return e6.map((v6, i) => c1 * v6 + c2 * a5[i] + c3 * a4[i] + c4 * a3[i])
}

function calcMACD(closes) {
  const fast = calcEMA(closes, 12), slow = calcEMA(closes, 26)
  const len = Math.min(fast.length, slow.length)
  const macdLine = fast.slice(fast.length - len).map((v, i) => v - slow[slow.length - len + i])
  const signal = calcEMA(macdLine, 9)
  const hist = macdLine.slice(macdLine.length - signal.length).map((v, i) => v - signal[i])
  return { macdLine: macdLine.slice(macdLine.length - signal.length), hist }
}

function calcStochastic(candles, period = 14, smooth = 3) {
  const kRaw = []
  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1)
    const hi = Math.max(...slice.map(c => c.high))
    const lo = Math.min(...slice.map(c => c.low))
    kRaw.push(hi === lo ? 50 : ((candles[i].close - lo) / (hi - lo)) * 100)
  }
  return calcSMA(kRaw, smooth)
}

function calcCCI(candles, period = 10) {
  const tp = candles.map(c => (c.high + c.low + c.close) / 3)
  const result = []
  for (let i = period - 1; i < tp.length; i++) {
    const slice = tp.slice(i - period + 1, i + 1)
    const mean = slice.reduce((a, b) => a + b) / period
    const md = slice.reduce((a, b) => a + Math.abs(b - mean), 0) / period
    result.push(md === 0 ? 0 : (tp[i] - mean) / (0.015 * md))
  }
  return result
}

function calcMomentum(closes, period = 10) {
  return closes.slice(period).map((v, i) => v - closes[i])
}

function calcOBV(candles) {
  const obv = [0]
  for (let i = 1; i < candles.length; i++) {
    const prev = obv[obv.length - 1]
    if (candles[i].close > candles[i - 1].close) obv.push(prev + candles[i].volume)
    else if (candles[i].close < candles[i - 1].close) obv.push(prev - candles[i].volume)
    else obv.push(prev)
  }
  return obv
}

function calcCMF(candles, period = 21) {
  const result = []
  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1)
    let cmfv = 0, vol = 0
    for (const c of slice) {
      const range = c.high - c.low
      cmfv += (range > 0 ? ((c.close - c.low) - (c.high - c.close)) / range : 0) * c.volume
      vol += c.volume
    }
    result.push(vol > 0 ? cmfv / vol : 0)
  }
  return result
}

function calcMFI(candles, period = 14) {
  const tp = candles.map(c => (c.high + c.low + c.close) / 3)
  const result = []
  for (let i = period; i < candles.length; i++) {
    let pos = 0, neg = 0
    for (let j = i - period + 1; j <= i; j++) {
      const mf = tp[j] * candles[j].volume
      if (tp[j] > tp[j - 1]) pos += mf; else neg += mf
    }
    result.push(neg === 0 ? 100 : 100 - 100 / (1 + pos / neg))
  }
  return result
}

function alignTo(arr, n) {
  if (arr.length >= n) return arr.slice(arr.length - n)
  return [...Array(n - arr.length).fill(NaN), ...arr]
}

function hasBearishDivergence(candles, i, lookback = 50) {
  const n = i + 1
  if (n < lookback + 3) return false
  const slice = candles.slice(0, n)
  const closes = slice.map(c => c.close)

  const { macdLine, hist } = calcMACD(closes)
  const stochArr = calcStochastic(slice)
  const cciArr = calcCCI(slice)
  const momArr = calcMomentum(closes)
  const obvArr = calcOBV(slice)
  const cmfArr = calcCMF(slice)
  const mfiArr = calcMFI(slice)
  const rsiArr = calcRSI(closes)

  const indicators = [
    alignTo(rsiArr, n), alignTo(macdLine, n), alignTo(hist, n),
    alignTo(stochArr, n), alignTo(cciArr, n), alignTo(momArr, n),
    alignTo(obvArr, n), alignTo(cmfArr, n), alignTo(mfiArr, n),
  ]

  const recentCloses = closes.slice(n - 3)
  const pastCloses   = closes.slice(n - 3 - lookback, n - 3)
  const currentHigh  = Math.max(...recentCloses)
  const pastHigh     = Math.max(...pastCloses)
  const pastHighIdx  = pastCloses.lastIndexOf(pastHigh)

  if (currentHigh <= pastHigh) return false

  let bearCount = 0
  for (const vals of indicators) {
    const recentVals = vals.slice(n - 3)
    const pastVals   = vals.slice(n - 3 - lookback, n - 3)
    if (recentVals.some(v => isNaN(v)) || pastVals.length === 0) continue
    const currentIndHigh = Math.max(...recentVals)
    const pastIndHigh    = pastVals[pastHighIdx] ?? Math.max(...pastVals.filter(v => !isNaN(v)))
    if (currentIndHigh < pastIndHigh) bearCount++
  }
  return bearCount >= 2
}

async function fetchCandles(ticker, intervalHours, days = 365) {
  const period1 = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const result = await yf.chart(`${ticker}.IS`, { period1, interval: '1h' })
  const quotes = result.quotes.filter(q => q.open != null && q.close != null && q.high != null && q.low != null)
  const grouped = []
  for (let i = 0; i + intervalHours <= quotes.length; i += intervalHours) {
    const slice = quotes.slice(i, i + intervalHours)
    grouped.push({
      open:   slice[0].open,
      high:   Math.max(...slice.map(q => q.high)),
      low:    Math.min(...slice.map(q => q.low)),
      close:  slice[slice.length - 1].close,
      volume: slice.reduce((a, q) => a + (q.volume ?? 0), 0),
    })
  }
  return grouped
}

function backtest(candles, forwardBars = 8) {
  const closes = candles.map(c => c.close)
  const n = candles.length

  const { kArr, dArr } = calcStochRSI(closes, 14, 14, 2, 2)
  const ema10 = calcEMA(closes, 10)
  const t3arr = calcT3(closes)

  const kOffset   = n - kArr.length
  const emaOffset = n - ema10.length
  const t3Offset  = n - t3arr.length

  // 4 senaryo
  const s = {
    solo:     { total: 0, win: 0 },  // sadece StochRSI
    ema:      { total: 0, win: 0 },  // StochRSI + EMA10 altı
    t3:       { total: 0, win: 0 },  // StochRSI + T3 aşağı
    combo:    { total: 0, win: 0 },  // StochRSI + EMA10 altı + T3 aşağı
    divCombo: { total: 0, win: 0 },  // StochRSI + Bearish Div
  }

  for (let i = 1; i < kArr.length - forwardBars; i++) {
    const ci = i + kOffset
    // StochRSI sat sinyali: K>75, K önceki D üstünde, şimdi D altına geçti
    if (!(kArr[i - 1] > 75 && kArr[i - 1] > dArr[i - 1] && kArr[i] < dArr[i])) continue

    const entryPrice  = closes[ci]
    const futurePrice = closes[ci + forwardBars]
    const win = futurePrice < entryPrice // sat sinyali → düşüş bekliyoruz

    const emaVal = ema10[ci - emaOffset]
    const t3Cur  = t3arr[ci - t3Offset]
    const t3Prev = t3arr[ci - t3Offset - 1]

    const belowEma = emaVal != null && entryPrice < emaVal
    const t3Down   = t3Cur != null && t3Prev != null && t3Cur < t3Prev
    const bearDiv  = hasBearishDivergence(candles, ci)

    s.solo.total++; if (win) s.solo.win++

    if (belowEma)           { s.ema.total++;   if (win) s.ema.win++ }
    if (t3Down)             { s.t3.total++;    if (win) s.t3.win++ }
    if (belowEma && t3Down) { s.combo.total++; if (win) s.combo.win++ }
    if (bearDiv)            { s.divCombo.total++; if (win) s.divCombo.win++ }
  }

  return s
}

function fmt(s) {
  if (s.total === 0) return 'sinyal yok  '
  return `%${((s.win / s.total) * 100).toFixed(0).padStart(2)} (${s.win}/${s.total})`.padEnd(12)
}

async function main() {
  const FORWARD = 8 // 16 saat
  console.log(`\n=== STOCHRSI SAT SİNYALİ BACKTEST (2H, 1 Yıl, ${FORWARD * 2} saat pencere) ===`)
  console.log('Sinyal: K>75, K önceki D üstünde → D altına geçiş\n')
  console.log(`${'Sembol'.padEnd(8)} | ${'Tek Başına'.padEnd(12)} | ${'+ EMA10 Altı'.padEnd(12)} | ${'+ T3 Aşağı'.padEnd(12)} | ${'+ EMA+T3'.padEnd(12)} | + Bearish Div`)
  console.log('-'.repeat(85))

  const tot = { solo: {total:0,win:0}, ema: {total:0,win:0}, t3: {total:0,win:0}, combo: {total:0,win:0}, divCombo: {total:0,win:0} }

  for (const sym of SYMBOLS) {
    try {
      const candles = await fetchCandles(sym, 2)
      const s = backtest(candles, FORWARD)
      for (const k of Object.keys(tot)) { tot[k].total += s[k].total; tot[k].win += s[k].win }
      console.log(`${sym.padEnd(8)} | ${fmt(s.solo)} | ${fmt(s.ema)} | ${fmt(s.t3)} | ${fmt(s.combo)} | ${fmt(s.divCombo)}`)
    } catch (e) {
      console.log(`${sym.padEnd(8)} | HATA: ${e.message}`)
    }
  }

  console.log('-'.repeat(85))
  console.log(`${'TOPLAM'.padEnd(8)} | ${fmt(tot.solo)} | ${fmt(tot.ema)} | ${fmt(tot.t3)} | ${fmt(tot.combo)} | ${fmt(tot.divCombo)}`)
  console.log('\nYorum: Düşüş bekliyoruz → win = sinyal sonrası fiyat düştü')
}

main()
