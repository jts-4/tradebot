import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })

  const { data, error } = await supabase
    .from('bist_signal_sessions')
    .select('id, signal_type, entry_price, entry_at, max_price, exit_price, exit_at, pnl_pct, closed')
    .eq('symbol', symbol)
    .order('entry_at', { ascending: false })
    .limit(30)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
