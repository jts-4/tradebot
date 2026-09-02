'use client'

import { useEffect, useState } from 'react'

type IndicatorResult = {
  stochRsiSignal: boolean
  stochRsiK: number
  stochRsiD: number
  ema10Signal: boolean
  ema10: number
  wtSignal: boolean
  wt1: number
  wt2: number
  fisherSignal: boolean
  fisherSellSignal: boolean
  fisher: number
  fisherTrigger: number
  ma7: number
  ma14: number
  ma21: number
  goldenCross: boolean
  halfGoldenCross: boolean
  maBelowWarning: boolean
  maBelowWhich: string
  rsi: number
  rsiSignal: boolean
  rsiStrongSignal: boolean
  rsiSellSignal: boolean
  t3: number
  t3Bullish: boolean
  strategyActive: boolean
  ema10CrossBarsAgo: number
  distFromLastDip: number
  lastDipPrice: number
  volume: number
  avgVolume: number
  volumeAboveAvg: boolean
  divergence: {
    bullish: number
    bearish: number
    bullishIndicators: string[]
    bearishIndicators: string[]
  }
}

type StockData = {
  symbol: string
  lastClose?: number
  lastUpdated?: string
  tf4h?: IndicatorResult
  tf2h?: IndicatorResult
  error?: string
}

type SignalHistory = {
  id: string
  signal_type: 'buy' | 'sell'
  price: number
  signals_4h: string[]
  signals_2h: string[]
  created_at: string
}

const LOGOS: Record<string, string> = {
  THYAO: 'https://logo.clearbit.com/turkishairlines.com',
  GARAN: 'https://logo.clearbit.com/garantibbva.com.tr',
  AKBNK: 'https://logo.clearbit.com/akbank.com',
  ISCTR: 'https://logo.clearbit.com/isbank.com.tr',
  TUPRS: 'https://logo.clearbit.com/tupras.com.tr',
  YKBNK: 'https://logo.clearbit.com/yapikredi.com.tr',
  KCHOL: 'https://logo.clearbit.com/koc.com.tr',
  EREGL: 'https://logo.clearbit.com/erdemir.com.tr',
  SAHOL: 'https://logo.clearbit.com/sabanci.com',
  BIMAS: 'https://logo.clearbit.com/bim.com.tr',
  TCELL: 'https://logo.clearbit.com/turkcell.com.tr',
  ASELS: 'https://logo.clearbit.com/aselsan.com.tr',
  SASA:  'https://logo.clearbit.com/sasa.com.tr',
  ENKAI: 'https://logo.clearbit.com/enka.com',
  OYAKC: 'https://logo.clearbit.com/oyak.com.tr',
  MGROS: 'https://logo.clearbit.com/migros.com.tr',
  ASTOR: 'https://logo.clearbit.com/astorenerjı.com.tr',
}

const FISHER_RATES: Record<string, { buy2h: number; sell2h: number; buy4h: number; sell4h: number }> = {
  THYAO: { buy2h: 48, sell2h: 59, buy4h: 47, sell4h: 57 },
  GARAN: { buy2h: 58, sell2h: 48, buy4h: 64, sell4h: 49 },
  AKBNK: { buy2h: 52, sell2h: 42, buy4h: 52, sell4h: 36 },
  ISCTR: { buy2h: 48, sell2h: 45, buy4h: 44, sell4h: 42 },
  TUPRS: { buy2h: 54, sell2h: 52, buy4h: 50, sell4h: 39 },
  YKBNK: { buy2h: 54, sell2h: 51, buy4h: 67, sell4h: 55 },
  KCHOL: { buy2h: 47, sell2h: 42, buy4h: 64, sell4h: 47 },
  EREGL: { buy2h: 55, sell2h: 43, buy4h: 52, sell4h: 42 },
  SAHOL: { buy2h: 38, sell2h: 47, buy4h: 50, sell4h: 52 },
  BIMAS: { buy2h: 46, sell2h: 52, buy4h: 50, sell4h: 43 },
  TCELL: { buy2h: 49, sell2h: 47, buy4h: 50, sell4h: 53 },
  ASELS: { buy2h: 48, sell2h: 50, buy4h: 75, sell4h: 53 },
  SASA:  { buy2h: 45, sell2h: 57, buy4h: 53, sell4h: 57 },
  ENKAI: { buy2h: 43, sell2h: 42, buy4h: 61, sell4h: 50 },
  OYAKC: { buy2h: 48, sell2h: 40, buy4h: 63, sell4h: 41 },
  MGROS: { buy2h: 54, sell2h: 53, buy4h: 59, sell4h: 53 },
  ASTOR: { buy2h: 56, sell2h: 47, buy4h: 74, sell4h: 51 },
}

