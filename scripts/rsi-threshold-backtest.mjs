// RSI14 Eşik Seviyesi Backtest
// Mevcut sinyal: prevRsi < 40 && rsi > prevRsi
// Test: <30 yukarı dönüş vs <35 yukarı dönüş vs <40 yukarı dönüş
import YahooFinance from 'yahoo-finance2'
const yf = new YahooFinance()

const SYMBOLS = [
  'THYAO', 'GARAN', 'AKBNK', 'ISCTR', 'TUPRS',
  'YKBNK', 'KCHOL', 'EREGL', 'SAHOL', 'BIMAS',
  'TCELL', 'ASELS', 'SASA', 'ENKAI', 'OYAKC',
  'MGROS', 'ASTOR',
]

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

async function fetchCandles(ticker, intervalHours, days = 365) {
  const period1 = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const result = await yf.chart(`${ticker}.IS`, { period1, interval: '1h' })
  const quotes = result.quotes.filter(q => q.open != null && q.close != null)
  const lastDate = quotes.length > 0 ? new Date(quotes[quotes.length - 1].date) : null
  const clean = (lastDate && lastDate.getMinutes() !== 0) ? quotes.slice(0, -1) : quotes
  function getWindowKey(date) {
    const h = date.getUTCHours()
    if (h < 7 || h >= 15) return ''
    const d = `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`
    return `${d}-${Math.floor((h - 7) / intervalHours)}`
  }
  const slotMap = new Map()
  for (const q of clean) {
    const key = getWindowKey(new Date(q.date))
    if (!key) continue
    if (!slotMap.has(key)) slotMap.set(key, [])
    slotMap.get(key).push(q)
  }
  const grouped = []
  for (const sq of slotMap.values()) {
    if (!sq.length) continue
    grouped.push({ close: sq[sq.length - 1].close, time: new Date(sq[0].date).getTime() })
  }
  grouped.sort((a, b) => a.time - b.time)
  return grouped
}

function backtest(candles, threshold, forwardBars = 8) {
  const closes = candles.map(c => c.close)
  const rsi = calcRSI(closes)
  const offset = closes.length - rsi.length
  let total = 0, win = 0

  for (let i = 1; i < rsi.length - forwardBars; i++) {
    // Sinyal: önceki RSI eşiğin altında VE RSI yukarı döndü
    if (!(rsi[i - 1] < threshold && rsi[i] > rsi[i - 1])) continue
    const ci = i + offset
    const entry  = closes[ci]
    const future = closes[ci + forwardBars]
    total++
    if (future > entry) win++
  }
  return { total, win, wr: total > 0 ? Math.round(win / total * 100) : 0 }
}

function fmt(r) {
  if (r.total === 0) return '-'.padEnd(14)
  return `%${r.wr} (${r.win}/${r.total})`.padEnd(14)
}

async function main() {
  const FORWARD = 8 // 16 saat
  const THRESHOLDS = [30, 35, 40]

  for (const tf of [2, 4]) {
    console.log(`\n=== RSI14 EŞİK BACKTEST (${tf}H, 1 Yıl, 16 saat pencere) ===`)
    console.log(`${'Sembol'.padEnd(8)} | ${'RSI<30'.padEnd(14)} | ${'RSI<35'.padEnd(14)} | RSI<40`)
    console.log('-'.repeat(60))

    const tots = THRESHOLDS.map(() => ({ total: 0, win: 0 }))

    for (const sym of SYMBOLS) {
      try {
        const candles = await fetchCandles(sym, tf)
        const results = THRESHOLDS.map(t => backtest(candles, t, FORWARD))
        results.forEach((r, i) => { tots[i].total += r.total; tots[i].win += r.win })
        console.log(`${sym.padEnd(8)} | ${results.map(fmt).join(' | ')}`)
      } catch(e) {
        console.log(`${sym.padEnd(8)} | HATA`)
      }
    }

    console.log('-'.repeat(60))
    console.log(`${'TOPLAM'.padEnd(8)} | ${tots.map(r => fmt({ ...r, wr: r.total > 0 ? Math.round(r.win/r.total*100) : 0 })).join(' | ')}`)
  }
}

main()
