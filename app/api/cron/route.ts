import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { evaluate, calcAdaptiveLookback } from '@/lib/strategy'
import { CONFIG } from '@/lib/config'
import type { Candle } from '@/lib/strategy'
import type { InstrumentState } from '@/lib/types'

const SYMBOLS = CONFIG.venues.crypto.symbols
const INTERVAL = CONFIG.venues.crypto.interval

async function fetchCandles(symbol: string): Promise<Candle[]> {
  try {
    const res = await fetch(
      `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${INTERVAL}&limit=${CONFIG.fetchLimit}`
    )
    if (!res.ok) {
      console.error(`Binance Vision ${symbol} HTTP ${res.status}`)
      return []
    }
    const data = await res.json()
    if (!Array.isArray(data)) {
      console.error(`Binance Vision ${symbol} unexpected:`, JSON.stringify(data).slice(0, 200))
      return []
    }
    return data.map((k: unknown[]) => ({
      time: k[0] as number,
      open: parseFloat(k[1] as string),
      high: parseFloat(k[2] as string),
      low: parseFloat(k[3] as string),
      close: parseFloat(k[4] as string),
      volume: parseFloat(k[5] as string),
    }))
  } catch (e) {
    console.error(`fetchCandles ${symbol} error:`, e)
    return []
  }
}

