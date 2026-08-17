// 3 yıllık BTCUSDT 4h — tüm 3'lü ve 4'lü kombinasyonlar
const SYMBOL = 'BTCUSDT'
const STARTING_EQUITY = 10000
const RISK = 0.03
const COMMISSION = 0.001
const SL_MULTS = [1.5, 2, 2.5, 3]
const TP_RATIOS = [1.5, 2, 2.5, 3]

async function fetchAll(symbol, interval) {
  const threeYears = 3 * 365 * 24 * 60 * 60 * 1000
  let from = Date.now() - threeYears
  let all = []
  while (true) {
    const res = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=1000&startTime=${from}`)
    const data = await res.json()
    if (!Array.isArray(data) || !data.length) break
    all = all.concat(data.map(k => ({
      time: Number(k[0]), open: parseFloat(k[1]), high: parseFloat(k[2]),
      low: parseFloat(k[3]), close: parseFloat(k[4])
    })))
    if (data.length < 1000) break
    from = Number(data[data.length-1][0]) + 1
    if (from > Date.now()) break
  }
  return all
}

function emaCalc(values, period) {
  const k = 2/(period+1); let prev = values[0]; const r = [prev]
  for (let i=1; i<values.length; i++) { prev=values[i]*k+prev*(1-k); r.push(prev) }
  return r
}
function rsiCalc(closes, period=14) {
  const r = new Array(period).fill(null); let ag=0,al=0
  for (let i=1; i<=period; i++) { const d=closes[i]-closes[i-1]; d>0?ag+=d:al+=Math.abs(d) }
  ag/=period; al/=period; r.push(al===0?100:100-100/(1+ag/al))
  for (let i=period+1; i<closes.length; i++) {
    const d=closes[i]-closes[i-1]
    ag=(ag*(period-1)+(d>0?d:0))/period; al=(al*(period-1)+(d<0?Math.abs(d):0))/period
    r.push(al===0?100:100-100/(1+ag/al))
  }
  return r
}
function atrCalc(candles, period=14) {
  const trs=[candles[0].high-candles[0].low]
  for (let i=1; i<candles.length; i++)
    trs.push(Math.max(candles[i].high-candles[i].low,Math.abs(candles[i].high-candles[i-1].close),Math.abs(candles[i].low-candles[i-1].close)))
  const r=new Array(period-1).fill(null); let prev=trs.slice(0,period).reduce((a,b)=>a+b,0)/period; r.push(prev)
  for (let i=period; i<trs.length; i++) { prev=(prev*(period-1)+trs[i])/period; r.push(prev) }
  return r
}
function wtCalc(candles, n1=10, n2=21) {
  const hlc3=candles.map(c=>(c.high+c.low+c.close)/3)
  const esa=emaCalc(hlc3,n1), d=esa.map((v,i)=>Math.abs(hlc3[i]-v)), de=emaCalc(d,n1)
  const ci=esa.map((v,i)=>(hlc3[i]-v)/(0.015*(de[i]||0.0001)))
  const wt1=emaCalc(ci,n2), wt2=wt1.map((_,i)=>i<3?wt1[i]:(wt1[i]+wt1[i-1]+wt1[i-2]+wt1[i-3])/4)
  return {wt1,wt2}
}
function fisherCalc(candles, period=9) {
  const fish=[],trig=[]; let pf=0,pv=0
  for (let i=period-1; i<candles.length; i++) {
    const sl=candles.slice(i-period+1,i+1)
    const hi=Math.max(...sl.map(c=>c.high)),lo=Math.min(...sl.map(c=>c.low))
    const hl2=(candles[i].high+candles[i].low)/2
    let v=(hi-lo)>0?2*((hl2-lo)/(hi-lo))-1:0
    v=Math.max(-0.999,Math.min(0.999,0.66*v+0.67*pv))
    const f=0.5*Math.log((1+v)/(1-v))+0.5*pf
    fish.push(f); trig.push(pf); pf=f; pv=v
  }
  return {fish,trig,offset:candles.length-fish.length}
}

// Tüm indikatörleri önceden hesapla
function precompute(candles) {
  const closes=candles.map(c=>c.close), highs=candles.map(c=>c.high), lows=candles.map(c=>c.low)
  const ema11=emaCalc(closes,11), ema50=emaCalc(closes,50), ema200=emaCalc(closes,200)
  const rsi=rsiCalc(closes), atr=atrCalc(candles)
  const {wt1,wt2}=wtCalc(candles)
  const {fish,trig,offset}=fisherCalc(candles)

  const signals = []
  for (let i=0; i<candles.length; i++) {
    const fi=i-offset
    const fUp  = fi>0 && fish[fi-1]<trig[fi-1] && fish[fi]>trig[fi]
    const fDown= fi>0 && fish[fi-1]>trig[fi-1] && fish[fi]<trig[fi]
    const bullFVG = i>=2 && candles[i-2].high < candles[i].low
    const bearFVG = i>=2 && candles[i-2].low  > candles[i].high
    const bSlice = candles.slice(Math.max(0,i-10),i)
    const swHigh = bSlice.length ? Math.max(...bSlice.map(c=>c.high)) : 0
    const swLow  = bSlice.length ? Math.min(...bSlice.map(c=>c.low))  : 999999
    const bullBoS = closes[i] > swHigh, bearBoS = closes[i] < swLow
    const prevClose = i>0?closes[i-1]:closes[i]
    const prevEma11 = i>0?ema11[i-1]:ema11[i]
    const prevRsi   = i>0?rsi[i-1]:rsi[i]
    const prevWt1   = i>0?wt1[i-1]:wt1[i]
    const prevWt2   = i>0?wt2[i-1]:wt2[i]

    signals.push({
      long: {
        WT:    prevWt1<prevWt2 && wt1[i]>wt2[i],
        Fisher: fUp,
        RSI:   prevRsi!==null && rsi[i]!==null && prevRsi<50 && rsi[i]>=50,
        EMA11: prevClose<prevEma11 && closes[i]>ema11[i],
        EMAFilter: closes[i]>ema50[i] && closes[i]>ema200[i],
        FVG:   bullFVG,
        BoS:   bullBoS,
      },
      short: {
        WT:    prevWt1>prevWt2 && wt1[i]<wt2[i],
        Fisher: fDown,
        RSI:   prevRsi!==null && rsi[i]!==null && prevRsi>50 && rsi[i]<=50,
        EMA11: prevClose>prevEma11 && closes[i]<ema11[i],
        EMAFilter: closes[i]<ema50[i] && closes[i]<ema200[i],
        FVG:   bearFVG,
        BoS:   bearBoS,
      },
      atr: atr[i],
      close: closes[i],
    })
  }
  return {signals, candles, closes}
}

function backtestCombo(data, combo, slMult, tpRatio) {
  const {signals, candles, closes} = data
  const results = []; let equity = STARTING_EQUITY

  for (let i=210; i<candles.length-1; i++) {
    const s = signals[i]
    if (!s.atr) continue
    const isLong  = combo.every(k => s.long[k])
    const isShort = combo.every(k => s.short[k])
    if (!isLong && !isShort) continue
    if (isLong && isShort) continue

    const entry = closes[i]
    const stopDist = slMult * s.atr
    const stop   = isLong ? entry-stopDist : entry+stopDist
    const target = isLong ? entry+stopDist*tpRatio : entry-stopDist*tpRatio
    const qty = (equity * RISK) / stopDist
    const comm = qty * entry * COMMISSION * 2

    let exitPL=null, exitBars=0
    for (let j=i+1; j<candles.length; j++) {
      const c=candles[j]
      if (isLong) {
        if (c.low<=stop)    { exitPL=(stop-entry)*qty-comm;   exitBars=j-i; break }
        if (c.high>=target) { exitPL=(target-entry)*qty-comm; exitBars=j-i; break }
      } else {
        if (c.high>=stop)   { exitPL=(entry-stop)*qty-comm;   exitBars=j-i; break }
        if (c.low<=target)  { exitPL=(entry-target)*qty-comm; exitBars=j-i; break }
      }
    }
    if (exitPL!==null) { equity+=exitPL; results.push({pl:exitPL,bars:exitBars}); i+=exitBars }
  }

  const wins=results.filter(r=>r.pl>0).length
  const gw=results.filter(r=>r.pl>0).reduce((s,r)=>s+r.pl,0)
  const gl=Math.abs(results.filter(r=>r.pl<=0).reduce((s,r)=>s+r.pl,0))
  return {
    trades:results.length, wins,
    winRate:results.length?Math.round(wins/results.length*100):0,
    pf:gl>0?parseFloat((gw/gl).toFixed(2)):gw>0?999:0,
    realPL:parseFloat((equity-STARTING_EQUITY).toFixed(2)),
  }
}

function getCombos(arr, size) {
  if (size===1) return arr.map(x=>[x])
  const r=[]
  for (let i=0; i<=arr.length-size; i++) {
    for (const rest of getCombos(arr.slice(i+1),size-1)) r.push([arr[i],...rest])
  }
  return r
}

async function main() {
  console.log('3 yıllık 4h veri çekiliyor...')
  const candles = await fetchAll(SYMBOL, '4h')
  console.log(`Toplam: ${candles.length} mum (${Math.round(candles.length*4/24)} gün)\n`)

  console.log('İndikatörler hesaplanıyor...')
  const data = precompute(candles)

  const ALL = ['WT','Fisher','RSI','EMA11','EMAFilter','FVG','BoS']
  const combos = [...getCombos(ALL,3), ...getCombos(ALL,4)]
  console.log(`${combos.length} kombinasyon × ${SL_MULTS.length*TP_RATIOS.length} SL/TP = ${combos.length*SL_MULTS.length*TP_RATIOS.length} test\n`)

  const results = []
  for (const combo of combos) {
    for (const sl of SL_MULTS) {
      for (const tp of TP_RATIOS) {
        const r = backtestCombo(data, combo, sl, tp)
        if (r.trades >= 8) results.push({combo:combo.join('+'), sl, tp, ...r})
      }
    }
  }

  results.sort((a,b) => b.realPL - a.realPL)

  console.log('=== TOP 15 (P&L bazlı, min 8 işlem) ===\n')
  for (const r of results.slice(0,15)) {
    console.log(`${r.combo} | SL${r.sl}x TP${r.tp}x`)
    console.log(`  İşlem:${r.trades} Win:%${r.winRate} PF:${r.pf} P&L:$${r.realPL}\n`)
  }

  // PF bazlı top 5
  const byPF = [...results].sort((a,b)=>b.pf-a.pf)
  console.log('=== TOP 5 (PF bazlı) ===\n')
  for (const r of byPF.slice(0,5)) {
    console.log(`${r.combo} | SL${r.sl}x TP${r.tp}x`)
    console.log(`  İşlem:${r.trades} Win:%${r.winRate} PF:${r.pf} P&L:$${r.realPL}\n`)
  }
}

main()
