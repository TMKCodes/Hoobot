import { sendMessageToChannel } from "../../Discord/discord";
import { Client } from "discord.js";
import { ConfigOptions, ExchangeOptions, SymbolOptions, toSymbolKey } from "../Utilities/Args";
import { consoleLogger } from "../Utilities/ConsoleLogger";
import { calculateUnrealizedPNLPercentageForLong, calculateUnrealizedPNLPercentageForShort, delay } from "./Trades";
import { Orderbook } from "./Orderbook";
import { logToFile } from "../Utilities/LogToFile";
import { Exchange, isBinance, isNonKYC, isDexTrade } from "./Exchange";
import { DexTradeOrder } from "./DexTrade/DexTrade";
import { Filter } from "./Filters";
import { isFullOrderFill } from "../Trading/orderFill";

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

const mapDexTradeOrder = (order: DexTradeOrder, symbol: string): Order => {
  const rate = Number.isFinite(order.rate) ? order.rate : 0;
  const volume = Number.isFinite(order.volume) ? order.volume : 0;
  const commission = Number.isFinite(order.commission) ? order.commission : 0;
  const time = Number.isFinite(order.time_create) ? order.time_create * 1000 : 0;
  
  return {
    symbol: toSymbolKey(symbol),
    orderId: order.id.toString(),
    price: rate.toString(),
    qty: volume.toString(),
    quoteQty: (volume * rate).toString(),
    commission: commission.toString(),
    commissionAsset: "",
    time: time,
    isBuyer: order.type === 0,
    isMaker: true,
    isBestMatch: true,
    orderStatus:
      order.status === 0 ? "PROCESSING" : order.status === 1 ? "NEW" : order.status === 2 ? "FILLED" : "CANCELED",
    tradeId: order.id,
  };
};

export const getOpenOrders = async (exchange: Exchange, symbol: string): Promise<Order[]> => {
  try {
    if (isBinance(exchange)) {
      return await exchange.openOrders(toSymbolKey(symbol));
  } else if (isNonKYC(exchange)) {
    const orders = await exchange.getAllOrders(symbol, "active", 500, 0);
    return orders.map(
      (order: any) => {
        const qty = Number.isFinite(parseFloat(order.quantity)) ? parseFloat(order.quantity) : 0;
        const price = Number.isFinite(parseFloat(order.price)) ? parseFloat(order.price) : 0;
        const createdAt = Number.isFinite(order.createdAt) ? order.createdAt : 0;
        const orderId = order.id !== undefined ? String(order.id) : "";
        
        return {
          symbol: toSymbolKey(symbol),
          orderId: orderId,
          price: price.toString(),
          qty: qty.toString(),
          quoteQty: (qty * price).toString(),
          commission: "",
          commissionAsset: "",
          time: createdAt,
          isBuyer: order.side === "buy" ? true : false,
          isMaker: true,
          isBestMatch: true,
          orderStatus: order.status || "UNKNOWN",
          tradeId: parseFloat(orderId) || 0,
        } as Order;
      }
    );
  } else if (isDexTrade(exchange)) {
    const orders = await exchange.getAllOrders(toSymbolKey(symbol), "active", 500, 0);
    return orders.map((order) => mapDexTradeOrder(order, symbol));
  }
  return [] as Order[];
  } catch (error: unknown) {
    logToFile("./logs/orders-error.log", `getOpenOrders failed for ${symbol}: ${error instanceof Error ? error.message : String(error)}`);
    return [] as Order[];
  }
};

export const getAllOrders = async (exchange: Exchange, symbol: string): Promise<Order[]> => {
  if (isBinance(exchange)) {
    return await exchange.allOrders(toSymbolKey(symbol));
  } else if (isNonKYC(exchange)) {
    const activeOrders = await exchange.getAllOrders(symbol, "active", 500, 0);
    const filledOrders = await exchange.getAllOrders(symbol, "filled", 500, 0);
    const canceledOrders = await exchange.getAllOrders(symbol, "cancelled", 500, 0);
    const orders = [...activeOrders, ...filledOrders, ...canceledOrders];
    return orders.map(
      (order: any) =>
        ({
          symbol: toSymbolKey(symbol),
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
        }) as Order,
    );
  } else if (isDexTrade(exchange)) {
    const activeOrders = await exchange.getAllOrders(toSymbolKey(symbol), "active", 500, 0);
    const filledOrders = await exchange.getAllOrders(toSymbolKey(symbol), "filled", 500, 0);
    const canceledOrders = await exchange.getAllOrders(toSymbolKey(symbol), "cancelled", 500, 0);
    return [...activeOrders, ...filledOrders, ...canceledOrders].map((o) => mapDexTradeOrder(o, symbol));
  }
  return [] as Order[];
};

