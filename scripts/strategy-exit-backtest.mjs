// EMA10 kesişiminden sonra kaç mum içinde en yüksek getiri?
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
  let ema = values[0]
  const result = [ema]
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k)
    result.push(ema)
  }
  return result
}

function calcStochRSI(closes, rsiPeriod = 14, stochPeriod = 14, kSmooth = 2, dSmooth = 2) {
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
    grouped.push({ close: slice[slice.length - 1].close })
  }
  return grouped
}

// Her forward pencere için ortalama getiri ve win rate hesapla
function analyze(candles, kSmooth = 2, dSmooth = 2, stochWindow = 9, maxForward = 30) {
  const closes = candles.map(c => c.close)
  const n = closes.length
  const ema10 = calcEMA(closes, 10)
  const { kArr, dArr } = calcStochRSI(closes, 14, 14, kSmooth, dSmooth)
  const kOffset = n - kArr.length

  // Her forward bar için [getiri] listesi
  const forwardReturns = Array.from({ length: maxForward }, () => [])

  for (let i = 1; i < kArr.length - maxForward; i++) {
    const ci = i + kOffset
    // StochRSI tetiklenme
    if (!(kArr[i - 1] < 25 && kArr[i - 1] < dArr[i - 1] && kArr[i] > dArr[i])) continue

    // Sonraki stochWindow içinde EMA10 kesişimi ara
    let crossIdx = -1
    for (let j = ci; j <= ci + stochWindow && j < n; j++) {
      if (closes[j] > ema10[j]) { crossIdx = j; break }
    }
    if (crossIdx < 0) continue

    const entryPrice = closes[crossIdx]
    // crossIdx'ten itibaren maxForward mum sonrasına bak
    for (let f = 1; f <= maxForward && crossIdx + f < n; f++) {
      const ret = ((closes[crossIdx + f] - entryPrice) / entryPrice) * 100
      forwardReturns[f - 1].push(ret)
    }
  }

  return forwardReturns
}

async function main() {
  console.log('\n=== EMA10 KESİŞİMİNDEN SONRA EN İYİ ÇIKIŞ NOKTASI (2H) ===')
  console.log('Giriş: EMA10 yukarı kesişim | Ölçüm: sonraki N mumda ortalama getiri\n')

  // Tüm hisseler için birleşik veri
  const combined = Array.from({ length: 30 }, () => [])

  const symResults = {}

  for (const sym of SYMBOLS) {
    try {
      const candles = await fetchCandles(sym, 2)
      const fwd = analyze(candles)
      fwd.forEach((arr, i) => combined[i].push(...arr))
      symResults[sym] = fwd
    } catch (e) {
      console.log(`${sym}: HATA - ${e.message}`)
    }
  }

  // Hisse bazında en iyi çıkış noktası
  console.log('--- HİSSE BAZINDA EN İYİ ÇIKIŞ (max getiri mumu) ---')
  console.log(`${'Sembol'.padEnd(8)} | ${'En İyi Mum'.padEnd(12)} | ${'Süre'.padEnd(10)} | ${'Ort Getiri'.padEnd(12)} | Win Rate`)
  console.log('-'.repeat(65))

  for (const [sym, fwd] of Object.entries(symResults)) {
    let bestBar = 0, bestAvgSym = -Infinity
    for (let i = 0; i < fwd.length; i++) {
      if (fwd[i].length === 0) continue
      const avg = fwd[i].reduce((a, b) => a + b, 0) / fwd[i].length
      if (avg > bestAvgSym) { bestAvgSym = avg; bestBar = i + 1 }
    }
    const arr = fwd[bestBar - 1]
    const win = arr ? (arr.filter(x => x > 0).length / arr.length * 100).toFixed(0) : '-'
    const hours = bestBar * 2
    console.log(`${sym.padEnd(8)} | ${String(bestBar).padEnd(12)} | ${`${hours}s (${(hours/24).toFixed(1)}g)`.padEnd(10)} | ${`%${bestAvgSym.toFixed(2)}`.padEnd(12)} | %${win}`)
  }

  // Genel tablo
  console.log(`\n--- TÜM HİSSELER BİRLEŞİK ---`)
  console.log(`${'Mum'.padStart(4)} | ${'Süre'.padEnd(12)} | ${'Ort Getiri'.padEnd(12)} | Win Rate`)
  console.log('-'.repeat(50))

  let bestAvg = -Infinity, bestAvgBar = 0
  let bestWin = 0, bestWinBar = 0

  for (let i = 0; i < 30; i++) {
    const arr = combined[i]
    if (arr.length === 0) continue
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length
    const win = (arr.filter(x => x > 0).length / arr.length) * 100
    const hours = (i + 1) * 2
    const days = (hours / 24).toFixed(1)

    if (avg > bestAvg) { bestAvg = avg; bestAvgBar = i + 1 }
    if (win > bestWin) { bestWin = win; bestWinBar = i + 1 }

    const flag = avg === bestAvg ? ' ← en yüksek getiri' : win === bestWin ? ' ← en yüksek win rate' : ''
    console.log(`${String(i+1).padStart(4)} | ${`${hours}s (${days}g)`.padEnd(12)} | ${`%${avg.toFixed(2)}`.padEnd(12)} | %${win.toFixed(0)}${flag}`)
  }

  console.log('\n--- ÖZET ---')
  console.log(`En yüksek ortalama getiri : ${bestAvgBar}. mum = ${bestAvgBar * 2} saat = ${(bestAvgBar * 2 / 24).toFixed(1)} gün`)
  console.log(`En yüksek win rate        : ${bestWinBar}. mum = ${bestWinBar * 2} saat = ${(bestWinBar * 2 / 24).toFixed(1)} gün`)
}

main()
