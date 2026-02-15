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
import { calculateSMA } from "./SMA";

export const calculateCMF = (candlesticks: Candlestick[], period: number): number[] => {
  const cmfValues: number[] = [];
  for (let i = period - 1; i < candlesticks.length; i++) {
    const subset = candlesticks.slice(Math.max(0, i - period + 1), i + 1);
    const sumMFVolume = subset.reduce((sum, candle) => {
      const range = candle.high - candle.low;
      if (range === 0) return sum;
      const mfMultiplier = (candle.close - candle.low - (candle.high - candle.close)) / range;
      return sum + mfMultiplier * candle.volume;
    }, 0);
    const sumVolume = subset.reduce((sum, candle) => sum + candle.volume, 0);
    if (sumVolume === 0) {
      cmfValues.push(0);
    } else {
      const cmf = sumMFVolume / sumVolume;
      cmfValues.push(cmf);
    }
  }
  return cmfValues;
};

export const logCMFSignals = (consoleLogger: ConsoleLogger, cmfValues: number[], symbolOptions: SymbolOptions) => {
  if (cmfValues.length === 0) {
    consoleLogger.push("CMF", {
      value: "N/A",
      smoothed: "N/A",
      signal: "N/A",
    });
    return;
  }
  const currentCMF = cmfValues[cmfValues.length - 1];
  const prevCMF = cmfValues.length > 1 ? cmfValues[cmfValues.length - 2] : 0;
  const cmfSMA = calculateSMA(
    cmfValues.map((value) => ({ close: value }) as Candlestick),
    50,
    "close",
  );
  const currentSMA = cmfSMA.length > 0 ? cmfSMA[cmfSMA.length - 1] : 0;
  const prevSMA = cmfSMA.length > 1 ? cmfSMA[cmfSMA.length - 2] : 0;
  const isBullishCrossover = currentCMF > currentSMA && prevCMF < prevSMA;
  const isBearishCrossover = currentCMF < currentSMA && prevCMF > prevSMA;
  const isOverbought = currentCMF > (symbolOptions.indicators?.cmf?.thresholds.overbought || 0.25);
  const isOversold = currentCMF < (symbolOptions.indicators?.cmf?.thresholds.oversold || -0.25);
  let signal = "Neutral";
  if (isBullishCrossover) {
    signal = `Bullish Crossover`;
  } else if (isBearishCrossover) {
    signal = `Bearish Crossover`;
  } else if (isOverbought) {
    signal = `Overbought`;
  } else if (isOversold) {
    signal = `Oversold`;
  } else {
    signal = `Neutral`;
  }
  consoleLogger.push("CMF", {
    value: currentCMF.toFixed(7),
    smoothed: currentSMA.toFixed(7),
    signal: signal,
  });
};

export const checkCMFSignals = (cmfValues: number[], symbolOptions: SymbolOptions) => {
  let check = "SKIP";
  if (symbolOptions.indicators !== undefined) {
    if (symbolOptions.indicators.cmf !== undefined) {
      if (symbolOptions.indicators.cmf.enabled) {
        check = "HOLD";
        cmfValues = cmfValues.slice(-symbolOptions.indicators.cmf.history);
        if (cmfValues.length === 0) {
          return check;
        }
        const cmfSMA = calculateSMA(
          cmfValues.map((value) => ({ close: value }) as Candlestick),
          50,
          "close",
        );
        for (let i = cmfValues.length - 1; i > 0; i--) {
          const currentCMF = cmfValues[i];
          const prevCMF = cmfValues[i - 1];
          const currentSMA = cmfSMA[i] || 0;
          const prevSMA = cmfSMA[i - 1] || 0;
          const isBullishCrossover = currentCMF > currentSMA && prevCMF < prevSMA;
          const isBearishCrossover = currentCMF < currentSMA && prevCMF > prevSMA;
          const isOverbought = currentCMF > (symbolOptions.indicators.cmf.thresholds.overbought || 0.25);
          const isOversold = currentCMF < (symbolOptions.indicators.cmf.thresholds.oversold || -0.25);
          if (isBullishCrossover) {
            check = "BUY";
            break;
          } else if (isBearishCrossover) {
            check = "SELL";
            break;
          } else if (isOverbought) {
            check = "SELL";
            break;
          } else if (isOversold) {
            check = "BUY";
            break;
          }
        }
      }
    }
  }

  return check;
};
