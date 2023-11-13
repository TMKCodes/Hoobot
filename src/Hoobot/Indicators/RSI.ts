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

import { Candlestick } from '../Binance/Candlesticks';
import { ConfigOptions } from '../Utilities/args';
import { ConsoleLogger } from '../Utilities/consoleLogger';
import { Indicators } from '../Modes/Algorithmic';

export const logRSISignals = (
  consoleLogger: ConsoleLogger,
  rsi: number[], 
  options: ConfigOptions
) => {
  const rsiFixed = rsi.slice(-5).map((rsi) => rsi.toFixed(2));
  if(rsiFixed.length === 1) {
    consoleLogger.push("RSI history", rsiFixed.slice(-5).join(", "));
  } else {
    consoleLogger.push("RSI history", rsiFixed.slice(0, rsiFixed.length - 1).join(", "));
  }
  if (rsi[rsi.length - 1] > 80) {
    consoleLogger.push(`RSI condition`, `Extremely Overbought`);
  } else if (rsi[rsi.length - 1] < 20) {
    consoleLogger.push(`RSI condition`, `Extremely Oversold`);
  } else if (rsi[rsi.length - 1] > 70) {
    consoleLogger.push(`RSI condition`, `Overbought`);
  } else if (rsi[rsi.length - 1] < 30) {
    consoleLogger.push(`RSI condition`, `Oversold`);
  } else if (rsi[rsi.length - 1] < 50) {
    consoleLogger.push(`RSI signal`, `Bullish`);
  } else if(rsi[rsi.length - 1] > 50) {
    consoleLogger.push(`RSI signal`, `Bearish`);
  }
}


export const calculateRSI = (
  candles: Candlestick[], 
  length: number = 9, 
  smoothingType: string = "SMA", 
  smoothing: number = 1, 
  source: string = 'close', 
  amount: number = 5
): number[] => {
  let closePrices: number[] = [];
  if (source === 'close') {
    closePrices = candles.map((candle) => candle.close);
  } else if (source === 'open') {
    closePrices = candles.map((candle) => candle.open);
  } else if (source === 'high') {
    closePrices = candles.map((candle) => candle.high);
  } else if (source === 'low') {
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
  let avgGain = gains.slice(0, length).reduce((a, b) => a + b) / length;
  let avgLoss = losses.slice(0, length).reduce((a, b) => a + b) / length;
  const rsArray: number[] = [];
  for (let i = length; i < closePrices.length; i++) {
    avgGain = ((avgGain * (length - 1)) + gains[i - 1]) / length;
    avgLoss = ((avgLoss * (length - 1)) + losses[i - 1]) / length;

    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    rsArray.push(rsi);
  }
  if(smoothingType == "SMA" && smoothing > 1) {
    for (let i = smoothing - 1; i < rsArray.length; i++) {
      let sum = 0;
      for (let j = 0; j < smoothing; j++) {
        sum += rsArray[i - j];
      }
      const smoothedRS = sum / smoothing;
      rsArray[i] = smoothedRS;
    }
  } else if(smoothingType == "EMA" && smoothing > 1) {
    for (let i = smoothing; i < rsArray.length; i++) {
      const alpha = 2 / (smoothing + 1);
      rsArray[i] = alpha * rsArray[i] + (1 - alpha) * rsArray[i - 1];
    }
  } else if(smoothingType == "WMA" && smoothing > 1) {
    for (let i = smoothing; i < rsArray.length; i++) {
      let sum = 0;
      for (let j = 0; j < smoothing; j++) {
        sum += rsArray[i - j];
      }
      const weightedAverage = sum / ((smoothing * (smoothing + 1)) / 2);
      rsArray[i] = weightedAverage;
    }
  }
  return rsArray;
}

export const checkRSISignals = (
  consoleLogger: ConsoleLogger, 
  rsi: number[], 
  options: ConfigOptions
): string => {
  let check = 'SKIP';
  if (options.useRSI) {
    check = 'HOLD';
    const rsiValues = rsi.slice(-options.rsiHistoryLength);
    if (options.useRSI) {
      const overboughtTreshold = options.overboughtTreshold !== undefined ? options.overboughtTreshold : 70;
      const oversoldTreshold = options.oversoldTreshold !== undefined ? options.oversoldTreshold : 30; 
      for (let i = rsiValues.length - 1; i >= 0; i--) {
        const prevRsi = rsiValues[i];
        if (prevRsi > overboughtTreshold) {
          check = 'SELL';
          break;
        }
      }
      if(check === "HOLD") {
        for (let i = rsiValues.length - 1; i >= 0; i--) {
          const prevRsi = rsiValues[i];
          if(prevRsi < oversoldTreshold) {
            check = 'BUY';
            break;
          }
        }
      }
      consoleLogger.push("RSI Check", check);
    }
  }
  return check;
}
