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
  if (!obv?.length || obv.length < 2 || !candlesticks?.length || candlesticks.length < 2) return;
  const currentOBV = obv[obv.length - 1];
  const prevOBV = obv[obv.length - 2];
  if (currentOBV == null || prevOBV == null || typeof currentOBV !== "number") return;
  const obvSMA = calculateSMA(
    obv.map((value) => ({ close: value }) as Candlestick),
    50,
    "close",
  );
  if (!obvSMA?.length) return;
  consoleLogger.push(`OBV Value`, currentOBV.toFixed(7));
  consoleLogger.push(`OBV Smoothed`, obvSMA[obvSMA.length - 1].toFixed(7));
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
      if (!obv?.length || !candlesticks?.length || obv.length < 2 || candlesticks.length < 2) {
        return "HOLD";
      }
      check = "HOLD";
      for (let i = 1; i < symbolOptions.indicators.obv.length + 1; i++) {
        const currentOBV = obv[obv.length - i];
        const prevOBV = obv[obv.length - (i + 1)];
        const obvSMA = calculateSMA(
          obv.map((value) => ({ close: value }) as Candlestick),
          50,
          "close",
        );
        const isBullishCrossover = currentOBV > obvSMA[obvSMA.length - i] && prevOBV < obvSMA[obvSMA.length - i];
        const isBearishCrossover = currentOBV < obvSMA[obvSMA.length - i] && prevOBV > obvSMA[obvSMA.length - i];
        const isBullishDivergence =
          currentOBV > prevOBV &&
          candlesticks[candlesticks.length - i].close < candlesticks[candlesticks.length - (i + 1)].close;
        const isBearishDivergence =
          currentOBV < prevOBV &&
          candlesticks[candlesticks.length - i].close > candlesticks[candlesticks.length - (i + 1)].close;
        if (isBullishCrossover) {
          check = "BUY";
        } else if (isBearishCrossover) {
          check = "SELL";
        } else if (isBullishDivergence) {
          check = "BUY";
        } else if (isBearishDivergence) {
          check = "SELL";
        }
      }
    }
  }
  return check;
};
