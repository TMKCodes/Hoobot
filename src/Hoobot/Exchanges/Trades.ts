import { Client } from "discord.js";
import { ConsoleLogger } from "../Utilities/ConsoleLogger";
import { ConfigOptions, ExchangeOptions, SymbolOptions, getSecondsFromInterval } from "../Utilities/Args";
import { Filter } from "./Filters";
import { cancelOrder, Order, checkBeforePlacingOrder } from "./Orders";
import { sendMessageToChannel } from "../../Discord/discord";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { play } from "../Utilities/PlaySound";
import { getOrderbook, Orderbook } from "./Orderbook";
import { Balances, getCurrentBalances } from "./Balances";
import { logToFile } from "../Utilities/LogToFile";
import path from "path";
import { Exchange, isBinance, isNonKYC } from "./Exchange";
import { NonKYCResponse, NonKYCTrades } from "./NonKYC/NonKYC";

const soundFile = "./alarm.mp3";

const sleep = async (ms: number) => await new Promise((r) => setTimeout(r, ms));

export interface Trade {
  symbol: string;
  id: string;
  orderId: string;
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

export const listenForTrades = async (
  exchange: Exchange,
  symbol: string,
  callback: (trades: Trade) => Promise<void>,
): Promise<void> => {
  if (isNonKYC(exchange)) {
    exchange.subscribeTrades(symbol, async (response: NonKYCResponse) => {
      if (response.params) {
        const trades = (response.params as NonKYCTrades).data;
        await callback({
          symbol: response.params.symbol,
          id: trades[0].id,
          orderId: trades[0].id,
          orderListID: 0,
          price: trades[0].price,
          qty: trades[0].quantity,
          quoteQty: "",
          commission: "",
          commissionAsset: "",
          time: new Date(trades[0].timestamp).getTime(),
          isBuyer: trades[0].side === "buy" ? true : false,
          isMaker: false,
          isBestMatch: true,
          profit: "",
        });
      }
    });
  } else if (isBinance(exchange)) {
    exchange.websockets.trades([symbol.split("/").join()], async (trades) => {
      await callback(trades);
    });
  }
};

export const calculateROI = (tradeHistory: Trade[]) => {
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
    return [totalBase, totalQuote];
  } else {
    return [0, 0];
  }
};

export const calculatePercentageDifference = (oldNumber: number, newNumber: number): number => {
  if (oldNumber === 0) return newNumber > 0 ? 100 : newNumber < 0 ? -100 : 0;
  const difference = newNumber - oldNumber;
  const percentageDifference = (difference / Math.abs(oldNumber)) * 100;
  return percentageDifference;
};

export const calculatePNLPercentageForLong = (entryPrice: number, exitPrice: number): number => {
  if (entryPrice === 0) return 0;
  return ((exitPrice - entryPrice) / entryPrice) * 100;
};

export const calculatePNLPercentageForShort = (entryPrice: number, exitPrice: number): number => {
  if (entryPrice === 0) return 0;
  return ((entryPrice - exitPrice) / entryPrice) * 100;
};

export const calculateUnrealizedPNLPercentageForLong = (
  entryQty: number,
  entryPrice: number,
  highestBidPrice: number,
): number => {
  if (entryPrice === 0 || entryQty === 0) return 0;
  return (((highestBidPrice - entryPrice) * entryQty) / (entryPrice * entryQty)) * 100;
};

export const calculateUnrealizedPNLPercentageForShort = (
  entryQty: number,
  entryPrice: number,
  lowestAskPrice: number,
): number => {
  if (entryPrice === 0 || entryQty === 0) return 0;
  return (((entryPrice - lowestAskPrice) * entryQty) / (entryPrice * entryQty)) * 100;
};

export const getTradeHistory = async (exchange: Exchange, symbol: string) => {
  let tradeHistory: Trade[] = [];
  if (isBinance(exchange)) {
    tradeHistory = await exchange.trades(symbol.split("/").join(""));
    return tradeHistory;
  } else if (isNonKYC(exchange)) {
    const history = await exchange.getAllTrades(symbol, 500, 0);
    history.sort((a: { createdAt: number }, b: { createdAt: number }) => a.createdAt - b.createdAt);
    tradeHistory = history.map(
      (trade: {
        id: string;
        orderid: string;
        price: string;
        quantity: string;
        fee: any;
        alternateFeeAsset: any;
        createdAt: any;
        side: string;
      }) => ({
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
        isBuyer: trade.side === "buy" ? true : false,
        isMaker: true,
        isBestMatch: true,
      }),
    );
    return tradeHistory;
  }
  return [];
};

export const delay = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const updateForce = (symbol: string) => {
  const forcePath = "./settings/force.json";
  if (!existsSync(forcePath)) {
    return false;
  }
  const file = readFileSync(forcePath, "utf-8");
  const force = JSON.parse(file !== "" ? file : "{}");
  if (force[symbol.split("/").join("")] === undefined) {
    force[symbol.split("/").join("")] = {
      skip: false,
    };
  } else {
    force[symbol.split("/").join("")].skip = false;
  }
  writeFileSync(forcePath, JSON.stringify(force));
  return true;
};

export const readForceSkip = (symbol: string): boolean => {
  const forcePath = "./settings/force.json";
  if (!existsSync(forcePath)) {
    return false;
  }
  const file = readFileSync(forcePath, "utf-8");
  const force = JSON.parse(file !== "" ? file : "{}");
  if (force[symbol.split("/").join("")] === undefined) {
    return false;
  }
  const skip = force[symbol.split("/").join("")].skip;
  if (skip === undefined) {
    return false;
  }
  return skip;
};

