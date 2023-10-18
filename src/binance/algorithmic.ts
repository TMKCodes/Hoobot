import { Client } from "discord.js";
import Binance from "node-binance-api";
import { getLastCompletedOrder, handleOpenOrders, order } from "./orders";
import { filter } from "./filters";
import { ConfigOptions, getSecondsFromInterval } from "./args";
import { checkBeforeOrder, tradeDirection } from "./tradeChecks";
import { ConsoleLogger } from "./consoleLogger";
import { play } from "./playSound";
import { sendMessageToChannel } from "../discord/discord";
import { Balances, getCurrentBalances } from "./balances";
import { calculateEMA, logEMASignals } from "./ema";
import { calculateRSI, logRSISignals } from "./rsi";
import { calculateMACD, logMACDSignals } from "./macd";
import { candlestick } from "./candlesticks";
import { dir } from "console";


const soundFile = './alarm.mp3'
const cryptoChannelID = "1133114701136547961"

interface previous {
  macd: any;
  shortEma: any;
  longEma: any;
}

const prev: previous = {
  macd: undefined,
  shortEma: undefined,
  longEma: undefined,
}

export const calculatePercentageDifference = (oldNumber: number, newNumber: number): number => {
  const difference = newNumber - oldNumber;
  const percentageDifference = (difference / Math.abs(oldNumber)) * 100;
  return percentageDifference;
}

export const reverseSign = (number: number) => {
  return -number;
}

