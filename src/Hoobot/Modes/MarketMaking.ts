import { Client } from "discord.js";
import { ConsoleLogger } from "../Utilities/ConsoleLogger";
import { ConfigOptions, ExchangeOptions, SymbolOptions, toSymbolKey } from "../Utilities/Args";
import { Exchange } from "../Exchanges/Exchange";
import { Orderbook } from "../Exchanges/Orderbook";
import { Order, getOpenOrders, cancelOrder } from "../Exchanges/Orders";
import { placeBuyOrder, placeSellOrder, Trade } from "../Exchanges/Trades";
import { getCurrentBalances } from "../Exchanges/Balances";
import { logToFile } from "../Utilities/LogToFile";
import { symbolFilters } from "../symbolFiltersStore";

type MmSide = "buy" | "sell";
type MmSlotKey = string;

interface MmGridLevel {
  side: MmSide;
  price: number;
  distanceIndex: number;
}

interface MmGridSlot {
  slotKey: MmSlotKey;
  price: number;
  restingPrice: number;
  defaultSide: MmSide;
  currentSide: MmSide;
  distanceIndex: number;
  targetSizeBase: number;
  activeOrderId: string | null;
  openQtyBase: number;
}

interface MmPlacement {
  slotKey: MmSlotKey;
  price: number;
  side: MmSide;
  sizeBase: number;
  distanceIndex: number;
}

interface MmRecentOwnOrder {
  timestamp: number;
  price: number;
  side: MmSide;
}

interface MmState {
  gridSignature: string;
  fixedMidPrice: number | null;
  lastOpenOrdersHash: string;
  isLocked: boolean;
  lockTimestamp: number;
  slots: Map<MmSlotKey, MmGridSlot>;
  recentOwnOrders: Record<string, MmRecentOwnOrder>;
  openOrders: Order[]
}

const mmStateMap = new Map<string, MmState>();

const getMmState = (symbolKey: string): MmState => {
  if (!mmStateMap.has(symbolKey)) {
    mmStateMap.set(symbolKey, {
      gridSignature: "",
      fixedMidPrice: null,
      lastOpenOrdersHash: "",
      isLocked: false,
      lockTimestamp: 0,
      slots: new Map<MmSlotKey, MmGridSlot>(),
      recentOwnOrders: {},
      openOrders: []
    });
  }
  return mmStateMap.get(symbolKey)!;
};

const PRUNE_OWN_ORDER_MS = 5 * 60 * 1000;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const PRICE_KEY_DECIMALS = 14;

const getOpenOrdersHash = (openOrders: Awaited<ReturnType<typeof getOpenOrders>>): string =>
  openOrders
    .map((order) => `${order.orderId}:${order.isBuyer ? "buy" : "sell"}:${order.price}:${order.qty}:${order.orderStatus}`)
    .sort()
    .join("|");

const getEffectiveFixedMidPrice = (opts: NonNullable<SymbolOptions["marketMaking"]>): number | null => {
  const fixedMidPrice = opts.fixedMidPrice ?? opts.staticMidPrice ?? null;
  if (fixedMidPrice == null || !Number.isFinite(fixedMidPrice) || fixedMidPrice <= 0) return null;
  return fixedMidPrice;
};

export const getBootFixedMidPrice = (orderbook: Orderbook, depthLevels = 8): number | null => {
  const bids = Object.entries(orderbook.bids)
    .map(([price, qty]) => ({ price: Number(price), qty: Number(qty) }))
    .filter((level) => Number.isFinite(level.price) && level.price > 0 && Number.isFinite(level.qty) && level.qty > 0)
    .sort((left, right) => right.price - left.price)
    .slice(0, depthLevels);

  const asks = Object.entries(orderbook.asks)
    .map(([price, qty]) => ({ price: Number(price), qty: Number(qty) }))
    .filter((level) => Number.isFinite(level.price) && level.price > 0 && Number.isFinite(level.qty) && level.qty > 0)
    .sort((left, right) => left.price - right.price)
    .slice(0, depthLevels);

  if (bids.length === 0 || asks.length === 0) return null;

  const bidTotalQty = bids.reduce((sum, level) => sum + level.qty, 0);
  const askTotalQty = asks.reduce((sum, level) => sum + level.qty, 0);
  if (bidTotalQty <= 0 || askTotalQty <= 0) return null;

  const weightedBid = bids.reduce((sum, level) => sum + level.price * level.qty, 0) / bidTotalQty;
  const weightedAsk = asks.reduce((sum, level) => sum + level.price * level.qty, 0) / askTotalQty;

  const midPrice = (weightedBid + weightedAsk) / 2;
  return Number.isFinite(midPrice) && midPrice > 0 ? midPrice : null;
};