var blocks: string[] = [];

export const isBlocking = async (symbol: string): Promise<boolean> => {
  symbol = symbol.replace("/", "");
  if (blocks.length > 0) {
    for (const block of blocks) {
      if (block === symbol) {
        return true;
      }
    }
  }
  return false;
};

export const createBlock = async (symbol: string) => {
  blocks = [...blocks, symbol.replace("/", "")];
};

export const removeBlock = async (symbol: string) => {
  symbol = symbol.replace("/", "");
  blocks = blocks.filter((block) => block !== symbol);
};

const roundStep = (price: number, size: number): number => {
  if (size === 0) return price;
  const tickSizePrecision = Math.floor(Math.log10(Math.abs(size))) * -1;
  const roundedPrice = Math.round(price / size) * size;
  if (tickSizePrecision > 0 && tickSizePrecision < 100) {
    return Number(roundedPrice.toFixed(tickSizePrecision));
  } else {
    return Number(roundedPrice);
  }
};

type SweepDirection = "BUY" | "SELL";

interface BookLevel {
  price: number;
  quantity: number;
}

interface SweepOrderResult {
  executedBase: number;
  executedQuote: number;
  finalStatus: string;
  orderId: string;
}

interface SweepExecutionSummary {
  executedBase: number;
  executedQuote: number;
  averagePrice: number;
  levelCount: number;
  fullyFilled: boolean;
  stoppedByPriceGuard?: boolean;
  lastOrder?: Order;
}

interface SweepPriceEstimate {
  averagePrice: number;
  executableBase: number;
  worstPrice: number;
}

interface SweepPriceGuard {
  ceiling?: number;
  floor?: number;
}

const normalizeOrderStatus = (status: string | undefined): string => {
  const normalized = (status ?? "").toUpperCase();
  if (normalized === "CANCELLED") {
    return "CANCELED";
  }
  if (normalized === "ACTIVE") {
    return "NEW";
  }
  return normalized;
};

const getBestBookLevel = (orderBook: Orderbook, direction: SweepDirection): BookLevel | undefined => {
  const depth = direction === "SELL" ? orderBook.bids : orderBook.asks;
  const levels = Object.keys(depth)
    .map((price) => ({
      price: parseFloat(price),
      quantity: Number(depth[price]),
    }))
    .filter((level) => Number.isFinite(level.price) && level.price > 0 && Number.isFinite(level.quantity) && level.quantity > 0)
    .sort((left, right) => (direction === "SELL" ? right.price - left.price : left.price - right.price));

  return levels[0];
};

const estimateSweepPrice = (
  direction: SweepDirection,
  orderBook: Orderbook,
  desiredBaseQuantity: number,
  quoteBudget?: number,
): SweepPriceEstimate => {
  const depth = direction === "SELL" ? orderBook.bids : orderBook.asks;
  const levels = Object.keys(depth)
    .map((price) => ({
      price: parseFloat(price),
      quantity: Number(depth[price]),
    }))
    .filter((level) => Number.isFinite(level.price) && level.price > 0 && Number.isFinite(level.quantity) && level.quantity > 0)
    .sort((left, right) => (direction === "SELL" ? right.price - left.price : left.price - right.price));

  let remainingBase = desiredBaseQuantity;
  let remainingQuoteBudget = quoteBudget ?? Number.POSITIVE_INFINITY;
  let totalBase = 0;
  let totalQuote = 0;
  let worstPrice = 0;

  for (const level of levels) {
    if (remainingBase <= 0 || remainingQuoteBudget <= 0) {
      break;
    }

    let executableBase = Math.min(remainingBase, level.quantity);
    if (direction === "BUY") {
      executableBase = Math.min(executableBase, remainingQuoteBudget / level.price);
    }

    if (!Number.isFinite(executableBase) || executableBase <= 0) {
      continue;
    }

    totalBase += executableBase;
    totalQuote += executableBase * level.price;
    worstPrice = level.price;
    remainingBase -= executableBase;
    if (direction === "BUY") {
      remainingQuoteBudget -= executableBase * level.price;
    }
  }

  return {
    averagePrice: totalBase > 0 ? totalQuote / totalBase : 0,
    executableBase: totalBase,
    worstPrice,
  };
};

const isPriceWithinGuard = (direction: SweepDirection, price: number, guard?: SweepPriceGuard) => {
  if (guard === undefined) {
    return true;
  }
  if (direction === "BUY" && guard.ceiling !== undefined) {
    return price <= guard.ceiling;
  }
  if (direction === "SELL" && guard.floor !== undefined) {
    return price >= guard.floor;
  }
  return true;
};

const getExecutedBaseForOrder = async (exchange: Exchange, symbol: string, orderId: string) => {
  if (isBinance(exchange)) {
    const status = await exchange.orderStatus(symbol.split("/").join(""), orderId);
    return {
      status: normalizeOrderStatus(status?.status),
      executedBase: parseFloat(status?.executedQty ?? "0"),
    };
  }

  if (isNonKYC(exchange)) {
    const status = await exchange.getOrderByID(orderId);
    return {
      status: normalizeOrderStatus(status?.status),
      executedBase: parseFloat(status?.executedQuantity ?? "0"),
    };
  }

  return {
    status: "UNKNOWN",
    executedBase: 0,
  };
};

