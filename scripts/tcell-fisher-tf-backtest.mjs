// TCELL Fisher9 Al Sinyali - 2H / 4H / 1D karşılaştırma
import YahooFinance from 'yahoo-finance2'
const yf = new YahooFinance()

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

async function fetchCandles(intervalHours, days = 365) {
  const period1 = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const result = await yf.chart('TCELL.IS', { period1, interval: '1h' })
  const quotes = result.quotes.filter(q => q.open != null && q.close != null && q.high != null && q.low != null)
  const grouped = []
  for (let i = 0; i + intervalHours <= quotes.length; i += intervalHours) {
    const slice = quotes.slice(i, i + intervalHours)
    grouped.push({
      high:  Math.max(...slice.map(q => q.high)),
      low:   Math.min(...slice.map(q => q.low)),
      close: slice[slice.length - 1].close,
    })
  }
  return grouped
}

function backtest(candles, forwardBars) {
  const closes = candles.map(c => c.close)
  const n = candles.length
  const { fishArr, trigArr } = calcFisher9(candles)
  const offset = n - fishArr.length
  const returns = []

  for (let i = 1; i < fishArr.length - forwardBars; i++) {
    const prevFish = fishArr[i - 1], prevTrig = trigArr[i - 1]
    const curFish  = fishArr[i],     curTrig  = trigArr[i]
    if (!(prevFish < prevTrig && curFish > curTrig && prevFish < 0)) continue
    const ci = i + offset
    const entry  = closes[ci]
    const future = closes[ci + forwardBars]
    returns.push(((future - entry) / entry) * 100)
  }
  return returns
}

function stats(arr) {
  if (arr.length === 0) return 'veri yok'
  const wr  = ((arr.filter(x => x > 0).length / arr.length) * 100).toFixed(0)
  const avg = (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)
  const best  = Math.max(...arr).toFixed(1)
  const worst = Math.min(...arr).toFixed(1)
  return `WR: %${wr} | Ort: %${avg} | En iyi: %${best} | En kötü: %${worst} | (${arr.length} sinyal)`
}

async function main() {
  console.log('\n=== TCELL FISHER9 AL SİNYALİ - 2H / 4H / 1D (1 Yıl) ===')
  console.log('Sinyal: Fisher < trigger → trigger üstüne geçiş (Fisher < 0)\n')

  const [c2h, c4h, c1d] = await Promise.all([
    fetchCandles(2),
    fetchCandles(4),
    fetchCandles(24),
  ])

  // Her timeframe için farklı forward pencereler
  const configs = [
    { label: '2H', candles: c2h, forwards: [3, 5, 8, 12], unit: 'mum (×2s)' },
    { label: '4H', candles: c4h, forwards: [3, 5, 8, 12], unit: 'mum (×4s)' },
    { label: '1D', candles: c1d, forwards: [2, 3, 5, 7],  unit: 'mum (×1g)' },
  ]

  for (const { label, candles, forwards, unit } of configs) {
    console.log(`--- ${label} ---`)
    for (const f of forwards) {
      const arr = backtest(candles, f)
      console.log(`  ${f} ${unit.padEnd(12)} → ${stats(arr)}`)
    }
    console.log()
  }
}

main()
