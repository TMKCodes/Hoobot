export function logRSISignals(rsi: number) {
  console.log(`RSI: ${rsi}`);

  const overboughtThreshold = 70;
  const oversoldThreshold = 30;

  if (rsi > overboughtThreshold) {
    console.log(`RSI Overbought condition: Sell`);
  }

  if (rsi < oversoldThreshold) {
    console.log(`RSI Oversold condition: Buy`);
  }

  if (rsi < overboughtThreshold && rsi > oversoldThreshold) {
    console.log(`RSI Neutral condition: neutral.`)
  }

}

// Calculate RSI
export function calculateRSI(candles: any[], period: number = 14): number {
  if (candles.length < period) {
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

  // Calculate average gains and losses over the first 'period' data points
  let sumGains = 0;
  let sumLosses = 0;
  for (let i = 0; i < period; i++) {
    sumGains += gains[i];
    sumLosses += losses[i];
  }
  let avgGain = sumGains / period;
  let avgLoss = sumLosses / period;

  //console.log(`Initial avgGain: ${avgGain}, avgLoss: ${avgLoss}`);

  // Calculate the RSI itself
  const rsArray: number[] = [];
  for (let i = period; i <= closePrices.length; i++) {
    if (i < closePrices.length) {
      avgGain = ((avgGain * (period - 1)) + gains[i - 1]) / period;
      avgLoss = ((avgLoss * (period - 1)) + losses[i - 1]) / period;
    }

    // Handle the case when average loss is 0
    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    const rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));

    //console.log(`Iteration ${i}, avgGain: ${avgGain}, avgLoss: ${avgLoss}, rs: ${rs}, rsi: ${rsi}`);
    rsArray.push(rsi);
  }

  return rsArray[rsArray.length - 1]; 
}