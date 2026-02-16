import { Candlestick } from "../Exchanges/Candlesticks";
import { SymbolOptions } from "../Utilities/Args";
import { ConsoleLogger } from "../Utilities/ConsoleLogger";

export interface DMI {
  plusDI: number[];
  minusDI: number[];
  adx: number[];
}

export const calculateDMI = (
  candles: Candlestick[],
  dmiLength: number = 14, // Length for calculating +DI and -DI
  adxSmoothing: number = 14, // Period for smoothing the ADX
): DMI => {
  if (!Array.isArray(candles) || candles?.length <= 0) {
    return {
      plusDI: [],
      minusDI: [],
      adx: [],
    };
  }
  let plusDM: number[] = [];
  let minusDM: number[] = [];
  let tr: number[] = [];
  let plusDI: number[] = [];
  let minusDI: number[] = [];
  let adx: number[] = [];

  // Calculate True Range (TR) and Directional Movements (DM)
  for (let i = 1; i < candles.length; i++) {
    const prevCandle = candles[i - 1];
    const currCandle = candles[i];

    const highDiff = currCandle.high - prevCandle.high;
    const lowDiff = prevCandle.low - currCandle.low;

    // True Range
    const trValue = Math.max(
      currCandle.high - currCandle.low,
      Math.abs(currCandle.high - prevCandle.close),
      Math.abs(currCandle.low - prevCandle.close),
    );
    tr.push(trValue);

    // Directional Movements
    let plusDMValue = 0;
    let minusDMValue = 0;

    if (highDiff > lowDiff && highDiff > 0) {
      plusDMValue = highDiff;
    }
    if (lowDiff > highDiff && lowDiff > 0) {
      minusDMValue = lowDiff;
    }

    plusDM.push(plusDMValue);
    minusDM.push(minusDMValue);
  }

  // Smooth the values using a simple moving average
  for (let i = dmiLength - 1; i < candles.length; i++) {
    const sumTR = tr.slice(i - dmiLength + 1, i + 1).reduce((acc, val) => acc + val, 0);
    const sumPlusDM = plusDM.slice(i - dmiLength + 1, i + 1).reduce((acc, val) => acc + val, 0);
    const sumMinusDM = minusDM.slice(i - dmiLength + 1, i + 1).reduce((acc, val) => acc + val, 0);

    // Smoothed TR, +DM, and -DM
    const smoothedTR = sumTR;
    const smoothedPlusDM = sumPlusDM;
    const smoothedMinusDM = sumMinusDM;

    // +DI and -DI
    const plusDIValue = smoothedTR === 0 ? 0 : (smoothedPlusDM / smoothedTR) * 100;
    const minusDIValue = smoothedTR === 0 ? 0 : (smoothedMinusDM / smoothedTR) * 100;
    plusDI.push(plusDIValue);
    minusDI.push(minusDIValue);
  }

  // Calculate ADX (Average Directional Index)
  for (let i = dmiLength; i < plusDI.length; i++) {
    const sumDI = plusDI[i] + minusDI[i];
    const dx = sumDI === 0 ? 0 : (Math.abs(plusDI[i] - minusDI[i]) / sumDI) * 100;
    adx.push(dx);
  }

  // Smooth the ADX over the ADX smoothing period
  for (let i = adxSmoothing; i < adx.length; i++) {
    const smoothedADX = adx.slice(i - adxSmoothing + 1, i + 1).reduce((acc, val) => acc + val, 0) / adxSmoothing;
    adx[i] = smoothedADX;
  }

  return {
    plusDI,
    minusDI,
    adx,
  };
};

export const logDMISignals = (consoleLogger: ConsoleLogger, dmi: DMI) => {
  if (dmi.plusDI.length === 0 || dmi.minusDI.length === 0 || dmi.adx.length === 0) {
    consoleLogger.push("DMI", { error: "Insufficient data for DMI signals" });
    return;
  }
  const lastPlusDI = dmi.plusDI[dmi.plusDI.length - 1];
  const lastMinusDI = dmi.minusDI[dmi.minusDI.length - 1];
  const lastADX = dmi.adx[dmi.adx.length - 1];

  let signal = "Neutral";
  if (lastPlusDI > lastMinusDI) {
    signal = "Bullish";
  } else if (lastMinusDI > lastPlusDI) {
    signal = "Bearish";
  }

  consoleLogger.push("DMI", {
    plusDI: lastPlusDI,
    minusDI: lastMinusDI,
    adx: lastADX,
    signal: signal,
  });
};

export const checkDMISignals = (dmi: DMI, symbolOptions: SymbolOptions): string => {
  let check = "SKIP";
  if (symbolOptions.indicators !== undefined) {
    if (symbolOptions.indicators.dmi && symbolOptions.indicators.dmi.enabled) {
      if (dmi.plusDI.length === 0 || dmi.minusDI.length === 0 || dmi.adx.length === 0) {
        return check;
      }
      const lastPlusDI = dmi.plusDI[dmi.plusDI.length - 1];
      const lastMinusDI = dmi.minusDI[dmi.minusDI.length - 1];
      const lastADX = dmi.adx[dmi.adx.length - 1];
      if (lastADX < 20) {
        check = "HOLD";
      } else if (lastPlusDI > lastMinusDI) {
        check = "BUY";
      } else if (lastMinusDI > lastPlusDI) {
        check = "SELL";
      } else {
        check = "HOLD";
      }
    }
  }
  return check;
};
