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
import { ConfigOptions,  getSecondsFromInterval } from "../Utilities/args";
import { filter } from "../Binance/filters";
import { handleOpenOrders, Order } from "./orders";
import { checkBeforeOrder } from "../Modes/tradeDirection";
import { sendMessageToChannel } from "../../Discord/discord";
import { readFileSync, writeFileSync } from "fs";
import { play } from "../Utilities/playSound";

const soundFile = './alarm.mp3'

export interface TradeHistory {
  [symbol: string]: Order[];
}

export const calculatePercentageDifference = (oldNumber: number, newNumber: number): number => {
  const difference = newNumber - oldNumber;
  const percentageDifference = (difference / Math.abs(oldNumber)) * 100;
  return percentageDifference;
}

export const handleOpenedOrder = async (
  discord: Client,
  binance: Binance,
  consoleLogger: ConsoleLogger,
  symbol: string,
  orderBook: any,
  options: ConfigOptions
) => {
  let openOrders: any[] = [];
  let result: string = "";
  do {
    openOrders = await binance.openOrders(symbol.split("/").join(""));
    if(openOrders.length > 0) {
      result = await handleOpenOrders(discord, binance, symbol.split("/").join(""), openOrders, orderBook, options, consoleLogger);
      if (result === "canceled") {
        return result;
      }
    }
    await delay(1500);
  } while(openOrders.length > 0);
  return result;
};

