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

import { calculateSMA } from './sma';

function calculateBollingerBands(candles: any[], period: number, multiplier: number = 2, source: string = 'close'): [number[], number[], number[]] {
  const smaValues = calculateSMA(candles, period, source);
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
      const variance = slice.reduce((acc, val) => acc + Math.pow(val - smaValues[i - period + 1], 2), 0) / period;
      const stdDev = Math.sqrt(variance);
      standardDeviations.push(stdDev);
  }

  const upperBands = smaValues.map((sma, i) => sma + (standardDeviations[i] * multiplier));
  const lowerBands = smaValues.map((sma, i) => sma - (standardDeviations[i] * multiplier));

  return [smaValues, upperBands, lowerBands];
}