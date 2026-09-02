// Hisse bazında F9 vs F10 - hangisi daha iyi?
// 2H ve 4H, al ve sat sinyalleri için ayrı ayrı
import YahooFinance from 'yahoo-finance2'
const yf = new YahooFinance()

const SYMBOLS = [
  'THYAO', 'GARAN', 'AKBNK', 'ISCTR', 'TUPRS',
  'YKBNK', 'KCHOL', 'EREGL', 'SAHOL', 'BIMAS',
  'TCELL', 'ASELS', 'SASA', 'ENKAI', 'OYAKC',
  'MGROS', 'ASTOR',
]

function calcFisher(candles, period) {
  const fishArr = []
  let prevFish = 0, prevValue = 0
  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1)
    const highest = Math.max(...slice.map(c => c.high))
    const lowest  = Math.min(...slice.map(c => c.low))
    const range = highest - lowest
    const hl2 = (candles[i].high + candles[i].low) / 2
    let value = range > 0 ? 2 * ((hl2 - lowest) / range) - 1 : 0
    value = Math.max(-0.999, Math.min(0.999, 0.66 * value + 0.67 * prevValue))
    const fish = 0.5 * Math.log((1 + value) / (1 - value)) + 0.5 * prevFish
    fishArr.push(fish)
    prevFish = fish; prevValue = value
  }
  return { fishArr, trigArr: [0, ...fishArr.slice(0, -1)] }
}

async function fetchCandles(ticker, intervalHours, days = 365) {
  const period1 = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const result = await yf.chart(`${ticker}.IS`, { period1, interval: '1h' })
  const quotes = result.quotes.filter(q => q.open != null && q.close != null && q.high != null && q.low != null)
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
    grouped.push({ high: Math.max(...sq.map(q=>q.high)), low: Math.min(...sq.map(q=>q.low)), close: sq[sq.length-1].close, time: new Date(sq[0].date).getTime() })
  }
  grouped.sort((a,b) => a.time - b.time)
  return grouped
}

function getWR(candles, period, forwardBars = 8) {
  const closes = candles.map(c => c.close)
  const n = candles.length
  const { fishArr, trigArr } = calcFisher(candles, period)
  const offset = n - fishArr.length
  let buyW = 0, buyT = 0, sellW = 0, sellT = 0

  for (let i = 1; i < fishArr.length - forwardBars; i++) {
    const pf = fishArr[i-1], pt = trigArr[i-1]
    const cf = fishArr[i],   ct = trigArr[i]
    const ci = i + offset
    const entry  = closes[ci]
    const future = closes[ci + forwardBars]

    if (pf < pt && cf > ct && pf < 0) { buyT++; if (future > entry) buyW++ }
    if (pf > pt && cf < ct && pf > 0) { sellT++; if (future < entry) sellW++ }
  }
  return {
    buyWR:  buyT  > 0 ? Math.round(buyW  / buyT  * 100) : 0,
    sellWR: sellT > 0 ? Math.round(sellW / sellT * 100) : 0,
    buyT, sellT
  }
}

async function main() {
  // Sonuçları topla
  const results = {}

  for (const sym of SYMBOLS) {
    results[sym] = {}
    for (const tf of [2, 4]) {
      try {
        const candles = await fetchCandles(sym, tf)
        const r9  = getWR(candles, 9)
        const r10 = getWR(candles, 10)
        results[sym][tf] = { r9, r10 }
      } catch(e) {
        results[sym][tf] = null
      }
    }
  }

  // Hisse bazında en iyi period seç
  console.log('\n=== HİSSE BAZINDA EN İYİ FISHER PERİYODU (16 saat pencere) ===\n')
  console.log(`${'Sembol'.padEnd(8)} | ${'2H Al'.padEnd(14)} | ${'2H Sat'.padEnd(14)} | ${'4H Al'.padEnd(14)} | ${'4H Sat'}`)
  console.log('-'.repeat(80))

  const bestPeriods = {}

  for (const sym of SYMBOLS) {
    bestPeriods[sym] = { buy2h: 9, sell2h: 9, buy4h: 9, sell4h: 9 }
    const r2 = results[sym][2], r4 = results[sym][4]
    if (!r2 || !r4) { console.log(`${sym.padEnd(8)} | veri yok`); continue }

    const buy2h  = r2.r10.buyWR  >= r2.r9.buyWR  ? { p: 10, wr: r2.r10.buyWR  } : { p: 9, wr: r2.r9.buyWR  }
    const sell2h = r2.r10.sellWR >= r2.r9.sellWR ? { p: 10, wr: r2.r10.sellWR } : { p: 9, wr: r2.r9.sellWR }
    const buy4h  = r4.r10.buyWR  >= r4.r9.buyWR  ? { p: 10, wr: r4.r10.buyWR  } : { p: 9, wr: r4.r9.buyWR  }
    const sell4h = r4.r10.sellWR >= r4.r9.sellWR ? { p: 10, wr: r4.r10.sellWR } : { p: 9, wr: r4.r9.sellWR }

    bestPeriods[sym] = { buy2h: buy2h.p, sell2h: sell2h.p, buy4h: buy4h.p, sell4h: sell4h.p }

    const fmt = (x) => `F${x.p} %${x.wr}`.padEnd(14)
    console.log(`${sym.padEnd(8)} | ${fmt(buy2h)} | ${fmt(sell2h)} | ${fmt(buy4h)} | ${fmt(sell4h)}`)
  }

  // JSON olarak da yazdır (koda eklemek için)
  console.log('\n\n=== KOD İÇİN FISHER RATES (JSON) ===\n')
  console.log('const FISHER_BEST: Record<string, { buy2h: number; sell2h: number; buy4h: number; sell4h: number }> = {')
  for (const sym of SYMBOLS) {
    const b = bestPeriods[sym]
    const r2 = results[sym][2], r4 = results[sym][4]
    if (!r2 || !r4) continue
    const buy2hWR  = b.buy2h  === 10 ? r2.r10.buyWR  : r2.r9.buyWR
    const sell2hWR = b.sell2h === 10 ? r2.r10.sellWR : r2.r9.sellWR
    const buy4hWR  = b.buy4h  === 10 ? r4.r10.buyWR  : r4.r9.buyWR
    const sell4hWR = b.sell4h === 10 ? r4.r10.sellWR : r4.r9.sellWR
    console.log(`  ${sym.padEnd(6)}: { buy2h: ${b.buy2h}, sell2h: ${b.sell2h}, buy4h: ${b.buy4h}, sell4h: ${b.sell4h}, buy2hWR: ${buy2hWR}, sell2hWR: ${sell2hWR}, buy4hWR: ${buy4hWR}, sell4hWR: ${sell4hWR} },`)
  }
  console.log('}')
}

main()
