// StochRSI tetiklenmesinden sonra EMA10 kesişimi kaçıncı mumda oluyor?
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
  const result = []
  let ema = values[0]
  result.push(ema)
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k)
    result.push(ema)
  }
  return result
}

function calcStochRSI(closes, rsiPeriod = 14, stochPeriod = 14, kSmooth = 2, dSmooth = 2) {
  // RSI
  const gains = [], losses = []
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    gains.push(diff > 0 ? diff : 0)
    losses.push(diff < 0 ? -diff : 0)
  }
  const rsi = []
  let avgGain = gains.slice(0, rsiPeriod).reduce((a, b) => a + b, 0) / rsiPeriod
  let avgLoss = losses.slice(0, rsiPeriod).reduce((a, b) => a + b, 0) / rsiPeriod
  rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss))
  for (let i = rsiPeriod; i < gains.length; i++) {
    avgGain = (avgGain * (rsiPeriod - 1) + gains[i]) / rsiPeriod
    avgLoss = (avgLoss * (rsiPeriod - 1) + losses[i]) / rsiPeriod
    rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss))
  }

  // Stoch of RSI
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
  const quotes = result.quotes.filter(q => q.open != null && q.close != null && q.high != null && q.low != null)
  const grouped = []
  for (let i = 0; i + intervalHours <= quotes.length; i += intervalHours) {
    const slice = quotes.slice(i, i + intervalHours)
    grouped.push({
      close: slice[slice.length - 1].close,
      high:  Math.max(...slice.map(q => q.high)),
      low:   Math.min(...slice.map(q => q.low)),
    })
  }
  return grouped
}

function analyze(candles, kSmooth, dSmooth, maxWindow = 30) {
  const closes = candles.map(c => c.close)
  const n = closes.length

  const ema10Full = calcEMA(closes, 10)
  const { kArr, dArr } = calcStochRSI(closes, 14, 14, kSmooth, dSmooth)

  // kArr/dArr offset (closes dizisine göre)
  const kOffset = n - kArr.length

  const crossBars = [] // tetiklenme → EMA10 kesişimi kaç mum sonra?
  const noCross = []   // maxWindow içinde kesişim olmadı

  for (let i = 1; i < kArr.length - maxWindow; i++) {
    const ci = i + kOffset // closes index
    // StochRSI tetiklenme: K<25, K önceki D altında, şimdi D üstüne geçti
    if (kArr[i - 1] < 25 && kArr[i - 1] < dArr[i - 1] && kArr[i] > dArr[i]) {
      // Sonraki maxWindow mum içinde EMA10 yukarı kesişim ara
      let found = false
      for (let j = ci; j <= ci + maxWindow && j < n; j++) {
        if (closes[j] > ema10Full[j]) {
          crossBars.push(j - ci)
          found = true
          break
        }
      }
      if (!found) noCross.push(ci)
    }
  }

  return { crossBars, noCross }
}

async function main() {
  console.log('\n=== STRATEJİ PENCERESİ ANALİZİ (2H, 1 Yıl) ===')
  console.log('StochRSI(2,2,14,14) tetiklenmesinden sonra EMA10 kesişimi kaçıncı mumda?\n')

  const allCrossBars = []
  let totalTriggers = 0, totalNoCross = 0

  for (const sym of SYMBOLS) {
    try {
      const candles = await fetchCandles(sym, 2)
      const { crossBars, noCross } = analyze(candles, 2, 2)

      totalTriggers += crossBars.length + noCross.length
      totalNoCross  += noCross.length
      allCrossBars.push(...crossBars)

      if (crossBars.length === 0) {
        console.log(`${sym.padEnd(8)}: tetiklenme yok veya hiç kesişim olmadı`)
        continue
      }

      const avg = (crossBars.reduce((a, b) => a + b, 0) / crossBars.length).toFixed(1)
      const med = [...crossBars].sort((a, b) => a - b)[Math.floor(crossBars.length / 2)]
      const pct = ((crossBars.length / (crossBars.length + noCross.length)) * 100).toFixed(0)

      // Dağılım: 1-3, 4-6, 7-9, 10+
      const b1 = crossBars.filter(x => x <= 3).length
      const b2 = crossBars.filter(x => x > 3 && x <= 6).length
      const b3 = crossBars.filter(x => x > 6 && x <= 9).length
      const b4 = crossBars.filter(x => x > 9).length

      console.log(`${sym.padEnd(8)}: ort=${avg} mum | medyan=${med} | kesişim oranı=${pct}% (${crossBars.length}/${crossBars.length + noCross.length}) | dağılım: 1-3:${b1} 4-6:${b2} 7-9:${b3} 10+:${b4}`)
    } catch (e) {
      console.log(`${sym.padEnd(8)}: HATA - ${e.message}`)
    }
  }

  console.log('\n--- GENEL ÖZET ---')
  if (allCrossBars.length > 0) {
    const avg = (allCrossBars.reduce((a, b) => a + b, 0) / allCrossBars.length).toFixed(1)
    const sorted = [...allCrossBars].sort((a, b) => a - b)
    const med = sorted[Math.floor(sorted.length / 2)]
    const p75 = sorted[Math.floor(sorted.length * 0.75)]
    const p90 = sorted[Math.floor(sorted.length * 0.90)]
    const pct = ((allCrossBars.length / totalTriggers) * 100).toFixed(0)

    const b1 = allCrossBars.filter(x => x <= 3).length
    const b2 = allCrossBars.filter(x => x > 3 && x <= 6).length
    const b3 = allCrossBars.filter(x => x > 6 && x <= 9).length
    const b4 = allCrossBars.filter(x => x > 9).length

    console.log(`Toplam tetiklenme : ${totalTriggers}`)
    console.log(`EMA10 kesişim olan: ${allCrossBars.length} (%${pct})`)
    console.log(`Kesişim olmayan   : ${totalNoCross}`)
    console.log(`Ortalama mum      : ${avg}`)
    console.log(`Medyan mum        : ${med}`)
    console.log(`%75 persentil     : ${p75} mum içinde`)
    console.log(`%90 persentil     : ${p90} mum içinde`)
    console.log(`Dağılım           : 1-3 mum: ${b1} | 4-6 mum: ${b2} | 7-9 mum: ${b3} | 10+ mum: ${b4}`)
    console.log(`\n→ Önerilen pencere: ${p75} mum (tüm kesişimlerin %75'ini yakalar)`)
  }
}

main()
