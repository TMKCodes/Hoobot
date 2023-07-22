import { calculateEMA } from "./ema";

export function logMACDSignals(macd: { macdLine: any; signalLine: any; histogram: any; }, prevMacd: { macdLine: any; signalLine: any; histogram: any; }) {

  const { macdLine, signalLine, histogram } = macd;

  console.log(`MACD Line: ${macdLine}`);
  console.log(`MACD Signal Line: ${signalLine}`);
  console.log(`MACD Histogram: ${histogram}`);

  // Check for bullish signal (MACD line crossing above signal line and histogram turning positive)
  if (macdLine > signalLine && histogram > 0) {
    console.log('MACD Bullish Signal: Buy');
  }

  // Check for bearish signal (MACD line crossing below signal line and histogram turning negative)
  if (macdLine < signalLine && histogram < 0) {
    console.log('MACD Bearish Signal: Sell');
  }
  if(prevMacd !== undefined) {
    // Check for signal line crossover (MACD line crosses above signal line)
    if (macdLine > signalLine && prevMacd.macdLine < prevMacd.signalLine) {
      console.log('MACD Signal Line Crossover: Buy');
    }

    // Check for signal line crossover (MACD line crosses below signal line)
    if (macdLine < signalLine && prevMacd.macdLine > prevMacd.signalLine) {
      console.log('MACD Signal Line Crossover: Sell');
    }
  }
}

export function calculateMACD(candles: any[], shortEMA: number, longEMA: number, signalEMAperiod = 9) {
  const macdLine = shortEMA - longEMA;
  const signalEMA = calculateEMA(candles, signalEMAperiod);
  const histogram = macdLine - signalEMA;
  return {
    macdLine,
    signalLine: signalEMA,
    histogram,
  };
}