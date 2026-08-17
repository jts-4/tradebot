export const CONFIG = {
  account: {
    startingEquity: 10000 as number,
    riskPerTrade: 0.03 as number,
    stopAtrMult: 2 as number,
    maxNotionalPct: 0.3 as number,
    minNotionalPct: 0.2 as number,
    minNotional: 1000 as number,
    rewardRiskRatio: 2 as number,
    slippage: 0.0005 as number,
    commission: 0.001 as number,
  },
  risk: {
    maxDailyLossPct: 0.04 as number,
    maxConsecutiveLosses: 6 as number,
    maxDrawdownPct: 0.10 as number,
  },
  venues: {
    crypto: {
      symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'SUIUSDT', 'HBARUSDT'],
      interval: '4h' as string,
      longOnly: false,
    },
    // Her sembol için özel strateji config
    symbolConfig: {
      BTCUSDT: { combo: 'WT+RSI+EMA11+EMAFilter', interval: '4h', slMult: 2, tpRatio: 2 },
      ETHUSDT: { combo: 'WT+Fisher+FVG',          interval: '2h', slMult: 3, tpRatio: 2 },
      SOLUSDT: { combo: 'WT+Fisher+RSI',           interval: '4h', slMult: 2, tpRatio: 2 },
      XRPUSDT: { combo: 'RSI+EMA11+BoS',           interval: '4h', slMult: 2, tpRatio: 2 },
      SUIUSDT: { combo: 'WT+Fisher+EMA11',         interval: '4h', slMult: 2, tpRatio: 2 },
      HBARUSDT:{ combo: 'WT+RSI+BoS',              interval: '4h', slMult: 2, tpRatio: 2 },
    } as Record<string, { combo: string; interval: string; slMult: number; tpRatio: number }>,
    us: {
      symbols: ['AAPL', 'AMZN', 'INTC', 'META', 'NVDA'],
      interval: '1d' as string,
      longOnly: true,
    },
  },
  fetchLimit: 500 as number,
  minCandles: 50 as number,
  triggerLookback: 3 as number, // tetikleyici kaç mum geçerliliğini korur
  strategyVersion: '3.0.0' as string,
} as const
