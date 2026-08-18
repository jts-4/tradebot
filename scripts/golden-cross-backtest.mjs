// Golden Cross & Yarı Golden Cross Backtest
// 4H: 10 mum sonra, 2H: 20 mum sonra fiyat yükseldi mi?

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

function align(arr, n) {
  if (arr.length >= n) return arr.slice(arr.length - n)
  return [...Array(n - arr.length).fill(null), ...arr]
}

async function fetchCandles(ticker, intervalHours, days = 365) {
  const period1 = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const result = await yf.chart(`${ticker}.IS`, { period1, interval: '1h' })
  const quotes = result.quotes.filter(q => q.open != null && q.close != null)

  const grouped = []
  for (let i = 0; i + intervalHours <= quotes.length; i += intervalHours) {
    const slice = quotes.slice(i, i + intervalHours)
    grouped.push({
      close: slice[slice.length - 1].close,
      time: new Date(slice[0].date).getTime(),
    })
  }
  return grouped
}

function backtest(candles, forwardBars, label) {
  const closes = candles.map(c => c.close)
  const n = closes.length

  const ma7arr  = align(calcSMA(closes, 7),  n)
  const ma14arr = align(calcSMA(closes, 14), n)
  const ma21arr = align(calcSMA(closes, 21), n)

  const results = { golden: { total: 0, win: 0 }, half: { total: 0, win: 0 } }

  for (let i = 1; i < n - forwardBars; i++) {
    const ma7  = ma7arr[i],  prevMa7  = ma7arr[i-1]
    const ma14 = ma14arr[i], prevMa14 = ma14arr[i-1]
    const ma21 = ma21arr[i], prevMa21 = ma21arr[i-1]
    if (!ma7 || !ma14 || !ma21 || !prevMa7 || !prevMa14 || !prevMa21) continue

    const futureClose = closes[i + forwardBars]
    const entryClose  = closes[i]
    const win = futureClose > entryClose

    // Golden Cross: MA7 × MA21
    if (prevMa7 < prevMa21 && ma7 > ma21) {
      results.golden.total++
      if (win) results.golden.win++
    }

    // Yarı Golden Cross: MA7 × MA14
    if (prevMa7 < prevMa14 && ma7 > ma14) {
      results.half.total++
      if (win) results.half.win++
    }
  }

  return results
}

async function main() {
  console.log('\n=== GOLDEN CROSS BACKTEST (2 Yıl) ===\n')
  console.log(`${'Sembol'.padEnd(8)} | ${'4H Golden'.padEnd(18)} | ${'4H Yarı'.padEnd(18)} | ${'2H Golden'.padEnd(18)} | ${'2H Yarı'}`)
  console.log('-'.repeat(95))

  const totals = {
    g4: { total: 0, win: 0 }, h4: { total: 0, win: 0 },
    g2: { total: 0, win: 0 }, h2: { total: 0, win: 0 },
  }

  for (const sym of SYMBOLS) {
    try {
      const [c4h, c2h] = await Promise.all([
        fetchCandles(sym, 4),
        fetchCandles(sym, 2),
      ])

      const r4 = backtest(c4h, 10, '4H')
      const r2 = backtest(c2h, 20, '2H')

      const fmt = (r) => r.total === 0 ? 'veri yok'.padEnd(18) :
        `${((r.win/r.total)*100).toFixed(0)}% (${r.win}/${r.total})`.padEnd(18)

      console.log(
        `${sym.padEnd(8)} | ${fmt(r4.golden)} | ${fmt(r4.half)} | ${fmt(r2.golden)} | ${fmt(r2.half)}`
      )

      totals.g4.total += r4.golden.total; totals.g4.win += r4.golden.win
      totals.h4.total += r4.half.total;   totals.h4.win += r4.half.win
      totals.g2.total += r2.golden.total; totals.g2.win += r2.golden.win
      totals.h2.total += r2.half.total;   totals.h2.win += r2.half.win
    } catch (e) {
      console.log(`${sym.padEnd(8)} | HATA: ${e.message}`)
    }
  }

  console.log('-'.repeat(95))
  const fmt = (r) => r.total === 0 ? 'veri yok'.padEnd(18) :
    `${((r.win/r.total)*100).toFixed(0)}% (${r.win}/${r.total})`.padEnd(18)
  console.log(
    `${'TOPLAM'.padEnd(8)} | ${fmt(totals.g4)} | ${fmt(totals.h4)} | ${fmt(totals.g2)} | ${fmt(totals.h2)}`
  )
  console.log('\n4H: 10 mum sonra fiyat yükseldi mi? | 2H: 20 mum sonra fiyat yükseldi mi?\n')
}

main()
