import { Client } from "discord.js";
import Binance from "node-binance-api";
import { ConsoleLogger } from "./consoleLogger";
import { candlestick } from "./candlesticks";
import { filter } from "./filters";
import { ConfigOptions, getSecondsFromInterval } from "./args";
import { Balances } from "./balances";
import { getLastCompletedOrder, handleOpenOrders } from "./orders";
import { calculateEMA, logEMASignals } from "./ema";
import { calculateRSI, logRSISignals } from "./rsi";
import { calculateMACD, logMACDSignals } from "./macd";



export async function hilow(
  discord: Client, 
  binance: Binance, 
  consoleLogger: ConsoleLogger, 
  symbol: string, 
  balances: Balances,
  candlesticks: candlestick[], 
  filter: filter, 
  options: ConfigOptions) {
    const candleTime = (new Date(candlesticks[candlesticks.length - 1].time)).toLocaleString('fi-FI');
    consoleLogger.push(`Candlestick time`, candleTime);
    const closePrice = parseFloat(candlesticks[candlesticks.length - 1].close);
    consoleLogger.push(`Last close price`, closePrice.toFixed(7));
    if (candlesticks.length < options.longEma) {
      consoleLogger.push(`warning`, `Not enough candlesticks for calculations, please wait.`);
      return
    }
    const orderBook = await binance.depth(symbol.split("/").join(""));

    // Check for open orders before placing a new one
    const openOrders = await binance.openOrders(symbol.split("/").join("")); // Implement a function to get open orders
    if (openOrders.length > 0) {
      consoleLogger.push(`warning`, `There are open orders. Waiting for them to complete or cancelling them.`);
      const maxAgeInSeconds = getSecondsFromInterval(options.candlestickInterval) * 0.95;
      return await handleOpenOrders(discord, binance, symbol.split("/").join(""), openOrders, orderBook, maxAgeInSeconds, options, consoleLogger);
    }

    const tradeHistory = (await binance.trades(symbol.split("/").join(""))).reverse().slice(0, 3);
    
    consoleLogger.push(symbol.split("/")[0], balances[symbol.split("/")[0]].toFixed(7));
    consoleLogger.push(symbol.split("/")[1], balances[symbol.split("/")[1]].toFixed(7));
    const rsi = calculateRSI(candlesticks, options.rsiLength);
    logRSISignals(consoleLogger, rsi);
    const lastOrder = await getLastCompletedOrder(binance, symbol);

    //await placeTrade(discord, binance, consoleLogger, symbol, tradeHistory, rsi, balances, orderBook, closePrice, filter, options);
    consoleLogger.print();
    consoleLogger.flush();
}