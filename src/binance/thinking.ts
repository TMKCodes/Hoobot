/* =====================================================================
* Binance Trading Bot - Proprietary License
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



