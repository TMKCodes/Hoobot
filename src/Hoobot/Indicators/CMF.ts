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
  if (cmfValues.length === 0) {
    consoleLogger.push("CMF", {
      value: "N/A",
      smoothed: "N/A",
      signal: "N/A",
    });
    return;
  }
  const currentCMF = cmfValues[cmfValues.length - 1];
  const prevCMF = cmfValues.length > 1 ? cmfValues[cmfValues.length - 2] : 0;
  const cmfSMA = calculateSMA(
    cmfValues.map((value) => ({ close: value }) as Candlestick),
    50,
    "close",
  );
  const currentSMA = cmfSMA.length > 0 ? cmfSMA[cmfSMA.length - 1] : 0;
  const prevSMA = cmfSMA.length > 1 ? cmfSMA[cmfSMA.length - 2] : 0;
  const isBullishCrossover = currentCMF > currentSMA && prevCMF < prevSMA;
  const isBearishCrossover = currentCMF < currentSMA && prevCMF > prevSMA;
  const isOverbought = currentCMF > (symbolOptions.indicators?.cmf?.thresholds.overbought || 0.25);
  const isOversold = currentCMF < (symbolOptions.indicators?.cmf?.thresholds.oversold || -0.25);
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
    smoothed: currentSMA.toFixed(7),
    signal: signal,
  });
};

export const checkCMFSignals = (cmfValues: number[], symbolOptions: SymbolOptions) => {
  let check = "SKIP";
  if (symbolOptions.indicators !== undefined) {
    if (symbolOptions.indicators.cmf !== undefined) {
      if (symbolOptions.indicators.cmf.enabled) {
        check = "HOLD";
        if (cmfValues.length < 2) {
          return check;
        }

        const currentCMF = cmfValues[cmfValues.length - 1];
        const prevCMF = cmfValues[cmfValues.length - 2];

        const overboughtThreshold = symbolOptions.indicators.cmf.thresholds.overbought || 0.25;
        const oversoldThreshold = symbolOptions.indicators.cmf.thresholds.oversold || -0.25;

        // CMF signals:
        // BUY: CMF crosses above 0 (bullish momentum) or enters oversold territory
        // SELL: CMF crosses below 0 (bearish momentum) or enters overbought territory

        const bullishZeroCrossover = currentCMF > 0 && prevCMF <= 0;
        const bearishZeroCrossover = currentCMF < 0 && prevCMF >= 0;
        const isOversold = currentCMF < oversoldThreshold;
        const isOverbought = currentCMF > overboughtThreshold;

        if (bullishZeroCrossover || isOversold) {
          symbolOptions.indicators.cmf.weight = 1;
          check = "BUY";
        } else if (bearishZeroCrossover || isOverbought) {
          symbolOptions.indicators.cmf.weight = 1;
          check = "SELL";
        }
      }
    }
  }

  return check;
};
