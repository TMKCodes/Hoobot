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

import { Candlestick } from "../Exchanges/Candlesticks";
import { ConfigOptions, SymbolOptions } from "../Utilities/Args";
import { ConsoleLogger } from "../Utilities/ConsoleLogger";
import { calculateEMA } from "./EMA";
import { calculateSMA } from "./SMA";

/**
 * Calculates Bollinger Bands for the given candlestick data.
 * @param candles Array of candlestick data
 * @param average Type of moving average to use ("SMA" or "EMA")
 * @param period Period for the moving average
 * @param multiplier Standard deviation multiplier for bands
 * @param source Price source ("close", "open", "high", "low")
 * @returns Tuple of [values, upperBands, lowerBands]
 */
export const calculateBollingerBands = (
  candles: Candlestick[],
  average: string = "SMA",
  period: number,
  multiplier: number = 2,
  source: string = "close",
): [number[], number[], number[]] => {
  let values: number[] = [];
  if (average === "SMA") {
    values = calculateSMA(candles, period, source);
  } else if (average === "EMA") {
    values = calculateEMA(candles, period, source);
  }
  const standardDeviations: number[] = [];
  let prices: number[] = [];
  if (source === "close") {
    prices = candles.map((candle) => candle.close);
  } else if (source === "open") {
    prices = candles.map((candle) => candle.open);
  } else if (source === "high") {
    prices = candles.map((candle) => candle.high);
  } else if (source === "low") {
    prices = candles.map((candle) => candle.low);
  }
  for (let i = period - 1; i < prices.length; i++) {
    const slice = prices.slice(i - period + 1, i + 1);
    const variance = slice.reduce((acc, val) => acc + Math.pow(val - values[i - period + 1], 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    standardDeviations.push(stdDev);
  }
  const upperBands = values.map((sma, i) => sma + standardDeviations[i] * multiplier);
  const lowerBands = values.map((sma, i) => sma - standardDeviations[i] * multiplier);
  return [values, upperBands, lowerBands];
};

/**
 * Logs Bollinger Bands signals to the console logger.
 * @param consoleLogger Logger instance
 * @param candlesticks Array of candlestick data
 * @param bollingerBands Tuple of [values, upperBands, lowerBands]
 */
export const logBollingerBandsSignals = (
  consoleLogger: ConsoleLogger,
  candlesticks: Candlestick[],
  bollingerBands: [number[], number[], number[]],
) => {
  if (
    candlesticks.length === 0 ||
    bollingerBands[0].length === 0 ||
    bollingerBands[1].length === 0 ||
    bollingerBands[2].length === 0
  )
    return;
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
  });
};

export const checkBollingerBandsSignals = (
  candlesticks: Candlestick[],
  bollingerBands: [number[], number[], number[]],
  symbolOptions: SymbolOptions,
) => {
  let check = "SKIP";
  if (symbolOptions.indicators !== undefined) {
    if (symbolOptions.indicators.bb !== undefined) {
      if (symbolOptions.indicators.bb.enabled) {
        check = "HOLD";
        if (candlesticks.length < 2 || bollingerBands[0].length < 2 ||
            bollingerBands[1].length < 2 || bollingerBands[2].length < 2) {
          return check;
        }

        const currentCandle = candlesticks[candlesticks.length - 1];
        const previousCandle = candlesticks[candlesticks.length - 2];
        const currentUpperBand = bollingerBands[1][bollingerBands[1].length - 1];
        const currentLowerBand = bollingerBands[2][bollingerBands[2].length - 1];
        const previousUpperBand = bollingerBands[1][bollingerBands[1].length - 2];
        const previousLowerBand = bollingerBands[2][bollingerBands[2].length - 2];

        // Bollinger Bands signals:
        // BUY: Price touches lower band and starts moving up (bullish bounce)
        // SELL: Price touches upper band and starts moving down (bearish rejection)

        const touchedLowerBand = currentCandle.low <= currentLowerBand || previousCandle.low <= previousLowerBand;
        const touchedUpperBand = currentCandle.high >= currentUpperBand || previousCandle.high >= previousUpperBand;
        const priceRising = currentCandle.close > previousCandle.close;
        const priceFalling = currentCandle.close < previousCandle.close;

        if (touchedLowerBand && priceRising) {
          symbolOptions.indicators.bb.weight = 1;
          check = "BUY";
        } else if (touchedUpperBand && priceFalling) {
          symbolOptions.indicators.bb.weight = 1;
          check = "SELL";
        }
      }
    }
  }
  return check;
};
