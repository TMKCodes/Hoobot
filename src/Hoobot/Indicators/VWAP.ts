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

export interface VWAPResult {
  vwap: number[];
  upperBand: number[];
  lowerBand: number[];
  standardDeviation: number[];
}

export const logVWAPSignals = (consoleLogger: ConsoleLogger, vwap: VWAPResult) => {
  if (!vwap.vwap.length) return;

  const latestVWAP = vwap.vwap[vwap.vwap.length - 1];
  const latestUpper = vwap.upperBand[vwap.upperBand.length - 1];
  const latestLower = vwap.lowerBand[vwap.lowerBand.length - 1];

  let signal = "Neutral";
  if (latestVWAP > latestUpper) {
    signal = "Overbought";
  } else if (latestVWAP < latestLower) {
    signal = "Oversold";
  }

  consoleLogger.push("VWAP", {
    vwap: latestVWAP.toFixed(7),
    upperBand: latestUpper.toFixed(7),
    lowerBand: latestLower.toFixed(7),
    signal: signal,
  });
};

export const calculateVWAP = (
  candles: Candlestick[],
  stdDevMultiplier: number = 2,
  resetPeriod: string = "daily", // "daily", "weekly", "monthly", or "session"
): VWAPResult => {
  if (!Array.isArray(candles) || candles.length < 1) {
    return {
      vwap: [],
      upperBand: [],
      lowerBand: [],
      standardDeviation: [],
    };
  }

  const vwap: number[] = [];
  const upperBand: number[] = [];
  const lowerBand: number[] = [];
  const standardDeviation: number[] = [];

  let cumulativeVolume = 0;
  let cumulativeVolumePrice = 0;
  let sessionStartIndex = 0;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    const volume = candle.volume || 1; // Fallback if volume is not available

    cumulativeVolume += volume;
    cumulativeVolumePrice += typicalPrice * volume;

    const currentVWAP = cumulativeVolumePrice / cumulativeVolume;
    vwap.push(currentVWAP);

    // Calculate standard deviation for bands
    if (i >= sessionStartIndex) {
      const sessionVWAPs = vwap.slice(sessionStartIndex);
      const mean = sessionVWAPs.reduce((sum, val) => sum + val, 0) / sessionVWAPs.length;
      const variance = sessionVWAPs.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / sessionVWAPs.length;
      const stdDev = Math.sqrt(variance);

      standardDeviation.push(stdDev);
      upperBand.push(currentVWAP + stdDev * stdDevMultiplier);
      lowerBand.push(currentVWAP - stdDev * stdDevMultiplier);
    } else {
      standardDeviation.push(0);
      upperBand.push(currentVWAP);
      lowerBand.push(currentVWAP);
    }

    // Check if we need to reset for new session (simplified - in real implementation,
    // you'd check actual date/time boundaries)
    if (resetPeriod !== "session" && i < candles.length - 1) {
      const currentTime = new Date(candle.time);
      const nextTime = new Date(candles[i + 1].time);

      let shouldReset = false;
      if (resetPeriod === "daily") {
        shouldReset = currentTime.getDate() !== nextTime.getDate();
      } else if (resetPeriod === "weekly") {
        shouldReset = currentTime.getDay() > nextTime.getDay() && currentTime.getDay() === 0;
      } else if (resetPeriod === "monthly") {
        shouldReset = currentTime.getMonth() !== nextTime.getMonth();
      }

      if (shouldReset) {
        cumulativeVolume = 0;
        cumulativeVolumePrice = 0;
        sessionStartIndex = i + 1;
      }
    }
  }

  return {
    vwap,
    upperBand,
    lowerBand,
    standardDeviation,
  };
};

export const checkVWAPSignals = (vwap: VWAPResult, symbolOptions: SymbolOptions): string => {
  let check = "SKIP";
  if (symbolOptions.indicators !== undefined) {
    if (symbolOptions.indicators.vwap && symbolOptions.indicators.vwap.enabled) {
      check = "HOLD";

      if (!vwap.vwap.length || vwap.vwap.length < 2) {
        return check;
      }

      const latestVWAP = vwap.vwap[vwap.vwap.length - 1];
      const latestUpper = vwap.upperBand[vwap.upperBand.length - 1];
      const latestLower = vwap.lowerBand[vwap.lowerBand.length - 1];
      const prevVWAP = vwap.vwap[vwap.vwap.length - 2];

      // VWAP signals:
      // BUY: Price crosses above VWAP from below, or VWAP crosses above lower band
      // SELL: Price crosses below VWAP from above, or VWAP crosses below upper band

      if (latestVWAP > latestUpper && prevVWAP <= latestUpper) {
        symbolOptions.indicators.vwap.weight = 1;
        check = "BUY";
      } else if (latestVWAP < latestLower && prevVWAP >= latestLower) {
        symbolOptions.indicators.vwap.weight = 1;
        check = "SELL";
      }
    }
  }
  return check;
};
