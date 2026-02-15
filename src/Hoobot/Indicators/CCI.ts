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
import { calculateSMA } from "./SMA";

export const calculateCCI = (candles: Candlestick[], period: number = 20): number[] => {
  if (period === 0) {
    period = 20;
  }
  if (!candles || candles.length < period) {
    return [];
  }

  const cci: number[] = [];
  const typicalPrices: number[] = [];

  // Calculate Typical Price for each candle
  for (const candle of candles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    typicalPrices.push(typicalPrice);
  }

  for (let i = period - 1; i < candles.length; i++) {
    const slice = typicalPrices.slice(i - period + 1, i + 1);
    const sma = slice.reduce((sum, price) => sum + price, 0) / period;

    // Calculate Mean Deviation
    const meanDeviation = slice.reduce((sum, price) => sum + Math.abs(price - sma), 0) / period;

    if (meanDeviation === 0) {
      cci.push(0);
    } else {
      const currentTP = typicalPrices[i];
      const cciValue = (currentTP - sma) / (0.015 * meanDeviation);
      cci.push(cciValue);
    }
  }

  return cci;
};

export const logCCISignals = (consoleLogger: ConsoleLogger, cci: number[]) => {
  if (cci.length === 0) return;
  const currentCCI = cci[cci.length - 1];
  let signal = "Neutral";
  if (currentCCI > 100) {
    signal = "Overbought";
  } else if (currentCCI < -100) {
    signal = "Oversold";
  } else if (currentCCI > 0) {
    signal = "Bullish";
  } else if (currentCCI < 0) {
    signal = "Bearish";
  }
  consoleLogger.push("CCI", {
    value: currentCCI.toFixed(7),
    signal: signal,
  });
};

export const checkCCISignals = (cci: number[], symbolOptions: SymbolOptions): string => {
  let check = "SKIP";
  if (symbolOptions.indicators !== undefined) {
    if (symbolOptions.indicators.cci && symbolOptions.indicators.cci.enabled) {
      check = "HOLD";
      if (cci.length < 2) {
        return check;
      }

      const currentCCI = cci[cci.length - 1];
      const previousCCI = cci[cci.length - 2];

      const overboughtThreshold = symbolOptions.indicators.cci.thresholds?.overbought || 100;
      const oversoldThreshold = symbolOptions.indicators.cci.thresholds?.oversold || -100;

      // CCI signals:
      // BUY: CCI crosses above oversold threshold from below, or CCI < oversold and rising
      // SELL: CCI crosses below overbought threshold from above, or CCI > overbought and falling

      if (
        (currentCCI > oversoldThreshold && previousCCI <= oversoldThreshold) ||
        (currentCCI < oversoldThreshold && currentCCI > previousCCI)
      ) {
        symbolOptions.indicators.cci.weight = 1;
        check = "BUY";
      } else if (
        (currentCCI < overboughtThreshold && previousCCI >= overboughtThreshold) ||
        (currentCCI > overboughtThreshold && currentCCI < previousCCI)
      ) {
        symbolOptions.indicators.cci.weight = 1;
        check = "SELL";
      }
    }
  }
  return check;
};
