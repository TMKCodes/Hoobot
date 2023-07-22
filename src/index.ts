import fs from 'fs';
import dotenv from 'dotenv';
import Binance from 'node-binance-api';
import { loginDiscord } from './discord/discord';
import { candlestick, listenForCandlesticks } from './binance/candlesticks';
import { calculateEMA, logEMASignals } from './binance/ema';
import { calculateMACD, logMACDSignals } from './binance/macd';
import { calculateRSI, logRSISignals } from './binance/rsi';
import { ConfigOptions, parseArgs } from './binance/args';
import { getCurrentBalance } from './binance/balances';
import { logToFile } from './binance/logToFile';
import { getLastCompletedOrder, handleOpenOrders, order } from './binance/orders';


interface previous {
  macd: any;
  emaA: any;
  emaB: any;
}

const prev: previous = {
  macd: undefined,
  emaA: undefined,
  emaB: undefined,
}

let lastEmaCrossover: string | undefined = undefined;

dotenv.config();

// Get configuration options from command-line arguments
const args = process.argv.slice(2);
const options = parseArgs(args) as ConfigOptions;

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
  const symbolInfo = exchangeInfo.symbols.find((symbol: { symbol: string; }) => symbol.symbol === pair);
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
async function placeTrade(lastOrder: order, emaA: number, emaB: number, rsi: number, macd: { macdLine: number; signalLine: number; histogram: number; }, balance: number[], closePrice: string, tradingPairFilters: { minPrice: any; maxPrice: any; tickSize: any; minQty: any; maxQty: any; stepSize: any; }, candletime: string) {
  const balanceA = await binance.roundStep(balance[0], tradingPairFilters.stepSize);
  const balanceB = await binance.roundStep(balance[1], tradingPairFilters.stepSize);
  let lastOrderCheck: string = `UNKNOWN`;
  let balanceCheck: string = `UNKNOWN`;
  let emaCheck: string = `UNKNOWN`;
  let macdCheck: string = `UNKNOWN`;
  let rsiCheck: string = `NEUTRAL`;
  if(lastOrder !== undefined) {
    lastOrderCheck = lastOrder.isBuyer ? 'BUY' : 'SELL'; 
  }
  console.log(`LAST ORDER is ${lastOrderCheck}`);

  if (balanceA > tradingPairFilters.stepSize && balanceB < tradingPairFilters.stepSize) {
    balanceCheck = `SELL`;
  } else if (balanceA < tradingPairFilters.stepSize && balanceB > tradingPairFilters.stepSize) {
    balanceCheck = `BUY`
  } else {
    return console.log(`No balance to trade.\r\n----------------------------------`);
  }
  console.log(`BALANCE is ${balanceCheck}`);

  if (prev.emaA !== undefined && prev.emaB !== undefined) {
    if(emaA > emaB && prev.emaA < prev.emaB) {
      emaCheck = `BUY`;
      lastEmaCrossover = "Changed to buy";
    } else if(emaA < emaB && prev.emaA > prev.emaB) {
      emaCheck = `SELL`;
      lastEmaCrossover = "Changed to sell";
    }
  } else if (lastEmaCrossover !== undefined) {
    if(lastEmaCrossover === "Changed to buy" && emaA > emaB ) {
      emaCheck = `BUY`;
    } else if(lastEmaCrossover === "Changed to sell" && emaA < emaB ) {
      emaCheck = `SELL`;
    }
  }
  if (emaCheck === `UNKNOWN`) {
    if (emaA > emaB) {
      emaCheck = `BUY`;
    } else if (emaA < emaB){
      emaCheck = `SELL`;
    }
  }
  console.log(`EMA is ${emaCheck}`);

  if (macd.macdLine > macd.signalLine && macd.histogram > 0) {
    macdCheck = `BUY`
  } else if (macd.macdLine < macd.signalLine && macd.histogram < 0) {
    macdCheck = `SELL`;
  }
  console.log(`MACD is ${macdCheck}`);

  if(rsi < options.oversoldTreshold) {
    rsiCheck = `BUY`;
  } else if(rsi > options.overboughtTreshold) {
    rsiCheck = `SELL`;
  }
  console.log(`RSI is ${rsiCheck}`);

  if((lastOrderCheck === "BUY" || lastOrderCheck === "UNKNOWN") && balanceCheck === `SELL` && emaCheck === `SELL` && macdCheck === `SELL` && rsiCheck === `SELL`) {
    console.log(`\r\nPLACE A SELL TRADE\r\n----------------------------------`);
    let price = parseFloat(closePrice);
    const quantity = balanceA * price;
    const maxQuantity = Math.min(quantity, options.maxAmount);
    const stopPrice = price * (1 - (options.riskPercentage / 100));
    const roundedPrice = binance.roundStep(price, tradingPairFilters.tickSize);
    const roundedQuantity = binance.roundStep(maxQuantity, tradingPairFilters.stepSize);
    const roundedStopPrice =  binance.roundStep(stopPrice, tradingPairFilters.tickSize);
    if (checkBeforeOrder(roundedQuantity, roundedPrice, roundedStopPrice, tradingPairFilters, candletime) === true) {
      logToFile(`Placing order: binance.sell(${options.pair.split("/").join("")}, ${roundedQuantity}, ${roundedPrice}, { stopPrice: ${roundedStopPrice}, type: 'STOP_LOSS_LIMIT' })`);
      const order = await binance.sell(options.pair.split("/").join(""), roundedQuantity, roundedPrice, { stopPrice: roundedStopPrice, type: 'STOP_LOSS_LIMIT' });
      return order;
    } else {
      return false;
    }
  } else if((lastOrderCheck === "SELL" || lastOrderCheck === "UNKNOWN") && balanceCheck === `BUY` && emaCheck === `BUY` && macdCheck === `BUY` && rsiCheck === `BUY`) {
    console.log(`\r\nPLACE A BUY TRADE\r\n----------------------------------`);
    let price = parseFloat(closePrice); 
    const quantity = balanceB;
    const maxQuantity = Math.min(quantity, options.maxAmount);
    const stopPrice = price * (1 - (options.riskPercentage / 100));
    const roundedPrice = binance.roundStep(price, tradingPairFilters.tickSize);
    const roundedQuantity = binance.roundStep(maxQuantity, tradingPairFilters.stepSize);
    const roundedStopPrice =  binance.roundStep(stopPrice, tradingPairFilters.tickSize);
    if (checkBeforeOrder(roundedQuantity, roundedPrice, roundedStopPrice, tradingPairFilters, candletime) === true) {
      logToFile(`Placing order: binance.buy(${options.pair.split("/").join("")}, ${roundedQuantity}, ${roundedPrice}, { stopPrice: ${roundedStopPrice}, type: 'STOP_LOSS_LIMIT' })`);
      const order = await binance.buy(options.pair.split("/").join(""), roundedQuantity, roundedPrice, { stopPrice: roundedStopPrice, type: 'STOP_LOSS_LIMIT' });
      return order;
    } else {
      return false;
    }
  } else {
    console.log(`NOT TRADING RIGHT NOW.\r\n----------------------------------`);
    return false;
  }
}

