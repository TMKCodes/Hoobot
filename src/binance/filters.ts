import Binance from "node-binance-api";

export interface filter {
  minPrice: any;
  maxPrice: any;
  tickSize: any;
  minQty: any;
  maxQty: any;
  stepSize: any;
  minNotional: any;
  maxNotional: any;
  bidMultiplierUp: any,
  bidMultiplierDown: any,
  askMultiplierUp: any,
  askMultiplierDown: any
}

export interface filters {
  [pair: string]: filter;
}



// Function to fetch exchange info and get trading pair filters
export const getFilters = async (binance: Binance, pair: string) => {
  const exchangeInfo = await binance.exchangeInfo();
  const symbolInfo = exchangeInfo.symbols.find((symbol: { symbol: string; }) => symbol.symbol === pair.split("/").join(""));
  //console.log(symbolInfo);
  if (symbolInfo) {
    const priceFilter = symbolInfo.filters.find((filter: { filterType: string; }) => filter.filterType === "PRICE_FILTER");
    const lotSizeFilter = symbolInfo.filters.find((filter: { filterType: string; }) => filter.filterType === "LOT_SIZE");
    const notionalFilter = symbolInfo.filters.find((filter: { filterType: string; }) => filter.filterType === "NOTIONAL");
    const percentPriceFilter = symbolInfo.filters.find((filter: { filterType: string; }) => filter.filterType === "PERCENT_PRICE_BY_SIDE");
    return {
      minPrice: priceFilter.minPrice,
      maxPrice: priceFilter.maxPrice,
      tickSize: priceFilter.tickSize,
      minQty: lotSizeFilter.minQty,
      maxQty: lotSizeFilter.maxQty,
      stepSize: lotSizeFilter.stepSize,
      minNotional: notionalFilter.minNotional,
      maxNotional: notionalFilter.maxNotional,
      bidMultiplierUp: percentPriceFilter.bidMultiplierUp,
      bidMultiplierDown: percentPriceFilter.bidMultiplierDown,
      askMultiplierUp: percentPriceFilter.askMultiplierUp,
      askMultiplierDown: percentPriceFilter.askMultiplierDown
    };
  } else {
    throw new Error("Trading pair not found in exchange info");
  }
}