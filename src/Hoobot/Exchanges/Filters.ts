/* =====================================================================
* Hoobot - Proprietary License
* Copyright (c) 2023 Hoosat Oy. All rights reserved.
*
* Redistribution and use in source and binary forms, with or without
* modification, are not permitted without prior written permission
* from Hoosat Oy. Unauthorized reproduction, copying, or use of this
* software, in whole or in part, is strictly prohibited. All 
* modifications in source or binary must be submitted to Hoosat Oy in source format.
*
* THIS SOFTWARE IS PROVIDED BY HOOSAT OY "AS IS" AND ANY EXPRESS OR
* IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
* WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
* ARE DISCLAIMED. IN NO EVENT SHALL HOOSAT OY BE LIABLE FOR ANY DIRECT,
* INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
* (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
* SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
* HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT,
* STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
* ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED
* OF THE POSSIBILITY OF SUCH DAMAGE.
*
* The user of this software uses it at their own risk. Hoosat Oy shall
* not be liable for any losses, damages, or liabilities arising from
* the use of this software.
* ===================================================================== */

import { Exchange, isBinance, isXeggex } from "./Exchange";

export interface Filter {
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

export interface Filters {
  [pair: string]: Filter;
}

export const getFilters = async (
  exchange: Exchange, 
  pair: string
): Promise<Filter> => {
  if (isBinance(exchange)) {
    const exchangeInfo = await exchange.exchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((symbol: { symbol: string; }) => symbol.symbol === pair.split("/").join(""));
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
    askMultiplierDown: 0.000000000001
  }
}