const executeImmediateLimitChunk = async (
  exchange: Exchange,
  symbol: string,
  direction: SweepDirection,
  price: number,
  quantityInBase: number,
  exchangeOptions: ExchangeOptions,
): Promise<SweepOrderResult> => {
  const placedOrder =
    direction === "SELL"
      ? await placeSellOrder(exchange, exchangeOptions, symbol, quantityInBase, price)
      : await placeBuyOrder(exchange, exchangeOptions, symbol, quantityInBase, price);

  if (placedOrder === undefined) {
    return {
      executedBase: 0,
      executedQuote: 0,
      finalStatus: "FAILED",
      orderId: "",
    };
  }

  let executedBase = 0;
  let finalStatus = normalizeOrderStatus(placedOrder.orderStatus);

  for (let attempt = 0; attempt < 5; attempt++) {
    await delay(250);
    const execution = await getExecutedBaseForOrder(exchange, symbol, placedOrder.orderId);
    executedBase = execution.executedBase;
    finalStatus = execution.status;
    if (["FILLED", "CANCELED", "EXPIRED", "REJECTED"].includes(finalStatus)) {
      break;
    }
  }

  if (executedBase < quantityInBase && !["CANCELED", "EXPIRED", "REJECTED"].includes(finalStatus)) {
    try {
      await cancelOrder(exchange, symbol.split("/").join(""), placedOrder.orderId);
    } catch (_error) {}
    await delay(250);
    const execution = await getExecutedBaseForOrder(exchange, symbol, placedOrder.orderId);
    executedBase = execution.executedBase;
    finalStatus = execution.status;
  }

  return {
    executedBase,
    executedQuote: executedBase * price,
    finalStatus,
    orderId: placedOrder.orderId,
  };
};

const executeSweep = async (
  exchange: Exchange,
  exchangeOptions: ExchangeOptions,
  symbol: string,
  direction: SweepDirection,
  filter: Filter,
  targetBaseQuantity: number,
  quoteBudget?: number,
  priceGuard?: SweepPriceGuard,
): Promise<SweepExecutionSummary> => {
  let remainingBase = targetBaseQuantity;
  let remainingQuoteBudget = quoteBudget ?? Number.POSITIVE_INFINITY;
  let executedBase = 0;
  let executedQuote = 0;
  let levelCount = 0;
  let lastOrder: Order | undefined = undefined;
  let idleAttempts = 0;
  let stoppedByPriceGuard = false;

  while (remainingBase > 0 && remainingQuoteBudget > 0 && levelCount < 100) {
    const liveOrderBook = await getOrderbook(exchange, symbol);
    const bestLevel = getBestBookLevel(liveOrderBook, direction);
    if (bestLevel === undefined) {
      break;
    }

    if (!isPriceWithinGuard(direction, bestLevel.price, priceGuard)) {
      stoppedByPriceGuard = true;
      break;
    }

    const roundedPrice = roundStep(bestLevel.price, filter.tickSize);
    let desiredBaseAtLevel = Math.min(remainingBase, bestLevel.quantity);
    if (direction === "BUY") {
      desiredBaseAtLevel = Math.min(desiredBaseAtLevel, remainingQuoteBudget / roundedPrice);
    }
    const roundedBaseQuantity = roundStep(desiredBaseAtLevel, filter.stepSize);

    if (!Number.isFinite(roundedBaseQuantity) || roundedBaseQuantity <= 0) {
      break;
    }

    if (!checkBeforePlacingOrder(roundedBaseQuantity, roundedPrice, filter)) {
      break;
    }

    const chunk = await executeImmediateLimitChunk(
      exchange,
      symbol,
      direction,
      roundedPrice,
      roundedBaseQuantity,
      exchangeOptions,
    );

    if (chunk.executedBase <= 0) {
      idleAttempts += 1;
      if (idleAttempts >= 3) {
        break;
      }
      continue;
    }

    idleAttempts = 0;
    levelCount += 1;
    executedBase += chunk.executedBase;
    executedQuote += chunk.executedQuote;
    remainingBase = Math.max(0, remainingBase - chunk.executedBase);
    remainingQuoteBudget = Math.max(0, remainingQuoteBudget - chunk.executedQuote);
    lastOrder = {
      symbol: symbol.split("/").join(""),
      orderId: chunk.orderId,
      price: roundedPrice.toString(),
      qty: chunk.executedBase.toString(),
      quoteQty: chunk.executedQuote.toString(),
      commission: "",
      commissionAsset: "",
      time: Date.now(),
      isBuyer: direction === "BUY",
      isMaker: true,
      isBestMatch: true,
      orderStatus: chunk.finalStatus,
      tradeId: chunk.orderId === "" ? 0 : parseFloat(chunk.orderId),
    };
  }

  return {
    executedBase,
    executedQuote,
    averagePrice: executedBase > 0 ? executedQuote / executedBase : 0,
    levelCount,
    fullyFilled: remainingBase <= 0,
    stoppedByPriceGuard,
    lastOrder,
  };
};

