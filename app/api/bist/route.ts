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

const FISHER_PERIODS: Record<string, { buy2h: number; sell2h: number; buy4h: number; sell4h: number }> = {
  THYAO: { buy2h: 10, sell2h:  9, buy4h: 10, sell4h: 10 },
  GARAN: { buy2h: 10, sell2h:  9, buy4h: 10, sell4h:  9 },
  AKBNK: { buy2h:  9, sell2h:  9, buy4h: 10, sell4h:  9 },
  ISCTR: { buy2h: 10, sell2h: 10, buy4h:  9, sell4h:  9 },
  TUPRS: { buy2h:  9, sell2h: 10, buy4h: 10, sell4h: 10 },
  YKBNK: { buy2h:  9, sell2h: 10, buy4h: 10, sell4h:  9 },
  KCHOL: { buy2h: 10, sell2h:  9, buy4h:  9, sell4h:  9 },
  EREGL: { buy2h: 10, sell2h:  9, buy4h: 10, sell4h:  9 },
  SAHOL: { buy2h: 10, sell2h:  9, buy4h: 10, sell4h: 10 },
  BIMAS: { buy2h: 10, sell2h:  9, buy4h:  9, sell4h: 10 },
  TCELL: { buy2h: 10, sell2h:  9, buy4h:  9, sell4h: 10 },
  ASELS: { buy2h:  9, sell2h: 10, buy4h: 10, sell4h: 10 },
  SASA:  { buy2h:  9, sell2h:  9, buy4h:  9, sell4h: 10 },
  ENKAI: { buy2h: 10, sell2h:  9, buy4h: 10, sell4h: 10 },
  OYAKC: { buy2h: 10, sell2h:  9, buy4h: 10, sell4h:  9 },
  MGROS: { buy2h:  9, sell2h: 10, buy4h:  9, sell4h:  9 },
  ASTOR: { buy2h: 10, sell2h: 10, buy4h: 10, sell4h:  9 },
  XU100: { buy2h:  9, sell2h:  9, buy4h:  9, sell4h:  9 },
  XBANK: { buy2h:  9, sell2h:  9, buy4h:  9, sell4h:  9 },
}



type YahooQuote = { open: number | null; high: number | null; low: number | null; close: number | null; volume: number | null; date: Date }

async function fetchCandles(ticker: string, interval: '4h' | '2h', limit = 200): Promise<{ candles: Candle[], lastPrice: number }> {
  const yahooTicker = `${ticker}.IS`
  const period1 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  const result = await yf.chart(yahooTicker, { period1, interval: '1h' }) as { quotes: YahooQuote[] }

  const quotes = (result.quotes as YahooQuote[]).filter(q => q.open != null && q.close != null && q.high != null && q.low != null)

  const lastPrice = quotes[quotes.length - 1]?.close ?? 0

  // Kapanmamış son mumu at
  const lastDate = quotes.length > 0 ? new Date(quotes[quotes.length - 1].date) : null
  const cleanQuotes = (lastDate && lastDate.getMinutes() !== 0) ? quotes.slice(0, -1) : quotes

  // TradingView gibi gruplama
  // BIST 07:00-15:00 UTC (10:00-18:00 IST)
  // 2H pencereler UTC: 07-09, 09-11, 11-13, 13-15
  // 4H pencereler UTC: 07-11, 11-15
  const windowHours = interval === '4h' ? 4 : 2

  function getWindowKey(date: Date): string {
    const h = date.getUTCHours()
    if (h < 7 || h >= 15) return ''
    const dayKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`
    const windowIndex = Math.floor((h - 7) / windowHours)
    return `${dayKey}-${windowIndex}`
  }

  const slotMap = new Map<string, typeof cleanQuotes>()
  for (const q of cleanQuotes) {
    const key = getWindowKey(new Date(q.date))
    if (!key) continue
    if (!slotMap.has(key)) slotMap.set(key, [])
    slotMap.get(key)!.push(q)
  }

  const grouped: Candle[] = []
  for (const slotQuotes of slotMap.values()) {
    if (slotQuotes.length === 0) continue
    grouped.push({
      open:   slotQuotes[0].open!,
      high:   Math.max(...slotQuotes.map((q: YahooQuote) => q.high!)),
      low:    Math.min(...slotQuotes.map((q: YahooQuote) => q.low!)),
      close:  slotQuotes[slotQuotes.length - 1].close!,
      volume: slotQuotes.reduce((a: number, q: YahooQuote) => a + (q.volume ?? 0), 0),
      time:   new Date(slotQuotes[0].date).getTime(),
    })
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

      const fp = FISHER_PERIODS[sym] ?? { buy4h: 9, sell4h: 9, buy2h: 9, sell2h: 9 }
      const ind4h = calcIndicators(r4h.candles, { k: 3, d: 3 }, 16, fp.buy4h)
      const ind2h = calcIndicators(r2h.candles, { k: 2, d: 2 }, 9, fp.buy2h)

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
      const fp = FISHER_PERIODS[sym] ?? { buy4h: 9, sell4h: 9, buy2h: 9, sell2h: 9 }
      const ind4h = calcIndicators(r4h.candles, { k: 3, d: 3 }, 16, fp.buy4h)
      const ind2h = calcIndicators(r2h.candles, { k: 2, d: 2 }, 9, fp.buy2h)
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