export const getOrder = async (exchange: Exchange, symbol: string, orderId: string) => {
  if (isBinance(exchange)) {
    const response = await exchange.orderStatus(toSymbolKey(symbol), orderId);
    return response;
  } else if (isNonKYC(exchange)) {
    const order = await exchange.getOrderByID(orderId);
    return {
      symbol: toSymbolKey(symbol),
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
  } else if (isDexTrade(exchange)) {
    const order = await exchange.getOrderByID(orderId);
    if (order) return mapDexTradeOrder(order, symbol);
  }
};

export const cancelOrder = async (exchange: Exchange, symbol: string, orderId: string) => {
  if (isBinance(exchange)) {
    const response = await exchange.cancel(symbol, orderId);
    return response;
  } else if (isNonKYC(exchange)) {
    const response = await exchange.cancelOrder(orderId);
    return response;
  } else if (isDexTrade(exchange)) {
    const response = await exchange.cancelOrder(orderId);
    return response;
  }
};

export const openOrders = async (exchange: Exchange, symbol: string): Promise<boolean | Order[]> => {
  return getOpenOrders(exchange, symbol);
};

const roundToStep = (value: number, step: number): number => {
  if (!Number.isFinite(step) || step <= 0) return value;
  return Math.round(value / step) * step;
};

export const checkBeforePlacingOrder = (baseQuantity: number, price: number, tradingPairFilters: Filter) => {
  const isValid = (min: number, max: number, value: number) => {
    if (value < min) return false;
    if (max > 0 && value > max) return false;
    return true;
  };

  const roundedPrice = roundToStep(price, tradingPairFilters.tickSize);
  const roundedQty = roundToStep(baseQuantity, tradingPairFilters.stepSize);
  const notional = roundedQty * roundedPrice;

  if (process.env.DEBUG === "true") {
    console.log("checkBeforePlacingOrder", {
      baseQuantity,
      roundedQty,
      price,
      roundedPrice,
      notional,
      filters: tradingPairFilters,
    });
  }

  const priceOk = isValid(tradingPairFilters.minPrice, tradingPairFilters.maxPrice, roundedPrice);
  const qtyOk = isValid(tradingPairFilters.minQty, tradingPairFilters.maxQty, roundedQty);
  const notionalOk = isValid(tradingPairFilters.minNotional, tradingPairFilters.maxNotional, notional);

  if (!priceOk || !qtyOk || !notionalOk) {
    if (process.env.DEBUG === "true") {
      console.log("ORDER BLOCKED BY FILTERS", { priceOk, qtyOk, notionalOk, roundedQty, roundedPrice, notional });
    }
    return false;
  }
  return true;
};

export const handleOpenOrders = async (
  discord: Client,
  exchange: Exchange,
  symbol: string,
  orderBook: Orderbook,
  processOptions: ConfigOptions,
  symbolOptions: SymbolOptions,
) => {
  const openOrders = await getOpenOrders(exchange, symbol);
  if (openOrders.length == 0) {
    symbolOptions.currentOrder = undefined;
    return true;
  }
  for (var i = 0; i < openOrders.length; i++) {
    const currentTime = Date.now();
    const orderAgeSeconds = Math.floor((currentTime - openOrders[i].time) / 1000);
    const maxOrderAge = (symbolOptions.maximumAgeOfOrder ?? 0) * 60;
    // console.log(orderAgeSeconds);
    // console.log(maxOrderAge);
    // console.log(orderAgeSeconds > maxOrderAge);
    if (orderAgeSeconds > maxOrderAge) {
      await cancelOrder(exchange, toSymbolKey(symbol), openOrders[i].orderId);
      const orderMsg = `>>> Order ID **${openOrders[i].orderId}**\nSymbol **${symbol
        .split("/")
        .join("")}**\nOrder Cancelled.\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
      sendMessageToChannel(discord, processOptions.discord?.channelId, orderMsg);
      symbolOptions.currentOrder = undefined;
      return true;
    } else {
      let unrealizedPNL = 0;
      if (openOrders[i].isBuyer === true) {
        // console.log("Checking bids");
        const orderBookBids = Object.keys(orderBook.bids)
          .map((price) => parseFloat(price))
          .sort((a, b) => b - a);
        unrealizedPNL = calculateUnrealizedPNLPercentageForShort(
          parseFloat(openOrders[i].qty),
          parseFloat(openOrders[i].price),
          orderBookBids[0],
        );
      } else {
        // console.log("Checking asks");
        const orderBookAsks = Object.keys(orderBook.asks)
          .map((price) => parseFloat(price))
          .sort((a, b) => a - b);
        unrealizedPNL = calculateUnrealizedPNLPercentageForLong(
          parseFloat(openOrders[i].qty),
          parseFloat(openOrders[i].price),
          orderBookAsks[0],
        );
      }
      // console.log(unrealizedPNL);
      if (symbolOptions.closePercentage !== undefined && unrealizedPNL > symbolOptions.closePercentage) {
        await cancelOrder(exchange, toSymbolKey(symbol), openOrders[i].orderId);
        const orderMsg = `>>> Order ID **${openOrders[i].orderId}**\nSymbol **${symbol
          .split("/")
          .join("")}**\nOrder Cancelled.\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
        sendMessageToChannel(discord, processOptions.discord?.channelId, orderMsg);
        symbolOptions.currentOrder = undefined;
        return true;
      }
    }
  }
  return false;
};

