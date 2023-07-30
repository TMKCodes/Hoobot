import fs from 'fs';
import Binance from "node-binance-api";
import { candlestick, getLastCandlesticks } from "./candlesticks";
import { ConfigOptions, parseArgs } from "./args";
import { arbitageProfit } from './arbitage';


interface SymbolInfo {
  symbol: string;
  base: string;
  quote: string;
}

// Function to get all symbols from Binance
const getAllSymbols = async (binance: Binance): Promise<SymbolInfo[]> => {
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
    console.error("Error in getAllSymbols:", error.message);
    return []; // Return an empty array or handle the error as required.
  }
};

// Function to create possible round trips
const createRoundTrips = (symbols: SymbolInfo[], filePath: string): void => {
  console.log("Searching for round trips...");
  fs.appendFileSync(filePath, "{ \"roundtrips\": [");

  for (let i = 0; i < symbols.length; i++) {
    const symbolA = symbols[i];
    for (let j = 0; j < symbols.length; j++) {
      const symbolB = symbols[j];
      for (let k = 0; k < symbols.length; k++) {
        const symbolC = symbols[k];
        for (let l = 0; l < symbols.length; l++) {
          const symbolD = symbols[l];
          if (
            symbolA.quote === symbolB.base || symbolA.base === symbolB.base &&
            symbolB.quote === symbolC.base || symbolB.base === symbolC.base &&
            symbolC.quote === symbolD.base || symbolC.base === symbolD.base &&
            symbolD.symbol === symbolA.symbol
          ) {
            const roundTrip: SymbolInfo[] = [symbolA, symbolB, symbolC];
            fs.appendFileSync(filePath, JSON.stringify(roundTrip));
          }
        }
      }
    }
  }

  fs.appendFileSync(filePath, "]}");
  console.log("Round trips have been written to the file:", filePath);
};


interface SymbolCandlesticks {
  [symbolPair: string]: {
    candles: candlestick[]
  }
}

interface ProfitInfo {
  amount: number,
  profit: number,
  percentage: number,
}

const getLatestCandlesticks = async (binance: Binance, symbols: string[], interval: string): Promise<SymbolCandlesticks> => {
  let symbolCandles: SymbolCandlesticks = {};
  for(let symbol of symbols) {
    if(symbol.includes("/")) {
      symbol = symbol.split("/").join(""); 
    }
    symbolCandles[symbol] = { candles: await getLastCandlesticks(binance, symbol, interval, 5) };

  }
  return symbolCandles
}


async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args) as ConfigOptions;
  // Initialize Binance client
  const binance = new Binance().options({
    APIKEY: options.apiKey,
    APISECRET: options.apiSecret,
    useServerTime: true, // This uses Binance server time for WebSocket requests
    family: 4,
  });

  try {
    // Get all symbols from Binance
    const symbols: SymbolInfo[] = await getAllSymbols(binance);
    console.log(`Symbols: ${symbols.length}`);
    // Create possible round trips
    createRoundTrips(symbols, "./arbitrage-trips.json");

  } catch (error) {
    console.error("Error:", error);
  }

  const symbols = ["ETHEUR", "ETHUSDT", "BNBUSDT", "BNBBTC", "BTCEUR"];
  console.log("Trip trading symbols EUR -> ETH -> USDT -> BNB -> BTC -> EUR");
  const interval = "1m"; // You can change the interval to your desired timeframe.

  try {
    // Step 1: Get the latest candlestick data for the specified currency pairs.
    const symbolCandles: SymbolCandlesticks = await getLatestCandlesticks(binance, symbols, interval);

    // Step 2: Calculate the profit using the retrieved candlestick data.
    const initialAmount = 1000; // You can change this to your desired initial amount in EUR.
    const profitInfo: ProfitInfo = arbitageProfit(symbolCandles, initialAmount, "EUR");

    console.log("New amount:", profitInfo.amount);
    console.log("Profit:", profitInfo.profit);
    console.log("Percentage Gain:", profitInfo.percentage, "%");
  } catch (error) {
    console.error("Error:", error);
  }
}

main();



