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

export function calculateStochasticOscillator(candles: any[], kPeriod: number = 14, dPeriod: number = 3, smoothing: number = 3, source: string = 'close'): number[] {
  if (candles.length > 250) {
    candles = candles.slice(-(250))
  }
  const stochasticValues: candlestick[] = [];
  for (let i = kPeriod - 1; i < candles.length; i++) {
    const slice = candles.slice(i - kPeriod + 1, i + 1);
    const closePrices = slice.map(candle => candle.close);

    const highestHigh = Math.max(...slice.map(candle => candle.high));
    const lowestLow = Math.min(...slice.map(candle => candle.low));

    const currentClose = closePrices[closePrices.length - 1];
    const kValue = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
    stochasticValues.push({ close: kValue, high: kValue, low: kValue, open: kValue });
  }
  const smoothedKValues = calculateSMA(stochasticValues, smoothing, source);
  const dValues = calculateSMA(smoothedKValues.map((val) => ({ close: val })), dPeriod, source);
  return dValues;
}

export function calculateStochasticRSI(rsiValues: number[], lengthStochastic: number = 14, kSmooth: number = 3, dSmooth: number = 3, source: string = 'close'): [number[], number[]] {
  const stochasticValues: candlestick[] = [];
  for (let i = lengthStochastic - 1; i < rsiValues.length; i++) {
      const slice = rsiValues.slice(i - lengthStochastic + 1, i + 1);

      const highestHigh = Math.max(...slice);
      const lowestLow = Math.min(...slice);

      const currentRSI = rsiValues[i];
      const kValue = ((currentRSI - lowestLow) / (highestHigh - lowestLow)) * 100;
      stochasticValues.push({ close: kValue, high: kValue, low: kValue, open: kValue });
  }
  const smoothedKValues = calculateSMA(stochasticValues, kSmooth, source);
  const dValues = calculateSMA(smoothedKValues.map((val) => ({ close: val })), dSmooth, source);
  return [stochasticValues.map((candle) => candle.close ), dValues];
}

export function logStochasticOscillatorSignals(consoleLogger: ConsoleLogger, stochasticOscillator: number[], options: ConfigOptions) {
  const stochasticOscillatorFixed = stochasticOscillator.map((value) => value.toFixed(2));
  if(stochasticOscillatorFixed.length === 1) {
    consoleLogger.push("Stochastic Oscillator history:", stochasticOscillatorFixed.join(", "));
  } else {
    consoleLogger.push("Stochastic Oscillator history:", stochasticOscillatorFixed.slice(0, stochasticOscillatorFixed.length - 1).join(", "));
  }
  if (stochasticOscillator[stochasticOscillator.length - 1] > 80) {
    consoleLogger.push(`Stochastic Oscillator condition`, `Overbought`);
  } else if (stochasticOscillator[stochasticOscillator.length - 1] < 20) {
    consoleLogger.push(`Stochastic Oscillator condition`, `Oversold`);
  } else if (stochasticOscillator[stochasticOscillator.length - 1] > 70) {
    consoleLogger.push(`Stochastic Oscillator condition`, `Overbought (Approaching)`);
  } else if (stochasticOscillator[stochasticOscillator.length - 1] < 30) {
    consoleLogger.push(`Stochastic Oscillator condition`, `Oversold (Approaching)`);
  } else if (stochasticOscillator[stochasticOscillator.length - 1] < 50) {
    consoleLogger.push(`Stochastic Oscillator signal`, `Bullish`);
  } else if(stochasticOscillator[stochasticOscillator.length - 1] > 50) {
    consoleLogger.push(`Stochastic Oscillator signal`, `Bearish`);
  }
}

export function logStochasticRSISignals(consoleLogger: ConsoleLogger, stochasticRSI: number[], options: ConfigOptions) {
  const stochasticRSIFixed = stochasticRSI.map((value) => value.toFixed(2));
  if(stochasticRSIFixed.length === 1) {
    consoleLogger.push("Stochastic RSI history:", stochasticRSIFixed.join(", "));
  } else {
    consoleLogger.push("Stochastic RSI history:", stochasticRSIFixed.slice(0, stochasticRSIFixed.length - 1).join(", "));
  }
  if (stochasticRSI[stochasticRSI.length - 1] > 80) {
    consoleLogger.push(`Stochastic RSI condition`, `Overbought`);
  } else if (stochasticRSI[stochasticRSI.length - 1] < 20) {
    consoleLogger.push(`Stochastic RSI condition`, `Oversold`);
  } else if (stochasticRSI[stochasticRSI.length - 1] > 70) {
    consoleLogger.push(`Stochastic RSI condition`, `Overbought (Approaching)`);
  } else if (stochasticRSI[stochasticRSI.length - 1] < 30) {
    consoleLogger.push(`Stochastic RSI condition`, `Oversold (Approaching)`);
  } else if (stochasticRSI[stochasticRSI.length - 1] < 50) {
    consoleLogger.push(`Stochastic RSI signal`, `Bullish`);
  } else if(stochasticRSI[stochasticRSI.length - 1] > 50) {
    consoleLogger.push(`Stochastic RSI signal`, `Bearish`);
  }
}

export const checkStochasticOscillatorSignals = (consoleLogger: ConsoleLogger, indicators: Indicators, options: ConfigOptions) => {
  let check = 'HOLD';
  if (options.useStochasticOscillator) {
    const overboughtTreshold = options.stochasticOscillatorOverboughtTreshold !== undefined ? options.stochasticOscillatorOverboughtTreshold : 80;
    const oversoldTreshold = options.stochasticOscillatorOversoldTreshold !== undefined ? options.stochasticOscillatorOversoldTreshold : 20; 
    for (let i = indicators.stochasticOscillator.length - 1; i >= 0; i--) {
      const prevStochasticOscillator = indicators.stochasticOscillator[i];
      if (prevStochasticOscillator > overboughtTreshold) {
        check = 'SELL';
        break;
      }
    }
    if(check === "HOLD") {
      for (let i = indicators.stochasticOscillator.length - 1; i >= 0; i--) {
        const prevStochasticOscillator = indicators.stochasticOscillator[i];
        if(prevStochasticOscillator < oversoldTreshold) {
          check = 'BUY';
          break;
        }
      }
    }
    consoleLogger.push("Stochastic Oscillator Check", check);
  }
  return check;
}

export const checkStochasticRSISignals = (consoleLogger: ConsoleLogger, indicators: Indicators, options: ConfigOptions) => {
  let check = 'HOLD';
  if (options.useStochasticRSI) {
    const overboughtTreshold = options.stochasticRSIOverboughtTreshold !== undefined ? options.stochasticRSIOverboughtTreshold : 80;
    const oversoldTreshold = options.stochasticRSIOversoldTreshold !== undefined ? options.stochasticRSIOversoldTreshold : 20; 
    for (let i = indicators.stochasticRSI[0].length - 1; i >= 0; i--) {
      const prevStochasticRSI = indicators.stochasticRSI[0][i];
      if (prevStochasticRSI > overboughtTreshold) {
        check = 'SELL';
        break;
      }
    }
    if(check === "HOLD") {
      for (let i = indicators.stochasticRSI[0].length - 1; i >= 0; i--) {
        const prevStochasticRSI = indicators.stochasticRSI[0][i];
        if(prevStochasticRSI < oversoldTreshold) {
          check = 'BUY';
          break;
        }
      }
    }
    consoleLogger.push("Stochastic RSI Check", check);
  }
  return check;
}
