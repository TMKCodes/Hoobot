import { Candlestick } from "../Exchanges/Candlesticks";
import { ConfigOptions, SymbolOptions } from "../Utilities/Args";
import { ConsoleLogger } from "../Utilities/ConsoleLogger";
import { calculateSMA } from "./SMA";

export const calculateCMF = (candlesticks: Candlestick[], period: number): number[] => {
  const cmfValues: number[] = [];
  for (let i = period - 1; i < candlesticks.length; i++) {
    const subset = candlesticks.slice(Math.max(0, i - period + 1), i + 1);
    const sumMFVolume = subset.reduce((sum, candle) => {
      const range = candle.high - candle.low;
      if (range === 0) return sum;
      const mfMultiplier = (candle.close - candle.low - (candle.high - candle.close)) / range;
      return sum + mfMultiplier * candle.volume;
    }, 0);
    const sumVolume = subset.reduce((sum, candle) => sum + candle.volume, 0);
    if (sumVolume === 0) {
      cmfValues.push(0);
    } else {
      const cmf = sumMFVolume / sumVolume;
      cmfValues.push(cmf);
    }
  }
  return cmfValues;
};

export const logCMFSignals = (consoleLogger: ConsoleLogger, cmfValues: number[], symbolOptions: SymbolOptions) => {
  if (!cmfValues?.length) return;
  const currentCMF = cmfValues[cmfValues.length - 1];
  if (currentCMF === undefined || typeof currentCMF !== "number") {
    consoleLogger.push("CMF", { value: "N/A", smoothed: "N/A", signal: "N/A" });
    return;
  }
  const prevCMF = cmfValues[cmfValues.length - 2];
  const cmfSMA = calculateSMA(
    cmfValues.map((value) => ({ close: value }) as Candlestick),
    50,
    "close",
  );
  if (!cmfSMA?.length) return;
  const isBullishCrossover = currentCMF > cmfSMA[cmfSMA.length - 1] && prevCMF < cmfSMA[cmfSMA.length - 1];
  const isBearishCrossover = currentCMF < cmfSMA[cmfSMA.length - 1] && prevCMF > cmfSMA[cmfSMA.length - 1];
  const overbought = symbolOptions.indicators?.cmf?.tresholds?.overbought ?? 0;
  const oversold = symbolOptions.indicators?.cmf?.tresholds?.oversold ?? 0;
  const isOverbought = currentCMF > overbought;
  const isOversold = currentCMF < oversold;
  let signal = "Neutral";
  if (isBullishCrossover) {
    signal = `Bullish Crossover`;
  } else if (isBearishCrossover) {
    signal = `Bearish Crossover`;
  } else if (isOverbought) {
    signal = `Overbought`;
  } else if (isOversold) {
    signal = `Oversold`;
  } else {
    signal = `Neutral`;
  }
  consoleLogger.push("CMF", {
    value: currentCMF.toFixed(7),
    smoothed: cmfSMA[cmfSMA.length - 1],
    signal: signal,
  });
};

export const checkCMFSignals = (cmfValues: number[] | undefined, symbolOptions: SymbolOptions) => {
  let check = "SKIP";
  if (symbolOptions.indicators !== undefined) {
    if (symbolOptions.indicators.cmf !== undefined) {
      if (symbolOptions.indicators.cmf.enabled) {
        if (!cmfValues?.length) {
          return "HOLD";
        }
        check = "HOLD";
        const histLen = Math.max(1, symbolOptions.indicators.cmf.history || 3);
        const smaPeriod = Math.min(50, Math.max(2, cmfValues.length));
        const cmfSMA = calculateSMA(
          cmfValues.map((value) => ({ close: value }) as Candlestick),
          smaPeriod,
          "close",
        );
        const start = Math.max(1, cmfValues.length - histLen);
        for (let i = cmfValues.length - 1; i >= start; i--) {
          const smaIdx = i - (smaPeriod - 1);
          const smaPrevIdx = smaIdx - 1;
          if (smaIdx < 0 || smaPrevIdx < 0 || smaIdx >= cmfSMA.length || smaPrevIdx >= cmfSMA.length) {
            continue;
          }
          const currentCMF = cmfValues[i];
          const prevCMF = cmfValues[i - 1];
          const smaI = cmfSMA[smaIdx];
          const smaPrev = cmfSMA[smaPrevIdx];
          if (smaI == null || smaPrev == null) continue;
          const isBullishCrossover = currentCMF > smaI && prevCMF < smaPrev;
          const isBearishCrossover = currentCMF < smaI && prevCMF > smaPrev;
          const isOverbought = currentCMF > symbolOptions.indicators.cmf.tresholds.overbought;
          const isOversold = currentCMF < symbolOptions.indicators.cmf.tresholds.oversold;
          if (isBullishCrossover) {
            check = "BUY";
            break;
          } else if (isBearishCrossover) {
            check = "SELL";
            break;
          } else if (isOverbought) {
            check = "SELL";
            break;
          } else if (isOversold) {
            check = "BUY";
            break;
          }
        }
      }
    }
  }

  return check;
};