export const placeSellOrder = async (
  exchange: Exchange,
  exchangeOptions: ExchangeOptions,
  symbol: string,
  quantityInBase: number,
  price: number,
  maxRetries: number = 5,
): Promise<Order | undefined> => {
  if (price === undefined || Number.isNaN(price)) {
    return undefined;
  }
  if (quantityInBase === undefined || Number.isNaN(quantityInBase)) {
    return undefined;
  }
  let retries = 0;
  while (retries < maxRetries) {
    try {
      if (isBinance(exchange)) {
        logToFile(
          "./logs/trades-binance.log",
          `${Date.now().toLocaleString("fi-FI")} ${symbol} sell at ${price} price, ${quantityInBase} qty`,
        );
        return await exchange.sell(symbol.split("/").join(""), quantityInBase, price);
      } else if (isNonKYC(exchange)) {
        logToFile(
          "./logs/trades-xeggex.log",
          `${Date.now().toLocaleString("fi-FI")}${symbol} sell at ${price} price, ${quantityInBase} qty`,
        );
        const xeggexOrder = await exchange.newOrder(symbol, "sell", "limit", quantityInBase, price);
        if (xeggexOrder) {
          const order: Order = {
            symbol: symbol.split("/").join(""),
            orderId: xeggexOrder.id,
            price: xeggexOrder.price,
            qty: xeggexOrder.quantity,
            quoteQty: (parseFloat(xeggexOrder.quantity) * parseFloat(xeggexOrder.price)).toString(),
            commission: "",
            commissionAsset: "",
            time: xeggexOrder.createdAt,
            isBuyer: xeggexOrder.side === "buy" ? true : false,
            isMaker: true,
            isBestMatch: true,
            orderStatus: "NEW",
            tradeId: parseFloat(xeggexOrder.id),
          };
          return order;
        }
      }
    } catch (error) {
      console.error(`Error happened in placing SELL order ${error}, retrying (${retries}/${maxRetries})`);
      if (error.code === 20001 || error.code === -2021 || error.code === -2010) {
        console.error(
          `Insufficient funds for SELL order creation in ${symbol}, decreasing quantity for next try by 1%`,
        );
        quantityInBase = quantityInBase * 0.99;
        exchangeOptions.balances = await getCurrentBalances(exchange);
      } else {
        logToFile("./logs/error.log", JSON.stringify(error, null, 4));
        console.error(error);
      }
    }
  }
  return undefined;
};

export const placeBuyOrder = async (
  exchange: Exchange,
  exchangeOptions: ExchangeOptions,
  symbol: string,
  quantityInBase: number,
  price: number,
  maxRetries: number = 5,
): Promise<Order | undefined> => {
  if (price === undefined || Number.isNaN(price)) {
    return undefined;
  }
  if (quantityInBase === undefined || Number.isNaN(quantityInBase)) {
    return undefined;
  }
  let retries = 0;
  while (retries < maxRetries) {
    try {
      if (isBinance(exchange)) {
        logToFile(
          "./logs/trades-binance.log",
          `${Date.now().toLocaleString("fi-FI")} ${symbol} buy at ${price} price, ${quantityInBase} qty`,
        );
        return await exchange.buy(symbol.split("/").join(""), quantityInBase, price);
      } else if (isNonKYC(exchange)) {
        logToFile(
          "./logs/trades-xeggex.log",
          `${Date.now().toLocaleString("fi-FI")} ${symbol} buy at ${price} price, ${quantityInBase} qty`,
        );
        const xeggexOrder = await exchange.newOrder(symbol, "buy", "limit", quantityInBase, price);
        const order = {
          symbol: symbol.split("/").join(""),
          orderId: xeggexOrder.id,
          price: xeggexOrder.price,
          qty: xeggexOrder.quantity,
          quoteQty: (parseFloat(xeggexOrder.quantity) * parseFloat(xeggexOrder.price)).toString(),
          commission: "",
          commissionAsset: "",
          time: xeggexOrder.createdAt,
          isBuyer: xeggexOrder.side === "buy" ? true : false,
          isMaker: true,
          isBestMatch: true,
          orderStatus: "NEW",
          tradeId: parseFloat(xeggexOrder.id),
        };
        return order;
      }
    } catch (error) {
      retries++;
      console.error(`Error happened in placing BUY order ${error}, retrying (${retries}/${maxRetries})`);
      if (error.code === 20001 || error.code === -2021 || error.code === -2010) {
        console.error(`Insufficient funds for BUY order creation in ${symbol}, decreasing quantity for next try by 1%`);
        quantityInBase = quantityInBase * 0.99;
        exchangeOptions.balances = await getCurrentBalances(exchange);
      } else {
        logToFile("./logs/error.log", JSON.stringify(error, null, 4));
        console.error(error);
      }
    }
  }
  console.error(`Max retries reached for placing buy order in ${symbol}`);
  return undefined;
};

