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

import { isNamedImportBindings } from "typescript";
import { candlestick } from "../Binance/candlesticks";
import { Indicators } from "../Modes/algorithmic";
import { ConfigOptions } from "../Utilities/args";
import { ConsoleLogger } from "../Utilities/consoleLogger";
import { calculateRSI } from "./RSI";
import { calculateSMA } from "./SMA";

export function calculateStochasticOscillator(candles: candlestick[], kPeriod: number = 14, dPeriod: number = 1, smoothing: number = 3, source: string = 'close'): [number[], number[]]  {
  const kValues: number[] = [];
  const dValues: number[] = [];

  for (let i = kPeriod - 1; i < candles.length; i++) {
      const slice = candles.slice(i - kPeriod + 1, i + 1);

      const highestHigh = Math.max(...slice.map(candle => candle.high));
      const lowestLow = Math.min(...slice.map(candle => candle.low));

      const currentClose = candles[i].close;
      const kValue = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;

      kValues.push(kValue);

      if (kValues.length >= dPeriod) {
          const dSlice = kValues.slice(kValues.length - dPeriod);
          const dValue = dSlice.reduce((sum, value) => sum + value, 0) / dPeriod;
          dValues.push(dValue);
      }
  }
  if (smoothing > 1) {
      for (let i = smoothing - 1; i < dValues.length; i++) {
          const slice = dValues.slice(i - smoothing + 1, i + 1);
          const smoothedValue = slice.reduce((sum, value) => sum + value, 0) / smoothing;
          dValues[i] = smoothedValue;
      }
  }

  return [ kValues, dValues ];
}

export function calculateStochasticRSI(candles: candlestick[], lengthRSI: number = 14, lengthStoch: number = 14, kSmoothing: number = 3, dSmoothing: number = 3): [number[], number[]] {
  const rsiValues = calculateRSI(candles, lengthRSI, "SMA", 1, 'close');

  const kValues: number[] = [];
  const dValues: number[] = [];

  for (let i = lengthStoch - 1; i < rsiValues.length; i++) {
    const slice = rsiValues.slice(i - lengthStoch + 1, i + 1);

    const highestRSI = Math.max(...slice);
    const lowestRSI = Math.min(...slice);

    const currentRSI = rsiValues[i];
    const kValue = ((currentRSI - lowestRSI) / (highestRSI - lowestRSI)) * 100;

    kValues.push(kValue);

    if (kValues.length >= dSmoothing) {
      const dSlice = kValues.slice(kValues.length - dSmoothing);
      const dValue = dSlice.reduce((sum, value) => sum + value, 0) / dSmoothing;
      dValues.push(dValue);
    }
  }

  if (kSmoothing > 1) {
    for (let i = kSmoothing - 1; i < kValues.length; i++) {
      const slice = kValues.slice(i - kSmoothing + 1, i + 1);
      const smoothedValue = slice.reduce((sum, value) => sum + value, 0) / kSmoothing;
      kValues[i] = smoothedValue;
    }
  }

  if (dSmoothing > 1) {
    for (let i = dSmoothing - 1; i < dValues.length; i++) {
      const slice = dValues.slice(i - dSmoothing + 1, i + 1);
      const smoothedValue = slice.reduce((sum, value) => sum + value, 0) / dSmoothing;
      dValues[i] = smoothedValue;
    }
  }

  return [kValues, dValues];
}

export function logStochasticOscillatorSignals(consoleLogger: ConsoleLogger, stochasticOscillator: [number[], number[]]) {
  const kValuesFixed = stochasticOscillator[0].slice(-5).map((value) => parseFloat(value.toFixed(2)));
  const dValuesFixed = stochasticOscillator[1].slice(-5).map((value) => parseFloat(value.toFixed(2)));

  if (kValuesFixed.length === 1) {
    consoleLogger.push("Stochastic Oscillator %K history:", kValuesFixed.join(", "));
  } else {
    consoleLogger.push("Stochastic Oscillator %K history:", kValuesFixed.slice(0, kValuesFixed.length - 1).join(", "));
  }

  if (dValuesFixed.length === 1) {
    consoleLogger.push("Stochastic Oscillator %D history:", dValuesFixed.join(", "));
  } else {
    consoleLogger.push("Stochastic Oscillator %D history:", dValuesFixed.slice(0, dValuesFixed.length - 1).join(", "));
  }

  const lastKValue = kValuesFixed[kValuesFixed.length - 1];
  const lastDValue = dValuesFixed[dValuesFixed.length - 1];

  if (lastKValue > 80 || lastDValue > 80) {
    consoleLogger.push(`Stochastic Oscillator condition`, `Overbought`);
  } else if (lastKValue < 20 || lastDValue < 20) {
    consoleLogger.push(`Stochastic Oscillator condition`, `Oversold`);
  } else if (lastKValue > 70 || lastDValue > 70) {
    consoleLogger.push(`Stochastic Oscillator condition`, `Overbought (Approaching)`);
  } else if (lastKValue < 30 || lastDValue < 30) {
    consoleLogger.push(`Stochastic Oscillator condition`, `Oversold (Approaching)`);
  } else if (lastKValue < 50 || lastDValue < 50) {
    consoleLogger.push(`Stochastic Oscillator signal`, `Bullish`);
  } else if (lastKValue > 50 || lastDValue > 50) {
    consoleLogger.push(`Stochastic Oscillator signal`, `Bearish`);
  }
}

