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
import { ConfigOptions } from "../Utilities/args";
import { ConsoleLogger } from "../Utilities/consoleLogger";
import { calculateRSI } from "./RSI";

export const calculateStochasticOscillator = (
  candles: Candlestick[], 
  kPeriod: number = 14, 
  dPeriod: number = 1, 
  smoothing: number = 3, 
  source: string = 'close'
): [number[], number[]] => {
  const kValues: number[] = [];
  const dValues: number[] = [];
  for (let i = kPeriod - 1; i < candles.length; i++) {
    const slice = candles.slice(i - kPeriod + 1, i + 1);
    const highestHigh = Math.max(...slice.map(candle => candle.high));
    const lowestLow = Math.min(...slice.map(candle => candle.low));
    if (highestHigh !== lowestLow) { 
      const currentClose = candles[i].close;
      const kValue = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
      kValues.push(kValue);
      if (kValues.length >= dPeriod) {
        const dSlice = kValues.slice(kValues.length - dPeriod);
        const dValue = dSlice.reduce((sum, value) => sum + value, 0) / dPeriod;
        dValues.push(dValue);
      }
    } else {
      kValues.push(50); 
    }
  }
  if (smoothing > 1) {
    for (let i = smoothing - 1; i < dValues.length; i++) {
      const slice = dValues.slice(i - smoothing + 1, i + 1);
      const smoothedValue = slice.reduce((sum, value) => sum + value, 0) / smoothing;
      dValues[i] = smoothedValue;
    }
  }
  return [kValues, dValues];
}


export const calculateStochasticRSI = (
  candles: Candlestick[], 
  lengthRSI: number = 14, 
  lengthStoch: number = 14, 
  kSmoothing: number = 3, 
  dSmoothing: number = 3, 
  rsiSmoothingType: string = "EMA", 
  source: string = 'close'
): [number[], number[]] => {
  const rsiValues = calculateRSI(candles, lengthRSI, rsiSmoothingType, 1, source);
  const kValues: number[] = [];
  const dValues: number[] = [];
  for (let i = lengthStoch - 1; i < rsiValues.length; i++) {
    const slice = rsiValues.slice(i - lengthStoch + 1, i + 1);
    const highestRSI = Math.max(...slice);
    const lowestRSI = Math.min(...slice);
    if (highestRSI !== lowestRSI) { 
      const currentRSI = rsiValues[i];
      const kValue = ((currentRSI - lowestRSI) / (highestRSI - lowestRSI)) * 100;
      kValues.push(kValue);
      if (kValues.length >= dSmoothing) {
        const dSlice = kValues.slice(kValues.length - dSmoothing);
        const dValue = dSlice.reduce((sum, value) => sum + value, 0) / dSmoothing;
        dValues.push(dValue);
      } else {
        kValues.push(50);
      }
    }
  }
  if (rsiSmoothingType === "SMA") {
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
  }
  if (rsiSmoothingType === "EMA") {
    if (kSmoothing > 1) {
      let alpha = 2 / (kSmoothing + 1);
      kValues[kSmoothing - 1] = kValues.slice(0, kSmoothing).reduce((sum, value) => sum + value, 0) / kSmoothing;
      for (let i = kSmoothing; i < kValues.length; i++) {
        kValues[i] = alpha * kValues[i] + (1 - alpha) * kValues[i - 1];
      }
    }  
    if (dSmoothing > 1) {
      let alpha = 2 / (dSmoothing + 1);
      dValues[dSmoothing - 1] = dValues.slice(0, dSmoothing).reduce((sum, value) => sum + value, 0) / dSmoothing;
      for (let i = dSmoothing; i < dValues.length; i++) {
        dValues[i] = alpha * dValues[i] + (1 - alpha) * dValues[i - 1];
      }
    }
  }

  return [kValues, dValues];
}

export const logStochasticOscillatorSignals = (
  consoleLogger: ConsoleLogger, 
  stochasticOscillator: [number[], number[]]
) => {
  const lastKValue = stochasticOscillator[0][stochasticOscillator[0].length - 1];
  const lastDValue =  stochasticOscillator[1][stochasticOscillator[1].length - 1];
  let signal = "Neutral";
  if (lastKValue > 80 || lastDValue > 80) {
    signal = `Bearish Overbought`;
  } else if (lastKValue < 20 || lastDValue < 20) {
    signal = `Bullish Oversold`;
  } else if (lastKValue > 70 || lastDValue > 70) {
    signal = `Bearish Overbought (Approaching)`;
  } else if (lastKValue < 30 || lastDValue < 30) {
    signal = `Bullish Oversold (Approaching)`;
  } else if (lastKValue < 50 || lastDValue < 50) {
    signal = `Bullish`;
  } else if (lastKValue > 50 || lastDValue > 50) {
    signal = `Bearish`;
  } else {
    signal = `Unknown`;
  }
  consoleLogger.push("Stochastic Oscillator", {
    kValue: lastKValue.toFixed(7),
    dValue: lastDValue.toFixed(7),
    signal: signal,
  });
}

