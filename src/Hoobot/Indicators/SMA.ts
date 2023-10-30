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
import { ConsoleLogger } from "../Utilities/consoleLogger";

export function calculateSMA(candles: candlestick[], length: number, source: string = 'close'): number[] {
  const smaValues: number[] = [];
  let prices: number[] = [];
  if(source == 'close') {
    prices = candles.map((candle) => candle.close);
  } else if(source == 'open') {
    prices = candles.map((candle) => candle.open);
  } else if(source == 'high') {
    prices = candles.map((candle) => candle.high);
  } else if(source == 'low') {
    prices = candles.map((candle) => candle.low);
  }
  for (let i = length - 1; i < candles.length; i++) {
    const sum = prices.slice(i - length + 1, i + 1).reduce((acc, val) => acc + val, 0);
    const sma = sum / length;
    smaValues.push(sma);
  }
  return smaValues;
}
export const logSMASignals = (
  consoleLogger: ConsoleLogger,
  smaValues: number[]
) => {
  const currentSMA = smaValues[smaValues.length - 1];
  const prevSMA = smaValues[smaValues.length - 2];
  consoleLogger.push(`SMA Value`, currentSMA.toFixed(7));
  if (currentSMA > prevSMA) {
    consoleLogger.push(`SMA Signal`, `Bullish`);
  } else if (currentSMA < prevSMA) {
    consoleLogger.push(`SMA Signal`, `Bearish`);
  } else {
    consoleLogger.push(`SMA Signal`, `Neutral`);
  }
  const isBullishCrossover = currentSMA > prevSMA;
  const isBearishCrossover = currentSMA < prevSMA;
  if (isBullishCrossover) {
    consoleLogger.push(`SMA Signal`, `Bullish Crossover`);
  } else if (isBearishCrossover) {
    consoleLogger.push(`SMA Signal`, `Bearish Crossover`);
  }
};