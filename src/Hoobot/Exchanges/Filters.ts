import { toSymbolKey } from "../Utilities/Args";
import { Exchange, isBinance, isDexTrade } from "./Exchange";

export interface Filter {
  minPrice: number;
  maxPrice: number;
  tickSize: number;
  minQty: number;
  maxQty: number;
  stepSize: number;
  minNotional: number;
  maxNotional: number;
  bidMultiplierUp: number;
  bidMultiplierDown: number;
  askMultiplierUp: number;
  askMultiplierDown: number;
}

export interface Filters {
  [pair: string]: Filter;
}

/** Binance GET /api/v3/exchangeInfo -vastauksen juurimuoto (tarvitaan symbolien suodattimiin). */
export type BinanceExchangeInfoPayload = {
  symbols: Array<{
    symbol: string;
    filters: Array<{ filterType: string;[key: string]: string | number | undefined }>;
  }>;
};

/**
 * Parsii yhden parin Filter-objektin exchangeInfo-vastauksesta (sama logiikka kuin getFilters).
 */
export const getFilterFromBinanceExchangeInfo = (exchangeInfo: BinanceExchangeInfoPayload, pair: string): Filter => {
  const symbolInfo = exchangeInfo.symbols.find((symbol: { symbol: string }) => symbol.symbol === toSymbolKey(pair));
  if (!symbolInfo) {
    throw new Error(`Trading pair ${pair} not found in exchange info`);
  }
  const priceFilter = symbolInfo.filters.find((filter: { filterType: string }) => filter.filterType === "PRICE_FILTER");
  const lotSizeFilter = symbolInfo.filters.find((filter: { filterType: string }) => filter.filterType === "LOT_SIZE");
  const notionalFilter =
    symbolInfo.filters.find((filter: { filterType: string }) => filter.filterType === "NOTIONAL") ??
    symbolInfo.filters.find((filter: { filterType: string }) => filter.filterType === "MIN_NOTIONAL");
  const percentPriceFilter =
    symbolInfo.filters.find((filter: { filterType: string }) => filter.filterType === "PERCENT_PRICE_BY_SIDE") ??
    symbolInfo.filters.find((filter: { filterType: string }) => filter.filterType === "PERCENT_PRICE");
  if (!priceFilter || !lotSizeFilter || !notionalFilter || !percentPriceFilter) {
    throw new Error(`Incomplete filters for ${pair} in exchange info`);
  }
  const minNotional =
    (notionalFilter as { minNotional?: string }).minNotional ?? (notionalFilter as { notional?: string }).notional;
  const maxNotional = (notionalFilter as { maxNotional?: string }).maxNotional ?? "100000000000000";
  return {
    minPrice: parseFloat(String(priceFilter.minPrice)),
    maxPrice: parseFloat(String(priceFilter.maxPrice)),
    tickSize: parseFloat(String(priceFilter.tickSize)),
    minQty: parseFloat(String(lotSizeFilter.minQty)),
    maxQty: parseFloat(String(lotSizeFilter.maxQty)),
    stepSize: parseFloat(String(lotSizeFilter.stepSize)),
    minNotional: parseFloat(String(minNotional ?? "0")),
    maxNotional: parseFloat(String(maxNotional)),
    bidMultiplierUp: parseFloat(String(percentPriceFilter.bidMultiplierUp ?? "1")),
    bidMultiplierDown: parseFloat(String(percentPriceFilter.bidMultiplierDown ?? "1")),
    askMultiplierUp: parseFloat(String(percentPriceFilter.askMultiplierUp ?? "1")),
    askMultiplierDown: parseFloat(String(percentPriceFilter.askMultiplierDown ?? "1")),
  };
};

/**
 * Julkinen exchangeInfo ilman API-avainta; oma HTTP-timeout (oletus 120 s).
 * node-binance-api käyttää recvWindow:ia myös pyynnön timeoutina (max 60 s) → ESOCKETTIMEDOUT hitaalla verkolla.
 */
export const fetchBinanceExchangeInfoPublic = async (timeoutMs = 120000): Promise<BinanceExchangeInfoPayload> => {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.binance.com/api/v3/exchangeInfo", {
      signal: ac.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`exchangeInfo HTTP ${res.status}`);
    }
    return (await res.json()) as BinanceExchangeInfoPayload;
  } finally {
    clearTimeout(id);
  }
};

const stepFromDecimals = (decimals: number | undefined, fallback: number): number => {
  if (!Number.isFinite(decimals) || decimals === undefined || decimals < 0) return fallback;
  return 1 / Math.pow(10, decimals);
};

export const getFilters = async (exchange: Exchange, pair: string): Promise<Filter> => {
  if (isBinance(exchange)) {
    const exchangeInfo = (await exchange.exchangeInfo()) as BinanceExchangeInfoPayload;
    return getFilterFromBinanceExchangeInfo(exchangeInfo, pair);
  }
  if (isDexTrade(exchange)) {
    const pairInfo = await exchange.getPairInfo(pair);
    if (pairInfo) {
      const tickSize = stepFromDecimals(pairInfo.rate_decimal, 0.00000001);
      const stepSize = stepFromDecimals(pairInfo.base_decimal, 0.00000001);
      return {
        minPrice: tickSize,
        maxPrice: 100000000000000,
        tickSize,
        minQty: stepSize,
        maxQty: 100000000000000,
        stepSize,
        minNotional: 0.000000001,
        maxNotional: 100000000000000,
        bidMultiplierUp: 0.000000000001,
        bidMultiplierDown: 0.000000000001,
        askMultiplierUp: 0.000000000001,
        askMultiplierDown: 0.000000000001,
      };
    }
  }
  return {
    minPrice: 0,
    maxPrice: 100000000000000,
    tickSize: 0.000000000001,
    minQty: 1.01,
    maxQty: 100000000000000,
    stepSize: 0.000000000001,
    minNotional: 0.000000001,
    maxNotional: 100000000000000,
    bidMultiplierUp: 0.000000000001,
    bidMultiplierDown: 0.000000000001,
    askMultiplierUp: 0.000000000001,
    askMultiplierDown: 0.000000000001,
  };
};
