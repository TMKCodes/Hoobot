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
import { ConfigOptions, ExchangeOptions, SymbolOptions } from "../Utilities/Args";
import { consoleLogger } from "../Utilities/ConsoleLogger";
import { calculateUnrealizedPNLPercentageForLong, calculateUnrealizedPNLPercentageForShort, delay } from "./Trades";
import { Orderbook } from "./Orderbook";
import { logToFile } from "../Utilities/LogToFile";
import { Exchange, isBinance, isNonKYC, isXeggex } from "./Exchange";
import { Filter, Filters } from "./Filters";

export interface Order {
  symbol: string;
  orderId: string;
  price: string;
  qty: string;
  quoteQty: string;
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
  symbol: string;
  orderId: number;
  orderListId: number;
  clientOrderId: string;
  price: string;
  origQty: string;
  executedQty: string;
  status: string;
  timeInForce: string;
  type: string;
  side: string;
  stopPrice: string;
  icebergQty: string;
  time: number;
  updateTime: number;
  isWorking: true;
  workingTime: number;
  origQuoteOrderQty: string;
  selfTradePreventionMode: string;
}

export const getOpenOrders = async (exchange: Exchange, symbol: string): Promise<Order[]> => {
  if (isBinance(exchange)) {
    return await exchange.openOrders(symbol.split("/").join(""));
  } else if (isXeggex(exchange) || isNonKYC(exchange)) {
    const orders = await exchange.getAllOrders(symbol, "active", 500, 0);
    return orders.map(
      (order: any) =>
        ({
          symbol: symbol.split("/").join(""),
          orderId: order.id,
          price: order.price,
          qty: order.quantity,
          quoteQty: (parseFloat(order.quantity) * parseFloat(order.price)).toString(),
          commission: "",
          commissionAsset: "",
          time: order.createdAt,
          isBuyer: order.side === "buy" ? true : false,
          isMaker: true,
          isBestMatch: true,
          orderStatus: order.status,
          tradeId: parseFloat(order.id),
        } as Order)
    );
  }
  return [] as Order[];
};

export const getAllOrders = async (exchange: Exchange, symbol: string): Promise<Order[]> => {
  if (isBinance(exchange)) {
    return await exchange.allOrders(symbol.split("/").join(""));
  } else if (isXeggex(exchange) || isNonKYC(exchange)) {
    const activeOrders = await exchange.getAllOrders(symbol, "active", 500, 0);
    const filledOrders = await exchange.getAllOrders(symbol, "filled", 500, 0);
    const canceledOrders = await exchange.getAllOrders(symbol, "cancelled", 500, 0);
    const orders = [...activeOrders, ...filledOrders, ...canceledOrders];
    return orders.map(
      (order: any) =>
        ({
          symbol: symbol.split("/").join(""),
          orderId: order.id,
          price: order.price,
          qty: order.quantity,
          quoteQty: (parseFloat(order.quantity) * parseFloat(order.price)).toString(),
          commission: "",
          commissionAsset: "",
          time: order.createdAt,
          isBuyer: order.side === "buy" ? true : false,
          isMaker: true,
          isBestMatch: true,
          orderStatus: order.status,
          tradeId: parseFloat(order.id),
        } as Order)
    );
  }
  return [] as Order[];
};

export const getOrder = async (exchange: Exchange, symbol: string, orderId: string) => {
  try {
    if (isBinance(exchange)) {
      const response = await exchange.orderStatus(symbol, orderId);
      return response;
    } else if (isXeggex(exchange) || isNonKYC(exchange)) {
      const order = await exchange.getOrderByID(orderId);
      return {
        symbol: symbol.split("/").join(""),
        orderId: order.id,
        price: order.price,
        qty: order.quantity,
        quoteQty: (parseFloat(order.quantity) * parseFloat(order.price)).toString(),
        commission: "",
        commissionAsset: "",
        time: order.createdAt,
        isBuyer: order.side === "buy" ? true : false,
        isMaker: true,
        isBestMatch: true,
        orderStatus: order.status,
        tradeId: parseFloat(order.id),
      } as Order;
    }
  } catch (error) {
    if (error?.message !== "Order not found.") {
      logToFile("./logs/error.log", JSON.stringify(error, null, 4));
      console.error(`An error occurred while cancelling the order: ${error}`);
    }
  }
};

export const cancelOrder = async (exchange: Exchange, symbol: string, orderId: string) => {
  try {
    if (isBinance(exchange)) {
      const response = await exchange.cancel(symbol, orderId);
      return response;
    } else if (isXeggex(exchange) || isNonKYC(exchange)) {
      const response = await exchange.cancelOrder(orderId);
      return response;
    }
  } catch (error) {
    if (error?.message !== "Order not found.") {
      logToFile("./logs/error.log", JSON.stringify(error, null, 4));
      console.error(`An error occurred while cancelling the order: ${error}`);
    }
  }
};

