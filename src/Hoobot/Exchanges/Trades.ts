/* =====================================================================
* Hoobot - Proprietary License
* Copyright (c) 2023 Hoosat Oy. All rights reserved.
*
* Redistribution and use in source and binary forms, with or without
* modification, are not permitted without prior written permission
* from Hoosat Oy. Unauthorized reproduction, copying, or use of this
* software, in whole or in part, is strictly prohibited. All
* modifications in source or binary must be submitted to Hoosat Oy in source format.
*
* THIS SOFTWARE IS PROVIDED BY HOOSAT OY "AS IS" AND ANY EXPRESS OR
* IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
* WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
* ARE DISCLAIMED. IN NO EVENT SHALL HOOSAT OY BE LIABLE FOR ANY DIRECT,
* INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
* (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
* SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
* HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT,
* STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
* ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED
* OF THE POSSIBILITY OF SUCH DAMAGE.
*
* The user of this software uses it at their own risk. Hoosat Oy shall
* not be liable for any losses, damages, or liabilities arising from
* the use of this software.
* ===================================================================== */

import { Client } from "discord.js";
import { ConsoleLogger } from "../Utilities/consoleLogger";
import { ConfigOptions, ExchangeOptions, SymbolOptions, getSecondsFromInterval } from "../Utilities/args";
import { Filter } from "./Filters";
import { handleOpenOrder, Order, checkBeforePlacingOrder } from "./Orders";
import { sendMessageToChannel } from "../../Discord/discord";
import fs, { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { play } from "../Utilities/playSound";
import { Orderbook } from "./Orderbook";
import { Balances, getCurrentBalances } from "./Balances";
import { logToFile } from "../Utilities/logToFile";
import path from "path";
import { Exchange, isBinance, isNonKYC, isXeggex } from "./Exchange";

const soundFile = './alarm.mp3'

export interface Trade {
  symbol: string;
  id: number;
  orderId: number;
  orderListID: number;
  price: string;
  qty: string;
  quoteQty: string;
  commission: string;
  commissionAsset: string;
  time: number;
  isBuyer: boolean;
  isMaker: boolean;
  isBestMatch: boolean;
  profit?: string;
}

export interface TradeHistory {
  [symbol: string]: Trade[];
}

export const calculateROI = (
  tradeHistory: Trade[]
) => {
  if (tradeHistory.length >= 2) {
    let totalBase = 0;
    let totalQuote = 0;
    for (let i = 0; i < tradeHistory.length - 1; i++) {
      const currentTrade = tradeHistory[i];
      if (currentTrade.isBuyer) {
        const nextSellTrade = tradeHistory.slice(i, tradeHistory.length).find((trade) => !trade.isBuyer);
        if (nextSellTrade !== undefined) {
          totalBase += parseFloat(nextSellTrade.qty) - parseFloat(currentTrade.qty);
          totalQuote += parseFloat(nextSellTrade.quoteQty) - parseFloat(currentTrade.quoteQty);
        }
      } else {
        const nextBuyTrade = tradeHistory.slice(i, tradeHistory.length).find((trade) => trade.isBuyer);
        if (nextBuyTrade !== undefined) {
          totalBase += parseFloat(nextBuyTrade.qty) - parseFloat(currentTrade.qty);
          totalQuote += parseFloat(nextBuyTrade.quoteQty) - parseFloat(currentTrade.quoteQty);
        }
      }
    }
    return [ totalBase, totalQuote ];
  } else {
    return [0, 0];
  }
}

export const calculatePercentageDifference = (oldNumber: number, newNumber: number): number => {
  const difference = newNumber - oldNumber;
  const percentageDifference = (difference / Math.abs(oldNumber)) * 100;
  return percentageDifference;
}

export const calculatePNLPercentageForLong = (entryPrice: number, exitPrice: number): number => {
  return ((exitPrice) - (entryPrice)) / (entryPrice) * 100;
}

export const calculatePNLPercentageForShort = (entryPrice: number, exitPrice: number): number => {
  return ((entryPrice) - (exitPrice)) / (entryPrice) * 100;
}

export const calculateUnrealizedPNLPercentageForLong = (entryQty: number, entryPrice: number, highestBidPrice: number): number => {
  return ((highestBidPrice - entryPrice) * entryQty / (entryPrice * entryQty)) * 100;
}

export const calculateUnrealizedPNLPercentageForShort = (entryQty: number, entryPrice: number, lowestAskPrice: number): number => {
  return ((entryPrice - lowestAskPrice) * entryQty / (entryPrice * entryQty)) * 100;
}


export const getTradeHistory = async (
  exchange: Exchange,
  symbol: string,
  processOptions: ConfigOptions
) => {
  let tradeHistory: Trade[] = [];
  if (isBinance(exchange)) {
    tradeHistory = (await exchange.trades(symbol.split("/").join("")));
  } else if(isXeggex(exchange) || isNonKYC(exchange)) {
    const history = await exchange.getAllTrades(symbol, 500, 0);
    history.sort((a: { createdAt: number; }, b: { createdAt: number; }) => a.createdAt - b.createdAt);
    tradeHistory = history.map((trade: { id: string; orderid: string; price: string; quantity: string; fee: any; alternateFeeAsset: any; createdAt: any; side: string; }) => ({
      symbol: symbol.split("/").join(""),
      id: parseFloat(trade.id),
      orderId: parseFloat(trade.orderid),
      orderListID: parseFloat(trade.orderid),
      price: trade.price,
      qty: trade.quantity,
      quoteQty: (parseFloat(trade.quantity) * parseFloat(trade.price)).toString(),
      commission: trade.fee,
      commissionAsset: trade.alternateFeeAsset,
      time: trade.createdAt,
      isBuyer: (trade.side === "buy" ? true : false),
      isMaker: true,
      isBestMatch: true,
    }));
  }
  let compactedTradeHistory: Trade[] = [];
  let currentTrade: Trade | null = null;
  if (processOptions.startTime !== undefined) {
    tradeHistory = tradeHistory.filter((trade) => trade.time > parseFloat(processOptions.startTime as string));
  }
  for (const trade of tradeHistory) {
    if (currentTrade === null) {
      currentTrade = trade;
    } else if (currentTrade.isBuyer === trade.isBuyer) {
      currentTrade.qty = (parseFloat(currentTrade.qty) + parseFloat(trade.qty)).toString();
      currentTrade.price = trade.price;
      if(currentTrade.commissionAsset === trade.commissionAsset) {
        currentTrade.commission = (parseFloat(currentTrade.commission) + parseFloat(trade.commission)).toString();
      }
    } else {
      compactedTradeHistory.push(currentTrade);
      currentTrade = trade;
    }
  }
  if (currentTrade !== null) {
    compactedTradeHistory.push(currentTrade);
  }
  for (let i = 0; i < compactedTradeHistory.length - 1; i++) {
    const currentTrade = compactedTradeHistory[i];
    const nextTrade = compactedTradeHistory[i + 1];
    if (currentTrade.isBuyer === nextTrade.isBuyer) {
      console.log('Trade history is not in the expected order of 1 buy followed by 1 sell.');
    }
  }
  return compactedTradeHistory;
}

export const delay = (
  ms: number
) => {
  return new Promise( resolve => setTimeout(resolve, ms) );
}

export const updateForce = (
  symbol: string
) => {
  const forcePath = "./settings/force.json";
  if(!existsSync(forcePath)) {
    return false;
  }
  const file = readFileSync(forcePath, "utf-8");
  const force = JSON.parse(file !== "" ? file : "{}");
  if(force[symbol.split("/").join("")] === undefined) {
    force[symbol.split("/").join("")] = {
      skip: false,
    }
  } else {
    force[symbol.split("/").join("")].skip = false;
  }
  writeFileSync(forcePath, JSON.stringify(force));
  return true;
}

export const readForceSkip = (
  symbol: string
):boolean => {
  const forcePath = "./settings/force.json";
  if(!existsSync(forcePath)) {
    return false;
  }
  const file = readFileSync(forcePath, "utf-8");
  const force = JSON.parse(file !== "" ? file : "{}");
  if(force[symbol.split("/").join("")] === undefined) {
    return false;
  }
  const skip = force[symbol.split("/").join("")].skip;
  if (skip === undefined) {
    return false;
  }
  return skip;
}

var blocks: string[] = [];

export const isBlocking = async (symbol: string): Promise<boolean> => {
  try {
    symbol = symbol.replace("/", "");
    if(blocks.length > 0) {
      for(const block of blocks) {
        if (block === symbol) {
          logToFile("./logs/blocks.log", "Was blocked.");
          return true;
        }
      }
    }
  } catch (error) {
    logToFile("./logs/error.log", `isBlocking: ${JSON.stringify(error, null, 4)}`);
    console.error(error);
  }
  logToFile("./logs/blocks.log", "Was not blocked.");
  return false;
}

export const createBlock = async (symbol: string) => {
  try {
    blocks = [...blocks, symbol.replace("/", "")];
    logToFile("./logs/blocks.log", JSON.stringify(blocks, null, 4));
  } catch (error) {
    logToFile("./logs/error.log", `createBlock: ${JSON.stringify(error, null, 4)}`);
    console.error(error);
  }
}

export const removeBlock = async (symbol: string) => {
  try {
    symbol = symbol.replace("/", "");
    blocks = blocks.filter((block) => block !== symbol);
    logToFile("./logs/blocks.log", JSON.stringify(blocks, null, 4)); 
  } catch (error) {
    logToFile("./logs/error.log", `removeBlock: ${JSON.stringify(error, null, 4)}`);
    console.error(error);
  }
}

const roundStep = (price: number, size: number): number => {
   const tickSizePrecision = Math.floor(Math.log10(Math.abs(size))) * -1;
   const roundedPrice = Math.round(price / size) * size;
   if (tickSizePrecision > 0 && tickSizePrecision < 100) {
    return Number(roundedPrice.toFixed(tickSizePrecision));
   } else {
    return Number(roundedPrice);
   }
}

const placeSellOrder = async (
  exchange: Exchange,
  symbol: string, 
  quantity: number, 
  price: number
): Promise<Order | undefined> => {
  if (Number.isNaN(price)) {
    return undefined;
  }
  if (Number.isNaN(quantity)) {
    return undefined;
  }
  try {
    if(isBinance(exchange)) {
      logToFile("./logs/trades-binance.log", `${Date.now().toLocaleString("fi-FI")} ${symbol} sell at ${price} price, ${quantity} qty`);
      return await exchange.sell(symbol.split("/").join(""), quantity, price);
    } else if(isXeggex(exchange) || isNonKYC(exchange)) {
      logToFile("./logs/trades-xeggex.log", `${Date.now().toLocaleString("fi-FI")}${symbol} sell at ${price} price, ${quantity} qty`);
      const xeggexOrder = await exchange.newOrder(symbol, "sell", "limit", quantity, price);
      if (xeggexOrder) {
        const order: Order = {
          symbol: symbol.split("/").join(""),
          orderId: parseFloat(xeggexOrder.id),
          price: xeggexOrder.price,
          qty: xeggexOrder.quantity,
          quoteQty: (parseFloat(xeggexOrder.quantity) * parseFloat(xeggexOrder.price)).toString(),
          commission: "",
          commissionAsset: "",
          time: xeggexOrder.createdAt,
          isBuyer: (xeggexOrder.side === "buy" ? true : false),
          isMaker: true,
          isBestMatch: true,
          orderStatus: 'NEW',
          tradeId: parseFloat(xeggexOrder.id),
        }
        return order;
      }
    }
  } catch (error) {
    logToFile("./logs/error.log", JSON.stringify(error, null, 4));
    console.error(error);
  }
  return undefined
}

const placeBuyOrder = async (
  exchange: Exchange,
  symbol: string, 
  quantity: number, 
  price: number
): Promise<Order | undefined>  => {
  if (Number.isNaN(price)) {
    return undefined;
  }
  if (Number.isNaN(quantity)) {
    return undefined;
  }
  try {
    if(isBinance(exchange)) {
      logToFile("./logs/trades-binance.log", `${Date.now().toLocaleString("fi-FI")} ${symbol} by at ${price} price, ${quantity} qty`);
      return await exchange.buy(symbol.split("/").join(""), quantity, price);
    } else if(isXeggex(exchange) || isNonKYC(exchange)) {
      logToFile("./logs/trades-xeggex.log", `${Date.now().toLocaleString("fi-FI")} ${symbol} by at ${price} price, ${quantity} qty`);
      const xeggexOrder = await exchange.newOrder(symbol, "buy", "limit", quantity, price);
      const order = {
        symbol: symbol.split("/").join(""),
        orderId: parseFloat(xeggexOrder.id),
        price: xeggexOrder.price,
        qty: xeggexOrder.quantity,
        quoteQty: (parseFloat(xeggexOrder.quantity) * parseFloat(xeggexOrder.price)).toString(),
        commission: "",
        commissionAsset: "",
        time: xeggexOrder.createdAt,
        isBuyer: (xeggexOrder.side === "buy" ? true : false),
        isMaker: true,
        isBestMatch: true,
        orderStatus: 'NEW',
        tradeId: parseFloat(xeggexOrder.id),
      }
      return order;
    }
  } catch (error) {
    logToFile("./logs/error.log", JSON.stringify(error, null, 4));
  }
  return undefined
}


export const sell = async (
  discord: Client,
  exchange: Exchange,
  consoleLogger: ConsoleLogger,
  symbol: string,
  profit: string,
  orderBook: Orderbook,
  filter: Filter,
  processOptions: ConfigOptions,
  exchangeOptions: ExchangeOptions, 
  symbolOptions: SymbolOptions
): Promise<Order | boolean> => {
  try {
    const baseBalance = exchangeOptions.balances![symbol.split("/")[0]].crypto;
    const orderBookBids = Object.keys(orderBook.bids).map(price => parseFloat(price)).sort((a, b) => b - a);
    let price = orderBookBids[0];
    let maxQuantityInBase = baseBalance * 0.98; 
    maxQuantityInBase = maxSellAmount(maxQuantityInBase, symbolOptions);
    const roundedPrice = roundStep(price, filter.tickSize);
    const roundedQuantityInBase = roundStep(maxQuantityInBase, filter.stepSize);
    const roundedQuantityInQuote = roundStep(roundedQuantityInBase * roundedPrice, filter.stepSize);
    logToFile("./logs/debug.log", `${orderBookBids[0]} ${price} ${filter.tickSize} ${roundedPrice} ${roundedQuantityInBase} ${roundedQuantityInQuote}`);
    if (checkBeforePlacingOrder(roundedQuantityInBase, roundedPrice, filter) === true) {
      let unrealizedPNL = 0;
      if (exchangeOptions.tradeHistory !== undefined && exchangeOptions.tradeHistory[symbol.split("/").join("")]?.length > 0) {
        const lastTrade = exchangeOptions.tradeHistory[symbol.split("/").join("")][exchangeOptions.tradeHistory[symbol.split("/").join("")].length - 1];
        unrealizedPNL = calculateUnrealizedPNLPercentageForLong(parseFloat(lastTrade.qty), parseFloat(lastTrade.price), roundedPrice);
        if (symbolOptions.profit !== undefined && profit !== "STOP_LOSS" && profit !== "TAKE_PROFIT" && symbolOptions.profit?.minimumSell !== 0) { 
          if (symbolOptions.profit.enabled === true && unrealizedPNL < symbolOptions.profit.minimumSell + symbolOptions.tradeFeePercentage! && readForceSkip(symbol.split("/").join("")) === false) {
            consoleLogger.push("error", "Not positive trade");
            return false;
          }
        }
      }
      if(await isBlocking(symbol) === true){
        return false;
      }
      createBlock(symbol);
      let order = await placeSellOrder(exchange, symbol, roundedQuantityInBase, roundedPrice);
      removeBlock(symbol);
      if (order !== undefined) {
        play(soundFile);
        let msg = '```';
        msg += `SELL ID: ${order.orderId}\r\n`;
        msg += `Symbol: ${symbol}\r\n`;
        msg += `Base quantity: ${roundedQuantityInBase}\r\n`;
        msg += `Quote quantity: ${roundedQuantityInQuote}\r\n`;
        msg += `Price: ${roundedPrice}\r\n`;
        msg += `Profit if trade fullfills: ${unrealizedPNL.toFixed(2)}%\r\n`;
        msg += `Time now ${new Date().toLocaleString("fi-fi")}\r\n`;
        msg += '```';
        sendMessageToChannel(discord, processOptions.discord.channelId!, msg);
        if (order.orderId !== 0) {
          await handleOpenOrder(discord, exchange, symbol, order, orderBook, processOptions, symbolOptions);
        }
        updateBuyAmount(roundedQuantityInQuote, symbolOptions);
        if (symbolOptions.takeProfit !== undefined) {
          symbolOptions.takeProfit.current = 0;
        }
        updateForce(symbol);
        exchangeOptions.balances = await getCurrentBalances(exchange);
        if (exchangeOptions.tradeHistory === undefined) {
          exchangeOptions.tradeHistory = {}
        }
        exchangeOptions.tradeHistory[symbol.split("/").join("")] = await getTradeHistory(exchange, symbol, processOptions);
        await delay(getSecondsFromInterval(symbolOptions.timeframes[0]));
        return order;
      } else {
        return false;
      }
    } else {
      consoleLogger.push("error", "Filter limits failed a check. Check your balances!");
      return false;
    }
  } catch (error) { 
    logToFile("./logs/error.log", JSON.stringify(error, null, 4));
    console.error(error);
  }
  return false;
}

const maxBuyAmount = (quoteQuantity: number, symbolOptions: SymbolOptions) => {
  if(symbolOptions.growingMax) {
    if (symbolOptions.growingMax.buy === undefined) {
      return quoteQuantity;
    } else if (symbolOptions.growingMax.buy > 0) {
      return quoteQuantity = Math.min(quoteQuantity, symbolOptions.growingMax.buy);
    } else {
      return quoteQuantity;
    }
  } else {
    return quoteQuantity;
  }
}

const updateBuyAmount = (quoteQuantity: number, symbolOptions: SymbolOptions) => {
  if(symbolOptions.growingMax) {
    if (symbolOptions.growingMax.buy > 0) {
      symbolOptions.growingMax.buy = Math.max(quoteQuantity, symbolOptions.growingMax.buy);
    }
  }
}

const maxSellAmount = (baseQuantity: number, symbolOptions: SymbolOptions) => {
  if(symbolOptions.growingMax) {
    if (symbolOptions.growingMax.sell === undefined) {
      return baseQuantity;
    } else if (symbolOptions.growingMax.sell > 0) {
      return baseQuantity = Math.min(baseQuantity, symbolOptions.growingMax.sell);
    } else {
      return baseQuantity;
    }
  } else {
    return baseQuantity;
  }
}

const updateSellAmount = (baseQuantity: number, symbolOptions: SymbolOptions) => {
  if(symbolOptions.growingMax) {
    if (symbolOptions.growingMax.sell > 0) {
      symbolOptions.growingMax.sell = Math.max(baseQuantity, symbolOptions.growingMax.sell);
    }
  }
}

export const buy = async (
  discord: Client,
  exchange: Exchange,
  consoleLogger: ConsoleLogger,
  symbol: string,
  profit: string,
  orderBook: any,
  filter: Filter,
  processOptions: ConfigOptions,
  exchangeOptions: ExchangeOptions, 
  symbolOptions: SymbolOptions
): Promise<Order | boolean> => {
  try {
    const quoteBalance = exchangeOptions.balances![symbol.split("/")[1]].crypto;
    const orderBookAsks = Object.keys(orderBook.asks).map(price => parseFloat(price)).sort((a, b) => a - b);
    let price = orderBookAsks[0];
    let maxQuantityInQuote = quoteBalance;
    maxQuantityInQuote = maxBuyAmount(maxQuantityInQuote, symbolOptions);
    const quantityInBase = (maxQuantityInQuote / price)  * 0.98;
    const roundedPrice = roundStep(price, filter.tickSize);
    const roundedQuantityInBase = roundStep(quantityInBase, filter.stepSize) - filter.tickSize;
    const roundedQuantityInQuote = roundStep(roundedQuantityInBase * roundedPrice, filter.stepSize);
    logToFile("./logs/debug.log", `${orderBookAsks[0]} ${price} ${filter.tickSize} ${roundedPrice} ${roundedQuantityInBase} ${roundedQuantityInQuote}`);
    if (checkBeforePlacingOrder(roundedQuantityInBase, roundedPrice, filter) === true) {
      let unrealizedPNL = 0;
      if (exchangeOptions.tradeHistory !== undefined && exchangeOptions.tradeHistory[symbol.split("/").join("")]?.length > 0) {
        const lastTrade = exchangeOptions.tradeHistory[symbol.split("/").join("")][exchangeOptions.tradeHistory[symbol.split("/").join("")].length - 1];
        unrealizedPNL = calculateUnrealizedPNLPercentageForShort(parseFloat(lastTrade.qty), parseFloat(lastTrade.price), roundedPrice);
        if (symbolOptions.profit !== undefined && symbolOptions.profit.minimumBuy === 0) {
          symbolOptions.profit.minimumBuy = Number.MIN_SAFE_INTEGER;
        }
        if (symbolOptions.profit !== undefined && profit !== "STOP_LOSS" && profit !== "TAKE_PROFIT" && symbolOptions.profit?.minimumBuy !== 0) {
          if (symbolOptions.profit.enabled === true && unrealizedPNL < symbolOptions.profit.minimumBuy + symbolOptions.tradeFeePercentage! && readForceSkip(symbol.split("/").join("")) === false) {
            consoleLogger.push("error", "Not positive trade")
            return false;
          }
        }
      }
      if(await isBlocking(symbol) === true){
        return false;
      }
      createBlock(symbol);
      let order = await placeBuyOrder(exchange, symbol, roundedQuantityInBase, roundedPrice);
      removeBlock(symbol);
      if(order !== undefined) {
        play(soundFile);
        let msg = '```';
        msg += `BUY ID: ${order.orderId}\r\n`;
        msg += `Symbol: ${symbol}\r\n`;
        msg += `Base quantity: ${roundedQuantityInBase}\r\n`;
        msg += `Quote quantity: ${roundedQuantityInQuote}\r\n`;
        msg += `Price: ${roundedPrice}\r\n`;
        msg += `Profit if trade fullfills: ${unrealizedPNL.toFixed(2)}%\r\n`;
        msg += `Time now ${new Date().toLocaleString("fi-fi")}\r\n`;
        msg += '```';
        sendMessageToChannel(discord, processOptions.discord.channelId!, msg);
        if (order.orderId !== 0) {
          await handleOpenOrder(discord, exchange, symbol, order, orderBook, processOptions, symbolOptions);
        }
        updateSellAmount(roundedQuantityInBase, symbolOptions);
        if (symbolOptions.takeProfit !== undefined) {
          symbolOptions.takeProfit.current = 0;
        }
        updateForce(symbol);
        exchangeOptions.balances = await getCurrentBalances(exchange);
        if (exchangeOptions.tradeHistory === undefined) {
          exchangeOptions.tradeHistory = {};
        }
        exchangeOptions.tradeHistory[symbol.split("/").join("")] = await getTradeHistory(exchange, symbol, processOptions);
        await delay(getSecondsFromInterval(symbolOptions.timeframes[0]));
        return order;
      } else {
        return false;
      }
    } else {
      consoleLogger.push("error", "Filter limits failed a check. Check your balances!");
      return false;
    }
  } catch (error) {
    logToFile("./logs/error.log", JSON.stringify(error, null, 4));
    console.error(error);
  }
  return false
}

export const checkPreviousTrade = (
  symbol: string,
  exchangeOptions: ExchangeOptions
) => {
  let check = 'SELL';
  if (exchangeOptions.tradeHistory !== undefined && exchangeOptions.tradeHistory[symbol.split("/").join("")].length > 0) {
    const lastTrade = exchangeOptions.tradeHistory[symbol.split("/").join("")][exchangeOptions.tradeHistory[symbol.split("/").join("")].length - 1];
    if (lastTrade.isBuyer) {
      check = 'BUY';
    } else {
      check = 'SELL';
    }
  }
  return check;
}

export const simulateSell = async (
  symbol: string,
  quantity: number,
  price: number,
  balances: Balances,
  profit: string,
  options: ConfigOptions,
  exchangeOptions: ExchangeOptions,
  symbolOptions: SymbolOptions,
  time: number,
  filter: Filter,
  logger: ConsoleLogger
) => {
  // console.log(time);
  if(price === null || quantity === 0) {
    return false;
  }
  let baseQuantity = quantity;
  let quoteQuantity = quantity * price;
  if(checkBeforePlacingOrder(baseQuantity, price, filter) === true) { 
    let fee = quoteQuantity * (0.075 / 100); 
    let quoteQuontityWithoutFee = quoteQuantity - fee; 
    let lastTrade: Trade = {
      symbol: "",
      id: 0,
      orderId: 0,
      orderListID: 0,
      price: "",
      qty: "",
      quoteQty: "",
      commission: "",
      commissionAsset: "",
      time: 0,
      isBuyer: true,
      isMaker: true,
      isBestMatch: true,
    }
    let pnl = 0;
    if (exchangeOptions.tradeHistory !== undefined && exchangeOptions.tradeHistory[symbol.split("/").join("")].length > 0) {
      lastTrade = exchangeOptions.tradeHistory[symbol.split("/").join("")][exchangeOptions.tradeHistory[symbol.split("/").join("")].length - 1];
      pnl = calculatePNLPercentageForLong(parseFloat(lastTrade.price), price);
    }
    if(exchangeOptions.tradeHistory === undefined) {
      exchangeOptions.tradeHistory = {}
    }
    if (symbolOptions.profit !== undefined && profit !== "STOP_LOSS" && profit !== "TAKE_PROFIT" && symbolOptions.profit?.minimumSell !== 0) {
      if (symbolOptions.profit.enabled === true && pnl < symbolOptions.profit.minimumSell + symbolOptions.tradeFeePercentage! && readForceSkip(symbol.split("/").join("")) === false) {
        return false;
      }
    }
    exchangeOptions.tradeHistory[symbol.split("/").join("")].push({
      symbol: symbol.split("/").join(""),
      id: 0,
      orderId: 0,
      orderListID: pnl,
      price: price.toString(),
      qty: (baseQuantity).toString(),
      quoteQty: quoteQuontityWithoutFee.toString(),
      commission: fee.toString(),
      commissionAsset: symbol.split("/")[1],
      time: time,
      isBuyer: false,
      isMaker: true,
      isBestMatch: true,
      profit: profit
    });
    const baseCoin = symbol.split("/")[0];
    const quoteCoin = symbol.split("/")[1];
    balances[baseCoin].crypto = balances[baseCoin].crypto - baseQuantity;
    balances[quoteCoin].crypto = balances[quoteCoin].crypto + quoteQuontityWithoutFee;
    const sanitizedStartTime = options.startTime.replace(/:/g, '-');
    const filePath = `./simulation/${sanitizedStartTime}/trades.json`;
    const directory = path.dirname(filePath);
    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true });
    }
    if (symbolOptions.takeProfit !== undefined) {
      symbolOptions.takeProfit.current = 0;
    }
    updateBuyAmount(quoteQuantity, symbolOptions)
    writeFileSync(filePath, JSON.stringify({
      symbol: symbol,
      direction: 'SELL',
      quantity: baseQuantity,
      price: price,
      balances: balances,
      tradeHistory: exchangeOptions.tradeHistory,
    }, null, 2));
    // logger.flush();
    // logger.push("Time", (new Date(time)).toLocaleString());
    logger.push("trade", "sell");
    logger.push("PNL", pnl);
    // logger.push("Balances", balances);
    // logger.print();
    // logger.flush();
  }
  return true;
}

