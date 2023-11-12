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
import { Indicators } from "../Modes/algorithmic";
import { ConfigOptions } from "../Utilities/args";
import { ConsoleLogger } from "../Utilities/consoleLogger";


export interface ema {
  short: number[];
  long: number[];
}

export const calculateEMA = (
  candles: Candlestick[], 
  length: number, 
  source: string = 'close'
): number[] => {
  const emaValues: number[] = [];
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
  let sum = 0;
  for (let i = 0; i < length; i++) {
    sum += prices[i];
  }
  const initialEMA = sum / length;
  emaValues.push(initialEMA);
  const smoothingFactor = 2 / (length + 1);
  for (let i = length; i < prices.length; i++) {
    const currentEMA = (prices[i] - emaValues[i - length]) * smoothingFactor + emaValues[i - length];
    emaValues.push(currentEMA);
  }
  return emaValues;
}

export const logEMASignals = (
  consoleLogger: ConsoleLogger,
  ema: ema
) => {
  const currentShortEma = ema.short[ema.short.length - 1];
  const currentLongEma = ema.long[ema.long.length - 1];
  const prevShortEma = ema.short[ema.short.length - 2];
  const prevLongEma = ema.long[ema.long.length - 2];
  consoleLogger.push(`EMA Short`, currentShortEma.toFixed(7));
  consoleLogger.push(`EMA Long`, currentLongEma.toFixed(7));
  consoleLogger.push(`EMA Difference`, (currentShortEma - currentLongEma).toFixed(7));
  const emaDiff = currentShortEma - currentLongEma;
  if (emaDiff > 0) {
    consoleLogger.push(`EMA Signal`, `Bullish`);
  } else if (emaDiff < 0) {
    consoleLogger.push(`EMA Signal`, `Bearish`);
  } else {
    consoleLogger.push(`EMA Signal`, `Neutral`);
  }
  if (prevShortEma !== undefined && prevLongEma !== undefined) {
    const isBullishCrossover = ema.short > ema.long && prevShortEma <= prevLongEma;
    const isBearishCrossover = ema.short < ema.long && prevShortEma >= prevLongEma;
    const isUpwardDirection = currentShortEma > prevShortEma && currentLongEma > prevLongEma;
    const isDownwardDirection = currentShortEma < prevShortEma && currentLongEma < prevLongEma;
    const isFlatDirection = !isUpwardDirection && !isDownwardDirection;
    if (isBullishCrossover) {
      consoleLogger.push(`EMA Signal`, `Bullish Crossover`);
    } else if (isBearishCrossover) {
      consoleLogger.push(`EMA Signal`, `Bearish Crossover`);
    }
    if (isUpwardDirection) {
      consoleLogger.push(`EMA Direction`, `Upward`);
    } else if (isDownwardDirection) {
      consoleLogger.push(`EMA Direction`, `Downward`);
    } else if (isFlatDirection) {
      consoleLogger.push(`EMA Direction`, `Flat`);
    }
  }
};

export const checkEMASignals = (
  consoleLogger: ConsoleLogger, 
  ema: ema, 
  options: ConfigOptions
) => {
  let check = 'HOLD';
  if (options.useEMA) {
    const currentShortEma = ema.short[ema.short.length - 1];
    const currentLongEma = ema.long[ema.long.length - 1];
    const prevShortEma = ema.short[ema.short.length - 2];
    const prevLongEma = ema.long[ema.long.length - 2];
    const isBullishCrossover = currentShortEma > currentLongEma && prevShortEma <= prevLongEma;
    const isBearishCrossover = currentShortEma < currentLongEma && prevShortEma >= prevLongEma;
    const isUpwardDirection = currentShortEma > prevShortEma && currentLongEma > prevLongEma;
    const isDownwardDirection = currentShortEma < prevShortEma && currentLongEma < prevLongEma;
    const isFlatDirection = !isUpwardDirection && !isDownwardDirection;
    if (isBullishCrossover) {
      check = 'BUY';
    } else if (isBearishCrossover) {
      check = 'SELL';
    } else if (isFlatDirection) {
      check = 'HOLD'
    }
    consoleLogger.push("EMA Check", check);
  }
  return check;
}