export async function POST(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Tek sorguda tüm state'i çek
  const [
    { data: statusRow },
    { data: snapRow },
    { data: openTrades },
    { data: instrStates },
    { data: completedTrades },
  ] = await Promise.all([
    supabase.from('bot_status').select('*').eq('id', 1).single(),
    supabase.from('account_snapshots').select('*').order('created_at', { ascending: false }).limit(1).single(),
    supabase.from('trades').select('*').is('closed_at', null),
    supabase.from('instrument_state').select('*'),
    supabase.from('trades').select('trigger_lookback, profit_loss').not('profit_loss', 'is', null),
  ])

  // Halt kontrolü
  if (statusRow?.halted) {
    return NextResponse.json({ ok: false, reason: 'Bot durduruldu: ' + statusRow.halt_reason })
  }

  const equity: number = snapRow?.equity ?? CONFIG.account.startingEquity
  const allocated: number = (openTrades ?? []).reduce((s: number, t: { notional: number }) => s + t.notional, 0)
  const available: number = equity - allocated

  // Adaptive lookback
  const triggerLookback = calcAdaptiveLookback(
    (completedTrades ?? []) as { trigger_lookback: number; profit_loss: number }[]
  )

  // Tüm mumları paralel çek
  const candleResults = await Promise.allSettled(
    SYMBOLS.map(s => fetchCandles(s))
  )

  const candleMap: Record<string, Candle[]> = {}
  const candleDebug: Record<string, number> = {}
  SYMBOLS.forEach((s, i) => {
    const r = candleResults[i]
    if (r.status === 'fulfilled') {
      candleDebug[s] = r.value.length
      if (r.value.length >= CONFIG.minCandles) {
        candleMap[s] = r.value
      }
    } else {
      candleDebug[s] = -1
    }
  })

  // Risk motoru kontrolleri
  const today = new Date().toISOString().slice(0, 10)
  const dailyLoss: number = statusRow?.daily_loss_date === today ? (statusRow?.daily_loss ?? 0) : 0
  const consecutiveLosses: number = statusRow?.consecutive_losses ?? 0
  const peakEquity: number = statusRow?.peak_equity ?? equity
  const drawdown = (peakEquity - equity) / peakEquity

  const riskHalt =
    dailyLoss >= equity * CONFIG.risk.maxDailyLossPct ||
    consecutiveLosses >= CONFIG.risk.maxConsecutiveLosses ||
    drawdown >= CONFIG.risk.maxDrawdownPct

  if (riskHalt) {
    const reason =
      dailyLoss >= equity * CONFIG.risk.maxDailyLossPct ? 'Günlük zarar limiti aşıldı' :
      consecutiveLosses >= CONFIG.risk.maxConsecutiveLosses ? `${consecutiveLosses} ardışık kayıp` :
      `Tepe equity'den %${(drawdown * 100).toFixed(1)} düşüş`

    await supabase.from('bot_status').update({ halted: true, halt_reason: reason }).eq('id', 1)
    return NextResponse.json({ ok: false, reason })
  }

  // 1. ÖNCE ÇIKIŞLARI İŞLE
  const exitResults = []
  for (const trade of (openTrades ?? [])) {
    const candles = candleMap[trade.symbol]
    if (!candles) continue
    const lastCandle = candles[candles.length - 1]
    const { high, low, open } = lastCandle

    let exitPrice: number | null = null
    let exitReason: string | null = null

    // Gap kontrolü — bar stop'un ötesinde açıldıysa açılıştan çık
    if (trade.side === 'BUY') {
      if (open <= trade.stop_price) {
        exitPrice = open
        exitReason = 'STOP'
      } else if (low <= trade.stop_price) {
        exitPrice = trade.stop_price
        exitReason = 'STOP'
      } else if (high >= trade.target_price) {
        exitPrice = trade.target_price
        exitReason = 'TARGET'
      }
    } else {
      if (open >= trade.stop_price) {
        exitPrice = open
        exitReason = 'STOP'
      } else if (high >= trade.stop_price) {
        exitPrice = trade.stop_price
        exitReason = 'STOP'
      } else if (low <= trade.target_price) {
        exitPrice = trade.target_price
        exitReason = 'TARGET'
      }
    }

    if (exitPrice !== null) {
      const comm = CONFIG.account.commission
      const pl = trade.side === 'BUY'
        ? (exitPrice - trade.entry_price) * trade.quantity - trade.notional * comm * 2
        : (trade.entry_price - exitPrice) * trade.quantity - trade.notional * comm * 2

      await supabase.from('trades').update({
        exit_price: exitPrice,
        profit_loss: pl,
        exit_reason: exitReason,
        closed_at: new Date().toISOString(),
      }).eq('id', trade.id)

      exitResults.push({ symbol: trade.symbol, exitReason, pl })
    }
  }

  // 2. GİRİŞLERİ DEĞERLENDİR
  const entryResults = []
  for (const symbol of SYMBOLS) {
    const candles = candleMap[symbol]
    if (!candles) continue

    // Açık pozisyon var mı?
    const hasOpen = (openTrades ?? []).some((t: { symbol: string; closed_at: string | null }) => t.symbol === symbol && !t.closed_at)
    if (hasOpen) continue

    const instrState: InstrumentState = (instrStates ?? []).find((s: InstrumentState) => s.symbol === symbol) ?? {
      symbol,
      trigger_type: null,
      trigger_bar_time: null,
      trigger_direction: null,
    }

    const result = evaluate(candles, equity, available, instrState, triggerLookback, statusRow?.use_rsi_filter ?? false)

    // Enstrüman state güncelle
    if (result.triggerFired) {
      const lastBar = candles[candles.length - 1]
      await supabase.from('instrument_state').upsert({
        symbol,
        trigger_type: 'WT',
        trigger_bar_time: lastBar.time,
        trigger_direction: result.triggerDirection,
      })
    }

    const lastCandle = candles[candles.length - 1]
    const candleOpen = new Date(lastCandle.time).toISOString()
    const candleClose = new Date(lastCandle.time + 4 * 3600000).toISOString()

    // Kararı kaydet
    await supabase.from('decisions').insert({
      symbol,
      candle_open: candleOpen,
      candle_close: candleClose,
      verdict: result.signal !== 'NONE' ? 'PASS' : 'SKIP',
      conditions: result.conditions,
      indicators: result.indicators,
      missing: result.missing,
      fisher_active: result.fisherActive ?? false,
      strategy_version: CONFIG.strategyVersion,
    })

    if (result.signal === 'NONE') {
      entryResults.push({ symbol, signal: 'NONE' })
      continue
    }

    // Sermaye yeterli mi?
    if ((result.notional ?? 0) > available) {
      await supabase.from('missed_opportunities').insert({
        symbol,
        side: result.signal === 'LONG' ? 'BUY' : 'SELL',
        signal_price: lastCandle.close,
        required_notional: result.notional ?? 0,
        available_capital: available,
        stop_price: result.stopPrice,
        target_price: result.targetPrice,
        reason: 'Yetersiz sermaye',
      })
      entryResults.push({ symbol, signal: result.signal, reason: 'Yetersiz sermaye' })
      continue
    }

    // Kâğıt işlem aç
    const { error: tradeErr } = await supabase.from('trades').insert({
      symbol,
      side: result.signal === 'LONG' ? 'BUY' : 'SELL',
      entry_price: result.entryPrice,
      quantity: result.qty,
      notional: result.notional ?? 0,
      stop_price: result.stopPrice,
      target_price: result.targetPrice,
      exit_price: null,
      profit_loss: null,
      exit_reason: null,
      strategy_version: CONFIG.strategyVersion,
      trigger_lookback: triggerLookback,
      fisher_active: result.fisherActive ?? false,
    })

    entryResults.push({ symbol, signal: result.signal })
  }

  // Adaptive lookback güncelle (30 işlem dolmuşsa)
  const newLookback = calcAdaptiveLookback(
    (completedTrades ?? []) as { trigger_lookback: number; profit_loss: number }[]
  )

  // Equity snapshot — allocated'ı her zaman trades tablosundan hesapla
  const { data: openForSnap } = await supabase.from('trades').select('notional').is('closed_at', null)
  const newAllocated = (openForSnap ?? []).reduce((s: number, t: { notional: number }) => s + t.notional, 0)
  const totalPL = (completedTrades ?? []).reduce((s: number, t: { profit_loss: number }) => s + (t.profit_loss ?? 0), 0)
  const newEquity = CONFIG.account.startingEquity + totalPL
  const totalReturn = ((newEquity - CONFIG.account.startingEquity) / CONFIG.account.startingEquity) * 100

  await Promise.all([
    supabase.from('account_snapshots').insert({
      equity: newEquity,
      total_return: totalReturn,
      allocated: newAllocated,
      available: newEquity - newAllocated,
    }),
    supabase.from('bot_status').upsert({
      id: 1,
      last_run: new Date().toISOString(),
      next_run: new Date(Date.now() + 3600000).toISOString(),
      halted: false,
      consecutive_losses: consecutiveLosses,
      daily_loss: dailyLoss,
      daily_loss_date: today,
      peak_equity: Math.max(peakEquity, newEquity),
      trigger_lookback: newLookback,
    }),
  ])

  return NextResponse.json({ ok: true, exits: exitResults, entries: entryResults, triggerLookback: newLookback, candleSymbols: Object.keys(candleMap), candleDebug })
}
