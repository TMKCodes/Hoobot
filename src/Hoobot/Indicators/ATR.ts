import { Candlestick } from "../Exchanges/Candlesticks";
import { ConsoleLogger } from "../Utilities/ConsoleLogger";
import { calculateSMA } from "./SMA";

export const calculateATR = (candles: Candlestick[], period: number = 14, source: string = "close"): number[] => {
  if (period === 0) {
    period = 14;
  }
  if (!candles || candles.length < period) {
    return [];
  }
  const atrValues: number[] = [];
  // Start at period to ensure i - 1 is within bounds
  for (let i = period - 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;

    const trueRange = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    atrValues.push(trueRange);
  }
  const atrSMA = calculateSMA(
    atrValues.map((atr) => ({ close: atr }) as Candlestick),
    period,
    source,
  );
  return atrSMA;
};

export const logATRSignals = (consoleLogger: ConsoleLogger, atr: number[]) => {
  if (atr.length === 0) return;
  const currentATR = atr[atr.length - 1];
  if (atr.length < 2) {
    consoleLogger.push("ATR", {
      value: currentATR.toFixed(7),
      signal: "Neutral",
    });
    return;
  }
  const prevATR = atr[atr.length - 2];
  let signal = "Neutral";
  if (currentATR > prevATR) {
    signal = `Increasing`;
  } else if (currentATR < prevATR) {
    signal = `Decreasing`;
  } else {
    signal = `Stable`;
  }
  const highVolatilityThreshold = 2.0;
  const lowVolatilityThreshold = 0.5;
  if (currentATR > highVolatilityThreshold) {
    signal = `High Volatility`;
  } else if (currentATR < lowVolatilityThreshold) {
    signal = `Low Volatility`;
  } else {
    signal = `Medium Volatility`;
  }
  consoleLogger.push("ATR", {
    value: currentATR.toFixed(7),
    signal: signal,
  });
};
