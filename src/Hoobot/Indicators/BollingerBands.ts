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

import { Candlestick } from '../Exchanges/Candlesticks';
import { ConfigOptions } from '../Utilities/args';
import { ConsoleLogger } from '../Utilities/consoleLogger';
import { calculateEMA } from './EMA';
import { calculateSMA } from './SMA';

export const calculateBollingerBands = (
  candles: any[], 
  average: string = "SMA", 
  period: number, 
  multiplier: number = 2, 
  source: string = 'close'
): [number[], number[], number[]] => {
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

export const logBollingerBandsSignals = (
  consoleLogger: ConsoleLogger,
  candlesticks: Candlestick[],
  bollingerBands: [number[], number[], number[]]
) => {
  const currentLow = candlesticks[candlesticks.length - 1].low;
  const currentHigh = candlesticks[candlesticks.length - 1].high;
  const currentUpperBand = bollingerBands[1][bollingerBands[1].length - 1];
  const currentLowerBand = bollingerBands[2][bollingerBands[2].length - 1];
  let signal = "";
  if (currentHigh > currentUpperBand) {
    signal = `Above Upper Band (Bearish)`;
  } else if (currentLow < currentLowerBand) {
    signal = `Below Lower Band (Bullish)`;
  } else if (currentLow >= currentLowerBand && currentHigh <= currentUpperBand) {
    signal = `Within Bands (Neutral)`;
  }
  const isBullishBBSignal = currentLow > currentLowerBand;
  const isBearishBBSignal = currentHigh < currentUpperBand;
  if (isBullishBBSignal) {
    signal = `Bullish Signal`;
  }
  if (isBearishBBSignal) {
    signal = `Bearish Signal`;
  }
  consoleLogger.push("Bollinger Bands", {
    upper: currentUpperBand.toFixed(7),
    lower: currentLowerBand.toFixed(7),
    signal: signal,
  })
}

export const checkBollingerBandsSignals = (
  candlesticks: Candlestick[],
  bollingerBands: [number[], number[], number[]],
  options: ConfigOptions
) => {
  let check = 'SKIP';
  if (options.useBollingerBands) {
    check = 'HOLD';
    for(let i = 1; i < options.bollingerBandsHistoryLength + 1; i++) {
      const currentLow = candlesticks[candlesticks.length - i].low;
      const currentHigh = candlesticks[candlesticks.length - i].high;    
      const currentUpperBand = bollingerBands[1][bollingerBands[1].length - i];
      const currentLowerBand = bollingerBands[0][bollingerBands[0].length - i];
      const isAboveUpperBand = currentHigh > currentUpperBand;
      const isBelowLowerBand = currentLow < currentLowerBand;
      if (isAboveUpperBand) {
        check = 'SELL';
        break;
      } else if (isBelowLowerBand) {
        check = 'BUY';
        break;
      }
    }
  }
  return check;
};
