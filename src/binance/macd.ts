import { calculateEMAArray } from "./ema";

export function logMACDSignals(macd: { macdLine: number; signalLine: number; histogram: number; }, prevMacd: { macdLine: number; signalLine: number; histogram: number; }) {
  const { macdLine, signalLine, histogram } = macd;

  console.log(`MACD Line: ${macdLine}`);
  console.log(`MACD Signal Line: ${signalLine}`);
  console.log(`MACD Histogram: ${histogram}`);

  // Check for bullish signal (MACD line crossing above signal line and histogram turning positive)
  if (prevMacd === undefined) {
    if (macdLine > signalLine && histogram > 0) {
      console.log('MACD Signal: Bullish Buy');
    } else if (macdLine < signalLine && histogram < 0) {
      console.log('MACD Signal: Bearish Sell');
    }
  } else if (prevMacd !== undefined) {
    if (macdLine > signalLine && prevMacd.macdLine <= prevMacd.signalLine) {
      console.log('MACD Signal: Bullish Line Crossover - Buy');
    } else if (macdLine < signalLine && prevMacd.macdLine >= prevMacd.signalLine) {
      console.log('MACD Signal: Bearish Line Crossover - Sell');
    } else if (macdLine > prevMacd.macdLine && histogram > prevMacd.histogram) {
      console.log('MACD Signal: Bullish Divergence - Buy');
    } else if (macdLine < prevMacd.macdLine && histogram < prevMacd.histogram) {
      console.log('MACD Signal: Bearish Divergence - Sell');
    } else if (macdLine > 0 && prevMacd.macdLine <= 0) {
      console.log('MACD Signal: Bullish Zero Line Crossover - Buy');
    } else if (macdLine < 0 && prevMacd.macdLine >= 0) {
      console.log('MACD Signal: Bearish Zero Line Crossover - Sell');
    } else if (macdLine > signalLine && prevMacd.macdLine <= prevMacd.signalLine) {
      console.log('MACD Signal: Bullish Centerline Crossover - Buy');
    } else if (macdLine < signalLine && prevMacd.macdLine >= prevMacd.signalLine) {
      console.log('MACD Signal: Bearish Centerline Crossover - Sell');
    } else if (macdLine > 100 && prevMacd.macdLine <= 100) {
      console.log('MACD Signal: Strong Bullish Trend - Buy');
    } else if (macdLine < -100 && prevMacd.macdLine >= -100) {
      console.log('MACD Signal: Strong Bearish Trend - Sell');
    } else if (histogram > 0 && prevMacd.histogram < 0) {
      console.log('MACD Signal: Positive Histogram Divergence - Buy');
    } else if (histogram < 0 && prevMacd.histogram > 0) {
      console.log('MACD Signal: Negative Histogram Divergence - Sell');
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
  //console.log(`MACD Line: ${JSON.stringify(macdLine, null, 4)}`)

  const macdCandles = macdLine.map((value) => ({ close: value }));
  let signalEMA = calculateEMAArray(macdCandles, signalEMAperiod);
  //console.log(`Signal EMA: ${JSON.stringify(signalEMA, null, 4)}`)
  
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
  //console.log(`Histogram: ${JSON.stringify(histogram, null, 4)}`)
  return {
    macdLine,
    signalLine: signalEMA,
    histogram,
  };
}


