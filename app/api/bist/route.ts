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

async function fetchCandles(ticker: string, interval: '4h' | '2h', limit = 200): Promise<{ candles: Candle[], lastPrice: number }> {
  const yahooTicker = `${ticker}.IS`
  const period1 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  const result = await yf.chart(yahooTicker, { period1, interval: '1h' }) as { quotes: YahooQuote[] }

  const quotes = (result.quotes as YahooQuote[]).filter(q => q.open != null && q.close != null && q.high != null && q.low != null)

  // 09:30 IST (06:30 UTC) pre-market mumu at, kapanmamış son mumu at
  const filtered = quotes.filter(q => {
    const d = new Date(q.date)
    return !(d.getUTCHours() === 6 && d.getUTCMinutes() === 30)
  })
  const lastDate = filtered.length > 0 ? new Date(filtered[filtered.length - 1].date) : null
  const cleanQuotes = (lastDate && lastDate.getMinutes() !== 0) ? filtered.slice(0, -1) : filtered
  const lastPrice = filtered[filtered.length - 1]?.close ?? 0

  // Her günün mumlarını ayrı grupla
  const groupSize = interval === '4h' ? 4 : 2
  const grouped: Candle[] = []
  const byDay = new Map<string, typeof cleanQuotes>()
  for (const q of cleanQuotes) {
    const d = new Date(q.date)
    const dayKey = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`
    if (!byDay.has(dayKey)) byDay.set(dayKey, [])
    byDay.get(dayKey)!.push(q)
  }
  for (const dayQuotes of byDay.values()) {
    for (let i = 0; i + groupSize <= dayQuotes.length; i += groupSize) {
      const slice = dayQuotes.slice(i, i + groupSize)
      grouped.push({
        open:   slice[0].open!,
        high:   Math.max(...slice.map((q: YahooQuote) => q.high!)),
        low:    Math.min(...slice.map((q: YahooQuote) => q.low!)),
        close:  slice[slice.length - 1].close!,
        volume: slice.reduce((a: number, q: YahooQuote) => a + (q.volume ?? 0), 0),
        time:   new Date(slice[0].date).getTime(),
      })
    }
  }
  grouped.sort((a, b) => a.time - b.time)

  return { candles: grouped.slice(-limit), lastPrice }
}

export async function GET() {
  const results = await Promise.allSettled(
    SYMBOLS.map(async (sym) => {
      const [r4h, r2h] = await Promise.all([
        fetchCandles(sym, '4h'),
        fetchCandles(sym, '2h'),
      ])

      const ind4h = calcIndicators(r4h.candles, { k: 3, d: 3 })
      const ind2h = calcIndicators(r2h.candles, { k: 2, d: 2 }, 9)

      return {
        symbol: sym,
        lastClose: r4h.lastPrice,
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
      const [r4h, r2h] = await Promise.all([
        fetchCandles(sym, '4h'),
        fetchCandles(sym, '2h'),
      ])
      const ind4h = calcIndicators(r4h.candles, { k: 3, d: 3 })
      const ind2h = calcIndicators(r2h.candles, { k: 2, d: 2 }, 9)
      return { symbol: sym, lastClose: r4h.lastPrice, lastUpdated: new Date().toISOString(), tf4h: ind4h, tf2h: ind2h }
    })
  )

  const indices = indexResults.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { symbol: INDICES[i], error: (r.reason as Error).message }
  )

  return NextResponse.json({ data, indices, updatedAt: new Date().toISOString() })
}
