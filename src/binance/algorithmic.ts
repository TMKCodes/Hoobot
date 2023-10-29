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
import { readFileSync, writeFileSync } from "fs";


const soundFile = './alarm.mp3'

export interface macd { 
  macdLine: number; 
  signalLine: number; 
  histogram: number; 
}

export interface history {
  macd: macd[] | undefined;
  shortEma: number[] | undefined;
  longEma: number[] | undefined;
}

const prev: history = {
  macd: [],
  shortEma: [],
  longEma: [],
}

function delay(ms: number) {
  return new Promise( resolve => setTimeout(resolve, ms) );
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
  rsi: number[],
  macd: macd,
  prev: history,
  balances: Balances,
  orderBook: any,
  closePrice: number,
  filter: filter,
  options: ConfigOptions,
) {
  if(prev.macd === undefined || prev.longEma === undefined || prev.shortEma === undefined) {
    return false;
  }
  const quoteBalance = balances[symbol.split("/")[0]];
  const baseBalance = balances[symbol.split("/")[1]];
  const lastTrade = tradeHistory[0];
  const currentTime = Date.now();
  const timeDifferenceInSeconds = (currentTime - lastTrade.time) / 1000;
  consoleLogger.push("Time since last trade:", timeDifferenceInSeconds);
  if (timeDifferenceInSeconds < getSecondsFromInterval(options.candlestickInterval)) {
    return false; // don't trade since the last trade was too new.
  }
  const direction = await tradeDirection(consoleLogger, symbol.split("/").join(""), quoteBalance, baseBalance, closePrice, shortEma, longEma, macd, rsi, prev, tradeHistory, options);
  consoleLogger.push(`Trade direction`, direction);
  if (direction === "RECHECK BALANCES") {
    balances = await getCurrentBalances(binance);
    return false;
  } else if (direction === 'SELL') {
    const orderBookAsks = Object.keys(orderBook.asks).map(price => parseFloat(price)).sort((a, b) => a - b);
    let price = orderBookAsks[0] - parseFloat(filter.tickSize);
    const quantity = quoteBalance;
    const stopPrice = price * (1 - (options.closePercentage / 100));
    const roundedPrice = binance.roundStep(price, filter.tickSize);
    const roundedQuantity = binance.roundStep(quantity, filter.stepSize);
    const quoteQuantity = roundedQuantity * price;
    const roundedStopPrice = binance.roundStep(stopPrice, filter.tickSize);
    const checkBefore = checkBeforeOrder(roundedQuantity, roundedPrice, roundedStopPrice, filter, orderBook);
    const percentageChange = calculatePercentageDifference(parseFloat(lastTrade.price), roundedPrice) - 0.075;
    if (checkBefore === true) {
      let order: any = false;
      if(quoteQuantity > parseFloat(filter.minNotional)) {
        try {
          play(soundFile);
          const force = JSON.parse(readFileSync("force.json", "utf-8"));
          force[symbol.split("/").join("")].skip = false;
          writeFileSync("force.json", JSON.stringify(force));
          order = await binance.sell(symbol.split("/").join(""), roundedQuantity, roundedPrice);
          const orderMsg = `>>> Placed **SELL** order ID: **${order.orderId}**\nPair: **${symbol}**\nQuantity: **${roundedQuantity}**\nPrice: **${roundedPrice}**\nProfit if trade fullfills: **${percentageChange.toFixed(2)}%**\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
          sendMessageToChannel(discord, options.discordChannelID, orderMsg);
          consoleLogger.push(`sell-order`, {
            symbol: symbol.split("/").join(""),
            quantity: roundedQuantity,
            price: roundedPrice,
            stopPrice: roundedStopPrice,
          });
          let openOrders: any[] = [];
          let handleOpenOrderResult: string = "";
          do {
            openOrders = await binance.openOrders(symbol.split("/").join(""));
            if(openOrders.length > 0) {
              consoleLogger.push(`warning`, `There are open orders. Waiting for them to complete or cancelling them.`);
              handleOpenOrderResult = await handleOpenOrders(discord, binance, symbol.split("/").join(""), openOrders, orderBook, options, consoleLogger);
              if (handleOpenOrderResult === "canceled") {
                break;
              }
            }
            await delay(1500);
          } while(openOrders.length > 0);
          if (handleOpenOrderResult !== "canceled") {
            const statusMsg = `>>> Order ID **${order.orderId}** for symbol **${symbol.split("/").join("")}** has been filled.\nTime now ${new Date().toLocaleString("fi-fi")}\nWaiting now ${getSecondsFromInterval(options.candlestickInterval)} seconds until trying next trade.`;
            sendMessageToChannel(discord, options.discordChannelID, statusMsg);
            consoleLogger.push("status-msg", statusMsg);
            await delay(getSecondsFromInterval(options.candlestickInterval) * 1000);
            const resumeMsg = `>>> Resuming trading for symbol **${symbol.split("/").join("")}**.\nTime now ${new Date().toLocaleString("fi-fi")}`;
            sendMessageToChannel(discord, options.discordChannelID, resumeMsg);
          }
        } catch (error: any) {
          console.error(JSON.stringify(error));
          if (error.msg !== undefined) {
            sendMessageToChannel(discord, options.discordChannelID, error.msg);
          }
        }
        return order;
      } else {
        consoleLogger.push("error", `\r\nFailed check: ${quoteQuantity} > ${parseFloat(filter.minNotional)}\r\n`);
        return false;
      }
    } else {
      consoleLogger.push("error", "NOTANIONAL PROBLEM, CHECK LIMITS AND YOUR BALANCES");
      return false;
    }
  } else if (direction === 'BUY') {
    const orderBookBids = Object.keys(orderBook.bids).map(price => parseFloat(price)).sort((a, b) => a - b);
    let price = orderBookBids[orderBookBids.length - 1] + parseFloat(filter.tickSize);
    const quantityInBase = baseBalance
    let maxQuantityInBase = quantityInBase;
    if (options.maxAmount !== 0) {
      maxQuantityInBase = Math.min(quantityInBase, options.maxAmount);
    }
    const quantityInQuote = (maxQuantityInBase / price);
    const stopPrice = price * (1 + (options.closePercentage / 100));
    const roundedPrice = binance.roundStep(price, filter.tickSize);
    const roundedQuantity = binance.roundStep(quantityInQuote, filter.stepSize);
    const roundedQuantityInBase = binance.roundStep(maxQuantityInBase, filter.stepSize);
    const roundedStopPrice = binance.roundStep(stopPrice, filter.tickSize);
    if (checkBeforeOrder(roundedQuantity, roundedPrice, roundedStopPrice, filter, orderBook) === true) {
      const percentageChange = reverseSign(calculatePercentageDifference(parseFloat(lastTrade.price), roundedPrice)) - 0.075;
      let order: any = false;
      if(roundedQuantityInBase > parseFloat(filter.minNotional)) {
        try {
          play(soundFile);
          const force = JSON.parse(readFileSync("force.json", "utf-8"));
          force[symbol.split("/").join("")].skip = false;
          writeFileSync("force.json", JSON.stringify(force));
          
          order = await binance.buy(symbol.split("/").join(""), roundedQuantity, roundedPrice);
          const orderMsg = `>>> Placed **BUY** order ID: **${order.orderId}**\nPair: **${symbol}**\nQuantity: **${roundedQuantity}**\nPrice: **${roundedPrice}**\nProfit if trade fullfills: **${percentageChange.toFixed(2)}%**\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
          sendMessageToChannel(discord, options.discordChannelID, orderMsg);
          consoleLogger.push(`buy-order`, {
            symbol: symbol.split("/").join(""),
            quantity: roundedQuantity,
            price: roundedPrice,
            stopPrice: roundedStopPrice,
          });
          let openOrders: any[] = [];
          let handleOpenOrderResult: String = "";
          do {
            openOrders = await binance.openOrders(symbol.split("/").join(""));
            if(openOrders.length > 0) {
              consoleLogger.push(`warning`, `There are open orders. Waiting for them to complete or cancelling them.`);
              handleOpenOrderResult = await handleOpenOrders(discord, binance, symbol.split("/").join(""), openOrders, orderBook, options, consoleLogger);
              if (handleOpenOrderResult === "canceled") {
                break;
              }
            }
            await delay(1500);
          } while(openOrders.length > 0);
          if (handleOpenOrderResult !== "canceled") {
            const statusMsg = `>>> Order ID **${order.orderId}** for symbol **${symbol.split("/").join("")}** has been filled.\nTime now ${new Date().toLocaleString("fi-fi")}\nWaiting now ${getSecondsFromInterval(options.candlestickInterval)} seconds until trying next trade.`;
            sendMessageToChannel(discord, options.discordChannelID, statusMsg);
            consoleLogger.push("status-msg", statusMsg);
            await delay(getSecondsFromInterval(options.candlestickInterval) * 1000);
            const resumeMsg = `>>> Resuming trading for symbol **${symbol.split("/").join("")}**.\nTime now ${new Date().toLocaleString("fi-fi")}`;
            sendMessageToChannel(discord, options.discordChannelID, resumeMsg);
          }
        } catch (error: any) {
          console.error(JSON.stringify(error.body));
          if (error.msg !== undefined) {
            sendMessageToChannel(discord, options.discordChannelID, error.msg);
          }
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
      return false;
    }
    const orderBook = await binance.depth(symbol.split("/").join(""));
    let openOrders: any[] = [];
    openOrders = await binance.openOrders(symbol.split("/").join(""));
    if(openOrders.length > 0) {
      consoleLogger.push(`warning`, `There are open orders. Waiting for them to complete or cancelling them.`);
      return await handleOpenOrders(discord, binance, symbol.split("/").join(""), openOrders, orderBook, options, consoleLogger);
    }
    const tradeHistory = (await binance.trades(symbol.split("/").join(""))).reverse().slice(0, 3);
    consoleLogger.push(symbol.split("/")[0], balances[symbol.split("/")[0]].toFixed(7));
    consoleLogger.push(symbol.split("/")[1], balances[symbol.split("/")[1]].toFixed(7));
    const shortEma = calculateEMA(candlesticks, options.shortEma, options.source);
    const longEma = calculateEMA(candlesticks, options.longEma, options.source);
    const rsi = calculateRSI(candlesticks, options.rsiLength, options.rsiSmoothing, options.source);
    const macd = calculateMACD(candlesticks, options.fastMacd, options.slowMacd, options.signalMacd, options.source);
    if(prev.shortEma.length > 2 && prev.longEma.length > 2 && prev.macd.length > 2) {
      logEMASignals(consoleLogger, shortEma, longEma, prev.shortEma[prev.shortEma.length - 1], prev.longEma[prev.shortEma.length - 1]);
      logMACDSignals(consoleLogger, macd, prev.macd[prev.macd.length - 1]);
      logRSISignals(consoleLogger, rsi);
      const lastOrder = await getLastCompletedOrder(binance, symbol);
      await placeTrade(discord, binance, consoleLogger, symbol, tradeHistory, shortEma, longEma, rsi, macd, prev, balances, orderBook, closePrice, filter, options);
    }
    prev.macd.push(macd);
    prev.shortEma.push(shortEma);
    prev.longEma.push(longEma);
    const historyLength = 10;
    if(prev.shortEma.length > historyLength && prev.longEma.length > historyLength && prev.macd.length > historyLength) {
      prev.macd = prev.macd.slice(-historyLength);
      prev.shortEma = prev.shortEma.slice(-historyLength);
      prev.longEma = prev.longEma.slice(-historyLength);
    }
    consoleLogger.print();
    consoleLogger.flush();
  } catch (error: any) {
    console.error(JSON.stringify(error));
  }
}