export const getPreviousTrades = (
  direction: string,
  ExchangeOptions: ExchangeOptions,
  symbolOptions: SymbolOptions,
) => {
  const trades = ExchangeOptions.tradeHistory[symbolOptions.name.split("/").join("")];
  let previousTrade = null;
  let olderTrade = null;
  for (let i = trades.length - 1; i >= 0; i--) {
    if (direction === "SELL" && trades[i].isBuyer) {
      previousTrade = trades[i];
      for (let x = i - 1; x >= 0; x--) {
        if (!trades[x].isBuyer) {
          olderTrade = trades[x];
          break;
        }
      }
      break;
    } else if (direction === "BUY" && !trades[i].isBuyer) {
      previousTrade = trades[i];
      for (let x = i - 1; x >= 0; x--) {
        if (trades[x].isBuyer) {
          olderTrade = trades[x];
          break;
        }
      }
      break;
    }
  }
  return { previousTrade, olderTrade };
};

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
  symbolOptions: SymbolOptions,
  forceQuantityInBase: number | undefined,
): Promise<Order | boolean> => {
  const baseBalance = exchangeOptions.balances![symbol.split("/")[0]].crypto;
  if (orderBook === undefined || orderBook.bids === undefined) {
    orderBook = await getOrderbook(exchange, symbol);
  }
  const bestBidLevel = getBestBookLevel(orderBook, "SELL");
  if (bestBidLevel === undefined) {
    return false;
  }
  let quantityInBase = baseBalance * 0.98;
  quantityInBase = maxSellAmount(quantityInBase, symbolOptions);
  if (forceQuantityInBase !== undefined) {
    quantityInBase = forceQuantityInBase;
  }
  const estimatedExecution = estimateSweepPrice("SELL", orderBook, quantityInBase);
  const strictSellFloor = Math.max(
    estimatedExecution.worstPrice > 0 ? estimatedExecution.worstPrice : 0,
    symbolOptions.price?.enabled === true && symbolOptions.price?.minimumSell !== undefined
      ? symbolOptions.price.minimumSell
      : 0,
  );
  const roundedPrice = roundStep(estimatedExecution.averagePrice > 0 ? estimatedExecution.averagePrice : bestBidLevel.price, filter.tickSize);
  if (
    symbolOptions.price?.enabled === true &&
    symbolOptions.price?.maximumSell !== undefined &&
    symbolOptions.price?.maximumSell < roundedPrice // Check if price is too high
  ) {
    consoleLogger.push("error", "Too high price to sell.");
    return false;
  }
  if (
    symbolOptions.price?.enabled === true &&
    symbolOptions.price?.minimumSell !== undefined &&
    symbolOptions.price?.minimumSell > roundedPrice // Check if price is too low
  ) {
    consoleLogger.push("error", "Too low price to sell.");
    return false;
  }
  const roundedQuantityInBase = roundStep(quantityInBase, filter.stepSize);
  const estimatedQuote = estimatedExecution.averagePrice * roundedQuantityInBase;
  const roundedQuantityInQuote = roundStep(estimatedQuote, filter.stepSize);
  if (roundedQuantityInQuote < 1.1) {
    consoleLogger.push("error", "Too low quantity to sell. Minimum 1.1 Quote.");
    return false;
  }
  if (process.env.DEBUG === "true") {
    logToFile(
      "./logs/debug.log",
      `TRADEDATA SELL SWEEP ${bestBidLevel.price} ${roundedPrice} ${filter.tickSize} ${roundedQuantityInBase} ${roundedQuantityInQuote}`,
    );
  }
  if (checkBeforePlacingOrder(roundedQuantityInBase, roundedPrice, filter) === true) {
    let unrealizedPNL = 0;
    if (profit !== "GRID" && profit !== "SKIP") {
      if (
        exchangeOptions.tradeHistory !== undefined &&
        exchangeOptions.tradeHistory[symbol.split("/").join("")]?.length > 0
      ) {
        const { previousTrade, olderTrade } = getPreviousTrades("SELL", exchangeOptions, symbolOptions);
        if (previousTrade) {
          unrealizedPNL = calculateUnrealizedPNLPercentageForLong(
            parseFloat(previousTrade.qty),
            parseFloat(previousTrade.price),
            roundedPrice,
          );
          if (symbolOptions.profit !== undefined && symbolOptions.profit.minimumSell === 0) {
            symbolOptions.profit.minimumSell = Number.MIN_SAFE_INTEGER;
          }
          if (
            symbolOptions.profit !== undefined &&
            profit !== "STOP_LOSS" &&
            profit !== "TAKE_PROFIT" &&
            symbolOptions.profit?.minimumSell !== 0
          ) {
            if (
              symbolOptions.profit.enabled === true &&
              unrealizedPNL < symbolOptions.profit.minimumSell + symbolOptions.tradeFeePercentage! &&
              readForceSkip(symbol.split("/").join("")) === false
            ) {
              consoleLogger.push("error", "Not positive trade " + unrealizedPNL);
              return false;
            }
          }
        }
      }
    }
    if ((await isBlocking(symbol)) === true) {
      return false;
    }
    createBlock(symbol);
    const execution = await executeSweep(
      exchange,
      exchangeOptions,
      symbol,
      "SELL",
      filter,
      roundedQuantityInBase,
      undefined,
      {
        floor: strictSellFloor > 0 ? strictSellFloor : undefined,
      },
    );
    if (execution.executedBase > 0) {
      play(soundFile);
      const averageExecutionPrice = execution.averagePrice > 0 ? execution.averagePrice : roundedPrice;
      const executedQuote = execution.executedQuote;
      let msg = "```";
      msg += `SELL SWEEP: ${execution.levelCount} levels\r\n`;
      msg += `Symbol: ${symbol}\r\n`;
      msg += `Base quantity: ${execution.executedBase.toFixed(8)}\r\n`;
      msg += `Quote quantity: ${executedQuote.toFixed(8)}\r\n`;
      msg += `Average price: ${averageExecutionPrice.toFixed(8)}\r\n`;
      msg += `Filled: ${execution.fullyFilled ? "YES" : "PARTIAL"}\r\n`;
      if (execution.stoppedByPriceGuard === true) {
        msg += `Guard: STOPPED_AT_PRICE_FLOOR ${strictSellFloor.toFixed(8)}\r\n`;
      }
      msg += `Profit if trade fulfills: ${unrealizedPNL.toFixed(2)}%\r\n`;
      msg += `Time now ${new Date().toLocaleString("fi-fi")}\r\n`;
      msg += "```";
      symbolOptions.currentOrder = undefined;
      sendMessageToChannel(discord, processOptions.discord.channelId!, msg);
      updateBuyAmount(executedQuote, symbolOptions);
      if (symbolOptions.takeProfit !== undefined) {
        symbolOptions.takeProfit.current = 0;
      }
      updateForce(symbol);
      exchangeOptions.balances = await getCurrentBalances(exchange);
      if (exchangeOptions.tradeHistory === undefined) {
        exchangeOptions.tradeHistory = {};
      }
      exchangeOptions.tradeHistory[symbol.split("/").join("")] = await getTradeHistory(exchange, symbol);
      removeBlock(symbol);
      return execution.lastOrder ?? true;
    } else {
      removeBlock(symbol);
      return false;
    }
  } else {
    consoleLogger.push("error", "Filter limits failed a check. Check your balances!");
    return false;
  }
};

