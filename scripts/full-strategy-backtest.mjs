// TAM STRATEJİ BACKTEST
// Giriş: StochRSI K<20, K önceki D altında → D üstüne geçti
// Onay: Sonraki 9 mum içinde EMA10 üstünde kapanış
// Çıkış: StochRSI tekrar aşağı yönlü kesişim (K > D → K < D)
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

function backtest(candles, emaWindow = 9) {
  const closes = candles.map(c => c.close)
  const n = candles.length
  const { kArr, dArr } = calcStochRSI(closes)
  const ema10 = calcEMA(closes, 10)
  const kOffset   = n - kArr.length
  const emaOffset = n - ema10.length

  const trades = [] // { entry, exit, ret, bars, exitReason }

  let i = 1
  while (i < kArr.length - 1) {
    const prevK = kArr[i - 1], prevD = dArr[i - 1]
    const curK  = kArr[i],     curD  = dArr[i]

    // 1) Giriş: K<20 yukarı kesişim
    if (!(prevK < 20 && prevK < prevD && curK > curD)) { i++; continue }

    const triggerIdx = i + kOffset

    // 2) Onay: sonraki emaWindow mum içinde EMA10 üstü kapanış
    const searchEnd = Math.min(triggerIdx + emaWindow, n - 1)
    let entryIdx = -1
    for (let j = triggerIdx; j <= searchEnd; j++) {
      const e = ema10[j - emaOffset]
      if (e != null && closes[j] > e) { entryIdx = j; break }
    }

    if (entryIdx < 0) { i++; continue } // onay gelmedi, atla

    const entryPrice = closes[entryIdx]
    const entryKIdx  = entryIdx - kOffset // kArr index

    // 3) Çıkış A: EMA10 altı kapanış
    let exitIdx = -1
    let exitReason = 'sona_ulasildi'
    for (let j = entryIdx + 1; j < n - 1; j++) {
      const e = ema10[j - emaOffset]
      if (e != null && closes[j] < e) {
        exitIdx = j
        exitReason = 'ema10_below'
        break
      }
    }

    if (exitIdx < 0 || exitIdx >= n) { i++; continue }

    const exitPrice = closes[exitIdx]
    const ret = ((exitPrice - entryPrice) / entryPrice) * 100
    const bars = exitIdx - entryIdx

    trades.push({ entry: entryPrice, exit: exitPrice, ret, bars, exitReason })

    i = (exitIdx - kOffset) + 1
  }

  return trades
}

async function main() {
  console.log('\n=== TAM STRATEJİ BACKTEST (2H, 1 Yıl) ===')
  console.log('Giriş : StochRSI K<20 yukarı kesişim → 9 mum içinde EMA10 üstü kapanış')
  console.log('Çıkış : EMA10 altı kapanış\n')
  console.log(`${'Sembol'.padEnd(8)} | ${'İşlem'.padEnd(6)} | ${'WR'.padEnd(6)} | ${'Ort Getiri'.padEnd(12)} | ${'Ort Süre'.padEnd(10)} | ${'En İyi'.padEnd(10)} | En Kötü`)
  console.log('-'.repeat(80))

  let allTrades = []

  for (const sym of SYMBOLS) {
    try {
      const candles = await fetchCandles(sym, 2)
      const trades = backtest(candles)
      allTrades.push(...trades)

      if (trades.length === 0) { console.log(`${sym.padEnd(8)} | işlem yok`); continue }

      const wins    = trades.filter(t => t.ret > 0)
      const wr      = ((wins.length / trades.length) * 100).toFixed(0)
      const avgRet  = (trades.reduce((a, t) => a + t.ret, 0) / trades.length).toFixed(2)
      const avgBars = (trades.reduce((a, t) => a + t.bars, 0) / trades.length).toFixed(1)
      const best    = Math.max(...trades.map(t => t.ret)).toFixed(1)
      const worst   = Math.min(...trades.map(t => t.ret)).toFixed(1)

      console.log(`${sym.padEnd(8)} | ${String(trades.length).padEnd(6)} | %${wr.padEnd(5)} | %${avgRet.padEnd(11)} | ${avgBars} mum`.padEnd(60) + ` | %${best.padEnd(9)} | %${worst}`)
    } catch (e) {
      console.log(`${sym.padEnd(8)} | HATA: ${e.message}`)
    }
  }

  console.log('-'.repeat(80))

  if (allTrades.length > 0) {
    const wins   = allTrades.filter(t => t.ret > 0)
    const wr     = ((wins.length / allTrades.length) * 100).toFixed(0)
    const avgRet = (allTrades.reduce((a, t) => a + t.ret, 0) / allTrades.length).toFixed(2)
    const avgBars= (allTrades.reduce((a, t) => a + t.bars, 0) / allTrades.length).toFixed(1)
    const best   = Math.max(...allTrades.map(t => t.ret)).toFixed(1)
    const worst  = Math.min(...allTrades.map(t => t.ret)).toFixed(1)
    const totalPnl = allTrades.reduce((a, t) => a + t.ret, 0).toFixed(1)

    console.log(`${'TOPLAM'.padEnd(8)} | ${String(allTrades.length).padEnd(6)} | %${wr.padEnd(5)} | %${avgRet.padEnd(11)} | ${avgBars} mum`)
    console.log(`\nEn iyi işlem  : %${best}`)
    console.log(`En kötü işlem : %${worst}`)
    console.log(`Toplam PnL    : %${totalPnl} (tüm işlemler toplanırsa)`)
    console.log(`Ort süre      : ${avgBars} mum = ${(parseFloat(avgBars) * 2).toFixed(0)} saat`)

    // Getiri dağılımı
    const pos5  = allTrades.filter(t => t.ret > 5).length
    const pos2  = allTrades.filter(t => t.ret > 2 && t.ret <= 5).length
    const pos0  = allTrades.filter(t => t.ret > 0 && t.ret <= 2).length
    const neg2  = allTrades.filter(t => t.ret < 0 && t.ret >= -2).length
    const neg5  = allTrades.filter(t => t.ret < -2 && t.ret >= -5).length
    const neg5p = allTrades.filter(t => t.ret < -5).length

    console.log('\nGetiri Dağılımı:')
    console.log(`  +%5 üstü   : ${pos5} işlem`)
    console.log(`  +%2 ile +%5: ${pos2} işlem`)
    console.log(`   0 ile +%2 : ${pos0} işlem`)
    console.log(`  -%2 ile  0 : ${neg2} işlem`)
    console.log(`  -%5 ile -%2: ${neg5} işlem`)
    console.log(`  -%5 altı   : ${neg5p} işlem`)
  }
}

main()
