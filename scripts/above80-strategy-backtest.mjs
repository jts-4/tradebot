// STRATEJİ: StochRSI K>80 yukarı kesişim + EMA10 üstü kapanış → giriş
// ÇIKIŞ: Pozisyon açıldıktan sonraki en yüksek fiyatın %1 altına düşünce sat
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

function backtest(candles, trailPct = 1.0) {
  const closes = candles.map(c => c.close)
  const n = candles.length
  const { kArr, dArr } = calcStochRSI(closes)
  const ema10 = calcEMA(closes, 10)
  const kOffset   = n - kArr.length
  const emaOffset = n - ema10.length

  const trades = []

  let i = 1
  while (i < kArr.length - 2) {
    const prevK = kArr[i - 1], prevD = dArr[i - 1]
    const curK  = kArr[i],     curD  = dArr[i]

    // 1) StochRSI K>80 yukarı kesişim
    if (!(prevK > 80 && prevK < prevD && curK > curD)) { i++; continue }

    const triggerIdx = i + kOffset

    // 2) Sonraki 3 mum içinde art arda 2 mum EMA10 üstü kapanış → giriş
    let entryIdx = -1
    for (let j = triggerIdx; j <= Math.min(triggerIdx + 5, n - 3); j++) {
      const e1 = ema10[j - emaOffset]
      const e2 = ema10[j + 1 - emaOffset]
      if (e1 != null && e2 != null && closes[j] > e1 && closes[j + 1] > e2) {
        entryIdx = j + 1 // ikinci kapanış mumunda giriş
        break
      }
    }

    if (entryIdx < 0) { i++; continue }

    const entryPrice = closes[entryIdx]
    let peak = entryPrice

    // 3) Çıkış: tepenin %trailPct altına düşünce
    let exitIdx = -1
    for (let j = entryIdx + 1; j < n; j++) {
      if (closes[j] > peak) peak = closes[j]
      const stopLevel = peak * (1 - trailPct / 100)
      if (closes[j] <= stopLevel) { exitIdx = j; break }
    }

    if (exitIdx < 0) { i++; continue }

    const exitPrice = closes[exitIdx]
    const ret  = ((exitPrice - entryPrice) / entryPrice) * 100
    const bars = exitIdx - entryIdx
    const maxGain = ((peak - entryPrice) / entryPrice) * 100

    trades.push({ ret, bars, maxGain, entry: entryPrice, exit: exitPrice, peak })

    i = (exitIdx - kOffset) + 1
  }

  return trades
}

async function main() {
  console.log('\n=== STRATEJİ: StochRSI K>80 ↑ + EMA10 üstü 2 kapanış → Tepe -%2 trailing stop (2H, 1 Yıl) ===\n')
  console.log(`${'Sembol'.padEnd(8)} | ${'İşlem'.padEnd(6)} | ${'WR'.padEnd(6)} | ${'Ort Getiri'.padEnd(12)} | ${'Ort MaxGain'.padEnd(12)} | ${'Ort Süre'.padEnd(10)} | En İyi / En Kötü`)
  console.log('-'.repeat(95))

  let allTrades = []

  for (const sym of SYMBOLS) {
    try {
      const candles = await fetchCandles(sym, 2)
      const trades = backtest(candles, 2.0)
      allTrades.push(...trades)

      if (trades.length === 0) { console.log(`${sym.padEnd(8)} | işlem yok`); continue }

      const wins     = trades.filter(t => t.ret > 0)
      const wr       = ((wins.length / trades.length) * 100).toFixed(0)
      const avgRet   = (trades.reduce((a, t) => a + t.ret, 0) / trades.length).toFixed(2)
      const avgMax   = (trades.reduce((a, t) => a + t.maxGain, 0) / trades.length).toFixed(2)
      const avgBars  = (trades.reduce((a, t) => a + t.bars, 0) / trades.length).toFixed(1)
      const best     = Math.max(...trades.map(t => t.ret)).toFixed(1)
      const worst    = Math.min(...trades.map(t => t.ret)).toFixed(1)

      console.log(`${sym.padEnd(8)} | ${String(trades.length).padEnd(6)} | %${wr.padEnd(5)} | %${avgRet.padEnd(11)} | %${avgMax.padEnd(11)} | ${avgBars} mum      | %${best} / %${worst}`)
    } catch (e) {
      console.log(`${sym.padEnd(8)} | HATA: ${e.message}`)
    }
  }

  console.log('-'.repeat(95))

  if (allTrades.length > 0) {
    const wins    = allTrades.filter(t => t.ret > 0)
    const wr      = ((wins.length / allTrades.length) * 100).toFixed(0)
    const avgRet  = (allTrades.reduce((a, t) => a + t.ret, 0) / allTrades.length).toFixed(2)
    const avgMax  = (allTrades.reduce((a, t) => a + t.maxGain, 0) / allTrades.length).toFixed(2)
    const avgBars = (allTrades.reduce((a, t) => a + t.bars, 0) / allTrades.length).toFixed(1)
    const best    = Math.max(...allTrades.map(t => t.ret)).toFixed(1)
    const worst   = Math.min(...allTrades.map(t => t.ret)).toFixed(1)

    console.log(`${'TOPLAM'.padEnd(8)} | ${String(allTrades.length).padEnd(6)} | %${wr.padEnd(5)} | %${avgRet.padEnd(11)} | %${avgMax.padEnd(11)} | ${avgBars} mum`)
    console.log(`\nEn iyi işlem   : %${best}`)
    console.log(`En kötü işlem  : %${worst}`)
    console.log(`Ort max kazanç : %${avgMax} (tepede çıksaydın)`)

    const pos5  = allTrades.filter(t => t.ret > 5).length
    const pos2  = allTrades.filter(t => t.ret > 2 && t.ret <= 5).length
    const pos0  = allTrades.filter(t => t.ret > 0 && t.ret <= 2).length
    const neg2  = allTrades.filter(t => t.ret < 0 && t.ret >= -2).length
    const neg5  = allTrades.filter(t => t.ret < -2 && t.ret >= -5).length
    const neg5p = allTrades.filter(t => t.ret < -5).length

    console.log('\nGetiri Dağılımı:')
    console.log(`  +%5 üstü    : ${pos5} işlem`)
    console.log(`  +%2 ile +%5 : ${pos2} işlem`)
    console.log(`   0 ile +%2  : ${pos0} işlem`)
    console.log(`  -%2 ile  0  : ${neg2} işlem`)
    console.log(`  -%5 ile -%2 : ${neg5} işlem`)
    console.log(`  -%5 altı    : ${neg5p} işlem`)
  }
}

main()
