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
import { ConfigOptions } from "../Utilities/args";
import { ConsoleLogger } from "../Utilities/consoleLogger";
import { calculateSMA } from "./SMA";

export const calculateCMF = (
  candlesticks: Candlestick[], 
  period: number
): number[] => {
  const cmfValues: number[] = [];
  for (let i = period - 1; i < candlesticks.length; i++) {
    const subset = candlesticks.slice(Math.max(0, i - period + 1), i + 1);
    const sumMFVolume = subset.reduce((sum, candle) => {
      const range = candle.high - candle.low;
      if (range === 0) return sum; 
      const mfMultiplier = ((candle.close - candle.low) - (candle.high - candle.close)) / range;
      return sum + (mfMultiplier * candle.volume);
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


export const logCMFSignals = (
  consoleLogger: ConsoleLogger,
  cmfValues: number[],
  options: ConfigOptions,
) => {
  const currentCMF = cmfValues[cmfValues.length - 1];
  if (currentCMF !== undefined) {
    const prevCMF = cmfValues[cmfValues.length - 2];
    const cmfSMA = calculateSMA(cmfValues.map((value) => ({ close: value } as Candlestick)), 50, 'close'); 
    const isBullishCrossover = currentCMF > cmfSMA[cmfSMA.length - 1] && prevCMF < cmfSMA[cmfSMA.length - 1];
    const isBearishCrossover = currentCMF < cmfSMA[cmfSMA.length - 1] && prevCMF > cmfSMA[cmfSMA.length - 1];
    const isOverbought = currentCMF > options.cmfOverboughtTreshold; 
    const isOversold = currentCMF < options.cmfOversoldTreshold; 
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
      smoothed: cmfSMA[cmfSMA.length - 1],
      signal: signal
    });
  } else {
    consoleLogger.push("CMF", {
      value: "N/A",
      smoothed: "N/A",
      signal: "N/A"
    });
  }
};

export const checkCMFSignals = (
  consoleLogger: ConsoleLogger, 
  cmfValues: number[],
  options: ConfigOptions
) => {
  let check = 'SKIP';
  if (options.useCMF) {
    check = 'HOLD';
    cmfValues = cmfValues.slice(-options.cmfHistoryLength);
    const cmfSMA = calculateSMA(cmfValues.map((value) => ({ close: value } as Candlestick)), 50, 'close'); 
    for (let i = cmfValues.length; i > 0; i--) {
      const currentCMF = cmfValues[i];
      const prevCMF = cmfValues[i - 1];
      const isBullishCrossover = currentCMF > cmfSMA[i] && prevCMF < cmfSMA[i];
      const isBearishCrossover = currentCMF < cmfSMA[i] && prevCMF > cmfSMA[i];
      const isOverbought = currentCMF > options.cmfOverboughtTreshold;
      const isOversold = currentCMF < options.cmfOversoldTreshold;
      if (isBullishCrossover) {
        check = 'BUY';
        break;
      } else if (isBearishCrossover) {
        check = 'SELL';
        break;
      } else if (isOverbought) {
        check = 'SELL'; 
        break;
      } else if (isOversold) {
        check = 'BUY'; 
        break;
      }
    }
  }
  return check;
}