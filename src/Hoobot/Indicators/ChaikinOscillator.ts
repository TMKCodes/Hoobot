import { Candlestick } from "../Exchanges/Candlesticks";
import { ConfigOptions, SymbolOptions } from "../Utilities/Args";
import { ConsoleLogger } from "../Utilities/ConsoleLogger";
import { calculateEMA } from "./EMA";

export const calculateChaikinOscillator = (
  candles: Candlestick[],
  fastPeriod: number = 3,
  slowPeriod: number = 10,
): number[] => {
  if (fastPeriod === 0) {
    fastPeriod = 3;
  }
  if (slowPeriod === 0) {
    slowPeriod = 10;
  }
  if (!candles || candles.length < slowPeriod) {
    return [];
  }

  // Calculate Accumulation/Distribution Line (ADL)
  const adl: number[] = [];
  let cumulativeADL = 0;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const range = candle.high - candle.low;

    if (range === 0) {
      adl.push(cumulativeADL);
      continue;
    }

    const moneyFlowMultiplier = (candle.close - candle.low - (candle.high - candle.close)) / range;
    const moneyFlowVolume = moneyFlowMultiplier * candle.volume;

    cumulativeADL += moneyFlowVolume;
    adl.push(cumulativeADL);
  }

  // Calculate EMAs of ADL
  const fastEMA = calculateEMA(
    adl.map((value) => ({ close: value }) as Candlestick),
    fastPeriod,
    "close",
  );

  const slowEMA = calculateEMA(
    adl.map((value) => ({ close: value }) as Candlestick),
    slowPeriod,
    "close",
  );

  // Calculate Chaikin Oscillator (fast EMA - slow EMA)
  const minLength = Math.min(fastEMA.length, slowEMA.length);
  const chaikinOscillator: number[] = [];

  for (let i = 0; i < minLength; i++) {
    chaikinOscillator.push(fastEMA[i] - slowEMA[i]);
  }

  return chaikinOscillator;
};

export const logChaikinOscillatorSignals = (consoleLogger: ConsoleLogger, chaikinOsc: number[]) => {
  if (chaikinOsc.length === 0) return;
  const currentCO = chaikinOsc[chaikinOsc.length - 1];
  let signal = "Neutral";
  if (currentCO > 0) {
    signal = "Bullish";
  } else if (currentCO < 0) {
    signal = "Bearish";
  }
  consoleLogger.push("Chaikin Oscillator", {
    value: currentCO.toFixed(7),
    signal: signal,
  });
};

export const checkChaikinOscillatorSignals = (chaikinOsc: number[], symbolOptions: SymbolOptions): string => {
  let check = "SKIP";
  if (symbolOptions.indicators !== undefined) {
    if (symbolOptions.indicators.chaikin && symbolOptions.indicators.chaikin.enabled) {
      check = "HOLD";
      if (chaikinOsc.length < 2) {
        return check;
      }

      const currentCO = chaikinOsc[chaikinOsc.length - 1];
      const previousCO = chaikinOsc[chaikinOsc.length - 2];

      // Chaikin Oscillator signals:
      // BUY: Oscillator crosses above 0 (bullish momentum)
      // SELL: Oscillator crosses below 0 (bearish momentum)

      if (currentCO > 0 && previousCO <= 0) {
        symbolOptions.indicators.chaikin.weight = 1;
        check = "BUY";
      } else if (currentCO < 0 && previousCO >= 0) {
        symbolOptions.indicators.chaikin.weight = 1;
        check = "SELL";
      }
    }
  }
  return check;
};
