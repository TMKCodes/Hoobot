import { Client } from "discord.js";
import { ConsoleLogger } from "../Utilities/ConsoleLogger";
import { ConfigOptions, ExchangeOptions, SymbolOptions, getSecondsFromInterval, toSymbolKey } from "../Utilities/Args";

/** Stop loss tai Extreme idle-pakko — sallii sulun myös tappiolla. */
export const allowsForcedLossTrade = (profit: string): boolean => profit === "STOP_LOSS" || profit === "FORCE_IDLE";

/** Split symbol into base and quote assets with validation */
const splitSymbol = (symbol: string): [string, string] => {
  const parts = symbol.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid symbol format: ${symbol}. Expected BASE/QUOTE`);
  }
  return [parts[0], parts[1]];
};
import { Filter } from "./Filters";
import { handleOpenOrder, Order, checkBeforePlacingOrder } from "./Orders";
import { sendMessageToChannel } from "../../Discord/discord";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { play } from "../Utilities/PlaySound";
import { getOrderbook, Orderbook } from "./Orderbook";
import { Balances, getCurrentBalances } from "./Balances";
import { logToFile, safeStringifyForLogs } from "../Utilities/LogToFile";
import path from "path";
import { Exchange, isBinance, isNonKYC, isDexTrade } from "./Exchange";
import {
  meetsTakeProfitLimitForAction,
  recordTakeProfitPeakOnOrder,
  resetTakeProfitRuntimeForSymbol,
} from "../Indicators/Profit";
import { isTerminalOrderStatus, shouldClearTakeProfitAfterOrder } from "../Trading/orderFill";
import {
  computeLiveBuyExecution,
  computeLiveSellExecution,
  MIN_QUOTE_NOTIONAL,
  simFeeOnBase,
  simFeeOnQuote,
} from "../Trading/executionSizing";
import { NonKYCResponse, NonKYCTrades } from "./NonKYC/NonKYC";
import { DexTradeSocketHistEvent } from "./DexTrade/DexTrade";

export const clearTakeProfitAfterTrade = (symbol: string, symbolOptions: SymbolOptions): void => {
  resetTakeProfitRuntimeForSymbol(toSymbolKey(symbol));
  if (symbolOptions.takeProfit !== undefined) {
    symbolOptions.takeProfit.current = 0;
  }
  if (symbolOptions.takeProfitBuy !== undefined) {
    symbolOptions.takeProfitBuy.current = 0;
  }
};

/** Sim: short-sulun PnL kun historiassa vain avaus (isBuyer false). */
export const computeSimBuyClosePnl = (
  tradeHistory: Trade[] | undefined,
  closePrice: number,
  tradeFeePercentage?: number,
): number => {
  const th = tradeHistory ?? [];
  if (th.length < 1) return 0;
  const lastTrade = th[th.length - 1];
  if (!lastTrade.isBuyer) {
    let pnl = calculatePNLPercentageForShort(parseFloat(lastTrade.price), closePrice);
    pnl = applyRoundTripFeeToPnl(pnl, tradeFeePercentage);
    return pnl;
  }
  return 0;
};

const awaitLiveOrderFollowUp = async (
  discord: Client,
  exchange: Exchange,
  symbol: string,
  order: Order,
  orderBook: Orderbook,
  processOptions: ConfigOptions,
  symbolOptions: SymbolOptions,
  tradeNext: "SELL" | "BUY",
  unrealizedPNL: number,
): Promise<string> => {
  if (order.orderId === undefined) return "NO_ORDER_ID";
  recordTakeProfitPeakOnOrder(symbolOptions, tradeNext, unrealizedPNL);
  await delay(30000);
  const status = await handleOpenOrder(discord, exchange, symbol, order, orderBook, processOptions, symbolOptions);
  if (shouldClearTakeProfitAfterOrder(status)) {
    clearTakeProfitAfterTrade(symbol, symbolOptions);
  }
  if (isTerminalOrderStatus(status)) {
    symbolOptions.currentOrder = undefined;
  }
  return status;
};

const soundFile = "./alarm.mp3";

const sleep = async (ms: number) => await new Promise((r) => setTimeout(r, ms));
const applyRoundTripFeeToPnl = (pnl: number, feePerTradePct?: number): number => {
  const fee = (feePerTradePct ?? 0) * 2;
  return pnl - fee;
};
const isBinanceTimestampAheadError = (error: any): boolean => {
  if (Number(error?.code) === -1021) return true;
  const msg = String(error?.body ?? error?.msg ?? error ?? "");
  return msg.includes("Timestamp for this request");
};
const syncBinanceServerTime = async (exchange: Exchange): Promise<void> => {
  if (!isBinance(exchange)) return;
  try {
    const binanceAny = exchange as any;
    if (typeof binanceAny.useServerTime === "function") {
      await binanceAny.useServerTime();
    }
  } catch (err) {
    logToFile("./logs/error.log", safeStringifyForLogs({ context: "syncBinanceServerTime", err }));
  }
};

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
    exchange.websockets.trades([toSymbolKey(symbol)], async (trades) => {
      await callback(trades);
    });
  } else if (isDexTrade(exchange)) {
    const pairInfo = await exchange.getPairInfo(toSymbolKey(symbol));
    const rateDecimal = pairInfo?.rate_decimal ?? 8;
    const baseDecimal = pairInfo?.base_decimal ?? 8;
    exchange.subscribeTrades(toSymbolKey(symbol), async (event: DexTradeSocketHistEvent) => {
      const rate = event.data.rate / Math.pow(10, rateDecimal);
      const volume = event.data.volume / Math.pow(10, baseDecimal);
      await callback({
        symbol: toSymbolKey(symbol),
        id: event.data.time_create.toString(),
        orderId: event.data.pair_id.toString(),
        orderListID: 0,
        price: rate.toString(),
        qty: volume.toString(),
        quoteQty: (rate * volume).toString(),
        commission: "",
        commissionAsset: "",
        time: event.data.time_create * 1000,
        isBuyer: event.data.type === "BUY",
        isMaker: false,
        isBestMatch: true,
        profit: "",
      });
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
  const difference = newNumber - oldNumber;
  const percentageDifference = (difference / Math.abs(oldNumber)) * 100;
  return percentageDifference;
};

export const calculatePNLPercentageForLong = (entryPrice: number, exitPrice: number): number => {
  return ((exitPrice - entryPrice) / entryPrice) * 100;
};

export const calculatePNLPercentageForShort = (entryPrice: number, exitPrice: number): number => {
  return ((entryPrice - exitPrice) / entryPrice) * 100;
};

export const calculateUnrealizedPNLPercentageForLong = (
  entryQty: number,
  entryPrice: number,
  highestBidPrice: number,
): number => {
  return (((highestBidPrice - entryPrice) * entryQty) / (entryPrice * entryQty)) * 100;
};

export const calculateUnrealizedPNLPercentageForShort = (
  entryQty: number,
  entryPrice: number,
  lowestAskPrice: number,
): number => {
  return (((entryPrice - lowestAskPrice) * entryQty) / (entryPrice * entryQty)) * 100;
};

export const getTradeHistory = async (exchange: Exchange, symbol: string) => {
  let tradeHistory: Trade[] = [];
  if (isBinance(exchange)) {
    try {
      tradeHistory = await exchange.trades(toSymbolKey(symbol));
    } catch (error) {
      if (isBinanceTimestampAheadError(error)) {
        console.warn(`Binance aikaheitto (trades ${symbol}) — synkataan serveriaika ja yritetään uudelleen.`);
        await syncBinanceServerTime(exchange);
        tradeHistory = await exchange.trades(toSymbolKey(symbol));
      } else {
        throw error;
      }
    }
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
        symbol: toSymbolKey(symbol),
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
  } else if (isDexTrade(exchange)) {
    const history = await exchange.getAllTrades(toSymbolKey(symbol), 500, 0);
    history.sort((a: { createdAt: number }, b: { createdAt: number }) => a.createdAt - b.createdAt);
    tradeHistory = history.map((trade) => ({
      symbol: toSymbolKey(symbol),
      id: trade.id,
      orderId: trade.orderid,
      orderListID: parseFloat(trade.orderid),
      price: trade.price,
      qty: trade.quantity,
      quoteQty: (parseFloat(trade.quantity) * parseFloat(trade.price)).toString(),
      commission: trade.fee,
      commissionAsset: trade.alternateFeeAsset,
      time: trade.createdAt,
      isBuyer: trade.side === "buy",
      isMaker: true,
      isBestMatch: true,
    }));
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
  try {
    const file = readFileSync(forcePath, "utf-8");
    const force = JSON.parse(file !== "" ? file : "{}");
    if (typeof force !== "object" || force === null) return false;
    const key = toSymbolKey(symbol);
    if (force[key] === undefined) {
      force[key] = { skip: false };
    } else {
      force[key].skip = false;
    }
    writeFileSync(forcePath, JSON.stringify(force));
    return true;
  } catch {
    return false;
  }
};

export const readForceSkip = (symbol: string): boolean => {
  const forcePath = "./settings/force.json";
  if (!existsSync(forcePath)) {
    return false;
  }
  try {
    const file = readFileSync(forcePath, "utf-8");
    const force = JSON.parse(file !== "" ? file : "{}");
    if (typeof force !== "object" || force === null) return false;
    const key = toSymbolKey(symbol);
    if (force[key] === undefined) return false;
    const skip = force[key].skip;
    return skip === true;
  } catch {
    return false;
  }
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

export const createBlock = (symbol: string): void => {
  const key = symbol.replace("/", "");
  if (!blocks.includes(key)) {
    blocks.push(key);
  }
};

export const removeBlock = async (symbol: string) => {
  symbol = symbol.replace("/", "");
  blocks = blocks.filter((block) => block !== symbol);
};

const roundStep = (price: number, size: number): number => {
  const tickSizePrecision = Math.floor(Math.log10(Math.abs(size))) * -1;
  const roundedPrice = Math.round(price / size) * size;
  if (tickSizePrecision > 0 && tickSizePrecision < 100) {
    return Number(roundedPrice.toFixed(tickSizePrecision));
  } else {
    return Number(roundedPrice);
  }
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
  if (exchangeOptions.dryRun === true) {
    logToFile(
      "./logs/trades-binance.log",
      `[DRY RUN] ${Date.now()} ${symbol} sell at ${price} price, ${quantityInBase} qty (no order placed)`,
    );
    const sym = toSymbolKey(symbol);
    return {
      symbol: sym,
      orderId: "dry-run-sell",
      price: String(price),
      qty: String(quantityInBase),
      quoteQty: String(quantityInBase * price),
      commission: "",
      commissionAsset: "",
      time: Date.now(),
      isBuyer: false,
      isMaker: true,
      isBestMatch: true,
      orderStatus: "NEW",
      tradeId: 0,
    };
  }
  let retries = 0;
  while (retries < maxRetries) {
    try {
      if (isBinance(exchange)) {
        logToFile(
          "./logs/trades-binance.log",
          `${Date.now().toLocaleString("fi-FI")} ${symbol} sell at ${price} price, ${quantityInBase} qty`,
        );
        return await exchange.sell(toSymbolKey(symbol), quantityInBase, price);
      } else if (isNonKYC(exchange)) {
        logToFile(
          "./logs/trades-xeggex.log",
          `${Date.now().toLocaleString("fi-FI")}${symbol} sell at ${price} price, ${quantityInBase} qty`,
        );
        const xeggexOrder = await exchange.newOrder(symbol, "sell", "limit", quantityInBase, price);
        if (xeggexOrder) {
          const order: Order = {
            symbol: toSymbolKey(symbol),
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
      } else if (isDexTrade(exchange)) {
        logToFile(
          "./logs/trades-dextrade.log",
          `${Date.now().toLocaleString("fi-FI")} ${symbol} sell at ${price} price, ${quantityInBase} qty`,
        );
        const dexOrder = await exchange.newOrder(symbol, "sell", "limit", quantityInBase, price);
        if (dexOrder) {
          return {
            symbol: toSymbolKey(symbol),
            orderId: dexOrder.id,
            price: dexOrder.price,
            qty: dexOrder.quantity,
            quoteQty: (parseFloat(dexOrder.quantity) * parseFloat(dexOrder.price)).toString(),
            commission: "",
            commissionAsset: "",
            time: dexOrder.createdAt,
            isBuyer: false,
            isMaker: true,
            isBestMatch: true,
            orderStatus: "NEW",
            tradeId: parseFloat(dexOrder.id),
          } as Order;
        }
      }
    } catch (error) {
      retries++;
      console.error(`Error happened in placing SELL order ${error}, retrying (${retries}/${maxRetries})`);
      if (isBinanceTimestampAheadError(error)) {
        console.warn(`Binance aikaheitto (${symbol}) — synkataan serveriaika ja yritetään uudelleen.`);
        await syncBinanceServerTime(exchange);
      } else if (error?.code === 20001 || error?.code === -2021 || error?.code === -2010) {
        console.error(
          `Insufficient funds for SELL order creation in ${symbol}, decreasing quantity for next try by 1%`,
        );
        quantityInBase = quantityInBase * 0.99;
        exchangeOptions.balances = await getCurrentBalances(exchange);
      } else {
        logToFile("./logs/error.log", safeStringifyForLogs(error));
        console.error(error);
      }
      if (retries < maxRetries) {
        await sleep(500);
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
  if (exchangeOptions.dryRun === true) {
    logToFile(
      "./logs/trades-binance.log",
      `[DRY RUN] ${Date.now()} ${symbol} buy at ${price} price, ${quantityInBase} qty (no order placed)`,
    );
    const sym = toSymbolKey(symbol);
    return {
      symbol: sym,
      orderId: "dry-run-buy",
      price: String(price),
      qty: String(quantityInBase),
      quoteQty: String(quantityInBase * price),
      commission: "",
      commissionAsset: "",
      time: Date.now(),
      isBuyer: true,
      isMaker: true,
      isBestMatch: true,
      orderStatus: "NEW",
      tradeId: 0,
    };
  }
  let retries = 0;
  while (retries < maxRetries) {
    try {
      if (isBinance(exchange)) {
        logToFile(
          "./logs/trades-binance.log",
          `${Date.now().toLocaleString("fi-FI")} ${symbol} buy at ${price} price, ${quantityInBase} qty`,
        );
        return await exchange.buy(toSymbolKey(symbol), quantityInBase, price);
      } else if (isNonKYC(exchange)) {
        logToFile(
          "./logs/trades-xeggex.log",
          `${Date.now().toLocaleString("fi-FI")} ${symbol} buy at ${price} price, ${quantityInBase} qty`,
        );
        const xeggexOrder = await exchange.newOrder(symbol, "buy", "limit", quantityInBase, price);
        const order = {
          symbol: toSymbolKey(symbol),
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
      } else if (isDexTrade(exchange)) {
        logToFile(
          "./logs/trades-dextrade.log",
          `${Date.now().toLocaleString("fi-FI")} ${symbol} buy at ${price} price, ${quantityInBase} qty`,
        );
        const dexOrder = await exchange.newOrder(symbol, "buy", "limit", quantityInBase, price);
        if (dexOrder) {
          return {
            symbol: toSymbolKey(symbol),
            orderId: dexOrder.id,
            price: dexOrder.price,
            qty: dexOrder.quantity,
            quoteQty: (parseFloat(dexOrder.quantity) * parseFloat(dexOrder.price)).toString(),
            commission: "",
            commissionAsset: "",
            time: dexOrder.createdAt,
            isBuyer: true,
            isMaker: true,
            isBestMatch: true,
            orderStatus: "NEW",
            tradeId: parseFloat(dexOrder.id),
          } as Order;
        }
      }
    } catch (error) {
      retries++;
      console.error(`Error happened in placing BUY order ${error}, retrying (${retries}/${maxRetries})`);
      if (isBinanceTimestampAheadError(error)) {
        console.warn(`Binance aikaheitto (${symbol}) — synkataan serveriaika ja yritetään uudelleen.`);
        await syncBinanceServerTime(exchange);
      } else if (error?.code === 20001 || error?.code === -2021 || error?.code === -2010) {
        console.error(`Insufficient funds for BUY order creation in ${symbol}, decreasing quantity for next try by 1%`);
        quantityInBase = quantityInBase * 0.99;
        exchangeOptions.balances = await getCurrentBalances(exchange);
      } else {
        logToFile("./logs/error.log", safeStringifyForLogs(error));
        console.error(error);
      }
      if (retries < maxRetries) {
        await sleep(500);
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
  const trades = ExchangeOptions.tradeHistory?.[toSymbolKey(symbolOptions.name)];
  let previousTrade = null;
  let olderTrade = null;
  if (!trades?.length) return { previousTrade, olderTrade };
  for (let i = trades.length - 1; i >= 0; i--) {
    if (direction === "SELL" && trades[i].isBuyer) {
      previousTrade = trades[i];
      for (let x = i; x >= 0; x--) {
        if (!trades[x].isBuyer) {
          olderTrade = trades[x];
          break;
        }
      }
      break;
    } else if (direction === "BUY" && !trades[i].isBuyer) {
      previousTrade = trades[i];
      for (let x = i; x >= 0; x--) {
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
  const [base, quote] = splitSymbol(symbol);
  const baseBalance = exchangeOptions.balances?.[base]?.crypto ?? 0;
  if (orderBook === undefined || orderBook.asks === undefined) {
    orderBook = await getOrderbook(exchange, symbol);
  }
  const sellExec = computeLiveSellExecution({
    baseBalance,
    orderBookAsks: orderBook.asks,
    filter,
    symbolOptions,
    forceQuantityInBase,
  });
  if (sellExec === null) {
    return false;
  }
  const { askPrice, askPriceDiscounted, quantityInBase, roundedPrice, roundedQuantityInBase, roundedQuantityInQuote } =
    sellExec;
  if (
    symbolOptions.price?.enabled === true &&
    symbolOptions.price?.maximumSell !== undefined &&
    symbolOptions.price?.maximumSell < roundedPrice
  ) {
    consoleLogger.push("error", "Too high price to sell.");
    return false;
  }
  if (
    symbolOptions.price?.enabled === true &&
    symbolOptions.price?.minimumSell !== undefined &&
    symbolOptions.price?.minimumSell > roundedPrice
  ) {
    consoleLogger.push("error", "Too low price to sell.");
    return false;
  }
  consoleLogger.push("SELL CHECK", {
    baseBalance,
    askPrice,
    askPriceDiscounted,
    quantityInBase,
    roundedQuantityInBase,
    roundedQuantityInQuote,
    stepSize: filter.stepSize,
    tickSize: filter.tickSize,
  });
  if (roundedQuantityInQuote < MIN_QUOTE_NOTIONAL) {
    consoleLogger.push("error", "Too low quantity to sell. Minimum 1.1 Quote.");
    return false;
  }
  if (process.env.DEBUG == "true") {
    logToFile(
      "./logs/debug.log",
      `TRADEDATA SELL ${orderBook.asks[0]} ${askPrice} ${askPriceDiscounted} ${filter.tickSize} ${roundedPrice} ${roundedQuantityInBase} ${roundedQuantityInQuote}`,
    );
  }
  if (checkBeforePlacingOrder(roundedQuantityInBase, roundedPrice, filter) === true) {
    let unrealizedPNL = 0;
    if (profit !== "GRID" && profit !== "SKIP") {
      if (exchangeOptions.tradeHistory !== undefined && exchangeOptions.tradeHistory[toSymbolKey(symbol)]?.length > 0) {
        const { previousTrade, olderTrade } = getPreviousTrades("SELL", exchangeOptions, symbolOptions);
        if (previousTrade) {
          unrealizedPNL = calculateUnrealizedPNLPercentageForLong(
            parseFloat(previousTrade.qty),
            parseFloat(previousTrade.price),
            roundedPrice, // Use discounted ask price for PNL calculation
          );
          unrealizedPNL = applyRoundTripFeeToPnl(unrealizedPNL, symbolOptions.tradeFeePercentage);
          if (
            (profit === "TAKE_PROFIT" || profit === "TAKE_PROFIT_FORCE") &&
            !meetsTakeProfitLimitForAction(unrealizedPNL, symbolOptions, "SELL")
          ) {
            consoleLogger.push(
              "error",
              `Take profit estetty: unrealized ${unrealizedPNL.toFixed(2)}% alle takeProfit.limit`,
            );
            return false;
          }
          if (
            symbolOptions.profit !== undefined &&
            !allowsForcedLossTrade(profit) &&
            profit !== "TAKE_PROFIT" &&
            profit !== "TAKE_PROFIT_FORCE" &&
            symbolOptions.profit?.minimumSell !== 0
          ) {
            if (
              symbolOptions.profit.enabled === true &&
              unrealizedPNL < symbolOptions.profit.minimumSell &&
              readForceSkip(toSymbolKey(symbol)) === false
            ) {
              consoleLogger.push("error", "Not positive trade " + unrealizedPNL);
              return false;
            }
          }
          if (!allowsForcedLossTrade(profit) && unrealizedPNL < 0) {
            consoleLogger.push("error", `Estetty miinusmyynti (${profit}): unrealized PNL ${unrealizedPNL}`);
            return false;
          }
        }
      }
    }
    if ((await isBlocking(symbol)) === true) {
      return false;
    }
    createBlock(symbol);
    let order = await placeSellOrder(exchange, exchangeOptions, symbol, roundedQuantityInBase, roundedPrice);
    const tradeNext = "SELL";
    // console.log(order);
    if (order !== undefined) {
      play(soundFile);
      let msg = "```";
      msg += `SELL ID: ${order.orderId}\r\n`;
      msg += `Symbol: ${symbol}\r\n`;
      msg += `Base quantity: ${roundedQuantityInBase}\r\n`;
      msg += `Quote quantity: ${roundedQuantityInQuote}\r\n`;
      msg += `Price: ${roundedPrice}\r\n`;
      msg += `Profit if trade fulfills: ${unrealizedPNL.toFixed(2)}%\r\n`;
      msg += `Trigger: ${profit}\r\n`;
      msg += `Time now ${new Date().toLocaleString("fi-fi")}\r\n`;
      msg += "```";
      symbolOptions.currentOrder = order;
      sendMessageToChannel(discord, processOptions.discord?.channelId, msg);
      if (order.orderId !== undefined) {
        await awaitLiveOrderFollowUp(
          discord,
          exchange,
          symbol,
          order,
          orderBook,
          processOptions,
          symbolOptions,
          tradeNext,
          unrealizedPNL,
        );
      }
      updateBuyAmount(roundedQuantityInQuote, symbolOptions);
      updateForce(symbol);
      exchangeOptions.balances = await getCurrentBalances(exchange);
      if (exchangeOptions.tradeHistory === undefined) {
        exchangeOptions.tradeHistory = {};
      }
      exchangeOptions.tradeHistory[toSymbolKey(symbol)] = await getTradeHistory(exchange, symbol);
      removeBlock(symbol);
      return order;
    } else {
      removeBlock(symbol);
      return false;
    }
  } else {
    consoleLogger.push("BUY FILTER FAIL", {
      roundedQuantityInBase,
      roundedPrice,
      notional: roundedQuantityInBase * roundedPrice,
      filter,
    });
    consoleLogger.push("error", "Filter limits failed a check. Check your balances!");
    return false;
  }
};

