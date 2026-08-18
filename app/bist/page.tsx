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
        <Badge label="Fisher9" active={ind.fisherSignal} />
        <Badge label="RSI14" active={ind.rsiSignal} />
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

function StockCard({ stock }: { stock: StockData }) {
  const [imgError, setImgError] = useState(false)
  const hasAnySignal = stock.tf4h && stock.tf2h && (
    stock.tf4h.stochRsiSignal || stock.tf4h.ema10Signal || stock.tf4h.wtSignal ||
    stock.tf4h.fisherSignal || stock.tf4h.rsiSignal ||
    stock.tf2h.stochRsiSignal || stock.tf2h.ema10Signal || stock.tf2h.wtSignal ||
    stock.tf2h.fisherSignal || stock.tf2h.rsiSignal
  )

  return (
    <div className={`bg-gray-900 rounded-xl p-4 space-y-3 border ${
      hasAnySignal ? 'border-green-700/50' : 'border-gray-800'
    }`}>
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
        {hasAnySignal && (
          <span className="ml-auto text-xs bg-green-600 text-white px-2 py-0.5 rounded-full font-semibold">
            AL SİNYALİ
          </span>
        )}
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

      <a
        href={`https://www.tradingview.com/chart/?symbol=BIST:${stock.symbol}`}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-center text-xs text-blue-400 hover:text-blue-300 border border-blue-800/40 rounded py-1.5 transition-colors"
      >
        📈 TradingView&apos;da Aç
      </a>
    </div>
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

  const signalStocks = data.filter(d => d.tf4h && d.tf2h && (
    d.tf4h.stochRsiSignal || d.tf4h.ema10Signal || d.tf4h.wtSignal || d.tf4h.fisherSignal || d.tf4h.rsiSignal ||
    d.tf2h.stochRsiSignal || d.tf2h.ema10Signal || d.tf2h.wtSignal || d.tf2h.fisherSignal || d.tf2h.rsiSignal
  ))

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
              {(filterSignals ? signalStocks : data).map(stock => (
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
