import { Client } from "discord.js";
import { symbolFilters } from "../symbolFiltersStore";
import { ConsoleLogger } from "../Utilities/ConsoleLogger";
import { ConfigOptions, ExchangeOptions, SymbolOptions, toSymbolKey } from "../Utilities/Args";
import { Balances } from "../Exchanges/Balances";
import { buy, sell, simulateBuy, simulateSell } from "../Exchanges/Trades";
import { Exchange } from "../Exchanges/Exchange";
import { logToFile } from "../Utilities/LogToFile";
import { Candlesticks } from "../Exchanges/Candlesticks";
import { Filter } from "../Exchanges/Filters";
import { simOrderbookFromCandle, simulationTimeframesForSymbol } from "../Simulation/simModeHelpers";
import { simPriceFromCandle, simSellBaseQuantity } from "../Trading/executionSizing";
import { consoleLogger } from "../Utilities/ConsoleLogger";

export const simulatePeriodic = async (
  symbol: string,
  candlesticks: Candlesticks,
  processOptions: ConfigOptions,
  exchangeOptions: ExchangeOptions,
  symbolOptions: SymbolOptions,
  balances: Balances,
  filter: Filter,
): Promise<boolean> => {
  if (symbolOptions.enabled === false) return false;
  const symbolKey = toSymbolKey(symbol);
  const primaryTf = simulationTimeframesForSymbol(symbolOptions)[0]!;
  const series = candlesticks[symbolKey]?.[primaryTf];
  if (!Array.isArray(series) || series.length < 1) return false;

  const latestCandle = series[series.length - 1]!;
  if (!latestCandle.isFinal) return false;

  const currentTime = latestCandle.time;
  const lastTradeTime = symbolOptions.periodicTime || 0;
  const intervalMilliseconds = (symbolOptions.periodicInterval ?? 0) * 1000;
  if (intervalMilliseconds <= 0 || currentTime - lastTradeTime < intervalMilliseconds) {
    return false;
  }
  symbolOptions.periodicTime = currentTime;

  exchangeOptions.orderbooks = exchangeOptions.orderbooks ?? {};
  exchangeOptions.orderbooks[symbolKey] = simOrderbookFromCandle(latestCandle);
  const price = simPriceFromCandle(latestCandle);
  const logger = consoleLogger();
  const qty = symbolOptions.periodicQuantity ?? 0;

  if (symbolOptions.periodicDirection) {
    await simulateBuy(
      symbol,
      qty > 0 ? qty * price : (balances[symbol.split("/")[1]!]?.crypto ?? 0),
      price,
      balances,
      "SKIP",
      processOptions,
      exchangeOptions,
      symbolOptions,
      latestCandle.time,
      filter,
      logger,
    );
  } else {
    await simulateSell(
      symbol,
      qty > 0 ? qty : simSellBaseQuantity(balances[symbol.split("/")[0]!]?.crypto ?? 0),
      price,
      balances,
      "SKIP",
      processOptions,
      exchangeOptions,
      symbolOptions,
      latestCandle.time,
      filter,
      logger,
    );
  }
  return true;
};

export const periodic = async (
  discord: Client,
  exchange: Exchange,
  consoleLogger: ConsoleLogger,
  symbol: string,
  processOptions: ConfigOptions,
  exchangeOptions: ExchangeOptions,
  symbolOptions: SymbolOptions,
) => {
  const currentTime = Date.now();
  const lastTradeTime = symbolOptions.periodicTime || 0;
  const timeSinceLastTrade = currentTime - lastTradeTime;
  const intervalMilliseconds = symbolOptions.periodicInterval * 1000;
  if (timeSinceLastTrade >= intervalMilliseconds) {
    symbolOptions.periodicTime = currentTime;
    const orderBook = exchangeOptions.orderbooks[toSymbolKey(symbol)];
    const filter = symbolFilters[toSymbolKey(symbol)];
    if (symbolOptions.periodicDirection) {
      consoleLogger.push("Performing periodic BUY", `Buying ${symbolOptions.periodicQuantity} of ${symbol}`);
      await buy(
        discord,
        exchange,
        consoleLogger,
        symbol,
        "SKIP",
        orderBook,
        filter,
        processOptions,
        exchangeOptions,
        symbolOptions,
        symbolOptions.periodicQuantity,
      );
    } else {
      consoleLogger.push("Performing periodic SELL", `Selling ${symbolOptions.periodicQuantity} of ${symbol}`);
      await sell(
        discord,
        exchange,
        consoleLogger,
        symbol,
        "SKIP",
        orderBook,
        filter,
        processOptions,
        exchangeOptions,
        symbolOptions,
        symbolOptions.periodicQuantity,
      );
    }
    consoleLogger.print();
    consoleLogger.flush();
  }
  return true;
};
