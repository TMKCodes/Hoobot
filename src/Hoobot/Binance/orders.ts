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

import Binance from "node-binance-api";
import { sendMessageToChannel } from "../../Discord/discord";
import { Client } from "discord.js";
import { ConfigOptions } from "../Utilities/args";
import { ConsoleLogger, consoleLogger } from "../Utilities/consoleLogger";
import { calculatePercentageDifference, calculateUnrealizedPNLPercentageForLong, calculateUnrealizedPNLPercentageForShort, delay } from "./trade";

export interface Order {
  quoteQty: string;
  symbol: string;
  orderId: number;
  price: string;
  qty: string;
  commission: string;
  commissionAsset: string;
  time: number;
  isBuyer: boolean;
  isMaker: boolean;
  isBestMatch: boolean;
  orderStatus: string;
  tradeId: number;
}

export interface OrderBook {
  bids: [string, string][]; 
  asks: [string, string][]; 
}

export const getOrderBook = async (
  binance: Binance, 
  symbol: string
): Promise<OrderBook> => {
  return await binance.depth(symbol.split("/").join(""))
}

export const getOpenOrders = async (
  binance: Binance, 
  symbol: string
): Promise<Order[]> => {
  return await binance.openOrders(symbol.split("/").join(""));
}

export const cancelOrder = async (
  binance: Binance, 
  symbol: string, 
  orderId: number
) => {
  try {
    const response = await binance.cancel(symbol, orderId);
    return response;
  } catch (error) {
    console.error(`An error occurred while cancelling the order: ${error.message}`);
    throw error;
  }
};

export const handleOpenOrders = async (
  discord: Client, 
  binance: Binance, 
  symbol: string,
  orderBook: any, 
  options: ConfigOptions,
): Promise<string> => {
  let openOrders: Order[] = []
  do {
    openOrders = await binance.openOrders(symbol.split("/").join(""));
    if (openOrders.length > 0) {
      for (const order of openOrders) {
        if (symbol.split("/").join("") !== order.symbol.split("/").join("")) {
          continue;
        }
        const logger = consoleLogger();
        const currentTime = Date.now();
        const orderAgeSeconds = Math.floor((currentTime - order.time) / 1000);
        logger.push("Order ID: ", order.orderId);
        logger.push("Symbol: ", symbol);
        logger.push("Age seconds: ", orderAgeSeconds);
        if (orderAgeSeconds > options.maxOrderAge) {
          await cancelOrder(binance, symbol, order.orderId);
          const orderMsg = `>>> Order ID **${order.orderId}**\nSymbol **${symbol.split("/").join("")}**\nCancelled due to exceeding max age ${options.maxOrderAge} seconds.\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
          sendMessageToChannel(discord, options.discordChannelID, orderMsg);
          logger.push("order-msg", orderMsg);
          return "canceled";
        } else {
          let unrealizedPNL = 0;
          const orderBookAsks = Object.keys(orderBook.asks).map(price => parseFloat(price)).sort((a, b) => a - b);
          const orderBookBids = Object.keys(orderBook.bids).map(price => parseFloat(price)).sort((a, b) => b - a);
          if (order.isBuyer === true) { 
            unrealizedPNL = calculateUnrealizedPNLPercentageForShort(parseFloat(order.quoteQty), parseFloat(order.price), orderBookAsks[0]);
          } else { 
            unrealizedPNL = calculateUnrealizedPNLPercentageForLong(parseFloat(order.quoteQty), parseFloat(order.price), orderBookBids[0]);
          }
          if (unrealizedPNL < options.closePercentage) {
            await cancelOrder(binance, symbol, order.orderId);
            const orderMsg = `>>> Order ID **${order.orderId}**\n symbol **${symbol.split("/").join("")}**\nCancelled due to risk percentage ${options.closePercentage.toFixed(2)}%\nCurrent bid ${orderBookBids[0]}\nCurrent ask ${orderBookAsks[0]}\nCurrent price: ${order.price}\nDifference: ${unrealizedPNL.toFixed(4)} UPNL%.\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
            sendMessageToChannel(discord, options.discordChannelID, orderMsg);
          }
        }
        logger.print();
        logger.flush();
      }
    }
    delay(1500);
  } while(openOrders.length > 0);
};

export const getLastCompletedOrder = async (binance: Binance, pair: string): Promise<Order> => {
  const tradeHistory = await binance.trades(pair.split("/").join(""));
  tradeHistory.sort((a: { time: number; }, b: { time: number; }) => b.time - a.time);
  return tradeHistory.length > 0 ? tradeHistory[0] : "LOL";
}
