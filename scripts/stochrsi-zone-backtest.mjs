// StochRSI Bölge Bazlı Backtest
// 3 bölge × 2 yön = 6 senaryo
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

async function fetchCandles(ticker, intervalHours, days = 365) {
  const period1 = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const result = await yf.chart(`${ticker}.IS`, { period1, interval: '1h' })
  const quotes = result.quotes.filter(q => q.open != null && q.close != null)
  const grouped = []
  for (let i = 0; i + intervalHours <= quotes.length; i += intervalHours) {
    const slice = quotes.slice(i, i + intervalHours)
    grouped.push({ close: slice[slice.length - 1].close })
  }
  return grouped
}

function backtest(candles, forwardBars = 8) {
  const closes = candles.map(c => c.close)
  const n = candles.length
  const { kArr, dArr } = calcStochRSI(closes)
  const offset = n - kArr.length

  const s = {
    above80up:   { total: 0, win: 0 }, // K>80, yukarı kesişim
    above80down: { total: 0, win: 0 }, // K>80, aşağı kesişim → sat
    mid20_80up:  { total: 0, win: 0 }, // 20<K<80, yukarı kesişim
    mid20_80down:{ total: 0, win: 0 }, // 20<K<80, aşağı kesişim → sat
    below20up:   { total: 0, win: 0 }, // K<20, yukarı kesişim
    below20down: { total: 0, win: 0 }, // K<20, aşağı kesişim → sat
  }

  for (let i = 1; i < kArr.length - forwardBars; i++) {
    const prevK = kArr[i - 1], prevD = dArr[i - 1]
    const curK  = kArr[i],     curD  = dArr[i]
    const ci = i + offset
    const entry  = closes[ci]
    const future = closes[ci + forwardBars]

    const crossUp   = prevK < prevD && curK > curD
    const crossDown = prevK > prevD && curK < curD

    if (crossUp) {
      if (prevK > 80)            { s.above80up.total++;   if (future > entry) s.above80up.win++ }
      else if (prevK >= 20)      { s.mid20_80up.total++;  if (future > entry) s.mid20_80up.win++ }
      else                       { s.below20up.total++;   if (future > entry) s.below20up.win++ }
    }
    if (crossDown) {
      if (prevK > 80)            { s.above80down.total++;   if (future < entry) s.above80down.win++ }
      else if (prevK >= 20)      { s.mid20_80down.total++;  if (future < entry) s.mid20_80down.win++ }
      else                       { s.below20down.total++;   if (future < entry) s.below20down.win++ }
    }
  }

  return s
}

function fmt(s) {
  if (s.total === 0) return '-'.padEnd(12)
  return `%${((s.win / s.total) * 100).toFixed(0)} (${s.win}/${s.total})`.padEnd(12)
}

async function main() {
  const FORWARD = 8 // 16 saat
  console.log(`\n=== STOCHRSI BÖLGE BAZLI BACKTEST (2H, 1 Yıl, ${FORWARD*2} saat) ===\n`)
  console.log(`${'Sembol'.padEnd(8)} | ${'80↑ Yuk'.padEnd(12)} | ${'80↓ Sat'.padEnd(12)} | ${'20-80↑ Yuk'.padEnd(12)} | ${'20-80↓ Sat'.padEnd(12)} | ${'20↓ Yuk'.padEnd(12)} | ${'20↓ Sat'}`)
  console.log('-'.repeat(95))

  const tots = {
    above80up:    { total: 0, win: 0 },
    above80down:  { total: 0, win: 0 },
    mid20_80up:   { total: 0, win: 0 },
    mid20_80down: { total: 0, win: 0 },
    below20up:    { total: 0, win: 0 },
    below20down:  { total: 0, win: 0 },
  }

  for (const sym of SYMBOLS) {
    try {
      const candles = await fetchCandles(sym, 2)
      const s = backtest(candles, FORWARD)
      for (const k of Object.keys(tots)) { tots[k].total += s[k].total; tots[k].win += s[k].win }
      console.log(
        `${sym.padEnd(8)} | ${fmt(s.above80up)} | ${fmt(s.above80down)} | ${fmt(s.mid20_80up)} | ${fmt(s.mid20_80down)} | ${fmt(s.below20up)} | ${fmt(s.below20down)}`
      )
    } catch (e) {
      console.log(`${sym.padEnd(8)} | HATA: ${e.message}`)
    }
  }

  console.log('-'.repeat(95))
  console.log(
    `${'TOPLAM'.padEnd(8)} | ${fmt(tots.above80up)} | ${fmt(tots.above80down)} | ${fmt(tots.mid20_80up)} | ${fmt(tots.mid20_80down)} | ${fmt(tots.below20up)} | ${fmt(tots.below20down)}`
  )
  console.log('\nYukarı kesişim → yükseliş bekliyoruz | Aşağı kesişim → düşüş bekliyoruz')
}

main()