// RSI14 win rate: <30 yukarı dönüş (al), >70 aşağı dönüş (sat) — 16 saat pencere
const RSI_RATES: Record<string, { buy2h: number; sell2h: number; buy4h: number; sell4h: number }> = {
  THYAO: { buy2h: 45, sell2h: 50, buy4h: 69, sell4h: 55 },
  GARAN: { buy2h: 48, sell2h: 52, buy4h: 75, sell4h: 58 },
  AKBNK: { buy2h: 51, sell2h: 48, buy4h: 67, sell4h: 52 },
  ISCTR: { buy2h: 48, sell2h: 46, buy4h: 50, sell4h: 50 },
  TUPRS: { buy2h: 67, sell2h: 45, buy4h: 67, sell4h: 48 },
  YKBNK: { buy2h: 44, sell2h: 50, buy4h: 44, sell4h: 52 },
  KCHOL: { buy2h: 57, sell2h: 52, buy4h: 67, sell4h: 55 },
  EREGL: { buy2h: 61, sell2h: 48, buy4h: 50, sell4h: 50 },
  SAHOL: { buy2h: 53, sell2h: 46, buy4h: 65, sell4h: 52 },
  BIMAS: { buy2h: 78, sell2h: 55, buy4h: 100, sell4h: 60 },
  TCELL: { buy2h: 53, sell2h: 50, buy4h: 75, sell4h: 55 },
  ASELS: { buy2h: 53, sell2h: 48, buy4h: 75, sell4h: 58 },
  SASA:  { buy2h: 40, sell2h: 44, buy4h: 64, sell4h: 50 },
  ENKAI: { buy2h: 60, sell2h: 48, buy4h: 80, sell4h: 55 },
  OYAKC: { buy2h: 61, sell2h: 46, buy4h: 67, sell4h: 52 },
  MGROS: { buy2h: 76, sell2h: 52, buy4h: 64, sell4h: 55 },
  ASTOR: { buy2h: 38, sell2h: 46, buy4h: 38, sell4h: 50 },
}

const FISHER_PERIODS: Record<string, { buy2h: number; buy4h: number }> = {
  THYAO: { buy2h: 10, buy4h: 10 },
  GARAN: { buy2h: 10, buy4h: 10 },
  AKBNK: { buy2h:  9, buy4h: 10 },
  ISCTR: { buy2h: 10, buy4h:  9 },
  TUPRS: { buy2h:  9, buy4h: 10 },
  YKBNK: { buy2h:  9, buy4h: 10 },
  KCHOL: { buy2h: 10, buy4h:  9 },
  EREGL: { buy2h: 10, buy4h: 10 },
  SAHOL: { buy2h: 10, buy4h: 10 },
  BIMAS: { buy2h: 10, buy4h:  9 },
  TCELL: { buy2h: 10, buy4h:  9 },
  ASELS: { buy2h:  9, buy4h: 10 },
  SASA:  { buy2h:  9, buy4h:  9 },
  ENKAI: { buy2h: 10, buy4h: 10 },
  OYAKC: { buy2h: 10, buy4h: 10 },
  MGROS: { buy2h:  9, buy4h:  9 },
  ASTOR: { buy2h: 10, buy4h: 10 },
  XU100: { buy2h:  9, buy4h:  9 },
  XBANK: { buy2h:  9, buy4h:  9 },
}

