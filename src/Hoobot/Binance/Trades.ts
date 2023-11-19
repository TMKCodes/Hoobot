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
import Binance from "node-binance-api";
import { ConsoleLogger } from "../Utilities/consoleLogger";
import { ConfigOptions } from "../Utilities/args";
import { Filter } from "./Filters";
import { handleOpenOrder, openOrders, Order, checkBeforePlacingOrder } from "./Orders";
import { sendMessageToChannel } from "../../Discord/discord";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { play } from "../Utilities/playSound";
import { Orderbook } from "./Orderbook";
import { Balances, getCurrentBalances } from "./Balances";
import { logToFile } from "../Utilities/logToFile";
import path from "path";

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
        totalBase += parseFloat(nextSellTrade.qty) - parseFloat(currentTrade.qty);
        totalQuote += parseFloat(nextSellTrade.quoteQty) - parseFloat(currentTrade.quoteQty)
      } else {
        const nextBuyTrade = tradeHistory.slice(i, tradeHistory.length).find((trade) => trade.isBuyer);
        totalBase += parseFloat(nextBuyTrade.qty) - parseFloat(currentTrade.qty);
        totalQuote += parseFloat(nextBuyTrade.quoteQty) - parseFloat(currentTrade.quoteQty)
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

export const calculatePNLPercentageForLong = (entryQty: number, entryPrice: number, exitPrice: number): number => {
  return ((exitPrice) - (entryPrice)) / (entryPrice) * 100;
}

export const calculatePNLPercentageForShort = (entryQty: number, entryPrice: number, exitPrice: number): number => {
  return ((entryPrice) - (exitPrice)) / (entryPrice) * 100;
}

export const calculateUnrealizedPNLPercentageForLong = (entryQty: number, entryPrice: number, highestBidPrice: number): number => {
  return ((highestBidPrice - entryPrice) * entryQty / (entryPrice * entryQty)) * 100;
}

export const calculateUnrealizedPNLPercentageForShort = (entryQty: number, entryPrice: number, lowestAskPrice: number): number => {
  return ((entryPrice - lowestAskPrice) * entryQty / (entryPrice * entryQty)) * 100;
}


export const getTradeHistory = async (
  binance: Binance,
  symbol: string,
  options: ConfigOptions
) => {
  let tradeHistory: Trade[] = (await binance.trades(symbol.split("/").join("")));
  let compactedTradeHistory: Trade[] = [];
  let currentTrade: Trade | null = null;
  if (options.startTimestamp !== undefined) {
    tradeHistory = tradeHistory.filter((trade) => trade.time > parseFloat(options.startTimestamp));
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
  const forcePath = "force.json";
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
}

export const readForce = (
  symbol: string
) => {
  const forcePath = "force.json";
  if(!existsSync(forcePath)) {
    return false;
  }
  const file = readFileSync(forcePath, "utf-8");
  const force = JSON.parse(file !== "" ? file : "{}");
  return force[symbol.split("/").join("")];
}

export const sell = async (
  discord: Client,
  binance: Binance,
  consoleLogger: ConsoleLogger,
  symbol: string,
  orderBook: Orderbook,
  filter: Filter,
  options: ConfigOptions,
): Promise<Order | boolean> => {
  try {
    const baseBalance = options.balances[symbol.split("/")[0]];
    const orders = await openOrders(binance, symbol);
    if (orders !== false && Array.isArray(orders)) {
      // for(let i = 0; i < orders.length; i++) {
      //   await handleOpenOrder(discord, binance, symbol, orders[i], orderBook, options);
      // }
      return false;
    }
    const orderBookAsks = Object.keys(orderBook.asks).map(price => parseFloat(price)).sort((a, b) => a - b);
    let price = orderBookAsks[0] - parseFloat(filter.tickSize);
    let maxQuantityInBase = baseBalance;
    const roundedPrice = binance.roundStep(price, filter.tickSize);
    const roundedQuantityInBase = binance.roundStep(maxQuantityInBase, filter.stepSize);
    const roundedQuantityInQuote = binance.roundStep(roundedQuantityInBase * roundedPrice, filter.stepSize);
    if (checkBeforePlacingOrder(roundedQuantityInBase, roundedPrice, filter) === true) {
      let unrealizedPNL = 0;
      if (options.tradeHistory[symbol.split("/").join("")]?.length > 0) {
        const lastTrade = options.tradeHistory[symbol.split("/").join("")][options.tradeHistory[symbol.split("/").join("")].length - 1];
        unrealizedPNL = calculateUnrealizedPNLPercentageForLong(parseFloat(lastTrade.qty), parseFloat(lastTrade.price), roundedPrice);
        if (options.holdUntilPositiveTrade === true && unrealizedPNL < options.minimumProfitSell + options.tradeFee && readForce(symbol.split("/").join("")) === false) {
          return false;
        }
      }
      let order: Order = undefined;
      order = await binance.sell(symbol.split("/").join(""), roundedQuantityInBase, roundedPrice);
      logToFile(JSON.stringify(order, null, 4));
      const orderMsg = `>>> **SELL** ID: **${order.orderId}**\nSymbol: **${symbol}**\nBase quantity: **${roundedQuantityInBase}**\nQuote quantity: **${roundedQuantityInQuote}**\nPrice: **${roundedPrice}**\nProfit if trade fullfills: **${unrealizedPNL.toFixed(2)}%**\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
      sendMessageToChannel(discord, options.discordChannelID, orderMsg);
      logToFile(orderMsg);
      await handleOpenOrder(discord, binance, symbol, order, orderBook, options);
      updateBuyAmount(symbol, roundedQuantityInBase * roundedPrice, options);
      play(soundFile);
      options.profitCurrentMax[symbol.split("/").join("")] = 0;
      updateForce(symbol);
      options.balances = await getCurrentBalances(binance);
      options.tradeHistory[symbol.split("/").join("")] = await getTradeHistory(binance, symbol, options);
      return order;
    } else {
      consoleLogger.push("error", "Filter limits failed a check. Check your balances!");
      return false;
    }
  } catch (error) {
    logToFile(JSON.stringify(error));
    console.log(error);
  }
}

const maxBuyAmount = (symbol: string, quoteQuantity: number, options: ConfigOptions) => {
  if (options.startingMaxBuyAmount[symbol.split("/").join("")] > 0) {
    return quoteQuantity = Math.min(quoteQuantity, options.startingMaxBuyAmount[symbol.split("/").join("")]);
  } else {
    return quoteQuantity;
  }
}

const updateBuyAmount = (symbol: string, quoteQuantity, options: ConfigOptions) => {
  if (options.startingMaxBuyAmount[symbol.split("/").join("")] > 0) {
    options.startingMaxBuyAmount[symbol.split("/").join("")] = Math.max(quoteQuantity, options.startingMaxBuyAmount[symbol.split("/").join("")]);
  }
}

export const buy = async (
  discord: Client,
  binance: Binance,
  consoleLogger: ConsoleLogger,
  symbol: string,
  orderBook: any,
  filter: Filter,
  options: ConfigOptions,
): Promise<Order | boolean> => {
  try {
    const quoteBalance = options.balances[symbol.split("/")[1]];
    const orders = await openOrders(binance, symbol);
    if (orders !== false && Array.isArray(orders)) {
      // for(let i = 0; i < orders.length; i++) {
      //   await handleOpenOrder(discord, binance, symbol, orders[i], orderBook, options);
      // }
      return false;
    }
    const orderBookBids = Object.keys(orderBook.bids).map(price => parseFloat(price)).sort((a, b) => b - a);
    let price = orderBookBids[0] + parseFloat(filter.tickSize);
    let maxQuantityuInQuote = quoteBalance;
    maxQuantityuInQuote = maxBuyAmount(symbol, maxQuantityuInQuote, options);
    const quantityInBase = (maxQuantityuInQuote / price);
    const roundedPrice = binance.roundStep(price, filter.tickSize);
    const roundedQuantityInBase = binance.roundStep(quantityInBase, filter.stepSize);
    const roundedQuantityInQuote = binance.roundStep(roundedQuantityInBase * roundedPrice, filter.stepSize);
    if (checkBeforePlacingOrder(roundedQuantityInBase, roundedPrice, filter) === true) {
      let unrealizedPNL = 0;
      if (options.tradeHistory[symbol.split("/").join("")]?.length > 0) {
        const lastTrade = options.tradeHistory[symbol.split("/").join("")][options.tradeHistory[symbol.split("/").join("")].length - 1];
        unrealizedPNL = calculateUnrealizedPNLPercentageForShort(parseFloat(lastTrade.qty), parseFloat(lastTrade.price), roundedPrice);
        if (options.holdUntilPositiveTrade === true && unrealizedPNL < options.minimumProfitBuy + options.tradeFee && readForce(symbol.split("/").join("")) === false) {
          return false;
        }
      }
      let order: Order = undefined;
      order = await binance.buy(symbol.split("/").join(""), roundedQuantityInBase, roundedPrice);
      logToFile(JSON.stringify(order, null, 4));
      const orderMsg = `>>> **BUY** ID: **${order.orderId}**\nSymbol: **${symbol}**\nBase quantity: **${roundedQuantityInBase}**\nQuote quantity: **${roundedQuantityInQuote}**\nPrice: **${roundedPrice}**\nProfit if trade fullfills: **${unrealizedPNL.toFixed(2)}%**\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
      sendMessageToChannel(discord, options.discordChannelID, orderMsg);
      logToFile(orderMsg);
      await handleOpenOrder(discord, binance, symbol, order, orderBook, options);
      play(soundFile);
      options.profitCurrentMax[symbol.split("/").join("")] = 0;
      updateForce(symbol);
      options.balances = await getCurrentBalances(binance);
      options.tradeHistory[symbol.split("/").join("")] = await getTradeHistory(binance, symbol, options);
      return order;
    } else {
      consoleLogger.push("error", "Filter limits failed a check. Check your balances!");
      return false;
    }
  } catch (error) {
    logToFile(JSON.stringify(error, null, 2));
  }
}

export const checkPreviousTrade = (
  symbol: string,
  options: ConfigOptions
) => {
  let check = 'SELL';
  if (options.tradeHistory[symbol.split("/").join("")].length > 0) {
    const lastTrade = options.tradeHistory[symbol.split("/").join("")][options.tradeHistory[symbol.split("/").join("")].length - 1];
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
  options: ConfigOptions,
  time: number,
  filter: Filter,
  logger: ConsoleLogger
) => {
  if(price === null || quantity === 0) {
    return;
  }
  let baseQuantity = quantity;
  let quoteQuantity = quantity * price;
  if(checkBeforePlacingOrder(baseQuantity, price, filter) === true) { 
    let fee = quoteQuantity * (0.075 / 100); 
    let quoteQuontityWithoutFee = quoteQuantity - fee; 
    options.tradeHistory[symbol.split("/").join("")].push({
      symbol: symbol.split("/").join(""),
      id: 0,
      orderId: 0,
      orderListID: 0,
      price: price.toString(),
      qty: (baseQuantity).toString(),
      quoteQty: quoteQuontityWithoutFee.toString(),
      commission: fee.toString(),
      commissionAsset: symbol.split("/")[1],
      time: time,
      isBuyer: false,
      isMaker: true,
      isBestMatch: true,
    });
    const baseCoin = symbol.split("/")[0];
    const quoteCoin = symbol.split("/")[1];
    balances[baseCoin] = balances[baseCoin] - baseQuantity;
    balances[quoteCoin] = balances[quoteCoin] + quoteQuontityWithoutFee;
    const filePath = `./simulation/${options.startTime}/trades.json`;
    const directory = path.dirname(filePath);
    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true });
    }
    options.profitCurrentMax[symbol.split("/").join("")] = 0;
    updateBuyAmount(symbol, quoteQuantity, options)
    writeFileSync(filePath, JSON.stringify({
      symbol: symbol,
      direction: 'SELL',
      quantity: baseQuantity,
      price: price,
      balances: balances,
      tradeHistory: options.tradeHistory
    }, null, 2));
    logger.flush();
    logger.push("time", (new Date(time)).toLocaleString());
    logger.push("Balances", balances);
    logger.print();
    logger.flush();
  }
}

