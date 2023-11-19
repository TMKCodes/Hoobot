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
import { consoleLogger } from "../Utilities/consoleLogger";
import { calculateUnrealizedPNLPercentageForLong, calculateUnrealizedPNLPercentageForShort, delay } from "./Trades";
import { Orderbook } from "./Orderbook";
import { logToFile } from "../Utilities/logToFile";

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

export interface OrderStatus {
  symbol?: string,
  orderId?: number;
  orderListId?: number;
  clientOrderId?: string;
  price?: string;
  origQty?: string;
  executedQty?: string;
  status?: string;
  timeInForce?: string;
  type?: string,
  side?: string,
  stopPrice?: string,
  icebergQty?: string,
  time?: number,
  updateTime?: number,
  isWorking?: true,
  workingTime?: number,
  origQuoteOrderQty?: string,
  selfTradePreventionMode?: string
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

export const openOrders = async (
  binance: Binance, 
  symbol: string,
): Promise<boolean | Order[]> => {
  const openOrders: Order[] = await binance.openOrders(symbol.split("/").join(""))
  if (openOrders.length === 0) {
    return false;
  } else {
    return openOrders;
  }
}

export const checkBeforePlacingOrder = (
  baseQuantity: number,
  price: number,
  tradingPairFilters: any,
) => {
  const isValid = (min: number, max: number, value: number) => {
    if (value < min) {
      return false;
    } else if (value > max) {
      return false;
    }
    return true;
  };
  if (
    !isValid(parseFloat(tradingPairFilters.minPrice), parseFloat(tradingPairFilters.maxPrice), price) ||
    !isValid(parseFloat(tradingPairFilters.minQty), parseFloat(tradingPairFilters.maxQty), baseQuantity) ||
    !isValid(parseFloat(tradingPairFilters.minNotional), parseFloat(tradingPairFilters.maxNotional), price * baseQuantity)
  ) {
    return false;
  }

  return true;
};


export const handleOpenOrder = async (
  discord: Client, 
  binance: Binance, 
  symbol: string,
  order: Order,
  orderBook: Orderbook, 
  options: ConfigOptions,
): Promise<string> => {
  try {
    let partiallyFilledSent = false;
    const logger = consoleLogger();
    delay(1500);
    let orderStatus: OrderStatus = await binance.orderStatus(symbol.split("/").join(""), order.orderId);
    delay(1500);
    do {
      delay(1500);
      const currentTime = Date.now();
      const orderAgeSeconds = Math.floor((currentTime - orderStatus.time) / 1000);
      logger.push("Order ID: ", order.orderId);
      logger.push("Symbol: ", symbol);
      logger.push("Age seconds: ", orderAgeSeconds);
      let tryToCancel = false;
      if (orderStatus.status === "CANCELED") {
        const orderMsg = `>>> Order ID **${order.orderId}**\nSymbol **${symbol.split("/").join("")}**\nOrder Cancelled.\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
        sendMessageToChannel(discord, options.discordChannelID, orderMsg);
        return "CANCELED";
      } else if (orderStatus.status === "EXPIRED") {
        const orderMsg = `>>> Order ID **${order.orderId}**\nSymbol **${symbol.split("/").join("")}**\nOrder Expired.\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
        sendMessageToChannel(discord, options.discordChannelID, orderMsg);
        return "EXPIRED";
      } else if (orderStatus.status === "FILLED") {
        const orderMsg = `>>> Order ID **${order.orderId}**\nSymbol **${symbol.split("/").join("")}**\nOrder Filled.\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
        sendMessageToChannel(discord, options.discordChannelID, orderMsg);
        return "FILLED";
      } else if (orderStatus.status === "NEW") {
        tryToCancel = true;
      } else if (orderStatus.status === "PARTIALLY_FILLED") {
        if (partiallyFilledSent === false) {
          const orderMsg = `>>> Order ID **${order.orderId}**\nSymbol **${symbol.split("/").join("")}**\nOrder Partially filled.\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
          sendMessageToChannel(discord, options.discordChannelID, orderMsg);
          partiallyFilledSent = true;
        }
      } else if (orderStatus.status === "REJECTED") {
        const orderMsg = `>>> Order ID **${order.orderId}**\nSymbol **${symbol.split("/").join("")}**\nOrder Rejected.\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
        sendMessageToChannel(discord, options.discordChannelID, orderMsg);
        return "REJECTED";
      }
      if (tryToCancel === true) {
        if (orderAgeSeconds > options.maxOrderAge) {
          await cancelOrder(binance, symbol.split("/").join(""), order.orderId);
          const orderMsg = `>>> Order ID **${order.orderId}**\nSymbol **${symbol.split("/").join("")}**\nOrder Cancelled.\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
          sendMessageToChannel(discord, options.discordChannelID, orderMsg);
          return "CANCELED";
        } else {
          let unrealizedPNL = 0;
          if (order.isBuyer === true) { 
            const orderBookBids = Object.keys(orderBook.bids).map(price => parseFloat(price)).sort((a, b) => b - a);
            unrealizedPNL = calculateUnrealizedPNLPercentageForShort(parseFloat(order.quoteQty), parseFloat(order.price), orderBookBids[0]);
          } else { 
            const orderBookAsks = Object.keys(orderBook.asks).map(price => parseFloat(price)).sort((a, b) => a - b);
            unrealizedPNL = calculateUnrealizedPNLPercentageForLong(parseFloat(order.quoteQty), parseFloat(order.price), orderBookAsks[0]);
          }
          if (unrealizedPNL < options.closePercentage) {
            await cancelOrder(binance, symbol.split("/").join(""), order.orderId);
            const orderMsg = `>>> Order ID **${order.orderId}**\nSymbol **${symbol.split("/").join("")}**\nOrder Cancelled.\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
            sendMessageToChannel(discord, options.discordChannelID, orderMsg);
            return "CANCELED";
          }
        }
      }
      logger.print();
      logger.flush();
      orderStatus = await binance.orderStatus(symbol.split("/").join(""), order.orderId);
      delay(1500);
    } while(orderStatus.status !== "CANCELED" && orderStatus.status !== "EXPIRED" && orderStatus.status !== "FILLED" && orderStatus.status !== "REJECTED");
  } catch (error) {
    logToFile(JSON.stringify(error, null, 2));
    console.log(error);
  }
};
