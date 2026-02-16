import { Exchange, isBinance } from "./Exchange";

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

export const getFilters = async (exchange: Exchange, pair: string): Promise<Filter> => {
  if (isBinance(exchange)) {
    const exchangeInfo = await exchange.exchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find(
      (symbol: { symbol: string }) => symbol.symbol === pair.split("/").join(""),
    );
    if (symbolInfo) {
      const priceFilter =
        symbolInfo.filters.find((filter: { filterType: string }) => filter.filterType === "PRICE_FILTER") || {};
      const lotSizeFilter =
        symbolInfo.filters.find((filter: { filterType: string }) => filter.filterType === "LOT_SIZE") || {};
      const notionalFilter =
        symbolInfo.filters.find((filter: { filterType: string }) => filter.filterType === "NOTIONAL") || {};
      const percentPriceFilter =
        symbolInfo.filters.find((filter: { filterType: string }) => filter.filterType === "PERCENT_PRICE_BY_SIDE") ||
        {};
      return {
        minPrice: parseFloat(priceFilter.minPrice || "0"),
        maxPrice: parseFloat(priceFilter.maxPrice || "100000000000000"),
        tickSize: parseFloat(priceFilter.tickSize || "0.000000000001"),
        minQty: parseFloat(lotSizeFilter.minQty || "0.000000000001"),
        maxQty: parseFloat(lotSizeFilter.maxQty || "100000000000000"),
        stepSize: parseFloat(lotSizeFilter.stepSize || "0.000000000001"),
        minNotional: parseFloat(notionalFilter.minNotional || "0.000000001"),
        maxNotional: parseFloat(notionalFilter.maxNotional || "100000000000000"),
        bidMultiplierUp: parseFloat(percentPriceFilter.bidMultiplierUp || "0.000000000001"),
        bidMultiplierDown: parseFloat(percentPriceFilter.bidMultiplierDown || "0.000000000001"),
        askMultiplierUp: parseFloat(percentPriceFilter.askMultiplierUp || "0.000000000001"),
        askMultiplierDown: parseFloat(percentPriceFilter.askMultiplierDown || "0.000000000001"),
      };
    } else {
      throw new Error("Trading pair not found in exchange info");
    }
  }
  return {
    minPrice: 0,
    maxPrice: 100000000000000,
    tickSize: 0.000000000001,
    minQty: 0.000000000001,
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
