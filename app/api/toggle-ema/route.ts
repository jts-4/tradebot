import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: Request) {
  const { value } = await request.json()
  await supabase.from('bot_status').update({ use_ema_filter: value }).eq('id', 1)
  return NextResponse.json({ ok: true })
}
