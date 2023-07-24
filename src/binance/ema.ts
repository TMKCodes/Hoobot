// Calculate Exponential Moving Average (EMA)
export function calculateEMA(candles: any[], length: number): number {
  // const prices = candles.slice(-length).map((candle) => parseFloat(candle.close));
  // const sum = prices.reduce((total, price) => total + price);
  // const ema = sum / length;
  // return ema;
  const ema = calculateEMAArray(candles, length);
  return ema[ema.length - 1];
}


export function calculateEMAArray(candles: any[], length: number): number[] {
  const emaValues: number[] = [];
  const prices = candles.map((candle) => parseFloat(candle.close));

  let sum = 0;
  for (let i = 0; i < length; i++) {
    sum += prices[i];
  }
  const initialEMA = sum / length;
  emaValues.push(initialEMA);

  const smoothingFactor = 2 / (length + 1);
  for (let i = length; i < prices.length; i++) {
    const currentEMA = (prices[i] - emaValues[i - length]) * smoothingFactor + emaValues[i - length];
    emaValues.push(currentEMA);
  }

  return emaValues;
}

export const logEMASignals = (
  shortEma: number,
  longEma: number,
  prevShortEma: number | undefined,
  prevLongEma: number | undefined
) => {
  console.log(`EMA A: ${shortEma.toFixed(2)}`);
  console.log(`EMA B: ${longEma.toFixed(2)}`);
  console.log(`EMA Difference: ${(shortEma - longEma).toFixed(2)}`);

  const emaDiff = shortEma - longEma;

  if (emaDiff > 0) {
    console.log(`EMA Signal: Bullish`);
  } else if (emaDiff < 0) {
    console.log(`EMA Signal: Bearish`);
  } else {
    console.log(`EMA Signal: Neutral`);
  }

  if (prevShortEma !== undefined && prevLongEma !== undefined) {
    const isBullishCrossover = shortEma > longEma && prevShortEma <= prevLongEma;
    const isBearishCrossover = shortEma < longEma && prevShortEma >= prevLongEma;
    const isUpwardDirection = shortEma > prevShortEma && longEma > prevLongEma;
    const isDownwardDirection = shortEma < prevShortEma && longEma < prevLongEma;
    const isFlatDirection = !isUpwardDirection && !isDownwardDirection;

    if (isBullishCrossover) {
      console.log('EMA Signal: Bullish Crossover');
    } else if (isBearishCrossover) {
      console.log('EMA Signal: Bearish Crossover');
    }

    if (isUpwardDirection) {
      console.log('EMA Direction: Upward');
    } else if (isDownwardDirection) {
      console.log('EMA Direction: Downward');
    } else if (isFlatDirection) {
      console.log('EMA Direction: Flat');
    }
  }
};

interface EMAData {
  shortEma: number[];
  longEma: number[];
}

export const findEMACrossovers = (candlesticks: any[], shortEmaLength: number, longEmaLength: number): EMAData => {
  const emaData: EMAData = {
    shortEma: [],
    longEma: [],
  };

  // Calculate EMA arrays for both lengths
  const shortEmaArray = calculateEMAArray(candlesticks, shortEmaLength);
  const longEmaArray = calculateEMAArray(candlesticks, longEmaLength);

  // Add calculated EMA values to the emaData
  emaData.shortEma = shortEmaArray;
  emaData.longEma = longEmaArray;

  // Find EMA crossovers
  const crossovers: number[] = [];
  for (let i = longEmaLength; i < shortEmaArray.length; i++) {
    if (shortEmaArray[i] > longEmaArray[i] && shortEmaArray[i - 1] < longEmaArray[i - 1]) {
      // EMA A crossed above EMA B (Bullish crossover)
      crossovers.push(i);
    } else if (shortEmaArray[i] < longEmaArray[i] && shortEmaArray[i - 1] > longEmaArray[i - 1]) {
      // EMA A crossed below EMA B (Bearish crossover)
      crossovers.push(i);
    }
  }

  // Log the dates of EMA crossovers based on candlestick data
  console.log('EMA Crossovers:');
  crossovers.forEach((index) => {
    const crossoverDate = new Date(candlesticks[index].time);
    console.log(crossoverDate.toISOString(), 'EMA A:', shortEmaArray[index], 'EMA B:', longEmaArray[index]);
  });

  return emaData;
}