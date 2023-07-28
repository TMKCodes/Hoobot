
import { ConsoleLogger } from './consoleLogger';

export function logRSISignals(consoleLogger: ConsoleLogger, rsi: number) {
  consoleLogger.push(`RSI`, rsi.toFixed(2));
  if (rsi > 80) {
    consoleLogger.push(`RSI condition`, `Extremely Overbought`);
  } else if (rsi < 20) {
    consoleLogger.push(`RSI condition`, `Extremely Oversold`);
  } else if (rsi > 70) {
    consoleLogger.push(`RSI condition`, `Overbought`);
  } else if (rsi < 30) {
    consoleLogger.push(`RSI condition`, `Oversold`);
  } else if (rsi < 50) {
    consoleLogger.push(`RSI signal`, `Bullish`);
  } else if(rsi > 50) {
    consoleLogger.push(`RSI signal`, `Bearish`);
  }
}

// Calculate RSI
export function calculateRSI(candles: any[], length: number = 14): number {
  if (candles.length < length) {
    throw new Error('Insufficient data to calculate RSI');
  }
  // Get closing prices from candles
  const closePrices: number[] = candles.map((candle) => parseFloat(candle.close));

  // Calculate price changes
  const priceChanges: number[] = [];
  for (let i = 1; i < closePrices.length; i++) {
    priceChanges.push(closePrices[i] - closePrices[i - 1]);
  }

  // Calculate gains and losses
  const gains: number[] = [];
  const losses: number[] = [];
  for (const change of priceChanges) {
    if (change > 0) { // Modified this line to fix the issue
      gains.push(change);
      losses.push(0);
    } else {
      gains.push(0);
      losses.push(Math.abs(change));
    }
  }

  // Calculate average gains and losses over the first 'length' data points
  let sumGains = 0;
  let sumLosses = 0;
  for (let i = 0; i < length; i++) {
    sumGains += gains[i];
    sumLosses += losses[i];
  }
  let avgGain = sumGains / length;
  let avgLoss = sumLosses / length;

  //console.log(`Initial avgGain: ${avgGain}, avgLoss: ${avgLoss}`);

  // Calculate the RSI itself
  const rsArray: number[] = [];
  for (let i = length; i <= closePrices.length; i++) {
    if (i < closePrices.length) {
      avgGain = ((avgGain * (length - 1)) + gains[i - 1]) / length;
      avgLoss = ((avgLoss * (length - 1)) + losses[i - 1]) / length;
    }

    // Handle the case when average loss is 0
    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    const rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));

    //console.log(`Iteration ${i}, avgGain: ${avgGain}, avgLoss: ${avgLoss}, rs: ${rs}, rsi: ${rsi}`);
    rsArray.push(rsi);
  }

  return rsArray[rsArray.length - 1]; 
}