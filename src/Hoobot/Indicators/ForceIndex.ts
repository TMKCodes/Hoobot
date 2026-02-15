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

export const calculateForceIndex = (candles: Candlestick[], period: number = 13): number[] => {
  if (period === 0) {
    period = 13;
  }
  if (!candles || candles.length < period + 1) {
    return [];
  }

  const forceIndex: number[] = [];

  // Calculate raw Force Index: (Close - Previous Close) * Volume
  for (let i = 1; i < candles.length; i++) {
    const priceChange = candles[i].close - candles[i - 1].close;
    const rawForceIndex = priceChange * candles[i].volume;
    forceIndex.push(rawForceIndex);
  }

  // Apply EMA smoothing
  const smoothedForceIndex = calculateEMA(
    forceIndex.map((value) => ({ close: value }) as Candlestick),
    period,
    "close",
  );

  return smoothedForceIndex;
};

export const logForceIndexSignals = (consoleLogger: ConsoleLogger, forceIndex: number[]) => {
  if (forceIndex.length === 0) return;
  const currentFI = forceIndex[forceIndex.length - 1];
  let signal = "Neutral";
  if (currentFI > 0) {
    signal = "Bullish";
  } else if (currentFI < 0) {
    signal = "Bearish";
  }
  consoleLogger.push("Force Index", {
    value: currentFI.toFixed(7),
    signal: signal,
  });
};

export const checkForceIndexSignals = (forceIndex: number[], symbolOptions: SymbolOptions): string => {
  let check = "SKIP";
  if (symbolOptions.indicators !== undefined) {
    if (symbolOptions.indicators.forceIndex && symbolOptions.indicators.forceIndex.enabled) {
      check = "HOLD";
      if (forceIndex.length < 2) {
        return check;
      }

      const currentFI = forceIndex[forceIndex.length - 1];
      const previousFI = forceIndex[forceIndex.length - 2];

      // Force Index signals:
      // BUY: Force Index crosses above 0 (bullish momentum)
      // SELL: Force Index crosses below 0 (bearish momentum)

      if (currentFI > 0 && previousFI <= 0) {
        symbolOptions.indicators.forceIndex.weight = 1;
        check = "BUY";
      } else if (currentFI < 0 && previousFI >= 0) {
        symbolOptions.indicators.forceIndex.weight = 1;
        check = "SELL";
      }
    }
  }
  return check;
};
