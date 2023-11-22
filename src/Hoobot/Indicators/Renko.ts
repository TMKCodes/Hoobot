import { Candlestick } from "../Binance/Candlesticks";
import { ConfigOptions } from "../Utilities/args";
import { ConsoleLogger } from "../Utilities/consoleLogger";

export interface RenkoBrick {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  color?: string;
}

export const calculateRenko = (
  candlesticks: Candlestick[], 
  brickSize: number
): RenkoBrick[] => {
  const renko: RenkoBrick[] = [];
  let currentPrice = candlesticks[0].close;
  let currentOpen = candlesticks[0].open;
  let currentHigh = candlesticks[0].high;
  let currentLow = candlesticks[0].low;
  let brickColor: 'green' | 'red' = 'green';
  renko.push({ time: candlesticks[0].time, open: currentOpen, high: currentHigh, low: currentLow, close: currentPrice, color: brickColor });
  for (let i = 1; i < candlesticks.length; i++) {
    const { close } = candlesticks[i];
    brickColor = close > currentPrice ? 'green' : 'red';
    while (close >= currentPrice + brickSize) {
      currentPrice += brickSize;
      currentHigh = currentPrice;
      currentLow = currentPrice - brickSize;
      renko.push({ time: candlesticks[i].time, open: currentOpen, high: currentHigh, low: currentLow, close: currentPrice, color: brickColor });
    }
    while (close <= currentPrice - brickSize) {
      currentPrice -= brickSize;
      currentLow = currentPrice;
      currentHigh = currentPrice + brickSize;
      renko.push({ time: candlesticks[i].time, open: currentOpen, high: currentHigh, low: currentLow, close: currentPrice, color: brickColor });
    }
    currentOpen = renko[renko.length - 1].close;
    currentHigh = renko[renko.length - 1].high; 
    currentLow = renko[renko.length - 1].low;   
  }

  return renko;
}

export const logRenkoSignals = (
  consoleLogger: ConsoleLogger,
  renkoData: RenkoBrick[]
) => {
  const lastBrick = renkoData[renkoData.length - 1];
  const prevBrick = renkoData[renkoData.length - 2];
  const brickColor = lastBrick.close > lastBrick.open ? 'green' : 'red';
  let signal = "";
  let direction = "flat";
  if (prevBrick !== undefined) {
    const isBullishCrossover = brickColor === 'green' && prevBrick.color === 'red';
    const isBearishCrossover = brickColor === 'red' && prevBrick.color === 'green';
    const isUpwardDirection = lastBrick.close > prevBrick.close;
    const isDownwardDirection = lastBrick.close < prevBrick.close;
    const isFlatDirection = !isUpwardDirection && !isDownwardDirection;
    if (isBullishCrossover) {
      signal = `Bullish Crossover`;
    } else if (isBearishCrossover) {
      signal = `Bearish Crossover`;
    }
    if (isUpwardDirection) {
      direction = `Upward`;
    } else if (isDownwardDirection) {
      direction = `Downward`;
    } else if (isFlatDirection) {
      direction = `Flat`;
    }
  }
  consoleLogger.push("Renko", {
    open: lastBrick?.open?.toFixed(7),
    close: lastBrick?.close?.toFixed(7),
    color: brickColor,
    signal: signal,
    direction: direction,
  });
};

export const checkRenkoSignals = (
  consoleLogger: ConsoleLogger,
  renkoData: RenkoBrick[],
  options: ConfigOptions
) => {
  let check = 'SKIP';
  if (options.useRenko) {
    check = 'HOLD';
    const lastBrick = renkoData[renkoData.length - 1];
    const prevBrick = renkoData[renkoData.length - 2];
    const isBullishCrossover = lastBrick?.color === 'green' && prevBrick?.color === 'red';
    const isBearishCrossover = lastBrick?.color === 'red' && prevBrick?.color === 'green';
    const isUpwardDirection = lastBrick?.close > prevBrick?.close;
    const isDownwardDirection = lastBrick?.close < prevBrick?.close;
    const isFlatDirection = !isUpwardDirection && !isDownwardDirection;
    if (isBullishCrossover) {
      options.RenkoWeight = 2;
      check = 'BUY';
    } else if (isBearishCrossover) {
      options.RenkoWeight = 2;
      check = 'SELL';
    } else if (isFlatDirection) {
      options.RenkoWeight = 1;
      check = 'HOLD';
    } else {
      options.RenkoWeight = 1;
      check = 'HOLD';
    }
  }

  return check;
};