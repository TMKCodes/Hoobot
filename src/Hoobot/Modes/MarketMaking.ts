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

/** Per-symbol runtime state */
interface MmState {
  lastRefreshMs: number;
  isRefreshing: boolean;
  lastMidPrice: number | null;
  startupSyncRetested: boolean;
}

// ── State store ───────────────────────────────────────────────────────────────

const mmStateMap = new Map<string, MmState>();

const getMmState = (symbolKey: string): MmState => {
  if (!mmStateMap.has(symbolKey)) {
    mmStateMap.set(symbolKey, {
      lastRefreshMs: 0,
      isRefreshing: false,
      lastMidPrice: null,
      startupSyncRetested: false,
    });
  }
  return mmStateMap.get(symbolKey)!;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const getMidPrice = (orderbook: Orderbook): number | null => {
  const bidPrices = Object.keys(orderbook.bids).map(parseFloat).filter(Number.isFinite);
  const askPrices = Object.keys(orderbook.asks).map(parseFloat).filter(Number.isFinite);
  if (bidPrices.length === 0 || askPrices.length === 0) return null;
  const bestBid = Math.max(...bidPrices);
  const bestAsk = Math.min(...askPrices);
  if (bestAsk <= bestBid) return null;
  return (bestBid + bestAsk) / 2;
};

const getEffectiveMinNotional = (symbol: string, filterMinNotional: number): number => {
  const quote = symbol.split("/")[1]?.toUpperCase() ?? "";
  const stableQuoteFloor = ["USDT", "USDC", "BUSD", "FDUSD", "DAI"].includes(quote) ? 1 : 0;
  return Math.max(filterMinNotional, stableQuoteFloor);
};

const getStartupRetestMidPrice = (midPrice: number, opts: NonNullable<SymbolOptions["marketMaking"]>): number => {
  const spreadFrac = Math.max(0.0001, opts.spreadPercent / 100);
  const levelSpacing = Math.max(0, (opts.levelSpacingPercent ?? 0) / 100);
  // Must exceed sync tolerance (0.05 %) to force stale-order cancellation.
  const shiftFrac = Math.max(0.001, spreadFrac + levelSpacing);
  return midPrice * (1 + shiftFrac);
};

const getPriceMatchToleranceAbs = (price: number, symbolKey: string, tolerancePct: number): number => {
  const tickSize = symbolFilters[symbolKey]?.tickSize ?? 0;
  const tickTolerance = tickSize > 0 ? tickSize * 0.51 : 0;
  const pctTolerance = price * tolerancePct;
  // NonKYC fallback filters may expose extremely tiny tick sizes; keep a sane minimum.
  return Math.max(tickTolerance, pctTolerance);
};

const evaluateQuoteCoverage = (
  openOrders: Array<{ orderId: string; price: string; isBuyer: boolean }>,
  desiredQuotes: MmQuote[],
  symbolKey: string,
  tolerancePct: number = 0.0005,
): { matched: number; total: number; allMatched: boolean } => {
  const matchedQuoteIndices = new Set<number>();

  for (const order of openOrders) {
    const orderPrice = parseFloat(order.price);
    const orderSide: "buy" | "sell" = order.isBuyer ? "buy" : "sell";

    for (let i = 0; i < desiredQuotes.length; i++) {
      if (matchedQuoteIndices.has(i)) continue;
      const q = desiredQuotes[i]!;
      if (q.side !== orderSide) continue;

      const absDiff = Math.abs(orderPrice - q.price);
      const absTolerance = getPriceMatchToleranceAbs(q.price, symbolKey, tolerancePct);
      if (absDiff <= absTolerance) {
        matchedQuoteIndices.add(i);
        break;
      }
    }
  }

  const matched = matchedQuoteIndices.size;
  const total = desiredQuotes.length;
  return { matched, total, allMatched: total > 0 && matched === total };
};

/**
 * Compute desired quotes - STRICT balance check
 */
const computeDesiredQuotes = (
  midPrice: number,
  baseBalance: number,
  quoteBalance: number,
  opts: NonNullable<SymbolOptions["marketMaking"]>,
  minNotional: number,
  minQty: number,
): MmQuote[] => {
  const spreadFrac = Math.max(0.0001, opts.spreadPercent / 100);
  const halfSpread = spreadFrac / 2;
  const levelSpacing = Math.max(0, (opts.levelSpacingPercent ?? 0) / 100);
  const levels = Math.max(1, Math.min(5, opts.levels ?? 1));
  const inventoryTarget = opts.inventoryTarget ?? 0.5;
  const skewFactor = Math.max(0, Math.min(1, opts.inventorySkewFactor ?? 0.5));

  const baseValue = baseBalance * midPrice;
  const totalValue = baseValue + quoteBalance;
  const imbalance = totalValue > 0 ? baseValue / totalValue - inventoryTarget : 0;

  const maxSkewFrac = halfSpread * 0.9;
  const skew = Math.max(-maxSkewFrac, Math.min(maxSkewFrac, imbalance * skewFactor));
  const reservationPrice = midPrice * (1 - skew);

  const quotes: MmQuote[] = [];
  const minNotionalBuffer = minNotional * 1.1; // stricter buffer

  for (let i = 0; i < levels; i++) {
    const bidPrice = reservationPrice * (1 - halfSpread - i * levelSpacing);
    const askPrice = reservationPrice * (1 + halfSpread + i * levelSpacing);

    if (bidPrice >= askPrice) continue;

    // BUY SIDE - Only if we have enough USDT
    if (quoteBalance >= minNotionalBuffer) {
      const perLevelQuote = opts.orderSizeQuote !== undefined ? opts.orderSizeQuote : quoteBalance / levels;

      if (perLevelQuote >= minNotionalBuffer) {
        const bidSizeBase = perLevelQuote / bidPrice;
        quotes.push({ price: bidPrice, sizeBase: bidSizeBase, side: "buy" });
      }
    }

    // SELL SIDE - Only if we have enough Base
    if (baseBalance >= minQty * 1.1) {
      const perLevelBase = opts.orderSizeBase !== undefined ? opts.orderSizeBase : baseBalance / levels;

      if (perLevelBase >= minQty) {
        quotes.push({ price: askPrice, sizeBase: perLevelBase, side: "sell" });
      }
    }
  }

  if (quotes.length === 0) return [];

  // Safety: prevent crossed quotes
  const bidPrices = quotes.filter((q) => q.side === "buy").map((q) => q.price);
  const askPrices = quotes.filter((q) => q.side === "sell").map((q) => q.price);

  if (bidPrices.length > 0 && askPrices.length > 0) {
    if (Math.max(...bidPrices) >= Math.min(...askPrices)) {
      logToFile("./logs/mm-safety.log", `[MM SAFETY] ${new Date().toISOString()} Cross detected - discarding`);
      return [];
    }
  }

  return quotes;
};

const delay = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

// ── Sync Orders ───────────────────────────────────────────────────────────────

const syncOrders = async (
  exchange: Exchange,
  symbol: string,
  symbolKey: string,
  desiredQuotes: MmQuote[],
  exchangeOptions: ExchangeOptions,
  baseBalance: number,
  quoteBalance: number,
  opts: NonNullable<SymbolOptions["marketMaking"]>,
  minNotional: number,
  minQty: number,
): Promise<void> => {
  const openOrders = await getOpenOrders(exchange, symbol);
  const [base, quote] = symbol.split("/");

  const matchedOrderIds = new Set<string>();
  const matchedQuoteIndices = new Set<number>();

  // Cancel orders
  for (const order of openOrders) {
    try {
      await cancelOrder(exchange, symbolKey, order.orderId);
      await delay(1000);
    } catch (e) {
      logToFile("./logs/mm-error.log", `${new Date().toISOString()} Cancel failed ${order.orderId}: ${e}`);
    }
  }

  // Refresh balances after cancellations so recreate checks use up-to-date free funds.
  const refreshedBalances = await getCurrentBalances(exchange);
  exchangeOptions.balances = refreshedBalances;
  const refreshedBaseBalance = refreshedBalances[base!]?.crypto ?? baseBalance;
  const refreshedQuoteBalance = refreshedBalances[quote!]?.crypto ?? quoteBalance;

  // Place new orders - with final balance guard
  const maxQuoteExposure = opts.maxQuoteExposure ?? Infinity;
  const maxBaseExposure = opts.maxBaseExposure ?? Infinity;
  let pendingBidQuote = 0;
  let pendingAskBase = 0;
  for (let i = 0; i < desiredQuotes.length; i++) {
    if (matchedQuoteIndices.has(i)) continue;
    const q = desiredQuotes[i]!;

    try {
      if (q.side === "buy") {
        const cost = q.sizeBase * q.price;
        const availableQuote = refreshedQuoteBalance - pendingBidQuote;
        if (availableQuote < minNotional * 1.1) continue;
        if (cost < minNotional * 1.1 || cost > availableQuote) continue;
        if (pendingBidQuote + cost > maxQuoteExposure) continue;

        pendingBidQuote += cost;

        if (exchangeOptions.dryRun) {
          logToFile(
            "./logs/mm-dryrun.log",
            `${new Date().toISOString()} [DRY RUN] BUY ${q.sizeBase.toFixed(8)} @ ${q.price.toFixed(8)}`,
          );
        } else {
          await placeBuyOrder(exchange, exchangeOptions, symbol, q.sizeBase, q.price, 2);
          await delay(250);
        }
      } else {
        const availableBase = refreshedBaseBalance - pendingAskBase;
        if (q.sizeBase < minQty || q.sizeBase > availableBase) continue;
        if (pendingAskBase + q.sizeBase > maxBaseExposure) continue;

        pendingAskBase += q.sizeBase;

        if (exchangeOptions.dryRun) {
          logToFile(
            "./logs/mm-dryrun.log",
            `${new Date().toISOString()} [DRY RUN] SELL ${q.sizeBase.toFixed(8)} @ ${q.price.toFixed(8)}`,
          );
        } else {
          await placeSellOrder(exchange, exchangeOptions, symbol, q.sizeBase, q.price, 2);
          await delay(250);
        }
      }
    } catch (e: any) {
      if (e.message?.includes("Minimum order value") || e.code === 10001) {
        logToFile(
          "./logs/mm-minorder.log",
          `${new Date().toISOString()} [MIN ORDER] ${symbol} ${q.side.toUpperCase()} skipped - insufficient balance`,
        );
      } else {
        logToFile("./logs/mm-error.log", `${new Date().toISOString()} Place ${q.side} failed: ${e}`);
      }
    }
  }
};

// ── Main Market Making Function ───────────────────────────────────────────────
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

  if (now - state.lastRefreshMs < (opts.refreshIntervalMs ?? 5000)) return;
  if (state.isRefreshing) return;

  state.isRefreshing = true;
  state.lastRefreshMs = now;

  try {
    const liveMidPrice = getMidPrice(orderbook);
    const midPrice = liveMidPrice ?? state.lastMidPrice;
    if (liveMidPrice !== null) state.lastMidPrice = liveMidPrice;

    if (midPrice === null) {
      consoleLogger.push(`MM ${symbol}`, "Cannot derive mid price — waiting for valid book");
      consoleLogger.print();
      return;
    }

    const balances = await getCurrentBalances(exchange);
    exchangeOptions.balances = balances;

    const [base, quote] = symbol.split("/");
    const baseBalance = balances[base!]?.crypto ?? 0;
    const quoteBalance = balances[quote!]?.crypto ?? 0;

    const filter = symbolFilters[symbolKey] || {};
    const minNotional = getEffectiveMinNotional(symbol, filter.minNotional ?? 0);
    const minQty = filter.minQty ?? 0.0001;

    // Early exit if no meaningful balance on either side
    if (quoteBalance < minNotional * 1.1 && baseBalance < minQty * 1.1) {
      consoleLogger.push(`MM ${symbol}`, "Insufficient balance on both sides - skipping");
      consoleLogger.print();
      return;
    }

    const desiredQuotes = computeDesiredQuotes(midPrice, baseBalance, quoteBalance, opts, minNotional, minQty);

    if (desiredQuotes.length === 0) {
      consoleLogger.push(`MM ${symbol}`, "No valid quotes after balance & size filters");
      consoleLogger.print();
      return;
    }

    await syncOrders(
      exchange,
      symbol,
      symbolKey,
      desiredQuotes,
      exchangeOptions,
      baseBalance,
      quoteBalance,
      opts,
      minNotional,
      minQty,
    );

    // One-time startup retest: force one cancel/recreate cycle, then restore intended quotes.
    if (!state.startupSyncRetested) {
      const retestMidPrice = getStartupRetestMidPrice(midPrice, opts);
      const retestQuotes = computeDesiredQuotes(retestMidPrice, baseBalance, quoteBalance, opts, minNotional, minQty);

      if (exchangeOptions.dryRun) {
        consoleLogger.push(`MM ${symbol}`, "Startup syncOrders retest skipped validation in dry run mode");
      } else if (retestQuotes.length > 0) {
        const baselineOrders = (await getOpenOrders(exchange, symbol)) as Array<{
          orderId: string;
          price: string;
          isBuyer: boolean;
        }>;
        const baselineOrderIds = new Set(baselineOrders.map((o) => o.orderId));

        await syncOrders(
          exchange,
          symbol,
          symbolKey,
          retestQuotes,
          exchangeOptions,
          baseBalance,
          quoteBalance,
          opts,
          minNotional,
          minQty,
        );

        const retestOrders = (await getOpenOrders(exchange, symbol)) as Array<{
          orderId: string;
          price: string;
          isBuyer: boolean;
        }>;
        const retestCoverage = evaluateQuoteCoverage(retestOrders, retestQuotes, symbolKey);
        const recreatedCount = retestOrders.filter((o) => !baselineOrderIds.has(o.orderId)).length;

        await syncOrders(
          exchange,
          symbol,
          symbolKey,
          desiredQuotes,
          exchangeOptions,
          baseBalance,
          quoteBalance,
          opts,
          minNotional,
          minQty,
        );

        const restoredOrders = (await getOpenOrders(exchange, symbol)) as Array<{
          orderId: string;
          price: string;
          isBuyer: boolean;
        }>;
        const restoreCoverage = evaluateQuoteCoverage(restoredOrders, desiredQuotes, symbolKey);

        if (retestCoverage.allMatched && restoreCoverage.allMatched && recreatedCount > 0) {
          consoleLogger.push(
            `MM ${symbol}`,
            `Startup syncOrders retest passed (recreated=${recreatedCount}, retest ${retestCoverage.matched}/${retestCoverage.total}, restore ${restoreCoverage.matched}/${restoreCoverage.total})`,
          );
        } else {
          const msg =
            `Startup syncOrders retest FAILED (recreated=${recreatedCount}, ` +
            `retest ${retestCoverage.matched}/${retestCoverage.total}, restore ${restoreCoverage.matched}/${restoreCoverage.total})`;
          consoleLogger.push(`MM ${symbol}`, msg);
          logToFile("./logs/mm-error.log", `${new Date().toISOString()} ${symbol} ${msg}`);
        }
      } else {
        consoleLogger.push(`MM ${symbol}`, "Startup syncOrders retest skipped (no valid retest quotes)");
      }
      state.startupSyncRetested = true;
    }

    // Display
    const bids = desiredQuotes.filter((q) => q.side === "buy");
    const asks = desiredQuotes.filter((q) => q.side === "sell");

    consoleLogger.push("MM Symbol", symbol);
    consoleLogger.push("Mid Price", midPrice.toFixed(8));
    consoleLogger.push("Bids", bids.map((q) => `${q.sizeBase.toFixed(6)} @ ${q.price.toFixed(8)}`).join(" | ") || "—");
    consoleLogger.push("Asks", asks.map((q) => `${q.sizeBase.toFixed(6)} @ ${q.price.toFixed(8)}`).join(" | ") || "—");
    consoleLogger.push("Spread", `${opts.spreadPercent}%`);
    consoleLogger.push(`${base} Balance`, baseBalance.toFixed(8));
    consoleLogger.push(`${quote} Balance`, quoteBalance.toFixed(8));
    consoleLogger.push("Dry Run", String(exchangeOptions.dryRun ?? false));
    consoleLogger.print();
  } catch (err) {
    logToFile(
      "./logs/mm-error.log",
      JSON.stringify(
        {
          ts: new Date().toISOString(),
          symbol,
          error: String(err),
        },
        null,
        2,
      ),
    );
    console.error(`[MarketMaking] ${symbol} error:`, err);
  } finally {
    state.isRefreshing = false;
  }
};