export const openOrders = async (exchange: Exchange, symbol: string): Promise<boolean | Order[]> => {
  return getOpenOrders(exchange, symbol);
};

export const checkBeforePlacingOrder = (baseQuantity: number, price: number, tradingPairFilters: Filter) => {
  const isValid = (min: number, max: number, value: number) => {
    if (value < min) {
      return false;
    } else if (value > max) {
      return false;
    }
    return true;
  };
  if (
    !isValid(tradingPairFilters.minPrice, tradingPairFilters.maxPrice, price) ||
    !isValid(tradingPairFilters.minQty, tradingPairFilters.maxQty, baseQuantity) ||
    !isValid(tradingPairFilters.minNotional, tradingPairFilters.maxNotional, price)
  ) {
    return false;
  }

  return true;
};

export const addOpenOrder = (symbol: string, order: Order, exchangeOptions: ExchangeOptions) => {
  if (exchangeOptions.openOrders[symbol.split("/").join("")] === undefined) {
    exchangeOptions.openOrders[symbol.split("/").join("")] = [order];
  } else {
    exchangeOptions.openOrders[symbol.split("/").join("")].push(order);
  }
};

export const openOrderDone = (symbol: string, orderId: string, exchangeOptions: ExchangeOptions) => {
  if (exchangeOptions.openOrders[symbol.split("/").join("")] !== undefined) {
    exchangeOptions.openOrders[symbol.split("/").join("")] = exchangeOptions.openOrders[symbol.split("/").join("")].filter((order) => order.orderId !== orderId);
  }
};

export const checkOpenOrders = (symbol: string, exchangeOptions: ExchangeOptions) => {
  if (exchangeOptions.openOrders[symbol.split("/").join("")] !== undefined && exchangeOptions.openOrders[symbol.split("/").join("")]?.length > 0) {
    return true;
  } else {
    return false;
  }
};

