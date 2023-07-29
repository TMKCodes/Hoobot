/* =====================================================================
* Binance Trading Bot - Proprietary License
* Copyright (c) 2023 Hoosat Oy. All rights reserved.
*
* Redistribution and use in source and binary forms, with or without
* modification, are not permitted without prior written permission
* from Hoosat Oy. Unauthorized reproduction, copying, or use of this
* software, in whole or in part, is strictly prohibited.
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

import { ConsoleLogger } from './consoleLogger';

export function logRSISignals(consoleLogger: ConsoleLogger, rsi: number) {
  consoleLogger.push(`RSI`, rsi.toFixed(2));
  if (rsi > 80) {
    consoleLogger.push(`RSI condition`, `Extremely Overbought`);
  } else if (rsi < 20) {
    consoleLogger.push(`RSI condition`, `Extremely Oversold`);
  } else if (rsi > 70) {
    consoleLogger.push(`RSI condition`, `Overbought`);
  } else if (rsi < 30) {
    consoleLogger.push(`RSI condition`, `Oversold`);
  } else if (rsi < 50) {
    consoleLogger.push(`RSI signal`, `Bullish`);
  } else if(rsi > 50) {
    consoleLogger.push(`RSI signal`, `Bearish`);
  }
}

// Calculate RSI
export function calculateRSI(candles: any[], length: number = 14): number {
  if (candles.length < length) {
    throw new Error('Insufficient data to calculate RSI');
  }
  // Get closing prices from candles
  const closePrices: number[] = candles.map((candle) => parseFloat(candle.close));

  // Calculate price changes
  const priceChanges: number[] = [];
  for (let i = 1; i < closePrices.length; i++) {
    priceChanges.push(closePrices[i] - closePrices[i - 1]);
  }

  // Calculate gains and losses
  const gains: number[] = [];
  const losses: number[] = [];
  for (const change of priceChanges) {
    if (change > 0) { // Modified this line to fix the issue
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

  //console.log(`Initial avgGain: ${avgGain}, avgLoss: ${avgLoss}`);

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

    //console.log(`Iteration ${i}, avgGain: ${avgGain}, avgLoss: ${avgLoss}, rs: ${rs}, rsi: ${rsi}`);
    rsArray.push(rsi);
  }

  return rsArray[rsArray.length - 1]; 
}