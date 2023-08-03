import fs from 'fs';
import Binance from "node-binance-api";

export interface SymbolInfo {
  symbol: string;
  base: string;
  quote: string;
}

// Function to get all symbols from Binance
export const getTradeableSymbols = async (binance: Binance): Promise<SymbolInfo[]> => {
  try {
    if (!binance || typeof binance.exchangeInfo !== "function") {
      throw new Error("Invalid 'binance' object or missing 'exchangeInfo' function.");
    }

    const exchangeInfo = await binance.exchangeInfo();
    fs.writeFileSync("./exchange-info.json", JSON.stringify(exchangeInfo, null, 4));
    
    return exchangeInfo.symbols
      .filter((symbol: any) => symbol.status === "TRADING")
      .filter((symbol: any) => symbol.isSpotTradingAllowed)
      .map((symbol: any) => {  
        return { symbol: symbol.symbol, base: symbol.baseAsset, quote: symbol.quoteAsset }
      });
  } catch (error) {
    console.error("Error in getTradeableSymbols:", error.message);
    return []; // Return an empty array or handle the error as required.
  }
};
