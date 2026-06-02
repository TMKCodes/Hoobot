import { Client } from "discord.js";
import { ConsoleLogger } from "../Utilities/ConsoleLogger";
import { ConfigOptions, ExchangeOptions, SymbolOptions, toSymbolKey } from "../Utilities/Args";
import { Exchange } from "../Exchanges/Exchange";
import { Orderbook } from "../Exchanges/Orderbook";
import { getOpenOrders, cancelOrder } from "../Exchanges/Orders";
import { placeBuyOrder, placeSellOrder } from "../Exchanges/Trades";
import { getCurrentBalances } from "../Exchanges/Balances";
import { logToFile } from "../Utilities/LogToFile";
import { symbolFilters } from "../symbolFiltersStore";

// ── Types ─────────────────────────────────────────────────────────────────────

interface MmQuote {
  price: number;
  sizeBase: number;
  side: "buy" | "sell";
}

/** Per-symbol runtime state that survives across orderbook-update callbacks. */
interface MmState {
  /** Epoch ms of the last completed re-quote cycle. */
  lastRefreshMs: number;
  /** Guards against concurrent cycle execution on rapid book events. */
  isRefreshing: boolean;
}

// ── State store ───────────────────────────────────────────────────────────────

const mmStateMap = new Map<string, MmState>();

