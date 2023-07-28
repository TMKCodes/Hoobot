
import dotenv from 'dotenv';
import Binance from 'node-binance-api';
import { loginDiscord, sendMessageToChannel } from './discord/discord';
import { candlestick, listenForCandlesticks } from './binance/candlesticks';
import { calculateEMA, logEMASignals } from './binance/ema';
import { calculateMACD, logMACDSignals } from './binance/macd';
import { calculateRSI, logRSISignals } from './binance/rsi';
import { ConfigOptions, getSecondsFromInterval, parseArgs } from './binance/args';
import { getCurrentBalances } from './binance/balances';
import { getLastCompletedOrder, handleOpenOrders, order } from './binance/orders';
import { checkBeforeOrder, tradeDirection } from './binance/tradeChecks';
import { play } from './binance/playSound';
import { Client } from 'discord.js';
import consoleLogger from './binance/consoleLogger';
import { filter, filters, getFilters } from './binance/filters';

dotenv.config();


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
// Get configuration options from command-line arguments
const args = process.argv.slice(2);
const options = parseArgs(args) as ConfigOptions;

const soundFile = './alarm.mp3'

// Initialize Binance client
const binance = new Binance().options({
  APIKEY: options.apiKey,
  APISECRET: options.apiSecret,
  useServerTime: true, // This uses Binance server time for WebSocket requests
  family: 4,
});


let tradingPairFilters: filters = {};


function calculateWeightedAverage(prices) {
  let totalQuantity = 0;
  let weightedSum = 0;

  for (const [price, quantity] of prices) {
    const priceValue = parseFloat(price);
    const quantityValue = parseFloat(quantity);
    totalQuantity += quantityValue;
    weightedSum += priceValue * quantityValue;
  }

  return weightedSum / totalQuantity;
}

