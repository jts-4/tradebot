// Fisher9 vs Fisher10 - Giriş fiyatı farkı
// Aynı harekette F9 ve F10 ne kadar geç giriyor, kaç % fark var?
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

function analyze(candles) {
  const closes = candles.map(c => c.close)
  const n = candles.length
  const { fishArr: f9, trigArr: t9 } = calcFisher(candles, 9)
  const { fishArr: f10, trigArr: t10 } = calcFisher(candles, 10)
  const off9  = n - f9.length
  const off10 = n - f10.length

  // F9 al sinyallerini bul
  const f9signals = new Set()
  for (let i = 1; i < f9.length - 1; i++) {
    if (f9[i-1] < t9[i-1] && f9[i] > t9[i] && f9[i-1] < 0) f9signals.add(i + off9)
  }

  // F10 al sinyallerini bul
  const f10signals = new Set()
  for (let i = 1; i < f10.length - 1; i++) {
    if (f10[i-1] < t10[i-1] && f10[i] > t10[i] && f10[i-1] < 0) f10signals.add(i + off10)
  }

  // F9 sinyali için en yakın F10 sinyalini bul (±5 mum içinde)
  const priceDiffs = []
  const barDiffs = []

  for (const idx9 of f9signals) {
    let closest = null, minDist = 999
    for (const idx10 of f10signals) {
      const dist = idx10 - idx9 // pozitif = F10 geç geldi
      if (dist >= 0 && dist <= 5 && dist < minDist) {
        minDist = dist
        closest = idx10
      }
    }
    if (closest !== null && closest < n && idx9 < n) {
      const price9  = closes[idx9]
      const price10 = closes[closest]
      const pctDiff = ((price10 - price9) / price9) * 100
      priceDiffs.push(pctDiff)
      barDiffs.push(minDist)
    }
  }

  return { priceDiffs, barDiffs }
}

async function main() {
  console.log('\n=== FISHER9 vs FISHER10 GİRİŞ FARKI ANALİZİ (4H, 1 Yıl) ===')
  console.log('Aynı harekette F10, F9\'dan kaç mum geç giriyor ve kaç % daha pahalı?\n')
  console.log(`${'Sembol'.padEnd(8)} | ${'Eşleşen'.padEnd(8)} | ${'Ort Bar Farkı'.padEnd(15)} | ${'Ort Fiyat Farkı'.padEnd(16)} | ${'Max Fiyat Farkı'}`)
  console.log('-'.repeat(75))

  const allPriceDiffs = [], allBarDiffs = []

  for (const sym of SYMBOLS) {
    try {
      const candles = await fetchCandles(sym, 4)
      const { priceDiffs, barDiffs } = analyze(candles)
      allPriceDiffs.push(...priceDiffs)
      allBarDiffs.push(...barDiffs)

      if (priceDiffs.length === 0) { console.log(`${sym.padEnd(8)} | eşleşme yok`); continue }

      const avgBar   = (barDiffs.reduce((a,b)=>a+b,0) / barDiffs.length).toFixed(2)
      const avgPrice = (priceDiffs.reduce((a,b)=>a+b,0) / priceDiffs.length).toFixed(2)
      const maxPrice = Math.max(...priceDiffs).toFixed(2)

      console.log(`${sym.padEnd(8)} | ${String(priceDiffs.length).padEnd(8)} | ${avgBar} mum`.padEnd(32) + ` | %${avgPrice.padEnd(15)} | %${maxPrice}`)
    } catch(e) {
      console.log(`${sym.padEnd(8)} | HATA`)
    }
  }

  console.log('-'.repeat(75))
  if (allPriceDiffs.length > 0) {
    const avgBar   = (allBarDiffs.reduce((a,b)=>a+b,0) / allBarDiffs.length).toFixed(2)
    const avgPrice = (allPriceDiffs.reduce((a,b)=>a+b,0) / allPriceDiffs.length).toFixed(2)
    const maxPrice = Math.max(...allPriceDiffs).toFixed(2)
    const pct0 = allBarDiffs.filter(b => b === 0).length
    const pct1 = allBarDiffs.filter(b => b === 1).length
    const pct2p = allBarDiffs.filter(b => b >= 2).length

    console.log(`${'TOPLAM'.padEnd(8)} | ${String(allPriceDiffs.length).padEnd(8)} | ${avgBar} mum`.padEnd(32) + ` | %${avgPrice.padEnd(15)} | %${maxPrice}`)
    console.log(`\nBar farkı dağılımı: Aynı mum: ${pct0} | 1 mum geç: ${pct1} | 2+ mum geç: ${pct2p}`)
    console.log(`\nSonuç: F10, F9'dan ortalama ${avgBar} mum geç giriyor ve %${avgPrice} daha pahalıya alıyor`)
  }
}

main()
