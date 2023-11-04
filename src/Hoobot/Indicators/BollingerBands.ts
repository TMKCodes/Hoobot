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

import { candlestick } from '../Binance/candlesticks';
import { Indicators } from '../Modes/algorithmic';
import { ConfigOptions } from '../Utilities/args';
import { ConsoleLogger } from '../Utilities/consoleLogger';
import { calculateEMA } from './EMA';
import { calculateSMA } from './SMA';

export function calculateBollingerBands(candles: any[], average: string = "SMA", period: number, multiplier: number = 2, source: string = 'close'): [number[], number[], number[]] {
  let values: number[] = [];
  if (average === "SMA") {
    values = calculateSMA(candles, period, source);
  } else if(average === "EMA") {
    values = calculateEMA(candles, period, source);
  }
  const standardDeviations: number[] = [];
  let prices: number[] = [];
  if(source == 'close') {
    prices = candles.map((candle) => parseFloat(candle.close));
  } else if(source == 'open') {
    prices = candles.map((candle) => parseFloat(candle.open));
  } else if(source == 'high') {
    prices = candles.map((candle) => parseFloat(candle.high));
  } else if(source == 'low') {
    prices = candles.map((candle) => parseFloat(candle.low));
  }
  for (let i = period - 1; i < prices.length; i++) {
      const slice = prices.slice(i - period + 1, i + 1);
      const variance = slice.reduce((acc, val) => acc + Math.pow(val - values[i - period + 1], 2), 0) / period;
      const stdDev = Math.sqrt(variance);
      standardDeviations.push(stdDev);
  }
  const upperBands = values.map((sma, i) => sma + (standardDeviations[i] * multiplier));
  const lowerBands = values.map((sma, i) => sma - (standardDeviations[i] * multiplier));
  return [values, upperBands, lowerBands];
}

export function logBollingerBandsSignals(
  consoleLogger: ConsoleLogger,
  candlesticks: candlestick[],
  bollingerBands: [number[], number[], number[]]
) {
  const currentLow = candlesticks[candlesticks.length - 1].low;
  const currentHigh = candlesticks[candlesticks.length - 1].high;
  const currentUpperBand = bollingerBands[1][bollingerBands[1].length - 1];
  const currentLowerBand = bollingerBands[2][bollingerBands[2].length - 1];

  consoleLogger.push(`Bollinger Bands Upper Value`, currentUpperBand.toFixed(7));
  consoleLogger.push(`Bollinger Bands Lower Value`, currentLowerBand.toFixed(7));

  if (currentHigh > currentUpperBand) {
    consoleLogger.push(`Bollinger Bands Signal`, `Above Upper Band (Bearish)`);
  } else if (currentLow < currentLowerBand) {
    consoleLogger.push(`Bollinger Bands Signal`, `Below Lower Band (Bullish)`);
  } else if (currentLow >= currentLowerBand && currentHigh <= currentUpperBand) {
    consoleLogger.push(`Bollinger Bands Signal`, `Within Bands (Neutral)`);
  }

  const isBullishBBSignal = currentLow > currentLowerBand;
  const isBearishBBSignal = currentHigh < currentUpperBand;

  if (isBullishBBSignal) {
    consoleLogger.push(`Bollinger Bands Signal`, `Bullish Signal`);
  }

  if (isBearishBBSignal) {
    consoleLogger.push(`Bollinger Bands Signal`, `Bearish Signal`);
  }
}

export const checkBollingerBandsSignals = (
  consoleLogger: ConsoleLogger,
  candlesticks: candlestick[],
  indicators: Indicators,
  options: ConfigOptions
) => {
  let check = 'HOLD';
  if (options.useBollingerBands) {
    const currentLow = candlesticks[candlesticks.length - 1].low;
    const currentHigh = candlesticks[candlesticks.length - 1].high;    
    const currentUpperBand = indicators.bollingerBands[1][indicators.bollingerBands[1].length - 1];
    const currentLowerBand = indicators.bollingerBands[0][indicators.bollingerBands[0].length - 1];
    
    const isAboveUpperBand = currentHigh > currentUpperBand;
    const isBelowLowerBand = currentLow < currentLowerBand;
    
    if (isAboveUpperBand) {
      check = 'SELL';
    } else if (isBelowLowerBand) {
      check = 'BUY';
    }
    
    consoleLogger.push("Bollinger Bands Check", check);
  }

  return check;
};
