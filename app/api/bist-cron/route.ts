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
  const lastDate = quotes.length > 0 ? new Date(quotes[quotes.length - 1].date) : null
  const cleanQuotes = (lastDate && lastDate.getMinutes() !== 0) ? quotes.slice(0, -1) : quotes

  // TradingView gibi UTC sabit pencere gruplama
  // BIST 07:00-15:00 UTC (10:00-18:00 IST)
  // 2H: 07-09, 09-11, 11-13, 13-15 | 4H: 07-11, 11-15
  const windowHours = interval === '4h' ? 4 : 2
  function getWindowKey(date: Date): string {
    const h = date.getUTCHours()
    if (h < 7 || h >= 15) return ''
    const dayKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`
    return `${dayKey}-${Math.floor((h - 7) / windowHours)}`
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
      const ind2h = calcIndicators(c2h, { k: 2, d: 2 }, 9)

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
