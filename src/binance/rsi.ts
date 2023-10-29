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

import { ConfigOptions } from './args';
import { ConsoleLogger } from './consoleLogger';

export function logRSISignals(consoleLogger: ConsoleLogger, rsi: number[], options: ConfigOptions) {
  const rsiFixed = rsi.slice(-(options.rsiHistoryLength + 1)).map((rsi) => rsi.toFixed(2));
  consoleLogger.push("RSI history:", rsiFixed.slice(0, rsiFixed.length - 2).join(", "));
  consoleLogger.push(`RSI current`, rsi[rsi.length - 1].toFixed(2));
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

// Calculate RSI
export function calculateRSI(candles: any[], length: number = 9, smoothing: number = 12, source: string = 'close'): number[] {
  if (candles.length < length) {
    throw new Error('Insufficient data to calculate RSI');
  }
  // Get closing prices from candles
  let closePrices: number[] = [];
  if(source == 'close') {
    closePrices = candles.map((candle) => parseFloat(candle.close));
  } else if(source == 'open') {
    closePrices = candles.map((candle) => parseFloat(candle.open));
  } else if(source == 'high') {
    closePrices = candles.map((candle) => parseFloat(candle.high));
  } else if(source == 'low') {
    closePrices = candles.map((candle) => parseFloat(candle.low));
  }

  // Calculate price changes
  const priceChanges: number[] = [];
  for (let i = 1; i < closePrices.length; i++) {
    priceChanges.push(closePrices[i] - closePrices[i - 1]);
  }

  // Calculate gains and losses
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

  // Calculate average gains and losses over the first 'length' data points
  let sumGains = 0;
  let sumLosses = 0;
  for (let i = 0; i < length; i++) {
    sumGains += gains[i];
    sumLosses += losses[i];
  }
  let avgGain = sumGains / length;
  let avgLoss = sumLosses / length;

  // Calculate the RSI itself
  const rsArray: number[] = [];
  for (let i = length; i <= closePrices.length; i++) {
    if (i < closePrices.length) {
      avgGain = ((avgGain * (length - 1)) + gains[i - 1]) / length;
      avgLoss = ((avgLoss * (length - 1)) + losses[i - 1]) / length;
    }

    // Handle the case when average loss is 0
    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    const rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));

    rsArray.push(rsi);
  }

  // Apply smoothing
  if (smoothing > 1) {
    for (let i = smoothing - 1; i < rsArray.length; i++) {
      let sum = 0;
      for (let j = 0; j < smoothing; j++) {
        sum += rsArray[i - j];
      }
      rsArray[i] = sum / smoothing;
    }
  }

  return rsArray; 
}
