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
