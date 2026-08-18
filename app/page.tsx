import { supabase } from '@/lib/supabase'
import { toIST, toISTTime, ageMinutes } from '@/lib/utils'
import { CONFIG } from '@/lib/config'
import type { Trade, MissedOpportunity, Decision, BotStatus, AccountSnapshot } from '@/lib/types'

const INSTRUMENTS = {
  Kripto: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'SUIUSDT', 'HBARUSDT'],
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ i?: string }> }) {
  const { i: selectedInstrument = 'BTCUSDT' } = await searchParams

  const [
    { data: openTrades },
    { data: trades },
    { data: missed },
    { data: decisions },
    { data: statusRows },
    { data: snapshots },
  ] = await Promise.all([
    supabase.from('trades').select('*').is('closed_at', null).order('created_at', { ascending: false }),
    supabase.from('trades').select('*').not('closed_at', 'is', null).order('created_at', { ascending: false }).limit(50),
    supabase.from('missed_opportunities').select('*').order('created_at', { ascending: false }).limit(20),
    supabase.from('decisions').select('*').eq('symbol', selectedInstrument).order('created_at', { ascending: false }).limit(20),
    supabase.from('bot_status').select('*').eq('id', 1),
    supabase.from('account_snapshots').select('*').order('created_at', { ascending: false }).limit(1),
  ])

  const status = statusRows?.[0] as BotStatus | undefined
  const snap = snapshots?.[0] as AccountSnapshot | undefined
  const lastDecision = decisions?.[0] as Decision | undefined
  const schedulerDown = status ? ageMinutes(status.last_run) > 150 : false

  const equity = snap?.equity ?? 0
  const allocated = snap?.allocated ?? 0
  const available = snap?.available ?? 0
  const totalReturn = snap?.total_return ?? 0
  const usagePct = equity > 0 ? Math.round((allocated / equity) * 100) : 0

  const openList = (openTrades ?? []) as Trade[]
  const tradeList = (trades ?? []) as Trade[]
  const missedList = (missed ?? []) as MissedOpportunity[]
  const decisionList = (decisions ?? []) as Decision[]
  // Equity eğrisi için kümülatif P/L
  let cumulative = 0
  const equityCurve = [...tradeList].reverse().map(t => {
    cumulative += t.profit_loss ?? 0
    return { date: toIST(t.created_at), value: cumulative }
  })

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 space-y-4">

      {/* Scheduler down bandı */}
      {schedulerDown && (
        <div className="bg-red-600 text-white text-center py-2 rounded font-semibold">
          ⚠ SCHEDULER DOWN — son çalışma {status ? ageMinutes(status.last_run) : '?'} dakika önce
        </div>
      )}

      {/* Halt bandı */}
      {status?.halted && (
        <div className="bg-yellow-500 text-black text-center py-2 rounded font-semibold">
          🛑 BOT DURDURULDU — {status.halt_reason ?? 'sebep belirtilmedi'}
        </div>
      )}

      {/* Uyarı bandı */}
      <div className="bg-yellow-900/40 border border-yellow-600 text-yellow-300 text-center py-2 rounded text-sm">
        ⚠ KÂĞIT ÜZERİNDE — eğitim amaçlı, yatırım tavsiyesi değil
      </div>

      {/* 1. Hesap şeridi */}
      <div className="bg-gray-900 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Equity" value={`$${equity.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`} />
          <Stat label="Toplam Getiri" value={`${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(2)}%`} color={totalReturn >= 0 ? 'text-green-400' : 'text-red-400'} />
          <Stat label="Dağıtılan" value={`$${allocated.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`} />
          <Stat label="Kullanılabilir" value={`$${available.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`} color="text-blue-400" />
        </div>
        <div>
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Kullanım</span>
            <span>{usagePct}%</span>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${usagePct}%` }} />
          </div>
        </div>
      </div>

      {/* 2. Venue sekmeleri + enstrüman rozetleri */}
      <div className="bg-gray-900 rounded-xl p-4 space-y-3">
        {Object.entries(INSTRUMENTS).map(([venue, instruments]) => (
          <div key={venue}>
            <div className="text-xs text-gray-400 mb-2">{venue}</div>
            <div className="flex flex-wrap gap-2">
              {instruments.map(inst => (
                <a
                  key={inst}
                  href={`?i=${inst}`}
                  className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
                    selectedInstrument === inst
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'
                  }`}
                >
                  {inst}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 3. Açık Pozisyonlar */}
      <div className="bg-gray-900 rounded-xl p-4">
        <h2 className="font-semibold mb-3">Açık Pozisyonlar</h2>
        {openList.length === 0 ? (
          <p className="text-gray-500 text-sm">Açık pozisyon yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-800">
                  <th className="pb-2 pr-4">Sembol</th>
                  <th className="pb-2 pr-4">Yön</th>
                  <th className="pb-2 pr-4">Giriş</th>
                  <th className="pb-2 pr-4">Stop</th>
                  <th className="pb-2 pr-4">Hedef</th>
                  <th className="pb-2 pr-4">Notional</th>
                  <th className="pb-2 pr-4">Süre</th>
                  <th className="pb-2">Tarih (İST)</th>
                </tr>
              </thead>
              <tbody>
                {openList.map(t => (
                  <tr key={t.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="py-2 pr-4 font-medium">{t.symbol}</td>
                    <td className={`py-2 pr-4 font-semibold ${t.side === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>{t.side}</td>
                    <td className="py-2 pr-4 font-mono">${t.entry_price?.toLocaleString()}</td>
                    <td className="py-2 pr-4 font-mono text-red-400">${t.stop_price?.toLocaleString()}</td>
                    <td className="py-2 pr-4 font-mono text-green-400">${t.target_price?.toLocaleString()}</td>
                    <td className="py-2 pr-4 font-mono text-gray-400">${t.notional?.toLocaleString()}</td>
                    <td className="py-2 pr-4 text-xs text-blue-300 font-mono">{tradeAge(t.created_at)}</td>
                    <td className="py-2 text-gray-500 text-xs">{toIST(t.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. Son karar kartı */}
      {lastDecision ? (
        <div className="bg-gray-900 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg">{selectedInstrument} — Son Karar</h2>
            <span className={`px-3 py-1 rounded-full text-sm font-bold ${lastDecision.verdict === 'PASS' ? 'bg-green-700 text-green-100' : 'bg-red-900 text-red-200'}`}>
              {lastDecision.verdict === 'PASS' ? '✓ GİRİŞ' : '✗ ATLANDI'}
            </span>
          </div>

          {/* Mum penceresi */}
          <div className="text-sm text-gray-400">
            Mum penceresi:{' '}
            <span className="text-white font-medium">
              {toISTTime(lastDecision.candle_open)} → {toISTTime(lastDecision.candle_close)}
            </span>
            {' · '}karar kapanışta alındı
            {' · '}<span className="text-gray-500">{toIST(lastDecision.created_at)}</span>
          </div>

          {/* Göstergeler */}
          {lastDecision.indicators?.length > 0 && (
            <div>
              <div className="text-xs text-gray-400 mb-2">Göstergeler</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {lastDecision.indicators.map((ind, i) => (
                  <div key={i} className="bg-gray-800 rounded p-2">
                    <div className="text-xs text-gray-400">{ind.label}</div>
                    <div className="font-mono text-sm">{ind.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Koşul listesi */}
          {lastDecision.conditions?.length > 0 && (
            <div>
              <div className="text-xs text-gray-400 mb-2">Koşullar</div>
              <div className="space-y-1">
                {lastDecision.conditions.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className={c.passed ? 'text-green-400' : 'text-red-400'}>{c.passed ? '✓' : '✗'}</span>
                    <span className={c.passed ? 'text-gray-200' : 'text-gray-500'}>{c.label}</span>
                    <span className="text-gray-500 text-xs ml-auto">{c.value} / gerekli: {c.required}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ne değişmeli */}
          {lastDecision.missing?.length > 0 && (
            <div>
              <div className="text-xs text-gray-400 mb-2">Ne değişmeli</div>
              <div className="space-y-1">
                {lastDecision.missing.map((m, i) => (
                  <div key={i} className="text-sm bg-gray-800 rounded p-2">
                    <span className="text-yellow-400">{m.label}</span>
                    {' '}<span className="text-gray-300">{m.target} olmalı; {m.current} — </span>
                    <span className="text-red-400 font-mono">{m.gap} eksik</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-gray-900 rounded-xl p-4 text-gray-500 text-sm">
          {selectedInstrument} için henüz karar kaydı yok.
        </div>
      )}

      {/* 5. Fiyat grafiği placeholder (gerçek grafik için Recharts eklenecek) */}
      <div className="bg-gray-900 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">{selectedInstrument} Grafik</h2>
          <span className="text-xs text-gray-500">EMA21 / EMA50 / EMA200 + RSI</span>
        </div>
        <div className="h-48 bg-gray-800 rounded flex items-center justify-center text-gray-600 text-sm">
          Grafik bileşeni — Recharts entegrasyonu sonraki adımda
        </div>
      </div>

      {/* 6. Kaçan fırsatlar */}
      <div className="bg-gray-900 rounded-xl p-4">
        <h2 className="font-semibold mb-3">Kaçan Fırsatlar</h2>
        {missedList.length === 0 ? (
          <p className="text-gray-500 text-sm">Kayıt yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-800">
                  <th className="pb-2 pr-4">Sembol</th>
                  <th className="pb-2 pr-4">Yön</th>
                  <th className="pb-2 pr-4">Sinyal Fiyatı</th>
                  <th className="pb-2 pr-4">Gerekli Notional</th>
                  <th className="pb-2 pr-4">Sebep</th>
                  <th className="pb-2">Tarih (İST)</th>
                </tr>
              </thead>
              <tbody>
                {missedList.map(m => (
                  <tr key={m.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="py-2 pr-4 font-medium">{m.symbol}</td>
                    <td className={`py-2 pr-4 font-semibold ${m.side === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>{m.side}</td>
                    <td className="py-2 pr-4 font-mono">${m.signal_price.toLocaleString()}</td>
                    <td className="py-2 pr-4 font-mono text-gray-400">${m.required_notional?.toLocaleString() ?? '—'}</td>
                    <td className="py-2 pr-4 text-gray-400 text-xs">{m.reason ?? '—'}</td>
                    <td className="py-2 text-gray-500 text-xs">{toIST(m.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 7. İşlem günlüğü + equity eğrisi */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* İşlem günlüğü */}
        <div className="bg-gray-900 rounded-xl p-4">
          <h2 className="font-semibold mb-3">İşlem Günlüğü</h2>
          {tradeList.length === 0 ? (
            <p className="text-gray-500 text-sm">Henüz işlem yok.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-800">
                    <th className="pb-2 pr-3">Sembol</th>
                    <th className="pb-2 pr-3">Yön</th>
                    <th className="pb-2 pr-3">Fiyat</th>
                    <th className="pb-2 pr-3">Miktar</th>
                    <th className="pb-2 pr-3">K/Z</th>
                    <th className="pb-2 pr-3">Sonuç</th>
                    <th className="pb-2">Tarih (İST)</th>
                  </tr>
                </thead>
                <tbody>
                  {tradeList.map(t => (
                    <tr key={t.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="py-2 pr-3 font-medium">{t.symbol}</td>
                      <td className={`py-2 pr-3 font-semibold ${t.side === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>{t.side}</td>
                      <td className="py-2 pr-3 font-mono">${t.entry_price?.toLocaleString() ?? '—'}</td>
                      <td className="py-2 pr-3 font-mono">{t.quantity}</td>
                      <td className={`py-2 pr-3 font-mono ${(t.profit_loss ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {t.profit_loss != null ? `$${t.profit_loss.toFixed(2)}` : '—'}
                      </td>
                      <td className={`py-2 pr-3 text-xs ${exitLabel(t.exit_reason).color}`}>
                        {exitLabel(t.exit_reason).text}
                      </td>
                      <td className="py-2 text-gray-500 text-xs">{toIST(t.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Equity eğrisi */}
        <div className="bg-gray-900 rounded-xl p-4">
          <h2 className="font-semibold mb-3">Equity Eğrisi</h2>
          {equityCurve.length === 0 ? (
            <p className="text-gray-500 text-sm">Veri yok.</p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {equityCurve.map((p, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-gray-500">{p.date}</span>
                  <span className={p.value >= 0 ? 'text-green-400 font-mono' : 'text-red-400 font-mono'}>
                    {p.value >= 0 ? '+' : ''}${p.value.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 8. Bot durumu */}
      <div className="bg-gray-900 rounded-xl p-4">
        <h2 className="font-semibold mb-3">Bot Durumu</h2>
        {status ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-xs text-gray-400">Son çalışma</div>
              <div>{toIST(status.last_run)}</div>
              <div className="text-xs text-gray-500">{ageMinutes(status.last_run)} dakika önce</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Sonraki kontrol</div>
              <div>{toIST(status.next_run)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Durum</div>
              <div className={status.halted ? 'text-red-400' : 'text-green-400'}>
                {status.halted ? '🛑 Durduruldu' : '✓ Aktif'}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Kalp atışı</div>
              <div className={schedulerDown ? 'text-red-400' : 'text-green-400'}>
                {schedulerDown ? '✗ Yanıt yok' : '✓ Normal'}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">Bot durumu alınamadı.</p>
        )}
      </div>

      {/* 9. Strateji kartı */}
      <div className="bg-gray-900 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Strateji — v{CONFIG.strategyVersion}</h2>
          <span className="text-xs text-gray-500">Her sembol bağımsız</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-800">
                <th className="pb-2 pr-4">Sembol</th>
                <th className="pb-2 pr-4">Kombinasyon</th>
                <th className="pb-2 pr-4">Interval</th>
                <th className="pb-2 pr-4">SL</th>
                <th className="pb-2">TP</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(CONFIG.venues.symbolConfig).map(([sym, cfg]) => (
                <tr key={sym} className={`border-b border-gray-800/50 ${
                  selectedInstrument === sym ? 'bg-blue-900/20' : 'hover:bg-gray-800/30'
                }`}>
                  <td className="py-2 pr-4 font-medium">{sym}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-blue-300">{cfg.combo}</td>
                  <td className="py-2 pr-4 text-gray-400">{cfg.interval}</td>
                  <td className="py-2 pr-4 text-red-400">{cfg.slMult}×ATR</td>
                  <td className="py-2 text-green-400">{cfg.tpRatio}×RR</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-sm text-gray-400 space-y-1">
          <p>• <strong>Çıkış</strong>: Stop Loss | Take Profit | Fisher ters kesişim | EMA11 altı kapanış</p>
          <p>• <strong>Risk</strong>: İşlem başına sermayenin %{(CONFIG.account.riskPerTrade * 100).toFixed(0)}&apos;i</p>
          <p>• <strong>Kontrol</strong>: Her saatin 20. ve 50. dakikasında</p>
        </div>
        <div className="text-xs text-yellow-400 border border-yellow-700 rounded p-2">
          ⚠ KÂĞIT ÜZERİNDE — eğitim amaçlı, yatırım tavsiyesi değil
        </div>
      </div>

    </div>
  )
}

function tradeAge(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime()
  const totalMins = Math.floor(ms / 60000)
  const days = Math.floor(totalMins / 1440)
  const hours = Math.floor((totalMins % 1440) / 60)
  const mins = totalMins % 60
  if (days > 0) return `${days}g ${hours}s ${mins}d`
  if (hours > 0) return `${hours}s ${mins}d`
  return `${mins}d`
}

function exitLabel(reason: string | null): { text: string; color: string } {
  if (reason === 'TARGET') return { text: '✅ Take Profit', color: 'text-green-400' }
  if (reason === 'STOP') return { text: '🛑 Stop Loss', color: 'text-red-400' }
  if (reason === 'REGIME_CHANGE') return { text: '⚠ Trend Değişimi', color: 'text-yellow-400' }
  return { text: '—', color: 'text-gray-500' }
}

function Stat({ label, value, color = 'text-white' }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="text-xs text-gray-400">{label}</div>
      <div className={`text-xl font-bold font-mono ${color}`}>{value}</div>
    </div>
  )
}
