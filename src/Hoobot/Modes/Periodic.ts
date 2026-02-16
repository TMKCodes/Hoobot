import { Client } from "discord.js";
import { symbolFilters } from "../..";
import { ConsoleLogger } from "../Utilities/ConsoleLogger";
import { ConfigOptions, ExchangeOptions, SymbolOptions } from "../Utilities/Args";
import { buy, sell } from "../Exchanges/Trades";
import { Exchange } from "../Exchanges/Exchange";
import { logToFile } from "../Utilities/LogToFile";

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
    if (symbolOptions.periodicQuantity <= 0) {
      consoleLogger.push("Periodic trade skipped", "Invalid quantity");
      return true;
    }
    const orderBook = exchangeOptions.orderbooks[symbol.split("/").join("")];
    const filter = symbolFilters[symbol.split("/").join("")];
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