const resolveStaticMidPrice = (
  state: MmState,
  opts: NonNullable<SymbolOptions["marketMaking"]>,
  orderbook: Orderbook,
): number | null => {
  const configured = getEffectiveFixedMidPrice(opts);
  if (configured != null) return configured;
  if (state.fixedMidPrice != null && Number.isFinite(state.fixedMidPrice) && state.fixedMidPrice > 0) {
    return state.fixedMidPrice;
  }
  return getBootFixedMidPrice(orderbook);
};

const roundToStep = (value: number, step: number, direction: "down" | "up" | "nearest" = "nearest"): number => {
  if (!Number.isFinite(value)) return value;
  if (!Number.isFinite(step) || step <= 0) return value;
  const scaled = value / step;
  const rounded =
    direction === "down" ? Math.floor(scaled + 1e-12) : direction === "up" ? Math.ceil(scaled - 1e-12) : Math.round(scaled);
  const result = rounded * step;
  const precision = Math.max(0, Math.min(12, Math.ceil(-Math.log10(step)) + 2));
  return Number(result.toFixed(precision));
};

const normalizeDecimalString = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "";
  const sign = trimmed.startsWith("-") ? "-" : "";
  const unsigned = trimmed.replace(/^[+-]/, "");
  const [integerPartRaw, fractionalPartRaw = ""] = unsigned.split(".");
  const integerPart = integerPartRaw.replace(/^0+(?=\d)/, "") || "0";
  const fractionalPart = fractionalPartRaw.replace(/0+$/, "");
  return fractionalPart.length > 0 ? `${sign}${integerPart}.${fractionalPart}` : `${sign}${integerPart}`;
};

const toPriceKey = (price: number | string): MmSlotKey | null => {
  const numericPrice = typeof price === "number" ? price : Number(price);
  if (!Number.isFinite(numericPrice) || numericPrice <= 0) return null;
  if (typeof price === "string") {
    const trimmed = price.trim();
    if (/^[+-]?\d+(?:\.\d+)?$/.test(trimmed)) return normalizeDecimalString(trimmed);
  }
  return normalizeDecimalString(numericPrice.toFixed(PRICE_KEY_DECIMALS));
};

const getPriceKey = (price: number | string): MmSlotKey => toPriceKey(price) ?? `invalid:${String(price)}`;

const flipSide = (side: MmSide): MmSide => (side === "buy" ? "sell" : "buy");

const setFlippedSlotState = (
  slot: MmGridSlot,
  nextSide: MmSide,
  reason: string,
  symbol: string,
  consoleLogger: ConsoleLogger,
) => {
  const previousSide = slot.currentSide;
  slot.currentSide = nextSide;
  slot.activeOrderId = null;
  slot.openQtyBase = 0;
  consoleLogger.push(
    `MM ${symbol}`,
    `Flipped slot key=${slot.slotKey} price=${slot.restingPrice.toFixed(12)} ${previousSide}->${slot.currentSide} (${reason})`,
  );
  consoleLogger.print();
};

const getEffectiveMinNotional = (symbol: string, rawMinNotional: number): number => {
  const symbolParts = symbol?.split("/") || [];
  const quoteAsset = symbolParts.length >= 2 ? symbolParts[1].toUpperCase() : "";
  if (["USDT", "USDC", "BUSD", "FDUSD", "DAI"].includes(quoteAsset)) return Math.max(rawMinNotional, 1);
  return rawMinNotional;
};

