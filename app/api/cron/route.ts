import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Binance'den fiyat çek
  const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT')
  const { price } = await res.json()
  const currentPrice = parseFloat(price)

  // Basit sinyal: örnek strateji (buraya kendi stratejini ekle)
  const signal = currentPrice < 60000 ? 'BUY' : currentPrice > 70000 ? 'SELL' : null

  if (!signal) {
    return NextResponse.json({ message: 'No signal', price: currentPrice })
  }

  // Kaçırılmış işlem olarak kaydet (gerçek emir gönderimi için Binance signed request gerekir)
  await supabase.from('missed_trades').insert({
    symbol: 'BTCUSDT',
    side: signal,
    signal_price: currentPrice,
    reason: 'Auto signal - manual review required',
  })

  return NextResponse.json({ signal, price: currentPrice })
}
