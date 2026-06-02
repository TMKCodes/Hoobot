import Binance from "node-binance-api";
import { ConfigOptions, ExchangeOptions } from "../Utilities/Args";
import { NonKYC } from "./NonKYC/NonKYC";
import { Mexc } from "./Mexc/Mexc";
import { DexTrade } from "./DexTrade/DexTrade";

export type Exchange = Binance | NonKYC | Mexc | DexTrade;

export const isBinance = (exchange: any): exchange is Binance => {
  return exchange !== undefined && "candlesticks" in exchange;
};
export const isNonKYC = (exchange: any): exchange is NonKYC => {
  if (exchange.name == "NonKYC") {
    return true;
  }
  return exchange !== undefined && "NonKYC" in exchange;
};
export const isDexTrade = (exchange: any): exchange is DexTrade => {
  return exchange !== undefined && "DexTrade" in exchange;
};

export const getExchangeOption = (exchange: Exchange, options: ConfigOptions): ExchangeOptions | undefined => {
  const exchangeOption = options.exchanges?.filter((exchangeOption) => {
    if (isBinance(exchange)) {
      if (exchangeOption.name === "binance") {
        return true;
      }
    } else if (isNonKYC(exchange)) {
      if (exchangeOption.name === "nonkyc") {
        return true;
      }
    } else if (isDexTrade(exchange)) {
      if (exchangeOption.name === "dextrade") {
        return true;
      }
    }
    return false;
  })[0];
  return exchangeOption;
};

export const getExchangeByName = (
  name: string,
  exchanges: Exchange[],
  options: ConfigOptions,
): Exchange | undefined => {
  for (const exchange of exchanges) {
    const exchangeOption = getExchangeOption(exchange, options);
    if (exchangeOption?.name === name) {
      return exchange;
    }
  }
  return undefined;
};
