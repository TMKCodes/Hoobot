// Calculate Exponential Moving Average (EMA)
export function calculateEMA(candles: any[], length: number): number {
  const prices = candles.slice(-length).map((candle) => parseFloat(candle.close));
  const sum = prices.reduce((total, price) => total + price);
  const ema = sum / length;
  return ema;
}

export function logEMASignals(emaA: number, emaB: number, prevEmaA: number, prevEmaB: number) {
  console.log(`EMA A: ${emaA}`);
  console.log(`EMA B: ${emaB}`);
  console.log(`EMA Difference: ${emaA - emaB}`);
  const emaDiff = emaA - emaB;
  if(emaDiff > 0) {
    console.log(`EMA signal: Buy`);
  } else if (emaDiff < 0) {
    console.log(`EMA signal: Sell`);
  }
  if(prevEmaA !== undefined && prevEmaB !== undefined) {
    // Check for bullish EMA crossover (EMA A crosses above EMA B)
    if (emaA > emaB && prevEmaA < prevEmaB) {
      console.log('EMA Bullish Crossover: Buy');
    }

    // Check for bearish EMA crossover (EMA A crosses below EMA B)
    if (emaA < emaB && prevEmaA > prevEmaB) {
      console.log('EMA Bearish Crossover: Sell');
    }
  }
}