const GOLDEN_RATES: Record<string, { g4: number; h4: number; g2: number; h2: number }> = {
  THYAO: { g4: 50, h4: 55, g2: 41, h2: 46 },
  GARAN: { g4: 43, h4: 42, g2: 52, h2: 44 },
  AKBNK: { g4: 50, h4: 53, g2: 61, h2: 51 },
  ISCTR: { g4: 78, h4: 57, g2: 40, h2: 42 },
  TUPRS: { g4: 71, h4: 55, g2: 53, h2: 47 },
  YKBNK: { g4: 67, h4: 53, g2: 52, h2: 47 },
  KCHOL: { g4: 46, h4: 61, g2: 67, h2: 56 },
  EREGL: { g4: 82, h4: 72, g2: 62, h2: 49 },
  SAHOL: { g4: 40, h4: 54, g2: 50, h2: 41 },
  BIMAS: { g4: 73, h4: 53, g2: 52, h2: 52 },
  TCELL: { g4: 57, h4: 59, g2: 59, h2: 51 },
  ASELS: { g4: 50, h4: 60, g2: 54, h2: 60 },
  SASA:  { g4: 38, h4: 32, g2: 36, h2: 48 },
  ENKAI: { g4: 38, h4: 55, g2: 47, h2: 45 },
  OYAKC: { g4: 50, h4: 76, g2: 62, h2: 50 },
  MGROS: { g4: 67, h4: 63, g2: 59, h2: 55 },
  ASTOR: { g4: 43, h4: 47, g2: 68, h2: 60 },
}

