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
import { calculateEMA } from "./EMA";

export interface macd {
  macdLine: number[];
  signalLine: number[];
  histogram: number[];
}

export const logMACDSignals = (consoleLogger: ConsoleLogger, macd: macd) => {
  const macdLine = macd.macdLine[macd.macdLine.length - 1];
  const signalLine = macd.signalLine[macd.signalLine.length - 1];
  const histogram = macd.histogram[macd.histogram.length - 1];
  if (macdLine !== undefined && signalLine !== undefined && histogram !== undefined) {
    const prevMacdLine = macd.macdLine[macd.macdLine.length - 2];
    const prevSignalLine = macd.signalLine[macd.signalLine.length - 2];
    const prevHistogram = macd.histogram[macd.histogram.length - 2];
    const isBullishCrossover = macdLine > signalLine && prevMacdLine <= prevSignalLine;
    const isBearishCrossover = macdLine < signalLine && prevMacdLine >= prevSignalLine;
    const isBullishDivergence = macdLine > prevMacdLine && histogram > prevHistogram;
    const isBearishDivergence = macdLine < prevMacdLine && histogram < prevHistogram;
    const isBullishZeroLineCrossover = macdLine > 0 && prevMacdLine <= 0;
    const isBearishZeroLineCrossover = macdLine < 0 && prevMacdLine >= 0;
    const isStrongBullishTrend = macdLine > 100 && prevMacdLine <= 100;
    const isStrongBearishTrend = macdLine < -100 && prevMacdLine >= -100;
    const isPositiveHistogramDivergence = histogram > 0 && prevHistogram < 0;
    const isNegativeHistogramDivergence = histogram < 0 && prevHistogram > 0;
    let signal = "Neutral";
    if (isBullishCrossover) {
      signal = "Bullish Line Crossover";
    } else if (isBearishCrossover) {
      signal = "Bearish Line Crossover";
    } else if (isBullishDivergence) {
      signal = "Bullish Divergence";
    } else if (isBearishDivergence) {
      signal = "Bearish Divergence";
    } else if (isBullishZeroLineCrossover) {
      signal = "Bullish Zero Line Crossover";
    } else if (isBearishZeroLineCrossover) {
      signal = "Bearish Zero Line Crossover";
    } else if (isStrongBullishTrend) {
      signal = "Strong Bullish Trend";
    } else if (isStrongBearishTrend) {
      signal = "Strong Bearish Trend";
    } else if (isPositiveHistogramDivergence) {
      signal = "Positive Histogram Divergence";
    } else if (isNegativeHistogramDivergence) {
      signal = "Negative Histogram Divergence";
    }
    consoleLogger.push("MACD", {
      line: macdLine.toFixed(7),
      signalline: signalLine.toFixed(7),
      histogram: histogram.toFixed(7),
      signal: signal,
    });
  }
};

export const calculateMACD = (
  candles: Candlestick[],
  shortEMA: number,
  longEMA: number,
  signalLength = 9,
  source: string,
): macd => {
  if (candles?.length < longEMA) {
    return {
      macdLine: [],
      signalLine: [],
      histogram: [],
    };
  }
  let shortEMAs = calculateEMA(candles, shortEMA, source);
  let longEMAs = calculateEMA(candles, longEMA, source);
  if (longEMAs.length < shortEMAs.length) {
    shortEMAs = shortEMAs.slice(-longEMAs.length);
  }
  if (shortEMAs.length < longEMAs.length) {
    longEMAs = longEMAs.slice(-shortEMAs.length);
  }
  let macdLine: number[] = [];
  for (let i = 0; i < shortEMAs.length; i++) {
    macdLine.push(shortEMAs[i] - longEMAs[i]);
  }
  var signalCandles = macdLine.map((value) => ({ close: value }) as Candlestick);
  let signalLine = calculateEMA(signalCandles, signalLength, source);
  if (signalLine.length < macdLine.length) {
    macdLine = macdLine.slice(-signalLine.length);
  }
  if (macdLine.length < signalLine.length) {
    signalLine = signalLine.slice(-macdLine.length);
  }
  const histogram: number[] = [];
  for (let i = 0; i < signalLine.length; i++) {
    histogram.push(macdLine[i] - signalLine[i]);
  }
  return {
    macdLine,
    signalLine,
    histogram,
  };
};

export const checkMACDSignals = (macd: macd, symbolOptions: SymbolOptions) => {
  let check = "SKIP";
  if (symbolOptions.indicators !== undefined) {
    if (symbolOptions.indicators.macd && symbolOptions.indicators.macd.enabled) {
      check = "HOLD";
      const currentHistogram = macd.histogram[macd.histogram.length - 1];
      const prevHistogram = macd.histogram[macd.histogram.length - 2];
      const currentMacdLine = macd.macdLine[macd.macdLine.length - 1];
      const prevMacdLine = macd.macdLine[macd.macdLine.length - 2];
      const currentSignalLine = macd.signalLine[macd.signalLine.length - 1];
      const prevSignalLine = macd.signalLine[macd.signalLine.length - 2];
      if (
        currentHistogram !== undefined &&
        prevHistogram !== undefined &&
        currentMacdLine !== undefined &&
        currentSignalLine !== undefined
      ) {
        var isHistogramPositive = currentHistogram > 0;
        var isHistogramNegative = currentHistogram < 0;
        const isMacdLineAboveSignalLine = currentMacdLine > currentSignalLine;
        const isMacdLineBelowSignalLine = currentMacdLine < currentSignalLine;
        var isMacdLinePositive = currentMacdLine > 0;
        var isMacdLineNegative = currentMacdLine < 0;
        const isSignalLinePositive = currentSignalLine > 0;
        const isSignalLineNegative = currentSignalLine < 0;
        if (symbolOptions.indicators.macd.weight === undefined) {
          symbolOptions.indicators.macd.weight = 1;
        }
        if (isMacdLineNegative && isSignalLineNegative && isMacdLineAboveSignalLine && isHistogramPositive) {
          symbolOptions.indicators.macd.weight *= 1;
          check = "BUY";
        } else if (isMacdLinePositive && isSignalLinePositive && isMacdLineBelowSignalLine && isHistogramNegative) {
          symbolOptions.indicators.macd.weight *= 1;
          check = "SELL";
        }
      }
    }
  }
  return check;
};
