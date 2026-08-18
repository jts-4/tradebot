import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CRON_SECRET = 'tradebotcron2024'

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Hafta içi 10:00-18:20 kontrolü (UTC+3)
  const now = new Date()
  const istHour = (now.getUTCHours() + 3) % 24
  const istMin  = now.getUTCMinutes()
  const dayOfWeek = now.getUTCDay() // 0=Pazar, 6=Cumartesi
  const istMinutes = istHour * 60 + istMin

  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return NextResponse.json({ skipped: 'weekend' })
  }
  if (istMinutes < 600 || istMinutes > 1100) { // 10:00 - 18:20
    return NextResponse.json({ skipped: 'outside_hours' })
  }

  // /api/bist endpoint'ini çağır
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'

  const res = await fetch(`${baseUrl}/api/bist`)
  const { data } = await res.json()

  const signals = data.filter((d: { error?: string; tf4h?: { stochRsiSignal: boolean; ema10Signal: boolean; wtSignal: boolean; fisherSignal: boolean; rsiSignal: boolean; goldenCross: boolean; halfGoldenCross: boolean; volumeAboveAvg: boolean }; tf2h?: { stochRsiSignal: boolean; ema10Signal: boolean; wtSignal: boolean; fisherSignal: boolean; rsiSignal: boolean; goldenCross: boolean; halfGoldenCross: boolean; volumeAboveAvg: boolean } }) => !d.error).map((d: {
    symbol: string
    lastClose: number
    tf4h: { stochRsiSignal: boolean; ema10Signal: boolean; wtSignal: boolean; fisherSignal: boolean; rsiSignal: boolean; goldenCross: boolean; halfGoldenCross: boolean; volumeAboveAvg: boolean }
    tf2h: { stochRsiSignal: boolean; ema10Signal: boolean; wtSignal: boolean; fisherSignal: boolean; rsiSignal: boolean; goldenCross: boolean; halfGoldenCross: boolean; volumeAboveAvg: boolean }
  }) => {
    const activeSignals4h = [
      d.tf4h.stochRsiSignal && 'StochRSI',
      d.tf4h.ema10Signal    && 'EMA10',
      d.tf4h.wtSignal       && 'WT',
      d.tf4h.fisherSignal   && 'Fisher9',
      d.tf4h.rsiSignal      && 'RSI14',
      d.tf4h.goldenCross    && 'GoldenCross',
      d.tf4h.halfGoldenCross && 'YariGoldenCross',
    ].filter(Boolean)

    const activeSignals2h = [
      d.tf2h.stochRsiSignal && 'StochRSI',
      d.tf2h.ema10Signal    && 'EMA10',
      d.tf2h.wtSignal       && 'WT',
      d.tf2h.fisherSignal   && 'Fisher9',
      d.tf2h.rsiSignal      && 'RSI14',
      d.tf2h.goldenCross    && 'GoldenCross',
      d.tf2h.halfGoldenCross && 'YariGoldenCross',
    ].filter(Boolean)

    return {
      symbol: d.symbol,
      price: d.lastClose,
      signals_4h: activeSignals4h,
      signals_2h: activeSignals2h,
      volume_ok: d.tf4h.volumeAboveAvg,
      created_at: new Date().toISOString(),
    }
  })

  if (signals.length > 0) {
    await supabase.from('bist_signals').insert(signals)
  }

  return NextResponse.json({ ok: true, processed: signals.length, at: new Date().toISOString() })
}