const checkBeforeOrder = (quantity: number, price: number, stopPrice: number, tradingPairFilters: any, candleTime: string) => {
  if(parseFloat(tradingPairFilters.minPrice) > stopPrice) {
    logToFile(`PLACING ORDER WAS FAILURE AT: ${candleTime}, Limit price price too low. `);
    return false;
  }
  if(parseFloat(tradingPairFilters.maxPrice) < stopPrice) {
    logToFile(`PLACING ORDER WAS FAILURE AT: ${candleTime}, Limit price price too high.`);
    return false;
  }
  if(parseFloat(tradingPairFilters.minPrice) > price) {
    logToFile(`PLACING ORDER WAS FAILURE AT: ${candleTime}, Stop price too low.`);
    return false;
  }
  if(parseFloat(tradingPairFilters.maxPrice) < price) {
    logToFile(`PLACING ORDER WAS FAILURE AT: ${candleTime}, Stop price too high.`);
    return false;
  }
  if(parseFloat(tradingPairFilters.minQty) > quantity) {
    logToFile(`PLACING ORDER WAS FAILURE AT: ${candleTime}, Amount too low.`);
    return false;
  }
  if(parseFloat(tradingPairFilters.maxQty) < quantity) {
    logToFile(`PLACING ORDER WAS FAILURE AT: ${candleTime}, Amount too high.`);
    return false;
  }

  // Check if the notional value meets the minimum requirement
  if (tradingPairFilters.minNotional && quantity < parseFloat(tradingPairFilters.minNotional)) {
    logToFile(`PLACING ORDER WAS FAILURE AT: ${candleTime}, Amount in ${options.pair.split("/")[1]} is below the minimum requirement: ${quantity} < ${tradingPairFilters.minNotional}`);
    return false;
  }
  if (tradingPairFilters.maxNotional && quantity > parseFloat(tradingPairFilters.maxNotional)) {
    logToFile(`PLACING ORDER WAS FAILURE AT: ${candleTime}, Amount is ${options.pair.split("/")[1]} above the maximum requirement: ${quantity} < ${tradingPairFilters.maxNotional}`);
    return false;
  }
  return true;
}