// Place buy or sell order based on EMA difference
async function placeTrade(
  discord: Client,
  binance: Binance,
  consoleLogger: ConsoleLogger,
  symbol: string,
  tradeHistory: order[],
  shortEma: number,
  longEma: number,
  rsi: number,
  macd: { macdLine: number; signalLine: number; histogram: number; },
  balances: Balances,
  orderBook: any,
  closePrice: number,
  filter: filter,
  options: ConfigOptions,
) {
  const quoteBalance = balances[symbol.split("/")[0]];
  const baseBalance = balances[symbol.split("/")[1]];
  const lastTrade = tradeHistory[0];
  const direction = await tradeDirection(consoleLogger,quoteBalance, baseBalance, closePrice, shortEma, longEma, macd, rsi, tradeHistory, options);
  consoleLogger.push(`Trade direction`, direction);
  if (direction === "RECHECK BALANCES") {
    balances = await getCurrentBalances(binance);
    return false;
  } else if (direction === 'SELL') {
    const orderBookAsks = Object.keys(orderBook.asks).map(price => parseFloat(price)).sort((a, b) => a - b);
    let price = orderBookAsks[0] - parseFloat(filter.tickSize);
    const quantity = quoteBalance;
    let maxQuantity = quantity;
    if (options.maxAmount !== 0) {
      maxQuantity = Math.min(quantity, options.maxAmount);
    }
    const stopPrice = price * (1 - (options.riskPercentage / 100));
    const roundedPrice = binance.roundStep(price, filter.tickSize);
    const roundedQuantity = binance.roundStep(maxQuantity, filter.stepSize);
    const quoteQuantity = roundedQuantity * price;
    const roundedStopPrice = binance.roundStep(stopPrice, filter.tickSize);
    const checkBefore = checkBeforeOrder(roundedQuantity, roundedPrice, roundedStopPrice, filter, orderBook);
    const percentageChange = calculatePercentageDifference(parseFloat(lastTrade.price), roundedPrice) - 0.075;
    if (checkBefore === true) {
      let order: any = false;
      if(quoteQuantity > parseFloat(filter.minNotional)) {
        try {
          play(soundFile);
          // const _options = { stopPrice: roundedStopPrice, type: 'STOP_LOSS_LIMIT' }; 
          order = await binance.sell(symbol.split("/").join(""), roundedQuantity, roundedPrice);
          const orderMsg = `Placed sell order: ID: ${order.orderId}, Pair: ${symbol}, Quantity: ${roundedQuantity}, Price: ${roundedPrice}, Profit if trade fullfills: ${percentageChange.toFixed(2)}%`;
          sendMessageToChannel(discord, cryptoChannelID, orderMsg);
          consoleLogger.push(`sell-order`, {
            symbol: symbol.split("/").join(""),
            quantity: roundedQuantity,
            price: roundedPrice,
            stopPrice: roundedStopPrice,
          })
        } catch (error: any) {
          console.error(JSON.stringify(error));
          if (error.msg !== undefined) {
            sendMessageToChannel(discord, cryptoChannelID, error.msg);
          }
        }
        return order;
      } else {
        return false;
      }
    } else {
      console.log("NOTANIONAL PROBLEM, CHECK LIMITS AND YOUR BALANCES");
    }
  } else if (direction === 'BUY') {
    const orderBookBids = Object.keys(orderBook.bids).map(price => parseFloat(price)).sort((a, b) => a - b);
    let price = orderBookBids[orderBookBids.length - 1] + parseFloat(filter.tickSize);
    console.log(baseBalance);
    const quantityInQuote = (baseBalance / price) * 0.999;
    const quantityInBase = baseBalance * 0.999
    let maxQuantityInQuote = quantityInQuote;
    if (options.maxAmount !== 0) {
      maxQuantityInQuote = Math.min(quantityInQuote, options.maxAmount);
    }
    let maxQuantityInBase = quantityInBase;
    if (options.maxAmount !== 0) {
      maxQuantityInBase = Math.min(quantityInBase, options.maxAmount);
    }
    const stopPrice = price * (1 + (options.riskPercentage / 100));
    const roundedPrice = binance.roundStep(price, filter.tickSize);
    const roundedQuantity = binance.roundStep(maxQuantityInQuote, filter.stepSize);
    const roundedQuantityInBase = binance.roundStep(maxQuantityInBase, filter.stepSize);
    const roundedStopPrice = binance.roundStep(stopPrice, filter.tickSize);
    if (checkBeforeOrder(roundedQuantity, roundedPrice, roundedStopPrice, filter, orderBook) === true) {
      const percentageChange = reverseSign(calculatePercentageDifference(parseFloat(lastTrade.price), roundedPrice)) - 0.075;
      let order: any = false;
      if(roundedQuantityInBase > parseFloat(filter.minNotional)) {
        try {
          play(soundFile);
          // const options = { stopPrice: roundedStopPrice, type: 'STOP_LOSS_LIMIT' };
          order = await binance.buy(symbol.split("/").join(""), roundedQuantity, roundedPrice);
          const orderMsg = `Placed buy order: ID: ${order.orderId}, Pair: ${symbol}, Quantity: ${roundedQuantity}, Price: ${roundedPrice}, Profit if trade fullfills: ${percentageChange.toFixed(2)}%`;
          sendMessageToChannel(discord, cryptoChannelID, orderMsg);
          consoleLogger.push(`buy-order`, {
            symbol: symbol.split("/").join(""),
            quantity: roundedQuantity,
            price: roundedPrice,
            stopPrice: roundedStopPrice,
          })
        } catch (error: any) {
          console.error(JSON.stringify(error.body));
          if (error.msg !== undefined) {
            sendMessageToChannel(discord, cryptoChannelID, error.msg);
          }
        }
        return order;
      } else {
        console.log(`\r\nFailed check: ${roundedQuantityInBase} > ${parseFloat(filter.minNotional)}\r\n`);
        return false;
      }
    } else {
      console.log("NOTANIONAL PROBLEM, CHECK LIMITS AND YOUR BALANCES");
    }
  } else {
    return false;
  }
}

// Rebalancing function (adjust this function based on your rebalancing strategy)
// 
export async function algorithmic(
  discord: Client, 
  binance: Binance, 
  consoleLogger: ConsoleLogger, 
  symbol: string, 
  balances: Balances,
  candlesticks: candlestick[], 
  filter: filter, 
  options: ConfigOptions) {
  try {
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
    const shortEma = calculateEMA(candlesticks, options.shortEma);
    const longEma = calculateEMA(candlesticks, options.longEma);
    const rsi = calculateRSI(candlesticks, options.rsiLength);
    const macd = calculateMACD(candlesticks, options.shortEma, options.longEma, 9);
    logEMASignals(consoleLogger, shortEma, longEma, prev.shortEma, prev.longEma);
    logMACDSignals(consoleLogger, macd, prev.macd);
    logRSISignals(consoleLogger, rsi);
    const lastOrder = await getLastCompletedOrder(binance, symbol);

    await placeTrade(discord, binance, consoleLogger, symbol, tradeHistory, shortEma, longEma, rsi, macd, balances, orderBook, closePrice, filter, options);
    prev.macd = macd;
    prev.shortEma = shortEma;
    prev.longEma = longEma;
    consoleLogger.print();
    consoleLogger.flush();
  } catch (error: any) {
    console.error(JSON.stringify(error));
  }
}