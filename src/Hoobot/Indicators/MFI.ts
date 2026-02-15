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

export const calculateMFI = (candles: Candlestick[], period: number = 14): number[] => {
  if (period === 0) {
    period = 14;
  }
  if (!candles || candles.length < period + 1) {
    return [];
  }

  const mfi: number[] = [];
  const typicalPrices: number[] = [];
  const moneyFlows: number[] = [];

  // Calculate Typical Price and Raw Money Flow for each candle
  for (const candle of candles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    typicalPrices.push(typicalPrice);
  }

  for (let i = 1; i < candles.length; i++) {
    const currentTP = typicalPrices[i];
    const previousTP = typicalPrices[i - 1];
    const moneyFlow = currentTP * candles[i].volume;

    if (currentTP > previousTP) {
      moneyFlows.push(moneyFlow); // Positive money flow
    } else if (currentTP < previousTP) {
      moneyFlows.push(-moneyFlow); // Negative money flow
    } else {
      moneyFlows.push(0); // No change
    }
  }

  // Calculate Money Flow Ratio and MFI
  for (let i = period - 1; i < moneyFlows.length; i++) {
    const slice = moneyFlows.slice(i - period + 1, i + 1);

    const positiveFlow = slice.filter((flow) => flow > 0).reduce((sum, flow) => sum + flow, 0);
    const negativeFlow = Math.abs(slice.filter((flow) => flow < 0).reduce((sum, flow) => sum + flow, 0));

    if (negativeFlow === 0) {
      mfi.push(100); // All positive flow
    } else {
      const moneyFlowRatio = positiveFlow / negativeFlow;
      const mfiValue = 100 - 100 / (1 + moneyFlowRatio);
      mfi.push(mfiValue);
    }
  }

  return mfi;
};

export const logMFISignals = (consoleLogger: ConsoleLogger, mfi: number[]) => {
  if (mfi.length === 0) return;
  const currentMFI = mfi[mfi.length - 1];
  let signal = "Neutral";
  if (currentMFI > 80) {
    signal = "Overbought";
  } else if (currentMFI < 20) {
    signal = "Oversold";
  } else if (currentMFI > 50) {
    signal = "Bullish";
  } else if (currentMFI < 50) {
    signal = "Bearish";
  }
  consoleLogger.push("MFI", {
    value: currentMFI.toFixed(7),
    signal: signal,
  });
};

export const checkMFISignals = (mfi: number[], symbolOptions: SymbolOptions): string => {
  let check = "SKIP";
  if (symbolOptions.indicators !== undefined) {
    if (symbolOptions.indicators.mfi && symbolOptions.indicators.mfi.enabled) {
      check = "HOLD";
      if (mfi.length < 2) {
        return check;
      }

      const currentMFI = mfi[mfi.length - 1];
      const previousMFI = mfi[mfi.length - 2];

      const overboughtThreshold = symbolOptions.indicators.mfi.thresholds?.overbought || 80;
      const oversoldThreshold = symbolOptions.indicators.mfi.thresholds?.oversold || 20;

      // MFI signals:
      // BUY: MFI crosses above oversold threshold from below, or MFI < oversold and rising
      // SELL: MFI crosses below overbought threshold from above, or MFI > overbought and falling

      if (
        (currentMFI > oversoldThreshold && previousMFI <= oversoldThreshold) ||
        (currentMFI < oversoldThreshold && currentMFI > previousMFI)
      ) {
        symbolOptions.indicators.mfi.weight = 1;
        check = "BUY";
      } else if (
        (currentMFI < overboughtThreshold && previousMFI >= overboughtThreshold) ||
        (currentMFI > overboughtThreshold && currentMFI < previousMFI)
      ) {
        symbolOptions.indicators.mfi.weight = 1;
        check = "SELL";
      }
    }
  }
  return check;
};
