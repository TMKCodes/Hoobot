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
import { calculateSMA } from "./SMA";

export const calculateOBV = (
  candlesticks: Candlestick[]
): number[] => {
  const obvValues: number[] = [0]; 
  for (let i = 1; i < candlesticks.length; i++) {
    if (candlesticks[i].close > candlesticks[i - 1].close) {
      obvValues.push(obvValues[i - 1] + candlesticks[i].volume);
    } else if (candlesticks[i].close < candlesticks[i - 1].close) {
      obvValues.push(obvValues[i - 1] - candlesticks[i].volume);
    } else {
      obvValues.push(obvValues[i - 1]);
    }
  }
  return obvValues;
}


export const logOBVSignals = (
  consoleLogger: ConsoleLogger,
  candlesticks: Candlestick[],
  obvValues: number[]
) => {
  const currentOBV = obvValues[obvValues.length - 1];
  const prevOBV = obvValues[obvValues.length - 2];
  const obvSMA = calculateSMA(obvValues.map((value) => ({ close: value })), 50, 'close'); 
  consoleLogger.push(`OBV Value`, currentOBV.toFixed(7));
  consoleLogger.push(`OBV Smoothed`, obvSMA[obvSMA.length - 1].toFixed(7));
  const isBullish = currentOBV > prevOBV;
  const isBearish = currentOBV < prevOBV;
  const isBullishCrossover = currentOBV > obvSMA[obvSMA.length - 1] && prevOBV < obvSMA[obvSMA.length - 1];
  const isBearishCrossover = currentOBV < obvSMA[obvSMA.length - 1] && prevOBV > obvSMA[obvSMA.length - 1];
  const isBullishDivergence = currentOBV > prevOBV && candlesticks[candlesticks.length - 1].close < candlesticks[candlesticks.length - 2].close;
  const isBearishDivergence = currentOBV < prevOBV && candlesticks[candlesticks.length - 1].close > candlesticks[candlesticks.length - 2].close;
  if (isBullishCrossover) {
    consoleLogger.push(`OBV Signal`, `Bullish Crossover`);
  } else if (isBearishCrossover) {
    consoleLogger.push(`OBV Signal`, `Bearish Crossover`);
  } else if (isBullishDivergence) {
    consoleLogger.push(`OBV Signal`, `Bullish Divergence`);
  } else if (isBearishDivergence) {
    consoleLogger.push(`OBV Signal`, `Bearish Divergence`);
  } else if (isBullish) {
    consoleLogger.push(`OBV Signal`, `Bullish`);
  } else if (isBearish) {
    consoleLogger.push(`OBV Signal`, `Bearish`);
  } else {
    consoleLogger.push(`OBV Signal`, `Neutral`);
  }
};


export const checkOBVSignals = (
  consoleLogger: ConsoleLogger, 
  candlesticks: Candlestick[], 
  indicators: Indicators, 
  options: ConfigOptions
) => {
  let check = 'HOLD';
  if (options.useOBV) {
    const obvValues = indicators.obv;
    for(let i = 1; i < (options.obvHistoryLength + 1); i++) {
      const currentOBV = obvValues[obvValues.length - i];
      const prevOBV = obvValues[obvValues.length - (i + 1)];
      const obvSMA = calculateSMA(obvValues.map((value) => ({ close: value })), 50, 'close'); 
      const isBullishCrossover = currentOBV > obvSMA[obvSMA.length - i] && prevOBV < obvSMA[obvSMA.length - i];
      const isBearishCrossover = currentOBV < obvSMA[obvSMA.length - i] && prevOBV > obvSMA[obvSMA.length - i];
      const isBullishDivergence = currentOBV > prevOBV && candlesticks[candlesticks.length - i].close < candlesticks[candlesticks.length - (i + 1)].close;
      const isBearishDivergence = currentOBV < prevOBV && candlesticks[candlesticks.length - i].close > candlesticks[candlesticks.length - (i + 1)].close;
      if (isBullishCrossover) {
        check = 'BUY';
      } else if (isBearishCrossover) {
        check = 'SELL';
      } else if (isBullishDivergence) {
        check = 'BUY'; 
      } else if (isBearishDivergence) {
        check = 'SELL'; 
      }
    }
    consoleLogger.push("OBV Check", check);
  }
  return check;
}