// Fisher9 Sat Sinyali Backtest
// Sinyal: Fisher önceki trigger üstünde, şimdi trigger altına geçti + Fisher > 0
import YahooFinance from 'yahoo-finance2'
const yf = new YahooFinance()

const SYMBOLS = [
  'THYAO', 'GARAN', 'AKBNK', 'ISCTR', 'TUPRS',
  'YKBNK', 'KCHOL', 'EREGL', 'SAHOL', 'BIMAS',
  'TCELL', 'ASELS', 'SASA', 'ENKAI', 'OYAKC',
  'MGROS', 'ASTOR',
]

function calcFisher9(candles, period = 9) {
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
    prevFish = fish
    prevValue = value
  }
  return { fishArr, trigArr: [0, ...fishArr.slice(0, -1)] }
}

async function fetchCandles(ticker, intervalHours, days = 365) {
  const period1 = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const result = await yf.chart(`${ticker}.IS`, { period1, interval: '1h' })
  const quotes = result.quotes.filter(q => q.open != null && q.close != null && q.high != null && q.low != null)
  const grouped = []
  for (let i = 0; i + intervalHours <= quotes.length; i += intervalHours) {
    const slice = quotes.slice(i, i + intervalHours)
    grouped.push({
      high:   Math.max(...slice.map(q => q.high)),
      low:    Math.min(...slice.map(q => q.low)),
      close:  slice[slice.length - 1].close,
      volume: slice.reduce((a, q) => a + (q.volume ?? 0), 0),
    })
  }
  return grouped
}

function backtest(candles, forwardBars) {
  const closes = candles.map(c => c.close)
  const n = candles.length
  const { fishArr, trigArr } = calcFisher9(candles)
  const offset = n - fishArr.length

  let total = 0, win = 0

  for (let i = 1; i < fishArr.length - forwardBars; i++) {
    const prevFish = fishArr[i - 1], prevTrig = trigArr[i - 1]
    const curFish  = fishArr[i],     curTrig  = trigArr[i]

    // Sat sinyali: Fisher önceki trigger üstünde → şimdi altına geçti + Fisher > 0 (overbought)
    if (!(prevFish > prevTrig && curFish < curTrig && prevFish > 0)) continue

    const ci = i + offset
    const entryPrice  = closes[ci]
    const futurePrice = closes[ci + forwardBars]
    total++
    if (futurePrice < entryPrice) win++ // düşüş bekliyoruz
  }
  return { total, win }
}

function fmt(s) {
  if (s.total === 0) return 'sinyal yok  '
  return `%${((s.win / s.total) * 100).toFixed(0).padStart(2)} (${s.win}/${s.total})`.padEnd(14)
}

async function main() {
  const FORWARDS = [3, 5, 8, 12, 20] // 6s, 10s, 16s, 24s, 40s

  console.log('\n=== FISHER9 SAT SİNYALİ BACKTEST (2H, 1 Yıl) ===')
  console.log('Sinyal: Fisher > trigger → trigger altına geçiş (Fisher > 0)\n')
  console.log(`${'Sembol'.padEnd(8)} | ${FORWARDS.map(f => `${f*2}s`.padEnd(14)).join(' | ')}`)
  console.log('-'.repeat(8 + FORWARDS.length * 17))

  const tots = FORWARDS.map(() => ({ total: 0, win: 0 }))

  for (const sym of SYMBOLS) {
    try {
      const candles = await fetchCandles(sym, 2)
      const parts = FORWARDS.map(f => backtest(candles, f))
      parts.forEach((p, i) => { tots[i].total += p.total; tots[i].win += p.win })
      console.log(`${sym.padEnd(8)} | ${parts.map(fmt).join(' | ')}`)
    } catch (e) {
      console.log(`${sym.padEnd(8)} | HATA: ${e.message}`)
    }
  }

  console.log('-'.repeat(8 + FORWARDS.length * 17))
  console.log(`${'TOPLAM'.padEnd(8)} | ${tots.map(fmt).join(' | ')}`)
  console.log(`\nPencereler: ${FORWARDS.map(f => `${f} mum=${f*2}s`).join(', ')}`)
}

main()
