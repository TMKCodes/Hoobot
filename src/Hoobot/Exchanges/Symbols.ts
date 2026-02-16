import { Exchange, isBinance } from "./Exchange";
import { logToFile } from "../Utilities/LogToFile";

export interface SymbolInfo {
  symbol: string;
  base: string;
  quote: string;
}

// Function to get all symbols from Binance
export const getTradeableSymbols = async (exchange: Exchange, quote: string): Promise<SymbolInfo[]> => {
  let symbolInfos: SymbolInfo[] = [];
  if (isBinance(exchange)) {
    if (!exchange || typeof exchange.exchangeInfo !== "function") {
      throw new Error("Invalid 'exchange' object or missing 'exchangeInfo' function.");
    }

    const exchangeInfo = await exchange.exchangeInfo();

    symbolInfos = exchangeInfo.symbols
      .filter((symbol: any) => symbol.quoteAsset === quote)
      .filter((symbol: any) => symbol.status === "TRADING")
      .filter((symbol: any) => symbol.isSpotTradingAllowed)
      .map((symbol: any) => {
        return { symbol: symbol.symbol, base: symbol.baseAsset, quote: symbol.quoteAsset };
      });
  }
  return symbolInfos;
};
