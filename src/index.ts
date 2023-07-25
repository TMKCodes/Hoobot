
import dotenv from 'dotenv';
import Binance from 'node-binance-api';
import { loginDiscord, sendMessageToChannel } from './discord/discord';
import { candlestick, listenForCandlesticks } from './binance/candlesticks';
import { calculateEMA, logEMASignals } from './binance/ema';
import { calculateMACD, logMACDSignals } from './binance/macd';
import { calculateRSI, logRSISignals } from './binance/rsi';
import { ConfigOptions, parseArgs } from './binance/args';
import { getCurrentBalance } from './binance/balances';
import { logToFile } from './binance/logToFile';
import { getLastCompletedOrder, handleOpenOrders, order } from './binance/orders';
import { checkBeforeOrder, tradeDirection } from './binance/tradeChecks';
import { play } from './binance/playSound';
import { Client } from 'discord.js';


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

// Function to fetch exchange info and get trading pair filters
async function getTradingPairFilters(pair: string) {
  const exchangeInfo = await binance.exchangeInfo();
  const symbolInfo = exchangeInfo.symbols.find((symbol: { symbol: string; }) => symbol.symbol === pair.split("/").join(""));
  //console.log(symbolInfo);
  if (symbolInfo) {
    const priceFilter = symbolInfo.filters.find((filter: { filterType: string; }) => filter.filterType === "PRICE_FILTER");
    const lotSizeFilter = symbolInfo.filters.find((filter: { filterType: string; }) => filter.filterType === "LOT_SIZE");
    const notionalFilter = symbolInfo.filters.find((filter: { filterType: string; }) => filter.filterType === "NOTIONAL");
    return {
      minPrice: priceFilter.minPrice,
      maxPrice: priceFilter.maxPrice,
      tickSize: priceFilter.tickSize,
      minQty: lotSizeFilter.minQty,
      maxQty: lotSizeFilter.maxQty,
      stepSize: lotSizeFilter.stepSize,
      minNotional: notionalFilter.minNotional,
      maxNotional: notionalFilter.maxNotional
    };
  } else {
    throw new Error("Trading pair not found in exchange info");
  }
}

// Place buy or sell order based on EMA difference
async function placeTrade(discord: Client, pair: string, lastOrder: order, shortEma: number, longEma: number, rsi: number, macd: { macdLine: number; signalLine: number; histogram: number; }, balance: number[], closePrice: number, tradingPairFilters: { minPrice: any; maxPrice: any; tickSize: any; minQty: any; maxQty: any; stepSize: any; }, candletime: string) {
  const balanceA = await binance.roundStep(balance[0], tradingPairFilters.stepSize);
  const balanceB = await binance.roundStep(balance[1], tradingPairFilters.stepSize);
  const orderBook = await binance.depth(pair.split("/").join(""));

  const direction = tradeDirection(balanceA, balanceB, closePrice, shortEma, longEma, macd, rsi, candletime, lastOrder, options);
  console.log(`Trade direction: ${direction}`);

  if (direction === 'SELL') {
    const orderBookAsks = Object.keys(orderBook.asks).map(price => parseFloat(price)).sort((a, b) => a - b);
    console.log(`\r\nPLACE A SELL TRADE\r\n----------------------------------`);
    let price = orderBookAsks[0] - tradingPairFilters.tickSize;
    const quantity = balanceA * 0.99;
    let maxQuantity = quantity;
    if(options.maxAmount !== 0) {
      maxQuantity = Math.min(quantity, options.maxAmount);
    }
    const stopPrice = price * (1 - (options.riskPercentage / 100));
    const roundedPrice = binance.roundStep(price, tradingPairFilters.tickSize);
    const roundedQuantity = binance.roundStep(maxQuantity, tradingPairFilters.stepSize);
    const roundedStopPrice =  binance.roundStep(stopPrice, tradingPairFilters.tickSize);
    const checkBefore = checkBeforeOrder(roundedQuantity, roundedPrice, roundedStopPrice, tradingPairFilters, candletime);
    console.log(checkBefore);
    if (checkBefore === true) {
      let order: any = false;
      try {
        play(soundFile);
        order = await binance.sell(pair.split("/").join(""), roundedQuantity, roundedPrice, { stopPrice: roundedStopPrice, type: 'STOP_LOSS_LIMIT' });
        const orderMsg = `Placed sell order: ID: ${order.orderId}, Pair: ${pair}, Quantity: ${roundedQuantity}, Price: ${roundedPrice}, Stop Price: ${roundedStopPrice}`;
        sendMessageToChannel(discord, cryptoChannelID, orderMsg);
        console.log(orderMsg);
      } catch (error: any) {
        console.log(error);
        sendMessageToChannel(discord, cryptoChannelID, JSON.stringify(error));
      }
      return order;
    } else {
      return false;
    }
  } else if (direction === 'BUY') {
    console.log(`\r\nPLACE A BUY TRADE\r\n----------------------------------`);
    const orderBookBids = Object.keys(orderBook.asks).map(price => parseFloat(price)).sort((a, b) => a - b);
    let price = orderBookBids[orderBookBids.length - 1] + tradingPairFilters.tickSize; 
    const quantity = (balanceB / price) * 0.99;
    let maxQuantity = quantity;
    if(options.maxAmount !== 0) {
      maxQuantity = Math.min(quantity, options.maxAmount);
    }
    const stopPrice = price * (1 - (options.riskPercentage / 100));
    const roundedPrice = binance.roundStep(price, tradingPairFilters.tickSize);
    const roundedQuantity = binance.roundStep(maxQuantity, tradingPairFilters.stepSize);
    const roundedStopPrice =  binance.roundStep(stopPrice, tradingPairFilters.tickSize);
    if (checkBeforeOrder(roundedQuantity, roundedPrice, roundedStopPrice, tradingPairFilters, candletime) === true) {
      let order: any = false;
      try {
        play(soundFile);
        order = await binance.buy(pair.split("/").join(""), roundedQuantity, roundedPrice, { stopPrice: roundedStopPrice, type: 'STOP_LOSS_LIMIT' });
        const orderMsg = `Placed buy order: ID: ${order.orderId}, Pair: ${pair}, Quantity: ${roundedQuantity}, Price: ${roundedPrice}, Stop Price: ${roundedStopPrice}`;
        sendMessageToChannel(discord, cryptoChannelID, orderMsg);
        console.log(orderMsg);
      } catch (error: any) {
        console.log(error);
        sendMessageToChannel(discord, cryptoChannelID, JSON.stringify(error));
      }
      return order;
    } else {
      return false;
    }
  } else {
    console.log(`NOT TRADING RIGHT NOW.\r\n\r\n`);
    return false;
  }
}