const getStartingSlotQuoteNotional = (
  opts: NonNullable<SymbolOptions["marketMaking"]>,
  minNotional: number,
): number => {
  const configured = opts.startingSlotQuote ?? 1.02;
  if (!Number.isFinite(configured) || configured <= 0) return Math.max(minNotional, 1.02);
  return Math.max(minNotional, configured);
};

const buildStaticGridLevels = (
  midPrice: number,
  spreadPercent: number,
  gridSpacingPercent: number,
  levelsPerSide: number,
  tickSize = 0,
  orderbook: Orderbook,
): MmGridLevel[] => {
  if (!Number.isFinite(midPrice) || midPrice <= 0) return [];

  const validBids = Object.keys(orderbook.bids).map(Number).filter(n => Number.isFinite(n) && n > 0);
  const validAsks = Object.keys(orderbook.asks).map(Number).filter(n => Number.isFinite(n) && n > 0);
  
  if (validBids.length === 0 || validAsks.length === 0) return [];

  const bestBid = Math.max(...validBids);
  const bestAsk = Math.min(...validAsks);

  const spread = Math.max(0, spreadPercent / 100);
  const gridSpacing = Math.max(0.000001, gridSpacingPercent / 100);
  const sideLevels = Math.max(1, Math.min(100, Math.floor(levelsPerSide)));
  const spreadHalf = spread / 2;
  const levels: MmGridLevel[] = [];
  const seen = new Set<MmSlotKey>();

  // Start with initial prices around midPrice with spread
  let bidPrice = midPrice * (1 - spreadHalf);
  let askPrice = midPrice * (1 + spreadHalf);

  for (let distanceIndex = 0; distanceIndex < sideLevels; distanceIndex++) {
    const roundedBid = roundToStep(bidPrice, tickSize, "down");
    const roundedAsk = roundToStep(askPrice, tickSize, "up");

    const bidKey = getPriceKey(roundedBid);
    const askKey = getPriceKey(roundedAsk);

    // Only add valid prices that are positive and make sense relative to the market
    if (roundedBid > 0 && !seen.has(bidKey) && roundedBid < bestAsk) {
      levels.push({ side: "buy", price: roundedBid, distanceIndex });
      seen.add(bidKey);
    }
    if (roundedAsk > 0 && !seen.has(askKey) && roundedAsk > bestBid) {
      levels.push({ side: "sell", price: roundedAsk, distanceIndex });
      seen.add(askKey);
    }

    // Use compound multiplication for grid spacing
    bidPrice *= (1 - gridSpacing);
    askPrice *= (1 + gridSpacing);
    
    // Stop if prices become invalid
    if (bidPrice <= 0 || !Number.isFinite(bidPrice) || askPrice <= 0 || !Number.isFinite(askPrice)) {
      break;
    }
  }
  return levels.sort((left, right) => left.distanceIndex - right.distanceIndex || (left.side === "buy" ? -1 : 1));
};

const buildGridSignature = (
  symbol: string,
  fixedMidPrice: number,
  spreadPercent: number,
  gridSpacingPercent: number,
  levelsPerSide: number,
  levels: MmGridLevel[],
) =>
  [
    symbol,
    Number.isFinite(fixedMidPrice) ? fixedMidPrice.toFixed(12) : "invalid",
    Number.isFinite(spreadPercent) ? spreadPercent.toFixed(8) : "invalid",
    Number.isFinite(gridSpacingPercent) ? gridSpacingPercent.toFixed(8) : "invalid",
    levelsPerSide,
    levels.map((level) => `${level.side}:${Number.isFinite(level.price) ? level.price.toFixed(12) : "invalid"}`).join("|"),
  ].join("::");

