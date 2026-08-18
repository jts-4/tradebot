import { NextResponse } from 'next/server'
import YahooFinance from 'yahoo-finance2'
import { calcIndicators } from '@/lib/bist-indicators'
import type { Candle } from '@/lib/types'

export const dynamic = 'force-dynamic'

const yf = new YahooFinance()

const SYMBOLS = [
  'THYAO', 'GARAN', 'AKBNK', 'ISCTR', 'TUPRS',
  'YKBNK', 'KCHOL', 'EREGL', 'SAHOL', 'BIMAS',
  'TCELL', 'ASELS', 'SASA', 'ENKAI', 'OYAKC',
  'MGROS', 'ASTOR',
]

const INDICES = ['XU100', 'XBANK']

type YahooQuote = { open: number | null; high: number | null; low: number | null; close: number | null; volume: number | null; date: Date }

async function fetchCandles(ticker: string, interval: '4h' | '2h', limit = 200): Promise<Candle[]> {
  const yahooTicker = `${ticker}.IS`
  const period1 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  const result = await yf.chart(yahooTicker, { period1, interval: '1h' }) as { quotes: YahooQuote[] }

  const quotes = (result.quotes as YahooQuote[]).filter(q => q.open != null && q.close != null && q.high != null && q.low != null)

  // 1h mumu → 4h veya 2h gruplama
  const groupSize = interval === '4h' ? 4 : 2
  const grouped: Candle[] = []
  for (let i = 0; i + groupSize <= quotes.length; i += groupSize) {
    const slice = quotes.slice(i, i + groupSize)
    grouped.push({
      open:   slice[0].open!,
      high:   Math.max(...slice.map((q: YahooQuote) => q.high!)),
      low:    Math.min(...slice.map((q: YahooQuote) => q.low!)),
      close:  slice[slice.length - 1].close!,
      volume: slice.reduce((a: number, q: YahooQuote) => a + (q.volume ?? 0), 0),
      time:   new Date(slice[0].date).getTime(),
    })
  }

  return grouped.slice(-limit)
}

export async function GET() {
  const results = await Promise.allSettled(
    SYMBOLS.map(async (sym) => {
      const [candles4h, candles2h] = await Promise.all([
        fetchCandles(sym, '4h'),
        fetchCandles(sym, '2h'),
      ])

      const ind4h = calcIndicators(candles4h, { k: 3, d: 3 })
      const ind2h = calcIndicators(candles2h, { k: 2, d: 2 })

      const lastClose = candles4h[candles4h.length - 1]?.close ?? 0

      return {
        symbol: sym,
        lastClose,
        lastUpdated: new Date().toISOString(),
        tf4h: ind4h,
        tf2h: ind2h,
      }
    })
  )

  const data = results.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { symbol: SYMBOLS[i], error: (r.reason as Error).message }
  )

  const indexResults = await Promise.allSettled(
    INDICES.map(async (sym) => {
      const [candles4h, candles2h] = await Promise.all([
        fetchCandles(sym, '4h'),
        fetchCandles(sym, '2h'),
      ])
      const ind4h = calcIndicators(candles4h, { k: 3, d: 3 })
      const ind2h = calcIndicators(candles2h, { k: 2, d: 2 })
      return { symbol: sym, lastClose: candles4h[candles4h.length - 1]?.close ?? 0, lastUpdated: new Date().toISOString(), tf4h: ind4h, tf2h: ind2h }
    })
  )

  const indices = indexResults.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { symbol: INDICES[i], error: (r.reason as Error).message }
  )

  return NextResponse.json({ data, indices, updatedAt: new Date().toISOString() })
}
