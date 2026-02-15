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
import { ConfigOptions, SymbolOptions } from "../Utilities/Args";
import { ConsoleLogger } from "../Utilities/ConsoleLogger";

export const logRSISignals = (consoleLogger: ConsoleLogger, rsi: number[]) => {
  if (rsi.length === 0) return;
  let signal = "Neutral";
  if (rsi[rsi.length - 1] > 80) {
    signal = `Extremely Overbought`;
  } else if (rsi[rsi.length - 1] < 20) {
    signal = `Extremely Oversold`;
  } else if (rsi[rsi.length - 1] > 70) {
    signal = `Overbought`;
  } else if (rsi[rsi.length - 1] < 30) {
    signal = `Oversold`;
  } else if (rsi[rsi.length - 1] < 50) {
    signal = `Bullish`;
  } else if (rsi[rsi.length - 1] > 50) {
    signal = `Bearish`;
  }
  consoleLogger.push("RSI", {
    value: rsi[rsi.length - 1].toFixed(7),
    signal: signal,
  });
};

export const calculateRSI = (
  candles: Candlestick[],
  length: number = 9,
  smoothingType: string = "SMA",
  smoothing: number = 1,
  source: string = "close",
): number[] => {
  if (!Array.isArray(candles) || candles?.length <= 0) {
    return [];
  }
  if (length === 0) {
    length = 9;
  }
  let closePrices: number[] = [];
  if (source === "close") {
    closePrices = candles.map((candle) => candle.close);
  } else if (source === "open") {
    closePrices = candles.map((candle) => candle.open);
  } else if (source === "high") {
    closePrices = candles.map((candle) => candle.high);
  } else if (source === "low") {
    closePrices = candles.map((candle) => candle.low);
  }
  const priceChanges: number[] = [];
  for (let i = 1; i < closePrices.length; i++) {
    priceChanges.push(closePrices[i] - closePrices[i - 1]);
  }
  const gains: number[] = [];
  const losses: number[] = [];
  for (const change of priceChanges) {
    if (change > 0) {
      gains.push(change);
      losses.push(0);
    } else {
      gains.push(0);
      losses.push(Math.abs(change));
    }
  }
  if (gains.length > length && losses.length > length) {
    let avgGain = gains.slice(0, length).reduce((a, b) => a + b) / length;
    let avgLoss = losses.slice(0, length).reduce((a, b) => a + b) / length;
    const rsArray: number[] = [];
    for (let i = length; i < closePrices.length; i++) {
      avgGain = (avgGain * (length - 1) + gains[i - 1]) / length;
      avgLoss = (avgLoss * (length - 1) + losses[i - 1]) / length;

      const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
      const rsi = 100 - 100 / (1 + rs);

      rsArray.push(rsi);
    }
    if (smoothingType === "SMA" && smoothing > 1) {
      for (let i = smoothing - 1; i < rsArray.length; i++) {
        let sum = 0;
        for (let j = 0; j < smoothing; j++) {
          sum += rsArray[i - j];
        }
        const smoothedRS = sum / smoothing;
        rsArray[i] = smoothedRS;
      }
    } else if (smoothingType === "EMA" && smoothing > 1) {
      for (let i = smoothing; i < rsArray.length; i++) {
        const alpha = 2 / (smoothing + 1);
        rsArray[i] = alpha * rsArray[i] + (1 - alpha) * rsArray[i - 1];
      }
    } else if (smoothingType === "WMA" && smoothing > 1) {
      for (let i = smoothing - 1; i < rsArray.length; i++) {
        let sum = 0;
        let weightSum = 0;
        for (let j = 0; j < smoothing; j++) {
          const weight = j + 1; // weights: 1 for oldest, 2 for next, ..., smoothing for newest
          sum += rsArray[i - j] * weight;
          weightSum += weight;
        }
        const weightedAverage = sum / weightSum;
        rsArray[i] = weightedAverage;
      }
    }
    return rsArray;
  } else {
    return [];
  }
};

export const checkRSISignals = (rsi: number[], symbolOptions: SymbolOptions): string => {
  let check = "SKIP";
  if (symbolOptions.indicators !== undefined) {
    if (symbolOptions.indicators.rsi && symbolOptions.indicators.rsi.enabled) {
      check = "HOLD";
      const rsiValues = rsi.slice(-symbolOptions.indicators.rsi?.history);
      const overboughtThreshold =
        symbolOptions.indicators.rsi.thresholds.overbought !== undefined
          ? symbolOptions.indicators.rsi.thresholds.overbought
          : 70;
      const oversoldThreshold =
        symbolOptions.indicators.rsi.thresholds.oversold !== undefined
          ? symbolOptions.indicators.rsi.thresholds.oversold
          : 30;
      for (let i = rsiValues.length - 1; i >= 0; i--) {
        const prevRsi = rsiValues[i];
        if (prevRsi > overboughtThreshold) {
          check = "SELL";
          break;
        }
      }
      if (check === "HOLD") {
        for (let i = rsiValues.length - 1; i >= 0; i--) {
          const prevRsi = rsiValues[i];
          if (prevRsi < oversoldThreshold) {
            check = "BUY";
            break;
          }
        }
      }
    }
  }
  return check;
};
