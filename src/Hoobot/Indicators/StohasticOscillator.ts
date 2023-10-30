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
import { calculateSMA } from "./SMA";

export function calculateStochasticOscillator(candles: any[], kPeriod: number = 14, dPeriod: number = 3, smoothing: number = 3, source: string = 'close'): number[] {
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

  // Apply smoothing (SMA) to %K values
  const smoothedKValues = calculateSMA(stochasticValues, smoothing, source);

  // Calculate %D values using smoothed %K values
  const dValues = calculateSMA(smoothedKValues.map((val) => ({ close: val })), dPeriod, source);

  return dValues;
}

export function calculateStochasticRSI(rsiValues: number[], kPeriod: number = 14, dPeriod: number = 3, smoothing: number = 3,  source: string = 'close'): [number[], number[]] {
    const stochasticValues: candlestick[] = [];

    for (let i = kPeriod - 1; i < rsiValues.length; i++) {
        const slice = rsiValues.slice(i - kPeriod + 1, i + 1);

        const highestHigh = Math.max(...slice);
        const lowestLow = Math.min(...slice);

        const currentRSI = rsiValues[i];
        const kValue = ((currentRSI - lowestLow) / (highestHigh - lowestLow)) * 100;
        stochasticValues.push({ close: kValue, high: kValue, low: kValue, open: kValue });
    }
    const smoothedKValues = calculateSMA(stochasticValues, smoothing, source);

    const dValues = calculateSMA(smoothedKValues.map((val) => ({ close: val })), dPeriod, source);

    return [stochasticValues.map((candle) => candle.close ), dValues];
}