export const CONFIG = {
  account: {
    startingEquity: 10000 as number,
    riskPerTrade: 0.015 as number,
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
    us: {
      symbols: ['AAPL', 'AMZN', 'INTC', 'META', 'NVDA'],
      interval: '1d' as string,
      longOnly: true,
    },
  },
  fetchLimit: 500 as number,
  minCandles: 50 as number,
  triggerLookback: 3 as number, // tetikleyici kaç mum geçerliliğini korur
  strategyVersion: '2.0.0' as string,
} as const
