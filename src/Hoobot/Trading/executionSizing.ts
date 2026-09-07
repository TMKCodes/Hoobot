import { Filter } from "../Exchanges/Filters";
import { SymbolOptions } from "../Utilities/Args";
import { simFeeRatePerLeg } from "./tradeGates";

export const LIVE_BASE_RESERVE = 0.98;
export const LIVE_ASK_DISCOUNT = 0.999;
export const LIVE_BID_PREMIUM = 1.001;
export const MIN_QUOTE_NOTIONAL = 1.1;

export function roundToStep(value: number, step: number): number {
  if (!Number.isFinite(step) || step <= 0) return value;
  const tickSizePrecision = Math.floor(Math.log10(Math.abs(step))) * -1;
  const rounded = Math.round(value / step) * step;
  return Number(rounded.toFixed(Math.max(0, tickSizePrecision)));
}

export function capSellBaseByGrowingMax(baseQuantity: number, symbolOptions: SymbolOptions): number {
  const cap = symbolOptions.growingMax?.sell;
  if (cap !== undefined && cap > 0) return Math.min(baseQuantity, cap);
  return baseQuantity;
}

export function capBuyQuoteByGrowingMax(
  quoteQuantity: number,
  symbolOptions: SymbolOptions,
  applyGrowingMaxCap: boolean = true,
): number {
  if (!applyGrowingMaxCap) return quoteQuantity;
  const cap = symbolOptions.growingMax?.buy;
  if (cap !== undefined && cap > 0) return Math.min(quoteQuantity, cap);
  return quoteQuantity;
}

export type LiveSellExecution = {
  askPrice: number;
  askPriceDiscounted: number;
  quantityInBase: number;
  roundedPrice: number;
  roundedQuantityInBase: number;
  roundedQuantityInQuote: number;
};

export function computeLiveSellExecution(opts: {
  baseBalance: number;
  orderBookAsks: Record<string, number>;
  filter: Filter;
  symbolOptions: SymbolOptions;
  forceQuantityInBase?: number;
}): LiveSellExecution | null {
  const askPrices = Object.keys(opts.orderBookAsks)
    .map((p) => parseFloat(p))
    .sort((a, b) => a - b);
  const askPrice = askPrices.length > 0 ? askPrices[0] : null;
  if (!askPrice || !Number.isFinite(askPrice) || askPrice <= 0) return null;

  const askPriceDiscounted = askPrice * LIVE_ASK_DISCOUNT;
  const topAskQty = opts.orderBookAsks[askPrice.toString()];
  let quantityInBase = opts.baseBalance * LIVE_BASE_RESERVE;
  quantityInBase = capSellBaseByGrowingMax(quantityInBase, opts.symbolOptions);
  if (!isNaN(topAskQty) && quantityInBase > topAskQty) {
    quantityInBase = topAskQty;
  }
  if (opts.forceQuantityInBase !== undefined) {
    quantityInBase = opts.forceQuantityInBase;
  }

  const roundedPrice = roundToStep(askPriceDiscounted, opts.filter.tickSize);
  const roundedQuantityInBase = roundToStep(quantityInBase, opts.filter.stepSize);
  const quantityInQuote = quantityInBase * askPriceDiscounted * LIVE_BASE_RESERVE;
  const roundedQuantityInQuote = roundToStep(quantityInQuote, opts.filter.stepSize);

  return {
    askPrice,
    askPriceDiscounted,
    quantityInBase,
    roundedPrice,
    roundedQuantityInBase,
    roundedQuantityInQuote,
  };
}

export type LiveBuyExecution = {
  bidPrice: number;
  bidPriceIncremented: number;
  roundedPrice: number;
  roundedQuantityInBase: number;
  roundedQuantityInQuote: number;
};

export function computeLiveBuyExecution(opts: {
  quoteBalance: number;
  orderBookBids: Record<string, number>;
  filter: Filter;
  symbolOptions: SymbolOptions;
  forceQuantityInBase?: number;
}): LiveBuyExecution | null {
  const bidPrices = Object.keys(opts.orderBookBids)
    .map((p) => parseFloat(p))
    .sort((a, b) => b - a);
  const bidPrice = bidPrices.length > 0 ? bidPrices[0] : null;
  if (!bidPrice || !Number.isFinite(bidPrice) || bidPrice <= 0) return null;

  const bidPriceIncremented = bidPrice * LIVE_BID_PREMIUM;
  const topBidQuote = opts.orderBookBids[bidPrice.toString()];
  let quantityInQuote = capBuyQuoteByGrowingMax(opts.quoteBalance, opts.symbolOptions, true);
  if (!isNaN(topBidQuote) && quantityInQuote > topBidQuote) {
    quantityInQuote = topBidQuote;
  }
  if (opts.forceQuantityInBase !== undefined) {
    quantityInQuote = opts.forceQuantityInBase * bidPriceIncremented;
  }

  const roundedPrice = roundToStep(bidPriceIncremented, opts.filter.tickSize);
  const quantityInBase = (quantityInQuote / bidPriceIncremented) * LIVE_BASE_RESERVE;
  const roundedQuantityInBase = roundToStep(quantityInBase, opts.filter.stepSize);
  const roundedQuantityInQuote = quantityInQuote;

  return {
    bidPrice,
    bidPriceIncremented,
    roundedPrice,
    roundedQuantityInBase,
    roundedQuantityInQuote,
  };
}

export function simPriceFromCandle(candle: { close: number }): number {
  return candle.close;
}

export function simSellBaseQuantity(baseBalance: number): number {
  return baseBalance * LIVE_BASE_RESERVE;
}

export function simFeeOnQuote(notional: number, tradeFeePercentage?: number): number {
  return notional * simFeeRatePerLeg(tradeFeePercentage);
}

export function simFeeOnBase(baseQuantity: number, tradeFeePercentage?: number): number {
  return baseQuantity * simFeeRatePerLeg(tradeFeePercentage);
}
