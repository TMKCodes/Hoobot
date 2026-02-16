import { Candlestick } from "../Exchanges/Candlesticks";
import { ConfigOptions, SymbolOptions } from "../Utilities/Args";
import { ConsoleLogger } from "../Utilities/ConsoleLogger";
import { calculateSMA } from "./SMA";

export const calculateCCI = (candles: Candlestick[], period: number = 20): number[] => {
  if (period === 0) {
    period = 20;
  }
  if (!candles || candles.length < period) {
    return [];
  }

  const cci: number[] = [];
  const typicalPrices: number[] = [];

  // Calculate Typical Price for each candle
  for (const candle of candles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    typicalPrices.push(typicalPrice);
  }

  for (let i = period - 1; i < candles.length; i++) {
    const slice = typicalPrices.slice(i - period + 1, i + 1);
    const sma = slice.reduce((sum, price) => sum + price, 0) / period;

    // Calculate Mean Deviation
    const meanDeviation = slice.reduce((sum, price) => sum + Math.abs(price - sma), 0) / period;

    if (meanDeviation === 0) {
      cci.push(0);
    } else {
      const currentTP = typicalPrices[i];
      const cciValue = (currentTP - sma) / (0.015 * meanDeviation);
      cci.push(cciValue);
    }
  }

  return cci;
};

export const logCCISignals = (consoleLogger: ConsoleLogger, cci: number[]) => {
  if (cci.length === 0) return;
  const currentCCI = cci[cci.length - 1];
  let signal = "Neutral";
  if (currentCCI > 100) {
    signal = "Overbought";
  } else if (currentCCI < -100) {
    signal = "Oversold";
  } else if (currentCCI > 0) {
    signal = "Bullish";
  } else if (currentCCI < 0) {
    signal = "Bearish";
  }
  consoleLogger.push("CCI", {
    value: currentCCI.toFixed(7),
    signal: signal,
  });
};

export const checkCCISignals = (cci: number[], symbolOptions: SymbolOptions): string => {
  let check = "SKIP";
  if (symbolOptions.indicators !== undefined) {
    if (symbolOptions.indicators.cci && symbolOptions.indicators.cci.enabled) {
      check = "HOLD";
      if (cci.length < 2) {
        return check;
      }

      const currentCCI = cci[cci.length - 1];
      const previousCCI = cci[cci.length - 2];

      const overboughtThreshold = symbolOptions.indicators.cci.thresholds?.overbought || 100;
      const oversoldThreshold = symbolOptions.indicators.cci.thresholds?.oversold || -100;

      // CCI signals:
      // BUY: CCI crosses above oversold threshold from below, or CCI < oversold and rising
      // SELL: CCI crosses below overbought threshold from above, or CCI > overbought and falling

      if (
        (currentCCI > oversoldThreshold && previousCCI <= oversoldThreshold) ||
        (currentCCI < oversoldThreshold && currentCCI > previousCCI)
      ) {
        symbolOptions.indicators.cci.weight = 1;
        check = "BUY";
      } else if (
        (currentCCI < overboughtThreshold && previousCCI >= overboughtThreshold) ||
        (currentCCI > overboughtThreshold && currentCCI < previousCCI)
      ) {
        symbolOptions.indicators.cci.weight = 1;
        check = "SELL";
      }
    }
  }
  return check;
};