const maxBuyAmount = (quoteQuantity: number, symbolOptions: SymbolOptions) => {
  if (symbolOptions.growingMax) {
    if (symbolOptions.growingMax.buy === undefined) {
      return quoteQuantity;
    } else if (symbolOptions.growingMax.buy > 0) {
      return Math.min(quoteQuantity, symbolOptions.growingMax.buy);
    } else {
      return quoteQuantity;
    }
  } else {
    return quoteQuantity;
  }
};

const updateBuyAmount = (quoteQuantity: number, symbolOptions: SymbolOptions) => {
  if (symbolOptions.growingMax) {
    if (symbolOptions.growingMax.buy > 0) {
      symbolOptions.growingMax.buy = Math.max(quoteQuantity, symbolOptions.growingMax.buy);
    }
  }
};

const maxSellAmount = (baseQuantity: number, symbolOptions: SymbolOptions) => {
  if (symbolOptions.growingMax) {
    if (symbolOptions.growingMax.sell === undefined) {
      return baseQuantity;
    } else if (symbolOptions.growingMax.sell > 0) {
      return Math.min(baseQuantity, symbolOptions.growingMax.sell);
    } else {
      return baseQuantity;
    }
  } else {
    return baseQuantity;
  }
};

const updateSellAmount = (baseQuantity: number, symbolOptions: SymbolOptions) => {
  if (symbolOptions.growingMax) {
    if (symbolOptions.growingMax.sell > 0) {
      symbolOptions.growingMax.sell = Math.max(baseQuantity, symbolOptions.growingMax.sell);
    }
  }
};

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
  symbolOptions: SymbolOptions,
  forceQuantityInBase: number | undefined,
): Promise<Order | boolean> => {
  const quoteBalance = exchangeOptions.balances![symbol.split("/")[1]].crypto;
  if (orderBook === undefined || orderBook.asks === undefined) {
    orderBook = await getOrderbook(exchange, symbol);
  }
  const bestAskLevel = getBestBookLevel(orderBook, "BUY");
  if (bestAskLevel === undefined) {
    return false;
  }
  let quantityInQuote = maxBuyAmount(quoteBalance, symbolOptions);
  let targetBaseQuantity = quantityInQuote / bestAskLevel.price;
  if (forceQuantityInBase !== undefined) {
    targetBaseQuantity = forceQuantityInBase;
  }
  const estimatedExecution = estimateSweepPrice("BUY", orderBook, targetBaseQuantity, quantityInQuote);
  if (estimatedExecution.executableBase <= 0) {
    return false;
  }
  const configuredBuyCeiling =
    symbolOptions.price?.enabled === true && symbolOptions.price?.maximumBuy !== undefined
      ? symbolOptions.price.maximumBuy
      : Number.POSITIVE_INFINITY;
  const visibleBuyCeiling = estimatedExecution.worstPrice > 0 ? estimatedExecution.worstPrice : configuredBuyCeiling;
  const strictBuyCeiling = Math.min(configuredBuyCeiling, visibleBuyCeiling);
  const roundedPrice = roundStep(
    estimatedExecution.averagePrice > 0 ? estimatedExecution.averagePrice : bestAskLevel.price,
    filter.tickSize,
  );
  if (
    symbolOptions.price?.enabled === true &&
    symbolOptions.price?.maximumBuy !== undefined &&
    symbolOptions.price?.maximumBuy < roundedPrice // Check if price is too high
  ) {
    consoleLogger.push("error", "Too high price to buy.");
    return false;
  }
  if (
    symbolOptions.price?.enabled === true &&
    symbolOptions.price?.minimumBuy !== undefined &&
    symbolOptions.price?.minimumBuy > roundedPrice // Check if price is too low
  ) {
    consoleLogger.push("error", "Too low price to buy.");
    return false;
  }
  const quantityInBase = Math.min(targetBaseQuantity, estimatedExecution.executableBase) * 0.98;
  if (!isFinite(quantityInBase)) {
    consoleLogger.push("error", "Invalid quantity calculation due to zero or invalid price.");
    return false;
  }
  const roundedQuantityInBase = roundStep(quantityInBase, filter.stepSize);
  const roundedQuantityInQuote = roundStep(quantityInQuote, filter.stepSize);
  if (roundedQuantityInQuote < 1.1) {
    consoleLogger.push("error", "Too low quantity to buy. Minimum 1.1 Quote.");
    return false;
  }
  if (process.env.DEBUG === "true") {
    logToFile(
      "./logs/debug.log",
      `TRADEDATA BUY SWEEP ${bestAskLevel.price} ${roundedPrice} ${filter.tickSize} ${roundedQuantityInBase} ${roundedQuantityInQuote}`,
    );
  }
  if (checkBeforePlacingOrder(roundedQuantityInBase, roundedPrice, filter) === true) {
    let unrealizedPNL = 0;
    if (profit !== "GRID" && profit !== "SKIP") {
      if (
        exchangeOptions.tradeHistory !== undefined &&
        exchangeOptions.tradeHistory[symbol.split("/").join("")]?.length > 0
      ) {
        const { previousTrade, olderTrade } = getPreviousTrades("BUY", exchangeOptions, symbolOptions);
        if (previousTrade) {
          unrealizedPNL = calculateUnrealizedPNLPercentageForShort(
            parseFloat(previousTrade.qty),
            parseFloat(previousTrade.price),
            roundedPrice,
          );
          if (symbolOptions.profit !== undefined && symbolOptions.profit.minimumBuy === 0) {
            symbolOptions.profit.minimumBuy = Number.MIN_SAFE_INTEGER;
          }
          if (
            symbolOptions.profit !== undefined &&
            profit !== "STOP_LOSS" &&
            profit !== "TAKE_PROFIT" &&
            symbolOptions.profit?.minimumBuy !== 0
          ) {
            if (
              symbolOptions.profit.enabled === true &&
              unrealizedPNL < symbolOptions.profit.minimumBuy + symbolOptions.tradeFeePercentage! &&
              readForceSkip(symbol.split("/").join("")) === false
            ) {
              consoleLogger.push("error", "Not positive trade " + unrealizedPNL);
              return false;
            }
          }
        }
      }
    }
    if ((await isBlocking(symbol)) === true) {
      return false;
    }
    createBlock(symbol);
    const execution = await executeSweep(
      exchange,
      exchangeOptions,
      symbol,
      "BUY",
      filter,
      roundedQuantityInBase,
      quantityInQuote,
      {
        ceiling: Number.isFinite(strictBuyCeiling) ? strictBuyCeiling : undefined,
      },
    );
    if (execution.executedBase > 0) {
      play(soundFile);
      const averageExecutionPrice = execution.averagePrice > 0 ? execution.averagePrice : roundedPrice;
      let msg = "```";
      msg += `BUY SWEEP: ${execution.levelCount} levels\r\n`;
      msg += `Symbol: ${symbol}\r\n`;
      msg += `Base quantity: ${execution.executedBase.toFixed(8)}\r\n`;
      msg += `Quote quantity: ${execution.executedQuote.toFixed(8)}\r\n`;
      msg += `Average price: ${averageExecutionPrice.toFixed(8)}\r\n`;
      msg += `Filled: ${execution.fullyFilled ? "YES" : "PARTIAL"}\r\n`;
      if (execution.stoppedByPriceGuard === true && Number.isFinite(strictBuyCeiling)) {
        msg += `Guard: STOPPED_AT_PRICE_CEILING ${strictBuyCeiling.toFixed(8)}\r\n`;
      }
      msg += `Profit if trade fulfills: ${unrealizedPNL.toFixed(2)}%\r\n`;
      msg += `Time now ${new Date().toLocaleString("fi-fi")}\r\n`;
      msg += "```";

      symbolOptions.currentOrder = undefined;
      sendMessageToChannel(discord, processOptions.discord.channelId!, msg);
      updateSellAmount(execution.executedBase, symbolOptions);
      if (symbolOptions.takeProfit !== undefined) {
        symbolOptions.takeProfit.current = 0;
      }
      updateForce(symbol);
      exchangeOptions.balances = await getCurrentBalances(exchange);
      if (exchangeOptions.tradeHistory === undefined) {
        exchangeOptions.tradeHistory = {};
      }
      exchangeOptions.tradeHistory[symbol.split("/").join("")] = await getTradeHistory(exchange, symbol);
      removeBlock(symbol);
      return execution.lastOrder ?? true;
    } else {
      removeBlock(symbol);
      return false;
    }
  } else {
    consoleLogger.push("error", "Filter limits failed a check. Check your balances!");
    return false;
  }
};