export const handleOpenOrder = async (discord: Client, exchange: Exchange, symbol: string, order: Order, orderBook: Orderbook, processOptions: ConfigOptions, symbolOptions: SymbolOptions): Promise<string> => {
  try {
    if (isBinance(exchange)) {
      let partiallyFilledSent = false;
      const logger = consoleLogger();
      delay(1500);
      let orderStatus;
      orderStatus = await exchange.orderStatus(symbol.split("/").join(""), order.orderId);
      if (orderStatus === undefined) {
        return "DOES_NOT_EXIST";
      }
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
          sendMessageToChannel(discord, processOptions.discord.channelId!, orderMsg);
          return "CANCELED";
        } else if (orderStatus.status === "EXPIRED") {
          const orderMsg = `>>> Order ID **${order.orderId}**\nSymbol **${symbol.split("/").join("")}**\nOrder Expired.\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
          sendMessageToChannel(discord, processOptions.discord.channelId!, orderMsg);
          return "EXPIRED";
        } else if (orderStatus.status === "FILLED") {
          const orderMsg = `>>> Order ID **${order.orderId}**\nSymbol **${symbol.split("/").join("")}**\nOrder Filled.\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
          sendMessageToChannel(discord, processOptions.discord.channelId!, orderMsg);
          return "FILLED";
        } else if (orderStatus.status === "NEW") {
          tryToCancel = true;
        } else if (orderStatus.status === "PARTIALLY_FILLED") {
          if (partiallyFilledSent === false) {
            const orderMsg = `>>> Order ID **${order.orderId}**\nSymbol **${symbol.split("/").join("")}**\nOrder Partially filled.\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
            sendMessageToChannel(discord, processOptions.discord.channelId!, orderMsg);
            partiallyFilledSent = true;
          }
        } else if (orderStatus.status === "REJECTED") {
          const orderMsg = `>>> Order ID **${order.orderId}**\nSymbol **${symbol.split("/").join("")}**\nOrder Rejected.\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
          sendMessageToChannel(discord, processOptions.discord.channelId!, orderMsg);
          return "REJECTED";
        }
        if (tryToCancel === true) {
          if (orderAgeSeconds > symbolOptions.maximumAgeOfOrder!) {
            await cancelOrder(exchange, symbol.split("/").join(""), order.orderId);
            const orderMsg = `>>> Order ID **${order.orderId}**\nSymbol **${symbol.split("/").join("")}**\nOrder Cancelled.\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
            sendMessageToChannel(discord, processOptions.discord.channelId!, orderMsg);
            return "CANCELED";
          } else {
            let unrealizedPNL = 0;
            if (order.isBuyer === true) {
              const orderBookBids = Object.keys(orderBook.bids)
                .map((price) => parseFloat(price))
                .sort((a, b) => b - a);
              unrealizedPNL = calculateUnrealizedPNLPercentageForShort(parseFloat(order.quoteQty), parseFloat(order.price), orderBookBids[0]);
            } else {
              const orderBookAsks = Object.keys(orderBook.asks)
                .map((price) => parseFloat(price))
                .sort((a, b) => a - b);
              unrealizedPNL = calculateUnrealizedPNLPercentageForLong(parseFloat(order.quoteQty), parseFloat(order.price), orderBookAsks[0]);
            }
            if (unrealizedPNL < symbolOptions.closePercentage!) {
              await cancelOrder(exchange, symbol.split("/").join(""), order.orderId);
              const orderMsg = `>>> Order ID **${order.orderId}**\nSymbol **${symbol.split("/").join("")}**\nOrder Cancelled.\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
              sendMessageToChannel(discord, processOptions.discord.channelId!, orderMsg);
              return "CANCELED";
            }
          }
        }
        logger.print();
        logger.flush();
        orderStatus = await exchange.orderStatus(symbol.split("/").join(""), order.orderId);
        delay(1500);
      } while (true);
    } else if (isXeggex(exchange) || isNonKYC(exchange)) {
      do {
        const currentTime = Date.now();
        const activeOrders = await exchange.getAllOrders(symbol, "active", 500, 0);
        const filledOrders = await exchange.getAllOrders(symbol, "filled", 500, 0);
        const cancelledOrders = await exchange.getAllOrders(symbol, "cancelled", 500, 0);
        if (activeOrders !== undefined) {
          for (const activeOrder of activeOrders) {
            if (String(activeOrders.id) === order.orderId) {
              const orderAgeSeconds = Math.floor((currentTime - activeOrder.createdAt) / 1000);
              if (orderAgeSeconds > symbolOptions.maximumAgeOfOrder!) {
                await cancelOrder(exchange, symbol.split("/").join(""), order.orderId);
                const orderMsg = `>>> Order ID **${order.orderId}**\nSymbol **${symbol.split("/").join("")}**\nOrder Cancelled.\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
                sendMessageToChannel(discord, processOptions.discord.channelId!, orderMsg);
                return "CANCELED";
              } else {
                let unrealizedPNL = 0;
                if (order.isBuyer === true) {
                  const orderBookBids = Object.keys(orderBook.bids)
                    .map((price) => parseFloat(price))
                    .sort((a, b) => b - a);
                  unrealizedPNL = calculateUnrealizedPNLPercentageForShort(parseFloat(order.quoteQty), parseFloat(order.price), orderBookBids[0]);
                } else {
                  const orderBookAsks = Object.keys(orderBook.asks)
                    .map((price) => parseFloat(price))
                    .sort((a, b) => a - b);
                  unrealizedPNL = calculateUnrealizedPNLPercentageForLong(parseFloat(order.quoteQty), parseFloat(order.price), orderBookAsks[0]);
                }
                if (unrealizedPNL < symbolOptions.closePercentage!) {
                  await cancelOrder(exchange, symbol.split("/").join(""), order.orderId);
                  const orderMsg = `>>> Order ID **${order.orderId}**\nSymbol **${symbol.split("/").join("")}**\nOrder Cancelled.\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
                  sendMessageToChannel(discord, processOptions.discord.channelId!, orderMsg);
                  return "CANCELED";
                }
              }
            }
          }
          let found = false;
          for (const filledOrder of filledOrders) {
            if (String(filledOrder.id) === order.orderId) {
              found = true;
            }
          }
          if (found == false) {
            if (cancelledOrders !== undefined) {
              for (const cancelledOrder of cancelledOrders) {
                if (String(cancelledOrder.id) === order.orderId) {
                  const orderMsg = `>>> Order ID **${order.orderId}**\nSymbol **${symbol.split("/").join("")}**\nOrder Cancelled.\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
                  sendMessageToChannel(discord, processOptions.discord.channelId!, orderMsg);
                  return "CANCELED";
                }
              }
            }
            const orderMsg = `>>> Order ID **${order.orderId}**\nSymbol **${symbol.split("/").join("")}**\nOrder Filled.\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
            sendMessageToChannel(discord, processOptions.discord.channelId!, orderMsg);
            return "FILLED";
          }
        } else {
          return "DOES NOT EXIST";
        }
        delay(30000);
      } while (true);
    }
  } catch (error) {
    logToFile("./logs/error.log", JSON.stringify(error, null, 4));
    console.error(error);
  }
  return "";
};