const ensureSlotSkeleton = (state: MmState, levels: MmGridLevel[]) => {
  const nextSlots = new Map<MmSlotKey, MmGridSlot>();
  for (const level of levels) {
    const key = getPriceKey(level.price);
    const existing = state.slots.get(key);
    nextSlots.set(key, {
      slotKey: key,
      price: level.price,
      restingPrice: existing?.restingPrice ?? level.price,
      defaultSide: level.side,
      currentSide: existing?.currentSide ?? level.side,
      distanceIndex: level.distanceIndex,
      targetSizeBase: existing?.targetSizeBase ?? 0,
      activeOrderId: existing?.activeOrderId ?? null,
      openQtyBase: existing?.openQtyBase ?? 0,
    });
  }
  state.slots = nextSlots;
};


const pruneRecentOwnOrders = (state: MmState) => {
  const now = Date.now();
  for (const [orderId, meta] of Object.entries(state.recentOwnOrders)) {
    if (now - meta.timestamp > PRUNE_OWN_ORDER_MS) delete state.recentOwnOrders[orderId];
  }
};

const rememberPlacedOrder = (state: MmState, orderId: string, price: number, side: MmSide) => {
  state.recentOwnOrders[orderId] = { timestamp: Date.now(), price, side };
  pruneRecentOwnOrders(state);
};

const buildSidePlacements = (
  slots: MmGridSlot[],
  side: MmSide,
  availableBudget: number,
  minNotional: number,
  minQty: number,
  stepSize: number,
  startingSlotAmount: number,
): MmPlacement[] => {
  const sortedSlots = [...slots].sort((left, right) => left.distanceIndex - right.distanceIndex);
  const placements: MmPlacement[] = [];
  let remainingBudget = availableBudget;

  for (const slot of sortedSlots) {
    // Skip slots with invalid prices
    if (!Number.isFinite(slot.restingPrice) || slot.restingPrice <= 0) continue;

    const sizeBase = (side === "sell")
      ? roundToStep(startingSlotAmount, stepSize, "down")
      : roundToStep(startingSlotAmount / slot.restingPrice, stepSize, "up");

    const notional = sizeBase * slot.restingPrice;

    if (!Number.isFinite(sizeBase) || sizeBase <= 0 || !Number.isFinite(notional) || notional <= 0) continue;
    if (sizeBase < minQty || notional < minNotional) continue;

    const cost = (side === "buy") ? notional : sizeBase;
    if (cost <= remainingBudget * 0.999) {
      placements.push({
        slotKey: slot.slotKey,
        price: slot.restingPrice,
        side,
        sizeBase,
        distanceIndex: slot.distanceIndex,
      });
      remainingBudget -= cost;
    } else {
      break;
    }
  }
  return placements;
};