export const handleOpenOrder = async (
  discord: Client,
  exchange: Exchange,
  symbol: string,
  order: Order,
  orderBook: Orderbook,
  processOptions: ConfigOptions,
  symbolOptions: SymbolOptions,
): Promise<string> => {
  if (isBinance(exchange)) {
    let partiallyFilledSent = false;
    const logger = consoleLogger();
    await delay(1500);
    let orderStatus;
    orderStatus = await exchange.orderStatus(toSymbolKey(symbol), order.orderId);
    if (orderStatus === undefined) {
      return "DOES_NOT_EXIST";
    }
    await delay(1500);
    do {
      await delay(1500);
      const currentTime = Date.now();
      const orderAgeSeconds = Math.floor((currentTime - orderStatus.time) / 1000);
      logger.push("Order ID: ", order.orderId);
      logger.push("Symbol: ", symbol);
      logger.push("Age seconds: ", orderAgeSeconds);
      let tryToCancel = false;
      if (orderStatus.status === "CANCELED") {
        const orderMsg = `>>> Order ID **${order.orderId}**\nSymbol **${symbol
          .split("/")
          .join("")}**\nOrder Cancelled.\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
        sendMessageToChannel(discord, processOptions.discord?.channelId, orderMsg);
        return "CANCELED";
      } else if (orderStatus.status === "EXPIRED") {
        const orderMsg = `>>> Order ID **${order.orderId}**\nSymbol **${symbol
          .split("/")
          .join("")}**\nOrder Expired.\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
        sendMessageToChannel(discord, processOptions.discord?.channelId, orderMsg);
        return "EXPIRED";
      } else if (isFullOrderFill(orderStatus.status, orderStatus.executedQty, orderStatus.origQty)) {
        const orderMsg = `>>> Order ID **${order.orderId}**\nSymbol **${symbol
          .split("/")
          .join("")}**\nOrder Filled.\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
        sendMessageToChannel(discord, processOptions.discord?.channelId, orderMsg);
        return "FILLED";
      } else if (orderStatus.status === "NEW") {
        tryToCancel = true;
      } else if (orderStatus.status === "PARTIALLY_FILLED") {
        if (partiallyFilledSent === false) {
          const orderMsg = `>>> Order ID **${order.orderId}**\nSymbol **${symbol
            .split("/")
            .join("")}**\nOrder Partially filled.\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
          sendMessageToChannel(discord, processOptions.discord?.channelId, orderMsg);
          partiallyFilledSent = true;
        }
        tryToCancel = true;
      } else if (orderStatus.status === "REJECTED") {
        const orderMsg = `>>> Order ID **${order.orderId}**\nSymbol **${symbol
          .split("/")
          .join("")}**\nOrder Rejected.\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
        sendMessageToChannel(discord, processOptions.discord?.channelId, orderMsg);
        return "REJECTED";
      }
      if (tryToCancel === true) {
        const maxOrderAge = (symbolOptions.maximumAgeOfOrder ?? 0) * 60;
        if (orderAgeSeconds > maxOrderAge) {
          await cancelOrder(exchange, toSymbolKey(symbol), order.orderId);
          const orderMsg = `>>> Order ID **${order.orderId}**\nSymbol **${symbol
            .split("/")
            .join("")}**\nOrder Cancelled.\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
          sendMessageToChannel(discord, processOptions.discord?.channelId, orderMsg);
          return "CANCELED";
        } else {
          let unrealizedPNL = 0;
          if (order.isBuyer === true) {
            const orderBookBids = Object.keys(orderBook.bids)
              .map((price) => parseFloat(price))
              .sort((a, b) => b - a);
            unrealizedPNL = calculateUnrealizedPNLPercentageForShort(
              parseFloat(order.qty),
              parseFloat(order.price),
              orderBookBids[0],
            );
          } else {
            const orderBookAsks = Object.keys(orderBook.asks)
              .map((price) => parseFloat(price))
              .sort((a, b) => a - b);
            unrealizedPNL = calculateUnrealizedPNLPercentageForLong(
              parseFloat(order.qty),
              parseFloat(order.price),
              orderBookAsks[0],
            );
          }
          if (symbolOptions.closePercentage !== undefined && unrealizedPNL > symbolOptions.closePercentage) {
            await cancelOrder(exchange, toSymbolKey(symbol), order.orderId);
            const orderMsg = `>>> Order ID **${order.orderId}**\nSymbol **${symbol
              .split("/")
              .join("")}**\nOrder Cancelled.\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
            sendMessageToChannel(discord, processOptions.discord?.channelId, orderMsg);
            return "CANCELED";
          }
        }
      }
      logger.print();
      logger.flush();
      orderStatus = await exchange.orderStatus(toSymbolKey(symbol), order.orderId);
      if (isFullOrderFill(orderStatus.status, orderStatus.executedQty, orderStatus.origQty)) {
        return "FILLED";
      }
      await delay(1500);
    } while (true);
  } else if (isNonKYC(exchange)) {
    do {
      const currentTime = Date.now();
      const activeOrders = await exchange.getAllOrders(symbol, "active", 500, 0);
      const filledOrders = await exchange.getAllOrders(symbol, "filled", 500, 0);
      const cancelledOrders = await exchange.getAllOrders(symbol, "cancelled", 500, 0);
      if (activeOrders !== undefined) {
        for (const activeOrder of activeOrders) {
          if (String(activeOrders.id) === order.orderId) {
            const orderAgeSeconds = Math.floor((currentTime - activeOrder.createdAt) / 1000);
            const maxOrderAge = (symbolOptions.maximumAgeOfOrder ?? 0) * 60;
            // console.log(orderAgeSeconds);
            // console.log(maxOrderAge);
            // console.log(orderAgeSeconds > maxOrderAge);
            if (orderAgeSeconds > maxOrderAge) {
              await cancelOrder(exchange, toSymbolKey(symbol), order.orderId);
              const orderMsg = `>>> Order ID **${order.orderId}**\nSymbol **${symbol
                .split("/")
                .join("")}**\nOrder Cancelled.\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
              sendMessageToChannel(discord, processOptions.discord?.channelId, orderMsg);
              return "CANCELED";
            } else {
              let unrealizedPNL = 0;
              if (order.isBuyer === true) {
                const orderBookBids = Object.keys(orderBook.bids)
                  .map((price) => parseFloat(price))
                  .sort((a, b) => b - a);
                unrealizedPNL = calculateUnrealizedPNLPercentageForShort(
                  parseFloat(order.qty),
                  parseFloat(order.price),
                  orderBookBids[0],
                );
              } else {
                const orderBookAsks = Object.keys(orderBook.asks)
                  .map((price) => parseFloat(price))
                  .sort((a, b) => a - b);
                unrealizedPNL = calculateUnrealizedPNLPercentageForLong(
                  parseFloat(order.qty),
                  parseFloat(order.price),
                  orderBookAsks[0],
                );
              }
              if (symbolOptions.closePercentage !== undefined && unrealizedPNL > symbolOptions.closePercentage) {
                await cancelOrder(exchange, toSymbolKey(symbol), order.orderId);
                const orderMsg = `>>> Order ID **${order.orderId}**\nSymbol **${symbol
                  .split("/")
                  .join("")}**\nOrder Cancelled.\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
                sendMessageToChannel(discord, processOptions.discord?.channelId, orderMsg);
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
                const orderMsg = `>>> Order ID **${order.orderId}**\nSymbol **${symbol
                  .split("/")
                  .join("")}**\nOrder Cancelled.\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
                sendMessageToChannel(discord, processOptions.discord?.channelId, orderMsg);
                return "CANCELED";
              }
            }
          }
          const orderMsg = `>>> Order ID **${order.orderId}**\nSymbol **${symbol
            .split("/")
            .join("")}**\nOrder Filled.\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
          sendMessageToChannel(discord, processOptions.discord?.channelId, orderMsg);
          return "FILLED";
        }
      } else {
        return "DOES NOT EXIST";
      }
      await delay(30000);
    } while (true);
  } else if (isDexTrade(exchange)) {
    do {
      const currentTime = Date.now();
      const activeOrders = await exchange.getAllOrders(toSymbolKey(symbol), "active", 500, 0);
      const filledOrders = await exchange.getAllOrders(toSymbolKey(symbol), "filled", 500, 0);
      const cancelledOrders = await exchange.getAllOrders(toSymbolKey(symbol), "cancelled", 500, 0);
      if (activeOrders !== undefined) {
        for (const activeOrder of activeOrders) {
          if (String(activeOrder.id) === order.orderId) {
            const orderAgeSeconds = Math.floor((currentTime - activeOrder.time_create * 1000) / 1000);
            const maxOrderAge = (symbolOptions.maximumAgeOfOrder ?? 0) * 60;
            if (orderAgeSeconds > maxOrderAge) {
              await cancelOrder(exchange, toSymbolKey(symbol), order.orderId);
              const orderMsg = `>>> Order ID **${order.orderId}**\nSymbol **${symbol
                .split("/")
                .join("")}**\nOrder Cancelled.\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
              sendMessageToChannel(discord, processOptions.discord?.channelId, orderMsg);
              return "CANCELED";
            } else {
              let unrealizedPNL = 0;
              if (order.isBuyer === true) {
                const orderBookBids = Object.keys(orderBook.bids)
                  .map((price) => parseFloat(price))
                  .sort((a, b) => b - a);
                unrealizedPNL = calculateUnrealizedPNLPercentageForShort(
                  parseFloat(order.qty),
                  parseFloat(order.price),
                  orderBookBids[0],
                );
              } else {
                const orderBookAsks = Object.keys(orderBook.asks)
                  .map((price) => parseFloat(price))
                  .sort((a, b) => a - b);
                unrealizedPNL = calculateUnrealizedPNLPercentageForLong(
                  parseFloat(order.qty),
                  parseFloat(order.price),
                  orderBookAsks[0],
                );
              }
              if (symbolOptions.closePercentage !== undefined && unrealizedPNL > symbolOptions.closePercentage) {
                await cancelOrder(exchange, toSymbolKey(symbol), order.orderId);
                const orderMsg = `>>> Order ID **${order.orderId}**\nSymbol **${symbol
                  .split("/")
                  .join("")}**\nOrder Cancelled.\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
                sendMessageToChannel(discord, processOptions.discord?.channelId, orderMsg);
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
        if (found === false) {
          if (cancelledOrders !== undefined) {
            for (const cancelledOrder of cancelledOrders) {
              if (String(cancelledOrder.id) === order.orderId) {
                const orderMsg = `>>> Order ID **${order.orderId}**\nSymbol **${symbol
                  .split("/")
                  .join("")}**\nOrder Cancelled.\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
                sendMessageToChannel(discord, processOptions.discord?.channelId, orderMsg);
                return "CANCELED";
              }
            }
          }
          const orderMsg = `>>> Order ID **${order.orderId}**\nSymbol **${symbol
            .split("/")
            .join("")}**\nOrder Filled.\nTime now ${new Date().toLocaleString("fi-fi")}\n`;
          sendMessageToChannel(discord, processOptions.discord?.channelId, orderMsg);
          return "FILLED";
        }
      } else {
        return "DOES NOT EXIST";
      }
      await delay(30000);
    } while (true);
  }
  return "";
};
