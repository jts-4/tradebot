import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import YahooFinance from 'yahoo-finance2'
import { calcIndicators } from '@/lib/bist-indicators'
import type { Candle } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CRON_SECRET = 'tradebotcron2024'

const SYMBOLS = [
  'THYAO', 'GARAN', 'AKBNK', 'ISCTR', 'TUPRS',
  'YKBNK', 'KCHOL', 'EREGL', 'SAHOL', 'BIMAS',
  'TCELL', 'ASELS', 'SASA', 'ENKAI', 'OYAKC',
  'MGROS', 'ASTOR',
]

type YahooQuote = { open: number | null; high: number | null; low: number | null; close: number | null; volume: number | null; date: Date }

const yf = new YahooFinance()

async function fetchCandles(ticker: string, interval: '4h' | '2h'): Promise<Candle[]> {
  const period1 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  const result = await yf.chart(`${ticker}.IS`, { period1, interval: '1h' }) as { quotes: YahooQuote[] }
  const quotes = result.quotes.filter(q => q.open != null && q.close != null && q.high != null && q.low != null)
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
  return grouped.slice(-200)
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const istHour = (now.getUTCHours() + 3) % 24
  const istMin  = now.getUTCMinutes()
  const dayOfWeek = now.getUTCDay()
  const istMinutes = istHour * 60 + istMin

  if (dayOfWeek === 0 || dayOfWeek === 6) return NextResponse.json({ skipped: 'weekend' })
  if (istMinutes < 600 || istMinutes > 1100) return NextResponse.json({ skipped: 'outside_hours' })

  const results = await Promise.allSettled(
    SYMBOLS.map(async (sym) => {
      const [c4h, c2h] = await Promise.all([fetchCandles(sym, '4h'), fetchCandles(sym, '2h')])
      const ind4h = calcIndicators(c4h, { k: 3, d: 3 })
      const ind2h = calcIndicators(c2h, { k: 2, d: 2 })

      const sig = (ind: typeof ind4h) => [
        ind.stochRsiSignal && 'StochRSI',
        ind.ema10Signal    && 'EMA10',
        ind.wtSignal       && 'WT',
        ind.fisherSignal   && 'Fisher9',
        ind.rsiSignal      && 'RSI14',
        ind.goldenCross    && 'GoldenCross',
        ind.halfGoldenCross && 'YariGoldenCross',
      ].filter(Boolean) as string[]

      return {
        symbol: sym,
        price: c4h[c4h.length - 1]?.close ?? 0,
        signals_4h: sig(ind4h),
        signals_2h: sig(ind2h),
        volume_ok: ind4h.volumeAboveAvg,
        created_at: new Date().toISOString(),
      }
    })
  )

  const signals = results
    .filter(r => r.status === 'fulfilled')
    .map(r => (r as PromiseFulfilledResult<typeof results[0] extends PromiseFulfilledResult<infer T> ? T : never>).value)

  if (signals.length > 0) {
    await supabase.from('bist_signals').insert(signals)
  }

  return NextResponse.json({ ok: true, processed: signals.length, at: new Date().toISOString() })
}
