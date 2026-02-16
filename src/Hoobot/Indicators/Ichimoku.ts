import { Candlestick } from "../Exchanges/Candlesticks";
import { ConfigOptions, SymbolOptions } from "../Utilities/Args";
import { ConsoleLogger } from "../Utilities/ConsoleLogger";

export interface IchimokuResult {
  tenkanSen: number[];
  kijunSen: number[];
  senkouSpanA: number[];
  senkouSpanB: number[];
  chikouSpan: number[];
  currentCloud: {
    top: number;
    bottom: number;
    bullish: boolean;
  };
}

export const logIchimokuSignals = (consoleLogger: ConsoleLogger, ichimoku: IchimokuResult) => {
  if (!ichimoku.tenkanSen.length || !ichimoku.kijunSen.length) return;

  const latestTenkan = ichimoku.tenkanSen[ichimoku.tenkanSen.length - 1];
  const latestKijun = ichimoku.kijunSen[ichimoku.kijunSen.length - 1];
  const latestSpanA = ichimoku.senkouSpanA[ichimoku.senkouSpanA.length - 1];
  const latestSpanB = ichimoku.senkouSpanB[ichimoku.senkouSpanB.length - 1];

  let signal = "Neutral";
  if (latestTenkan > latestKijun && latestSpanA > latestSpanB) {
    signal = "Strong Bullish";
  } else if (latestTenkan < latestKijun && latestSpanA < latestSpanB) {
    signal = "Strong Bearish";
  } else if (latestTenkan > latestKijun) {
    signal = "Bullish";
  } else if (latestTenkan < latestKijun) {
    signal = "Bearish";
  }

  consoleLogger.push("Ichimoku", {
    tenkanSen: latestTenkan.toFixed(7),
    kijunSen: latestKijun.toFixed(7),
    senkouSpanA: latestSpanA.toFixed(7),
    senkouSpanB: latestSpanB.toFixed(7),
    cloud: ichimoku.currentCloud.bullish ? "Bullish" : "Bearish",
    signal: signal,
  });
};

export const calculateIchimoku = (
  candles: Candlestick[],
  tenkanPeriod: number = 9,
  kijunPeriod: number = 26,
  senkouPeriod: number = 52,
  displacement: number = 26,
): IchimokuResult => {
  if (!Array.isArray(candles) || candles.length < Math.max(tenkanPeriod, kijunPeriod, senkouPeriod)) {
    return {
      tenkanSen: [],
      kijunSen: [],
      senkouSpanA: [],
      senkouSpanB: [],
      chikouSpan: [],
      currentCloud: { top: 0, bottom: 0, bullish: false },
    };
  }

  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const closes = candles.map((c) => c.close);

  // Tenkan-sen (Conversion Line): (9-period high + 9-period low) / 2
  const tenkanSen: number[] = [];
  for (let i = tenkanPeriod - 1; i < candles.length; i++) {
    const periodHigh = Math.max(...highs.slice(i - tenkanPeriod + 1, i + 1));
    const periodLow = Math.min(...lows.slice(i - tenkanPeriod + 1, i + 1));
    tenkanSen.push((periodHigh + periodLow) / 2);
  }

  // Kijun-sen (Base Line): (26-period high + 26-period low) / 2
  const kijunSen: number[] = [];
  for (let i = kijunPeriod - 1; i < candles.length; i++) {
    const periodHigh = Math.max(...highs.slice(i - kijunPeriod + 1, i + 1));
    const periodLow = Math.min(...lows.slice(i - kijunPeriod + 1, i + 1));
    kijunSen.push((periodHigh + periodLow) / 2);
  }

  // Senkou Span A (Leading Span A): (Tenkan-sen + Kijun-sen) / 2, plotted 26 periods ahead
  const senkouSpanA: number[] = [];
  for (let i = kijunPeriod - 1; i < kijunSen.length; i++) {
    const tenkanValue = tenkanSen[i];
    const kijunValue = kijunSen[i];
    senkouSpanA.push((tenkanValue + kijunValue) / 2);
  }

  // Senkou Span B (Leading Span B): (52-period high + 52-period low) / 2, plotted 26 periods ahead
  const senkouSpanB: number[] = [];
  for (let i = senkouPeriod - 1; i < candles.length; i++) {
    const periodHigh = Math.max(...highs.slice(i - senkouPeriod + 1, i + 1));
    const periodLow = Math.min(...lows.slice(i - senkouPeriod + 1, i + 1));
    senkouSpanB.push((periodHigh + periodLow) / 2);
  }

  // Chikou Span (Lagging Span): Current close plotted 26 periods back
  const chikouSpan: number[] = [];
  for (let i = displacement; i < closes.length; i++) {
    chikouSpan.push(closes[i - displacement]);
  }

  // Current cloud position
  const currentIndex = Math.max(tenkanSen.length, kijunSen.length, senkouSpanA.length, senkouSpanB.length) - 1;
  const currentSpanA = senkouSpanA[Math.min(currentIndex, senkouSpanA.length - 1)] || 0;
  const currentSpanB = senkouSpanB[Math.min(currentIndex, senkouSpanB.length - 1)] || 0;

  const currentCloud = {
    top: Math.max(currentSpanA, currentSpanB),
    bottom: Math.min(currentSpanA, currentSpanB),
    bullish: currentSpanA > currentSpanB,
  };

  return {
    tenkanSen,
    kijunSen,
    senkouSpanA,
    senkouSpanB,
    chikouSpan,
    currentCloud,
  };
};

export const checkIchimokuSignals = (ichimoku: IchimokuResult, symbolOptions: SymbolOptions): string => {
  let check = "SKIP";
  if (symbolOptions.indicators !== undefined) {
    if (symbolOptions.indicators.ichimoku && symbolOptions.indicators.ichimoku.enabled) {
      check = "HOLD";

      if (!ichimoku.tenkanSen.length || !ichimoku.kijunSen.length) {
        return check;
      }

      const latestTenkan = ichimoku.tenkanSen[ichimoku.tenkanSen.length - 1];
      const latestKijun = ichimoku.kijunSen[ichimoku.kijunSen.length - 1];
      const currentPrice = ichimoku.chikouSpan[ichimoku.chikouSpan.length - 1] || latestTenkan;

      // Ichimoku signals:
      // BUY: Price above cloud, Tenkan above Kijun, Chikou above price
      // SELL: Price below cloud, Tenkan below Kijun, Chikou below price

      const priceAboveCloud = currentPrice > ichimoku.currentCloud.top;
      const priceBelowCloud = currentPrice < ichimoku.currentCloud.bottom;
      const tenkanAboveKijun = latestTenkan > latestKijun;
      const tenkanBelowKijun = latestTenkan < latestKijun;

      if (priceAboveCloud && tenkanAboveKijun) {
        symbolOptions.indicators.ichimoku.weight = 1;
        check = "BUY";
      } else if (priceBelowCloud && tenkanBelowKijun) {
        symbolOptions.indicators.ichimoku.weight = 1;
        check = "SELL";
      }
    }
  }
  return check;
};