// Rebalancing function (adjust this function based on your rebalancing strategy)
async function rebalance(discord: Client, pair: string, candlesticks: candlestick[]) {
  try {
    console.clear();
    console.log(`\r\n\r\nLATEST CANDLESTICK\r\n----------------------------------`);
    const candleTime = (new Date(candlesticks[candlesticks.length - 1].time)).toLocaleString('fi-FI');
    console.log(`Candlestick time: ${candleTime}`);
    console.log(`Candlesticks count: ${candlesticks.length}`);
    const closePrice = parseFloat(candlesticks[candlesticks.length-1].close);
    console.log(`Last close price: ${closePrice.toFixed(2)}`);
    if (candlesticks.length < options.longEma) {
      console.log(`INSUFFICIENT CANDLESTICK AMOUNT FOR CALCULATIONS, PLEASE WAIT.`);
      return
    }
    // Check for open orders before placing a new one
    const openOrders = await binance.openOrders(false); // Implement a function to get open orders
    if (openOrders.length > 0) {
      console.log(`There are open orders. Waiting for them to complete or cancelling them.`);
      return await handleOpenOrders(discord, binance, openOrders); // Implement a function to handle open orders
    } else {
      console.log(`No open orders.`);
    }

    // Get the current portfolio state and desired allocation'
    const tradingPairFilters = await getTradingPairFilters(pair);
    const balanceA = await getCurrentBalance(binance, pair.split("/")[0]);
    const balanceB = await getCurrentBalance(binance, pair.split("/")[1]);
    const currentBalance = [balanceA, balanceB];
    console.log(`${pair.split("/")[0]}: ${balanceA.toFixed(7)}`);
    console.log(`${pair.split("/")[1]}: ${balanceB.toFixed(7)}`);
    const shortEma = calculateEMA(candlesticks, options.shortEma);
    const longEma = calculateEMA(candlesticks, options.longEma);
    const rsi = calculateRSI(candlesticks, options.rsiLength);
    const macd = calculateMACD(candlesticks, options.shortEma, options.longEma, 9);
    logEMASignals(shortEma, longEma, prev.shortEma, prev.longEma);
    logMACDSignals(macd, prev.macd);
    logRSISignals(rsi);
    const lastOrder = await getLastCompletedOrder(binance, pair);

    console.log(`\r\nCHECK IF ORDER SHOULD BE PLACED ${pair} AT ${candleTime}\r\n----------------------------------`);
    await placeTrade(discord, pair, lastOrder, shortEma, longEma, rsi, macd, currentBalance, closePrice, tradingPairFilters, candleTime);
    prev.macd = macd;
    prev.shortEma = shortEma;
    prev.longEma = longEma;
  } catch (error: any) {
    console.log(`An error occurred during trading: ${JSON.stringify(error)}`);
    console.log(JSON.stringify(error));
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
        listenForCandlesticks(binance, pair, options.candlestickInterval, async (candlesticks: candlestick[]) => {
          await rebalance(discord, pair, candlesticks);
        });
      }
    } else {
      // If options.pair is a single string, listen for candlesticks for that pair only
      listenForCandlesticks(binance, options.pair, options.candlestickInterval, async (candlesticks: candlestick[]) => {
        await rebalance(discord, options.pair as string, candlesticks);
      });
    }
  } catch (error: any) {
    console.log(error);
  }
}

main();

