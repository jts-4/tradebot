// Fisher9 vs Fisher10 Karşılaştırma Backtest
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
    grouped.push({
      high:  Math.max(...sq.map(q => q.high)),
      low:   Math.min(...sq.map(q => q.low)),
      close: sq[sq.length - 1].close,
      time:  new Date(sq[0].date).getTime(),
    })
  }
  grouped.sort((a, b) => a.time - b.time)
  return grouped
}

function backtest(candles, period, forwardBars) {
  const { fishArr, trigArr } = calcFisher(candles, period)
  const closes = candles.map(c => c.close)
  const offset = closes.length - fishArr.length
  let buyTotal = 0, buyWin = 0, sellTotal = 0, sellWin = 0

  for (let i = 1; i < fishArr.length - forwardBars; i++) {
    const pf = fishArr[i-1], pt = trigArr[i-1]
    const cf = fishArr[i],   ct = trigArr[i]
    const ci = i + offset
    const entry  = closes[ci]
    const future = closes[ci + forwardBars]

    // Al sinyali
    if (pf < pt && cf > ct && pf < 0) {
      buyTotal++
      if (future > entry) buyWin++
    }
    // Sat sinyali
    if (pf > pt && cf < ct && pf > 0) {
      sellTotal++
      if (future < entry) sellWin++
    }
  }
  return { buyTotal, buyWin, sellTotal, sellWin }
}

function fmt(w, t) {
  if (t === 0) return '-'.padEnd(12)
  return `%${((w/t)*100).toFixed(0)} (${w}/${t})`.padEnd(12)
}

async function main() {
  const FORWARD = 8 // 16 saat (2H × 8)
  console.log(`\n=== FISHER9 vs FISHER10 KARŞILAŞTIRMA (2H + 4H, 1 Yıl, ${FORWARD*2}s pencere) ===\n`)

  for (const tf of [2, 4]) {
    console.log(`\n--- ${tf}H ---`)
    console.log(`${'Sembol'.padEnd(8)} | ${'F9 Al'.padEnd(12)} | ${'F10 Al'.padEnd(12)} | ${'F9 Sat'.padEnd(12)} | F10 Sat`)
    console.log('-'.repeat(65))

    const tot = { b9:{total:0,win:0}, b10:{total:0,win:0}, s9:{total:0,win:0}, s10:{total:0,win:0} }

    for (const sym of SYMBOLS) {
      try {
        const candles = await fetchCandles(sym, tf)
        const r9  = backtest(candles, 9,  FORWARD)
        const r10 = backtest(candles, 10, FORWARD)

        tot.b9.total  += r9.buyTotal;  tot.b9.win  += r9.buyWin
        tot.b10.total += r10.buyTotal; tot.b10.win += r10.buyWin
        tot.s9.total  += r9.sellTotal; tot.s9.win  += r9.sellWin
        tot.s10.total += r10.sellTotal;tot.s10.win += r10.sellWin

        console.log(`${sym.padEnd(8)} | ${fmt(r9.buyWin,r9.buyTotal)} | ${fmt(r10.buyWin,r10.buyTotal)} | ${fmt(r9.sellWin,r9.sellTotal)} | ${fmt(r10.sellWin,r10.sellTotal)}`)
      } catch(e) {
        console.log(`${sym.padEnd(8)} | HATA`)
      }
    }
    console.log('-'.repeat(65))
    console.log(`${'TOPLAM'.padEnd(8)} | ${fmt(tot.b9.win,tot.b9.total)} | ${fmt(tot.b10.win,tot.b10.total)} | ${fmt(tot.s9.win,tot.s9.total)} | ${fmt(tot.s10.win,tot.s10.total)}`)
  }
}

main()