export function logStochasticRSISignals(consoleLogger: ConsoleLogger, stochasticRSI: [number[], number[]]) {
  const kValuesFixed = stochasticRSI[0].slice(-5).map((value) => parseFloat(value.toFixed(2)));
  const dValuesFixed = stochasticRSI[1].slice(-5).map((value) => parseFloat(value.toFixed(2)));

  if (kValuesFixed.length === 1) {
    consoleLogger.push("Stochastic RSI %K history:", kValuesFixed.join(", "));
  } else {
    consoleLogger.push("Stochastic RSI %K history:", kValuesFixed.slice(0, kValuesFixed.length - 1).join(", "));
  }

  if (dValuesFixed.length === 1) {
    consoleLogger.push("Stochastic RSI %D history:", dValuesFixed.join(", "));
  } else {
    consoleLogger.push("Stochastic RSI %D history:", dValuesFixed.slice(0, dValuesFixed.length - 1).join(", "));
  }

  const lastKValue = kValuesFixed[kValuesFixed.length - 1];
  const lastDValue = dValuesFixed[dValuesFixed.length - 1];

  if (lastKValue > 80 || lastDValue > 80) {
    consoleLogger.push(`Stochastic RSI condition`, `Overbought`);
  } else if (lastKValue < 20 || lastDValue < 20) {
    consoleLogger.push(`Stochastic RSI condition`, `Oversold`);
  } else if (lastKValue > 70 || lastDValue > 70) {
    consoleLogger.push(`Stochastic RSI condition`, `Overbought (Approaching)`);
  } else if (lastKValue < 30 || lastDValue < 30) {
    consoleLogger.push(`Stochastic RSI condition`, `Oversold (Approaching)`);
  } else if (lastKValue < 50 || lastDValue < 50) {
    consoleLogger.push(`Stochastic RSI signal`, `Bullish`);
  } else if (lastKValue > 50 || lastDValue > 50) {
    consoleLogger.push(`Stochastic RSI signal`, `Bearish`);
  }
}

export const checkStochasticOscillatorSignals = (consoleLogger: ConsoleLogger, indicators: Indicators, options: ConfigOptions) => {
  let check = 'HOLD';
  if (options.useStochasticOscillator) {
    const kValues = indicators.stochasticRSI[0].slice(-5);
    const dValues = indicators.stochasticOscillator[1].slice(-5);
    const overboughtTreshold = options.stochasticOscillatorOverboughtTreshold !== undefined ? options.stochasticOscillatorOverboughtTreshold : 80;
    const oversoldTreshold = options.stochasticOscillatorOversoldTreshold !== undefined ? options.stochasticOscillatorOversoldTreshold : 20; 
    for (let i = dValues.length - 1; i >= 0; i--) {
      if (dValues[i] > overboughtTreshold && kValues[i] > overboughtTreshold) {
        check = 'SELL';
        break;
      }
    }
    if(check === "HOLD") {
      for (let i = dValues.length - 1; i >= 0; i--) {
        if (dValues[i] < oversoldTreshold && kValues[i] < oversoldTreshold) {
          check = 'BUY';
          break;
        }
      }
    }
  }
  return check;
}

export const checkStochasticRSISignals = (consoleLogger: ConsoleLogger, indicators: Indicators, options: ConfigOptions) => {
  let check = 'HOLD';
  if (options.useStochasticRSI) {
    const kValues = indicators.stochasticRSI[0].slice(-5);
    const dValues = indicators.stochasticRSI[1].slice(-5);
    const overboughtTreshold = options.stochasticRSIOverboughtTreshold !== undefined ? options.stochasticRSIOverboughtTreshold : 80;
    const oversoldTreshold = options.stochasticRSIOversoldTreshold !== undefined ? options.stochasticRSIOversoldTreshold : 20; 
    for (let i = dValues.length - 1; i >= 0; i--) {
      if (dValues[i] > overboughtTreshold && kValues[i] > overboughtTreshold) {
        check = 'SELL';
        break;
      }
    }
    if(check === "HOLD") {
      for (let i = dValues.length - 1; i >= 0; i--) {
        if (dValues[i] < oversoldTreshold && kValues[i] < oversoldTreshold) {
          check = 'BUY';
          break;
        }
      }
    }
    consoleLogger.push("Stochastic RSI Check", check);
  }
  return check;
}