const placeStaticGridOrders = async (
  exchange: Exchange,
  symbol: string,
  exchangeOptions: ExchangeOptions,
  state: MmState,
  placements: MmPlacement[],
  minNotional: number,
  startingSlotQuote: number,
  minQty: number,
  consoleLogger: ConsoleLogger,
) => {
  // Validate symbol format
  const symbolParts = symbol?.split("/") || [];
  if (symbolParts.length !== 2 || !symbolParts[0] || !symbolParts[1]) {
    consoleLogger.push("MarketMaking", `Invalid symbol format: ${symbol}. Expected BASE/QUOTE`);
    return;
  }
  
  const [baseAsset, quoteAsset] = symbolParts;
  const requiredNotional = Math.max(minNotional, startingSlotQuote);
  const queuedSlotKeys = new Set<MmSlotKey>();

  let balances = await getCurrentBalances(exchange);
  
  // Validate we got balances
  if (!balances || typeof balances !== "object") {
    consoleLogger.push(`MM ${symbol}`, `❌ Failed to get valid balances`);
    consoleLogger.print();
    return;
  }
  
  let remainingBase = balances[baseAsset]?.crypto ?? 0;
  let remainingQuote = balances[quoteAsset]?.crypto ?? 0;

  for (const placement of placements) {
    if (queuedSlotKeys.has(placement.slotKey)) continue;
    queuedSlotKeys.add(placement.slotKey);

    const slot = state.slots.get(placement.slotKey);
    if (!slot || slot.activeOrderId) continue;


    const isBuy = placement.side === "buy";
    const quoteRequired = placement.sizeBase * placement.price;
    const sideBalance = isBuy ? remainingQuote : remainingBase;
    const cost = isBuy ? quoteRequired : placement.sizeBase;

    const safeBalance = sideBalance * 0.999;

    // Check for invalid numerical values
    if (!Number.isFinite(placement.sizeBase) || !Number.isFinite(placement.price) || 
        !Number.isFinite(quoteRequired) || !Number.isFinite(cost)) {
      consoleLogger.push(`MM ${symbol}`, `⚠️ Skipping ${placement.side} ${placement.price}: Invalid numerical values`);
      consoleLogger.print();
      continue;
    }

    // Check minimum requirements and sufficient funds
    if (placement.sizeBase < minQty || quoteRequired < requiredNotional || cost > safeBalance) {
      consoleLogger.push(`MM ${symbol}`, `Skipping ${placement.side} ${placement.price}: Insufficient tracked funds or limits.`);
      consoleLogger.print();
      continue;
    }
    
    try {
      const order = isBuy ? await placeBuyOrder(exchange, exchangeOptions, symbol, placement.sizeBase, placement.price, 2)
        : await placeSellOrder(exchange, exchangeOptions, symbol, placement.sizeBase, placement.price, 2);

      if (order?.orderId) {
        slot.currentSide = placement.side;
        slot.restingPrice = Number(order.price) || placement.price;
        slot.targetSizeBase = placement.sizeBase;
        slot.activeOrderId = String(order.orderId);
        slot.openQtyBase = Number(order.qty) || placement.sizeBase;
        rememberPlacedOrder(state, slot.activeOrderId, slot.restingPrice, placement.side);

        if (isBuy) {
          remainingQuote -= quoteRequired;
        } else {
          remainingBase -= placement.sizeBase;
        }

        consoleLogger.push(
          `MM ${symbol}`,
          `✅ Placed ${placement.side.toUpperCase()} ${placement.sizeBase.toFixed(8)} @ ${placement.price.toFixed(8)}`,
        );
      } else {
        consoleLogger.push(`MM ${symbol}`, `⚠️ No order ID returned for ${placement.side} ${placement.price}`);
      }
      consoleLogger.print();
    } catch (error: any) {
      consoleLogger.push(`MM ${symbol}`, `❌ Failed to place ${placement.side}: ${error?.message}`);
      logToFile("./logs/mm-error.log", `Place static order failed ${symbol} ${placement.side}: ${error?.message}`);
      consoleLogger.print();
    }
    await delay(1000);
  }
};

export const getSlotFillCandidateFromTrade = (slots: Iterable<MmGridSlot>, trade: Trade): MmGridSlot | undefined => {
  for (const slot of slots) {
    if (slot.activeOrderId === trade.orderId) {
      return slot;
    }
  }
  return undefined;
};