export const logStochasticRSISignals = (
  consoleLogger: ConsoleLogger, 
  stochasticRSI: [number[], number[]]
) => {
  const lastKValue = stochasticRSI[0][stochasticRSI[0].length - 1];
  const lastDValue = stochasticRSI[1][stochasticRSI[1].length - 1];
  let signal = "Neutral";
  if (lastKValue > 80 || lastDValue > 80) {
    signal = `Bearish Overbought`;
  } else if (lastKValue < 20 || lastDValue < 20) {
    signal = `Bullish Oversold`;
  } else if (lastKValue > 70 || lastDValue > 70) {
    signal = `Bearish Overbought (Approaching)`;
  } else if (lastKValue < 30 || lastDValue < 30) {
    signal = `Bullish Oversold (Approaching)`;
  } else if (lastKValue < 50 || lastDValue < 50) {
    signal = `Bullish`;
  } else if (lastKValue > 50 || lastDValue > 50) {
    signal = `Bearish`;
  } else {
    signal = `Unknown`;
  }
  consoleLogger.push("Stochastic Oscillator", {
    kValue: lastKValue.toFixed(7),
    dValue: lastDValue.toFixed(7),
    signal: signal,
  });
}

export const checkStochasticOscillatorSignals = (
  consoleLogger: ConsoleLogger, 
  stochasticOscillator: [number[], number[]],
  options: ConfigOptions
) => {
  let check = 'SKIP';
  if (options.useStochasticOscillator) {
    check = 'HOLD';
    const K = stochasticOscillator[0][stochasticOscillator[0].length - 1];
    const prevK = stochasticOscillator[0][stochasticOscillator[0].length - 2];
    const D =  stochasticOscillator[1][stochasticOscillator[1].length - 1];
    const prevD =  stochasticOscillator[1][stochasticOscillator[1].length - 2];
    const KDHigher = K > D;
    const DKHigher = D > K;
    const KDCrossover = K > D && prevK < prevD;
    const DKCrossover = K < D && prevK > prevD 
    const overboughtTreshold = options.stochasticRSIOverboughtTreshold !== undefined ? options.stochasticRSIOverboughtTreshold : 80;
    const oversoldTreshold = options.stochasticRSIOversoldTreshold !== undefined ? options.stochasticRSIOversoldTreshold : 20; 
    const rising = K > prevK && D > prevD;
    const dropping = K < prevK && D > prevD;
    if ((K < oversoldTreshold && rising && KDHigher) || KDCrossover) {
      check = 'BUY';
    } else if((K > overboughtTreshold && dropping && DKHigher) || DKCrossover) {
      check = 'SELL';
    }
  }
  return check;
}

export const checkStochasticRSISignals = (
  consoleLogger: ConsoleLogger, 
  stochasticRSI: [number[], number[]],
  options: ConfigOptions
) => {
  let check = 'SKIP';
  if (options.useStochasticRSI) {
    check = 'HOLD';
    const K = stochasticRSI[0][stochasticRSI[0].length - 1];
    const prevK = stochasticRSI[0][stochasticRSI[0].length - 2];
    const D = stochasticRSI[1][stochasticRSI[1].length - 1];
    const prevD =  stochasticRSI[1][stochasticRSI[1].length - 2];
    const KDHigher = K > D;
    const DKHigher = D > K;
    const KDCrossover = K > D && prevK < prevD;
    const DKCrossover = K < D && prevK > prevD 
    const overboughtTreshold = options.stochasticRSIOverboughtTreshold !== undefined ? options.stochasticRSIOverboughtTreshold : 80;
    const oversoldTreshold = options.stochasticRSIOversoldTreshold !== undefined ? options.stochasticRSIOversoldTreshold : 20; 
    const rising = K > prevK && D > prevD;
    const dropping = K < prevK && D > prevD;
    if (D < oversoldTreshold && rising && KDHigher) {
      options.StochasticRSIWeight = 2; 
      check = 'BUY';
    } else if(D > overboughtTreshold && dropping && DKHigher) {
      options.StochasticRSIWeight = 2;
      check = 'SELL';
    } else if (D < oversoldTreshold && KDCrossover) {
      options.StochasticRSIWeight = 1;
      check = 'BUY';
    } else if (D > overboughtTreshold && DKCrossover) {
      options.StochasticRSIWeight = 1;
      check = 'SELL';
    }
  }
  return check;
}
