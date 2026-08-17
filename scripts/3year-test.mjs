// 3 yıllık BTCUSDT 4h verisi — v4 strateji vs en iyi 2. kombinasyon
const SYMBOL = 'BTCUSDT'
const STARTING_EQUITY = 10000
const RISK = 0.03
const COMMISSION = 0.001

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
    from = Number(data[data.length - 1][0]) + 1
    if (from > Date.now()) break
  }
  return all
}

function emaCalc(values, period) {
  const k = 2 / (period + 1)
  let prev = values[0]
  const r = [prev]
  for (let i = 1; i < values.length; i++) { prev = values[i] * k + prev * (1 - k); r.push(prev) }
  return r
}

function rsiCalc(closes, period = 14) {
  const r = new Array(period).fill(null)
  let ag = 0, al = 0
  for (let i = 1; i <= period; i++) { const d = closes[i]-closes[i-1]; d>0?ag+=d:al+=Math.abs(d) }
  ag /= period; al /= period
  r.push(al===0?100:100-100/(1+ag/al))
  for (let i = period+1; i < closes.length; i++) {
    const d = closes[i]-closes[i-1]
    ag = (ag*(period-1)+(d>0?d:0))/period
    al = (al*(period-1)+(d<0?Math.abs(d):0))/period
    r.push(al===0?100:100-100/(1+ag/al))
  }
  return r
}

function atrCalc(candles, period = 14) {
  const trs = [candles[0].high-candles[0].low]
  for (let i = 1; i < candles.length; i++)
    trs.push(Math.max(candles[i].high-candles[i].low, Math.abs(candles[i].high-candles[i-1].close), Math.abs(candles[i].low-candles[i-1].close)))
  const r = new Array(period-1).fill(null)
  let prev = trs.slice(0,period).reduce((a,b)=>a+b,0)/period
  r.push(prev)
  for (let i = period; i < trs.length; i++) { prev=(prev*(period-1)+trs[i])/period; r.push(prev) }
  return r
}

function wtCalc(candles, n1=10, n2=21) {
  const hlc3 = candles.map(c=>(c.high+c.low+c.close)/3)
  const esa = emaCalc(hlc3, n1)
  const d = esa.map((v,i)=>Math.abs(hlc3[i]-v))
  const de = emaCalc(d, n1)
  const ci = esa.map((v,i)=>(hlc3[i]-v)/(0.015*(de[i]||0.0001)))
  const wt1 = emaCalc(ci, n2)
  const wt2 = wt1.map((_,i)=>i<3?wt1[i]:(wt1[i]+wt1[i-1]+wt1[i-2]+wt1[i-3])/4)
  return {wt1, wt2}
}

function fisherCalc(candles, period=9) {
  const fish=[], trig=[]
  let pf=0, pv=0
  for (let i=period-1; i<candles.length; i++) {
    const sl=candles.slice(i-period+1,i+1)
    const hi=Math.max(...sl.map(c=>c.high)), lo=Math.min(...sl.map(c=>c.low))
    const hl2=(candles[i].high+candles[i].low)/2
    let v=(hi-lo)>0?2*((hl2-lo)/(hi-lo))-1:0
    v=Math.max(-0.999,Math.min(0.999,0.66*v+0.67*pv))
    const f=0.5*Math.log((1+v)/(1-v))+0.5*pf
    fish.push(f); trig.push(pf); pf=f; pv=v
  }
  return {fish, trig, offset: candles.length-fish.length}
}

function fvgCalc(candles, i) {
  if (i<2) return {bull:false, bear:false}
  return {
    bull: candles[i-2].high < candles[i].low,
    bear: candles[i-2].low > candles[i].high,
  }
}

function findExit(candles, closes, i, isLong, stop, target, slMult, atr) {
  const qty = (10000 * RISK) / (slMult * atr)
  const comm = qty * closes[i] * COMMISSION * 2
  const {fish, trig, offset} = fisherCalc(candles.slice(0, i+1))
  const ema11all = emaCalc(closes.slice(0, i+1), 11)

  for (let j=i+1; j<candles.length; j++) {
    const c = candles[j]
    const futureCloses = closes.slice(0,j+1)
    const futureEma11 = emaCalc(futureCloses, 11)
    const lastEma11 = futureEma11[futureEma11.length-1]
    const futureSlice = candles.slice(0,j+1)
    const ff = fisherCalc(futureSlice)
    const fi = ff.fish.length-1
    const fisherExit = fi>0 && (isLong ? ff.fish[fi-1]>ff.trig[fi-1]&&ff.fish[fi]<ff.trig[fi] : ff.fish[fi-1]<ff.trig[fi-1]&&ff.fish[fi]>ff.trig[fi])
    const ema11Exit = isLong && c.close < lastEma11

    if (isLong) {
      if (c.low<=stop)    return {pl:(stop-closes[i])*qty-comm, bars:j-i, reason:'SL'}
      if (c.high>=target) return {pl:(target-closes[i])*qty-comm, bars:j-i, reason:'TP'}
      if (fisherExit||ema11Exit) return {pl:(c.close-closes[i])*qty-comm, bars:j-i, reason:'EXIT'}
    } else {
      if (c.high>=stop)   return {pl:(closes[i]-stop)*qty-comm, bars:j-i, reason:'SL'}
      if (c.low<=target)  return {pl:(closes[i]-target)*qty-comm, bars:j-i, reason:'TP'}
      if (fisherExit)     return {pl:(closes[i]-c.close)*qty-comm, bars:j-i, reason:'EXIT'}
    }
  }
  return null
}