const placeFlippedOrder = async (
  exchange: Exchange,
  consoleLogger: ConsoleLogger,
  symbol: string,
  exchangeOptions: ExchangeOptions,
  symbolOptions: SymbolOptions,
  slot: MmGridSlot,
  filter: any,
  spreadPercent: number,
): Promise<void> => {
  // Validate slot has valid target size
  if (!Number.isFinite(slot.targetSizeBase) || slot.targetSizeBase <= 0) {
    consoleLogger.push(`MM ${symbol}`, `⚠️ Cannot place flipped order: invalid target size`);
    consoleLogger.print();
    return;
  }
  
  let sizeBase = roundToStep(slot.targetSizeBase, filter?.stepSize ?? 0, "down");
  if (sizeBase <= 0) return;

  const minNotional = getEffectiveMinNotional(symbol, filter?.minNotional ?? 1e-9);
  const originalPrice = slot.restingPrice || slot.price;
  
  // Validate original price
  if (!Number.isFinite(originalPrice) || originalPrice <= 0) {
    consoleLogger.push(`MM ${symbol}`, `⚠️ Cannot place flipped order: invalid original price`);
    consoleLogger.print();
    return;
  }

  // Spread capture logic - the slot has already been flipped, so we place orders for its current side
  let targetPrice: number;
  const halfSpread = (spreadPercent / 100) / 2;

  if (slot.currentSide === "sell") {
    // Slot was flipped to sell → place sell order HIGHER than original buy price
    targetPrice = roundToStep(originalPrice * (1 + halfSpread * 1.5), filter?.tickSize ?? 0, "up");
  } else {
    // Slot was flipped to buy → place buy order LOWER than original sell price
    targetPrice = roundToStep(originalPrice * (1 - halfSpread * 1.5), filter?.tickSize ?? 0, "down");
  }
  
  // Validate calculated target price
  if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
    consoleLogger.push(`MM ${symbol}`, `⚠️ Cannot place flipped order: invalid target price calculated`);
    consoleLogger.print();
    return;
  }

  try {
    let order;
    const minSize = symbolOptions?.marketMaking?.startingSlotQuote ?? 5.01;
    const minQty = filter?.minQty ?? 1e-9;
    let notional = sizeBase * targetPrice;
    
    if (notional < minNotional) return;
    if (notional < minSize) {
      sizeBase = minSize / targetPrice;
      notional = sizeBase * targetPrice; // Recalculate after adjustment
    }
    
    // Validate adjusted size meets minimum requirements
    if (sizeBase <= 0 || sizeBase < minQty || notional < minNotional) {
      consoleLogger.push(`MM ${symbol}`, `⚠️ Cannot place flipped order: size too small after adjustment`);
      consoleLogger.print();
      return;
    }
    
    if (slot.currentSide === "sell") {
      order = await placeSellOrder(exchange, exchangeOptions, symbol, sizeBase, targetPrice, 2);
    } else {
      order = await placeBuyOrder(exchange, exchangeOptions, symbol, sizeBase, targetPrice, 2);
    }

    if (order?.orderId) {
      slot.activeOrderId = String(order.orderId);
      slot.openQtyBase = Number(order.qty) || sizeBase;
      slot.restingPrice = Number(order.price) || targetPrice; // update to new price

      rememberPlacedOrder(getMmState(toSymbolKey(symbol)), slot.activeOrderId, slot.restingPrice, slot.currentSide);

      consoleLogger.push(
        `MM ${symbol}`,
        `✅ Re-placed ${slot.currentSide.toUpperCase()} ${sizeBase.toFixed(8)} @ ${targetPrice.toFixed(8)} (+spread capture)`
      );
    }
    consoleLogger.print();
  } catch (error: any) {
    consoleLogger.push(`MM ${symbol}`, `❌ Place flipped failed: ${error?.message}`);
    logToFile("./logs/mm-error.log", `Place flipped failed ${symbol}: ${error?.message}`);
    consoleLogger.print();
  }
};

const reconcileGridOrders = async (
  exchange: Exchange,
  consoleLogger: ConsoleLogger,
  symbol: string,
  exchangeOptions: ExchangeOptions,
  symbolOptions: SymbolOptions,
  state: MmState,
): Promise<void> => {
  if (state.slots.size === 0 || state.isLocked) return;

  try {
    const currentOpenOrders = await getOpenOrders(exchange, symbol);
    
    // Validate currentOpenOrders
    if (!Array.isArray(currentOpenOrders)) {
      consoleLogger.push(`MM ${symbol}`, `⚠️ Invalid open orders data received`);
      consoleLogger.print();
      return;
    }
    
    // compare currentOpenOrders to state.openOrders to detect changes
    for (const order of state.openOrders) {
      const stillOpen = currentOpenOrders.find(o => o.orderId === order.orderId);
      if (!stillOpen) {
        const slot = Array.from(state.slots.values()).find(s => s.activeOrderId === order.orderId);
        if (slot) {
          setFlippedSlotState(slot, flipSide(slot.currentSide), "order no longer open", symbol, consoleLogger);
          await placeFlippedOrder(
            exchange,
            consoleLogger,
            symbol,
            exchangeOptions,
            symbolOptions,
            slot,
            symbolFilters[toSymbolKey(symbol)],
            symbolOptions.marketMaking?.spreadPercent ?? 0.2,
          );
        }
      }
    }
  } catch (error: any) {
    logToFile("./logs/mm-error.log", `Reconcile failed ${symbol}: ${error?.message}`);
  }

  state.openOrders = await getOpenOrders(exchange, symbol);

  consoleLogger.print();
};

