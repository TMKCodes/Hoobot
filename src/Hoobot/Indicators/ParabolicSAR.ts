import { Candlestick } from "../Exchanges/Candlesticks";
import { ConfigOptions, SymbolOptions } from "../Utilities/Args";
import { ConsoleLogger } from "../Utilities/ConsoleLogger";

export interface ParabolicSARResult {
  sar: number[];
  acceleration: number[];
  direction: boolean[]; // true = uptrend, false = downtrend
}

export const logParabolicSARSingals = (consoleLogger: ConsoleLogger, psar: ParabolicSARResult) => {
  if (!psar.sar.length) return;

  const latestSAR = psar.sar[psar.sar.length - 1];
  const latestDirection = psar.direction[psar.direction.length - 1];
  const latestAcceleration = psar.acceleration[psar.acceleration.length - 1];

  let signal = "Neutral";
  if (latestDirection) {
    signal = "Uptrend";
  } else {
    signal = "Downtrend";
  }

  consoleLogger.push("ParabolicSAR", {
    sar: latestSAR.toFixed(7),
    acceleration: latestAcceleration.toFixed(4),
    direction: latestDirection ? "Up" : "Down",
    signal: signal,
  });
};

export const calculateParabolicSAR = (
  candles: Candlestick[],
  accelerationFactor: number = 0.02,
  maxAcceleration: number = 0.2,
): ParabolicSARResult => {
  if (!Array.isArray(candles) || candles.length < 2) {
    return {
      sar: [],
      acceleration: [],
      direction: [],
    };
  }

  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  const sar: number[] = [];
  const acceleration: number[] = [];
  const direction: boolean[] = [];

  // Initialize first SAR value
  let currentSAR = lows[0];
  let currentAcceleration = accelerationFactor;
  let currentDirection = true; // Start assuming uptrend

  // Find initial direction based on first two candles
  if (highs[1] > highs[0]) {
    currentDirection = true; // Uptrend
    currentSAR = lows[0];
  } else {
    currentDirection = false; // Downtrend
    currentSAR = highs[0];
  }

  sar.push(currentSAR);
  acceleration.push(currentAcceleration);
  direction.push(currentDirection);

  let extremePoint = currentDirection ? highs[0] : lows[0];

  for (let i = 1; i < candles.length; i++) {
    const prevSAR = currentSAR;
    const prevDirection = currentDirection;

    // Calculate new SAR
    currentSAR = prevSAR + currentAcceleration * (extremePoint - prevSAR);

    // Ensure SAR doesn't penetrate previous candle's high/low
    if (currentDirection) {
      // Uptrend: SAR cannot be higher than previous two lows
      currentSAR = Math.min(currentSAR, lows[i - 1], lows[i]);
    } else {
      // Downtrend: SAR cannot be lower than previous two highs
      currentSAR = Math.max(currentSAR, highs[i - 1], highs[i]);
    }

    // Check for trend reversal
    let trendReversal = false;

    if (currentDirection && lows[i] <= currentSAR) {
      // Uptrend reversal: price drops below SAR
      currentDirection = false;
      currentSAR = extremePoint; // Set to previous extreme point
      extremePoint = lows[i]; // New extreme point is current low
      currentAcceleration = accelerationFactor; // Reset acceleration
      trendReversal = true;
    } else if (!currentDirection && highs[i] >= currentSAR) {
      // Downtrend reversal: price rises above SAR
      currentDirection = true;
      currentSAR = extremePoint; // Set to previous extreme point
      extremePoint = highs[i]; // New extreme point is current high
      currentAcceleration = accelerationFactor; // Reset acceleration
      trendReversal = true;
    }

    // Update extreme point and acceleration if no reversal
    if (!trendReversal) {
      if (currentDirection) {
        // Uptrend: update extreme point if new high
        if (highs[i] > extremePoint) {
          extremePoint = highs[i];
          // Increase acceleration
          currentAcceleration = Math.min(currentAcceleration + accelerationFactor, maxAcceleration);
        }
      } else {
        // Downtrend: update extreme point if new low
        if (lows[i] < extremePoint) {
          extremePoint = lows[i];
          // Increase acceleration
          currentAcceleration = Math.min(currentAcceleration + accelerationFactor, maxAcceleration);
        }
      }
    }

    sar.push(currentSAR);
    acceleration.push(currentAcceleration);
    direction.push(currentDirection);
  }

  return {
    sar,
    acceleration,
    direction,
  };
};

export const checkParabolicSARSingals = (psar: ParabolicSARResult, symbolOptions: SymbolOptions): string => {
  let check = "SKIP";
  if (symbolOptions.indicators !== undefined) {
    if (symbolOptions.indicators.parabolicSAR && symbolOptions.indicators.parabolicSAR.enabled) {
      check = "HOLD";

      if (!psar.sar.length || psar.sar.length < 2) {
        return check;
      }

      const latestDirection = psar.direction[psar.direction.length - 1];
      const prevDirection = psar.direction[psar.direction.length - 2];

      // Parabolic SAR signals:
      // BUY: Trend changes from down to up
      // SELL: Trend changes from up to down

      if (!prevDirection && latestDirection) {
        // Downtrend to uptrend - BUY signal
        symbolOptions.indicators.parabolicSAR.weight = 1;
        check = "BUY";
      } else if (prevDirection && !latestDirection) {
        // Uptrend to downtrend - SELL signal
        symbolOptions.indicators.parabolicSAR.weight = 1;
        check = "SELL";
      }
    }
  }
  return check;
};