export const checkPreviousTrade = (symbol: string, exchangeOptions: ExchangeOptions) => {
  let check = "SELL";
  if (
    exchangeOptions.tradeHistory !== undefined &&
    exchangeOptions.tradeHistory[symbol.split("/").join("")].length > 0
  ) {
    const lastTrade =
      exchangeOptions.tradeHistory[symbol.split("/").join("")][
        exchangeOptions.tradeHistory[symbol.split("/").join("")].length - 1
      ];
    if (lastTrade.isBuyer) {
      check = "BUY";
    } else {
      check = "SELL";
    }
  }
  return check;
};

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
  logger: ConsoleLogger,
) => {
  // console.log(time);
  if (price === null || quantity === 0) {
    return false;
  }
  let baseQuantity = quantity;
  let quoteQuantity = quantity * price;
  if (checkBeforePlacingOrder(baseQuantity, price, filter) === true) {
    let fee = quoteQuantity * (0.075 / 100);
    let quoteQuontityWithoutFee = quoteQuantity - fee;
    let lastTrade: Trade = {
      symbol: "",
      id: "",
      orderId: "",
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
    };
    let pnl = 0;
    if (
      exchangeOptions.tradeHistory !== undefined &&
      exchangeOptions.tradeHistory[symbol.split("/").join("")].length > 0
    ) {
      lastTrade =
        exchangeOptions.tradeHistory[symbol.split("/").join("")][
          exchangeOptions.tradeHistory[symbol.split("/").join("")].length - 1
        ];
      pnl = calculatePNLPercentageForLong(parseFloat(lastTrade.price), price);
    }
    if (exchangeOptions.tradeHistory === undefined) {
      exchangeOptions.tradeHistory = {};
    }
    if (
      symbolOptions.profit !== undefined &&
      profit !== "STOP_LOSS" &&
      profit !== "TAKE_PROFIT" &&
      symbolOptions.profit?.minimumSell !== 0
    ) {
      if (
        symbolOptions.profit.enabled === true &&
        pnl < symbolOptions.profit.minimumSell + symbolOptions.tradeFeePercentage! &&
        readForceSkip(symbol.split("/").join("")) === false
      ) {
        return false;
      }
    }
    exchangeOptions.tradeHistory[symbol.split("/").join("")].push({
      symbol: symbol.split("/").join(""),
      id: "",
      orderId: "",
      orderListID: pnl,
      price: price.toString(),
      qty: baseQuantity.toString(),
      quoteQty: quoteQuontityWithoutFee.toString(),
      commission: fee.toString(),
      commissionAsset: symbol.split("/")[1],
      time: time,
      isBuyer: false,
      isMaker: true,
      isBestMatch: true,
      profit: profit,
    });
    const baseCoin = symbol.split("/")[0];
    const quoteCoin = symbol.split("/")[1];
    balances[baseCoin].crypto = balances[baseCoin].crypto - baseQuantity;
    balances[quoteCoin].crypto = balances[quoteCoin].crypto + quoteQuontityWithoutFee;
    const sanitizedStartTime = options.startTime.replace(/:/g, "-");
    const filePath = `./simulation/${sanitizedStartTime}/trades.json`;
    const directory = path.dirname(filePath);
    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true });
    }
    if (symbolOptions.takeProfit !== undefined) {
      symbolOptions.takeProfit.current = 0;
    }
    updateBuyAmount(quoteQuantity, symbolOptions);
    writeFileSync(
      filePath,
      JSON.stringify(
        {
          symbol: symbol,
          direction: "SELL",
          quantity: baseQuantity,
          price: price,
          balances: balances,
          tradeHistory: exchangeOptions.tradeHistory,
        },
        null,
        2,
      ),
    );
    // logger.flush();
    // logger.push("Time", (new Date(time)).toLocaleString());
    logger.push("trade", "sell");
    logger.push("PNL", pnl);
    // logger.push("Balances", balances);
    // logger.print();
    // logger.flush();
  }
  return true;
};

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
  logger: ConsoleLogger,
): Promise<Boolean> => {
  // console.log(time);
  if (price === null || quantity === 0 || price === 0) {
    return false;
  }
  let quoteQuantity = quantity;
  quoteQuantity = maxBuyAmount(quoteQuantity, symbolOptions);
  let baseQuantity = quoteQuantity / price;
  if (checkBeforePlacingOrder(baseQuantity, price, filter) === true) {
    let fee = baseQuantity * (0.075 / 100);
    let baseQuantityWithoutFee = baseQuantity - fee;
    let lastTrade: Trade = {
      symbol: "",
      id: "",
      orderId: "",
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
    };
    let pnl = 0;
    if (options.tradeHistory !== undefined && exchangeOptions.tradeHistory[symbol.split("/").join("")].length >= 2) {
      lastTrade =
        exchangeOptions.tradeHistory[symbol.split("/").join("")][
          exchangeOptions.tradeHistory[symbol.split("/").join("")].length - 1
        ];
      pnl = calculatePNLPercentageForShort(parseFloat(lastTrade.price), price);
    }
    if (options.tradeHistory === undefined) {
      options.tradeHistory = {};
    }
    if (
      symbolOptions.profit !== undefined &&
      profit !== "STOP_LOSS" &&
      profit !== "TAKE_PROFIT" &&
      symbolOptions.profit?.minimumBuy !== 0
    ) {
      if (
        symbolOptions.profit.enabled === true &&
        pnl < symbolOptions.profit.minimumBuy + symbolOptions.tradeFeePercentage! &&
        readForceSkip(symbol.split("/").join("")) === false
      ) {
        return false;
      }
    }
    exchangeOptions.tradeHistory[symbol.split("/").join("")].push({
      symbol: symbol.split("/").join(""),
      id: "",
      orderId: "",
      orderListID: pnl,
      price: price.toString(),
      qty: baseQuantityWithoutFee.toString(),
      quoteQty: quoteQuantity.toString(),
      commission: fee.toString(),
      commissionAsset: symbol.split("/")[0],
      time: time,
      isBuyer: true,
      isMaker: true,
      isBestMatch: true,
      profit: profit,
    });
    const baseCoin = symbol.split("/")[0];
    const quoteCoin = symbol.split("/")[1];
    balances[baseCoin].crypto = balances[baseCoin].crypto + baseQuantity;
    balances[quoteCoin].crypto = balances[quoteCoin].crypto - quoteQuantity;
    const sanitizedStartTime = options.startTime.replace(/:/g, "-");
    const filePath = `./simulation/${sanitizedStartTime}/trades.json`;
    const directory = path.dirname(filePath);
    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true });
    }
    if (symbolOptions.takeProfit !== undefined) {
      symbolOptions.takeProfit.current = 0;
    }
    writeFileSync(
      filePath,
      JSON.stringify(
        {
          symbol: symbol,
          direction: "SELL",
          quantity: baseQuantity,
          price: price,
          balances: balances,
          tradeHistory: options.tradeHistory,
        },
        null,
        2,
      ),
    );
    // logger.flush();
    // logger.push("Time", (new Date(time)).toLocaleString());
    logger.push("Trade", "buy");
    logger.push("PNL", pnl);
    // logger.push("Balances", balances);
    // logger.print();
    // logger.flush();
  }
  return true;
};
