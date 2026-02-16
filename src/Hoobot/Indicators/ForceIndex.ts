import { Candlestick } from "../Exchanges/Candlesticks";
import { ConfigOptions, SymbolOptions } from "../Utilities/Args";
import { ConsoleLogger } from "../Utilities/ConsoleLogger";
import { calculateEMA } from "./EMA";

export const calculateForceIndex = (candles: Candlestick[], period: number = 13): number[] => {
  if (period === 0) {
    period = 13;
  }
  if (!candles || candles.length < period + 1) {
    return [];
  }

  const forceIndex: number[] = [];

  // Calculate raw Force Index: (Close - Previous Close) * Volume
  for (let i = 1; i < candles.length; i++) {
    const priceChange = candles[i].close - candles[i - 1].close;
    const rawForceIndex = priceChange * candles[i].volume;
    forceIndex.push(rawForceIndex);
  }

  // Apply EMA smoothing
  const smoothedForceIndex = calculateEMA(
    forceIndex.map((value) => ({ close: value }) as Candlestick),
    period,
    "close",
  );

  return smoothedForceIndex;
};

export const logForceIndexSignals = (consoleLogger: ConsoleLogger, forceIndex: number[]) => {
  if (forceIndex.length === 0) return;
  const currentFI = forceIndex[forceIndex.length - 1];
  let signal = "Neutral";
  if (currentFI > 0) {
    signal = "Bullish";
  } else if (currentFI < 0) {
    signal = "Bearish";
  }
  consoleLogger.push("Force Index", {
    value: currentFI.toFixed(7),
    signal: signal,
  });
};

export const checkForceIndexSignals = (forceIndex: number[], symbolOptions: SymbolOptions): string => {
  let check = "SKIP";
  if (symbolOptions.indicators !== undefined) {
    if (symbolOptions.indicators.forceIndex && symbolOptions.indicators.forceIndex.enabled) {
      check = "HOLD";
      if (forceIndex.length < 2) {
        return check;
      }

      const currentFI = forceIndex[forceIndex.length - 1];
      const previousFI = forceIndex[forceIndex.length - 2];

      // Force Index signals:
      // BUY: Force Index crosses above 0 (bullish momentum)
      // SELL: Force Index crosses below 0 (bearish momentum)

      if (currentFI > 0 && previousFI <= 0) {
        symbolOptions.indicators.forceIndex.weight = 1;
        check = "BUY";
      } else if (currentFI < 0 && previousFI >= 0) {
        symbolOptions.indicators.forceIndex.weight = 1;
        check = "SELL";
      }
    }
  }
  return check;
};