const maxBuyAmount = (quoteQuantity: number, symbolOptions: SymbolOptions, applyGrowingMaxCap: boolean = true) => {
  if (!applyGrowingMaxCap) {
    return quoteQuantity;
  }
  if (symbolOptions.growingMax) {
    if (symbolOptions.growingMax.buy === undefined) {
      return quoteQuantity;
    } else if (symbolOptions.growingMax.buy > 0) {
      return (quoteQuantity = Math.min(quoteQuantity, symbolOptions.growingMax.buy));
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
      return (baseQuantity = Math.min(baseQuantity, symbolOptions.growingMax.sell));
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
  const [base, quote] = splitSymbol(symbol);
  const quoteBalance = exchangeOptions.balances?.[quote]?.crypto ?? 0;
  if (orderBook === undefined || orderBook.bids === undefined) {
    orderBook = await getOrderbook(exchange, symbol);
  }
  const buyExec = computeLiveBuyExecution({
    quoteBalance,
    orderBookBids: orderBook.bids,
    filter,
    symbolOptions,
    forceQuantityInBase,
  });
  if (buyExec === null) {
    return false;
  }
  const { bidPrice, bidPriceIncremented, roundedPrice, roundedQuantityInBase, roundedQuantityInQuote } = buyExec;
  if (
    symbolOptions.price?.enabled === true &&
    symbolOptions.price?.maximumBuy !== undefined &&
    symbolOptions.price?.maximumBuy < roundedPrice
  ) {
    consoleLogger.push("error", "Too high price to buy.");
    return false;
  }
  if (
    symbolOptions.price?.enabled === true &&
    symbolOptions.price?.minimumBuy !== undefined &&
    symbolOptions.price?.minimumBuy > roundedPrice
  ) {
    consoleLogger.push("error", "Too low price to buy.");
    return false;
  }
  const parts = symbol.split("/");
  if (parts.length < 2) {
    throw new Error(`Invalid symbol format: ${symbol}. Expected BASE/QUOTE`);
  }
  consoleLogger.push("BUY CHECK", {
    quoteBalance: exchangeOptions.balances?.[parts[1]]?.crypto,
    baseBalance: exchangeOptions.balances?.[parts[0]]?.crypto,
    bidPrice,
    quantityInQuote: roundedQuantityInQuote,
    quantityInBase: roundedQuantityInBase,
    roundedPrice,
    roundedQuantityInBase,
    roundedQuantityInQuote,
    stepSize: filter.stepSize,
    tickSize: filter.tickSize,
    filters: filter,
  });
  if (roundedQuantityInQuote < MIN_QUOTE_NOTIONAL) {
    consoleLogger.push("error", "Too low quantity to buy. Minimum 1.1 Quote.");
    return false;
  }
  if (process.env.DEBUG == "true") {
    logToFile(
      "./logs/debug.log",
      `TRADEDATA BUY ${orderBook.bids[0]} ${bidPrice} ${bidPriceIncremented} ${filter.tickSize} ${roundedPrice} ${roundedQuantityInBase} ${roundedQuantityInQuote}`,
    );
  }
  if (checkBeforePlacingOrder(roundedQuantityInBase, roundedPrice, filter) === true) {
    let unrealizedPNL = 0;
    if (profit !== "GRID" && profit !== "SKIP") {
      if (exchangeOptions.tradeHistory !== undefined && exchangeOptions.tradeHistory[toSymbolKey(symbol)]?.length > 0) {
        const { previousTrade, olderTrade } = getPreviousTrades("BUY", exchangeOptions, symbolOptions);
        if (previousTrade) {
          unrealizedPNL = calculateUnrealizedPNLPercentageForShort(
            parseFloat(previousTrade.qty),
            parseFloat(previousTrade.price),
            roundedPrice, // Use incremented bid price for PNL calculation
          );
          unrealizedPNL = applyRoundTripFeeToPnl(unrealizedPNL, symbolOptions.tradeFeePercentage);
          if (
            (profit === "TAKE_PROFIT" || profit === "TAKE_PROFIT_FORCE") &&
            !meetsTakeProfitLimitForAction(unrealizedPNL, symbolOptions, "BUY")
          ) {
            consoleLogger.push(
              "error",
              `Take profit estetty: unrealized ${unrealizedPNL.toFixed(2)}% alle takeProfit.limit`,
            );
            return false;
          }
          if (
            symbolOptions.profit !== undefined &&
            !allowsForcedLossTrade(profit) &&
            profit !== "TAKE_PROFIT" &&
            profit !== "TAKE_PROFIT_FORCE" &&
            symbolOptions.profit?.minimumBuy !== 0
          ) {
            if (
              symbolOptions.profit.enabled === true &&
              unrealizedPNL < symbolOptions.profit.minimumBuy &&
              readForceSkip(toSymbolKey(symbol)) === false
            ) {
              consoleLogger.push("error", "Not positive trade " + unrealizedPNL);
              return false;
            }
          }
          if (!allowsForcedLossTrade(profit) && unrealizedPNL < 0) {
            consoleLogger.push("error", `Estetty osto tappiolla (${profit}): unrealized PNL ${unrealizedPNL}`);
            return false;
          }
        }
      }
    }
    if ((await isBlocking(symbol)) === true) {
      return false;
    }
    createBlock(symbol);
    let order = await placeBuyOrder(exchange, exchangeOptions, symbol, roundedQuantityInBase, roundedPrice);
    const tradeNext = "BUY";
    // console.log(order);
    if (order !== undefined) {
      play(soundFile);
      let msg = "```";
      msg += `BUY ID: ${order.orderId}\r\n`;
      msg += `Symbol: ${symbol}\r\n`;
      msg += `Base quantity: ${roundedQuantityInBase}\r\n`;
      msg += `Quote quantity: ${roundedQuantityInQuote}\r\n`;
      msg += `Price: ${roundedPrice}\r\n`;
      msg += `Profit if trade fulfills: ${unrealizedPNL.toFixed(2)}%\r\n`;
      msg += `Trigger: ${profit}\r\n`;
      msg += `Time now ${new Date().toLocaleString("fi-fi")}\r\n`;
      msg += "```";

      symbolOptions.currentOrder = order;
      sendMessageToChannel(discord, processOptions.discord?.channelId, msg);
      if (order.orderId !== undefined) {
        await awaitLiveOrderFollowUp(
          discord,
          exchange,
          symbol,
          order,
          orderBook,
          processOptions,
          symbolOptions,
          tradeNext,
          unrealizedPNL,
        );
      }
      updateSellAmount(roundedQuantityInBase, symbolOptions);
      updateForce(symbol);
      exchangeOptions.balances = await getCurrentBalances(exchange);
      if (exchangeOptions.tradeHistory === undefined) {
        exchangeOptions.tradeHistory = {};
      }
      exchangeOptions.tradeHistory[toSymbolKey(symbol)] = await getTradeHistory(exchange, symbol);
      removeBlock(symbol);
      return order;
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
  const symbolKey = toSymbolKey(symbol);
  const th = exchangeOptions.tradeHistory?.[symbolKey] ?? [];
  if (th.length > 0) {
    const lastTrade = th[th.length - 1];
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
  // Validate symbol and split into components
  const symbolParts = symbol?.split("/") || [];
  if (symbolParts.length !== 2 || !symbolParts[0] || !symbolParts[1]) {
    logger.push("Simulate Sell", `Invalid symbol format: ${symbol}. Expected BASE/QUOTE`);
    return false;
  }
  
  const [base, quote] = symbolParts;
  
  // console.log(time);
  if (price === null || quantity === 0) {
    return false;
  }
  let baseQuantity = quantity;
  let quoteQuantity = quantity * price;
  if (checkBeforePlacingOrder(baseQuantity, price, filter) === true) {
    let fee = simFeeOnQuote(quoteQuantity, symbolOptions.tradeFeePercentage);
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
    const symbolKeyS = toSymbolKey(symbol);
    const thS = exchangeOptions.tradeHistory?.[symbolKeyS];
    if (thS && thS.length >= 1) {
      lastTrade = thS[thS.length - 1];
      if (lastTrade.isBuyer) {
        pnl = calculatePNLPercentageForLong(parseFloat(lastTrade.price), price);
        pnl = applyRoundTripFeeToPnl(pnl, symbolOptions.tradeFeePercentage);
      }
    }
    // Prevent "minus trades" unless stop loss / idle force.
    if (!allowsForcedLossTrade(profit) && pnl < 0) {
      return false;
    }
    if (exchangeOptions.tradeHistory === undefined) {
      exchangeOptions.tradeHistory = {};
    }
    if (exchangeOptions.tradeHistory[symbolKeyS] === undefined) {
      exchangeOptions.tradeHistory[symbolKeyS] = [];
    }
    if (
      symbolOptions.profit !== undefined &&
      !allowsForcedLossTrade(profit) &&
      profit !== "TAKE_PROFIT" &&
      profit !== "TAKE_PROFIT_FORCE" &&
      symbolOptions.profit?.minimumSell !== 0
    ) {
      if (
        symbolOptions.profit.enabled === true &&
        pnl < symbolOptions.profit.minimumSell &&
        readForceSkip(symbolKeyS) === false
      ) {
        return false;
      }
    }
    exchangeOptions.tradeHistory[symbolKeyS].push({
      symbol: symbolKeyS,
      id: "",
      orderId: "",
      orderListID: pnl,
      price: price.toString(),
      qty: baseQuantity.toString(),
      quoteQty: quoteQuontityWithoutFee.toString(),
      commission: fee.toString(),
      commissionAsset: quote,
      time: time,
      isBuyer: false,
      isMaker: true,
      isBestMatch: true,
      profit: profit,
    });
    if (process.env.SIMULATE === "true") {
      console.log(
        `[sim] SELL ${symbol} @ ${price.toFixed(2)} base≈${baseQuantity.toFixed(6)} (${profit}) | kauppoja yhteensä ${exchangeOptions.tradeHistory[symbolKeyS].length}`,
      );
    }
    balances[base].crypto = balances[base].crypto - baseQuantity;
    balances[quote].crypto = balances[quote].crypto + quoteQuontityWithoutFee;
    const sanitizedStartTime = options.startTime.replace(/:/g, "-");
    const filePath = `./simulation/${sanitizedStartTime}/trades.json`;
    const directory = path.dirname(filePath);
    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true });
    }
    clearTakeProfitAfterTrade(symbol, symbolOptions);
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
    logger.push("Trigger", profit);
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
  // Validate symbol and split into components
  const symbolParts = symbol?.split("/") || [];
  if (symbolParts.length !== 2 || !symbolParts[0] || !symbolParts[1]) {
    logger.push("Simulate Buy", `Invalid symbol format: ${symbol}. Expected BASE/QUOTE`);
    return false;
  }
  
  const [base, quote] = symbolParts;
  
  // console.log(time);
  if (price === null || quantity === 0) {
    return false;
  }
  const quoteBalanceBefore = quantity;
  let quoteQuantity = quantity;
  const fixedBuyAmount = Number(symbolOptions.simulationBuyAmountQuote ?? 0);
  if (Number.isFinite(fixedBuyAmount) && fixedBuyAmount > 0) {
    quoteQuantity = Math.min(quoteQuantity, fixedBuyAmount);
  }
  if (process.env.DEBUG == "true") {
    logToFile(
      "./logs/debug.log",
      `[SIM BUY] symbol=${symbol} quoteBalanceBefore=${quoteBalanceBefore} quoteUsed=${quoteQuantity} fixedBuyAmount=${Number.isFinite(fixedBuyAmount) ? fixedBuyAmount : "n/a"}`,
    );
  }
  let baseQuantity = quoteQuantity / price;
  if (checkBeforePlacingOrder(baseQuantity, price, filter) === true) {
    let fee = simFeeOnBase(baseQuantity, symbolOptions.tradeFeePercentage);
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
    const symbolKey = toSymbolKey(symbol);
    const th = exchangeOptions.tradeHistory?.[symbolKey];
    pnl = computeSimBuyClosePnl(th, price, symbolOptions.tradeFeePercentage);
    if (th && th.length >= 1) {
      lastTrade = th[th.length - 1];
    }
    // Prevent "minus trades" unless stop loss / idle force.
    if (!allowsForcedLossTrade(profit) && pnl < 0) {
      return false;
    }
    if (exchangeOptions.tradeHistory === undefined) {
      exchangeOptions.tradeHistory = {};
    }
    if (exchangeOptions.tradeHistory[symbolKey] === undefined) {
      exchangeOptions.tradeHistory[symbolKey] = [];
    }
    if (
      symbolOptions.profit !== undefined &&
      !allowsForcedLossTrade(profit) &&
      profit !== "TAKE_PROFIT" &&
      profit !== "TAKE_PROFIT_FORCE" &&
      symbolOptions.profit?.minimumBuy !== 0
    ) {
      if (
        symbolOptions.profit.enabled === true &&
        pnl < symbolOptions.profit.minimumBuy &&
        readForceSkip(toSymbolKey(symbol)) === false
      ) {
        return false;
      }
    }
    exchangeOptions.tradeHistory[symbolKey].push({
      symbol: symbolKey,
      id: "",
      orderId: "",
      orderListID: pnl,
      price: price.toString(),
      qty: baseQuantityWithoutFee.toString(),
      quoteQty: quoteQuantity.toString(),
      commission: fee.toString(),
      commissionAsset: base,
      time: time,
      isBuyer: true,
      isMaker: true,
      isBestMatch: true,
      profit: profit,
    });
    if (process.env.SIMULATE === "true") {
      console.log(
        `[sim] BUY ${symbol} @ ${price.toFixed(2)} base≈${baseQuantityWithoutFee.toFixed(6)} (${profit}) | kauppoja yhteensä ${exchangeOptions.tradeHistory[symbolKey].length}`,
      );
    }
    balances[base].crypto = balances[base].crypto + baseQuantityWithoutFee;
    balances[quote].crypto = balances[quote].crypto - quoteQuantity;
    const sanitizedStartTime = options.startTime.replace(/:/g, "-");
    const filePath = `./simulation/${sanitizedStartTime}/trades.json`;
    const directory = path.dirname(filePath);
    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true });
    }
    clearTakeProfitAfterTrade(symbol, symbolOptions);
    writeFileSync(
      filePath,
      JSON.stringify(
        {
          symbol: symbol,
          direction: "BUY",
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
    logger.push("Trade", "buy");
    logger.push("PNL", pnl);
    logger.push("Trigger", profit);
    // logger.push("Balances", balances);
    // logger.print();
    // logger.flush();
  }
  return true;
};
