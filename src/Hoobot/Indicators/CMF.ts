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

import { candlestick } from "../Binance/candlesticks";
import { Indicators } from "../Modes/algorithmic";
import { ConfigOptions } from "../Utilities/args";
import { ConsoleLogger } from "../Utilities/consoleLogger";
import { calculateSMA } from "./SMA";

export const calculateCMF = (candlesticks: candlestick[], period: number): number[] => {
  const cmfValues: number[] = [];

  for (let i = period - 1; i < candlesticks.length; i++) {
    const sumMFVolume = candlesticks
      .slice(i - period + 1, i + 1)
      .reduce((sum, candle) => {
        const mfMultiplier = ((candle.close - candle.low) - (candle.high - candle.close)) / (candle.high - candle.low);
        return sum + (mfMultiplier * candle.volume);
      }, 0);

    const sumVolume = candlesticks
      .slice(i - period + 1, i + 1)
      .reduce((sum, candle) => sum + candle.volume, 0);

    const cmf = sumMFVolume / sumVolume;
    cmfValues.push(cmf);
  }

  return cmfValues;
};

export const logCMFSignals = (
  consoleLogger: ConsoleLogger,
  cmfValues: number[]
) => {
  const currentCMF = cmfValues[cmfValues.length - 1];
  const prevCMF = cmfValues[cmfValues.length - 2];
  consoleLogger.push(`CMF Value`, currentCMF.toFixed(7));
  const cmfSMA = calculateSMA(cmfValues.map((value) => ({ close: value })), 50, 'close'); 
  const isBullishCrossover = currentCMF > cmfSMA[cmfSMA.length - 1] && prevCMF < cmfSMA[cmfSMA.length - 1];
  const isBearishCrossover = currentCMF < cmfSMA[cmfSMA.length - 1] && prevCMF > cmfSMA[cmfSMA.length - 1];
  const isOverbought = currentCMF > 0.8; 
  const isOversold = currentCMF < -0.8; 
  if (isBullishCrossover) {
    consoleLogger.push(`CMF Signal`, `Bullish Crossover`);
  } else if (isBearishCrossover) {
    consoleLogger.push(`CMF Signal`, `Bearish Crossover`);
  } else if (isOverbought) {
    consoleLogger.push(`CMF Signal`, `Overbought`);
  } else if (isOversold) {
    consoleLogger.push(`CMF Signal`, `Oversold`);
  } else {
    consoleLogger.push(`CMF Signal`, `Neutral`);
  } 
};

export const checkCMFSignals = (consoleLogger: ConsoleLogger, indicators: Indicators, options: ConfigOptions) => {
  let check = 'HOLD';
  if (options.useCMF) {
    const cmfValues = indicators.cmf;
    for(let i = 1; i < (options.cmfHistoryLength + 1); i++) {
      const currentCMF = cmfValues[cmfValues.length - i];
      const prevCMF = cmfValues[cmfValues.length - (i + 1)];
      const cmfSMA = calculateSMA(cmfValues.map((value) => ({ close: value })), 50, 'close'); 
      const isBullishCrossover = currentCMF > cmfSMA[cmfSMA.length - i] && prevCMF < cmfSMA[cmfSMA.length - i];
      const isBearishCrossover = currentCMF < cmfSMA[cmfSMA.length - i] && prevCMF > cmfSMA[cmfSMA.length - i];
      const isOverbought = currentCMF > 0.8;
      const isOversold = currentCMF < -0.8;
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
    consoleLogger.push("CMF Check", check);
  }
  return check;
}