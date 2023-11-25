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
  volume?: number;
}

export const calculateBrickSize = (
  atr: number[],
  options: ConfigOptions
) => {
  const averageAtr = atr
      .filter((atr) => atr !== undefined)
      .reduce((sum, atr) => sum + atr, 0) / atr.length;
  if (options.RenkoBrickMultiplier > 0) {
    return averageAtr * options.RenkoBrickMultiplier;
  }
  return averageAtr;
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
  let currentVolume = 0;
  renko.push({ time: candlesticks[0].time, open: currentOpen, high: currentHigh, low: currentLow, close: currentPrice, color: brickColor, volume: currentVolume });

  for (let i = 1; i < candlesticks.length; i++) {
    const { close, volume } = candlesticks[i];

    if (close > currentPrice + brickSize) {
      while (close > currentPrice + brickSize) {
        currentLow = currentPrice;
        currentHigh = currentPrice + brickSize;
        currentPrice += brickSize;
        brickColor = 'green';
        renko.push({ time: candlesticks[i].time, open: currentOpen, high: currentHigh, low: currentLow, close: currentPrice, color: brickColor, volume: currentVolume });
        currentVolume = 0;
      }
    } else if (close < currentPrice - brickSize) {
      while (close < currentPrice - brickSize) {
        currentHigh = currentPrice;
        currentLow = currentPrice - brickSize;
        currentPrice -= brickSize;
        brickColor = 'red';
        renko.push({ time: candlesticks[i].time, open: currentOpen, high: currentHigh, low: currentLow, close: currentPrice, color: brickColor, volume: currentVolume });
        currentVolume = 0;
      }
    } else {
      currentVolume += volume || 0;
    }
  }
  return renko;
}

export const logRenkoSignals = (
  consoleLogger: ConsoleLogger,
  renkoData: RenkoBrick[],
  options: ConfigOptions
) => {
  const lastBrick = renkoData[renkoData.length - 1];
  const prevBrick = renkoData[renkoData.length - 2];
  let signal = "";
  if (prevBrick !== undefined) {
    const isBullishCrossover = lastBrick?.color === 'green' && prevBrick.color === 'red';
    const isBearishCrossover = lastBrick?.color === 'red' && prevBrick.color === 'green';
    const isUpwardDirection = lastBrick.close > prevBrick.close;
    const isDownwardDirection = lastBrick.close < prevBrick.close;
    const isFlatDirection = !isUpwardDirection && !isDownwardDirection;
    const isPriceMoveBeyondThreshold = Math.abs(lastBrick?.close - prevBrick?.close) >= options.renkoBrickSize;
    if (isBullishCrossover && isPriceMoveBeyondThreshold) {
      signal = `Bullish Crossover`;
    } else if (isBearishCrossover && isPriceMoveBeyondThreshold) {
      signal = `Bearish Crossover`;
    } else  if (isUpwardDirection) {
      signal = `Upward`;
    } else if (isDownwardDirection) {
      signal = `Downward`;
    } else if (isFlatDirection) {
      signal = `Flat`;
    }
  }
  consoleLogger.push("Renko", {
    open: lastBrick?.open?.toFixed(7),
    close: lastBrick?.close?.toFixed(7),
    color: lastBrick?.color,
    signal: signal,
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
    const isPriceMoveBeyondThreshold = Math.abs(lastBrick?.close - prevBrick?.close) >= options.renkoBrickSize;
    if (isBullishCrossover && isPriceMoveBeyondThreshold) {
      options.RenkoWeight = 2;
      check = 'BUY';
    } else if (isBearishCrossover && isPriceMoveBeyondThreshold) {
      options.RenkoWeight = 2;
      check = 'SELL';
    } else {
      options.RenkoWeight = 1;
      check = 'HOLD';
    }
  }

  return check;
};