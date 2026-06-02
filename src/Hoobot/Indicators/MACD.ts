import { Candlestick } from "../Exchanges/Candlesticks";
import { SymbolOptions } from "../Utilities/Args";
import { ConsoleLogger } from "../Utilities/ConsoleLogger";
import { calculateEMA } from "./EMA";

export interface macd {
  macdLine: number[];
  signalLine: number[];
  histogram: number[];
}

export const logMACDSignals = (consoleLogger: ConsoleLogger, macd: macd) => {
  if (!macd?.macdLine?.length || macd.macdLine.length < 2 || !macd.signalLine?.length || !macd.histogram?.length)
    return;
  const macdLine = macd.macdLine[macd.macdLine.length - 1];
  const signalLine = macd.signalLine[macd.signalLine.length - 1];
  const histogram = macd.histogram[macd.histogram.length - 1];
  if (macdLine !== undefined && signalLine !== undefined && histogram !== undefined) {
    const prevMacdLine = macd.macdLine[macd.macdLine.length - 2];
    const prevSignalLine = macd.signalLine[macd.signalLine.length - 2];
    const prevHistogram = macd.histogram[macd.histogram.length - 2];
    const isBullishCrossover = macdLine > signalLine && prevMacdLine <= prevSignalLine;
    const isBearishCrossover = macdLine < signalLine && prevMacdLine >= prevSignalLine;
    const isBullishDivergence = macdLine > prevMacdLine && histogram > prevHistogram;
    const isBearishDivergence = macdLine < prevMacdLine && histogram < prevHistogram;
    const isBullishZeroLineCrossover = macdLine > 0 && prevMacdLine <= 0;
    const isBearishZeroLineCrossover = macdLine < 0 && prevMacdLine >= 0;
    const isBullishCenterlineCrossover = macdLine > signalLine && prevMacdLine <= prevSignalLine;
    const isBearishCenterlineCrossover = macdLine < signalLine && prevMacdLine >= prevSignalLine;
    const isStrongBullishTrend = macdLine > 100 && prevMacdLine <= 100;
    const isStrongBearishTrend = macdLine < -100 && prevMacdLine >= -100;
    const isPositiveHistogramDivergence = histogram > 0 && prevHistogram < 0;
    const isNegativeHistogramDivergence = histogram < 0 && prevHistogram > 0;
    let signal = "Neutral";
    if (isBullishCrossover) {
      signal = "Bullish Line Crossover";
    } else if (isBearishCrossover) {
      signal = "Bearish Line Crossover";
    } else if (isBullishDivergence) {
      signal = "Bullish Divergence";
    } else if (isBearishDivergence) {
      signal = "Bearish Divergence";
    } else if (isBullishZeroLineCrossover) {
      signal = "Bullish Zero Line Crossover";
    } else if (isBearishZeroLineCrossover) {
      signal = "Bearish Zero Line Crossover";
    } else if (isBullishCenterlineCrossover) {
      signal = "Bullish Centerline Crossover";
    } else if (isBearishCenterlineCrossover) {
      signal = "Bearish Centerline Crossover";
    } else if (isStrongBullishTrend) {
      signal = "Strong Bullish Trend";
    } else if (isStrongBearishTrend) {
      signal = "Strong Bearish Trend";
    } else if (isPositiveHistogramDivergence) {
      signal = "Positive Histogram Divergence";
    } else if (isNegativeHistogramDivergence) {
      signal = "Negative Histogram Divergence";
    }
    consoleLogger.push("MACD", {
      line: macdLine.toFixed(7),
      signalline: signalLine.toFixed(7),
      histogram: histogram.toFixed(7),
      signal: signal,
    });
  }
};

export const calculateMACD = (
  candles: Candlestick[],
  shortEMA: number,
  longEMA: number,
  signalLength = 9,
  source: string,
): macd => {
  const empty = { macdLine: [] as number[], signalLine: [] as number[], histogram: [] as number[] };
  if (!Array.isArray(candles) || candles.length === 0) {
    return empty;
  }
  const fast = shortEMA > 0 ? shortEMA : 12;
  const slow = longEMA > 0 ? longEMA : 26;
  const signal = signalLength > 0 ? signalLength : 9;
  if (candles.length < slow) {
    return empty;
  }
  shortEMA = fast;
  longEMA = slow;
  signalLength = signal;
  let shortEMAs = calculateEMA(candles, shortEMA, source);
  let longEMAs = calculateEMA(candles, longEMA, source);
  if (longEMAs.length < shortEMAs.length) {
    shortEMAs = shortEMAs.slice(-longEMAs.length);
  }
  if (shortEMAs.length < longEMAs.length) {
    longEMAs = longEMAs.slice(-shortEMAs.length);
  }
  let macdLine: number[] = [];
  for (let i = 0; i < shortEMAs.length; i++) {
    macdLine.push(shortEMAs[i] - longEMAs[i]);
  }
  const signalCandles = macdLine.map((value) => ({ close: value }) as Candlestick);
  let signalLine = calculateEMA(signalCandles, signalLength, "close");
  if (signalLine.length < macdLine.length) {
    macdLine = macdLine.slice(-signalLine.length);
  }
  if (macdLine.length < signalLine.length) {
    signalLine = signalLine.slice(-macdLine.length);
  }
  const histogram: number[] = [];
  for (let i = 0; i < signalLine.length; i++) {
    histogram.push(macdLine[i] - signalLine[i]);
  }
  return {
    macdLine,
    signalLine,
    histogram,
  };
};

export const checkMACDSignals = (macd: macd | undefined, symbolOptions: SymbolOptions) => {
  let check = "SKIP";
  if (symbolOptions.indicators !== undefined) {
    if (symbolOptions.indicators.macd && symbolOptions.indicators.macd.enabled) {
      if (!macd?.histogram?.length || !macd.macdLine?.length || !macd.signalLine?.length || macd.histogram.length < 2) {
        return "HOLD";
      }
      check = "HOLD";
      const currentHistogram = macd.histogram[macd.histogram.length - 1];
      const prevHistogram = macd.histogram[macd.histogram.length - 2];
      const currentMacdLine = macd.macdLine[macd.macdLine.length - 1];
      const prevMacdLine = macd.macdLine[macd.macdLine.length - 2];
      const currentSignalLine = macd.signalLine[macd.signalLine.length - 1];
      const prevSignalLine = macd.signalLine[macd.signalLine.length - 2];
      if (
        currentHistogram !== undefined &&
        prevHistogram !== undefined &&
        currentMacdLine !== undefined &&
        currentSignalLine !== undefined
      ) {
        var isHistogramPositive = currentHistogram > 0;
        var isHistogramNegative = currentHistogram < 0;
        const isMacdLineAboveSignalLine = currentMacdLine > currentSignalLine;
        const isMacdLineBelowSignalLine = currentMacdLine < currentSignalLine;
        var isMacdLinePositive = currentMacdLine > 0;
        var isMacdLineNegative = currentMacdLine < 0;
        const isSignalLinePositive = currentSignalLine > 0;
        const isSignalLineNegative = currentSignalLine < 0;
        if (symbolOptions.indicators.macd.weight == undefined) {
          symbolOptions.indicators.macd.weight = 1;
        }
        const bullishCross = currentMacdLine > currentSignalLine && prevMacdLine <= prevSignalLine;
        const bearishCross = currentMacdLine < currentSignalLine && prevMacdLine >= prevSignalLine;
        if (bullishCross) {
          check = "BUY";
        } else if (bearishCross) {
          check = "SELL";
        }
      }
    }
  }
  return check;
};