export const handleTradeUpdate = async (
  exchange: Exchange,
  consoleLogger: ConsoleLogger,
  symbol: string,
  exchangeOptions: ExchangeOptions,
  symbolOptions: SymbolOptions,
  trade: Trade,
): Promise<void> => {
  if (!symbolOptions?.marketMaking || symbolOptions.enabled === false) return;

  const state = getMmState(toSymbolKey(symbol));
  if (state.slots.size === 0) return;

  // Validate trade object
  if (!trade || !trade.price || !trade.qty) {
    consoleLogger.push(`MM ${symbol}`, `⚠️ Invalid trade data received`);
    consoleLogger.print();
    return;
  }

  try {
    const priceNum = Number(trade.price);
    const qtyNum = Number(trade.qty);
    
    if (!Number.isFinite(priceNum) || priceNum <= 0 || !Number.isFinite(qtyNum) || qtyNum <= 0) {
      consoleLogger.push(`MM ${symbol}`, `⚠️ Invalid trade values: price=${trade.price}, qty=${trade.qty}`);
      consoleLogger.print();
      return;
    }
    
    consoleLogger.push(`MM ${symbol}`, `Trade update received @ ${priceNum.toFixed(8)} (${qtyNum} qty). Triggering reconciliation...`);

    // Just trigger full reconciliation instead of trying to match orderId
    await reconcileGridOrders(exchange, consoleLogger, symbol, exchangeOptions, symbolOptions, state);
  } catch (error: any) {
    consoleLogger.push(`MM ${symbol}`, `❌ Trade update handling failed: ${error?.message}`);
    logToFile("./logs/mm-error.log", `Trade update failed ${symbol}: ${error?.message}
${error?.stack}`);
    consoleLogger.print();
  }
};

