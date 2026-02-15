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

export const calculateWilliamsR = (candles: Candlestick[], period: number = 14): number[] => {
  if (period === 0) {
    period = 14;
  }
  if (!candles || candles.length < period) {
    return [];
  }

  const williamsR: number[] = [];

  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1);
    const highestHigh = Math.max(...slice.map(candle => candle.high));
    const lowestLow = Math.min(...slice.map(candle => candle.low));
    const currentClose = candles[i].close;

    if (highestHigh === lowestLow) {
      williamsR.push(0);
    } else {
      const r = ((highestHigh - currentClose) / (highestHigh - lowestLow)) * -100;
      williamsR.push(r);
    }
  }

  return williamsR;
};

export const logWilliamsRSignals = (consoleLogger: ConsoleLogger, williamsR: number[]) => {
  if (williamsR.length === 0) return;
  const currentWR = williamsR[williamsR.length - 1];
  let signal = "Neutral";
  if (currentWR > -20) {
    signal = "Overbought";
  } else if (currentWR < -80) {
    signal = "Oversold";
  } else if (currentWR < -50) {
    signal = "Bullish";
  } else if (currentWR > -50) {
    signal = "Bearish";
  }
  consoleLogger.push("Williams %R", {
    value: currentWR.toFixed(7),
    signal: signal,
  });
};

export const checkWilliamsRSignals = (williamsR: number[], symbolOptions: SymbolOptions): string => {
  let check = "SKIP";
  if (symbolOptions.indicators !== undefined) {
    if (symbolOptions.indicators.williamsR && symbolOptions.indicators.williamsR.enabled) {
      check = "HOLD";
      if (williamsR.length < 2) {
        return check;
      }

      const currentWR = williamsR[williamsR.length - 1];
      const previousWR = williamsR[williamsR.length - 2];

      const overboughtThreshold = symbolOptions.indicators.williamsR.thresholds?.overbought || -20;
      const oversoldThreshold = symbolOptions.indicators.williamsR.thresholds?.oversold || -80;

      // Williams %R signals:
      // BUY: %R crosses above oversold threshold from below, or %R < oversold and rising
      // SELL: %R crosses below overbought threshold from above, or %R > overbought and falling

      if ((currentWR > oversoldThreshold && previousWR <= oversoldThreshold) ||
          (currentWR < oversoldThreshold && currentWR > previousWR)) {
        symbolOptions.indicators.williamsR.weight = 1;
        check = "BUY";
      } else if ((currentWR < overboughtThreshold && previousWR >= overboughtThreshold) ||
                 (currentWR > overboughtThreshold && currentWR < previousWR)) {
        symbolOptions.indicators.williamsR.weight = 1;
        check = "SELL";
      }
    }
  }
  return check;
};