export const simulateBuy = async (
  symbol: string,
  quantity: number,
  price: number,
  balances: Balances,
  profit: string,
  options: ConfigOptions,
  exchangeOptions: ExchangeOptions,
  symbolOptions: SymbolOptions,
  time: number,
  filter: Filter,
  logger: ConsoleLogger
): Promise<Boolean> => {
  // console.log(time);
  if(price === null || quantity === 0) {
    return false;
  }
  let quoteQuantity = quantity;
  quoteQuantity = maxBuyAmount(quoteQuantity, symbolOptions);
  let baseQuantity = quoteQuantity / price;
  if(checkBeforePlacingOrder(baseQuantity, price, filter) === true) {
    let fee = baseQuantity * (0.075 / 100); 
    let baseQuantityWithoutFee = baseQuantity - fee; 
    let lastTrade: Trade = {
      symbol: "",
      id: 0,
      orderId: 0,
      orderListID: 0,
      price: "",
      qty: "",
      quoteQty: "",
      commission: "",
      commissionAsset: "",
      time: 0,
      isBuyer: true,
      isMaker: true,
      isBestMatch: true,
    }
    let pnl = 0;
    if (options.tradeHistory !== undefined && exchangeOptions.tradeHistory[symbol.split("/").join("")].length >= 2) {
      lastTrade = exchangeOptions.tradeHistory[symbol.split("/").join("")][exchangeOptions.tradeHistory[symbol.split("/").join("")].length - 1];
      pnl = calculatePNLPercentageForShort(parseFloat(lastTrade.price), price);
    }
    if(options.tradeHistory === undefined) {
      options.tradeHistory = {}
    }
    if (symbolOptions.profit !== undefined && profit !== "STOP_LOSS" && profit !== "TAKE_PROFIT" && symbolOptions.profit?.minimumBuy !== 0) {
      if (symbolOptions.profit.enabled === true && pnl < symbolOptions.profit.minimumBuy + symbolOptions.tradeFeePercentage! && readForceSkip(symbol.split("/").join("")) === false) {
        return false;
      }
    }
    exchangeOptions.tradeHistory[symbol.split("/").join("")].push({
      symbol: symbol.split("/").join(""),
      id: 0,
      orderId: 0,
      orderListID: pnl,
      price: price.toString(),
      qty: baseQuantityWithoutFee.toString(),
      quoteQty:  quoteQuantity.toString(),
      commission: fee.toString(),
      commissionAsset: symbol.split("/")[0],
      time: time,
      isBuyer: true,
      isMaker: true,
      isBestMatch: true,
      profit: profit
    });
    const baseCoin = symbol.split("/")[0];
    const quoteCoin = symbol.split("/")[1];
    balances[baseCoin].crypto = balances[baseCoin].crypto + baseQuantity;
    balances[quoteCoin].crypto = balances[quoteCoin].crypto - quoteQuantity;
    const sanitizedStartTime = options.startTime.replace(/:/g, '-');
    const filePath = `./simulation/${sanitizedStartTime}/trades.json`;
    const directory = path.dirname(filePath);
    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true });
    }
    if (symbolOptions.takeProfit !== undefined) {
      symbolOptions.takeProfit.current = 0;
    }
    writeFileSync(filePath, JSON.stringify({
      symbol: symbol,
      direction: 'SELL',
      quantity: baseQuantity,
      price: price,
      balances: balances,
      tradeHistory: options.tradeHistory
    }, null, 2));
    // logger.flush();
    // logger.push("Time", (new Date(time)).toLocaleString());
    logger.push("Trade", "buy");
    logger.push("PNL", pnl);
    // logger.push("Balances", balances);
    // logger.print();
    // logger.flush();
  }
  return true;
}