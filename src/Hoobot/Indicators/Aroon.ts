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

export interface AroonResult {
  aroonUp: number[];
  aroonDown: number[];
  aroonOscillator: number[];
}

export const calculateAroon = (candles: Candlestick[], period: number = 14): AroonResult => {
  if (period === 0) {
    period = 14;
  }
  if (!candles || candles.length < period) {
    return {
      aroonUp: [],
      aroonDown: [],
      aroonOscillator: []
    };
  }

  const aroonUp: number[] = [];
  const aroonDown: number[] = [];
  const aroonOscillator: number[] = [];

  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1);

    // Find highest high and lowest low in the period
    let highestHigh = slice[0].high;
    let lowestLow = slice[0].low;
    let highestHighIndex = 0;
    let lowestLowIndex = 0;

    for (let j = 1; j < slice.length; j++) {
      if (slice[j].high > highestHigh) {
        highestHigh = slice[j].high;
        highestHighIndex = j;
      }
      if (slice[j].low < lowestLow) {
        lowestLow = slice[j].low;
        lowestLowIndex = j;
      }
    }

    // Calculate Aroon Up and Down
    const periodsSinceHigh = period - 1 - highestHighIndex;
    const periodsSinceLow = period - 1 - lowestLowIndex;

    const aroonUpValue = ((period - periodsSinceHigh) / period) * 100;
    const aroonDownValue = ((period - periodsSinceLow) / period) * 100;

    aroonUp.push(aroonUpValue);
    aroonDown.push(aroonDownValue);
    aroonOscillator.push(aroonUpValue - aroonDownValue);
  }

  return {
    aroonUp,
    aroonDown,
    aroonOscillator
  };
};

export const logAroonSignals = (consoleLogger: ConsoleLogger, aroon: AroonResult) => {
  if (aroon.aroonUp.length === 0 || aroon.aroonDown.length === 0 || aroon.aroonOscillator.length === 0) return;

  const currentUp = aroon.aroonUp[aroon.aroonUp.length - 1];
  const currentDown = aroon.aroonDown[aroon.aroonDown.length - 1];
  const currentOsc = aroon.aroonOscillator[aroon.aroonOscillator.length - 1];

  let signal = "Neutral";
  if (currentOsc > 50) {
    signal = "Strong Uptrend";
  } else if (currentOsc < -50) {
    signal = "Strong Downtrend";
  } else if (currentUp > 70 && currentDown < 30) {
    signal = "Bullish";
  } else if (currentDown > 70 && currentUp < 30) {
    signal = "Bearish";
  }

  consoleLogger.push("Aroon", {
    up: currentUp.toFixed(2),
    down: currentDown.toFixed(2),
    oscillator: currentOsc.toFixed(2),
    signal: signal,
  });
};

export const checkAroonSignals = (aroon: AroonResult, symbolOptions: SymbolOptions): string => {
  let check = "SKIP";
  if (symbolOptions.indicators !== undefined) {
    if (symbolOptions.indicators.aroon && symbolOptions.indicators.aroon.enabled) {
      check = "HOLD";
      if (aroon.aroonUp.length < 2 || aroon.aroonDown.length < 2 || aroon.aroonOscillator.length < 2) {
        return check;
      }

      const currentUp = aroon.aroonUp[aroon.aroonUp.length - 1];
      const currentDown = aroon.aroonDown[aroon.aroonDown.length - 1];
      const currentOsc = aroon.aroonOscillator[aroon.aroonOscillator.length - 1];
      const prevOsc = aroon.aroonOscillator[aroon.aroonOscillator.length - 2];

      // Aroon signals:
      // BUY: Oscillator crosses above 0, or strong uptrend (Up > 70, Down < 30)
      // SELL: Oscillator crosses below 0, or strong downtrend (Down > 70, Up < 30)

      if ((currentOsc > 0 && prevOsc <= 0) || (currentUp > 70 && currentDown < 30)) {
        symbolOptions.indicators.aroon.weight = 1;
        check = "BUY";
      } else if ((currentOsc < 0 && prevOsc >= 0) || (currentDown > 70 && currentUp < 30)) {
        symbolOptions.indicators.aroon.weight = 1;
        check = "SELL";
      }
    }
  }
  return check;
};