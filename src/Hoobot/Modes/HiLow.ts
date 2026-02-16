import { Client } from "discord.js";
import { symbolFilters } from "../..";
import { ConsoleLogger } from "../Utilities/ConsoleLogger";
import { ConfigOptions, ExchangeOptions, SymbolOptions } from "../Utilities/Args";
import {
  buy,
  calculateROI,
  calculateUnrealizedPNLPercentageForLong,
  calculateUnrealizedPNLPercentageForShort,
  getTradeHistory,
  sell,
} from "../Exchanges/Trades";
import { Exchange } from "../Exchanges/Exchange";
import { logToFile } from "../Utilities/LogToFile";

export const hilow = async (
  discord: Client,
  exchange: Exchange,
  consoleLogger: ConsoleLogger,
  symbol: string,
  processOptions: ConfigOptions,
  exchangeOptions: ExchangeOptions,
  symbolOptions: SymbolOptions,
) => {
  const filter = symbolFilters[symbol.split("/").join("")];
  if (exchangeOptions.tradeHistory[symbol.split("/").join("")] === undefined) {
    exchangeOptions.tradeHistory[symbol.split("/").join("")] = await getTradeHistory(exchange, symbol);
  }
  const tradeHistory = exchangeOptions.tradeHistory[symbol.split("/").join("")];
  const lastTrade = tradeHistory[tradeHistory.length - 1];
  consoleLogger.push("Symbol", symbol.split("/").join(""));
  const roi = calculateROI(exchangeOptions.tradeHistory[symbol.split("/").join("")]);
  consoleLogger.push("Profit in Base", roi[0].toFixed(7) + " " + symbol.split("/")[0]);
  consoleLogger.push("Profit in Quote", roi[1].toFixed(7) + " " + symbol.split("/")[1]);
  if (symbolOptions.growingMax?.buy! > 0) {
    consoleLogger.push("Max buy amount", symbolOptions.growingMax?.buy + " " + symbol.split("/")[1]);
  }
  const orderBook = exchangeOptions.orderbooks[symbol.split("/").join("")];
  const orderBookAsks = Object.keys(orderBook.asks)
    .map((price) => parseFloat(price))
    .sort((a, b) => a - b);
  const orderBookBids = Object.keys(orderBook.bids)
    .map((price) => parseFloat(price))
    .sort((a, b) => b - a);
  let unrealizedPNL: number = 0;
  if (lastTrade === undefined) {
    consoleLogger.push("Manual trade required", `No trade history for symbol ${symbol}`);
    return false;
  }
  if (lastTrade.isBuyer === true) {
    const currentPrice = orderBookBids.length > 0 ? orderBookBids[0] : parseFloat(lastTrade.price);
    unrealizedPNL = calculateUnrealizedPNLPercentageForLong(
      parseFloat(lastTrade.qty),
      parseFloat(lastTrade.price),
      currentPrice,
    );
  } else {
    const currentPrice = orderBookAsks.length > 0 ? orderBookAsks[0] : parseFloat(lastTrade.price);
    unrealizedPNL = calculateUnrealizedPNLPercentageForShort(
      parseFloat(lastTrade.qty),
      parseFloat(lastTrade.price),
      currentPrice,
    );
  }
  if (symbolOptions.takeProfit !== undefined && symbolOptions.takeProfit.enabled === true) {
    const maxProfit = symbolOptions.takeProfit?.current === undefined ? 0 : symbolOptions.takeProfit.current;
    const minMaxProfitDrop = maxProfit - symbolOptions.takeProfit?.drop!;
    consoleLogger.push("PANIC Current MAX PNL%", maxProfit);
    consoleLogger.push("PANIC Current PNL%", unrealizedPNL);
    consoleLogger.push("PANIC Current PANIC PNL%", minMaxProfitDrop);
    if (unrealizedPNL > symbolOptions.takeProfit?.minimum!) {
      if (unrealizedPNL > maxProfit) {
        symbolOptions.takeProfit.current = unrealizedPNL;
      }
      if (unrealizedPNL < maxProfit - symbolOptions.takeProfit?.drop!) {
        if (lastTrade.isBuyer) {
          if (unrealizedPNL > symbolOptions.profit?.minimumSell! + symbolOptions.tradeFeePercentage!) {
            sell(
              discord,
              exchange,
              consoleLogger,
              symbol,
              "",
              orderBook,
              filter,
              processOptions,
              exchangeOptions,
              symbolOptions,
              undefined,
            );
            symbolOptions.takeProfit.current = 0;
          }
        } else {
          if (unrealizedPNL > symbolOptions.profit?.minimumBuy! + symbolOptions.tradeFeePercentage!) {
            buy(
              discord,
              exchange,
              consoleLogger,
              symbol,
              "",
              orderBook,
              filter,
              processOptions,
              exchangeOptions,
              symbolOptions,
              undefined,
            );
            symbolOptions.takeProfit.current = 0;
          }
        }
      }
    }
  }
  consoleLogger.print();
  consoleLogger.flush();
  return true;
};