// Place buy or sell order based on EMA difference
async function placeTrade(
  discord: Client, 
  pair: string, 
  lastOrder: order, 
  shortEma: number, 
  longEma: number, 
  rsi: number, 
  macd: { macdLine: number; signalLine: number; histogram: number; }, 
  balance: { [coin: string]: number; }, 
  orderBook: any,
  closePrice: number, 
  tradingPairFilters: filter, 
  candletime: string
) {
  const balanceA = await binance.roundStep(balance[pair.split("/")[0]], tradingPairFilters.stepSize);
  const balanceB = await binance.roundStep(balance[pair.split("/")[1]], tradingPairFilters.stepSize);

  const direction = tradeDirection(consoleLogger, balanceA, balanceB, closePrice, shortEma, longEma, macd, rsi, candletime, lastOrder, options);
  consoleLogger.push(`Trade direction`, direction);

  if (direction === 'SELL') {
    const orderBookAsks = Object.keys(orderBook.asks).map(price => parseFloat(price)).sort((a, b) => a - b);
    let price = orderBookAsks[0] - parseFloat(tradingPairFilters.tickSize);
    const quantity = balanceA * 0.99;
    const quoteQuantity = quantity * price;
    if(quoteQuantity < tradingPairFilters.minNotional && quoteQuantity > tradingPairFilters.maxNotional) {
      return false;
    }
    let maxQuantity = quantity;
    if(options.maxAmount !== 0) {
      maxQuantity = Math.min(quantity, options.maxAmount);
    }
    const stopPrice = price * (1 - (options.riskPercentage / 100));
    const roundedPrice = binance.roundStep(price, tradingPairFilters.tickSize);
    const roundedQuantity = binance.roundStep(maxQuantity, tradingPairFilters.stepSize);
    const roundedStopPrice =  binance.roundStep(stopPrice, tradingPairFilters.tickSize);
    const checkBefore = checkBeforeOrder(roundedQuantity, roundedPrice, roundedStopPrice, tradingPairFilters, orderBook, candletime);
    if (checkBefore === true) {
      let order: any = false;
      try {
        play(soundFile);
        const options = { stopPrice: roundedStopPrice, type: 'STOP_LOSS_LIMIT' }; 
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
        if(error.msg !== undefined) {
          sendMessageToChannel(discord, cryptoChannelID, error.msg);
        }
      }
      return order;
    } else {
      return false;
    }
  } else if (direction === 'BUY') {
    const orderBookBids = Object.keys(orderBook.bids).map(price => parseFloat(price)).sort((a, b) => a - b);
    let price = orderBookBids[orderBookBids.length - 1] + parseFloat(tradingPairFilters.tickSize); 
    const quantity = (balanceB / price) * 0.99;
    if(quantity < tradingPairFilters.minNotional && quantity > tradingPairFilters.maxNotional) {
      return false;
    }
    console.log(`price: ${price}`);
    console.log(`balanceB: ${balanceB}`);
    console.log(`quantity: ${quantity}`);
    let maxQuantity = quantity;
    if(options.maxAmount !== 0) {
      maxQuantity = Math.min(quantity, options.maxAmount);
    }
    const stopPrice = price * (1 + (options.riskPercentage / 100));

    console.log(`maxQuantity: ${maxQuantity}`);
    console.log(`stopPrice: ${stopPrice}`);

    const roundedPrice = binance.roundStep(price, tradingPairFilters.tickSize);
    const roundedQuantity = binance.roundStep(maxQuantity, tradingPairFilters.stepSize);
    const roundedStopPrice =  binance.roundStep(stopPrice, tradingPairFilters.tickSize);
    console.log(`roundedQuantity: ${roundedQuantity}`);
    console.log(`roundedPrice: ${roundedPrice}`);
    console.log(`roundedStopPrice: ${roundedStopPrice}`);
    if (checkBeforeOrder(roundedQuantity, roundedPrice, roundedStopPrice, tradingPairFilters, orderBook, candletime) === true) {
      let order: any = false;
      try {
        play(soundFile);
        const options = { stopPrice: roundedStopPrice, type: 'STOP_LOSS_LIMIT' };
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
        if(error.msg !== undefined) {
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
async function rebalance(discord: Client, pair: string, candlesticks: candlestick[]) {
  try {
    const candleTime = (new Date(candlesticks[candlesticks.length - 1].time)).toLocaleString('fi-FI');
    consoleLogger.push(`Candlestick time`, candleTime);
    const closePrice = parseFloat(candlesticks[candlesticks.length-1].close);
    consoleLogger.push(`Last close price`, closePrice.toFixed(2));
    if (candlesticks.length < options.longEma) {
      consoleLogger.push(`warning`, `Not enough candlesticks for calculations, please wait.`);
      return
    }
    const orderBook = await binance.depth(pair.split("/").join(""));
    const filter = tradingPairFilters[pair.split("/").join("")];

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

    await placeTrade(discord, pair, lastOrder, shortEma, longEma, rsi, macd, balances, orderBook, closePrice, filter, candleTime);
    prev.macd = macd;
    prev.shortEma = shortEma;
    prev.longEma = longEma;
    consoleLogger.print();
    consoleLogger.flush();
  } catch (error: any) {
    console.error(JSON.stringify(error));
  }
}

const main = async () => {
  try {
    let discord: any = undefined;
    if(process.env.DISCORD_ENABLED === "true") {
      discord = loginDiscord(binance, options);
    }
    
    // const candlesticks = await getLastCandlesticks(binance, options.pair, options.candlestickInterval);
    // const emaData = findEMACrossovers(candlesticks, options.shortEma, options.longEma);
    // console.log(JSON.stringify(emaData, null, 4));

    // const pairs = await findPossiblePairs(binance, options);
    // console.log(JSON.stringify(pairs.map(v => v.symbol), null, 4));
    // Run the trading function

    // Check if options.pair is an array or a single string
    if (Array.isArray(options.pair)) {
      // If options.pair is an array, listen for candlesticks for each pair separately
      for (const pair of options.pair) {
        const filter = await getFilters(binance, pair);
        tradingPairFilters[pair.split("/").join("")] = filter;
        console.log(tradingPairFilters);
        listenForCandlesticks(binance, pair, options.candlestickInterval, async (candlesticks: candlestick[]) => {
          await rebalance(discord, pair, candlesticks);
        });
      }
    } else {
      // If options.pair is a single string, listen for candlesticks for that pair only
      const filter = await getFilters(binance, options.pair);
      tradingPairFilters[options.pair.split("/").join("")] = filter;
      console.log(tradingPairFilters);
      listenForCandlesticks(binance, options.pair, options.candlestickInterval, async (candlesticks: candlestick[]) => {
        await rebalance(discord, options.pair as string, candlesticks);
      });
    }
  } catch (error: any) {
    console.error(JSON.stringify(error));
  }
}

main();

