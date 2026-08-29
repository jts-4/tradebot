// T3 Backtest - T3 yukarı döndüğünde (bullish) yükseliş gelme oranı
import YahooFinance from 'yahoo-finance2'
const yf = new YahooFinance()

const SYMBOLS = [
  'THYAO', 'GARAN', 'AKBNK', 'ISCTR', 'TUPRS',
  'YKBNK', 'KCHOL', 'EREGL', 'SAHOL', 'BIMAS',
  'TCELL', 'ASELS', 'SASA', 'ENKAI', 'OYAKC',
  'MGROS', 'ASTOR',
]

function calcEMA(values, period) {
  const k = 2 / (period + 1)
  let e = values[0]
  const r = [e]
  for (let i = 1; i < values.length; i++) { e = values[i] * k + e * (1 - k); r.push(e) }
  return r
}

function calcT3(closes, period = 7, b = 0.7) {
  const c1 = -(b * b * b)
  const c2 = 3 * b * b + 3 * b * b * b
  const c3 = -6 * b * b - 3 * b - 3 * b * b * b
  const c4 = 1 + 3 * b + b * b * b + 3 * b * b
  const e1 = calcEMA(closes, period)
  const e2 = calcEMA(e1, period)
  const e3 = calcEMA(e2, period)
  const e4 = calcEMA(e3, period)
  const e5 = calcEMA(e4, period)
  const e6 = calcEMA(e5, period)
  const n = e6.length
  const tail = arr => arr.length >= n ? arr.slice(arr.length - n) : [...Array(n - arr.length).fill(NaN), ...arr]
  const a3 = tail(e3), a4 = tail(e4), a5 = tail(e5)
  return e6.map((v6, i) => c1 * v6 + c2 * a5[i] + c3 * a4[i] + c4 * a3[i])
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

function backtest(candles, forwardBars) {
  const closes = candles.map(c => c.close)
  const t3 = calcT3(closes)
  const offset = closes.length - t3.length
  let total = 0, win = 0

  for (let i = 1; i < t3.length - forwardBars; i++) {
    // T3 al sinyali: önceki mum düşüyordu, şimdi yükseliyor (dönüş)
    if (t3[i - 1] >= t3[i - 2] || t3[i] <= t3[i - 1]) continue // sadece aşağıdan yukarı dönüş
    // Ek filtre: T3 fiyatın altında olsun (oversold bölge)
    const ci = i + offset
    if (closes[ci] < t3[i]) continue // fiyat T3 altındaysa sinyal daha güçlü değil, atla

    const entryPrice = closes[ci]
    const futurePrice = closes[ci + forwardBars]
    total++
    if (futurePrice > entryPrice) win++
  }
  return { total, win }
}

async function main() {
  const FORWARDS = [3, 5, 8, 12] // 6s, 10s, 16s, 24s

  console.log('\n=== T3 AL SİNYALİ BACKTEST (2H, 1 Yıl) ===')
  console.log('Sinyal: T3 aşağıdan yukarı döndü + fiyat T3 üstünde\n')
  console.log(`${'Sembol'.padEnd(8)} | ${FORWARDS.map(f => `${f*2}s`.padEnd(14)).join(' | ')}`)
  console.log('-'.repeat(8 + FORWARDS.length * 17))

  let totals = FORWARDS.map(() => ({ total: 0, win: 0 }))

  for (const sym of SYMBOLS) {
    try {
      const candles = await fetchCandles(sym, 2)
      const parts = FORWARDS.map(f => {
        const { total, win } = backtest(candles, f)
        return { total, win }
      })
      parts.forEach((p, i) => { totals[i].total += p.total; totals[i].win += p.win })

      const row = parts.map(p =>
        p.total === 0 ? 'veri yok'.padEnd(14) :
        `%${((p.win/p.total)*100).toFixed(0)} (${p.win}/${p.total})`.padEnd(14)
      ).join(' | ')
      console.log(`${sym.padEnd(8)} | ${row}`)
    } catch (e) {
      console.log(`${sym.padEnd(8)} | HATA: ${e.message}`)
    }
  }

  console.log('-'.repeat(8 + FORWARDS.length * 17))
  const row = totals.map(p =>
    p.total === 0 ? 'veri yok'.padEnd(14) :
    `%${((p.win/p.total)*100).toFixed(0)} (${p.win}/${p.total})`.padEnd(14)
  ).join(' | ')
  console.log(`${'TOPLAM'.padEnd(8)} | ${row}`)
  console.log(`\nPencereler: ${FORWARDS.map(f => `${f} mum=${f*2}s`).join(', ')}`)
}

main()
