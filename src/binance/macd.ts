/* =====================================================================
* Binance Trading Bot - Proprietary License
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

import { ConsoleLogger } from "./consoleLogger";
import { calculateEMAArray } from "./ema";

export const logMACDSignals = (
  consoleLogger: ConsoleLogger,
  macd: {
    macdLine: number;
    signalLine: number;
    histogram: number;
  }, prevMacd: {
    macdLine: number;
    signalLine: number;
    histogram: number;
  } | undefined
) => {
  const { macdLine, signalLine, histogram } = macd;

  consoleLogger.push(`MACD Line`, macdLine.toFixed(7));
  consoleLogger.push(`MACD Signal Line`, signalLine.toFixed(7));
  consoleLogger.push(`MACD Histogram`, histogram.toFixed(7));

  if (!prevMacd) {
    if (macdLine > signalLine && histogram > 0) {
      consoleLogger.push(`MACD Signal`, 'Bullish');
    } else if (macdLine < signalLine && histogram < 0) {
      consoleLogger.push(`MACD Signal`, 'Bearish');
    }
  } else {
    const isBullishCrossover = macdLine > signalLine && prevMacd.macdLine <= prevMacd.signalLine;
    const isBearishCrossover = macdLine < signalLine && prevMacd.macdLine >= prevMacd.signalLine;
    const isBullishDivergence = macdLine > prevMacd.macdLine && histogram > prevMacd.histogram;
    const isBearishDivergence = macdLine < prevMacd.macdLine && histogram < prevMacd.histogram;
    const isBullishZeroLineCrossover = macdLine > 0 && prevMacd.macdLine <= 0;
    const isBearishZeroLineCrossover = macdLine < 0 && prevMacd.macdLine >= 0;
    const isBullishCenterlineCrossover = macdLine > signalLine && prevMacd.macdLine <= prevMacd.signalLine;
    const isBearishCenterlineCrossover = macdLine < signalLine && prevMacd.macdLine >= prevMacd.signalLine;
    const isStrongBullishTrend = macdLine > 100 && prevMacd.macdLine <= 100;
    const isStrongBearishTrend = macdLine < -100 && prevMacd.macdLine >= -100;
    const isPositiveHistogramDivergence = histogram > 0 && prevMacd.histogram < 0;
    const isNegativeHistogramDivergence = histogram < 0 && prevMacd.histogram > 0;

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
    }
  }
}

export const calculateMACD = (candles: any[], shortEMA: number, longEMA: number, signalLength = 9, source: string) => {
  const macd = calculateMACDArray(candles, shortEMA, longEMA, signalLength, source);
  return {
    macdLine: macd.macdLine[macd.macdLine.length - 1],
    signalLine: macd.signalLine[macd.signalLine.length - 1],
    histogram: macd.histogram[macd.histogram.length - 1],
  }
}

export function calculateMACDArray(candles: any[], shortEMA: number, longEMA: number, signalLength = 9, source: string) {
  
  let shortEMAs = calculateEMAArray(candles, shortEMA, source);
  let longEMAs = calculateEMAArray(candles, longEMA, source);
  
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
  
  let signalLine = calculateEMAArray(macdLine.map((value) => ({ close: value })), signalLength, source);

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