export const getTradeHistory = async (
  binance: Binance, 
  symbol: string
) => {
  const tradeHistory: Order[] = (await binance.trades(symbol.split("/").join("")));
  let compactedTradeHistory: Order[] = [];
  let currentTrade: Order | null = null;

  for (const trade of tradeHistory) { 
    if (currentTrade === null) {
      currentTrade = trade;
    } else if (currentTrade.isBuyer === trade.isBuyer) {
      currentTrade.qty = (parseFloat(currentTrade.qty) + parseFloat(trade.qty)).toString();
    } else {
      compactedTradeHistory.push(currentTrade);
      currentTrade = trade;
    }
  }

  if (currentTrade !== null) {
    compactedTradeHistory.push(currentTrade);
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
  const force = JSON.parse(readFileSync("force.json", "utf-8"));
  if(force[symbol.split("/").join("")] === undefined) {
    force[symbol.split("/").join("")] = {
      skip: false,
    }
  } else {
    force[symbol.split("/").join("")].skip = false;
  }
  writeFileSync("force.json", JSON.stringify(force));
}

export const sell = async (
  discord: Client,
  binance: Binance,
  consoleLogger: ConsoleLogger,
  symbol: string,
  orderBook: any,
  filter: filter,
  options: ConfigOptions,
  baseBalance: number,
): Promise<Order | boolean> => {
  const orderBookAsks = Object.keys(orderBook.asks).map(price => parseFloat(price)).sort((a, b) => a - b);
  let price = orderBookAsks[0] - parseFloat(filter.tickSize);
  let maxQuantityInBase = baseBalance;
  if (options.startingMaxSellAmount > 0) {
    maxQuantityInBase = Math.min(baseBalance, options.startingMaxSellAmount);
  }
  const roundedPrice = binance.roundStep(price, filter.tickSize);
  const roundedQuantityInBase = binance.roundStep(maxQuantityInBase, filter.stepSize);
  if (checkBeforeOrder(roundedQuantityInBase, roundedPrice, filter) === true) {
    let percentageChange = 0;
    const tradeHistory = options.tradeHistory[symbol.split("/").join("")].reverse().slice(0, 3);
    if (tradeHistory?.length > 0) {
      percentageChange = calculatePercentageDifference(parseFloat(tradeHistory[0].price), roundedPrice) - options.tradeFee;
      if (percentageChange > options.minimumProfitSell) {
        return false;
      }
    }
    let order: Order = undefined;
    if(roundedQuantityInBase > parseFloat(filter.minNotional)) {
      order = await binance.sell(symbol.split("/").join(""), roundedQuantityInBase, roundedPrice);
      const orderMsg = `>>> Placed **SELL** order ID: **${order.orderId}**\nPair: **${symbol}**\nQuantity: **${roundedQuantityInBase}**\nPrice: **${roundedPrice}**\nProfit if trade fullfills: **${percentageChange.toFixed(2)}%**\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
      sendMessageToChannel(discord, options.discordChannelID, orderMsg);
      const openedOrder = await handleOpenedOrder(discord, binance, consoleLogger, symbol, orderBook, options);
      if (openedOrder !== "canceled") {
        if (options.startingMaxBuyAmount > 0) {
          options.startingMaxBuyAmount = Math.max(roundedQuantityInBase * roundedPrice, options.startingMaxBuyAmount);
        }
        const statusMsg = `>>> Order ID **${order.orderId}** for symbol **${symbol.split("/").join("")}** has been filled.\nTime now ${new Date().toLocaleString("fi-fi")}\nWaiting now ${getSecondsFromInterval(options.candlestickInterval)} seconds until trying next trade.`;
        sendMessageToChannel(discord, options.discordChannelID, statusMsg);
        await delay(getSecondsFromInterval(options.candlestickInterval) * 1000);
        const resumeMsg = `>>> Resuming trading for symbol **${symbol.split("/").join("")}**.\nTime now ${new Date().toLocaleString("fi-fi")}`;
        sendMessageToChannel(discord, options.discordChannelID, resumeMsg);
        updateForce(symbol);
        play(soundFile);
        options.tradeHistory[symbol.split("/").join("")] = await getTradeHistory(binance, symbol);
      }
      return order;
    } else {
      consoleLogger.push("error", `\r\nFailed check: ${roundedQuantityInBase} > ${parseFloat(filter.minNotional)}\r\n`);
      return false;
    }
  } else {
    consoleLogger.push("error", "NOTANIONAL PROBLEM, CHECK LIMITS AND YOUR BALANCES");
    return false;
  }
}

export const buy = async (
  discord: Client,
  binance: Binance,
  consoleLogger: ConsoleLogger,
  symbol: string,
  orderBook: any,
  filter: filter,
  options: ConfigOptions,
  quoteBalance: number,
): Promise<Order | boolean> => {
  const orderBookBids = Object.keys(orderBook.bids).map(price => parseFloat(price)).sort((a, b) => b - a);
  let price = orderBookBids[0] + parseFloat(filter.tickSize);
  let maxQuantityuInQuote = quoteBalance;
  if (options.startingMaxBuyAmount > 0) {
    maxQuantityuInQuote = Math.min(quoteBalance, options.startingMaxBuyAmount);
  }
  const quantityInBase = (maxQuantityuInQuote / price);
  const roundedPrice = binance.roundStep(price, filter.tickSize);
  const roundedQuantityInQuote = binance.roundStep(quantityInBase, filter.stepSize);
  const roundedQuantityInBase = binance.roundStep(maxQuantityuInQuote, filter.stepSize);
  console.log(roundedQuantityInQuote);
  if (checkBeforeOrder(roundedQuantityInQuote, roundedPrice, filter) === true) {
    let percentageChange = 0;
    const tradeHistory = options.tradeHistory[symbol.split("/").join("")].reverse().slice(0, 3);
    if (tradeHistory?.length > 0) {
      percentageChange = calculatePercentageDifference(roundedPrice, parseFloat(tradeHistory[0].price)) - options.tradeFee;
      if (percentageChange > options.minimumProfitBuy) {
        return false;
      }
    }
    let order: Order = undefined;
    if(roundedQuantityInBase > parseFloat(filter.minNotional)) {
      order = await binance.buy(symbol.split("/").join(""), roundedQuantityInQuote, roundedPrice);
      const orderMsg = `>>> Placed **BUY** order ID: **${order.orderId}**\nPair: **${symbol}**\nQuantity: **${roundedQuantityInQuote}**\nPrice: **${roundedPrice}**\nProfit if trade fullfills: **${percentageChange.toFixed(2)}%**\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
      sendMessageToChannel(discord, options.discordChannelID, orderMsg);
      const openedOrder = await handleOpenedOrder(discord, binance, consoleLogger, symbol, orderBook, options);
      if (openedOrder !== "canceled") {
        if (options.startingMaxSellAmount > 0) {
          options.startingMaxSellAmount = Math.max(roundedQuantityInQuote, options.startingMaxSellAmount);
        }
        const statusMsg = `>>> Order ID **${order.orderId}** for symbol **${symbol.split("/").join("")}** has been filled.\nTime now ${new Date().toLocaleString("fi-fi")}\nWaiting now ${getSecondsFromInterval(options.candlestickInterval)} seconds until trying next trade.`;
        sendMessageToChannel(discord, options.discordChannelID, statusMsg);
        await delay(getSecondsFromInterval(options.candlestickInterval) * 1000);
        const resumeMsg = `>>> Resuming trading for symbol **${symbol.split("/").join("")}**.\nTime now ${new Date().toLocaleString("fi-fi")}`;
        sendMessageToChannel(discord, options.discordChannelID, resumeMsg);
        updateForce(symbol);
        play(soundFile);
        options.tradeHistory[symbol.split("/").join("")] = await getTradeHistory(binance, symbol);
      }
      return order;
    } else {
      consoleLogger.push("error", `\r\nFailed check: ${roundedQuantityInQuote} > ${parseFloat(filter.minNotional)}\r\n`);
      return false;
    }
  } else {
    consoleLogger.push("error", "NOTANIONAL PROBLEM, CHECK LIMITS AND YOUR BALANCES");
    return false;
  }
}