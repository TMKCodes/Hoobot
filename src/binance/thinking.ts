import fs from 'fs';
import Binance from "node-binance-api";
import { SymbolCandlesticks, getLastCandlesticks } from "./candlesticks";
import { ConfigOptions, parseArgs } from "./args";
import { arbitrageProfit } from './arbitrage';
import { SymbolInfo } from './symbols';



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

  const currentRoundTrip: SymbolInfo[] = [
    {
    symbol: "ETHEUR",
    base: "ETH",
    quote: "EUR",
    },
    {
    symbol: "BNBUSDT",
    base: "BNB",
    quote: "USDT",
    },
    {
    symbol: "BNBBTC",
    base: "BNB",
    quote: "BTC",
    },
    {
    symbol: "BTCEUR",
    base: "BTB",
    quote: "EUR",
    },
  ];
  const symbols = currentRoundTrip.map(trip => trip.symbol);
  console.log("Trip trading symbols EUR -> ETH -> USDT -> BNB -> BTC -> EUR");
  const interval = "1m"; // You can change the interval to your desired timeframe.

  try {
    // Step 1: Get the latest candlestick data for the specified currency pairs.
    const symbolCandles: SymbolCandlesticks = await getLatestCandlesticks(binance, symbols, interval);

    // Step 2: Calculate the profit using the retrieved candlestick data.
    const initialAmount = 1000; // You can change this to your desired initial amount in EUR.
    const profitInfo = arbitrageProfit(symbolCandles, currentRoundTrip, 1000);

    console.log("New amount:", profitInfo.amount);
    console.log("Profit:", profitInfo.profit);
    console.log("Percentage Gain:", profitInfo.percentage, "%");
  } catch (error) {
    console.error("Error:", error);
  }
}

main();



