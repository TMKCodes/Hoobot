import { Candlestick } from "../Exchanges/Candlesticks";
import { Indicators } from "../Modes/Algorithmic";
import { ConfigOptions, SymbolOptions } from "../Utilities/Args";
import { ConsoleLogger } from "../Utilities/ConsoleLogger";

export interface sma {
  short: number[];
  long: number[];
}

export const calculateSMA = (candles: Candlestick[], period: number = 9, source: string = "close"): number[] => {
  if (candles?.length === 0) {
    return [];
  }
  if (period === 0) {
    period = 9;
  }
  const smaValues: number[] = [];
  let sum = 0;
  for (let i = 0; i < candles?.length; i++) {
    sum += candles[i][source] as number;
    if (i >= period - 1) {
      const sma = sum / period;
      smaValues.push(sma);
      sum -= candles[i - (period - 1)][source] as number;
    }
  }
  // console.log("SMA Values:", JSON.stringify(smaValues));
  return smaValues;
};

export const logSMASignals = (consoleLogger: ConsoleLogger, sma: number[]) => {
  if (sma.length === 0) return;
  const currentSMA = sma[sma.length - 1];
  if (sma.length < 2) {
    consoleLogger.push("SMA", {
      value: currentSMA.toFixed(7),
      signal: "Neutral",
    });
    return;
  }
  const prevSMA = sma[sma.length - 2];
  consoleLogger.push(`SMA Value`, currentSMA.toFixed(7));
  let signal = "Neutral";
  if (currentSMA > prevSMA) {
    signal = `Bullish`;
  } else if (currentSMA < prevSMA) {
    signal = `Bearish`;
  } else {
    signal = `Neutral`;
  }
  const isBullishCrossover = currentSMA > prevSMA;
  const isBearishCrossover = currentSMA < prevSMA;
  if (isBullishCrossover) {
    signal = `Bullish Crossover`;
  } else if (isBearishCrossover) {
    signal = `Bearish Crossover`;
  }
  consoleLogger.push("SMA", {
    value: currentSMA.toFixed(7),
    signal: signal,
  });
};

export const checkSMASignals = (sma: number[], symbolOptions: SymbolOptions) => {
  let check = "SKIP";
  if (symbolOptions.indicators !== undefined) {
    if (symbolOptions.indicators.sma && symbolOptions.indicators.sma.enabled) {
      check = "HOLD";
      const currentSMA = sma[sma.length - 1];
      const prevSMA = sma[sma.length - 2];
      const isBullishCrossover = currentSMA > prevSMA;
      const isBearishCrossover = currentSMA < prevSMA;
      const isFlatDirection = currentSMA === prevSMA;
      if (isBullishCrossover) {
        check = "BUY";
      } else if (isBearishCrossover) {
        check = "SELL";
      } else if (isFlatDirection) {
        check = "HOLD";
      }
    }
  }
  return check;
};
