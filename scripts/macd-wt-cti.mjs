// BTCUSDT 15m Heikin Ashi — MACD(18/28/9) + WT(10/10) + CTI(10/0.1)
// Giriş: MACD histogram yeşile döner + WT yukarı kesişim + CTI yeşil
// Çıkış 1: CTI aşağı döner
// Çıkış 2: Bir önceki tepenin %85'i
// SL: Bir önceki tepenin 1/3'ü (RR 1:3)

const SYMBOL = 'BTCUSDT'
const INTERVAL = '15m'
const LIMIT = 1500 // ~15 gün, daha fazla için birden fazla çekiş lazım
const STARTING_EQUITY = 10000
const RISK = 0.03
const COMMISSION = 0.001

async function fetchCandles(symbol, interval, limit, startTime = null) {
  let url = `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
  if (startTime) url += `&startTime=${startTime}`
  const res = await fetch(url)
  const data = await res.json()
  return data.map(k => ({
    time: Number(k[0]),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
  }))
}

// 1 yıllık 15m veri çek (birden fazla istek)
async function fetchYear(symbol) {
  const oneYear = 365 * 24 * 60 * 60 * 1000
  const startTime = Date.now() - oneYear
  let allCandles = []
  let from = startTime
  while (true) {
    const batch = await fetchCandles(symbol, INTERVAL, 1000, from)
    if (!batch.length) break
    allCandles = allCandles.concat(batch)
    if (batch.length < 1000) break
    from = batch[batch.length - 1].time + 1
    if (from > Date.now()) break
  }
  return allCandles
}

// Heikin Ashi dönüşümü
function toHeikinAshi(candles) {
  const ha = []
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]
    const haClose = (c.open + c.high + c.low + c.close) / 4
    const haOpen = i === 0 ? (c.open + c.close) / 2 : (ha[i-1].open + ha[i-1].close) / 2
    const haHigh = Math.max(c.high, haOpen, haClose)
    const haLow = Math.min(c.low, haOpen, haClose)
    ha.push({ time: c.time, open: haOpen, high: haHigh, low: haLow, close: haClose })
  }
  return ha
}

// EMA
function ema(values, period) {
  const k = 2 / (period + 1)
  let prev = values[0]
  const r = [prev]
  for (let i = 1; i < values.length; i++) { prev = values[i] * k + prev * (1 - k); r.push(prev) }
  return r
}

// MACD histogram
function macdHistogram(closes, fast = 18, slow = 28, signal = 9) {
  const emaFast = ema(closes, fast)
  const emaSlow = ema(closes, slow)
  const macdLine = emaFast.map((v, i) => v - emaSlow[i])
  const signalLine = ema(macdLine, signal)
  return macdLine.map((v, i) => v - signalLine[i])
}

// WaveTrend (channel 10, average 10)
function waveTrend(candles, n1 = 10, n2 = 10) {
  const hlc3 = candles.map(c => (c.high + c.low + c.close) / 3)
  const esa = ema(hlc3, n1)
  const d = esa.map((v, i) => Math.abs(hlc3[i] - v))
  const de = ema(d, n1)
  const ci = esa.map((v, i) => (hlc3[i] - v) / (0.015 * (de[i] || 0.0001)))
  const wt1 = ema(ci, n2)
  const wt2 = wt1.map((_, i) => i < 3 ? wt1[i] : (wt1[i] + wt1[i-1] + wt1[i-2] + wt1[i-3]) / 4)
  return { wt1, wt2 }
}

// CTI (Coral Trend Indicator) — LazyBear formülü
function cti(closes, sm = 10, cd = 0.1) {
  const di = (sm - 1.0) / 2.0 + 1.0
  const c1 = 2 / (di + 1.0)
  const c2 = 1 - c1
  const c3 = 3.0 * (cd * cd + cd * cd * cd)
  const c4 = -3.0 * (2.0 * cd * cd + cd + cd * cd * cd)
  const c5 = 3.0 * cd + 1.0 + cd * cd * cd + 3.0 * cd * cd

  const i1 = [], i2 = [], i3 = [], i4 = [], i5 = [], i6 = [], bfr = []

  for (let i = 0; i < closes.length; i++) {
    i1.push(c1 * closes[i] + c2 * (i1[i-1] ?? closes[i]))
    i2.push(c1 * i1[i] + c2 * (i2[i-1] ?? i1[i]))
    i3.push(c1 * i2[i] + c2 * (i3[i-1] ?? i2[i]))
    i4.push(c1 * i3[i] + c2 * (i4[i-1] ?? i3[i]))
    i5.push(c1 * i4[i] + c2 * (i5[i-1] ?? i4[i]))
    i6.push(c1 * i5[i] + c2 * (i6[i-1] ?? i5[i]))
    bfr.push(-cd*cd*cd*i6[i] + c3*i5[i] + c4*i4[i] + c5*i3[i])
  }

  // yeşil = bfr[i] > bfr[i-1], kırmızı = bfr[i] < bfr[i-1]
  const trend = bfr.map((v, i) => i === 0 ? 'neutral' : v > bfr[i-1] ? 'green' : v < bfr[i-1] ? 'red' : 'neutral')
  return { bfr, trend }
}

// Swing high tespiti — giriş öncesi son lokal pivot tepe
function findPrevSwingHigh(candles, i, lookback = 50) {
  for (let j = i - 2; j >= Math.max(2, i - lookback); j--) {
    if (
      candles[j].high > candles[j-1].high &&
      candles[j].high > candles[j-2].high &&
      candles[j].high > candles[j+1].high &&
      candles[j].high > candles[j+2].high &&
      candles[j].high > candles[i].close // giriş fiyatının üzerinde olmalı
    ) {
      return candles[j].high
    }
  }
  return null
}

function backtest(haCandles, slMode, tpMode) {
  const closes = haCandles.map(c => c.close)
  const hist = macdHistogram(closes)
  const { wt1, wt2 } = waveTrend(haCandles)
  const { bfr, trend } = cti(closes)

  const results = []
  let equity = STARTING_EQUITY
  const LOOKBACK = 6 // kaç mum içinde diğerleri de gelmeli

  // Her mum için sinyalleri önceden hesapla
  const signals = haCandles.map((_, i) => ({
    macd: i > 0 && ((hist[i] > 0 && hist[i-1] <= 0) || (hist[i] > 0 && hist[i-1] > 0 && hist[i] > hist[i-1])),
    wt: i > 5 && wt1[i-1] < wt2[i-1] && wt1[i] > wt2[i] && [1,2,3,4,5].some(k => wt1[i-k] < -53),
    cti: i > 0 && trend[i] === 'green' && trend[i-1] !== 'green', // yeni yeşile döndü
  }))

  for (let i = 30; i < haCandles.length - 1; i++) {
    // Son LOOKBACK mum içinde 3 sinyal de var mı?
    const window = signals.slice(Math.max(0, i - LOOKBACK), i + 1)
    const hasMacd = window.some(s => s.macd)
    const hasWt   = window.some(s => s.wt)
    const hasCti  = window.some(s => s.cti)
    if (!hasMacd || !hasWt || !hasCti) continue

    const entry = haCandles[i].close
    const swingHigh = findPrevSwingHigh(haCandles, i, 30)
    if (!swingHigh) continue

    // SL hesabı
    let stop, target
    if (slMode === 'swing13') {
      // Bir önceki tepenin 1/3'ü kadar altında SL
      const slDist = swingHigh / 3
      stop = entry - slDist
      target = entry + slDist * 3 // RR 1:3
    } else if (slMode === 'atr2') {
      // ATR bazlı alternatif
      const recentHighs = haCandles.slice(Math.max(0,i-14), i+1).map(c => c.high)
      const recentLows = haCandles.slice(Math.max(0,i-14), i+1).map(c => c.low)
      const recentCloses = closes.slice(Math.max(0,i-14), i+1)
      let atr = 0
      for (let k = 1; k < recentCloses.length; k++) {
        atr += Math.max(recentHighs[k]-recentLows[k], Math.abs(recentHighs[k]-recentCloses[k-1]), Math.abs(recentLows[k]-recentCloses[k-1]))
      }
      atr /= (recentCloses.length - 1)
      stop = entry - 2 * atr
      target = entry + 6 * atr // RR 1:3
    }

    const qty = (equity * RISK) / (entry - stop)
    const comm = qty * entry * COMMISSION * 2

    let exitPL = null, exitBars = 0, exitReason = null

    for (let j = i + 1; j < haCandles.length; j++) {
      const c = haCandles[j]

      if (c.low <= stop) {
        exitPL = (stop - entry) * qty - comm
        exitReason = 'SL'; exitBars = j - i; break
      }

      if (tpMode === 'swing85') {
        // Girişten swing high'a olan mesafenin %85'i
        const tp = entry + (swingHigh - entry) * 0.85
        if (c.high >= tp) {
          exitPL = (tp - entry) * qty - comm
          exitReason = 'TP85'; exitBars = j - i; break
        }
      } else if (tpMode === 'rr3') {
        if (c.high >= target) {
          exitPL = (target - entry) * qty - comm
          exitReason = 'TP_RR3'; exitBars = j - i; break
        }
      }

      // CTI aşağı döner
      if (trend[j] === 'red' && trend[j-1] !== 'red') {
        exitPL = (c.close - entry) * qty - comm
        exitReason = 'CTI_EXIT'; exitBars = j - i; break
      }
    }

    if (exitPL !== null) {
      equity += exitPL
      results.push({ pl: exitPL, bars: exitBars, reason: exitReason })
      i += exitBars
    }
  }

  const wins = results.filter(r => r.pl > 0).length
  const gw = results.filter(r => r.pl > 0).reduce((s, r) => s + r.pl, 0)
  const gl = Math.abs(results.filter(r => r.pl <= 0).reduce((s, r) => s + r.pl, 0))
  const byReason = {}
  results.forEach(r => { byReason[r.reason] = (byReason[r.reason] || 0) + 1 })

  return {
    trades: results.length,
    wins,
    winRate: results.length > 0 ? Math.round(wins / results.length * 100) : 0,
    pf: gl > 0 ? parseFloat((gw / gl).toFixed(2)) : gw > 0 ? 999 : 0,
    realPL: parseFloat((equity - STARTING_EQUITY).toFixed(2)),
    finalEquity: parseFloat(equity.toFixed(2)),
    avgBars: results.length > 0 ? Math.round(results.reduce((s, r) => s + r.bars, 0) / results.length) : 0,
    byReason,
  }
}

async function main() {
  console.log('1 yıllık 15m veri çekiliyor...')
  const rawCandles = await fetchYear(SYMBOL)
  const haCandles = toHeikinAshi(rawCandles)
  console.log(`Toplam mum: ${haCandles.length} (${Math.round(haCandles.length * 15 / 60 / 24)} gün)\n`)

  const closes = haCandles.map(c => c.close)
  const hist = macdHistogram(closes)
  const { wt1, wt2 } = waveTrend(haCandles)
  const { bfr, trend } = cti(closes)
  const LOOKBACK = 6

  const signals = haCandles.map((_, i) => ({
    macd: i > 0 && ((hist[i] > 0 && hist[i-1] <= 0) || (hist[i] > 0 && hist[i-1] > 0 && hist[i] > hist[i-1])),
    wt: i > 5 && wt1[i-1] < wt2[i-1] && wt1[i] > wt2[i] && [1,2,3,4,5].some(k => wt1[i-k] < -53),
    cti: i > 0 && trend[i] === 'green',
  }))

  // Tüm giriş noktalarını bul
  const entries = []
  for (let i = 30; i < haCandles.length - 1; i++) {
    const window = signals.slice(Math.max(0, i - LOOKBACK), i + 1)
    if (window.some(s => s.macd) && window.some(s => s.wt) && window.some(s => s.cti)) {
      const swingHigh = findPrevSwingHigh(haCandles, i)
      if (swingHigh) entries.push({ i, entry: haCandles[i].close, swingHigh })
    }
  }
  console.log(`Toplam giriş sinyali: ${entries.length}\n`)

  // ATR hesapla
  function getATR(i) {
    const slice = haCandles.slice(Math.max(0, i-14), i+1)
    let atr = 0
    for (let k = 1; k < slice.length; k++) {
      atr += Math.max(slice[k].high-slice[k].low, Math.abs(slice[k].high-slice[k-1].close), Math.abs(slice[k].low-slice[k-1].close))
    }
    return atr / (slice.length - 1)
  }

  // SL ve TP kombinasyonları
  const SL_TYPES = [
    { key: 'atr1',    label: 'SL 1×ATR',    fn: (e,i) => e - 1.0 * getATR(i) },
    { key: 'atr1.5',  label: 'SL 1.5×ATR',  fn: (e,i) => e - 1.5 * getATR(i) },
    { key: 'atr2',    label: 'SL 2×ATR',    fn: (e,i) => e - 2.0 * getATR(i) },
    { key: 'atr3',    label: 'SL 3×ATR',    fn: (e,i) => e - 3.0 * getATR(i) },
    { key: 'swing3',  label: 'SL Swing/3',  fn: (e,i,sh) => e - sh/3 },
    { key: 'swing5',  label: 'SL Swing/5',  fn: (e,i,sh) => e - sh/5 },
  ]
  const TP_TYPES = [
    { key: 'rr1.5', label: 'TP 1.5×RR', ratio: 1.5 },
    { key: 'rr2',   label: 'TP 2×RR',   ratio: 2.0 },
    { key: 'rr3',   label: 'TP 3×RR',   ratio: 3.0 },
    { key: 'rr4',   label: 'TP 4×RR',   ratio: 4.0 },
    { key: 'sw75',  label: 'TP Swing×75%', ratio: null },
    { key: 'sw85',  label: 'TP Swing×85%', ratio: null },
    { key: 'sw95',  label: 'TP Swing×95%', ratio: null },
  ]

  const results = []

  for (const sl of SL_TYPES) {
    for (const tp of TP_TYPES) {
      let equity = STARTING_EQUITY
      let trades = 0, wins = 0
      let usedIdx = -1

      for (const { i, entry, swingHigh } of entries) {
        if (i <= usedIdx) continue
        const stop = sl.fn(entry, i, swingHigh)
        if (stop >= entry) continue
        const slDist = entry - stop
        let target
        if (tp.ratio) {
          target = entry + slDist * tp.ratio
        } else {
          const pct = tp.key === 'sw75' ? 0.75 : tp.key === 'sw85' ? 0.85 : 0.95
          target = entry + (swingHigh - entry) * pct
          if (target <= entry) continue
        }

        const qty = (equity * RISK) / slDist
        const comm = qty * entry * COMMISSION * 2
        let exitPL = null, exitBars = 0

        for (let j = i + 1; j < haCandles.length; j++) {
          const c = haCandles[j]
          if (c.low <= stop) { exitPL = (stop - entry) * qty - comm; exitBars = j-i; break }
          if (c.high >= target) { exitPL = (target - entry) * qty - comm; exitBars = j-i; break }
          if (trend[j] === 'red' && trend[j-1] !== 'red') { exitPL = (c.close - entry) * qty - comm; exitBars = j-i; break }
        }

        if (exitPL !== null) {
          equity += exitPL
          trades++
          if (exitPL > 0) wins++
          usedIdx = i + exitBars
        }
      }

      const realPL = parseFloat((equity - STARTING_EQUITY).toFixed(2))
      results.push({
        label: `${sl.label} | ${tp.label}`,
        trades, wins,
        winRate: trades > 0 ? Math.round(wins/trades*100) : 0,
        pf: (() => { return 0 })(), // sonra hesaplanacak
        realPL,
      })
    }
  }

  // Gerçek PF hesabı için ayrı geçiş
  results.sort((a, b) => b.realPL - a.realPL)

  console.log('=== EN İYİ 10 SL/TP KOMBİNASYONU (P&L bazlı) ===\n')
  for (const r of results.slice(0, 10)) {
    console.log(`${r.label}`)
    console.log(`  İşlem: ${r.trades} | Win Rate: %${r.winRate} | P&L: $${r.realPL}\n`)
  }
}

main()
