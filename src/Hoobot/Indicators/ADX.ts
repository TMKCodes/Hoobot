/* =====================================================================
 * Hoobot - Proprietary License
 * Copyright (c) 2023 Hoosat Oy. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are not permitted without prior written permission
 * from Hoosat Oy. Unauthorized reproduction, copying, or use of this
 * software, in whole or in part, is strictly prohibited. All
 * modifications in source or binary must be submitted to Hoosat Oy in source format.
 *
 * THIS SOFTWARE IS PROVIDED BY HOOSAT OY "AS IS" AND ANY EXPRESS OR
 * IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL HOOSAT OY BE LIABLE FOR ANY DIRECT,
 * INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
 * HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT,
 * STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED
 * OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * The user of this software uses it at their own risk. Hoosat Oy shall
 * not be liable for any losses, damages, or liabilities arising from
 * the use of this software.
 * ===================================================================== */

import { Candlestick } from "../Exchanges/Candlesticks";
import { SymbolOptions } from "../Utilities/Args";
import { ConsoleLogger } from "../Utilities/ConsoleLogger";

export interface adx {
  adx: number[];
  plusDI: number[];
  minusDI: number[];
}

function wilderSmoothing(values: number[], period: number): number[] {
  const smoothed: number[] = [];
  let initialSum = 0;
  for (let i = 0; i < period; i++) {
    initialSum += values[i];
  }
  smoothed[period - 1] = initialSum;
  for (let i = period; i < values.length; i++) {
    smoothed[i] = smoothed[i - 1] - smoothed[i - 1] / period + values[i];
  }
  return smoothed;
}

export const calculateADX = (
  candles: Candlestick[],
  diLength = 14,
  adxSmoothing = 14
): adx | undefined => {
  if (candles.length <= diLength) return;

  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const highDiff = candles[i].high - candles[i - 1].high;
    const lowDiff = candles[i - 1].low - candles[i].low;

    // True Range
    const currentTR = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    tr.push(currentTR);

    // Directional Movements
    plusDM.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0);
    minusDM.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0);
  }

  const smoothedTR = wilderSmoothing(tr, diLength);
  const smoothedPlusDM = wilderSmoothing(plusDM, diLength);
  const smoothedMinusDM = wilderSmoothing(minusDM, diLength);

  const plusDI: number[] = [];
  const minusDI: number[] = [];
  const dx: number[] = [];

  for (let i = diLength - 1; i < tr.length; i++) {
    const pDI = (smoothedPlusDM[i] / smoothedTR[i]) * 100;
    const mDI = (smoothedMinusDM[i] / smoothedTR[i]) * 100;
    plusDI.push(pDI);
    minusDI.push(mDI);
    dx.push((Math.abs(pDI - mDI) / (pDI + mDI)) * 100);
  }

  // --- ADX smoothing (separate parameter) ---
  const adx: number[] = [];
  let firstADX = 0;
  for (let i = 0; i < adxSmoothing; i++) {
    firstADX += dx[i];
  }
  adx[adxSmoothing - 1] = firstADX / adxSmoothing;

  for (let i = adxSmoothing; i < dx.length; i++) {
    adx[i] = (adx[i - 1] * (adxSmoothing - 1) + dx[i]) / adxSmoothing;
  }

  return {
    adx,
    plusDI,
    minusDI,
  };
};

export const logADXSignals = (consoleLogger: ConsoleLogger, adx: adx) => {
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
    adx: lastADX.toFixed(7),
    plusDI: lastPlusDI.toFixed(7),
    minusDI: lastMinusDI.toFixed(7),
    signal: signal,
  });
};

export const checkADXSignals = (adx: adx, symbolOptions: SymbolOptions) => {
  let check = "SKIP";
  if (symbolOptions.indicators?.adx?.enabled) {
    check = "HOLD";
    const lastADX = adx.adx[adx.adx.length - 1];
    const lastPlusDI = adx.plusDI[adx.plusDI.length - 1];
    const lastMinusDI = adx.minusDI[adx.minusDI.length - 1];

    if (symbolOptions.indicators.adx.weight === undefined) {
      symbolOptions.indicators.adx.weight = 1;
    }

    if (lastPlusDI > lastMinusDI && lastADX > 25) {
      check = "BUY";
    } else if (lastMinusDI > lastPlusDI && lastADX > 25) {
      check = "SELL";
    }
  }
  return check;
};
