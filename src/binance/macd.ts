import { ConsoleLogger } from "./consoleLogger";
import { calculateEMAArray } from "./ema";

export const logMACDSignals = (
  consoleLogger: ConsoleLogger,
  macd: {
    macdLine: number;
    signalLine: number;
    histogram: number;
  }, prevMacd: {
    macdLine: number;
    signalLine: number;
    histogram: number;
  } | undefined
) => {
  const { macdLine, signalLine, histogram } = macd;

  consoleLogger.push(`MACD Line`, macdLine.toFixed(2));
  consoleLogger.push(`MACD Signal Line`, signalLine.toFixed(2));
  consoleLogger.push(`MACD Histogram`, histogram.toFixed(2));

  if (!prevMacd) {
    if (macdLine > signalLine && histogram > 0) {
      consoleLogger.push(`MACD Signal`, 'Bullish');
    } else if (macdLine < signalLine && histogram < 0) {
      consoleLogger.push(`MACD Signal`, 'Bearish');
    }
  } else {
    const isBullishCrossover = macdLine > signalLine && prevMacd.macdLine <= prevMacd.signalLine;
    const isBearishCrossover = macdLine < signalLine && prevMacd.macdLine >= prevMacd.signalLine;
    const isBullishDivergence = macdLine > prevMacd.macdLine && histogram > prevMacd.histogram;
    const isBearishDivergence = macdLine < prevMacd.macdLine && histogram < prevMacd.histogram;
    const isBullishZeroLineCrossover = macdLine > 0 && prevMacd.macdLine <= 0;
    const isBearishZeroLineCrossover = macdLine < 0 && prevMacd.macdLine >= 0;
    const isBullishCenterlineCrossover = macdLine > signalLine && prevMacd.macdLine <= prevMacd.signalLine;
    const isBearishCenterlineCrossover = macdLine < signalLine && prevMacd.macdLine >= prevMacd.signalLine;
    const isStrongBullishTrend = macdLine > 100 && prevMacd.macdLine <= 100;
    const isStrongBearishTrend = macdLine < -100 && prevMacd.macdLine >= -100;
    const isPositiveHistogramDivergence = histogram > 0 && prevMacd.histogram < 0;
    const isNegativeHistogramDivergence = histogram < 0 && prevMacd.histogram > 0;

    if (isBullishCrossover) {
      consoleLogger.push(`MACD Signal`, 'Bullish Line Crossover');
    } else if (isBearishCrossover) {
      consoleLogger.push(`MACD Signal`, 'Bearish Line Crossover');
    } else if (isBullishDivergence) {
      consoleLogger.push(`MACD Signal`, 'Bullish Divergence');
    } else if (isBearishDivergence) {
      consoleLogger.push(`MACD Signal`, 'Bearish Divergence');
    } else if (isBullishZeroLineCrossover) {
      consoleLogger.push(`MACD Signal`, 'Bullish Zero Line Crossover');
    } else if (isBearishZeroLineCrossover) {
      consoleLogger.push(`MACD Signal`, 'Bearish Zero Line Crossover');
    } else if (isBullishCenterlineCrossover) {
      consoleLogger.push(`MACD Signal`, 'Bullish Centerline Crossover');
    } else if (isBearishCenterlineCrossover) {
      consoleLogger.push(`MACD Signal`, 'Bearish Centerline Crossover');
    } else if (isStrongBullishTrend) {
      consoleLogger.push(`MACD Signal`, 'Strong Bullish Trend');
    } else if (isStrongBearishTrend) {
      consoleLogger.push(`MACD Signal`, 'Strong Bearish Trend');
    } else if (isPositiveHistogramDivergence) {
      consoleLogger.push(`MACD Signal`, 'Positive Histogram Divergence');
    } else if (isNegativeHistogramDivergence) {
      consoleLogger.push(`MACD Signal`, 'Negative Histogram Divergence');
    }
  }
}

export const calculateMACD = (candles: any[], shortEMA: number, longEMA: number, signalEMAperiod = 9) => {
  const macd = calculateMACDArray(candles, shortEMA, longEMA, signalEMAperiod);
  return {
    macdLine: macd.macdLine[macd.macdLine.length - 1],
    signalLine: macd.signalLine[macd.signalLine.length - 1],
    histogram: macd.histogram[macd.histogram.length - 1],
  }
}

export function calculateMACDArray(candles: any[], shortEMA: number, longEMA: number, signalEMAperiod = 9) {
  let shortEMAs = calculateEMAArray(candles, shortEMA);
  let longEMAs = calculateEMAArray(candles, longEMA);

  if(longEMAs.length < shortEMAs.length) {
    shortEMAs = shortEMAs.slice(-longEMAs.length);
  }
  if(longEMAs.length > shortEMAs.length) {
    longEMAs = longEMAs.slice(-shortEMAs.length);
  }

  let macdLine = shortEMAs.map((shortEMAValue, index) => shortEMAValue - longEMAs[index]);

  const macdCandles = macdLine.map((value) => ({ close: value }));
  let signalEMA = calculateEMAArray(macdCandles, signalEMAperiod);
  
  if(macdLine.length < signalEMA.length) {
    signalEMA = signalEMA.slice(-macdLine.length);
  }
  if(macdLine.length > signalEMA.length) {
    macdLine = macdLine.slice(-signalEMA.length);
  }

  const histogram: number[] = [];
  for (let i = 0; i < macdLine.length; i++) {
    histogram.push(macdLine[i] - signalEMA[i]);
  }
  return {
    macdLine,
    signalLine: signalEMA,
    histogram,
  };
}


