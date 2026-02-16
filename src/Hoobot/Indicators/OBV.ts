import { Candlestick } from "../Exchanges/Candlesticks";
import { ConfigOptions, SymbolOptions } from "../Utilities/Args";
import { ConsoleLogger } from "../Utilities/ConsoleLogger";
import { calculateSMA } from "./SMA";

export const calculateOBV = (candlesticks: Candlestick[]): number[] => {
  const obv: number[] = [0];
  for (let i = 1; i < candlesticks.length; i++) {
    if (candlesticks[i].close > candlesticks[i - 1].close) {
      obv.push(obv[i - 1] + candlesticks[i].volume);
    } else if (candlesticks[i].close < candlesticks[i - 1].close) {
      obv.push(obv[i - 1] - candlesticks[i].volume);
    } else {
      obv.push(obv[i - 1]);
    }
  }
  return obv;
};

export const logOBVSignals = (consoleLogger: ConsoleLogger, candlesticks: Candlestick[], obv: number[]) => {
  if (obv.length === 0 || candlesticks.length === 0) return;
  const currentOBV = obv[obv.length - 1];
  const obvSMA = calculateSMA(
    obv.map((value) => ({ close: value }) as Candlestick),
    50,
    "close",
  );
  consoleLogger.push(`OBV Value`, currentOBV.toFixed(7));
  if (obvSMA.length > 0) {
    consoleLogger.push(`OBV Smoothed`, obvSMA[obvSMA.length - 1].toFixed(7));
  }
  if (obv.length < 2 || candlesticks.length < 2) {
    consoleLogger.push("OBV", {
      value: currentOBV.toFixed(7),
      smoothed: obvSMA.length > 0 ? obvSMA[obvSMA.length - 1].toFixed(7) : "N/A",
      signal: "Neutral",
    });
    return;
  }
  const prevOBV = obv[obv.length - 2];
  const isBullish = currentOBV > prevOBV;
  const isBearish = currentOBV < prevOBV;
  const isBullishCrossover = currentOBV > obvSMA[obvSMA.length - 1] && prevOBV < obvSMA[obvSMA.length - 1];
  const isBearishCrossover = currentOBV < obvSMA[obvSMA.length - 1] && prevOBV > obvSMA[obvSMA.length - 1];
  const isBullishDivergence =
    currentOBV > prevOBV && candlesticks[candlesticks.length - 1].close < candlesticks[candlesticks.length - 2].close;
  const isBearishDivergence =
    currentOBV < prevOBV && candlesticks[candlesticks.length - 1].close > candlesticks[candlesticks.length - 2].close;
  let signal = "Neutral";
  if (isBullishCrossover) {
    signal = `Bullish Crossover`;
  } else if (isBearishCrossover) {
    signal = `Bearish Crossover`;
  } else if (isBullishDivergence) {
    signal = `Bullish Divergence`;
  } else if (isBearishDivergence) {
    signal = `Bearish Divergence`;
  } else if (isBullish) {
    signal = `Bullish`;
  } else if (isBearish) {
    signal = `Bearish`;
  } else {
    signal = `Neutral`;
  }
  consoleLogger.push("OBV", {
    value: currentOBV.toFixed(7),
    smoothed: obvSMA[obvSMA.length - 1].toFixed(7),
    signal: signal,
  });
};

export const checkOBVSignals = (candlesticks: Candlestick[], obv: number[], symbolOptions: SymbolOptions) => {
  let check = "SKIP";
  if (symbolOptions.indicators !== undefined) {
    if (symbolOptions.indicators.obv && symbolOptions.indicators.obv.enabled) {
      check = "HOLD";
      if (obv.length < 2 || candlesticks.length < 2) {
        return check;
      }

      const obvPeriod = symbolOptions.indicators.obv.length || 20;
      const obvSMA = calculateSMA(
        obv.map((value) => ({ close: value }) as Candlestick),
        obvPeriod,
        "close",
      );

      if (obvSMA.length < 2) {
        return check;
      }

      const currentOBV = obv[obv.length - 1];
      const prevOBV = obv[obv.length - 2];
      const currentSMA = obvSMA[obvSMA.length - 1];
      const prevSMA = obvSMA[obvSMA.length - 2];
      const currentPrice = candlesticks[candlesticks.length - 1].close;
      const prevPrice = candlesticks[candlesticks.length - 2].close;

      // OBV signals:
      // BUY: OBV crosses above SMA (bullish momentum) or bullish divergence
      // SELL: OBV crosses below SMA (bearish momentum) or bearish divergence

      const bullishCrossover = currentOBV > currentSMA && prevOBV <= prevSMA;
      const bearishCrossover = currentOBV < currentSMA && prevOBV >= prevSMA;
      const bullishDivergence = currentOBV > prevOBV && currentPrice < prevPrice;
      const bearishDivergence = currentOBV < prevOBV && currentPrice > prevPrice;

      if (bullishCrossover || bullishDivergence) {
        symbolOptions.indicators.obv.weight = 1;
        check = "BUY";
      } else if (bearishCrossover || bearishDivergence) {
        symbolOptions.indicators.obv.weight = 1;
        check = "SELL";
      }
    }
  }
  return check;
};