// Rebalancing function (adjust this function based on your rebalancing strategy)
async function rebalance(candlesticks: candlestick[]) {
  try {
    console.clear();
    console.log(`\r\n\r\nLATEST CANDLESTICK\r\n----------------------------------`);
    const candleTime = (new Date(candlesticks[candlesticks.length - 1].time)).toLocaleString('fi-FI');
    console.log(`Candlestick time: ${candleTime}`);
    console.log(`Candlesticks count: ${candlesticks.length}`);
    const closePrice = candlesticks[candlesticks.length-1].close;
    console.log(`Last close price: ${closePrice}`);
    if (candlesticks.length < options.emaB) {
      console.log(`INSUFFICIENT CANDLESTICK AMOUNT FOR CALCULATIONS, PLEASE WAIT.`);
      return
    }
    // Check for open orders before placing a new one
    const openOrders = await binance.openOrders(false); // Implement a function to get open orders
    if (openOrders.length > 0) {
      console.log(`There are open orders. Waiting for them to complete or cancelling them.`);
      return await handleOpenOrders(binance, openOrders); // Implement a function to handle open orders
    } else {
      console.log(`No open orders.`);
    }

    // Get the current portfolio state and desired allocation'
    const tradingPairFilters = await getTradingPairFilters(options.pair.split("/").join(""));
    const { balances } = await getCurrentBalance(binance, options);
    const currentBalance = balances;
    const emaA = calculateEMA(candlesticks, options.emaA);
    const emaB = calculateEMA(candlesticks, options.emaB);
    const rsi = calculateRSI(candlesticks);
    const macd = calculateMACD(candlesticks, emaA, emaB, 9);
    logEMASignals(emaA, emaB, prev.emaA, prev.emaB);
    logMACDSignals(macd, prev.macd);
    logRSISignals(rsi);

    const lastOrder = await getLastCompletedOrder(binance, options.pair.split("/").join(""));

    console.log(JSON.stringify(lastOrder));
    
    // Your rebalancing strategy here...
    // Example: If the portfolio is out of balance, call the placeTrade function
    // (This is a simplified example and you should adjust it based on your strategy)

    console.log(`\r\nCHECK IF ORDER SHOULD BE PLACED AT ${candleTime}\r\n----------------------------------`);
    await placeTrade(lastOrder, emaA, emaB, rsi, macd, currentBalance, closePrice, tradingPairFilters, candleTime);
    prev.macd = macd;
    prev.emaA = emaA;
    prev.emaB = emaB;
  } catch (error: any) {
    console.log(`An error occurred during trading: ${JSON.stringify(error)}`);
    console.log(JSON.stringify(error));
  }
}

loginDiscord(binance, options);

// Run the trading function
listenForCandlesticks(binance, options.pair, options.candlestickInterval, (candlesticks: candlestick[]) => {
  rebalance(candlesticks);
});
