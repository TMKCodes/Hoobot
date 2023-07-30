import { Client } from "discord.js";
import Binance from "node-binance-api";
import { getLastCompletedOrder, handleOpenOrders, order } from "./orders";
import { filter } from "./filters";
import { ConfigOptions, getSecondsFromInterval } from "./args";
import { checkBeforeOrder, tradeDirection } from "./tradeChecks";
import { ConsoleLogger } from "./consoleLogger";
import { play } from "./playSound";
import { sendMessageToChannel } from "../discord/discord";
import { getCurrentBalances } from "./balances";
import { calculateEMA, logEMASignals } from "./ema";
import { calculateRSI, logRSISignals } from "./rsi";
import { calculateMACD, logMACDSignals } from "./macd";
import { candlestick } from "./candlesticks";


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

// Place buy or sell order based on EMA difference
async function placeTrade(
  discord: Client,
  binance: Binance,
  consoleLogger: ConsoleLogger,
  pair: string,
  lastOrder: order,
  shortEma: number,
  longEma: number,
  rsi: number,
  macd: { macdLine: number; signalLine: number; histogram: number; },
  balance: { [coin: string]: number; },
  orderBook: any,
  closePrice: number,
  filter: filter,
  options: ConfigOptions,
) {
  const balanceA = await binance.roundStep(balance[pair.split("/")[0]], filter.stepSize);
  const balanceB = await binance.roundStep(balance[pair.split("/")[1]], filter.stepSize);

  const direction = tradeDirection(consoleLogger, balanceA, balanceB, closePrice, shortEma, longEma, macd, rsi, lastOrder, options);
  consoleLogger.push(`Trade direction`, direction);

  if (direction === 'SELL') {
    const orderBookAsks = Object.keys(orderBook.asks).map(price => parseFloat(price)).sort((a, b) => a - b);
    let price = orderBookAsks[0] - parseFloat(filter.tickSize);
    const quantity = balanceA * 0.99;
    const quoteQuantity = quantity * price;
    if (quoteQuantity < filter.minNotional && quoteQuantity > filter.maxNotional) {
      return false;
    }
    let maxQuantity = quantity;
    if (options.maxAmount !== 0) {
      maxQuantity = Math.min(quantity, options.maxAmount);
    }
    const stopPrice = price * (1 - (options.riskPercentage / 100));
    const roundedPrice = binance.roundStep(price, filter.tickSize);
    const roundedQuantity = binance.roundStep(maxQuantity, filter.stepSize);
    const roundedStopPrice = binance.roundStep(stopPrice, filter.tickSize);
    const checkBefore = checkBeforeOrder(roundedQuantity, roundedPrice, roundedStopPrice, filter, orderBook);
    if (checkBefore === true) {
      let order: any = false;
      try {
        play(soundFile);
        // const _options = { stopPrice: roundedStopPrice, type: 'STOP_LOSS_LIMIT' }; 
        order = await binance.sell(pair.split("/").join(""), roundedQuantity, roundedPrice);
        const orderMsg = `Placed sell order: ID: ${order.orderId}, Pair: ${pair}, Quantity: ${roundedQuantity}, Price: ${roundedPrice}, Stop Price: ${roundedStopPrice}`;
        sendMessageToChannel(discord, cryptoChannelID, orderMsg);
        consoleLogger.push(`sell-order`, {
          pair: pair.split("/").join(""),
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
  } else if (direction === 'BUY') {
    const orderBookBids = Object.keys(orderBook.bids).map(price => parseFloat(price)).sort((a, b) => a - b);
    let price = orderBookBids[orderBookBids.length - 1] + parseFloat(filter.tickSize);
    const quantity = (balanceB / price) * 0.99;
    if (quantity < filter.minNotional && quantity > filter.maxNotional) {
      return false;
    }
    let maxQuantity = quantity;
    if (options.maxAmount !== 0) {
      maxQuantity = Math.min(quantity, options.maxAmount);
    }
    const stopPrice = price * (1 + (options.riskPercentage / 100));
    const roundedPrice = binance.roundStep(price, filter.tickSize);
    const roundedQuantity = binance.roundStep(maxQuantity, filter.stepSize);
    const roundedStopPrice = binance.roundStep(stopPrice, filter.tickSize);
    if (checkBeforeOrder(roundedQuantity, roundedPrice, roundedStopPrice, filter, orderBook) === true) {
      let order: any = false;
      try {
        play(soundFile);
        // const options = { stopPrice: roundedStopPrice, type: 'STOP_LOSS_LIMIT' };
        order = await binance.buy(pair.split("/").join(""), roundedQuantity, roundedPrice);
        const orderMsg = `Placed buy order: ID: ${order.orderId}, Pair: ${pair}, Quantity: ${roundedQuantity}, Price: ${roundedPrice}, Stop Price: ${roundedStopPrice}`;
        sendMessageToChannel(discord, cryptoChannelID, orderMsg);
        consoleLogger.push(`buy-order`, {
          pair: pair.split("/").join(""),
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
    return false;
  }
}

// Rebalancing function (adjust this function based on your rebalancing strategy)
// 
export async function algorithmic(discord: Client, binance: Binance, consoleLogger: ConsoleLogger, pair: string, candlesticks: candlestick[], filter: filter, options: ConfigOptions) {
  try {
    const candleTime = (new Date(candlesticks[candlesticks.length - 1].time)).toLocaleString('fi-FI');
    consoleLogger.push(`Candlestick time`, candleTime);
    const closePrice = parseFloat(candlesticks[candlesticks.length - 1].close);
    consoleLogger.push(`Last close price`, closePrice.toFixed(7));
    if (candlesticks.length < options.longEma) {
      consoleLogger.push(`warning`, `Not enough candlesticks for calculations, please wait.`);
      return
    }
    const orderBook = await binance.depth(pair.split("/").join(""));

    // Check for open orders before placing a new one
    const openOrders = await binance.openOrders(false); // Implement a function to get open orders
    if (openOrders.length > 0) {
      consoleLogger.push(`warning`, `There are open orders. Waiting for them to complete or cancelling them.`);
      const maxAgeInSeconds = getSecondsFromInterval(options.candlestickInterval) * 0.95;
      return await handleOpenOrders(discord, binance, openOrders, orderBook, maxAgeInSeconds, options);
    }

    const balances = await getCurrentBalances(binance, pair.split("/"));
    consoleLogger.push(pair.split("/")[0], balances[pair.split("/")[0]].toFixed(7));
    consoleLogger.push(pair.split("/")[1], balances[pair.split("/")[1]].toFixed(7));
    const shortEma = calculateEMA(candlesticks, options.shortEma);
    const longEma = calculateEMA(candlesticks, options.longEma);
    const rsi = calculateRSI(candlesticks, options.rsiLength);
    const macd = calculateMACD(candlesticks, options.shortEma, options.longEma, 9);
    logEMASignals(consoleLogger, shortEma, longEma, prev.shortEma, prev.longEma);
    logMACDSignals(consoleLogger, macd, prev.macd);
    logRSISignals(consoleLogger, rsi);
    const lastOrder = await getLastCompletedOrder(binance, pair);

    await placeTrade(discord, binance, consoleLogger, pair, lastOrder, shortEma, longEma, rsi, macd, balances, orderBook, closePrice, filter, options);
    prev.macd = macd;
    prev.shortEma = shortEma;
    prev.longEma = longEma;
    consoleLogger.print();
    consoleLogger.flush();
  } catch (error: any) {
    console.error(JSON.stringify(error));
  }
}