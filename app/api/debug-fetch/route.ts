import { NextResponse } from 'next/server'

const URLS = [
  'https://api.bybit.com/v5/market/kline?category=spot&symbol=BTCUSDT&interval=240&limit=3',
  'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=4h&limit=3',
  'https://api1.binance.com/api/v3/klines?symbol=BTCUSDT&interval=4h&limit=3',
  'https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=4h&limit=3',
  'https://min-api.cryptocompare.com/data/v2/histohour?fsym=BTC&tsym=USDT&limit=3',
]

export async function GET() {
  const results: Record<string, string> = {}

  await Promise.all(
    URLS.map(async (url) => {
      const key = new URL(url).hostname
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
        const text = await res.text()
        results[key] = `HTTP ${res.status} — ${text.slice(0, 150)}`
      } catch (e: unknown) {
        results[key] = `ERROR: ${e instanceof Error ? e.message : String(e)}`
      }
    })
  )

  return NextResponse.json(results)
}
