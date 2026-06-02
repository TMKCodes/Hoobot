export type MayExecuteAlgorithmicTradeOptions = {
  /** Kun false, profit SKIP sallitaan avauskaupassa (ei tradeHistoryä vielä). */
  hasTradeHistory?: boolean;
};

/** Sama profit+direction -suodatin kuin live placeTrade (ei HOLD). */
export const mayExecuteAlgorithmicTrade = (
  profit: string,
  direction: string,
  opts?: MayExecuteAlgorithmicTradeOptions,
): boolean => {
  const hasTradeHistory = opts?.hasTradeHistory ?? false;
  const allowSkipEntry = !hasTradeHistory && profit === "SKIP";

  const isTakeProfitClose = profit === "TAKE_PROFIT" || profit === "TAKE_PROFIT_FORCE";
  if (direction === "SELL") {
    return profit === "SELL" || profit === "STOP_LOSS" || isTakeProfitClose || allowSkipEntry;
  }
  if (direction === "BUY") {
    return profit === "BUY" || profit === "STOP_LOSS" || isTakeProfitClose || allowSkipEntry;
  }
  return false;
};

/** Sim fee % per leg (round-trip käytetään erikseen PnL:ssä). */
export const simFeeRatePerLeg = (tradeFeePercentage?: number): number => {
  const pct = tradeFeePercentage ?? 0.075;
  return pct / 100;
};
