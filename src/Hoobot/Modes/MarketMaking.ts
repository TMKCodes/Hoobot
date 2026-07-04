import { Client } from "discord.js";
import { ConsoleLogger } from "../Utilities/ConsoleLogger";
import { ConfigOptions, ExchangeOptions, SymbolOptions, toSymbolKey } from "../Utilities/Args";
import { Exchange } from "../Exchanges/Exchange";
import { Orderbook } from "../Exchanges/Orderbook";
import { Order, getOpenOrders, getOrder, cancelOrder } from "../Exchanges/Orders";
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
  const quoteAsset = symbol.split("/")[1]?.toUpperCase() ?? "";
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

  const bestBid = Math.max(...Object.keys(orderbook.bids).map(Number).filter(n => Number.isFinite(n)));
  const bestAsk = Math.min(...Object.keys(orderbook.asks).map(Number).filter(n => Number.isFinite(n)));

  const spread = Math.max(0, spreadPercent / 100);
  const gridSpacing = Math.max(0.000001, gridSpacingPercent / 100);
  const sideLevels = Math.max(1, Math.min(100, Math.floor(levelsPerSide)));
  const spreadHalf = spread / 2;
  const levels: MmGridLevel[] = [];
  const seen = new Set<MmSlotKey>();

  let bidPrice = midPrice * (1 - spreadHalf);
  let askPrice = midPrice * (1 + spreadHalf);

  for (let distanceIndex = 0; distanceIndex < sideLevels; distanceIndex++) {
    const roundedBid = roundToStep(bidPrice, tickSize, "down");
    const roundedAsk = roundToStep(askPrice, tickSize, "up");

    const bidKey = getPriceKey(roundedBid);
    const askKey = getPriceKey(roundedAsk);

    if (roundedBid > 0 && !seen.has(bidKey) && roundedBid < bestAsk) {
      levels.push({ side: "buy", price: roundedBid, distanceIndex });
      seen.add(bidKey);
    }
    if (roundedAsk > 0 && !seen.has(askKey) && roundedAsk > bestBid) {
      levels.push({ side: "sell", price: roundedAsk, distanceIndex });
      seen.add(askKey);
    }

    bidPrice *= 1 - gridSpacing;
    askPrice *= 1 + gridSpacing;
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
    fixedMidPrice.toFixed(12),
    spreadPercent.toFixed(8),
    gridSpacingPercent.toFixed(8),
    levelsPerSide,
    levels.map((level) => `${level.side}:${level.price.toFixed(12)}`).join("|"),
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
    const sizeBase = (side === "sell")
      ? roundToStep(startingSlotAmount, stepSize, "down")
      : roundToStep(startingSlotAmount / slot.restingPrice, stepSize, "up");

    const notional = sizeBase * slot.restingPrice;

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
  const [baseAsset, quoteAsset] = symbol.split("/");
  const requiredNotional = Math.max(minNotional, startingSlotQuote);
  const queuedSlotKeys = new Set<MmSlotKey>();

  let balances = await getCurrentBalances(exchange);
  let remainingBase = balances[baseAsset!]?.crypto ?? 0;
  let remainingQuote = balances[quoteAsset!]?.crypto ?? 0;

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

    if (placement.sizeBase < minQty || (isBuy && quoteRequired < requiredNotional) || cost > safeBalance) {
      consoleLogger.push(`MM ${symbol}`, `Skipping ${placement.side} ${placement.price}: Insufficient tracked funds or limits.`);
      continue;
    }
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
    }

    consoleLogger.print();
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
  slot: MmGridSlot,
  filter: any,
  spreadPercent: number,           // Add this parameter
): Promise<void> => {
  const sizeBase = roundToStep(slot.targetSizeBase, filter?.stepSize ?? 0, "down");
  if (sizeBase <= 0) return;

  const minNotional = getEffectiveMinNotional(symbol, filter?.minNotional ?? 1e-9);
  const originalPrice = slot.restingPrice || slot.price;

  // === SPREAD CAPTURE LOGIC ===
  let targetPrice: number;
  const halfSpread = (spreadPercent / 100) / 2;

  if (slot.currentSide === "buy") {
    // Just bought → now sell HIGHER
    targetPrice = roundToStep(originalPrice * (1 + halfSpread * 1.5), filter?.tickSize ?? 0, "up"); // slight buffer
  } else {
    // Just sold → now buy LOWER
    targetPrice = roundToStep(originalPrice * (1 - halfSpread * 1.5), filter?.tickSize ?? 0, "down");
  }

  try {
    let order;
    if (slot.currentSide === "buy") {
      // Placing sell
      if (sizeBase * targetPrice < minNotional) return;
      order = await placeSellOrder(exchange, exchangeOptions, symbol, sizeBase, targetPrice, 2);
    } else {
      // Placing buy
      if (sizeBase * targetPrice < minNotional) return;
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
  } catch (error: any) {
    logToFile("./logs/mm-error.log", `Place flipped failed ${symbol}: ${error?.message}`);
  }
  consoleLogger.print();
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
    // compare currentOpenOrders to state.openOrders to detect changes
    for (const order of state.openOrders) {
      const stillOpen = currentOpenOrders.find(o => o.orderId === order.orderId);
      if (!stillOpen) {
        const slot = [...state.slots.values()].find(s => s.activeOrderId === order.orderId);
        if (slot) {
          setFlippedSlotState(slot, flipSide(slot.currentSide), "order no longer open", symbol, consoleLogger);
          await placeFlippedOrder(
            exchange,
            consoleLogger,
            symbol,
            exchangeOptions,
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

  consoleLogger.push(`MM ${symbol}`, `Trade update received @ ${Number(trade.price).toFixed(8)} (${trade.qty} qty). Triggering reconciliation...`);

  // Just trigger full reconciliation instead of trying to match orderId
  await reconcileGridOrders(exchange, consoleLogger, symbol, exchangeOptions, symbolOptions, state);
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
  if (!symbolOptions?.marketMaking || symbolOptions.enabled === false) return;

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
    await cancelOrder(exchange, symbol, order.orderId).catch(() => { });
    await delay(800);
  }
  await delay(3000);

  // 3. Resolve mid price
  const opts = symbolOptions.marketMaking;
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

  const [base, quote] = symbol.split("/");
  const startingQuote = getStartingSlotQuoteNotional(opts, minNotional);

  const buySlots = [...state.slots.values()].filter(s => s.defaultSide === "buy");
  const sellSlots = [...state.slots.values()].filter(s => s.defaultSide === "sell");

  const placements: MmPlacement[] = [
    ...buildSidePlacements(buySlots, "buy", balances[quote]?.crypto ?? 0, minNotional, filter?.minQty ?? 1e-9, filter?.stepSize ?? 0, startingQuote),
    ...buildSidePlacements(sellSlots, "sell", balances[base]?.crypto ?? 0, minNotional, filter?.minQty ?? 1e-9, filter?.stepSize ?? 0, startingQuote / fixedMidPrice),
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
};