// S1: WT+RSI+EMA11+EMAFilter (mevcut v4)
function s1(candles, slMult=2, tpRatio=2) {
  const closes = candles.map(c=>c.close)
  const ema11 = emaCalc(closes,11), ema50=emaCalc(closes,50), ema200=emaCalc(closes,200)
  const rsi = rsiCalc(closes), atr = atrCalc(candles)
  const {wt1,wt2} = wtCalc(candles)
  const results=[], equity={v:STARTING_EQUITY}

  for (let i=210; i<candles.length-1; i++) {
    if (!rsi[i]||!atr[i]) continue
    const crossUp=closes[i-1]<ema11[i-1]&&closes[i]>ema11[i]
    const crossDown=closes[i-1]>ema11[i-1]&&closes[i]<ema11[i]
    const rsiUp=rsi[i-1]<50&&rsi[i]>=50, rsiDown=rsi[i-1]>50&&rsi[i]<=50
    const wtUp=wt1[i-1]<wt2[i-1]&&wt1[i]>wt2[i], wtDown=wt1[i-1]>wt2[i-1]&&wt1[i]<wt2[i]
    const bull=closes[i]>ema50[i]&&closes[i]>ema200[i], bear=closes[i]<ema50[i]&&closes[i]<ema200[i]
    const isLong=wtUp&&rsiUp&&crossUp&&bull, isShort=wtDown&&rsiDown&&crossDown&&bear
    if (!isLong&&!isShort) continue
    const stopDist=slMult*atr[i]
    const stop=isLong?closes[i]-stopDist:closes[i]+stopDist
    const target=isLong?closes[i]+stopDist*tpRatio:closes[i]-stopDist*tpRatio
    const exit=findExit(candles,closes,i,isLong,stop,target,slMult,atr[i])
    if (exit) { equity.v+=exit.pl; results.push(exit); i+=exit.bars }
  }
  return stats(results, equity.v)
}

// S2: WT+Fisher+FVG (ETH'de en iyi)
function s2(candles, slMult=2, tpRatio=2) {
  const closes = candles.map(c=>c.close)
  const atr = atrCalc(candles)
  const {wt1,wt2} = wtCalc(candles)
  const results=[], equity={v:STARTING_EQUITY}

  for (let i=50; i<candles.length-1; i++) {
    if (!atr[i]) continue
    const {fish,trig,offset} = fisherCalc(candles.slice(0,i+1))
    const fi=fish.length-1
    if (fi<1) continue
    const wtUp=wt1[i-1]<wt2[i-1]&&wt1[i]>wt2[i], wtDown=wt1[i-1]>wt2[i-1]&&wt1[i]<wt2[i]
    const fishUp=fish[fi-1]<trig[fi-1]&&fish[fi]>trig[fi], fishDown=fish[fi-1]>trig[fi-1]&&fish[fi]<trig[fi]
    const {bull:bullFVG, bear:bearFVG} = fvgCalc(candles,i)
    const isLong=wtUp&&fishUp&&bullFVG, isShort=wtDown&&fishDown&&bearFVG
    if (!isLong&&!isShort) continue
    const stopDist=slMult*atr[i]
    const stop=isLong?closes[i]-stopDist:closes[i]+stopDist
    const target=isLong?closes[i]+stopDist*tpRatio:closes[i]-stopDist*tpRatio
    const exit=findExit(candles,closes,i,isLong,stop,target,slMult,atr[i])
    if (exit) { equity.v+=exit.pl; results.push(exit); i+=exit.bars }
  }
  return stats(results, equity.v)
}

function stats(results, finalEquity) {
  if (!results.length) return {trades:0,wins:0,winRate:0,pf:0,realPL:0,finalEquity,avgBars:0}
  const wins=results.filter(r=>r.pl>0).length
  const gw=results.filter(r=>r.pl>0).reduce((s,r)=>s+r.pl,0)
  const gl=Math.abs(results.filter(r=>r.pl<=0).reduce((s,r)=>s+r.pl,0))
  return {
    trades:results.length, wins,
    winRate:Math.round(wins/results.length*100),
    pf:gl>0?parseFloat((gw/gl).toFixed(2)):gw>0?999:0,
    realPL:parseFloat((finalEquity-STARTING_EQUITY).toFixed(2)),
    finalEquity:parseFloat(finalEquity.toFixed(2)),
    avgBars:Math.round(results.reduce((s,r)=>s+r.bars,0)/results.length),
  }
}

async function main() {
  console.log('3 yıllık 4h veri çekiliyor...')
  const candles = await fetchAll(SYMBOL, '4h')
  const days = Math.round(candles.length*4/24)
  console.log(`Toplam: ${candles.length} mum (${days} gün)\n`)

  console.log('=== S1: WT+RSI+EMA11+EMAFilter (mevcut v4) ===')
  const r1 = s1(candles)
  console.log(`İşlem: ${r1.trades} | Win Rate: %${r1.winRate} | PF: ${r1.pf} | P&L: $${r1.realPL} | Final: $${r1.finalEquity} | Ort: ${r1.avgBars} mum`)

  console.log('\n=== S2: WT+Fisher+FVG ===')
  const r2 = s2(candles)
  console.log(`İşlem: ${r2.trades} | Win Rate: %${r2.winRate} | PF: ${r2.pf} | P&L: $${r2.realPL} | Final: $${r2.finalEquity} | Ort: ${r2.avgBars} mum`)

  console.log('\n=== KARŞILAŞTIRMA ===')
  const weeks = days / 7
  console.log(`S1 haftalık getiri: %${(r1.realPL/STARTING_EQUITY/weeks*100).toFixed(2)}`)
  console.log(`S2 haftalık getiri: %${(r2.realPL/STARTING_EQUITY/weeks*100).toFixed(2)}`)
}

main()
