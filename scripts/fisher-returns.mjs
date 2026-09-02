// Fisher9 vs Fisher10 - 16 saatte ortalama getiri
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

function getReturns(candles, period, forwardBars = 8) {
  const closes = candles.map(c => c.close)
  const n = candles.length
  const { fishArr, trigArr } = calcFisher(candles, period)
  const offset = n - fishArr.length
  const buyReturns = [], sellReturns = []

  for (let i = 1; i < fishArr.length - forwardBars; i++) {
    const pf = fishArr[i-1], pt = trigArr[i-1]
    const cf = fishArr[i],   ct = trigArr[i]
    const ci = i + offset
    const entry  = closes[ci]
    const future = closes[ci + forwardBars]
    const ret = ((future - entry) / entry) * 100

    if (pf < pt && cf > ct && pf < 0) buyReturns.push(ret)
    if (pf > pt && cf < ct && pf > 0) sellReturns.push(-ret) // sat → düşüş pozitif
  }
  return { buyReturns, sellReturns }
}

function stats(arr) {
  if (!arr.length) return { avg: 0, wr: 0, count: 0 }
  const avg = arr.reduce((a,b) => a+b, 0) / arr.length
  const wr  = arr.filter(x => x > 0).length / arr.length * 100
  return { avg, wr, count: arr.length }
}

async function main() {
  console.log('\n=== FISHER9 vs FISHER10 — 16 SAATLİK GETİRİ (2H + 4H, 1 Yıl) ===\n')

  for (const tf of [2, 4]) {
    const all = { b9:[], b10:[], s9:[], s10:[] }

    for (const sym of SYMBOLS) {
      try {
        const candles = await fetchCandles(sym, tf)
        const r9  = getReturns(candles, 9)
        const r10 = getReturns(candles, 10)
        all.b9.push(...r9.buyReturns)
        all.b10.push(...r10.buyReturns)
        all.s9.push(...r9.sellReturns)
        all.s10.push(...r10.sellReturns)
      } catch(e) {}
    }

    const b9  = stats(all.b9)
    const b10 = stats(all.b10)
    const s9  = stats(all.s9)
    const s10 = stats(all.s10)

    console.log(`--- ${tf}H ---`)
    console.log(`Al Sinyali  → F9 : ort %${b9.avg.toFixed(2)}  | WR %${b9.wr.toFixed(0)}  | ${b9.count} sinyal`)
    console.log(`Al Sinyali  → F10: ort %${b10.avg.toFixed(2)}  | WR %${b10.wr.toFixed(0)}  | ${b10.count} sinyal`)
    console.log(`Sat Sinyali → F9 : ort %${s9.avg.toFixed(2)}  | WR %${s9.wr.toFixed(0)}  | ${s9.count} sinyal`)
    console.log(`Sat Sinyali → F10: ort %${s10.avg.toFixed(2)}  | WR %${s10.wr.toFixed(0)}  | ${s10.count} sinyal`)
    console.log()
  }
}

main()
