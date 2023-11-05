import { Client } from "discord.js";
import Binance from "node-binance-api";
import { ConsoleLogger } from "../Utilities/consoleLogger";
import { ConfigOptions, getSecondsFromInterval } from "../Utilities/args";
import { filter } from "../Binance/filters";
import { calculatePercentageDifference, handleOpenOrders } from "./orders";
import { checkBeforeOrder } from "../Modes/tradeDirection";
import { sendMessageToChannel } from "../../Discord/discord";
import { readFileSync, writeFileSync } from "fs";
import { play } from "../Utilities/playSound";
import { reverseSign } from "../Modes/algorithmic";

const soundFile = './alarm.mp3'



async function handleOpenedOrder (
  discord: Client,
  binance: Binance,
  consoleLogger: ConsoleLogger,
  symbol: string,
  orderBook: any,
  options: ConfigOptions
) {
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

function delay(ms: number) {
  return new Promise( resolve => setTimeout(resolve, ms) );
}

function updateForce(symbol: string) {
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

export async function sell(
  discord: Client,
  binance: Binance,
  consoleLogger: ConsoleLogger,
  symbol: string,
  orderBook: any,
  filter: filter,
  options: ConfigOptions,
  quoteBalance: number,
) {
  const orderBookAsks = Object.keys(orderBook.asks).map(price => parseFloat(price)).sort((a, b) => a - b);
    let price = orderBookAsks[0] - parseFloat(filter.tickSize);
    let maxQuantityInQuote = quoteBalance;
    if (options.startingMaxBuyAmount > 0) {
      maxQuantityInQuote = Math.min(quoteBalance, options.startingMaxSellAmount);
    }
    const stopPrice = price * (1 - (options.closePercentage / 100));
    const roundedPrice = binance.roundStep(price, filter.tickSize);
    const roundedQuantity = binance.roundStep(maxQuantityInQuote, filter.stepSize);
    const quoteQuantity = roundedQuantity * price;
    const roundedStopPrice = binance.roundStep(stopPrice, filter.tickSize);
    const checkBefore = checkBeforeOrder(roundedQuantity, roundedPrice, roundedStopPrice, filter, orderBook);
    let percentageChange = 0;
    const tradeHistory = options.tradeHistory[symbol.split("/").join("")].reverse().slice(0, 3);
    if (tradeHistory?.length > 0) {
      percentageChange = calculatePercentageDifference(parseFloat(tradeHistory[0].price), roundedPrice) - options.tradeFee;
    }
    if (checkBefore === true) {
      let order: any = false;
      if(quoteQuantity > parseFloat(filter.minNotional)) {
        order = await binance.sell(symbol.split("/").join(""), roundedQuantity, roundedPrice);
        const orderMsg = `>>> Placed **SELL** order ID: **${order.orderId}**\nPair: **${symbol}**\nQuantity: **${roundedQuantity}**\nPrice: **${roundedPrice}**\nProfit if trade fullfills: **${percentageChange.toFixed(2)}%**\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
        sendMessageToChannel(discord, options.discordChannelID, orderMsg);
        const openedOrder = await handleOpenedOrder(discord, binance, consoleLogger, symbol, orderBook, options);
        if (openedOrder !== "canceled") {
          options.startingMaxBuyAmount = Math.max(roundedQuantity * roundedPrice, options.startingMaxBuyAmount);
          const statusMsg = `>>> Order ID **${order.orderId}** for symbol **${symbol.split("/").join("")}** has been filled.\nTime now ${new Date().toLocaleString("fi-fi")}\nWaiting now ${getSecondsFromInterval(options.candlestickInterval)} seconds until trying next trade.`;
          sendMessageToChannel(discord, options.discordChannelID, statusMsg);
          await delay(getSecondsFromInterval(options.candlestickInterval) * 1000);
          const resumeMsg = `>>> Resuming trading for symbol **${symbol.split("/").join("")}**.\nTime now ${new Date().toLocaleString("fi-fi")}`;
          sendMessageToChannel(discord, options.discordChannelID, resumeMsg);
          updateForce(symbol);
          play(soundFile);
          options.tradeHistory = (await binance.trades(symbol.split("/").join("")));
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
}

export async function buy(
  discord: Client,
  binance: Binance,
  consoleLogger: ConsoleLogger,
  symbol: string,
  orderBook: any,
  filter: filter,
  options: ConfigOptions,
  baseBalance: number,
) {
  const orderBookBids = Object.keys(orderBook.bids).map(price => parseFloat(price)).sort((a, b) => a - b);
  let price = orderBookBids[orderBookBids.length - 1] + parseFloat(filter.tickSize);
  let maxQuantityInBase = baseBalance;
  if (options.startingMaxBuyAmount > 0) {
    maxQuantityInBase = Math.min(baseBalance, options.startingMaxBuyAmount);
  }
  const quantityInQuote = (maxQuantityInBase / price);
  const stopPrice = price * (1 + (options.closePercentage / 100));
  const roundedPrice = binance.roundStep(price, filter.tickSize);
  const roundedQuantity = binance.roundStep(quantityInQuote, filter.stepSize);
  const roundedQuantityInBase = binance.roundStep(maxQuantityInBase, filter.stepSize);
  const roundedStopPrice = binance.roundStep(stopPrice, filter.tickSize);
  if (checkBeforeOrder(roundedQuantity, roundedPrice, roundedStopPrice, filter, orderBook) === true) {
    let percentageChange = 0;
    const tradeHistory = options.tradeHistory[symbol.split("/").join("")].reverse().slice(0, 3);
    if (tradeHistory?.length > 0) {
      percentageChange = reverseSign(calculatePercentageDifference(parseFloat(tradeHistory[0].price), roundedPrice)) - options.tradeFee;
    }
    let order: any = false;
    if(roundedQuantityInBase > parseFloat(filter.minNotional)) {
      order = await binance.buy(symbol.split("/").join(""), roundedQuantity, roundedPrice);
      const orderMsg = `>>> Placed **BUY** order ID: **${order.orderId}**\nPair: **${symbol}**\nQuantity: **${roundedQuantity}**\nPrice: **${roundedPrice}**\nProfit if trade fullfills: **${percentageChange.toFixed(2)}%**\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
      sendMessageToChannel(discord, options.discordChannelID, orderMsg);
      const openedOrder = await handleOpenedOrder(discord, binance, consoleLogger, symbol, orderBook, options);
      if (openedOrder !== "canceled") {
        options.startingMaxSellAmount = Math.max(roundedQuantity, options.startingMaxSellAmount);
        const statusMsg = `>>> Order ID **${order.orderId}** for symbol **${symbol.split("/").join("")}** has been filled.\nTime now ${new Date().toLocaleString("fi-fi")}\nWaiting now ${getSecondsFromInterval(options.candlestickInterval)} seconds until trying next trade.`;
        sendMessageToChannel(discord, options.discordChannelID, statusMsg);
        await delay(getSecondsFromInterval(options.candlestickInterval) * 1000);
        const resumeMsg = `>>> Resuming trading for symbol **${symbol.split("/").join("")}**.\nTime now ${new Date().toLocaleString("fi-fi")}`;
        sendMessageToChannel(discord, options.discordChannelID, resumeMsg);
        updateForce(symbol);
        play(soundFile);
        options.tradeHistory = (await binance.trades(symbol.split("/").join("")));
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