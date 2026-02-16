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
  if (macd.macdLine.length === 0 || macd.signalLine.length === 0 || macd.histogram.length === 0) return;
  const macdLine = macd.macdLine[macd.macdLine.length - 1];
  const signalLine = macd.signalLine[macd.signalLine.length - 1];
  const histogram = macd.histogram[macd.histogram.length - 1];
  if (macdLine !== undefined && signalLine !== undefined && histogram !== undefined) {
    if (macd.macdLine.length < 2) {
      consoleLogger.push("MACD", {
        line: macdLine.toFixed(7),
        signal: signalLine.toFixed(7),
        histogram: histogram.toFixed(7),
        signalText: "Neutral",
      });
      return;
    }
    const prevMacdLine = macd.macdLine[macd.macdLine.length - 2];
    const prevSignalLine = macd.signalLine[macd.signalLine.length - 2];
    const prevHistogram = macd.histogram[macd.histogram.length - 2];
    const isBullishCrossover = macdLine > signalLine && prevMacdLine <= prevSignalLine;
    const isBearishCrossover = macdLine < signalLine && prevMacdLine >= prevSignalLine;
    const isBullishDivergence = macdLine > prevMacdLine && histogram > prevHistogram;
    const isBearishDivergence = macdLine < prevMacdLine && histogram < prevHistogram;
    const isBullishZeroLineCrossover = macdLine > 0 && prevMacdLine <= 0;
    const isBearishZeroLineCrossover = macdLine < 0 && prevMacdLine >= 0;
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
  if (candles?.length < longEMA) {
    return {
      macdLine: [],
      signalLine: [],
      histogram: [],
    };
  }
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
  var signalCandles = macdLine.map((value) => ({ close: value }) as Candlestick);
  let signalLine = calculateEMA(signalCandles, signalLength, source);
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

export const checkMACDSignals = (macd: macd, symbolOptions: SymbolOptions) => {
  let check = "SKIP";
  if (symbolOptions.indicators !== undefined) {
    if (symbolOptions.indicators.macd && symbolOptions.indicators.macd.enabled) {
      check = "HOLD";
      if (macd.histogram.length < 2 || macd.macdLine.length < 2 || macd.signalLine.length < 2) {
        return check;
      }
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
        // Check for histogram momentum changes
        const histogramRising = currentHistogram > prevHistogram;
        const histogramFalling = currentHistogram < prevHistogram;
        const histogramPositive = currentHistogram > 0;
        const histogramNegative = currentHistogram < 0;

        if (symbolOptions.indicators.macd.weight === undefined) {
          symbolOptions.indicators.macd.weight = 1;
        }

        // BUY when histogram is negative but starting to rise (bullish momentum)
        if (histogramNegative && histogramRising) {
          symbolOptions.indicators.macd.weight *= 1;
          check = "BUY";
        }
        // SELL when histogram is positive but starting to fall (bearish momentum)
        else if (histogramPositive && histogramFalling) {
          symbolOptions.indicators.macd.weight *= 1;
          check = "SELL";
        }
      }
    }
  }
  return check;
};
