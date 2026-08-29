// Divergence for Many Backtest
// Bullish divergence sinyalinden sonra N mum içinde fiyat yükseldi mi?
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

function calcMACD(closes) {
  function ema(vals, p) {
    const k = 2 / (p + 1)
    let e = vals[0]
    const r = [e]
    for (let i = 1; i < vals.length; i++) { e = vals[i] * k + e * (1 - k); r.push(e) }
    return r
  }
  const fast = ema(closes, 12), slow = ema(closes, 26)
  const len = Math.min(fast.length, slow.length)
  const macdLine = fast.slice(fast.length - len).map((v, i) => v - slow[slow.length - len + i])
  const signal = ema(macdLine, 9)
  const hist = macdLine.slice(macdLine.length - signal.length).map((v, i) => v - signal[i])
  return { macdLine: macdLine.slice(macdLine.length - signal.length), hist }
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
      const mfm = range > 0 ? ((c.close - c.low) - (c.high - c.close)) / range : 0
      cmfv += mfm * c.volume; vol += c.volume
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

function align(arr, n) {
  if (arr.length >= n) return arr.slice(arr.length - n)
  return [...Array(n - arr.length).fill(NaN), ...arr]
}

// Divergence sinyali: i. mumda bullish/bearish var mı?
function checkDivergence(candles, i, lookback = 50) {
  const closes = candles.map(c => c.close)
  const n = i + 1 // i'ye kadar olan veri

  if (n < lookback + 3) return { bullish: false, bearish: false }

  const slice = candles.slice(0, n)
  const sliceCloses = closes.slice(0, n)

  const rsiArr = calcRSI(sliceCloses)
  const { macdLine, hist } = calcMACD(sliceCloses)
  const stochArr = calcStochastic(slice)
  const cciArr = calcCCI(slice)
  const momArr = calcMomentum(sliceCloses)
  const obvArr = calcOBV(slice)
  const cmfArr = calcCMF(slice)
  const mfiArr = calcMFI(slice)

  const indicators = [
    { values: align(rsiArr, n) },
    { values: align(macdLine, n) },
    { values: align(hist, n) },
    { values: align(stochArr, n) },
    { values: align(cciArr, n) },
    { values: align(momArr, n) },
    { values: align(obvArr, n) },
    { values: align(cmfArr, n) },
    { values: align(mfiArr, n) },
  ]

  // Son 3 mum vs geçmiş 50 mum
  const recentCloses = sliceCloses.slice(n - 3)
  const pastCloses   = sliceCloses.slice(n - 3 - lookback, n - 3)
  const currentLow   = Math.min(...recentCloses)
  const currentHigh  = Math.max(...recentCloses)
  const pastLow      = Math.min(...pastCloses)
  const pastHigh     = Math.max(...pastCloses)
  const pastLowIdx   = pastCloses.lastIndexOf(pastLow)
  const pastHighIdx  = pastCloses.lastIndexOf(pastHigh)

  let bullCount = 0, bearCount = 0

  for (const ind of indicators) {
    const vals = ind.values
    const recentVals = vals.slice(n - 3)
    const pastVals   = vals.slice(n - 3 - lookback, n - 3)
    if (recentVals.some(v => isNaN(v)) || pastVals.length === 0) continue

    const currentIndLow  = Math.min(...recentVals)
    const currentIndHigh = Math.max(...recentVals)
    const pastIndLow     = pastVals[pastLowIdx]  ?? Math.min(...pastVals.filter(v => !isNaN(v)))
    const pastIndHigh    = pastVals[pastHighIdx] ?? Math.max(...pastVals.filter(v => !isNaN(v)))

    if (currentLow < pastLow && currentIndLow > pastIndLow)     bullCount++
    if (currentHigh > pastHigh && currentIndHigh < pastIndHigh) bearCount++
  }

  return { bullish: bullCount >= 2, bearish: bearCount >= 2 }
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

function backtest(candles, forwardBars = 5) {
  const closes = candles.map(c => c.close)
  const n = candles.length

  let bullTotal = 0, bullWin = 0
  let bearTotal = 0, bearWin = 0

  for (let i = 60; i < n - forwardBars; i++) {
    const { bullish, bearish } = checkDivergence(candles, i)
    const entryPrice = closes[i]
    const futurePrice = closes[i + forwardBars]

    if (bullish) {
      bullTotal++
      if (futurePrice > entryPrice) bullWin++
    }
    if (bearish) {
      bearTotal++
      if (futurePrice < entryPrice) bearWin++
    }
  }

  return { bullTotal, bullWin, bearTotal, bearWin }
}

async function main() {
  const FORWARD = 8 // 8 mum sonra (2H = 16 saat)
  console.log(`\n=== DİVERGENCE FOR MANY BACKTEST (2H, 1 Yıl) ===`)
  console.log(`Sinyal sonraki ${FORWARD} mum (${FORWARD * 2} saat) içinde doğrulandı mı?\n`)
  console.log(`${'Sembol'.padEnd(8)} | ${'Bullish Sinyal'.padEnd(16)} | ${'Win Rate'.padEnd(10)} | ${'Bearish Sinyal'.padEnd(16)} | Win Rate`)
  console.log('-'.repeat(75))

  let totBullT = 0, totBullW = 0, totBearT = 0, totBearW = 0

  for (const sym of SYMBOLS) {
    try {
      const candles = await fetchCandles(sym, 2)
      const { bullTotal, bullWin, bearTotal, bearWin } = backtest(candles, FORWARD)

      totBullT += bullTotal; totBullW += bullWin
      totBearT += bearTotal; totBearW += bearWin

      const bullRate = bullTotal > 0 ? `%${((bullWin / bullTotal) * 100).toFixed(0)} (${bullWin}/${bullTotal})` : 'veri yok'
      const bearRate = bearTotal > 0 ? `%${((bearWin / bearTotal) * 100).toFixed(0)} (${bearWin}/${bearTotal})` : 'veri yok'

      console.log(`${sym.padEnd(8)} | ${String(bullTotal).padEnd(16)} | ${bullRate.padEnd(10)} | ${String(bearTotal).padEnd(16)} | ${bearRate}`)
    } catch (e) {
      console.log(`${sym.padEnd(8)} | HATA: ${e.message}`)
    }
  }

  console.log('-'.repeat(75))
  const bullRate = totBullT > 0 ? `%${((totBullW / totBullT) * 100).toFixed(0)} (${totBullW}/${totBullT})` : '-'
  const bearRate = totBearT > 0 ? `%${((totBearW / totBearT) * 100).toFixed(0)} (${totBearW}/${totBearT})` : '-'
  console.log(`${'TOPLAM'.padEnd(8)} | ${String(totBullT).padEnd(16)} | ${bullRate.padEnd(10)} | ${String(totBearT).padEnd(16)} | ${bearRate}`)
}

main()
