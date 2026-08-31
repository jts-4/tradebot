// StochRSI Kombine Backtest
// 1) StochRSI bölge × EMA10 filtresi WR
// 2) 20-80 arası yukarı kesişimde ortalama % getiri
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
  const ema10 = calcEMA(closes, 10)
  const kOffset   = n - kArr.length
  const emaOffset = n - ema10.length

  // WR senaryoları
  const s = {
    below20_solo:    { total: 0, win: 0 },
    below20_ema:     { total: 0, win: 0 },
    mid20_80_solo:   { total: 0, win: 0 },
    mid20_80_ema:    { total: 0, win: 0 },
  }

  // 20-80 arası getiri dağılımı (farklı pencereler)
  const midReturns = { f3: [], f5: [], f8: [], f12: [], f20: [] }

  for (let i = 1; i < kArr.length - 20; i++) {
    const prevK = kArr[i - 1], prevD = dArr[i - 1]
    const curK  = kArr[i],     curD  = dArr[i]
    if (!(prevK < prevD && curK > curD)) continue // sadece yukarı kesişim

    const ci = i + kOffset
    const entry   = closes[ci]
    const emaVal  = ema10[ci - emaOffset]
    const aboveEma = emaVal != null && entry > emaVal

    const win8  = closes[ci + 8]  > entry
    const win3  = closes[ci + 3]  > entry
    const win5  = closes[ci + 5]  > entry
    const win12 = closes[ci + 12] > entry
    const win20 = closes[ci + 20] > entry

    if (prevK < 20) {
      s.below20_solo.total++; if (win8) s.below20_solo.win++
      if (aboveEma) { s.below20_ema.total++; if (win8) s.below20_ema.win++ }
    } else if (prevK < 80) {
      s.mid20_80_solo.total++; if (win8) s.mid20_80_solo.win++
      if (aboveEma) { s.mid20_80_ema.total++; if (win8) s.mid20_80_ema.win++ }

      // Getiri hesabı
      midReturns.f3.push(((closes[ci + 3]  - entry) / entry) * 100)
      midReturns.f5.push(((closes[ci + 5]  - entry) / entry) * 100)
      midReturns.f8.push(((closes[ci + 8]  - entry) / entry) * 100)
      midReturns.f12.push(((closes[ci + 12] - entry) / entry) * 100)
      midReturns.f20.push(((closes[ci + 20] - entry) / entry) * 100)
    }
  }

  return { s, midReturns }
}

function fmt(s) {
  if (s.total === 0) return '-'.padEnd(14)
  return `%${((s.win / s.total) * 100).toFixed(0)} (${s.win}/${s.total})`.padEnd(14)
}

function avg(arr) {
  if (arr.length === 0) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

async function main() {
  console.log('\n=== STOCHRSI + EMA10 KOMBİNASYON BACKTEST (2H, 1 Yıl, 16 saat) ===\n')
  console.log(`${'Sembol'.padEnd(8)} | ${'<20 Tek'.padEnd(14)} | ${'<20+EMA10'.padEnd(14)} | ${'20-80 Tek'.padEnd(14)} | ${'20-80+EMA10'}`)
  console.log('-'.repeat(75))

  const tots = {
    below20_solo:  { total: 0, win: 0 },
    below20_ema:   { total: 0, win: 0 },
    mid20_80_solo: { total: 0, win: 0 },
    mid20_80_ema:  { total: 0, win: 0 },
  }
  const allMidReturns = { f3: [], f5: [], f8: [], f12: [], f20: [] }

  for (const sym of SYMBOLS) {
    try {
      const candles = await fetchCandles(sym, 2)
      const { s, midReturns } = backtest(candles)
      for (const k of Object.keys(tots)) { tots[k].total += s[k].total; tots[k].win += s[k].win }
      for (const k of Object.keys(allMidReturns)) allMidReturns[k].push(...midReturns[k])
      console.log(`${sym.padEnd(8)} | ${fmt(s.below20_solo)} | ${fmt(s.below20_ema)} | ${fmt(s.mid20_80_solo)} | ${fmt(s.mid20_80_ema)}`)
    } catch (e) {
      console.log(`${sym.padEnd(8)} | HATA: ${e.message}`)
    }
  }

  console.log('-'.repeat(75))
  console.log(`${'TOPLAM'.padEnd(8)} | ${fmt(tots.below20_solo)} | ${fmt(tots.below20_ema)} | ${fmt(tots.mid20_80_solo)} | ${fmt(tots.mid20_80_ema)}`)

  console.log('\n=== 20-80 ARASI YUKARI KESİŞİM ORT. GETİRİ ===\n')
  const windows = [
    { key: 'f3',  label: ' 6 saat (3 mum)' },
    { key: 'f5',  label: '10 saat (5 mum)' },
    { key: 'f8',  label: '16 saat (8 mum)' },
    { key: 'f12', label: '24 saat (12 mum)' },
    { key: 'f20', label: '40 saat (20 mum)' },
  ]
  for (const { key, label } of windows) {
    const arr = allMidReturns[key]
    const a = avg(arr)
    const winRate = (arr.filter(x => x > 0).length / arr.length * 100).toFixed(0)
    const p25 = [...arr].sort((a,b)=>a-b)[Math.floor(arr.length*0.25)]
    const p75 = [...arr].sort((a,b)=>a-b)[Math.floor(arr.length*0.75)]
    console.log(`${label} → Ort: %${a.toFixed(2).padStart(6)} | WR: %${winRate} | Alt %25: %${p25.toFixed(2)} | Üst %75: %${p75.toFixed(2)}`)
  }
}

main()