function Badge({ label, active }: { label: string; active: boolean }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${
      active
        ? 'bg-green-500/20 text-green-300 border-green-500/40'
        : 'bg-gray-800 text-gray-500 border-gray-700'
    }`}>
      {active ? '✓' : '✗'} {label}
    </span>
  )
}

function TFSection({ label, ind, symbol, tf }: { label: string; ind: IndicatorResult; symbol: string; tf: '4h' | '2h' }) {
  const rates = GOLDEN_RATES[symbol]
  const fp = FISHER_PERIODS[symbol]
  const fisherLabel = `Fisher${fp ? (tf === '4h' ? fp.buy4h : fp.buy2h) : 9}`
  const signalCount = [ind.stochRsiSignal, ind.ema10Signal, ind.wtSignal, ind.fisherSignal, ind.rsiSignal].filter(Boolean).length

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{label}</span>
        {signalCount > 0 && (
          <span className="text-xs bg-green-600/30 text-green-300 px-1.5 py-0.5 rounded font-mono">
            {signalCount} sinyal
          </span>
        )}
        {ind.volumeAboveAvg && (
          <span className="text-xs bg-blue-600/30 text-blue-300 px-1.5 py-0.5 rounded">📊 Yüksek Hacim</span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Badge label="StochRSI" active={ind.stochRsiSignal} />
        <Badge label="EMA10" active={ind.ema10Signal} />
        <Badge label="WT" active={ind.wtSignal} />
        <span className={`px-2 py-0.5 rounded text-xs font-medium border flex items-center gap-1 ${
          ind.fisherSignal
            ? 'bg-green-500/20 text-green-300 border-green-500/40'
            : ind.fisherSellSignal
            ? 'bg-red-500/20 text-red-400 border-red-500/40'
            : 'bg-gray-800 text-gray-500 border-gray-700'
        }`}>
          {ind.fisherSignal ? '✓' : ind.fisherSellSignal ? '✗' : '✗'} {fisherLabel}
          {ind.fisherSignal && FISHER_RATES[symbol] && (
            <span className="text-[10px] opacity-70">%{tf === '4h' ? FISHER_RATES[symbol].buy4h : FISHER_RATES[symbol].buy2h}</span>
          )}
          {ind.fisherSellSignal && !ind.fisherSignal && FISHER_RATES[symbol] && (
            <span className="text-[10px] opacity-70">sat %{tf === '4h' ? FISHER_RATES[symbol].sell4h : FISHER_RATES[symbol].sell2h}</span>
          )}
        </span>
        <span className={`px-2 py-0.5 rounded text-xs border flex items-center gap-1 ${
          ind.rsiSignal
            ? 'bg-green-500/20 text-green-300 border-green-500/40 font-medium'
            : ind.rsiSellSignal
            ? 'bg-red-500/20 text-red-400 border-red-500/40 font-medium'
            : 'bg-gray-800 text-gray-500 border-gray-700 font-medium'
        }`}>
          {ind.rsiSignal ? '✓' : '✗'} RSI14
          {ind.rsiStrongSignal && RSI_RATES[symbol] && (
            <span className="text-[10px] opacity-70">%{tf === '4h' ? RSI_RATES[symbol].buy4h : RSI_RATES[symbol].buy2h}</span>
          )}
          {ind.rsiSellSignal && !ind.rsiSignal && RSI_RATES[symbol] && (
            <span className="text-[10px] opacity-70">sat %{tf === '4h' ? RSI_RATES[symbol].sell4h : RSI_RATES[symbol].sell2h}</span>
          )}
        </span>
        {ind.rsiSignal && !ind.rsiStrongSignal && RSI_RATES[symbol] && (
          <span className="text-[9px] text-gray-500 opacity-60">
            zayıf sinyal %{tf === '4h' ? RSI_RATES[symbol].buy4h : RSI_RATES[symbol].buy2h}
          </span>
        )}
        <span className={`px-2 py-0.5 rounded text-xs font-medium border ${
          ind.t3Bullish
            ? 'bg-green-500/20 text-green-300 border-green-500/40'
            : 'bg-red-500/20 text-red-400 border-red-500/40'
        }`}>
          {ind.t3Bullish ? '▲' : '▼'} T3
        </span>
        {ind.goldenCross && (
          <span className="flex flex-col items-center px-2 py-0.5 rounded text-xs font-semibold bg-yellow-500/20 text-yellow-300 border border-yellow-500/40">
            <span>🌟 Golden Cross</span>
            {rates && <span className="text-[10px] font-normal opacity-75">Win Rate {tf === '4h' ? rates.g4 : rates.g2}%</span>}
          </span>
        )}
        {ind.halfGoldenCross && !ind.goldenCross && (
          <span className="flex flex-col items-center px-2 py-0.5 rounded text-xs font-semibold bg-yellow-700/20 text-yellow-400 border border-yellow-700/40">
            <span>⭐ Yarı Golden Cross</span>
            {rates && <span className="text-[10px] font-normal opacity-75">Win Rate {tf === '4h' ? rates.h4 : rates.h2}%</span>}
          </span>
        )}
      </div>

      {(ind.divergence.bullish > 0 || ind.divergence.bearish > 0) && (
        <div className="flex flex-wrap gap-2">
          {ind.divergence.bullish > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold"
              style={{ background: 'rgba(0,255,100,0.08)', border: '1px solid rgba(0,255,100,0.25)', color: '#4dff91' }}>
              <span>▲</span>
              <span>Bullish Div {ind.divergence.bullish}</span>
              <span className="font-normal opacity-70">{ind.divergence.bullishIndicators.join(' · ')}</span>
            </div>
          )}
          {ind.divergence.bearish > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold"
              style={{ background: 'rgba(255,60,60,0.08)', border: '1px solid rgba(255,60,60,0.25)', color: '#ff6b6b' }}>
              <span>▼</span>
              <span>Bearish Div {ind.divergence.bearish}</span>
              <span className="font-normal opacity-70">{ind.divergence.bearishIndicators.join(' · ')}</span>
            </div>
          )}
        </div>
      )}

      {ind.maBelowWarning && (
        <div className="text-xs text-orange-400 bg-orange-900/20 border border-orange-700/30 rounded px-2 py-1">
          📉 Grafik {ind.maBelowWhich} altında seyrediyor
        </div>
      )}

      {tf === '2h' && ind.strategyActive && (
        <div
          className="px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide"
          style={{
            background: 'rgba(0, 255, 120, 0.07)',
            border: '1px solid rgba(0, 255, 120, 0.3)',
            color: '#39ff8a',
            textShadow: '0 0 8px rgba(0,255,120,0.4)',
          }}
        >
          ✦ Stratejim
          {ind.ema10CrossBarsAgo === 0 ? ' · bu mumda EMA10 kesişimi' : ` · ${ind.ema10CrossBarsAgo} mum önce EMA10 kesişimi`}
        </div>
      )}

      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-gray-500">Son dipten:</span>
        <span className={`font-mono font-semibold ${
          ind.distFromLastDip > 20 ? 'text-red-400' :
          ind.distFromLastDip > 10 ? 'text-yellow-400' : 'text-green-400'
        }`}>
          +{ind.distFromLastDip.toFixed(1)}%
        </span>
        <span className="text-gray-600 font-mono">₺{ind.lastDipPrice.toFixed(2)}</span>
      </div>

      <div className="grid grid-cols-4 gap-1 text-xs text-gray-500">
        <span>MA7: <span className="text-gray-300 font-mono">{ind.ma7.toFixed(2)}</span></span>
        <span>MA14: <span className="text-gray-300 font-mono">{ind.ma14.toFixed(2)}</span></span>
        <span>MA21: <span className="text-gray-300 font-mono">{ind.ma21.toFixed(2)}</span></span>
        <span>RSI: <span className={`font-mono ${ind.rsi < 30 ? 'text-green-400' : ind.rsi > 70 ? 'text-red-400' : 'text-gray-300'}`}>{ind.rsi.toFixed(1)}</span></span>
        <span>EMA10: <span className="text-gray-300 font-mono">{ind.ema10.toFixed(2)}</span></span>
        <span>WT1: <span className="text-gray-300 font-mono">{ind.wt1.toFixed(1)}</span></span>
        <span>Fisher: <span className="text-gray-300 font-mono">{ind.fisher.toFixed(2)}</span></span>
        <span>StochK: <span className="text-gray-300 font-mono">{ind.stochRsiK.toFixed(1)}</span></span>
      </div>
    </div>
  )
}

function HistoryModal({ symbol, onClose }: { symbol: string; onClose: () => void }) {
  const [history, setHistory] = useState<SignalHistory[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/bist-history?symbol=${symbol}`)
      .then(r => r.json())
      .then(d => { setHistory(d.data ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [symbol])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl p-4 w-full max-w-md max-h-[80vh] overflow-y-auto space-y-3"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="font-bold text-white">{symbol} — Sinyal Geçmişi</span>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">✕</button>
        </div>
        {loading ? (
          <div className="text-xs text-gray-500 text-center py-4">Yükleniyor...</div>
        ) : history.length === 0 ? (
          <div className="text-xs text-gray-500 text-center py-4">Kayıtlı sinyal yok</div>
        ) : (
          history.map(h => {
            const date = new Date(h.created_at)
            const allSigs = [...h.signals_4h.map(s => `4H:${s}`), ...h.signals_2h.map(s => `2H:${s}`)]
            return (
              <div key={h.id} className={`rounded-lg p-3 border text-xs space-y-1.5 ${
                h.signal_type === 'sell'
                  ? 'bg-red-900/20 border-red-700/40'
                  : 'bg-green-900/20 border-green-700/40'
              }`}>
                <div className="flex items-center justify-between">
                  <span className={`font-bold ${
                    h.signal_type === 'sell' ? 'text-red-400' : 'text-green-400'
                  }`}>
                    {h.signal_type === 'sell' ? '▼ SAT' : '▲ AL'}
                  </span>
                  <span className="text-gray-400">
                    {date.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    {' '}{date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">Fiyat:</span>
                  <span className="font-mono font-semibold text-white">₺{h.price.toFixed(2)}</span>
                </div>
                {allSigs.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {allSigs.map(s => (
                      <span key={s} className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-300">{s}</span>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function StockCard({ stock }: { stock: StockData }) {
  const [imgError, setImgError] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const hasSellSignal = !!stock.tf4h?.fisherSellSignal
  const hasAnySignal = !hasSellSignal && stock.tf4h && stock.tf2h && (
    stock.tf4h.stochRsiSignal || stock.tf4h.ema10Signal || stock.tf4h.wtSignal ||
    stock.tf4h.fisherSignal || stock.tf4h.rsiSignal ||
    stock.tf2h.stochRsiSignal || stock.tf2h.ema10Signal || stock.tf2h.wtSignal ||
    stock.tf2h.fisherSignal || stock.tf2h.rsiSignal
  )

  return (
    <>
    {showHistory && <HistoryModal symbol={stock.symbol} onClose={() => setShowHistory(false)} />}
    <div className={`bg-gray-900 rounded-xl p-4 space-y-3 border ${
      hasSellSignal ? 'border-red-500' : hasAnySignal ? 'border-green-700/50' : 'border-gray-800'
    }`}>
      {hasSellSignal && (
        <div
          className="-mx-4 -mt-4 px-4 py-2 rounded-t-xl"
          style={{
            background: 'rgba(255,30,30,0.15)',
            border: '1px solid rgba(255,50,50,0.4)',
            boxShadow: '0 0 16px rgba(255,0,0,0.15)',
          }}
        />
      )}
      <div className="flex items-center gap-3">
        {!imgError && LOGOS[stock.symbol] ? (
          <img
            src={LOGOS[stock.symbol]}
            alt={stock.symbol}
            className="w-8 h-8 rounded-full object-contain bg-white p-0.5"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-300">
            {stock.symbol.slice(0, 2)}
          </div>
        )}
        <div>
          <div className="font-bold text-white">{stock.symbol}</div>
          {stock.lastClose && (
            <div className="text-sm text-gray-400 font-mono">₺{stock.lastClose.toFixed(2)}</div>
          )}
        </div>
        <div className="ml-auto flex flex-col items-end gap-1">
          {hasSellSignal && (
            <>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(255,30,30,0.2)', color: '#ff4444', border: '1px solid rgba(255,50,50,0.4)' }}>
                SAT
              </span>
              {stock.lastClose && (
                <span className="text-[10px] font-mono text-red-400 opacity-80">₺{stock.lastClose.toFixed(2)}</span>
              )}
            </>
          )}
          {!hasSellSignal && hasAnySignal && (
            <>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(30,200,100,0.2)', color: '#39ff8a', border: '1px solid rgba(50,255,120,0.4)' }}>
                AL SİNYALİ
              </span>
              {stock.lastClose && (
                <span className="text-[10px] font-mono text-green-400 opacity-80">₺{stock.lastClose.toFixed(2)}</span>
              )}
            </>
          )}
        </div>
      </div>

      {stock.error ? (
        <div className="text-xs text-red-400">Veri alınamadı: {stock.error}</div>
      ) : stock.tf4h && stock.tf2h ? (
        <div className="space-y-3 divide-y divide-gray-800">
          <TFSection label="4 Saatlik" ind={stock.tf4h} symbol={stock.symbol} tf="4h" />
          <div className="pt-3">
            <TFSection label="2 Saatlik" ind={stock.tf2h} symbol={stock.symbol} tf="2h" />
          </div>
        </div>
      ) : (
        <div className="text-xs text-gray-500">Yükleniyor...</div>
      )}

      <div className="flex items-end justify-between gap-2">
        <button
          onClick={() => setShowHistory(v => !v)}
          className="text-[10px] text-gray-500 hover:text-gray-300 bg-gray-800/60 hover:bg-gray-700/60 border border-gray-700/50 rounded px-2 py-0.5 transition-colors"
        >
          History
        </button>
        <a
          href={`https://www.tradingview.com/chart/?symbol=BIST:${stock.symbol}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 block text-center text-xs text-blue-400 hover:text-blue-300 border border-blue-800/40 rounded py-1.5 transition-colors"
        >
          📈 TradingView&apos;da Aç
        </a>
      </div>
    </div>
    </>
  )
}

export default function BistPage() {
  const [data, setData] = useState<StockData[]>([])
  const [indices, setIndices] = useState<StockData[]>([])
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [filterSignals, setFilterSignals] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/bist')
      const json = await res.json()
      setData(json.data)
      setIndices(json.indices ?? [])
      setUpdatedAt(json.updatedAt)
    } catch {
      setError('Veri alınamadı')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const sellStocks   = data.filter(d => d.tf4h?.fisherSellSignal)
  const signalStocks = data.filter(d => !d.tf4h?.fisherSellSignal && d.tf4h && d.tf2h && (
    d.tf4h.stochRsiSignal || d.tf4h.ema10Signal || d.tf4h.wtSignal || d.tf4h.fisherSignal || d.tf4h.rsiSignal ||
    d.tf2h.stochRsiSignal || d.tf2h.ema10Signal || d.tf2h.wtSignal || d.tf2h.fisherSignal || d.tf2h.rsiSignal
  ))
  const sortedData = [...sellStocks, ...data.filter(d => !d.tf4h?.fisherSellSignal)]
  const filteredData = filterSignals ? [...sellStocks, ...signalStocks] : sortedData

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 space-y-4">

      <div className="bg-gray-900 rounded-xl p-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">BIST Hisse Analizi</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Yahoo Finance · 15dk gecikmeli · 4H + 2H analiz
          </p>
        </div>
        <div className="text-right space-y-1">
          {updatedAt && (
            <div className="text-xs text-gray-500">
              Son güncelleme: {new Date(updatedAt).toLocaleTimeString('tr-TR')}
            </div>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white px-3 py-1.5 rounded transition-colors"
          >
            {loading ? '⏳ Yükleniyor...' : '🔄 Yenile'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-600 text-red-300 text-center py-2 rounded text-sm">
          {error}
        </div>
      )}

      {!loading && (
        <div className="bg-green-900/20 border border-green-700/40 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-green-300">
              {signalStocks.length > 0 ? `🟢 ${signalStocks.length} hissede aktif sinyal` : '🔵 Aktif sinyal yok'}
            </div>
            <button
              onClick={() => setFilterSignals(f => !f)}
              className={`text-xs px-3 py-1 rounded font-medium transition-colors ${
                filterSignals
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {filterSignals ? '✓ Sadece Sinyaller' : 'Sadece Sinyaller'}
            </button>
          </div>
          {sellStocks.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {sellStocks.map(s => (
                <span key={s.symbol} className="text-xs px-2 py-1 rounded font-bold"
                  style={{ background: 'rgba(255,30,30,0.15)', color: '#ff4444', border: '1px solid rgba(255,50,50,0.3)' }}>
                  ⚠ {s.symbol} SAT
                </span>
              ))}
            </div>
          )}
          {signalStocks.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {signalStocks.map(s => (
                <span key={s.symbol} className="text-xs bg-green-800/40 text-green-200 px-2 py-1 rounded font-medium">
                  {s.symbol}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 17 }).map((_, i) => (
            <div key={i} className="bg-gray-900 rounded-xl p-4 h-48 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Hisse Senetleri */}
          <div>
            <h2 className="text-base font-bold mb-3" style={{ color: '#0abfbc' }}>HİSSE SENETLERİ</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredData.map(stock => (
                <StockCard key={stock.symbol} stock={stock} />
              ))}
            </div>
          </div>

          {/* İnce çizgi */}
          <hr className="border-gray-800" />

          {/* Endeksler */}
          <div>
            <h2 className="text-base font-bold mb-3" style={{ color: '#0abfbc' }}>ENDEKSLER</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {indices.map(stock => (
                <StockCard key={stock.symbol} stock={stock} />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="text-[11px] text-gray-600 text-center pb-2">
        ⚠ Eğitim amaçlıdır, yatırım tavsiyesi değildir
      </div>
    </div>
  )
}
