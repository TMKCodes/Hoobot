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

import { Candlestick } from "../Binance/Candlesticks";
import { Indicators } from "../Modes/Algorithmic";
import { ConfigOptions } from "../Utilities/args";
import { ConsoleLogger } from "../Utilities/consoleLogger";
import { calculateEMA } from "./EMA";

export interface macd { 
  macdLine: number[]; 
  signalLine: number[]; 
  histogram: number[]; 
}

export const logMACDSignals = (
  consoleLogger: ConsoleLogger,
  macd: macd,
) => {
  const macdLine = macd.macdLine[macd.macdLine.length - 1];
  const signalLine = macd.signalLine[macd.signalLine.length - 1];
  const histogram = macd.histogram[macd.histogram.length - 1];
  const prevMacdLine = macd.macdLine[macd.macdLine.length - 2];
  const prevSignalLine = macd.signalLine[macd.signalLine.length - 2];
  const prevHistogram = macd.histogram[macd.histogram.length - 2];
  consoleLogger.push(`MACD Line`, macdLine.toFixed(7));
  consoleLogger.push(`MACD Signal Line`, signalLine.toFixed(7));
  consoleLogger.push(`MACD Histogram`, histogram.toFixed(7));
  const isBullishCrossover = macdLine > signalLine && prevMacdLine <= prevSignalLine;
  const isBearishCrossover = macdLine < signalLine && prevMacdLine >= prevSignalLine;
  const isBullishDivergence = macdLine > prevMacdLine && histogram > prevHistogram;
  const isBearishDivergence = macdLine < prevMacdLine && histogram < prevHistogram;
  const isBullishZeroLineCrossover = macdLine > 0 && prevMacdLine <= 0;
  const isBearishZeroLineCrossover = macdLine < 0 && prevMacdLine >= 0;
  const isBullishCenterlineCrossover = macdLine > signalLine && prevMacdLine <= prevSignalLine;
  const isBearishCenterlineCrossover = macdLine < signalLine && prevMacdLine >= prevSignalLine;
  const isStrongBullishTrend = macdLine > 100 && prevMacdLine <= 100;
  const isStrongBearishTrend = macdLine < -100 && prevMacdLine >= -100;
  const isPositiveHistogramDivergence = histogram > 0 && prevHistogram < 0;
  const isNegativeHistogramDivergence = histogram < 0 && prevHistogram > 0;
  if (isBullishCrossover) {
    consoleLogger.push(`MACD Signal`, 'Bullish Line Crossover');
  } else if (isBearishCrossover) {
    consoleLogger.push(`MACD Signal`, 'Bearish Line Crossover');
  } else if (isBullishDivergence) {
    consoleLogger.push(`MACD Signal`, 'Bullish Divergence');
  } else if (isBearishDivergence) {
    consoleLogger.push(`MACD Signal`, 'Bearish Divergence');
  } else if (isBullishZeroLineCrossover) {
    consoleLogger.push(`MACD Signal`, 'Bullish Zero Line Crossover');
  } else if (isBearishZeroLineCrossover) {
    consoleLogger.push(`MACD Signal`, 'Bearish Zero Line Crossover');
  } else if (isBullishCenterlineCrossover) {
    consoleLogger.push(`MACD Signal`, 'Bullish Centerline Crossover');
  } else if (isBearishCenterlineCrossover) {
    consoleLogger.push(`MACD Signal`, 'Bearish Centerline Crossover');
  } else if (isStrongBullishTrend) {
    consoleLogger.push(`MACD Signal`, 'Strong Bullish Trend');
  } else if (isStrongBearishTrend) {
    consoleLogger.push(`MACD Signal`, 'Strong Bearish Trend');
  } else if (isPositiveHistogramDivergence) {
    consoleLogger.push(`MACD Signal`, 'Positive Histogram Divergence');
  } else if (isNegativeHistogramDivergence) {
    consoleLogger.push(`MACD Signal`, 'Negative Histogram Divergence');
  } else {
    consoleLogger.push(`MACD Signal`, 'Neutral');
  }
}

export const calculateMACD = (
  candles: Candlestick[], 
  shortEMA: number, 
  longEMA: number, 
  signalLength = 9, 
  source: string
) => {
  let shortEMAs = calculateEMA(candles, shortEMA, source);
  let longEMAs = calculateEMA(candles, longEMA, source);
  if(longEMAs.length < shortEMAs.length) {
    shortEMAs = shortEMAs.slice(-longEMAs.length);
  }
  if(shortEMAs.length < longEMAs.length) {
    longEMAs = longEMAs.slice(-shortEMAs.length); 
  }
  let macdLine: number[] = [];
  for(let i = 0; i < shortEMAs.length; i++) {
    macdLine.push(shortEMAs[i] - longEMAs[i]);
  } 
  let signalLine = calculateEMA(macdLine.map((value) => ({ close: value })), signalLength, source);
  if(signalLine.length < macdLine.length) {
    macdLine = macdLine.slice(-signalLine.length);
  }
  if(macdLine.length < signalLine.length) {
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
}

export const checkMACDSignals = (
  consoleLogger: ConsoleLogger, 
  macd: macd, 
  options: ConfigOptions
) => {
  let check = 'SKIP';
  if (options.useMACD) {
    check = 'HOLD';
    const currentHistogram = macd.histogram[macd.histogram.length -1];
    const prevHistogram = macd.histogram[macd.histogram.length - 2];
    const currentMacdLine = macd.macdLine[macd.macdLine.length -1];
    const currentSignalLine = macd.signalLine[macd.signalLine.length -1];
    const isPrevHistogramPositive = prevHistogram > 0;
    const isPrevHistogramNegative = prevHistogram < 0;
    const isHistogramPositive = currentHistogram > 0;
    const isHistogramNegative = currentHistogram < 0;
    const isMacdLineAboveSignalLine = currentMacdLine > currentSignalLine
    const isMacdLineBelowSignalLine = currentMacdLine < currentSignalLine
    const isSignalLineAboveHistogram = currentSignalLine > currentHistogram;
    const isSignalLineBelowHistogram = currentSignalLine < currentHistogram
    const isMacdLineAboveHistogram = currentMacdLine > currentHistogram;
    const isMacdLineBelowHstogram = currentMacdLine < currentHistogram;
    if(isPrevHistogramNegative && isHistogramPositive) {
      check = 'BUY';
    } else if (isPrevHistogramPositive && isHistogramNegative) {
      check = 'SELL';
    } else {
      if (isMacdLineAboveSignalLine && isHistogramNegative) {
        check = 'BUY';
      } else if (isMacdLineBelowSignalLine && isHistogramNegative) {
        check = 'SELL';
      }
    }
  }
  return check;
}