const getMmState = (symbolKey: string): MmState => {
  if (!mmStateMap.has(symbolKey)) {
    mmStateMap.set(symbolKey, { lastRefreshMs: 0, isRefreshing: false });
  }
  return mmStateMap.get(symbolKey)!;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Derive mid price from a live orderbook.
 * Returns null when the book is empty or crossed (should never happen on a healthy feed).
 */
const getMidPrice = (orderbook: Orderbook): number | null => {
  const bidPrices = Object.keys(orderbook.bids).map(parseFloat).filter(Number.isFinite);
  const askPrices = Object.keys(orderbook.asks).map(parseFloat).filter(Number.isFinite);
  if (bidPrices.length === 0 || askPrices.length === 0) return null;
  const bestBid = Math.max(...bidPrices);
  const bestAsk = Math.min(...askPrices);
  if (bestAsk <= bestBid) return null; // crossed book — do not quote
  return (bestBid + bestAsk) / 2;
};

/**
 * Compute two-sided desired quotes with inventory-based reservation-price skewing.
 *
 * Inventory skew logic (Avellaneda-Stoikov inspired):
 *   - Long base  (baseRatio > target) → lower reservation price → cheaper ask → offload base
 *   - Long quote (baseRatio < target) → raise  reservation price → cheaper bid → accumulate base
 *
 * The skew is capped at 90 % of the half-spread so bid and ask can never cross.
 *
 * WASH-TRADE GUARDS (two layers):
 *   1. Per-level: bid_i < ask_i is enforced before the quote is added.
 *   2. Aggregate: maxBid < minAsk is asserted after all levels are computed.
 *      If this fails the entire quote set is discarded.
 */
const computeDesiredQuotes = (
  midPrice: number,
  baseBalance: number,
  quoteBalance: number,
  opts: NonNullable<SymbolOptions["marketMaking"]>,
): MmQuote[] => {
  const spreadFrac = Math.max(0.0001, opts.spreadPercent / 100); // never below 0.01 %
  const halfSpread = spreadFrac / 2;
  const levelSpacing = Math.max(0, (opts.levelSpacingPercent ?? 0) / 100);
  const levels = Math.max(1, Math.min(5, opts.levels ?? 1));
  const inventoryTarget = opts.inventoryTarget ?? 0.5;
  const skewFactor = Math.max(0, Math.min(1, opts.inventorySkewFactor ?? 0.5));

  // Inventory imbalance: positive = long base, negative = long quote
  const baseValue = baseBalance * midPrice;
  const totalValue = baseValue + quoteBalance;
  const imbalance = totalValue > 0 ? baseValue / totalValue - inventoryTarget : 0;

  // Cap skew so the reservation price cannot push quotes to cross
  const maxSkewFrac = halfSpread * 0.9;
  const skew = Math.max(-maxSkewFrac, Math.min(maxSkewFrac, imbalance * skewFactor));
  const reservationPrice = midPrice * (1 - skew);

  const quotes: MmQuote[] = [];

  for (let i = 0; i < levels; i++) {
    const bidPrice = reservationPrice * (1 - halfSpread - i * levelSpacing);
    const askPrice = reservationPrice * (1 + halfSpread + i * levelSpacing);

    // Layer-1 wash-trade guard: bid must be strictly below ask for this level
    if (bidPrice >= askPrice) {
      logToFile(
        "./logs/mm-safety.log",
        `[MM SAFETY] ${new Date().toISOString()} level ${i}: bid ${bidPrice} >= ask ${askPrice} — level skipped`,
      );
      continue;
    }

    const perLevelQuote = opts.orderSizeQuote !== undefined ? opts.orderSizeQuote : quoteBalance / levels;
    const bidSizeBase = perLevelQuote / bidPrice;
    const perLevelBase = opts.orderSizeBase !== undefined ? opts.orderSizeBase : baseBalance / levels;
    const askSizeBase = perLevelBase;

    // Only push quotes with a positive size — allows one-sided operation when
    // the other side of the pair has no balance (full-balance mode gives size 0).
    if (bidSizeBase > 0) quotes.push({ price: bidPrice, sizeBase: bidSizeBase, side: "buy" });
    if (askSizeBase > 0) quotes.push({ price: askPrice, sizeBase: askSizeBase, side: "sell" });
  }

  if (quotes.length === 0) return [];

  // Layer-2 wash-trade guard: aggregate cross-price check
  const allBidPrices = quotes.filter((q) => q.side === "buy").map((q) => q.price);
  const allAskPrices = quotes.filter((q) => q.side === "sell").map((q) => q.price);
  const maxBid = Math.max(...allBidPrices);
  const minAsk = Math.min(...allAskPrices);

  if (maxBid >= minAsk) {
    logToFile(
      "./logs/mm-safety.log",
      `[MM SAFETY] ${new Date().toISOString()} aggregate: maxBid ${maxBid} >= minAsk ${minAsk} — discarding all quotes`,
    );
    return [];
  }

  return quotes;
};

/**
 * Synchronise the exchange order book with the desired quote set.
 *
 * Algorithm:
 *   1. Fetch all open orders for this symbol from the exchange.
 *   2. Match each open order to a desired quote (same side, price within tolerancePct).
 *   3. Cancel every open order that has no matching desired quote (stale re-quote).
 *   4. Place new orders for every desired quote that has no matching open order.
 *
 * Balance checks before each placement ensure we never over-commit inventory.
 * The tolerance band (default 0.05 %) avoids churning orders on sub-tick price jitter.
 */
const syncOrders = async (
  exchange: Exchange,
  symbol: string,
  symbolKey: string,
  desiredQuotes: MmQuote[],
  exchangeOptions: ExchangeOptions,
  baseBalance: number,
  quoteBalance: number,
  opts: NonNullable<SymbolOptions["marketMaking"]>,
  tolerancePct: number = 0.0005,
): Promise<void> => {
  const openOrders = await getOpenOrders(exchange, symbol);

  // Step 1: match open orders to desired quotes
  const matchedOrderIds = new Set<string>();
  const matchedQuoteIndices = new Set<number>();

  for (const order of openOrders) {
    const orderPrice = parseFloat(order.price);
    const orderSide: "buy" | "sell" = order.isBuyer ? "buy" : "sell";

    for (let i = 0; i < desiredQuotes.length; i++) {
      if (matchedQuoteIndices.has(i)) continue;
      const q = desiredQuotes[i]!;
      if (q.side !== orderSide) continue;
      const priceDiff = Math.abs(orderPrice - q.price) / q.price;
      if (priceDiff <= tolerancePct) {
        matchedOrderIds.add(order.orderId);
        matchedQuoteIndices.add(i);
        break;
      }
    }
  }

  // Step 2: cancel stale orders (those not matching any desired quote)
  for (const order of openOrders) {
    if (!matchedOrderIds.has(order.orderId)) {
      try {
        await cancelOrder(exchange, symbolKey, order.orderId);
      } catch (e) {
        logToFile("./logs/mm-error.log", `${new Date().toISOString()} cancel failed orderId=${order.orderId}: ${e}`);
      }
    }
  }

  // Step 3: track currently committed exposure (already-live matched orders)
  let pendingBidQuote = 0;
  let pendingAskBase = 0;
  for (const order of openOrders) {
    if (!matchedOrderIds.has(order.orderId)) continue;
    if (order.isBuyer) {
      pendingBidQuote += parseFloat(order.qty) * parseFloat(order.price);
    } else {
      pendingAskBase += parseFloat(order.qty);
    }
  }

  const maxQuoteExposure = opts.maxQuoteExposure ?? Infinity;
  const maxBaseExposure = opts.maxBaseExposure ?? Infinity;
  const filter = symbolFilters[symbolKey];
  const minNotional = filter?.minNotional ?? 0;
  const minQty = filter?.minQty ?? 0;

  // Step 4: place orders for unmatched desired quotes
  for (let i = 0; i < desiredQuotes.length; i++) {
    if (matchedQuoteIndices.has(i)) continue;
    const q = desiredQuotes[i]!;

    if (q.side === "buy") {
      const bidCostQuote = q.sizeBase * q.price;

      // Exchange minimum notional and exposure/balance checks
      if (bidCostQuote < minNotional) continue;
      if (pendingBidQuote + bidCostQuote > maxQuoteExposure) continue;
      if (bidCostQuote > quoteBalance - pendingBidQuote) continue;

      pendingBidQuote += bidCostQuote;

      if (exchangeOptions.dryRun) {
        logToFile(
          "./logs/mm-dryrun.log",
          `${new Date().toISOString()} [DRY RUN] BUY ${q.sizeBase.toFixed(8)} ${symbol.split("/")[0]} @ ${q.price.toFixed(8)}`,
        );
      } else {
        try {
          await placeBuyOrder(exchange, exchangeOptions, symbol, q.sizeBase, q.price, 2);
        } catch (e) {
          logToFile("./logs/mm-error.log", `${new Date().toISOString()} place BUY failed @ ${q.price}: ${e}`);
        }
      }
    } else {
      // Exchange minimum qty and exposure/balance checks
      if (q.sizeBase < minQty) continue;
      if (pendingAskBase + q.sizeBase > maxBaseExposure) continue;
      if (q.sizeBase > baseBalance - pendingAskBase) continue;

      pendingAskBase += q.sizeBase;

      if (exchangeOptions.dryRun) {
        logToFile(
          "./logs/mm-dryrun.log",
          `${new Date().toISOString()} [DRY RUN] SELL ${q.sizeBase.toFixed(8)} ${symbol.split("/")[0]} @ ${q.price.toFixed(8)}`,
        );
      } else {
        try {
          await placeSellOrder(exchange, exchangeOptions, symbol, q.sizeBase, q.price, 2);
        } catch (e) {
          logToFile("./logs/mm-error.log", `${new Date().toISOString()} place SELL failed @ ${q.price}: ${e}`);
        }
      }
    }
  }
};

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Automated market-making mode.
 * Called on every orderbook update for this symbol.
 *
 * ### Strategy
 * The bot continuously posts resting limit orders on both sides of the spread,
 * earning the bid-ask spread as maker rebates/fees while providing liquidity to
 * DexTrade traders.
 *
 * ### Legal compliance
 * - **No wash trading**: bid prices are always strictly below ask prices (enforced
 *   at both per-level and aggregate level).
 * - **No spoofing**: orders are left to rest and are only cancelled when the market
 *   has moved enough that re-quoting adds genuine liquidity at a better price.
 * - **No front-running**: the bot reacts to public orderbook data only.
 * - **Refresh throttle** (`refreshIntervalMs`) prevents excessive cancellation loops
 *   that could resemble spoofing patterns.
 *
 * ### Inventory management
 * The reservation price is shifted from the market mid-price based on current
 * base/quote inventory imbalance, nudging the bot to passively rebalance over time
 * without crossing the spread.
 */
export const marketMaking = async (
  _discord: Client,
  exchange: Exchange,
  consoleLogger: ConsoleLogger,
  symbol: string,
  orderbook: Orderbook,
  _processOptions: ConfigOptions,
  exchangeOptions: ExchangeOptions,
  symbolOptions: SymbolOptions,
): Promise<void> => {
  if (symbolOptions.enabled === false) return;
  if (!symbolOptions.marketMaking) return;

  const opts = symbolOptions.marketMaking;
  const symbolKey = toSymbolKey(symbol);
  const state = getMmState(symbolKey);
  const now = Date.now();

  // Throttle: only re-quote when the configured interval has elapsed
  if (now - state.lastRefreshMs < (opts.refreshIntervalMs ?? 5000)) return;
  // Guard against concurrent cycles (can happen when book events arrive faster than one cycle)
  if (state.isRefreshing) return;

  state.isRefreshing = true;
  state.lastRefreshMs = now;

  try {
    const midPrice = getMidPrice(orderbook);
    if (midPrice === null) {
      consoleLogger.push(`MM ${symbol}`, "Cannot derive mid price — book empty or crossed");
      consoleLogger.print();
      return;
    }

    // Refresh balances so sizing and exposure checks use current figures
    const balances = await getCurrentBalances(exchange);
    exchangeOptions.balances = balances;

    const [base, quote] = symbol.split("/");
    const baseBalance = balances[base!]?.crypto ?? 0;
    const quoteBalance = balances[quote!]?.crypto ?? 0;

    // Compute the desired quote set for this cycle
    const desiredQuotes = computeDesiredQuotes(midPrice, baseBalance, quoteBalance, opts);

    if (desiredQuotes.length === 0) {
      consoleLogger.push(
        `MM ${symbol}`,
        "No quotes to place — safety guard triggered or insufficient balance on both sides",
      );
      consoleLogger.print();
      return;
    }

    // Reconcile live orders with desired quotes
    await syncOrders(exchange, symbol, symbolKey, desiredQuotes, exchangeOptions, baseBalance, quoteBalance, opts);

    // ── Console display ──────────────────────────────────────────────────────
    const bids = desiredQuotes.filter((q) => q.side === "buy");
    const asks = desiredQuotes.filter((q) => q.side === "sell");

    consoleLogger.push("MM Symbol", symbol);
    consoleLogger.push("Mid Price", midPrice.toFixed(8));
    consoleLogger.push("Bids", bids.map((q) => `${q.sizeBase.toFixed(6)} @ ${q.price.toFixed(8)}`).join(" | "));
    consoleLogger.push("Asks", asks.map((q) => `${q.sizeBase.toFixed(6)} @ ${q.price.toFixed(8)}`).join(" | "));
    consoleLogger.push("Spread", `${opts.spreadPercent}%`);
    consoleLogger.push(`${base} Balance`, `${baseBalance.toFixed(8)}`);
    consoleLogger.push(`${quote} Balance`, `${quoteBalance.toFixed(8)}`);
    consoleLogger.push("Dry Run", String(exchangeOptions.dryRun ?? false));
    consoleLogger.print();
  } catch (err) {
    logToFile(
      "./logs/mm-error.log",
      JSON.stringify({ ts: new Date().toISOString(), symbol, err: String(err) }, null, 2),
    );
    console.error(`[MarketMaking] ${symbol} error:`, err);
  } finally {
    state.isRefreshing = false;
  }
};
