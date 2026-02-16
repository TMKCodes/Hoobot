import { Candlestick } from "../Exchanges/Candlesticks";
import { ConsoleLogger } from "../Utilities/ConsoleLogger";

export const calculateAverage = (candlesticks: Candlestick[]): number => {
  if (candlesticks === undefined || candlesticks.length === 0) {
    return 0;
  }
  candlesticks = candlesticks.slice(-150);
  let totalPrice = 0;
  for (let i = 0; i < candlesticks.length; i++) {
    totalPrice += (candlesticks[i].close + candlesticks[i].high + candlesticks[i].low + candlesticks[i].open) / 4;
  }
  return totalPrice / candlesticks.length;
};

export const logAverageSignals = (consoleLogger: ConsoleLogger, candlesticks: Candlestick[], average: number) => {
  if (candlesticks.length === 0) {
    consoleLogger.push("Average", { error: "No candlestick data available" });
    return;
  }
  let signal = "Neutral";
  if (candlesticks[candlesticks.length - 1].high < average) {
    signal = "Buy";
  } else if (candlesticks[candlesticks.length - 1].low > average) {
    signal = "Sell";
  }
  consoleLogger.push("Average", {
    value: average,
    signal: signal,
  });
};
