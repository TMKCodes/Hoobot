import { Candlestick } from "../Exchanges/Candlesticks";
import { SymbolOptions } from "../Utilities/Args";
import { ConsoleLogger } from "../Utilities/ConsoleLogger";

export interface adx {
  adx: number[];
  plusDI: number[];
  minusDI: number[];
}

function wilderSmoothing(values: number[], period: number): number[] {
  if (values.length === 0 || period <= 0) return [];

  const smoothed: number[] = new Array(values.length).fill(0);
  if (values.length < period) {
    // For short arrays, use simple average of available values
    const initialSum = values.reduce((sum, val) => sum + val, 0);
    smoothed[values.length - 1] = initialSum / values.length;
    return smoothed;
  }

  // Calculate the initial sum for the first period
  let initialSum = 0;
  for (let i = 0; i < period; i++) {
    initialSum += values[i];
  }
  smoothed[period - 1] = initialSum / period;

  // Apply Wilder's smoothing for subsequent values
  for (let i = period; i < values.length; i++) {
    smoothed[i] = (smoothed[i - 1] * (period - 1) + values[i]) / period;
  }

  return smoothed;
}

export const calculateADX = (candles: Candlestick[], diLength = 14, adxSmoothing = 14): adx => {
  if (diLength === 0) {
    diLength = 14;
  }
  if (adxSmoothing === 0) {
    adxSmoothing = 14;
  }
  if (!candles || candles.length < 2) {
    return {
      adx: [],
      plusDI: [],
      minusDI: [],
    };
  }

  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];

  // Calculate True Range and Directional Movements
  for (let i = 1; i < candles.length; i++) {
    const highDiff = candles[i].high - candles[i - 1].high;
    const lowDiff = candles[i - 1].low - candles[i].low;

    // True Range
    const currentTR = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close),
    );
    tr.push(currentTR);

    // Directional Movements
    plusDM.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0);
    minusDM.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0);
  }

  // Apply Wilder's smoothing
  const smoothedTR = wilderSmoothing(tr, diLength);
  const smoothedPlusDM = wilderSmoothing(plusDM, diLength);
  const smoothedMinusDM = wilderSmoothing(minusDM, diLength);

  if (smoothedTR.length === 0) {
    return {
      adx: [],
      plusDI: [],
      minusDI: [],
    };
  }

  const plusDI: number[] = new Array(smoothedTR.length).fill(0);
  const minusDI: number[] = new Array(smoothedTR.length).fill(0);
  const dx: number[] = new Array(smoothedTR.length).fill(0);

  // Calculate +DI, -DI, and DX
  for (let i = 0; i < smoothedTR.length; i++) {
    if (smoothedTR[i] === 0) {
      plusDI[i] = 0;
      minusDI[i] = 0;
      dx[i] = 0;
      continue;
    }

    const pDI = (smoothedPlusDM[i] / smoothedTR[i]) * 100;
    const mDI = (smoothedMinusDM[i] / smoothedTR[i]) * 100;

    plusDI[i] = isNaN(pDI) ? 0 : pDI;
    minusDI[i] = isNaN(mDI) ? 0 : mDI;
    dx[i] = pDI + mDI === 0 ? 0 : (Math.abs(pDI - mDI) / (pDI + mDI)) * 100;
  }

  // Calculate ADX
  const adx: number[] = new Array(dx.length).fill(0);
  if (dx.length >= 1) {
    // Use available dx values for initial ADX
    const initialLength = Math.min(dx.length, adxSmoothing);
    let initialADX = 0;
    for (let i = 0; i < initialLength; i++) {
      initialADX += dx[i];
    }
    adx[initialLength - 1] = initialLength > 0 ? initialADX / initialLength : 0;

    for (let i = initialLength; i < dx.length; i++) {
      adx[i] = (adx[i - 1] * (adxSmoothing - 1) + dx[i]) / adxSmoothing;
    }
  }

  return {
    adx,
    plusDI,
    minusDI,
  };
};

export const logADXSignals = (consoleLogger: ConsoleLogger, adx: adx | undefined) => {
  if (!adx || adx.adx.length < 2 || adx.plusDI.length < 2 || adx.minusDI.length < 2) {
    consoleLogger.push("ADX", { error: "Insufficient data for ADX signals" });
    return;
  }

  const lastADX = adx.adx[adx.adx.length - 1];
  const lastPlusDI = adx.plusDI[adx.plusDI.length - 1];
  const lastMinusDI = adx.minusDI[adx.minusDI.length - 1];
  const prevPlusDI = adx.plusDI[adx.plusDI.length - 2];
  const prevMinusDI = adx.minusDI[adx.minusDI.length - 2];

  let signal = "Neutral";

  const isBullishCrossover = lastPlusDI > lastMinusDI && prevPlusDI <= prevMinusDI;
  const isBearishCrossover = lastMinusDI > lastPlusDI && prevMinusDI <= prevPlusDI;

  if (isBullishCrossover && lastADX > 20) {
    signal = "Bullish ADX Crossover";
  } else if (isBearishCrossover && lastADX > 20) {
    signal = "Bearish ADX Crossover";
  } else if (lastADX < 20) {
    signal = "Weak Trend";
  } else if (lastADX > 40) {
    signal = "Strong Trend";
  }

  consoleLogger.push("ADX", {
    adx: lastADX,
    plusDI: lastPlusDI,
    minusDI: lastMinusDI,
    signal,
  });
};

export const checkADXSignals = (adx: adx | undefined, symbolOptions: SymbolOptions): string => {
  if (
    !adx ||
    adx.adx.length < 2 ||
    adx.plusDI.length < 2 ||
    adx.minusDI.length < 2 ||
    !symbolOptions.indicators?.adx?.enabled
  ) {
    return "SKIP";
  }

  const lastADX = adx.adx[adx.adx.length - 1];
  const lastPlusDI = adx.plusDI[adx.plusDI.length - 1];
  const lastMinusDI = adx.minusDI[adx.minusDI.length - 1];
  const prevPlusDI = adx.plusDI[adx.plusDI.length - 2];
  const prevMinusDI = adx.minusDI[adx.minusDI.length - 2];

  // ADX signals:
  // BUY: +DI crosses above -DI and ADX > 20 (bullish trend start)
  // SELL: -DI crosses above +DI and ADX > 20 (bearish trend start)
  // HOLD: ADX < 20 (weak trend) or no crossover

  const bullishCrossover = lastPlusDI > lastMinusDI && prevPlusDI <= prevMinusDI;
  const bearishCrossover = lastMinusDI > lastPlusDI && prevMinusDI <= prevPlusDI;

  if (bullishCrossover && lastADX > 20) {
    symbolOptions.indicators.adx.weight = 1;
    return "BUY";
  } else if (bearishCrossover && lastADX > 20) {
    symbolOptions.indicators.adx.weight = 1;
    return "SELL";
  }

  return "HOLD";
};
