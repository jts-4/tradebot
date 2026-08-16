import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { evaluate } from '@/lib/strategy'
import type { Candle } from '@/lib/strategy'

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']
const INTERVAL = '1h'
const LIMIT = 250

async function fetchCandles(symbol: string): Promise<Candle[]> {
  const res = await fetch(
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${INTERVAL}&limit=${LIMIT}`
  )
  const data = await res.json()
  return data.map((k: number[]) => ({
    open: parseFloat(String(k[1])),
    high: parseFloat(String(k[2])),
    low: parseFloat(String(k[3])),
    close: parseFloat(String(k[4])),
    volume: parseFloat(String(k[5])),
  }))
}

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // EMA rejim filtresi toggle — Supabase'den oku
  const { data: settingsRow } = await supabase
    .from('bot_status')
    .select('use_ema_filter')
    .eq('id', 1)
    .single()

  const useEmaRegimeFilter = settingsRow?.use_ema_filter ?? false

  // Equity
  const { data: snap } = await supabase
    .from('account_snapshots')
    .select('equity')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const equity = snap?.equity ?? 10000

  const results = []

  for (const symbol of SYMBOLS) {
    const candles = await fetchCandles(symbol)
    const lastCandle = candles[candles.length - 1]
    const result = evaluate(candles, equity, { useEmaRegimeFilter })

    // Açık pozisyon var mı?
    const { data: openTrade } = await supabase
      .from('trades')
      .select('id')
      .eq('symbol', symbol)
      .is('profit_loss', null)
      .limit(1)
      .single()

    if (openTrade) {
      results.push({ symbol, signal: 'NONE', reason: 'Açık pozisyon var' })
      continue
    }

    // Kararı kaydet
    await supabase.from('decisions').insert({
      symbol,
      candle_open: new Date(Date.now() - 3600000).toISOString(),
      candle_close: new Date().toISOString(),
      verdict: result.signal !== 'NONE' ? 'PASS' : 'SKIP',
      conditions: result.conditions,
      indicators: result.indicators,
      missing: result.missing,
      candle_highlighted: true,
    })

    if (result.signal !== 'NONE') {
      // Kaçırılmış işlem olarak kaydet (gerçek emir için Binance signed request gerekir)
      await supabase.from('missed_trades').insert({
        symbol,
        side: result.signal === 'LONG' ? 'BUY' : 'SELL',
        signal_price: lastCandle.close,
        reason: `Stop: ${result.stopPrice.toFixed(2)} | Hedef: ${result.targetPrice.toFixed(2)} | Qty: ${result.qty.toFixed(4)}`,
      })
    }

    results.push({ symbol, signal: result.signal })
  }

  // Bot durumunu güncelle
  await supabase.from('bot_status').upsert({
    id: 1,
    last_run: new Date().toISOString(),
    next_run: new Date(Date.now() + 3600000).toISOString(),
    halted: false,
  })

  return NextResponse.json({ ok: true, results })
}