export const initMarketMaking = async (
  _discord: Client,
  exchange: Exchange,
  consoleLogger: ConsoleLogger,
  symbol: string,
  orderbook: Orderbook,
  _processOptions: ConfigOptions,
  exchangeOptions: ExchangeOptions,
  symbolOptions: SymbolOptions,
): Promise<void> => {
  if (!symbolOptions?.marketMaking || symbolOptions.enabled === false) {
    consoleLogger.push(`MM ${symbol}`, "Market making disabled or not configured");
    consoleLogger.print();
    return;
  }

  // Validate symbol format
  if (!symbol || typeof symbol !== "string" || !symbol.includes("/")) {
    consoleLogger.push(`MM ${symbol}`, "❌ Invalid symbol format. Expected format: BASE/QUOTE");
    consoleLogger.print();
    return;
  }
  
  // Validate orderbook
  if (!orderbook || typeof orderbook !== "object" || !orderbook.bids || !orderbook.asks) {
    consoleLogger.push(`MM ${symbol}`, "❌ Invalid orderbook provided");
    consoleLogger.print();
    return;
  }

  try {
    const symbolKey = toSymbolKey(symbol);
    const state = getMmState(symbolKey);

    // 1. Full reset
  state.slots.clear();
  state.fixedMidPrice = null;
  state.gridSignature = "";

  // 2. Cancel everything
  consoleLogger.push(`MM ${symbol}`, "Cancelling all existing open orders...");
  consoleLogger.print();
  state.openOrders = await getOpenOrders(exchange, symbol);
  for (const order of state.openOrders) {
    try {
      await cancelOrder(exchange, symbol, order.orderId);
    } catch (error: any) {
      consoleLogger.push(`MM ${symbol}`, `⚠️ Failed to cancel order ${order.orderId}: ${error?.message}`);
      logToFile("./logs/mm-error.log", `Cancel order failed ${symbol} ${order.orderId}: ${error?.message}`);
    }
    await delay(800);
  }
  await delay(3000);

  // 3. Resolve mid price
  const opts = symbolOptions.marketMaking;
  if (!opts) {
    consoleLogger.push(`MM ${symbol}`, "❌ Market making configuration missing");
    consoleLogger.print();
    return;
  }
  const fixedMidPrice = resolveStaticMidPrice(state, opts, orderbook);
  if (!fixedMidPrice) {
    consoleLogger.push(`MM ${symbol}`, "❌ Could not determine fixed mid price. Aborting init.");
    consoleLogger.print();
    return;
  }
  state.fixedMidPrice = fixedMidPrice;

  const filter = symbolFilters[symbolKey];
  const minNotional = getEffectiveMinNotional(symbol, filter?.minNotional ?? 1e-9);
  const levelsPerSide = Math.max(1, Math.min(100, Math.floor(opts.levels ?? 50)));

  // 4. Build grid
  const levels = buildStaticGridLevels(
    fixedMidPrice,
    opts.spreadPercent ?? 0.2,
    opts.levelSpacingPercent ?? 0.15,
    levelsPerSide,
    filter?.tickSize ?? 0,
    orderbook
  );

  if (levels.length === 0) {
    consoleLogger.push(`MM ${symbol}`, "❌ No valid grid levels generated.");
    consoleLogger.print();
    return;
  }

  ensureSlotSkeleton(state, levels);
  state.gridSignature = buildGridSignature(
    symbol,
    fixedMidPrice,
    opts.spreadPercent ?? 0.2,
    opts.levelSpacingPercent ?? 0.15,
    levelsPerSide,
    levels
  );

  consoleLogger.push(`MM ${symbol}`, `✅ Grid initialized with ${levels.length} levels around mid=${fixedMidPrice.toFixed(8)}`);

  // 5. Place initial orders based on current balances
  const balances = await getCurrentBalances(exchange);
  
  if (!balances) {
    consoleLogger.push(`MM ${symbol}`, "❌ Failed to get current balances");
    consoleLogger.print();
    return;
  }

  // Validate symbol format and split
  const symbolParts = symbol?.split("/") || [];
  if (symbolParts.length !== 2 || !symbolParts[0] || !symbolParts[1]) {
    consoleLogger.push(`MM ${symbol}`, "❌ Invalid symbol format: missing base or quote asset");
    consoleLogger.print();
    return;
  }
  
  const [base, quote] = symbolParts;
  
  const startingQuote = getStartingSlotQuoteNotional(opts, minNotional);

  const buySlots = Array.from(state.slots.values()).filter(s => s.defaultSide === "buy");
  const sellSlots = Array.from(state.slots.values()).filter(s => s.defaultSide === "sell");

  // Calculate base amount for sell slots from quote amount
  const sellBaseAmount = fixedMidPrice > 0 ? startingQuote / fixedMidPrice : startingQuote;

  const placements: MmPlacement[] = [
    ...buildSidePlacements(buySlots, "buy", balances[quote]?.crypto ?? 0, minNotional, filter?.minQty ?? 1e-9, filter?.stepSize ?? 0, startingQuote),
    ...buildSidePlacements(sellSlots, "sell", balances[base]?.crypto ?? 0, minNotional, filter?.minQty ?? 1e-9, filter?.stepSize ?? 0, sellBaseAmount),
  ];

  if (placements.length > 0) {
    await placeStaticGridOrders(
      exchange,
      symbol,
      exchangeOptions,
      state,
      placements,
      minNotional,
      startingQuote,
      filter?.minQty ?? 1.01,
      consoleLogger
    );
  } else {
    consoleLogger.push(`MM ${symbol}`, "⚠️ No placements generated (insufficient balance?).");
  }

  state.openOrders = await getOpenOrders(exchange, symbol);
  consoleLogger.print();
  } catch (error: any) {
    consoleLogger.push(`MM ${symbol}`, `❌ Initialization error: ${error?.message}`);
    logToFile("./logs/mm-error.log", `Market making init failed ${symbol}: ${error?.message}
${error?.stack}`);
    consoleLogger.print();
  }
};