export const simulateBuy = async (
  symbol: string,
  quantity: number,
  price: number,
  balances: Balances,
  options: ConfigOptions,
  time: number,
  filter: Filter,
  logger: ConsoleLogger
) => {
  if(price === null || quantity === 0) {
    return;
  }
  let quoteQuantity = quantity;
  quoteQuantity = maxBuyAmount(symbol, quoteQuantity, options);
  let baseQuantity = quoteQuantity / price;
  if(checkBeforePlacingOrder(baseQuantity, price, filter) === true) {
    let fee = baseQuantity * (0.075 / 100); 
    let baseQuantityWithoutFee = baseQuantity - fee; 
    options.tradeHistory[symbol.split("/").join("")].push({
      symbol: symbol.split("/").join(""),
      id: 0,
      orderId: 0,
      orderListID: 0,
      price: price.toString(),
      qty: baseQuantityWithoutFee.toString(),
      quoteQty:  quoteQuantity.toString(),
      commission: fee.toString(),
      commissionAsset: symbol.split("/")[0],
      time: time,
      isBuyer: true,
      isMaker: true,
      isBestMatch: true,
    });
    const baseCoin = symbol.split("/")[0];
    const quoteCoin = symbol.split("/")[1];
    balances[baseCoin] = balances[baseCoin] + baseQuantity;
    balances[quoteCoin] = balances[quoteCoin] - quoteQuantity;
    const filePath = `./simulation/${options.startTime}/trades.json`;
    const directory = path.dirname(filePath);
    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true });
    }
    options.profitCurrentMax[symbol.split("/").join("")] = 0;
    writeFileSync(filePath, JSON.stringify({
      symbol: symbol,
      direction: 'BUY',
      quantity: baseQuantityWithoutFee,
      price: price,
      balances: balances,
      tradeHistory: options.tradeHistory
    }, null, 2));
    logger.flush();
    logger.push("time", (new Date(time)).toLocaleString());
    logger.push("Balances", balances);
    logger.print();
    logger.flush();
  }
}